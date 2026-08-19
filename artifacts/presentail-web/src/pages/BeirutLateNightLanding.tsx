import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Clock3, MapPinOff, Route, MessageCircle, AlertCircle } from "lucide-react";
import { 
  useGetBeirutLateNightCampaign,
  getGetBeirutLateNightCampaignQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useDeliverySelection } from "@/contexts/DeliverySelectionContext";
import { TrustpilotMicroWidget } from "@/components/product/TrustpilotMicroWidget";
import { ProductImage } from "@/components/ProductImage";
import { SalePrice } from "@/components/SalePrice";
import { trackEvent } from "@/lib/analytics";
import { fireGtagEvent } from "@/lib/gtag";
import { markCampaignIdentity, LATE_NIGHT_CAMPAIGN_SECTION_KEY } from "@/lib/campaign";
import { buildCampaignSupportUrl } from "@/lib/campaignLanding";
import type { HomepageBestSellerProduct } from "@workspace/api-client-react";

const HERO_IMAGE_768 = `${import.meta.env.BASE_URL}campaign/flower-hero-768.webp`;
const HERO_IMAGE_1440 = `${import.meta.env.BASE_URL}campaign/flower-hero-1440.webp`;
const HERO_IMAGE_SRCSET = `${HERO_IMAGE_768} 768w, ${HERO_IMAGE_1440} 1440w`;
const ERROR_TITLE = "Something went wrong"; // i18n-ignore — paid-only English route
const ERROR_BODY = "We couldn't load the late-night delivery options."; // i18n-ignore
const RETRY_LABEL = "Try again"; // i18n-ignore
const NO_ADDRESS_LABEL = "No address needed"; // i18n-ignore — paid-only English route
const LIVE_TRACKING_LABEL = "Live order tracking"; // i18n-ignore
const SUPPORT_AGENT_LABEL = "Chat with a support agent"; // i18n-ignore
const AVAILABLE_TONIGHT_LABEL = "Available tonight"; // i18n-ignore
const BEST_SELLER_LABEL = "Best Seller"; // i18n-ignore
const NO_ARRANGEMENTS_LABEL = "No arrangements available at the moment."; // i18n-ignore

