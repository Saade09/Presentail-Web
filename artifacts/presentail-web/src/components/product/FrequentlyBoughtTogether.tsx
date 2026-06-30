import {
  useGetFrequentlyBoughtTogether,
  getGetFrequentlyBoughtTogetherQueryKey,
} from "@workspace/api-client-react";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { ProductCard } from "@/components/ProductCard";
import type { Product } from "@/lib/queries";
import type { FrequentlyBoughtTogetherProduct } from "@workspace/api-client-react";

function countryToStore(
  countryCode: string | null | undefined,
  cityId: string | null | undefined,
): "lebanon" | "dubai" | "abudhabi" | "cyprus" {
  if (!countryCode) return "lebanon";
  if (countryCode === "CY") return "cyprus";
  if (countryCode === "AE") {
    if (cityId?.includes("abudhabi")) return "abudhabi";
    return "dubai";
  }
  return "lebanon";
}

function adaptProduct(p: FrequentlyBoughtTogetherProduct): Product {
  const firstImage = p.images?.[0]?.uri;
  return {
    id: p.slug,
    wcId: 0,
    name: p.name,
    price: String(p.price),
    priceValue: p.priceValue ?? p.price,
    image: firstImage ? { uri: firstImage } : null,
    images: p.images,
    category: p.category,
    categories: [p.category],
    occasions: [],
    inStock: p.inStock,
    discountPriceValue: p.discountPriceValue ?? null,
    discountPriceAed: p.discountPriceAed ?? null,
  };
}

export function FrequentlyBoughtTogether({ slug }: { slug: string }) {
  const { t } = useLocale();
  const { countryCode, cityId } = useLocationSelection();
  const store = countryToStore(countryCode, cityId);

  const params = { slug, store };
  const { data } = useGetFrequentlyBoughtTogether(params, {
    query: {
      queryKey: getGetFrequentlyBoughtTogetherQueryKey(params),
      staleTime: 5 * 60 * 1000,
      retry: false,
    },
  });

  const products = (data?.products ?? []).map(adaptProduct);
  if (products.length === 0) return null;

  return (
    <section className="container mx-auto px-page max-w-content pt-8 pb-4">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">
        {t("product.frequentlyBoughtTogether")}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {products.map((product, i) => (
          <ProductCard key={product.id} product={product} index={i} imageClassName="rounded-lg" />
        ))}
      </div>
    </section>
  );
}
