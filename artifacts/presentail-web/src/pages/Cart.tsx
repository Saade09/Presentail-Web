import { useEffect, useState, useRef } from "react";
import { useCart } from "@/contexts/CartContext";
import { Link, useLocation } from "wouter";
import { trackEvent, trackWebEvent } from "@/lib/analytics";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Minus, Plus, X, ArrowRight, ShoppingCart, Eye, Tag, ChevronDown, ChevronUp, Check, Trash2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { motion } from "framer-motion";
import { useLocale } from "@/contexts/LocaleContext";
import { useAuth } from "@/contexts/AuthContext";
import { FreeDeliveryBanner } from "@/components/cart/FreeDeliveryBanner";
import { FormattedPrice } from "@/components/FormattedPrice";
import { SalePrice } from "@/components/SalePrice";
import { CartUpsells } from "@/components/cart/CartUpsells";
import { useDeliveryConfig } from "@/components/product/useDeliveryConfig";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useDeliverySelection } from "@/contexts/DeliverySelectionContext";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import { expressSurchargeForCountry, freeDeliveryThresholdUsd } from "@workspace/delivery";
import { computeCartTotal } from "@workspace/display-currency";
import { CheckoutLoginDialog } from "@/components/cart/CheckoutLoginDialog";
import { DeliveryDateRow } from "@/components/delivery/DeliveryDateRow";
import { SuggestedMessagesDialog } from "@/components/checkout/SuggestedMessagesDialog";
import { useToast } from "@/hooks/use-toast";
import { useHeadingFont } from "@/hooks/useHeadingFont";
import cardStationery from "@assets/Elegant-dark-teal-stationery-design_1778742277420.avif";
import cardLogoEn from "@assets/Presentail_PNG-01_white.png";
import cardLogoAr from "@assets/Presentail-Arabic-Logo-white.png";

