import { useEffect, useState } from "react";
import { useCart } from "@/contexts/CartContext";
import { Link, useLocation } from "wouter";
import { trackEvent } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Minus, Plus, X, ArrowRight, ShoppingBag } from "lucide-react";
import { motion } from "framer-motion";
import { useLocale } from "@/contexts/LocaleContext";
import { useAuth } from "@/contexts/AuthContext";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import { FreeDeliveryBanner } from "@/components/cart/FreeDeliveryBanner";
import { CartUpsells } from "@/components/cart/CartUpsells";
import { CheckoutLoginDialog } from "@/components/cart/CheckoutLoginDialog";
import { DeliveryDateRow } from "@/components/delivery/DeliveryDateRow";

export default function Cart() {
  const { items, updateQuantity, removeItem, subtotal, itemCount } = useCart();
  const { t, dir } = useLocale();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { formatPrice } = useDisplayCurrency();
  const fmt = (v: number) => formatPrice(v);
  // Mirror the mobile checkout login sheet: when a logged-out shopper taps
  // Proceed to Checkout we open a dismissible prompt that offers email +
  // social sign-in or a clearly visible "Checkout as Guest" button. Signed-in
  // shoppers (and the brief auth-loading window) bypass the prompt entirely.
  const [loginOpen, setLoginOpen] = useState(false);
  const handleProceed = (e: React.MouseEvent) => {
    if (authLoading || user) return;
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

  if (itemCount === 0) {
    return (
      <div className="min-h-[70vh] pt-32 pb-24 flex flex-col items-center justify-center container mx-auto px-4">
        <div className="w-24 h-24 bg-secondary/50 rounded-full flex items-center justify-center mb-8 text-primary/40">
          <ShoppingBag className="w-10 h-10" />
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
    <div className="min-h-screen pt-24 pb-24">
      <div className="container mx-auto px-4 max-w-5xl">
        <h1 className="text-4xl font-serif mb-12">{t("cart.title")} ({itemCount})</h1>

        <div className="flex flex-col lg:flex-row gap-12">
          {/* Cart Items */}
          <div className="flex-1 space-y-8 min-w-0">
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

            <CartUpsells />
          </div>

          {/* Order Summary */}
          <div className="w-full lg:w-96 shrink-0">
            <div className="bg-secondary/30 rounded-3xl p-8 sticky top-32">
              <h2 className="text-2xl font-serif mb-6">{t("cart.summary")}</h2>

              <FreeDeliveryBanner className="mb-6" subtotal={subtotal} />

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
      <CheckoutLoginDialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onContinueAsGuest={goToCheckout}
        surface="cart"
      />
    </div>
  );
}
