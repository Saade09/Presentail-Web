import { SignJWT, jwtVerify } from "jose";

const WP_BASE = "https://presentail.com/lebanon/wp-json";
const SERVER_JWT_ISSUER = "presentail-api";
const SERVER_JWT_AUDIENCE = "presentail-app";

export type AuthResult =
  | { ok: true; customerId: number; token: string }
  | { ok: false; status: number; message: string };

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

function getServerJwtSecret(): Uint8Array | null {
  const raw = process.env.SOCIAL_JWT_SECRET ?? process.env.JWT_SECRET ?? "";
  if (!raw || raw.length < 32) return null;
  return new TextEncoder().encode(raw);
}

// Mint a server-issued session token for a WC customer. Used by the social
// sign-in routes (Apple/Google) where we don't have the user's WP password
// and therefore can't ask the WP JWT plugin for a token. The token embeds
// the verified WC customer id and is checked back in `authenticate()`.
export async function signServerToken(input: {
  customerId: number;
  email: string;
  provider: "apple" | "google";
}): Promise<string> {
  const key = getServerJwtSecret();
  if (!key) {
    throw new Error(
      "SOCIAL_JWT_SECRET (or JWT_SECRET) must be set to issue social-login tokens",
    );
  }
  return new SignJWT({
    email: input.email,
    provider: input.provider,
    customer_id: input.customerId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(SERVER_JWT_ISSUER)
    .setAudience(SERVER_JWT_AUDIENCE)
    .setSubject(String(input.customerId))
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(key);
}

async function verifyServerToken(token: string): Promise<AuthResult> {
  const key = getServerJwtSecret();
  if (!key) {
    return { ok: false, status: 503, message: "Social auth not configured" };
  }
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: SERVER_JWT_ISSUER,
      audience: SERVER_JWT_AUDIENCE,
    });
    const id = Number(payload.customer_id ?? payload.sub);
    if (!Number.isFinite(id) || id <= 0) {
      return { ok: false, status: 401, message: "Token missing user id" };
    }
    return { ok: true, customerId: id, token };
  } catch {
    return { ok: false, status: 401, message: "Invalid or expired session" };
  }
}

// Authenticate the request. The token may be either:
//   1. A WP JWT issued by the `jwt-auth` plugin (email+password login).
//   2. A server-minted JWT issued by `signServerToken()` (social login).
// We decode the issuer claim first so we route to the right verifier
// without an extra WP round-trip for social tokens.
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

  const payload = decodeJwtPayload(token);
  if (payload?.iss === SERVER_JWT_ISSUER) {
    return verifyServerToken(token);
  }

  // Validate WP-issued token with WordPress.
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

  const id =
    Number(payload?.data?.user?.id) ||
    Number(payload?.user_id) ||
    Number(payload?.sub);
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, status: 401, message: "Token missing user id" };
  }
  return { ok: true, customerId: id, token };
}
