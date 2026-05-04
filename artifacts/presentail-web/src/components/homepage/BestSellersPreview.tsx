import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { ProductCard } from "@/components/ProductCard";
import { useCategoryProducts, useProducts } from "@/lib/queries";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";

export function BestSellersPreview() {
  const { t, language } = useLocale();
  const { countryCode, cityId } = useLocationSelection();
  const locParams: { countryCode?: string; cityId?: string; lang?: string } = { lang: language };
  if (countryCode) locParams.countryCode = countryCode;
  if (cityId) locParams.cityId = cityId;
  const catQuery = useCategoryProducts("hand-bouquets", locParams);
  const allQuery = useProducts(locParams, catQuery.isSuccess && (catQuery.data?.products?.length ?? 0) === 0);
  const isLoading = catQuery.isLoading || allQuery.isLoading;
  const catProducts = catQuery.data?.products ?? [];
  const products = (catProducts.length > 0 ? catProducts : allQuery.data?.products ?? []).slice(0, 4);

  return (
    <section className="py-14 md:py-20" data-testid="section-best-sellers">
      <div className="container mx-auto px-4">
        <div className="flex items-end justify-between mb-8 md:mb-10">
          <h2 className="text-2xl md:text-4xl font-serif">{t("bestSellers.title")}</h2>
          <Link
            href="/shop"
            className="flex items-center gap-1.5 text-sm font-medium hover:text-primary/80 transition-colors"
            data-testid="link-best-sellers-view-all"
          >
            {t("bestSellers.viewAll")} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {isLoading
            ? Array(4)
                .fill(0)
                .map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="aspect-square bg-muted rounded-2xl mb-4" />
                    <div className="h-5 bg-muted rounded w-2/3 mb-2" />
                    <div className="h-4 bg-muted rounded w-1/3" />
                  </div>
                ))
            : products.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
        </div>
      </div>
    </section>
  );
}
