/**
 * One-shot test: submit a minimal order directly to Presentail OS API.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run test-os-order
 *
 * What it does:
 *   1. Fetches the first available product from OS (/api/products).
 *   2. Builds a minimal order payload using that product's real slug + price.
 *   3. POSTs directly to OS /api/orders (bypasses the app's API server).
 *
 * Required env vars (picked up from Replit secrets automatically):
 *   PRESENTAIL_OS_API_URL  — defaults to https://os.presentail.com
 *   PRESENTAIL_OS_API_KEY  — must have write (order submission) permissions
 *   PRESENTAIL_OS_WORKSPACE — defaults to "presentail"
 */

const BASE_URL = (process.env.PRESENTAIL_OS_API_URL ?? "https://os.presentail.com").replace(/\/$/, "");
const API_KEY = process.env.PRESENTAIL_OS_API_KEY ?? "";
const WORKSPACE = process.env.PRESENTAIL_OS_WORKSPACE ?? "presentail";

if (!API_KEY) {
  console.error("❌ PRESENTAIL_OS_API_KEY is not set. Cannot submit order.");
  process.exit(1);
}

/**
 * Mirrors the same slug logic in lib/presentail-os/src/client.ts `nameToSlug`.
 * OS products have only a numeric id; the app normalises them to URL-safe slugs
 * which are then used as productId when submitting orders.
 */
function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
  "User-Agent": "PresentailApp/1.0",
  Authorization: `Bearer ${API_KEY}`,
  "x-api-key": API_KEY,
};

async function fetchFirstProduct(): Promise<{ id: string; name: string; price: number }> {
  const url = `${BASE_URL}/api/products?workspace=${WORKSPACE}&per_page=1&page=1`;
  console.log(`\nFetching product from OS: ${url} …`);
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OS /api/products returned HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const body = (await res.json()) as unknown;
  // OS may wrap in { data: [...] } or return an array directly.
  const raw = Array.isArray(body) ? body : (body as any)?.data ?? (body as any)?.products ?? [];
  const products = raw as Array<{ id?: string; slug?: string; name?: string; price?: number; priceUsd?: number }>;
  if (!products.length) {
    throw new Error("OS /api/products returned an empty list — cannot pick a test product.");
  }
  const p = products[0];
  // OS returns a numeric `id`. The app normalises it to a URL-safe slug via
  // nameToSlug(name), and that slug is what gets sent to OS /api/orders as productId.
  // If OS ever starts returning an explicit `slug` field, prefer that.
  const id = p.slug ?? nameToSlug(p.name ?? String(p.id));
  const price = typeof p.price === "number" ? p.price : typeof p.priceUsd === "number" ? p.priceUsd : 0;
  return { id, name: p.name ?? id, price };
}

async function run() {
  let product: { id: string; name: string; price: number };
  try {
    product = await fetchFirstProduct();
  } catch (err: any) {
    console.error("\n❌ Could not fetch a product from OS:", err.message);
    process.exit(1);
  }

  console.log(`\nUsing product: "${product.name}" (id=${product.id}, price=$${product.price})\n`);

  // Build a future delivery date (tomorrow) so OS doesn't reject it for being in the past.
  const tomorrow = new Date(Date.now() + 86_400_000);
  const deliveryDate = tomorrow.toISOString().slice(0, 10);

  const appOrderId = `test-os-${Date.now()}`;
  const payload = {
    workspace: WORKSPACE,
    appOrderId,
    items: [
      {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        priceUsd: product.price,
      },
    ],
    billing: {
      firstName: "Test",
      lastName: "Buyer",
      email: "test-os-order@presentail.com",
      phone: "+96170000000",
      countryCode: "LB",
    },
    recipient: {
      firstName: "Test",
      lastName: "Recipient",
      phone: "+96170000001",
    },
    delivery: {
      district: "Beirut",
      cityId: "beirut",
      countryCode: "LB",
      address: "Test Street, Building 1",
      date: deliveryDate,
      // slot is intentionally omitted — OS rejects an empty string slot value
      isExpress: false,
      noAddress: false,
      feeUsd: 0,
      expressSurchargeUsd: 0,
      slotFeeUsd: 0,
    },
    // cardMessage / cardFrom / cardTo are intentionally omitted from this test.
    // The OS /api/orders endpoint currently returns HTTP 500 "Failed to create order"
    // when any of those three fields are present, regardless of their content.
    // This appears to be an OS-side bug. The fields are still sent by the real app
    // in production order payloads; report to the OS team if orders with card messages
    // start failing in production.
    payment: {
      method: "western-union",
      verified: false,
      currencyCode: "USD",
      totalUsd: product.price,
    },
    platform: "web",
  };

  const url = `${BASE_URL}/api/orders?workspace=${WORKSPACE}`;
  console.log(`Posting test order ${appOrderId} to ${url} …\n`);
  console.log("Payload:", JSON.stringify(payload, null, 2));

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err: any) {
    console.error("\n❌ Network error:", err.message);
    process.exit(1);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = await res.text();
  }

  console.log(`\nHTTP ${res.status}`);
  console.log("Response:", JSON.stringify(body, null, 2));

  if (res.ok) {
    const parsed = body as Record<string, unknown>;
    const orderId = parsed?.order_id ?? parsed?.id ?? "(not returned)";
    console.log("\n✅ Order submitted successfully!");
    console.log("   OS order ID:", orderId);
  } else {
    const parsed = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
    console.error(
      "\n❌ Order rejected by OS:",
      parsed?.error ?? parsed?.message ?? `HTTP ${res.status}`,
    );
    process.exit(1);
  }
}

run();
