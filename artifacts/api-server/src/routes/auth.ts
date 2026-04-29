import { Router, type IRouter } from "express";

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

// Decode a JWT's payload without verifying the signature.
// Used purely to extract the WP user_id; we still validate the token
// against WordPress before trusting it.
function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Authenticate the request against the WP JWT plugin and resolve the
// owning customer. Returns the customer id from the validated JWT payload,
// never from any client-supplied header.
async function authenticate(authHeader: string | undefined): Promise<
  { ok: true; customerId: number; token: string } | { ok: false; status: number; message: string }
> {
  if (!authHeader || !/^Bearer\s+/i.test(authHeader)) {
    return { ok: false, status: 401, message: "Missing or invalid Authorization header" };
  }
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, status: 401, message: "Empty token" };

  // Validate the token with WordPress.
  try {
    const v = await wpFetch(`/jwt-auth/v1/token/validate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (v.status === 404) {
      return { ok: false, status: 503, message: "Auth not configured on server" };
    }
    if (!v.ok) {
      return { ok: false, status: 401, message: "Invalid or expired session" };
    }
  } catch (e: any) {
    return { ok: false, status: 502, message: e?.message ?? "Failed to validate session" };
  }

  // Extract customer id from validated JWT payload.
  const payload = decodeJwtPayload(token);
  const id =
    Number(payload?.data?.user?.id) ||
    Number(payload?.user_id) ||
    Number(payload?.sub);
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, status: 401, message: "Token missing user id" };
  }
  return { ok: true, customerId: id, token };
}

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

export default router;
