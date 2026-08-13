---
name: AED symbol in sentence copy
description: Rendering policy — dirham/riyal SVG symbols in sentence copy instead of literal "AED"/"SAR" text
---

Rule: never interpolate string-formatted prices into user-visible sentence copy — for AED/SAR that renders literal "AED 55" text instead of the brand's SVG currency symbol. Compose the sentence as nodes using the existing price-rendering components (grep for the shared fee-node/price helpers in web and mobile).

**Why:** Brand mandate (Aug 2026) that the UAE dirham SVG symbol appears everywhere an AED amount is shown, matching nearby price components.

**How to apply:** Applies to all rendered screens (web + mobile). Plain-text contexts (native `Alert.alert`, emails, SEO/meta, analytics, aria-labels) cannot render SVG — keeping the currency code there is intentional and acceptable.
