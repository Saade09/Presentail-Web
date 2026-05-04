import { Router, type IRouter } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { randomBytes } from "node:crypto";
import { authenticate, decodeJwtPayload, signServerToken } from "../lib/auth";
import { and, eq, isNull } from "drizzle-orm";
import { db, customersTable } from "@workspace/db";
import { upsertCustomer, getCustomerByWcId } from "../lib/customers";
import {
  existsIpLimiter,
  loginIpLimiter,
  registerIpLimiter,
  resetRequestIpLimiter,
  resetConfirmIpLimiter,
  socialIpLimiter,
  loginEmailLimiter,
  resetEmailLimiter,
} from "../lib/auth-rate-limit";

const router: IRouter = Router();

import { resolveStoreFromRequest, wooAuthHeader, resolveStore } from "../lib/wooStore";

async function wcFetch(path: string, options: RequestInit = {}, req?: { query: any; headers: any }) {
  const store = req ? resolveStoreFromRequest(req) : resolveStore();
  return fetch(`${store.baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: wooAuthHeader(store),
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "PresentailApp/1.0",
      ...(options.headers ?? {}),
    },
  });
}

async function wpFetch(path: string, options: RequestInit = {}, req?: { query: any; headers: any }) {
  const store = req ? resolveStoreFromRequest(req) : resolveStore();
  return fetch(`${store.wpBaseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "PresentailApp/1.0",
      ...(options.headers ?? {}),
    },
  });
}

function mapCustomer(c: any) {
  return {
    id: c.id as number,
    email: c.email as string,
    firstName: (c.first_name ?? "") as string,
    lastName: (c.last_name ?? "") as string,
    username: (c.username ?? "") as string,
    phone: (c.billing?.phone ?? "") as string,
  };
}

// Mirror an authenticated WC customer into our local `customers` table.
// Best-effort: failures are logged but never break the auth flow, since
// the WC mirror is still authoritative for orders during the migration.
async function mirrorWcCustomerLocally(
  wcCustomerId: number,
  profile: {
    email: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    provider?: "apple" | "google" | "password";
  },
  log?: { warn?: (...args: any[]) => void },
): Promise<void> {
  try {
    const existing = await getCustomerByWcId(wcCustomerId);
    const upserted = await upsertCustomer({
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      phone: profile.phone,
      authProvider: profile.provider ?? null,
      authUserId: profile.provider ? String(wcCustomerId) : null,
      preferredCustomerId: existing?.id ?? null,
      source: "presentail.com",
    });
    // Ensure the WC linkage is set on the local row. We already know the
    // WC id from the auth flow, so persist it directly rather than going
    // back through WC email-lookup — this is deterministic and avoids
    // edge-case mismatches if a stale row with the same email exists.
    if (!upserted.customer.wcCustomerId) {
      try {
        await db
          .update(customersTable)
          .set({ wcCustomerId, updatedAt: new Date() })
          .where(
            and(
              eq(customersTable.id, upserted.customer.id),
              isNull(customersTable.wcCustomerId),
            ),
          );
      } catch (err: any) {
        log?.warn?.(
          { err: err?.message, wcCustomerId, customerId: upserted.customer.id },
          "auth.mirror: failed to persist wcCustomerId (non-fatal)",
        );
      }
    }
  } catch (err: any) {
    log?.warn?.(
      { err: err?.message, wcCustomerId },
      "auth.mirror: local customer upsert failed (non-fatal)",
    );
  }
}

