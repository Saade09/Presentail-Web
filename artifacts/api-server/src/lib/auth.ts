const WP_BASE = "https://presentail.com/lebanon/wp-json";

export type AuthResult =
  | { ok: true; customerId: number; token: string }
  | { ok: false; status: number; message: string };

// Decode a JWT's payload without verifying the signature.
// Used purely to extract the WP user_id; we still validate the token
// against WordPress before trusting it.
export function decodeJwtPayload(token: string): any | null {
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

// Authenticate the request against the WP JWT plugin and resolve the
// owning customer. Returns the customer id from the validated JWT payload,
// never from any client-supplied header.
export async function authenticate(
  authHeader: string | undefined,
): Promise<AuthResult> {
  if (!authHeader || !/^Bearer\s+/i.test(authHeader)) {
    return {
      ok: false,
      status: 401,
      message: "Missing or invalid Authorization header",
    };
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
    return {
      ok: false,
      status: 502,
      message: e?.message ?? "Failed to validate session",
    };
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
