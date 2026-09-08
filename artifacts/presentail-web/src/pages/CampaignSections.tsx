import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { apiFetch } from "@/lib/api";
import { ProductImage } from "@/components/ProductImage";
import { SalePrice } from "@/components/SalePrice";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { trackEvent } from "@/lib/analytics";
import { fireGtagEvent } from "@/lib/gtag";
import { CAMPAIGN_SECTION_KEY } from "@/lib/campaign";
import {
  type CampaignCatalogProduct,
  type CampaignAvailabilityState,
  type CampaignQuickFilterKey,
  CAMPAIGN_QUICK_FILTER_KEYS,
} from "@/lib/campaignLanding";
import {
  CircularCollectionCarousel,
  type CircularCarouselItem,
} from "@/components/homepage/CircularCollectionCarousel";
import { OCCASION_STATIC_IMAGES } from "@/lib/categoryGroups";

// ─── CampaignProductCard ──────────────────────────────────────────────────────

function CampaignProductCard({
  product,
  index,
  availabilityState,
  currencyCodeOverride,
  productQuery,
  onClickCapture,
}: {
  product: CampaignCatalogProduct;
  index: number;
  availabilityState?: CampaignAvailabilityState;
  currencyCodeOverride?: string;
  productQuery?: string;
  onClickCapture: () => void;
}) {
  const { language, t } = useLocale();
  const { city } = useLocationSelection();
  const productSearch =
    productQuery && productQuery.length > 0
      ? productQuery.startsWith("?")
        ? productQuery
        : `?${productQuery}`
      : "";
  const imageUrl = product.image?.uri;

  const fallbackTile = (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-stone-100 px-3 text-center">
      <span className="text-stone-400 font-serif text-sm leading-snug line-clamp-4">
        {product.name}
      </span>
    </div>
  );

  return (
    <div
      className="group"
      data-testid={`campaign-card-${product.id}`}
      onClickCapture={onClickCapture}
    >
      <Link href={`/product/${product.id}${productSearch}`}>
        <div className="relative aspect-square overflow-hidden rounded-xl bg-stone-100 mb-2.5">
          {imageUrl ? (
            <ProductImage
              src={imageUrl}
              product={{ name: product.name }}
              locale={language}
              cityName={city?.name ?? ""}
              className="object-cover w-full h-full group-hover:scale-[1.02] transition-transform duration-500"
              sizes="(max-width: 760px) 48vw, (max-width: 1080px) 32vw, 25vw"
              width={400}
              height={400}
              priority={index < 2}
              fallback={fallbackTile}
            />
          ) : (
            fallbackTile
          )}

          {product.isBestSeller && (
            <div className="absolute start-2 top-2 rounded-full bg-[#00414e] px-2.5 py-1 text-[10px] font-semibold leading-none tracking-wide text-white">
              {t("campaign.redesign.bestSeller")}
            </div>
          )}

          {availabilityState === "same-day" && index < 4 && (
            <div className="absolute end-2 bottom-2 rounded-full bg-white/90 backdrop-blur-sm px-2 py-0.5 text-[10px] font-medium leading-none text-[#00414e]">
              {t("campaign.redesign.arrivesToday")}
            </div>
          )}
        </div>

        <div className="space-y-0.5">
          <h3 className="font-serif text-sm leading-snug line-clamp-2 text-neutral-900">
            {product.name}
          </h3>
          <p className="text-sm font-medium text-neutral-900">
            <SalePrice
              priceValue={product.priceValue}
              discountPriceValue={product.discountPriceValue}
              discountPriceAed={product.discountPriceAed}
              currencyCodeOverride={currencyCodeOverride}
            />
          </p>
        </div>
      </Link>
    </div>
  );
}

// ─── CampaignGrid ─────────────────────────────────────────────────────────────

export const GRID_SIZE = 8;

