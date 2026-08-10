# SEO Post-Deploy Checklist — Tripoli City Landing Page

Run through this checklist after deploying the Tripoli SEO changes
(`/en-lb/tripoli` metadata, visible copy, and `.md` mirror noindex).

## 1. Immediate verification (day 0)

- [ ] `curl -s https://presentail.com/en-lb/tripoli | grep -o '<title>[^<]*</title>'`
      returns `Flower Delivery in Tripoli, Lebanon | Presentail`.
- [ ] The meta description in the `<head>` matches the target copy exactly.
- [ ] The initial HTML contains a visible `<h1>Flower Delivery in Tripoli, Lebanon</h1>`
      — no `sr-only` class, no `display:none` ancestor.
- [ ] Hero supporting text, delivery-coverage paragraph, "Why Presentail" points,
      and all 8 FAQ answers are readable plain text in the initial HTML.
- [ ] The FAQPage JSON-LD questions match the visible FAQ block 1:1
      (validate at https://validator.schema.org/).
- [ ] A `CollectionPage` JSON-LD entity is present with `@id`, `url`, `name`,
      `description`, `inLanguage: en-LB`, `isPartOf`, `breadcrumb`, `publisher`.
- [ ] `curl -I https://presentail.com/en-lb/tripoli.md` returns
      `X-Robots-Tag: noindex, follow` AND the canonical `Link` header.
- [ ] `curl -I https://presentail.com/en-lb/tripoli` does NOT carry any
      noindex directive (page stays index, follow).
- [ ] Spot-check one other city (e.g. `/en-lb/beirut`) — title, copy, and FAQs
      unchanged from before the deploy.

## 2. Google Search Console (day 0–1)

- [ ] URL Inspection on `https://presentail.com/en-lb/tripoli`:
      - View the **rendered HTML** and confirm the H1 and body copy are visible.
      - Confirm "Indexing allowed: Yes" and the correct canonical.
- [ ] Click **Request Indexing** to trigger a recrawl.
- [ ] URL Inspection on `https://presentail.com/en-lb/tripoli.md`:
      confirm "Indexing allowed: No — noindex detected in HTTP header".
- [ ] Resubmit the sitemap(s) under Sitemaps (`/sitemap.xml`).
- [ ] Confirm `/en-lb/tripoli.md` does not appear in any submitted sitemap.

## 3. Baseline recording (day 0)

Record in a tracking sheet before rankings can move:

- [ ] Current Google position for "flower delivery tripoli lebanon",
      "flowers tripoli lebanon", "send flowers to tripoli" (use incognito or a
      rank tracker; note date).
- [ ] GSC performance for the `/en-lb/tripoli` page: clicks, impressions,
      average position (last 28 days).
- [ ] Whether `/en-lb/tripoli.md` currently appears with a `site:` query:
      `site:presentail.com/en-lb/tripoli.md`.

## 4. Monitoring schedule

| Check | +14 days | +28 days | +56 days | +90 days |
|---|---|---|---|---|
| GSC: `/en-lb/tripoli` impressions & avg. position vs baseline | ☐ | ☐ | ☐ | ☐ |
| `.md` URL dropped from `site:` results | ☐ | ☐ | ☐ | ☐ |
| Rich results (FAQ) shown/eligible in GSC Enhancements | ☐ | ☐ | ☐ | ☐ |
| Canonical still `/en-lb/tripoli` in URL Inspection | ☐ | ☐ | ☐ | ☐ |
| No coverage errors / soft-404s for the page | ☐ | ☐ | ☐ | ☐ |

If after 56 days impressions have not improved, re-inspect the rendered HTML
(a regression may have re-hidden the copy) before changing the copy itself.

## 5. .md deindex confirmation

- [ ] `site:presentail.com/en-lb/tripoli.md` returns no results (expect within
      2–6 weeks of the recrawl).
- [ ] Other city `.md` mirrors also carry `X-Robots-Tag: noindex, follow`
      (spot-check `/en-lb/beirut.md`, `/en-ae/dubai.md`).

## 6. Legitimate link building

Only pursue links that would make sense without SEO:

- [ ] Local business directories for Lebanon/Tripoli (accurate NAP data only).
- [ ] Partnerships with Tripoli-based florists/suppliers already working with
      Presentail (a "delivery partner" mention on their site).
- [ ] Diaspora community sites and gift guides ("how to send flowers to
      Lebanon from abroad") — offer genuinely useful content, not paid links.
- [ ] Never buy links, join link farms, or exchange reciprocal links at scale —
      these risk manual actions that would outweigh any Tripoli gains.
