import { useMemo } from "react";
import { useCategoryProducts, useOccasionFlatProducts, useMyOrders, type Product } from "@/lib/queries";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useAuth } from "@/contexts/AuthContext";
import { homepageShuffleSeed, seededShuffle } from "@/lib/shuffle";
import { ProductCollectionCarousel } from "./ProductCollectionCarousel";
import {
  useGetHomepageCollectionBestSellers,
  getGetHomepageCollectionBestSellersQueryKey,
} from "@workspace/api-client-react";

type Props = {
  categorySlug?: string;
  occasionSlug?: string;
  titleKey?: string;
  railKey?: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  limit?: number;
  testId?: string;
  products?: Product[];
  isLoadingExternal?: boolean;
  sortBy?: "popularity" | "price-asc";
};

function toBestSellerProduct(p: {
  id: string;
  name: string;
  price: string;
  priceValue: number;
  discountPriceValue?: number | null;
  discountPriceAed?: number | null;
  image?: { uri: string } | null;
  images: { uri: string }[];
  inStock: boolean;
  popularity: number;
  isBestSeller?: boolean;
}): Product {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    priceValue: p.priceValue,
    discountPriceValue: p.discountPriceValue ?? null,
    discountPriceAed: p.discountPriceAed ?? null,
    image: p.image ? { uri: p.image.uri } : null,
    images: p.images.map((img) => ({ uri: img.uri })),
    inStock: p.inStock,
    popularity: p.popularity,
    isBestSeller: p.isBestSeller ?? false,
    wcId: 0,
    category: "",
    categories: [],
    occasions: [],
  };
}

export function BestSellersPreview({
  categorySlug = "hand-bouquets",
  occasionSlug,
  titleKey = "bestSellers.title",
  railKey = "best-sellers",
  viewAllHref,
  viewAllLabel,
  limit = 8,
  testId = "section-best-sellers",
  products: externalProducts,
  isLoadingExternal = false,
  sortBy = "popularity",
}: Props) {
  const { t, language } = useLocale();
  const { countryCode, cityId } = useLocationSelection();
  const { user } = useAuth();
  const isSignedIn = !!user;

  const locParams: { countryCode?: string; cityId?: string; lang?: string } = { lang: language };
  if (countryCode) locParams.countryCode = countryCode;
  if (cityId) locParams.cityId = cityId;

  // ── Ranked collection endpoint (for themed rails) ──────────────────────
  // Only used when there's no externalProducts override (i.e. the themed Balloons,
  // Flower Boxes, Summer rails — not the main Best Sellers rail which passes products directly).
  const isThemedRail = externalProducts === undefined;
  const collectionParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (categorySlug && !occasionSlug) p.categorySlug = categorySlug;
    if (occasionSlug) p.occasionSlug = occasionSlug;
    if (countryCode) p.countryCode = countryCode;
    if (cityId) p.cityId = cityId;
    return p;
  }, [categorySlug, occasionSlug, countryCode, cityId]);

  const rankedQueryKey = getGetHomepageCollectionBestSellersQueryKey(collectionParams);
  const { data: rankedData, isLoading: isRankedLoading } = useGetHomepageCollectionBestSellers(
    collectionParams,
    {
      query: {
        queryKey: rankedQueryKey,
        enabled: isThemedRail,
        staleTime: 5 * 60 * 1000,
      },
    },
  );

  // ── Purchased product names (for deprioritization) ─────────────────────
  // Only fetch when signed in — anonymous visitors have no history.
  const { data: ordersData } = useMyOrders(isSignedIn);
  const purchasedNames = useMemo(() => {
    if (!ordersData?.orders) return new Set<string>();
    const names = new Set<string>();
    for (const order of ordersData.orders) {
      for (const item of order.items) {
        names.add(item.name.toLowerCase().trim());
      }
    }
    return names;
  }, [ordersData]);

  // ── Legacy OS fetch (fallback when ranked endpoint is cold/empty) ───────
  const catQuery = useCategoryProducts(
    isThemedRail && !occasionSlug && (rankedData?.products.length ?? 0) === 0 && !isRankedLoading
      ? categorySlug
      : "",
    locParams,
  );
  const occQuery = useOccasionFlatProducts(
    isThemedRail && !!occasionSlug && (rankedData?.products.length ?? 0) === 0 && !isRankedLoading
      ? occasionSlug
      : "",
    locParams,
  );

  // ── Final product list ─────────────────────────────────────────────────
  const finalProducts = useMemo(() => {
    const sortProducts = (ps: Product[]) =>
      sortBy === "price-asc" ? [...ps].sort((a, b) => a.priceValue - b.priceValue) : ps;

    if (externalProducts !== undefined) {
      // Caller-provided list (main Best Sellers rail) — filter image-less products then deprioritize purchased
      return deprioritizePurchased(sortProducts(externalProducts.filter((p) => p.inStock && !!p.image).slice(0, limit)), purchasedNames);
    }

    if (rankedData && rankedData.products.length > 0) {
      // Sales-ranked from new endpoint — filter image-less products, then optionally sort by price
      const ranked = sortProducts(rankedData.products.map(toBestSellerProduct).filter((p) => p.inStock && !!p.image).slice(0, limit));
      return deprioritizePurchased(ranked, purchasedNames);
    }

    // Fallback: OS flat list with daily shuffle — filter image-less products after shuffle
    // so the pool reduction doesn't affect seed stability.
    const activeQuery = occasionSlug ? occQuery : catQuery;
    const catProducts = activeQuery.data?.products ?? [];
    const shuffled = sortProducts(
      seededShuffle(catProducts, homepageShuffleSeed(railKey, countryCode, cityId))
        .filter((p) => p.inStock && !!p.image)
        .slice(0, limit),
    );
    return deprioritizePurchased(shuffled, purchasedNames);
  }, [
    externalProducts,
    rankedData,
    catQuery.data,
    occQuery.data,
    purchasedNames,
    countryCode,
    cityId,
    railKey,
    limit,
    occasionSlug,
    sortBy,
  ]);

  const rankedProducts = (rankedData as { products: unknown[] } | undefined)?.products;
  const isLoading = externalProducts !== undefined
    ? isLoadingExternal
    : isRankedLoading && (rankedProducts?.length ?? 0) === 0;

  if (!isLoading && finalProducts.length === 0) return null;

  const href = viewAllHref ?? (occasionSlug
    ? `/occasion/${encodeURIComponent(occasionSlug)}`
    : `/category/${encodeURIComponent(categorySlug)}`);

  return (
    <ProductCollectionCarousel
      title={t(titleKey)}
      viewAllHref={href}
      viewAllLabel={viewAllLabel}
      products={finalProducts}
      isLoading={isLoading}
      testId={testId}
    />
  );
}

function deprioritizePurchased(products: Product[], purchasedNames: Set<string>): Product[] {
  if (purchasedNames.size === 0) return products;
  const fresh: Product[] = [];
  const bought: Product[] = [];
  for (const p of products) {
    if (purchasedNames.has(p.name.toLowerCase().trim())) {
      bought.push(p);
    } else {
      fresh.push(p);
    }
  }
  return [...fresh, ...bought];
}
