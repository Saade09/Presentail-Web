// Free-delivery threshold (in USD, the cart's internal currency) for the
// selected store. Mirrors the API server's `freeDeliveryThresholdUsd` and the
// per-country values used at checkout.
export function freeDeliveryThresholdUsd(countryCode?: string | null): number {
  if (countryCode === "AE") return 89.84;
  return 130;
}
