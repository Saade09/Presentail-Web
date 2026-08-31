---
name: City home SEO overrides pattern
description: Durable decisions behind per-city hand-written landing-page SEO (Tripoli pattern) and pitfalls when extending it to another city.
---

Decisions made for the Tripoli landing page (Aug 2026), to stay consistent with when adding more cities (e.g. Batroun):

- **Single source of truth:** each overridden city's title/description/H1/intro/why-points/FAQs live in ONE shared override map consumed by the server injector, client head manager, JSON-LD builders, and hydrated React page. **Why:** server-only metadata or body copy changes after hydration are a cloaking signal. **How to apply:** never hand-write city landing copy separately; both head managers must consult the override, and identical intro/coverage prose must be emitted only once.
- **Visible-body reversal:** the generic city-home crawler body is now visible HTML (plain `<h1>`, no display:none). The old sr-only/display:none approach was deliberately reversed because hidden keyword content is itself a cloaking signal.
- **`.md` mirrors are noindex,follow** (with canonical Link header) so they never compete with the HTML pages in search.
- Gotchas: client `cityId` is already the `"{country}-{city}"` key — don't re-prefix the country. City copy must pass the 80% Jaccard similarity gate and the hardcoded-strings gate (crawler-facing EN needs i18n-ignore markers).
