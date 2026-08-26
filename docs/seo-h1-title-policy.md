# H1 and SEO title policy

## Root cause

Presentail's shared SEO builders historically returned a title and description, but not the page H1. Server and React renderers therefore reconstructed headings independently. Generic server pages fell back to the title when an H1 template was absent, brand server rendering bypassed the city-aware builder, corporate copy split the SEO title to manufacture a heading, and blog content allowed equal title/H1 values without normalized validation.

The defect was architectural rather than content-specific: title and H1 had no shared contract, and existing audits never compared their normalized meaning.

## Permanent policy

Every shared metadata builder now resolves three independent values:

1. `h1`: the user-facing heading.
2. `title`: an explicitly authored SEO title when valid, otherwise a localized page-type template, otherwise a localized safe fallback.
3. `description`: authored content when available, otherwise a localized page-type fallback.

Server-rendered HTML and hydrated pages consume the same resolved values. A renderer must not use the title as an H1 fallback.

Collision normalization decodes HTML entities, applies Unicode NFKC normalization, folds case and whitespace, removes basic punctuation, and removes a trailing Presentail brand suffix. A suffix-only distinction therefore still fails.

## Reported pages

| URL | H1 | SEO title |
| --- | --- | --- |
| `/en-lb/chouf/product/summer-daisy-garden` | Summer Daisy Garden | Summer Daisy Garden — Chouf \| Presentail |
| `/en-lb/jezzine/product/my-protector` | My Protector | My Protector — Jezzine \| Presentail |
| `/en/blog/flower-shops-in-lebanon` | Flower Shops in Lebanon: A Complete Guide | Flower Shops in Lebanon: A Complete Guide to Ordering Online |
| `/fr/blog/corporate-gifting-lebanon` | Cadeaux d’entreprise au Liban : idées pour équipes et clients | Guide des cadeaux d’entreprise au Liban \| Presentail |
| `/fr/blog/flower-shops-in-lebanon` | Fleuristes au Liban : guide complet pour commander en ligne | Fleuristes au Liban et livraison en ligne \| Presentail |

## Guardrails

- The focused metadata-policy test covers EN/FR/AR product, category, occasion, brand, corporate, and blog precedence/fallback behavior.
- The server injection regression suite includes the five reported pages and representative city/category/occasion/brand/corporate routes.
- The API SEO audit reports normalized H1/title collisions alongside its existing title, description, H1, canonical, hreflang, and structured-data checks.
- `pnpm --filter @workspace/presentail-web run check-seo-sitewide` enumerates sitemap URLs, fetches them with bounded concurrency, reports URL-level metadata defects and cross-page duplicate titles/descriptions, and prints discovered/scanned coverage totals.

## Verification

A production-style scan of the generated sitemap on August 26, 2026 discovered and fetched 3,783 indexable routes with concurrency capped at 24. It reported:

- 0 normalized H1/title collisions.
- 0 missing H1s.
- 0 multiple-H1 defects.
- 1,367 other existing findings: 1,025 duplicate-description groups, 144 short titles, 25 duplicate-title groups, 15 long titles, and 158 hreflang findings across missing tags, pagination targets, self references, x-defaults, expected locale siblings, and targets absent from the sitemap.

The five originally reported URLs each returned raw server HTML with exactly one H1 and the H1/title pairs documented above.