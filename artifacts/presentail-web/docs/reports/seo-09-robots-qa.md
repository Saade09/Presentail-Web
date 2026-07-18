# SEO-09 robots.txt QA Report

**Date:** 2026-07-18  
**Task:** Confirm Google can reach the right pages after the robots.txt update

---

## 1. Live robots.txt check

`curl https://presentail.com/robots.txt` — fetched 2026-07-18 09:00:23 UTC (HTTP 200):

```
User-agent: *
Allow: /
Disallow: /cart
Disallow: /checkout
Disallow: /auth
Disallow: /account
Disallow: /admin
Disallow: /api/
Disallow: /*/cart
Disallow: /*/checkout
Disallow: /*/auth
Disallow: /*/account
Disallow: /*/sign-in
Disallow: /*/sign-up
Disallow: /*/reset-password
Disallow: /*/favorites
Disallow: /*/order-confirmed
Disallow: /*/personal-information

Sitemap: https://presentail.com/sitemap.xml

# AI crawler guidance — machine-readable content index (llmstxt.org)
# https://presentail.com/llms.txt
# https://presentail.com/llms-full.txt
```

**Status: OUTDATED — production is serving a pre-deployment version.**

Rules present in production ✓ | Rules missing from production (in repo, not yet deployed)
---|---
Disallow /cart, /checkout, /auth, /account, /admin, /api/ | Disallow /order-confirmed ✗
Locale-prefixed variants /*/sign-in, /*/favorites, etc. | Disallow /sign-in, /sign-up, /reset-password, /favorites, /personal-information ✗
| All URL parameter blocks (/*?utm_*, /*?gclid=, /*?gbraid=, /*?wbraid=, /*?orderby=, etc.) ✗
| AI bot User-agent sections (GPTBot, Google-Extended, ClaudeBot, etc.) ✗

**Action required: publish the updated web artifact to apply the repo robots.txt.**

---

## 2. Repo robots.txt — fixed and verified

The repo file (`artifacts/presentail-web/public/robots.txt`) was restructured during this QA pass to fix two bugs introduced by the SEO-09 update:

**Bug 1 — Duplicate UTM Disallow directives:** `utm_source/medium/campaign/id/term/content` appeared twice. The second block was appended after the `Sitemap:` line.

**Bug 2 — Orphaned directives:** The second UTM block plus `gclid`/`gbraid`/`wbraid` sat outside any `User-agent:` block (after the `Sitemap:` line). Most parsers including Googlebot silently ignore orphaned directives, so click-ID parameters were never actually blocked.

**After fix — all checks pass:**

| Check | Result |
|---|---|
| /sign-in blocked | ✓ PASS |
| /order-confirmed blocked | ✓ PASS |
| /favorites blocked | ✓ PASS |
| /personal-information blocked | ✓ PASS |
| /*/sign-in, /*/favorites (locale-prefixed) blocked | ✓ PASS |
| /*?utm_source=, /*?utm_medium=, /*?utm_campaign= blocked | ✓ PASS |
| /*?gclid=, /*?gbraid=, /*?wbraid= blocked | ✓ PASS |
| /*?orderby=, /*?min_price=, /*?max_price=, /*?filter_ blocked | ✓ PASS |
| No duplicate Disallow lines | ✓ PASS |
| GPTBot, ChatGPT-User, Google-Extended, PerplexityBot, anthropic-ai, ClaudeBot, Applebot-Extended sections | ✓ PASS (all 7) |

**Allowed paths (not blocked — Google can reach them):**

- `/shop` — no Disallow rule ✓
- `/brand/*` — no Disallow rule ✓
- `/occasion/*` — no Disallow rule ✓
- `/product/*` — no Disallow rule ✓
- `/brands`, `/occasions`, `/contact`, `/faqs`, `/weddings`, `/corporate` — no Disallow rule ✓
- All locale-prefixed city pages (`/en-lb/beirut`, `/en-ae/dubai`, etc.) — no Disallow rule ✓

---

## 3. Live sitemap check

`curl https://presentail.com/sitemap.xml` — spot-checked 50+ URLs, 2026-07-18:

**FAIL: /llms.txt and /llms-full.txt are present in the live sitemap:**

```xml
<url><loc>https://presentail.com/llms.txt</loc>...</url>
<url><loc>https://presentail.com/llms-full.txt</loc>...</url>
```

**Status: pre-deployment issue only.** The repo's `sitemap.mjs` `buildSitemapXml()` does NOT generate these entries (confirmed by code review — no `llms.txt`/`llms-full.txt` URL generation in the builder). Production is running old code. A fresh deployment will remove these entries.

**Sitemap spot-check (50 URLs) — all expected pages present:**

Sample of confirmed indexable URLs in the sitemap:
- `https://presentail.com/en-lb/beirut` (city home) ✓
- `https://presentail.com/en-lb/beirut/brands` ✓
- `https://presentail.com/en-lb/beirut/occasions` ✓
- `https://presentail.com/en-lb/akkar`, `/en-lb/aley`, `/en-lb/baabda`, `/en-lb/baalbeck`, `/en-lb/batroun`, `/en-lb/bcharee`, `/en-lb/bent-jbeil`, `/en-lb/chouf` (cities) ✓
- All with hreflang alternates for en/ar/fr ✓

No blocked paths (`/sign-in`, `/checkout`, `/cart`, `/favorites`, `/order-confirmed`) found in the sitemap.

---

## 4. Allowed-path verification (robots.txt Tester equivalent)

Verification against the **repo** robots.txt using the same parsing logic as Google's robots.txt Tester:

| URL | Expected | Repo result |
|---|---|---|
| `/shop` | ALLOWED | ✓ ALLOWED |
| `/brand/myflowers` | ALLOWED | ✓ ALLOWED |
| `/occasion/birthday` | ALLOWED | ✓ ALLOWED |
| `/product/roses` | ALLOWED | ✓ ALLOWED |
| `/en-lb/beirut` | ALLOWED | ✓ ALLOWED |
| `/sign-in` | BLOCKED | ✓ BLOCKED |
| `/order-confirmed` | BLOCKED | ✓ BLOCKED |
| `/favorites` | BLOCKED | ✓ BLOCKED |
| `/personal-information` | BLOCKED | ✓ BLOCKED |
| `/en-lb/beirut/checkout` | BLOCKED | ✓ BLOCKED |
| `/en-lb/beirut/sign-in` | BLOCKED | ✓ BLOCKED |
| `/shop?utm_source=google` | BLOCKED | ✓ BLOCKED |
| `/product/roses?gclid=abc` | BLOCKED | ✓ BLOCKED |

---

## 5. Summary

| Item | Pre-deploy (live now) | Post-deploy (repo) |
|---|---|---|
| New bare-path blocks (/sign-in, /order-confirmed, etc.) | ✗ Missing | ✓ Present |
| URL parameter blocks (utm_*, gclid, gbraid, wbraid, etc.) | ✗ Missing | ✓ Present |
| AI bot User-agent sections | ✗ Missing | ✓ Present |
| Duplicate/orphaned Disallow directives | ✓ Not present | ✓ Not present (fixed in repo) |
| /llms.txt in sitemap | ✗ Present | ✓ Absent (not generated by repo code) |
| /llms-full.txt in sitemap | ✗ Present | ✓ Absent (not generated by repo code) |
| /shop, /brand/*, /occasion/* allowed | ✓ Allowed | ✓ Allowed |
| /sign-in, /favorites, /order-confirmed blocked | ✗ Only via locale prefix | ✓ Blocked at root + locale prefix |

**Next step: publish the updated web artifact.** All repo-side checks pass. The live production discrepancies are entirely due to the deployment not yet having gone out.
