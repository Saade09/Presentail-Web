import { Router, type IRouter } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { randomBytes, createHash, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { checkAdminToken } from "../lib/admin-auth";
import { getAuth, createClerkClient } from "@clerk/express";
import { authenticate, signServerToken, isWcAuthEnabled } from "../lib/auth";
import { reconcileGuestOrders } from "../lib/orderReconciliation";
import { logger } from "../lib/logger";
import { requireUserType } from "../lib/requireUserType";
import { and, eq, isNull, isNotNull, gt } from "drizzle-orm";
import { db, customersTable, CUSTOMER_GENDERS, phoneOtpsTable } from "@workspace/db";
import { upsertCustomer, getCustomerByWcId, getCustomerById, getCustomerByAppleSub, normalizePhoneE164 } from "../lib/customers";
import { validateStoredPhone } from "../lib/phoneValidation";
import {
  ensureClerkUserInBackground,
  isClerkConfigured,
} from "../lib/clerkUserSync";
import type { Customer } from "@workspace/db";
import {
  existsIpLimiter,
  webBridgeIpLimiter,
  loginIpLimiter,
  registerIpLimiter,
  resetRequestIpLimiter,
  resetConfirmIpLimiter,
  socialIpLimiter,
  loginEmailLimiter,
  resetEmailLimiter,
  otpPhoneLimiter,
  otpSendIpLimiter,
} from "../lib/auth-rate-limit";
import {
  classifyAuthExists,
  normalizeAuthExistsEmail,
  recordAuthExistsOutcome,
} from "../lib/authExists";

// ── Password hashing (Node.js built-in crypto.scrypt) ────────────────────────
// We use scrypt instead of bcrypt to avoid a native-binding dependency.
// Format stored in the DB: "<16-byte-hex-salt>:<64-byte-hex-key>"
// Cost params: N=16384, r=8, p=1 (equivalent to bcrypt cost ~12 on current hw).
//
// COMPATIBILITY NOTE: `customers.password_hash` is a brand-new column added by
// migration 0015_customers_password_hash.sql.  No existing customer row has ever
// had a hash stored here — all prior passwords lived in WordPress/WooCommerce,
// not in the local DB.  The column is nullable; a null hash always fails
// `verifyPassword` and returns `incorrect_password`, which is the intended
// behaviour: pre-migration users must go through the password-reset flow to set
// a local password for the first time.  There is no bcrypt-hash compat concern.

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const SCRYPT_KEY_LEN = 64;

function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEY_LEN, SCRYPT_PARAMS, (err, key) => {
      if (err) reject(err);
      else resolve(`${salt}:${key.toString("hex")}`);
    });
  });
}

function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hexKey] = stored.split(":");
  if (!salt || !hexKey) return Promise.resolve(false);
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEY_LEN, SCRYPT_PARAMS, (err, key) => {
      if (err) reject(err);
      else {
        try {
          const storedBuf = Buffer.from(hexKey, "hex");
          resolve(timingSafeEqual(key, storedBuf));
        } catch {
          resolve(false);
        }
      }
    });
  });
}

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
  return {
    id: c.id as number,
    email: c.email as string,
    firstName: (c.first_name ?? "") as string,
    lastName: (c.last_name ?? "") as string,
    username: (c.username ?? "") as string,
    phone: (c.billing?.phone ?? "") as string,
    gender,
    birthday,
  };
}

// Normalize a raw language tag from x-app-lang / Accept-Language into one of
// the three supported values ("en" | "ar" | "fr"). Falls back to "en".
function normalizeLang(raw: string | null | undefined): "en" | "ar" | "fr" {
  if (!raw) return "en";
  const tag = raw.split(/[,;]/)[0].trim().toLowerCase();
  if (tag.startsWith("ar")) return "ar";
  if (tag.startsWith("fr")) return "fr";
  return "en";
}

// Extract the customer's preferred language from an incoming request. Prefers
// the dedicated `x-app-lang` header (set by the mobile Expo app) and falls
// back to `Accept-Language` so any client can communicate locale.
function langFromRequest(req: { headers: Record<string, any> }): "en" | "ar" | "fr" {
  const appLang = (req.headers["x-app-lang"] as string | undefined) ?? null;
  if (appLang) return normalizeLang(appLang);
  const acceptLang = (req.headers["accept-language"] as string | undefined) ?? null;
  return normalizeLang(acceptLang);
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
    preferredLang?: string;
    appleSub?: string | null;
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
      preferredLang: profile.preferredLang,
      appleSub: profile.appleSub ?? null,
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
    preferredLang?: string;
    appleSub?: string | null;
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

  const email = String(payload.email ?? "").trim().toLowerCase();
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
      email: probeEmail,
      wcConfigured,
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

  // Do not disclose whether the email is registered: return the same 200 body
  // for known and unknown addresses. Service-failure codes (lookup_failed /
  // lookup_unavailable) are still surfaced so the mobile client can show a
  // "couldn't check, try again" error rather than silently routing the shopper
  // to sign-up — but the `exists` boolean is deliberately omitted.
  const body = `Presentail: Your verification code is ${code}. It expires in 10 minutes.`; // i18n-ignore
  if (result.code) body.code = result.code;
  res.json(body);
});

// ── Web-bridge: local DB lookup for the sign-in page ─────────────────────────
// The web sign-in page calls this with the email the shopper just typed.
// We check the local `customers` table and return `userExists` so the
// frontend can route unknown emails to /sign-up and known emails to the
// password step. No WC/WP or Clerk JIT-provisioning is involved.
//
// Enumeration trade-off: this endpoint returns `userExists: true/false`, making
// it an email oracle. The mitigation is a dedicated per-IP rate limiter
// (webBridgeIpLimiter: 10 requests / 15 min) that is stricter than the shared
// existsIpLimiter used on /auth/exists. Distributed attacks rotating many IPs
// are not fully preventable by per-IP rate limiting alone — this is a deliberate
// product trade-off for UX routing purposes, documented in the OpenAPI spec.
//
// We still call `recordAuthExistsOutcome` so the existing monitoring
// taxonomy (exists_true_local / exists_false) continues to work.
//
// Response contract:
//   - { ok: true, userExists: true,  passwordLoginAvailable: true }
//                                    → known email; show the password step
//   - { ok: true, userExists: false, passwordLoginAvailable: true }
//                                    → unknown email; frontend redirects to
//                                      /sign-up?email_address=<email>
router.post("/auth/web-bridge", webBridgeIpLimiter, async (req, res) => {
  const platformHeader = String(req.header("x-app-platform") ?? "")
    .trim()
    .toLowerCase() || null;

  const email = String(payload.email ?? "").trim().toLowerCase();
  if (!email) {
    recordAuthExistsOutcome("invalid_email", platformHeader);
    res.json({ ok: true, userExists: false, passwordLoginAvailable: false });
    return;
  }

  // Local DB only — WC/WP no longer exists. A local miss is a definitive
  // "user does not exist" (all customers have been imported into the local DB).
  let rows: typeof phoneOtpsTable.$inferSelect[];

  const userExists = rows.length > 0;
  const wcConfigured = Boolean(process.env.WC_CONSUMER_KEY);
  const probeEmail =
    "diagnostic-" + Date.now().toString(36) + "@example.invalid";

  const checks: Record<
    string,
    { ok: boolean; status?: number; reason?: string; detail?: string }
  > = {};

  // 1) WC customers endpoint reachable + creds accepted.
  if (!wcConfigured) {
    checks.wcCustomers = { ok: false, detail: "WC_CONSUMER_KEY not set" };
  } else {
    try {
    const r = await wcFetch("/customers", {
      method: "POST",
      body: JSON.stringify({
        email: email.trim(),
        password,
        first_name: firstName?.trim() ?? "",
        last_name: lastName?.trim() ?? "",
        billing: { phone: normalizedPhone },
      }),
    }, req);
      checks.wcCustomers = {
        ok: r.ok,
        status: r.status,
        detail: r.ok ? "ok" : "non-2xx response",
      };
    } catch (e: any) {
      checks.wcCustomers = { ok: false, detail: e?.message ?? "fetch failed" }; // i18n-ignore
    }
  }

  // 2) JWT plugin reachable. We expect a 4xx with an `invalid_email` /
  //    `invalid_username` / `invalid_user` code (since the email is
  //    guaranteed not to resolve). 404 means the plugin isn't installed.
  try {
    const r = await wcFetch("/customers", {
      method: "POST",
      body: JSON.stringify({
        email: email.trim(),
        password,
        first_name: firstName?.trim() ?? "",
        last_name: lastName?.trim() ?? "",
        billing: { phone: normalizedPhone },
      }),
    }, req);

    const data = (await r.json().catch(() => ({}))) as any;
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
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
    checks.wpJwtPlugin = { ok: false, detail: e?.message ?? "fetch failed" }; // i18n-ignore
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

  // 4) Stripe key presence + format check (no network call required).
  //    Both STRIPE_SECRET_KEY (server-side API calls) and STRIPE_PUBLISHABLE_KEY
  //    (returned to clients for Elements / mobile SDK) must be set and valid-looking.
  {
    const secretKey = process.env.CLERK_SECRET_KEY;
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY ?? "";
    if (!secretKey) {
      checks.stripe = {
        ok: false,
        reason: "stripe_not_configured", // i18n-ignore
        detail: "STRIPE_SECRET_KEY not set", // i18n-ignore
      };
    } else if (!secretKey.startsWith("sk_")) {
      checks.stripe = {
        ok: false,
        reason: "stripe_not_configured", // i18n-ignore
        detail: "STRIPE_SECRET_KEY does not start with sk_", // i18n-ignore
      };
    } else if (!publishableKey) {
      checks.stripe = {
        ok: false,
        reason: "stripe_not_configured", // i18n-ignore
        detail: "STRIPE_PUBLISHABLE_KEY not set", // i18n-ignore
      };
    } else if (!publishableKey.startsWith("pk_")) {
      checks.stripe = {
        ok: false,
        reason: "stripe_not_configured", // i18n-ignore
        detail: "STRIPE_PUBLISHABLE_KEY does not start with pk_", // i18n-ignore
      };
    } else {
      const mode = secretKey.startsWith("sk_live_") ? "live" : "test";
      checks.stripe = {
        ok: true,
        detail: `keys present (${mode} mode)`, // i18n-ignore
      };
    }
  }

  // All currencies are processed through the single Cyprus Stripe account.
  const mandatoryChecks = Object.entries(checks)
    .map(([, v]) => v);
  const overallOk = mandatoryChecks.every((c) => c.ok);
  res.status(overallOk ? 200 : 503).json({ ok: overallOk, checks });
});

// ── Login: local password auth (scrypt hash stored in customers.password_hash) ─
// Looks up the customer by email in the local DB, verifies the submitted
// password against the stored scrypt hash, and returns a server-issued JWT.
// WC/WP is no longer involved in this flow.
router.post("/auth/login", loginIpLimiter, async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ ok: false, code: "missing_credentials", message: "Email and password are required" }); // i18n-ignore
  }

  // Check per-email failure cap before forwarding. Successful logins do NOT
  // increment the counter — only failed auth responses do (see below). This
  // prevents locking out a legitimate user who logs in repeatedly.
  const emailCheck = resetEmailLimiter.check(email);
  if (!emailCheck.allowed) {
    return res.status(429).json({
      ok: false,
      code: "too_many_requests",
      message: "Too many login attempts for this account. Please wait a moment and try again.", // i18n-ignore
    });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
  let rows: typeof phoneOtpsTable.$inferSelect[];
  try {
    rows = await db
      .select()
      .from(phoneOtpsTable)
      .where(
        and(
          eq(phoneOtpsTable.phone, normalizedPhone),
          gt(phoneOtpsTable.expiresAt, now),
        ),
      )
      .limit(1);
  } catch (err: any) {
    req.log?.error?.({ err: err?.message }, "auth.otp.verify: DB select error");
    res.status(500).json({ ok: false, code: "server_error", message: "Failed to look up OTP" }); // i18n-ignore
    return;
  }

  if (rows.length === 0) {
    res.status(400).json({ ok: false, code: "expired_otp", message: "OTP not found or expired" }); // i18n-ignore
    return;
  }

  const row = rows[0];
    if (!row || !row.passwordHash) {
      loginEmailLimiter.record(email);
      return res.status(401).json({
        ok: false,
        code: "invalid_credentials",
        message: "Invalid email or password", // i18n-ignore
      });
    }

    const valid = await verifyPassword(password, row.passwordHash);
    if (!valid) {
      loginEmailLimiter.record(email);
      return res.status(401).json({
        ok: false,
        code: "incorrect_password",
        message: "Invalid email or password", // i18n-ignore
      });
    }

      const store = resolveStoreFromRequest(req);
    let token: string | null = null;

    return res.json({
      ok: true,
      token,
      user: {
        id: row.id,
        email: row.email,
        firstName: row.firstName ?? "",
        lastName: row.lastName ?? "",
        username: "",
        phone: row.phoneE164 ?? "",
        gender: null,
        birthday: null,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, code: "server_error", message: e?.message ?? "Login failed" }); // i18n-ignore
  }
});

