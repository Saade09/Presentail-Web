import { useMemo } from "react";
import { useCategoryProducts } from "@/lib/queries";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { homepageShuffleSeed, seededShuffle } from "@/lib/shuffle";
import { ProductCollectionCarousel } from "./ProductCollectionCarousel";

type Props = {
  /** Catalog category slug to feature; hidden when the category has no products. */
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
 * Pulls from `/woo/category-products?slug=…`. If the category has no products
 * and loading is complete, the section is hidden entirely rather than falling
 * back to all products. The candidate pool is reshuffled once per UTC day per
 * (rail, store) so the featured items rotate over time without server changes.
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
  const isLoading = catQuery.isLoading;
  const catProducts = catQuery.data?.products ?? [];

  const products = useMemo(() => {
    return seededShuffle(catProducts, homepageShuffleSeed(railKey, countryCode, cityId)).slice(0, limit);
  }, [catProducts, countryCode, cityId, railKey, limit]);

  if (!isLoading && catProducts.length === 0) {
    return null;
  }

  const href = viewAllHref ?? `/category/${encodeURIComponent(categorySlug)}`;

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
