import { useMemo } from "react";
import { useGetHomepageBestSellers } from "@workspace/api-client-react";
import { ProductCard } from "@/components/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import { PageBreadcrumb, type Crumb } from "@/components/PageBreadcrumb";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useLocale } from "@/contexts/LocaleContext";
import type { Product } from "@/lib/queries";

const CRUMBS: Crumb[] = [
  { label: "Home", href: "/" },
  { label: "Best Sellers" },
];

export default function BestSellers() {
  const { countryCode, cityId } = useLocationSelection();
  const { t } = useLocale();

  const { data, isLoading } = useGetHomepageBestSellers({
    ...(countryCode ? { countryCode } : {}),
    ...(cityId ? { cityId } : {}),
  });

  const products: Product[] = useMemo(
    () =>
      (data?.products ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        priceValue: p.priceValue,
        image: p.image ? { uri: p.image.uri } : null,
        images: p.images?.map((img) => ({ uri: img.uri })) ?? [],
        inStock: p.inStock,
        popularity: p.popularity,
        isBestSeller: true,
        wcId: 0,
        category: "",
        categories: [],
        occasions: [],
      })),
    [data],
  );

  return (
    <div className="px-page py-6 max-w-content mx-auto">
      <PageBreadcrumb crumbs={CRUMBS} />

      <h1 className="font-serif text-3xl text-gray-900 mt-4 mb-6">
        {t("bestSellers.title")}
      </h1>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-10">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="aspect-[4/5] rounded-2xl" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <p className="text-muted-foreground text-center py-16">
          {t("bestSellers.empty")}
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-10">
          {products.map((product, i) => (
            <ProductCard key={product.id} product={product} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
