import { useEffect, useMemo, useState, useRef } from "react";
import { useCart, effectivePrice } from "@/contexts/CartContext";
import { Link, useLocation } from "wouter";
import { trackEvent, trackWebEvent } from "@/lib/analytics";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Minus, Plus, ShoppingCart, Eye, Tag, ChevronDown, ChevronUp, Check, Trash2, Lock } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { motion } from "framer-motion";
import { useLocale } from "@/contexts/LocaleContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  FreeDeliveryStatusCard,
  resolveFreeDeliveryState,
  type FreeDeliveryState,
} from "@/components/cart/FreeDeliveryStatusCard";
import { FormattedPrice } from "@/components/FormattedPrice";
import { SalePrice } from "@/components/SalePrice";
import { CartUpsells } from "@/components/cart/CartUpsells";
import { useDeliveryConfig } from "@/components/product/useDeliveryConfig";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useDeliverySelection } from "@/contexts/DeliverySelectionContext";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import { expressSurchargeForCountry, formatPromiseDateLabel, freeDeliveryThresholdUsd, getLocalIso, isExpressDeliveryAvailable, isMidnightSlot, timeSlotsForCountry } from "@workspace/delivery";
import { buildExpressPromise, useDeliveryPromise, useExpressQuoteAnchor } from "@/components/delivery/deliveryPromise";
import { useMidnightSlotValidation } from "@/components/delivery/useMidnightSlotValidation";
import { ExpressUpgradeCard } from "@/components/delivery/ExpressUpgradeCard";
import { useNow } from "@/lib/useNow";
import { computeCartTotal } from "@workspace/display-currency";
import { CheckoutLoginDialog } from "@/components/cart/CheckoutLoginDialog";
import { cartCheckoutCtaDecision, isFrictionlessCheckoutEnabled } from "@/lib/frictionlessCheckout";
import { DeliveryDateRow } from "@/components/delivery/DeliveryDateRow";
import { ExpressQuietPrompt } from "@/components/delivery/ExpressQuietPrompt";
import { DeliverEarlierDialog } from "@/components/delivery/DeliverEarlierDialog";
import { SuggestedMessagesDialog } from "@/components/checkout/SuggestedMessagesDialog";
import { useToast } from "@/hooks/use-toast";
import { displayedSlotsForDate } from "@/components/delivery/displayedSlots";
import cardStationery from "@assets/Elegant-dark-teal-stationery-design_1778742277420.avif";
import cardLogoEn from "@assets/Presentail_PNG-01_white.png";
import cardLogoAr from "@assets/Presentail-Arabic-Logo-white.png";

export const CARD_MESSAGE_KEY = "presentail_card_message_v1";
export const CARD_TO_KEY = "presentail_card_to_v1";
export const CARD_FROM_KEY = "presentail_card_from_v1";
export const CARD_QR_LINK_KEY = "presentail_card_qr_link_v1";
export const COUPON_STORAGE_KEY = "presentail_coupon_v1";
/** Per-cart-state dismissal of the quiet "Need it today?" express prompt. */
export const EXPRESS_PROMPT_DISMISSED_KEY = "presentail_express_prompt_dismissed_v1";
export const COUPON_DISCOUNT_KEY = "presentail_coupon_discount_v1";
export const ORDER_NOTE_KEY = "presentail_order_note_v1";

function isValidQrUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  return /^https?:\/\/.+/.test(trimmed);
}

