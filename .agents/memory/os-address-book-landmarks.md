---
name: OS Address Book landmark recognition
description: Checkout landmark suggestions ship dark behind OS_ADDRESS_BOOK_ENABLED; OS address-book endpoints 403 for the storefront key; Arabic search normalization gotcha.
---

# OS Address Book landmark recognition (checkout Delivery Details)

- The feature is gated by the **server** env flag `OS_ADDRESS_BOOK_ENABLED` (api-server only; the web client has no flag). Flag off or OS failing → search returns [] → no dropdown → checkout behaves exactly as before.
- **Confirmed contract (OS team, Aug 2026):** `GET /api/public/address-book/places?workspace=&q=&country=[&city_slug=]` — the SEARCH runs OS-side (we forward the shopper's debounced text as `q`); response places carry `displayName`, `approvedAliases`, `type`, `country`, `deliveryDistrict`, `area`, `city`, `latitude/longitude`, `verificationState` (`delivery_verified` = checkout-safe), `followUpCopy`. The storefront must display displayName + approved aliases, retain the id + typed text, send the place ID on the order, treat browser coordinates as non-authoritative, and always fall back to free text on error/no results.
- Implementation is a per-query proxy (no bulk cache/index): short per-query TTL cache + a global 60s failure backoff so a typing shopper never hammers OS while access is down. OS relevance ordering is preserved — no local re-ranking.
- **Status Aug 24, 2026:** contract wired, flag ON (shared env). The endpoint still answers `{"error":"no_access"}` 403 for our key; user says OS runs on Replit and access opens once the OS side is redeployed. Everything lights up automatically then — no storefront change needed. Our production deployment must also be redeployed to pick up the env flag + new client.
- Eligibility fails closed: `verificationState === "delivery_verified"` (or all three legacy booleans true) is required or the place is dropped server-side.
- Client analytics noise guard: `landmark_search_performed` / `landmark_search_no_results` fire only after the browser session has seen ≥1 suggestion, so the dark flag produces zero event noise.

## Arabic search normalization gotcha
NFKD decomposes أ/إ/ؤ into a base letter + combining hamza (U+0653–U+0655). If the harakat strip range stops at U+0652, the leftover hamza mark falls through the punctuation pass and becomes a space ("أوتيل" → "ا وتيل"). Strip the full combining range `\u064B-\u065F` (plus `\u0670`) after NFKD.
