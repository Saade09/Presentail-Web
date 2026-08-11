import { ipKeyGenerator, rateLimit, type Options } from "express-rate-limit";
import type { Request, Response } from "express";
import { isPrivateOrLoopback } from "./geoCurrency";

// ── SSE client-IP key helper ─────────────────────────────────────────────────
//
// For security-sensitive rate limiting and connection accounting the key must
// be an IP that cannot be forged by the connecting client. Using the LEFTMOST
// (or any client-supplied) X-Forwarded-For entry is unsafe: ordinary proxy
// behavior appends to XFF rather than replacing it, so a client can inject an
// arbitrary public address to the left of their real IP and appear to be a
// distinct source.
//
// The rightmost non-private XFF entry is spoof-resistant: clients can only
// prepend entries; Replit's edge/CDN appends the real TCP-source IP. The
// rightmost publicly-routable address in the chain is therefore the one
// Replit's trusted infrastructure actually observed and cannot be forged by
// the connecting party.
//
// This helper is exported so the SSE rate limiter and the concurrent-
// connection map both key on the same canonical IP.
export function sseClientIpKey(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  const raw = Array.isArray(xff) ? xff.join(",") : (xff ?? "");
  const entries = raw
    .split(",")
    .map((s) => s.trim().replace(/^::ffff:/, ""))
    .filter(Boolean);

  // Walk right-to-left; the first publicly-routable address is Replit's
  // view of the actual client and cannot have been injected by the client.
  for (let i = entries.length - 1; i >= 0; i--) {
    if (!isPrivateOrLoopback(entries[i])) {
      return ipKeyGenerator(entries[i]);
    }
  }

  // Fallback: req.ip (may be a shared proxy hop in some environments, but
  // is the best available address when all XFF entries are private/absent).
  const fallback = (req.ip ?? "").replace(/^::ffff:/, "") || "unknown";
  return ipKeyGenerator(fallback);
}

// ── Shared response helper ────────────────────────────────────────────────────
function tooManyHandler(_req: Request, res: Response) {
  res.status(429).json({
    ok: false,
    code: "too_many_requests",
    message: "Too many attempts. Please wait a moment and try again.", // i18n-ignore
  });
}

// NOTE: `req.ip` is used as the key source (the express-rate-limit default).
// For it to reflect the real client IP behind the Replit reverse proxy,
// Express must be configured with `app.set('trust proxy', 1)` (see app.ts).
// Relying on req.ip rather than reading x-forwarded-for directly prevents
// clients from spoofing the header value.
const baseOptions: Partial<Options> = {
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyHandler,
};

// ── IP-based limiters ─────────────────────────────────────────────────────────

/** GET /auth/exists — 30 lookups / 10 min per IP */
export const existsIpLimiter = rateLimit({
  ...baseOptions,
  windowMs: 10 * 60 * 1000,
  limit: 30,
  message: undefined,
});

/**
 * POST /auth/web-bridge — 10 lookups / 15 min per IP.
 *
 * This endpoint returns `userExists: true/false`, making it an email
 * enumeration oracle. A dedicated, stricter limiter bounds the rate of
 * automated lookups to ≈40 per hour per source IP. Distributed attacks
 * rotating many IPs are not fully preventable by rate limiting alone;
 * the trade-off between UX friction and enumeration risk is acknowledged
 * in the API spec. This limiter is separate from `existsIpLimiter` so that
 * an unrelated burst of /auth/exists traffic does not reduce the budget here
 * and vice-versa.
 */
export const webBridgeIpLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: undefined,
});

/** POST /auth/login — 10 attempts / 15 min per IP */
export const loginIpLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: undefined,
});

/** POST /auth/register — 5 registrations / hour per IP */
export const registerIpLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: undefined,
});

/** POST /auth/reset/request — 5 requests / hour per IP */
export const resetRequestIpLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: undefined,
});

/** POST /auth/reset/confirm — 10 attempts / hour per IP */
export const resetConfirmIpLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: undefined,
});

/** POST /auth/social/* — 10 attempts / 15 min per IP */
export const socialIpLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: undefined,
});