function CartSkeleton() {
  return (
    <div className="min-h-screen bg-gray-100 pt-12 pb-24">
      <div className="container mx-auto px-page max-w-content">
        <Skeleton className="h-10 w-48 mb-12" />
        <div className="flex flex-col lg:flex-row gap-12">
          <div className="flex-1 space-y-6 min-w-0">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-4 py-4 border-b">
                <Skeleton className="w-20 md:w-24 aspect-square rounded-2xl shrink-0" />
                <div className="flex flex-col justify-between flex-1 py-1">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <div className="flex items-center justify-between mt-4">
                    <Skeleton className="h-8 w-28 rounded-full" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="w-full lg:w-[26.4rem] shrink-0">
            <div className="bg-secondary/30 rounded-3xl p-8">
              <Skeleton className="h-8 w-44 mb-4" />
              <div className="mb-6 pb-6 border-b border-primary/10">
                <Skeleton className="h-4 w-full" />
              </div>
              <div className="mb-6 pb-6 border-b border-primary/10">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
              <div className="flex justify-between mb-8">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-7 w-24" />
              </div>
              <Skeleton className="h-14 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Cart() {
  const { items, updateQuantity, removeItem, updateCustomNote, subtotal, itemCount, isHydrated } = useCart();
  const { t, dir, language } = useLocale();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const {
    freeDeliveryEnabled,
    cityFeeUsd,
    isLoaded: deliveryConfigLoaded,
    freeDeliveryThresholdUsd: configThresholdUsd,
  } = useDeliveryConfig();
  const { countryCode, city: locationCity, country: locationCountry } = useLocationSelection();
  const expressSurcharge = expressSurchargeForCountry(countryCode);
  const { mode: deliveryMode, slotLabel, slotId, date: deliveryDate, source: deliverySource, serviceType: deliveryServiceType, setSelection } = useDeliverySelection();
  const { currencyCode } = useDisplayCurrency();
  const deliveryPromise = useDeliveryPromise();
  const now = useNow();
  // Express upsell visibility: city allows express AND we're inside the
  // express operating window in the recipient market's timezone.
  const expressAvailableNow =
    locationCity?.expressAvailable !== false && isExpressDeliveryAvailable(countryCode, now);
  // Derive the effective free-delivery threshold in USD, mirroring Checkout.tsx:
  //   1. OS per-city value (most specific)
  //   2. OS per-country value
  //   3. Hardcoded lib fallback (freeDeliveryThresholdUsd returns 90 for unknown
  //      countries, so this is always a finite positive number for LB/AE/CY).
  // Passing a clean USD number lets FreeDeliveryBanner both (a) compare it
  // correctly against the USD subtotal for the progress bar and (b) format it
  // in the visitor's selected display currency via formatPrice.
  const thresholdUsd =
    locationCity?.freeDeliveryThresholdUsd ??
    locationCountry?.freeDeliveryThresholdUsd ??
    configThresholdUsd ??
    (freeDeliveryThresholdUsd(countryCode) || undefined);

  const rawTimeSlots = locationCity?.timeSlots?.length
    ? locationCity.timeSlots
    : locationCity?.slotsByDay
      ? Object.values(locationCity.slotsByDay).flat()
      : [];

  useMidnightSlotValidation(rawTimeSlots, locationCity?.id, countryCode, locationCity?.slotsByDay);

  // Slot surcharge for the booked delivery window. Uses the same date-aware
  // slot resolution as the picker modal (displayedSlotsForDate) so the fee
  // shown here always matches the variant the shopper confirmed — including
  // duplicate-label OS configs (same-day paid vs next-day free) and the $5
  // same-day night fallback.
  const { slotFeeUsd, isMidnightSlotActive } = (() => {
    if (deliveryMode === "express" || !slotLabel) return { slotFeeUsd: 0, isMidnightSlotActive: false };
    // Authoritative premium-service marker captured when the shopper confirmed
    // the slot. useMidnightSlotValidation clears it if the slot stops being a
    // valid Midnight config, so it stays trustworthy even before city data
    // finishes loading (when slot resolution below can't run yet).
    const midnightByServiceType = deliveryServiceType === "midnight";
    const todayIso = getLocalIso(countryCode);
    const dateIso = deliveryDate || todayIso;
    const dayIso = (n: number) => {
      const [y, m, d] = todayIso.split("-").map(Number) as [number, number, number];
      const dt = new Date(y, m - 1, d + n, 12, 0, 0);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    };
    const displayed = displayedSlotsForDate(rawTimeSlots, dateIso, todayIso, dayIso(1), locationCity?.id);
    const bookedSlot =
      (slotId ? displayed.find((s) => s.slotId === slotId) : undefined) ??
      displayed.find((s) => s.label === slotLabel);
    if (!bookedSlot) return { slotFeeUsd: 0, isMidnightSlotActive: midnightByServiceType };

    return {
      slotFeeUsd: bookedSlot.extraFee && bookedSlot.extraFee > 0 ? bookedSlot.extraFee : 0,
      isMidnightSlotActive: midnightByServiceType || isMidnightSlot(bookedSlot, locationCity?.id)
    };
  })();

  // Delivery fee for the Order Summary sidebar (district fee only — slot fee shown separately).
  // null → no city selected yet (show "Calculated at checkout")
  // 0    → above free-delivery threshold (show "Free")
  // >0   → show the fee amount
  const deliveryFeeUsd: number | null = (() => {
    if (cityFeeUsd === null) return null;
    const threshold = thresholdUsd ?? Infinity;
    return freeDeliveryEnabled !== false && subtotal >= threshold ? 0 : cityFeeUsd;
  })();

  // When express is selected, add the surcharge on top of the base delivery fee.
  // null base → still null (no city selected); 0 base (free threshold met) →
  // expressSurcharge alone (express always incurs the fee even over the threshold).
  const effectiveDeliveryFeeUsd: number | null =
    deliveryMode === "express" && expressSurcharge > 0
      ? deliveryFeeUsd === null
        ? null
        : (deliveryFeeUsd ?? 0) + expressSurcharge
      : deliveryFeeUsd;

  // Promo code — persisted to localStorage so Checkout picks it up automatically.
  const [couponOpen, setCouponOpen] = useState(() => {
    try { return (localStorage.getItem(COUPON_STORAGE_KEY) ?? "").length > 0; } catch { return false; }
  });
  const [couponInput, setCouponInput] = useState(() => {
    try { return localStorage.getItem(COUPON_STORAGE_KEY) ?? ""; } catch { return ""; }
  });
  const [couponApplied, setCouponApplied] = useState(() => {
    try { return (localStorage.getItem(COUPON_STORAGE_KEY) ?? "").length > 0; } catch { return false; }
  });
  const [couponValidating, setCouponValidating] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponDiscountUsd, setCouponDiscountUsd] = useState<number>(() => {
    try {
      // Only restore a stored discount when a coupon code is also stored.
      // COUPON_DISCOUNT_KEY can outlive COUPON_STORAGE_KEY when an order
      // completes and only the code key is cleared, causing a silent discount
      // on the next unrelated cart session.
      if (!(localStorage.getItem(COUPON_STORAGE_KEY) ?? "")) return 0;
      return parseFloat(localStorage.getItem(COUPON_DISCOUNT_KEY) ?? "0") || 0;
    } catch { return 0; }
  });

  const cartTotal = computeCartTotal(subtotal, (effectiveDeliveryFeeUsd ?? 0) + slotFeeUsd, couponDiscountUsd);

  // Row-visibility flags shared by the summary, CTA, and analytics so every
  // consumer reads the same derived pricing state (atomic updates).
  const standardDeliveryFree = deliveryFeeUsd === 0;
  const expressRowVisible =
    deliveryMode === "express" && expressSurcharge > 0 && locationCity?.expressAvailable !== false;

  // ── Express upsell gating (Delivery Summary) ─────────────────────────────
  // Gating is driven by the *source* of the delivery selection, never the
  // date alone: a user-chosen future date must never be upsold away, while a
  // system-assigned one may show the quiet "Need it today?" prompt.
  const todayIsoLocal = getLocalIso(countryCode, now);
  const selectionIsFutureDate =
    deliveryMode !== null &&
    deliveryMode !== "express" &&
    !!deliveryDate &&
    deliveryDate > todayIsoLocal;
  const userChoseSelection =
    deliverySource === "user_selected" || deliverySource === "restored_user_selection";
  // Mixed carts with Express-ineligible items suppress the cart-level upsell.
  // No item flag exists for most catalogs today (all express-eligible), but any
  // item explicitly marked ineligible turns the whole cart-level offer off.
  const mixedCartExpressIneligible = items.some(
    (i) => (i.product as { expressEligible?: boolean }).expressEligible === false,
  );

  // Persisted per-cart-state dismissal of the quiet prompt. The signature
  // captures the delivery selection the prompt was dismissed for; a material
  // change (different date/slot) re-enables the prompt.
  const promptStateSignature = `${deliveryDate ?? ""}|${slotId ?? slotLabel ?? ""}`;
  const [promptDismissedFor, setPromptDismissedFor] = useState<string | null>(() => {
    try { return localStorage.getItem(EXPRESS_PROMPT_DISMISSED_KEY); } catch { return null; }
  });
  const promptDismissed = promptDismissedFor === promptStateSignature;

  // Base eligibility for any cart-level express offer (card or quiet prompt).
  const expressOfferBaseEligible =
    deliveryMode !== null &&
    deliveryMode !== "express" &&
    expressSurcharge > 0 &&
    expressAvailableNow &&
    !mixedCartExpressIneligible;

  // Same-day standard selection → the existing full upgrade card, unchanged.
  // A deliberately selected Midnight slot is a premium choice — never upsell
  // Express against it (the picker itself still offers Express when eligible).
  const expressUpgradeVisible =
    expressOfferBaseEligible && !selectionIsFutureDate && !isMidnightSlotActive;

  // Delta pricing — same source of truth as cartTotal (effectiveDeliveryFeeUsd
  // + slotFeeUsd), so the displayed delta always equals the change in Total:
  //   express total fee  = (base fee after free-delivery/credits) + surcharge
  //   currently applied  = (base fee after free-delivery/credits) + slot fee
  const expressTotalFeeUsd: number = (deliveryFeeUsd ?? 0) + expressSurcharge;
  const appliedStandardFeeUsd: number = (deliveryFeeUsd ?? 0) + slotFeeUsd;
  const expressDeltaUsd: number = expressTotalFeeUsd - appliedStandardFeeUsd;

  // Express "Arrives by [time]" preview — anchored to a quote timestamp that
  // refreshes on the standard TTL cadence (never creeping per-render). Falls
  // back to null (→ "Within 90 minutes") when the ETA can't be computed.
  const upgradeQuoteAnchor = useExpressQuoteAnchor(expressUpgradeVisible || deliveryMode === "express");
  const expressArrivalPreview: string | null = useMemo(() => {
    try {
      return buildExpressPromise({
        quotedAt: upgradeQuoteAnchor ?? now,
        countryCode: countryCode ?? null,
        locale: language,
        t,
      }).arrival;
    } catch {
      return null;
    }
  }, [upgradeQuoteAnchor, now, countryCode, language, t]);

  // ── Quiet "Need it today?" prompt (system-assigned future dates only) ────
  // Suppression reason (analytics) for a would-be offer on a future-dated
  // selection; null when the quiet prompt should show.
  const expressOfferSuppressionReason: string | null = (() => {
    if (deliveryMode === null || deliveryMode === "express") return null;
    if (expressSurcharge <= 0 || !expressAvailableNow) return null;
    if (mixedCartExpressIneligible) return "mixed_cart_ineligible";
    if (isMidnightSlotActive) return "midnight_selected";
    if (!selectionIsFutureDate) return null;
    if (deliverySource === "user_selected") return "explicit_future_date";
    if (deliverySource === "restored_user_selection") return "restored_future_selection";
    if (promptDismissed) return "customer_dismissed";
    if (!expressArrivalPreview) return "ETA_unavailable";
    if (deliveryFeeUsd === null) return "price_unavailable";
    return null;
  })();
  const quietPromptVisible =
    expressOfferBaseEligible &&
    !isMidnightSlotActive &&
    selectionIsFutureDate &&
    !userChoseSelection &&
    !promptDismissed &&
    !!expressArrivalPreview &&
    deliveryFeeUsd !== null;

  // Shared analytics payload for the express upgrade events.
  const expressUpgradeAnalyticsProps = {
    cart_value_usd: subtotal,
    delivery_selection_source: deliverySource,
    selected_date: deliveryDate,
    express_date: todayIsoLocal,
    same_calendar_date: !selectionIsFutureDate,
    market: countryCode ?? null,
    effective_standard_fee_usd: appliedStandardFeeUsd,
    express_fee_usd: expressTotalFeeUsd,
    displayed_delta_usd: expressDeltaUsd,
    free_delivery_eligible:
      freeDeliveryEnabled !== false && typeof thresholdUsd === "number" && subtotal >= thresholdUsd,
    eta: expressArrivalPreview ?? "within_90_minutes",
    selected_delivery_type: deliveryMode === "express" ? "express" : "standard",
  };
  const expressUpgradeAnalyticsPropsRef = useRef(expressUpgradeAnalyticsProps);
  expressUpgradeAnalyticsPropsRef.current = expressUpgradeAnalyticsProps;

  // Impression — once per cart visit while the card is visible.
  const upgradeImpressionRef = useRef(false);
  useEffect(() => {
    if (!expressUpgradeVisible || upgradeImpressionRef.current || !isHydrated || itemCount === 0) return;
    upgradeImpressionRef.current = true;
    trackWebEvent({
      type: "express_upgrade_impression",
      currency: "USD",
      properties: expressUpgradeAnalyticsPropsRef.current,
    });
  }, [expressUpgradeVisible, isHydrated, itemCount]);

  // ── Express offer analytics (eligible / impression / suppressed) ─────────
  const offerEligibleRef = useRef(false);
  useEffect(() => {
    if (!isHydrated || itemCount === 0 || offerEligibleRef.current) return;
    if (deliveryMode === null || deliveryMode === "express") return;
    if (expressSurcharge <= 0 || !expressAvailableNow) return;
    offerEligibleRef.current = true;
    trackWebEvent({
      type: "express_offer_eligible",
      currency: "USD",
      properties: expressUpgradeAnalyticsPropsRef.current,
    });
  }, [isHydrated, itemCount, deliveryMode, expressSurcharge, expressAvailableNow]);

  const offerImpressionRef = useRef(false);
  useEffect(() => {
    if (!isHydrated || itemCount === 0 || offerImpressionRef.current) return;
    if (!expressUpgradeVisible && !quietPromptVisible) return;
    offerImpressionRef.current = true;
    trackWebEvent({
      type: "express_offer_impression",
      currency: "USD",
      properties: {
        ...expressUpgradeAnalyticsPropsRef.current,
        variant: quietPromptVisible ? "quiet_prompt" : "upgrade_card",
      },
    });
  }, [isHydrated, itemCount, expressUpgradeVisible, quietPromptVisible]);

  // Suppression — once per distinct reason per cart visit.
  const lastSuppressionReasonRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isHydrated || itemCount === 0 || !expressOfferSuppressionReason) return;
    if (lastSuppressionReasonRef.current === expressOfferSuppressionReason) return;
    lastSuppressionReasonRef.current = expressOfferSuppressionReason;
    trackWebEvent({
      type: "express_offer_suppressed",
      currency: "USD",
      properties: {
        ...expressUpgradeAnalyticsPropsRef.current,
        suppression_reason: expressOfferSuppressionReason,
      },
    });
  }, [isHydrated, itemCount, expressOfferSuppressionReason]);

  // ── Quiet prompt actions ──────────────────────────────────────────────────
  const [earlierDialogOpen, setEarlierDialogOpen] = useState(false);
  const persistPromptDismissal = () => {
    setPromptDismissedFor(promptStateSignature);
    try { localStorage.setItem(EXPRESS_PROMPT_DISMISSED_KEY, promptStateSignature); } catch { /* ignore */ }
  };
  const markSelectionUserConfirmed = () => {
    // Dismissing the prompt / keeping the scheduled slot is an explicit choice:
    // the selection stops being "system-assigned" from here on (persisted).
    setSelection({ source: "user_selected" });
  };
  const handlePromptDismiss = () => {
    persistPromptDismissal();
    markSelectionUserConfirmed();
  };
  const handlePromptSeeOption = () => {
    trackWebEvent({
      type: "express_offer_clicked",
      currency: "USD",
      properties: expressUpgradeAnalyticsPropsRef.current,
    });
    setEarlierDialogOpen(true);
    trackWebEvent({
      type: "earlier_delivery_confirmation_shown",
      currency: "USD",
      properties: expressUpgradeAnalyticsPropsRef.current,
    });
  };
  const handleEarlierConfirm = () => {
    setEarlierDialogOpen(false);
    trackWebEvent({
      type: "earlier_delivery_confirmed",
      currency: "USD",
      properties: expressUpgradeAnalyticsPropsRef.current,
    });
    handleExpressUpgrade();
  };
  const handleEarlierCancel = () => {
    setEarlierDialogOpen(false);
    trackWebEvent({
      type: "earlier_delivery_canceled",
      currency: "USD",
      properties: expressUpgradeAnalyticsPropsRef.current,
    });
    // Keeping the scheduled slot confirms it — suppress the prompt for this
    // cart state and mark the selection user-confirmed.
    persistPromptDismissal();
    markSelectionUserConfirmed();
  };

  // Upgrade action — selects express via the shared delivery-selection state.
  // upgradePendingRef guards double-clicks/races while the switch commits.
  const upgradePendingRef = useRef(false);
  const [upgrading, setUpgrading] = useState(false);
  const handleExpressUpgrade = () => {
    if (upgradePendingRef.current) return;
    const props = expressUpgradeAnalyticsPropsRef.current;
    trackWebEvent({ type: "express_upgrade_clicked", currency: "USD", properties: props });
    if (!expressAvailableNow) {
      trackWebEvent({
        type: "express_upgrade_failed",
        currency: "USD",
        properties: { ...props, reason: "express_unavailable" },
      });
      return;
    }
    upgradePendingRef.current = true;
    setUpgrading(true);
    try {
      setSelection({
        mode: "express",
        date: getLocalIso(countryCode),
        slotLabel: null,
        slotId: null,
        serviceType: null,
        cityId: null,
        source: "user_selected",
      });
    } catch {
      upgradePendingRef.current = false;
      setUpgrading(false);
      trackWebEvent({
        type: "express_upgrade_failed",
        currency: "USD",
        properties: { ...props, reason: "selection_error" },
      });
    }
  };

  // Method-change observer: emits delivery_method_changed on every switch and
  // express_upgrade_success when the switch was initiated by the Upgrade CTA.
  const prevDeliveryModeRef = useRef<typeof deliveryMode | undefined>(undefined);
  useEffect(() => {
    const prev = prevDeliveryModeRef.current;
    prevDeliveryModeRef.current = deliveryMode;
    if (prev === undefined || prev === deliveryMode) return;
    const props = expressUpgradeAnalyticsPropsRef.current;
    trackWebEvent({
      type: "delivery_method_changed",
      currency: "USD",
      properties: {
        ...props,
        from_method: prev === "express" ? "express" : prev === null ? "none" : "standard",
        to_method: deliveryMode === "express" ? "express" : "standard",
      },
    });
    if (upgradePendingRef.current) {
      upgradePendingRef.current = false;
      setUpgrading(false);
      if (deliveryMode === "express") {
        trackWebEvent({ type: "express_upgrade_success", currency: "USD", properties: props });
        trackWebEvent({ type: "delivery_method_change_success", currency: "USD", properties: props });
      } else {
        trackWebEvent({
          type: "express_upgrade_failed",
          currency: "USD",
          properties: { ...props, reason: "selection_not_applied" },
        });
        trackWebEvent({
          type: "delivery_method_change_failed",
          currency: "USD",
          properties: { ...props, reason: "selection_not_applied" },
        });
      }
    }
  }, [deliveryMode]);

  // ── Contextual three-state free-delivery banner ──────────────────────────
  // hidden / close / unlocked — driven by the server threshold + enabled flag,
  // the qualifying subtotal, and the selected delivery method. Fails safe to
  // hidden while the delivery config loads.
  const bannerState: FreeDeliveryState = resolveFreeDeliveryState({
    subtotalUsd: subtotal,
    thresholdUsd,
    enabled: freeDeliveryEnabled,
    configLoaded: deliveryConfigLoaded,
    deliveryMode,
  });
  const freeDeliveryUnlocked =
    freeDeliveryEnabled !== false &&
    typeof thresholdUsd === "number" &&
    subtotal >= thresholdUsd;
  const selectedDeliveryType = deliveryMode === "express" ? "express" : "standard";

  // Polite one-time announcement when the shopper crosses the threshold via a
  // cart action (not on unrelated rerenders, not on initial mount).
  const [unlockAnnouncement, setUnlockAnnouncement] = useState("");

  // Fire analytics once per meaningful state transition, not per rerender.
  // Display transitions (bannerState) drive prompt_viewed; actual eligibility
  // transitions (freeDeliveryUnlocked) drive unlocked/lost — selecting express
  // only hides the promotion and must NOT count as losing qualification.
  const prevBannerStateRef = useRef<FreeDeliveryState | null>(null);
  const prevQualifiedRef = useRef<boolean | null>(null);
  const prevItemCountRef = useRef(itemCount);
  const prevDiscountRef = useRef(couponDiscountUsd);
  useEffect(() => {
    if (!isHydrated || !deliveryConfigLoaded) return;
    const prevState = prevBannerStateRef.current;
    const prevQualified = prevQualifiedRef.current;
    const itemCountChanged = itemCount !== prevItemCountRef.current;
    const itemsIncreased = itemCount > prevItemCountRef.current;
    const promoChanged = couponDiscountUsd !== prevDiscountRef.current;
    const stateChanged = prevState !== bannerState;
    const qualifiedChanged = prevQualified !== freeDeliveryUnlocked;
    prevItemCountRef.current = itemCount;
    prevDiscountRef.current = couponDiscountUsd;
    if (!stateChanged && !qualifiedChanged) return;
    prevBannerStateRef.current = bannerState;
    prevQualifiedRef.current = freeDeliveryUnlocked;

    const threshold = typeof thresholdUsd === "number" ? thresholdUsd : 0;
    const remaining = Math.max(threshold - subtotal, 0);
    const trigger = promoChanged
      ? "promo_change"
      : itemsIncreased
        ? "add_item"
        : itemCountChanged
          ? "quantity_change"
          : prevQualified === null
            ? "restored_cart"
            : "other";

    if (stateChanged && (bannerState === "close" || bannerState === "unlocked")) {
      trackWebEvent({
        type: "free_delivery_prompt_viewed",
        properties: {
          state: bannerState,
          threshold,
          qualifying_subtotal: subtotal,
          remaining_amount: remaining,
          currency: "USD",
          market: countryCode ?? "unknown",
          selected_delivery_type: selectedDeliveryType,
        },
      });
    }
    if (qualifiedChanged && freeDeliveryUnlocked) {
      trackWebEvent({
        type: "free_delivery_unlocked",
        properties: { threshold, qualifying_subtotal: subtotal, currency: "USD", trigger },
      });
      if (prevQualified !== null) setUnlockAnnouncement(t("cart.banner.unlockedTitle"));
    }
    if (qualifiedChanged && prevQualified === true && !freeDeliveryUnlocked) {
      trackWebEvent({
        type: "free_delivery_lost",
        properties: { threshold, qualifying_subtotal: subtotal, currency: "USD", trigger },
      });
      setUnlockAnnouncement("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bannerState, freeDeliveryUnlocked, isHydrated, deliveryConfigLoaded, itemCount, couponDiscountUsd, subtotal, thresholdUsd, countryCode, selectedDeliveryType]);

  // Whether the in-cart recommendations section actually has content —
  // controls the banner's "Shop add-ons" affordance.
  const [addonsAvailable, setAddonsAvailable] = useState(false);

  // "Shop add-ons" — scroll to the in-cart recommendations without losing
  // cart context. Respects reduced-motion preferences.
  const handleShopAddons = () => {
    trackWebEvent({
      type: "free_delivery_addons_clicked",
      properties: {
        threshold: typeof thresholdUsd === "number" ? thresholdUsd : 0,
        remaining_amount: Math.max((thresholdUsd ?? 0) - subtotal, 0),
        currency: "USD",
        destination: "cart_upsells",
      },
    });
    const el = document.getElementById("cart-upsells");
    if (!el) return;
    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  };

  const handleCouponToggle = () => {
    const next = !couponOpen;
    setCouponOpen(next);
    if (next && !couponApplied) {
      trackWebEvent({ type: "promo_opened" });
      trackWebEvent({ type: "promo_code_expanded" });
    }
  };

  const handleCouponApply = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code || couponValidating) return;
    trackWebEvent({ type: "promo_apply_attempted" });
    setCouponError(null);
    setCouponValidating(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        error?: string;
        message?: string;
        discountAmountUsd?: number;
        finalTotalUsd?: number;
      }>("/coupons/validate", {
        method: "POST",
        body: JSON.stringify({
          code,
          customerEmail: user?.email ?? "",
          cartItems: items.map((i) => ({ osSlug: i.product.id, priceUsd: effectivePrice(i.product), quantity: i.quantity })),
          cartTotalUsd: subtotal + (effectiveDeliveryFeeUsd ?? 0) + slotFeeUsd,
        }),
      });
      if (res.ok) {
        const discount = res.discountAmountUsd ?? 0;
        try {
          localStorage.setItem(COUPON_STORAGE_KEY, code);
          localStorage.setItem(COUPON_DISCOUNT_KEY, String(discount));
        } catch { /* best-effort */ }
        setCouponInput(code);
        setCouponApplied(true);
        setCouponDiscountUsd(discount);
        trackWebEvent({ type: "promo_applied", value: discount, currency: "USD", properties: { code } });
        trackWebEvent({ type: "promo_code_submitted", properties: { outcome: "success" } });
      } else {
        setCouponError(res.message ?? t("cart.promoCodeInvalid"));
        setCouponApplied(false);
        setCouponDiscountUsd(0);
        try { localStorage.removeItem(COUPON_DISCOUNT_KEY); } catch { /* best-effort */ }
        trackWebEvent({ type: "promo_failed" });
        trackWebEvent({ type: "promo_code_submitted", properties: { outcome: "invalid" } });
      }
    } catch (err) {
      const msg = err instanceof Error && err.message && !err.message.startsWith("API error ")
        ? err.message
        : t("cart.promoCodeError");
      setCouponError(msg);
      trackWebEvent({ type: "promo_failed" });
      trackWebEvent({ type: "promo_code_submitted", properties: { outcome: "error" } });
    } finally {
      setCouponValidating(false);
    }
  };

  const handleCouponRemove = () => {
    try {
      localStorage.removeItem(COUPON_STORAGE_KEY);
      localStorage.removeItem(COUPON_DISCOUNT_KEY);
    } catch { /* best-effort */ }
    setCouponInput("");
    setCouponApplied(false);
    setCouponOpen(false);
    setCouponError(null);
    setCouponDiscountUsd(0);
    trackWebEvent({ type: "promo_removed" });
    trackWebEvent({ type: "promo_code_removed" });
  };

  // Card message — persisted to localStorage so it pre-populates checkout.
  const [cardMessage, setCardMessage] = useState(() => {
    try { return localStorage.getItem(CARD_MESSAGE_KEY) ?? ""; } catch { return ""; }
  });
  const [cardTo, setCardTo] = useState(() => {
    try { return localStorage.getItem(CARD_TO_KEY) ?? ""; } catch { return ""; }
  });
  const [cardFrom, setCardFrom] = useState(() => {
    try { return localStorage.getItem(CARD_FROM_KEY) ?? ""; } catch { return ""; }
  });

  const [qrLink, setQrLink] = useState(() => {
    try { return localStorage.getItem(CARD_QR_LINK_KEY) ?? ""; } catch { return ""; }
  });
  const [qrLinkError, setQrLinkError] = useState<string | null>(null);
  const [suggestedOpen, setSuggestedOpen] = useState(false);
  const [cardPreviewOpen, setCardPreviewOpen] = useState(false);

  const handleMessageChange = (val: string) => {
    setCardMessage(val);
    try {
      if (val.trim()) {
        localStorage.setItem(CARD_MESSAGE_KEY, val);
      } else {
        localStorage.removeItem(CARD_MESSAGE_KEY);
      }
    } catch { /* best-effort */ }
  };

  const handleCardToChange = (val: string) => {
    setCardTo(val);
    try {
      if (val.trim()) {
        localStorage.setItem(CARD_TO_KEY, val);
      } else {
        localStorage.removeItem(CARD_TO_KEY);
      }
    } catch { /* best-effort */ }
  };

  const handleCardFromChange = (val: string) => {
    setCardFrom(val);
    try {
      if (val.trim()) {
        localStorage.setItem(CARD_FROM_KEY, val);
      } else {
        localStorage.removeItem(CARD_FROM_KEY);
      }
    } catch { /* best-effort */ }
  };

  const handleQrLinkChange = (val: string) => {
    setQrLink(val);
    if (qrLinkError && isValidQrUrl(val)) setQrLinkError(null);
    try {
      if (val.trim()) {
        localStorage.setItem(CARD_QR_LINK_KEY, val);
      } else {
        localStorage.removeItem(CARD_QR_LINK_KEY);
      }
    } catch { /* best-effort */ }
  };

  const handleQrLinkBlur = () => {
    if (!isValidQrUrl(qrLink)) {
      setQrLinkError(t("cart.qrLink.error"));
    } else {
      setQrLinkError(null);
    }
  };

  // Mirror the mobile checkout login sheet: when a logged-out shopper taps
  // Proceed to Checkout we open a dismissible prompt that offers email +
  // social sign-in or a clearly visible "Checkout as Guest" button. Signed-in
  // shoppers (and the brief auth-loading window) bypass the prompt entirely.
  const [loginOpen, setLoginOpen] = useState(false);
  const handleProceed = (e: React.MouseEvent) => {
    trackWebEvent({
      type: "checkout_clicked",
      value: Math.max(0, cartTotal),
      currency: currencyCode,
      properties: {
        selectedDeliveryType,
        selected_delivery_type: selectedDeliveryType,
        standardDeliveryFree,
        expressUpgradePresent: expressRowVisible,
        promoApplied: couponApplied,
        free_standard_delivery_eligible: freeDeliveryUnlocked,
      },
    });
    // Internal cart-funnel event with the delivery-promise metadata (no PII).
    trackEvent({
      name: "checkout_clicked",
      surface: "cart",
      ...(deliveryPromise
        ? { deliveryMethod: deliveryPromise.type, deliveryPromise: deliveryPromise.summary }
        : {}),
    });
    // Frictionless checkout flag: everyone goes straight to /checkout — no
    // popup interception, no ?guest=1 (the checkout page no longer gates).
    const decision = cartCheckoutCtaDecision({
      frictionlessEnabled: isFrictionlessCheckoutEnabled(),
      isSignedIn: !!user,
      authLoading,
    });
    if (decision === "navigate") return;
    e.preventDefault();
    setLoginOpen(true);
  };
  const goToCheckout = () => setLocation("/checkout?guest=1");

  // Emit one cart_viewed event when the standalone cart page mounts.
  // This is the entry point of the purchase funnel evaluated by the
  // server-side checkoutPurchaseFunnelMonitor.
  useEffect(() => {
    trackEvent({ name: "cart_viewed", surface: "cart-screen" });
  }, []);

  // Emit order_summary_viewed once per cart visit, after the cart hydrates
  // with items (not on every pricing rerender).
  const summaryViewedRef = useRef(false);
  useEffect(() => {
    if (summaryViewedRef.current || !isHydrated || itemCount === 0) return;
    summaryViewedRef.current = true;
    trackWebEvent({
      type: "order_summary_viewed",
      currency: currencyCode,
      properties: {
        selectedDeliveryType: deliveryMode === "express" ? "express" : "standard",
        standardDeliveryFree,
        expressUpgradePresent: expressRowVisible,
        promoApplied: couponApplied,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, itemCount]);

  // ── Sticky sidebar short-viewport fallback ────────────────────────────
  // The Delivery + Order Summary unit is sticky only when it fully fits
  // below the sticky header (--header-h + 24px gap) with safe bottom
  // spacing. Otherwise stickiness is disabled and the sidebar scrolls in
  // normal flow so the checkout CTA stays reachable.
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const [sidebarFits, setSidebarFits] = useState(true);
  useEffect(() => {
    const el = sidebarRef.current;
    if (!el || typeof window === "undefined") return;
    const check = () => {
      const headerH =
        parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue("--header-h"),
        ) || 112;
      // header + 24px gap above, 24px safe spacing below
      const fits = el.offsetHeight + headerH + 24 + 24 <= window.innerHeight;
      setSidebarFits(fits);
    };
    check();
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null;
    ro?.observe(el);
    window.addEventListener("resize", check);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", check);
    };
  }, [isHydrated, itemCount]);

  const previewCardFrom = cardFrom;

  if (!isHydrated) {
    return <CartSkeleton />;
  }

  if (itemCount === 0) {
    return (
      <div className="min-h-[70vh] bg-gray-100 pt-32 pb-24 flex flex-col items-center justify-center container mx-auto px-page">
        <div className="w-24 h-24 bg-secondary/50 rounded-full flex items-center justify-center mb-8 text-primary/40">
          <ShoppingCart className="w-10 h-10" />
        </div>
        <h1 className="text-3xl font-serif mb-4">{t("cart.empty.title")}</h1>
        <p className="text-muted-foreground mb-8 max-w-md text-center">
          {t("cart.empty.desc")}
        </p>
        <Button asChild size="lg" className="rounded-full px-8">
          <Link href="/shop">{t("cart.empty.cta")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 pt-6 pb-32 lg:pb-24">
      <div className="container mx-auto px-page max-w-content">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_26.4rem] gap-x-12 gap-y-6">
          {/* Cart Items – heading + banner + items. The heading lives inside
              the grid's first row so the sidebar (col 2, row 1) top-aligns
              with it on desktop — no blank block above Delivery Summary. */}
          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
            <div className="flex items-center justify-between mb-4 gap-4">
              <h1 className="text-3xl font-serif">{t("cart.title")} ({itemCount})</h1>
            </div>
            {/* Polite live region — announces the unlocked state change once. */}
            <div aria-live="polite" aria-atomic="true" className="sr-only">
              {unlockAnnouncement}
            </div>
            <FreeDeliveryStatusCard
              state={bannerState}
              subtotalUsd={subtotal}
              thresholdUsd={thresholdUsd ?? 0}
              standardFeeUsd={cityFeeUsd}
              onShopAddons={addonsAvailable ? handleShopAddons : undefined}
              className="mb-6"
            />
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100">
            {items.map((item, index) => (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                key={item.product.id}
              >
                {/* ── Mobile card (below lg) — approved redesign ── */}
                <div className="flex gap-4 px-5 py-4 lg:hidden">
                  {/* Product image — 100 px square, rounded, no distortion */}
                  <Link href={`/product/${item.product.id}`} className="w-[100px] h-[100px] shrink-0 bg-secondary/50 rounded-xl overflow-hidden cursor-pointer transition-opacity hover:opacity-80 active:opacity-60">
                    {item.product.image?.uri && (
                      <img src={item.product.image.uri} alt={item.product.name} className="w-full h-full object-cover" />
                    )}
                  </Link>

                  {/* Right column: name, price, optional notes, quantity stepper, remove */}
                  <div className="flex flex-col flex-1 min-w-0 gap-2">
                    {/* Name + price stacked */}
                    <Link href={`/product/${item.product.id}`} className="cursor-pointer">
                      <h3 className="font-serif text-sm leading-snug line-clamp-2 hover:opacity-70 transition-opacity">{item.product.name}</h3>
                    </Link>
                    <p className="font-semibold text-sm tabular-nums text-primary">
                      <SalePrice
                        priceValue={item.product.priceValue * item.quantity}
                        discountPriceValue={item.product.discountPriceValue != null ? item.product.discountPriceValue * item.quantity : null}
                        discountPriceAed={item.product.discountPriceAed != null ? item.product.discountPriceAed * item.quantity : null}
                      />
                    </p>

                    {/* Optional personalisation inputs */}
                    {item.product.hasInputField && (
                      <div className="relative">
                        <Input
                          value={item.customNote ?? ""}
                          onChange={(e) => {
                            if (e.target.value.length <= 22) updateCustomNote(item.product.id, e.target.value);
                          }}
                          placeholder={t("cart.customNote.placeholder")}
                          maxLength={22}
                          className="h-8 text-xs pr-10"
                          aria-label={t("cart.customNote.label")}
                          data-testid={`input-cart-note-mobile-${item.product.id}`}
                        />
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums">
                          {(item.customNote ?? "").length}/22
                        </span>
                      </div>
                    )}
                    {item.product.hasLetterField && (
                      <div className="relative w-16">
                        <Input
                          value={item.customNote ?? ""}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 1).toUpperCase();
                            updateCustomNote(item.product.id, v);
                          }}
                          placeholder={t("cart.letterNote.placeholder")}
                          maxLength={1}
                          className="h-8 text-xs text-center uppercase tracking-widest"
                          aria-label={t("cart.letterNote.label")}
                          data-testid={`input-cart-letter-mobile-${item.product.id}`}
                        />
                      </div>
                    )}

                    {/* Quantity label + stepper */}
                    <div className="flex flex-col gap-1 mt-1">
                      <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{t("cart.quantityLabel")}</span>
                      <div className="flex items-center border rounded-full overflow-hidden bg-background w-fit">
                        <button
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                          className="w-11 h-11 flex items-center justify-center hover:bg-secondary transition-colors"
                          aria-label={t("cart.decreaseAria")}
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-8 text-center text-sm font-medium tabular-nums">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                          className="w-11 h-11 flex items-center justify-center hover:bg-secondary transition-colors"
                          aria-label={t("cart.increaseAria")}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Remove button — icon + label */}
                    <button
                      onClick={() => removeItem(item.product.id)}
                      className="flex items-center gap-1.5 mt-0.5 w-fit text-muted-foreground hover:text-destructive transition-colors"
                      aria-label={t("cart.removeAria")}
                    >
                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-xs font-medium">{t("cart.remove")}</span>
                    </button>
                  </div>
                </div>

                {/* ── Desktop card (lg+) — original layout, unchanged ── */}
                <div className="hidden lg:flex items-center gap-3 px-5 py-3">
                  {/* Thumbnail — 72 px square, slightly rounded */}
                  <Link href={`/product/${item.product.id}`} className="w-[72px] h-[72px] bg-secondary/50 rounded-xl overflow-hidden shrink-0 cursor-pointer transition-opacity hover:opacity-80 active:opacity-60">
                    {item.product.image?.uri && (
                      <img src={item.product.image.uri} alt={item.product.name} className="w-full h-full object-cover" />
                    )}
                  </Link>

                  {/* Name + compact stepper */}
                  <div className="flex flex-col flex-1 min-w-0 gap-2">
                    <Link href={`/product/${item.product.id}`} className="cursor-pointer">
                      <h3 className="font-serif text-xs leading-snug line-clamp-2 hover:opacity-70 transition-opacity">{item.product.name}</h3>
                    </Link>
                    {item.product.hasInputField && (
                      <div className="relative">
                        <Input
                          value={item.customNote ?? ""}
                          onChange={(e) => {
                            if (e.target.value.length <= 22) updateCustomNote(item.product.id, e.target.value);
                          }}
                          placeholder={t("cart.customNote.placeholder")}
                          maxLength={22}
                          className="h-8 text-xs pr-10"
                          aria-label={t("cart.customNote.label")}
                          data-testid={`input-cart-note-${item.product.id}`}
                        />
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums">
                          {(item.customNote ?? "").length}/22
                        </span>
                      </div>
                    )}
                    {item.product.hasLetterField && (
                      <div className="relative w-16">
                        <Input
                          value={item.customNote ?? ""}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 1).toUpperCase();
                            updateCustomNote(item.product.id, v);
                          }}
                          placeholder={t("cart.letterNote.placeholder")}
                          maxLength={1}
                          className="h-8 text-xs text-center uppercase tracking-widest"
                          aria-label={t("cart.letterNote.label")}
                          data-testid={`input-cart-letter-${item.product.id}`}
                        />
                      </div>
                    )}
                    <div className="flex items-center border rounded-full overflow-hidden bg-background w-fit">
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                        className="px-2.5 py-1 hover:bg-secondary transition-colors"
                        aria-label={t("cart.decreaseAria")}
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-8 text-center text-xs font-medium">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                        className="px-2.5 py-1 hover:bg-secondary transition-colors"
                        aria-label={t("cart.increaseAria")}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Price (top) + remove button (bottom) */}
                  <div className="flex flex-col items-end justify-between self-stretch shrink-0 py-0.5">
                    <p className="font-medium text-xs tabular-nums">
                      <SalePrice
                        priceValue={item.product.priceValue * item.quantity}
                        discountPriceValue={item.product.discountPriceValue != null ? item.product.discountPriceValue * item.quantity : null}
                        discountPriceAed={item.product.discountPriceAed != null ? item.product.discountPriceAed * item.quantity : null}
                      />
                    </p>
                    <button
                      onClick={() => removeItem(item.product.id)}
                      // contrast-ok: icon button (non-text); /70 → 3.08:1 passes WCAG 1.4.11 non-text contrast ≥3:1
                      className="text-muted-foreground/70 hover:text-destructive transition-colors p-0.5"
                      aria-label={t("cart.removeAria")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
            </div>

          </div>

          {/* Delivery Summary + Order Summary sidebar (stacks below items on mobile).
              Desktop: one sticky unit pinned 24px below the sticky site header
              (var(--header-h), shared with MainNavbar). The tinted wrapper is
              dropped on lg so the first card top-aligns with the "Cart (n)"
              heading. Stickiness is disabled when the unit doesn't fit in the
              viewport (short-viewport fallback) so everything stays reachable
              by normal page scrolling. */}
          <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2">
            <div
              ref={sidebarRef}
              className={sidebarFits ? "lg:sticky lg:top-[calc(var(--header-h)+1.5rem)]" : undefined}
            >
              {/* aria-live region: announces applied/error to assistive technology */}
              <div aria-live="polite" aria-atomic="true" className="sr-only">
                {couponApplied
                  ? t("cart.promoCodeAppliedAnnouncement").replace("{code}", couponInput)
                  : couponError ?? ""}
              </div>

              {/* Delivery Summary — moved up into the space the promo pill occupied */}
              <div className="bg-white rounded-2xl p-6 border border-primary/10 shadow-sm mb-4">
                <h2 className="text-2xl font-serif mb-4">{t("cart.deliverySummary")}</h2>
                <div className="text-sm">
                  <DeliveryDateRow midnightFeeUsd={isMidnightSlotActive ? slotFeeUsd : null} />
                  {expressUpgradeVisible && (
                    <ExpressUpgradeCard
                      arrival={expressArrivalPreview}
                      deltaUsd={expressDeltaUsd}
                      onUpgrade={handleExpressUpgrade}
                      upgrading={upgrading}
                    />
                  )}
                  {quietPromptVisible && expressArrivalPreview && (
                    <ExpressQuietPrompt
                      arrivesByLine={t("cart.expressPrompt.arrivesBy").replace(
                        "{arrival}",
                        expressArrivalPreview,
                      )}
                      deltaUsd={expressDeltaUsd}
                      onSeeOption={handlePromptSeeOption}
                      onDismiss={handlePromptDismiss}
                    />
                  )}
                  <DeliverEarlierDialog
                    open={earlierDialogOpen}
                    onOpenChange={(o) => { if (!o) setEarlierDialogOpen(false); }}
                    originalLine={deliveryPromise?.arrival ?? ""}
                    newLine={expressArrivalPreview ?? ""}
                    totalChangeUsd={expressDeltaUsd}
                    onConfirm={handleEarlierConfirm}
                    onCancel={handleEarlierCancel}
                    confirming={upgrading}
                  />
                
                </div>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-primary/10 shadow-sm">
                <h2 className="text-2xl font-serif mb-4">{t("cart.orderSummary")}</h2>

                {/* Financial rows — label (+ optional supporting copy) left, amount right */}
                <dl className="space-y-4 text-sm mb-4">
                  {/* Items */}
                  <div className="flex justify-between gap-3">
                    <dt className="font-medium">
                      {itemCount === 1 ? t("cart.items_one") : t("cart.items_other", { n: itemCount })}
                    </dt>
                    <dd className="font-medium text-end shrink-0" data-testid="text-items-amount">
                      <FormattedPrice usdValue={subtotal} />
                    </dd>
                  </div>

                  {/* Delivery — exactly one row for the currently selected method */}
                  {deliveryMode === "express" ? (
                    <div className="flex justify-between gap-3" data-testid="row-express-delivery">
                      <dt className="min-w-0">
                        <span className="block font-medium">{t("delivery.promise.expressTitle")}</span>
                        <span className="block text-xs text-muted-foreground mt-0.5" data-testid="text-express-delivery-eta">
                          {expressArrivalPreview ?? t("delivery.promise.within90")}
                        </span>
                      </dt>
                      <dd className="font-medium text-end shrink-0">
                        {effectiveDeliveryFeeUsd === null
                          ? <span className="text-muted-foreground text-xs font-normal">{t("cart.deliveryTbd")}</span>
                          : <FormattedPrice usdValue={effectiveDeliveryFeeUsd} />}
                      </dd>
                    </div>
                  ) : (
                    <div className="flex justify-between gap-3" data-testid="row-standard-delivery">
                      <dt className="min-w-0">
                        <span className="block font-medium">{t("cart.standardDelivery")}</span>
                        {deliveryFeeUsd === null ? null : standardDeliveryFree ? (
                          <span className="block text-xs text-muted-foreground mt-0.5" data-testid="text-free-delivery-saved">
                            {t("cart.freeDeliveryApplied")}
                          </span>
                        ) : (
                          <span className="block text-xs text-muted-foreground mt-0.5">{t("cart.baseDeliveryCharge")}</span>
                        )}
                      </dt>
                      <dd className="font-medium text-end shrink-0">
                        {deliveryFeeUsd === null
                          ? <span className="text-muted-foreground text-xs font-normal">{t("cart.deliveryTbd")}</span>
                          : standardDeliveryFree
                            ? <span className="font-semibold" style={{ color: "hsl(var(--primary))" }}>{t("cart.deliveryFree")}</span>
                            : <FormattedPrice usdValue={deliveryFeeUsd} />
                        }
                      </dd>
                    </div>
                  )}

                  {/* Late-night slot fee / Midnight delivery */}
                  {slotFeeUsd > 0 && (
                    <div className="flex justify-between gap-3">
                      <dt className="font-medium">{isMidnightSlotActive ? t("product.midnightDelivery") : t("cart.lateNightFee")}</dt>
                      <dd className="font-medium text-end shrink-0"><FormattedPrice usdValue={slotFeeUsd} /></dd>
                    </div>
                  )}

                  {/* Promo discount */}
                  {couponApplied && couponDiscountUsd > 0 && (
                    <div className="flex justify-between gap-3" style={{ color: "hsl(var(--primary))" }} data-testid="row-cart-coupon-discount">
                      <dt className="flex items-center gap-1.5 font-medium min-w-0">
                        <Tag className="w-3.5 h-3.5 shrink-0" aria-hidden />
                        <span className="truncate">{t("cart.promoLabel")} · {couponInput}</span>
                      </dt>
                      <dd className="font-medium text-end shrink-0">−<FormattedPrice usdValue={couponDiscountUsd} /></dd>
                    </div>
                  )}
                </dl>

                {/* Promo code — collapsible row above the total divider */}
                <div className="mb-4 pb-4 border-b border-primary/10">
                  {couponApplied ? (
                    /* ── Applied state ── */
                    <div className="w-full flex items-center justify-between gap-3 rounded-xl border border-primary/15 bg-white px-4 py-3 text-sm">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Tag className="w-4 h-4 text-primary/60 shrink-0" />
                        <span className="font-medium text-primary truncate">{couponInput}</span>
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 shrink-0">
                          <Check className="w-3 h-3" />
                          {t("cart.promoCodeApplied")}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCouponRemove}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors shrink-0 min-h-[44px]"
                        data-testid="button-promo-remove"
                      >
                        {t("cart.promoCodeRemove")}
                      </button>
                    </div>
                  ) : couponOpen ? (
                    /* ── Expanded state ── */
                    <div className="rounded-xl border border-primary/15 bg-white overflow-hidden">
                      <button
                        type="button"
                        onClick={handleCouponToggle}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 min-h-[44px] text-sm transition-colors hover:bg-secondary/40"
                        data-testid="button-promo-toggle"
                        aria-expanded="true"
                        aria-controls="promo-panel"
                      >
                        <div className="flex items-center gap-2.5">
                          <Tag className="w-4 h-4 text-primary/60 shrink-0" />
                          <span className="text-muted-foreground">{t("cart.promoCodeHeader")}</span>
                        </div>
                        <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                      </button>
                      <div id="promo-panel" className="px-3 pb-3">
                        <div className="flex gap-2">
                          <Input
                            value={couponInput}
                            onChange={(e) => {
                              setCouponInput(e.target.value);
                              if (couponError) setCouponError(null);
                            }}
                            onKeyDown={(e) => { if (e.key === "Enter") handleCouponApply(); }}
                            placeholder={t("cart.promoCodePlaceholder")}
                            className={`rounded-xl text-sm${couponError ? " border-destructive focus-visible:ring-destructive" : ""}`}
                            data-testid="input-promo-code"
                            aria-label={t("cart.promoCodeInputLabel")}
                            aria-describedby={couponError ? "promo-error" : undefined}
                          />
                          <Button
                            type="button"
                            onClick={handleCouponApply}
                            disabled={!couponInput.trim() || couponValidating}
                            className="shrink-0 rounded-xl px-5"
                            data-testid="button-promo-apply"
                          >
                            {couponValidating ? t("cart.promoCodeValidating") : t("cart.promoCodeApply")}
                          </Button>
                        </div>
                        {couponError && (
                          <p id="promo-error" className="mt-1.5 text-xs text-destructive" data-testid="text-promo-error">
                            {couponError}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* ── Default (collapsed) state ── */
                    <button
                      type="button"
                      onClick={handleCouponToggle}
                      className="w-full flex items-center justify-between gap-3 rounded-xl border border-primary/15 bg-white px-4 py-3 min-h-[44px] text-sm transition-colors hover:bg-secondary/40"
                      data-testid="button-promo-toggle"
                      aria-expanded="false"
                      aria-controls="promo-panel"
                    >
                      <div className="flex items-center gap-2.5">
                        <Tag className="w-4 h-4 text-primary/60 shrink-0" />
                        <span className="text-muted-foreground">{t("cart.promoCode")}</span>
                      </div>
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    </button>
                  )}
                </div>

                {/* Total */}
                <div className="flex justify-between items-center mb-6">
                  <span className="font-medium">{t("cart.total")}</span>
                  <span className="text-2xl font-serif" data-testid="text-cart-total"><FormattedPrice usdValue={Math.max(0, cartTotal)} /></span>
                </div>

                <Button asChild size="lg" className="hidden lg:flex w-full h-14 text-base rounded-xl px-5">
                  <Link
                    href="/checkout"
                    onClick={handleProceed}
                    data-testid="link-proceed-to-checkout"
                    className="flex items-center justify-center gap-2"
                  >
                    <Lock className="w-4 h-4 shrink-0" aria-hidden />
                    <span>{t("cart.checkoutSecurely")}</span>
                    <span aria-hidden>·</span>
                    <FormattedPrice usdValue={Math.max(0, cartTotal)} className="font-semibold shrink-0 text-white" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          {/* Cart Items – card message + upsells */}
          <div className="min-w-0 lg:col-start-1 lg:row-start-2">
            {/* Card Message Panel */}
            <div className="pb-6">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
                <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-5">
                  {t("checkout.cardMessageSection")}
                </p>

                {/* To */}
                <div className="mb-4">
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    {t("checkout.previewCardTo")}
                  </label>
                  <Input
                    value={cardTo}
                    onChange={(e) => handleCardToChange(e.target.value)}
                    placeholder={t("checkout.recipientNamePh")}
                    data-testid="input-cart-card-to"
                  />
                </div>

                {/* Message with character count */}
                <div className="mb-4">
                  <div className={`flex items-center justify-between mb-2 ${dir === "rtl" ? "flex-row-reverse" : ""}`}>
                    <label className="text-sm font-medium text-gray-700">
                      {t("checkout.cardMessage")}
                    </label>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {cardMessage.length}/400
                    </span>
                  </div>
                  <textarea
                    value={cardMessage}
                    onChange={(e) => handleMessageChange(e.target.value)}
                    placeholder={t("cart.cardMessage.placeholder")}
                    maxLength={400}
                    rows={4}
                    className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors"
                    data-testid="input-cart-card-message"
                  />
                  <button
                    type="button"
                    onClick={() => setSuggestedOpen(true)}
                    className="mt-2 text-xs text-primary underline underline-offset-2 hover:opacity-75 transition-opacity"
                    data-testid="button-cart-message-suggestions"
                  >
                    {t("checkout.notSureWhatToSay")}
                  </button>
                </div>

                {/* From */}
                <div className="mb-5">
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    {t("checkout.previewCardFrom")}
                  </label>
                  <Input
                    value={cardFrom}
                    onChange={(e) => handleCardFromChange(e.target.value)}
                    data-testid="input-cart-card-from"
                  />
                </div>

                {/* QR Link */}
                <div className="mb-5">
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    {t("cart.qrLink.label")}
                  </label>
                  <Input
                    type="url"
                    value={qrLink}
                    onChange={(e) => handleQrLinkChange(e.target.value)}
                    onBlur={handleQrLinkBlur}
                    placeholder={t("cart.qrLink.placeholder")}
                    className={qrLinkError ? "border-destructive focus-visible:ring-destructive" : ""}
                    data-testid="input-cart-qr-link"
                  />
                  {qrLinkError && (
                    <p className="mt-1.5 text-xs text-destructive" data-testid="error-cart-qr-link">
                      {qrLinkError}
                    </p>
                  )}
                  {qrLink.trim() && isValidQrUrl(qrLink) && (
                    <div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-secondary/20 px-3 py-3">
                      <QRCodeSVG value={qrLink.trim()} size={60} />
                      <p className="text-xs text-muted-foreground leading-snug">
                        {t("checkout.qrPrintedOnCard")}
                      </p>
                    </div>
                  )}
                </div>

                {/* Preview Card */}
                <button
                  type="button"
                  onClick={() => setCardPreviewOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors hover:opacity-90"
                  style={{ borderColor: "hsl(var(--primary) / 0.35)", color: "hsl(var(--primary))", backgroundColor: "hsl(var(--primary) / 0.05)" }}
                  data-testid="button-preview-card"
                >
                  <Eye className="h-4 w-4" />
                  {t("checkout.previewCard")}
                </button>
              </div>

              <CartUpsells onAvailabilityChange={setAddonsAvailable} />
            </div>
          </div>
        </div>
      </div>

      {/* Sticky bottom bar – visible on mobile only; desktop uses the sidebar button */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 bg-white shadow-[0_-3px_12px_rgba(0,0,0,0.08)] rounded-t-2xl px-5 pt-3 pb-3 flex flex-col gap-2.5 lg:hidden"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        {/* Summary row */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-primary truncate flex-1">
            <span className="font-semibold">
              {itemCount} {itemCount === 1 ? t("cart.sticky.itemSingular") : t("cart.sticky.itemPlural")}
            </span>
            {deliveryMode && (
              <span className="text-muted-foreground" data-testid="text-sticky-delivery-label">
                {"  ·  "}
                {deliveryMode === "express"
                  ? t("cart.sticky.expressToday")
                  : isMidnightSlotActive
                  ? (deliveryDate ?? todayIsoLocal) === todayIsoLocal
                    ? t("cart.sticky.midnightTonight")
                    : t("cart.sticky.midnightOn").replace(
                        "{date}",
                        formatPromiseDateLabel(
                          deliveryDate ?? todayIsoLocal,
                          todayIsoLocal,
                          t("delivery.promise.today"),
                          t("delivery.promise.tomorrow"),
                          language,
                        ),
                      )
                  : deliveryMode === "today_slot"
                  ? t("cart.sticky.standardToday")
                  : null}
              </span>
            )}
          </p>
          <div className="flex flex-col items-end gap-0.5 shrink-0">
            <span className="text-[11px] text-muted-foreground leading-none">{t("cart.total")}</span>
            <FormattedPrice usdValue={Math.max(0, cartTotal)} className="text-[17px] font-serif font-medium text-primary leading-none" />
          </div>
        </div>
        {/* CTA button */}
        <Button asChild size="lg" className="w-full h-[52px] text-sm rounded-2xl px-5">
          <Link
            href="/checkout"
            onClick={handleProceed}
            data-testid="link-proceed-to-checkout-sticky"
            className="flex items-center justify-center gap-2"
          >
            <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden />
            <span>{t("cart.checkoutSecurely")}</span>
            <span aria-hidden>·</span>
            <FormattedPrice usdValue={Math.max(0, cartTotal)} className="font-semibold shrink-0 text-white" />
          </Link>
        </Button>
      </div>

      <SuggestedMessagesDialog
        open={suggestedOpen}
        onOpenChange={setSuggestedOpen}
        onSelect={(msg) => {
          handleMessageChange(msg);
          setSuggestedOpen(false);
        }}
        maxLength={400}
      />

      <CardPreviewDialog
        open={cardPreviewOpen}
        onOpenChange={setCardPreviewOpen}
        cardTo={cardTo}
        cardMessage={cardMessage}
        cardFrom={previewCardFrom}
        qrLink={isValidQrUrl(qrLink) ? qrLink.trim() : ""}
        dir={dir}
        t={t}
      />

      <CheckoutLoginDialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onContinueAsGuest={goToCheckout}
        surface="cart"
      />
    </div>
  );
}

function CardPreviewDialog({
  open,
  onOpenChange,
  cardTo,
  cardMessage,
  cardFrom,
  qrLink,
  dir,
  t,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cardTo: string;
  cardMessage: string;
  cardFrom: string;
  qrLink: string;
  dir: "ltr" | "rtl";
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const trimmed = (cardMessage ?? "").trim();
  const len = trimmed.length;
  const messageFontPx = len === 0 ? 18 : len > 280 ? 14 : len > 180 ? 16 : len > 100 ? 18 : 20;
  const ink = "#00414e";
  const cardRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const canSave = trimmed.length > 0;

  const handleSave = async () => {
    if (!exportRef.current || saving || !canSave) return;
    setSaving(true);
    try {
      const { toPng } = await import("html-to-image");
      const exportRect = exportRef.current.getBoundingClientRect();
      const targetW = 1080;
      const pixelRatio = Math.max(1, targetW / Math.max(1, exportRect.width));
      const dataUrl = await toPng(exportRef.current, {
        cacheBust: true,
        pixelRatio,
        backgroundColor: "#0d3b3a",
      });
      const link = document.createElement("a");
      link.download = "presentail-card.png";
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      toast({
        title: t("checkout.previewCardSaveError"),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const cardLogo = dir === "rtl" ? cardLogoAr : cardLogoEn;

  const renderCardBody = (includeWatermark: boolean) => (
    <>
      <img
        src={cardStationery}
        alt="" // image-alt-ok: decorative stationery background, purely presentational
        width={1536}
        height={1024}
        className="absolute inset-0 h-full w-full"
        style={{ objectFit: "fill" }}
        loading="lazy"
      />
      {/* Crisp logo overlay — replaces the pixelated logo baked into the stationery image */}
      <div
        aria-hidden
        className="pointer-events-none absolute flex items-center justify-center"
        style={{ top: 0, left: 0, right: 0, height: "25%" }}
      >
        <img
          src={cardLogo}
          alt="" // image-alt-ok: decorative logo watermark inside aria-hidden wrapper
          width={dir === "rtl" ? 3250 : 4167}
          height={dir === "rtl" ? 792 : 2383}
          style={{ height: "38%", width: "auto", objectFit: "contain" }}
          draggable={false}
          loading="lazy"
        />
      </div>
      {/* Content positioned within the stationery's writable area:
          top 25% clears the decorative Presentail header,
          bottom 18% clears the decorative rule at the foot of the card. */}
      <div
        className="absolute text-center"
        style={{
          top: "25%",
          bottom: "18%",
          left: "26px",
          right: "26px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div style={{ color: ink, opacity: cardTo ? 1 : 0.55, lineHeight: 1.3 }}>
          {cardTo ? (
            <span
              style={{
                fontFamily: "'Roboto', sans-serif",
                fontWeight: 400,
                fontSize: "18px",
              }}
            >
              {cardTo}
            </span>
          ) : null}
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "14px 4px" }}>
          <p
            style={{
              fontFamily: "'Roboto', sans-serif",
              fontStyle: "italic",
              color: ink,
              fontSize: `${messageFontPx}px`,
              lineHeight: 1.5,
              opacity: trimmed.length > 0 ? 1 : 0.55,
              whiteSpace: "pre-wrap",
              overflowWrap: "break-word",
              margin: 0,
            }}
          >
            {trimmed.length > 0 ? trimmed : t("checkout.previewCardPlaceholder")}
          </p>
        </div>
        <div style={{ color: ink, opacity: cardFrom ? 1 : 0.55, lineHeight: 1.3 }}>
          {cardFrom ? (
            <span
              style={{
                fontFamily: "'Roboto', sans-serif",
                fontWeight: 400,
                fontSize: "18px",
              }}
            >
              {cardFrom}
            </span>
          ) : null}
        </div>
      </div>
      {qrLink ? (
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            bottom: "8px",
            ...(dir === "rtl" ? { left: "12px" } : { right: "12px" }),
          }}
        >
          <QRCodeSVG value={qrLink} size={56} bgColor="transparent" fgColor="#00414e" />
        </div>
      ) : null}
      {includeWatermark ? (
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            bottom: "8px",
            ...(dir === "rtl" ? { right: "12px" } : { left: "12px" }),
            fontFamily: "'Roboto', sans-serif",
            fontWeight: 500,
            fontSize: "11px",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#c9a961",
            opacity: 0.6,
          }}
        >
          presentail.com
        </div>
      ) : null}
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md border-0 bg-transparent p-0 shadow-none sm:max-w-md"
        dir={dir}
      >
        <DialogTitle className="sr-only">{t("checkout.previewCardTitle")}</DialogTitle>
        <div className="flex flex-col items-center gap-4">
          <div
            ref={cardRef}
            className="relative w-full overflow-hidden rounded-2xl shadow-2xl"
            style={{ aspectRatio: "4 / 3", backgroundColor: "#0d3b3a" }}
            data-testid="card-preview-stationery"
          >
            {renderCardBody(false)}
          </div>
          <div
            aria-hidden
            ref={exportRef}
            className="pointer-events-none relative overflow-hidden rounded-2xl"
            style={{
              position: "fixed",
              left: "-10000px",
              top: 0,
              width: "540px",
              aspectRatio: "4 / 3",
              backgroundColor: "#0d3b3a",
            }}
            dir={dir}
          >
            {renderCardBody(true)}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              onClick={handleSave}
              disabled={!canSave || saving}
              data-testid="button-preview-card-save"
            >
              {saving ? t("checkout.previewCardSaving") : t("checkout.previewCardSave")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => onOpenChange(false)}
              data-testid="button-preview-card-close"
            >
              {t("checkout.previewCardClose")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
