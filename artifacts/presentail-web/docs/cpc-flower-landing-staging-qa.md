# CPC flower landing staging QA

QA date: 2026-08-19

Production status: **not released**. These links are for staging review.

## Review links

- Beirut: <https://ecc66d74-6d2e-48a6-9649-831b70a47b53-00-2a2fua6i2o0no-tp8mn9dy.riker.replit.dev/en-lb/beirut/flower-delivery>
- Dubai: <https://ecc66d74-6d2e-48a6-9649-831b70a47b53-00-2a2fua6i2o0no-tp8mn9dy.riker.replit.dev/en-ae/dubai/flower-delivery>
- Abu Dhabi: <https://ecc66d74-6d2e-48a6-9649-831b70a47b53-00-2a2fua6i2o0no-tp8mn9dy.riker.replit.dev/en-ae/abu-dhabi/flower-delivery>
- Arabic Dubai: <https://ecc66d74-6d2e-48a6-9649-831b70a47b53-00-2a2fua6i2o0no-tp8mn9dy.riker.replit.dev/ar-ae/dubai/flower-delivery>
- French Beirut: <https://ecc66d74-6d2e-48a6-9649-831b70a47b53-00-2a2fua6i2o0no-tp8mn9dy.riker.replit.dev/fr-lb/beirut/flower-delivery>

## Market summary

| Market | Live operations data | Delivery claim shown in staging | Catalog checks |
| --- | --- | --- | --- |
| Beirut | Verified Presentail OS city config | Cutoff 23:00 local; timing confirmed at checkout because OS supplies no speed label | 154 in-stock flower results; 32 in-stock luxury results |
| Dubai | Verified Presentail OS city config | Cutoff 22:00 local; timing confirmed at checkout because OS supplies no speed label | 169 in-stock flower results; 34 in-stock luxury results |
| Abu Dhabi | Verified Presentail OS city config | Cutoff 22:00 local; timing confirmed at checkout because OS supplies no speed label | 168 in-stock flower results; 34 in-stock luxury results |

The campaign uses neutral checkout-confirmed availability and delivery timing
whenever the operations response is stale, fallback-derived, or lacks explicit
city fields. The automated fallback browser case verifies that no cutoff or
speed claim is rendered in that state.

Currency follows the existing shopper display-currency resolution rather than
being forced from the delivery city. The staging runner currently geolocates to
the United States and therefore shows USD for all three links; the currency
switcher and manual shopper selection continue to update rail and card pricing.

## Completed checks

- Target-city gate: only Beirut, Dubai, and Abu Dhabi use the redesign.
- Legacy behavior: all other city campaign routes keep the previous landing.
- Responsive layout: 1440×900 desktop and 390×844 mobile; no horizontal overflow.
- Header: 70 px desktop and 62 px mobile with wordmark, search, account, and cart.
- Hero: 340 px desktop, one primary CTA, secondary WhatsApp text link, localized city prefill.
- Catalog: Flowers first, Luxury Arrangements second, city/store scoped, in-stock, filtered, and de-duplicated.
- Localization: English, Arabic RTL, and French strings validated.
- Attribution/analytics: UTM and GCLID persistence, CTA, support, view-all, product impression/click, add-to-cart, checkout, and purchase pipelines preserved.
- Accessibility/performance: keyboard-visible controls, semantic headings/sections, responsive local WebP hero image with explicit dimensions and high-priority preload.
- Automated campaign browser matrix: 16 passing checks across desktop and mobile.

## Release gate

Do not publish production until the staging links above are approved. After an
approved release, repeat the three English market checks on the production URLs
and complete the GA4/Google Ads verification runbook.