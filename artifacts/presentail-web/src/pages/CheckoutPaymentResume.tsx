// /checkout/payment-resume
//
// Top-level navigation fallback for CyberSource 3DS challenge completion.
// When the issuer step-up page causes a top-level navigation (escaping the
// iframe), the relay page redirects here with ?attempt=<id>.
//
// This page polls the backend attempt status and redirects to order
// confirmation when the backend completes the order, or surfaces an error
// if the attempt fails.

import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { useLocale } from "@/contexts/LocaleContext";
import { Spinner } from "@/components/ui/spinner";

const POLL_INTERVAL_MS = 2000;
const MAX_POLL = 45; // 90 s

function useAttemptIdFromSearch(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("attempt");
    if (id && /^[A-Za-z0-9_-]{8,80}$/.test(id)) return id;
  } catch { /* ignore */ }
  return null;
}

export function CheckoutPaymentResumePage() {
  const { t } = useLocale();
  const [, setLocation] = useLocation();
  const attemptId = useAttemptIdFromSearch();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const didStart = useRef(false);

  useEffect(() => {
    if (didStart.current) return;
    didStart.current = true;

    if (!attemptId) {
      setLocation("/checkout");
      return;
    }

    let cancelled = false;

    async function poll() {
      let count = 0;
      while (count < MAX_POLL && !cancelled) {
        await new Promise<void>((r) => setTimeout(r, count === 0 ? 500 : POLL_INTERVAL_MS));
        count++;
        try {
          const statusRes = await apiFetch<{
            ok: boolean;
            status: string;
            orderId: string | null;
            errorSummary: string | null;
          }>(`/payment/cybersource/attempt/${attemptId}/status`);

          if (!statusRes.ok) {
            setErrorMessage(t("checkout.toast.csPayerAuthFailed"));
            return;
          }

          if (statusRes.status === "COMPLETED" && statusRes.orderId) {
            // Strip the attempt param from the URL before redirecting
            try {
              const newUrl = window.location.pathname;
              history.replaceState(null, "", newUrl);
            } catch { /* best-effort */ }
            setLocation(`/order-confirmed?status=success&ref=${statusRes.orderId}`);
            return;
          }

          if (statusRes.status === "FAILED") {
            setErrorMessage(statusRes.errorSummary ?? t("checkout.toast.csPayerAuthFailed"));
            return;
          }

          // Authorization done but order creation may have failed transiently.
          // Drive active retry by calling /complete (idempotent, advisory-locked).
          if (["AUTHORIZED", "ORDER_CREATED", "OS_SYNCED"].includes(statusRes.status)) {
            try {
              const completeRes = await apiFetch<{
                ok: boolean;
                orderId?: string;
                status?: string;
              }>(`/payment/cybersource/attempt/${attemptId}/complete`, { method: "POST" });
              if (completeRes.ok && completeRes.orderId) {
                try {
                  history.replaceState(null, "", window.location.pathname);
                } catch { /* best-effort */ }
                setLocation(`/order-confirmed?status=success&ref=${completeRes.orderId}`);
                return;
              }
            } catch { /* ignore — next poll will retry */ }
          }
        } catch {
          // Network error — keep polling
        }
      }

      if (!cancelled) {
        setErrorMessage(t("checkout.toast.csPayerAuthFailed"));
      }
    }

    void poll();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  if (errorMessage) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-destructive font-medium">{errorMessage}</p>
        <button
          className="text-sm underline text-muted-foreground"
          onClick={() => setLocation("/checkout")}
        >
          {t("checkout.backToCheckout")}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
      <Spinner className="h-8 w-8 text-primary" />
      <p className="text-sm text-muted-foreground">{t("checkout.finalizingOrder")}</p>
    </div>
  );
}

export default CheckoutPaymentResumePage;
