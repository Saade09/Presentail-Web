/**
 * GET /api/products/frequently-bought-together
 *
 * Returns up to 4 in-stock products that are most frequently co-purchased
 * with the given anchor product. Only applies to products in flower or cake
 * categories (configurable via AFFINITY_CATEGORY_SLUGS).
 *
 * Query params:
 *   slug  — OS product slug of the anchor product (required)
 *   store — store key: lebanon | dubai | abudhabi | cyprus (optional, defaults to lebanon)
 *
 * Cold-start behaviour:
 *   When fewer than 2 co-purchase matches are found in `product_pair_affinity`,
 *   the gap is filled with the top-selling in-stock products from the same
 *   category up to a total of 4 results.
 */

import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, productPairAffinityTable } from "@workspace/db";
import { or, eq, desc } from "drizzle-orm";
import {
  getOsProducts,
  getOsProductBySlug,
  hasOsProducts,
} from "../lib/osProductsCache";
import type { StoreKey } from "../lib/wooStore";

const router: IRouter = Router();

// Category slugs that are eligible for the FBT section.
// Add more slugs here (comma-separated env var) to extend to other categories
// without a code change.
const AFFINITY_CATEGORY_SLUGS: Set<string> = new Set(
  (
    process.env.AFFINITY_CATEGORY_SLUGS ?? // i18n-ignore — internal category slug config, not user-visible copy
    "flowers,hand-bouquets,flower-boxes,flower-baskets,flower-vases,preserved-flowers,lux-arrangements,cakes"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

const MAX_RESULTS = 4;

const QuerySchema = z.object({
  slug: z.string().min(1).max(300),
  store: z
    .enum(["lebanon", "dubai", "abudhabi", "cyprus"])
    .optional()
    .default("lebanon"),
});

router.get("/products/frequently-bought-together", async (req, res) => {
  const parsed = QuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }

  const { slug: anchorSlug, store } = parsed.data;
  const storeKey = store as StoreKey;

  if (!hasOsProducts(storeKey)) {
    res.status(503).json({ error: "Product catalog not yet available" });
    return;
  }

  // Resolve anchor product.
  const anchor = getOsProductBySlug(anchorSlug, storeKey);
  if (!anchor) {
    res.json({ products: [] });
    return;
  }

  // Category gate — only Flowers and Cakes (or whatever AFFINITY_CATEGORY_SLUGS contains).
  const anchorCategories = anchor.categories.map((c) => c.slug ?? c.id);
  const isEligibleCategory = anchorCategories.some((c) => AFFINITY_CATEGORY_SLUGS.has(c));
  if (!isEligibleCategory) {
    res.json({ products: [] });
    return;
  }

  // Query product_pair_affinity for the top partner slugs.
  const pairRows = await db
    .select({
      productSlugA: productPairAffinityTable.productSlugA,
      productSlugB: productPairAffinityTable.productSlugB,
      coPurchaseCount: productPairAffinityTable.coPurchaseCount,
    })
    .from(productPairAffinityTable)
    .where(
      or(
        eq(productPairAffinityTable.productSlugA, anchorSlug),
        eq(productPairAffinityTable.productSlugB, anchorSlug),
      ),
    )
    .orderBy(desc(productPairAffinityTable.coPurchaseCount))
    .limit(10); // fetch a few extra to account for OOS filtering

  // Resolve partner slugs and filter to in-stock products.
  const resolved: Array<{
    id: string;
    name: string;
    price: number;
    images: { uri: string }[];
    category: string;
    inStock: boolean;
    priceValue?: number;
    discountPriceValue?: number | null;
    discountPriceAed?: number | null;
    slug: string;
  }> = [];

  const seenIds = new Set<string>();
  seenIds.add(anchorSlug); // never include the anchor itself

  for (const row of pairRows) {
    if (resolved.length >= MAX_RESULTS) break;
    const partnerSlug =
      row.productSlugA === anchorSlug ? row.productSlugB : row.productSlugA;
    if (seenIds.has(partnerSlug)) continue;
    seenIds.add(partnerSlug);

    const product = getOsProductBySlug(partnerSlug, storeKey);
    if (!product || !product.inStock) continue;

    resolved.push(formatProduct(product));
  }

  // Cold-start fill: if we have fewer than 2 affinity matches, pad with
  // top-selling in-stock products from the same category.
  if (resolved.length < 2) {
    const allProducts = getOsProducts(storeKey) ?? [];
    const topSellers = allProducts
      .filter(
        (p) =>
          p.inStock &&
          !seenIds.has(p.id) &&
          p.categories.some((c) => {
            const catSlug = c.slug ?? c.id;
            return anchorCategories.includes(catSlug) || AFFINITY_CATEGORY_SLUGS.has(catSlug);
          }),
      )
      .sort((a, b) => (b.totalSales ?? 0) - (a.totalSales ?? 0));

    for (const p of topSellers) {
      if (resolved.length >= MAX_RESULTS) break;
      if (seenIds.has(p.id)) continue;
      seenIds.add(p.id);
      resolved.push(formatProduct(p));
    }
  }

  res.json({ products: resolved });
});

type OSProductLike = {
  id: string;
  name: string;
  price: number;
  images: Array<{ url?: string; src?: string }>;
  categories: Array<{ slug?: string; id?: string }>;
  inStock: boolean;
  discount_price_usd?: string | null;
  discount_price_aed?: string | null;
};

function formatProduct(product: OSProductLike) {
  const firstImage = product.images?.[0];
  const imageUri = firstImage?.url ?? firstImage?.src ?? undefined;
  const categorySlug =
    (product.categories?.[0]?.slug ?? product.categories?.[0]?.id) ?? "";
  const discountPriceValue = product.discount_price_usd
    ? parseFloat(product.discount_price_usd)
    : null;
  const discountPriceAed = product.discount_price_aed
    ? parseFloat(product.discount_price_aed)
    : null;
  return {
    slug: product.id,
    id: product.id,
    name: product.name,
    price: product.price,
    priceValue: product.price,
    category: categorySlug,
    inStock: product.inStock,
    images: imageUri ? [{ uri: imageUri }] : [],
    discountPriceValue: isNaN(discountPriceValue ?? NaN)
      ? null
      : discountPriceValue,
    discountPriceAed: isNaN(discountPriceAed ?? NaN) ? null : discountPriceAed,
  };
}

export default router;
