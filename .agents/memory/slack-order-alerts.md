---
name: Slack order alerts via Replit connector
description: How UAE order Slack alerts post via the Replit Slack connection, and the gotchas hit during setup
---

# Slack order alerts (UAE)

- Slack posting uses the Replit Slack **connection** (`@replit/connectors-sdk` → `connectors.proxy("slack", "/chat.postMessage")`), NOT incoming webhooks — the user declined webhook secrets because their workspace has no webhook option but Replit is connected to Slack.
- **Why:** incoming webhooks weren't creatable in their workspace; the connector is the sanctioned path.
- **How to apply:** for any future Slack notification feature, reuse the connector pattern in the UAE order notifier lib (api-server). Never cache the client; construct `ReplitConnectors` per call.

Gotchas:
- The connected identity is bot "replit"; it must be **invited to each target channel** or `chat.postMessage` fails `not_in_channel`. It lacks `channels:join` so it cannot join itself — the user adds it via channel → Integrations → Add apps.
- `conversations.list` with `types=private_channel` fails `missing_scope`; public-only listing works.
- Actual channel names: `#dubai-order` and `#abudhabi-orders` (plural — the task spec said #abudhabi-order, which doesn't exist). Names are overridable via SLACK_DUBAI_ORDER_CHANNEL / SLACK_ABUDHABI_ORDER_CHANNEL env vars.
