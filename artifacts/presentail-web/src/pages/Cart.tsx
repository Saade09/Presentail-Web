import { useEffect, useState } from "react";
import { useCart } from "@/contexts/CartContext";
import { Link, useLocation } from "wouter";
import { trackEvent } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Minus, Plus, X, ArrowRight, ShoppingCart, MessageSquare, Pencil } from "lucide-react";
import { motion } from "framer-motion";
import { useLocale } from "@/contexts/LocaleContext";
import { useAuth } from "@/contexts/AuthContext";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import { FreeDeliveryBanner } from "@/components/cart/FreeDeliveryBanner";
import { CartUpsells } from "@/components/cart/CartUpsells";
import { useDeliveryConfig } from "@/components/product/useDeliveryConfig";
import { CheckoutLoginDialog } from "@/components/cart/CheckoutLoginDialog";
import { DeliveryDateRow } from "@/components/delivery/DeliveryDateRow";
import { SuggestedMessagesDialog } from "@/components/checkout/SuggestedMessagesDialog";

export const CARD_MESSAGE_KEY = "presentail_card_message_v1";

function CartSkeleton() {
  return (
    <div className="min-h-screen bg-white pt-24 pb-24">
      <div className="container mx-auto px-4 max-w-5xl">
        <Skeleton className="h-10 w-48 mb-12" />
        <div className="flex flex-col lg:flex-row gap-12">
          <div className="flex-1 space-y-8 min-w-0">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-6 py-6 border-b">
                <Skeleton className="w-24 md:w-32 aspect-square rounded-2xl shrink-0" />
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
              <Skeleton className="h-8 w-36 mb-6" />
              <div className="space-y-4 mb-6 pb-6 border-b border-primary/10">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                </div>
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
  const { freeDeliveryEnabled } = useDeliveryConfig();

  // Card message — persisted to localStorage so it pre-populates checkout.
  const [cardMessage, setCardMessage] = useState(() => {
    try { return localStorage.getItem(CARD_MESSAGE_KEY) ?? ""; } catch { return ""; }
  });
  const [messageOpen, setMessageOpen] = useState(() => {
    try { return (localStorage.getItem(CARD_MESSAGE_KEY) ?? "").length > 0; } catch { return false; }
  });
  const [suggestedOpen, setSuggestedOpen] = useState(false);

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

  const handleClearMessage = () => {
    handleMessageChange("");
    setMessageOpen(false);
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

  if (!isHydrated) {
    return <CartSkeleton />;
  }

  if (itemCount === 0) {
    return (
      <div className="min-h-[70vh] bg-white pt-32 pb-24 flex flex-col items-center justify-center container mx-auto px-4">
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
      <div className="container mx-auto px-4 max-w-5xl">
        <h1 className="text-4xl font-serif mb-12">{t("cart.title")} ({itemCount})</h1>

        <div className="flex flex-col lg:flex-row gap-12">
          {/* Cart Items */}
          <div className="flex-1 min-w-0">
            {freeDeliveryEnabled !== false && (
              <FreeDeliveryBanner subtotal={subtotal} className="mb-6" />
            )}
            <div className="space-y-8">
            {items.map((item, index) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                key={item.product.id} 
                className="flex gap-6 py-6 border-b"
              >
                <div className="w-24 md:w-32 aspect-square bg-secondary/50 rounded-2xl overflow-hidden shrink-0">
                  {item.product.image?.uri && (
                    <img src={item.product.image.uri} alt={item.product.name} className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex flex-col justify-between flex-1">
                  <div className="flex justify-between gap-4">
                    <div>
                      <h3 className="font-serif text-lg leading-tight mb-1">{item.product.name}</h3>
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

            {/* Gift Card & Message */}
            <div className="pt-2 pb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-serif">{t("cart.cardMessage.title")}</h2>
                <span className="text-xs font-medium text-primary bg-primary/10 rounded-full px-2.5 py-0.5">
                  {t("cart.cardMessage.free")}
                </span>
              </div>

              <div className="mb-3">
                {/* Message panel — full width */}
                {messageOpen ? (
                  <div className="rounded-2xl border border-primary/30 bg-primary/5 flex flex-col overflow-hidden">
                    <textarea
                      value={cardMessage}
                      onChange={(e) => handleMessageChange(e.target.value)}
                      placeholder={t("cart.cardMessage.placeholder")}
                      maxLength={400}
                      rows={4}
                      className="resize-none bg-transparent p-4 text-sm outline-none placeholder:text-muted-foreground/60 leading-relaxed"
                      data-testid="input-cart-card-message"
                      autoFocus
                    />
                    <div className={`flex gap-2 px-4 pb-3 ${dir === "rtl" ? "flex-row-reverse" : ""}`}>
                      <button
                        type="button"
                        onClick={() => setSuggestedOpen(true)}
                        className="text-[11px] text-primary/70 hover:text-primary transition-colors flex items-center gap-1"
                        data-testid="button-cart-message-suggestions"
                      >
                        <Pencil className="w-3 h-3" />
                        {t("cart.cardMessage.suggestions")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMessageOpen(true)}
                    className="w-full rounded-2xl border-2 border-dashed border-primary/25 bg-secondary/20 py-8 flex flex-col items-center justify-center gap-2 hover:border-primary/50 hover:bg-primary/5 transition-colors group"
                    data-testid="button-cart-add-message"
                  >
                    <MessageSquare className="w-7 h-7 text-primary/30 group-hover:text-primary/60 transition-colors" />
                    <span className="text-sm font-medium text-muted-foreground group-hover:text-primary/80 transition-colors">
                      {t("cart.cardMessage.addMessage")}
                    </span>
                  </button>
                )}
              </div>

              {/* Actions row when message exists */}
              {cardMessage.trim().length > 0 && (
                <div className={`flex gap-3 items-center ${dir === "rtl" ? "flex-row-reverse" : ""}`}>
                  <button
                    type="button"
                    onClick={() => setMessageOpen(true)}
                    className="text-xs text-primary underline underline-offset-2 hover:opacity-75 transition-opacity"
                  >
                    {t("cart.cardMessage.edit")}
                  </button>
                  <span className="text-muted-foreground/40 text-xs">·</span>
                  <button
                    type="button"
                    onClick={handleClearMessage}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-destructive transition-colors"
                  >
                    {t("cart.cardMessage.clear")}
                  </button>
                </div>
              )}

              {!messageOpen && !cardMessage.trim() && (
                <button
                  type="button"
                  onClick={() => setSuggestedOpen(true)}
                  className="text-xs text-primary/70 hover:text-primary transition-colors underline underline-offset-2"
                  data-testid="button-cart-message-suggestions-empty"
                >
                  {t("cart.cardMessage.suggestions")}
                </button>
              )}
            </div>

            <CartUpsells />
            </div>
          </div>

          {/* Order Summary */}
          <div className="w-full lg:w-96 shrink-0">
            <div className="bg-secondary/30 rounded-3xl p-8 sticky top-32">
              <h2 className="text-2xl font-serif mb-6">{t("cart.summary")}</h2>

              <div className="space-y-4 text-sm mb-6 pb-6 border-b border-primary/10">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("cart.subtotal")}</span>
                  <span className="font-medium">{fmt(subtotal)}</span>
                </div>
                <DeliveryDateRow />
              </div>

              <div className="flex justify-between items-center mb-8">
                <span className="font-medium">{t("cart.total")}</span>
                <span className="text-2xl font-serif">{fmt(subtotal)}</span>
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
          setMessageOpen(true);
          setSuggestedOpen(false);
        }}
        maxLength={400}
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
