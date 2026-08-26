---
name: Shared H1/title policy
description: Durable rules for independent page headings, SEO titles, and trustworthy sitewide metadata validation.
---

Every indexable page builder must resolve H1, SEO title, and description as independent values. Renderers must consume the builder-owned H1 rather than splitting or reusing the title, including server fallback paths.

**Why:** Independent server/client derivation allowed suffix-only H1/title collisions and caused fallback crawler HTML to disagree with hydrated pages.

**How to apply:** Preserve explicitly authored metadata when valid; otherwise use localized page-type templates. Normalize entities, Unicode, punctuation, whitespace, case, and the Presentail suffix when comparing H1/title meaning.

Sitemap metadata audits must validate canonical query policy and the full hreflang relationship: self target, locale/URL agreement, expected sitemap siblings, x-default, reciprocity, and target indexability.

**Why:** Checking only for any alternate tag plus x-default can report false confidence while pagination or non-indexable targets remain inconsistent.

**How to apply:** Derive expected siblings from the scanned sitemap route groups and report target-level findings separately from H1/title results.