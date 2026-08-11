// /checkout/payment-resume
//
// CyberSource Payer Authentication (3DS 2.x) return route.
//
// When the card issuer's ACS (Access Control Server) completes a 3DS challenge,
// the browser is redirected back to this URL with the 3DS result parameters in
// the query string. This page reads those params, surfaces them to the parent
// checkout context (via postMessage for cross-origin iframe cases, or via the
// React router state for same-origin redirects), and hands control back to the
// CyberSource authorize step.
//
// If no recognisable 3DS data is found — e.g. a stale bookmark or manual
// navigation — the page shows a friendly "return to checkout" prompt instead
// of silently failing.

import { useEffect } from "react";
import { useLocation, useSearch } from "wouter";

export function CheckoutPaymentResumePage() {
  const [, setLocation] = useLocation();
  const search = useSearch();

  useEffect(() => {
    const params = new URLSearchParams(search);
    const status = params.get("status");
    const transactionId = params.get("TransactionId") ?? params.get("transactionId");

    if (transactionId) {
      // 3DS challenge completed — pass result params to the checkout page
      // so the authorize step can proceed.
      setLocation(`/checkout?cs3dsResume=1&status=${encodeURIComponent(status ?? "")}&tid=${encodeURIComponent(transactionId)}`, {
        replace: true,
      });
    } else if (status === "failed" || status === "cancel") {
      setLocation("/checkout?cs3dsResume=1&status=failed", { replace: true });
    } else {
      // No recognisable 3DS data — send the shopper back to checkout.
      setLocation("/checkout", { replace: true });
    }
  }, [search, setLocation]);

  return null;
}

export default CheckoutPaymentResumePage;
