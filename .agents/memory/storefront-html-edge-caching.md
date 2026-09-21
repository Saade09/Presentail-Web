---
name: Storefront HTML edge caching
description: Deployment-edge cache rewriting and safe dynamic HTML compression rules for the public storefront.
---

Keep all storefront HTML `private, no-store` while it is served by the autoscale
application router. Public caching is limited to URL-addressed assets, images,
and reference/catalog data until HTML has a cookie-free delivery origin.

**Why:** The router establishes affinity on a completely anonymous first
request and rewrites public policies after the origin. Public HTML directives
therefore do not create reliable shared reuse and can obscure the real boundary.

**How to apply:** When changing HTML response branches, route all cache policy
through the shared private policy, negotiate encoding with q-values (406 when
every representation is refused), and use moderate dynamic compression. Only
reconsider public HTML after production proves a first anonymous response has
no affinity cookie or rewrite; hashed assets retain build-time sidecars.