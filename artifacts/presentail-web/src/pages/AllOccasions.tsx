import { useCatalogOccasions } from "@/lib/queries";
import { buildCatalogImageSrcset } from "@/lib/imageUtils";
import { buildCollectionImageAlt } from "@/lib/imageAlt";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { SEOContentSection } from "@/components/SEOContentSection";
import { PageBreadcrumb } from "@/components/PageBreadcrumb";
import { useState, useEffect } from "react";
import { trackEvent } from "@/lib/analytics";
import { setOccasionRef } from "@/lib/occasionAttribution";
import {
  Baby,
  Briefcase,
  BriefcaseBusiness,
  Cake,
  Church,
  Diamond,
  Flower,
  Flower2,
  Gem,
  Gift,
  GraduationCap,
  HandHeart,
  Heart,
  HeartHandshake,
  HeartPulse,
  House,
  MoonStar,
  PartyPopper,
  Plane,
  School,
  Smile,
  SmilePlus,
  Sparkles,
  Star,
  Stethoscope,
  Trophy,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  "airplane": Plane,
  "account-heart": HandHeart,
  "baby": Baby,
  "baby-carriage": Baby,
  "book-heart": Gift,
  "briefcase": Briefcase,
  "briefcase-account": BriefcaseBusiness,
  "briefcase-business": BriefcaseBusiness,
  "cake": Cake,
  "cards-heart": HandHeart,
  "church": Church,
  "diamond": Diamond,
  "emoticon-happy": SmilePlus,
  "flower": Flower,
  "flower-2": Flower2,
  "gem": Gem,
  "gift": Gift,
  "graduation-cap": GraduationCap,
  "hand-heart": HandHeart,
  "heart": Heart,
  "heart-circle": HeartHandshake,
  "heart-handshake": HeartHandshake,
  "heart-pulse": HeartPulse,
  "home": House,
  "house": House,
  "moon-star": MoonStar,
  "party-popper": PartyPopper,
  "plane": Plane,
  "ring": Gem,
  "school": School,
  "smile": Smile,
  "smile-plus": SmilePlus,
  "sparkles": Sparkles,
  "star": Star,
  "star-crescent": MoonStar,
  "stethoscope": Stethoscope,
  "trophy": Trophy,
  "user": User,
  "users": Users,
};

function getIcon(iconName: string): LucideIcon {
  if (!iconName) return Gift;
  const key = iconName.toLowerCase();
  return (ICON_MAP[key] as LucideIcon | undefined) ?? Gift;
}

const OCCASION_LABEL_KEYS: Record<string, string> = {
  "birthday": "shop.occ.birthday",
  "love-romance": "shop.occ.loveRomance",
  "housewarming": "shop.occ.housewarming",
  "anniversary": "shop.occ.anniversary",
  "new-job": "shop.occ.newJob",
  "promotion": "shop.occ.promotion",
  "graduation": "shop.occ.graduation",
  "congratulations": "shop.occ.congratulations",
  "thank-you": "shop.occ.thankYou",
  "get-well-soon": "shop.occ.getWellSoon",
  "newborn": "shop.occ.newborn",
  "new-born": "shop.occ.newborn",
  "eid": "shop.occ.eid",
  "ramadan": "shop.occ.ramadan",
  "wedding": "shop.occ.wedding",
  "thinking-of-you": "shop.occ.thinkingOfYou",
  "farewell": "shop.occ.farewell",
  "condolences": "shop.occ.condolences",
  "colleague": "shop.occ.colleague",
  "friend": "shop.occ.friend",
  "im-sorry": "shop.occ.imSorry",
  "children": "shop.occ.children",
  "valentines-day": "shop.occ.valentine",
  "mothers-day": "shop.occ.mothersDay",
  "womens-day": "shop.occ.womensDay",
  "fathers-day": "shop.occ.fathersDay",
  "christmas": "shop.occ.christmas",
};

