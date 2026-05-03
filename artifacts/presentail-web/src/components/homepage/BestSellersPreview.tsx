import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { ProductCard } from "@/components/ProductCard";
import { useCategoryProducts } from "@/lib/queries";
import { useLocale } from "@/contexts/LocaleContext";

export function BestSellersPreview() {
  const { data, isLoading } = useCategoryProducts("hand-bouquets");
  const { t } = useLocale();
  const products = data?.products.slice(0, 4) ?? [];

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
                    <div className="aspect-[4/5] bg-muted rounded-2xl mb-4" />
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
