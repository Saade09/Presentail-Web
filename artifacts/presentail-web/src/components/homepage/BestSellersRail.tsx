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

  const { data, isLoading } = useGetHomepageBestSellers<Product[]>(params, {
    query: {
      queryKey: getGetHomepageBestSellersQueryKey(params),
      staleTime: 5 * 60 * 1000,
      select: (raw) =>
        ((raw?.products ?? []) as BestSellerProduct[]).map(toProduct),
    },
  });

  return (
    <ProductCollectionCarousel
      title={t("bestSellers.title")}
      viewAllHref="/shop"
      products={data ?? []}
      isLoading={isLoading}
      testId="section-best-sellers"
    />
  );
}
