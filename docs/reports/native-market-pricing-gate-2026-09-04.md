# Native market pricing rollout gate

Date: 2026-09-04 (Asia/Dubai)

## Decision

The authorized reviewer approved:

- accepting the remaining policy risk of showing market-native product pricing only to the narrowly allowlisted Google commerce crawlers;
- shipping the OS-authored AED price for **Large White Heart Box** without changing it in Presentail OS.

The implementation must remain limited to product price amount and currency presentation. It must not vary content, availability, images, layout, navigation, delivery fees, checkout charging, or other behavior.

## Google policy review

Sources reviewed on 2026-09-04:

1. [Google Search spam policies — Cloaking](https://developers.google.com/search/docs/essentials/spam-policies#cloaking)
   - Google defines cloaking as presenting different content to users and search engines with intent to manipulate rankings or mislead users.
   - Google lists inserting content only for a requesting user agent as an example.
2. [Merchant Center — Mismatched product price](https://support.google.com/merchants/answer/12159029?hl=en)
   - Googlebot compares the data-source price with the landing page and structured data.
   - Prices in the initial server HTML must exactly match Merchant Center.
   - The guidance says not to change landing-page price based on location, cookies, browsers, devices, or another factor.
3. [Merchant Center — Inaccurate price due to inconsistency](https://support.google.com/merchants/answer/9773429?hl=en)
   - A shopper clicking a Shopping ad or free listing is expected to see the same price and availability as the listing.

**Conclusion:** Google's documentation does not explicitly support crawler-only market pricing merely because a human can manually select the same currency. The reviewer explicitly accepted this unresolved risk; the approval is not a statement that Google has documented the technique as safe.

## Catalog impact review

A fresh read of the Presentail OS list API was performed on 2026-09-04 and recorded in `native-market-price-comparison-2026-09-04.csv`.

- The current endpoint returned 976 unique list rows. It did not reproduce the historical 379-product population referenced by the rollout plan.
- The single-product detail endpoint returned HTTP 401 for this credential, so the comparison uses price fields already present in the list response.
- Three current rows had no positive native AED regular price and therefore must not produce a synthetic AED offer.
- **Large White Heart Box** (`id=886`) has USD regular price 360 and OS-authored AED regular price 2,774. The previous peg-and-round-to-five display is AED 1,320, making the stored AED price 2.1015 times the previous display price. The reviewer approved shipping AED 2,774 as authored.

The historical 379-product comparison was not uploaded and is not present in the repository. This fresh report must not be represented as that missing historical artifact.

## UAE Merchant data-source verification

Read-only Merchant API access is not configured in this Replit, no Merchant account identifier is checked into the project, and no Google Merchant Center connector is available through Replit integrations. Therefore source names, source types, item counts, and last-update timestamps could not be independently enumerated here.

The statement that exactly two OS API sources are registered remains externally unverified in this report.

## Public XML retirement verification

The checked-in API route returns HTTP 410 for `/feeds/google-merchant/ae.xml`.

Production was checked directly on 2026-09-04 at 13:40 UTC. It still returned:

- HTTP 200;
- `content-type: application/rss+xml`;
- a live 407-item UAE feed.

Therefore the checked-in retirement response had not reached production at verification time. The former public XML response remained available and must not be reported as retired in production.

## Implementation controls

- Only these user-agent tokens qualify: `Googlebot`, `Googlebot-Image`, `Storebot-Google`, `AdsBot-Google`, and `AdsBot-Google-Mobile`.
- AI crawlers, other Google crawler variants, unrelated bots, and human browsers do not qualify.
- The override applies only to AE/LB product routes.
- UAE requires a positive OS-authored native AED regular price; no USD conversion, FX markup, or round-to-five fallback is permitted.
- An active UAE sale uses the positive OS-authored AED discount directly.
- Lebanon uses the direct USD regular/sale decision.
- Server-visible body price, product price meta tags, and Product/Offer JSON-LD reuse one resolved amount and currency.
- Human manual selection, geo-IP, browser-locale, and USD fallback precedence are unchanged.