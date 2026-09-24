import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Star, ShieldCheck, BellRing } from "lucide-react";
import { useGetHomepageBestSellers } from "@workspace/api-client-react";
import { ProductCard } from "@/components/ProductCard";
import { PageBreadcrumb, type Crumb } from "@/components/PageBreadcrumb";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useLocale } from "@/contexts/LocaleContext";
import { useAuth } from "@/contexts/AuthContext";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import { useLcpImagePreload } from "@/hooks/useLcpImagePreload";
import { buildUnsplashSrcset } from "@/lib/imageUtils";
import { apiFetch } from "@/lib/api";
import { trackEvent, trackWebEvent } from "@/lib/analytics";
import { fireGtagEvent } from "@/lib/gtag";
import {
  CAMPAIGN_SECTION_KEY,
  getCampaignThresholdUsd,
  hasOrderedLocally,
  markFirstOrderPromoShown,
} from "@/lib/campaign";
import { type Product } from "@/lib/queries";
import {
  CampaignHeroBeirut,
  CampaignTrustBarBeirut,
  CampaignStickyBarBeirut,
} from "@/pages/CampaignHeroBeirut";
import {
  CampaignGridBeirut,
  CampaignOccasionsBeirut,
  CampaignAddressExplainerBeirut,
} from "@/pages/CampaignSectionsBeirut";
import { CampaignReviews } from "@/pages/CampaignSections";

const HERO_IMAGE_URL =
  "https://images.unsplash.com/photo-1561181286-d3fee7d55364?w=1200&q=80&auto=format&fit=crop";

const GRID_SIZE = 8;

/** Fire an internal analytics event and its GA4/Ads mirror in one call. */
function fireCampaignEvent(
  name:
    | "campaign_page_view"
    | "campaign_hero_cta_click"
    | "campaign_promo_impression"
    | "campaign_promo_click"
    | "campaign_view_all_click"
    | "campaign_pill_click"
    | "campaign_sticky_cta_impression"
    | "campaign_sticky_cta_click",
  detail?: string,
): void {
  trackEvent({ name, ...(detail ? { linkSlug: detail } : {}), sectionKey: CAMPAIGN_SECTION_KEY });
  fireGtagEvent(name, { section: CAMPAIGN_SECTION_KEY, ...(detail ? { detail } : {}) });
}