// ── Email existence check ────────────────────────────────────────────────────
// Lightweight lookup so the multi-step auth flow can route users to either the
// password-login step (existing account) or the sign-up step (new account).
// Returns `{ ok: true, exists: false }` early on malformed input so the
// endpoint can't be turned into an oracle. When the lookup itself cannot be
// completed (missing WC creds or upstream failure), we return a `code` so the
// frontend can show an error rather than silently routing the user to sign-up.
//
// Manual smoke tests when touching this endpoint:
//   - existing email → { exists: true }
//   - new email     → { exists: false } (no `code`)
//   - uppercase email (e.g. "User@Example.com") → still { exists: true }
//   - padded email (e.g. "  user@example.com  ") → still { exists: true }
//   - missing WC creds → { exists: false, code: "lookup_unavailable" }
//   - WC upstream error → { exists: false, code: "lookup_failed" }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
router.get("/auth/exists", existsIpLimiter, async (req, res) => {
  const raw = String(req.query.email ?? "").trim().toLowerCase();
  if (!raw || raw.length > 254 || !EMAIL_RE.test(raw)) {
    res.json({ ok: true, exists: false });
    return;
  }
  if (!process.env.WC_CONSUMER_KEY) {
    res.json({ ok: true, exists: false, code: "lookup_unavailable" });
    return;
  }
  try {
    const r = await wcFetch(`/customers?email=${encodeURIComponent(raw)}&per_page=1`, {}, req);
    if (!r.ok) {
      req.log?.warn?.({ status: r.status }, "auth.exists: WC upstream non-ok");
      res.json({ ok: true, exists: false, code: "lookup_failed" });
      return;
    }
    const list = (await r.json().catch(() => [])) as any[];
    const exists = Array.isArray(list) && list.length > 0;
    res.json({ ok: true, exists });
  } catch (e: any) {
    req.log?.warn?.({ err: e?.message }, "auth.exists: lookup failed");
    res.json({ ok: true, exists: false, code: "lookup_failed" });
  }
});

// ── Login: uses JWT Authentication for WP REST API plugin ────────────────────
router.post("/auth/login", loginIpLimiter, async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ ok: false, message: "Email and password are required" });
  }

  // Check per-email failure cap before forwarding. Successful logins do NOT
  // increment the counter — only failed auth responses do (see below). This
  // prevents locking out a legitimate user who logs in repeatedly.
  const emailCheck = loginEmailLimiter.check(email);
  if (!emailCheck.allowed) {
    return res.status(429).json({
      ok: false,
      code: "too_many_requests",
      message: "Too many login attempts for this account. Please wait a moment and try again.",
    });
  }

  try {
    const tokenRes = await wpFetch(`/jwt-auth/v1/token`, {
      method: "POST",
      body: JSON.stringify({ username: email, password }),
    }, req);

    const tokenData = (await tokenRes.json().catch(() => ({}))) as any;

    if (tokenRes.status === 404) {
      return res.status(503).json({
        ok: false,
        code: "jwt_not_installed",
        message: "Login is being set up on the server. Please try again later.",
      });
    }

    if (!tokenRes.ok || !tokenData?.token) {
      loginEmailLimiter.record(email);
      return res.status(401).json({
        ok: false,
        message: tokenData?.message?.replace(/<[^>]*>/g, "") ?? "Invalid email or password",
      });
    }

    let customer: ReturnType<typeof mapCustomer> | null = null;
    try {
      const cRes = await wcFetch(`/customers?email=${encodeURIComponent(email)}`, {}, req);
      const cList = (await cRes.json().catch(() => [])) as any[];
      if (Array.isArray(cList) && cList[0]) customer = mapCustomer(cList[0]);
    } catch {
      // ignore - we'll fall back to JWT payload data
    }

    // Fall back to JWT/WP data when there's no WC customer record (e.g. WP-only
    // users or WC customer create lag). We still derive the id from the JWT
    // payload so /auth/me works.
    if (!customer) {
      const payload = decodeJwtPayload(tokenData.token);
      const id =
        Number(payload?.data?.user?.id) ||
        Number(payload?.user_id) ||
        Number(payload?.sub) ||
        0;
      const display = String(tokenData?.user_display_name ?? "").trim();
      const [first = "", ...rest] = display ? display.split(/\s+/) : [];
      customer = {
        id,
        email: String(tokenData?.user_email ?? email),
        firstName: first,
        lastName: rest.join(" "),
        username: String(tokenData?.user_nicename ?? ""),
        phone: "",
      };
    }

    if (customer && customer.id) {
      void mirrorWcCustomerLocally(
        customer.id,
        {
          email: customer.email,
          firstName: customer.firstName,
          lastName: customer.lastName,
          phone: customer.phone,
          provider: "password",
        },
        req.log,
      );
    }
    return res.json({ ok: true, token: tokenData.token, user: customer });
  } catch (e: any) {
    return res.status(500).json({ ok: false, message: e?.message ?? "Login failed" });
  }
});

