import { type RefObject } from "react";
import { Link } from "wouter";
import {
  ChevronDown,
  ChevronRight,
  Tag,
  Loader2,
  CalendarDays,
  MapPin,
  ArrowRight,
  Lock,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormattedPrice } from "@/components/FormattedPrice";
import { SalePrice } from "@/components/SalePrice";
import { FreeDeliveryBanner } from "@/components/cart/FreeDeliveryBanner";
import { FreeDeliveryUnlockedStrip } from "@/components/cart/FreeDeliveryUnlockedStrip";
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
  confirmedCouponDiscount: number;
  isFreeDeliveryUnlocked: boolean;
  originalCityFee: number;
  effectiveFreeDeliveryEnabled: boolean | undefined;
  effectiveFreeDeliveryThresholdUsd: number | undefined;
  deliveryMode: "express" | "schedule";
  deliveryRowText: string | null;
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
  onChangeDelivery: () => void;
  step: number;
  step1CtaDisabled: boolean;
  handleValidateAndAdvance: () => void;
  summaryOpen: boolean;
  setSummaryOpen: (v: boolean) => void;
};

export function OrderSummaryPanel({
  items,
  subtotal,
  districtFee,
  expressFee,
  slotFee,
  confirmedCouponDiscount,
  isFreeDeliveryUnlocked,
  originalCityFee,
  effectiveFreeDeliveryEnabled,
  effectiveFreeDeliveryThresholdUsd,
  deliveryMode,
  deliveryRowText,
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
  onChangeDelivery,
  step,
  step1CtaDisabled,
  handleValidateAndAdvance,
  summaryOpen,
  setSummaryOpen,
}: OrderSummaryPanelProps) {
  const { t, dir } = useLocale();
  const { currencyCode } = useDisplayCurrency();

  const grandTotal = computeCartTotal(
    subtotal,
    districtFee + expressFee + slotFee,
    confirmedCouponDiscount,
  );

  const itemCountLabel =
    items.length === 1
      ? t("checkout.summary.itemCount_one")
      : t("checkout.summary.itemCount_other", { n: String(items.length) });

  return (
    <div className="w-full lg:w-96 xl:w-[420px] shrink-0 order-first lg:order-last self-stretch">
      <div className="sticky top-24">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col lg:max-h-[calc(100vh-6rem)]">

          {/* ══════════════════════════════════════════════════
              MOBILE HEADER (original — visually unchanged)
              ══════════════════════════════════════════════════ */}
          <button
            type="button"
            className="lg:hidden w-full px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0"
            style={{ backgroundColor: "hsl(var(--primary) / 0.05)" }}
            onClick={() => setSummaryOpen(!summaryOpen)}
            aria-expanded={summaryOpen}
            data-testid="button-summary-toggle"
          >
            <h3 className="text-sm font-semibold" style={{ color: "hsl(var(--primary))" }}>
              {t("checkout.summary")}
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold" style={{ color: "hsl(var(--primary))" }}>
                <FormattedPrice usdValue={grandTotal} />
              </span>
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${summaryOpen ? "rotate-180" : ""}`}
                style={{ color: "hsl(var(--primary))" }}
                aria-hidden
              />
            </div>
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
                {couponApplied ? (
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
                ) : (
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
                            onClick={handleCouponApply}
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
                )}
              </div>

              {/* Price breakdown — original style */}
              <div className="space-y-2.5 border-t border-gray-100 pt-4">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{t("cart.subtotal")}</span>
                  <span data-testid="text-subtotal"><FormattedPrice usdValue={subtotal} /></span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{t("checkout.deliveryLabel")}</span>
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
                    <span>{t("checkout.nightDeliverySurcharge")}</span>
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
          <div className="hidden lg:flex flex-col flex-1 min-h-0">

            {/* Scrollable product list */}
            <div className="overflow-y-auto shrink min-h-0 px-6 pt-4">
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

            {/* Pinned bottom section */}
            <div className="shrink-0 px-6 pb-5">

              {/* Promo / gift-card control — outlined row */}
              <div className="mt-4 border border-gray-200 rounded-xl overflow-hidden">
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
                            onClick={handleCouponApply}
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

              {/* Price hierarchy */}
              <div className="mt-4 space-y-2.5" role="region" aria-label={t("checkout.summary")}>

                {/* Subtotal */}
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{t("cart.subtotal")}</span>
                  <span data-testid="text-subtotal">
                    <FormattedPrice usdValue={subtotal} />
                  </span>
                </div>

                {/* Delivery row */}
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{t("checkout.deliveryLabel")}</span>
                  {isFreeDeliveryUnlocked && deliveryMode !== "express" ? (
                    <span className="flex items-center gap-1.5">
                      <s className="text-muted-foreground/60">
                        <FormattedPrice usdValue={originalCityFee} />
                      </s>
                      <span
                        className="font-medium"
                        style={{ color: "hsl(var(--primary))" }}
                      >
                        {t("checkout.freeDelivery.unlocked.freeLabel")}
                      </span>
                    </span>
                  ) : (
                    <span>
                      {districtFee === 0
                        ? t("checkout.deliveryFree")
                        : <FormattedPrice usdValue={districtFee} />}
                    </span>
                  )}
                </div>

                {/* Express upgrade */}
                {deliveryMode === "express" && (
                  <div className="flex justify-between text-sm text-muted-foreground" data-testid="row-express-fee">
                    <span>{t("checkout.expressUpgradeLabel")}</span>
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
                    <span>{t("checkout.nightDeliverySurcharge")}</span>
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

                {/* Divider */}
                <hr className="border-gray-100 !mt-3.5" />

                {/* Total — visually dominant + subtle currency code */}
                <div className="flex justify-between items-baseline !mt-3.5">
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
                    {currencyCode && (
                      <span className="text-xs font-normal text-muted-foreground">
                        {currencyCode}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Free delivery strip / banner */}
              {isFreeDeliveryUnlocked ? (
                <div className="mt-4">
                  <FreeDeliveryUnlockedStrip
                    savedAmountUsd={deliveryMode !== "express" ? originalCityFee : undefined}
                    expressSelected={deliveryMode === "express"}
                  />
                </div>
              ) : effectiveFreeDeliveryEnabled !== false ? (
                <div className="mt-4">
                  <FreeDeliveryBanner overrideThresholdUsd={effectiveFreeDeliveryThresholdUsd} />
                </div>
              ) : null}

              {/* Delivery card */}
              <div className="mt-4 rounded-xl border border-gray-200 overflow-hidden">
                <div
                  className="px-4 py-3 flex items-center justify-between border-b border-gray-100"
                  style={{ backgroundColor: "hsl(var(--primary) / 0.04)" }}
                >
                  <p
                    className="text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: "hsl(var(--primary))" }}
                  >
                    {t("checkout.delivery.sectionLabel")}
                  </p>
                  <button
                    type="button"
                    onClick={onChangeDelivery}
                    className="text-xs font-medium underline underline-offset-2 hover:opacity-70 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded-sm"
                    style={{ color: "hsl(var(--primary))" }}
                    aria-label={t("delivery.row.change")}
                    data-testid="button-change-delivery"
                  >
                    {t("delivery.row.change")}
                  </button>
                </div>
                <div className="px-4 py-3 space-y-2">
                  {deliveryRowText ? (
                    <div className="flex items-start gap-2.5">
                      <CalendarDays
                        className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground"
                        aria-hidden
                      />
                      <span className="text-sm text-foreground leading-snug">
                        {deliveryRowText}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2.5">
                      <CalendarDays
                        className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground"
                        aria-hidden
                      />
                      <span className="text-sm text-muted-foreground italic">
                        {t("checkout.delivery.notSelected")}
                      </span>
                    </div>
                  )}
                  {selectedDistrict && (
                    <div className="flex items-start gap-2.5">
                      <MapPin
                        className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground"
                        aria-hidden
                      />
                      <span className="text-sm text-muted-foreground leading-snug">
                        {selectedDistrict}
                      </span>
                    </div>
                  )}
                </div>
              </div>

            </div>{/* end pinned bottom */}
          </div>{/* end desktop body */}

          {/* ══════════════════════════════════════════════════
              DESKTOP CTA — Step 1 only, hidden on mobile
              ══════════════════════════════════════════════════ */}
          {step === 1 && (
            <div className="hidden lg:block shrink-0 border-t border-gray-100 px-6 py-5">
              <button
                type="button"
                onClick={handleValidateAndAdvance}
                data-testid="button-continue-to-payment-sidebar"
                aria-describedby="sidebar-cta-secure"
                disabled={step1CtaDisabled}
                className={`w-full h-14 flex items-center justify-between px-5 rounded-xl text-white font-semibold text-base transition-opacity select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary ${step1CtaDisabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:opacity-90"}`}
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
