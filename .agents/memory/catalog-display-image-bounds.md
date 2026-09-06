---
name: Catalog display image bounds
description: Durable quality and fallback rules for shopper-facing OS product images.
---

Catalog cards/search results use a 400px WebP default, while product galleries use a 1200px WebP default. Responsive web candidates may vary within the proxy, and intentional detail/zoom requests may use a larger bounded variant. A failed display proxy must never be unwrapped to the raw OS object-storage URL.

**Why:** Raw retry paths silently bypass image budgets and can make shoppers download multi-megabyte originals. Social-share selection is a separate concern and must continue to use its dedicated source-image flow rather than display URLs.

**How to apply:** Any new shopper-facing catalog endpoint or client image retry must preserve a bounded `/api/img/proxy` URL. Keep static fallbacks, video media, and dedicated social-image behavior separate.