import { useEffect, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { getGetHomepageCollectionBestSellersQueryOptions } from "@workspace/api-client-react";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useLocale } from "@/contexts/LocaleContext";
import { apiFetch } from "@/lib/api";
import { trackEvent, trackWebEvent } from "@/lib/analytics";
import { fireGtagEvent } from "@/lib/gtag";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import {
  CAMPAIGN_SECTION_KEY,
  hasOrderedLocally,
  markFirstOrderPromoShown,
} from "@/lib/campaign";
import {
  buildCampaignSupportUrl,
  CAMPAIGN_QUERY_CATEGORY_SLUGS,
  getCampaignMarket,
  isTargetCampaignCity,
  resolveCampaignAvailability,
  selectCampaignCatalogSections,
  type CampaignCatalogProduct,
} from "@/lib/campaignLanding";
import {
  CampaignHero,
  CampaignTrustBar,
  CampaignStickyBar,
} from "@/pages/CampaignHero";
import { CampaignGrid } from "@/pages/CampaignSections";
import { CampaignLandingLegacy } from "./CampaignLandingLegacy";

function fireCampaignEvent(
  name:
    | "campaign_page_view"
    | "campaign_hero_cta_click"
    | "campaign_promo_impression"
    | "campaign_promo_click"
    | "campaign_view_all_click"
    | "campaign_support_click"
    | "campaign_pill_click"
    | "campaign_sticky_cta_impression"
    | "campaign_sticky_cta_click",
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

function formatCutoff(hour: number, language: string): string {
  const locale = language === "ar" ? "ar-LB" : language === "fr" ? "fr-FR" : "en-US";
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: hour % 1 === 0 ? undefined : "2-digit",
  }).format(new Date(2020, 0, 1, hour, 0));
}

function CampaignLandingRedesign() {
  const { countryCode, cityId, city, deliveryDataStatus } = useLocationSelection();
  const { dir, cityName, language, t } = useLocale();
  const { currencyCode } = useDisplayCurrency();
  const [now, setNow] = useState(() => new Date());

  const cityLabel = city ? cityName(city.id, city.name) : "";
  const market = getCampaignMarket(cityId);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

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

  // Contract-backed, market-scoped collection queries. The server's OS store
  // cache has already applied country/city deliverability before ranking.
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
  const availabilityText =
    availabilityState === "same-day" && city?.sameDayCutoffHour != null
      ? t("campaign.redesign.status.sameDay", {
          cutoff: formatCutoff(city.sameDayCutoffHour, language),
        })
      : availabilityState === "next-available"
        ? t("campaign.redesign.status.nextAvailable")
        : t("campaign.redesign.status.neutral");
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
    currency: currencyCode,
  });
  const heroTitle =
    availabilityState === "same-day"
      ? t("campaign.redesign.hero.titleSameDay", { city: cityLabel })
      : t("campaign.redesign.hero.titleNeutral", { city: cityLabel });
  const supportUrl = buildCampaignSupportUrl(
    t("campaign.redesign.hero.supportPrefill", { city: cityLabel }),
  );

  return (
    <div dir={dir} className="min-h-screen bg-[#fffdf8] pb-28 md:pb-0">
      <CampaignHero
        cityLabel={cityLabel}
        title={heroTitle}
        availabilityText={availabilityText}
        supportUrl={supportUrl}
        promoEligible={promoEligible}
        onPromoClick={() => fireCampaignEvent("campaign_promo_click")}
        onCtaClick={() => {
          fireCampaignEvent("campaign_hero_cta_click", cityId ?? undefined);
          scrollToProducts();
        }}
        onSupportClick={() =>
          fireCampaignEvent("campaign_support_click", cityId ?? undefined)
        }
        sectionRef={heroRef}
      />

      <CampaignTrustBar
        availabilityText={availabilityText}
        deliveryText={deliveryText}
        currencyText={currencyText}
      />

      <div ref={firstGridRef}>
        <CampaignGrid
          id="campaign-flowers"
          section="flowers"
          title={t("campaign.redesign.flowers.title")}
          sub={t("campaign.redesign.flowers.subtitle")}
          viewAllLink="/category/flowers"
          viewAllText={t("campaign.redesign.viewAll")}
          products={catalog.flowers}
          isLoading={catalogLoading}
        />
      </div>

      <CampaignGrid
        id="campaign-lux"
        section="luxury"
        title={t("campaign.redesign.luxury.title")}
        sub={t("campaign.redesign.luxury.subtitle")}
        viewAllLink="/category/lux-arrangements"
        viewAllText={t("campaign.redesign.viewAll")}
        products={catalog.luxury}
        isLoading={catalogLoading}
      />

      <CampaignStickyBar
        onCtaClick={() => {
          fireCampaignEvent("campaign_sticky_cta_click");
          scrollToProducts();
        }}
        heroRef={heroRef}
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
