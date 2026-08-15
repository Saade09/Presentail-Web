import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { MapPin, Send, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/contexts/LocaleContext";
import { buildUnsplashSrcset } from "@/lib/imageUtils";
import { injectTrustpilotScript } from "@/lib/trustpilot";

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

/**
 * When more than this many seconds remain before the cutoff the countdown
 * shows a calm static message ("Order by 10:00 PM / for delivery today")
 * instead of a ticking number — ticking numbers with 12h+ remaining
 * signal there is no urgency and invite the visitor to come back later.
 * Below this threshold the live counter kicks in.
 */
const URGENCY_THRESHOLD_SECONDS = 4 * 3600; // 4 hours

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
  // "Calm" = open but >4 h to cutoff → show a static message, not a ticking
  // number that signals the visitor can come back later.
  // "Urgent" = open and ≤4 h remain → live ticking counter.
  const isCalm = !cutoffPassed && secondsToCutoff > URGENCY_THRESHOLD_SECONDS;
  const isUrgent = !cutoffPassed && !isCalm;
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
    // Mobile: fixed 80svh so the trust bar is just visible above the fold.
    // Warm stone background shows through while the photo loads — never a
    // black slab. Desktop: content-centered, min 600 px tall.
    <section className="relative h-[80svh] md:h-auto md:min-h-[600px] flex items-end md:items-center overflow-hidden bg-stone-200">
      {/* Hero photograph — the LCP element: preloaded (effect above), eager,
          high fetch priority, responsive srcset, explicit dimensions.
          object-top on mobile positions the bouquet subject at the upper
          portion of the frame so flowers are visible above the copy block. */}
      <img
        src={HERO_IMAGE_URL}
        {...(heroSrcset
          ? { srcSet: heroSrcset.srcset, sizes: "100vw" }
          : {})}
        alt={t("campaign.v2.hero.imageAlt")}
        width={1200}
        height={900}
        className="absolute inset-0 h-full w-full object-cover object-top md:object-center"
        fetchPriority="high"
        loading="eager"
        decoding="async"
      />
      {/* Gradient: mobile — vertical, only darkens the lower ~50% of the
          frame so the bouquet subject in the upper half stays unobscured;
          desktop — horizontal, dark on the copy side, clear on the photo side.
          Both keep white text ≥ 4.5:1 (black/85 terminal stop under the copy). */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/50 via-[25%] to-transparent to-[50%] md:bg-gradient-to-r md:from-black/85 md:via-black/60 md:via-45% md:to-transparent md:to-75%"
      />

      <div className="relative w-full container mx-auto max-w-content px-page pb-8 pt-6 md:py-16">
        <div className="max-w-[560px] flex flex-col items-start gap-3 md:gap-4 text-white">
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

          {/* 4 — countdown / urgency block on its OWN row.
              Three states:
              • Calm  (>4 h remain): static "Order by 10:00 PM / for delivery today"
              • Urgent (≤4 h remain): live ticking counter
              • Closed (past cutoff): "Today's orders are closed / Tomorrow 9 AM"
              role="timer" only when actually ticking; aria-live off to avoid
              announcing every second to screen readers. */}
          <div
            className="w-full sm:w-auto flex items-center justify-between sm:justify-start gap-6 rounded-xl bg-[#8C1D2F] px-4 py-3"
            data-testid="block-campaign-countdown"
            role={isUrgent ? "timer" : undefined}
            aria-live="off"
          >
            <div className="text-xs leading-snug text-white/90">
              {cutoffPassed ? (
                <>
                  <div>{t("campaign.v2.countdown.closedLine1")}</div>
                  <div>{t("campaign.v2.countdown.closedLine2")}</div>
                </>
              ) : isCalm ? (
                <div>{t("campaign.v2.countdown.staticLine1")}</div>
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
              className={
                isCalm
                  ? "text-base font-semibold whitespace-nowrap"
                  : "text-xl md:text-2xl font-semibold tabular-nums whitespace-nowrap"
              }
              data-testid="text-campaign-countdown-value"
            >
              {cutoffPassed
                ? t("campaign.v2.countdown.closedValue")
                : isCalm
                  ? t("campaign.v2.countdown.staticValue")
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
// unblocks an abandoning buyer), then tracking, delivery pricing, then the
// live Trustpilot Mini widget (real TrustScore, never a stale hardcoded number).
export function CampaignTrustBarBeirut() {
  const { t } = useLocale();
  const tpRef = useRef<HTMLDivElement>(null);

  // Initialize the Trustpilot Mini widget after mount. Follows the same
  // injectTrustpilotScript + loadFromElement pattern used by TrustpilotCarousel
  // — safe to call concurrently since injectTrustpilotScript deduplicates the
  // <script> tag and piggy-backs on the existing load event if already loading.
  useEffect(() => {
    const el = tpRef.current;
    if (!el) return;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let pollAttempts = 0;
    const MAX_POLL_ATTEMPTS = 20;
    const POLL_INTERVAL_MS = 250;
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
    // Trust bar is above the fold — load immediately, no IntersectionObserver.
    injectTrustpilotScript(tryLoad);
    return () => {
      if (pollTimer !== null) clearTimeout(pollTimer);
    };
  }, []);

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
      icon: <Truck className="h-5 w-5 text-primary" aria-hidden="true" />,
      title: t("campaign.v2.trust.delivery.title"),
      sub: t("campaign.v2.trust.delivery.sub"),
    },
  ];

  return (
    <div className="bg-white border-b border-neutral-200">
      <div className="container mx-auto max-w-content px-page">
        {/* items-center vertically aligns the shorter text cells against the
            taller Trustpilot widget in the fourth column. */}
        <div className="grid grid-cols-2 md:grid-cols-4 items-center divide-x divide-neutral-200 [&>*:nth-child(3)]:border-l-0 md:[&>*:nth-child(3)]:border-l [&>*:nth-child(n+3)]:border-t md:[&>*:nth-child(n+3)]:border-t-0 border-neutral-200">
          {cells.map((c) => (
            <div
              key={c.key}
              className="flex items-start gap-3 px-4 py-4 md:py-5 min-h-[84px] md:min-h-0"
              data-testid={`trust-cell-${c.key}`}
            >
              <span className="mt-0.5 shrink-0">{c.icon}</span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-neutral-900">{c.title}</span>
                <span className="block text-xs text-neutral-500">{c.sub}</span>
              </span>
            </div>
          ))}

          {/* Trustpilot Mini widget — live TrustScore, never a hardcoded number.
              Max rendered width from Trustpilot is 240 px regardless of style-width,
              so we constrain the container to match and center it in the cell.
              Explicit height prevents iframe collapse inside a flex/grid parent. */}
          <div
            className="flex items-center justify-center px-4 py-3"
            data-testid="trust-cell-rating"
          >
            <div style={{ width: "100%", maxWidth: 240 }}>
              <div
                ref={tpRef}
                className="trustpilot-widget"
                data-locale="en-US"
                data-template-id="53aa8807dec7e10d38f59f32"
                data-businessunit-id="5d1782b3588afe00012431d9"
                data-style-height="90"
                data-style-width="100%"
                data-token="c3c9abbc-8bdc-41bb-9779-402f9a758680"
                style={{ height: 90, minHeight: 90 }}
              >
                <a
                  href="https://www.trustpilot.com/review/presentail.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Trustpilot
                </a>
              </div>
            </div>
          </div>
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
