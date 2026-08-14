import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { MapPin, Send, Truck, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/contexts/LocaleContext";
import { buildUnsplashSrcset } from "@/lib/imageUtils";

/**
 * CampaignHeroBeirut — paid-search hero variant for the Beirut flower-delivery
 * campaign landing page (en-lb/beirut only; gated in CampaignLanding.tsx).
 *
 * Everything here is scoped to this component tree: no shared components,
 * global styles, or other routes are touched. The previous hero remains in
 * CampaignLanding.tsx and renders for every other locale/city, so rolling
 * back is a one-line gate change (or a checkpoint restore).
 */

// ─────────────────────────────────────────────────────────────────────────────
// TODO(UNVERIFIED) — placeholder facts that MUST be verified before launch.
// Search for "TODO(UNVERIFIED)" to find every claim in one pass.
// ─────────────────────────────────────────────────────────────────────────────
// TODO(UNVERIFIED): daily same-day cutoff hour (currently 10 PM Beirut) and
// branch reopen hour (9 AM). Confirm with operations.
const CUTOFF_HOUR_BEIRUT = 22;
const REOPEN_HOUR_BEIRUT = 9;
// TODO(UNVERIFIED): WhatsApp number — copied from the Contact page
// (wa.me/9613136532). Confirm this line is monitored for order intake.
const WHATSAPP_PHONE = "9613136532";

/** Prefilled WhatsApp order link; message text is localized via t(). */
function buildWhatsAppOrderUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;
}
// TODO(UNVERIFIED): the 4.8 rating and 1,240 review count (trust bar strings
// campaign.v2.trust.rating.*) and the $90 free-delivery threshold + "all
// Lebanon" scope (campaign.v2.trust.delivery.*) live in
// src/locales/campaign.ts and need real data before launch.

const HERO_IMAGE_URL =
  "https://images.unsplash.com/photo-1561181286-d3fee7d55364?w=1200&q=80&auto=format&fit=crop";

// ── Beirut-clock countdown ───────────────────────────────────────────────────
// All times are computed from Asia/Beirut wall-clock time via Intl, never the
// visitor's local clock — a shopper in London or Dubai must see Beirut status.

const beirutClockFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Beirut",
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function getBeirutSecondsOfDay(): number {
  const parts = beirutClockFormatter.formatToParts(new Date());
  let h = 0,
    m = 0,
    s = 0;
  for (const p of parts) {
    if (p.type === "hour") h = Number(p.value) % 24; // "24" can appear at midnight
    else if (p.type === "minute") m = Number(p.value);
    else if (p.type === "second") s = Number(p.value);
  }
  return h * 3600 + m * 60 + s;
}

type BeirutStatus = {
  /** Seconds until today's cutoff; 0 when past cutoff. */
  secondsToCutoff: number;
  /** Branches open right now (between reopen and cutoff, Beirut time). */
  branchesOpen: boolean;
};

function computeBeirutStatus(): BeirutStatus {
  const sod = getBeirutSecondsOfDay();
  const cutoff = CUTOFF_HOUR_BEIRUT * 3600;
  const reopen = REOPEN_HOUR_BEIRUT * 3600;
  return {
    secondsToCutoff: Math.max(0, cutoff - sod),
    branchesOpen: sod >= reopen && sod < cutoff,
  };
}

