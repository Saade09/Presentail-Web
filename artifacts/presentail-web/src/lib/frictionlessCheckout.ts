/**
 * Feature flag for the frictionless guest checkout flow (task: direct
 * cart→checkout routing + optional sign-in card on checkout).
 *
 * Gate: VITE_FRICTIONLESS_CHECKOUT
 *   "1" | "true" | "on"   → enabled
 *   "0" | "false" | "off" → disabled (legacy CheckoutLoginDialog popup flow)
 *   unset                 → enabled in dev builds, disabled in prod builds
 *                           (so production rollout is an explicit env change
 *                           and rollback is just unsetting/zeroing the var).
 */
export function isFrictionlessCheckoutEnabled(): boolean {
  const raw = (import.meta.env.VITE_FRICTIONLESS_CHECKOUT as string | undefined)
    ?.trim()
    .toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  if (raw === "1" || raw === "true" || raw === "on") return true;
  return Boolean(import.meta.env.DEV);
}

export type CartCtaDecision = "navigate" | "prompt";

/**
 * Pure routing rule for the cart "Proceed to Checkout" CTA.
 *
 * - Flag on: everyone navigates straight to /checkout — no popup, ever.
 * - Flag off (legacy): signed-in shoppers navigate; signed-out shoppers get
 *   the login/guest prompt. While auth is still resolving we optimistically
 *   navigate (matching the pre-existing behaviour) so the CTA is never dead.
 */
export function cartCheckoutCtaDecision(args: {
  frictionlessEnabled: boolean;
  isSignedIn: boolean;
  authLoading: boolean;
}): CartCtaDecision {
  if (args.frictionlessEnabled) return "navigate";
  if (args.isSignedIn || args.authLoading) return "navigate";
  return "prompt";
}
