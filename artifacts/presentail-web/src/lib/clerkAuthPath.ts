import { useRouter } from "wouter";

// Returns the absolute base path that the storefront's `/sign-in` and
// `/sign-up` routes are mounted under, derived from the active wouter
// router's base. In the storefront the base is the locale prefix
// `/{lang}-{country}/{city}` (e.g. `/en-lb/beirut`). Used by the Clerk
// `<SignIn>` / `<SignUp>` components to compute a STABLE `path` prop
// that does not change as the user moves through Clerk's multi-step
// sub-routes (verify-email, factor-one, ...).
//
// Importantly we do NOT read from `window.location.pathname` because
// that includes the active sub-step and would change between renders,
// which breaks Clerk's path-based routing.
export function useClerkAuthBasePath(): string {
  const router = useRouter();
  const base = router.base || "";
  return base.replace(/\/+$/, "");
}
