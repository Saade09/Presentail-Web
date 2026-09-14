---
name: OS Express fee contract
description: How to interpret Presentail OS Express totals and explicit surcharges
---

Rule: treat OS `express_delivery_fee` as the configured total Express fee unless `express_surcharge` is explicitly supplied. Charge only the total-minus-standard increment while standard delivery is paid; charge the full Express total when standard delivery is free. Explicit surcharges remain additive in both cases.

**Why:** deriving and storing only `$15 - $11 = $4` caused a free-standard Baabda order to charge $4 instead of the configured $15 Express fee.

**How to apply:** preserve both OS fields through parsing, currency conversion, and cache snapshots; resolve the Express component from the effective standard fee in every quote, payment, recovery, and order path.