export function CampaignQuickFilters({
  activeFilter,
  onSelect,
}: {
  activeFilter: CampaignQuickFilterKey;
  onSelect: (filter: CampaignQuickFilterKey) => void;
}) {
  const { t } = useLocale();
  const labels: Record<CampaignQuickFilterKey, string> = {
    "available-today": t("campaign.redesign.quickFilters.availableToday"),
    "under-60": t("campaign.redesign.quickFilters.under60"),
    "50-100": t("campaign.redesign.quickFilters.priceRange"),
    roses: t("campaign.redesign.quickFilters.roses"),
    luxury: t("campaign.redesign.quickFilters.luxury"),
    "best-sellers": t("campaign.redesign.quickFilters.bestSellers"),
  };

  return (
    <div
      className="relative mb-5"
      role="group"
      aria-label={t("campaign.redesign.quickFilters.ariaLabel")}
      data-testid="campaign-quick-filters"
    >
      <div className="flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain pe-5 [scrollbar-width:none] md:overflow-visible md:pe-0 [&::-webkit-scrollbar]:hidden">
        {CAMPAIGN_QUICK_FILTER_KEYS.map((filter) => {
          const selected = activeFilter === filter;
          return (
            <button
              key={filter}
              type="button"
              aria-pressed={selected}
              data-selected={selected ? "true" : "false"}
              data-testid={`campaign-quick-filter-${filter}`}
              onClick={() => onSelect(filter)}
              className={`min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00414e] focus-visible:ring-offset-2 ${
                selected
                  ? "border-[#00414e] bg-[#00414e] text-white"
                  : "border-[#c8d3cf] bg-white text-[#16434a] hover:border-[#00414e] hover:bg-[#f4f8f5]"
              }`}
            >
              {labels[filter]}
            </button>
          );
        })}
      </div>
      <div
        className="pointer-events-none absolute inset-y-0 end-0 w-10 bg-gradient-to-l from-[#fffdf8] to-transparent md:hidden"
        aria-hidden="true"
      />
    </div>
  );
}