export const CARD_MESSAGE_KEY = "presentail_card_message_v1";
export const CARD_TO_KEY = "presentail_card_to_v1";
export const CARD_FROM_KEY = "presentail_card_from_v1";
export const CARD_QR_LINK_KEY = "presentail_card_qr_link_v1";
export const COUPON_STORAGE_KEY = "presentail_coupon_v1";
export const COUPON_DISCOUNT_KEY = "presentail_coupon_discount_v1";

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
  const { t, dir } = useLocale();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const {
    freeDeliveryEnabled,
    cityFeeUsd,
    freeDeliveryThresholdUsd: configThresholdUsd,
  } = useDeliveryConfig();
  const { countryCode, city: locationCity, country: locationCountry } = useLocationSelection();
  const expressSurcharge = expressSurchargeForCountry(countryCode);
  const { mode: deliveryMode } = useDeliverySelection();
  const { formatPrice } = useDisplayCurrency();
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

  // Delivery fee for the Order Summary sidebar.
  // null → no city selected yet (show "Calculated at checkout")
  // 0    → above free-delivery threshold (show "Free")
  // >0   → show the fee amount
  const deliveryFeeUsd: number | null = (() => {
    if (cityFeeUsd === null) return null;
    const threshold = thresholdUsd ?? Infinity;
    if (freeDeliveryEnabled !== false && subtotal >= threshold) return 0;
    return cityFeeUsd;
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
    try { return parseFloat(localStorage.getItem(COUPON_DISCOUNT_KEY) ?? "0") || 0; } catch { return 0; }
  });

  const cartTotal = computeCartTotal(subtotal, effectiveDeliveryFeeUsd ?? 0, couponDiscountUsd);

  const handleCouponToggle = () => {
    const next = !couponOpen;
    setCouponOpen(next);
  };

  const handleCouponApply = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code || couponValidating) return;
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
          cartItems: items.map((i) => ({ osSlug: i.product.id, priceUsd: i.product.priceValue, quantity: i.quantity })),
          cartTotalUsd: subtotal,
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
        trackWebEvent({ type: "promo_applied", value: discount, currency: "USD" });
      } else {
        setCouponError(res.message ?? t("cart.promoCodeInvalid"));
        setCouponApplied(false);
        setCouponDiscountUsd(0);
        try { localStorage.removeItem(COUPON_DISCOUNT_KEY); } catch { /* best-effort */ }
        trackWebEvent({ type: "promo_failed" });
      }
    } catch {
      setCouponError(t("cart.promoCodeError"));
      trackWebEvent({ type: "promo_failed" });
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
    if (user) return;
    e.preventDefault();
    if (authLoading) {
      setLocation("/checkout");
      return;
    }
    setLoginOpen(true);
  };
  const goToCheckout = () => setLocation("/checkout?guest=1");

  // Emit one cart_viewed event when the standalone cart page mounts.
  // This is the entry point of the purchase funnel evaluated by the
  // server-side checkoutPurchaseFunnelMonitor.
  useEffect(() => {
    trackEvent({ name: "cart_viewed", surface: "cart-screen" });
  }, []);

  // Derive the effective "From" name for the card preview:
  // signed-in → profile name; guest → cardFrom input.
  const previewCardFrom = user
    ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || ""
    : cardFrom;

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
        <div className="flex items-center justify-between mb-4 gap-4">
          <h1 className="text-3xl font-serif">{t("cart.title")} ({itemCount})</h1>

          {/* Mobile-only promo toggle — on the right of the heading row */}
          <div className="lg:hidden shrink-0 relative">
            <button
              type="button"
              onClick={handleCouponToggle}
              className="flex items-center gap-1.5 rounded-lg border border-primary/15 bg-white px-3 py-1.5 text-xs transition-colors hover:bg-secondary/40 shadow-sm"
              data-testid="button-promo-toggle-mobile"
            >
              <Tag className="w-3 h-3 text-primary/60 shrink-0" />
              {couponApplied ? (
                <span className="font-medium text-primary flex items-center gap-1">
                  {couponInput}
                  <Check className="w-3 h-3 text-emerald-600" />
                </span>
              ) : (
                <span className="text-muted-foreground">{t("cart.promoCode")}</span>
              )}
              {couponOpen ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
            </button>
            {couponOpen && (
              <div className="absolute right-4 left-4 mt-1 z-10 bg-white border border-primary/15 rounded-xl shadow-lg p-3">
                <div className="flex gap-2">
                  <Input
                    value={couponInput}
                    onChange={(e) => {
                      setCouponInput(e.target.value);
                      if (couponError) setCouponError(null);
                      if (couponApplied) { setCouponApplied(false); setCouponDiscountUsd(0); }
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleCouponApply(); }}
                    placeholder={t("cart.promoCodePlaceholder")}
                    className={`h-8 text-xs rounded-lg${couponError ? " border-destructive focus-visible:ring-destructive" : ""}`}
                    data-testid="input-promo-code-mobile"
                    autoFocus
                  />
                  {couponApplied ? (
                    <Button type="button" variant="outline" size="sm" onClick={handleCouponRemove} className="shrink-0 rounded-lg h-8 text-xs px-2" data-testid="button-promo-remove-mobile">
                      {t("cart.promoCodeRemove")}
                    </Button>
                  ) : (
                    <Button type="button" size="sm" onClick={handleCouponApply} disabled={!couponInput.trim() || couponValidating} className="shrink-0 rounded-lg h-8 text-xs px-2" data-testid="button-promo-apply-mobile">
                      {couponValidating ? t("cart.promoCodeValidating") : t("cart.promoCodeApply")}
                    </Button>
                  )}
                </div>
                {couponError && <p className="mt-1.5 text-xs text-destructive">{couponError}</p>}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_26.4rem] gap-x-12 gap-y-6">
          {/* Cart Items – banner + items */}
          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
            {freeDeliveryEnabled !== false && (
              <FreeDeliveryBanner
                subtotal={subtotal}
                overrideThresholdUsd={thresholdUsd}
                className="mb-6"
              />
            )}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100">
            {items.map((item, index) => (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                key={item.product.id}
                className="flex items-center gap-3 px-5 py-3"
              >
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
              </motion.div>
            ))}
            </div>

          </div>

          {/* Order Summary */}
          <div className="hidden lg:block lg:col-start-2 lg:row-start-1 lg:row-span-2">
            <div className="bg-secondary/30 rounded-3xl px-8 pb-8 sticky top-32">
              {/* Promo Code Accordion */}
              <div className="mb-6">
                <button
                  type="button"
                  onClick={handleCouponToggle}
                  className="w-full flex items-center justify-between gap-3 rounded-xl border border-primary/15 bg-white px-4 py-3 text-sm transition-colors hover:bg-secondary/40"
                  data-testid="button-promo-toggle"
                >
                  <div className="flex items-center gap-2.5">
                    <Tag className="w-4 h-4 text-primary/60 shrink-0" />
                    {couponApplied ? (
                      <span className="font-medium text-primary">
                        {couponInput}
                        <span className="ml-2 inline-flex items-center gap-1 text-xs text-emerald-600">
                          <Check className="w-3 h-3" />
                          {t("cart.promoCodeApplied")}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t("cart.promoCode")}</span>
                    )}
                  </div>
                  {couponOpen ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                </button>

                {couponOpen && (
                  <div className="mt-2">
                    <div className="flex gap-2">
                      <Input
                        value={couponInput}
                        onChange={(e) => {
                          setCouponInput(e.target.value);
                          if (couponError) setCouponError(null);
                          if (couponApplied) { setCouponApplied(false); setCouponDiscountUsd(0); }
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") handleCouponApply(); }}
                        placeholder={t("cart.promoCodePlaceholder")}
                        className={`rounded-lg text-sm${couponError ? " border-destructive focus-visible:ring-destructive" : ""}`}
                        data-testid="input-promo-code"
                      />
                      {couponApplied ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleCouponRemove}
                          className="shrink-0 rounded-lg"
                          data-testid="button-promo-remove"
                        >
                          {t("cart.promoCodeRemove")}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleCouponApply}
                          disabled={!couponInput.trim() || couponValidating}
                          className="shrink-0 rounded-lg"
                          data-testid="button-promo-apply"
                        >
                          {couponValidating ? t("cart.promoCodeValidating") : t("cart.promoCodeApply")}
                        </Button>
                      )}
                    </div>
                    {couponError && <p className="mt-1.5 text-xs text-destructive" data-testid="text-promo-error">{couponError}</p>}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl p-6 border border-primary/10 shadow-sm mb-4">
                <h2 className="text-2xl font-serif mb-4">{t("cart.deliverySummary")}</h2>
                <div className="text-sm">
                  <DeliveryDateRow />
                </div>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-primary/10 shadow-sm">
                <h2 className="text-2xl font-serif mb-4">{t("cart.orderSummary")}</h2>

                <div className="space-y-4 text-sm mb-6 pb-6 border-b border-primary/10">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("cart.subtotal")}</span>
                    <span className="font-medium"><FormattedPrice usdValue={subtotal} /></span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("cart.deliveryCharges")}</span>
                    <span className="font-medium">
                      {deliveryFeeUsd === null
                        ? <span className="text-muted-foreground text-xs">{t("cart.deliveryTbd")}</span>
                        : deliveryFeeUsd === 0
                          ? <span className="text-emerald-600">{t("cart.deliveryFree")}</span>
                          : <FormattedPrice usdValue={deliveryFeeUsd} />
                      }
                    </span>
                  </div>

                  {expressSurcharge > 0 && locationCity?.expressAvailable !== false && (
                    deliveryMode === "express" ? (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t("cart.expressLabel")}</span>
                        <span className="font-medium"><FormattedPrice usdValue={expressSurcharge} /></span>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {t("cart.expressNote").replace("{{amount}}", formatPrice(expressSurcharge))}
                      </p>
                    )
                  )}
                  {couponApplied && couponDiscountUsd > 0 && (
                    <div className="flex justify-between text-emerald-600" data-testid="row-cart-coupon-discount">
                      <span className="flex items-center gap-1"><Tag className="w-3.5 h-3.5" />{couponInput}</span>
                      <span className="font-medium">−<FormattedPrice usdValue={couponDiscountUsd} /></span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center mb-8">
                  <span className="font-medium">{t("cart.total")}</span>
                  <span className="text-2xl font-serif"><FormattedPrice usdValue={Math.max(0, cartTotal)} /></span>
                </div>

                <Button asChild size="lg" className="hidden lg:flex w-full h-14 text-base rounded-xl px-5">
                  <Link
                    href="/checkout"
                    onClick={handleProceed}
                    data-testid="link-proceed-to-checkout"
                    className="flex items-center gap-2"
                  >
                    <span className="flex-1 text-start">{t("cart.proceed")}</span>
                    <FormattedPrice usdValue={cartTotal} className="font-semibold shrink-0 text-white" />
                    <ArrowRight className={`w-4 h-4 shrink-0 ${dir === "rtl" ? "rotate-180" : ""}`} />
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
                    placeholder={t("checkout.firstNamePh")}
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
                  {user ? (
                    <div className={`flex items-center gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2.5 ${dir === "rtl" ? "flex-row-reverse" : ""}`}>
                      <span className="text-sm text-foreground">
                        {`${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "—"}
                      </span>
                      <Link
                        href="/account/personal-information"
                        className="text-xs text-primary underline underline-offset-2 ms-auto"
                        data-testid="link-edit-account-from"
                      >
                        {t("checkout.editInAccount")}
                      </Link>
                    </div>
                  ) : (
                    <Input
                      value={cardFrom}
                      onChange={(e) => handleCardFromChange(e.target.value)}
                      data-testid="input-cart-card-from"
                    />
                  )}
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

              {/* Delivery Date */}
              <div className="lg:hidden bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
                <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-5">
                  {t("cart.deliverySummary")}
                </p>
                <DeliveryDateRow />
              </div>

              <CartUpsells />
            </div>
          </div>
        </div>
      </div>

      {/* Sticky bottom bar – visible on mobile only; desktop uses the sidebar button */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] p-3 lg:hidden" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <Button asChild size="lg" className="w-full h-14 text-base rounded-full px-5">
          <Link
            href="/checkout"
            onClick={handleProceed}
            data-testid="link-proceed-to-checkout-sticky"
            className="flex items-center gap-2"
          >
            <span className="flex-1 text-start">{t("cart.proceed")}</span>
            <FormattedPrice usdValue={cartTotal} className="font-semibold shrink-0 text-white" />
            <ArrowRight className={`w-4 h-4 shrink-0 ${dir === "rtl" ? "rotate-180" : ""}`} />
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
  const headingFont = useHeadingFont();
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
        alt=""
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
          alt=""
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
