---
name: Express order signaling
description: How Express delivery must remain identifiable across checkout, order persistence, confirmations, and Presentail OS
---

Treat Express as an explicit delivery-service choice and carry that boolean through every order payload. Do not infer Express solely from a positive surcharge or a scheduled-slot label. Express confirmation summaries should render the service label even when the slot field is empty.

**Why:** Express can legitimately have a zero surcharge, while web checkout intentionally leaves scheduled-slot fields empty for Express. Fee- or slot-based inference silently downgrades those orders to standard delivery, leaving confirmation pages and OS order views/emails without the service.

**How to apply:** Whenever an order payload, payment snapshot, recovery path, or downstream OS mapping is changed, preserve the explicit Express flag. Use fee/legacy slot inference only as backward compatibility for older saved payloads.