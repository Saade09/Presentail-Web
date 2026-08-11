/**
 * Shared admin-token authentication utilities.
 *
 * All admin endpoints are protected by a single shared secret
 * (PUSH_ADMIN_TOKEN env var) passed in the x-push-admin-token (or
 * x-admin-token) request header. Use the helpers here instead of
 * duplicating the check in each route file so the comparison is always
 * constant-time and centrally maintained.
 */
import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * Compares two strings in constant time so token comparisons do not
 * leak information about how many leading bytes matched (timing oracle).
 *
 * Pads to the longer length before comparing so the branch on unequal
 * lengths cannot be used to infer the expected value's length.
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    // Run a dummy comparison so elapsed time is independent of where the
    // mismatch occurred, then unconditionally return false.
    const pad = Buffer.alloc(bBuf.length);
    timingSafeEqual(pad, bBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Boolean-style guard for use inside route handlers.
 *
 * Returns `true` when the request carries a valid PUSH_ADMIN_TOKEN.
 * Returns `false` after sending a 401 response — callers should
 * `return` immediately when this returns false.
 *
 * Example:
 *   if (!checkAdminToken(req, res)) return;
 */
/**
 * Checks the PUSH_ADMIN_TOKEN against the x-push-admin-token (or x-admin-token)
 * request header using a constant-time comparison to prevent timing oracle attacks.
 *
 * Pass `explicitSupplied` to override the default header extraction — useful
 * when a specific endpoint accepts the token via an additional input source
 * (e.g. a request body field) that is normalised by the caller before the
 * check.  The timing-safe comparison is applied regardless of the source.
 *
 * Returns true if the token is valid, false if the check failed (response already sent).
 */
export function checkAdminToken(
  req: Request,
  res: Response,
  explicitSupplied?: string | undefined,
): boolean {
  const expected = process.env.PUSH_ADMIN_TOKEN;
  const supplied =
    explicitSupplied ??
    req.header("x-push-admin-token") ??
    req.header("x-admin-token");
  if (!expected || !supplied || !timingSafeEqualStr(supplied, expected)) {
    res
      .status(401)
      .json({ ok: false, message: "Invalid or missing admin token" }); // i18n-ignore
    return false;
  }
  return true;
}

/**
 * Express middleware variant for use with `router.use()` or as a
 * route-level middleware argument.
 *
 * Example:
 *   router.post("/admin/foo", requireAdminToken, handler);
 */
export function requireAdminToken(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!checkAdminToken(req, res)) return;
  next();
}
