# Beirut late-night CPC staging QA

Route: `/en-lb/beirut/late-night-flower-delivery`

## Release gate

The route and API are production-ready but paid traffic must remain inactive
until Beirut operations confirms the 11:30 PM policy and a real pre-cutoff
checkout accepts the exact OS slot returned by the campaign API.

## Automated evidence

- Server boundary coverage: 11:29 PM, exactly 11:30 PM, 11:31 PM, Beirut
  summer/winter time, spring DST calendar advancement, early closure, missing
  weekday schedule, disabled/missing/contradictory slots, stale sources,
  sold-out/empty inventory, floral/luxury filtering, pricing, quote expiry, and
  next-window metadata.
- Checkout enforcement: the selected campaign date/slot is persisted through
  navigation; the shared pre-charge and unpaid-order guard rejects the Beirut
  late slot at the effective minute cutoff while preserving paid-order rescue.
- SEO/route policy: exact English Beirut route only, `noindex, follow`,
  self-canonical, no hreflang/JSON-LD/Markdown mirror, and 404 for other
  locale/city variants.
- Funnel coverage: GCLID/UTM capture, one global page view, distinct
  `campaign-beirut-late-night` interactions, and campaign enrichment on the
  existing add-to-cart, checkout-start, GA4 purchase, and Ads conversion
  events without duplicate funnel events.
- Browser coverage runs on desktop Chromium and Mobile Chrome with controlled
  before-cutoff and after-cutoff responses. It verifies exact approved copy,
  support routing, four-card responsive inventory, cutoff-safe relabeling,
  slot persistence, attribution, and serious/critical WCAG violations.

## State checks

### Before cutoff

- Dark teal/charcoal hero shows the exact approved status, headline, support
  copy, primary CTA, and support-agent text link.
- Trust strip says `Order by 11:30 PM Beirut time`, `No address needed`, and
  `Live order tracking`, followed by the live Trustpilot widget.
- `Available Tonight` contains four eligible floral cards; luxury inventory is
  isolated in `Late-Night Luxury Arrangements`.

### After cutoff

- Hero names the next available date/window and uses `Shop flowers for the next
  window`.
- All `tonight` badges, section headings, and trust claims are removed or
  relabeled.
- CTA/product navigation persists the returned next-window slot.

## Staging screenshots

Desktop and mobile screenshots for both controlled states are attached to the
task's browser QA run. These use intercepted campaign responses only to make
the time boundary deterministic; API and cutoff logic are covered separately
by server tests.

## Post-deploy checks

1. Confirm route headers and HTML SEO policy.
2. Confirm campaign API is `no-store` and returns live source freshness.
3. Verify visible products are in stock and checkout accepts the represented
   window before cutoff.
4. Use one real Google Ads click to verify GCLID/UTM, GA4 DebugView, Ads
   conversion, and `campaign-beirut-late-night`.