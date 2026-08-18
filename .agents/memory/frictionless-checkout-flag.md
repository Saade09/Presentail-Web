---
name: Frictionless checkout flag
description: Web guest checkout flag semantics and the legacy popup path kept behind it
---

# Frictionless checkout flag (web)

- `VITE_FRICTIONLESS_CHECKOUT` gates the direct cart→checkout flow + the optional sign-in card on checkout (`isFrictionlessCheckoutEnabled()` in the web lib).
- Semantics: "1/true/on" → on, "0/false/off" → off, unset → on in dev builds, OFF in prod builds. Production rollout requires explicitly setting the var and redeploying.
- **Why:** flag off must reproduce the legacy `CheckoutLoginDialog` popup flow exactly (including `?guest=1` handoff and the checkout login gate) so rollback is a pure env change.
- **How to apply:** never delete the CheckoutLoginDialog/guestAcked path while the flag exists; unit tests mock the flag module per-scenario. Inline OAuth on checkout lives in a separate popup module that returns structured results (no toasts/navigation) — reuse it, don't re-fork SignIn.tsx logic.
- Apple popup `redirectURI` stays `${origin}/sign-in` even when invoked from checkout — it's the registered Service ID URI; popup mode never navigates.
