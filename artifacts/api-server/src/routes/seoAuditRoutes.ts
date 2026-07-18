// SEO audit dashboard endpoints (admin-only).
//
// Auth: same x-push-admin-token header pattern as other admin endpoints.
//
// Endpoints:
//   GET  /seo/audit/latest      — most recent audit run with full summaryJson
//   POST /seo/audit/run         — trigger a new audit (async, immediate 202)
//   GET  /seo/audit/run/:id     — fetch a specific run by ID
//   GET  /seo/audit/history     — last 10 run summaries (no summaryJson)

import { Router, type Request, type Response } from "express";
import {
  runSeoAudit,
  createPendingRun,
  getLatestAuditRun,
  getAuditRunById,
  listAuditRunHistory,
} from "../lib/seoAuditEngine";
import { logger } from "../lib/logger";

const router = Router();

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
 * GET /api/seo/audit/latest
 * Returns the most recent seo_audit_runs row with full summaryJson.
 */
router.get("/seo/audit/latest", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const run = await getLatestAuditRun();
    if (!run) {
      res.status(404).json({ ok: false, message: "No audit run found" }); // i18n-ignore
      return;
    }
    res.json({ ok: true, run });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.warn({ err: msg }, "seoAuditRoutes: getLatestAuditRun failed");
    res.status(500).json({ ok: false, message: "Failed to fetch latest audit" }); // i18n-ignore
  }
});

/**
 * POST /api/seo/audit/run
 * Creates a pending run row immediately (returning its runId), then runs the
 * full audit asynchronously. The caller receives { runId, status: 'started' }
 * right away and can poll GET /seo/audit/run/:runId for the completed result.
 */
router.post("/seo/audit/run", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  // Create the DB row synchronously so we can return the runId immediately.
  const runId = await createPendingRun("manual");

  // Kick off the full audit async — do not await.
  (async () => {
    try {
      await runSeoAudit("manual", runId);
    } catch (err) {
      logger.warn({ err: (err as Error)?.message, runId }, "seoAuditRoutes: async runSeoAudit failed");
    }
  })();

  res.status(202).json({ ok: true, runId, status: "started" }); // i18n-ignore
});

/**
 * GET /api/seo/audit/run/:id
 * Returns a specific audit run by its numeric ID.
 */
router.get("/seo/audit/run/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const id = parseInt(req.params.id ?? "", 10);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ ok: false, message: "id must be a positive integer" }); // i18n-ignore
    return;
  }

  try {
    const run = await getAuditRunById(id);
    if (!run) {
      res.status(404).json({ ok: false, message: "Audit run not found" }); // i18n-ignore
      return;
    }
    res.json({ ok: true, run });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.warn({ err: msg, id }, "seoAuditRoutes: getAuditRunById failed");
    res.status(500).json({ ok: false, message: "Failed to fetch audit run" }); // i18n-ignore
  }
});

/**
 * GET /api/seo/audit/history
 * Returns the last 10 audit run summaries (without full summaryJson).
 */
router.get("/seo/audit/history", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const rows = await listAuditRunHistory();
    res.json({ ok: true, rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.warn({ err: msg }, "seoAuditRoutes: listAuditRunHistory failed");
    res.status(500).json({ ok: false, message: "Failed to fetch audit history" }); // i18n-ignore
  }
});

export default router;