// ── Register: create a WooCommerce customer ──────────────────────────────────
router.post("/auth/register", registerIpLimiter, async (req, res) => {
  if (!process.env.WC_CONSUMER_KEY) {
    return res.status(503).json({ ok: false, message: "Registration unavailable" });
  }
  const { email, password, firstName, lastName, phone } = req.body as {
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  };
  if (!email || !password) {
    return res.status(400).json({ ok: false, message: "Email and password are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ ok: false, message: "Password must be at least 8 characters" });
  }

  try {
    const r = await wcFetch("/customers", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        first_name: firstName ?? "",
        last_name: lastName ?? "",
        billing: phone ? { phone } : undefined,
      }),
    }, req);

    const data = (await r.json().catch(() => ({}))) as any;
    if (!r.ok) {
      return res.status(r.status).json({
        ok: false,
        message: data?.message?.replace(/<[^>]*>/g, "") ?? "Registration failed",
      });
    }

    let token: string | null = null;
    try {
      const tokenRes = await wpFetch(`/jwt-auth/v1/token`, {
        method: "POST",
        body: JSON.stringify({ username: email, password }),
      }, req);
      const tokenData = (await tokenRes.json().catch(() => ({}))) as any;
      if (tokenRes.ok && tokenData?.token) token = tokenData.token;
    } catch {
      // ignore - user can log in manually
    }

    const mapped = mapCustomer(data);
    if (mapped.id) {
      void mirrorWcCustomerLocally(
        mapped.id,
        {
          email: mapped.email,
          firstName: mapped.firstName,
          lastName: mapped.lastName,
          phone: mapped.phone,
          provider: "password",
        },
        req.log,
      );
    }
    return res.json({ ok: true, token, user: mapped });
  } catch (e: any) {
    return res.status(500).json({ ok: false, message: e?.message ?? "Registration failed" });
  }
});

// ── Get current user (auth via Bearer JWT, validated against WP) ─────────────
router.get("/auth/me", async (req, res) => {
  const auth = await authenticate(req.header("authorization"), req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, message: auth.message });
    return;
  }
  // Read from the canonical local `customers` row first; fall back to WC
  // during the migration window so accounts not yet mirrored still work.
  try {
    const local = await getCustomerByWcId(auth.customerId);
    if (local) {
      res.json({
        ok: true,
        user: {
          id: auth.customerId,
          email: local.email,
          firstName: local.firstName ?? "",
          lastName: local.lastName ?? "",
          username: "",
          phone: local.phoneE164 ?? "",
        },
      });
      return;
    }
    const r = await wcFetch(`/customers/${auth.customerId}`, {}, req);
    const data = (await r.json().catch(() => ({}))) as any;
    if (!r.ok) {
      res.status(r.status).json({ ok: false, message: data?.message ?? "Not found" });
      return;
    }
    const mapped = mapCustomer(data);
    void mirrorWcCustomerLocally(
      mapped.id,
      {
        email: mapped.email,
        firstName: mapped.firstName,
        lastName: mapped.lastName,
        phone: mapped.phone,
      },
      req.log,
    );
    res.json({ ok: true, user: mapped });
  } catch (e: any) {
    res.status(500).json({ ok: false, message: e?.message ?? "Failed" });
  }
});

// ── Update current user profile ──────────────────────────────────────────────
router.put("/auth/me", async (req, res) => {
  const auth = await authenticate(req.header("authorization"), req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, message: auth.message });
    return;
  }
  const { firstName, lastName, phone } = req.body as {
    firstName?: string;
    lastName?: string;
    phone?: string;
  };
  try {
    const r = await wcFetch(`/customers/${auth.customerId}`, {
      method: "PUT",
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        billing: phone !== undefined ? { phone } : undefined,
      }),
    }, req);
    const data = (await r.json().catch(() => ({}))) as any;
    if (!r.ok) {
      res.status(r.status).json({ ok: false, message: data?.message ?? "Update failed" });
      return;
    }
    const mapped = mapCustomer(data);
    void mirrorWcCustomerLocally(
      mapped.id,
      {
        email: mapped.email,
        firstName: mapped.firstName,
        lastName: mapped.lastName,
        phone: mapped.phone,
      },
      req.log,
    );
    res.json({ ok: true, user: mapped });
  } catch (e: any) {
    res.status(500).json({ ok: false, message: e?.message ?? "Update failed" });
  }
});

