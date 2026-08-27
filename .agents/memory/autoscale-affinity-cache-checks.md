---
name: Autoscale affinity cache checks
description: How to interpret production cache headers when Replit autoscale establishes its affinity cookie.
---

Production cache verification must capture both the first cookie-less response
and a subsequent response with the Replit autoscale affinity cookie. Keep the
cookie only in memory during the check; evidence may record its name and
presence, never its value.

**Why:** Replit autoscale can add a `GAESA` `Set-Cookie` header on the first
anonymous request and rewrite that response's otherwise public `Cache-Control`
to `private`. Once affinity is established, the same application response
retains its public finite cache policy. Treating only the anonymous response as
the application policy creates a false deployment regression; ignoring it
hides a real first-request shared-cache limitation.

**How to apply:** For production cache audits, first record an anonymous probe,
then acquire affinity from a harmless page request and reuse it for browser,
crawler, warm-cache, and concurrency checks. Persist only
`cookieAcquired: true/false` and the cookie name.