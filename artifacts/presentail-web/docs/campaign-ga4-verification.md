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
    `campaign_support_click`, `campaign_pill_click`, `campaign_sticky_cta_*`,
    `campaign_view_all_click` (CampaignLanding)
  - `view_item_list` for the separate Flowers and Luxury Arrangements rails,
    and `select_item` for product clicks, with distinct campaign section ids
  - `add_to_cart` (CartContext, GA4 e-commerce shape with `items`)
  - `begin_checkout` (Checkout, fired once per checkout mount)
  - `purchase` (OrderConfirmed, deduped per order ref, both inline-success and
    redirect-return paths) — fired alongside the Google Ads `conversion` ping.
- Clarity is injected in production builds only (`clarityInjectPlugin.ts`,
  project `mik1damp04`).

GA4 session attribution (linking these events to the ad click) is done by
GA4 itself from the `gclid`/UTM params on the landing-page URL — nothing else
needs to be passed on the individual events.

## Pre-flight: confirm Google Ads auto-tagging is enabled

> ⚠️ **Do this before any ad spend.** Auto-tagging is the mechanism that
> appends `gclid=` to every click URL. Without it, no gclid reaches the
> landing page and Google Ads has nothing to attribute conversions to —
> the campaign will spend budget with zero measurable ROI.

1. Sign in to [Google Ads](https://ads.google.com) with the account that
   owns the flower-delivery campaign.
2. Go to **Settings → Account settings → Auto-tagging**.
3. Confirm the **"Tag the URL that people click through from my ad"**
   checkbox is **checked** (enabled). Enable it and save if it is not.
4. Sanity-check: on a **fresh browser profile** (no ad blocker, no cached
   gclid), click the served flower-delivery ad from a Google search result.
   The landing URL must contain a real `gclid=<value>` query parameter — if
   it is absent, auto-tagging is still off or cached; recheck the setting
   and wait a few minutes for it to propagate.

✅ Only proceed to the steps below once a real `gclid=` is visible in the
landing URL.

## Manual steps (deployed environment)

1. **Open a test visit with debug mode.** On a device with the
   [GA Debugger extension] enabled (or append `&debug_mode=true` handling via
   GTM), visit:

   `https://presentail.com/en-lb/beirut/flower-delivery?gclid=TEST_GCLID_<date>&utm_source=google&utm_medium=cpc&utm_campaign=flower-delivery-launch`

2. **GA4 DebugView** (Admin → DebugView, property with the
   `VITE_GTAG_GA4_ID` measurement id): confirm the device stream shows
   `page_view` (with `gclid` in the page location), `campaign_page_view`,
   then interact with the hero CTA, support link, both view-all links, and a
   product in each rail. Confirm the matching `campaign_*`, `view_item_list`,
   and `select_item` events appear with the Flowers/Luxury section identity.

3. **Funnel events.** Add a product to the cart, proceed to checkout, and
   complete a low-value test purchase (or a Stripe test-mode purchase if
   available). Confirm `add_to_cart`, `begin_checkout` and `purchase`
   (with `transaction_id`, `value`, `currency`) appear in DebugView in order.

4. **Attribution check (next day — GA4 side).** In GA4 → Advertising →
   Attribution (or Traffic acquisition), confirm the session is credited to
   `google / cpc / flower-delivery-launch` and the purchase conversion is
   attributed to it.

   > **Why synthetic gclids don't appear in Google Ads:** GA4 records events
   > for any `gclid` value, but Google Ads only attributes conversions to gclids
   > it generated itself from a real ad click. Manually constructed or test
   > gclids are accepted by GA4 but silently dropped on the Ads side.

5. **Real ad click verification (after campaigns go live — Google Ads side).**
   Once the `/flower-delivery` campaign is active and serving impressions,
   the following steps confirm the full attribution chain end-to-end:

   ### 5a. Verify the conversion action is configured
   1. In [Google Ads](https://ads.google.com), open **Goals → Conversions →
      Summary**.
   2. Locate the conversion action **"Purchase"** (tag ID
      `AW-18281774261`, label `XYi_CNabpMccELX5to1E`).
   3. Confirm **Status** is "Recording conversions" (green) and **Count**
      is "Every" (counts each purchase, not just the first).
   4. Confirm **Attribution model** is set (Last click or data-driven).

   ### 5b. Trigger one real click-through purchase
   1. On a **fresh browser profile** (no ad blocker, no cached gclid):
      search Google for the targeted keyword and click the served ad for
      presentail.com/flower-delivery.
   2. The landing URL will contain a real `gclid=<...>` query parameter
      generated by Google Ads — copy it for reference.
   3. Complete a genuine purchase (any low-value product). The order
      confirmation page fires both the GA4 `purchase` event and the Ads
      `conversion` ping to `AW-18281774261/XYi_CNabpMccELX5to1E`.

   ### 5c. Check Google Ads Conversions (allow 1–3 business days)
   1. In Google Ads → **Campaigns**, select the flower-delivery campaign.
   2. Add the **Conversions** column to the table view (Columns → Modify
      columns → Conversions → Conversions).
   3. Set the date range to include the day of the test click.
   4. Confirm the campaign shows **≥ 1 conversion** for the "Purchase"
      action. If the row shows `--` or 0, see Gotchas below.

   ### 5d. Confirm GA4 attribution for the same session
   1. In GA4 → **Advertising → Attribution → Conversion paths** (or
      **Traffic acquisition**), filter by `Session source/medium` =
      `google / cpc`.
   2. Locate the session with the known `transaction_id` from step 5b.
   3. Confirm `Session campaign` = `flower-delivery-launch` (or the exact
      campaign name set in Google Ads).

   ✅ **Done:** both GA4 and Google Ads show the purchase attributed to the
   flower-delivery campaign. The attribution chain is confirmed end-to-end.

6. **Clarity.** In clarity.microsoft.com (project `mik1damp04`), filter
   recordings by landing page URL containing `/flower-delivery` and confirm
   the test session was recorded.

## Gotchas

- Ad blockers block gtag.js and Clarity entirely — use a clean profile.
- `purchase`/`conversion` are deduped per order ref via sessionStorage:
  reloading the confirmation page will not re-fire them.
- DebugView only shows devices with debug mode enabled; normal traffic
  appears in Realtime instead.
- Google Ads conversion counts have a reporting delay of up to 3 business
  days. If Conversions shows `--` immediately after the test click, wait
  before concluding attribution is broken.
- Auto-tagging must be **enabled** in Google Ads (Settings → Account
  settings → Auto-tagging) for gclids to be appended to click URLs. Without
  it no gclid reaches the landing page and no Ads-side attribution occurs.
- The conversion window for this action defaults to 30 days (clicks); a
  purchase must happen within that window of the click to be attributed.

[GA Debugger extension]: https://chromewebstore.google.com/detail/google-analytics-debugger/jnkmfdileelhofjcijamephohjechhna
