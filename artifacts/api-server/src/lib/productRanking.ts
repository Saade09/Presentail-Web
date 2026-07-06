/**
 * Smart product ranking utility for homepage and collection pages.
 *
 * Computes a composite score from signals available in the OS product cache:
 *   - Popularity   (50%): Bayesian-smoothed totalSales
 *   - Freshness    (30%): min-max normalised osNumericId (higher PK = newer)
 *   - Featured     (20%): binary featured flag
 *
 * Sorting modes:
 *   recommended  – composite score descending (default for collection pages)
 *   best_sellers – Bayesian-smoothed popularity descending
 *   newest       – osNumericId descending (highest ID = most recently added)
 *   price_asc    – price ascending
 *   price_desc   – price descending
 *
 * Signals intentionally excluded (not available from OS today):
 *   inventory health levels (only boolean inStock is returned)
 *   per-product rating / review count
 *   same-day delivery availability per product
 */

export type ProductSortMode =
  | "recommended"
  | "best_sellers"
  | "newest"
  | "price_asc"
  | "price_desc";

/** Minimal product shape required for ranking — satisfied by OSProduct. */
export type RankableProduct = {
  totalSales?: number;
  osNumericId?: number | string;
  featured?: boolean;
  price: number;
};

const POPULARITY_PRIOR = 20;

/**
 * Bayesian-smoothed popularity score in [0, 1).
 * Products with zero sales get 0; well-established best-sellers approach 1.
 */
function popularityScore(totalSales: number | undefined): number {
  const sales = totalSales ?? 0;
  return sales / (sales + POPULARITY_PRIOR);
}

/**
 * Sort a product array in-place (or return a new sorted array) according to
 * `mode`. For `recommended` and `best_sellers` the function needs global
 * context (min/max IDs, total set) so it operates on the full list at once.
 *
 * This function **does not mutate** the input array — it returns a new array.
 */
export function sortProducts<T extends RankableProduct>(
  products: T[],
  mode: ProductSortMode = "recommended",
): T[] {
  if (products.length === 0) return products;

  if (mode === "price_asc") {
    return [...products].sort((a, b) => a.price - b.price);
  }
  if (mode === "price_desc") {
    return [...products].sort((a, b) => b.price - a.price);
  }
  if (mode === "newest") {
    return [...products].sort((a, b) => {
      const aId = Number(a.osNumericId ?? 0);
      const bId = Number(b.osNumericId ?? 0);
      return bId - aId;
    });
  }
  if (mode === "best_sellers") {
    return [...products].sort(
      (a, b) => popularityScore(b.totalSales) - popularityScore(a.totalSales),
    );
  }

  // mode === "recommended": composite score
  // Pre-compute min/max osNumericId for freshness normalisation.
  let minId = Infinity;
  let maxId = -Infinity;
  for (const p of products) {
    const id = Number(p.osNumericId ?? 0);
    if (id > 0) {
      if (id < minId) minId = id;
      if (id > maxId) maxId = id;
    }
  }
  const idRange = maxId > minId ? maxId - minId : 1;

  return [...products].sort((a, b) => {
    const scoreA = compositeScore(a, minId, idRange);
    const scoreB = compositeScore(b, minId, idRange);
    return scoreB - scoreA;
  });
}

function compositeScore(
  p: RankableProduct,
  minId: number,
  idRange: number,
): number {
  const pop = popularityScore(p.totalSales);

  const id = Number(p.osNumericId ?? 0);
  const fresh = id > 0 ? (id - minId) / idRange : 0;

  const featured = p.featured ? 1 : 0;

  return 0.5 * pop + 0.3 * fresh + 0.2 * featured;
}