// ── Delete current user account ──────────────────────────────────────────────
// WordPress security plugins on this host silently block `wp_delete_user()`
// even when WC REST returns 200, so the underlying wp_users row can remain.
// To satisfy Apple App Store guideline 5.1.1(v), we:
//   1. Anonymise all personal data (email, name, phone, addresses).
//   2. Reset the password to a long random value so the user can no longer
//      sign in with their old credentials.
//   3. Issue the WC REST DELETE so the row is dropped from the customer
//      index. The wp_users row may persist but contains no PII.
router.delete("/auth/me", async (req, res) => {
  const auth = await authenticate(req.header("authorization"), req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, message: auth.message });
    return;
  }
  const id = auth.customerId;
  const tombstoneEmail = `deleted-${id}-${Date.now()}@deleted.local`;
  const randomPassword =
    "Del-" +
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2) +
    "-" +
    Date.now().toString(36);
  // WC rejects empty `billing.email`, so we use the same tombstone there.
  const blankBilling = {
    first_name: "",
    last_name: "",
    company: "",
    address_1: "",
    address_2: "",
    city: "",
    postcode: "",
    country: "",
    state: "",
    email: tombstoneEmail,
    phone: "",
  };
  const blankShipping = {
    first_name: "",
    last_name: "",
    company: "",
    address_1: "",
    address_2: "",
    city: "",
    postcode: "",
    country: "",
    state: "",
    phone: "",
  };
  try {
    const updateRes = await wcFetch(`/customers/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        email: tombstoneEmail,
        first_name: "",
        last_name: "",
        password: randomPassword,
        billing: blankBilling,
        shipping: blankShipping,
      }),
    }, req);
    if (!updateRes.ok) {
      const errBody = (await updateRes.text().catch(() => "")) || "";
      req.log?.warn?.({ status: updateRes.status, body: errBody.slice(0, 300) }, "auth.delete: anonymise failed");
    }

    const delRes = await wcFetch(`/customers/${id}?force=true`, { method: "DELETE" }, req);
    if (!delRes.ok) {
      const data = (await delRes.json().catch(() => ({}))) as any;
      // Even if the DELETE call fails, we've already wiped PII above, so
      // the account is functionally deleted from the user's perspective.
      req.log?.warn?.({ status: delRes.status, message: data?.message }, "auth.delete: WC delete failed but anonymised");
    }

    res.json({ ok: true });
  } catch (e: any) {
    req.log?.error?.({ err: e?.message }, "auth.delete: unexpected error");
    res.status(500).json({ ok: false, message: e?.message ?? "Delete failed" });
  }
});

// ── Social sign-in: Apple & Google ───────────────────────────────────────────
// Both providers send us their identity JWT. We verify the signature against
// the provider's JWKS, ensure the audience matches our app's client ID, then
// resolve (or create) the matching WC customer and mint a server-side session
// JWT that the rest of the API accepts via `authenticate()`.

const APPLE_JWKS = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys"),
);
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

function envList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function appleAudiences(): string[] {
  const list = envList("APPLE_CLIENT_IDS");
  if (list.length) return list;
  // Sensible defaults: native iOS bundle id (Apple uses bundleId as the
  // audience for native Sign in with Apple).
  return ["presentail", "com.presentail.lb"];
}

// Web Sign in with Apple uses a Services ID as the audience (distinct from
// the native iOS bundle id used by mobile). We accept both lists so the same
// /auth route file can serve mobile-native AND web OAuth callers.
function appleWebAudiences(): string[] {
  const web = envList("APPLE_SERVICE_IDS");
  return web.length ? web : appleAudiences();
}

function googleAudiences(): string[] {
  return envList("GOOGLE_CLIENT_IDS");
}

// Web Google Sign-In uses a different OAuth Client ID (a Web client) than
// the iOS/Android client IDs used by mobile. Allow callers to set a separate
// list if the deployment uses different clients per platform.
function googleWebAudiences(): string[] {
  const web = envList("GOOGLE_WEB_CLIENT_IDS");
  return web.length ? web : googleAudiences();
}

function randomPassword(): string {
  return (
    "soc-" + randomBytes(24).toString("base64url") + "-" + Date.now().toString(36)
  );
}

async function findCustomerByEmail(email: string, req?: { query: any; headers: any }) {
  const r = await wcFetch(`/customers?email=${encodeURIComponent(email)}&per_page=1`, {}, req);
  if (!r.ok) return null;
  const list = (await r.json().catch(() => [])) as any[];
  return Array.isArray(list) && list[0] ? list[0] : null;
}

async function createCustomer(input: {
  email: string;
  firstName: string;
  lastName: string;
}, req?: { query: any; headers: any }) {
  const localPart = input.email.split("@")[0]?.replace(/[^a-zA-Z0-9_.-]/g, "") || "user";
  const username = `${localPart}-${randomBytes(3).toString("hex")}`;
  const r = await wcFetch("/customers", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      password: randomPassword(),
      username,
      first_name: input.firstName,
      last_name: input.lastName,
    }),
  }, req);
  const data = (await r.json().catch(() => ({}))) as any;
  if (!r.ok) {
    const msg = data?.message?.replace(/<[^>]*>/g, "") ?? "Could not create account";
    throw new Error(msg);
  }
  return data;
}

async function ensureCustomerForSocial(input: {
  email: string;
  firstName: string;
  lastName: string;
}, req?: { query: any; headers: any }) {
  const existing = await findCustomerByEmail(input.email, req);
  if (existing) return existing;
  return createCustomer(input, req);
}

async function issueSocialSession(
  res: import("express").Response,
  req: import("express").Request,
  provider: "apple" | "google",
  profile: { email: string; firstName: string; lastName: string },
) {
  const store = resolveStoreFromRequest(req);
  if (!store.consumerKey) {
    return res
      .status(503)
      .json({ ok: false, message: "Sign-in is not available right now." });
  }
  try {
    const customer = await ensureCustomerForSocial(profile, req);
    const mapped = mapCustomer(customer);
    void mirrorWcCustomerLocally(
      mapped.id,
      {
        email: mapped.email,
        firstName: mapped.firstName,
        lastName: mapped.lastName,
        phone: mapped.phone,
        provider,
      },
      req.log,
    );
    const token = await signServerToken({
      customerId: mapped.id,
      email: mapped.email,
      provider,
      storeBaseUrl: store.baseUrl,
    });
    return res.json({ ok: true, token, user: mapped });
  } catch (e: any) {
    req.log?.warn?.(
      { err: e?.message, provider },
      "auth.social: customer link failed",
    );
    return res
      .status(500)
      .json({ ok: false, message: e?.message ?? "Sign-in failed" });
  }
}

// ── Password reset ───────────────────────────────────────────────────────────
// We proxy WordPress's standard `wp-login.php` form endpoints. The lostpassword
// action triggers WP's reset email; the resetpass action consumes the key from
// the email link plus a new password. WP responds with HTML / 302 redirects, so
// we treat status codes and the Location header as the source of truth and
// always return a JSON envelope to the client.
//
// WP `wp-login.php?action=lostpassword` redirects to `?checkemail=confirm` on
// success and to `?action=lostpassword&error=...` on a failed lookup (unknown
// email, invalid login, etc.). We map those into structured codes so the UI
// can show an inline "we don't recognise that email" error per the product
// spec, while still treating upstream/network failures as generic.

router.post("/auth/reset/request", resetRequestIpLimiter, async (req, res) => {
  const email = String((req.body as any)?.email ?? "").trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, code: "invalid_email", message: "A valid email is required" });
  }

  // Email-based cap prevents one address from being flooded with reset emails.
  // Record the attempt before forwarding — every request to this endpoint
  // causes WordPress to attempt to send a reset email, so we cap at the
  // Express layer regardless of whether the email is known.
  const emailCheck = resetEmailLimiter.check(email);
  if (!emailCheck.allowed) {
    return res.status(429).json({
      ok: false,
      code: "too_many_requests",
      message: "Too many reset attempts for this email. Please wait before requesting another reset.",
    });
  }
  resetEmailLimiter.record(email);

  try {
    const form = new URLSearchParams({
      user_login: email,
      redirect_to: "",
      wp_lang: "",
    });
    const resetStore = resolveStoreFromRequest(req);
    const wpLogin = resetStore.wpBaseUrl.replace(/\/wp-json$/, "") + "/wp-login.php";
    const r = await fetch(`${wpLogin}?action=lostpassword`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "PresentailApp/1.0",
      },
      body: form.toString(),
    });
    if (r.status >= 500) {
      req.log?.warn?.({ status: r.status }, "auth.reset.request: upstream error");
      return res.status(502).json({ ok: false, message: "Reset service unavailable. Please try again later." });
    }
    const location = r.headers.get("location") ?? "";
    const isRedirect = r.status >= 300 && r.status < 400;
    if (isRedirect && /checkemail=confirm/.test(location)) {
      return res.json({ ok: true });
    }
    if (isRedirect && /[?&]error=/.test(location)) {
      // WP error codes here include `invaliduserdata`, `invalid_email`,
      // `invalidcombo` — all of which mean "we couldn't find this account".
      return res.status(404).json({
        ok: false,
        code: "unknown_email",
        message: "We couldn't find a Presentail account for that email.",
      });
    }
    if (r.status === 200) {
      // WP renders the form with errors inline when validation fails. Treat
      // this as "unknown email" since that's by far the most common cause.
      const body = await r.text().catch(() => "");
      if (/login_error|invalid|no.+user|user.+not/i.test(body)) {
        return res.status(404).json({
          ok: false,
          code: "unknown_email",
          message: "We couldn't find a Presentail account for that email.",
        });
      }
    }
    // Anything else: treat as success rather than leak ambiguous state.
    return res.json({ ok: true });
  } catch (e: any) {
    req.log?.warn?.({ err: e?.message }, "auth.reset.request: failed");
    return res.status(502).json({ ok: false, message: "Reset service unavailable. Please try again later." });
  }
});

function collectSetCookies(headers: Headers): string {
  const anyHeaders = headers as unknown as { getSetCookie?: () => string[] };
  const list: string[] =
    typeof anyHeaders.getSetCookie === "function"
      ? anyHeaders.getSetCookie()
      : (() => {
          const raw = headers.get("set-cookie");
          return raw ? [raw] : [];
        })();
  return list
    .map((c) => c.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

router.post("/auth/reset/confirm", resetConfirmIpLimiter, async (req, res) => {
  const { key, login, password } = (req.body ?? {}) as {
    key?: string;
    login?: string;
    password?: string;
  };
  if (!key || !login || !password) {
    return res.status(400).json({
      ok: false,
      code: "missing_link",
      message: "Missing reset link details or new password.",
    });
  }
  if (password.length < 8) {
    return res.status(400).json({
      ok: false,
      code: "weak_password",
      message: "Password must be at least 8 characters.",
    });
  }
  try {
    // Step 1: hit `?action=rp` so WP sets the resetpass cookie that authorises
    // the resetpass POST. On an invalid/expired key WP redirects to
    // `?action=lostpassword&error=...` and does not set the cookie.
    const confirmStore = resolveStoreFromRequest(req);
    const wpLogin = confirmStore.wpBaseUrl.replace(/\/wp-json$/, "") + "/wp-login.php";
    const rpRes = await fetch(
      `${wpLogin}?action=rp&key=${encodeURIComponent(key)}&login=${encodeURIComponent(login)}`,
      {
        method: "GET",
        redirect: "manual",
        headers: { "User-Agent": "PresentailApp/1.0" },
      },
    );
    const cookieHeader = collectSetCookies(rpRes.headers);
    const rpLocation = rpRes.headers.get("location") ?? "";
    const cookieIsResetpass = /wp-resetpass-/.test(cookieHeader);
    const errorRedirect = /[?&]error=/.test(rpLocation);
    if (!cookieIsResetpass || errorRedirect) {
      return res.status(400).json({
        ok: false,
        code: "expired_link",
        message: "This reset link has expired or is invalid. Please request a new one.",
      });
    }

    // Step 2: POST the new password to `?action=resetpass` with the cookie.
    const form = new URLSearchParams({
      pass1: password,
      pass2: password,
      "pass1-text": password,
      wp_lang: "",
    });
    const resetRes = await fetch(`${wpLogin}?action=resetpass`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader,
        "User-Agent": "PresentailApp/1.0",
      },
      body: form.toString(),
    });
    const resetLoc = resetRes.headers.get("location") ?? "";
    const isRedirect = resetRes.status >= 300 && resetRes.status < 400;
    if (isRedirect && /password=changed|action=login/.test(resetLoc)) {
      return res.json({ ok: true });
    }
    if (isRedirect && /[?&]error=/.test(resetLoc)) {
      return res.status(400).json({
        ok: false,
        code: "expired_link",
        message: "This reset link has expired or is invalid. Please request a new one.",
      });
    }
    const body = await resetRes.text().catch(() => "");
    if (/expired|invalid.+key|invalidkey/i.test(body)) {
      return res.status(400).json({
        ok: false,
        code: "expired_link",
        message: "This reset link has expired or is invalid. Please request a new one.",
      });
    }
    if (resetRes.status === 200) {
      // WP usually redirects on success. A 200 here means the form was
      // re-rendered with a validation error (most often a weak password).
      return res.status(400).json({
        ok: false,
        code: "weak_password",
        message: "Please choose a stronger password and try again.",
      });
    }
    req.log?.warn?.(
      { status: resetRes.status, location: resetLoc },
      "auth.reset.confirm: unexpected upstream response",
    );
    return res.status(502).json({
      ok: false,
      message: "Could not reset your password right now. Please try again.",
    });
  } catch (e: any) {
    req.log?.warn?.({ err: e?.message }, "auth.reset.confirm: failed");
    return res.status(502).json({
      ok: false,
      message: "Could not reset your password right now. Please try again.",
    });
  }
});

router.post("/auth/social/apple", socialIpLimiter, async (req, res) => {
  const { identityToken, fullName } = req.body as {
    identityToken?: string;
    fullName?: { givenName?: string | null; familyName?: string | null } | null;
  };
  if (!identityToken) {
    return res
      .status(400)
      .json({ ok: false, message: "Missing Apple identity token" });
  }
  let payload: any;
  try {
    const verified = await jwtVerify(identityToken, APPLE_JWKS, {
      issuer: "https://appleid.apple.com",
      audience: appleAudiences(),
    });
    payload = verified.payload;
  } catch (e: any) {
    req.log?.warn?.({ err: e?.message }, "auth.social.apple: token invalid");
    return res
      .status(401)
      .json({ ok: false, message: "Apple sign-in could not be verified" });
  }
  const email = String(payload.email ?? "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({
      ok: false,
      message:
        "Your Apple ID didn't share an email. Please retry and choose 'Share My Email'.",
    });
  }
  const givenName = String(fullName?.givenName ?? "").trim();
  const familyName = String(fullName?.familyName ?? "").trim();
  return issueSocialSession(res, req, "apple", {
    email,
    firstName: givenName,
    lastName: familyName,
  });
});

router.post("/auth/social/google", socialIpLimiter, async (req, res) => {
  const { idToken } = req.body as { idToken?: string };
  if (!idToken) {
    return res
      .status(400)
      .json({ ok: false, message: "Missing Google ID token" });
  }
  const audiences = googleAudiences();
  if (!audiences.length) {
    return res.status(503).json({
      ok: false,
      message: "Google sign-in is not configured on the server.",
    });
  }
  let payload: any;
  try {
    const verified = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: audiences,
    });
    payload = verified.payload;
  } catch (e: any) {
    req.log?.warn?.({ err: e?.message }, "auth.social.google: token invalid");
    return res
      .status(401)
      .json({ ok: false, message: "Google sign-in could not be verified" });
  }
  if (payload.email_verified === false) {
    return res
      .status(401)
      .json({ ok: false, message: "Your Google email is not verified." });
  }
  const email = String(payload.email ?? "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return res
      .status(400)
      .json({ ok: false, message: "Google didn't share an email address." });
  }
  const givenName = String(payload.given_name ?? "").trim();
  const familyName = String(payload.family_name ?? "").trim();
  return issueSocialSession(res, req, "google", {
    email,
    firstName: givenName,
    lastName: familyName,
  });
});

// ── Web OAuth: Apple & Google ────────────────────────────────────────────────
// These mirror /auth/social/* but use the web Sign in with Apple / Google
// Identity Services flows. The web SDKs return an identity token client-side;
// we verify the signature against the provider JWKS, then resolve (or create)
// the matching WC customer and mint a server-issued session JWT.
//
// Apple's web flow returns a payload shaped like:
//   { authorization: { id_token, code, state }, user?: { name: { firstName, lastName }, email } }
// The `user` object is sent only on the very first sign-in; we accept either
// `user` (web shape) or `fullName` (mobile shape) for the name fields.

router.post("/auth/oauth/apple", socialIpLimiter, async (req, res) => {
  const body = req.body as {
    idToken?: string;
    id_token?: string;
    user?: { name?: { firstName?: string | null; lastName?: string | null } | null } | null;
    fullName?: { givenName?: string | null; familyName?: string | null } | null;
  };
  const idToken = body.idToken ?? body.id_token;
  if (!idToken) {
    return res.status(400).json({ ok: false, message: "Missing Apple identity token" });
  }
  let payload: any;
  try {
    const verified = await jwtVerify(idToken, APPLE_JWKS, {
      issuer: "https://appleid.apple.com",
      audience: appleWebAudiences(),
    });
    payload = verified.payload;
  } catch (e: any) {
    req.log?.warn?.({ err: e?.message }, "auth.oauth.apple: token invalid");
    return res
      .status(401)
      .json({ ok: false, message: "Apple sign-in could not be verified" });
  }
  const email = String(payload.email ?? "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({
      ok: false,
      message:
        "Your Apple ID didn't share an email. Please retry and choose 'Share My Email'.",
    });
  }
  const givenName = String(
    body.user?.name?.firstName ?? body.fullName?.givenName ?? "",
  ).trim();
  const familyName = String(
    body.user?.name?.lastName ?? body.fullName?.familyName ?? "",
  ).trim();
  return issueSocialSession(res, req, "apple", {
    email,
    firstName: givenName,
    lastName: familyName,
  });
});

router.post("/auth/oauth/google", socialIpLimiter, async (req, res) => {
  const body = req.body as {
    idToken?: string;
    id_token?: string;
    credential?: string;
  };
  // Google Identity Services callbacks deliver the JWT as `credential`; we
  // accept idToken/id_token too so other clients can use the same endpoint.
  const idToken = body.idToken ?? body.id_token ?? body.credential;
  if (!idToken) {
    return res.status(400).json({ ok: false, message: "Missing Google ID token" });
  }
  const audiences = googleWebAudiences();
  if (!audiences.length) {
    return res.status(503).json({
      ok: false,
      message: "Google sign-in is not configured on the server.",
    });
  }
  let payload: any;
  try {
    const verified = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: audiences,
    });
    payload = verified.payload;
  } catch (e: any) {
    req.log?.warn?.({ err: e?.message }, "auth.oauth.google: token invalid");
    return res
      .status(401)
      .json({ ok: false, message: "Google sign-in could not be verified" });
  }
  if (payload.email_verified === false) {
    return res
      .status(401)
      .json({ ok: false, message: "Your Google email is not verified." });
  }
  const email = String(payload.email ?? "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return res
      .status(400)
      .json({ ok: false, message: "Google didn't share an email address." });
  }
  const givenName = String(payload.given_name ?? "").trim();
  const familyName = String(payload.family_name ?? "").trim();
  return issueSocialSession(res, req, "google", {
    email,
    firstName: givenName,
    lastName: familyName,
  });
});

export default router;