// ── Email/account-based limiters (in-memory sliding-window) ───────────────────
// These complement the IP limiters: an attacker rotating IPs still hits a per-
// email cap. We keep a simple Map so there is zero external dependency. Entries
// expire naturally after `windowMs` and are pruned on each check to bound
// memory usage.

interface EmailWindow {
  count: number;
  resetAt: number;
}

interface EmailLimiter {
  /** Check whether the email is currently over its limit (does NOT record). */
  check(email: string): { allowed: boolean; retryAfterMs: number };
  /** Record one attempt against the email. Call after a failure, not on success. */
  record(email: string): void;
}

function makeEmailLimiter(opts: { limit: number; windowMs: number }): EmailLimiter {
  const store = new Map<string, EmailWindow>();

  function prune(now: number) {
    for (const [key, w] of store) {
      if (now >= w.resetAt) store.delete(key);
    }
  }

  function getWindow(email: string, now: number): EmailWindow {
    if (store.size > 5000) prune(now);
    const key = email.toLowerCase().trim();
    let w = store.get(key);
    if (!w || now >= w.resetAt) {
      w = { count: 0, resetAt: now + opts.windowMs };
      store.set(key, w);
    }
    return w;
  }

  return {
    check(email: string) {
      const now = Date.now();
      const w = getWindow(email, now);
      if (w.count >= opts.limit) {
        return { allowed: false, retryAfterMs: w.resetAt - now };
      }
      return { allowed: true, retryAfterMs: 0 };
    },
    record(email: string) {
      const now = Date.now();
      const w = getWindow(email, now);
      w.count += 1;
    },
  };
}

/**
 * Login: maximum 5 *failed* attempts per email per 15 min.
 *
 * Usage pattern in the login handler:
 *   1. Call `loginEmailLimiter.check(email)` first — if blocked, reject early.
 *   2. Forward credentials to WordPress.
 *   3. On a failed auth response, call `loginEmailLimiter.record(email)`.
 *   4. On success, do NOT call record() — successful logins don't count against
 *      the cap, preventing lockout of legitimate users.
 */
export const loginEmailLimiter = makeEmailLimiter({ limit: 5, windowMs: 15 * 60 * 1000 });

/**
 * Reset request: 3 requests per email per hour.
 *
 * Usage: call `record()` before forwarding to WordPress (every request
 * to this endpoint causes WordPress to send a reset email, so we cap at
 * the Express layer regardless of whether the email is known).
 * Call `check()` first — if already over the limit, skip the WP call.
 */
export const resetEmailLimiter = makeEmailLimiter({ limit: 3, windowMs: 60 * 60 * 1000 });

/**
 * OTP send: 3 sends per phone per 10 minutes.
 *
 * Usage: call `check(phone)` first — if blocked, reject without sending.
 * Call `record(phone)` on every send (we count sends, not failures).
 */
export const otpPhoneLimiter = makeEmailLimiter({ limit: 3, windowMs: 10 * 60 * 1000 });

/** POST /auth/otp/send — 10 requests / 10 min per IP */
export const otpSendIpLimiter = rateLimit({
  ...baseOptions,
  windowMs: 10 * 60 * 1000,
  limit: 10,
  message: undefined,
});

/**
 * Admin token endpoints — 20 requests / 15 min per IP.
 *
 * Applied to every request that carries an x-push-admin-token or
 * x-admin-token header, regardless of path. This caps brute-force
 * attempts against the PUSH_ADMIN_TOKEN shared secret to a rate that
 * makes even a weak (e.g. 64-bit) token computationally infeasible to
 * guess within the window, while allowing legitimate operator use.
 */
export const adminTokenIpLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: undefined,
});

/**
 * GET /events (SSE) — max 30 new connection attempts per IP per minute.
 *
 * Keyed on the real client IP via sseClientIpKey (XFF-aware) so each visitor
 * gets an independent bucket even behind Replit's shared proxy. This throttles
 * rapid reconnect loops and scripted connection flooding. The per-IP
 * concurrent-connection cap in sseBroadcast.ts provides the complementary
 * defence against long-lived connection exhaustion.
 */
export const sseConnectIpLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: sseClientIpKey,
  message: undefined,
});
