---
name: GA4 campaign funnel mirrors
description: How GA4 e-commerce events and campaign attribution are wired on the web app, and how to e2e-test gtag events.
---

- GA4 e-commerce mirrors (`add_to_cart` in CartContext, `begin_checkout` in Checkout, `purchase` in OrderConfirmed) fire via `fireGtagEvent` alongside the internal `/api/web-events` events and the Google Ads `conversion` ping. The Ads ping alone does NOT produce GA4 purchase events.
- **Why:** GA4 attributes conversions from the session's landing-page gclid/UTM automatically — events need no attribution params, but they must exist as gtag events to appear in GA4 at all.
- `purchase` is deduped per order ref via sessionStorage (same key as the Ads conversion) and fires from both the inline-success and redirect-return paths in OrderConfirmed.
- **e2e pattern:** index.html's inline `gtag(){dataLayer.push(arguments)}` shim means gtag events are assertable in Playwright via `window.dataLayer` (entries are array-like arguments objects) even with gtag.js blocked. Every page is gated behind the country picker — seed `presentail_delivery_location_v1` (`{countryCode:"LB",cityId:"lb-beirut"}`) via addInitScript.
- Manual GA4 DebugView / Google Ads / Clarity verification runbook: `artifacts/presentail-web/docs/campaign-ga4-verification.md`. Google Ads ignores synthetic gclids — Ads-side attribution can only be confirmed with a real ad click.
