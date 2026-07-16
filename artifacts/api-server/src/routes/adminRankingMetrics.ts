/**
 * Admin endpoint: GET /api/admin/ranking-metrics
 *
 * Returns the current precomputed product ranking metrics for debugging.
 * Protected by PUSH_ADMIN_TOKEN (same as other admin endpoints).
 *
 * Query parameters:
 *   product_id   — OS product ID (string). When supplied, returns the single
 *                  product's metrics + score breakdown for every known section.
 *                  When omitted, returns a summary of all rows.
 *   section_key  — Homepage section key (e.g. "best-sellers"). Used alongside
 *                  product_id to compute a score breakdown for that section.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import {
  getMetricsCache,
  getMetricsCacheUpdatedAt,
  rankProducts,
  RANKING_SCORE_VERSION,
} from "../lib/productRankingService";
import { forceProductMetricsSync } from "../lib/productMetricsSyncJob";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response): boolean {
  const expected = process.env.PUSH_ADMIN_TOKEN;
  const supplied =
    req.header("x-push-admin-token") ?? req.header("x-admin-token");
  if (!expected || !supplied || supplied !== expected) {
    res.status(401).json({ ok: false, message: "Invalid or missing admin token" }); // i18n-ignore
    return false;
  }
  return true;
}

const KNOWN_SECTIONS = ["best-sellers", "rail-summer", "rail-boxes", "rail-balloons"];

router.get("/admin/ranking-metrics", (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const cache = getMetricsCache();
  const updatedAt = getMetricsCacheUpdatedAt();
  const productId =
    typeof req.query.product_id === "string" ? req.query.product_id.trim() : null;

  if (productId) {
    const metrics = cache.get(productId);
    if (!metrics) {
      return res.status(404).json({
        ok: false,
        message: `No metrics found for product_id: ${productId}`, // i18n-ignore
        cacheSize: cache.size,
        rankingScoreVersion: RANKING_SCORE_VERSION,
      });
    }

    // Compute score breakdown for every known section
    const mockProduct = {
      id: productId,
      osNumericId: metrics.osNumericId ? Number(metrics.osNumericId) : null,
      totalSales: metrics.sales30d,
      inStock: metrics.stockScore > 0,
    };

    const scoreBreakdown: Record<string, object> = {};
    for (const section of KNOWN_SECTIONS) {
      const { debug } = rankProducts([mockProduct], section, cache);
      const d = debug.get(productId);
      if (d) scoreBreakdown[section] = d;
    }

    return res.json({
      ok: true,
      rankingScoreVersion: RANKING_SCORE_VERSION,
      cacheUpdatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
      metrics: {
        ...metrics,
        rankingStartAt: metrics.rankingStartAt
          ? new Date(metrics.rankingStartAt).toISOString()
          : null,
        rankingEndAt: metrics.rankingEndAt
          ? new Date(metrics.rankingEndAt).toISOString()
          : null,
        lastOsSyncAt: metrics.lastOsSyncAt
          ? new Date(metrics.lastOsSyncAt).toISOString()
          : null,
        lastWebsiteCalculationAt: metrics.lastWebsiteCalculationAt
          ? new Date(metrics.lastWebsiteCalculationAt).toISOString()
          : null,
        updatedAt: new Date(metrics.updatedAt).toISOString(),
      },
      scoreBreakdown,
    });
  }

  // Summary: all products with key ranking signals
  const summary = [...cache.values()].map((m) => ({
    osProductId: m.osProductId,
    osNumericId: m.osNumericId,
    productName: m.productName,
    sales30d: m.sales30d,
    normSales30d: m.normSales30d,
    normClicks30d: m.normClicks30d,
    normAddToCarts30d: m.normAddToCarts30d,
    freshnessScore: m.freshnessScore,
    stockScore: m.stockScore,
    rankingBoost: m.rankingBoost,
    rankingPenalty: m.rankingPenalty,
    pinnedPosition: m.pinnedPosition,
    excludedFromSectionJson: m.excludedFromSectionJson,
    lastOsSyncAt: m.lastOsSyncAt
      ? new Date(m.lastOsSyncAt).toISOString()
      : null,
  }));

  summary.sort((a, b) => (b.normSales30d ?? 0) - (a.normSales30d ?? 0));

  return res.json({
    ok: true,
    rankingScoreVersion: RANKING_SCORE_VERSION,
    cacheUpdatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
    count: summary.length,
    products: summary,
  });
});

router.post("/admin/ranking-metrics/sync", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    await forceProductMetricsSync();
    const cache = getMetricsCache();
    return res.json({ ok: true, count: cache.size });
  } catch (err: unknown) {
    req.log.warn({ err }, "admin/ranking-metrics/sync: force sync failed");
    return res.status(500).json({ ok: false, message: "Sync failed" }); // i18n-ignore
  }
});

export default router;
