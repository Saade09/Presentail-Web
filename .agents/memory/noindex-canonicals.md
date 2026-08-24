---
name: Canonicals on noindex entity pages
description: Entity pages retain their HTML canonical even when the eligibility gate adds noindex.
---

Noindex and canonical serve different purposes: an ineligible collection/entity page must retain its canonical `<link>` tag while emitting `noindex, follow`.

**Why:** The HTTP `Link` header is not a substitute for the document-head canonical. Some crawlers inspect only the HTML and need the canonical to consolidate duplicate signals correctly; stripping it caused the Valentine’s Day occasion page to have no in-document canonical.

**How to apply:** When adding or modifying page-eligibility logic for product, brand, category, occasion, or recipient routes, add/replace the robots directive without removing the canonical. Verify both the HTML head and HTTP headers for server-rendered routes.