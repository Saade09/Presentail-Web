import { Router, type IRouter } from "express";
import { z } from "zod";
import { getOsProducts } from "../lib/osProductsCache";
import { getNewbornGenderMap } from "../lib/newbornGenderInference";

const router: IRouter = Router();

const NewbornGenderSchema = z.enum(["boy", "girl", "neutral"]);

const NewbornGenderResponseSchema = z.object({
  genders: z.record(z.string(), NewbornGenderSchema),
});

/**
 * GET /api/occasions/new-born/gender
 *
 * Returns AI-inferred gender classifications (boy | girl | neutral) for all
 * new-born occasion products in the Lebanon store. Results are derived from
 * keyword heuristics first (blue/navy/boy → "boy"; pink/rose/girl → "girl")
 * with a GPT fallback for ambiguous products, and a 24-hour in-process cache.
 *
 * Returns 503 when the OS product cache has not yet been populated.
 *
 * Uses getOsProducts() rather than hasOsProducts() so the endpoint is not
 * affected by the OS_PRODUCTS_DISABLED flag (same reasoning as the bear sizes
 * endpoint — this only classifies existing catalog data).
 */
router.get("/occasions/new-born/gender", async (req, res) => {
  const allProducts = getOsProducts("lebanon");
  if (!allProducts || allProducts.length === 0) {
    res.status(503).json({ error: "Product catalog not yet available" });
    return;
  }

  const newbornProducts = allProducts.filter((p) =>
    p.occasions?.some((o) => o.slug === "new-born"),
  );

  if (newbornProducts.length === 0) {
    const payload = NewbornGenderResponseSchema.parse({ genders: {} });
    res.json(payload);
    return;
  }

  const products = newbornProducts.map((p) => ({
    id: String(p.id),
    name: p.name,
    description: p.description ?? null,
  }));

  try {
    const rawGenders = await getNewbornGenderMap(products);
    const payload = NewbornGenderResponseSchema.parse({ genders: rawGenders });
    res.json(payload);
  } catch (err) {
    req.log.error({ err }, "newbornGender: failed to infer gender classifications");
    res.status(500).json({ error: "Failed to infer gender classifications" });
  }
});

export default router;
