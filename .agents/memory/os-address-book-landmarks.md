---
name: OS Address Book landmark recognition
description: Live Address Book search contract, server-only authentication, remote 403 status, and Arabic search normalization gotcha.
---

# OS Address Book landmark recognition (checkout Delivery Details)

- The feature is gated by the **server** env flag `OS_ADDRESS_BOOK_ENABLED` (api-server only; the web client has no flag). Flag off or OS failing → search returns [] → no dropdown → checkout behaves exactly as before.
- **Confirmed contract (OS team, Aug 2026):** `GET /api/address-book/places?q=` with the existing OS API key in server-only auth headers; do not send workspace, country, city, or credentials in the URL. Response places carry `displayName`, `approvedAliases`, `type`, `country`, `deliveryDistrict`, `area`, `city`, `latitude/longitude`, `verificationState` (`delivery_verified` = checkout-safe), and `followUpCopy`. The storefront displays safe projected fields, retains the id + typed text, sends the place ID on the order, treats coordinates as non-authoritative, and always falls back to free text on error/no results.
- Implementation is a per-query proxy (no bulk cache/index): short per-query TTL cache + a global 60s failure backoff so a typing shopper never hammers OS while access is down. OS relevance ordering is preserved — no local re-ranking.
- **Status Aug 26, 2026:** the new private endpoint is wired and the shared flag is ON, but a controlled live `AUB` smoke still returns HTTP 403 with the configured key even when both Bearer and x-api-key headers are sent. Storefront fallback remains safe; OS-side authorization still needs to accept this key before live suggestions appear.
- Eligibility fails closed: `verificationState === "delivery_verified"` (or all three legacy booleans true) is required or the place is dropped server-side.
- Client analytics noise guard: `landmark_search_performed` / `landmark_search_no_results` fire only after the browser session has seen ≥1 suggestion, so the dark flag produces zero event noise.

## Arabic search normalization gotcha
NFKD decomposes أ/إ/ؤ into a base letter + combining hamza (U+0653–U+0655). If the harakat strip range stops at U+0652, the leftover hamza mark falls through the punctuation pass and becomes a space ("أوتيل" → "ا وتيل"). Strip the full combining range `\u064B-\u065F` (plus `\u0670`) after NFKD.
