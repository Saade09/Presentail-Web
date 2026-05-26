import { Router, type IRouter } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { randomBytes } from "node:crypto";
import { authenticate, decodeJwtPayload, signServerToken } from "../lib/auth";
import { requireUserType } from "../lib/requireUserType";
import { and, eq, isNull } from "drizzle-orm";
import { db, customersTable, CUSTOMER_GENDERS } from "@workspace/db";
import { upsertCustomer, getCustomerByWcId, normalizePhoneE164 } from "../lib/customers";
import { validateStoredPhone } from "../lib/phoneValidation";
import {
  ensureClerkUserInBackground,
  ensureClerkUserForCustomer,
  isClerkConfigured,
} from "../lib/clerkUserSync";
import type { Customer } from "@workspace/db";
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
import {
  classifyAuthExists,
  normalizeAuthExistsEmail,
  recordAuthExistsOutcome,
} from "../lib/authExists";

// Used by the password-reset / login routes below for a quick syntactic
// pre-check on input. The /auth/exists endpoint uses
// `normalizeAuthExistsEmail` instead, which is stricter (also lowercases
// + trims + bounds length).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

type CustomerProfile = {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  username: string;
  phone: string;
  gender: string | null;
  birthday: string | null;
  birthdayShareMonthDay: boolean;
};

