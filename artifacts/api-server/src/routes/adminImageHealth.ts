import { Router, type IRouter } from "express";
import { checkAdminToken } from "../lib/admin-auth";
import { runCatalogImageHealthCheck } from "../lib/catalogImageHealth";
import { getImageProxyMetrics } from "../lib/imageProxyMetrics";

const router: IRouter = Router();

router.get("/admin/image-health/metrics", (req, res) => {
  if (!checkAdminToken(req, res)) return;
  res.json({ ok: true, metrics: getImageProxyMetrics() });
});

router.post("/admin/image-health/run", async (req, res) => {
  if (!checkAdminToken(req, res)) return;
  const rawLimit = Number(req.query.limit ?? 60);
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 500) {
    res.status(400).json({ ok: false, message: "limit must be an integer from 1 to 500" }); // i18n-ignore
    return;
  }
  try {
    const summary = await runCatalogImageHealthCheck(rawLimit);
    res.json({ ok: true, ...summary });
  } catch (error) {
    req.log?.warn(
      { err: error instanceof Error ? error.message : String(error) },
      "admin image health check failed",
    );
    res.status(500).json({ ok: false, message: "Image health check failed" }); // i18n-ignore
  }
});

export default router;