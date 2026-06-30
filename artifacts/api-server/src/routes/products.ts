import { Router, type IRouter } from "express";
import { z } from "zod";
import { inferProductColors } from "../lib/productColorInference";
import { getOsProductBySlug } from "../lib/osProductsCache";

const router: IRouter = Router();

const ProductItemSchema = z.object({
  slug: z.string().min(1).max(200),
  name: z.string().min(1).max(500),
});

const ColorHintsRequestSchema = z.object({
  products: z.array(ProductItemSchema).min(1).max(200),
});

router.post("/products/color-hints", async (req, res) => {
  const parsed = ColorHintsRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }

  const colors = await inferProductColors(parsed.data.products);
  res.json({ colors });
});

type StoreCityInfo = {
  storeKey: string;
  countryCode: string;
  countrySlug: string;
  cityId: string | null;
  citySlug: string;
  cityLabel: string;
};

const STORE_CITY_INFO: Record<string, Omit<StoreCityInfo, "storeKey">> = {
  lebanon: { countryCode: "LB", countrySlug: "lb", cityId: null, citySlug: "beirut", cityLabel: "Lebanon" },
  dubai: { countryCode: "AE", countrySlug: "ae", cityId: "ae-dubai", citySlug: "dubai", cityLabel: "Dubai" },
  abudhabi: { countryCode: "AE", countrySlug: "ae", cityId: "ae-abu-dhabi", citySlug: "abu-dhabi", cityLabel: "Abu Dhabi" },
  cyprus: { countryCode: "CY", countrySlug: "cy", cityId: null, citySlug: "nicosia", cityLabel: "Cyprus" },
};

const KNOWN_STORE_KEYS = ["lebanon", "dubai", "abudhabi", "cyprus"] as const;

/**
 * GET /api/products/availability/:slug
 *
 * Cross-city availability check. Queries the in-process OS product cache
 * across all known stores to determine whether a product slug is known at all
 * (as opposed to not available in the shopper's current city). Used by the
 * web storefront to distinguish "city unavailable" from "truly not found".
 *
 * Returns:
 *   { exists: false }                              — slug unknown in any store
 *   { exists: true, productName, slug, category,
 *     brand, availableStores: [...] }              — product known; stores list
 */
router.get("/products/availability/:slug", (req, res) => {
  const slug = req.params.slug as string;
  if (!slug || slug.length > 300) {
    res.status(400).json({ ok: false, error: "Invalid slug" });
    return;
  }

  const availableStores: StoreCityInfo[] = [];
  let productName: string | undefined;
  let category: string | undefined;
  let brand: string | undefined;

  for (const storeKey of KNOWN_STORE_KEYS) {
    const p = getOsProductBySlug(slug, storeKey);
    if (p) {
      if (!productName) {
        productName = p.name;
        category = p.categories[0]?.slug;
        brand = p.brands[0]?.slug;
      }
      availableStores.push({ storeKey, ...STORE_CITY_INFO[storeKey] });
    }
  }

  if (availableStores.length === 0) {
    res.json({ exists: false });
    return;
  }

  res.json({
    exists: true,
    productName,
    slug,
    category,
    brand,
    availableStores,
  });
});

export default router;