// ── Email verification helper ─────────────────────────────────────────────────
// Sends a one-time verification link to the given email via SMTP (best-effort).
// Returns immediately without awaiting the send result so the registration
// response is never delayed. Logged at WARN level on failure.
function sendEmailVerification(opts: {
  email: string;
  token: string;
  log?: { warn?: (...args: any[]) => void };
}): void {
  const smtpHost = process.env.SMTP_HOST;
  if (!smtpHost) return; // SMTP not configured — skip silently.

  const { email, token, log } = opts;
  const domain =
    (process.env.EXPO_PUBLIC_DOMAIN ?? "presentail.com").replace(/\/$/, "");
  const verifyUrl = `https://${domain}/verify-email?token=${token}`;
  const from =
    process.env.EMAIL_FROM ?? process.env.SMTP_USER ?? "no-reply@presentail.com"; // i18n-ignore

  import("nodemailer")
    .then(({ createTransport }) => {
      const transport = createTransport({
        host: smtpHost,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
          : undefined,
      });
      return transport.sendMail({
        from,
        to: email,
        subject: "Verify your Presentail account", // i18n-ignore
        text: `Please verify your email address by visiting:\n${verifyUrl}\n\nThis link expires in 24 hours.`, // i18n-ignore
        html: `<p>Please <a href="${verifyUrl}">verify your email address</a>.</p><p>This link expires in 24 hours.</p>`, // i18n-ignore
      });
    })
    .catch((err: any) => {
      log?.warn?.(
        { err: err?.message, email },
        "auth.register: verification email send failed (non-fatal)",
      );
    });
}

// ── Register: create a local customer (or WooCommerce customer for legacy) ───
// When WC_AUTH_ENABLED=false (default), registration creates a row in the local
// `customers` table directly, propagates to Clerk, and returns a server-issued
// JWT — no WooCommerce round-trip needed.
// When WC_AUTH_ENABLED=true (transition window), the legacy WC path runs as before.
router.post("/auth/register", registerIpLimiter, async (req, res) => {
  const { email, password, firstName, lastName, phone } = req.body as {
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  };
  if (!email || !password) {
    return res.status(400).json({ ok: false, code: "missing_credentials", message: "Email and password are required" }); // i18n-ignore
  }
  if (!EMAIL_RE.test(email.trim().toLowerCase())) {
    return res.status(400).json({ ok: false, code: "invalid_email", message: "A valid email address is required" }); // i18n-ignore
  }
  if (password.length < 8) {
    return res.status(400).json({ ok: false, code: "password_too_short", message: "Password must be at least 8 characters" }); // i18n-ignore
  }

  // ── Local-only registration (WC_AUTH_ENABLED=false) ──────────────────────
  if (!isWcAuthEnabled()) {
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const existing = await db
        .select({ id: customersTable.id })
        .from(customersTable)
        .where(eq(customersTable.email, normalizedEmail))
        .limit(1);
      if (existing.length > 0) {
        // Use a generic 400 (not 409) and a non-revealing message so callers
        // cannot distinguish "email already taken" from other registration
        // failures — 409 "Conflict" is an account-existence oracle.
        return res.status(400).json({
          ok: false,
          code: "registration_failed",
          message: "Registration failed.", // i18n-ignore
        });
      }

      // Phone pre-check: if the submitted phone already belongs to a DIFFERENT
      // customer, reject now before upsertCustomer() runs.  upsertCustomer() has
      // a phone-fallback (step 3) that would bind the new email to the existing
      // customer row — an account-takeover vector identical to the OTP path.
      if (phone) {
  const normalizedPhone = phone.trim();
        if (normalizedPhone) {
          const phoneConflict = await db
            .select({ id: customersTable.id, email: customersTable.email })
            .from(customersTable)
            .where(eq(customersTable.phoneE164, normalizedPhone))
            .limit(1);
          if (phoneConflict.length > 0 && phoneConflict[0].email !== normalizedEmail) {
            req.log?.warn?.({ customerId: phoneConflict[0].id }, "auth.register: phone already belongs to another account"); // i18n-ignore
            return res.status(400).json({
              ok: false,
              code: "registration_failed",
              message: "Registration failed.", // i18n-ignore
            });
          }
        }
      }

      // Hash the password before storing using scrypt (Node.js built-in).
      const hashedPw = await hashPassword(password);

      const { customer } = await upsertCustomer({
        email: normalizedEmail,
        firstName: firstName?.trim() ?? "",
        lastName: lastName?.trim() ?? "",
        phone: normalizedPhone,
        authProvider: null,
        authUserId: null,
        source: "presentail.com",
        preferredLang: langFromRequest(req),
        // Phone OTP verifies phone ownership, not the email address. Mark
        // email as unverified so the order-history guard still applies.
        emailVerified: false,
      });

      // Defense-in-depth: verify upsertCustomer returned the correct row.
      // If the email doesn't match (e.g. phone fallback unexpectedly resolved
      // to a different row), abort before issuing a token.
      if (customer.email !== normalizedEmail) {
        req.log?.warn?.({ customerId: customer.id, expectedEmail: normalizedEmail }, "auth.register: post-upsert email mismatch guard triggered"); // i18n-ignore
        return res.status(500).json({ ok: false, code: "server_error", message: "Registration failed." }); // i18n-ignore
      }

      // Generate a secure email verification token and persist it.
      // Also persist the password hash in the same update.
    const verificationToken = randomBytes(32).toString("hex");
    const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await db
        .update(customersTable)
        .set({
          passwordHash: hashedPw,
          emailVerificationToken: verificationToken,
          emailVerificationTokenExpiresAt: tokenExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(customersTable.id, customer.id));

      // Best-effort: send verification email if SMTP is configured.
      sendEmailVerification({ email: normalizedEmail, token: verificationToken, log: req.log });

      // Best-effort Clerk propagation (so web sign-in can find the new shopper).
      if (isClerkConfigured()) {
        ensureClerkUserInBackground({
          email: normalizedEmail,
          firstName: firstName?.trim() ?? null,
          lastName: lastName?.trim() ?? null,
          localCustomerId: customer.id,
          log: req.log,
        });
      }

      const store = resolveStoreFromRequest(req);
    let token: string | null = null;

      res.json({
        ok: true,
        token,
        user: {
          id: customer.id,
          email: customer.email,
          firstName: customer.firstName ?? "",
          lastName: customer.lastName ?? "",
          username: "",
          phone: customer.phoneE164 ?? normalizedPhone,
          gender: null,
          birthday: null,
        },
      });
    } catch (e: any) {
      res.status(500).json({ ok: false, code: "server_error", message: e?.message ?? "Registration failed" }); // i18n-ignore
    }
    return;
  }

  // ── Legacy WC OTP registration (WC_AUTH_ENABLED=true) ───────────────────
  if (!process.env.WC_CONSUMER_KEY) {
    res.status(503).json({ ok: false, code: "service_unavailable", message: "Registration unavailable" }); // i18n-ignore
    return;
  }

  try {
    const r = await wcFetch("/customers", {
      method: "POST",
      body: JSON.stringify({
        email: email.trim(),
        password,
        first_name: firstName?.trim() ?? "",
        last_name: lastName?.trim() ?? "",
        billing: { phone: normalizedPhone },
      }),
    }, req);

    const data = (await r.json().catch(() => ({}))) as any;
    if (!r.ok) {
      res.status(r.status).json({
        ok: false,
        code: "registration_failed",
        message: data?.message?.replace(/<[^>]*>/g, "") ?? "Registration failed", // i18n-ignore
      });
      return;
    }

    let token: string | null = null;
    try {
      const tokenRes = await wpFetch(`/jwt-auth/v1/token`, {
        method: "POST",
        body: JSON.stringify({ username: email.trim(), password }),
      }, req);
      const tokenData = (await tokenRes.json().catch(() => ({}))) as any;
      if (tokenRes.ok && tokenData?.token) token = tokenData.token;
    } catch {
      // ignore - user can log in manually
    }

    const mapped = mapCustomer(data);
    if (mapped.id) {
      const wcEmail = (mapped.email ?? "").trim().toLowerCase();
      if (wcEmail) {
        // AWAIT the unverified pre-create so the row exists with
        // emailVerified=false BEFORE mirrorAndPropagateToClerk runs. If the
        // mirror won the race and created a verified row first, the unverified
        // guard would be silently bypassed.
        // buildPatch never downgrades emailVerified (only upgrades false→true
        // when input.emailVerified===true), so the subsequent background mirror
        // upsert — which omits emailVerified — cannot change the flag.
        try {
          const { customer: unverifiedCustomer } = await upsertCustomer({
            email: wcEmail,
            firstName: mapped.firstName ?? "",
            lastName: mapped.lastName ?? "",
            phone: mapped.phone ?? undefined,
            authProvider: null,
            authUserId: null,
            source: "presentail.com",
            preferredLang: langFromRequest(req),
            emailVerified: false,
          });
          // Persist verification token and fire email (non-blocking — does not
          // hold up the registration response).
    const verificationToken = randomBytes(32).toString("hex");
          void db
            .update(customersTable)
            .set({
              emailVerificationToken: verificationToken,
              emailVerificationTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(customersTable.id, unverifiedCustomer.id),
                isNull(customersTable.emailVerificationToken),
              ),
            )
            .then(() => {
              sendEmailVerification({ email: wcEmail, token: verificationToken, log: req.log });
            })
            .catch((err: any) => {
              req.log?.warn?.(
                { err: err?.message, email: wcEmail },
                "auth.register.wc: verification token persist failed (non-fatal)",
              );
            });
        } catch (err: any) {
          req.log?.warn?.(
            { err: err?.message, email: wcEmail },
            "auth.register.wc: pre-verification upsert failed (non-fatal)",
          );
        }
      }

      // Mirror to local DB AND propagate to Clerk (best-effort, non-blocking).
      // The unverified row is guaranteed to exist by this point, so the mirror
      // upsert finds it via email and buildPatch leaves emailVerified untouched.
      mirrorAndPropagateToClerk(
        mapped.id,
        {
          email: mapped.email,
          firstName: mapped.firstName,
          lastName: mapped.lastName,
          phone: mapped.phone,
          provider: "password",
          preferredLang: langFromRequest(req),
        },
        req.log,
      );
    }
    return res.json({ ok: true, token, user: mapped, emailVerificationRequired: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, code: "server_error", message: e?.message ?? "Registration failed" }); // i18n-ignore
  }
});

