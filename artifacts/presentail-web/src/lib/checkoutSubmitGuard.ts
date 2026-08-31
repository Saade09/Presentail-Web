/**
 * Pure-function guard for the Place Order / Pay button disabled state.
 *
 * Extracted so it can be unit-tested independently of the full Checkout
 * component. The rules are:
 *
 *  1. Always disabled while a submission is in flight (isProcessing).
 *  2. Disabled when no delivery district is selected and noAddress is false.
 *  3. Disabled when the delivery mode is not "express" and no time slot is
 *     selected — this covers the case where the OS slots API returned an
 *     empty array and the slot-clear effect wiped the previously selected
 *     slot, leaving deliverySlot as "".
 */
export function isPlaceOrderDisabled(opts: {
  isProcessing: boolean;
  noAddress: boolean;
  selectedDistrict: string;
  deliveryMode: string;
  deliverySlot: string;
}): boolean {
  if (opts.isProcessing) return true;
  if (!opts.noAddress && !opts.selectedDistrict) return true;
  if (opts.deliveryMode !== "express" && !opts.deliverySlot) return true;
  return false;
}
