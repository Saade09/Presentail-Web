import { useState } from "react";
import { Link } from "wouter";
import { Cake, Heart, Sparkles, Trophy, Baby, Smile, Flower2, Gift, type LucideIcon } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { ArrowRight } from "lucide-react";
import {
  useGetCatalogOccasions,
  getGetCatalogOccasionsQueryKey,
} from "@workspace/api-client-react";
import { buildCatalogImageSrcset } from "@/lib/imageUtils";
import { useLocationSelection } from "@/contexts/LocationContext";
import { cityHref } from "@/lib/cityHref";

type OccasionItem = {
  key: string;
  slug: string;
  Icon: LucideIcon;
};

const ITEMS: OccasionItem[] = [
  { key: "occasions.birthday",   slug: "birthday",       Icon: Cake },
  { key: "occasions.romance",    slug: "love-romance",   Icon: Heart },
  { key: "occasions.anniversary",slug: "anniversary",    Icon: Sparkles },
  { key: "occasions.congrats",   slug: "congratulations",Icon: Trophy },
  { key: "occasions.newborn",    slug: "new-born",       Icon: Baby },
  { key: "occasions.thankYou",   slug: "thank-you",      Icon: Smile },
  { key: "occasions.sympathy",   slug: "condolences",    Icon: Flower2 },
  { key: "occasions.justBecause",slug: "just-because",   Icon: Gift },
];

const ITEMS_BY_SLUG = new Map<string, OccasionItem>(ITEMS.map((it) => [it.slug, it]));

function OccasionIcon({
  img,
  Icon,
}: {
  img?: string;
  Icon: LucideIcon;
}) {
  const [failed, setFailed] = useState(false);

  if (img && !failed) {
    // Occasion icons are rendered at 28–32 CSS px (w-7 h-7 / w-8 h-8).
    // Serve srcset at 144w (covers 4.5× retina) and 288w (9× — future-proofed).
    const catalogSrcset = buildCatalogImageSrcset(img, "32px");
    return (
      <img
        src={catalogSrcset?.src ?? img}
        alt="" // image-alt-ok: decorative occasion icon, meaning conveyed by adjacent text label
        className="w-7 h-7 md:w-8 md:h-8 object-contain"
        loading="lazy"
        decoding="async"
        {...(catalogSrcset ? { srcSet: catalogSrcset.srcset, sizes: "32px" } : {})}
        onError={() => setFailed(true)}
      />
    );
  }
  return <Icon className="w-5 h-5 md:w-6 md:h-6" />;
}

export function ShopByOccasion() {
  const { t, language } = useLocale();
  const { countryCode, cityId } = useLocationSelection();
  const toCityHref = (path: string) => cityHref(path, { language, countryCode, cityId });

  const { data: occasionsData, isPending } = useGetCatalogOccasions({
    query: {
      queryKey: getGetCatalogOccasionsQueryKey(),
      staleTime: 15 * 60 * 1000,
    },
  });

  // Build the display list from the API's sorted array.
  // The API returns occasions ranked by best-seller stats (OS-level or product
  // totalSales aggregate), so we preserve that order here. ITEMS_BY_SLUG maps
  // each slug to its translation key and fallback icon; API occasions not in the
  // map get the Gift icon as a generic fallback. Occasions only in ITEMS but not
  // in the API response are omitted (no products or inactive).
  //
  // Fall back to the hardcoded ITEMS order ONLY while the query is still in
  // flight (loading state). Once the query has settled — even to an empty list
  // — we render strictly from the API data so the order is always server-driven.
  const apiOccasions = occasionsData?.occasions ?? [];

  const displayItems: Array<{ slug: string; key: string; Icon: LucideIcon; image: string | null }> =
    isPending
      ? ITEMS.map((it) => ({ slug: it.slug, key: it.key, Icon: it.Icon, image: null }))
      : apiOccasions.map((o) => {
          const meta = ITEMS_BY_SLUG.get(o.slug);
          return {
            slug: o.slug,
            key: meta?.key ?? "",
            Icon: meta?.Icon ?? Gift,
            image: o.image ?? null,
          };
        });

  return (
    <section className="py-14 md:py-20" data-testid="section-occasions">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
          <p className="text-xs md:text-sm font-medium tracking-[0.2em] uppercase text-gold mb-3">
            {t("occasions.eyebrow")}
          </p>
          <h2 className="font-serif text-3xl md:text-5xl text-primary mb-3">{t("occasions.title")}</h2>
          <p className="text-muted-foreground text-sm md:text-base">{t("occasions.subtitle")}</p>
        </div>

        <div className="-mx-4 px-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0 md:overflow-x-visible">
          <div className="flex flex-nowrap gap-3 md:grid md:grid-cols-4 md:gap-5">
          {displayItems.map((it, i) => {
            const label = it.key ? t(it.key) : it.slug;
            return (
              <div
                key={it.slug}
                className="animate-card-enter min-w-[calc(25vw-0.75rem)] md:min-w-0"
                style={{ "--enter-delay": `${i * 0.04}s` } as React.CSSProperties}
              >
                <Link
                  href={toCityHref(`/occasion/${it.slug}`)}
                  className="group flex flex-col items-center justify-center text-center gap-3 py-7 md:py-9 px-4 rounded-2xl bg-card border border-border/60 hover:border-gold hover:shadow-md transition-all"
                  data-testid={`link-occasion-${it.slug}`}
                >
                  <span className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-secondary flex items-center justify-center text-primary group-hover:bg-gold group-hover:text-white transition-colors overflow-hidden">
                    <OccasionIcon img={it.image ?? undefined} Icon={it.Icon} />
                  </span>
                  <span className="font-serif text-base md:text-lg text-primary">{label}</span>
                </Link>
              </div>
            );
          })}
          </div>
        </div>

        <div className="flex justify-center mt-8 md:mt-10">
          <Link
            href={toCityHref("/occasions")}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline underline-offset-2"
            data-testid="link-view-all-occasions"
          >
            {t("occasions.viewAll")}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
