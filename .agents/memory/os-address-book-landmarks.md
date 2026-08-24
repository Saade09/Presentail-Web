---
name: OS Address Book landmark recognition
description: Checkout landmark suggestions ship dark behind OS_ADDRESS_BOOK_ENABLED; OS address-book endpoints 403 for the storefront key; Arabic search normalization gotcha.
---

# OS Address Book landmark recognition (checkout Delivery Details)

- The whole feature is dark by default behind the **server** env flag `OS_ADDRESS_BOOK_ENABLED` (api-server only; the web client has no flag). Flag off → places cache returns [] → search route returns `{ok:true, places:[]}` → no dropdown ever renders → checkout behaves exactly as before.
- **Why:** every candidate OS address-book path (`/api/public/address-book/places*`, `/api/address-book/places`, `/api/places`, `/api/landmarks`) returns a generic `{"error":"no_access"}` 403 for `PRESENTAIL_OS_API_KEY` — identical to a bogus path — so the real endpoint/auth is unknown until the OS team grants access.
- **How to apply:** to go live, set `OS_ADDRESS_BOOK_ENABLED=1` on the api-server deployment, confirm which path in `ADDRESS_BOOK_PATHS` (lib/presentail-os client) actually answers, and smoke-test `/api/address-book/places/search?q=...`. The search route must keep answering 200 with an empty list on any failure — free-text address entry must never depend on this API.
- Eligibility booleans (verified/published/checkoutEnabled) normalize fail-closed (default false); the search index filters to all three true.
- Client analytics noise guard: `landmark_search_performed` / `landmark_search_no_results` fire only after the browser session has seen ≥1 suggestion, so the dark flag produces zero event noise.

## Arabic search normalization gotcha
NFKD decomposes أ/إ/ؤ into a base letter + combining hamza (U+0653–U+0655). If the harakat strip range stops at U+0652, the leftover hamza mark falls through the punctuation pass and becomes a space ("أوتيل" → "ا وتيل"). Strip the full combining range `\u064B-\u065F` (plus `\u0670`) after NFKD.
