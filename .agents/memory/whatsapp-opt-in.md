---
name: WhatsApp order-updates opt-in
description: Cross-layer naming and default rules for the checkout WhatsApp opt-in flag
---
- Web checkout sends `whatsappOptIn` (camelCase, optional boolean) in the order body; DB column is `app_orders.whatsapp_opt_in` (nullable — null = legacy/mobile client never sent it); OS wire field is `whatsapp_opt_in` (snake_case), **always sent explicitly** — absent client values collapse to `false`.
- **Why:** OS gates transactional WhatsApp sends on this flag and treats absence as false; an explicit boolean avoids OS guessing. Target number is the existing `senderPhone` (billing phone, E.164) — never add a second phone field.
- **How to apply:** any new order-creation path (mobile app, new payment flow) must thread the flag through the body; the pending-order queue stores the raw body so schema-optional fields survive retries automatically.
- Test harness lesson: Checkout card-flow jsdom tests only reach `finalizeOrderNow`/`createOrder` if the raw `fetch` POST to the klarna-pending endpoint is stubbed (`vi.stubGlobal("fetch", ...)`); the baseline cardFlow suite fails for exactly this reason.