function readWcMetaString(meta: any[] | undefined, key: string): string | null {
  if (!Array.isArray(meta)) return null;
  const found = meta.find((m: any) => m?.key === key);
  if (!found) return null;
  const v = found.value;
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

function mapCustomer(c: any): CustomerProfile {
  const gender = readWcMetaString(c?.meta_data, "presentail_gender");
  const birthday = readWcMetaString(c?.meta_data, "presentail_birthday");
  const shareRaw = readWcMetaString(c?.meta_data, "presentail_birthday_share");
  return {
    id: c.id as number,
    email: c.email as string,
    firstName: (c.first_name ?? "") as string,
    lastName: (c.last_name ?? "") as string,
    username: (c.username ?? "") as string,
    phone: (c.billing?.phone ?? "") as string,
    gender,
    birthday,
    birthdayShareMonthDay: shareRaw === null ? true : shareRaw !== "false" && shareRaw !== "0",
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
): Promise<Customer | null> {
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
    return upserted.customer;
  } catch (err: any) {
    log?.warn?.(
      { err: err?.message, wcCustomerId },
      "auth.mirror: local customer upsert failed (non-fatal)",
    );
    return null;
  }
}

// Combined "mirror to local DB + propagate to Clerk" used by the mobile
// registration / social login paths so a fresh signup shows up in Clerk
// within seconds (as opposed to waiting for the daily catch-up sync).
// Both legs are best-effort and never throw.
function mirrorAndPropagateToClerk(
  wcCustomerId: number,
  profile: {
    email: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    provider?: "apple" | "google" | "password";
  },
  log?: { warn?: (...args: any[]) => void; info?: (...args: any[]) => void },
): void {
  void mirrorWcCustomerLocally(wcCustomerId, profile, log).then((local) => {
    if (!isClerkConfigured()) return;
    ensureClerkUserInBackground({
      email: profile.email,
      firstName: profile.firstName ?? null,
      lastName: profile.lastName ?? null,
      localCustomerId: local?.id ?? null,
      log,
    });
  });
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
router.get("/auth/exists", existsIpLimiter, async (req, res) => {
  const platformHeader = String(req.header("x-app-platform") ?? "")
    .trim()
    .toLowerCase() || null;

  const email = normalizeAuthExistsEmail(req.query.email);
  if (!email) {
    req.log?.info?.(
      { authExistsOutcome: "invalid_email", platform: platformHeader },
      "auth.exists outcome",
    );
    recordAuthExistsOutcome("invalid_email", platformHeader);
    res.json({ ok: true, exists: false });
    return;
  }

  const result = await classifyAuthExists({
    email,
    localLookup: async (e) => {
      const rows = await db
        .select({ id: customersTable.id })
        .from(customersTable)
        .where(eq(customersTable.email, e))
        .limit(1);
      return rows.length > 0;
    },
    wcConfigured: Boolean(process.env.WC_CONSUMER_KEY),
    wcFetch: (path, init) => wcFetch(path, init, req),
    wpFetch: (path, init) => wpFetch(path, init, req),
  });

  // Centralised structured log + persisted outcome row. Both feed the
  // scheduled monitor that alerts on inconclusive-rate spikes — i.e. the
  // moment WC creds rotate, the JWT plugin is disabled, or upstream
  // starts 5xx-ing, ops gets a Slack ping instead of a slow leak of
  // returning shoppers being misrouted to sign-up.
  if (result.code) {
    req.log?.warn?.(
      { authExistsOutcome: result.outcome, platform: platformHeader },
      "auth.exists outcome (inconclusive)",
    );
  } else {
    req.log?.info?.(
      {
        authExistsOutcome: result.outcome,
        platform: platformHeader,
        exists: result.exists,
      },
      "auth.exists outcome",
    );
  }
  recordAuthExistsOutcome(result.outcome, platformHeader);

  const body: { ok: true; exists: boolean; code?: string } = {
    ok: true,
    exists: result.exists,
  };
  if (result.code) body.code = result.code;
  res.json(body);
});

// ── Web-bridge: JIT Clerk creation for an existing WP shopper ────────────────
// The web sign-in page calls this with the email the shopper just typed. If
// the email matches a WP/WC account, we ensure a corresponding Clerk user
// exists (idempotent, see `ensureClerkUserForCustomer`) so the subsequent
// Clerk email-code flow can authenticate them.
//
// We reuse `classifyAuthExists` for the lookup so this endpoint inherits the
// same monitoring + outcome taxonomy as `/auth/exists`. When the classifier
// reports `exists_true_wc` we additionally do a one-shot WC fetch to grab
// the customer profile (the classifier intentionally returns no payload),
// so the Clerk JIT-create has first / last name and phone.
//
// Response contract:
//   - { ok: true, exists: true,  clerkReady: true }   → frontend may proceed
//                                                       with `signIn.create`
//   - { ok: true, exists: true,  clerkReady: false }  → existed in WP but
//                                                       Clerk provisioning
//                                                       failed; show error
//   - { ok: true, exists: false }                     → unknown email; let
//                                                       Clerk's normal
//                                                       sign-up flow handle
//   - { ok: true, exists: false, code: "lookup_failed" | "lookup_unavailable" }
//                                                     → hard error; the UI
//                                                       must NOT route the
//                                                       shopper to sign-up
router.post("/auth/web-bridge", existsIpLimiter, async (req, res) => {
  const platformHeader = String(req.header("x-app-platform") ?? "")
    .trim()
    .toLowerCase() || null;

  const email = normalizeAuthExistsEmail((req.body as any)?.email);
  if (!email) {
    recordAuthExistsOutcome("invalid_email", platformHeader);
    res.json({ ok: true, exists: false });
    return;
  }

  const lookup = await classifyAuthExists({
    email,
    localLookup: async (e) => {
      const rows = await db
        .select({ id: customersTable.id })
        .from(customersTable)
        .where(eq(customersTable.email, e))
        .limit(1);
      return rows.length > 0;
    },
    wcConfigured: Boolean(process.env.WC_CONSUMER_KEY),
    wcFetch: (path, init) => wcFetch(path, init, req),
    wpFetch: (path, init) => wpFetch(path, init, req),
  });
  recordAuthExistsOutcome(lookup.outcome, platformHeader);

  if (!lookup.exists || lookup.code) {
    const out: { ok: true; exists: boolean; code?: string } = {
      ok: true,
      exists: lookup.exists,
    };
    if (lookup.code) out.code = lookup.code;
    res.json(out);
    return;
  }
  if (!isClerkConfigured()) {
    // We confirmed the WP user exists but cannot provision Clerk. Surface as
    // a hard error so the UI shows "try again later" rather than silently
    // failing on the next step.
    req.log?.warn?.("auth.web-bridge: Clerk not configured");
    res.json({ ok: true, exists: true, clerkReady: false, code: "lookup_unavailable" });
    return;
  }

  // For the WC-hit path, fetch the matching WC row so we can mirror it
  // into our local customers table and populate the Clerk JIT-create
  // payload with first / last / phone. Best-effort — failures here just
  // mean we create the Clerk user with email-only.
  let wc: any = null;
  if (lookup.outcome === "exists_true_wc") {
    try {
      const r = await wcFetch(
        `/customers?email=${encodeURIComponent(email)}&per_page=1`,
        {},
        req,
      );
      if (r.ok) {
        const list = (await r.json().catch(() => [])) as any[];
        if (Array.isArray(list) && list.length > 0) {
          wc = list[0];
        }
      }
    } catch (e: any) {
      req.log?.warn?.(
        { err: e?.message },
        "auth.web-bridge: WC profile fetch failed (non-fatal)",
      );
    }
  }

  let localCustomerId: number | null = null;
  if (wc?.id) {
    const local = await mirrorWcCustomerLocally(
      Number(wc.id),
      {
        email,
        firstName: typeof wc.first_name === "string" ? wc.first_name : undefined,
        lastName: typeof wc.last_name === "string" ? wc.last_name : undefined,
        phone: typeof wc.billing?.phone === "string" ? wc.billing.phone : undefined,
      },
      req.log,
    );
    localCustomerId = local?.id ?? null;
  }
  try {
    const ensure = await ensureClerkUserForCustomer({
      email,
      firstName: (wc?.first_name as string) ?? null,
      lastName: (wc?.last_name as string) ?? null,
      localCustomerId,
      log: req.log,
    });
    // `ensureClerkUserForCustomer` is intentionally non-throwing — it
    // returns structured `{ok:false,reason}` on failure. We MUST inspect
    // it before claiming `clerkReady: true`, otherwise the web SignIn
    // page will advance the shopper to a Clerk email-code step against
    // a Clerk user that doesn't exist.
    if (!ensure.ok) {
      req.log?.warn?.(
        { reason: ensure.reason, message: (ensure as any).message },
        "auth.web-bridge: ensureClerkUserForCustomer returned not-ok",
      );
      const code: "lookup_failed" | "lookup_unavailable" =
        ensure.reason === "not_configured" ? "lookup_unavailable" : "lookup_failed";
      res.json({ ok: true, exists: true, clerkReady: false, code });
      return;
    }
    res.json({ ok: true, exists: true, clerkReady: true });
  } catch (e: any) {
    // Defensive: helper shouldn't throw, but if it does (e.g. unexpected
    // sync error during construction), still surface a hard error.
    req.log?.warn?.(
      { err: e?.message },
      "auth.web-bridge: ensureClerkUserForCustomer threw",
    );
    res.json({ ok: true, exists: true, clerkReady: false, code: "lookup_failed" });
  }
});

// ── Admin diagnostic ─────────────────────────────────────────────────────────
// Lets ops verify, in one call, that the two upstream signals the
// `/auth/exists` lookup depends on are actually wired up. Returns a
// per-check pass/fail so a regression (rotated WC keys, JWT plugin
// disabled on prod) is obvious without having to read funnel charts.
//
// Gated by the same `PUSH_ADMIN_TOKEN` header used by the other admin
// surfaces. The check email is a syntactically-valid value that's
// guaranteed not to exist (`@example.invalid`) so the WP probe can't
// authenticate against a real account even if someone misuses the
// endpoint. We never echo WC creds, store URLs, or response bodies back.
router.get("/auth/diagnostics", async (req, res) => {
  const expected = process.env.PUSH_ADMIN_TOKEN;
  const provided = req.header("x-push-admin-token");
  if (!expected || provided !== expected) {
    res.status(403).json({ ok: false, message: "Forbidden" });
    return;
  }

  const wcConfigured = Boolean(process.env.WC_CONSUMER_KEY);
  const probeEmail =
    "diagnostic-" + Date.now().toString(36) + "@example.invalid";

  const checks: Record<
    string,
    { ok: boolean; status?: number; detail?: string }
  > = {};

  // 1) WC customers endpoint reachable + creds accepted.
  if (!wcConfigured) {
    checks.wcCustomers = { ok: false, detail: "WC_CONSUMER_KEY not set" };
  } else {
    try {
      const r = await wcFetch(`/customers?per_page=1`, {}, req);
      checks.wcCustomers = {
        ok: r.ok,
        status: r.status,
        detail: r.ok ? "ok" : "non-2xx response",
      };
    } catch (e: any) {
      checks.wcCustomers = { ok: false, detail: e?.message ?? "fetch failed" };
    }
  }

  // 2) JWT plugin reachable. We expect a 4xx with an `invalid_email` /
  //    `invalid_username` / `invalid_user` code (since the email is
  //    guaranteed not to resolve). 404 means the plugin isn't installed.
  try {
    const r = await wpFetch(
      `/jwt-auth/v1/token`,
      {
        method: "POST",
        body: JSON.stringify({
          username: probeEmail,
          password: "_diagnostic_" + Math.random().toString(36).slice(2),
        }),
      },
      req,
    );
    if (r.status === 404) {
      checks.wpJwtPlugin = {
        ok: false,
        status: 404,
        detail: "JWT plugin missing (returns 404)",
      };
    } else {
      const data = (await r.json().catch(() => ({}))) as any;
      const code = String(data?.code ?? "");
      const recognised =
        /incorrect_password|invalid_email|invalid_username|invalid_user/i.test(
          code,
        );
      checks.wpJwtPlugin = {
        ok: recognised,
        status: r.status,
        detail: recognised
          ? "plugin reachable, returns recognised code"
          : `unexpected response code: ${code || "<none>"}`,
      };
    }
  } catch (e: any) {
    checks.wpJwtPlugin = { ok: false, detail: e?.message ?? "fetch failed" };
  }

  // 3) End-to-end classifier on the guaranteed-not-to-exist email. We
  //    expect `exists_false` when both upstreams are healthy.
  try {
    const result = await classifyAuthExists({
      email: probeEmail,
      wcConfigured,
      wcFetch: (path, init) => wcFetch(path, init, req),
      wpFetch: (path, init) => wpFetch(path, init, req),
    });
    checks.classifier = {
      ok: result.outcome === "exists_false",
      detail: `outcome=${result.outcome}`,
    };
  } catch (e: any) {
    checks.classifier = { ok: false, detail: e?.message ?? "threw" };
  }

  const overallOk = Object.values(checks).every((c) => c.ok);
  res.status(overallOk ? 200 : 503).json({ ok: overallOk, checks });
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
        gender: null,
        birthday: null,
        birthdayShareMonthDay: true,
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
      // Mirror to local DB AND propagate to Clerk (best-effort, non-blocking).
      // A brand-new mobile signup should appear in Clerk within seconds so a
      // matching web sign-in can find them via email lookup, without waiting
      // for the daily catch-up sync.
      mirrorAndPropagateToClerk(
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
router.get("/auth/me", requireUserType(["customer"]), async (req, res) => {
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
          gender: local.gender ?? null,
          birthday: local.birthday ?? null,
          birthdayShareMonthDay: local.birthdayShareMonthDay,
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
// Birthday must be a valid past calendar date in `YYYY-MM-DD` form. We
// cap the upper bound at "today" in UTC so a clock-skewed device clock
// can't slip a future date through.
function parseBirthday(raw: unknown): { ok: true; value: string | null } | { ok: false } {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }
  if (typeof raw !== "string") return { ok: false };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return { ok: false };
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return { ok: false };
  // Reject dates the calendar normalised away (e.g. 2024-02-31).
  const [y, m, d] = trimmed.split("-").map((s) => Number(s));
  if (
    parsed.getUTCFullYear() !== y ||
    parsed.getUTCMonth() + 1 !== m ||
    parsed.getUTCDate() !== d
  ) {
    return { ok: false };
  }
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  if (parsed.getTime() > todayUtc.getTime()) return { ok: false };
  // 130-year sanity bound — anything older is almost certainly a typo.
  const minYear = todayUtc.getUTCFullYear() - 130;
  if (y < minYear) return { ok: false };
  return { ok: true, value: trimmed };
}

router.put("/auth/me", requireUserType(["customer"]), async (req, res) => {
  const auth = await authenticate(req.header("authorization"), req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, message: auth.message });
    return;
  }
  const body = (req.body ?? {}) as {
    firstName?: string;
    lastName?: string;
    phone?: string;
    gender?: string | null;
    birthday?: string | null;
    birthdayShareMonthDay?: boolean;
  };

  // When the client sends a phone, it must be a strict-E.164 string and
  // (when the dial code is known) fall inside the per-country length
  // bounds. We use the normalized "+digits" value for both the local row
  // and the WooCommerce mirror so a hand-rolled API call can't smuggle a
  // raw, unvalidated string into the billing record.
  let validatedPhone: string | undefined;
  if (body.phone !== undefined) {
    const phoneCheck = validateStoredPhone(
      typeof body.phone === "string" ? body.phone : "",
    );
    if (!phoneCheck.ok) {
      const message =
        phoneCheck.reason === "too_short"
          ? "Phone number is too short for the selected country"
          : phoneCheck.reason === "too_long"
            ? "Phone number is too long for the selected country"
            : "Invalid phone number";
      res.status(400).json({ ok: false, message, code: phoneCheck.reason });
      return;
    }
    validatedPhone = phoneCheck.normalized;
  }

  let normalizedGender: string | null | undefined;
  if (body.gender !== undefined) {
    if (body.gender === null || body.gender === "") {
      normalizedGender = null;
    } else if (
      typeof body.gender === "string" &&
      (CUSTOMER_GENDERS as readonly string[]).includes(body.gender)
    ) {
      normalizedGender = body.gender;
    } else {
      // Unknown value — silently ignore rather than rejecting the whole
      // request, matching the "ignore unknown values" contract in the spec.
      normalizedGender = undefined;
    }
  }

  let normalizedBirthday: string | null | undefined;
  if (body.birthday !== undefined) {
    const parsed = parseBirthday(body.birthday);
    if (!parsed.ok) {
      res.status(400).json({ ok: false, message: "Invalid birthday" });
      return;
    }
    normalizedBirthday = parsed.value;
  }

  const normalizedShare =
    typeof body.birthdayShareMonthDay === "boolean"
      ? body.birthdayShareMonthDay
      : undefined;

  // First, persist to the canonical local row so the change is durable
  // even if the WC mirror call below fails.
  let localPatchApplied = false;
  try {
    const localPatch: Partial<typeof customersTable.$inferInsert> = {};
    if (typeof body.firstName === "string") localPatch.firstName = body.firstName.trim();
    if (typeof body.lastName === "string") localPatch.lastName = body.lastName.trim();
    if (validatedPhone !== undefined) {
      // `validatedPhone` is already strict E.164 (or "" to clear).
      // `normalizePhoneE164` may still return null for the empty case,
      // which is the correct value to persist.
      localPatch.phoneE164 = validatedPhone
        ? normalizePhoneE164(validatedPhone)
        : null;
    }
    if (normalizedGender !== undefined) localPatch.gender = normalizedGender;
    if (normalizedBirthday !== undefined) localPatch.birthday = normalizedBirthday;
    if (normalizedShare !== undefined) localPatch.birthdayShareMonthDay = normalizedShare;
    if (Object.keys(localPatch).length > 0) {
      await db
        .update(customersTable)
        .set({ ...localPatch, updatedAt: new Date() })
        .where(eq(customersTable.wcCustomerId, auth.customerId));
      localPatchApplied = true;
    }
  } catch (err: any) {
    req.log?.warn?.(
      { err: err?.message, wcCustomerId: auth.customerId },
      "auth.me.put: local profile patch failed",
    );
  }

  // Best-effort mirror to WooCommerce. Failures are logged but do not
  // break the save — same contract as the existing first/last/phone path.
  const wcPayload: Record<string, unknown> = {};
  if (typeof body.firstName === "string") wcPayload.first_name = body.firstName;
  if (typeof body.lastName === "string") wcPayload.last_name = body.lastName;
  if (validatedPhone !== undefined) wcPayload.billing = { phone: validatedPhone };
  const metaUpdates: { key: string; value: string }[] = [];
  if (normalizedGender !== undefined) {
    metaUpdates.push({ key: "presentail_gender", value: normalizedGender ?? "" });
  }
  if (normalizedBirthday !== undefined) {
    metaUpdates.push({ key: "presentail_birthday", value: normalizedBirthday ?? "" });
  }
  if (normalizedShare !== undefined) {
    metaUpdates.push({ key: "presentail_birthday_share", value: String(normalizedShare) });
  }
  if (metaUpdates.length > 0) wcPayload.meta_data = metaUpdates;

  let mapped: CustomerProfile | null = null;
  try {
    const r = await wcFetch(`/customers/${auth.customerId}`, {
      method: "PUT",
      body: JSON.stringify(wcPayload),
    }, req);
    const data = (await r.json().catch(() => ({}))) as any;
    if (r.ok) {
      mapped = mapCustomer(data);
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
    } else {
      req.log?.warn?.(
        { status: r.status, message: data?.message },
        "auth.me.put: WC mirror update failed (non-fatal)",
      );
    }
  } catch (err: any) {
    req.log?.warn?.(
      { err: err?.message },
      "auth.me.put: WC mirror update threw (non-fatal)",
    );
  }

  // If the WC call succeeded use its mapped values, but always overlay
  // the locally-persisted gender/birthday/share so the response reflects
  // what we actually saved (the WC mirror may not echo our meta_data
  // immediately on some hosts).
  try {
    const local = await getCustomerByWcId(auth.customerId);
    if (local) {
      const user: CustomerProfile = {
        id: auth.customerId,
        email: local.email,
        firstName: mapped?.firstName ?? local.firstName ?? "",
        lastName: mapped?.lastName ?? local.lastName ?? "",
        username: mapped?.username ?? "",
        phone: mapped?.phone ?? local.phoneE164 ?? "",
        gender: local.gender ?? null,
        birthday: local.birthday ?? null,
        birthdayShareMonthDay: local.birthdayShareMonthDay,
      };
      res.json({ ok: true, user });
      return;
    }
  } catch {
    // fall through
  }

  if (mapped) {
    res.json({ ok: true, user: mapped });
    return;
  }

  if (!localPatchApplied) {
    res.status(500).json({ ok: false, message: "Update failed" });
    return;
  }
  res.json({ ok: true, user: null });
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
router.delete("/auth/me", requireUserType(["customer"]), async (req, res) => {
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

async function findCustomerByEmail(
  email: string,
  req?: { query: any; headers: any },
  { allRoles = false }: { allRoles?: boolean } = {},
) {
  // WC's /customers endpoint defaults to role=customer, which excludes
  // WordPress admins, editors, and other non-customer roles. When allRoles
  // is true (used as a fallback after a create-conflict) we pass role=all
  // so we can locate any WP user by email regardless of their role.
  const roleParam = allRoles ? "&role=all" : "";
  const r = await wcFetch(
    `/customers?email=${encodeURIComponent(email)}&per_page=1${roleParam}`,
    {},
    req,
  );
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
  // First try: customer-role-only lookup (the fast path for normal shoppers).
  const existing = await findCustomerByEmail(input.email, req);
  if (existing) return existing;

  try {
    return await createCustomer(input, req);
  } catch (createErr: any) {
    // WooCommerce rejects account creation when the email already exists as
    // any WordPress user (e.g. admins, editors). The error message contains
    // "already registered". In that case, retry the lookup with role=all so
    // we can find and return the existing WP user record instead of failing.
    const msg: string = createErr?.message ?? "";
    if (/already registered/i.test(msg)) {
      const byAllRoles = await findCustomerByEmail(input.email, req, { allRoles: true });
      if (byAllRoles) return byAllRoles;
    }
    throw createErr;
  }
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
    // Best-effort mirror to local DB AND propagate to Clerk so a new
    // mobile/web social signup is reachable from the web sign-in
    // email-lookup flow within seconds.
    mirrorAndPropagateToClerk(
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