export function CampaignLandingLegacy() {
  const { countryCode, cityId, city } = useLocationSelection();
  const { t, dir, cityName, language } = useLocale();
  const { formatPrice } = useDisplayCurrency();
  const { user } = useAuth();

  const cityLabel = city ? cityName(city.id, city.name) : "";

  // Paid-search hero variant — gated to the English Beirut campaign page ONLY
  // (https://presentail.com/en-lb/beirut/flower-delivery). Every other
  // locale/city/campaign keeps the original layout below, so no other page
  // changes appearance; flipping this flag off restores the old hero.
  const isBeirutPaidVariant =
    language === "en" && countryCode === "LB" && cityId === "lb-beirut";
  const thresholdUsd = getCampaignThresholdUsd(countryCode);
  const underAmount = formatPrice(thresholdUsd);

  // ── First-order promo eligibility ─────────────────────────────────────────
  // Product decision: ad-campaign visitors are overwhelmingly new customers,
  // so the promo shows unless we positively know the visitor has ordered —
  // via the local has-ordered marker (any past order on this browser) or the
  // authenticated self-check endpoint (signed-in shoppers with prior orders).
  // The endpoint accepts no email parameter (no order-history probing); the
  // server re-validates eligibility at coupon application and at order
  // creation, which are the enforcement points.
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
        // Endpoint unavailable — advisory only, default to showing the promo.
        if (!cancelled) setPromoEligible(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.email]);

  // Promo shown → persist flag for checkout auto-apply + fire impression once.
  const promoImpressionFired = useRef(false);
  useEffect(() => {
    if (!promoEligible || promoImpressionFired.current) return;
    promoImpressionFired.current = true;
    markFirstOrderPromoShown();
    fireCampaignEvent("campaign_promo_impression");
  }, [promoEligible]);

  // ── Page view ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fireCampaignEvent("campaign_page_view");
    trackWebEvent({ type: "page_view", properties: { section: CAMPAIGN_SECTION_KEY } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Best sellers ───────────────────────────────────────────────────────────
  const { data, isLoading } = useGetHomepageBestSellers({
    ...(countryCode ? { countryCode } : {}),
    ...(cityId ? { cityId } : {}),
    lang: language,
  });

  const products: Product[] = useMemo(
    () =>
      (data?.products ?? [])
        .filter((p) => p.inStock !== false)
        .slice(0, GRID_SIZE)
        .map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          priceValue: p.priceValue,
          image: p.image ? { uri: p.image.uri } : null,
          images: p.images?.map((img) => ({ uri: img.uri })) ?? [],
          inStock: p.inStock,
          popularity: p.popularity,
          isBestSeller: true,
          wcId: 0,
          category: "",
          categories: [],
          occasions: [],
        })),
    [data],
  );

  // Product impressions — once per page load, after products resolve.
  const impressionsFired = useRef(false);
  useEffect(() => {
    if (impressionsFired.current || products.length === 0) return;
    impressionsFired.current = true;
    products.forEach((p, i) => {
      trackEvent({
        name: "product_impression",
        productId: p.id,
        sectionKey: CAMPAIGN_SECTION_KEY,
        displayedPosition: i + 1,
      });
    });
  }, [products]);

  // ── Sticky CTA (mobile) ────────────────────────────────────────────────────
  const stickyImpressionFired = useRef(false);
  useEffect(() => {
    if (stickyImpressionFired.current) return;
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      stickyImpressionFired.current = true;
      fireCampaignEvent("campaign_sticky_cta_impression");
    }
  }, []);

  const bestSellersRef = useRef<HTMLDivElement>(null);
  // Observed by CampaignStickyBarBeirut: bar slides in once the hero leaves view.
  const beirutHeroRef = useRef<HTMLElement>(null);
  const scrollToBestSellers = () => {
    bestSellersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useLcpImagePreload(HERO_IMAGE_URL);
  const heroSrcset = buildUnsplashSrcset(HERO_IMAGE_URL);

  const crumbs: Crumb[] = [
    { label: t("nav.home"), href: "/" },
    { label: t("campaign.breadcrumb") },
  ];

  const pills: { key: string; label: string; href: string }[] = [
    { key: "birthday", label: t("shop.occ.birthday"), href: "/occasion/birthday" },
    { key: "anniversary", label: t("shop.occ.anniversary"), href: "/occasion/anniversary" },
    { key: "romantic", label: t("campaign.pill.romantic"), href: "/occasion/love-romance" },
    {
      key: "under-amount",
      label: t("campaign.pill.under", { amount: underAmount }),
      href: `/shop?maxUsd=${thresholdUsd}`,
    },
  ];

  return (
    <div dir={dir} className="min-h-screen bg-white pb-28 md:pb-0">
      {/* Breadcrumb removed on the Beirut paid variant only — it wastes the
          most valuable above-the-fold space on mobile for paid traffic. */}
      {!isBeirutPaidVariant && (
        <div className="container mx-auto max-w-content px-page pt-2 md:pt-4">
          <PageBreadcrumb crumbs={crumbs} />
        </div>
      )}

      {/* ── Hero (Beirut paid-search variant) ── */}
      {isBeirutPaidVariant && (
        <>
          <CampaignHeroBeirut
            cityLabel={cityLabel}
            onCtaClick={() => fireCampaignEvent("campaign_hero_cta_click", "shop-best-sellers")}
            onWhatsAppClick={() => fireCampaignEvent("campaign_hero_cta_click", "whatsapp")}
            sectionRef={beirutHeroRef}
          />
          <CampaignTrustBarBeirut />
        </>
      )}

      {/* ── Hero (original — all other locales/cities) ── */}
      {!isBeirutPaidVariant && (
      <div className="container mx-auto max-w-content px-page pt-2">
        <section className="rounded-3xl bg-[#FAF6EF] overflow-hidden md:grid md:grid-cols-2 md:items-stretch">
          <div className="p-6 md:p-10 flex flex-col justify-center gap-4">
            <h1 className="font-serif text-3xl md:text-5xl leading-tight text-primary" data-testid="text-campaign-headline">
              {t("campaign.hero.title", { city: cityLabel })}
            </h1>
            <p className="text-sm md:text-base text-neutral-600 max-w-md">
              {t("campaign.hero.subtitle")}
            </p>

            {promoEligible && (
              <Link
                href="/shop"
                onClick={() => fireCampaignEvent("campaign_promo_click")}
                className="inline-flex flex-col items-start gap-0.5 rounded-xl border border-primary/40 bg-white/70 px-4 py-3 w-fit focus-visible:outline-2 focus-visible:outline-primary"
                data-testid="banner-first-order-promo"
              >
                <span className="text-sm font-semibold text-primary tracking-wide">
                  {t("campaign.hero.promoTitle")}
                </span>
                <span className="text-xs text-neutral-600">{t("campaign.hero.promoSubtitle")}</span>
              </Link>
            )}

            <div className="flex flex-wrap items-center gap-4 pt-1">
              <Button
                asChild
                size="lg"
                className="h-12 px-7"
                data-testid="button-campaign-hero-cta"
              >
                <Link
                  href="/shop"
                  onClick={() => fireCampaignEvent("campaign_hero_cta_click", "shop-best-sellers")}
                >
                  {t("campaign.hero.cta")}
                </Link>
              </Button>
              <Link
                href={`/shop?maxUsd=${thresholdUsd}`}
                onClick={() => fireCampaignEvent("campaign_hero_cta_click", "shop-under-amount")}
                className="text-sm font-medium text-primary underline underline-offset-4 hover:opacity-80 py-3"
                data-testid="link-campaign-shop-under"
              >
                {t("campaign.hero.ctaUnder", { amount: underAmount })}
              </Link>
            </div>
          </div>

          <div className="relative aspect-[4/3] md:aspect-auto md:min-h-[380px]">
            <img
              src={HERO_IMAGE_URL}
              {...(heroSrcset ? { srcSet: heroSrcset.srcset, sizes: "(max-width: 768px) 100vw, 50vw" } : {})}
              alt={t("campaign.hero.imageAlt")}
              className="absolute inset-0 h-full w-full object-cover"
              fetchPriority="high"
              decoding="async"
            />
          </div>
        </section>
      </div>
      )}

      {/* ── Trust row (original — hidden on the Beirut paid variant, which has
             its own 4-cell trust bar under the hero) ── */}
      {!isBeirutPaidVariant && (
      <div className="container mx-auto max-w-content px-page">
        <div className="flex items-center justify-center gap-6 md:gap-12 py-5 md:py-7 text-sm text-neutral-700">
          <span className="inline-flex items-center gap-2" data-testid="text-trust-rating">
            <Star className="w-4 h-4 fill-amber-400 text-amber-400" aria-hidden="true" />
            {t("campaign.trust.rating")}
          </span>
          <span className="inline-flex items-center gap-2" data-testid="text-trust-secure">
            <ShieldCheck className="w-4 h-4 text-primary" aria-hidden="true" />
            {t("campaign.trust.securePayment")}
          </span>
          <span className="inline-flex items-center gap-2" data-testid="text-trust-updates">
            <BellRing className="w-4 h-4 text-primary" aria-hidden="true" />
            {t("campaign.trust.deliveryUpdates")}
          </span>
        </div>
      </div>
      )}

      {/* ── Beirut variant: Pass 2A product grid ─────────────────────────────
           Single consolidated grid with "Ready to deliver today" heading,
           wrapping occasion pills, 2/3/4-col layout, per-card descriptors,
           and a warm neutral fallback tile on every card (no blank boxes).
           Data source: useGetHomepageBestSellers (already fetched above). */}
      {isBeirutPaidVariant && (
        <CampaignGridBeirut products={products} isLoading={isLoading} />
      )}

      {/* ── Beirut variant: Pass 2B "Shop by Occasion" ───────────────────────
           Circular-image carousel, same visual treatment as the Beirut city
           home.  Six occasions in brief-approved order; Funeral and Wedding
           deliberately excluded.  Pill chips that were inside CampaignGridBeirut
           are removed — this section is the single occasion nav on the page. */}
      {isBeirutPaidVariant && <CampaignOccasionsBeirut />}

      {/* ── Beirut variant: Pass 2A address explainer ────────────────────────
           New section on contrasting warm-cream background. Addresses the
           #1 blocker for gift senders: "I don't have their address." */}
      {isBeirutPaidVariant && <CampaignAddressExplainerBeirut />}

      {/* ── Original variant: Best sellers (primary position, unchanged) ── */}
      {!isBeirutPaidVariant && (
        <div ref={bestSellersRef} id="campaign-best-sellers" className="container mx-auto max-w-content px-page pt-2 scroll-mt-24">
          <div className="flex items-end justify-between mb-4">
            <h2 className="font-serif text-2xl md:text-3xl">{t("campaign.bestSellers.title")}</h2>
            <Link
              href="/shop"
              onClick={() => fireCampaignEvent("campaign_view_all_click")}
              className="text-sm text-primary hover:underline whitespace-nowrap py-2"
              data-testid="link-campaign-view-all"
            >
              {t("campaign.bestSellers.viewAll")}
            </Link>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              {Array.from({ length: GRID_SIZE }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="aspect-square w-full rounded-xl" />
                  <Skeleton className="h-4 w-3/4 rounded" />
                  <Skeleton className="h-4 w-1/3 rounded" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              {products.map((product, i) => (
                <div
                  key={product.id}
                  onClickCapture={() =>
                    trackEvent({
                      name: "product_card_click",
                      productId: product.id,
                      sectionKey: CAMPAIGN_SECTION_KEY,
                      displayedPosition: i + 1,
                    })
                  }
                >
                  <ProductCard product={product} index={i} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Shortcut pills (original variant only) ── */}
      {!isBeirutPaidVariant && (
        <div className="container mx-auto max-w-content px-page pt-8">
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {pills.map((pill) => (
              <Link
                key={pill.key}
                href={pill.href}
                onClick={() => fireCampaignEvent("campaign_pill_click", pill.key)}
                className="shrink-0 rounded-full border border-neutral-300 px-5 py-2.5 text-sm text-neutral-700 hover:border-primary hover:text-primary transition-colors focus-visible:outline-2 focus-visible:outline-primary"
                data-testid={`pill-campaign-${pill.key}`}
              >
                {pill.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Reviews — official Trustpilot carousel for all variants ── */}
      <CampaignReviews />

      {/* ── Mobile sticky CTA ── */}
      {isBeirutPaidVariant ? (
        <CampaignStickyBarBeirut
          onCtaClick={() => fireCampaignEvent("campaign_sticky_cta_click")}
          onWhatsAppClick={() => fireCampaignEvent("campaign_sticky_cta_click", "whatsapp")}
          heroRef={beirutHeroRef}
        />
      ) : (
      <div
        className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-white/95 backdrop-blur border-t border-neutral-200 px-4 pt-3"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <Button
          className="w-full h-12"
          onClick={() => {
            fireCampaignEvent("campaign_sticky_cta_click");
            scrollToBestSellers();
          }}
          data-testid="button-campaign-sticky-cta"
        >
          {t("campaign.stickyCta")}
        </Button>
      </div>
      )}
    </div>
  );
}
