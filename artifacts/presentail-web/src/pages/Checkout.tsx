import { useState, useEffect, useRef, useMemo } from "react";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useCreateOrder,
  useDeliveryLocations,
  useStripeCheckoutSession,
  useMamoPayment,
  usePaypalPayment,
} from "@/lib/queries";
import { ArrowLeft, CheckCircle2, Circle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import { FreeDeliveryBanner } from "@/components/cart/FreeDeliveryBanner";
import { PaymentMethods } from "@/components/product/PaymentMethods";
import { CheckoutLoginDialog } from "@/components/cart/CheckoutLoginDialog";
import { trackEvent } from "@/lib/analytics";
import {
  dayLabels,
  expressSurchargeForCountry,
  formatDeliveryRow,
  isExpressDeliveryAvailable,
  timeSlotsForCountry,
} from "@workspace/delivery";

type PaymentMethodId = "card" | "paypal" | "whish" | "mamo";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const PENDING_ORDER_KEY = "presentail_pending_order_v1";

export default function Checkout() {
  const { items, subtotal, clearCart, itemCount } = useCart();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  // Mirror the cart-button gate for direct visits to /checkout: signed-out
  // shoppers see the same dismissible login prompt; dismissing returns them
  // to the cart with no state lost. Suppressed once they've explicitly
  // chosen "Checkout as Guest" so they're not re-prompted on every render.
  // The cart's guest button forwards `?guest=1` so we don't double-prompt
  // when transitioning from the cart-side dialog to /checkout.
  const [guestAcked, setGuestAcked] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("guest") === "1";
  });
  const showLoginGate = !authLoading && !user && !guestAcked;
  const { toast } = useToast();
  const { t, dir } = useLocale();
  const { countryCode, country } = useLocationSelection();
  const { formatPrice } = useDisplayCurrency();
  const fmt = (v: number) => formatPrice(v);
  const createOrder = useCreateOrder();
  const stripeSession = useStripeCheckoutSession();
  const mamoPayment = useMamoPayment();
  const paypalPayment = usePaypalPayment();
  const { data: locations } = useDeliveryLocations();

  const [step, setStep] = useState(1);

  const [recipient, setRecipient] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    district: "",
    address: "",
    deliveryDate: "",
    cardMessage: "",
  });

  const [sender, setSender] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    email: user?.email || "",
    phone: user?.phone || "",
  });

  const timeSlots = timeSlotsForCountry(countryCode);
  const [deliverySlot, setDeliverySlot] = useState<string>(timeSlots[0]?.label ?? "");
  const [deliveryMode, setDeliveryMode] = useState<"express" | "schedule">("schedule");
  const [paymentMethod, setPaymentMethodState] = useState<PaymentMethodId>("card");
  // Wrap the setter so user-driven payment-method picks emit a funnel
  // event. We deliberately do NOT instrument the auto-fallback effect
  // below (e.g. AE customers being switched off whish) so the funnel
  // reflects shopper intent, not server-driven correction.
  const setPaymentMethod = (m: PaymentMethodId) => {
    setPaymentMethodState((prev) => {
      if (prev !== m) {
        trackEvent({
          name: "payment_method_selected",
          surface: "checkout",
          action: m,
        });
      }
      return m;
    });
  };
  const [noAddress, setNoAddress] = useState(false);
  const [identitySecret, setIdentitySecret] = useState(false);

  // Express Delivery (1–3 hrs) is offered only between 8 AM and 10 PM in
  // the recipient country's local time, mirroring the mobile rule. When
  // it's no longer available we silently fall back to the scheduled flow
  // so the order can still be placed.
  const expressAvailable = useMemo(
    () => isExpressDeliveryAvailable(countryCode),
    [countryCode],
  );
  const expressSurcharge = expressSurchargeForCountry(countryCode);
  useEffect(() => {
    if (deliveryMode === "express" && !expressAvailable) {
      setDeliveryMode("schedule");
    }
  }, [deliveryMode, expressAvailable]);

  // Emit exactly one checkout_started event per checkout mount, but only
  // after auth has resolved AND the shopper is allowed past the login
  // gate (signed in or explicitly continuing as guest). Without the
  // `authLoading` guard the effect would fire during the brief loading
  // window — when `showLoginGate` is still false because `user` hasn't
  // hydrated yet — and double-count signed-out shoppers who then bounce
  // off the prompt, corrupting the cart→checkout ratio. The ref makes
  // the emission idempotent across the auth-loading → resolved
  // transition.
  const checkoutStartedRef = useRef(false);
  useEffect(() => {
    if (authLoading) return;
    if (showLoginGate) return;
    if (checkoutStartedRef.current) return;
    checkoutStartedRef.current = true;
    trackEvent({ name: "checkout_started", surface: "checkout" });
  }, [authLoading, showLoginGate]);

  const prevCountryRef = useRef(countryCode);
  useEffect(() => {
    if (countryCode !== prevCountryRef.current) {
      prevCountryRef.current = countryCode;
      setRecipient((r) => ({ ...r, district: "" }));
      const newSlots = timeSlotsForCountry(countryCode);
      setDeliverySlot(newSlots[0]?.label ?? "");
    }
  }, [countryCode]);

  if (showLoginGate) {
    return (
      <CheckoutLoginDialog
        open
        onOpenChange={(open) => {
          if (!open) setLocation("/cart");
        }}
        onContinueAsGuest={() => setGuestAcked(true)}
        surface="checkout-direct"
      />
    );
  }

  if (itemCount === 0) {
    return (
      <div className="min-h-screen pt-32 pb-24 text-center">
        <h1 className="text-3xl font-serif mb-4">{t("checkout.empty.title")}</h1>
        <Button asChild data-testid="button-back-to-shop"><Link href="/shop">{t("checkout.empty.cta")}</Link></Button>
      </div>
    );
  }

  const currentCountryCities = locations?.countries.find((c) => c.code === countryCode)?.cities || [];
  const WEB_DISTRICT_FEES: Record<string, number> = {
    Akkar: 39, Aley: 19, Baabda: 11, Baalbeck: 39, Batroun: 19, Bcharee: 39,
    Beirut: 8, "Bent Jbeil": 39, Chouf: 29, Hasbaya: 39, Hermel: 39, Jbail: 19,
    Jezzine: 29, Kasserwan: 11, Koura: 29, Marjayoun: 39, Metn: 11,
    "Minnieh-Dennaya": 39, Nabatieh: 39, Rechaya: 39, Saida: 29, Tripoli: 29,
    Tyre: 39, "West Bekaa": 39, Zahle: 29, Zghorta: 39,
    Dubai: 13.61, "Ras Al Khaimah": 13.61, "Umm Al Quwain": 13.61,
    Fujairah: 13.61, Ajman: 13.61, Sharjah: 13.61, "Abu Dhabi": 13.61,
    Larnaca: 11, Limassol: 11, Nicosia: 11, Paphos: 11,
  };
  const FREE_DELIVERY_THRESHOLD = countryCode === "AE" ? 89.84 : countryCode === "CY" ? 120 : 130;
  const selectedDistrict = recipient.district || currentCountryCities[0]?.name || "";
  const baseFee = noAddress ? 35 : (WEB_DISTRICT_FEES[selectedDistrict] ?? 0);
  const districtFee = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : baseFee;
  const expressFee = deliveryMode === "express" ? expressSurcharge : 0;
  const total = subtotal + districtFee + expressFee;

  // Build a "Today · 2:00 PM – 6:00 PM" / "Wed 13 · …" / "Express Delivery"
  // line for the order summary so the shopper can confirm their pick at a
  // glance before paying — mirrors the mobile checkout summary.
  const summaryDays = useMemo(
    () => dayLabels(t("checkout.day.today"), t("checkout.day.tomorrow")),
    [t],
  );
  const deliveryRowText = formatDeliveryRow({
    mode: deliveryMode,
    date: recipient.deliveryDate,
    slotLabel: deliverySlot,
    days: summaryDays,
    expressLabel: t("checkout.expressDeliveryLabel"),
  });
  const isProcessing =
    createOrder.isPending ||
    stripeSession.isPending ||
    mamoPayment.isPending ||
    paypalPayment.isPending;

  // orderId is generated once per checkout attempt and threaded through the
  // payment session creation AND the WC order payload so the server can bind
  // them together and reject any replay of a paid session for a different order.
  const buildOrderPayload = (overrides: { paymentRef?: string; orderId?: string } = {}) => ({
    orderId: overrides.orderId ?? `web-${Date.now()}`,
    items: items.map((i) => ({
      name: i.product.name,
      quantity: i.quantity,
      price: i.product.priceValue,
      wcId: i.product.wcId,
    })),
    billing: {
      firstName: sender.firstName,
      lastName: sender.lastName,
      email: sender.email,
      phone: sender.phone,
    },
    recipient: {
      firstName: recipient.firstName,
      lastName: recipient.lastName,
      phone: recipient.phone,
    },
    district: recipient.district || (currentCountryCities[0]?.name ?? "Beirut"),
    districtFee: districtFee,
    expressFee,
    noAddress,
    deliveryDetails: noAddress ? "To be confirmed" : recipient.address,
    deliveryDate: deliveryMode === "express" ? todayIso() : recipient.deliveryDate,
    deliverySlot: deliveryMode === "express" ? t("checkout.expressDeliveryLabel") : deliverySlot,
    cardMessage: recipient.cardMessage,
    paymentMethod,
    identitySecret,
    currencyCode: "USD",
    ...(overrides.paymentRef ? { paymentRef: overrides.paymentRef } : {}),
  });

  const finalizeOrderNow = async (paymentRef?: string) => {
    const payload = buildOrderPayload({ paymentRef });
    const res = await createOrder.mutateAsync(payload);
    if (res.ok) {
      clearCart();
      trackEvent({
        name: "order_placed",
        surface: "checkout",
        action: paymentMethod,
      });
      setLocation(`/order-confirmed?status=success&ref=${res.wcOrderId || payload.orderId}`);
    } else {
      toast({ title: t("checkout.toast.failTitle"), description: res.message || t("checkout.toast.failGeneric"), variant: "destructive" });
    }
  };

  // Stash the order payload to sessionStorage so the post-redirect page can
  // finalize the WC order using the SAME orderId that was bound to the payment
  // session. Passing orderId here ensures the paymentRef↔orderId binding
  // created by the server during session creation is preserved end-to-end.
  const stashAndRedirect = (url: string, orderId: string) => {
    const payload = buildOrderPayload({ orderId });
    sessionStorage.setItem(
      PENDING_ORDER_KEY,
      JSON.stringify({ payload, createdAt: Date.now() }),
    );
    window.location.href = url;
  };

  const handleSubmit = async () => {
    try {
      const origin = window.location.origin;
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const successUrl = `${origin}${base}/order-confirmed?status=success&pid={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${origin}${base}/order-confirmed?status=failed`;
      const returnUrl = `${origin}${base}/order-confirmed?status=success`;
      const failureUrl = `${origin}${base}/order-confirmed?status=failed`;

      // Generate orderId ONCE and pass it to the payment endpoint AND the
      // order payload so both sides reference the same order ID.
      const orderId = `web-${Date.now()}`;

      if (paymentMethod === "card") {
        const res = await stripeSession.mutateAsync({
          // Send wcId + quantity; the server resolves prices from the
          // WooCommerce catalog so the client cannot manipulate the charge.
          items: items.map((i) => ({
            wcId: i.product.wcId,
            quantity: i.quantity,
            name: i.product.name,
            image: i.product.image?.uri,
          })),
          // orderId sent to the server so it can bind the Stripe session to
          // this specific order (prevents replay for a different order).
          orderId,
          currency: "USD",
          email: sender.email,
          successUrl,
          cancelUrl,
        });
        if (!res.ok || !res.url) {
          toast({
            title: t("checkout.toast.cardUnavailable"),
            description: res.message || t("checkout.toast.cardUnavailableDesc"),
            variant: "destructive",
          });
          return;
        }
        stashAndRedirect(res.url, orderId);
        return;
      }

      if (paymentMethod === "paypal") {
        const res = await paypalPayment.mutateAsync({
          items: items.map((i) => ({ wcId: i.product.wcId, quantity: i.quantity })),
          district: recipient.district || (currentCountryCities[0]?.name ?? "Beirut"),
          expressDelivery: deliveryMode === "express",
          noAddress,
          currency: "USD",
          returnUrl,
          cancelUrl: failureUrl,
          orderId,
        });
        if (!res.ok || !res.url) {
          toast({
            title: t("checkout.toast.paypalUnavailable"),
            description: res.message || t("checkout.toast.paypalUnavailableDesc"),
            variant: "destructive",
          });
          return;
        }
        stashAndRedirect(res.url, orderId);
        return;
      }

      if (paymentMethod === "mamo") {
        const res = await mamoPayment.mutateAsync({
          items: items.map((i) => ({ wcId: i.product.wcId, quantity: i.quantity })),
          orderId,
          district: recipient.district || (currentCountryCities[0]?.name ?? "Beirut"),
          expressDelivery: deliveryMode === "express",
          noAddress,
          currency: "USD",
          title: t("checkout.payment.orderTitle"),
          description: t("checkout.payment.orderDesc", { name: `${sender.firstName} ${sender.lastName}`.trim() }),
          email: sender.email,
          firstName: sender.firstName,
          lastName: sender.lastName,
          returnUrl,
          failureReturnUrl: failureUrl,
        });
        if (!res.ok || !res.url) {
          toast({
            title: t("checkout.toast.mamoUnavailable"),
            description: res.message || t("checkout.toast.mamoUnavailableDesc"),
            variant: "destructive",
          });
          return;
        }
        stashAndRedirect(res.url, orderId);
        return;
      }

      await finalizeOrderNow();
    } catch (e: any) {
      toast({ title: t("checkout.toast.errorTitle"), description: e.message, variant: "destructive" });
    }
  };

  // Mamo only settles in AED. For the Lebanon storefront we hide it
  // whenever the active display currency is not AED (in practice always,
  // since LB displays in USD), but the rule is written in full so that if
  // a customer ever switches the LB display currency to AED, Mamo would
  // reappear — matching the mobile behaviour. UAE/Cyprus keep showing it.
  const activeCurrency =
    countryCode === "AE" ? "AED" : countryCode === "CY" ? "EUR" : "USD";
  const mamoHidden = countryCode === "LB" && activeCurrency !== "AED";
  // Whish Money is a Lebanon-only local transfer flow — only show it when
  // the active country is Lebanon, so a UAE/Cyprus shopper browsing in USD
  // doesn't see a payment option that doesn't apply to their region.
  // PayPal is hidden in UAE because Mamo is the natural local option there;
  // even a UAE shopper browsing in USD shouldn't see it.
  const paypalHidden = countryCode === "AE";
  const paymentOptions: { id: PaymentMethodId; labelKey: string }[] = [
    { id: "card", labelKey: "checkout.pay.card" },
    ...(paypalHidden ? [] : [{ id: "paypal" as const, labelKey: "checkout.pay.paypal" }]),
    ...(mamoHidden ? [] : [{ id: "mamo" as const, labelKey: "checkout.pay.mamo" }]),
    ...(countryCode === "LB"
      ? [{ id: "whish" as const, labelKey: "checkout.pay.whish" }]
      : []),
  ];

  // If the currently selected payment method becomes unavailable (Whish on
  // a non-LB country, Mamo when hidden, or PayPal in UAE), fall back to a
  // default so the pay button stays valid.
  useEffect(() => {
    if (paymentMethod === "whish" && countryCode !== "LB") {
      setPaymentMethodState("card");
    } else if (paymentMethod === "mamo" && mamoHidden) {
      setPaymentMethodState("card");
    } else if (paymentMethod === "paypal" && paypalHidden) {
      setPaymentMethodState("card");
    }
  }, [countryCode, paymentMethod, mamoHidden, paypalHidden]);

  return (
    <div className="min-h-screen pt-24 pb-24 bg-background">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="mb-8 flex items-center justify-between border-b pb-8">
          <Link href="/cart" className="inline-flex items-center text-sm font-medium hover:text-primary transition-colors" data-testid="link-back-to-cart">
            <ArrowLeft className={`w-4 h-4 mr-2 ${dir === "rtl" ? "rotate-180" : ""}`} /> {t("checkout.backToCart")}
          </Link>
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2">
                {s < step ? <CheckCircle2 className="w-5 h-5 text-primary" /> : <Circle className={`w-5 h-5 ${s === step ? "fill-primary text-primary" : "text-muted-foreground"}`} />}
                {s < 3 && <div className="w-8 h-px bg-border" />}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-12">
          <div className="flex-1">
            {step === 1 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                <div>
                  <h2 className="text-3xl font-serif mb-2">{t("checkout.step1.title")}</h2>
                  <p className="text-muted-foreground mb-8">{t("checkout.step1.desc")}</p>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("checkout.firstName")}</label>
                      <Input value={recipient.firstName} onChange={(e) => setRecipient({ ...recipient, firstName: e.target.value })} placeholder={t("checkout.firstNamePh")} data-testid="input-recipient-first-name" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("checkout.lastName")}</label>
                      <Input value={recipient.lastName} onChange={(e) => setRecipient({ ...recipient, lastName: e.target.value })} placeholder={t("checkout.lastNamePh")} data-testid="input-recipient-last-name" />
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    <label className="text-sm font-medium">{t("checkout.phoneLB", { country: country?.name ?? "Lebanon" })}</label>
                    <Input value={recipient.phone} onChange={(e) => setRecipient({ ...recipient, phone: e.target.value })} placeholder={t("checkout.phonePh")} data-testid="input-recipient-phone" />
                  </div>

                  <label className="flex items-start gap-3 mb-4 cursor-pointer select-none" data-testid="check-no-address-label">
                    <input
                      type="checkbox"
                      checked={noAddress}
                      onChange={(e) => setNoAddress(e.target.checked)}
                      className="mt-1 h-4 w-4 accent-primary cursor-pointer"
                      data-testid="check-no-address"
                    />
                    <span className="text-sm">{t("checkout.dontKnowAddress")}</span>
                  </label>

                  {noAddress ? (
                    <p className="text-xs text-muted-foreground mb-4" data-testid="text-no-address-note">
                      {t("checkout.dontKnowAddressNote")}
                    </p>
                  ) : (
                    <>
                      <div className="space-y-2 mb-4">
                        <label className="text-sm font-medium">{t("checkout.district")}</label>
                        <Select value={recipient.district} onValueChange={(v) => setRecipient({ ...recipient, district: v })}>
                          <SelectTrigger data-testid="select-district">
                            <SelectValue placeholder={t("checkout.selectDistrict")} />
                          </SelectTrigger>
                          <SelectContent>
                            {currentCountryCities.map((city) => (
                              <SelectItem key={city.id} value={city.name}>{city.name}</SelectItem>
                            ))}
                            {currentCountryCities.length === 0 && <SelectItem value="Beirut">Beirut</SelectItem>}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2 mb-4">
                        <label className="text-sm font-medium">{t("checkout.address")}</label>
                        <Input value={recipient.address} onChange={(e) => setRecipient({ ...recipient, address: e.target.value })} placeholder={t("checkout.addressPh")} data-testid="input-recipient-address" />
                      </div>
                    </>
                  )}

                  <div className="space-y-2 mb-4">
                    <label className="text-sm font-medium">{t("checkout.deliveryWhen")}</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => expressAvailable && setDeliveryMode("express")}
                        disabled={!expressAvailable}
                        className={`px-3 py-3 rounded-xl border text-sm font-medium transition-colors text-left ${
                          deliveryMode === "express"
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-foreground hover:border-foreground/20"
                        } ${!expressAvailable ? "opacity-50 cursor-not-allowed" : ""}`}
                        data-testid="delivery-mode-express"
                      >
                        <div className="font-semibold">{t("checkout.expressDelivery")}</div>
                        <div className="text-xs opacity-80 mt-0.5">
                          {expressAvailable
                            ? `+${fmt(expressSurcharge)}`
                            : t("checkout.expressUnavailable")}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeliveryMode("schedule")}
                        className={`px-3 py-3 rounded-xl border text-sm font-medium transition-colors text-left ${
                          deliveryMode === "schedule"
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-foreground hover:border-foreground/20"
                        }`}
                        data-testid="delivery-mode-schedule"
                      >
                        <div className="font-semibold">{t("checkout.scheduleDelivery")}</div>
                        <div className="text-xs opacity-80 mt-0.5">{t("checkout.scheduleDeliveryDesc")}</div>
                      </button>
                    </div>
                  </div>

                  {deliveryMode === "schedule" && (
                    <>
                      <div className="space-y-2 mb-4">
                        <label className="text-sm font-medium">{t("checkout.deliveryDate")}</label>
                        <Input type="date" value={recipient.deliveryDate} onChange={(e) => setRecipient({ ...recipient, deliveryDate: e.target.value })} min={new Date().toISOString().split("T")[0]} data-testid="input-delivery-date" />
                      </div>

                      <div className="space-y-2 mb-4">
                        <label className="text-sm font-medium">{t("checkout.deliveryTime")}</label>
                        <div className="grid grid-cols-2 gap-2">
                          {timeSlots.map((s) => (
                            <button
                              key={s.label}
                              type="button"
                              onClick={() => setDeliverySlot(s.label)}
                              className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                                deliverySlot === s.label
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-card text-foreground hover:border-foreground/20"
                              }`}
                              data-testid={`slot-${s.cutoffHour}`}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  <div className="space-y-2 mb-8">
                    <label className="text-sm font-medium">{t("checkout.cardMessage")}</label>
                    <Input value={recipient.cardMessage} onChange={(e) => setRecipient({ ...recipient, cardMessage: e.target.value })} placeholder={t("checkout.cardMessagePh")} data-testid="input-card-message" />
                  </div>

                  <Button size="lg" className="w-full h-14 rounded-xl" onClick={() => setStep(2)} disabled={!recipient.firstName || !recipient.phone || (!noAddress && !recipient.address)} data-testid="button-continue-to-sender">
                    {t("checkout.continueSender")}
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                <div>
                  <h2 className="text-3xl font-serif mb-2">{t("checkout.step2.title")}</h2>
                  <p className="text-muted-foreground mb-8">{t("checkout.step2.desc")}</p>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("checkout.firstName")}</label>
                      <Input value={sender.firstName} onChange={(e) => setSender({ ...sender, firstName: e.target.value })} data-testid="input-sender-first-name" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("checkout.lastName")}</label>
                      <Input value={sender.lastName} onChange={(e) => setSender({ ...sender, lastName: e.target.value })} data-testid="input-sender-last-name" />
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    <label className="text-sm font-medium">{t("checkout.emailAddress")}</label>
                    <Input type="email" value={sender.email} onChange={(e) => setSender({ ...sender, email: e.target.value })} data-testid="input-sender-email" />
                  </div>

                  <div className="space-y-2 mb-4">
                    <label className="text-sm font-medium">{t("checkout.phoneNumber")}</label>
                    <Input value={sender.phone} onChange={(e) => setSender({ ...sender, phone: e.target.value })} data-testid="input-sender-phone" />
                  </div>

                  <label className="flex items-start gap-3 mb-8 cursor-pointer select-none" data-testid="check-identity-secret-label">
                    <input
                      type="checkbox"
                      checked={identitySecret}
                      onChange={(e) => setIdentitySecret(e.target.checked)}
                      className="mt-1 h-4 w-4 accent-primary cursor-pointer"
                      data-testid="check-identity-secret"
                    />
                    <span className="text-sm">{t("checkout.keepIdentitySecret")}</span>
                  </label>

                  <div className="flex gap-4">
                    <Button variant="outline" size="lg" className="h-14 rounded-xl px-8" onClick={() => setStep(1)} data-testid="button-back-to-recipient">{t("checkout.back")}</Button>
                    <Button size="lg" className="flex-1 h-14 rounded-xl" onClick={() => setStep(3)} disabled={!sender.firstName || !sender.email} data-testid="button-continue-to-payment">
                      {t("checkout.continuePayment")}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                <div>
                  <h2 className="text-3xl font-serif mb-2">{t("checkout.step3.title")}</h2>
                  <p className="text-muted-foreground mb-8">{t("checkout.step3.desc")}</p>

                  <PaymentMethods
                    label={t("payments.waysToPay")}
                    countryCode={countryCode}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6"
                  />

                  <div className="space-y-3 mb-8">
                    {paymentOptions.map((m) => (
                      <div
                        key={m.id}
                        className={`p-4 border rounded-xl cursor-pointer transition-all ${paymentMethod === m.id ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "hover:bg-secondary/50"}`}
                        onClick={() => setPaymentMethod(m.id)}
                        data-testid={`option-payment-${m.id}`}
                      >
                        <div className="flex items-center gap-3">
                          {paymentMethod === m.id ? <CheckCircle2 className="w-5 h-5 text-primary" /> : <Circle className="w-5 h-5 text-muted-foreground" />}
                          <span className="font-medium">{t(m.labelKey)}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-4">
                    <Button variant="outline" size="lg" className="h-14 rounded-xl px-8" onClick={() => setStep(2)} data-testid="button-back-to-sender">{t("checkout.back")}</Button>
                    <Button size="lg" className="flex-1 h-14 rounded-xl" onClick={handleSubmit} disabled={isProcessing} data-testid="button-submit-payment">
                      {isProcessing ? t("checkout.processing") : t("checkout.payAmount", { amount: fmt(total) })}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="w-full lg:w-96 shrink-0">
            <div className="bg-secondary/30 rounded-3xl p-6 lg:p-8 sticky top-32">
              <h3 className="text-xl font-serif mb-6">{t("checkout.summary")}</h3>
              <FreeDeliveryBanner className="mb-6" />
              <div className="space-y-4 mb-6 max-h-60 overflow-y-auto">
                {items.map((item) => (
                  <div key={item.product.id} className="flex gap-4" data-testid={`row-summary-${item.product.id}`}>
                    <div className="w-16 h-16 bg-background rounded-lg overflow-hidden shrink-0">
                      {item.product.image?.uri && <img src={item.product.image.uri} alt={item.product.name} className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium line-clamp-1">{item.product.name}</p>
                      <p className="text-xs text-muted-foreground">{t("checkout.qty")}: {item.quantity}</p>
                      <p className="text-sm font-medium mt-1">{fmt(item.product.priceValue * item.quantity)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-3 pt-6 border-t text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>{t("cart.subtotal")}</span>
                  <span data-testid="text-subtotal">{fmt(subtotal)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground gap-4" data-testid="row-delivery-when">
                  <span className="shrink-0">{t("checkout.summary.delivery")}</span>
                  <span className="text-right text-foreground">
                    {deliveryRowText ?? t("checkout.summary.deliveryNotSet")}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>{t("checkout.deliveryEstimated")}</span>
                  <span>{fmt(districtFee)}</span>
                </div>
                {expressFee > 0 && (
                  <div className="flex justify-between text-muted-foreground" data-testid="row-express-fee">
                    <span>{t("checkout.expressDeliveryLabel")}</span>
                    <span>{fmt(expressFee)}</span>
                  </div>
                )}
                <div className="flex justify-between font-medium text-lg pt-3 border-t">
                  <span>{t("cart.total")}</span>
                  <span data-testid="text-total">{fmt(total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
