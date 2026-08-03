// /checkout/payment-resume
//
// Legacy fallback route — formerly used for CyberSource 3DS challenge completion.
// The CyberSource integration has been removed; this page now immediately
// redirects the shopper to the order confirmation screen with a failure status
// so any lingering bookmarked or shared links fail gracefully rather than hanging.

import { useEffect } from "react";
import { useLocation } from "wouter";

export function CheckoutPaymentResumePage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // CyberSource 3DS no longer active — redirect to a failure state immediately.
    setLocation("/order-confirmed?status=failed", { replace: true });
  }, [setLocation]);

  return null;
}

export default CheckoutPaymentResumePage;
