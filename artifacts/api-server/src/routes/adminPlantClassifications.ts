import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { plantEnvironmentCacheTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getOsProducts } from "../lib/osProductsCache";
import { classifyPlantProducts } from "../lib/plantEnvironmentInference";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const PLANTS_CATEGORY_SLUG = "plants";

function requireAdmin(req: Request, res: Response): boolean {
  const expected = process.env.PUSH_ADMIN_TOKEN;
  const supplied = req.header("x-push-admin-token") ?? req.header("x-admin-token");
  if (!expected || !supplied || supplied !== expected) {
    res.status(401).json({ ok: false, message: "Invalid or missing admin token" }); // i18n-ignore
    return false;
  }
  return true;
}

function getPlantProducts() {
  const allProducts = getOsProducts();
  if (!allProducts) return null;
  return allProducts.filter((p) => {
    const cats = p.categories ?? [];
    return cats.some(
      (c) =>
        c.slug === PLANTS_CATEGORY_SLUG ||
        c.name?.toLowerCase() === "plants",
    );
  });
}

// GET /api/admin/plant-classifications
// List all plant product classifications
router.get("/admin/plant-classifications", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  try {
    const rows = await db.select().from(plantEnvironmentCacheTable);
    res.json({ ok: true, rows });
  } catch (err) {
    logger.error({ err }, "adminPlantClassifications: failed to list rows");
    res.status(500).json({ ok: false, message: "Failed to list plant classifications" }); // i18n-ignore
  }
});

// PATCH /api/admin/plant-classifications/:osProductId
// Override the classification for a single product (sets source = "admin")
router.patch("/admin/plant-classifications/:osProductId", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const osProductId = String(req.params["osProductId"] ?? "");
  const { classification } = req.body as { classification?: string };

  if (classification !== "indoor" && classification !== "outdoor") {
    res.status(400).json({ ok: false, message: "classification must be 'indoor' or 'outdoor'" }); // i18n-ignore
    return;
  }

  try {
    const existing = await db
      .select()
      .from(plantEnvironmentCacheTable)
      .where(eq(plantEnvironmentCacheTable.osProductId, osProductId));

    if (existing.length === 0) {
      res.status(404).json({ ok: false, message: "Product classification not found" }); // i18n-ignore
      return;
    }

    const updated = await db
      .update(plantEnvironmentCacheTable)
      .set({
        classification,
        source: "admin",
        needsReview: false,
        classifiedAt: new Date(),
      })
      .where(eq(plantEnvironmentCacheTable.osProductId, osProductId))
      .returning();

    res.json({ ok: true, row: updated[0] });
  } catch (err) {
    logger.error({ err, osProductId }, "adminPlantClassifications: failed to override classification");
    res.status(500).json({ ok: false, message: "Failed to update classification" }); // i18n-ignore
  }
});

// POST /api/admin/plant-classifications/:osProductId/reclassify
// Wipe and re-run AI classification for one product
router.post(
  "/admin/plant-classifications/:osProductId/reclassify",
  async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;

    const osProductId = String(req.params["osProductId"] ?? "");
    const plantProducts = getPlantProducts();

    if (!plantProducts) {
      res.status(503).json({ ok: false, message: "OS product cache not available" }); // i18n-ignore
      return;
    }

    const product = plantProducts.find(
      (p) => String(p.osNumericId ?? p.id) === osProductId,
    );

    if (!product) {
      res.status(404).json({
        ok: false,
        message: "Product not found in plants catalog",  // i18n-ignore
      });
      return;
    }

    try {
      const results = await classifyPlantProducts(
        [
          {
            id: osProductId,
            name: product.name,
            imageUrl: product.images[0]?.url ?? null,
            description: product.description ?? null,
          },
        ],
        { forceReclassify: true },
      );

      const result = results.get(osProductId);
      res.json({ ok: true, osProductId, result });
    } catch (err) {
      logger.error({ err, osProductId }, "adminPlantClassifications: reclassify failed");
      res.status(500).json({ ok: false, message: "Reclassification failed" }); // i18n-ignore
    }
  },
);

// POST /api/admin/plant-classifications/bulk-reclassify
// Wipe all (or non-admin) classifications and re-run AI for all plant products
router.post("/admin/plant-classifications/bulk-reclassify", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const keepManual = req.query["keepManual"] === "true";
  const plantProducts = getPlantProducts();

  if (!plantProducts) {
    res.status(503).json({ ok: false, message: "OS product cache not available" }); // i18n-ignore
    return;
  }

  try {
    if (keepManual) {
      // Delete only non-admin rows
      const allRows = await db.select().from(plantEnvironmentCacheTable);
      const toDelete = allRows.filter((r) => r.source !== "admin");
      for (const row of toDelete) {
        await db
          .update(plantEnvironmentCacheTable)
          .set({ source: "fallback", needsReview: true })
          .where(eq(plantEnvironmentCacheTable.osProductId, row.osProductId));
      }
    } else {
      // Mark all as needing review so the job re-runs them all
      await db
        .update(plantEnvironmentCacheTable)
        .set({ source: "fallback", needsReview: true, classifiedAt: new Date() });
    }

    // Re-classify all plants (those not overridden by admin if keepManual=true)
    const toReclassify = plantProducts.map((p) => ({
      id: String(p.osNumericId ?? p.id),
      name: p.name,
      imageUrl: p.images[0]?.url ?? null,
      description: p.description ?? null,
    }));

    const results = await classifyPlantProducts(toReclassify, { forceReclassify: !keepManual });

    logger.info(
      { total: toReclassify.length, keepManual },
      "adminPlantClassifications: bulk-reclassify complete",
    );

    res.json({ ok: true, classified: results.size, keepManual });
  } catch (err) {
    logger.error({ err }, "adminPlantClassifications: bulk-reclassify failed");
    res.status(500).json({ ok: false, message: "Bulk reclassification failed" }); // i18n-ignore
  }
});

export default router;
