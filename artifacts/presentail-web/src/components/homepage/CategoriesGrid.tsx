import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { buildCollectionImageAlt } from "@/lib/imageAlt";
import { apiFetch } from "@/lib/api";
import { CATEGORY_SLUG_REMAP, RETIRED_CATEGORY_SLUGS } from "@/lib/categoryGroups";
import { cityHref } from "@/lib/cityHref";
import { ShimmerImage } from "@/components/ShimmerImage";
import { buildCategoryHeroSrcset, CATEGORY_CARD_HERO_SIZES } from "@/lib/imageUtils";
import bouquets from "@/assets/category-bouquets.png";
import boxes from "@/assets/category-boxes.png";
import plants from "@/assets/category-plants.png";
import cakes from "@/assets/category-cakes.png";
import chocolate from "@/assets/category-chocolate.png";

type CollectionItem = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string;
  sortOrder: number;
  isActive: boolean;
};

const STATIC_FALLBACK_IMAGES: Record<string, string> = {
  "hand-bouquets": bouquets,
  "flower-boxes": boxes,
  "plants": plants,
  "cakes": cakes,
  "chocolate": chocolate,
};

export function CategoriesGrid() {
  const { t, language } = useLocale();
  const { city, countryCode, cityId } = useLocationSelection();

  const { data } = useQuery({
    queryKey: ["homepage", "categories", countryCode ?? null, cityId ?? null, language],
    queryFn: () => {
      const query = new URLSearchParams({ lang: language });
      if (countryCode) query.set("countryCode", countryCode);
      if (cityId) query.set("cityId", cityId);
      return apiFetch<{ items: CollectionItem[] }>(`/homepage/categories?${query}`);
    },
    staleTime: 5 * 60 * 1000,
  });

  const items = (data?.items ?? []).filter(
    (i) => i.isActive && !RETIRED_CATEGORY_SLUGS.has(i.slug),
  );

  if (items.length === 0) return null;

  return (
    <section className="py-14 md:py-20 bg-secondary/40" data-testid="section-categories">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
          <p className="text-xs md:text-sm font-medium tracking-[0.2em] uppercase text-gold mb-3">
            {t("categories.eyebrow")}
          </p>
          <h2 className="font-serif text-3xl md:text-5xl text-primary mb-3">{t("categories.title")}</h2>
          <p className="text-muted-foreground text-sm md:text-base">{t("categories.subtitle")}</p>
        </div>

        <div className="-mx-4 px-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0 md:overflow-x-visible">
          <div className="flex flex-nowrap gap-3 md:grid md:grid-cols-4 md:auto-rows-[200px] md:gap-5">
          {items.map((item, i) => {
            const staticImg = STATIC_FALLBACK_IMAGES[item.slug];
            const imgSrc = item.imageUrl || staticImg || null;
            const spanClass = i === 0 ? "md:col-span-2 md:row-span-2" : "";
            const heroSrcsetResult =
              i === 0 && imgSrc ? buildCategoryHeroSrcset(imgSrc, CATEGORY_CARD_HERO_SIZES) : null;
            return (
              <div
                key={item.id}
                className={`animate-card-enter min-w-[calc(25vw-0.75rem)] md:min-w-0 ${spanClass}`}
                style={{ "--enter-delay": `${i * 0.05}s` } as React.CSSProperties}
              >
                <Link
                  href={cityHref(
                    `/category/${encodeURIComponent(CATEGORY_SLUG_REMAP[item.slug] ?? item.slug)}`,
                    { language, countryCode, cityId },
                  )}
                  className="group relative block w-full h-full min-h-[200px] rounded-2xl md:rounded-3xl overflow-hidden bg-muted"
                  data-testid={`link-category-${item.slug}`}
                >
                  {imgSrc ? (
                    <ShimmerImage
                      src={heroSrcsetResult?.src ?? imgSrc}
                      alt={buildCollectionImageAlt(item.name, "flowers", language, city?.name ?? "")}
                      className="absolute inset-0 object-cover transition-transform duration-700 group-hover:scale-105"
                      width={400}
                      height={200}
                      priority={i === 0}
                      fallback={
                        staticImg ? (
                          <img
                            src={staticImg}
                            alt={buildCollectionImageAlt(item.name, "flowers", language, city?.name ?? "")}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        ) : undefined
                      }
                      srcset={heroSrcsetResult?.srcset}
                      sizes={
                        heroSrcsetResult
                          ? heroSrcsetResult.sizes
                          : i === 0
                          ? "(max-width: 768px) 25vw, 600px"
                          : "(max-width: 768px) 25vw, 300px"
                      }
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-secondary to-muted" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                  <div className="absolute inset-0 flex items-end p-4 md:p-6">
                    <div className="text-white">
                      <h3 className="font-serif text-lg md:text-2xl">{item.name}</h3>
                      <span className="text-xs md:text-sm tracking-wide text-white/85 group-hover:text-accent transition-colors">
                        {t("bestSellers.viewAll")} →
                      </span>
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}
          </div>
        </div>
      </div>
    </section>
  );
}
