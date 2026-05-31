import { Router, type IRouter, type Request, type Response } from "express";
import { runAuditNow, getLastAuditSummary } from "../lib/seoAuditMonitor";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Admin-only on-demand SEO audit endpoint.
//
// Auth: same `x-push-admin-token` header as the other admin endpoints
// (PUSH_ADMIN_TOKEN env). No session, no cookie.
//
// Endpoints:
//   GET  /api/admin/seo-audit/last → JSON: { ok, summary: AuditSummary | null }
//   POST /api/admin/seo-audit/run  → JSON: AuditSummary

function requireAdmin(req: Request, res: Response): boolean {
  const expected = process.env.PUSH_ADMIN_TOKEN;
  const supplied =
    req.header("x-push-admin-token") ?? req.header("x-admin-token");
  if (!expected || !supplied || supplied !== expected) {
    res
      .status(401)
      .json({ ok: false, message: "Invalid or missing admin token" }); // i18n-ignore
    return false;
  }
  return true;
}

/**
 * GET /api/admin/seo-audit/last
 *
 * Returns the most recent cached AuditSummary (populated by the nightly
 * scheduler or a previous /run call, persisted across restarts via the
 * analytics_key_value table). Returns `{ ok: true, summary: null }` when no
 * audit has completed since the server started.
 */
router.get("/admin/seo-audit/last", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const summary = getLastAuditSummary();
  res.json({ ok: true, summary });
});

/**
 * POST /api/admin/seo-audit/run
 *
 * Triggers the SEO audit immediately, bypassing the daily guard. Returns a
 * per-page breakdown with og:image URL, reachability, size check, and a
 * top-level status ("error" | "warn" | "ok") so ops can act without digging
 * through logs after a deploy or content change.
 *
 * Returns 409 when an audit is already in progress.
 */
router.post("/admin/seo-audit/run", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const summary = await runAuditNow();
    res.json({ ok: true, ...summary });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Audit already in progress") {
      res.status(409).json({ ok: false, message });
      return;
    }
    req.log.warn({ err: message }, "adminSeoAudit: runAuditNow failed");
    logger.warn({ err: message }, "adminSeoAudit: runAuditNow failed");
    res.status(500).json({ ok: false, message: "Audit failed" }); // i18n-ignore
  }
});

export default router;
