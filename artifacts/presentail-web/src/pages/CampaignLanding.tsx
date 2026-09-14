import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { getGetHomepageCollectionBestSellersQueryOptions } from "@workspace/api-client-react";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useLocale } from "@/contexts/LocaleContext";
import { apiFetch } from "@/lib/api";
import { trackEvent, trackWebEvent } from "@/lib/analytics";
import { fireGtagEvent } from "@/lib/gtag";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import { readAttribution } from "@/lib/attribution";
import {
  CAMPAIGN_SECTION_KEY,
  BIENVENUE_DIX_CODE,
  hasOrderedLocally,
  markFirstOrderPromoShown,
  markPendingCampaignCoupon,
  setDirectCouponForCheckout,
} from "@/lib/campaign";
import {
  buildCampaignSupportUrl,
  CAMPAIGN_QUICK_FILTER_QUERY_PARAM,
  CAMPAIGN_QUERY_CATEGORY_SLUGS,
  getCampaignMarket,
  getPriceBandConfig,
  isTargetCampaignCity,
  resolveCampaignAvailability,
  computeCountdownMinutes,
  filterCampaignProducts,
  parseCampaignQuickFilter,
  serializeCampaignQuickFilter,
  selectCampaignCatalogSections,
  type CampaignQuickFilterKey,
  type CampaignCatalogProduct,
} from "@/lib/campaignLanding";
import { useIpDetectedCountry } from "@/lib/useIpDetectedCountry";
import {
  CampaignHero,
  CampaignTrustBar,
  CampaignStickyBar,
  CampaignLocationBar,
  CampaignTrustpilotStrip,
} from "@/pages/CampaignHero";
import {
  CampaignGrid,
  CampaignOccasions,
  CampaignBenefitBand,
  CampaignLuxuryBanner,
  CampaignWhyChoose,
  CampaignMoreFlowers,
  CampaignReviews,
  CampaignFaq,
  CampaignSeoEditorial,
  CampaignRealDeliveries,
} from "@/pages/CampaignSections";
import { TrustpilotCarousel } from "@/components/homepage/TrustpilotCarousel";
import { CampaignLandingLegacy } from "./CampaignLandingLegacy";

const ATTRIBUTION_QUERY_KEYS = [
  "gclid",
  "gbraid",
  "wbraid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_id",
  "utm_term",
  "utm_content",
] as const;

function preserveCampaignAttribution(search: string): string {
  const params = new URLSearchParams(search);
  const attribution = readAttribution();
  const touch = attribution?.last_touch ?? attribution?.first_touch;
  if (touch) {
    for (const key of ATTRIBUTION_QUERY_KEYS) {
      if (!params.has(key) && touch[key]) params.set(key, touch[key]!);
    }
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

function fireCampaignEvent(
  name:
    | "campaign_page_view"
    | "campaign_hero_cta_click"
    | "campaign_promo_impression"
    | "campaign_promo_click"
    | "campaign_view_all_click"
    | "campaign_support_click"
    | "campaign_first_product_visible"
    | "campaign_abroad_hero_impression"
    | "campaign_pill_click"
    | "campaign_sticky_cta_impression"
    | "campaign_sticky_cta_click"
    | "delivery_location_change"
    | "occasion_shortcut_click"
    | "view_all_flowers"
    | "luxury_collection_cta_click"
    | "trustpilot_carousel_interaction"
    | "faq_expand"
    | "browse_all_flowers",
  detail?: string,
): void {
  trackEvent({ name, ...(detail ? { linkSlug: detail } : {}), sectionKey: CAMPAIGN_SECTION_KEY });
  fireGtagEvent(name, { section: CAMPAIGN_SECTION_KEY, ...(detail ? { detail } : {}) });
}

function useCampaignImpressions(
  products: CampaignCatalogProduct[],
  section: "flowers" | "luxury",
): void {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current || products.length === 0) return;
    fired.current = true;
    products.slice(0, 8).forEach((product, index) => {
      trackEvent({
        name: "product_impression",
        productId: product.id,
        sectionKey: `${CAMPAIGN_SECTION_KEY}:${section}`,
        displayedPosition: index + 1,
      });
      fireGtagEvent("view_item_list", {
        item_list_id: `${CAMPAIGN_SECTION_KEY}:${section}`,
        item_id: product.id,
        index: index + 1,
      });
    });
  }, [products, section]);
}

