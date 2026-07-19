# Subdomain Redirect Runbook — lb. / ae. / cy. → presentail.com

> **Audience**: infra / DNS administrator  
> **Goal**: 301-redirect all traffic from the retired country subdomains
> (`lb.presentail.com`, `ae.presentail.com`, `cy.presentail.com`) to the
> canonical apex (`presentail.com`) so their indexed pages and link equity merge
> into the main domain.

---

## Redirect target semantics

All three subdomains redirect to the **fixed locale city-root**, not to the
same path on the apex.  The path is intentionally dropped because old WordPress
URLs on these subdomains have no direct equivalent in the SPA:

| Incoming hostname | Fixed target (all paths) |
|---|---|
| `lb.presentail.com/*` | `https://presentail.com/en-lb/beirut/` |
| `ae.presentail.com/*` | `https://presentail.com/en-ae/dubai/` |
| `cy.presentail.com/*` | `https://presentail.com/en-cy/nicosia/` |

> **Why not path-preserving?**  
> Inbound links use old WordPress path patterns (`/product-category/roses`,
> `/shop/`, `/product/bouquet-101`).  Those paths are not valid SPA routes.
> A path-preserving redirect would land the visitor on a 404; a fixed city-root
> redirect always lands them on a valid, crawlable page.

---

## Overview

Two layers are required:

| Layer | Responsibility | Status |
|---|---|---|
| **DNS CNAME** | Route subdomain traffic to the same server as `presentail.com` | ⬜ TODO — infra team |
| **CDN / load-balancer redirect rule** | Issue the 301 response before the request reaches the origin server | ⬜ TODO — infra team |
| **serve.mjs in-server guard** | Fallback 301 for any traffic that bypasses the CDN layer | ✅ Implemented (this repo) |

The in-server guard in `serve.mjs` (`COUNTRY_SUBDOMAIN_TARGETS` Map + redirect
block around line 1007) is already live, but it can only fire when DNS has been
pointed at the Replit server.  Complete the DNS and CDN steps below to fully
activate the redirects.

---

## Step 1 — DNS CNAME records

> **Cyprus — CONFIRMED SKIP** (checked 2026-07-18): `cy.presentail.com` was
> never registered in DNS.  A live DNS resolution attempt returns
> `NXDOMAIN` (Name or service not known), confirming there is no A, AAAA, or
> CNAME record.  Do **not** add a CNAME or CDN redirect rule for this subdomain
> — there are no inbound links, no indexed pages, and no SSL certificate slot
> to provision.  No further investigation is needed.

Add the following CNAME records in your DNS provider (Cloudflare, Route 53, etc.):

| Name | Type | Value | TTL |
|---|---|---|---|
| `lb.presentail.com` | CNAME | `presentail.com` | 300 s (5 min) — lower TTL during cutover |
| `ae.presentail.com` | CNAME | `presentail.com` | 300 s |
| ~~`cy.presentail.com`~~ | ~~CNAME~~ | ~~`presentail.com`~~ | **SKIP — never registered (confirmed 2026-07-18)** |

> **Important**: `presentail.com` itself must NOT be listed as a source.  Verify
> that no existing A/AAAA record conflicts with each new CNAME.  If the
> subdomains are currently active and serving traffic, schedule a low-traffic
> maintenance window for the cutover.

Once propagated, verify with:

```bash
dig +short lb.presentail.com
# Should resolve to the same IP(s) as presentail.com
```

---

## Step 2 — CDN / load-balancer redirect rule

Configure a 301 redirect rule at the CDN or load-balancer layer (before traffic
reaches the origin server).  The rule must redirect each hostname to its fixed
locale city-root — **do not preserve the path**.

### Cloudflare — Redirect Rules (recommended)

Go to **Cloudflare → your zone → Rules → Redirect Rules → Create Rule**.

Create one rule per subdomain (or combine into a single rule using an `if / else` expression):

```
# Lebanon
Expression:  http.host eq "lb.presentail.com"
Then:        Type: Static
             URL:  https://presentail.com/en-lb/beirut/
             Status code: 301

# UAE
Expression:  http.host eq "ae.presentail.com"
Then:        Type: Static
             URL:  https://presentail.com/en-ae/dubai/
             Status code: 301

# Cyprus — SKIP (never registered, confirmed 2026-07-18; no rule needed)
# Expression:  http.host eq "cy.presentail.com"
# Then:        Type: Static
#              URL:  https://presentail.com/en-cy/nicosia/
#              Status code: 301
```

Alternatively, using a single combined rule with the `concat` expression is NOT
recommended here because each subdomain maps to a different target host-path —
use separate rules or a conditional expression instead.

> Cloudflare evaluates redirect rules **before** the request reaches the origin,
> so no traffic hits the Replit server for redirected subdomains.

### Google Cloud Load Balancer — URL map

Add a host rule and path matcher to your URL map YAML for each subdomain:

