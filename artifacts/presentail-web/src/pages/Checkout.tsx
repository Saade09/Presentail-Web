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

type PaymentMethodId = "card" | "paypal" | "whish" | "mamo";

const PENDING_ORDER_KEY = "presentail_pending_order_v1";

export default function Checkout() {
  const { items, subtotal, clearCart, itemCount } = useCart();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
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
        <h1 className="text-3xl font-serif mb-4">Your bag is empty</h1>
        <Button asChild data-testid="button-back-to-shop"><Link href="/shop">Back to Shop</Link></Button>
      </div>
    );
  }

  const total = subtotal + 5;
  const isProcessing =
    createOrder.isPending ||
    stripeSession.isPending ||
    mamoPayment.isPending ||
    paypalPayment.isPending;

  const buildOrderPayload = (overrides: { paymentRef?: string } = {}) => ({
    orderId: `web-${Date.now()}`,
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
      toast({ title: "Checkout Failed", description: res.message || "An error occurred", variant: "destructive" });
    }
  };

  const stashAndRedirect = (url: string) => {
    const payload = buildOrderPayload();
    sessionStorage.setItem(
      PENDING_ORDER_KEY,
      JSON.stringify({ payload, createdAt: Date.now() }),
    );
    window.location.href = url;
  };

  const handleSubmit = async () => {
    try {
      const origin = window.location.origin;
      const base = import.meta.env.BASE_URL.replace(/\/$/, ""); // e.g. "/web"
      const successUrl = `${origin}${base}/order-confirmed?status=success&pid={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${origin}${base}/order-confirmed?status=failed`;
      const returnUrl = `${origin}${base}/order-confirmed?status=success`;
      const failureUrl = `${origin}${base}/order-confirmed?status=failed`;

      if (paymentMethod === "card") {
        const res = await stripeSession.mutateAsync({
          items: items.map((i) => ({
            name: i.product.name,
            amount: Math.round(i.product.priceValue * 100),
            quantity: i.quantity,
            image: i.product.image?.uri,
          })),
          currency: "USD",
          email: sender.email,
          successUrl,
          cancelUrl,
        });
        if (!res.ok || !res.url) {
          toast({
            title: "Payment unavailable",
            description: res.message || "Card payments aren't available right now.",
            variant: "destructive",
          });
          return;
        }
        stashAndRedirect(res.url);
        return;
      }

      if (paymentMethod === "paypal") {
        const orderRefId = `web-${Date.now()}`;
        const res = await paypalPayment.mutateAsync({
          amount: total,
          currency: "USD",
          returnUrl,
          cancelUrl: failureUrl,
          orderId: orderRefId,
        });
        if (!res.ok || !res.url) {
          toast({
            title: "PayPal unavailable",
            description: res.message || "PayPal isn't available right now.",
            variant: "destructive",
          });
          return;
        }
        stashAndRedirect(res.url);
        return;
      }

      if (paymentMethod === "mamo") {
        const res = await mamoPayment.mutateAsync({
          amount: total,
          currency: "USD",
          title: "Presentail Order",
          description: `Order from ${sender.firstName} ${sender.lastName}`.trim(),
          email: sender.email,
          firstName: sender.firstName,
          lastName: sender.lastName,
          returnUrl,
          failureReturnUrl: failureUrl,
        });
        if (!res.ok || !res.url) {
          toast({
            title: "Mamo unavailable",
            description: res.message || "Mamo isn't available right now.",
            variant: "destructive",
          });
          return;
        }
        stashAndRedirect(res.url);
        return;
      }

      // Offline payment methods (Whish) — finalize immediately, unpaid.
      await finalizeOrderNow();
    } catch (e: any) {
      toast({ title: "Checkout Error", description: e.message, variant: "destructive" });
    }
  };

  const lbCities = locations?.countries.find((c) => c.code === "LB")?.cities || [];

  return (
    <div className="min-h-screen pt-24 pb-24 bg-background">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="mb-8 flex items-center justify-between border-b pb-8">
          <Link href="/cart" className="inline-flex items-center text-sm font-medium hover:text-primary transition-colors" data-testid="link-back-to-cart">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Cart
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
                  <h2 className="text-3xl font-serif mb-2">Who is receiving this?</h2>
                  <p className="text-muted-foreground mb-8">Enter the recipient's details for delivery.</p>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">First Name</label>
                      <Input value={recipient.firstName} onChange={(e) => setRecipient({ ...recipient, firstName: e.target.value })} placeholder="Jane" data-testid="input-recipient-first-name" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Last Name</label>
                      <Input value={recipient.lastName} onChange={(e) => setRecipient({ ...recipient, lastName: e.target.value })} placeholder="Doe" data-testid="input-recipient-last-name" />
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    <label className="text-sm font-medium">Phone Number (Lebanon)</label>
                    <Input value={recipient.phone} onChange={(e) => setRecipient({ ...recipient, phone: e.target.value })} placeholder="+961 70 123 456" data-testid="input-recipient-phone" />
                  </div>

                  <div className="space-y-2 mb-4">
                    <label className="text-sm font-medium">Delivery District</label>
                    <Select value={recipient.district} onValueChange={(v) => setRecipient({ ...recipient, district: v })}>
                      <SelectTrigger data-testid="select-district">
                        <SelectValue placeholder="Select a district" />
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
                    <label className="text-sm font-medium">Full Address Details</label>
                    <Input value={recipient.address} onChange={(e) => setRecipient({ ...recipient, address: e.target.value })} placeholder="Street, Building, Floor..." data-testid="input-recipient-address" />
                  </div>

                  <div className="space-y-2 mb-4">
                    <label className="text-sm font-medium">Delivery Date</label>
                    <Input type="date" value={recipient.deliveryDate} onChange={(e) => setRecipient({ ...recipient, deliveryDate: e.target.value })} min={new Date().toISOString().split("T")[0]} data-testid="input-delivery-date" />
                  </div>

                  <div className="space-y-2 mb-8">
                    <label className="text-sm font-medium">Card Message (Optional)</label>
                    <Input value={recipient.cardMessage} onChange={(e) => setRecipient({ ...recipient, cardMessage: e.target.value })} placeholder="Write a note to go with your gift" data-testid="input-card-message" />
                  </div>

                  <Button size="lg" className="w-full h-14 rounded-xl" onClick={() => setStep(2)} disabled={!recipient.firstName || !recipient.phone || !recipient.address} data-testid="button-continue-to-sender">
                    Continue to Sender Details
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                <div>
                  <h2 className="text-3xl font-serif mb-2">Sender Details</h2>
                  <p className="text-muted-foreground mb-8">We need this to send your receipt and updates.</p>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">First Name</label>
                      <Input value={sender.firstName} onChange={(e) => setSender({ ...sender, firstName: e.target.value })} data-testid="input-sender-first-name" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Last Name</label>
                      <Input value={sender.lastName} onChange={(e) => setSender({ ...sender, lastName: e.target.value })} data-testid="input-sender-last-name" />
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    <label className="text-sm font-medium">Email Address</label>
                    <Input type="email" value={sender.email} onChange={(e) => setSender({ ...sender, email: e.target.value })} data-testid="input-sender-email" />
                  </div>

                  <div className="space-y-2 mb-8">
                    <label className="text-sm font-medium">Phone Number</label>
                    <Input value={sender.phone} onChange={(e) => setSender({ ...sender, phone: e.target.value })} data-testid="input-sender-phone" />
                  </div>

                  <div className="flex gap-4">
                    <Button variant="outline" size="lg" className="h-14 rounded-xl px-8" onClick={() => setStep(1)} data-testid="button-back-to-recipient">Back</Button>
                    <Button size="lg" className="flex-1 h-14 rounded-xl" onClick={() => setStep(3)} disabled={!sender.firstName || !sender.email} data-testid="button-continue-to-payment">
                      Continue to Payment
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                <div>
                  <h2 className="text-3xl font-serif mb-2">Payment</h2>
                  <p className="text-muted-foreground mb-8">Choose how you'd like to pay securely. You'll be redirected to your provider to complete payment.</p>

                  <div className="space-y-3 mb-8">
                    {([
                      { id: "card", label: "Credit / Debit Card (Stripe)" },
                      { id: "paypal", label: "PayPal" },
                      { id: "mamo", label: "Mamo (UAE Wallets)" },
                      { id: "whish", label: "Whish Money (pay on confirmation)" },
                    ] as { id: PaymentMethodId; label: string }[]).map((m) => (
                      <div
                        key={m.id}
                        className={`p-4 border rounded-xl cursor-pointer transition-all ${paymentMethod === m.id ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "hover:bg-secondary/50"}`}
                        onClick={() => setPaymentMethod(m.id)}
                        data-testid={`option-payment-${m.id}`}
                      >
                        <div className="flex items-center gap-3">
                          {paymentMethod === m.id ? <CheckCircle2 className="w-5 h-5 text-primary" /> : <Circle className="w-5 h-5 text-muted-foreground" />}
                          <span className="font-medium">{m.label}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-4">
                    <Button variant="outline" size="lg" className="h-14 rounded-xl px-8" onClick={() => setStep(2)} data-testid="button-back-to-sender">Back</Button>
                    <Button size="lg" className="flex-1 h-14 rounded-xl" onClick={handleSubmit} disabled={isProcessing} data-testid="button-submit-payment">
                      {isProcessing ? "Processing..." : `Pay $${total.toFixed(2)}`}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="w-full lg:w-96 shrink-0">
            <div className="bg-secondary/30 rounded-3xl p-6 lg:p-8 sticky top-32">
              <h3 className="text-xl font-serif mb-6">Order Summary</h3>
              <div className="space-y-4 mb-6 max-h-60 overflow-y-auto">
                {items.map((item) => (
                  <div key={item.product.id} className="flex gap-4" data-testid={`row-summary-${item.product.id}`}>
                    <div className="w-16 h-16 bg-background rounded-lg overflow-hidden shrink-0">
                      {item.product.image?.uri && <img src={item.product.image.uri} alt={item.product.name} className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium line-clamp-1">{item.product.name}</p>
                      <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                      <p className="text-sm font-medium mt-1">${(item.product.priceValue * item.quantity).toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-3 pt-6 border-t text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span data-testid="text-subtotal">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Delivery (Estimated)</span>
                  <span>$5.00</span>
                </div>
                <div className="flex justify-between font-medium text-lg pt-3 border-t">
                  <span>Total</span>
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