function BeirutLateNightHero({
  pillText,
  headline,
  subtitle,
  ctaText,
  onCtaClick,
  supportUrl,
  onSupportClick,
}: {
  pillText: string;
  headline: string;
  subtitle: string;
  ctaText: string;
  onCtaClick: () => void;
  supportUrl: string;
  onSupportClick: () => void;
}) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.setAttribute("fetchpriority", "high");
    link.setAttribute("imagesrcset", HERO_IMAGE_SRCSET);
    link.setAttribute("imagesizes", "(max-width: 768px) 100vw, 1152px");
    link.href = HERO_IMAGE_1440;
    document.head.appendChild(link);
    return () => link.remove();
  }, []);

  return (
    <div className="container mx-auto max-w-content px-page pt-3 md:pt-4">
      <section className="relative isolate min-h-[430px] overflow-hidden rounded-[1.75rem] bg-[#0c0f12] md:h-[360px] md:min-h-0">
        <img
          src={HERO_IMAGE_1440}
          srcSet={HERO_IMAGE_SRCSET}
          sizes="(max-width: 768px) 100vw, 1152px"
          alt="Late-night flower delivery in Beirut" // i18n-ignore — paid-only English route
          className="absolute inset-0 h-full w-full object-cover object-[62%_center] md:object-center mix-blend-luminosity opacity-70"
          fetchPriority="high"
          decoding="async"
        />
        <div
          className="absolute inset-0 bg-gradient-to-r from-[#0c0f12]/95 via-[#131920]/85 to-[#131920]/30 md:via-[#131920]/80"
          aria-hidden="true"
        />
        <div className="relative z-10 flex h-full max-w-2xl flex-col justify-center px-6 py-8 text-[#fffaf0] sm:px-8 md:px-12 md:py-7">
          <p
            className="mb-3 w-fit rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold tracking-wide backdrop-blur-md text-[#f4d9aa]"
            data-testid="late-night-status-pill"
          >
            {pillText}
          </p>
          <h1
            className="max-w-xl font-serif text-3xl leading-[1.05] tracking-tight sm:text-4xl md:text-5xl text-white"
            data-testid="late-night-headline"
          >
            {headline}
          </h1>
          <p 
            className="mt-3 max-w-lg text-sm leading-relaxed text-white/80 md:text-base"
            data-testid="late-night-support-copy"
          >
            {subtitle}
          </p>

          <div className="mt-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
            <Button
              type="button"
              size="lg"
              className="h-12 bg-[#fff8e9] px-8 font-semibold text-[#0c0f12] hover:bg-white shadow-[0_0_20px_rgba(244,217,170,0.15)]"
              onClick={onCtaClick}
              data-testid="late-night-hero-cta"
            >
              {ctaText}
            </Button>
            <a
              href={supportUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onSupportClick}
              className="text-sm font-medium text-white/90 underline decoration-white/40 underline-offset-4 hover:text-[#f4d9aa] hover:decoration-[#f4d9aa]/60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white transition-colors"
              data-testid="late-night-support-link"
            >
              Need help choosing? Chat with a support agent
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

function LateNightTrustBar({ availabilityText }: { availabilityText: string }) {
  return (
    <div className="container mx-auto max-w-content px-page pt-4">
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="grid md:grid-cols-4 md:divide-y-0 md:divide-x md:divide-neutral-200 divide-y">
          <div className="flex min-h-14 items-center gap-3 px-4 py-3 md:px-5" data-testid="late-night-trust-cell-cutoff">
            <Clock3 className="h-5 w-5 shrink-0 text-[#0c0f12]" aria-hidden="true" />
            <span className="text-sm font-medium leading-snug text-neutral-900">
              {availabilityText}
            </span>
          </div>
          <div className="flex min-h-14 items-center gap-3 px-4 py-3 md:px-5" data-testid="late-night-trust-cell-address">
            <MapPinOff className="h-5 w-5 shrink-0 text-[#0c0f12]" aria-hidden="true" />
            <span className="text-sm font-medium leading-snug text-neutral-900">
              {NO_ADDRESS_LABEL}
            </span>
          </div>
          <div className="flex min-h-14 items-center gap-3 px-4 py-3 md:px-5" data-testid="late-night-trust-cell-tracking">
            <Route className="h-5 w-5 shrink-0 text-[#0c0f12]" aria-hidden="true" />
            <span className="text-sm font-medium leading-snug text-neutral-900">
              {LIVE_TRACKING_LABEL}
            </span>
          </div>
          <div className="flex min-h-14 items-center gap-3 px-4 py-3 md:px-5" data-testid="late-night-trust-cell-trustpilot">
            <TrustpilotMicroWidget />
          </div>
        </div>
      </div>
    </div>
  );
}

function LateNightEmptyState({
  supportUrl,
  onSupportClick,
}: {
  supportUrl: string;
  onSupportClick: () => void;
}) {
  return (
    <div className="container mx-auto max-w-content px-page pt-12 pb-24" data-testid="late-night-empty-state">
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100">
          <Clock3 className="h-8 w-8 text-neutral-400" />
        </div>
        <h2 className="font-serif text-2xl md:text-3xl text-neutral-900 mb-3" data-testid="late-night-empty-headline">
          Late-night delivery is unavailable right now
        </h2>
        <p className="text-neutral-500 mb-8" data-testid="late-night-empty-support">
          Live delivery availability or eligible flower inventory could not be confirmed. Chat with our support team to find the next available option.
        </p>
        <Button asChild size="lg" className="bg-[#0c0f12] text-white hover:bg-neutral-800">
           <a
             href={supportUrl}
             target="_blank"
             rel="noopener noreferrer"
             onClick={onSupportClick}
           >
            <MessageCircle className="mr-2 h-5 w-5" />
             {SUPPORT_AGENT_LABEL}
          </a>
        </Button>
      </div>
    </div>
  );
}

export function LateNightStickyBar({
  onCtaClick,
  heroRef,
  ctaText,
}: {
  onCtaClick: () => void;
  heroRef?: React.RefObject<HTMLElement | null>;
  ctaText: string;
}) {
  const [heroVisible, setHeroVisible] = useState(true);
  useEffect(() => {
    const el = heroRef?.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setHeroVisible(false);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => setHeroVisible(entry.isIntersecting),
      { threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [heroRef]);

  const shown = !heroVisible;

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-white border-t border-neutral-200 px-4 pt-3 transition-transform duration-300 ease-out shadow-[0_-4px_12px_rgba(0,0,0,0.05)]"
      style={{
        paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
        transform: shown ? "translateY(0)" : "translateY(110%)",
      }}
      data-testid="late-night-sticky-cta-bar"
      aria-hidden={!shown}
    >
      <Button
        className="w-full h-12 text-sm font-semibold bg-[#0c0f12] hover:bg-neutral-800"
        onClick={onCtaClick}
        data-testid="late-night-sticky-cta"
        disabled={!shown}
        tabIndex={shown ? 0 : -1}
      >
        {ctaText}
      </Button>
    </div>
  );
}

function LateNightProductCard({
  product,
  index,
  onClickCapture,
  isTonight,
}: {
  product: HomepageBestSellerProduct;
  index: number;
  onClickCapture: () => void;
  isTonight: boolean;
}) {
  const { language } = useLocale();
  const { city } = useLocationSelection();
  const imageUrl = product.image?.uri;

  const fallbackTile = (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-[#f9faf9] px-3 text-center">
      <span className="text-neutral-400 font-serif text-sm leading-snug line-clamp-4">
        {product.name}
      </span>
    </div>
  );

  return (
    <div
      className="group"
      data-testid={`late-night-card-${product.id}`}
      onClickCapture={onClickCapture}
    >
      <Link href={`/product/${product.id}`}>
        <div className="relative aspect-square overflow-hidden rounded-xl bg-[#f9faf9] mb-2.5">
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

          {isTonight && (
            <div className="absolute start-2 top-2 rounded-full bg-[#0c0f12] px-2.5 py-1 text-[10px] font-semibold leading-none tracking-wide text-white">
              {AVAILABLE_TONIGHT_LABEL}
            </div>
          )}
          {!isTonight && product.isBestSeller && (
            <div className="absolute start-2 top-2 rounded-full bg-[#0c0f12] px-2.5 py-1 text-[10px] font-semibold leading-none tracking-wide text-white">
              {BEST_SELLER_LABEL}
            </div>
          )}
        </div>

        <div className="space-y-0.5">
          <h3 className="font-serif text-sm leading-snug line-clamp-2 text-neutral-900">
            {product.name}
          </h3>
          <p className="text-xs font-medium text-neutral-500">
            {isTonight ? "Available tonight" : "In stock"}
          </p>
          <p className="text-sm font-medium text-neutral-900">
            <SalePrice
              priceValue={product.priceValue}
              discountPriceValue={product.discountPriceValue}
              discountPriceAed={product.discountPriceAed}
            />
          </p>
        </div>
      </Link>
    </div>
  );
}

function LateNightCampaignGrid({
  section,
  title,
  sub,
  viewAllLink,
  viewAllText,
  products,
  id,
  isTonight,
  onSelectDeliveryWindow,
}: {
  section: "flowers" | "luxury";
  title: string;
  sub?: string;
  viewAllLink?: string;
  viewAllText?: string;
  products: HomepageBestSellerProduct[];
  id?: string;
  isTonight: boolean;
  onSelectDeliveryWindow: () => void;
}) {
  const displayProducts = products.slice(0, 8);
  const impressedProductIds = useRef(new Set<string>());

  useEffect(() => {
    displayProducts.forEach((product, index) => {
      if (impressedProductIds.current.has(product.id)) return;
      impressedProductIds.current.add(product.id);
      trackEvent({
        name: "product_impression",
        productId: product.id,
        sectionKey: `${LATE_NIGHT_CAMPAIGN_SECTION_KEY}:${section}`,
        displayedPosition: index + 1,
      });
      fireGtagEvent("view_item_list", {
        item_list_id: `${LATE_NIGHT_CAMPAIGN_SECTION_KEY}:${section}`,
        item_id: product.id,
        index: index + 1,
      });
    });
  }, [section, products]);

  return (
    <section
      id={id}
      className="container mx-auto max-w-content px-page pt-8 scroll-mt-24"
      aria-labelledby={`${id}-heading`}
    >
      <div className="flex items-end justify-between mb-1.5">
        <h2 id={`${id}-heading`} className="font-serif text-2xl md:text-3xl text-neutral-900">
          {title}
        </h2>
        {viewAllLink && viewAllText && (
          <Link
            href={viewAllLink}
            onClick={() => {
              onSelectDeliveryWindow();
              trackEvent({
                name: "campaign_view_all_click",
                sectionKey: `${LATE_NIGHT_CAMPAIGN_SECTION_KEY}:${section}`,
                linkSlug: section,
              });
              fireGtagEvent("campaign_view_all_click", {
                section: LATE_NIGHT_CAMPAIGN_SECTION_KEY,
                campaign_section: section,
              });
            }}
            className="text-sm text-[#0c0f12] font-medium hover:underline whitespace-nowrap py-2 shrink-0 ml-4"
            data-testid={`late-night-view-all-${section}`}
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

      {displayProducts.length > 0 ? (
        <div className="flex overflow-x-auto snap-x snap-mandatory pb-4 -mx-page px-page gap-3 md:grid md:grid-cols-3 min-[1080px]:grid-cols-4 md:gap-5 md:overflow-x-visible md:pb-0 md:px-0 md:mx-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {displayProducts.map((product, i) => (
            <div key={product.id} className="snap-start shrink-0 w-[60vw] md:w-auto">
              <LateNightProductCard
                product={product}
                index={i}
                isTonight={isTonight}
                onClickCapture={() => {
                  onSelectDeliveryWindow();
                  trackEvent({
                    name: "product_card_click",
                    productId: product.id,
                    sectionKey: `${LATE_NIGHT_CAMPAIGN_SECTION_KEY}:${section}`,
                    displayedPosition: i + 1,
                  });
                  fireGtagEvent("select_item", {
                    item_list_id: `${LATE_NIGHT_CAMPAIGN_SECTION_KEY}:${section}`,
                    item_id: product.id,
                    index: i + 1,
                  });
                }}
              />
            </div>
          ))}
        </div>
      ) : (
        <div
          className="rounded-2xl border border-neutral-200 bg-white px-5 py-8 text-center text-sm text-neutral-500"
          data-testid={`late-night-grid-empty-${section}`}
        >
          {NO_ARRANGEMENTS_LABEL}
        </div>
      )}
    </section>
  );
}

export default function BeirutLateNightLanding() {
  const [, navigate] = useLocation();
  const deliverySelection = useDeliverySelection();
  const supportUrl = buildCampaignSupportUrl("I need help choosing flowers for late-night delivery in Beirut.");
  
  useEffect(() => {
    markCampaignIdentity(LATE_NIGHT_CAMPAIGN_SECTION_KEY);
    trackEvent({
      name: "campaign_page_view",
      sectionKey: LATE_NIGHT_CAMPAIGN_SECTION_KEY,
    });
    fireGtagEvent("campaign_page_view", {
      section: LATE_NIGHT_CAMPAIGN_SECTION_KEY
    });
  }, []);

  const { data, isLoading, isError, refetch } = useGetBeirutLateNightCampaign({
    query: {
      queryKey: getGetBeirutLateNightCampaignQueryKey(),
      staleTime: 0,
      gcTime: 5000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchInterval: (query) => {
        const queryData = query.state.data;
        if (!queryData) return 30000;
        const now = Date.now();
        const expiresAt = new Date(queryData.quoteExpiresAt).getTime();
        const msUntilExpiry = expiresAt - now;
        return Math.max(1000, Math.min(msUntilExpiry, 30000));
      }
    }
  });

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refetch();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [refetch]);

  const heroRef = useRef<HTMLDivElement>(null);
  const [quoteExpired, setQuoteExpired] = useState(false);

  useEffect(() => {
    if (!data?.quoteExpiresAt) {
      setQuoteExpired(false);
      return;
    }
    const expiresAt = new Date(data.quoteExpiresAt).getTime();
    const delay = expiresAt - Date.now();
    if (!Number.isFinite(delay) || delay <= 0) {
      setQuoteExpired(true);
      void refetch();
      return;
    }
    setQuoteExpired(false);
    const timer = window.setTimeout(() => {
      setQuoteExpired(true);
      void refetch();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [data?.quoteExpiresAt, refetch]);

  const isTonight = data?.status === "tonight";
  const isNextAvailable = data?.status === "next-available";
  const isUnavailable = data?.status === "unavailable" || (!isTonight && !isNextAvailable);

  const selectCampaignWindow = () => {
    const campaignWindow = isTonight
      ? data?.deliveryWindow
      : isNextAvailable
        ? data?.nextAvailableWindow
        : undefined;
    if (!campaignWindow) return;
    deliverySelection.setSelection({
      mode: isTonight ? "today_slot" : "schedule",
      date: campaignWindow.date,
      slotLabel: campaignWindow.label,
      slotId: campaignWindow.slotId,
      source: "user_selected",
    });
  };

  const handleCtaClick = () => {
    trackEvent({
      name: "campaign_hero_cta_click",
      sectionKey: LATE_NIGHT_CAMPAIGN_SECTION_KEY,
    });
    fireGtagEvent("campaign_hero_cta_click", {
      section: LATE_NIGHT_CAMPAIGN_SECTION_KEY,
    });
    if (isTonight) {
      selectCampaignWindow();
      document.getElementById("late-night-flowers")?.scrollIntoView({ behavior: "smooth" });
    } else {
      selectCampaignWindow();
      navigate(data?.availableTonight?.viewAllHref ?? "/category/flowers"); // i18n-ignore
    }
  };

  const handleSupportClick = () => {
    trackEvent({
      name: "campaign_support_click",
      sectionKey: LATE_NIGHT_CAMPAIGN_SECTION_KEY,
    });
    fireGtagEvent("campaign_support_click", {
      section: LATE_NIGHT_CAMPAIGN_SECTION_KEY,
    });
  };
  const handleRetry = () => {
    void refetch();
  };

  // Never render an expired "tonight" quote while its replacement is loading.
  const isEffectivelyLoading = (isLoading && !data) || quoteExpired;

  if (isEffectivelyLoading) {
    return (
      <div className="flex flex-col min-h-[100dvh] bg-neutral-50 pb-20" data-testid="late-night-page">
        <div className="container mx-auto max-w-content px-page pt-3 md:pt-4">
          <Skeleton className="h-[430px] w-full rounded-[1.75rem] md:h-[360px]" />
        </div>
        <div className="container mx-auto max-w-content px-page pt-4">
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
        <div className="container mx-auto max-w-content px-page pt-8">
          <Skeleton className="h-8 w-1/3 mb-6" />
          <div className="flex overflow-x-auto gap-3 -mx-page px-page md:grid md:grid-cols-3 min-[1080px]:grid-cols-4 md:gap-5 md:overflow-x-visible md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="shrink-0 w-[60vw] md:w-auto">
                <Skeleton className="aspect-square w-full rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col min-h-[100dvh] bg-neutral-50 items-center justify-center py-20 px-page text-center" data-testid="late-night-page">
        <AlertCircle className="h-10 w-10 text-red-500 mb-4" />
        <h2 className="font-serif text-2xl text-neutral-900 mb-2">{ERROR_TITLE}</h2>
        <p className="text-neutral-500 mb-6">{ERROR_BODY}</p>
        <Button onClick={handleRetry}>{RETRY_LABEL}</Button>
      </div>
    );
  }

  let pillText = "";
  let headline = "";
  let subtitle = "";
  let ctaText = "";

  if (isTonight) {
    pillText = `Delivering late tonight \u00B7 Order by ${data?.cutoffLabel ?? "11:30 PM"} Beirut time`;
    headline = "Late-night flower delivery in Beirut";
    subtitle = "Last-minute doesn\u2019t have to feel last-minute. Choose from fresh arrangements available now for delivery tonight in Beirut."; // i18n-ignore — approved English ad copy
    ctaText = "Shop flowers available tonight";
  } else if (isNextAvailable && data?.nextAvailableWindow) {
    const nextDate = new Intl.DateTimeFormat("en-LB", {
      timeZone: data.timeZone || "Asia/Beirut", // i18n-ignore
      weekday: "long",
      month: "short",
      day: "numeric",
    }).format(new Date(data.nextAvailableWindow.date));
    pillText = `Next delivery: ${nextDate} \u00B7 ${data.nextAvailableWindow.label}`;
    headline = "Flower delivery in Beirut";
    subtitle = `Browse fresh arrangements for the next available Beirut delivery window: ${nextDate}, ${data.nextAvailableWindow.label}.`;
    ctaText = "Shop flowers for the next window";
  }

  const showEmptyState = isUnavailable;

  return (
    <div className="flex flex-col min-h-[100dvh] bg-neutral-50 pb-20" data-testid="late-night-page">
      
      {!showEmptyState ? (
        <div ref={heroRef}>
          <BeirutLateNightHero
            pillText={pillText}
            headline={headline}
            subtitle={subtitle}
            ctaText={ctaText}
            onCtaClick={handleCtaClick}
            supportUrl={supportUrl}
            onSupportClick={handleSupportClick}
          />
        </div>
      ) : (
        <div ref={heroRef} className="pt-8" />
      )}

      {!showEmptyState && (
        <LateNightTrustBar
          availabilityText={
            isTonight && data?.cutoffLabel
              ? `Order by ${data.cutoffLabel} Beirut time`
              : pillText
          }
        />
      )}

      {showEmptyState ? (
        <LateNightEmptyState
          supportUrl={supportUrl}
          onSupportClick={handleSupportClick}
        />
      ) : (
        <>
          {data?.availableTonight && data.availableTonight.products.length > 0 && (
            <div data-testid="late-night-section-flowers">
              <LateNightCampaignGrid
                id="late-night-flowers"
                section="flowers"
                title={isTonight ? "Available Tonight" : "Available for the Next Window"}
                sub={isTonight ? "Fresh flowers ready for late-night delivery in Beirut" : "Fresh flowers for the next available Beirut delivery window"}
                viewAllLink={data.availableTonight.viewAllHref}
                viewAllText="View all flowers"
                products={data.availableTonight.products}
                isTonight={isTonight}
                onSelectDeliveryWindow={selectCampaignWindow}
              />
            </div>
          )}
          
          {data?.luxury && data.luxury.products.length > 0 && (
            <div data-testid="late-night-section-luxury">
              <LateNightCampaignGrid
                id="late-night-luxury"
                section="luxury"
                title={isTonight ? "Late-Night Luxury Arrangements" : "Luxury Arrangements"}
                sub={isTonight ? "Statement flowers for unforgettable last-minute moments" : data.luxury.subtitle}
                viewAllLink={data.luxury.viewAllHref}
                viewAllText="View all arrangements"
                products={data.luxury.products}
                isTonight={isTonight}
                onSelectDeliveryWindow={selectCampaignWindow}
              />
            </div>
          )}
        </>
      )}

      {!showEmptyState && (
        <LateNightStickyBar 
          heroRef={heroRef} 
          onCtaClick={handleCtaClick} 
          ctaText={ctaText}
        />
      )}
    </div>
  );
}
