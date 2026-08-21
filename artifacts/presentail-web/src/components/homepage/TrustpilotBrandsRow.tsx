import { Link } from "wouter";
import { useBrands } from "@/lib/queries";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useLocale } from "@/contexts/LocaleContext";
import { ShimmerImage } from "@/components/ShimmerImage";
import { cityHref } from "@/lib/cityHref";

const MAX_BRANDS = 8;

export function TrustpilotBrandsRow() {
  const { countryCode, cityId } = useLocationSelection();
  const { language, t } = useLocale();
  const brandParams: { countryCode?: string; cityId?: string; lang?: string } = { lang: language };
  if (countryCode) brandParams.countryCode = countryCode;
  if (cityId) brandParams.cityId = cityId;

  const { data, isLoading } = useBrands(brandParams);
  const brands = (data?.brands ?? []).slice(0, MAX_BRANDS);

  if (!isLoading && brands.length === 0) return null;

  return (
    <div className="hidden md:block mt-10">
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1 h-px bg-border/40" />
        <span className="text-xs font-medium tracking-[0.18em] uppercase text-muted-foreground">
          {t("brands.featuredEyebrow")}
        </span>
        <div className="flex-1 h-px bg-border/40" />
      </div>

      <div className="flex items-center justify-center gap-8 flex-wrap">
        {isLoading
          ? Array(MAX_BRANDS)
              .fill(0)
              .map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <div className="w-24 h-24 rounded-xl bg-muted animate-pulse" />
                  <div className="h-3 w-16 rounded bg-muted animate-pulse" />
                </div>
              ))
          : brands.map((brand) => (
              <Link
                key={brand.id}
                href={cityHref(`/brand/${brand.slug}`, { language, countryCode, cityId })}
                className="group flex-shrink-0 flex flex-col items-center gap-2"
                data-testid={`trustpilot-brand-${brand.slug}`}
                title={brand.name}
              >
                {brand.image ? (
                  <div className="w-24 h-24 rounded-xl overflow-hidden group-hover:scale-105 transition-transform duration-300">
                    <ShimmerImage
                      src={brand.image}
                      alt={brand.name}
                      className="w-full h-full object-cover"
                      fallback={
                        <div className="w-full h-full flex items-center justify-center bg-secondary/60 rounded-xl px-2">
                          <span className="font-serif text-xs text-center text-primary leading-tight">
                            {brand.name}
                          </span>
                        </div>
                      }
                    />
                  </div>
                ) : (
                  <div className="w-24 h-24 flex items-center justify-center px-4 group-hover:scale-105 transition-transform duration-300">
                    <span className="font-serif text-sm text-primary text-center leading-tight">
                      {brand.name}
                    </span>
                  </div>
                )}
                <span className="text-xs text-muted-foreground text-center leading-tight max-w-[6rem] truncate">
                  {brand.name}
                </span>
              </Link>
            ))}
      </div>
    </div>
  );
}
