/**
 * "Complete your gift" PDP upsell module.
 *
 * Fetches slot recommendations from GET /api/products/complete-your-gift
 * (behind the server-side CYG_ROLLOUT flag). When the flag is off (or the
 * endpoint errors / returns nothing usable), this component renders the
 * legacy FrequentlyBoughtTogether module instead, so the old behaviour is
 * restored without a frontend deployment.
 *
 * Layout per design: locked "Your bouquet" anchor card followed by up to
 * four add-on cards (chocolate, cake, balloon, stuffed animal — fixed order
 * preserved from the endpoint) with "+ Add" toggles, quantity controls after
 * selection, a required-options dialog for cakes, and a footer with item
 * count, bundle total, and a single idempotency-guarded add-to-cart CTA.
 */
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, Check, Minus, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useCart } from "@/contexts/CartContext";
import { useToast } from "@/hooks/use-toast";
import { FormattedPrice } from "@/components/FormattedPrice";
import { Button } from "@/components/ui/button";
import { FrequentlyBoughtTogether } from "@/components/product/FrequentlyBoughtTogether";
import { trackWebEvent, getOrCreateSessionId } from "@/lib/analytics";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/queries";

/** Fetch timeout — on expiry the module falls back without blocking the PDP. */
const CYG_FETCH_TIMEOUT_MS = 6000;
/** Qualified impression rule: ≥50% of the card visible for 1 continuous second. */
const IMPRESSION_VISIBILITY = 0.5;
const IMPRESSION_DWELL_MS = 1000;
/** Max characters for the cake personalisation message (matches PDP input). */
const NOTE_MAX_LENGTH = 22;

function countryToStore(
  countryCode: string | null | undefined,
  cityId: string | null | undefined,
): "lebanon" | "dubai" | "abudhabi" | "cyprus" {
  if (!countryCode) return "lebanon";
  if (countryCode === "CY") return "cyprus";
  if (countryCode === "AE") {
    if (cityId?.includes("abudhabi")) return "abudhabi";
    return "dubai";
  }
  return "lebanon";
}

export type CygSlot = {
  category: string;
  slotIndex: number;
  productSlug: string;
  osNumericId: string | null;
  wcId: number | null;
  name: string;
  imageUrl: string | null;
  imageAlt: string;
  incrementalPrice: number;
  regularPrice: number | null;
  currency: string;
  incrementalPriceUsd: number;
  regularPriceUsd: number | null;
  inStock: boolean;
  requiresOptions: boolean;
  quantity: { min: number; max: number };
  rulesVersion: string;
  token: string;
};

export type CygResponse = {
  enabled: boolean;
  experiment: { id: string; variant: string; mode: string };
  rulesVersion: string;
  slots: CygSlot[];
  reason?: string;
};

function slotToProduct(s: CygSlot): Product {
  return {
    id: s.productSlug,
    wcId: s.wcId ?? 0,
    name: s.name,
    price: String(s.incrementalPriceUsd),
    priceValue: s.regularPriceUsd ?? s.incrementalPriceUsd,
    image: s.imageUrl ? { uri: s.imageUrl } : null,
    images: s.imageUrl ? [{ uri: s.imageUrl }] : [],
    category: s.category,
    categories: [s.category],
    occasions: [],
    inStock: s.inStock,
    discountPriceValue:
      s.regularPriceUsd != null && s.incrementalPriceUsd < s.regularPriceUsd
        ? s.incrementalPriceUsd
        : null,
    discountPriceAed: null,
  } as Product;
}

function effectiveAnchorPrice(p: Product): number {
  return p.discountPriceValue ?? p.priceValue;
}

type Selection = {
  qty: number;
  /** Confirmed personalisation note for required-options products. */
  note?: string;
};

interface Props {
  slug: string;
  anchor: Product;
  /** Called after the bundle is successfully added, so the PDP can open its
   * post-add confirmation surface (cart drawer / upsell modal). */
  onBundleAdded?: () => void;
}