function formatCutoff(
  hour: number,
  language: string,
  countryCode: string | null | undefined,
): string {
  const locale =
    language === "ar"
      ? countryCode === "AE"
        ? "ar-AE"
        : "ar-LB"
      : language === "fr"
        ? "fr-FR"
        : countryCode === "AE"
          ? "en-AE"
          : "en-US";
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: hour % 1 === 0 ? undefined : "2-digit",
  }).format(new Date(2020, 0, 1, hour, 0));
}

function CampaignLandingRedesign() {
  const { countryCode, cityId, city, deliveryDataStatus, openPicker } = useLocationSelection();
  const { dir, cityName, language, t } = useLocale();
  const { currencyCode } = useDisplayCurrency();
  const { country: ipCountry, settled: ipSettled } = useIpDetectedCountry();
  const [location, navigate] = useLocation();
  const search = useSearch();
  const [now, setNow] = useState(() => new Date());

  const cityLabel = city ? cityName(city.id, city.name) : "";
  const market = getCampaignMarket(cityId);
  const isAbroad =
    ipSettled && ipCountry !== null && ipCountry !== countryCode;

  useEffect(() => {
    const intervalMs = market?.countryCode === "LB" ? 1_000 : 60_000;
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [market?.countryCode]);

  // ── First-order promo eligibility ─────────────────────────────────────────
  const [promoEligible, setPromoEligible] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (hasOrderedLocally()) return;
    apiFetch<{ ok: boolean; eligible: boolean; known: boolean }>(
      "/campaign/first-order-eligibility",
    )
      .then((r) => {
        if (!cancelled && r.ok && r.eligible) setPromoEligible(true);
      })
      .catch(() => {
        if (!cancelled) setPromoEligible(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const promoImpressionFired = useRef(false);
  useEffect(() => {
    if (!promoEligible || promoImpressionFired.current) return;
    promoImpressionFired.current = true;
    markFirstOrderPromoShown();
    fireCampaignEvent("campaign_promo_impression");
  }, [promoEligible]);

  // ── Page view ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fireCampaignEvent("campaign_page_view", cityId ?? undefined);
    trackWebEvent({
      type: "page_view",
      city: cityId ?? undefined,
      properties: { section: CAMPAIGN_SECTION_KEY, campaignMarket: cityId },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Contract-backed, market-scoped collection queries.
  const catalogQueries = useQueries({
    queries: CAMPAIGN_QUERY_CATEGORY_SLUGS.map((categorySlug) =>
      getGetHomepageCollectionBestSellersQueryOptions({
        categorySlug,
        countryCode: countryCode || undefined,
        cityId: cityId || undefined,
        lang: language,
      }),
    ),
  });
  const catalog = selectCampaignCatalogSections(
    catalogQueries.flatMap((query) => query.data?.products ?? []),
  );
  const catalogLoading = catalogQueries.some((query) => query.isLoading);
  useCampaignImpressions(catalog.flowers, "flowers");
  useCampaignImpressions(catalog.luxury, "luxury");

  // ── Sticky CTA (mobile) ────────────────────────────────────────────────────
  const stickyImpressionFired = useRef(false);
  useEffect(() => {
    if (stickyImpressionFired.current) return;
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      stickyImpressionFired.current = true;
      fireCampaignEvent("campaign_sticky_cta_impression");
    }
  }, []);

  const heroRef = useRef<HTMLDivElement>(null);
  const firstGridRef = useRef<HTMLDivElement>(null);
  const firstProductVisibleCities = useRef(new Set<string>());
  const abroadImpressionFired = useRef(false);

  useEffect(() => {
    if (
      firstProductVisibleCities.current.has(cityId ?? "unknown") ||
      catalogLoading ||
      catalog.flowers.length === 0 ||
      !firstGridRef.current ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (
          !entry.isIntersecting ||
          firstProductVisibleCities.current.has(cityId ?? "unknown")
        ) {
          return;
        }
        firstProductVisibleCities.current.add(cityId ?? "unknown");
        fireCampaignEvent(
          "campaign_first_product_visible",
          JSON.stringify({ cityId, isAbroad }),
        );
        observer.disconnect();
      },
      { threshold: 0.1 },
    );
    observer.observe(firstGridRef.current);
    return () => observer.disconnect();
  }, [catalog.flowers.length, catalogLoading, cityId, isAbroad]);

  useEffect(() => {
    if (
      !isAbroad ||
      market?.countryCode !== "LB" ||
      abroadImpressionFired.current
    ) {
      return;
    }
    abroadImpressionFired.current = true;
    fireCampaignEvent("campaign_abroad_hero_impression", cityId ?? undefined);
  }, [cityId, isAbroad, market?.countryCode]);

  const scrollToProducts = () => {
    firstGridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const availabilityState = market
    ? resolveCampaignAvailability({
        now,
        timeZone: market.timeZone,
        cutoffHour: city?.sameDayCutoffHour,
        cityIsActive: city?.isActive,
        operationsConfigVerified:
          deliveryDataStatus === "live" &&
          city?.operationsConfigVerified === true,
      })
    : "unverified";
  const quickFilterEnabled = cityId === "lb-beirut";
  const activeQuickFilter = parseCampaignQuickFilter(search);
  const campaignCurrencyCode =
    market?.countryCode === "AE" ? "AED" : currencyCode;
  // Price-band filtering must compare against the currency the products are
  // actually priced in. AE products carry native AED values; all other markets
  // (including LB/Beirut) only have USD pricing. Using the visitor's display
  // currency (e.g. AED while delivering to Beirut) would compare USD-priced
  // products against AED thresholds and produce an empty state.
  const campaignFilterCurrencyCode =
    market?.countryCode === "AE" ? "AED" : "USD";
  const bandConfig = getPriceBandConfig(campaignFilterCurrencyCode);
  const currentBrowserSearch =
    typeof window !== "undefined"
      ? preserveCampaignAttribution(window.location.search)
      : search;
  // ── URL canonicalization ───────────────────────────────────────────────────
  // Runs on initial load AND whenever the active filter, currency, or URL
  // changes. Handles three cases:
  //   1. URL has a legacy key (under-60, 50-100) — rewrite to the semantic key.
  //   2. URL has a price filter not available in the current currency (e.g.
  //      price_low with EUR) — fall back to "available-today" so the grid is
  //      never empty due to an invisible chip.
  //   3. URL is missing the quick_filter param — write the default.
  // Never fires the quick_shop_filter_select analytics event.
  useEffect(() => {
    if (!quickFilterEnabled) return;
    const rawFilter = new URLSearchParams(currentBrowserSearch).get(
      CAMPAIGN_QUICK_FILTER_QUERY_PARAM,
    );
    // Determine the canonical filter for the active currency.
    const isPriceLowUnavailable = activeQuickFilter === "price_low" && !bandConfig.low;
    const isPriceMidUnavailable = activeQuickFilter === "price_mid" && !bandConfig.mid;
    const canonicalFilter =
      isPriceLowUnavailable || isPriceMidUnavailable ? "available-today" : activeQuickFilter;
    if (rawFilter === canonicalFilter) return;
    navigate(
      `${location}${serializeCampaignQuickFilter(currentBrowserSearch, canonicalFilter)}`,
      { replace: true },
    );
  }, [
    activeQuickFilter,
    bandConfig,
    currentBrowserSearch,
    location,
    navigate,
    quickFilterEnabled,
  ]);

  const quickFilterProducts = useMemo(() => {
    if (!quickFilterEnabled) return catalog.flowers;
    const source = activeQuickFilter === "luxury" ? catalog.luxury : catalog.flowers;
    return filterCampaignProducts(source, activeQuickFilter, {
      countryCode,
      cityId,
      currencyCode: campaignFilterCurrencyCode,
      bandConfig,
    });
  }, [
    activeQuickFilter,
    bandConfig,
    campaignFilterCurrencyCode,
    catalog.flowers,
    catalog.luxury,
    cityId,
    countryCode,
    quickFilterEnabled,
  ]);

  const googleAdsParams = (): Record<string, string> => {
    if (typeof window === "undefined") return {};
    const params = new URLSearchParams(window.location.search);
    const result: Record<string, string> = {};
    for (const key of [
      "gclid",
      "gbraid",
      "wbraid",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_id",
      "utm_term",
      "utm_content",
    ]) {
      const value = params.get(key);
      if (value) result[key] = value;
    }
    return result;
  };

  const getFilterLabel = (filter: CampaignQuickFilterKey): string => {
    switch (filter) {
      case "available-today":
        return t("campaign.redesign.quickFilters.availableToday");
      case "price_low":
        return bandConfig.low ? t(bandConfig.low.labelKey) : "";
      case "price_mid":
        return bandConfig.mid ? t(bandConfig.mid.labelKey) : "";
      case "roses":
        return t("campaign.redesign.quickFilters.roses");
      case "luxury":
        return t("campaign.redesign.quickFilters.luxury");
      case "best-sellers":
        return t("campaign.redesign.quickFilters.bestSellers");
    }
  };

  const selectQuickFilter = (nextFilter: CampaignQuickFilterKey) => {
    if (!quickFilterEnabled) return;
    const previousFilter = activeQuickFilter;
    const nextSearch = serializeCampaignQuickFilter(
      typeof window !== "undefined"
        ? preserveCampaignAttribution(window.location.search)
        : search,
      nextFilter,
    );
    const nextSource = nextFilter === "luxury" ? catalog.luxury : catalog.flowers;
    const nextResultCount = filterCampaignProducts(nextSource, nextFilter, {
      countryCode,
      cityId,
      currencyCode: campaignFilterCurrencyCode,
      bandConfig,
    }).length;
    const lowerThreshold =
      nextFilter === "price_low"
        ? undefined
        : nextFilter === "price_mid"
          ? bandConfig.mid?.min
          : undefined;
    const upperThreshold =
      nextFilter === "price_low"
        ? bandConfig.low?.max
        : nextFilter === "price_mid"
          ? bandConfig.mid?.max
          : undefined;
    navigate(`${location}${nextSearch}`);
    trackWebEvent({
      type: "quick_shop_filter_select",
      city: cityId ?? undefined,
      properties: {
        filter_name: nextFilter,
        previous_filter: previousFilter,
        semantic_filter_key: nextFilter,
        displayed_filter_label: getFilterLabel(nextFilter),
        active_currency: campaignCurrencyCode,
        lower_threshold: lowerThreshold,
        upper_threshold: upperThreshold,
        result_count: nextResultCount,
        selected_city: cityId,
        selected_country: countryCode,
        page_path:
          typeof window !== "undefined" ? window.location.pathname : location,
        ...(Object.keys(googleAdsParams()).length > 0
          ? { google_ads_params: googleAdsParams() }
          : {}),
      },
    });
  };
  const availabilityText =
    availabilityState === "same-day" && city?.sameDayCutoffHour != null
      ? t("campaign.redesign.status.sameDay", {
          cutoff: formatCutoff(city.sameDayCutoffHour, language, countryCode),
        })
      : availabilityState === "next-available"
        ? t("campaign.redesign.status.nextAvailable")
        : t("campaign.redesign.status.neutral");
  const countdownMinutes =
    market?.countryCode === "LB" &&
    availabilityState === "same-day" &&
    city?.sameDayCutoffHour != null
      ? computeCountdownMinutes(
          now,
          market.timeZone,
          city.sameDayCutoffHour,
        )
      : null;
  const countdownText =
    countdownMinutes != null && countdownMinutes > 0
      ? countdownMinutes >= 60
        ? t("campaign.redesign.countdown.hours", {
            h: Math.floor(countdownMinutes / 60),
            m: countdownMinutes % 60,
          })
        : t("campaign.redesign.countdown.minutes", {
            m: countdownMinutes,
          })
      : undefined;
  const deliveryText =
    deliveryDataStatus === "live" &&
    city?.operationsConfigVerified === true &&
    city.expressAvailable !== false &&
    city.expressDeliveryLabel?.trim()
      ? t("campaign.redesign.status.speed", {
          speed: city.expressDeliveryLabel.trim(),
        })
      : t("campaign.redesign.status.speedNeutral");
  const currencyText = t("campaign.redesign.status.currency", {
    currency: campaignCurrencyCode,
  });
  const heroTitle =
    availabilityState === "same-day"
      ? t("campaign.redesign.hero.titleSameDay", { city: cityLabel })
      : t("campaign.redesign.hero.titleNeutral", { city: cityLabel });
  const heroSubtitle =
    market?.countryCode === "LB"
      ? isAbroad
        ? t("campaign.redesign.hero.subtitleAbroad", { city: cityLabel })
        : availabilityState === "same-day" && city?.sameDayCutoffHour != null
          ? t("campaign.redesign.hero.subtitleLbSameDay", {
              cutoff: formatCutoff(
                city.sameDayCutoffHour,
                language,
                countryCode,
              ),
            })
          : t("campaign.redesign.hero.subtitleLbNeutral")
      : t("campaign.redesign.hero.subtitle", { city: cityLabel });
  const supportUrl = buildCampaignSupportUrl(
    t("campaign.redesign.hero.supportPrefill", { city: cityLabel }),
  );

  return (
    <div dir={dir} className="min-h-screen bg-[#fffdf8] pb-28 md:pb-0">
      {/* 1. Hero */}
      <CampaignHero
        title={heroTitle}
        subtitle={heroSubtitle}
        availabilityText={availabilityText}
        countdownText={countdownText}
        availabilityState={availabilityState}
        cutoffHour={city?.sameDayCutoffHour}
        supportUrl={supportUrl}
        isAbroad={isAbroad && market?.countryCode === "LB"}
        couponCode={BIENVENUE_DIX_CODE}
        onPromoClick={() => {
          markPendingCampaignCoupon(BIENVENUE_DIX_CODE);
          setDirectCouponForCheckout(BIENVENUE_DIX_CODE);
          markFirstOrderPromoShown();
          fireCampaignEvent("campaign_promo_click");
        }}
        onCtaClick={() => {
          fireCampaignEvent("campaign_hero_cta_click", cityId ?? undefined);
          scrollToProducts();
        }}
        onSupportClick={() =>
          fireCampaignEvent("campaign_support_click", isAbroad ? "abroad" : "local")
        }
        sectionRef={heroRef}
      />

      {/* 2. Available-for-delivery-today product grid */}
      <div ref={firstGridRef}>
        <CampaignGrid
          id="campaign-flowers"
          section="flowers"
          title={
            quickFilterEnabled
              ? t("campaign.redesign.flowers.titleQuickShop")
              : t("campaign.redesign.flowers.title")
          }
          sub={t("campaign.redesign.flowers.subtitle")}
          viewAllLink="/category/flowers"
          viewAllText={t("campaign.redesign.viewAll")}
          products={quickFilterEnabled ? quickFilterProducts : catalog.flowers}
          isLoading={catalogLoading}
          availabilityState={availabilityState}
          currencyCodeOverride={campaignCurrencyCode}
          compactTop
          maxProducts={6}
          activeQuickFilter={quickFilterEnabled ? activeQuickFilter : undefined}
          onQuickFilterSelect={quickFilterEnabled ? selectQuickFilter : undefined}
          quickFilterBandConfig={quickFilterEnabled ? bandConfig : undefined}
          productQuery={quickFilterEnabled ? currentBrowserSearch : undefined}
          emptyMessage={
            quickFilterEnabled ? t("campaign.redesign.quickFilters.empty") : undefined
          }
          emptyActionText={
            quickFilterEnabled ? t("campaign.redesign.quickFilters.reset") : undefined
          }
          onEmptyReset={
            quickFilterEnabled ? () => selectQuickFilter("available-today") : undefined
          }
          onViewAll={() => fireCampaignEvent("view_all_flowers")}
        />
      </div>

      {/* 3. Approved florist photos from completed deliveries */}
      <CampaignRealDeliveries />

      {/* 4. Occasion shortcuts */}
      <CampaignOccasions
        onShortcutClick={(slug) =>
          fireCampaignEvent("occasion_shortcut_click", slug)
        }
      />

      {/* 5. Delivery-location selector */}
      <CampaignLocationBar
        cityLabel={cityLabel}
        onLocationClick={() => {
          fireCampaignEvent("delivery_location_change", cityId ?? undefined);
          openPicker();
        }}
      />

      {/* 6. Customer-benefit band */}
      <CampaignBenefitBand />

      {/* 7. Compact Trustpilot strip */}
      <CampaignTrustpilotStrip />

      {/* 8. Trust bar (availability / speed / currency) */}
      <CampaignTrustBar
        availabilityText={availabilityText}
        deliveryText={deliveryText}
        currencyText={currencyText}
      />

      {/* 9. Customer reviews — Trustpilot carousel, all markets */}
      <CampaignReviews onVisible={() => fireCampaignEvent("trustpilot_carousel_interaction")} />

      {/* 10. Luxury collection editorial banner */}
      <CampaignLuxuryBanner
        onCtaClick={() => fireCampaignEvent("luxury_collection_cta_click")}
      />

      {/* 11. Why-customers-choose section */}
      <CampaignWhyChoose />

      {/* 12. Full Trustpilot review carousel */}
      <section
        className="container mx-auto max-w-content px-page pt-10"
        aria-label={t("campaign.redesign.trustpilotCarousel.ariaLabel")}
      >
        <TrustpilotCarousel
          onVisible={() => fireCampaignEvent("trustpilot_carousel_interaction")}
        />
      </section>

      {/* 13. Luxury grid */}
      <CampaignGrid
        id="campaign-lux"
        section="luxury"
        title={t("campaign.redesign.luxury.title")}
        sub={t("campaign.redesign.luxury.subtitle")}
        viewAllLink="/category/lux-arrangements"
        viewAllText={t("campaign.redesign.viewAll")}
        products={catalog.luxury}
        isLoading={catalogLoading}
        availabilityState={availabilityState}
        currencyCodeOverride={campaignCurrencyCode}
      />

      {/* 14. "More flowers to love" rail */}
      <CampaignMoreFlowers
        products={catalog.flowers.slice(6)}
        isLoading={catalogLoading}
        currencyCodeOverride={campaignCurrencyCode}
        onViewAll={() => fireCampaignEvent("browse_all_flowers")}
      />

      {/* 15. FAQ accordion — copy is market-aware for Beirut and the UAE */}
      <CampaignFaq
        onExpand={(key) => fireCampaignEvent("faq_expand", key)}
      />

      {/* 16. SEO editorial copy section — copy is market-aware */}
      <CampaignSeoEditorial />

      {/* Mobile sticky CTA */}
      <CampaignStickyBar
        onCtaClick={() => {
          fireCampaignEvent("campaign_sticky_cta_click");
          scrollToProducts();
        }}
        heroRef={heroRef}
        countdownText={countdownText}
      />
    </div>
  );
}

export default function CampaignLanding() {
  const { cityId } = useLocationSelection();

  if (isTargetCampaignCity(cityId)) {
    return <CampaignLandingRedesign />;
  }
  return <CampaignLandingLegacy />;
}
