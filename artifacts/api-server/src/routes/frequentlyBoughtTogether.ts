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
    "cakes,flowers,flowers-plants"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

// Complementary category slugs used when cold-start fill is needed.
// Keys are any anchor category slug; values are the slugs to pull suggestions from.
const COMPLEMENTARY_CATEGORIES: Record<string, string[]> = {
  flowers: ["chocolates", "balloons", "teddy-bears", "cakes", "gift-cards"],
  "flowers-plants": ["chocolates", "balloons", "teddy-bears", "cakes", "gift-cards"],
  cakes: ["flowers", "flowers-plants", "balloons", "chocolates", "teddy-bears"],
};

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
    // Cache not yet warm — return empty gracefully so the section stays hidden
    // without logging a client error (503 would cause retry noise).
    res.json({ products: [] });
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
  // top-selling in-stock products from complementary categories.
  if (resolved.length < 2) {
    // Build the set of complementary slugs for this anchor.
    const complementarySlugs = new Set<string>();
    for (const catSlug of anchorCategories) {
      for (const compSlug of COMPLEMENTARY_CATEGORIES[catSlug] ?? []) {
        complementarySlugs.add(compSlug);
      }
    }
    // Fall back to same-category fill if no complementary map is defined.
    if (complementarySlugs.size === 0) {
      for (const catSlug of anchorCategories) complementarySlugs.add(catSlug);
    }

    const allProducts = getOsProducts(storeKey) ?? [];
    const topSellers = allProducts
      .filter(
        (p) =>
          p.inStock &&
          !seenIds.has(p.id) &&
          p.categories.some((c) => {
            const catSlug = c.slug ?? c.id ?? "";
            return complementarySlugs.has(catSlug);
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
  regular_price?: string | null;
  sale_price?: string | null;
};

function parseDiscountField(raw: string | null | undefined): number | null {
  if (raw == null || raw === "" || raw === "0") return null;
  const n = parseFloat(raw);
  return isFinite(n) && n > 0 ? n : null;
}

function formatProduct(product: OSProductLike) {
  const firstImage = product.images?.[0];
  const imageUri = firstImage?.url ?? firstImage?.src ?? undefined;
  const categorySlug =
    (product.categories?.[0]?.slug ?? product.categories?.[0]?.id) ?? "";

  // Prefer OS-native regular_price / sale_price pair over legacy discount fields.
  // regular_price is the crossed-out "was" price; the active sale price is resolved as:
  //   1. sale_price (explicit field), if valid and < regular_price
  //   2. product.price (WC active selling price), if < regular_price
  //   3. No discount (no sale active)
  // When regular_price is absent, fall back to legacy discount_price_usd.
  const regularPriceValue = parseDiscountField(product.regular_price);
  const salePriceField = parseDiscountField(product.sale_price);

  const priceValue =
    regularPriceValue != null && regularPriceValue > 0 ? regularPriceValue : product.price;

  let discountPriceValue: number | null;
  if (regularPriceValue != null && regularPriceValue > 0) {
    if (salePriceField != null && salePriceField > 0 && salePriceField < regularPriceValue) {
      discountPriceValue = salePriceField;
    } else if (product.price > 0 && product.price < regularPriceValue) {
      discountPriceValue = product.price;
    } else {
      discountPriceValue = null;
    }
  } else {
    discountPriceValue = parseDiscountField(product.discount_price_usd);
  }

  const discountPriceAed = parseDiscountField(product.discount_price_aed);

  return {
    slug: product.id,
    id: product.id,
    name: product.name,
    price: priceValue,
    priceValue,
    category: categorySlug,
    inStock: product.inStock,
    images: imageUri ? [{ uri: imageUri }] : [],
    discountPriceValue,
    discountPriceAed,
  };
}

export default router;
