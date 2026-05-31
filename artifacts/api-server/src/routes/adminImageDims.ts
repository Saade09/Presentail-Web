import { Router, type IRouter } from "express";
import { lt } from "drizzle-orm";
import { db, imageDimsTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const IMAGE_DIMS_PRUNE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Manual trigger for the image_dims stale-row cleanup. Protected by the same
// PUSH_ADMIN_TOKEN used by /api/woo/sync/run and the order-event endpoint.
// Mirrors the daily prune that runs automatically in the web server (serve.mjs)
// but lets ops reclaim space on demand, e.g. after a large product-photo rotation.
//
// Returns { ok: true, deleted: N } so the caller can see how many rows were removed.
router.post("/admin/image-dims/prune", async (req, res) => {
  const adminToken = process.env.PUSH_ADMIN_TOKEN;
  const supplied =
    req.header("x-push-admin-token") ?? req.header("x-admin-token");
  if (!adminToken || !supplied || supplied !== adminToken) {
    res
      .status(401)
      .json({ ok: false, message: "Invalid or missing admin token" });
    return;
  }

  try {
    const cutoff = new Date(Date.now() - IMAGE_DIMS_PRUNE_AGE_MS);
    const result = await db
      .delete(imageDimsTable)
      .where(lt(imageDimsTable.fetchedAt, cutoff))
      .returning({ url: imageDimsTable.url });

    const deleted = result.length;
    req.log.info({ deleted }, "adminImageDims: manual prune completed");
    res.json({ ok: true, deleted });
  } catch (err: any) {
    logger.warn({ err: err?.message }, "adminImageDims: prune failed");
    res
      .status(500)
      .json({ ok: false, message: err?.message ?? "Prune failed" });
  }
});

export default router;
