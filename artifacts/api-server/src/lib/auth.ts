import { SignJWT, jwtVerify } from "jose";
import { getAuth, createClerkClient } from "@clerk/express";
import type { Request } from "express";
import { isUserType } from "@workspace/clerk-types";

import { resolveStore, resolveStoreFromRequest } from "./wooStore";
import { upsertCustomer, getCustomerById } from "./customers";
import { syncCustomerToWoo } from "./customers";
import { logger } from "./logger";
import { db, analyticsEventsTable } from "@workspace/db";

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

async function wpFetch(path: string, options: RequestInit = {}, req?: { query: any; headers: any }) {
  const store = req ? resolveStoreFromRequest(req) : resolveStore();
  const WP_BASE = store.wpBaseUrl;
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
  storeBaseUrl: string;
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
    store_base_url: input.storeBaseUrl,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(SERVER_JWT_ISSUER)
    .setAudience(SERVER_JWT_AUDIENCE)
    .setSubject(String(input.customerId))
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(key);
}

async function verifyServerToken(token: string, req?: { query: any; headers: any }): Promise<AuthResult> {
  const key = getServerJwtSecret();
  if (!key) {
    return { ok: false, status: 503, message: "Social auth not configured" }; // i18n-ignore
  }
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: SERVER_JWT_ISSUER,
      audience: SERVER_JWT_AUDIENCE,
    });
    const id = Number(payload.customer_id ?? payload.sub);
    if (!Number.isFinite(id) || id <= 0) {
      return { ok: false, status: 401, message: "Token missing user id" }; // i18n-ignore
    }
    if (req) {
      const requestStore = resolveStoreFromRequest(req);
      if (typeof payload.store_base_url === "string") {
        if (payload.store_base_url !== requestStore.baseUrl) {
          return { ok: false, status: 401, message: "Session belongs to a different store. Please sign in again." }; // i18n-ignore
        }
      } else {
        return { ok: false, status: 401, message: "Session is outdated. Please sign in again." }; // i18n-ignore
      }
    }
    return { ok: true, customerId: id, token };
  } catch {
    return { ok: false, status: 401, message: "Invalid or expired session" }; // i18n-ignore
  }
}

// ── Clerk session resolution ─────────────────────────────────────────────────
//
// A Clerk-authenticated request must still resolve to a WooCommerce-aware
// `customers.id` row so the rest of the API (orders, push, etc.) continues
// to work unchanged. We:
//   1. Read the verified `userId` Clerk attached to the request.
//   2. Look up Clerk's user record (email + name).
//   3. upsertCustomer() by email; persist the Clerk user id as
//      `(authProvider="clerk", authUserId=<clerk userId>)`.
//   4. syncCustomerToWoo() so the row gets a `wcCustomerId` and the rest
//      of the API can resolve back to a WooCommerce customer.
//   5. Lazy-tag the Clerk user with `publicMetadata.userType="customer"`
//      when the webhook hasn't fired yet (no CLERK_WEBHOOK_SECRET, retry
//      pending, etc) so requireUserType(["customer"]) keeps working.
async function resolveClerkSession(
  req: Request,
): Promise<AuthResult | null> {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) return null;

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    return { ok: false, status: 503, message: "Clerk is not configured" }; // i18n-ignore
  }

  // Read email, name, and publicMetadata from the JWT claims first.
  // Clerk embeds these when the session token template includes the fields,
  // so the vast majority of requests can skip a round-trip to the Clerk API.
  // We fall back to clerk.users.getUser() only when the claims are absent.
  const claims = auth.sessionClaims as Record<string, unknown> | null | undefined;
  const claimsEmail = typeof claims?.email === "string" ? claims.email : null;
  const claimsFirstName =
    typeof claims?.first_name === "string" ? claims.first_name : null;
  const claimsLastName =
    typeof claims?.last_name === "string" ? claims.last_name : null;
  const claimsPublicMetadata =
    claims?.public_metadata != null &&
    typeof claims.public_metadata === "object"
      ? (claims.public_metadata as Record<string, unknown>)
      : null;

  let primaryEmail: string | null = claimsEmail;
  let firstName: string = claimsFirstName ?? "";
  let lastName: string = claimsLastName ?? "";
  let needsUserTypeLazyTag = !isUserType(claimsPublicMetadata?.userType);

  if (!primaryEmail) {
    // Claims are absent — fall back to a Clerk API call.
    // This should not happen in production if the Clerk session token template
    // includes `email`, `first_name`, `last_name`, and `public_metadata`.
    req.log?.warn?.(
      { userId, reason: "claims_missing_email" },
      "auth.clerk: session claims missing email/name — falling back to clerk.users.getUser(). Configure the Clerk session token template to include email, first_name, last_name, and public_metadata.",
    );
    // Record a structured analytics event so the clerkSessionFallbackMonitor
    // can alert when this happens consistently, signalling a misconfigured
    // token template. Best-effort: never let a DB failure block auth.
    void db
      .insert(analyticsEventsTable)
      .values({
        name: "clerk_session_fallback",
        action: "claims_missing_email",
        userId,
        signedIn: true,
      })
      .catch((err: unknown) => {
        logger.warn(
          { err: (err as Error)?.message },
          "auth.clerk: failed to persist clerk_session_fallback event",
        );
      });
    let clerkUser: {
      id: string;
      emailAddresses: { id: string; emailAddress: string }[];
      primaryEmailAddressId: string | null;
      firstName: string | null;
      lastName: string | null;
      publicMetadata: { userType?: unknown } & Record<string, unknown>;
    };
    try {
      const clerk = createClerkClient({ secretKey });
      clerkUser = (await clerk.users.getUser(userId)) as typeof clerkUser;
    } catch (err: any) {
      req.log?.warn?.(
        { err: err?.message, userId },
        "auth.clerk: failed to load user from Clerk",
      );
      return { ok: false, status: 401, message: "Clerk session is invalid" }; // i18n-ignore
    }

    primaryEmail =
      clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId,
      )?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress ??
      null;
    firstName = clerkUser.firstName ?? "";
    lastName = clerkUser.lastName ?? "";
    needsUserTypeLazyTag = !isUserType(clerkUser.publicMetadata?.userType);
  }

  if (!primaryEmail) {
    return { ok: false, status: 401, message: "Clerk user has no email" }; // i18n-ignore
  }

  const store = resolveStoreFromRequest(req);
  let localCustomerId: number;
  try {
    const upserted = await upsertCustomer({
      email: primaryEmail,
      firstName,
      lastName,
      authProvider: "clerk",
      authUserId: userId,
      country: store.country,
      source: "presentail.com",
    });
    localCustomerId = upserted.customer.id;
  } catch (err: any) {
    req.log?.error?.(
      { err: err?.message, userId },
      "auth.clerk: failed to upsert local customer",
    );
    return { ok: false, status: 500, message: "Failed to resolve customer" }; // i18n-ignore
  }

  // The legacy WP/social JWT flow returns the WooCommerce customer id as
  // `customerId`, and downstream routes (`/auth/me`, `/me/orders`) look
  // it up via `getCustomerByWcId(auth.customerId)`. We must therefore
  // also return the WC id, not the local row id. Mirror the customer
  // into WooCommerce (idempotent) to obtain or recover the wcCustomerId.
  let wcCustomerId: number | null = null;
  try {
    const local = await getCustomerById(localCustomerId);
    if (local?.wcCustomerId) {
      wcCustomerId = local.wcCustomerId;
    } else {
      wcCustomerId = await syncCustomerToWoo(localCustomerId, store);
    }
  } catch (err: any) {
    req.log?.error?.(
      { err: err?.message, customerId: localCustomerId },
      "auth.clerk: WooCommerce mirror failed",
    );
    return {
      ok: false,
      status: 502,
      message: "Failed to resolve WooCommerce customer for this session", // i18n-ignore
    };
  }
  if (!wcCustomerId || wcCustomerId <= 0) {
    return {
      ok: false,
      status: 502,
      message: "Failed to resolve WooCommerce customer for this session", // i18n-ignore
    };
  }

  // Lazy userType tagging — covers the case where CLERK_WEBHOOK_SECRET
  // isn't configured yet and `user.created` was never delivered.
  // When claims were present, `needsUserTypeLazyTag` was derived from
  // `public_metadata.userType` in the JWT; the tag write is still needed
  // so the next token refresh picks up the updated value.
  if (needsUserTypeLazyTag) {
    try {
      const clerk = createClerkClient({ secretKey });
      await clerk.users.updateUserMetadata(userId, {
        publicMetadata: { userType: "customer" },
      });
    } catch (err: any) {
      req.log?.warn?.(
        { err: err?.message, userId },
        "auth.clerk: failed to lazy-tag userType (non-fatal)",
      );
    }
  }

  return { ok: true, customerId: wcCustomerId, token: "" };
}

