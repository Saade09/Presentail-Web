import { useEffect, useState } from "react";

/**
 * Returns a `Date` that updates every `intervalMs` (default 60s).
 *
 * Used by Express-delivery gating so that when a shopper is sat on the
 * product detail or checkout page across a cutoff boundary (8 AM / 10 PM
 * in the recipient country's local time), `isExpressDeliveryAvailable`
 * recomputes and the auto-fallback effects fire — without depending on
 * an unrelated re-render to wake them up.
 */
export function useNow(intervalMs: number = 60_000): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
