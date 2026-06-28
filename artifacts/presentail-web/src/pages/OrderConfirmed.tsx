import { useSearch, Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, CalendarDays } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCreateOrder } from "@/lib/queries";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { trackEvent } from "@/lib/analytics";
import { trackFbEvent } from "@/lib/fbPixel";
import { fireAdsPurchaseConversion } from "@/lib/gtag";
import { FormattedPrice } from "@/components/FormattedPrice";

const PENDING_ORDER_KEY = "presentail_pending_order_v1";

// A stashed pending-order payload older than this is treated as missing. This
// stops a stale tab (or a bookmarked /order-confirmed URL) left open for hours
// or days from silently replaying an abandoned payload into createOrder. The
// stash carries a `createdAt` timestamp written by Checkout at every write site.
const PENDING_ORDER_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

// After this many consecutive failed finalize attempts we stop re-offering the
// Retry CTA and escalate the shopper to "contact us with your payment reference"
// so a permanently-rejected payload can't loop them forever.
const MAX_FINALIZE_ATTEMPTS = 3;

type FinalizeState =
  | { kind: "idle" }
  | { kind: "finalizing" }
  | { kind: "success"; ref: string }
  | { kind: "failed"; message?: string };

type OrderItem = { name: string; quantity: number; price: number; image?: string };

type ConfirmedOrder = {
  items?: OrderItem[];
  cardMessage?: string;
  deliveryDate?: string;
  deliverySlot?: string;
  deliverySlotTime?: string;
  districtFee?: number;
  expressFee?: number;
  slotFee?: number;
  totalUsd?: number;
  paymentMethod?: string;
};

type StashedEntry = { payload: ConfirmedOrder; createdAt: number };

// Single source of truth for reading the pending-order stash. Returns null when
// the entry is missing, unparseable, malformed, or older than
// PENDING_ORDER_MAX_AGE_MS — so every caller (display and recovery) treats a
// stale payload as if it were never there.
function readStashedEntry(): StashedEntry | null {
  try {
    const stashed = sessionStorage.getItem(PENDING_ORDER_KEY);
    if (!stashed) return null;
    const parsed = JSON.parse(stashed) as {
      payload?: ConfirmedOrder;
      createdAt?: number;
    };
    if (!parsed || typeof parsed !== "object" || !parsed.payload) return null;
    const createdAt = typeof parsed.createdAt === "number" ? parsed.createdAt : 0;
    if (!createdAt || Date.now() - createdAt > PENDING_ORDER_MAX_AGE_MS) {
      return null;
    }
    return { payload: parsed.payload, createdAt };
  } catch {
    return null;
  }
}

function parseStashedOrder(): ConfirmedOrder | null {
  return readStashedEntry()?.payload ?? null;
}

