import { useMemo } from "react";
import { useCategoryProducts, useProducts } from "@/lib/queries";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { homepageShuffleSeed, seededShuffle } from "@/lib/shuffle";
import { ProductCollectionCarousel } from "./ProductCollectionCarousel";

type Props = {
  /** Catalog category slug to feature; falls back to all products if empty. */
  categorySlug?: string;
  /** Optional override for the section title locale key. */
  titleKey?: string;
  /** Distinct seed key so multiple rails on the same page rotate independently. */
  railKey?: string;
  /** Where the "View All" link points. */
  viewAllHref?: string;
  /** Maximum number of cards to show. */
  limit?: number;
  testId?: string;
};

/**
 * Themed product collection rail (e.g. "Summer Collection" on the live site).
 * Pulls from `/woo/category-products?slug=…` and falls back to `/woo/products`
 * when the category is empty so a curated row never disappears entirely. The
 * candidate pool is reshuffled once per UTC day per (rail, store) so the
 * featured items rotate over time without server changes.
 */
export function BestSellersPreview({
  categorySlug = "hand-bouquets",
  titleKey = "bestSellers.title",
  railKey = "best-sellers",
  viewAllHref,
  limit = 8,
  testId = "section-best-sellers",
}: Props) {
  const { t, language } = useLocale();
  const { countryCode, cityId } = useLocationSelection();
  const locParams: { countryCode?: string; cityId?: string; lang?: string } = { lang: language };
  if (countryCode) locParams.countryCode = countryCode;
  if (cityId) locParams.cityId = cityId;

  const catQuery = useCategoryProducts(categorySlug, locParams);
  const allQuery = useProducts(
    locParams,
    catQuery.isSuccess && (catQuery.data?.products?.length ?? 0) === 0,
  );
  const isLoading = catQuery.isLoading || allQuery.isLoading;
  const catProducts = catQuery.data?.products ?? [];

  const products = useMemo(() => {
    const pool = catProducts.length > 0 ? catProducts : allQuery.data?.products ?? [];
    return seededShuffle(pool, homepageShuffleSeed(railKey, countryCode, cityId)).slice(0, limit);
  }, [catProducts, allQuery.data?.products, countryCode, cityId, railKey, limit]);

  const href = viewAllHref ?? `/shop?category=${encodeURIComponent(categorySlug)}`;

  return (
    <ProductCollectionCarousel
      title={t(titleKey)}
      viewAllHref={href}
      products={products}
      isLoading={isLoading}
      testId={testId}
    />
  );
}
