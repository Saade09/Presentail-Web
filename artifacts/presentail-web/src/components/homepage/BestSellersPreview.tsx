import { useMemo } from "react";
import { useCategoryProducts, useOccasionFlatProducts, type Product } from "@/lib/queries";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { homepageShuffleSeed, seededShuffle } from "@/lib/shuffle";
import { ProductCollectionCarousel } from "./ProductCollectionCarousel";

type Props = {
  /** Catalog category slug to feature; hidden when the category has no products. */
  categorySlug?: string;
  /**
   * Occasion slug to feature instead of a category. When set, products are
   * filtered by occasion rather than category (use for OS occasions like "summer").
   */
  occasionSlug?: string;
  /** Optional override for the section title locale key. */
  titleKey?: string;
  /** Distinct seed key so multiple rails on the same page rotate independently. */
  railKey?: string;
  /** Where the "View All" link points. */
  viewAllHref?: string;
  /** Maximum number of cards to show. */
  limit?: number;
  testId?: string;
  /**
   * When provided, bypasses the internal category/occasion fetch and shuffle
   * and renders these products directly. Used by the Best Sellers section to
   * display API-ranked products without the seeded-shuffle path.
   */
  products?: Product[];
  /** When `products` is provided, whether the data is still loading. */
  isLoadingExternal?: boolean;
};

/**
 * Themed product collection rail (e.g. "Summer Collection" on the live site).
 * Supports both category-based and occasion-based filtering via categorySlug /
 * occasionSlug props. If the category/occasion has no products and loading is
 * complete, the section is hidden entirely. The candidate pool is reshuffled
 * once per UTC day per (rail, store) so the featured items rotate over time.
 *
 * Pass `products` to bypass the internal fetch entirely and render a
 * pre-ranked list (e.g. from the /api/homepage/best-sellers endpoint).
 */
export function BestSellersPreview({
  categorySlug = "hand-bouquets",
  occasionSlug,
  titleKey = "bestSellers.title",
  railKey = "best-sellers",
  viewAllHref,
  limit = 8,
  testId = "section-best-sellers",
  products: externalProducts,
  isLoadingExternal = false,
}: Props) {
  const { t, language } = useLocale();
  const { countryCode, cityId } = useLocationSelection();
  const locParams: { countryCode?: string; cityId?: string; lang?: string } = { lang: language };
  if (countryCode) locParams.countryCode = countryCode;
  if (cityId) locParams.cityId = cityId;

  const catQuery = useCategoryProducts(
    externalProducts !== undefined || occasionSlug ? "" : categorySlug,
    locParams,
  );
  const occQuery = useOccasionFlatProducts(
    externalProducts !== undefined ? "" : (occasionSlug ?? ""),
    locParams,
  );
  const activeQuery = occasionSlug ? occQuery : catQuery;

  const shuffledProducts = useMemo(() => {
    if (externalProducts !== undefined) return externalProducts.slice(0, limit);
    const catProducts = activeQuery.data?.products ?? [];
    return seededShuffle(catProducts, homepageShuffleSeed(railKey, countryCode, cityId)).slice(0, limit);
  }, [externalProducts, activeQuery.data?.products, countryCode, cityId, railKey, limit]);

  const isLoading = externalProducts !== undefined ? isLoadingExternal : activeQuery.isLoading;

  if (!isLoading && shuffledProducts.length === 0) {
    return null;
  }

  const href = viewAllHref ?? (occasionSlug
    ? `/occasion/${encodeURIComponent(occasionSlug)}`
    : `/category/${encodeURIComponent(categorySlug)}`);

  return (
    <ProductCollectionCarousel
      title={t(titleKey)}
      viewAllHref={href}
      products={shuffledProducts}
      isLoading={isLoading}
      testId={testId}
    />
  );
}