// ── Email verification: confirm ownership of a registered email ───────────────
// The verification link emailed during local registration points here.
// A successful call marks the customer row as emailVerified=true and clears
// the one-time token so the link cannot be replayed.
router.get("/auth/verify-email", async (req, res) => {
    let token: string | null = null;
  if (!token || typeof token !== "string" || !token.match(/^[0-9a-f]{64}$/)) {
    res.status(400).json({ ok: false, code: "invalid_token", message: "Invalid verification link" }); // i18n-ignore
    return;
  }
  try {
  const now = new Date();
    const [row] = await db
      .select({ id: customersTable.id, email: customersTable.email, emailVerified: customersTable.emailVerified })
      .from(customersTable)
      .where(eq(customersTable.id, localId))
      .limit(1);

    if (!row) {
      res.status(400).json({ ok: false, code: "invalid_token", message: "Invalid or already-used verification link" }); // i18n-ignore
      return;
    }
    if (!row.expiresAt || row.expiresAt < now) {
      res.status(400).json({ ok: false, code: "token_expired", message: "Verification link has expired. Please request a new one." }); // i18n-ignore
      return;
    }

    await db
      .update(customersTable)
      .set({
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationTokenExpiresAt: null,
        updatedAt: now,
      })
      .where(eq(customersTable.id, row.id));

    // Back-fill any guest orders placed with this email before the account
    // was verified.  Non-fatal: errors are swallowed so they never block the
    // verification response.
    if (row.email) {
      reconcileGuestOrders(row.id, row.email, req.log).catch(() => {});
    }

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, code: "server_error", message: e?.message ?? "Verification failed" }); // i18n-ignore
  }
});

// ── Resend email verification ─────────────────────────────────────────────────
// Lets the client prompt a fresh verification email for the signed-in user
// when the previous link expired or was never received.
router.post("/auth/resend-verification", registerIpLimiter, async (req, res) => {
  const auth = await authenticate(req.header("authorization"), req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, message: auth.message });
    return;
  }

  // ── Local-only account deletion (WC_AUTH_ENABLED=false) ─────────────────
  // Anonymise the local row and best-effort delete from Clerk. No WC calls.
  if (!isWcAuthEnabled() || auth.localCustomerId) {
    const localId = auth.localCustomerId ?? auth.customerId;
  try {
    const [row] = await db
      .select({ id: customersTable.id, email: customersTable.email, emailVerified: customersTable.emailVerified })
      .from(customersTable)
      .where(eq(customersTable.id, localId))
      .limit(1);
    if (!row) {
      res.status(404).json({ ok: false, message: "Account not found" }); // i18n-ignore
      return;
    }
    if (row.emailVerified) {
      res.json({ ok: true, alreadyVerified: true });
      return;
    }
    const verificationToken = randomBytes(32).toString("hex");
    const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db
      .update(customersTable)
      .set({ emailVerificationToken: verificationToken, emailVerificationTokenExpiresAt: tokenExpiresAt, updatedAt: new Date() })
      .where(eq(customersTable.id, row.id));
    sendEmailVerification({ email: row.email, token: verificationToken, log: req.log });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, message: e?.message ?? "Resend failed" }); // i18n-ignore
  }
});

