---
name: Single recipient-name field in web checkout
description: Web checkout uses one recipient-name field; mapping rules to legacy first/last consumers
---

The web checkout Delivery Details step has a single "Recipient name" field (no surname requirement, no title-casing, trimmed at submit).

**Rules:**
- Whole entered value travels as `recipient.firstName`; `lastName` is always `""` in the order payload and `null` in new saved addresses. Never split the name.
- Legacy saved addresses with split first/last are joined via `joinRecipientName()` (`presentail-web/src/lib/recipientName.ts`) when populating the field.
- Phone label has a Radix-Popover info tooltip (`PhoneInfoTooltip`) whose copy switches with the ask-recipient-for-address toggle; analytics events: `checkout_recipient_name_error`, `phone_tooltip_opened`, `checkout_continued_after_phone_tooltip` (client union + server webEvents enum).

**Why:** gift senders often don't know the recipient's surname; forcing two fields caused checkout friction.

**How to apply:** any new surface reading recipient names must treat firstName as the full display name; don't reintroduce lastName requirements or title-casing on this field. Test id is `input-recipient-name`.
