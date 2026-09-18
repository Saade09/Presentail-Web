---
name: Trustpilot bootstrap lifecycle
description: The boundary between the app-owned Trustpilot bootstrap loader and the vendor-owned embedded TrustBox iframe.
---

The application should request Trustpilot's official bootstrap script once per page session, initialize each mounted TrustBox element once, and treat the vendor's embedded `trustboxes/.../index.html` document as a normal iframe dependency rather than an app availability probe.

**Why:** A healthy widget necessarily fetches a TrustBox document after `loadFromElement`; counting that request as a template probe or testing it independently can incorrectly trigger fallback and hide working reviews.

**How to apply:** Keep loader failures limited to bootstrap script failure or a thrown/rejected/false `loadFromElement` result. Use event-driven script load handling and per-element guards; do not add template probes, polling, retries, timers, or geo-specific branches.