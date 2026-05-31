import { Router, type IRouter, type Request, type Response } from "express";
import { getAuditHistory, getLastAuditSummary, runAuditNow } from "../lib/seoAuditMonitor";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Admin-only SEO audit endpoints.
//
// Auth: same `x-push-admin-token` header as the other admin endpoints
// (PUSH_ADMIN_TOKEN env). No session, no cookie.
//
// Endpoints:
//   GET  /api/admin/seo-audit/last    → JSON: { ok, summary: AuditSummary | null }
//   POST /api/admin/seo-audit/run     → JSON: AuditSummary
//   GET  /api/admin/seo-audit/history → JSON: { ok, days, rows }
//     ?days=N  — last N days of results (1–90, default 14)

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

/**
 * GET /api/admin/seo-audit/history?days=N
 *
 * Returns the last N days of SEO audit log rows (aggregate counts only, no
 * per-page detail), ordered newest-first. `days` defaults to 14 and is capped
 * at 90 (the retention window). Rows are appended by both the daily scheduled
 * run and on-demand `/run` calls.
 *
 * Response shape:
 *   { ok: true, days: number, rows: AuditHistoryRow[] }
 *
 * Each row:
 *   { id, ranAt, runType, total, failing, warned, passing }
 */
router.get("/admin/seo-audit/history", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const rawDays = req.query["days"];
  const days = rawDays ? parseInt(String(rawDays), 10) : 14;
  if (!Number.isFinite(days) || days < 1) {
    res.status(400).json({ ok: false, message: "days must be a positive integer" }); // i18n-ignore
    return;
  }

  try {
    const rows = await getAuditHistory(days);
    res.json({ ok: true, days: Math.min(days, 90), rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    req.log.warn({ err: message }, "adminSeoAudit: getAuditHistory failed");
    res.status(500).json({ ok: false, message: "Failed to fetch audit history" }); // i18n-ignore
  }
});

export default router;
