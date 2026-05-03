import { useSearch, Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCreateOrder } from "@/lib/queries";
import { useCart } from "@/contexts/CartContext";
import { useLocale } from "@/contexts/LocaleContext";

const PENDING_ORDER_KEY = "presentail_pending_order_v1";

type FinalizeState =
  | { kind: "idle" }
  | { kind: "finalizing" }
  | { kind: "success"; ref: string }
  | { kind: "failed"; message?: string };

export default function OrderConfirmed() {
  const searchString = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const [, setLocation] = useLocation();
  const { t } = useLocale();

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

    createOrder.mutate(payload, {
      onSuccess: (res) => {
        sessionStorage.removeItem(PENDING_ORDER_KEY);
        if (res.ok) {
          clearCart();
          setState({ kind: "success", ref: String(res.wcOrderId || payload.orderId) });
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
      <div className="min-h-[80vh] pt-32 pb-24 flex items-center justify-center container mx-auto px-4">
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
    <div className="min-h-[80vh] pt-32 pb-24 flex items-center justify-center container mx-auto px-4">
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
          <div className="bg-secondary/50 rounded-2xl p-6 my-8">
            <p className="text-sm text-muted-foreground mb-1">{t("order.reference")}</p>
            <p className="font-mono text-xl font-medium tracking-wider" data-testid="text-order-ref">{ref}</p>
          </div>
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
