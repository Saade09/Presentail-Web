import { useSearch, Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, CalendarDays, MapPin, User, Phone } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCreateOrder } from "@/lib/queries";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { trackEvent, trackWebEvent } from "@/lib/analytics";
import { trackFbEvent } from "@/lib/fbPixel";
import { fireAdsPurchaseConversion } from "@/lib/gtag";
import { FormattedPrice } from "@/components/FormattedPrice";
import { COUPON_STORAGE_KEY, COUPON_DISCOUNT_KEY, ORDER_NOTE_KEY } from "./Cart";

const PENDING_ORDER_KEY = "presentail_pending_order_v1";
const ADS_CONVERSION_KEY_PREFIX = "presentail_ads_conversion_fired_";

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

type OrderItem = { name: string; quantity: number; price: number; image?: string; customInput?: string };

type ConfirmedOrder = {
  items?: OrderItem[];
  cardMessage?: string;
  cardTo?: string;
  cardFrom?: string;
  deliveryDate?: string;
  deliverySlot?: string;
  deliverySlotTime?: string;
  districtFee?: number;
  expressFee?: number;
  slotFee?: number;
  totalUsd?: number;
  paymentMethod?: string;
  couponDiscount?: number;
  currencyCode?: string;
  // Delivery & recipient captured from full stash payload
  recipient?: { firstName?: string; lastName?: string; phone?: string };
  district?: string;
  deliveryDetails?: string;
  noAddress?: boolean;
  // Granular address fields (optional — absent in stashes created before this was added)
  building?: string;
  floor?: string;
  apartment?: string;
  street?: string;
  deliveryCity?: string;
  deliveryCountry?: string;
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

function recipientDisplayName(order: ConfirmedOrder): string {
  const fn = order.recipient?.firstName?.trim() ?? "";
  const ln = order.recipient?.lastName?.trim() ?? "";
  const full = [fn, ln].filter(Boolean).join(" ");
  return full || order.cardTo?.trim() || "";
}

function hasRecipientSection(order: ConfirmedOrder): boolean {
  return !!(recipientDisplayName(order) || order.recipient?.phone?.trim());
}

function hasDeliveryAddressSection(order: ConfirmedOrder): boolean {
  if (order.noAddress) return false;
  return !!(
    order.building?.trim() ||
    order.floor?.trim() ||
    order.apartment?.trim() ||
    order.street?.trim() ||
    order.district?.trim() ||
    order.deliveryCity?.trim() ||
    order.deliveryCountry?.trim() ||
    order.deliveryDetails?.trim()
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

  // Klarna and other redirect-based Stripe payment methods (e.g. iDEAL) land
  // here with these extra params appended by Stripe to the return_url.
  // We use them as a fallback path when the sessionStorage stash is unavailable
  // (Safari ITP, private mode, iOS app-state kill) — see recovery effect below.
  const klarnaPaymentIntentId = searchParams.get("payment_intent");
  const klarnaClientSecret = searchParams.get("payment_intent_client_secret");
  const klarnaRedirectStatus = searchParams.get("redirect_status");

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
  // True once the payment-status fallback confirms the PI succeeded.
  // Used to show the shopper a "payment received" message instead of the
  // generic failure screen when the sessionStorage stash was lost after a
  // Klarna redirect (Safari ITP, private mode, iOS app-state kill).
  const [klarnaPaymentConfirmed, setKlarnaPaymentConfirmed] = useState(false);

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
    // sessionStorage guard: skip if this conversion was already sent in a prior
    // page load for the same order ref (e.g. shopper reloads /order-confirmed).
    const conversionKey = `${ADS_CONVERSION_KEY_PREFIX}${state.ref}`;
    if (sessionStorage.getItem(conversionKey) !== null) {
      purchaseFiredRef.current = true;
      return;
    }
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
      ...(user?.email
        ? {
            userData: {
              em: user.email,
              ...(user.firstName ? { fn: user.firstName } : {}),
              ...(user.lastName ? { ln: user.lastName } : {}),
            },
          }
        : {}),
    });
    fireAdsPurchaseConversion({ transactionId: state.ref, value, currency });
    try { sessionStorage.setItem(conversionKey, "1"); } catch { /* best-effort */ }
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
          try { localStorage.removeItem(COUPON_STORAGE_KEY); localStorage.removeItem(COUPON_DISCOUNT_KEY); localStorage.removeItem(ORDER_NOTE_KEY); } catch { /* best-effort */ }
          // Funnel terminal: shoppers who completed a redirect-based
          // payment (Stripe / Mamo / PayPal) only land on order_placed
          // here, since the Checkout page emits it for the inline path.
          trackEvent({
            name: "order_placed",
            surface: "checkout",
            ...(chosenMethod ? { action: chosenMethod } : {}),
          });
          trackWebEvent({
            type: "payment_completed",
            value: typeof payload.totalUsd === "number" ? payload.totalUsd : undefined,
            currency: (payload.currencyCode as string | undefined) ?? "USD",
          });
          const orderRef = String(payload.orderId ?? res.osOrderId ?? res.wcOrderId);
          const conversionKey = `${ADS_CONVERSION_KEY_PREFIX}${orderRef}`;
          if (!purchaseFiredRef.current && sessionStorage.getItem(conversionKey) === null) {
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
            try { sessionStorage.setItem(conversionKey, "1"); } catch { /* best-effort */ }
          } else {
            purchaseFiredRef.current = true;
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

  // Klarna redirect fallback: when the sessionStorage stash is unavailable after
  // a successful Klarna redirect (redirect_status=succeeded), verify the payment
  // server-side using the client_secret Stripe appended to the return URL.
  // The payment-status endpoint validates the client_secret proof before returning
  // order metadata, so this is authenticated by possession of the secret.
  // If confirmed, upgrade the state to success so the shopper gets a proper
  // confirmation screen instead of the generic failure.
  const klarnaRecoveryRef = useRef(false);
  useEffect(() => {
    if (state.kind !== "failed") return;
    if (klarnaRedirectStatus !== "succeeded") return;
    if (!klarnaPaymentIntentId || !klarnaClientSecret) return;
    if (klarnaRecoveryRef.current) return;
    klarnaRecoveryRef.current = true;

    void apiFetch<{ ok: boolean; status: string; orderId: string | null }>(
      `/checkout/payment-status?paymentIntentId=${encodeURIComponent(klarnaPaymentIntentId)}&clientSecret=${encodeURIComponent(klarnaClientSecret)}`,
    )
      .then((data) => {
        if (data?.ok && data.status === "succeeded") {
          setKlarnaPaymentConfirmed(true);
          // Upgrade to success using the orderId from PI metadata when available,
          // or the PI ID itself as a contact-us reference when the webhook hasn't
          // yet written the orderId back (timing edge case).
          setState({ kind: "success", ref: data.orderId ?? klarnaPaymentIntentId });
        }
      })
      .catch(() => {
        // Best-effort: leave failed state — the shopper can retry or contact support.
      });
  }, [state.kind, klarnaRedirectStatus, klarnaPaymentIntentId, klarnaClientSecret]);

  if (state.kind === "finalizing") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div data-testid="order-confirmed-scroll-container" className="max-w-md w-full text-center space-y-6 animate-in fade-in py-16">
          <div className="flex justify-center">
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
          </div>
          <h1 className="text-2xl font-serif">{t("order.finalizing")}</h1>
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

  // ─── Financial summary (used in the success state) ───────────────────────
  const items = confirmedOrder?.items ?? [];
  const subtotal = items.reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
  const deliveryFee =
    (Number(confirmedOrder?.expressFee) || 0) +
    (Number(confirmedOrder?.slotFee) || 0) +
    (Number(confirmedOrder?.districtFee) || 0);
  const couponDiscount = Number(confirmedOrder?.couponDiscount) || 0;
  const rawTotal = Number(confirmedOrder?.totalUsd);
  const total = Number.isFinite(rawTotal) ? rawTotal : subtotal + deliveryFee - couponDiscount;
  const payKey = confirmedOrder?.paymentMethod
    ? (PAYMENT_METHOD_KEYS[confirmedOrder.paymentMethod] ?? null)
    : null;
  const payLabel = payKey ? t(payKey) : (confirmedOrder?.paymentMethod ?? "");

  // ─── Failed state ─────────────────────────────────────────────────────────
  if (!isSuccess) {
    return (
      <div className="min-h-screen bg-white overflow-x-hidden">
        <div
          data-testid="order-confirmed-scroll-container"
          className="mx-auto max-w-[760px] px-4 sm:px-6 py-12 sm:py-20 animate-in fade-in duration-500 text-center space-y-6"
        >
          <XCircle className="w-12 h-12 text-destructive mx-auto" data-testid="icon-failed" />

          <h1 className="text-2xl sm:text-3xl font-serif" data-testid="text-confirmation-title">
            {t("order.failed")}
          </h1>

          <p className="text-muted-foreground" data-testid="text-confirmation-message">
            {retriesExhausted
              ? t("order.fail.exhausted")
              : (state.kind === "failed" && state.message) || t("order.failGeneric")}
          </p>

          {retriesExhausted && paymentRef && (
            <div className="inline-block rounded-2xl border border-border px-6 py-4">
              <p className="text-xs text-muted-foreground mb-1">{t("order.reference")}</p>
              <p className="font-mono text-base font-semibold tracking-wider break-all" data-testid="text-payment-ref">
                {paymentRef}
              </p>
            </div>
          )}

          <div className="pt-2 space-y-3">
            {canRetry ? (
              <>
                <Button size="lg" className="rounded-full px-8" onClick={handleRetry} data-testid="button-retry-order">
                  {t("order.retry")}
                </Button>
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
              </>
            ) : (
              <Button
                size="lg"
                className="rounded-full px-8"
                onClick={() => setLocation("/checkout")}
                data-testid="button-confirmation-cta"
              >
                {t("order.returnCheckout")}
              </Button>
            )}
          </div>

          <div className="text-sm text-muted-foreground">
            <Link href="/" className="hover:text-primary">{t("order.backHome")}</Link>
          </div>
        </div>
      </div>
    );
  }

  // ─── Success state ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <div
        data-testid="order-confirmed-scroll-container"
        className="mx-auto max-w-[760px] px-4 sm:px-6 py-10 sm:py-16 animate-in fade-in duration-500"
      >

        {/* ── Confirmation area ───────────────────────────────────────────── */}
        <div className="text-center space-y-3 pb-10">
          <CheckCircle2
            className="w-10 h-10 text-primary mx-auto"
            data-testid="icon-success"
          />
          <h1 className="text-2xl sm:text-3xl font-serif" data-testid="text-confirmation-title">
            {t("order.confirmed")}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base" data-testid="text-confirmation-message">
            {t("order.thanks")}
          </p>
          <div className="inline-flex items-center gap-2 border border-border rounded-full px-4 py-1.5 mt-1">
            <span className="text-xs text-muted-foreground">{t("order.reference")}</span>
            <span className="font-mono text-sm font-semibold tracking-wider" data-testid="text-order-ref">
              {ref}
            </span>
          </div>
        </div>

        {/* ── Your Gift ───────────────────────────────────────────────────── */}
        {items.length > 0 && (
          <section className="border-t border-border/40 pt-8">
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-5">
              {t("order.section.gifts")}
            </p>
            <ul className="space-y-5">
              {items.map((item, idx) => (
                <li key={idx} className="flex items-start gap-4 text-sm">
                  {item.image && (
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-16 h-16 rounded-xl object-cover shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="font-medium leading-snug break-words">{item.name}</p>
                    {item.customInput && (
                      <p className="text-xs text-muted-foreground italic mt-1">
                        {t("order.summary.personalisation")}: {item.customInput}
                      </p>
                    )}
                    <p className="text-muted-foreground text-xs mt-1">× {item.quantity}</p>
                  </div>
                  <span className="shrink-0 font-semibold text-sm pt-0.5">
                    <FormattedPrice usdValue={(Number(item.price) || 0) * (Number(item.quantity) || 1)} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Card Message ────────────────────────────────────────────────── */}
        {(confirmedOrder?.cardMessage?.trim() || confirmedOrder?.cardTo?.trim() || confirmedOrder?.cardFrom?.trim()) && (
          <section className="border-t border-border/40 pt-8 mt-8">
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-4">
              {t("order.summary.cardMessage")}
            </p>
            <div className="rounded-xl border border-border px-5 py-4 space-y-2">
              {confirmedOrder?.cardTo?.trim() && (
                <p className="text-xs font-medium text-muted-foreground">
                  {t("order.summary.cardTo")}:{" "}
                  <span className="text-foreground">{confirmedOrder.cardTo}</span>
                </p>
              )}
              {confirmedOrder?.cardMessage?.trim() && (
                <p className="font-serif text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                  {confirmedOrder.cardMessage}
                </p>
              )}
              {confirmedOrder?.cardFrom?.trim() && (
                <p className="text-xs font-medium text-muted-foreground">
                  {t("order.summary.cardFrom")}:{" "}
                  <span className="text-foreground">{confirmedOrder.cardFrom}</span>
                </p>
              )}
            </div>
          </section>
        )}

        {/* ── Delivery Date & Time ─────────────────────────────────────────── */}
        {(confirmedOrder?.deliveryDate || confirmedOrder?.deliverySlot) && (
          <section className="border-t border-border/40 pt-8 mt-8">
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-4">
              {t("order.summary.delivery")}
            </p>
            <div className="flex items-center gap-2.5 text-sm">
              <CalendarDays className="w-4 h-4 shrink-0 text-primary" />
              <span>
                {confirmedOrder?.deliveryDate
                  ? formatDeliveryDate(confirmedOrder.deliveryDate, language)
                  : ""}
                {(confirmedOrder?.deliverySlotTime ?? confirmedOrder?.deliverySlot) &&
                  confirmedOrder?.deliveryDate
                  ? " · "
                  : ""}
                {confirmedOrder?.deliverySlotTime ?? confirmedOrder?.deliverySlot ?? ""}
              </span>
            </div>
          </section>
        )}

        {/* ── Recipient Details ────────────────────────────────────────────── */}
        {confirmedOrder && hasRecipientSection(confirmedOrder) && (
          <section className="border-t border-border/40 pt-8 mt-8">
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-4">
              {t("order.section.recipientDetails")}
            </p>
            <div className="space-y-3 text-sm">
              {recipientDisplayName(confirmedOrder) && (
                <div className="flex items-start gap-3">
                  <User className="w-4 h-4 shrink-0 text-muted-foreground mt-0.5" />
                  <span className="font-medium">{recipientDisplayName(confirmedOrder)}</span>
                </div>
              )}
              {confirmedOrder.recipient?.phone?.trim() && (
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <span dir="ltr" className="text-muted-foreground">
                    {confirmedOrder.recipient.phone}
                  </span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Delivery Address ─────────────────────────────────────────────── */}
        {confirmedOrder && hasDeliveryAddressSection(confirmedOrder) && (
          <section className="border-t border-border/40 pt-8 mt-8">
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-4">
              {t("order.section.deliveryAddress")}
            </p>
            <div className="flex items-start gap-3 text-sm">
              <MapPin className="w-4 h-4 shrink-0 text-muted-foreground mt-0.5" />
              <div className="text-muted-foreground leading-relaxed space-y-0.5">
                {confirmedOrder.building?.trim() && (
                  <p><span className="text-foreground font-medium">{confirmedOrder.building}</span></p>
                )}
                {confirmedOrder.floor?.trim() && (
                  <p>{confirmedOrder.floor}</p>
                )}
                {confirmedOrder.apartment?.trim() && (
                  <p>{confirmedOrder.apartment}</p>
                )}
                {confirmedOrder.street?.trim() && (
                  <p>{confirmedOrder.street}</p>
                )}
                {confirmedOrder.district?.trim() && (
                  <p className="text-foreground font-medium">{confirmedOrder.district}</p>
                )}
                {confirmedOrder.deliveryCity?.trim() && (
                  <p>{confirmedOrder.deliveryCity}</p>
                )}
                {confirmedOrder.deliveryCountry?.trim() && (
                  <p>{confirmedOrder.deliveryCountry}</p>
                )}
                {/* Fallback for old stashes that only have the combined deliveryDetails */}
                {!confirmedOrder.street?.trim() && !confirmedOrder.building?.trim() && confirmedOrder.deliveryDetails?.trim() && (
                  <p>{confirmedOrder.deliveryDetails}</p>
                )}
                {confirmedOrder.deliveryDetails?.trim() &&
                  (confirmedOrder.street?.trim() || confirmedOrder.building?.trim()) &&
                  confirmedOrder.deliveryDetails !== confirmedOrder.street && (
                  <p className="text-xs italic">{confirmedOrder.deliveryDetails}</p>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── Order Summary ────────────────────────────────────────────────── */}
        <section
          data-testid="order-summary"
          className="border-t border-border/40 pt-8 mt-8"
        >
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-4">
            {t("order.section.summary")}
          </p>
          <div className="space-y-2 text-sm">
            {items.length > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>{t("order.summary.subtotal")}</span>
                <FormattedPrice usdValue={subtotal} />
              </div>
            )}
            {deliveryFee > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>{t("order.summary.deliveryFee")}</span>
                <FormattedPrice usdValue={deliveryFee} />
              </div>
            )}
            {couponDiscount > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>{t("order.summary.discount")}</span>
                <span>
                  {"−\u202f"}
                  <FormattedPrice usdValue={couponDiscount} />
                </span>
              </div>
            )}
            <div className="flex justify-between font-semibold pt-3 border-t border-border/40 text-base">
              <span>{t("order.summary.total")}</span>
              <FormattedPrice usdValue={total} />
            </div>
          </div>
          {payLabel && (
            <div className="flex items-center justify-between mt-5 pt-5 border-t border-border/40">
              <span className="text-sm text-muted-foreground">{t("order.summary.paymentMethod")}</span>
              <span className="text-xs font-medium bg-primary/10 text-primary rounded-full px-3 py-1">
                {payLabel}
              </span>
            </div>
          )}
        </section>

        {/* ── Actions ──────────────────────────────────────────────────────── */}
        <section className="border-t border-border/40 pt-8 mt-8 space-y-4">
          <Button
            size="lg"
            className="rounded-full px-10 w-full"
            onClick={() => setLocation("/shop")}
            data-testid="button-confirmation-cta"
          >
            {t("order.continueShopping")}
          </Button>

          <div className="text-center">
            <Link
              href="/account"
              className="text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
            >
              {t("order.action.viewOrders")}
            </Link>
          </div>

          <div className="text-center">
            <Link
              href="/contact"
              className="text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
            >
              {t("order.action.contact")}
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
}
