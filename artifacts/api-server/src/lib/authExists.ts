import { db, analyticsEventsTable } from "@workspace/db";
import { logger } from "./logger";

// ── Public types ────────────────────────────────────────────────────────────

/**
 * The set of distinct outcomes the `/auth/exists` lookup can resolve to.
 *
 *   - `exists_true_wc`         → WooCommerce returned a customer row.
 *   - `exists_true_wp_probe`   → no WC row but the JWT plugin reported the
 *                                user exists (`incorrect_password`).
 *   - `exists_false`           → no WC row AND the JWT plugin confirmed the
 *                                user does not exist (`invalid_email` /
 *                                `invalid_username` / `invalid_user`).
 *   - `invalid_email`          → input failed local validation.
 *   - `wc_not_configured`      → server has no WC consumer key — the lookup
 *                                cannot run at all (treated as inconclusive).
 *   - `lookup_unavailable`     → upstream component is missing (e.g. JWT
 *                                plugin returns 404) — UI must show "couldn't
 *                                check" and not advance to sign-up.
 *   - `lookup_failed`          → upstream returned a transient error / a code
 *                                shape we don't recognise — same UI treatment.
 *
 * The "must never silently route a returning shopper to sign-up" rule means
 * the route handler MUST return a `code` whenever the outcome is anything
 * other than `exists_true_*` / `exists_false` / `invalid_email`.
 */
export type AuthExistsOutcome =
  | "exists_true_wc"
  | "exists_true_wp_probe"
  | "exists_false"
  | "invalid_email"
  | "wc_not_configured"
  | "lookup_unavailable"
  | "lookup_failed";

export type AuthExistsResult = {
  outcome: AuthExistsOutcome;
  exists: boolean;
  /**
   * Public response code surfaced to the client. Only set when the outcome
   * is inconclusive — clients use it to decide whether to show "couldn't
   * check, try again" instead of routing the shopper to sign-up.
   */
  code?: "lookup_failed" | "lookup_unavailable";
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalise the raw query input to the canonical lookup string. Returns
 * null if the input cannot be turned into a valid-looking email — callers
 * should treat that as `invalid_email` (which is NOT an "account exists"
 * signal but also NOT inconclusive).
 */
export function normalizeAuthExistsEmail(raw: unknown): string | null {
  const trimmed = String(raw ?? "").trim().toLowerCase();
  if (!trimmed || trimmed.length > 254) return null;
  if (!EMAIL_RE.test(trimmed)) return null;
  return trimmed;
}

// ── Pure classifier ────────────────────────────────────────────────────────
// All upstream calls are injected so each branch (WC hit, WC empty, JWT
// probe variants, plugin missing, transport error) can be unit-tested
// without touching `fetch`.

export type FetchLike = (
  path: string,
  init?: RequestInit,
) => Promise<Response>;

export type ClassifyAuthExistsDeps = {
  email: string;
  /** WooCommerce REST configured? Pass `false` to skip the WC lookup. */
  wcConfigured: boolean;
  wcFetch: FetchLike;
  wpFetch: FetchLike;
};

/**
 * Run the WC + JWT-probe pipeline and classify the outcome. Pure with
 * respect to side effects beyond the injected fetchers; safe to call from
 * tests and from the route.
 *
 * Pre-condition: `email` is already normalised via
 * `normalizeAuthExistsEmail()` (lowercased, trimmed, syntactically valid).
 */
export async function classifyAuthExists(
  deps: ClassifyAuthExistsDeps,
): Promise<AuthExistsResult> {
  if (!deps.wcConfigured) {
    return {
      outcome: "wc_not_configured",
      exists: false,
      code: "lookup_unavailable",
    };
  }

  // 1) WooCommerce customer lookup. WC compares emails case-insensitively
  //    so the lowercased input is sufficient. We pass `per_page=1` because
  //    email is unique in WC — pagination is not relevant here.
  let wcRes: Response;
  try {
    wcRes = await deps.wcFetch(
      `/customers?email=${encodeURIComponent(deps.email)}&per_page=1`,
    );
  } catch {
    return { outcome: "lookup_failed", exists: false, code: "lookup_failed" };
  }
  if (!wcRes.ok) {
    return { outcome: "lookup_failed", exists: false, code: "lookup_failed" };
  }
  let wcList: unknown;
  try {
    wcList = await wcRes.json();
  } catch {
    return { outcome: "lookup_failed", exists: false, code: "lookup_failed" };
  }
  if (Array.isArray(wcList) && wcList.length > 0) {
    return { outcome: "exists_true_wc", exists: true };
  }

  // 2) WP JWT probe fallback for legacy / WP-only accounts. We send a
  //    deliberately bogus password and inspect the error code.
  let probeRes: Response;
  try {
    const probePassword =
      "_existscheck_" +
      Math.random().toString(36).slice(2) +
      Date.now().toString(36);
    probeRes = await deps.wpFetch(`/jwt-auth/v1/token`, {
      method: "POST",
      body: JSON.stringify({
        username: deps.email,
        password: probePassword,
      }),
    });
  } catch {
    return { outcome: "lookup_failed", exists: false, code: "lookup_failed" };
  }
  if (probeRes.status === 404) {
    // JWT plugin missing — we genuinely cannot answer.
    return {
      outcome: "lookup_unavailable",
      exists: false,
      code: "lookup_unavailable",
    };
  }
  let probeData: any = {};
  try {
    probeData = await probeRes.json();
  } catch {
    return { outcome: "lookup_failed", exists: false, code: "lookup_failed" };
  }
  const code = String(probeData?.code ?? "");
  if (/incorrect_password/i.test(code)) {
    return { outcome: "exists_true_wp_probe", exists: true };
  }
  if (/invalid_email|invalid_username|invalid_user/i.test(code)) {
    return { outcome: "exists_false", exists: false };
  }
  // Anything else (5xx, plugin disabled but reachable, malformed body, …)
  // is inconclusive. Never flip to "doesn't exist".
  return { outcome: "lookup_failed", exists: false, code: "lookup_failed" };
}

// ── Observability ──────────────────────────────────────────────────────────

/**
 * Persist one row per /auth/exists call to the existing `analytics_events`
 * table so the scheduled monitor can compute the inconclusive rate per UTC
 * day. We deliberately do NOT log the email, IP, or any other PII — only
 * the outcome bucket and the platform header, which is bounded by the
 * OpenAPI enum.
 *
 * Best-effort: a DB outage must never break the lookup itself. The 30-day
 * prune in checkoutLoginFunnelMonitor handles retention for this row too.
 */
export function recordAuthExistsOutcome(
  outcome: AuthExistsOutcome,
  platform: string | null,
): void {
  void db
    .insert(analyticsEventsTable)
    .values({
      name: "auth_exists_outcome",
      action: outcome,
      platform: platform && /^[a-z0-9_-]{1,16}$/i.test(platform) ? platform : null,
      surface: null,
      appVersion: null,
      userId: null,
      signedIn: false,
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        { err: message },
        "auth.exists: failed to persist outcome row (non-fatal)",
      );
    });
}
