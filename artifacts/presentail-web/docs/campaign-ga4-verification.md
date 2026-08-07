# Campaign → GA4 end-to-end verification runbook

Before turning on real ad spend for the `/flower-delivery` campaign, run this
checklist against the **deployed** site (presentail.com). The client-side half
is already regression-tested in `e2e/campaign-ga4-funnel.spec.ts`; this runbook
covers the parts that can only be confirmed inside GA4 / Google Ads / Clarity.

## What the code guarantees (already automated)

- A visit with `gclid` + UTM params stores first/last-touch attribution in
  localStorage for 90 days (`src/lib/attribution.ts`) and it survives
  navigation through the funnel.
- gtag mirrors fire into `dataLayer` for:
  - `campaign_page_view`, `campaign_promo_*`, `campaign_hero_cta_click`,
    `campaign_pill_click`, `campaign_sticky_cta_*`, `campaign_view_all_click`
    (CampaignLanding)
  - `add_to_cart` (CartContext, GA4 e-commerce shape with `items`)
  - `begin_checkout` (Checkout, fired once per checkout mount)
  - `purchase` (OrderConfirmed, deduped per order ref, both inline-success and
    redirect-return paths) — fired alongside the Google Ads `conversion` ping.
- Clarity is injected in production builds only (`clarityInjectPlugin.ts`,
  project `mik1damp04`).

GA4 session attribution (linking these events to the ad click) is done by
GA4 itself from the `gclid`/UTM params on the landing-page URL — nothing else
needs to be passed on the individual events.

## Manual steps (deployed environment)

1. **Open a test visit with debug mode.** On a device with the
   [GA Debugger extension] enabled (or append `&debug_mode=true` handling via
   GTM), visit:

   `https://presentail.com/flower-delivery?gclid=TEST_GCLID_<date>&utm_source=google&utm_medium=cpc&utm_campaign=flower-delivery-launch`

2. **GA4 DebugView** (Admin → DebugView, property with the
   `VITE_GTAG_GA4_ID` measurement id): confirm the device stream shows
   `page_view` (with `gclid` in the page location), `campaign_page_view`,
   then interact with a promo/pill/CTA and confirm the matching
   `campaign_*` events appear with `section: campaign-flower-delivery`.

3. **Funnel events.** Add a product to the cart, proceed to checkout, and
   complete a low-value test purchase (or a Stripe test-mode purchase if
   available). Confirm `add_to_cart`, `begin_checkout` and `purchase`
   (with `transaction_id`, `value`, `currency`) appear in DebugView in order.

4. **Attribution check (next day).** In GA4 → Advertising → Attribution
   (or Traffic acquisition), confirm the session is credited to
   `google / cpc / flower-delivery-launch` and the purchase conversion is
   attributed to it. In Google Ads, the `conversion` ping
   (`AW-18281774261/XYi_CNabpMccELX5to1E`) will show under Conversions once
   the test `gclid` is a real ad click — synthetic gclids are recorded by GA4
   but ignored by Google Ads, so the final Ads-side check needs one real
   ad click after campaigns go live.

5. **Clarity.** In clarity.microsoft.com (project `mik1damp04`), filter
   recordings by landing page URL containing `/flower-delivery` and confirm
   the test session was recorded.

## Gotchas

- Ad blockers block gtag.js and Clarity entirely — use a clean profile.
- `purchase`/`conversion` are deduped per order ref via sessionStorage:
  reloading the confirmation page will not re-fire them.
- DebugView only shows devices with debug mode enabled; normal traffic
  appears in Realtime instead.

[GA Debugger extension]: https://chromewebstore.google.com/detail/google-analytics-debugger/jnkmfdileelhofjcijamephohjechhna
