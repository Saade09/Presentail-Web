import { useEffect, useState, useRef } from "react";
import { useCart } from "@/contexts/CartContext";
import { Link, useLocation } from "wouter";
import { trackEvent } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Minus, Plus, X, ArrowRight, ShoppingCart, Eye, Tag, ChevronDown, ChevronUp, Check } from "lucide-react";
import { motion } from "framer-motion";
import { useLocale } from "@/contexts/LocaleContext";
import { useAuth } from "@/contexts/AuthContext";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import { FreeDeliveryBanner } from "@/components/cart/FreeDeliveryBanner";
import { CartUpsells } from "@/components/cart/CartUpsells";
import { useDeliveryConfig } from "@/components/product/useDeliveryConfig";
import { useLocationSelection } from "@/contexts/LocationContext";
import { freeDeliveryThresholdUsd } from "@workspace/delivery";
import { CheckoutLoginDialog } from "@/components/cart/CheckoutLoginDialog";
import { DeliveryDateRow } from "@/components/delivery/DeliveryDateRow";
import { SuggestedMessagesDialog } from "@/components/checkout/SuggestedMessagesDialog";
import { useToast } from "@/hooks/use-toast";
import { useHeadingFont } from "@/hooks/useHeadingFont";
import cardStationery from "@assets/Elegant-dark-teal-stationery-design_1778742277420.avif";

export const CARD_MESSAGE_KEY = "presentail_card_message_v1";
export const CARD_TO_KEY = "presentail_card_to_v1";
export const CARD_FROM_KEY = "presentail_card_from_v1";
export const COUPON_STORAGE_KEY = "presentail_coupon_v1";

