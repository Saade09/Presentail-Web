import { useSearch, Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, CalendarDays } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCreateOrder } from "@/lib/queries";
import { useCart } from "@/contexts/CartContext";
import { useLocale } from "@/contexts/LocaleContext";
import { trackEvent } from "@/lib/analytics";
import { trackFbEvent } from "@/lib/fbPixel";
import { FormattedPrice } from "@/components/FormattedPrice";

const PENDING_ORDER_KEY = "presentail_pending_order_v1";

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

function parseStashedOrder(): ConfirmedOrder | null {
  try {
    const stashed = sessionStorage.getItem(PENDING_ORDER_KEY);
    if (!stashed) return null;
    const parsed = JSON.parse(stashed) as { payload?: ConfirmedOrder };
    return parsed?.payload ?? null;
  } catch {
    return null;
  }
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
    <div className="bg-secondary/50 rounded-2xl p-6 my-4 space-y-5 text-start max-h-[60vh] overflow-y-auto">
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
          <blockquote className="border-s-2 border-primary/30 ps-3 italic text-sm text-muted-foreground">
            {order.cardMessage}
          </blockquote>
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
    const stashed = sessionStorage.getItem(PENDING_ORDER_KEY);
    if (!stashed) return { kind: "failed", message: t("order.fail.cantFind") };
    return { kind: "finalizing" };
  })();

  const [state, setState] = useState<FinalizeState>(initial);
  const triedRef = useRef(false);
  const purchaseFiredRef = useRef(false);

  // For the inline-payment path (?ref= set on URL), the stashed payload is still
  // in sessionStorage when this component first mounts — read it eagerly.
  const [confirmedOrder, setConfirmedOrder] = useState<ConfirmedOrder | null>(() => {
    if (status !== "success" || !refFromUrl) return null;
    return parseStashedOrder();
  });

  // Fire Purchase immediately for the inline-payment success path: Checkout.tsx
  // sets ?ref=<orderRef> on the URL and redirects here without going through the
  // createOrder.mutate flow, so state initialises directly to { kind: "success" }.
  // Read real total/currency from the stashed payload when available; fall back to
  // safe zeros so the event is always sent. purchaseFiredRef prevents double-fire.
  useEffect(() => {
    if (state.kind !== "success") return;
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
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state.kind !== "finalizing" || triedRef.current) return;
    triedRef.current = true;

    const stashed = sessionStorage.getItem(PENDING_ORDER_KEY);
    if (!stashed) {
      setState({ kind: "failed", message: t("order.fail.missing") });
      return;
    }

    let parsed: { payload: any; createdAt: number };
    try {
      parsed = JSON.parse(stashed);
    } catch {
      setState({ kind: "failed", message: t("order.fail.couldntRead") });
      sessionStorage.removeItem(PENDING_ORDER_KEY);
      return;
    }

    const payload = { ...parsed.payload, ...(paymentRef ? { paymentRef } : {}) };

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
        sessionStorage.removeItem(PENDING_ORDER_KEY);
        if (res.ok) {
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
            trackFbEvent("Purchase", {
              value: typeof payload.totalUsd === "number" ? payload.totalUsd : 0,
              currency: (payload.currencyCode as string | undefined) ?? "USD",
              event_id: `fbpurchase-${orderRef}`,
            });
          }
          setConfirmedOrder(captured);
          setState({ kind: "success", ref: orderRef });
        } else {
          setState({ kind: "failed", message: res.message || t("order.fail.couldntCreate") });
        }
      },
      onError: (err: any) => {
        sessionStorage.removeItem(PENDING_ORDER_KEY);
        setState({ kind: "failed", message: err?.message || t("order.fail.failed") });
      },
    });
  }, [state.kind, paymentRef, createOrder, clearCart, t]);

  if (state.kind === "finalizing") {
    return (
      <div className="min-h-[80vh] pt-32 pb-24 flex items-center justify-center container mx-auto max-w-content px-4">
        <div className="max-w-md w-full text-center space-y-6 animate-in fade-in">
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

  return (
    <div className="min-h-[80vh] pt-32 pb-24 flex items-center justify-center container mx-auto max-w-content px-4">
      <div className="max-w-md w-full text-center space-y-6 animate-in zoom-in-95 duration-500">
        <div className="flex justify-center">
          {isSuccess ? (
            <CheckCircle2 className="w-24 h-24 text-primary" data-testid="icon-success" />
          ) : (
            <XCircle className="w-24 h-24 text-destructive" data-testid="icon-failed" />
          )}
        </div>

        <h1 className="text-4xl font-serif" data-testid="text-confirmation-title">
          {isSuccess ? t("order.confirmed") : t("order.failed")}
        </h1>

        <p className="text-muted-foreground text-lg">
          {isSuccess
            ? t("order.thanks")
            : (state.kind === "failed" && state.message) || t("order.failGeneric")}
        </p>

        {isSuccess && (
          <div className="bg-secondary/50 rounded-2xl p-6 my-8 space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">{t("order.reference")}</p>
              <p className="font-mono text-xl font-medium tracking-wider" data-testid="text-order-ref">{ref}</p>
            </div>
          </div>
        )}

        {isSuccess && confirmedOrder && (
          <OrderSummary order={confirmedOrder} t={t} language={language} />
        )}

        <div className="pt-4">
          <Button
            size="lg"
            className="rounded-full px-8"
            onClick={() => setLocation(isSuccess ? "/shop" : "/checkout")}
            data-testid="button-confirmation-cta"
          >
            {isSuccess ? t("order.continueShopping") : t("order.returnCheckout")}
          </Button>
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
