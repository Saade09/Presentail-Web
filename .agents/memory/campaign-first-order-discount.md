---
name: Campaign first-order auto-discount (FIRST10)
description: How the Google Ads landing page's automatic 10% first-order discount is wired through the existing coupon system
---

The "10% off your first order" promo is a **virtual coupon `FIRST10`** intercepted at the top of the server's `validateCoupon()` before OS delegation, so all existing coupon paths (payment-intent creation, order-time re-validation) apply it consistently with no new pricing path.

**Why:** reusing validateCoupon guarantees charged amount = recorded discount everywhere; inventing a parallel discount mechanism would drift from coupon/loyalty logic.

**How to apply:**
- Eligibility = no `app_orders` row with the same sender_email (case-insensitive, excluding `payment_failed`). Enforcement lives server-side at coupon apply + order creation; `GET /api/campaign/first-order-eligibility` is advisory only and fails open for guests.
- Sentinel `couponId "first-order-10"` must be OMITTED from the OS order payload (couponDiscountUsd still sent) — OS rejects unknown coupon ids.
- Web: promo-shown flag `@presentail/campaign_first10_v1` (30d TTL) triggers a silent auto-apply effect in Checkout; every order-success path (inline, wallet stash, OrderConfirmed redirect) sets `@presentail/has_ordered_v1` and clears the flag.
- Campaign analytics events must not send `surface` (server enum is restricted); use `linkSlug` for detail.