function CartSkeleton() {
  return (
    <div className="min-h-screen bg-white pt-24 pb-24">
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
          <div className="w-full lg:w-96 shrink-0">
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
  const { items, updateQuantity, removeItem, subtotal, itemCount, isHydrated } = useCart();
  const { t, dir } = useLocale();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { formatPrice } = useDisplayCurrency();
  const fmt = (v: number) => formatPrice(v);
  const {
    freeDeliveryEnabled,
    cityFeeUsd,
    expressSurchargeUsd,
    freeDeliveryThresholdUsd: configThresholdUsd,
  } = useDeliveryConfig();
  const { countryCode, city: locationCity, country: locationCountry } = useLocationSelection();
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

  const cartTotal = deliveryFeeUsd !== null ? subtotal + deliveryFeeUsd : subtotal;

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

  const handleCouponToggle = () => {
    const next = !couponOpen;
    setCouponOpen(next);
  };

  const handleCouponApply = () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    try { localStorage.setItem(COUPON_STORAGE_KEY, code); } catch { /* best-effort */ }
    setCouponInput(code);
    setCouponApplied(true);
  };

  const handleCouponRemove = () => {
    try { localStorage.removeItem(COUPON_STORAGE_KEY); } catch { /* best-effort */ }
    setCouponInput("");
    setCouponApplied(false);
    setCouponOpen(false);
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
      <div className="min-h-[70vh] bg-white pt-32 pb-24 flex flex-col items-center justify-center container mx-auto px-page">
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
    <div className="min-h-screen bg-white pt-24 pb-24">
      <div className="container mx-auto px-page max-w-content">
        <h1 className="text-4xl font-serif mb-12">{t("cart.title")} ({itemCount})</h1>

        <div className="flex flex-col lg:flex-row gap-12">
          {/* Cart Items */}
          <div className="flex-1 min-w-0">
            {freeDeliveryEnabled !== false && (
              <FreeDeliveryBanner
                subtotal={subtotal}
                overrideThresholdUsd={thresholdUsd}
                className="mb-6"
              />
            )}
            <p className="text-xs font-semibold text-[#00414e] uppercase tracking-widest mb-5">
              {t("cart.deliverySummary")}
            </p>
            <div className="space-y-6">
            {items.map((item, index) => (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                key={item.product.id}
                className="flex gap-4 py-4 border-b"
              >
                <div className="w-20 md:w-24 aspect-square bg-secondary/50 rounded-2xl overflow-hidden shrink-0">
                  {item.product.image?.uri && (
                    <img src={item.product.image.uri} alt={item.product.name} className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex flex-col justify-between flex-1">
                  <div className="flex justify-between gap-4">
                    <div>
                      <h3 className="font-serif text-base leading-tight mb-1">{item.product.name}</h3>
                      <p className="text-sm text-muted-foreground">{fmt(item.product.priceValue)}</p>
                    </div>
                    <button
                      onClick={() => removeItem(item.product.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors h-fit p-1"
                      aria-label={t("cart.removeAria")}
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center border rounded-full overflow-hidden bg-background">
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                        className="px-3 py-1.5 hover:bg-secondary transition-colors"
                        aria-label={t("cart.decreaseAria")}
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-10 text-center text-sm font-medium">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                        className="px-3 py-1.5 hover:bg-secondary transition-colors"
                        aria-label={t("cart.increaseAria")}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="font-medium">{fmt(item.product.priceValue * item.quantity)}</p>
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Card Message Panel */}
            <div className="pt-2 pb-6">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
                <p className="text-xs font-semibold text-[#00414e] uppercase tracking-widest mb-5">
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

                {/* Preview Card */}
                <button
                  type="button"
                  onClick={() => setCardPreviewOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors hover:opacity-90"
                  style={{ borderColor: "rgba(0,65,78,0.35)", color: "#00414e", backgroundColor: "rgba(0,65,78,0.05)" }}
                  data-testid="button-preview-card"
                >
                  <Eye className="h-4 w-4" />
                  {t("checkout.previewCard")}
                </button>
              </div>

              <CartUpsells />
            </div>
            </div>
          </div>

          {/* Order Summary */}
          <div className="w-full lg:w-96 shrink-0">
            <div className="bg-secondary/30 rounded-3xl p-8 sticky top-32">
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
                  <div className="mt-2 flex gap-2">
                    <Input
                      value={couponInput}
                      onChange={(e) => {
                        setCouponInput(e.target.value);
                        if (couponApplied) setCouponApplied(false);
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") handleCouponApply(); }}
                      placeholder={t("cart.promoCodePlaceholder")}
                      className="rounded-lg text-sm uppercase"
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
                        disabled={!couponInput.trim()}
                        className="shrink-0 rounded-lg"
                        data-testid="button-promo-apply"
                      >
                        {t("cart.promoCodeApply")}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <h2 className="text-2xl font-serif mb-4">{t("cart.deliverySummary")}</h2>

              <div className="text-sm mb-6 pb-6 border-b border-primary/10">
                <DeliveryDateRow />
              </div>

              <div className="space-y-4 text-sm mb-6 pb-6 border-b border-primary/10">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("cart.subtotal")}</span>
                  <span className="font-medium">{fmt(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("cart.deliveryCharges")}</span>
                  <span className="font-medium">
                    {deliveryFeeUsd === null
                      ? <span className="text-muted-foreground text-xs">{t("cart.deliveryTbd")}</span>
                      : deliveryFeeUsd === 0
                        ? <span className="text-emerald-600">{t("cart.deliveryFree")}</span>
                        : fmt(deliveryFeeUsd)
                    }
                  </span>
                </div>
                {expressSurchargeUsd > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t("cart.expressNote").replace("{{amount}}", fmt(expressSurchargeUsd))}
                  </p>
                )}
              </div>

              <div className="flex justify-between items-center mb-8">
                <span className="font-medium">{t("cart.total")}</span>
                <span className="text-2xl font-serif">{fmt(cartTotal)}</span>
              </div>

              <Button asChild size="lg" className="w-full h-14 text-base rounded-xl">
                <Link
                  href="/checkout"
                  onClick={handleProceed}
                  data-testid="link-proceed-to-checkout"
                >
                  {t("cart.proceed")} <ArrowRight className={`w-4 h-4 ml-2 ${dir === "rtl" ? "rotate-180" : ""}`} />
                </Link>
              </Button>
            </div>
          </div>
        </div>
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
  dir,
  t,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cardTo: string;
  cardMessage: string;
  cardFrom: string;
  dir: "ltr" | "rtl";
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const trimmed = (cardMessage ?? "").trim();
  const len = trimmed.length;
  const messageFontPx = len === 0 ? 18 : len > 280 ? 14 : len > 180 ? 16 : len > 100 ? 18 : 20;
  const ink = "#F5E9D7";
  const toLabel = t("checkout.previewCardTo");
  const fromLabel = t("checkout.previewCardFrom");
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

  const renderCardBody = (includeWatermark: boolean) => (
    <>
      <img
        src={cardStationery}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="relative flex h-full flex-col justify-between p-7 text-center">
        <div
          className="font-serif text-lg"
          style={{ color: ink, opacity: cardTo ? 1 : 0.55 }}
        >
          {cardTo ? `${toLabel} ${cardTo}` : toLabel}
        </div>
        <div className="flex flex-1 items-center justify-center px-2 py-3">
          <p
            className="font-serif italic"
            style={{
              color: ink,
              fontSize: `${messageFontPx}px`,
              lineHeight: 1.5,
              opacity: trimmed.length > 0 ? 1 : 0.55,
              whiteSpace: "pre-wrap",
              overflowWrap: "break-word",
            }}
          >
            {trimmed.length > 0 ? trimmed : t("checkout.previewCardPlaceholder")}
          </p>
        </div>
        <div
          className="font-serif text-lg"
          style={{ color: ink, opacity: cardFrom ? 1 : 0.55 }}
        >
          {cardFrom ? `${fromLabel} ${cardFrom}` : fromLabel}
        </div>
      </div>
      {includeWatermark ? (
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-2"
          style={{
            ...(dir === "rtl" ? { left: "12px" } : { right: "12px" }),
            fontFamily: headingFont,
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
            style={{ aspectRatio: "1 / 1.35", backgroundColor: "#0d3b3a" }}
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
              aspectRatio: "1 / 1.35",
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
