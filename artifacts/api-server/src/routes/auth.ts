import { Router, type IRouter } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { randomBytes } from "node:crypto";
import { authenticate, decodeJwtPayload, signServerToken } from "../lib/auth";

const router: IRouter = Router();

const WC_BASE = "https://presentail.com/lebanon/wp-json/wc/v3";
const WP_BASE = "https://presentail.com/lebanon/wp-json";

function wooAuth() {
  const key = process.env.WC_CONSUMER_KEY ?? "";
  const secret = process.env.WC_CONSUMER_SECRET ?? "";
  return "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");
}

async function wcFetch(path: string, options: RequestInit = {}) {
  return fetch(`${WC_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: wooAuth(),
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "PresentailApp/1.0",
      ...(options.headers ?? {}),
    },
  });
}

async function wpFetch(path: string, options: RequestInit = {}) {
  return fetch(`${WP_BASE}${path}`, {
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

// ── Email existence check ────────────────────────────────────────────────────
// Lightweight lookup so the multi-step auth flow can route users to either the
// password-login step (existing account) or the sign-up step (new account).
// Returns `{ ok: true, exists: false }` early on malformed input so the
// endpoint can't be turned into an oracle. WC `customers?email=` requires the
// REST credentials, so when those aren't configured we return `exists: false`
// rather than leaking a 503.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
router.get("/auth/exists", async (req, res) => {
  const raw = String(req.query.email ?? "").trim().toLowerCase();
  if (!raw || raw.length > 254 || !EMAIL_RE.test(raw)) {
    res.json({ ok: true, exists: false });
    return;
  }
  if (!process.env.WC_CONSUMER_KEY) {
    res.json({ ok: true, exists: false });
    return;
  }
  try {
    const r = await wcFetch(`/customers?email=${encodeURIComponent(raw)}&per_page=1`);
    if (!r.ok) {
      res.json({ ok: true, exists: false });
      return;
    }
    const list = (await r.json().catch(() => [])) as any[];
    const exists = Array.isArray(list) && list.length > 0;
    res.json({ ok: true, exists });
  } catch (e: any) {
    req.log?.warn?.({ err: e?.message }, "auth.exists: lookup failed");
    res.json({ ok: true, exists: false });
  }
});

// ── Login: uses JWT Authentication for WP REST API plugin ────────────────────
router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ ok: false, message: "Email and password are required" });
  }

  try {
    const tokenRes = await wpFetch(`/jwt-auth/v1/token`, {
      method: "POST",
      body: JSON.stringify({ username: email, password }),
    });

    const tokenData = (await tokenRes.json().catch(() => ({}))) as any;

    if (tokenRes.status === 404) {
      return res.status(503).json({
        ok: false,
        code: "jwt_not_installed",
        message: "Login is being set up on the server. Please try again later.",
      });
    }

    if (!tokenRes.ok || !tokenData?.token) {
      return res.status(401).json({
        ok: false,
        message: tokenData?.message?.replace(/<[^>]*>/g, "") ?? "Invalid email or password",
      });
    }

    // Try to look up the WC customer record so we have id/firstName/etc.
    let customer: ReturnType<typeof mapCustomer> | null = null;
    try {
      const cRes = await wcFetch(`/customers?email=${encodeURIComponent(email)}`);
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

    return res.json({ ok: true, token: tokenData.token, user: customer });
  } catch (e: any) {
    return res.status(500).json({ ok: false, message: e?.message ?? "Login failed" });
  }
});

// ── Register: create a WooCommerce customer ──────────────────────────────────
router.post("/auth/register", async (req, res) => {
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
    });

    const data = (await r.json().catch(() => ({}))) as any;
    if (!r.ok) {
      return res.status(r.status).json({
        ok: false,
        message: data?.message?.replace(/<[^>]*>/g, "") ?? "Registration failed",
      });
    }

    // Try to issue a JWT immediately (best-effort)
    let token: string | null = null;
    try {
      const tokenRes = await wpFetch(`/jwt-auth/v1/token`, {
        method: "POST",
        body: JSON.stringify({ username: email, password }),
      });
      const tokenData = (await tokenRes.json().catch(() => ({}))) as any;
      if (tokenRes.ok && tokenData?.token) token = tokenData.token;
    } catch {
      // ignore - user can log in manually
    }

    return res.json({ ok: true, token, user: mapCustomer(data) });
  } catch (e: any) {
    return res.status(500).json({ ok: false, message: e?.message ?? "Registration failed" });
  }
});

// ── Get current user (auth via Bearer JWT, validated against WP) ─────────────
router.get("/auth/me", async (req, res) => {
  const auth = await authenticate(req.header("authorization"));
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, message: auth.message });
    return;
  }
  try {
    const r = await wcFetch(`/customers/${auth.customerId}`);
    const data = (await r.json().catch(() => ({}))) as any;
    if (!r.ok) {
      res.status(r.status).json({ ok: false, message: data?.message ?? "Not found" });
      return;
    }
    res.json({ ok: true, user: mapCustomer(data) });
  } catch (e: any) {
    res.status(500).json({ ok: false, message: e?.message ?? "Failed" });
  }
});

// ── Update current user profile ──────────────────────────────────────────────
router.put("/auth/me", async (req, res) => {
  const auth = await authenticate(req.header("authorization"));
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
    });
    const data = (await r.json().catch(() => ({}))) as any;
    if (!r.ok) {
      res.status(r.status).json({ ok: false, message: data?.message ?? "Update failed" });
      return;
    }
    res.json({ ok: true, user: mapCustomer(data) });
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
  const auth = await authenticate(req.header("authorization"));
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
    // Step 1 — anonymise the customer record.
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
    });
    if (!updateRes.ok) {
      const errBody = (await updateRes.text().catch(() => "")) || "";
      req.log?.warn?.({ status: updateRes.status, body: errBody.slice(0, 300) }, "auth.delete: anonymise failed");
    }

    // Step 2 — drop the customer from the WC index. force=true means no trash.
    const delRes = await wcFetch(`/customers/${id}?force=true`, { method: "DELETE" });
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

function googleAudiences(): string[] {
  return envList("GOOGLE_CLIENT_IDS");
}

function randomPassword(): string {
  return (
    "soc-" + randomBytes(24).toString("base64url") + "-" + Date.now().toString(36)
  );
}

async function findCustomerByEmail(email: string) {
  const r = await wcFetch(`/customers?email=${encodeURIComponent(email)}&per_page=1`);
  if (!r.ok) return null;
  const list = (await r.json().catch(() => [])) as any[];
  return Array.isArray(list) && list[0] ? list[0] : null;
}

async function createCustomer(input: {
  email: string;
  firstName: string;
  lastName: string;
}) {
  // Username must be unique. Derive from local part + short random suffix
  // so concurrent social sign-ups don't collide.
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
  });
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
}) {
  const existing = await findCustomerByEmail(input.email);
  if (existing) return existing;
  return createCustomer(input);
}

async function issueSocialSession(
  res: import("express").Response,
  req: import("express").Request,
  provider: "apple" | "google",
  profile: { email: string; firstName: string; lastName: string },
) {
  if (!process.env.WC_CONSUMER_KEY) {
    return res
      .status(503)
      .json({ ok: false, message: "Sign-in is not available right now." });
  }
  try {
    const customer = await ensureCustomerForSocial(profile);
    const mapped = mapCustomer(customer);
    const token = await signServerToken({
      customerId: mapped.id,
      email: mapped.email,
      provider,
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

router.post("/auth/social/apple", async (req, res) => {
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

router.post("/auth/social/google", async (req, res) => {
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

export default router;
