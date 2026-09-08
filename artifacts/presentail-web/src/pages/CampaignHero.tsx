import { useEffect, useRef, useState } from "react";
import { CircleDollarSign, Clock3, ChevronDown, MapPin, Truck, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { trackEvent } from "@/lib/analytics";
import { injectTrustpilotScript, pollAndLoadTrustpilotWidget } from "@/lib/trustpilot";

const HERO_IMAGE_768 = `${import.meta.env.BASE_URL}campaign/flower-hero-768.webp`;
const HERO_IMAGE_1440 = `${import.meta.env.BASE_URL}campaign/flower-hero-1440.webp`;
const HERO_IMAGE_SRCSET = `${HERO_IMAGE_768} 768w, ${HERO_IMAGE_1440} 1440w`;

export function CampaignHero({
  title,
  availabilityText,
  countdownText,
  subtitle,
  availabilityState,
  cutoffHour,
  supportUrl,
  isAbroad,
  couponCode,
  onPromoClick,
  onCtaClick,
  onSupportClick,
  sectionRef,
}: {
  title: string;
  availabilityText: string;
  countdownText?: string;
  subtitle: string;
  availabilityState?: "same-day" | "next-available" | "unverified";
  cutoffHour?: number;
  supportUrl: string;
  isAbroad?: boolean;
  /** Coupon code shown on the badge — copies to clipboard and auto-applies at checkout. */
  couponCode?: string;
  onPromoClick: () => void;
  onCtaClick: () => void;
  onSupportClick: () => void;
  sectionRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);

  const handleCouponBadgeClick = () => {
    if (couponCode) {
      navigator.clipboard.writeText(couponCode).catch(() => {/* best-effort */});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
    onPromoClick();
  };

  // Only show the availability pill when same-day is confirmed AND cutoff is known.
  const showPill =
    countdownText != null ||
    (availabilityState === "same-day" && cutoffHour != null);

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
    <div ref={sectionRef} className="container mx-auto max-w-content px-page pt-3 md:pt-4">
      <section
        className="relative isolate min-h-[260px] overflow-hidden rounded-[1.75rem] bg-[#003f46] md:h-[340px] md:min-h-0"
        data-abroad-hero={isAbroad ? "true" : undefined}
      >
        <img
          src={HERO_IMAGE_1440}
          srcSet={HERO_IMAGE_SRCSET}
          sizes="(max-width: 768px) 100vw, 1152px"
          alt={t("campaign.redesign.hero.imageAlt")}
          className="absolute inset-0 h-full w-full object-cover object-[62%_center] md:object-center"
          fetchPriority="high"
          decoding="async"
        />
        <div
          className="absolute inset-0 bg-gradient-to-r from-[#002f35]/95 via-[#003f46]/82 to-[#003f46]/15 md:via-[#003f46]/70"
          aria-hidden="true"
        />
        <div className="relative z-10 flex h-full max-w-2xl flex-col justify-center px-6 py-8 text-[#fffaf0] sm:px-8 md:px-12 md:py-7">
          {showPill && (
            <p
              className="mb-3 w-fit rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide backdrop-blur-sm"
              data-testid="text-campaign-availability"
            >
              {countdownText ?? availabilityText}
            </p>
          )}
          <h1
            className="max-w-xl font-serif text-3xl leading-[1.05] tracking-tight sm:text-4xl md:text-5xl"
            data-testid="text-campaign-headline"
          >
            {title}
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/85 md:text-base">
            {subtitle}
          </p>

          {couponCode && (
            /* Always visible — not gated on promoEligible so returning visitors see it too */
            <div className="mt-4 flex flex-col gap-1" data-testid="banner-first-order-promo">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-[#f4d9aa]">
                  {t("campaign.hero.promoTitle")}
                </span>
                <button
                  type="button"
                  onClick={handleCouponBadgeClick}
                  className="flex items-center gap-1.5 rounded-full border border-[#f4d9aa]/60 bg-[#f4d9aa]/15 px-2.5 py-0.5 font-mono text-xs font-bold text-[#f4d9aa] transition-colors hover:bg-[#f4d9aa]/25 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                  aria-label={copied ? t("campaign.hero.promoCopied") : `${t("campaign.hero.promoTitle")} — ${couponCode} — ${t("campaign.hero.promoCouponApply")}`}
                >
                  {copied
                    ? <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
                    : <Copy className="h-3 w-3 shrink-0" aria-hidden="true" />
                  }
                  {copied ? t("campaign.hero.promoCopied") : couponCode /* i18n-ignore */}
                </button>
              </div>
              {!copied && (
                <p className="text-[11px] text-[#f4d9aa]/80">
                  {t("campaign.hero.promoSubtitle")}
                </p>
              )}
            </div>
          )}

          <div className="mt-5 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-5">
            <Button
              type="button"
              size="lg"
              className="h-10 w-full border border-white/45 bg-white/10 px-7 font-semibold text-white hover:bg-white/20 sm:w-auto"
              onClick={onCtaClick}
              data-testid="button-campaign-hero-cta"
            >
              {t("campaign.redesign.hero.cta")}
            </Button>
            <a
              href={supportUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onSupportClick}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[#25D366] px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#20bd5a] sm:w-auto focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              data-testid="link-campaign-support"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden="true">
                <path d="M20.5 3.5A11.85 11.85 0 0 0 12.07 0C5.52 0 .19 5.33.19 11.88c0 2.1.55 4.15 1.6 5.96L.09 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.88-5.33 11.88-11.88 0-3.18-1.24-6.17-3.46-8.42ZM12.08 21.8h-.01a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-3.74.98 1-3.65-.23-.37a9.86 9.86 0 0 1-1.51-5.29C2.19 6.43 6.62 2 12.08 2a9.85 9.85 0 0 1 7 2.9 9.88 9.88 0 0 1 2.9 7c0 5.46-4.44 9.9-9.9 9.9Zm5.43-7.42c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.47-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35Z" />
              </svg>
              {t("campaign.redesign.hero.support")}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

export function CampaignTrustBar({
  availabilityText,
  deliveryText,
  currencyText,
}: {
  availabilityText: string;
  deliveryText: string;
  currencyText: string;
}) {
  const cells = [
    { key: "availability", Icon: Clock3, text: availabilityText },
    { key: "delivery", Icon: Truck, text: deliveryText },
    { key: "currency", Icon: CircleDollarSign, text: currencyText },
  ];

  return (
    <div className="container mx-auto max-w-content px-page pt-3">
      <div className="rounded-2xl border border-[#d9dfd8] bg-white">
        <div className="grid md:grid-cols-3 md:divide-x md:divide-[#d9dfd8]">
          {cells.map((c) => (
            <div
              key={c.key}
              className="flex min-h-14 items-center gap-3 border-b border-[#d9dfd8] px-4 py-3 last:border-b-0 md:border-b-0 md:px-5"
              data-testid={`trust-cell-${c.key}`}
            >
              <c.Icon className="h-5 w-5 shrink-0 text-[#00515a]" aria-hidden="true" />
              <span className="text-sm font-medium leading-snug text-[#25373a]">{c.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── CampaignLocationBar ──────────────────────────────────────────────────────

export function CampaignLocationBar({
  cityLabel,
  onLocationClick,
}: {
  cityLabel: string;
  onLocationClick: () => void;
}) {
  const { t } = useLocale();

  return (
    <div className="container mx-auto max-w-content px-page pt-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 rounded-2xl border border-[#d9dfd8] bg-white px-4 py-3">
        <button
          type="button"
          onClick={onLocationClick}
          className="flex items-center gap-2 text-sm font-medium text-[#25373a] hover:text-[#003f46] transition-colors group focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#003f46] rounded"
          data-testid="button-campaign-location"
          aria-label={`${t("campaign.redesign.location.delivering")} ${cityLabel}. ${t("campaign.redesign.location.change")}`}
        >
          <MapPin className="h-4 w-4 shrink-0 text-[#00515a]" aria-hidden="true" />
          <span>
            <span className="text-neutral-500">{t("campaign.redesign.location.delivering")}</span>
            {" "}
            <span className="font-semibold">{cityLabel || "—"}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-neutral-400 group-hover:text-[#003f46] transition-colors" aria-hidden="true" />
        </button>
        <span className="text-xs text-neutral-400 sm:text-right">
          {t("campaign.redesign.location.checkoutHint")}
        </span>
      </div>
    </div>
  );
}

// ─── CampaignTrustpilotCard ───────────────────────────────────────────────────

declare global {
  interface Window {
    Trustpilot?: {
      loadFromElement: (element: Element, force?: boolean) => void;
    };
  }
}

const TRUSTPILOT_PROFILE_URL = "https://www.trustpilot.com/review/presentail.com";
const TRUSTPILOT_TEMPLATE_ID = "53aa8807dec7e10d38f59f32";
const TRUSTPILOT_BUSINESS_UNIT_ID = "5d1782b3588afe00012431d9";
const TRUSTPILOT_TOKEN = "67c8c2d2-17c0-4add-bcda-ed2e5ce5eb5e";

export function getCampaignTrustpilotLocale(
  language: string,
  countryCode?: string | null,
): string {
  if (language === "ar") return countryCode === "AE" ? "ar-AE" : "ar-LB";
  if (language === "fr") return "fr-FR";
  return "en-US";
}

export function CampaignTrustpilotStrip() {
  const { language, dir, t } = useLocale();
  const { countryCode, cityId } = useLocationSelection();
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const locale = getCampaignTrustpilotLocale(language, countryCode);

  const trackReviewClick = (linkType: "widget" | "external_link" | "fallback") => {
    trackEvent({
      name: "trustpilot_reviews_click",
      page_path: typeof window === "undefined" ? "" : window.location.pathname,
      selected_country: countryCode ?? "",
      selected_city: cityId ?? "",
      active_language: language,
      link_type: linkType,
    });
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let active = true;
    setFailed(false);

    const { onScriptLoad, cleanup } = pollAndLoadTrustpilotWidget(el, () => {
      if (!active) return;
      console.warn("[Trustpilot] Campaign widget failed to load; showing fallback.");
      setFailed(true);
    });
    injectTrustpilotScript(
      onScriptLoad,
      () => {
        if (!active) return;
        console.warn("[Trustpilot] Campaign bootstrap failed; showing fallback.");
        setFailed(true);
      },
    );

    return () => {
      active = false;
      cleanup();
    };
  }, [locale]);

  return (
    <div className="container mx-auto max-w-content overflow-hidden px-page pt-3">
      <div
        className="mx-auto min-h-[150px] w-full max-w-2xl overflow-hidden rounded-2xl border border-[#d9dfd8] bg-[#fffdf8] p-0.5 shadow-sm"
        dir={dir}
        data-testid="campaign-trustpilot-card"
      >
        {failed ? (
          <a
            href={TRUSTPILOT_PROFILE_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackReviewClick("fallback")}
            className="flex min-h-[150px] items-center justify-center px-5 text-center text-sm font-medium text-[#00515a] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#003f46]"
            data-testid="link-campaign-trustpilot-fallback"
          >
            {t("campaign.redesign.trustpilot.fallback")}
          </a>
        ) : (
          <div
            ref={ref}
            className="trustpilot-widget h-[150px] w-full max-w-full overflow-hidden"
            data-locale={locale}
            data-template-id={TRUSTPILOT_TEMPLATE_ID}
            data-businessunit-id={TRUSTPILOT_BUSINESS_UNIT_ID}
            data-style-height="150px"
            data-style-width="100%"
            data-token={TRUSTPILOT_TOKEN}
            data-testid="campaign-trustpilot-widget"
            onClick={() => trackReviewClick("widget")}
          >
            <a
              href={TRUSTPILOT_PROFILE_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => {
                event.stopPropagation();
                trackReviewClick("external_link");
              }}
              className="sr-only"
            >
              Trustpilot
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export function CampaignStickyBar({
  onCtaClick,
  heroRef,
  countdownText,
}: {
  onCtaClick: () => void;
  heroRef?: React.RefObject<HTMLElement | null>;
  countdownText?: string;
}) {
  const { t } = useLocale();

  const [heroVisible, setHeroVisible] = useState(true);
  useEffect(() => {
    const el = heroRef?.current;
    if (!el) return;
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
      data-testid="bar-campaign-sticky"
      aria-hidden={!shown}
    >
      {countdownText && (
        <p className="mb-2 text-xs text-neutral-500">{countdownText}</p>
      )}
      <Button
        className="w-full h-12 text-sm font-semibold"
        onClick={onCtaClick}
        data-testid="button-campaign-sticky-cta"
      >
        {t("campaign.stickyCta")}
      </Button>
    </div>
  );
}