export function CompleteYourGift({ slug, anchor, onBundleAdded }: Props) {
  const { t } = useLocale();
  const { countryCode, cityId } = useLocationSelection();
  const { addItem, items: cartItems } = useCart();
  const { toast } = useToast();
  const store = countryToStore(countryCode, cityId);
  const sessionId = getOrCreateSessionId();

  const cartCsv = useMemo(
    () => cartItems.map((i) => i.product.id).join(","),
    [cartItems],
  );

  const fetchCyg = useCallback((): Promise<CygResponse> => {
    const params = new URLSearchParams({ slug, store });
    if (cityId) params.set("city", cityId);
    if (cartCsv) params.set("cart", cartCsv);
    if (sessionId) params.set("sessionId", sessionId);
    const signal =
      typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
        ? AbortSignal.timeout(CYG_FETCH_TIMEOUT_MS)
        : undefined;
    return apiFetch<CygResponse>(
      `/products/complete-your-gift?${params.toString()}`,
      signal ? { signal } : {},
    );
  }, [slug, store, cityId, cartCsv, sessionId]);

  const { data, isPending, isError, refetch } = useQuery<CygResponse>({
    queryKey: ["complete-your-gift", slug, store, cityId, sessionId],
    queryFn: fetchCyg,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const slots = useMemo(
    () => (data?.enabled ? (data.slots ?? []) : []),
    [data],
  );

  // ── Local selection state (page-session scoped) ──────────────────────────
  const [selected, setSelected] = useState<Record<string, Selection>>({});
  // In-progress option drafts survive dialog close/reopen within the session.
  const [optionDrafts, setOptionDrafts] = useState<Record<string, string>>({});
  const [optionsFor, setOptionsFor] = useState<CygSlot | null>(null);
  const [optionsError, setOptionsError] = useState(false);
  // Per-item failure notices from pre-submit revalidation (no silent substitution).
  const [notices, setNotices] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    setSelected({});
    setOptionDrafts({});
    setNotices([]);
    setOptionsFor(null);
  }, [slug]);

  // ── Qualified impressions (≥50% visible for 1s, once per load) ───────────
  const sectionRef = useRef<HTMLElement | null>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const firedImpressions = useRef<Set<string>>(new Set());
  const moduleViewFired = useRef(false);

  const baseEventProps = useMemo(
    () =>
      data?.enabled
        ? {
            experimentId: data.experiment.id,
            experimentVariant: data.experiment.variant,
            modelVersion: data.rulesVersion,
            store,
            city: cityId ?? undefined,
            anchorSlug: slug,
          }
        : null,
    [data, store, cityId, slug],
  );

  useEffect(() => {
    if (!data?.enabled || slots.length === 0 || !baseEventProps) return;
    if (typeof IntersectionObserver === "undefined") {
      // No observer support (very old browsers / test envs without shim):
      // fall back to firing on render so the funnel is not silently empty.
      if (!moduleViewFired.current) {
        moduleViewFired.current = true;
        trackWebEvent({
          type: "upsell_module_view",
          properties: { ...baseEventProps, slotCount: slots.length },
        });
        for (const s of slots) {
          if (firedImpressions.current.has(s.token)) continue;
          firedImpressions.current.add(s.token);
          trackWebEvent({
            type: "upsell_item_impression",
            properties: {
              ...baseEventProps,
              token: s.token,
              category: s.category,
              slotIndex: s.slotIndex,
              productSlug: s.productSlug,
              priceUsd: s.incrementalPriceUsd,
              price: s.incrementalPrice,
              currency: s.currency,
            },
          });
        }
      }
      return;
    }

    const timers = new Map<Element, ReturnType<typeof setTimeout>>();
    const slotByEl = new Map<Element, CygSlot | "module">();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const key = slotByEl.get(entry.target);
          if (!key) continue;
          if (entry.intersectionRatio >= IMPRESSION_VISIBILITY) {
            if (timers.has(entry.target)) continue;
            timers.set(
              entry.target,
              setTimeout(() => {
                timers.delete(entry.target);
                observer.unobserve(entry.target);
                if (key === "module") {
                  if (moduleViewFired.current) return;
                  moduleViewFired.current = true;
                  trackWebEvent({
                    type: "upsell_module_view",
                    properties: { ...baseEventProps, slotCount: slots.length },
                  });
                } else {
                  if (firedImpressions.current.has(key.token)) return;
                  firedImpressions.current.add(key.token);
                  trackWebEvent({
                    type: "upsell_item_impression",
                    properties: {
                      ...baseEventProps,
                      token: key.token,
                      category: key.category,
                      slotIndex: key.slotIndex,
                      productSlug: key.productSlug,
                      priceUsd: key.incrementalPriceUsd,
                      price: key.incrementalPrice,
                      currency: key.currency,
                    },
                  });
                }
              }, IMPRESSION_DWELL_MS),
            );
          } else {
            const timer = timers.get(entry.target);
            if (timer) {
              clearTimeout(timer);
              timers.delete(entry.target);
            }
          }
        }
      },
      { threshold: [IMPRESSION_VISIBILITY] },
    );

    if (sectionRef.current && !moduleViewFired.current) {
      slotByEl.set(sectionRef.current, "module");
      observer.observe(sectionRef.current);
    }
    for (const s of slots) {
      if (firedImpressions.current.has(s.token)) continue;
      const el = cardRefs.current.get(s.productSlug);
      if (el) {
        slotByEl.set(el, s);
        observer.observe(el);
      }
    }
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      observer.disconnect();
    };
  }, [data, slots, baseEventProps]);

  // ── Loading: reserve layout space to avoid CLS; never block the PDP ──────
  if (isPending) {
    return (
      <section
        className="container mx-auto px-page max-w-content pt-8 pb-6"
        aria-hidden="true"
        data-testid="cyg-loading"
      >
        <div className="rounded-2xl border border-border bg-card min-h-[320px]" />
      </section>
    );
  }

  // Flag off, endpoint error/timeout, or no candidates → legacy FBT module
  // (control behaviour). The bouquet purchase flow is never affected.
  if (isError || !data || !data.enabled || slots.length === 0) {
    return <FrequentlyBoughtTogether slug={slug} anchor={anchor} />;
  }

  const anchorPrice = effectiveAnchorPrice(anchor);
  const anchorImage = anchor.image?.uri ?? anchor.images?.[0]?.uri;
  const selectedSlots = slots.filter((s) => selected[s.productSlug] && s.inStock);
  const total =
    anchorPrice +
    selectedSlots.reduce(
      (sum, s) => sum + s.incrementalPriceUsd * (selected[s.productSlug]?.qty ?? 1),
      0,
    );
  const totalItems =
    1 + selectedSlots.reduce((sum, s) => sum + (selected[s.productSlug]?.qty ?? 1), 0);
  const summaryLabel = t(totalItems === 1 ? "product.cyg.item" : "product.cyg.items", {
    count: totalItems,
  });
  const ctaLabel = submitting
    ? t("product.cyg.adding")
    : selectedSlots.length === 0
      ? t("product.cyg.addToCart")
      : t("product.cyg.addItemsToCart", { count: totalItems });

  function eventProps(s: CygSlot) {
    return {
      ...baseEventProps,
      token: s.token,
      category: s.category,
      slotIndex: s.slotIndex,
      productSlug: s.productSlug,
      priceUsd: s.incrementalPriceUsd,
      price: s.incrementalPrice,
      currency: s.currency,
      quantity: selected[s.productSlug]?.qty ?? 1,
    };
  }

  function selectSlot(s: CygSlot, note?: string) {
    setSelected((prev) => ({
      ...prev,
      [s.productSlug]: { qty: prev[s.productSlug]?.qty ?? 1, note },
    }));
  }

  function deselectSlot(slugKey: string) {
    setSelected((prev) => {
      const next = { ...prev };
      delete next[slugKey];
      return next;
    });
  }

  function handleToggle(s: CygSlot) {
    const isSelected = !!selected[s.productSlug];
    if (isSelected) {
      trackWebEvent({ type: "upsell_remove_click", properties: eventProps(s) });
      deselectSlot(s.productSlug);
      return;
    }
    trackWebEvent({ type: "upsell_add_click", properties: eventProps(s) });
    if (s.requiresOptions) {
      trackWebEvent({ type: "upsell_option_open", properties: eventProps(s) });
      setOptionsError(false);
      setOptionsFor(s);
      return;
    }
    selectSlot(s);
  }

  function handleConfirmOptions() {
    if (!optionsFor) return;
    const draft = (optionDrafts[optionsFor.productSlug] ?? "").trim();
    if (draft.length === 0) {
      setOptionsError(true);
      return;
    }
    trackWebEvent({
      type: "upsell_option_selected",
      properties: { ...eventProps(optionsFor), note_length: draft.length },
    });
    selectSlot(optionsFor, draft);
    setOptionsFor(null);
  }

  function changeQty(s: CygSlot, delta: number) {
    const current = selected[s.productSlug];
    if (!current) return;
    const next = Math.max(
      s.quantity.min,
      Math.min(s.quantity.max, current.qty + delta),
    );
    if (next === current.qty) return;
    trackWebEvent({
      type: "upsell_quantity_change",
      properties: { ...eventProps(s), quantity: next, previousQuantity: current.qty },
    });
    setSelected((prev) => ({ ...prev, [s.productSlug]: { ...current, qty: next } }));
  }

  async function handleAddBundle() {
    // Idempotency guard — a second click while the first submit is running is
    // a no-op, so the bundle can never be added twice.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setNotices([]);

    const submissionSlots = selectedSlots;
    trackWebEvent({
      type: "upsell_bundle_add_attempt",
      properties: {
        ...baseEventProps,
        selectedCount: submissionSlots.length,
        totalUsd: total,
        tokens: submissionSlots.map((s) => s.token),
      },
    });

    try {
      // Pre-submit revalidation: re-fetch the recommendations and verify every
      // selected item is still present, in stock, and at the same price. On any
      // discrepancy, explain which item changed, refresh that selection, and
      // let the customer retry — never silently substitute or drop items.
      if (submissionSlots.length > 0) {
        const { data: fresh } = await refetch();
        const freshSlots = fresh?.enabled ? (fresh.slots ?? []) : [];
        const bySlug = new Map(freshSlots.map((s) => [s.productSlug, s]));
        const problems: string[] = [];
        for (const s of submissionSlots) {
          const current = bySlug.get(s.productSlug);
          if (!current || !current.inStock) {
            problems.push(t("product.cyg.unavailable", { name: s.name }));
            deselectSlot(s.productSlug);
          } else if (current.incrementalPriceUsd !== s.incrementalPriceUsd) {
            problems.push(t("product.cyg.priceChanged", { name: s.name }));
          }
        }
        if (problems.length > 0) {
          setNotices(problems);
          trackWebEvent({
            type: "upsell_bundle_add_failure",
            properties: {
              ...baseEventProps,
              failureReason: "revalidation_failed",
              failureDetails: problems,
              selectedCount: submissionSlots.length,
            },
          });
          return;
        }
      }

      // Mutate the cart: bouquet first, then every selected add-on. addItem is
      // a synchronous local-state mutation, so this block is effectively
      // atomic — either it throws before any state change or all items land.
      addItem(anchor, 1);
      for (const s of submissionSlots) {
        const sel = selected[s.productSlug];
        addItem(slotToProduct(s), sel?.qty ?? 1, sel?.note, { upsellToken: s.token });
      }

      trackWebEvent({
        type: "upsell_bundle_add_success",
        properties: {
          ...baseEventProps,
          selectedCount: submissionSlots.length,
          totalUsd: total,
          totalItems,
          tokens: submissionSlots.map((s) => s.token),
        },
      });
      toast({
        title: t("product.cyg.toast.addedTitle"),
        description: [anchor.name, ...submissionSlots.map((s) => s.name)].join(" · "),
      });
      setSelected({});
      onBundleAdded?.();
    } catch (err) {
      trackWebEvent({
        type: "upsell_bundle_add_failure",
        properties: {
          ...baseEventProps,
          failureReason: err instanceof Error ? err.message : "unknown",
          selectedCount: submissionSlots.length,
        },
      });
      setNotices([t("product.cyg.unavailable", { name: anchor.name })]);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const optionsDraftValue = optionsFor
    ? (optionDrafts[optionsFor.productSlug] ?? "")
    : "";

  return (
    <section
      ref={sectionRef}
      className="container mx-auto px-page max-w-content pt-8 pb-6"
      data-testid="complete-your-gift"
      aria-label={t("product.cyg.title")}
    >
      <div className="rounded-2xl border border-border bg-card px-5 py-6 sm:px-8 sm:py-8">
        <h2 className="font-serif text-2xl sm:text-3xl text-foreground">
          {t("product.cyg.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("product.cyg.subtitle")}</p>

        {/* Card row — horizontal scroll with visible overflow affordance */}
        <div
          className="mt-6 flex gap-3 sm:gap-4 overflow-x-auto pb-2 snap-x snap-mandatory motion-safe:scroll-smooth [scrollbar-width:thin]"
          role="group"
          aria-label={t("product.cyg.title")}
        >
          {/* Anchor card — locked */}
          <div className="snap-start shrink-0 w-40 sm:w-44 flex flex-col rounded-xl border border-border bg-secondary/20 overflow-hidden">
            <div className="flex items-center justify-between gap-1 px-3 pt-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground truncate">
                {t("product.cyg.yourGift")}
              </span>
              <Lock className="w-3 h-3 text-muted-foreground shrink-0" aria-hidden="true" />
            </div>
            <div className="p-3 pb-0">
              <div className="aspect-square rounded-lg overflow-hidden bg-secondary/30">
                {anchorImage ? (
                  <img
                    src={anchorImage}
                    alt={anchor.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full" />
                )}
              </div>
            </div>
            <div className="flex flex-col items-center gap-1 px-3 py-3 text-center">
              <p className="text-xs font-medium text-foreground leading-tight line-clamp-2 min-h-[2rem]">
                {anchor.name}
              </p>
              <FormattedPrice
                usdValue={anchorPrice}
                className="text-sm font-semibold text-foreground"
              />
            </div>
          </div>

          {/* Slot cards */}
          {slots.map((s) => {
            const sel = selected[s.productSlug];
            const isSelected = !!sel;
            const showQty = isSelected && s.quantity.max > 1;
            return (
              <div
                key={s.productSlug}
                ref={(el) => {
                  if (el) cardRefs.current.set(s.productSlug, el);
                  else cardRefs.current.delete(s.productSlug);
                }}
                data-testid={`cyg-slot-${s.category}`}
                className={cn(
                  "relative snap-start shrink-0 w-40 sm:w-44 flex flex-col rounded-xl border bg-card overflow-hidden motion-safe:transition-colors",
                  isSelected ? "border-2 border-primary" : "border-border",
                )}
              >
                {/* Non-color selected indicator (checkmark badge) */}
                {isSelected && (
                  <div
                    className="absolute top-2 end-2 z-10 w-5 h-5 rounded-full bg-primary flex items-center justify-center"
                    data-testid={`cyg-selected-badge-${s.category}`}
                  >
                    <Check className="w-3 h-3 text-primary-foreground" aria-hidden="true" />
                    <span className="sr-only">{t("product.cyg.selected")}</span>
                  </div>
                )}
                <div className="p-3 pb-0">
                  <div className="aspect-square rounded-lg overflow-hidden bg-secondary/30">
                    {s.imageUrl ? (
                      <img
                        src={s.imageUrl}
                        alt={s.imageAlt || s.name}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full" />
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1 px-3 pt-3 text-center flex-1">
                  <p className="text-xs font-medium text-foreground leading-tight line-clamp-2 min-h-[2rem]">
                    {s.name}
                  </p>
                  <FormattedPrice
                    usdValue={s.incrementalPriceUsd}
                    className="text-sm font-semibold text-foreground"
                  />
                  {/* Quantity controls appear only after selection */}
                  {showQty && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <button
                        type="button"
                        onClick={() => changeQty(s, -1)}
                        disabled={sel.qty <= s.quantity.min}
                        aria-label={t("product.cyg.qty.decrease", { name: s.name })}
                        data-testid={`cyg-qty-dec-${s.category}`}
                        className="w-11 h-11 sm:w-8 sm:h-8 rounded-full border border-border flex items-center justify-center disabled:opacity-30 hover:bg-muted motion-safe:transition-colors"
                      >
                        <Minus className="w-3 h-3" aria-hidden="true" />
                      </button>
                      <span
                        className="text-xs font-medium w-5 text-center tabular-nums"
                        data-testid={`cyg-qty-${s.category}`}
                      >
                        {sel.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => changeQty(s, 1)}
                        disabled={sel.qty >= s.quantity.max}
                        aria-label={t("product.cyg.qty.increase", { name: s.name })}
                        data-testid={`cyg-qty-inc-${s.category}`}
                        className="w-11 h-11 sm:w-8 sm:h-8 rounded-full border border-border flex items-center justify-center disabled:opacity-30 hover:bg-muted motion-safe:transition-colors"
                      >
                        <Plus className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <button
                    type="button"
                    onClick={() => handleToggle(s)}
                    disabled={!s.inStock}
                    aria-pressed={isSelected}
                    data-testid={`cyg-add-${s.category}`}
                    className={cn(
                      "w-full rounded-lg border min-h-[44px] sm:min-h-0 py-1.5 text-xs font-semibold motion-safe:transition-colors",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-foreground/60 bg-card text-foreground hover:bg-secondary/40",
                      !s.inStock && "opacity-40 cursor-not-allowed",
                    )}
                  >
                    {isSelected ? t("product.cyg.added") : t("product.cyg.add")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Revalidation notices — explicit, no silent substitution */}
        {notices.length > 0 && (
          <div
            className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3"
            role="alert"
            data-testid="cyg-notices"
          >
            {notices.map((n, i) => (
              <p key={i} className="text-sm text-destructive">
                {n}
              </p>
            ))}
          </div>
        )}

        {/* Footer: summary + CTA. Summary is an ARIA live region so add /
            remove / quantity updates are announced to screen readers. */}
        <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3 pt-4 border-t border-border">
          <div
            className="flex items-baseline gap-2"
            aria-live="polite"
            aria-atomic="true"
            data-testid="cyg-summary"
          >
            <span className="text-sm text-foreground">{summaryLabel}</span>
            <span className="text-sm text-muted-foreground" aria-hidden="true">
              ·
            </span>
            <FormattedPrice
              usdValue={total}
              className="text-base font-semibold text-foreground"
            />
          </div>
          <Button
            size="lg"
            className="sm:ml-auto min-h-[44px]"
            disabled={!anchor.inStock || submitting}
            onClick={() => void handleAddBundle()}
            data-testid="cyg-add-bundle"
          >
            {ctaLabel}
          </Button>
        </div>
      </div>

      {/* Required-options dialog (cakes / mandatory personalisation).
          Draft survives close/reopen within the page session; the card is
          only marked selected after a valid confirmation. */}
      <Dialog
        open={!!optionsFor}
        onOpenChange={(open) => {
          if (!open) setOptionsFor(null);
        }}
      >
        <DialogContent className="max-w-sm" data-testid="cyg-options-dialog">
          {optionsFor && (
            <>
              <DialogHeader>
                <DialogTitle className="font-serif text-xl">
                  {t("product.cyg.options.title", { name: optionsFor.name })}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-muted-foreground line-clamp-1">
                    {optionsFor.name}
                  </span>
                  <FormattedPrice
                    usdValue={optionsFor.incrementalPriceUsd}
                    className="text-sm font-semibold text-foreground shrink-0"
                  />
                </div>
                <label
                  className="text-xs font-medium text-muted-foreground uppercase tracking-widest block"
                  htmlFor="cyg-options-note"
                >
                  {t("product.cyg.options.messageLabel")}
                </label>
                <div className="relative">
                  <Input
                    id="cyg-options-note"
                    value={optionsDraftValue}
                    onChange={(e) => {
                      const value = e.target.value.slice(0, NOTE_MAX_LENGTH);
                      setOptionsError(false);
                      setOptionDrafts((prev) => ({
                        ...prev,
                        [optionsFor.productSlug]: value,
                      }));
                    }}
                    placeholder={t("product.cyg.options.placeholder")}
                    maxLength={NOTE_MAX_LENGTH}
                    className="pr-12"
                    data-testid="cyg-options-input"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground tabular-nums">
                    {t("product.customNote.counter").replace(
                      "{count}",
                      String(optionsDraftValue.length),
                    )}
                  </span>
                </div>
                {optionsError && (
                  <p className="text-xs text-destructive" role="alert" data-testid="cyg-options-error">
                    {t("product.cyg.options.required")}
                  </p>
                )}
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={() => setOptionsFor(null)}
                  data-testid="cyg-options-cancel"
                >
                  {t("product.cyg.options.cancel")}
                </Button>
                <Button onClick={handleConfirmOptions} data-testid="cyg-options-confirm">
                  {t("product.cyg.options.confirm")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
