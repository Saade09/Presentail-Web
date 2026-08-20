---
name: Midnight delivery helper copy
description: Rules for the product and delivery-modal explanation beneath the 11 PM–1 AM Midnight Delivery slot
---

For English Midnight Delivery helper copy, derive “today” from the storefront market timezone and say: “Arrives between 11 PM tonight and 1 AM on [next date].” For future selected dates, use explicit start and end dates: “Arrives between 11 PM on [start date] and 1 AM on [end date].” The end date is always the calendar day after the selected date.

**Why:** The slot crosses midnight, so “the day before” is confusing and device-local date checks can be wrong around a market’s midnight.

**How to apply:** Keep date formatting as `Fri, 21 Aug`, use date-only arithmetic that handles boundaries, and update every web surface that renders the shared midnight helper translation. Do not change slot fees, eligibility, or availability when changing this wording.