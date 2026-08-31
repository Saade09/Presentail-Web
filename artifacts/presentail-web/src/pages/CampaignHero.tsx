import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { CircleDollarSign, Clock3, ChevronDown, MapPin, Truck, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { injectTrustpilotScript } from "@/lib/trustpilot";

const HERO_IMAGE_768 = `${import.meta.env.BASE_URL}campaign/flower-hero-768.webp`;
const HERO_IMAGE_1440 = `${import.meta.env.BASE_URL}campaign/flower-hero-1440.webp`;
const HERO_IMAGE_SRCSET = `${HERO_IMAGE_768} 768w, ${HERO_IMAGE_1440} 1440w`;

export function CampaignHero({
  cityLabel,
  title,
  availabilityText,
  availabilityState,
  cutoffHour,
  supportUrl,
  promoEligible,
  couponCode,
  onPromoClick,
  onCtaClick,
  onSupportClick,
  sectionRef,
}: {
  cityLabel: string;
  title: string;
  availabilityText: string;
  availabilityState?: "same-day" | "next-available" | "unverified";
  cutoffHour?: number;
  supportUrl: string;
  promoEligible: boolean;
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
  const showPill = availabilityState === "same-day" && cutoffHour != null;

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
      <section className="relative isolate min-h-[430px] overflow-hidden rounded-[1.75rem] bg-[#003f46] md:h-[340px] md:min-h-0">
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
              {availabilityText}
            </p>
          )}
          <h1
            className="max-w-xl font-serif text-3xl leading-[1.05] tracking-tight sm:text-4xl md:text-5xl"
            data-testid="text-campaign-headline"
          >
            {title}
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/85 md:text-base">
            {t("campaign.redesign.hero.subtitle", { city: cityLabel })}
          </p>

          {promoEligible && (
            <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="banner-first-order-promo">
              <span className="text-xs font-semibold text-[#f4d9aa]">
                {t("campaign.hero.promoTitle")}
              </span>
              {couponCode && (
                <button
                  type="button"
                  onClick={handleCouponBadgeClick}
                  className="flex items-center gap-1.5 rounded-full border border-[#f4d9aa]/40 bg-[#f4d9aa]/10 px-2.5 py-0.5 text-xs font-mono font-semibold text-[#f4d9aa] hover:bg-[#f4d9aa]/20 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                  aria-label={copied ? t("campaign.hero.promoCopied") : `${t("campaign.hero.promoTitle")} — ${couponCode}`}
                >
                  {copied
                    ? <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
                    : <Copy className="h-3 w-3 shrink-0" aria-hidden="true" />
                  }
                  {copied ? t("campaign.hero.promoCopied") : couponCode /* i18n-ignore */}
                </button>
              )}
            </div>
          )}

          <div className="mt-5 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-5">
            <Button
              type="button"
              size="lg"
              className="h-12 w-full sm:w-auto bg-[#fff8e9] px-7 font-semibold text-[#003f46] hover:bg-white"
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
              className="text-sm font-medium text-white/70 underline decoration-white/40 underline-offset-4 hover:text-white hover:decoration-white/60 text-center sm:text-start focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              data-testid="link-campaign-support"
            >
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

// ─── CampaignTrustpilotStrip ──────────────────────────────────────────────────

declare global {
  interface Window {
    Trustpilot?: {
      loadFromElement: (element: Element, force?: boolean) => void;
    };
  }
}

const MAX_POLL_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 250;

export function CampaignTrustpilotStrip({
  onStripClick,
}: {
  onStripClick?: () => void;
}) {
  const { t } = useLocale();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let pollAttempts = 0;

    const tryLoad = () => {
      if (!window.Trustpilot) {
        if (pollAttempts < MAX_POLL_ATTEMPTS) {
          pollAttempts++;
          pollTimer = setTimeout(tryLoad, POLL_INTERVAL_MS);
        }
        return;
      }
      window.Trustpilot.loadFromElement(el, true);
    };

    injectTrustpilotScript(tryLoad);

    return () => {
      if (pollTimer !== null) clearTimeout(pollTimer);
    };
  }, []);

  return (
    <div className="container mx-auto max-w-content px-page pt-3">
      <a
        href="https://www.trustpilot.com/review/presentail.com"
        target="_blank"
        rel="noopener noreferrer"
        onClick={onStripClick}
        className="block rounded-2xl border border-[#d9dfd8] bg-white px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#003f46]"
        style={{ minHeight: "56px" }}
        data-testid="link-campaign-trustpilot-strip"
        aria-label={t("campaign.redesign.trustpilotStrip.ariaLabel")}
      >
        <div
          ref={ref}
          className="trustpilot-widget"
          data-locale="en-US"
          data-template-id="5419b637fa0340045cd0c936"
          data-businessunit-id="5d1782b3588afe00012431d9"
          data-style-height="24px"
          data-style-width="100%"
          data-theme="light"
        >
          <span className="text-sm text-neutral-500">{"Trustpilot" /* i18n-ignore */}</span>
        </div>
      </a>
    </div>
  );
}

export function CampaignStickyBar({
  onCtaClick,
  heroRef,
}: {
  onCtaClick: () => void;
  heroRef?: React.RefObject<HTMLElement | null>;
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