function formatCountdown(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}h ${m}m ${String(s).padStart(2, "0")}s`;
}

/**
 * Live Beirut cutoff status, updating every second. The initial value is
 * computed synchronously in the state initializer so the countdown renders
 * its real value on first paint — no placeholder flash above the fold.
 */
export function useBeirutCutoff(): BeirutStatus {
  const [status, setStatus] = useState<BeirutStatus>(() => computeBeirutStatus());
  useEffect(() => {
    const id = setInterval(() => setStatus(computeBeirutStatus()), 1000);
    return () => clearInterval(id);
  }, []);
  return status;
}

// ── WhatsApp glyph (inline SVG — lucide has no brand glyphs) ─────────────────
function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.371-.025-.52-.074-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────
export function CampaignHeroBeirut({
  cityLabel,
  onCtaClick,
  onWhatsAppClick,
}: {
  cityLabel: string;
  onCtaClick: () => void;
  onWhatsAppClick: () => void;
}) {
  const { t } = useLocale();
  const { secondsToCutoff, branchesOpen } = useBeirutCutoff();
  const cutoffPassed = secondsToCutoff === 0;
  const whatsAppUrl = buildWhatsAppOrderUrl(t("campaign.v2.whatsappPrefill"));

  const heroSrcset = buildUnsplashSrcset(HERO_IMAGE_URL);

  // Preload the LCP hero image. useLcpImagePreload is a no-op for non-OS
  // URLs, so inject the <link rel="preload"> for this Unsplash photo directly,
  // mirroring the responsive candidates the <img> below renders.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.setAttribute("fetchpriority", "high");
    if (heroSrcset) {
      link.setAttribute("imagesrcset", heroSrcset.srcset);
      link.setAttribute("imagesizes", "100vw");
    }
    link.href = HERO_IMAGE_URL;
    document.head.appendChild(link);
    return () => link.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="relative min-h-[430px] md:min-h-[600px] flex items-end md:items-center overflow-hidden">
      {/* Hero photograph — the LCP element: preloaded (effect above), eager,
          high fetch priority, responsive srcset, explicit dimensions. */}
      <img
        src={HERO_IMAGE_URL}
        {...(heroSrcset
          ? { srcSet: heroSrcset.srcset, sizes: "100vw" }
          : {})}
        alt={t("campaign.v2.hero.imageAlt")}
        width={1200}
        height={900}
        className="absolute inset-0 h-full w-full object-cover"
        fetchPriority="high"
        loading="eager"
        decoding="async"
      />
      {/* Gradient: mobile — vertical, dark from ~1/3 down to the bottom;
          desktop — horizontal, dark on the copy side, clear on the photo side.
          Both keep white text ≥ 4.5:1 (black/80 terminal stop under the copy). */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 via-40% to-transparent to-70% md:bg-gradient-to-r md:from-black/85 md:via-black/60 md:via-45% md:to-transparent md:to-75%"
      />

      <div className="relative w-full container mx-auto max-w-content px-page pb-8 pt-40 md:py-16">
        <div className="max-w-[560px] flex flex-col items-start gap-4 text-white">
          {/* 1 — status badge */}
          <span
            className="inline-flex items-center gap-2 rounded-full bg-black/45 backdrop-blur-sm border border-white/25 px-3.5 py-1.5 text-xs font-medium"
            data-testid="badge-campaign-branch-status"
          >
            {branchesOpen ? (
              <>
                <span className="relative flex h-2 w-2" aria-hidden="true">
                  {/* Pulse disabled under prefers-reduced-motion */}
                  <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
                </span>
                {t("campaign.v2.badge.open")}
              </>
            ) : (
              <>
                <span className="inline-flex h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
                {t("campaign.v2.badge.closed")}
              </>
            )}
          </span>

          {/* 2 — headline */}
          <h1
            className="font-serif text-[2.6rem] leading-[1.05] md:text-6xl md:leading-[1.04] tracking-tight"
            data-testid="text-campaign-headline"
          >
            {t("campaign.v2.hero.title", { city: cityLabel })}
          </h1>

          {/* 3 — subheading with the key phrase bolded */}
          <p className="text-sm md:text-base text-white/90 max-w-md">
            {t("campaign.v2.hero.sub1")}
            <strong className="font-bold text-white">{t("campaign.v2.hero.subQ")}</strong>
            {t("campaign.v2.hero.sub2")}
          </p>

          {/* 4 — countdown on its OWN row (never inline with the CTAs) */}
          <div
            className="w-full sm:w-auto flex items-center justify-between sm:justify-start gap-6 rounded-xl bg-[#8C1D2F] px-4 py-3"
            data-testid="block-campaign-countdown"
            role="timer"
            aria-live="off"
          >
            <div className="text-xs leading-snug text-white/90">
              {cutoffPassed ? (
                <>
                  <div>{t("campaign.v2.countdown.closedLine1")}</div>
                  <div>{t("campaign.v2.countdown.closedLine2")}</div>
                </>
              ) : (
                <>
                  <div>{t("campaign.v2.countdown.line1")}</div>
                  <div>
                    {t("campaign.v2.countdown.line2Prefix")}
                    <strong className="font-bold text-white">
                      {t("campaign.v2.countdown.line2Bold")}
                    </strong>
                  </div>
                </>
              )}
            </div>
            <div
              className="text-xl md:text-2xl font-semibold tabular-nums whitespace-nowrap"
              data-testid="text-campaign-countdown-value"
            >
              {cutoffPassed
                ? t("campaign.v2.countdown.closedValue")
                : formatCountdown(secondsToCutoff)}
            </div>
          </div>

          {/* 5 — primary CTA */}
          <Button
            asChild
            size="lg"
            className="w-full sm:w-auto h-12 px-8 bg-white text-neutral-900 hover:bg-white/90 focus-visible:ring-white"
            data-testid="button-campaign-hero-cta"
          >
            <Link href="/best-sellers" onClick={onCtaClick}>
              {t("campaign.v2.cta.shop")}
            </Link>
          </Button>

          {/* 6 — secondary CTA (outlined ghost button, not a text link) */}
          <div className="w-full sm:w-auto flex flex-col items-start gap-1.5">
            <a
              href={whatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onWhatsAppClick}
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 h-12 px-8 rounded-md border border-white/60 text-white text-sm font-medium hover:bg-white/10 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              data-testid="button-campaign-whatsapp"
            >
              <WhatsAppGlyph className="h-4.5 w-4.5 h-[18px] w-[18px]" />
              {t("campaign.v2.cta.whatsapp")}
            </a>
            <span className="text-xs text-white/75">{t("campaign.v2.cta.hint")}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Trust bar ────────────────────────────────────────────────────────────────
// Order is deliberate: the no-address point leads (differentiator that
// unblocks an abandoning buyer), then tracking, delivery pricing, rating.
export function CampaignTrustBarBeirut() {
  const { t } = useLocale();
  const cells: { icon: ReactNode; title: string; sub: string; key: string }[] = [
    {
      key: "address",
      icon: <MapPin className="h-5 w-5 text-primary" aria-hidden="true" />,
      title: t("campaign.v2.trust.address.title"),
      sub: t("campaign.v2.trust.address.sub"),
    },
    {
      key: "tracking",
      icon: <Send className="h-5 w-5 text-primary" aria-hidden="true" />,
      title: t("campaign.v2.trust.tracking.title"),
      sub: t("campaign.v2.trust.tracking.sub"),
    },
    {
      key: "delivery",
      // TODO(UNVERIFIED): $90 threshold + all-Lebanon scope (strings in campaign.ts)
      icon: <Truck className="h-5 w-5 text-primary" aria-hidden="true" />,
      title: t("campaign.v2.trust.delivery.title"),
      sub: t("campaign.v2.trust.delivery.sub"),
    },
    {
      key: "rating",
      // TODO(UNVERIFIED): 4.8 rating / 1,240 review count (strings in campaign.ts)
      icon: <Star className="h-5 w-5 fill-amber-400 text-amber-400" aria-hidden="true" />,
      title: t("campaign.v2.trust.rating.title"),
      sub: t("campaign.v2.trust.rating.sub"),
    },
  ];
  return (
    <div className="bg-white border-b border-neutral-200">
      <div className="container mx-auto max-w-content px-page">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-neutral-200 [&>*:nth-child(3)]:border-l-0 md:[&>*:nth-child(3)]:border-l [&>*:nth-child(n+3)]:border-t md:[&>*:nth-child(n+3)]:border-t-0 border-neutral-200">
          {cells.map((c) => (
            <div
              key={c.key}
              className="flex items-start gap-3 px-4 py-4 md:py-5"
              data-testid={`trust-cell-${c.key}`}
            >
              <span className="mt-0.5 shrink-0">{c.icon}</span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-neutral-900">{c.title}</span>
                <span className="block text-xs text-neutral-500">{c.sub}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Mobile sticky action bar ─────────────────────────────────────────────────
export function CampaignStickyBarBeirut({
  onCtaClick,
  onWhatsAppClick,
}: {
  onCtaClick: () => void;
  onWhatsAppClick: () => void;
}) {
  const { t } = useLocale();
  const whatsAppUrl = buildWhatsAppOrderUrl(t("campaign.v2.whatsappPrefill"));
  return (
    <div
      className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-white/90 backdrop-blur border-t border-neutral-200 px-4 pt-3"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      data-testid="bar-campaign-sticky"
    >
      <div className="flex items-stretch gap-3">
        <Link
          href="/best-sellers"
          onClick={onCtaClick}
          className="flex-1 min-w-0 rounded-md bg-[#14532D] text-white flex flex-col items-center justify-center px-4 py-2 hover:bg-[#0F3F22] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14532D]"
          data-testid="button-campaign-sticky-cta"
        >
          <span className="text-sm font-semibold leading-tight">{t("campaign.v2.cta.shop")}</span>
          <span className="text-[11px] font-normal leading-tight text-white/80">
            {/* TODO(UNVERIFIED): 10:00 PM cutoff (string campaign.v2.sticky.sub) */}
            {t("campaign.v2.sticky.sub")}
          </span>
        </Link>
        <a
          href={whatsAppUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onWhatsAppClick}
          aria-label={t("campaign.v2.cta.whatsapp")}
          className="w-14 shrink-0 rounded-md bg-[#25D366] text-white flex items-center justify-center hover:bg-[#1FB558] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366]"
          data-testid="button-campaign-sticky-whatsapp"
        >
          <WhatsAppGlyph className="h-6 w-6" />
        </a>
      </div>
    </div>
  );
}