function formatDeliveryDate(iso: string, language: string): string {
  try {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const locale = language === "ar" ? "ar-LB" : language === "fr" ? "fr-FR" : "en-US";
    return date.toLocaleDateString(locale, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso;
  }
}

const PAYMENT_METHOD_KEYS: Record<string, string> = {
  card: "order.summary.pay.card",
  paypal: "order.summary.pay.paypal",
  whish: "order.summary.pay.whish",
  mamo: "order.summary.pay.mamo",
  wallet: "order.summary.pay.wallet",
  western: "order.summary.pay.western",
};

type OrderSummaryProps = {
  order: ConfirmedOrder;
  t: (key: string) => string;
  language: string;
};

function OrderSummary({ order, t, language }: OrderSummaryProps) {
  const items = order.items ?? [];
  const subtotal = items.reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
  const deliveryFee = (Number(order.expressFee) || 0) + (Number(order.slotFee) || 0) + (Number(order.districtFee) || 0);
  const rawTotal = Number(order.totalUsd);
  const total = Number.isFinite(rawTotal) ? rawTotal : subtotal + deliveryFee;
  const payKey = order.paymentMethod ? (PAYMENT_METHOD_KEYS[order.paymentMethod] ?? null) : null;
  const payLabel = payKey ? t(payKey) : order.paymentMethod ?? "";

  return (
    <div data-testid="order-summary" className="bg-secondary/50 rounded-2xl p-4 my-2 sm:p-6 sm:my-4 space-y-5 text-start">
      {items.length > 0 && (
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">{t("order.summary.items")}</p>
          <ul className="space-y-3">
            {items.map((item, idx) => (
              <li key={idx} className="flex items-center gap-3 text-sm">
                {item.image && (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-12 h-12 rounded-lg object-cover shrink-0"
                  />
                )}
                <span className="flex-1 min-w-0 truncate">
                  {item.name}
                  <span className="text-muted-foreground"> × {item.quantity}</span>
                </span>
                <span className="shrink-0 font-medium">
                  <FormattedPrice usdValue={(Number(item.price) || 0) * (Number(item.quantity) || 1)} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {order.cardMessage && order.cardMessage.trim() !== "" && (
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">{t("order.summary.cardMessage")}</p>
          <div className="relative rounded-xl overflow-hidden shadow-sm border border-primary/10">
            <div className="absolute inset-0 bg-[#fdf8f2]" />
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/30 via-primary/60 to-primary/30" />
            <div className="relative px-5 py-4">
              <p className="font-serif text-sm leading-relaxed text-neutral-700 whitespace-pre-wrap">
                {order.cardMessage}
              </p>
            </div>
          </div>
        </div>
      )}

      {(order.deliveryDate || order.deliverySlot) && (
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">{t("order.summary.delivery")}</p>
          <div className="flex items-center gap-2 text-sm">
            <CalendarDays className="w-4 h-4 shrink-0 text-primary" />
            <span>
              {order.deliveryDate ? formatDeliveryDate(order.deliveryDate, language) : ""}
              {(order.deliverySlotTime ?? order.deliverySlot) && order.deliveryDate ? " · " : ""}
              {order.deliverySlotTime ?? order.deliverySlot ?? ""}
            </span>
          </div>
        </div>
      )}

      <div className="border-t border-border/50 pt-4 space-y-1.5">
        {items.length > 0 && (
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{t("order.summary.subtotal")}</span>
            <FormattedPrice usdValue={subtotal} />
          </div>
        )}
        {deliveryFee > 0 && (
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{t("order.summary.deliveryFee")}</span>
            <FormattedPrice usdValue={deliveryFee} />
          </div>
        )}
        <div className="flex justify-between text-sm font-semibold pt-1">
          <span>{t("order.summary.total")}</span>
          <FormattedPrice usdValue={total} />
        </div>
      </div>

      {payLabel && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{t("order.summary.paymentMethod")}</span>
          <span className="text-xs font-medium bg-primary/10 text-primary rounded-full px-3 py-1">
            {payLabel}
          </span>
        </div>
      )}
    </div>
  );
}

export default function OrderConfirmed() {
  const searchString = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const [, setLocation] = useLocation();
  const { t, language } = useLocale();
  const { user, isLoading: authLoading } = useAuth();

  const status = searchParams.get("status") || "success";
  const refFromUrl = searchParams.get("ref");
  const paymentRef =
    searchParams.get("pid") ||
    searchParams.get("session_id") ||
    searchParams.get("token") ||
    undefined;

  const createOrder = useCreateOrder();
  const { clearCart } = useCart();

  const initial: FinalizeState = (() => {
    if (status !== "success") return { kind: "failed" };
    if (refFromUrl) return { kind: "success", ref: refFromUrl };
    // A missing OR stale (expired) stash short-circuits to a graceful failure so
    // we never enter the finalizing state and call createOrder for an old payload.
    if (!readStashedEntry()) return { kind: "failed", message: t("order.fail.cantFind") };
    return { kind: "finalizing" };
  })();

  const [state, setState] = useState<FinalizeState>(initial);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const triedRef = useRef(false);
  const purchaseFiredRef = useRef(false);

  // For the inline-payment path (?ref= set on URL), the stashed payload is still
  // in sessionStorage when this component first mounts — read it eagerly.
  const [confirmedOrder, setConfirmedOrder] = useState<ConfirmedOrder | null>(() => {
    if (status !== "success" || !refFromUrl) return null;
    return parseStashedOrder();
  });

  // Fire Purchase for the inline-payment success path: Checkout.tsx sets ?ref=<orderRef>
  // on the URL and redirects here without going through the createOrder.mutate flow, so
  // state initialises directly to { kind: "success" }.
  // We gate on `authLoading` so that on a full-page reload (redirect-based payments) the
  // session has time to hydrate before we send the event — this ensures user.email is
  // available for signed-in shoppers. purchaseFiredRef prevents double-fire once auth settles.
  useEffect(() => {
    if (state.kind !== "success") return;
    if (authLoading) return;
    if (purchaseFiredRef.current) return;
    purchaseFiredRef.current = true;
    let value = 0;
    let currency = "USD";
    try {
      const stashed = sessionStorage.getItem(PENDING_ORDER_KEY);
      if (stashed) {
        const parsed = JSON.parse(stashed) as { payload?: Record<string, unknown> };
        if (typeof parsed?.payload?.totalUsd === "number") value = parsed.payload.totalUsd;
        if (typeof parsed?.payload?.currencyCode === "string") currency = parsed.payload.currencyCode;
      }
    } catch { /* best-effort — safe fallback to 0 / USD */ }
    trackFbEvent("Purchase", {
      value,
      currency,
      event_id: `fbpurchase-${state.ref}`,
      ...(user?.email ? { userData: { em: user.email } } : {}),
    });
    fireAdsPurchaseConversion({ transactionId: state.ref, value, currency });
  // state is included so the effect re-runs if the FinalizeState reference changes.
  // authLoading/user are included so the event fires after session hydration on
  // full-page reloads (redirect-based payment returns). purchaseFiredRef prevents
  // the event from being sent more than once.
  }, [state, authLoading, user]);

  useEffect(() => {
    if (state.kind !== "finalizing" || triedRef.current) return;
    triedRef.current = true;

    // Treats missing, unparseable, AND expired payloads as missing — a stale
    // payload must never be replayed into createOrder. We drop the stash so a
    // reload cannot keep retrying an order we have deliberately abandoned.
    const entry = readStashedEntry();
    if (!entry) {
      setState({ kind: "failed", message: t("order.fail.missing") });
      sessionStorage.removeItem(PENDING_ORDER_KEY);
      return;
    }

    const parsed = entry;
    // The runtime payload carries fields (orderId, currencyCode, …) beyond the
    // display-only ConfirmedOrder shape; keep it loosely typed for createOrder.
    const payload = { ...(parsed.payload as any), ...(paymentRef ? { paymentRef } : {}) };

    const chosenMethod = payload?.paymentMethod as
      | "card"
      | "paypal"
      | "whish"
      | "mamo"
      | undefined;

    createOrder.mutate(payload, {
      onSuccess: (res) => {
        // Capture the order summary before removing the stash.
        const captured: ConfirmedOrder | null = parsed.payload ?? null;
        if (res.ok) {
          // Only clear the stashed payload once the order is confirmed created.
          // On failure we keep it so a reload can retry — the shopper may
          // already have been charged for a card payment.
          sessionStorage.removeItem(PENDING_ORDER_KEY);
          clearCart();
          try { localStorage.removeItem("presentail_coupon_v1"); } catch { /* best-effort */ }
          // Funnel terminal: shoppers who completed a redirect-based
          // payment (Stripe / Mamo / PayPal) only land on order_placed
          // here, since the Checkout page emits it for the inline path.
          trackEvent({
            name: "order_placed",
            surface: "checkout",
            ...(chosenMethod ? { action: chosenMethod } : {}),
          });
          const orderRef = String(payload.orderId ?? res.osOrderId ?? res.wcOrderId);
          if (!purchaseFiredRef.current) {
            purchaseFiredRef.current = true;
            const purchaseValue = typeof payload.totalUsd === "number" ? payload.totalUsd : 0;
            const purchaseCurrency = (payload.currencyCode as string | undefined) ?? "USD";
            trackFbEvent("Purchase", {
              value: purchaseValue,
              currency: purchaseCurrency,
              event_id: `fbpurchase-${orderRef}`,
              ...(user?.email ? { userData: { em: user.email } } : {}),
            });
            fireAdsPurchaseConversion({ transactionId: orderRef, value: purchaseValue, currency: purchaseCurrency });
          }
          // Order created — clear the consecutive-failure counter.
          setFailedAttempts(0);
          setConfirmedOrder(captured);
          setState({ kind: "success", ref: orderRef });
        } else {
          setFailedAttempts((c) => c + 1);
          setState({ kind: "failed", message: res.message || t("order.fail.couldntCreate") });
        }
      },
      onError: (err: any) => {
        // Keep the stashed payload so a reload can retry — the shopper may
        // already have been charged for a card payment.
        setFailedAttempts((c) => c + 1);
        setState({ kind: "failed", message: err?.message || t("order.fail.failed") });
      },
    });
  }, [state.kind, paymentRef, createOrder, clearCart, t]);

  if (state.kind === "finalizing") {
    return (
      <div className="h-screen overflow-hidden flex items-center justify-center container mx-auto max-w-content px-4">
        <div data-testid="order-confirmed-scroll-container" className="max-h-screen overflow-y-auto max-w-md w-full text-center space-y-6 animate-in fade-in py-8">
          <div className="flex justify-center">
            <Loader2 className="w-16 h-16 text-primary animate-spin" />
          </div>
          <h1 className="text-3xl font-serif">{t("order.finalizing")}</h1>
          <p className="text-muted-foreground">{t("order.dontClose")}</p>
        </div>
      </div>
    );
  }

  const isSuccess = state.kind === "success";
  const ref = state.kind === "success" ? state.ref : "—";

  // After too many consecutive failed finalize attempts we stop re-offering
  // Retry — a permanently-rejected payload would otherwise loop the shopper
  // forever. Escalate them to "contact us with your payment reference" instead.
  const retriesExhausted = failedAttempts >= MAX_FINALIZE_ATTEMPTS;

  // A failed finalize keeps the stashed payload so the shopper — who may already
  // have been charged — can replay it without losing the order. Surface a retry
  // CTA whenever a pending payload is still present and we haven't hit the cap;
  // otherwise fall back to the "return to checkout" CTA / escalation message.
  const canRetry =
    state.kind === "failed" &&
    !retriesExhausted &&
    sessionStorage.getItem(PENDING_ORDER_KEY) !== null;

  const handleRetry = () => {
    // Re-arm the finalize effect: resetting triedRef lets it run again, and
    // moving back to "finalizing" re-renders the loading screen and replays
    // the stashed payload through createOrder.
    triedRef.current = false;
    setState({ kind: "finalizing" });
  };

  return (
    <div className="h-screen overflow-hidden flex items-center justify-center container mx-auto max-w-content px-4">
      <div data-testid="order-confirmed-scroll-container" className="max-h-screen overflow-y-auto max-w-md w-full text-center space-y-3 sm:space-y-6 animate-in zoom-in-95 duration-500 py-8 sm:py-16">
        <div className="flex justify-center">
          {isSuccess ? (
            <CheckCircle2 className="w-14 h-14 sm:w-24 sm:h-24 text-primary" data-testid="icon-success" />
          ) : (
            <XCircle className="w-14 h-14 sm:w-24 sm:h-24 text-destructive" data-testid="icon-failed" />
          )}
        </div>

        <h1 className="text-2xl sm:text-4xl font-serif" data-testid="text-confirmation-title">
          {isSuccess ? t("order.confirmed") : t("order.failed")}
        </h1>

        <p
          className="text-muted-foreground text-base sm:text-lg"
          data-testid="text-confirmation-message"
        >
          {isSuccess
            ? t("order.thanks")
            : retriesExhausted
              ? t("order.fail.exhausted")
              : (state.kind === "failed" && state.message) || t("order.failGeneric")}
        </p>

        {isSuccess && (
          <div className="bg-secondary/50 rounded-2xl p-4 my-2 sm:p-6 sm:my-8 space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">{t("order.reference")}</p>
              <p className="font-mono text-xl font-medium tracking-wider" data-testid="text-order-ref">{ref}</p>
            </div>
          </div>
        )}

        {!isSuccess && retriesExhausted && paymentRef && (
          <div className="bg-secondary/50 rounded-2xl p-4 my-2 sm:p-6 sm:my-8 space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">{t("order.reference")}</p>
              <p
                className="font-mono text-xl font-medium tracking-wider break-all"
                data-testid="text-payment-ref"
              >
                {paymentRef}
              </p>
            </div>
          </div>
        )}

        {isSuccess && confirmedOrder && (
          <OrderSummary order={confirmedOrder} t={t} language={language} />
        )}

        <div className="pt-2 sm:pt-4 space-y-3">
          {canRetry ? (
            <Button
              size="lg"
              className="rounded-full px-8"
              onClick={handleRetry}
              data-testid="button-retry-order"
            >
              {t("order.retry")}
            </Button>
          ) : (
            <Button
              size="lg"
              className="rounded-full px-8"
              onClick={() => setLocation(isSuccess ? "/shop" : "/checkout")}
              data-testid="button-confirmation-cta"
            >
              {isSuccess ? t("order.continueShopping") : t("order.returnCheckout")}
            </Button>
          )}

          {canRetry && (
            <div className="text-sm text-muted-foreground">
              <button
                type="button"
                onClick={() => setLocation("/checkout")}
                className="hover:text-primary underline-offset-4 hover:underline"
                data-testid="button-return-checkout"
              >
                {t("order.returnCheckout")}
              </button>
            </div>
          )}
        </div>

        {!isSuccess && (
          <div className="text-sm text-muted-foreground">
            <Link href="/" className="hover:text-primary">{t("order.backHome")}</Link>
          </div>
        )}
      </div>
    </div>
  );
}
