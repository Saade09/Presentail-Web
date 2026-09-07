---
name: Replit affinity cache rewrite
description: Hosting-layer Cache-Control rewriting caused by Replit deployment affinity cookies.
---

Replit’s published-app infrastructure adds the `GAESA` affinity cookie and rewrites the origin’s `Cache-Control: public` directive to `private`. The application cannot disable or alter that platform cookie.

**Why:** The production origin can already emit the exact desired public immutable directive for hashed assets, while the public response still arrives as private. The same rewrite affects public HTML, confirming it occurs after application response handling.

**How to apply:** When production cache directives differ only by public/private and the response sets `GAESA`, verify the local origin header before editing application code. Treat changing this behavior as a hosting/deployment configuration issue; do not compensate by altering unrelated CDN headers.