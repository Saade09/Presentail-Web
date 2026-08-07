/**
 * E2E test: cross-country order history (task 4221 regression guard)
 *
 * A user who signed up in a Lebanon store context (their JWT's
 * `store_base_url` claim points at the Lebanon store) must still be able to
 * load Account → Order History while browsing in a UAE store context (the
 * `x-store-country: AE` / `x-store-city: ae-dubai` headers apiFetch sends).
 *
 * Before the fix, `verifyServerToken` rejected any request whose resolved
 * store base URL differed from the token's `store_base_url` claim, so
 * /me/orders returned 401 and the account page rendered the error state.
 *
 * Flow (runs against the REAL dev API server via the localhost:80 proxy —
 * page.route stubs would bypass verifyServerToken and defeat the purpose):
 *   1. Sign in (or register on first run) a fixed test account through the
 *      real auth endpoints with Lebanon store headers → the server mints a
 *      JWT whose store_base_url claim points at the Lebanon store.
 *   2. Seed one Lebanon-store order row (app_orders) for that customer
 *      directly in the database — the checkout flow is exercised by its own
 *      suite and would create a real OS order here.
 *   3. Open the Account → Order History page in a browser whose delivery
 *      location is set to UAE (Dubai), authenticated with the Lebanon token.
 *   4. Assert the order card renders and the error state does not.
 *
 * The account is a fixed per-project email (reused across runs) because
 * POST /auth/register is rate-limited to 5/hour per IP — registering a fresh
 * account on every run/retry/project would exhaust the limiter. Only the
 * seeded order row is cleaned up after the test.
 */

import { test, expect } from "@playwright/test";
import { Client } from "pg";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:80";
const TEST_PASSWORD = "e2e-CrossCountry-Passw0rd!";

// Lebanon store context headers — resolveStoreFromRequest reads these, so the
// minted JWT's store_base_url claim points at the Lebanon store.
const LB_STORE_HEADERS = {
  "Content-Type": "application/json",
  "x-store-country": "LB",
  "x-store-city": "lb-beirut",
} as const;

type Session = { token: string; customerId: number };

type AuthResponse = {
  ok: boolean;
  token?: string;
  user?: { id: number };
  code?: string;
};

async function authPost(path: string, body: unknown): Promise<{ status: number; data: AuthResponse }> {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method: "POST",
    headers: LB_STORE_HEADERS,
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({ ok: false }))) as AuthResponse;
  return { status: res.status, data };
}

/**
 * Sign in the fixed test account in a Lebanon store context, registering it
 * on the first ever run. Login is attempted first because it has a more
 * generous rate limit than registration.
 */
async function signInLebanonAccount(email: string): Promise<Session> {
  const login = await authPost("/auth/login", { email, password: TEST_PASSWORD });
  if (login.data.ok && login.data.token && login.data.user?.id) {
    return { token: login.data.token, customerId: login.data.user.id };
  }

  // First run: the account does not exist yet — register it.
  const reg = await authPost("/auth/register", {
    email,
    password: TEST_PASSWORD,
    firstName: "CrossCountry",
    lastName: "E2E",
  });
  if (reg.data.ok && reg.data.token && reg.data.user?.id) {
    return { token: reg.data.token, customerId: reg.data.user.id };
  }

  throw new Error(
    `could not sign in test account ${email}: login=${login.status}/${login.data.code ?? ""} register=${reg.status}/${reg.data.code ?? ""}`,
  );
}

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set — cannot seed order row");
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function seedLebanonOrder(customerId: number, appOrderId: string) {
  // No wc_order_id / os_order_id → /me/orders skips WooCommerce and OS
  // enrichment for this row (no external calls).
  await withDb((client) =>
    client.query(
      `INSERT INTO app_orders
         (app_order_id, customer_id, state, store_key, platform,
          recipient_name, delivery_date, delivery_slot,
          total_usd_cents, currency_code, line_items_json)
       VALUES ($1, $2, 'confirmed', 'lebanon', 'web',
               'E2E Recipient', '2026-08-10', '10:00–14:00',
               6500, 'USD', $3)
       ON CONFLICT (app_order_id) DO NOTHING`,
      [
        appOrderId,
        customerId,
        JSON.stringify([{ name: "Rose Bouquet", quantity: 1, priceUsdCents: 6500 }]),
      ],
    ),
  );
}

async function deleteSeededOrder(appOrderId: string) {
  await withDb((client) =>
    client.query(`DELETE FROM app_orders WHERE app_order_id = $1`, [appOrderId]),
  );
}

test.describe("Order history across store contexts", () => {
  test("order placed in Lebanon context loads while browsing in UAE context", async ({
    page,
  }, testInfo) => {
    // One account/order per project so parallel projects don't interfere.
    const suffix = testInfo.project.name.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const email = `e2e-cross-country-${suffix}@example.com`;
    const appOrderId = `E2E-XC-${suffix}-${Date.now()}`;

    const { token, customerId } = await signInLebanonAccount(email);
    await seedLebanonOrder(customerId, appOrderId);

    try {
      // Authenticate the browser with the Lebanon-issued token, but browse in
      // a UAE (Dubai) delivery context — apiFetch will send
      // x-store-country: AE / x-store-city: ae-dubai on every request,
      // including /me/orders.
      await page.addInitScript(
        ({ authToken }) => {
          window.localStorage.setItem("presentail_web_token", authToken);
          window.localStorage.setItem("presentail_web_provider", "password");
          window.localStorage.setItem(
            "presentail_delivery_location_v1",
            JSON.stringify({ countryCode: "AE", cityId: "ae-dubai" }),
          );
        },
        { authToken: token },
      );

      await page.goto("/en-ae/dubai/account?tab=orders");

      // The order card for the seeded Lebanon order must render …
      await expect(page.getByTestId(`order-row-${appOrderId}`)).toBeVisible({
        timeout: 20_000,
      });
      // … the list container is present …
      await expect(page.getByTestId("orders-list")).toBeVisible();
      // … and the error state must NOT be shown (this is what regressed when
      // verifyServerToken enforced the token's store scope).
      await expect(page.getByTestId("orders-error")).toHaveCount(0);
    } finally {
      await deleteSeededOrder(appOrderId);
    }
  });
});
