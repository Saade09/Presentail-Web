import {
  useGetHomepageBestSellers,
  getGetHomepageBestSellersQueryKey,
} from "@workspace/api-client-react";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { ProductCollectionCarousel } from "./ProductCollectionCarousel";
import type { Product } from "@/lib/queries";

type BestSellerProduct = {
  id: string;
  name: string;
  price: string;
  priceValue: number;
  image: { uri: string } | null;
  images: { uri: string }[];
  inStock: boolean;
  popularity: number;
};

function toProduct(p: BestSellerProduct): Product {
  return {
    id: p.id,
    wcId: 0,
    name: p.name,
    price: p.price,
    priceValue: p.priceValue,
    image: p.image,
    images: p.images,
    category: "",
    categories: [],
    inStock: p.inStock,
    occasions: [],
    popularity: p.popularity,
  };
}

export function BestSellersRail() {
  const { t, language } = useLocale();
  const { countryCode, cityId } = useLocationSelection();

  const params = {
    ...(countryCode ? { countryCode } : {}),
    ...(cityId ? { cityId } : {}),
    lang: language,
  };

  const { data, isPending, isError } = useGetHomepageBestSellers<Product[]>(params, {
    query: {
      queryKey: getGetHomepageBestSellersQueryKey(params),
      staleTime: 5 * 60 * 1000,
      retry: 3,
      refetchInterval: (query) => {
        const raw = query.state.data;
        if (raw && raw.products && raw.products.length > 0) return false;
        if (query.state.status === "error") return false;
        return 10_000;
      },
      select: (raw) =>
        ((raw?.products ?? []) as BestSellerProduct[]).map(toProduct),
    },
  });

  const hasProducts = data && data.length > 0;
  const showSkeleton = isPending || (!isError && !hasProducts);

  return (
    <ProductCollectionCarousel
      title={t("bestSellers.title")}
      viewAllHref="/shop"
      products={data ?? []}
      isLoading={showSkeleton}
      isError={isError}
      testId="section-best-sellers"
    />
  );
}
