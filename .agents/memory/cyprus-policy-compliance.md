---
name: Cyprus policy checkout compliance
description: How the Cyprus policy acceptance audit record works end-to-end (URLs, DB, server guards, UI, recovery).
---

# Cyprus Policy Checkout Compliance

## Canonical Cyprus policy URLs
- `/cyprus/terms/`, `/cyprus/shipping-policy/`, `/cyprus/refund-policy/` are the stable public 200 URLs.
- serve.mjs Section 6c handles these before the VANITY_REDIRECT_MAP: slash-less form → 301 to slash form; slash form → 200 SPA shell with SEO injection.
- serve-robots.mjs `CYPRUS_CANONICAL_POLICY_RE` exempts them from the private-route noindex pattern.
- App.tsx renders `<TermsRoute>`, `<ShippingPolicyRoute>`, `<ReturnPolicyRoute>` directly for these paths (no redirect).
- sitemap.mjs emits all three for `locale === "en"` only.

**Why:** Paysafe compliance requires stable, indexable, publicly accessible policy pages.

**How to apply:** Any new CY-scoped legal page must get a `/cyprus/{slug}/` canonical + Section 6c handler + sitemap entry + serve-robots exemption.

## Policy acceptance guard (server-side)
- `POLICY_VERSION = "cy-v1"` — bump this string when the legal copy changes.
- Payment-intent route (`checkout.ts`): guard fires when `store.storeKey === "cyprus" && policyAccepted !== true` → 400.
- Session route (`checkout.ts`): same guard.
- Woo order route (`woo.ts`): guard fires when `store.storeKey === "cyprus" && !body.paymentRef && body.policyAccepted !== true` → 400. Skipped for already-paid orders (rescue path).
- IP and `policyAcceptedAt` are ALWAYS derived server-side — never trusted from request body.

**Why:** Paysafe audit requires server-verified acceptance with non-client-supplied IP and timestamp.

## Policy audit fields (DB)
- `app_orders`: `policy_accepted_at` (timestamptz), `policy_accepted_ip` (text), `policy_version` (text) — all nullable for historical rows.
- Migration: `lib/db/migrations/0026_policy_acceptance.sql`.
- Drizzle schema: `lib/db/src/schema/appOrders.ts`.
- `recordSuccessfulWcOrder` accepts `policyAcceptedAt?`, `policyAcceptedIp?`, `policyVersion?` and writes all three.

## CartSnapshot threading
- `policyVersion?`, `policyAcceptedIp?`, `policyAcceptedAt?` added to `CartSnapshot` in `checkoutIntents.ts`.
- All 4 `storePaymentIntent` calls in the PI route spread `...policySnapshotFields` into the snapshot.
- Session route spreads `...sessionPolicySnapshotFields` into its snapshot.
- `woo.ts` extracts from `intent.snapshot` after `consumePaymentIntent` — preferred over request-derived values.
- Fallback: if no snapshot (offline/recovery), `woo.ts` derives IP from `req.headers["x-forwarded-for"]` and timestamp from `new Date()`.

## Checkout UI
- Web `Checkout.tsx`: `POLICY_VERSION = "cy-v1"`, `isCY` from `countryCode === "CY"`, `policyAccepted` state (default false).
- Checkbox shown in mobile delivery step (before Continue to Payment) and in `OrderSummaryPanel` desktop sidebar.
- Both CTAs disabled (aria-disabled + cursor-not-allowed) when `isCY && !policyAccepted`.
- `buildOrderPayload` spreads `{ policyAccepted, policyVersion }` only when `isCY`.
- Mobile (`app/checkout.tsx`): same state, same guard in `placeOrder`, same `buildWooPayload` spread.
- i18n: `checkout.policyAcceptance.*` keys in `locales/checkout.ts` (en/ar/fr/el); `policyAcceptance*` keys in `lib/translations.ts` (en/ar/fr).

## Footer
- `Footer.tsx` CY section now links to all three canonical `/cyprus/` URLs (terms, shipping, refund) instead of city-scoped paths.