interface OccasionCardProps {
  slug: string;
  name: string;
  image: string | null;
  labelKey?: string;
  index: number;
}

function OccasionCard({ slug, name, image, labelKey, index }: OccasionCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const { t, language, cityName } = useLocale();
  const { city } = useLocationSelection();
  const cityLabel = city ? cityName(city.id, city.name) : "";
  const Icon = getIcon("gift");
  const photoUri = !imgFailed && image ? image : null;
  const displayName = (labelKey ? t(labelKey, {}) : undefined) || name;

  return (
    <div
      className="animate-card-enter"
      style={{ "--enter-delay": `${Math.min(index * 0.03, 0.3)}s` } as React.CSSProperties}
    >
      <Link
        href={`/occasion/${slug}`}
        className="group flex flex-col items-center justify-center text-center gap-3 py-6 md:py-8 px-4 rounded-2xl bg-card border border-border/60 hover:border-gold hover:shadow-md transition-all"
        data-testid={`link-occasion-${slug}`}
        onClick={() => setOccasionRef(slug)}
      >
        {photoUri ? (
          <span className="w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden flex-shrink-0">
            {(() => {
              const catalogSrcset = buildCatalogImageSrcset(
                photoUri,
                "(min-width: 768px) 160px, 128px",
              );
              return (
                <img
                  src={catalogSrcset?.src ?? photoUri}
                  alt={buildCollectionImageAlt(displayName, "occasion", language, cityLabel)}
                  width={160}
                  height={160}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  {...(catalogSrcset
                    ? { srcSet: catalogSrcset.srcset, sizes: catalogSrcset.sizes }
                    : {})}
                  onError={() => setImgFailed(true)}
                />
              );
            })()}
          </span>
        ) : (
          <span className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-secondary flex items-center justify-center text-primary group-hover:bg-gold group-hover:text-white transition-colors">
            <Icon className="w-10 h-10 md:w-12 md:h-12" />
          </span>
        )}
        <span className="font-serif text-base md:text-lg text-primary leading-snug">
          {displayName}
        </span>
      </Link>
    </div>
  );
}

export default function AllOccasions() {
  const { t, language, cityName } = useLocale();
  const { city, countryCode } = useLocationSelection();
  const citySlug = city?.id ?? null;
  const { data, isLoading } = useCatalogOccasions(countryCode, citySlug, language);
  const occasions = (data?.occasions ?? []).filter((o) => (o.count ?? 0) > 0);
  const cityLabel = city ? cityName(city.id, city.name) : "";

  // Fire occasion impression event once when occasions finish loading
  useEffect(() => {
    if (data && occasions.length > 0) {
      trackEvent({ name: "occasion_impression", surface: "all_occasions_page" });
    }
    // Only fire when data first resolves
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <div className="min-h-screen pt-12">
      <div className="container mx-auto max-w-content px-page pt-2">
        <PageBreadcrumb crumbs={[{ label: t("nav.home"), href: "/" }, { label: t("occasions.title") }]} />
      </div>
      <div className="container mx-auto max-w-content px-page">
        <div className="mb-12 pb-8">
          <h1 className="text-4xl md:text-5xl font-serif mb-4" data-testid="text-occasions-title">
            {t("occasions.title")}
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl">
            {t("occasions.subtitle")}
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array(10).fill(0).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-2xl" />
            ))}
          </div>
        ) : occasions.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground">
            {t("allOccasions.empty")}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {occasions.map((occasion, i) => (
              <OccasionCard
                key={occasion.slug}
                slug={occasion.slug}
                name={occasion.name}
                image={occasion.image}
                labelKey={OCCASION_LABEL_KEYS[occasion.slug]}
                index={i}
              />
            ))}
          </div>
        )}
      </div>

      <SEOContentSection
        pageType="occasions-listing"
        cityLabel={cityLabel}
        lang={language}
        countryCode={countryCode ?? ""}
        suppressFaqJsonLd
      />
    </div>
  );
}
