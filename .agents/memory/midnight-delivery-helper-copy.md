---
name: Midnight delivery helper copy
description: Rules for the product and delivery-modal explanation beneath the 11 PM–1 AM Midnight Delivery slot
---

For English Midnight Delivery helper copy, derive “today” from the storefront market timezone and say: “Arrives between 11 PM tonight and 1 AM on [next date].” For future selected dates, use explicit start and end dates: “Arrives between 11 PM on [start date] and 1 AM on [end date].” The end date is always the calendar day after the selected date.

**Why:** The slot crosses midnight, so “the day before” is confusing and device-local date checks can be wrong around a market’s midnight.

**How to apply:** Keep date formatting as `Fri, 21 Aug`, use date-only arithmetic that handles boundaries, and update every web surface that renders the shared midnight helper translation. Do not change slot fees, eligibility, or availability when changing this wording.

## Midnight as a premium selection in summaries

When a Midnight slot is the active selection, treat it as a deliberate premium choice: never upsell Express against it on any summary surface (upgrade card, quiet prompt), and give it its own branded card/label instead of the generic slot row.

**Why:** Upselling a cheaper/parallel service against a deliberately chosen premium slot reads as a bug to shoppers; the design-approved cart card exists precisely to honour the choice.

**How to apply:** Detect midnight via `serviceType === "midnight"` on DeliverySelectionContext (authoritative, captured at confirm; `useMidnightSlotValidation` clears it when the slot disappears or the city changes) OR via `isMidnightSlot(resolvedSlot, cityId)` as a fallback — never infer from customer-facing labels. Fees must come from the resolved slot's `extraFee`, never hardcoded. When gating an offer surface, also add a suppression reason to the offer analytics so funnels stay interpretable.