```yaml
hostRules:
  - hosts:
      - lb.presentail.com
    pathMatcher: lb-subdomain-redirect
  - hosts:
      - ae.presentail.com
    pathMatcher: ae-subdomain-redirect
  # cy.presentail.com — SKIP (never registered, confirmed 2026-07-18)

pathMatchers:
  - name: lb-subdomain-redirect
    defaultUrlRedirect:
      httpsRedirect: true
      hostRedirect: presentail.com
      pathRedirect: /en-lb/beirut/
      redirectResponseCode: MOVED_PERMANENTLY_DEFAULT
      stripQuery: true

  - name: ae-subdomain-redirect
    defaultUrlRedirect:
      httpsRedirect: true
      hostRedirect: presentail.com
      pathRedirect: /en-ae/dubai/
      redirectResponseCode: MOVED_PERMANENTLY_DEFAULT
      stripQuery: true

  # cy-subdomain-redirect — SKIP (cy.presentail.com never registered, confirmed 2026-07-18)
```

### Nginx (self-hosted)

In the nginx config for the server block that handles these subdomains:

```nginx
server {
    listen 443 ssl;
    server_name lb.presentail.com;
    return 301 https://presentail.com/en-lb/beirut/;
}

server {
    listen 443 ssl;
    server_name ae.presentail.com;
    return 301 https://presentail.com/en-ae/dubai/;
}

# cy.presentail.com — SKIP (never registered, confirmed 2026-07-18; no server block needed)
```

---

## Step 3 — Verify

After both DNS propagation and CDN rule activation, verify with `curl`:

```bash
# Lebanon — root path
curl -I https://lb.presentail.com/
# Expected: HTTP/2 301
#           location: https://presentail.com/en-lb/beirut/

# Lebanon — old WordPress path (path is dropped, not forwarded)
curl -I https://lb.presentail.com/product-category/roses
# Expected: HTTP/2 301
#           location: https://presentail.com/en-lb/beirut/

# UAE
curl -I https://ae.presentail.com/
# Expected: HTTP/2 301
#           location: https://presentail.com/en-ae/dubai/

# Cyprus — SKIP (cy.presentail.com never registered, confirmed 2026-07-18; no curl check needed)

# Apex must NOT redirect (loop guard)
curl -I https://presentail.com/en-lb/beirut/shop
# Expected: HTTP/2 200  (no redirect)
```

---

## Step 4 — Google Search Console "Change of Address"

> **Pre-condition**: Complete Steps 1–3 first.  The 301 redirects must be live
> and verified with `curl` before submitting "Change of Address" — Google will
> reject the submission if it cannot follow a confirmed 301 from the old property
> to the new one.

### 4a — Confirm which subdomains are verified GSC properties

1. Open [Google Search Console](https://search.google.com/search-console).
2. Check the **property selector** (top-left dropdown) for each of:
   - `https://lb.presentail.com/`
   - `https://ae.presentail.com/`
   - ~~`https://cy.presentail.com/`~~ — **SKIP**: never registered in DNS
     (confirmed 2026-07-18); GSC check not needed.
3. If a subdomain is **not listed**, it was never a verified GSC property —
   skip it (no search equity to transfer; Google was never tracking it).
4. If a subdomain **is listed**, continue with 4b below for that property.

### 4b — Submit "Change of Address" for each verified subdomain

Repeat these steps once per verified subdomain property:

1. In GSC, switch to the **old subdomain property** (e.g. `https://lb.presentail.com/`).
2. Click **Settings** (gear icon, bottom-left sidebar).
3. Under **"Change of address"**, click **Open tool**.
4. In the destination field, select or type **`https://presentail.com/`**.
5. Click **Validate & Update** — GSC will follow the live 301 redirect to
   confirm it leads to `presentail.com`.  If validation fails:
   - Re-run the `curl` checks in Step 3 to confirm the redirect is still live.
   - Wait 5–10 minutes and retry (propagation lag can cause transient failures).
6. Once validated, click **Submit**.  A confirmation banner will appear.

| Old property | Target property |
|---|---|
| `https://lb.presentail.com/` | `https://presentail.com/` |
| `https://ae.presentail.com/` | `https://presentail.com/` |
| ~~`https://cy.presentail.com/`~~ | **SKIP — never registered in DNS (confirmed 2026-07-18)** |

### 4c — Post-submission monitoring

Google's index update takes weeks, not days.  Check progress as follows:

| Timeline | What to check |
|---|---|
| 1–2 weeks | In the **old subdomain** property → Coverage report: "Valid" pages should start declining. |
| 2–4 weeks | In the **`presentail.com`** property → Coverage / Performance: impressions from Lebanon, UAE, Cyprus city pages should increase. |
| 4–8 weeks | Old subdomain pages should largely drop from the index.  Any remaining pages can be submitted for removal via GSC → Removals → Outdated content. |

> **Do not delete the old subdomain GSC property** until it shows zero indexed
> pages.  Keeping it lets you track the de-indexing progress and catch any
> pages that stubbornly stayed in the index.

---

## In-Server Fallback (already implemented)

`artifacts/presentail-web/serve.mjs` contains a `COUNTRY_SUBDOMAIN_TARGETS` Map
and a redirect guard (around line 1007) that fires a 301 to the fixed city-root
for any of the three hostnames when they reach the origin server.  This acts as
a defence-in-depth fallback in case a CDN rule is misconfigured or bypassed.

The guard also fires a rate-limited Slack alert (via `ALERTS_SLACK_WEBHOOK_URL`)
when a country-subdomain request reaches the origin — this is a signal that the
CDN redirect layer is absent or misconfigured.

Unit tests: `artifacts/presentail-web/src/lib/serve-country-subdomain-redirect.test.ts`
