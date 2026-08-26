---
name: Storefront HTML edge caching
description: Deployment-edge cache rewriting and safe dynamic HTML compression rules for the public storefront.
---

Public storefront HTML must use explicit `max-age=0` browser revalidation plus
positive shared-cache directives, without combining them with `no-cache` or
`Expires: 0`. Keep transactional, noindex, negotiation-error, and personalized
HTML on `no-store`.

**Why:** The deployed edge rewrote mixed `public` + `no-cache` responses to
`private`, so warm origin spot checks looked fast while crawlers could not reuse
HTML. Default dynamic Brotli also dominated the origin phase despite small HTML.

**How to apply:** When changing HTML response branches, route all cache policy
through the shared public/private classification, preserve noindex privacy,
negotiate encoding with q-values (406 when every representation is refused),
and use moderate dynamic compression; hashed assets keep build-time sidecars.