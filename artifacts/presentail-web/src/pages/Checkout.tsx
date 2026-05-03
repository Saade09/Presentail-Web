import { useState } from "react";
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

type PaymentMethodId = "card" | "paypal" | "whish" | "mamo";

const PENDING_ORDER_KEY = "presentail_pending_order_v1";

export default function Checkout() {
  const { items, subtotal, clearCart, itemCount } = useCart();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t, dir } = useLocale();
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

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>("card");

  if (itemCount === 0) {
    return (
      <div className="min-h-screen pt-32 pb-24 text-center">
        <h1 className="text-3xl font-serif mb-4">{t("checkout.empty.title")}</h1>
        <Button asChild data-testid="button-back-to-shop"><Link href="/shop">{t("checkout.empty.cta")}</Link></Button>
      </div>
    );
  }

  const total = subtotal + 5;
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
    district: recipient.district || "Beirut",
    districtFee: 5,
    expressFee: 0,
    deliveryDetails: recipient.address,
    deliveryDate: recipient.deliveryDate,
    cardMessage: recipient.cardMessage,
    paymentMethod,
    currencyCode: "USD",
    ...(overrides.paymentRef ? { paymentRef: overrides.paymentRef } : {}),
  });

  const finalizeOrderNow = async (paymentRef?: string) => {
    const payload = buildOrderPayload({ paymentRef });
    const res = await createOrder.mutateAsync(payload);
    if (res.ok) {
      clearCart();
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
          district: recipient.district || "Beirut",
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
          district: recipient.district || "Beirut",
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

  const lbCities = locations?.countries.find((c) => c.code === "LB")?.cities || [];

  const paymentOptions: { id: PaymentMethodId; labelKey: string }[] = [
    { id: "card", labelKey: "checkout.pay.card" },
    { id: "paypal", labelKey: "checkout.pay.paypal" },
    { id: "mamo", labelKey: "checkout.pay.mamo" },
    { id: "whish", labelKey: "checkout.pay.whish" },
  ];

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
                    <label className="text-sm font-medium">{t("checkout.phoneLB")}</label>
                    <Input value={recipient.phone} onChange={(e) => setRecipient({ ...recipient, phone: e.target.value })} placeholder={t("checkout.phonePh")} data-testid="input-recipient-phone" />
                  </div>

                  <div className="space-y-2 mb-4">
                    <label className="text-sm font-medium">{t("checkout.district")}</label>
                    <Select value={recipient.district} onValueChange={(v) => setRecipient({ ...recipient, district: v })}>
                      <SelectTrigger data-testid="select-district">
                        <SelectValue placeholder={t("checkout.selectDistrict")} />
                      </SelectTrigger>
                      <SelectContent>
                        {lbCities.map((city) => (
                          <SelectItem key={city.id} value={city.name}>{city.name}</SelectItem>
                        ))}
                        {lbCities.length === 0 && <SelectItem value="Beirut">Beirut</SelectItem>}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 mb-4">
                    <label className="text-sm font-medium">{t("checkout.address")}</label>
                    <Input value={recipient.address} onChange={(e) => setRecipient({ ...recipient, address: e.target.value })} placeholder={t("checkout.addressPh")} data-testid="input-recipient-address" />
                  </div>

                  <div className="space-y-2 mb-4">
                    <label className="text-sm font-medium">{t("checkout.deliveryDate")}</label>
                    <Input type="date" value={recipient.deliveryDate} onChange={(e) => setRecipient({ ...recipient, deliveryDate: e.target.value })} min={new Date().toISOString().split("T")[0]} data-testid="input-delivery-date" />
                  </div>

                  <div className="space-y-2 mb-8">
                    <label className="text-sm font-medium">{t("checkout.cardMessage")}</label>
                    <Input value={recipient.cardMessage} onChange={(e) => setRecipient({ ...recipient, cardMessage: e.target.value })} placeholder={t("checkout.cardMessagePh")} data-testid="input-card-message" />
                  </div>

                  <Button size="lg" className="w-full h-14 rounded-xl" onClick={() => setStep(2)} disabled={!recipient.firstName || !recipient.phone || !recipient.address} data-testid="button-continue-to-sender">
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

                  <div className="space-y-2 mb-8">
                    <label className="text-sm font-medium">{t("checkout.phoneNumber")}</label>
                    <Input value={sender.phone} onChange={(e) => setSender({ ...sender, phone: e.target.value })} data-testid="input-sender-phone" />
                  </div>

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
                      {isProcessing ? t("checkout.processing") : t("checkout.payAmount", { amount: total.toFixed(2) })}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="w-full lg:w-96 shrink-0">
            <div className="bg-secondary/30 rounded-3xl p-6 lg:p-8 sticky top-32">
              <h3 className="text-xl font-serif mb-6">{t("checkout.summary")}</h3>
              <div className="space-y-4 mb-6 max-h-60 overflow-y-auto">
                {items.map((item) => (
                  <div key={item.product.id} className="flex gap-4" data-testid={`row-summary-${item.product.id}`}>
                    <div className="w-16 h-16 bg-background rounded-lg overflow-hidden shrink-0">
                      {item.product.image?.uri && <img src={item.product.image.uri} alt={item.product.name} className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium line-clamp-1">{item.product.name}</p>
                      <p className="text-xs text-muted-foreground">{t("checkout.qty")}: {item.quantity}</p>
                      <p className="text-sm font-medium mt-1">${(item.product.priceValue * item.quantity).toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-3 pt-6 border-t text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>{t("cart.subtotal")}</span>
                  <span data-testid="text-subtotal">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>{t("checkout.deliveryEstimated")}</span>
                  <span>$5.00</span>
                </div>
                <div className="flex justify-between font-medium text-lg pt-3 border-t">
                  <span>{t("cart.total")}</span>
                  <span data-testid="text-total">${total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