export function CampaignGrid({
  section,
  title,
  sub,
  viewAllLink,
  viewAllText,
  products,
  isLoading,
  id,
  availabilityState,
  currencyCodeOverride,
  onViewAll,
  compactTop,
  activeQuickFilter,
  onQuickFilterSelect,
  productQuery,
  emptyMessage,
  emptyActionText,
  onEmptyReset,
}: {
  section: "flowers" | "luxury";
  title: string;
  sub?: string;
  viewAllLink?: string;
  viewAllText?: string;
  products: CampaignCatalogProduct[];
  isLoading: boolean;
  id?: string;
  availabilityState?: CampaignAvailabilityState;
  currencyCodeOverride?: string;
  onViewAll?: () => void;
  compactTop?: boolean;
  activeQuickFilter?: CampaignQuickFilterKey;
  onQuickFilterSelect?: (filter: CampaignQuickFilterKey) => void;
  productQuery?: string;
  emptyMessage?: string;
  emptyActionText?: string;
  onEmptyReset?: () => void;
}) {
  const { t } = useLocale();
  const displayProducts = products.slice(0, GRID_SIZE);

  return (
    <section
      id={id}
      className={`container mx-auto max-w-content px-page ${compactTop ? "pt-0" : "pt-8"} scroll-mt-24`}
      aria-labelledby={`${id}-heading`}
    >
      <div className="flex items-end justify-between mb-1.5">
        <h2
          id={`${id}-heading`}
          className="font-serif text-2xl md:text-3xl"
        >
          {title}
        </h2>
        {viewAllLink && viewAllText && (
          <Link
            href={viewAllLink}
            onClick={() => {
              onViewAll?.();
              trackEvent({
                name: "campaign_view_all_click",
                sectionKey: `${CAMPAIGN_SECTION_KEY}:${section}`,
                linkSlug: section,
              });
              fireGtagEvent("campaign_view_all_click", {
                section: CAMPAIGN_SECTION_KEY,
                campaign_section: section,
              });
            }}
            className="text-sm text-primary hover:underline whitespace-nowrap py-2 shrink-0 ml-4"
            data-testid={`link-campaign-grid-view-all-${section}`}
          >
            {viewAllText}
          </Link>
        )}
      </div>

      {sub && (
        <p className="text-sm text-neutral-500 mb-4 leading-snug">
          {sub}
        </p>
      )}

      {activeQuickFilter && onQuickFilterSelect && (
        <CampaignQuickFilters
          activeFilter={activeQuickFilter}
          onSelect={onQuickFilterSelect}
        />
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 min-[760px]:grid-cols-3 min-[1080px]:grid-cols-4 gap-3 md:gap-5">
          {Array.from({ length: GRID_SIZE }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-square w-full rounded-xl" />
              <Skeleton className="h-3.5 w-3/4 rounded" />
              <Skeleton className="h-3 w-1/2 rounded" />
              <Skeleton className="h-3.5 w-1/3 rounded" />
            </div>
          ))}
        </div>
      ) : displayProducts.length > 0 ? (
        <div className="grid grid-cols-2 min-[760px]:grid-cols-3 min-[1080px]:grid-cols-4 gap-3 md:gap-5">
          {displayProducts.map((product, i) => (
            <CampaignProductCard
              key={product.id}
              product={product}
              index={i}
              availabilityState={availabilityState}
              currencyCodeOverride={currencyCodeOverride}
              productQuery={productQuery}
              onClickCapture={() => {
                trackEvent({
                  name: "product_card_click",
                  productId: product.id,
                  sectionKey: `${CAMPAIGN_SECTION_KEY}:${section}`,
                  displayedPosition: i + 1,
                });
                fireGtagEvent("select_item", {
                  item_list_id: `${CAMPAIGN_SECTION_KEY}:${section}`,
                  item_id: product.id,
                  index: i + 1,
                });
              }}
            />
          ))}
        </div>
      ) : (
        <div
          className="rounded-2xl border border-[#d9dfd8] bg-white px-5 py-8 text-center text-sm text-[#577075]"
          data-testid={`campaign-grid-empty-${section}`}
        >
          <p>{emptyMessage ?? t("campaign.redesign.empty")}</p>
          {onEmptyReset && emptyActionText && (
            <button
              type="button"
              onClick={onEmptyReset}
              className="mt-4 min-h-11 rounded-full border border-[#00414e] px-4 text-sm font-semibold text-[#00414e] hover:bg-[#f4f8f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00414e] focus-visible:ring-offset-2"
            >
              {emptyActionText}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// ─── CampaignOccasions ────────────────────────────────────────────────────────

const OCCASION_SLUGS = [
  "birthday",
  "anniversary",
  "get-well-soon",
  "congratulations",
  "new-born",
  "im-sorry",
] as const;

export function CampaignOccasions({
  onShortcutClick,
}: {
  onShortcutClick?: (slug: string) => void;
}) {
  const { t, language } = useLocale();
  const { countryCode, cityId } = useLocationSelection();

  const { data, isLoading } = useQuery({
    queryKey: ["homepage", "occasions", countryCode, cityId, language],
    queryFn: () => {
      const params = new URLSearchParams();
      if (countryCode) params.set("countryCode", countryCode);
      if (cityId) params.set("cityId", cityId);
      if (language && language !== "en") params.set("lang", language);
      const qs = params.toString();
      return apiFetch<{ items: { id: string; name: string; slug: string; imageUrl: string; isActive: boolean }[] }>(
        `/homepage/occasions${qs ? `?${qs}` : ""}`,
      );
    },
  });

  const apiBySlug = new Map((data?.items ?? []).map((i) => [i.slug, i]));
  const items: CircularCarouselItem[] = OCCASION_SLUGS.flatMap((slug) => {
    const api = apiBySlug.get(slug);
    if (!api?.isActive) return [];
    return [
      {
        id: api.id,
        label: api.name,
        slug: api.slug,
        imageUrl: api.imageUrl || OCCASION_STATIC_IMAGES[slug] || "",
        href: `/occasion/${encodeURIComponent(slug)}`,
      } satisfies CircularCarouselItem,
    ];
  });

  if (!isLoading && items.length === 0) return null;

  // Wrap items to emit analytics on click
  const trackedItems = items.map((item) => ({
    ...item,
    onClick: () => onShortcutClick?.(item.slug ?? item.id),
  }));

  return (
    <div className="container mx-auto max-w-content px-page mt-8">
      <CircularCollectionCarousel
        title={t("campaign.v2.occasions.title")}
        items={trackedItems}
        isLoading={isLoading}
        testId="section-campaign-occasions"
      />
    </div>
  );
}

// ─── CampaignBenefitBand ──────────────────────────────────────────────────────

function SameDayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-7 w-7 shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function LocalFloristIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-7 w-7 shrink-0" aria-hidden="true">
      <path d="M12 22V11" />
      <path d="M12 11C12 11 7 8.5 7 5a5 5 0 0 1 10 0c0 3.5-5 6-5 6z" />
    </svg>
  );
}

function SecurePayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-7 w-7 shrink-0" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

function SupportIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-7 w-7 shrink-0" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function CampaignBenefitBand() {
  const { t } = useLocale();

  const benefits = [
    {
      key: "sameDay",
      Icon: SameDayIcon,
      title: t("campaign.redesign.benefit.sameDay.title"),
      sub: t("campaign.redesign.benefit.sameDay.sub"),
    },
    {
      key: "local",
      Icon: LocalFloristIcon,
      title: t("campaign.redesign.benefit.local.title"),
      sub: t("campaign.redesign.benefit.local.sub"),
    },
    {
      key: "payment",
      Icon: SecurePayIcon,
      title: t("campaign.redesign.benefit.payment.title"),
      sub: t("campaign.redesign.benefit.payment.sub"),
    },
    {
      key: "support",
      Icon: SupportIcon,
      title: t("campaign.redesign.benefit.support.title"),
      sub: t("campaign.redesign.benefit.support.sub"),
    },
  ];

  return (
    <section
      className="mt-10 bg-[#003f46]"
      aria-label={t("campaign.redesign.benefit.sameDay.title")}
    >
      <div className="container mx-auto max-w-content px-page py-8 md:py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
          {benefits.map((b) => (
            <div key={b.key} className="flex flex-col gap-2 text-[#fffaf0]">
              <b.Icon />
              <span className="font-semibold text-sm leading-snug">{b.title}</span>
              <span className="text-xs text-white/70 leading-snug">{b.sub}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── CampaignLuxuryBanner ─────────────────────────────────────────────────────

const LUXURY_BANNER_IMAGE = `${import.meta.env.BASE_URL}campaign/flower-hero-1440.webp`;

export function CampaignLuxuryBanner({
  onCtaClick,
}: {
  onCtaClick?: () => void;
}) {
  const { t } = useLocale();

  return (
    <section
      className="container mx-auto max-w-content px-page mt-10"
      aria-labelledby="luxury-banner-heading"
    >
      <div className="relative isolate overflow-hidden rounded-[1.75rem] bg-[#003f46] min-h-[280px] md:min-h-[320px] flex flex-col md:flex-row">
        {/* Copy side */}
        <div className="relative z-10 flex flex-col justify-center px-7 py-8 md:w-1/2 md:px-12 md:py-10">
          <h2
            id="luxury-banner-heading"
            className="font-serif text-2xl md:text-3xl lg:text-4xl text-[#fffaf0] leading-[1.1] mb-3"
          >
            {t("campaign.redesign.luxBanner.title")}
          </h2>
          <p className="text-sm md:text-base text-white/80 leading-relaxed mb-6 max-w-sm">
            {t("campaign.redesign.luxBanner.sub")}
          </p>
          <Link
            href="/category/lux-arrangements"
            onClick={onCtaClick}
            className="inline-flex w-fit items-center gap-2 rounded-full bg-[#fff8e9] px-6 py-3 text-sm font-semibold text-[#003f46] hover:bg-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            data-testid="link-campaign-luxury-banner-cta"
          >
            {t("campaign.redesign.luxBanner.cta")}
          </Link>
        </div>

        {/* Image side */}
        <div className="relative md:absolute md:inset-y-0 md:end-0 md:w-1/2 h-48 md:h-auto overflow-hidden">
          <div
            className="absolute inset-0 bg-gradient-to-t from-[#003f46]/80 via-transparent to-transparent md:bg-gradient-to-l md:from-transparent md:via-transparent md:to-[#003f46]/60"
            aria-hidden="true"
          />
          <img
            src={LUXURY_BANNER_IMAGE}
            alt={t("campaign.redesign.luxBanner.imageAlt")}
            loading="lazy"
            className="h-full w-full object-cover object-center"
          />
        </div>
      </div>
    </section>
  );
}

// ─── CampaignWhyChoose ────────────────────────────────────────────────────────

export function CampaignWhyChoose() {
  const { t } = useLocale();

  const cards = [
    {
      key: "fresh",
      emoji: "🌷",
      title: t("campaign.redesign.why.fresh.title"),
      body: t("campaign.redesign.why.fresh.body"),
    },
    {
      key: "tracking",
      emoji: "📍",
      title: t("campaign.redesign.why.tracking.title"),
      body: t("campaign.redesign.why.tracking.body"),
    },
    {
      key: "support",
      emoji: "💬",
      title: t("campaign.redesign.why.support.title"),
      body: t("campaign.redesign.why.support.body"),
    },
  ];

  return (
    <section
      className="container mx-auto max-w-content px-page pt-10"
      aria-labelledby="why-choose-heading"
    >
      <h2
        id="why-choose-heading"
        className="font-serif text-2xl md:text-3xl mb-6"
      >
        {t("campaign.redesign.why.heading")}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
        {cards.map((c) => (
          <div
            key={c.key}
            className="rounded-2xl border border-[#d9dfd8] bg-white px-6 py-6"
          >
            <span className="text-2xl mb-3 block" aria-hidden="true">{c.emoji}</span>
            <h3 className="font-serif text-lg leading-snug mb-2">{c.title}</h3>
            <p className="text-sm text-neutral-600 leading-relaxed">{c.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── CampaignMoreFlowers ──────────────────────────────────────────────────────

const MORE_FLOWERS_COUNT = 6;

export function CampaignMoreFlowers({
  products,
  isLoading,
  currencyCodeOverride,
  onViewAll,
}: {
  products: CampaignCatalogProduct[];
  isLoading: boolean;
  currencyCodeOverride?: string;
  onViewAll?: () => void;
}) {
  const { t } = useLocale();
  const { city } = useLocationSelection();
  const { language } = useLocale();
  const trackRef = useRef<HTMLDivElement>(null);

  const displayProducts = products.slice(0, MORE_FLOWERS_COUNT);

  if (!isLoading && displayProducts.length === 0) return null;

  return (
    <section
      className="container mx-auto max-w-content px-page pt-10"
      aria-labelledby="more-flowers-heading"
    >
      <div className="flex items-end justify-between mb-4">
        <h2
          id="more-flowers-heading"
          className="font-serif text-2xl md:text-3xl"
        >
          {t("campaign.redesign.more.title")}
        </h2>
        <Link
          href="/category/flowers"
          onClick={onViewAll}
          className="text-sm text-primary hover:underline whitespace-nowrap py-2 shrink-0 ml-4"
          data-testid="link-campaign-more-flowers-view-all"
        >
          {t("campaign.redesign.more.viewAll")}
        </Link>
      </div>

      <div
        ref={trackRef}
        className="-mx-4 md:mx-0 pl-4 md:pl-0 scroll-pl-4 md:scroll-pl-0 flex gap-3 md:gap-4 overflow-x-auto snap-x snap-mandatory pb-2 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex-shrink-0 snap-start w-[46%] sm:w-[31%] md:w-[calc((100%-3rem)/4)] space-y-2"
              >
                <Skeleton className="aspect-square w-full rounded-xl" />
                <Skeleton className="h-3.5 w-3/4 rounded" />
                <Skeleton className="h-3.5 w-1/3 rounded" />
              </div>
            ))
          : displayProducts.map((product, i) => {
              const imageUrl = product.image?.uri;
              return (
                <div
                  key={product.id}
                  className="flex-shrink-0 snap-start w-[46%] sm:w-[31%] md:w-[calc((100%-3rem)/4)] group"
                  onClickCapture={() => {
                    trackEvent({
                      name: "product_card_click",
                      productId: product.id,
                      sectionKey: `${CAMPAIGN_SECTION_KEY}:more`,
                      displayedPosition: i + 1,
                    });
                  }}
                >
                  <Link href={`/product/${product.id}`}>
                    <div className="relative aspect-square overflow-hidden rounded-xl bg-stone-100 mb-2">
                      {imageUrl ? (
                        <ProductImage
                          src={imageUrl}
                          product={{ name: product.name }}
                          locale={language}
                          cityName={city?.name ?? ""}
                          className="object-cover w-full h-full group-hover:scale-[1.02] transition-transform duration-500"
                          sizes="(max-width: 760px) 46vw, 25vw"
                          width={300}
                          height={300}
                          priority={false}
                          fallback={
                            <div className="w-full h-full flex items-center justify-center bg-stone-100">
                              <span className="text-stone-400 text-xs px-2 text-center line-clamp-3">{product.name}</span>
                            </div>
                          }
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-stone-100">
                          <span className="text-stone-400 text-xs px-2 text-center line-clamp-3">{product.name}</span>
                        </div>
                      )}
                    </div>
                    <h3 className="font-serif text-sm leading-snug line-clamp-2 text-neutral-900 mb-0.5">
                      {product.name}
                    </h3>
                    <p className="text-sm font-medium text-neutral-900">
                      <SalePrice
                        priceValue={product.priceValue}
                        discountPriceValue={product.discountPriceValue}
                        discountPriceAed={product.discountPriceAed}
                        currencyCodeOverride={currencyCodeOverride}
                      />
                    </p>
                  </Link>
                </div>
              );
            })}
        <div className="flex-shrink-0 w-4 md:hidden" aria-hidden />
      </div>
    </section>
  );
}

// ─── CampaignFaq ──────────────────────────────────────────────────────────────

export function CampaignFaq({
  onExpand,
}: {
  onExpand?: (questionKey: string) => void;
}) {
  const { t, cityName } = useLocale();
  const { countryCode, city } = useLocationSelection();
  const isUae = countryCode === "AE";
  const cityLabel = city ? cityName(city.id, city.name) : "";
  const cityParams = { city: cityLabel };

  const questions = isUae
    ? [
        { key: "q1", q: t("campaign.redesign.uae.faq.q1", cityParams), a: t("campaign.redesign.uae.faq.a1", cityParams) },
        { key: "q2", q: t("campaign.redesign.uae.faq.q2", cityParams), a: t("campaign.redesign.uae.faq.a2", cityParams) },
        { key: "q3", q: t("campaign.redesign.uae.faq.q3", cityParams), a: t("campaign.redesign.uae.faq.a3", cityParams) },
        { key: "q4", q: t("campaign.redesign.uae.faq.q4", cityParams), a: t("campaign.redesign.uae.faq.a4", cityParams) },
        { key: "q5", q: t("campaign.redesign.uae.faq.q5", cityParams), a: t("campaign.redesign.uae.faq.a5", cityParams) },
      ]
    : [
        { key: "q1", q: t("campaign.redesign.faq.q1", cityParams), a: t("campaign.redesign.faq.a1", cityParams) },
        { key: "q2", q: t("campaign.redesign.faq.q2", cityParams), a: t("campaign.redesign.faq.a2", cityParams) },
        { key: "q3", q: t("campaign.redesign.faq.q3", cityParams), a: t("campaign.redesign.faq.a3", cityParams) },
        { key: "q4", q: t("campaign.redesign.faq.q4", cityParams), a: t("campaign.redesign.faq.a4", cityParams) },
        { key: "q5", q: t("campaign.redesign.faq.q5", cityParams), a: t("campaign.redesign.faq.a5", cityParams) },
      ];
  const heading = isUae
    ? t("campaign.redesign.uae.faq.heading", cityParams)
    : t("campaign.redesign.faq.heading", cityParams);

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };

  return (
    <section
      className="container mx-auto max-w-content px-page pt-10 pb-4"
      aria-labelledby="campaign-faq-heading"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <h2
        id="campaign-faq-heading"
        className="font-serif text-2xl md:text-3xl mb-5"
      >
        {heading}
      </h2>
      <Accordion type="single" collapsible className="w-full">
        {questions.map(({ key, q, a }) => (
          <AccordionItem key={key} value={key} className="border-[#d9dfd8]">
            <AccordionTrigger
              className="text-start text-base font-medium text-neutral-900 hover:no-underline py-4"
              onClick={() => onExpand?.(key)}
            >
              {q}
            </AccordionTrigger>
            <AccordionContent className="text-sm text-neutral-600 leading-relaxed pb-5">
              {a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

// ─── CampaignSeoEditorial ─────────────────────────────────────────────────────

export function CampaignSeoEditorial() {
  const { t, cityName } = useLocale();
  const { countryCode, city } = useLocationSelection();
  const isUae = countryCode === "AE";
  const cityLabel = city ? cityName(city.id, city.name) : "";
  const cityParams = { city: cityLabel };
  const heading = isUae
    ? t("campaign.redesign.uae.seo.heading", cityParams)
    : t("campaign.redesign.seo.heading", cityParams);
  const paragraphs = isUae
    ? [
        t("campaign.redesign.uae.seo.p1", cityParams),
        t("campaign.redesign.uae.seo.p2", cityParams),
        t("campaign.redesign.uae.seo.p3", cityParams),
      ]
    : [
        t("campaign.redesign.seo.p1", cityParams),
        t("campaign.redesign.seo.p2", cityParams),
        t("campaign.redesign.seo.p3", cityParams),
      ];

  return (
    <section
      className="container mx-auto max-w-content px-page pt-10 pb-6"
      aria-labelledby="campaign-seo-heading"
    >
      <div className="rounded-2xl border border-[#d9dfd8] bg-white px-6 py-7 md:px-10 md:py-8">
        <h2
          id="campaign-seo-heading"
          className="font-serif text-xl md:text-2xl mb-4 text-neutral-900"
        >
          {heading}
        </h2>
        <div className="space-y-3 text-sm text-neutral-600 leading-relaxed">
          {paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Legacy components (kept for backwards compat) ────────────────────────────

export function CampaignAddressExplainer() {
  const { t } = useLocale();

  const steps = [
    {
      n: 1,
      title: t("campaign.v2.address.step1.title"),
      body: t("campaign.v2.address.step1.body"),
    },
    {
      n: 2,
      title: t("campaign.v2.address.step2.title"),
      body: null as null | string,
    },
    {
      n: 3,
      title: t("campaign.v2.address.step3.title"),
      body: t("campaign.v2.address.step3.body"),
    },
  ];

  return (
    <section
      className="bg-[#FAF6EF] mt-10"
      aria-labelledby="address-explainer-heading"
    >
      <div className="container mx-auto max-w-content px-page py-10 md:py-14">
        <div className="mb-8 md:mb-10 max-w-xl">
          <h2
            id="address-explainer-heading"
            className="font-serif text-2xl md:text-3xl mb-3"
          >
            {t("campaign.v2.address.heading")}
          </h2>
          <p className="text-neutral-600 text-base leading-relaxed">
            {t("campaign.v2.address.sub")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
          <div className="bg-white rounded-2xl px-6 py-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#00414e] text-white text-sm font-bold">
                1
              </span>
              <h3 className="font-serif text-lg leading-snug">{steps[0].title}</h3>
            </div>
            <p className="text-neutral-600 text-sm leading-relaxed">{steps[0].body}</p>
          </div>

          <div className="bg-white rounded-2xl px-6 py-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#00414e] text-white text-sm font-bold">
                2
              </span>
              <h3 className="font-serif text-lg leading-snug">{steps[1].title}</h3>
            </div>
            <p className="text-neutral-600 text-sm leading-relaxed">
              <strong className="font-semibold text-neutral-900">
                {t("campaign.v2.address.step2.emphasis")}
              </strong>
              {t("campaign.v2.address.step2.body2")}
            </p>
          </div>

          <div className="bg-white rounded-2xl px-6 py-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#00414e] text-white text-sm font-bold">
                3
              </span>
              <h3 className="font-serif text-lg leading-snug">{steps[2].title}</h3>
            </div>
            <p className="text-neutral-600 text-sm leading-relaxed">{steps[2].body}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function FiveStars() {
  const { t } = useLocale();
  return (
    <div className="flex gap-0.5" aria-label={t("campaign.v2.reviews.fiveStars")} role="img">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4 text-[#00B67A]"
          aria-hidden="true"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

const PLACEHOLDER_REVIEWS = [
  { key: "abroad" },
  { key: "speed" },
  { key: "tracking" },
] as const;

export function CampaignReviews() {
  const { t, language } = useLocale();
  const { countryCode, cityId } = useLocationSelection();

  const trackReviewsClick = () => {
    trackEvent({
      name: "trustpilot_reviews_click",
      page_path: typeof window === "undefined" ? "" : window.location.pathname,
      selected_country: countryCode ?? "",
      selected_city: cityId ?? "",
      active_language: language,
      link_type: "external_link",
    });
  };

  return (
    <section
      className="container mx-auto max-w-content px-page pt-10 pb-6"
      aria-labelledby="reviews-heading"
    >
      <div className="flex items-end justify-between mb-6">
        <h2
          id="reviews-heading"
          className="font-serif text-2xl md:text-3xl"
        >
          {t("campaign.v2.reviews.heading")}
        </h2>
        <a
          href="https://www.trustpilot.com/review/presentail.com"
          target="_blank"
          rel="noopener noreferrer"
          onClick={trackReviewsClick}
          className="text-sm text-primary hover:underline whitespace-nowrap py-2 shrink-0 ml-4"
          data-testid="link-campaign-reviews-read-all"
        >
          {t("campaign.v2.reviews.readAll")}
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
        {PLACEHOLDER_REVIEWS.map((r) => (
          <div
            key={r.key}
            className="bg-white border border-neutral-200 rounded-2xl px-5 py-5 flex flex-col gap-3"
          >
            <FiveStars />
            <p className="text-neutral-700 text-sm leading-relaxed flex-1">
              &ldquo;{t(`campaign.v2.reviews.${r.key}.quote`)}&rdquo;
            </p>
            <div className="text-xs text-neutral-500 leading-snug">
              <span className="font-semibold text-neutral-700">
                {t(`campaign.v2.reviews.${r.key}.reviewer`)}
              </span>
              {" · "}
              {t(`campaign.v2.reviews.${r.key}.product`)}
            </div>
          </div>
        ))}
      </div>

    </section>
  );
}
