import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { useBrands } from "@/lib/queries";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { ShimmerImage } from "@/components/ShimmerImage";
import { buildCollectionImageAlt } from "@/lib/imageAlt";
import { cityHref } from "@/lib/cityHref";

interface SpotlightCardProps {
  brand: { id: number | string; slug: string; name: string; image?: string | null };
  index: number;
}

function SpotlightCard({ brand, index }: SpotlightCardProps) {
  const { language } = useLocale();
  const { city, countryCode, cityId } = useLocationSelection();
  return (
    <div
      key={brand.id}
      className="animate-card-enter"
      style={{ "--enter-delay": `${index * 0.04}s` } as React.CSSProperties}
    >
      <Link
        href={cityHref(`/brand/${brand.slug}`, { language, countryCode, cityId })}
        className="group block aspect-square rounded-2xl bg-card border border-border/60 hover:border-gold hover:shadow-md transition-all p-4 flex items-center justify-center text-center relative overflow-hidden"
        data-testid={`link-brand-${brand.slug}`}
      >
        {brand.image ? (
          <ShimmerImage
            src={brand.image}
            alt={buildCollectionImageAlt(brand.name, "flowers", language, city?.name ?? "")}
            width={200}
            height={200}
            className="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform duration-500"
            fallback={
              <span className="font-serif text-base md:text-lg text-primary group-hover:text-gold transition-colors">
                {brand.name}
              </span>
            }
          />
        ) : (
          <span className="font-serif text-base md:text-lg text-primary group-hover:text-gold transition-colors">
            {brand.name}
          </span>
        )}
      </Link>
    </div>
  );
}

export function BrandSpotlight() {
  const { t, language } = useLocale();
  const { countryCode, cityId } = useLocationSelection();
  const brandParams: { countryCode?: string; cityId?: string; lang?: string } = { lang: language };
  if (countryCode) brandParams.countryCode = countryCode;
  if (cityId) brandParams.cityId = cityId;
  const { data, isLoading } = useBrands(brandParams);
  const brands = (data?.brands ?? []).slice(0, 6);
  const toCityHref = (path: string) => cityHref(path, { language, countryCode, cityId });

  if (!isLoading && brands.length === 0) return null;

  return (
    <section className="py-14 md:py-20 bg-secondary/40" data-testid="section-brands">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10 md:mb-14">
          <div className="max-w-xl">
            <p className="text-xs md:text-sm font-medium tracking-[0.2em] uppercase text-gold mb-3">
              {t("brands.eyebrow")}
            </p>
            <h2 className="font-serif text-3xl md:text-5xl text-primary mb-3">{t("brands.title")}</h2>
            <p className="text-muted-foreground text-sm md:text-base">{t("brands.subtitle")}</p>
          </div>
          <Link
            href={toCityHref("/brands")}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-gold transition-colors self-start md:self-auto"
            data-testid="link-brands-view-all"
          >
            {t("brands.viewAll")} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 md:gap-5">
          {isLoading || brands.length === 0
            ? Array(6)
                .fill(0)
                .map((_, i) => (
                  <div key={i} className="aspect-square bg-muted rounded-2xl animate-pulse" />
                ))
            : brands.map((b, i) => (
                <SpotlightCard key={b.id} brand={b} index={i} />
              ))}
        </div>
      </div>
    </section>
  );
}
