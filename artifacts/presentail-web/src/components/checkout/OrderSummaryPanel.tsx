import { useEffect, useRef, type RefObject } from "react";
import { trackWebEvent } from "@/lib/analytics";
import { Link } from "wouter";
import {
  ChevronDown,
  ChevronRight,
  Tag,
  Loader2,
  CalendarDays,
  Zap,
  ArrowRight,
  Lock,
  X,
  Star,
  AlertTriangle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { FormattedPrice } from "@/components/FormattedPrice";
import { SalePrice } from "@/components/SalePrice";
import { FreeDeliveryBanner } from "@/components/cart/FreeDeliveryBanner";
import { useLocale } from "@/contexts/LocaleContext";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import { computeCartTotal } from "@workspace/display-currency";
import type { CartItem } from "@/contexts/CartContext";

export type OrderSummaryPanelProps = {
  items: CartItem[];
  subtotal: number;
  districtFee: number;
  expressFee: number;
  slotFee: number;
  isMidnightSlotActive?: boolean;
  confirmedCouponDiscount: number;
  isFreeDeliveryUnlocked: boolean;
  originalCityFee: number;
  effectiveFreeDeliveryEnabled: boolean | undefined;
  effectiveFreeDeliveryThresholdUsd: number | undefined;
  deliveryMode: "express" | "schedule";
  deliveryRowText: string | null;
  /** Desktop sidebar delivery-promise panel payload (express quote-anchored
   *  "Arrives by" time, or the standard "Arrives [day · window]" text). */
  deliveryPromise?:
    | { type: "express"; arrivesBy: string | null }
    | { type: "standard"; when: string | null; arrival?: string | null }
    | null;
  selectedDistrict: string;
  couponApplied: boolean;
  couponOpen: boolean;
  couponInput: string;
  setCouponInput: (v: string) => void;
  couponError: string | null;
  setCouponError: (v: string | null) => void;
  couponValidating: boolean;
  couponInputRef: RefObject<HTMLInputElement | null>;
  handleCouponToggle: () => void;
  handleCouponApply: () => void;
  handleCouponRemove: () => void;
  loyaltyCoupon?: { code: string; points: number; discountPercent: number } | null;
  loyaltyLoading?: boolean;
  loyaltyToggleOn?: boolean;
  onLoyaltyToggle?: (active: boolean) => void;
  onChangeDelivery: () => void;
  step: number;
  /** Step-1 "Continue to Payment" click handler. The CTA is ALWAYS clickable
      (no disabled gate): the handler itself validates, renders the guided
      inline errors, and scrolls/focuses the first invalid field on failure. */
  onContinueToPayment: () => void;
  summaryOpen: boolean;
  setSummaryOpen: (v: boolean) => void;
  /** Optional wrapper used by the mobile header toggle so the page can fire
      analytics alongside the state change. Falls back to setSummaryOpen. */
  onSummaryOpenChange?: (v: boolean) => void;
  /** District-change revalidation: when set, the neutral DELIVERY panel is
      replaced by the amber "Delivery selection required" card (or its
      loading/error variants) until a valid selection exists again. */
  deliveryRequired?: {
    status: "invalid" | "pending" | "error";
    /** Localized display name of the newly selected district. */
    districtLabel: string;
    /** Opens the delivery picker (filtered to the new district). */
    onChoose: () => void;
    /** Retries the delivery-locations fetch after a failure. */
    onRetry: () => void;
  } | null;
  /** True while the delivery selection is invalid or revalidating: the CTA
      stays clickable (click focuses the notice via onContinueToPayment) but
      renders visually muted with aria-disabled. */
  ctaBlocked?: boolean;
  /** Cyprus policy acceptance state. When isCyprus is true, a checkbox is
      shown above the CTA and the CTA is blocked until accepted. */
  isCyprus?: boolean;
  policyAccepted?: boolean;
  onPolicyAcceptedChange?: (accepted: boolean) => void;
};

export function OrderSummaryPanel({
  items,
  subtotal,
  districtFee,
  expressFee,
  slotFee,
  isMidnightSlotActive,
  confirmedCouponDiscount,
  isFreeDeliveryUnlocked,
  originalCityFee,
  effectiveFreeDeliveryEnabled,
  effectiveFreeDeliveryThresholdUsd,
  deliveryMode,
  deliveryRowText,
  deliveryPromise = null,
  selectedDistrict,
  couponApplied,
  couponOpen,
  couponInput,
  setCouponInput,
  couponError,
  setCouponError,
  couponValidating,
  couponInputRef,
  handleCouponToggle,
  handleCouponApply,
  handleCouponRemove,
  loyaltyCoupon,
  loyaltyLoading = false,
  loyaltyToggleOn = false,
  onLoyaltyToggle,
  onChangeDelivery,
  step,
  onContinueToPayment,
  summaryOpen,
  setSummaryOpen,
  onSummaryOpenChange,
  deliveryRequired = null,
  ctaBlocked = false,
  isCyprus = false,
  policyAccepted = false,
  onPolicyAcceptedChange,
}: OrderSummaryPanelProps) {
  const { t, dir } = useLocale();
  useDisplayCurrency();

  const grandTotal = computeCartTotal(
    subtotal,
    districtFee + expressFee + slotFee,
    confirmedCouponDiscount,
  );

  const itemCountLabel =
    items.length === 1
      ? t("checkout.summary.itemCount_one")
      : t("checkout.summary.itemCount_other", { n: String(items.length) });

  // Total units across all lines — drives the "Items (N)" summary row.
  const itemsQuantityCount = items.reduce((n, i) => n + i.quantity, 0);

  // Rerender-safe "delivery confirmation viewed" analytics: fires once per
  // delivery type change, and only when the desktop sidebar is actually
  // visible (the desktop body is display-hidden below lg).
  const lastConfirmationViewedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!deliveryPromise) return;
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    if (lastConfirmationViewedRef.current === deliveryPromise.type) return;
    lastConfirmationViewedRef.current = deliveryPromise.type;
    trackWebEvent({
      type: "desktop_checkout_delivery_confirmation_viewed",
      properties: { deliveryType: deliveryPromise.type },
    });
  }, [deliveryPromise]);

  return (
    <div className="w-full lg:w-[42%] xl:w-[44%] lg:max-w-[500px] shrink-0 order-first lg:order-last self-stretch">
      {/* Desktop (lg+) sticky offset is 24px (top-6) because the checkout
          header scrolls away with the page. If that header ever becomes
          sticky on desktop, this must become header height + 24px. */}
      <div className="sticky top-24 lg:top-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col">

          {/* ══════════════════════════════════════════════════
              MOBILE HEADER — collapsed summary row
              "Order summary · [count]"  |  bold total + chevron
              ══════════════════════════════════════════════════ */}
          <button
            type="button"
            className={`lg:hidden w-full min-h-[52px] px-4 py-3.5 flex items-center justify-between gap-3 shrink-0 ${summaryOpen ? "rounded-t-2xl border-b border-gray-100" : "rounded-2xl"}`}
            style={{ backgroundColor: "hsl(var(--primary) / 0.05)" }}
            onClick={() => (onSummaryOpenChange ?? setSummaryOpen)(!summaryOpen)}
            aria-expanded={summaryOpen}
            data-testid="button-summary-toggle"
          >
            <span className="min-w-0 flex items-baseline gap-1.5 text-start">
              <span className="text-sm font-semibold text-foreground truncate">
                {t("checkout.summary")}
              </span>
              <span className="text-sm text-muted-foreground shrink-0">
                · {itemCountLabel}
              </span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              <span
                className="text-base font-bold"
                style={{ color: "hsl(var(--primary))" }}
                role="status"
                aria-live="polite"
                data-testid="text-summary-collapsed-total"
              >
                <FormattedPrice usdValue={grandTotal} />
              </span>
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${summaryOpen ? "rotate-180" : ""}`}
                style={{ color: "hsl(var(--primary))" }}
                aria-hidden
              />
            </span>
          </button>

          {/* ══════════════════════════════════════════════════
              DESKTOP HEADER (new redesign)
              ══════════════════════════════════════════════════ */}
          <div className="hidden lg:flex shrink-0 items-start justify-between gap-2 px-6 pt-5 pb-4 border-b border-gray-100">
            <div className="min-w-0">
              <h3
                className="font-serif text-lg leading-tight"
                style={{ color: "hsl(var(--primary))" }}
              >
                {t("checkout.summary")}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">{itemCountLabel}</p>
            </div>
            <Link
              href="/cart"
              className="shrink-0 text-xs font-medium underline underline-offset-2 hover:opacity-70 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded-sm"
              style={{ color: "hsl(var(--primary))" }}
              aria-label={t("checkout.editCart")}
            >
              {t("checkout.editCart")}
            </Link>
          </div>

          {/* ══════════════════════════════════════════════════
              MOBILE BODY (original layout — visually unchanged)
              ══════════════════════════════════════════════════ */}
          <div className={`lg:hidden ${summaryOpen ? "block" : "hidden"}`}>
            <div className="px-6 py-5">

              {/* Items — original layout */}
              <div className="space-y-4 mb-5">
                {items.map((item) => (
                  <div key={item.product.id} className="flex gap-3" data-testid={`row-summary-${item.product.id}`}>
                    <div className="w-14 h-14 bg-gray-100 rounded-lg overflow-hidden shrink-0">
                      {item.product.image?.uri && (
                        <img
                          src={item.product.image.uri}
                          alt={item.product.name}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium line-clamp-2 leading-snug">{item.product.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t("checkout.qty")}: {item.quantity}</p>
                      <p
                        className="text-sm font-semibold mt-0.5"
                        style={{ color: "hsl(var(--primary))" }}
                        data-testid={`checkout-item-price-${item.product.id}`}
                      >
                        <SalePrice
                          priceValue={item.product.priceValue * item.quantity}
                          discountPriceValue={item.product.discountPriceValue != null ? item.product.discountPriceValue * item.quantity : null}
                          discountPriceAed={item.product.discountPriceAed != null ? item.product.discountPriceAed * item.quantity : null}
                        />
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Coupon — original text-link style */}
              <div className="border-t border-gray-100 pt-4 mb-4">
                {/* Loyalty points toggle — visible only when the user has an active loyalty coupon */}
                {loyaltyLoading ? (
                  <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-100 animate-pulse" aria-hidden>
                    <div className="w-3.5 h-3.5 rounded-full bg-gray-200 shrink-0" />
                    <div className="flex-1 h-4 bg-gray-200 rounded" />
                    <div className="w-8 h-5 bg-gray-200 rounded-full" />
                  </div>
                ) : loyaltyCoupon ? (
                  <div
                    className={`flex items-center gap-2 mb-3 pb-3 border-b animate-in fade-in duration-300 ${loyaltyToggleOn ? "border-green-100" : "border-gray-100"}`}
                  >
                    <Star
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: loyaltyToggleOn ? "#16a34a" : "hsl(var(--primary))" }}
                      aria-hidden
                    />
                    <div className="flex-1 min-w-0">
                      <span
                        className="text-sm font-medium"
                        style={{ color: loyaltyToggleOn ? "#16a34a" : "hsl(var(--foreground))" }}
                      >
                        {t("checkout.loyalty.usePoints").replace("{n}", String(loyaltyCoupon.points))}
                      </span>
                      {loyaltyToggleOn && confirmedCouponDiscount > 0 ? (
                        <span
                          className="ms-1.5 text-sm font-medium"
                          style={{ color: "#16a34a" }}
                          data-testid="loyalty-inline-discount"
                        >
                          ·&nbsp;−<FormattedPrice usdValue={confirmedCouponDiscount} />
                        </span>
                      ) : (
                        <span className="ms-1.5 text-xs text-muted-foreground">
                          · {t("checkout.loyalty.off").replace("{n}", String(loyaltyCoupon.discountPercent))}
                        </span>
                      )}
                    </div>
                    <Switch
                      checked={loyaltyToggleOn}
                      onCheckedChange={onLoyaltyToggle}
                      disabled={!!(couponApplied && !loyaltyToggleOn)}
                      aria-label={t("checkout.loyalty.usePoints").replace("{n}", String(loyaltyCoupon.points))}
                      data-testid="toggle-loyalty-points"
                    />
                  </div>
                ) : null}

                {!loyaltyToggleOn && couponApplied ? (
                  <>
                    <div
                      className="flex justify-between text-sm mb-1.5"
                      style={{ color: "hsl(var(--primary))" }}
                      data-testid="row-coupon-discount"
                    >
                      <div className="flex items-center gap-1.5">
                        <Tag className="w-3 h-3 shrink-0" aria-hidden />
                        <span className="font-medium">{couponInput}</span>
                        <span className="text-muted-foreground text-xs">· {t("checkout.coupon.applied")}</span>
                      </div>
                      <span className="font-medium">
                        {confirmedCouponDiscount > 0 ? <>−<FormattedPrice usdValue={confirmedCouponDiscount} /></> : "—"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCouponRemove}
                      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-destructive transition-colors"
                    >
                      {t("checkout.coupon.remove")}
                    </button>
                  </>
                ) : !loyaltyToggleOn ? (
                  <>
                    <button
                      type="button"
                      onClick={handleCouponToggle}
                      className="text-sm underline underline-offset-2 hover:opacity-70 transition-opacity font-medium"
                      style={{ color: "hsl(var(--primary))" }}
                      data-testid="button-coupon-toggle"
                    >
                      {t("checkout.coupon.addLabel")}
                    </button>
                    {couponOpen && (
                      <div className="mt-3">
                        <div className={`flex gap-2 ${dir === "rtl" ? "flex-row-reverse" : ""}`}>
                          <Input
                            ref={couponInputRef}
                            value={couponInput}
                            onChange={(e) => {
                              setCouponInput(e.target.value.toUpperCase());
                              if (couponError) setCouponError(null);
                            }}
                            onKeyDown={(e) => e.key === "Enter" && handleCouponApply()}
                            placeholder={t("checkout.coupon.placeholder")}
                            className={`h-10 text-sm uppercase${couponError ? " border-destructive focus-visible:ring-destructive" : ""}`}
                            data-testid="input-coupon-code-checkout"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-10 shrink-0"
                            onClick={() => handleCouponApply()}
                            disabled={!couponInput.trim() || couponValidating}
                            data-testid="button-coupon-apply-checkout"
                          >
                            {couponValidating ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : t("checkout.coupon.apply")}
                          </Button>
                        </div>
                        {couponError && (
                          <p className="mt-1.5 text-xs text-destructive" role="alert" data-testid="text-coupon-error-checkout">
                            {couponError}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                ) : null}
              </div>

              {/* Price breakdown — approved mobile hierarchy */}
              <div className="space-y-2.5 border-t border-gray-100 pt-4">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>
                    {items.length === 1
                      ? t("checkout.summary.itemsWithCount_one")
                      : t("checkout.summary.itemsWithCount_other", { n: String(items.length) })}
                  </span>
                  <span data-testid="text-subtotal"><FormattedPrice usdValue={subtotal} /></span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{t("delivery.promise.standardTitle")}</span>
                  {isFreeDeliveryUnlocked && deliveryMode !== "express" ? (
                    <span>{t("checkout.deliveryFree")}</span>
                  ) : (
                    <span>{districtFee === 0 ? t("checkout.deliveryFree") : <FormattedPrice usdValue={districtFee} />}</span>
                  )}
                </div>
                {deliveryMode === "express" && (
                  <div className="flex justify-between text-sm text-muted-foreground" data-testid="row-express-fee">
                    <span>{t("checkout.expressUpgradeLabel")}</span>
                    <span>{expressFee > 0 ? <FormattedPrice usdValue={expressFee} /> : t("checkout.deliveryFree")}</span>
                  </div>
                )}
                {slotFee > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground" data-testid="row-slot-fee">
                    <span>{isMidnightSlotActive ? t("product.midnightDelivery") : t("checkout.nightDeliverySurcharge")}</span>
                    <span><FormattedPrice usdValue={slotFee} /></span>
                  </div>
                )}
              </div>

              {/* Total — original style */}
              <div className="flex justify-between font-semibold text-base pt-4 mt-3 border-t border-gray-100">
                <span style={{ color: "hsl(var(--primary))" }}>{t("cart.total")}</span>
                <span style={{ color: "hsl(var(--primary))" }} data-testid="text-total">
                  <FormattedPrice usdValue={grandTotal} />
                </span>
              </div>

              {/* Free delivery — original */}
              {isFreeDeliveryUnlocked ? (
                <div className="mt-4">
                  <FreeDeliveryBanner overrideThresholdUsd={effectiveFreeDeliveryThresholdUsd} />
                </div>
              ) : effectiveFreeDeliveryEnabled !== false ? (
                <div className="mt-4">
                  <FreeDeliveryBanner overrideThresholdUsd={effectiveFreeDeliveryThresholdUsd} />
                </div>
              ) : null}

            </div>
          </div>{/* end mobile body */}

          {/* ══════════════════════════════════════════════════
              DESKTOP BODY (new redesign — hidden on mobile)
              ══════════════════════════════════════════════════ */}
          <div className="hidden lg:block">

            {/* Product list */}
            <div className="px-6 pt-4">
              <ul className="space-y-0" aria-label={t("checkout.summary")}>
                {items.map((item, idx) => (
                  <li key={item.product.id}>
                    <div
                      className="flex gap-3 py-3"
                      data-testid={`row-summary-${item.product.id}`}
                    >
                      {/* Thumbnail */}
                      <div className="w-14 h-14 rounded-xl bg-gray-100 overflow-hidden shrink-0 border border-gray-100">
                        {item.product.image?.uri ? (
                          <img
                            src={item.product.image.uri}
                            alt={item.product.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : null}
                      </div>

                      {/* Details + right-aligned price */}
                      <div className="flex flex-1 min-w-0 gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-snug line-clamp-2">
                            {item.product.name}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {t("checkout.qty")}: {item.quantity}
                          </p>
                        </div>
                        <div
                          className="shrink-0 text-sm font-semibold text-end"
                          style={{ color: "hsl(var(--primary))" }}
                          data-testid={`checkout-item-price-${item.product.id}`}
                        >
                          <SalePrice
                            priceValue={item.product.priceValue * item.quantity}
                            discountPriceValue={
                              item.product.discountPriceValue != null
                                ? item.product.discountPriceValue * item.quantity
                                : null
                            }
                            discountPriceAed={
                              item.product.discountPriceAed != null
                                ? item.product.discountPriceAed * item.quantity
                                : null
                            }
                          />
                        </div>
                      </div>
                    </div>
                    {idx < items.length - 1 && (
                      <hr className="border-gray-100" />
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {/* Bottom section */}
            <div className="px-6 pb-5">

              {/* Loyalty points toggle — desktop sidebar */}
              {loyaltyLoading ? (
                <div className="mt-4 border border-gray-200 rounded-xl overflow-hidden animate-pulse" aria-hidden>
                  <div className="px-4 py-3 flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full bg-gray-200 shrink-0" />
                    <div className="flex-1 h-4 bg-gray-200 rounded" />
                    <div className="w-9 h-5 bg-gray-200 rounded-full" />
                  </div>
                </div>
              ) : loyaltyCoupon ? (
                <div
                  className={`mt-4 border rounded-xl overflow-hidden animate-in fade-in duration-300 ${loyaltyToggleOn ? "border-green-200" : "border-gray-200"}`}
                  style={loyaltyToggleOn ? { backgroundColor: "hsl(142 71% 45% / 0.06)" } : {}}
                >
                  <div className="px-4 py-3 flex items-center gap-3">
                    <Star
                      className="w-4 h-4 shrink-0"
                      style={{ color: loyaltyToggleOn ? "#16a34a" : "hsl(var(--primary))" }}
                      aria-hidden
                    />
                    <div className="flex-1 min-w-0">
                      <span
                        className="text-sm font-medium"
                        style={{ color: loyaltyToggleOn ? "#16a34a" : "hsl(var(--foreground))" }}
                      >
                        {t("checkout.loyalty.usePoints").replace("{n}", String(loyaltyCoupon.points))}
                      </span>
                      {loyaltyToggleOn && confirmedCouponDiscount > 0 ? (
                        <span
                          className="ms-2 text-sm font-medium"
                          style={{ color: "#16a34a" }}
                          data-testid="loyalty-inline-discount-sidebar"
                        >
                          ·&nbsp;−<FormattedPrice usdValue={confirmedCouponDiscount} />
                        </span>
                      ) : (
                        <span className="ms-2 text-xs text-muted-foreground">
                          · {t("checkout.loyalty.off").replace("{n}", String(loyaltyCoupon.discountPercent))}
                        </span>
                      )}
                    </div>
                    <Switch
                      checked={loyaltyToggleOn}
                      onCheckedChange={onLoyaltyToggle}
                      disabled={!!(couponApplied && !loyaltyToggleOn)}
                      aria-label={t("checkout.loyalty.usePoints").replace("{n}", String(loyaltyCoupon.points))}
                      data-testid="toggle-loyalty-points-sidebar"
                    />
                  </div>
                </div>
              ) : null}

              {/* Price hierarchy */}
              <div className="mt-4 space-y-2.5" role="region" aria-label={t("checkout.summary")}>

                {/* Items (N) */}
                <div className="flex justify-between text-sm">
                  <span className="text-foreground font-medium">
                    {t("checkout.summary.itemsRow", { n: String(itemsQuantityCount) })}
                  </span>
                  <span className="text-foreground font-medium" data-testid="text-subtotal">
                    <FormattedPrice usdValue={subtotal} />
                  </span>
                </div>

                {/* Standard delivery + base-charge sub-line */}
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>
                    <span className="block">{t("checkout.deliveryLabel")}</span>
                    <span className="block text-xs text-muted-foreground/80 mt-0.5">
                      {t("checkout.delivery.baseCharge")}
                    </span>
                  </span>
                  {isFreeDeliveryUnlocked && deliveryMode !== "express" ? (
                    <span className="flex items-start gap-1.5">
                      <s className="text-muted-foreground/60">
                        <FormattedPrice usdValue={originalCityFee} />
                      </s>
                      <span
                        className="font-semibold"
                        style={{ color: "hsl(var(--primary))" }}
                        data-testid="text-delivery-free"
                      >
                        {t("checkout.freeDelivery.unlocked.freeLabel")}
                      </span>
                    </span>
                  ) : (
                    <span>
                      {districtFee === 0
                        ? (
                          <span className="font-semibold" style={{ color: "hsl(var(--primary))" }}>
                            {t("checkout.deliveryFree")}
                          </span>
                        )
                        : <FormattedPrice usdValue={districtFee} />}
                    </span>
                  )}
                </div>

                {/* Express upgrade + 90-minute sub-line (only when express selected) */}
                {deliveryMode === "express" && (
                  <div className="flex justify-between text-sm text-muted-foreground" data-testid="row-express-fee">
                    <span>
                      <span className="block">{t("checkout.expressUpgradeLabel")}</span>
                      <span className="block text-xs text-muted-foreground/80 mt-0.5">
                        {t("checkout.delivery.express90")}
                      </span>
                    </span>
                    <span>
                      {expressFee > 0
                        ? <FormattedPrice usdValue={expressFee} />
                        : t("checkout.deliveryFree")}
                    </span>
                  </div>
                )}

                {/* Slot fee */}
                {slotFee > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground" data-testid="row-slot-fee">
                    <span>{isMidnightSlotActive ? t("product.midnightDelivery") : t("checkout.nightDeliverySurcharge")}</span>
                    <span><FormattedPrice usdValue={slotFee} /></span>
                  </div>
                )}

                {/* Coupon discount */}
                {couponApplied && confirmedCouponDiscount > 0 && (
                  <div
                    className="flex justify-between text-sm"
                    style={{ color: "hsl(var(--primary))" }}
                  >
                    <span className="font-medium">{t("checkout.coupon.applied")}</span>
                    <span className="font-medium">
                      −<FormattedPrice usdValue={confirmedCouponDiscount} />
                    </span>
                  </div>
                )}
              </div>

              {/* Promo / gift-card control — compact row inside the summary,
                  above the Total divider */}
              {!loyaltyToggleOn && (
              <div className="mt-3 border border-gray-200 rounded-xl overflow-hidden [&_[data-testid=button-coupon-toggle]]:min-h-[44px]">
                {couponApplied ? (
                  /* Applied state */
                  <div
                    className="px-4 py-3"
                    style={{ backgroundColor: "hsl(var(--primary) / 0.05)" }}
                  >
                    <div className="flex items-center gap-2">
                      <Tag
                        className="w-4 h-4 shrink-0"
                        style={{ color: "hsl(var(--primary))" }}
                        aria-hidden
                      />
                      <div className="flex-1 min-w-0">
                        <span
                          className="text-sm font-semibold"
                          style={{ color: "hsl(var(--primary))" }}
                        >
                          {couponInput}
                        </span>
                        <span className="text-xs text-muted-foreground ms-1.5">
                          · {t("checkout.coupon.applied")}
                        </span>
                      </div>
                      <span
                        className="shrink-0 text-sm font-medium"
                        style={{ color: "hsl(var(--primary))" }}
                        data-testid="row-coupon-discount"
                        role="status"
                        aria-live="polite"
                      >
                        {confirmedCouponDiscount > 0 ? (
                          <>−<FormattedPrice usdValue={confirmedCouponDiscount} /></>
                        ) : "—"}
                      </span>
                      <button
                        type="button"
                        onClick={handleCouponRemove}
                        className="shrink-0 p-1 rounded-full hover:bg-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        aria-label={t("checkout.coupon.remove")}
                        data-testid="button-coupon-remove"
                      >
                        <X className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Toggle / input state */
                  <>
                    <button
                      type="button"
                      onClick={handleCouponToggle}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                      aria-expanded={couponOpen}
                      aria-label={t("checkout.coupon.addLabel")}
                      data-testid="button-coupon-toggle"
                    >
                      <Tag
                        className="w-4 h-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <span className="flex-1 text-sm font-medium text-start text-foreground" aria-hidden>
                        {t("checkout.coupon.addLabel")}
                      </span>
                      {couponOpen ? (
                        <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden />
                      ) : (
                        <ChevronRight
                          className={`w-4 h-4 shrink-0 text-muted-foreground ${dir === "rtl" ? "rotate-180" : ""}`}
                          aria-hidden
                        />
                      )}
                    </button>
                    {couponOpen && (
                      <div className="px-4 pb-3 border-t border-gray-100">
                        <div className={`flex gap-2 mt-3 ${dir === "rtl" ? "flex-row-reverse" : ""}`}>
                          <Input
                            ref={couponInputRef}
                            value={couponInput}
                            onChange={(e) => {
                              setCouponInput(e.target.value.toUpperCase());
                              if (couponError) setCouponError(null);
                            }}
                            onKeyDown={(e) => e.key === "Enter" && handleCouponApply()}
                            placeholder={t("checkout.coupon.placeholder")}
                            className={`h-10 text-sm uppercase${couponError ? " border-destructive focus-visible:ring-destructive" : ""}`}
                            data-testid="input-coupon-code-checkout"
                            aria-label={t("checkout.coupon.placeholder")}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-10 shrink-0"
                            onClick={() => handleCouponApply()}
                            disabled={!couponInput.trim() || couponValidating}
                            data-testid="button-coupon-apply-checkout"
                          >
                            {couponValidating ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                            ) : (
                              t("checkout.coupon.apply")
                            )}
                          </Button>
                        </div>
                        {couponError && (
                          <p
                            className="mt-1.5 text-xs text-destructive"
                            role="alert"
                            data-testid="text-coupon-error-checkout"
                          >
                            {couponError}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
              )}

              {/* Divider + dominant Total */}
              <div className="space-y-2.5">
                <hr className="border-gray-100 mt-3.5" />

                <div className="flex justify-between items-baseline mt-3.5">
                  <span
                    className="text-base font-bold"
                    style={{ color: "hsl(var(--primary))" }}
                  >
                    {t("cart.total")}
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className="text-xl font-bold"
                      style={{ color: "hsl(var(--primary))" }}
                      data-testid="text-total"
                      role="status"
                      aria-live="polite"
                    >
                      <FormattedPrice usdValue={grandTotal} />
                    </span>
                  </div>
                </div>
              </div>

              {/* Delivery panel: amber required-action card while the district
                  change left the selection invalid / loading / errored,
                  otherwise the neutral confirmation panel. */}
              {deliveryRequired ? (
              <div
                className="mt-4 rounded-xl bg-amber-50 border border-amber-300 overflow-hidden"
                data-testid="delivery-required-panel"
                role="status"
                aria-live="polite"
              >
                <div className="px-4 pt-3 pb-3 flex items-start gap-2.5">
                  {deliveryRequired.status === "pending" ? (
                    <Loader2 className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 animate-spin" aria-hidden />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">
                      {t("checkout.delivery.sectionLabel")}
                    </p>
                    {deliveryRequired.status === "pending" ? (
                      <p className="text-sm text-amber-900 mt-1" data-testid="text-delivery-required-body">
                        {t("checkout.districtChange.checking", { district: deliveryRequired.districtLabel })}
                      </p>
                    ) : deliveryRequired.status === "error" ? (
                      <>
                        <p className="text-sm text-amber-900 mt-1" data-testid="text-delivery-required-body">
                          {t("checkout.districtChange.loadFailed", { district: deliveryRequired.districtLabel })}
                        </p>
                        <button
                          type="button"
                          onClick={deliveryRequired.onRetry}
                          className="mt-1 text-sm font-medium text-amber-900 underline underline-offset-2 hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-sm"
                          data-testid="button-delivery-required-retry"
                        >
                          {t("checkout.retry")}
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-amber-900 mt-1" data-testid="text-delivery-required-title">
                          {t("checkout.deliveryRequired.title")}
                        </p>
                        <p className="text-xs text-amber-800 mt-0.5" data-testid="text-delivery-required-body">
                          {t("checkout.deliveryRequired.body", { district: deliveryRequired.districtLabel })}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={deliveryRequired.onChoose}
                          className="mt-2.5 h-9 bg-white border-amber-300 text-amber-900 hover:bg-amber-100 hover:text-amber-900"
                          data-testid="button-choose-delivery-time"
                        >
                          {t("checkout.deliveryRequired.cta")}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
              ) : (
              <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200/70 overflow-hidden" data-testid="delivery-confirmation-panel">
                <div className="px-4 pt-3 pb-3 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    {deliveryPromise?.type === "express" ? (
                      <Zap className="w-4 h-4 shrink-0 mt-0.5 text-slate-500" aria-hidden />
                    ) : (
                      <CalendarDays className="w-4 h-4 shrink-0 mt-0.5 text-slate-500" aria-hidden />
                    )}
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        {t("checkout.delivery.sectionLabel")}
                      </p>
                      {deliveryPromise?.type === "express" ? (
                        <>
                          <p className="text-xs text-muted-foreground mt-1">{t("checkout.promise.express")}</p>
                          {deliveryPromise.arrivesBy ? (
                            <p className="text-sm font-semibold text-foreground mt-0.5" data-testid="text-delivery-promise">
                              {t("checkout.promise.arrivesBy", { time: deliveryPromise.arrivesBy })}
                            </p>
                          ) : (
                            <p className="text-sm font-semibold text-foreground mt-0.5" data-testid="text-delivery-promise">
                              {t("checkout.promise.within90")}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-0.5">{t("checkout.promise.within90")}</p>
                        </>
                      ) : deliveryPromise?.type === "standard" && deliveryPromise.when ? (
                        <>
                          <p className="text-xs text-muted-foreground mt-1">{t("checkout.promise.standard")}</p>
                          <p className="text-sm font-semibold text-foreground mt-0.5" data-testid="text-delivery-promise">
                            {deliveryPromise.arrival ?? t("checkout.promise.arrives", { when: deliveryPromise.when })}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">{t("checkout.promise.scheduledWindow")}</p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground italic mt-1">
                          {t("checkout.delivery.notSelected")}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onChangeDelivery}
                    className="shrink-0 inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-2 -my-2 text-xs font-medium underline underline-offset-2 hover:opacity-70 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded-sm"
                    style={{ color: "hsl(var(--primary))" }}
                    aria-label={t("delivery.row.change")}
                    data-testid="button-change-delivery"
                  >
                    {t("delivery.row.change")}
                  </button>
                </div>
              </div>
              )}

            </div>{/* end pinned bottom */}
          </div>{/* end desktop body */}

          {/* ══════════════════════════════════════════════════
              DESKTOP CTA — Step 1 only, hidden on mobile
              ══════════════════════════════════════════════════ */}
          {step === 1 && (
            <div className="hidden lg:block shrink-0 border-t border-gray-100 px-6 py-5">
              {/* Cyprus policy acceptance checkbox — shown above CTA for CY shoppers */}
              {isCyprus && (
                <label
                  className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer select-none mb-3"
                  data-testid="label-policy-acceptance-sidebar"
                >
                  <input
                    type="checkbox"
                    checked={policyAccepted}
                    onChange={(e) => onPolicyAcceptedChange?.(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-primary cursor-pointer shrink-0"
                    aria-required="true"
                    data-testid="check-policy-acceptance-sidebar"
                  />
                  <span>
                    {t("checkout.policyAcceptance.prefix")}{" "}
                    <a href="/cyprus/terms/" target="_blank" rel="noopener noreferrer" className="underline text-foreground hover:text-primary">
                      {t("checkout.policyAcceptance.terms")}
                    </a>
                    {", "}
                    <a href="/cyprus/shipping-policy/" target="_blank" rel="noopener noreferrer" className="underline text-foreground hover:text-primary">
                      {t("checkout.policyAcceptance.shipping")}
                    </a>
                    {" "}{t("checkout.policyAcceptance.and")}{" "}
                    <a href="/cyprus/refund-policy/" target="_blank" rel="noopener noreferrer" className="underline text-foreground hover:text-primary">
                      {t("checkout.policyAcceptance.refund")}
                    </a>
                    {"."}
                  </span>
                </label>
              )}
              <button
                type="button"
                onClick={isCyprus && !policyAccepted ? undefined : onContinueToPayment}
                data-testid="button-continue-to-payment-sidebar"
                aria-describedby="sidebar-cta-secure"
                aria-disabled={(ctaBlocked || (isCyprus && !policyAccepted)) || undefined}
                className={`w-full h-14 flex items-center justify-between px-5 rounded-xl text-white font-semibold text-base transition-opacity select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary ${ctaBlocked || (isCyprus && !policyAccepted) ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:opacity-90"}`}
                style={{ backgroundColor: "hsl(var(--primary))" }}
              >
                <span>
                  {t("checkout.cta.continueToPayment")}
                  {" · "}
                  <span role="status" aria-live="polite">
                    <FormattedPrice usdValue={grandTotal} />
                  </span>
                </span>
                <ArrowRight
                  className={`w-5 h-5 shrink-0 ${dir === "rtl" ? "rotate-180" : ""}`}
                  aria-label={t("checkout.cta.arrowLabel")}
                  aria-hidden={false}
                />
              </button>
              <div
                id="sidebar-cta-secure"
                className="flex items-center justify-center gap-1.5 mt-3 text-xs text-muted-foreground"
              >
                <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden />
                <span>{t("checkout.cta.secureCheckout")}</span>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
