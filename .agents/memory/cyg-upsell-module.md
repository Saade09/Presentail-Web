---
name: Complete Your Gift upsell module
description: Web PDP upsell module behaviour, fallback rules, and known pre-existing failing test suites
---
- CompleteYourGift (web PDP) is gated server-side by CYG_ROLLOUT (off/test/percentage/on) on GET /api/products/complete-your-gift. `enabled:false`, endpoint error/timeout, AND empty slots all render the legacy FrequentlyBoughtTogether — the module must never blank out or block the bouquet flow.
- Bundle add pattern: idempotency ref guard + pre-submit `refetch()` revalidation (presence, inStock, incrementalPriceUsd equality) before any `addItem` call; failures deselect the item and show an explicit notice — no silent substitution.
- Recommendation token carries into cart attribution via `addItem(..., { upsellToken })` → web-event `properties.upsellToken` (CartContext).
- **Pre-existing failing web test suites on main (Aug 2026):** blog-content ogImage, seo-inject JSON-LD, Checkout.cardFlow — they fail on a clean baseline; don't attribute them to new changes.
