import { Router, type IRouter } from "express";
import { z } from "zod";
import { getOsProducts } from "../lib/osProductsCache";
import { getBearSizeMap } from "../lib/bearSizeInference";

const router: IRouter = Router();

const BearSizeSchema = z.enum(["small", "medium", "life-size"]);

const StuffedAnimalsSizesResponseSchema = z.object({
  sizes: z.record(z.string(), BearSizeSchema),
});

/**
 * GET /api/categories/stuffed-animals/sizes
 *
 * Returns AI-inferred size classifications (small | medium | life-size) for
 * all stuffed-animals products in the Lebanon store (used as the canonical
 * product catalog for this classification). Results are derived from keyword
 * heuristics first (checking name + description) and GPT for ambiguous names,
 * with a 24-hour in-process cache so classifications are never recomputed on
 * every page load.
 *
 * Returns 503 when the OS product cache has not yet been populated.
 *
 * Reads the catalog via getOsProducts() rather than gating on hasOsProducts()
 * because the latter honours OS_PRODUCTS_DISABLED (a "force WooCommerce for
 * order/checkout flows" switch). This endpoint only classifies existing catalog
 * data — which the OS cache holds regardless of that flag — so it must not be
 * disabled by it.
 */
router.get("/categories/stuffed-animals/sizes", async (req, res) => {
  const allProducts = getOsProducts("lebanon");
  if (!allProducts || allProducts.length === 0) {
    res.status(503).json({ error: "Product catalog not yet available" });
    return;
  }

  const stuffedAnimals = allProducts.filter((p) =>
    p.categories.some((c) => c.slug === "stuffed-animals"),
  );

  if (stuffedAnimals.length === 0) {
    const payload = StuffedAnimalsSizesResponseSchema.parse({ sizes: {} });
    res.json(payload);
    return;
  }

  const bearProducts = stuffedAnimals.map((p) => ({
    id: String(p.id),
    name: p.name,
    description: p.description ?? null,
  }));

  try {
    const rawSizes = await getBearSizeMap(bearProducts);
    const payload = StuffedAnimalsSizesResponseSchema.parse({ sizes: rawSizes });
    res.json(payload);
  } catch (err) {
    req.log.error({ err }, "categories: failed to infer bear sizes");
    res.status(500).json({ error: "Failed to infer bear sizes" });
  }
});

export default router;