// ── Get current user (auth via Bearer JWT, validated against WP) ─────────────
router.get("/auth/me", requireUserType(["customer", "team"]), async (req, res) => {
  // Team users have no WooCommerce account. When the Clerk session already
  // tells us the user is "team", build the profile from their local customers
  // row (upserted on first visit) and skip the WC lookup entirely.
  const clerkSession = getAuth(req);
  const clerkUserId = clerkSession?.userId;
  const sessionUserType = (clerkSession?.sessionClaims as any)
    ?.publicMetadata?.userType;
  if (clerkUserId && sessionUserType === "team") {
    try {
      const claims = clerkSession?.sessionClaims as any;
  const email = String(payload.email ?? "").trim().toLowerCase();
      let firstName: string = claims?.first_name ?? "";
      let lastName: string = claims?.last_name ?? "";

      // Fall back to a live Clerk API call only when the JWT claims are absent.
      if (!email) {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (secretKey) {
      try {
        const clerk = createClerkClient({ secretKey: clerkSecretKey });
        const clerkUser = await clerk.users.getUser(clerkPutUserId);
        email =
          clerkUser.emailAddresses.find(
            (e) => e.id === clerkUser.primaryEmailAddressId,
          )?.emailAddress ??
          clerkUser.emailAddresses[0]?.emailAddress ??
          null;
        firstName = clerkUser.firstName ?? "";
        lastName = clerkUser.lastName ?? "";
      }

      if (!email) {
        res.status(401).json({ ok: false, message: "Clerk user has no email" }); // i18n-ignore
        return;
      }
      const { customer: local } = await upsertCustomer({
        email,
        firstName,
        lastName,
        authProvider: "clerk",
        authUserId: clerkUserId,
        emailVerified: true,
      });
      res.json({
        ok: true,
        user: {
          id: local.id,
          email: local.email,
          firstName: local.firstName ?? "",
          lastName: local.lastName ?? "",
          username: "",
          phone: local.phoneE164 ?? "",
          gender: local.gender ?? null,
          birthday: local.birthday ?? null,
          birthdayShareMonthDay: local.birthdayShareMonthDay ?? true,
        },
      });
    } catch (e: any) {
      res.status(500).json({ ok: false, message: e?.message ?? "Failed" });
    }
    return;
  }

  const auth = await authenticate(req.header("authorization"), req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, message: auth.message });
    return;
  }
  // Resolution order:
  //   1. auth.localCustomerId (set by verifyServerToken for local-only JWTs)
  //   2. getCustomerById(auth.customerId) when WC auth is disabled
  //   3. getCustomerByWcId(auth.customerId) during the transition window
  //   4. WC REST fallback (WC_AUTH_ENABLED=true only)
  try {
    // Try local customer by the explicit localCustomerId claim first.
    const localById = auth.localCustomerId
      ? await getCustomerById(auth.localCustomerId)
      : !isWcAuthEnabled()
        ? await getCustomerById(auth.customerId)
        : null;

    if (localById) {
      // `requiresPasswordReset` is true when the row was imported from WC
      // without a Clerk/social auth link — the user needs to go through the
      // Clerk "forgot password" flow to set credentials.
      const requiresPasswordReset =
        localById.authProvider === null && localById.authUserId === null;
      res.json({
        ok: true,
        user: {
          id: localById.id,
          email: localById.email,
          firstName: localById.firstName ?? "",
          lastName: localById.lastName ?? "",
          username: "",
          phone: localById.phoneE164 ?? "",
          gender: localById.gender ?? null,
          birthday: localById.birthday ?? null,
          birthdayShareMonthDay: localById.birthdayShareMonthDay ?? true,
          requiresPasswordReset,
        },
      });
      return;
    }

    // Fallback for WC-linked sessions (WC_AUTH_ENABLED=true transition window).
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
        },
      });
      return;
    }

    // Final fallback: WC REST (only attempted when WC auth is enabled).
    if (!isWcAuthEnabled()) {
      res.status(404).json({ ok: false, message: "Account not found." }); // i18n-ignore
      return;
    }
    const r = await wcFetch("/customers", {
      method: "POST",
      body: JSON.stringify({
        email: email.trim(),
        password,
        first_name: firstName?.trim() ?? "",
        last_name: lastName?.trim() ?? "",
        billing: { phone: normalizedPhone },
      }),
    }, req);
    const data = (await r.json().catch(() => ({}))) as any;
    if (!r.ok) {
      res.status(r.status).json({ ok: false, message: data?.message ?? "Not found" }); // i18n-ignore
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

router.put("/auth/me", requireUserType(["customer", "team"]), async (req, res) => {
  // Team users: update the local customers row directly, skip WC mirror.
  const clerkSession = getAuth(req);
  const clerkPutUserId = clerkSession?.userId;
  const sessionPutUserType = (clerkSession?.sessionClaims as any)
    ?.publicMetadata?.userType;
  if (clerkPutUserId && sessionPutUserType === "team") {
  const body = `Presentail: Your verification code is ${code}. It expires in 10 minutes.`; // i18n-ignore
    let validatedTeamPhone: string | undefined;
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
      validatedTeamPhone = phoneCheck.normalized;
    }
    let normalizedTeamGender: string | null | undefined;
    if (body.gender !== undefined) {
      if (body.gender === null || body.gender === "") {
        normalizedTeamGender = null;
      } else if (
        typeof body.gender === "string" &&
        (CUSTOMER_GENDERS as readonly string[]).includes(body.gender)
      ) {
        normalizedTeamGender = body.gender;
      }
    }
    let normalizedTeamBirthday: string | null | undefined;
    if (body.birthday !== undefined) {
    const parsed = parseBirthday(body.birthday);
      if (!parsed.ok) {
        res.status(400).json({ ok: false, message: "Invalid birthday" }); // i18n-ignore
        return;
      }
      normalizedTeamBirthday = parsed.value;
    }
    try {
      const putClaims = clerkSession?.sessionClaims as any;
      let putEmail: string | null = putClaims?.email ?? null;

      // Fall back to a live Clerk API call only when the JWT claims are absent.
      if (!putEmail) {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (secretKey) {
      try {
        const clerk = createClerkClient({ secretKey: clerkSecretKey });
        const clerkUser = await clerk.users.getUser(clerkPutUserId);
        putEmail =
          clerkUser.emailAddresses.find(
            (e) => e.id === clerkUser.primaryEmailAddressId,
          )?.emailAddress ??
          clerkUser.emailAddresses[0]?.emailAddress ??
          null;
      }

      if (!putEmail) {
        res.status(401).json({ ok: false, message: "Clerk user has no email" }); // i18n-ignore
        return;
      }
      // Upsert to ensure the row exists, then apply the patch.
      const { customer: existing } = await upsertCustomer({
        email: putEmail,
        authProvider: "clerk",
        authUserId: clerkPutUserId,
      });
      const patch: Partial<typeof customersTable.$inferInsert> = {};
      if (typeof body.firstName === "string") patch.firstName = body.firstName.trim();
      if (typeof body.lastName === "string") patch.lastName = body.lastName.trim();
      if (validatedTeamPhone !== undefined) {
        patch.phoneE164 = validatedTeamPhone ? normalizePhoneE164(validatedTeamPhone) : null;
      }
      if (normalizedTeamGender !== undefined) patch.gender = normalizedTeamGender;
      if (normalizedTeamBirthday !== undefined) patch.birthday = normalizedTeamBirthday;
    const local = await getCustomerByWcId(auth.customerId);
      if (Object.keys(patch).length > 0) {
        const [updated] = await db
          .update(customersTable)
          .set({ ...customerPatch, updatedAt: new Date() })
          .where(eq(customersTable.id, existingCustomer.id))
          .returning();
        local = updated;
      }
      res.json({
        ok: true,
        user: {
          id: local.id,
          email: local.email,
          firstName: local.firstName ?? "",
          lastName: local.lastName ?? "",
          username: "",
          phone: local.phoneE164 ?? "",
          gender: local.gender ?? null,
          birthday: local.birthday ?? null,
        },
      });
    } catch (e: any) {
      res.status(500).json({ ok: false, message: e?.message ?? "Failed" });
    }
    return;
  }

  // Clerk customer path: fires for non-team Clerk sessions (i.e., regular web
  // shoppers using cookie-based auth). Mirrors the team block above but also
  // performs a best-effort WC mirror so the WooCommerce billing record stays
  // in sync — same as the legacy JWT path below.
  if (clerkPutUserId) {
  const body = `Presentail: Your verification code is ${code}. It expires in 10 minutes.`; // i18n-ignore
    let validatedCustomerPhone: string | undefined;
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
      validatedCustomerPhone = phoneCheck.normalized;
    }
    let normalizedCustomerGender: string | null | undefined;
    if (body.gender !== undefined) {
      if (body.gender === null || body.gender === "") {
        normalizedCustomerGender = null;
      } else if (
        typeof body.gender === "string" &&
        (CUSTOMER_GENDERS as readonly string[]).includes(body.gender)
      ) {
        normalizedCustomerGender = body.gender;
      }
    }
    let normalizedCustomerBirthday: string | null | undefined;
    if (body.birthday !== undefined) {
    const parsed = parseBirthday(body.birthday);
      if (!parsed.ok) {
        res.status(400).json({ ok: false, message: "Invalid birthday" }); // i18n-ignore
        return;
      }
      normalizedCustomerBirthday = parsed.value;
    }
    try {
      const customerClaims = clerkSession?.sessionClaims as any;
      let customerEmail: string | null = customerClaims?.email ?? null;

      if (!customerEmail) {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (secretKey) {
      try {
        const clerk = createClerkClient({ secretKey: clerkSecretKey });
        const clerkUser = await clerk.users.getUser(clerkPutUserId);
        customerEmail =
          clerkUser.emailAddresses.find(
            (e) => e.id === clerkUser.primaryEmailAddressId,
          )?.emailAddress ??
          clerkUser.emailAddresses[0]?.emailAddress ??
          null;
      }

      if (!customerEmail) {
        res.status(401).json({ ok: false, message: "Clerk user has no email" }); // i18n-ignore
        return;
      }

      const { customer: existingCustomer } = await upsertCustomer({
        email: customerEmail,
        authProvider: "clerk",
        authUserId: clerkPutUserId,
      });

      const customerPatch: Partial<typeof customersTable.$inferInsert> = {};
      if (typeof body.firstName === "string") customerPatch.firstName = body.firstName.trim();
      if (typeof body.lastName === "string") customerPatch.lastName = body.lastName.trim();
      if (validatedCustomerPhone !== undefined) {
        customerPatch.phoneE164 = validatedCustomerPhone
          ? normalizePhoneE164(validatedCustomerPhone)
          : null;
      }
      if (normalizedCustomerGender !== undefined) customerPatch.gender = normalizedCustomerGender;
      if (normalizedCustomerBirthday !== undefined) customerPatch.birthday = normalizedCustomerBirthday;

      let localCustomer = existingCustomer;
      if (Object.keys(customerPatch).length > 0) {
        const [updated] = await db
          .update(customersTable)
          .set({ ...customerPatch, updatedAt: new Date() })
          .where(eq(customersTable.id, existingCustomer.id))
          .returning();
        localCustomer = updated;
      }

      // Best-effort Clerk name sync (fire-and-forget). Phone is intentionally
      // excluded — Clerk requires OTP verification for phone number changes.
      const clerkNamePatch: { firstName?: string; lastName?: string } = {};
      if (typeof body.firstName === "string") clerkNamePatch.firstName = body.firstName.trim();
      if (typeof body.lastName === "string") clerkNamePatch.lastName = body.lastName.trim();
      if (Object.keys(clerkNamePatch).length > 0) {
      const clerkSecretKey = process.env.CLERK_SECRET_KEY;
        if (clerkSecretKey) {
          createClerkClient({ secretKey: clerkSecretKey })
            .users.updateUser(clerkPutUserId, clerkNamePatch)
            .catch((err: any) => {
              req.log?.warn?.(
                { err: err?.message, clerkUserId: clerkPutUserId },
                "auth.me.put (clerk-customer): Clerk name sync threw (non-fatal)",
              );
            });
        }
      }

      // Best-effort WC mirror (fire-and-forget). Only attempted when the local
      // row has a known WC customer ID so we don't create stray WC records.
      if (existingCustomer.wcCustomerId) {
        const wcMirrorPayload: Record<string, unknown> = {};
        if (typeof body.firstName === "string") wcMirrorPayload.first_name = body.firstName;
        if (typeof body.lastName === "string") wcMirrorPayload.last_name = body.lastName;
        if (validatedCustomerPhone !== undefined) {
          wcMirrorPayload.billing = { phone: validatedCustomerPhone };
        }
        const wcMeta: { key: string; value: string }[] = [];
        if (normalizedCustomerGender !== undefined) {
          wcMeta.push({ key: "presentail_gender", value: normalizedCustomerGender ?? "" });
        }
        if (normalizedCustomerBirthday !== undefined) {
          wcMeta.push({ key: "presentail_birthday", value: normalizedCustomerBirthday ?? "" });
        }
        if (wcMeta.length > 0) wcMirrorPayload.meta_data = wcMeta;
        if (Object.keys(wcMirrorPayload).length > 0) {
          wcFetch(
            `/customers/${existingCustomer.wcCustomerId}`,
            { method: "PUT", body: JSON.stringify(wcMirrorPayload) },
            req,
          ).catch((err: any) => {
            req.log?.warn?.(
              { err: err?.message, wcCustomerId: existingCustomer.wcCustomerId },
              "auth.me.put (clerk-customer): WC mirror threw (non-fatal)",
            );
          });
        }
      }

      res.json({
        ok: true,
        user: {
          id: localCustomer.id,
          email: localCustomer.email,
          firstName: localCustomer.firstName ?? "",
          lastName: localCustomer.lastName ?? "",
          username: "",
          phone: localCustomer.phoneE164 ?? "",
          gender: localCustomer.gender ?? null,
          birthday: localCustomer.birthday ?? null,
        },
      });
    } catch (e: any) {
      res.status(500).json({ ok: false, message: e?.message ?? "Failed" });
    }
    return;
  }

  const auth = await authenticate(req.header("authorization"), req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, message: auth.message });
    return;
  }
  const body = `Presentail: Your verification code is ${code}. It expires in 10 minutes.`; // i18n-ignore

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
      res.status(400).json({ ok: false, message: "Invalid birthday" }); // i18n-ignore
      return;
    }
    normalizedBirthday = parsed.value;
  }

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
    if (Object.keys(localPatch).length > 0) {
      // For local-only customers, auth.localCustomerId or auth.customerId IS
      // the customers.id. For legacy WC sessions, match by wcCustomerId.
      const whereClause = auth.localCustomerId
        ? eq(customersTable.id, auth.localCustomerId)
        : !isWcAuthEnabled()
          ? eq(customersTable.id, auth.customerId)
          : eq(customersTable.wcCustomerId, auth.customerId);
      await db
        .update(customersTable)
        .set({ ...localPatch, updatedAt: new Date() })
        .where(whereClause);
      localPatchApplied = true;
    }
  } catch (err: any) {
    req.log?.warn?.(
      { err: err?.message, customerId: auth.customerId },
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
  if (metaUpdates.length > 0) wcPayload.meta_data = metaUpdates;

    const mapped = mapCustomer(data);
  try {
    const r = await wcFetch("/customers", {
      method: "POST",
      body: JSON.stringify({
        email: email.trim(),
        password,
        first_name: firstName?.trim() ?? "",
        last_name: lastName?.trim() ?? "",
        billing: { phone: normalizedPhone },
      }),
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

  // Best-effort Clerk name sync (fire-and-forget). Legacy JWT sessions
  // don't carry a Clerk user id, so we look the user up by email.
  // Phone is intentionally excluded — Clerk requires OTP verification.
  const jwtClerkNamePatch: { firstName?: string; lastName?: string } = {};
  if (typeof body.firstName === "string") jwtClerkNamePatch.firstName = body.firstName.trim();
  if (typeof body.lastName === "string") jwtClerkNamePatch.lastName = body.lastName.trim();
  if (Object.keys(jwtClerkNamePatch).length > 0) {
    const jwtClerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (jwtClerkSecretKey) {
      (async () => {
        try {
          const localForClerk = await getCustomerByWcId(auth.customerId);
          if (!localForClerk?.email) return;
          const clerkClientJwt = createClerkClient({ secretKey: jwtClerkSecretKey });
        const { data: clerkUsers } = await (createClerkClient({ secretKey: clerkSecretKey })
          .users.getUserList({ emailAddress: [tombstoneEmail] })
          .catch(() => ({ data: [] })));
          if (clerkUsers.length === 0) return;
          await clerkClientJwt.users.updateUser(clerkUsers[0].id, jwtClerkNamePatch);
        } catch (err: any) {
          req.log?.warn?.(
            { err: err?.message, wcCustomerId: auth.customerId },
            "auth.me.put (legacy-jwt): Clerk name sync threw (non-fatal)",
          );
        }
      })();
    }
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
    res.status(500).json({ ok: false, message: "Update failed" }); // i18n-ignore
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
router.delete("/auth/me", requireUserType(["customer", "team"]), async (req, res) => {
  // Team accounts are managed in Clerk/Presentail OS — account deletion is
  // not available to team users on the storefront.
  //
  // We resolve the effective role via a live Clerk lookup (not just session
  // claims) so that stale JWTs cannot bypass the block. requireUserType may
  // have admitted the request by fetching the live user when claims were
  // absent; the same live fetch here ensures we always catch team members.
  const clerkSession = getAuth(req);
  const clerkDelUserId = clerkSession?.userId;
  if (clerkDelUserId) {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (secretKey) {
      try {
        const clerk = createClerkClient({ secretKey: clerkSecretKey });
        const liveUser = await clerk.users.getUser(clerkDelUserId);
        const liveUserType = (liveUser.publicMetadata as { userType?: unknown })?.userType;
        if (liveUserType === "team") {
          res.status(403).json({
            ok: false,
            message: "Team accounts cannot be deleted through the storefront.", // i18n-ignore
          });
          return;
        }
      } catch (err: any) {
        // If the Clerk lookup fails we must fail closed — do not proceed with
        // deletion when we cannot confirm the user is a customer.
        req.log?.error?.(
          { err: err?.message, userId: clerkDelUserId },
          "auth.delete: Clerk role lookup failed; blocking request",
        );
        res.status(502).json({
          ok: false,
          message: "Could not verify account type. Please try again.", // i18n-ignore
        });
        return;
      }
    }
  }

  const auth = await authenticate(req.header("authorization"), req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, message: auth.message });
    return;
  }

  // ── Local-only account deletion (WC_AUTH_ENABLED=false) ─────────────────
  // Anonymise the local row and best-effort delete from Clerk. No WC calls.
  if (!isWcAuthEnabled() || auth.localCustomerId) {
    const localId = auth.localCustomerId ?? auth.customerId;
    const tombstoneEmail = `deleted-${localId}-${Date.now()}@deleted.local`;
    try {
      // Read the Clerk user id BEFORE we wipe authUserId from the row so
      // we can look up and delete the Clerk account by userId directly.
      const [preDeletion] = await db
        .select({ authProvider: customersTable.authProvider, authUserId: customersTable.authUserId })
        .from(customersTable)
        .where(eq(customersTable.id, localId))
        .limit(1);
      const savedClerkUserId =
        preDeletion?.authProvider === "clerk" ? (preDeletion.authUserId ?? null) : null;

      await db
        .update(customersTable)
        .set({
          email: tombstoneEmail,
          firstName: "",
          lastName: "",
          phoneE164: null,
          gender: null,
          birthday: null,
          authProvider: null,
          authUserId: null,
          emailVerified: false,
          emailVerificationToken: null,
          emailVerificationTokenExpiresAt: null,
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(customersTable.id, localId));

      // Best-effort Clerk deletion — look up by userId (externalId in Clerk
      // terminology) which we saved before anonymising the row. This fixes
      // the previous bug where the lookup used the tombstone email (which
      // doesn't exist in Clerk yet) and always missed.
      const clerkSecretKey = process.env.CLERK_SECRET_KEY;
      if (clerkSecretKey && savedClerkUserId) {
        const clerk = createClerkClient({ secretKey: clerkSecretKey });
        await clerk.users.deleteUser(savedClerkUserId).catch((e: any) => {
          req.log?.warn?.({ err: e?.message, clerkUserId: savedClerkUserId }, "auth.delete: Clerk user delete failed (non-fatal)");
        });
      } else if (clerkSecretKey && !savedClerkUserId) {
        // Fallback: try to find by original email via the auth header claims.
        // Only needed for accounts where authProvider != "clerk" but a Clerk
        // user still exists (e.g. Clerk was provisioned for a WC account).
        const { data: clerkUsers } = await (createClerkClient({ secretKey: clerkSecretKey })
          .users.getUserList({ emailAddress: [tombstoneEmail] })
          .catch(() => ({ data: [] })));
        for (const u of clerkUsers) {
          await createClerkClient({ secretKey: clerkSecretKey }).users.deleteUser(u.id).catch((e: any) => {
            req.log?.warn?.({ err: e?.message, clerkUserId: u.id }, "auth.delete: Clerk user delete failed (non-fatal)");
          });
        }
      }

      res.json({ ok: true });
    } catch (e: any) {
      req.log?.error?.({ err: e?.message }, "auth.delete: local anonymise error");
      res.status(500).json({ ok: false, message: e?.message ?? "Delete failed" }); // i18n-ignore
    }
    return;
  }

  // ── Legacy WC account deletion (WC_AUTH_ENABLED=true) ───────────────────
  const id = auth.customerId;
  const tombstoneEmailLegacy = `deleted-${id}-${Date.now()}@deleted.local`;
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
    email: tombstoneEmailLegacy,
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
        email: tombstoneEmailLegacy,
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
    const data = (await r.json().catch(() => ({}))) as any;
      // Even if the DELETE call fails, we've already wiped PII above, so
      // the account is functionally deleted from the user's perspective.
      req.log?.warn?.({ status: delRes.status, message: data?.message }, "auth.delete: WC delete failed but anonymised");
    }

    // Also mark the local customers row (if any) as deleted so that legacy
    // WP JWTs that reference this WC customer ID are rejected on the next
    // request (session revocation for the WC auth path).
    await db
      .update(customersTable)
      .set({
        deletedAt: new Date(),
        emailVerified: false,
        emailVerificationToken: null,
        emailVerificationTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(customersTable.wcCustomerId, id),
          isNotNull(customersTable.wcCustomerId),
        ),
      );

    res.json({ ok: true });
  } catch (e: any) {
    req.log?.error?.({ err: e?.message }, "auth.delete: unexpected error");
    res.status(500).json({ ok: false, message: e?.message ?? "Delete failed" }); // i18n-ignore
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

// Startup guard: warn when APPLE_CLIENT_IDS is absent so ops know the mobile
// Apple sign-in audience check is using hardcoded defaults rather than an
// explicit configuration. Mirror of the 503 guard on /auth/oauth/apple for
// the web flow.
if (!envList("APPLE_CLIENT_IDS").length) {
  logger.warn(
    "APPLE_CLIENT_IDS is not set — /auth/social/apple will accept the hardcoded default audiences [\"presentail\", \"com.presentail.lb\"]. Set APPLE_CLIENT_IDS=presentail to make this explicit.", // i18n-ignore
  );
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
    const msg = data?.message?.replace(/<[^>]*>/g, "") ?? "Could not create account"; // i18n-ignore
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
  profile: { email: string; firstName: string; lastName: string; appleSub?: string | null },
) {
  const store = resolveStoreFromRequest(req);

  // ── Local-only social session (WC_AUTH_ENABLED=false) ───────────────────
  // Upsert a local customer row directly — no WC round-trip. Propagate to
  // Clerk best-effort so the web sign-in email-lookup flow can find the user.
  if (!isWcAuthEnabled()) {
    try {
      const { customer } = await upsertCustomer({
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        authProvider: provider,
        authUserId: profile.email,
        appleSub: profile.appleSub ?? null,
        source: "presentail.com",
        preferredLang: langFromRequest(req),
        // Apple and Google verify the email themselves.
        emailVerified: true,
      });

      if (isClerkConfigured()) {
        ensureClerkUserInBackground({
          email: profile.email,
          firstName: profile.firstName || null,
          lastName: profile.lastName || null,
          localCustomerId: customer.id,
          log: req.log,
        });
      }

      const token = await signServerToken({
        customerId: customer.id,
        email: customer.email,
        provider,
        storeBaseUrl: store.baseUrl,
        localCustomerId: customer.id,
        localCustomer: true,
      });

      return res.json({
        ok: true,
        token,
        user: {
          id: customer.id,
          email: customer.email,
          firstName: customer.firstName ?? "",
          lastName: customer.lastName ?? "",
          username: "",
          phone: customer.phoneE164 ?? "",
          gender: customer.gender ?? null,
          birthday: customer.birthday ?? null,
        },
      });
    } catch (e: any) {
      req.log?.warn?.({ err: e?.message, provider }, "auth.social: local customer upsert failed");
      return res
        .status(500)
        .json({ ok: false, code: "server_error", message: e?.message ?? "Sign-in failed" }); // i18n-ignore
    }
  }

  // ── Legacy WC social session (WC_AUTH_ENABLED=true) ──────────────────────
  if (!store.consumerKey) {
    return res
      .status(503)
      .json({ ok: false, code: "service_unavailable", message: "Sign-in is not available right now." }); // i18n-ignore
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
        preferredLang: langFromRequest(req),
        appleSub: profile.appleSub ?? null,
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
      .json({ ok: false, code: "server_error", message: e?.message ?? "Sign-in failed" }); // i18n-ignore
  }
}

// ── Password reset ───────────────────────────────────────────────────────────
// Two paths depending on WC_AUTH_ENABLED:
//
//  Local-only (WC_AUTH_ENABLED=false, the default):
//    POST /auth/reset/request — generates a one-time token stored in
//      customers.password_reset_token (expires 1 h) and sends it by email.
//      The email link uses ?key=<token>&login=<email> (same as WP shape) so
//      the existing mobile +native-intent.tsx handler works unchanged.
//    POST /auth/reset/confirm — accepts { key, login, password }; verifies the
//      token+email pair, hashes the new password, writes it, and clears the token.
//
//  WC/WP proxy (WC_AUTH_ENABLED=true, legacy migration window):
//    Both endpoints proxy WordPress's wp-login.php form flow unchanged.

// ── Password reset email helper ──────────────────────────────────────────────
// Sends a one-time reset link to the given email via SMTP (best-effort).
// Mirrors the pattern of sendEmailVerification above.
function sendPasswordResetEmail(opts: {
  email: string;
  token: string;
  log?: { warn?: (...args: any[]) => void };
}): void {
  const smtpHost = process.env.SMTP_HOST;
  if (!smtpHost) return; // SMTP not configured — skip silently.

  const { email, token, log } = opts;
  const domain =
    (process.env.EXPO_PUBLIC_DOMAIN ?? "presentail.com").replace(/\/$/, "");
  // Use the same ?key=...&login=... URL shape as the WP flow so that:
  //   • The mobile +native-intent.tsx handler already intercepts it and routes
  //     to /reset-password?key=...&login=... without any mobile-side changes.
  //   • The web ResetPassword page detects these params and shows the confirm form.
  const resetUrl = `https://${domain}/reset-password?key=${encodeURIComponent(token)}&login=${encodeURIComponent(email)}`;
  const from =
    process.env.EMAIL_FROM ?? process.env.SMTP_USER ?? "no-reply@presentail.com"; // i18n-ignore

  import("nodemailer")
    .then(({ createTransport }) => {
      const transport = createTransport({
        host: smtpHost,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
          : undefined,
      });
      return transport.sendMail({
        from,
        to: email,
        subject: "Reset your Presentail password", // i18n-ignore
        text: `You requested a password reset for your Presentail account.\n\nVisit the link below to set a new password:\n${resetUrl}\n\nThis link expires in 1 hour. If you did not request a reset, you can safely ignore this email.`, // i18n-ignore
        html: `<p>You requested a password reset for your Presentail account.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in 1 hour. If you did not request a reset, you can safely ignore this email.</p>`, // i18n-ignore
      });
    })
    .catch((err: any) => {
      log?.warn?.(
        { err: err?.message, email },
        "auth.reset.request: reset email send failed (non-fatal)",
      );
    });
}

router.post("/auth/reset/request", resetRequestIpLimiter, async (req, res) => {
  const email = String(payload.email ?? "").trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, code: "invalid_email", message: "A valid email is required" }); // i18n-ignore
  }

  // Email-based cap prevents one address from being flooded with reset emails.
  // Record before doing any work — each request would otherwise trigger an
  // email attempt, so we cap at the Express layer unconditionally.
  const emailCheck = resetEmailLimiter.check(email);
  if (!emailCheck.allowed) {
    return res.status(429).json({
      ok: false,
      code: "too_many_requests",
      message: "Too many reset attempts for this email. Please wait before requesting another reset.", // i18n-ignore
    });
  }
  resetEmailLimiter.record(email);

  // ── Local-only path (WC_AUTH_ENABLED=false) ──────────────────────────────
  // Look up the customer, generate a scoped token, store it, and send the
  // reset email.  We always return `ok:true` regardless of whether the email
  // is found — standard "if an account exists you will receive an email"
  // pattern that prevents enumeration of valid addresses.
  if (!isWcAuthEnabled()) {
    try {
      const [customer] = await db
        .select({ id: customersTable.id })
        .from(customersTable)
        .where(
          and(
            eq(customersTable.email, login.toLowerCase().trim()),
            eq(customersTable.passwordResetToken, keyHash),
            gt(customersTable.passwordResetTokenExpiresAt, now),
          ),
        )
        .limit(1);

      if (customer && customer.passwordHash) {
        // Only send a reset email to password-bearing accounts.  Social
        // sign-in accounts (no passwordHash) have nothing to reset and
        // should use their social provider instead.
        //
        // Security: we store only the SHA-256 digest of the raw token so
        // that a database read, backup, or query-log leak does NOT expose a
        // bearer credential that can immediately reset accounts.  The raw
        // token is sent only in the email.
        const rawToken = randomBytes(32).toString("hex");
        const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await db
          .update(customersTable)
          .set({
            passwordResetToken: tokenHash,   // store digest, not raw token
            passwordResetTokenExpiresAt: expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(customersTable.id, customer.id));
        sendPasswordResetEmail({ email, token: rawToken, log: req.log });
      }
      // No `else` branch — return ok:true silently for unknown emails and
      // social-only accounts to prevent enumeration.
    } catch (e: any) {
      req.log?.warn?.({ err: e?.message }, "auth.reset.request: local DB error");
      return res.status(500).json({ ok: false, message: "Reset service unavailable. Please try again later." }); // i18n-ignore
    }
    return res.json({ ok: true });
  }

  // ── WC/WP proxy path (WC_AUTH_ENABLED=true, legacy migration window) ─────
  try {
    const form = new URLSearchParams({
      pass1: password,
      pass2: password,
      "pass1-text": password,
      wp_lang: "",
    });
    const resetStore = resolveStoreFromRequest(req);
    const wpLogin = confirmStore.wpBaseUrl.replace(/\/wp-json$/, "") + "/wp-login.php";
    const r = await wcFetch("/customers", {
      method: "POST",
      body: JSON.stringify({
        email: email.trim(),
        password,
        first_name: firstName?.trim() ?? "",
        last_name: lastName?.trim() ?? "",
        billing: { phone: normalizedPhone },
      }),
    }, req);
    if (r.status >= 500) {
      req.log?.warn?.({ status: r.status }, "auth.reset.request: upstream error");
      return res.status(502).json({ ok: false, message: "Reset service unavailable. Please try again later." }); // i18n-ignore
    }
    const location = r.headers.get("location") ?? "";
    const isRedirect = resetRes.status >= 300 && resetRes.status < 400;
    if (isRedirect && /password=changed|action=login/.test(resetLoc)) {
      return res.json({ ok: true });
    }
    if (isRedirect && /[?&]error=/.test(resetLoc)) {
      return res.status(400).json({
        ok: false,
        code: "expired_link",
        message: "This reset link has expired or is invalid. Please request a new one.", // i18n-ignore
      });
    }
  const body = `Presentail: Your verification code is ${code}. It expires in 10 minutes.`; // i18n-ignore
      if (/login_error|invalid|no.+user|user.+not/i.test(body)) {
        return res.json({ ok: true });
      }
    }
    // Anything else: treat as success rather than leak ambiguous state.
    return res.json({ ok: true });
  } catch (e: any) {
    req.log?.warn?.({ err: e?.message }, "auth.reset.request: failed");
    return res.status(502).json({ ok: false, message: "Reset service unavailable. Please try again later." }); // i18n-ignore
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

  // ── Local-only path (WC_AUTH_ENABLED=false) ──────────────────────────────
  // Accepts { key, login, password } — the same fields the WP flow uses so
  // the existing mobile `completePasswordReset` contract and the mobile
  // +native-intent.tsx deep-link handler work without any changes:
  //   key   = the hex reset token (stored in customers.password_reset_token)
  //   login = the email address (used as an additional identity check)
  if (!isWcAuthEnabled()) {
    if (!key || !login || !password) {
      return res.status(400).json({
        ok: false,
        code: "missing_link",
        message: "Missing reset link details or new password.", // i18n-ignore
      });
    }
    if (password.length < 8) {
      return res.status(400).json({
        ok: false,
        code: "weak_password",
        message: "Password must be at least 8 characters.", // i18n-ignore
      });
    }
    try {
  const now = new Date();
      // Hash the provided key before comparing — the DB stores the SHA-256
      // digest of the raw token, not the raw token itself, so a database read
      // cannot be used to derive a bearer token.
      const keyHash = createHash("sha256").update(key).digest("hex");
      // Match by hash AND email so the token cannot be used for a different account.
      const [customer] = await db
        .select({ id: customersTable.id })
        .from(customersTable)
        .where(
          and(
            eq(customersTable.email, login.toLowerCase().trim()),
            eq(customersTable.passwordResetToken, keyHash),
            gt(customersTable.passwordResetTokenExpiresAt, now),
          ),
        )
        .limit(1);
      if (!customer) {
        return res.status(400).json({
          ok: false,
          code: "expired_link",
          message: "This reset link has expired or is invalid. Please request a new one.", // i18n-ignore
        });
      }
      const newHash = await hashPassword(password);
      await db
        .update(customersTable)
        .set({
          passwordHash: newHash,
          passwordResetToken: null,
          passwordResetTokenExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(customersTable.id, customer.id));
      return res.json({ ok: true });
    } catch (e: any) {
      req.log?.warn?.({ err: e?.message }, "auth.reset.confirm: local DB error");
      return res.status(500).json({
        ok: false,
        message: "Could not reset your password right now. Please try again.", // i18n-ignore
      });
    }
  }

  // ── WC/WP proxy path (WC_AUTH_ENABLED=true, legacy migration window) ─────
  if (!key || !login || !password) {
    return res.status(400).json({
      ok: false,
      code: "missing_link",
      message: "Missing reset link details or new password.", // i18n-ignore
    });
  }
  if (password.length < 8) {
    return res.status(400).json({
      ok: false,
      code: "weak_password",
      message: "Password must be at least 8 characters.", // i18n-ignore
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
        message: "This reset link has expired or is invalid. Please request a new one.", // i18n-ignore
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
        message: "This reset link has expired or is invalid. Please request a new one.", // i18n-ignore
      });
    }
  const body = `Presentail: Your verification code is ${code}. It expires in 10 minutes.`; // i18n-ignore
    if (/expired|invalid.+key|invalidkey/i.test(body)) {
      return res.status(400).json({
        ok: false,
        code: "expired_link",
        message: "This reset link has expired or is invalid. Please request a new one.", // i18n-ignore
      });
    }
    if (resetRes.status === 200) {
      // WP usually redirects on success. A 200 here means the form was
      // re-rendered with a validation error (most often a weak password).
      return res.status(400).json({
        ok: false,
        code: "weak_password",
        message: "Please choose a stronger password and try again.", // i18n-ignore
      });
    }
    req.log?.warn?.(
      { status: resetRes.status, location: resetLoc },
      "auth.reset.confirm: unexpected upstream response",
    );
    return res.status(502).json({
      ok: false,
      message: "Could not reset your password right now. Please try again.", // i18n-ignore
    });
  } catch (e: any) {
    req.log?.warn?.({ err: e?.message }, "auth.reset.confirm: failed");
    return res.status(502).json({
      ok: false,
      message: "Could not reset your password right now. Please try again.", // i18n-ignore
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
      .json({ ok: false, message: "Missing Apple identity token" }); // i18n-ignore
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
    return res.status(400).json({
      ok: false,
      message:
        "Your Apple ID didn't share an email. Please retry and choose 'Share My Email'.",
    });
  }
  const appleSub = String(payload.sub ?? "").trim() || null;
  const givenName = String(payload.given_name ?? "").trim();
  const familyName = String(payload.family_name ?? "").trim();
  return issueSocialSession(res, req, "apple", {
    email,
    firstName: givenName,
    lastName: familyName,
    appleSub,
  });
});

router.post("/auth/social/google", socialIpLimiter, async (req, res) => {
  const { idToken } = req.body as { idToken?: string };
  if (!idToken) {
    return res
      .status(400)
      .json({ ok: false, message: "Missing Google ID token" }); // i18n-ignore
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
  return issueSocialSession(res, req, "apple", {
    email: rawEmail,
    firstName: givenName,
    lastName: familyName,
    appleSub,
  });
});

router.post("/auth/oauth/google", socialIpLimiter, async (req, res) => {
  const body = `Presentail: Your verification code is ${code}. It expires in 10 minutes.`; // i18n-ignore
  const idToken = body.idToken ?? body.id_token ?? body.credential;
  if (!idToken) {
    return res.status(400).json({ ok: false, message: "Missing Apple identity token" });
  }
  let payload: any;
  try {
    const verified = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: audiences,
    });
    payload = verified.payload;
  } catch (e: any) {
    req.log?.warn?.({ err: e?.message }, "auth.oauth.apple: token invalid");
    return res
      .status(401)
      .json({ ok: false, message: "Apple sign-in could not be verified" });
  }
  const rawEmail = String(payload.email ?? "").trim().toLowerCase();
  const appleSub = String(payload.sub ?? "").trim() || null;
  if (!rawEmail || !EMAIL_RE.test(rawEmail)) {
    // Fallback: try to resolve the account by the stable Apple sub claim.
    // Apple's email claim is normally always present but may be absent in edge
    // cases (e.g. private-relay reconfiguration). Resolving by sub prevents a
    // hard-400 for accounts we already know.
    if (appleSub) {
      try {
      const existing = await db
        .select({ id: customersTable.id })
        .from(customersTable)
        .where(eq(customersTable.email, normalizedEmail))
        .limit(1);
        if (existing) {
          const givenNameFb = String(
            body.user?.name?.firstName ?? body.fullName?.givenName ?? "",
          ).trim();
          const familyNameFb = String(
            body.user?.name?.lastName ?? body.fullName?.familyName ?? "",
          ).trim();
          return issueSocialSession(res, req, "apple", {
            email: existing.email,
            firstName: givenNameFb || existing.firstName,
            lastName: familyNameFb || existing.lastName,
            appleSub,
          });
        }
      } catch (e: any) {
        req.log?.warn?.({ err: e?.message }, "auth.oauth.apple: appleSub fallback lookup failed");
      }
    }
    return res.status(400).json({
      ok: false,
      message:
        "Your Apple ID didn't share an email. Please retry and choose 'Share My Email'.",
    });
  }
  const givenName = String(payload.given_name ?? "").trim();
  const familyName = String(payload.family_name ?? "").trim();
  return issueSocialSession(res, req, "apple", {
    email: rawEmail,
    firstName: givenName,
    lastName: familyName,
    appleSub,
  });
});

router.post("/auth/oauth/google", socialIpLimiter, async (req, res) => {
  const body = `Presentail: Your verification code is ${code}. It expires in 10 minutes.`; // i18n-ignore

  // OAuth2 popup flow: web client sends an access token.
  // Step 1: call Google tokeninfo to validate the token and verify its audience
  //         matches one of our configured OAuth client IDs.
  // Step 2: call userinfo to retrieve profile claims (name, email).
  // This two-step approach prevents cross-client token replay attacks — a
  // valid Google access token minted for a different OAuth app is rejected.
  if (body.accessToken) {
  const audiences = googleWebAudiences();
    if (!audiences.length) {
      return res.status(503).json({
        ok: false,
        message: "Google sign-in is not configured on the server.",
      });
    }

    // Step 1 — validate token and check audience binding.
    let tokenInfo: any;
    try {
      const tiRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(body.accessToken)}`
      );
      if (!tiRes.ok) {
        req.log?.warn?.({ status: tiRes.status }, "auth.oauth.google: tokeninfo rejected");
        return res
          .status(401)
          .json({ ok: false, message: "Google sign-in could not be verified" });
      }
      tokenInfo = await tiRes.json();
    } catch (e: any) {
      req.log?.warn?.({ err: e?.message }, "auth.oauth.google: tokeninfo fetch error");
      return res
        .status(401)
        .json({ ok: false, message: "Google sign-in could not be verified" });
    }

    // `aud` is the client ID the token was issued for; `azp` is the authorized
    // party (present when aud ≠ azp, e.g. service accounts). We accept either.
    const tokenAud = String(tokenInfo.aud ?? "").trim();
    const tokenAzp = String(tokenInfo.azp ?? "").trim();
    const audienceSet = new Set(audiences);
    if (!audienceSet.has(tokenAud) && !audienceSet.has(tokenAzp)) {
      req.log?.warn?.(
        { aud: tokenAud, azp: tokenAzp },
        "auth.oauth.google: token audience mismatch"
      );
      return res
        .status(401)
        .json({ ok: false, message: "Google sign-in could not be verified" });
    }

    // Step 2 — fetch profile claims.
    let userInfo: any;
    try {
      const uiRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${body.accessToken}` },
      });
      if (!uiRes.ok) {
        req.log?.warn?.({ status: uiRes.status }, "auth.oauth.google: userinfo failed");
        return res
          .status(401)
          .json({ ok: false, message: "Google sign-in could not be verified" });
      }
      userInfo = await uiRes.json();
    } catch (e: any) {
      req.log?.warn?.({ err: e?.message }, "auth.oauth.google: userinfo fetch error");
      return res
        .status(401)
        .json({ ok: false, message: "Google sign-in could not be verified" });
    }

    if (userInfo.email_verified === false) {
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
  }

  // Legacy path: Google Identity Services One Tap / mobile sends an ID token
  // as `credential`, `idToken`, or `id_token`.
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

// ── OTP send ─────────────────────────────────────────────────────────────────
// Generates a 6-digit numeric code, stores it hashed (SHA-256, 10-min TTL),
// and dispatches it via Twilio SMS. Rate-limited to 3 sends per phone per 10
// minutes (in-memory) plus 10 requests per IP per 10 minutes.
router.post("/auth/otp/send", otpSendIpLimiter, async (req, res) => {
  const { phone } = req.body as { phone?: string };
  if (!phone || phone.trim().length < 7) {
    res.status(400).json({ ok: false, code: "invalid_phone", message: "A valid phone number is required" }); // i18n-ignore
    return;
  }
  const normalizedPhone = phone.trim();

  const limCheck = otpPhoneLimiter.check(normalizedPhone);
  if (!limCheck.allowed) {
    res.status(429).json({ ok: false, code: "too_many_requests", message: "Too many OTP requests for this number. Please wait and try again." }); // i18n-ignore
    return;
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const codeHash = createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  try {
    await db
      .delete(phoneOtpsTable)
      .where(eq(phoneOtpsTable.phone, normalizedPhone));

    await db.insert(phoneOtpsTable).values({
      phone: normalizedPhone,
      codeHash,
      expiresAt,
    });
  } catch (err: any) {
    req.log?.error?.({ err: err?.message }, "auth.otp.send: DB error");
    res.status(500).json({ ok: false, code: "server_error", message: "Failed to store OTP" }); // i18n-ignore
    return;
  }

  otpPhoneLimiter.record(normalizedPhone);

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM ?? process.env.TWILIO_FROM_LB ?? "";

  if (!accountSid || !authToken || !fromNumber) {
    req.log?.warn?.({ phone: normalizedPhone }, "auth.otp.send: Twilio not configured — OTP not sent (DEV mode)");
    if (process.env.NODE_ENV !== "production") {
      req.log?.info?.({ code }, "auth.otp.send: DEV code (Twilio not configured)");
    }
    res.json({ ok: true });
    return;
  }

  const body = `Presentail: Your verification code is ${code}. It expires in 10 minutes.`; // i18n-ignore
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  try {
    const r = await wcFetch("/customers", {
      method: "POST",
      body: JSON.stringify({
        email: email.trim(),
        password,
        first_name: firstName?.trim() ?? "",
        last_name: lastName?.trim() ?? "",
        billing: { phone: normalizedPhone },
      }),
    }, req);
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      req.log?.warn?.({ phone: normalizedPhone, status: r.status, body: text.slice(0, 200) }, "auth.otp.send: Twilio error (non-fatal)");
    } else {
      req.log?.info?.({ phone: normalizedPhone }, "auth.otp.send: SMS dispatched");
    }
  } catch (err: any) {
    req.log?.warn?.({ err: err?.message, phone: normalizedPhone }, "auth.otp.send: Twilio fetch failed (non-fatal)");
  }

  res.json({ ok: true });
});

// ── OTP verify + register ─────────────────────────────────────────────────────
// Validates the supplied 6-digit code against the stored hash + expiry, then
// completes account registration and returns an auth token. On success the OTP
// row is deleted. Wrong codes increment the `attempts` counter; after 5 wrong
// guesses the row is deleted and the shopper must request a new code.
router.post("/auth/otp/verify", registerIpLimiter, async (req, res) => {
  const { phone, code, email, password, firstName, lastName } = req.body as {
    phone?: string;
    code?: string;
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
  };

  if (!phone || !code || !email || !password) {
    res.status(400).json({ ok: false, code: "missing_fields", message: "phone, code, email and password are required" }); // i18n-ignore
    return;
  }

  const normalizedPhone = phone.trim();
  const trimmedCode = code.trim();

  const now = new Date();
  let rows: typeof phoneOtpsTable.$inferSelect[];
  try {
    rows = await db
      .select()
      .from(phoneOtpsTable)
      .where(
        and(
          eq(phoneOtpsTable.phone, normalizedPhone),
          gt(phoneOtpsTable.expiresAt, now),
        ),
      )
      .limit(1);
  } catch (err: any) {
    req.log?.error?.({ err: err?.message }, "auth.otp.verify: DB select error");
    res.status(500).json({ ok: false, code: "server_error", message: "Failed to look up OTP" }); // i18n-ignore
    return;
  }

  if (rows.length === 0) {
    res.status(400).json({ ok: false, code: "expired_otp", message: "OTP not found or expired" }); // i18n-ignore
    return;
  }

  const row = rows[0];

  if (row.attempts >= 5) {
    await db.delete(phoneOtpsTable).where(eq(phoneOtpsTable.id, row.id)).catch(() => {});
    res.status(429).json({ ok: false, code: "too_many_attempts", message: "Too many incorrect attempts. Please request a new code." }); // i18n-ignore
    return;
  }

  const expectedHash = createHash("sha256").update(trimmedCode).digest("hex");
  if (expectedHash !== row.codeHash) {
    const newAttempts = row.attempts + 1;
    if (newAttempts >= 5) {
      await db.delete(phoneOtpsTable).where(eq(phoneOtpsTable.id, row.id)).catch(() => {});
      res.status(429).json({ ok: false, code: "too_many_attempts", message: "Too many incorrect attempts. Please request a new code." }); // i18n-ignore
    } else {
      await db
        .update(phoneOtpsTable)
        .set({ attempts: newAttempts })
        .where(eq(phoneOtpsTable.id, row.id))
        .catch(() => {});
      res.status(400).json({ ok: false, code: "invalid_otp", message: "Incorrect code. Please try again." }); // i18n-ignore
    }
    return;
  }

  await db.delete(phoneOtpsTable).where(eq(phoneOtpsTable.id, row.id)).catch(() => {});

  if (password.length < 8) {
    res.status(400).json({ ok: false, code: "password_too_short", message: "Password must be at least 8 characters" }); // i18n-ignore
    return;
  }

  // ── Local-only OTP registration (WC_AUTH_ENABLED=false) ─────────────────
  if (!isWcAuthEnabled()) {
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const existing = await db
        .select({ id: customersTable.id })
        .from(customersTable)
        .where(eq(customersTable.email, normalizedEmail))
        .limit(1);
      if (existing.length > 0) {
        res.status(409).json({
          ok: false,
          code: "registration_failed",
          message: "An account with this email already exists.", // i18n-ignore
        });
        return;
      }

      // Reject if the verified phone number is already registered on *any*
      // existing account. Without this check, upsertCustomer()'s phone-fallback
      // lookup would return the existing row, and we'd issue a session token for
      // that pre-existing customer ID with the attacker-supplied email — a full
      // account-takeover via phone OTP.
      const existingByPhone = await db
        .select({ id: customersTable.id })
        .from(customersTable)
        .where(eq(customersTable.phoneE164, normalizedPhone))
        .limit(1);
      if (existingByPhone.length > 0) {
        res.status(409).json({
          ok: false,
          code: "registration_failed",
          message: "An account with this phone number already exists.", // i18n-ignore
        });
        return;
      }

      const { customer } = await upsertCustomer({
        email: normalizedEmail,
        firstName: firstName?.trim() ?? "",
        lastName: lastName?.trim() ?? "",
        phone: normalizedPhone,
        authProvider: null,
        authUserId: null,
        source: "presentail.com",
        preferredLang: langFromRequest(req),
        // Phone OTP verifies phone ownership, not the email address. Mark
        // email as unverified so the order-history guard still applies.
        emailVerified: false,
      });

      // Defense-in-depth: if upsertCustomer() somehow returned a row whose
      // email does not match the submitted email (e.g. the phone-fallback path
      // was triggered despite the check above), abort rather than issue a token
      // for someone else's account.
      if (customer.email !== normalizedEmail) {
        req.log?.warn?.(
          { customerId: customer.id, submittedEmail: normalizedEmail },
          "auth.otp.verify: upsertCustomer returned mismatched email — aborting",
        );
        res.status(409).json({
          ok: false,
          code: "registration_failed",
          message: "An account with this phone number already exists.", // i18n-ignore
        });
        return;
      }

      if (isClerkConfigured()) {
        ensureClerkUserInBackground({
          email: normalizedEmail,
          firstName: firstName?.trim() ?? null,
          lastName: lastName?.trim() ?? null,
          localCustomerId: customer.id,
          log: req.log,
        });
      }

      const store = resolveStoreFromRequest(req);
    let token: string | null = null;

      res.json({
        ok: true,
        token,
        user: {
          id: customer.id,
          email: customer.email,
          firstName: customer.firstName ?? "",
          lastName: customer.lastName ?? "",
          username: "",
          phone: customer.phoneE164 ?? normalizedPhone,
          gender: null,
          birthday: null,
        },
      });
    } catch (e: any) {
      res.status(500).json({ ok: false, code: "server_error", message: e?.message ?? "Registration failed" }); // i18n-ignore
    }
    return;
  }

  // ── Legacy WC OTP registration (WC_AUTH_ENABLED=true) ───────────────────
  if (!process.env.WC_CONSUMER_KEY) {
    res.status(503).json({ ok: false, code: "service_unavailable", message: "Registration unavailable" }); // i18n-ignore
    return;
  }

  try {
    const r = await wcFetch("/customers", {
      method: "POST",
      body: JSON.stringify({
        email: email.trim(),
        password,
        first_name: firstName?.trim() ?? "",
        last_name: lastName?.trim() ?? "",
        billing: { phone: normalizedPhone },
      }),
    }, req);

    const data = (await r.json().catch(() => ({}))) as any;
    if (!r.ok) {
      res.status(r.status).json({
        ok: false,
        code: "registration_failed",
        message: data?.message?.replace(/<[^>]*>/g, "") ?? "Registration failed", // i18n-ignore
      });
      return;
    }

    let token: string | null = null;
    try {
      const tokenRes = await wpFetch(`/jwt-auth/v1/token`, {
        method: "POST",
        body: JSON.stringify({ username: email.trim(), password }),
      }, req);
      const tokenData = (await tokenRes.json().catch(() => ({}))) as any;
      if (tokenRes.ok && tokenData?.token) token = tokenData.token;
    } catch {
      // ignore - user can log in manually
    }

    const mapped = mapCustomer(data);
    if (mapped.id) {
      mirrorAndPropagateToClerk(
        mapped.id,
        {
          email: mapped.email,
          firstName: mapped.firstName,
          lastName: mapped.lastName,
          phone: normalizedPhone,
          provider: "password",
          preferredLang: langFromRequest(req),
        },
        req.log,
      );
    }
    res.json({ ok: true, token, user: mapped });
  } catch (e: any) {
    res.status(500).json({ ok: false, code: "server_error", message: e?.message ?? "Registration failed" }); // i18n-ignore
  }
});

export default router;