// Authenticate the request. Resolution order:
//   1. Clerk session (set by clerkMiddleware on req.auth) — preferred.
//   2. Server-minted JWT issued by `signServerToken()` (legacy social login).
//   3. WP JWT issued by the `jwt-auth` plugin (legacy email+password login).
// Resolving Clerk first lets the new web app authenticate with cookies/
// bearer tokens minted by Clerk while the mobile app keeps using its
// existing WP/social JWTs unchanged.
export async function authenticate(
  authHeader: string | undefined,
  req?: Request | { query: any; headers: any },
): Promise<AuthResult> {
  // 1) Clerk — only when a real Express Request was provided (the
  //    middleware attaches `req.auth` per request).
  if (req && "header" in (req as Request)) {
    try {
      const clerkResult = await resolveClerkSession(req as Request);
      if (clerkResult) return clerkResult;
    } catch (err: any) {
      logger.warn(
        { err: err?.message },
        "auth.clerk: unexpected resolution error (falling back)",
      );
    }
  }

  // 2/3) Legacy WP / server-minted JWT in the Authorization header.
  if (!authHeader || !/^Bearer\s+/i.test(authHeader)) {
    return {
      ok: false,
      status: 401,
      message: "Missing or invalid Authorization header", // i18n-ignore
    };
  }
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, status: 401, message: "Empty token" }; // i18n-ignore

  const payload = decodeJwtPayload(token);
  if (payload?.iss === SERVER_JWT_ISSUER) {
    return verifyServerToken(token, req);
  }

  try {
    const v = await wpFetch(`/jwt-auth/v1/token/validate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }, req);
    if (v.status === 404) {
      return { ok: false, status: 503, message: "Auth not configured on server" }; // i18n-ignore
    }
    if (!v.ok) {
      return { ok: false, status: 401, message: "Invalid or expired session" }; // i18n-ignore
    }
  } catch (e: any) {
    return {
      ok: false,
      status: 502,
      message: e?.message ?? "Failed to validate session", // i18n-ignore
    };
  }

  const id =
    Number(payload?.data?.user?.id) ||
    Number(payload?.user_id) ||
    Number(payload?.sub);
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, status: 401, message: "Token missing user id" }; // i18n-ignore
  }
  return { ok: true, customerId: id, token };
}
