import { useSearch, Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCreateOrder } from "@/lib/queries";
import { useCart } from "@/contexts/CartContext";

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
    if (!stashed) return { kind: "failed", message: "We couldn't find your pending order to finalize. If you were charged, contact us with your payment reference." };
    return { kind: "finalizing" };
  })();

  const [state, setState] = useState<FinalizeState>(initial);
  const triedRef = useRef(false);

  useEffect(() => {
    if (state.kind !== "finalizing" || triedRef.current) return;
    triedRef.current = true;

    const stashed = sessionStorage.getItem(PENDING_ORDER_KEY);
    if (!stashed) {
      setState({ kind: "failed", message: "Pending order missing." });
      return;
    }

    let parsed: { payload: any; createdAt: number };
    try {
      parsed = JSON.parse(stashed);
    } catch {
      setState({ kind: "failed", message: "Could not read pending order." });
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
          setState({ kind: "failed", message: res.message || "Order could not be created." });
        }
      },
      onError: (err: any) => {
        sessionStorage.removeItem(PENDING_ORDER_KEY);
        setState({ kind: "failed", message: err?.message || "Order finalization failed." });
      },
    });
  }, [state.kind, paymentRef, createOrder, clearCart]);

  if (state.kind === "finalizing") {
    return (
      <div className="min-h-[80vh] pt-32 pb-24 flex items-center justify-center container mx-auto px-4">
        <div className="max-w-md w-full text-center space-y-6 animate-in fade-in">
          <div className="flex justify-center">
            <Loader2 className="w-16 h-16 text-primary animate-spin" />
          </div>
          <h1 className="text-3xl font-serif">Finalizing your order…</h1>
          <p className="text-muted-foreground">Please don't close this window.</p>
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
          {isSuccess ? "Order Confirmed!" : "Order Failed"}
        </h1>

        <p className="text-muted-foreground text-lg">
          {isSuccess
            ? "Thank you for choosing Presentail. Your beautiful arrangement is being prepared with care."
            : (state.kind === "failed" && state.message) || "Something went wrong while processing your payment. Please try again."}
        </p>

        {isSuccess && (
          <div className="bg-secondary/50 rounded-2xl p-6 my-8">
            <p className="text-sm text-muted-foreground mb-1">Order Reference</p>
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
            {isSuccess ? "Continue Shopping" : "Return to Checkout"}
          </Button>
        </div>

        {!isSuccess && (
          <div className="text-sm text-muted-foreground">
            <Link href="/" className="hover:text-primary">Back to home</Link>
          </div>
        )}
      </div>
    </div>
  );
}
