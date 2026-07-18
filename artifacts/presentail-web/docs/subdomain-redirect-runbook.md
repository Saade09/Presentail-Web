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

> **Cyprus note**: Before adding `cy.presentail.com`, confirm with DNS history
> that this subdomain ever existed.  If it was never registered, skip it (no
> inbound links to redirect).

Add the following CNAME records in your DNS provider (Cloudflare, Route 53, etc.):

| Name | Type | Value | TTL |
|---|---|---|---|
| `lb.presentail.com` | CNAME | `presentail.com` | 300 s (5 min) — lower TTL during cutover |
| `ae.presentail.com` | CNAME | `presentail.com` | 300 s |
| `cy.presentail.com` | CNAME | `presentail.com` | 300 s (only if confirmed in DNS history) |

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

# Cyprus (only if DNS history confirmed)
Expression:  http.host eq "cy.presentail.com"
Then:        Type: Static
             URL:  https://presentail.com/en-cy/nicosia/
             Status code: 301
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
  - hosts:
      - cy.presentail.com
    pathMatcher: cy-subdomain-redirect

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

  - name: cy-subdomain-redirect
    defaultUrlRedirect:
      httpsRedirect: true
      hostRedirect: presentail.com
      pathRedirect: /en-cy/nicosia/
      redirectResponseCode: MOVED_PERMANENTLY_DEFAULT
      stripQuery: true
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

server {
    listen 443 ssl;
    server_name cy.presentail.com;
    return 301 https://presentail.com/en-cy/nicosia/;
}
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

# Cyprus (only after DNS CNAME confirmed and added)
curl -I https://cy.presentail.com/
# Expected: HTTP/2 301
#           location: https://presentail.com/en-cy/nicosia/

# Apex must NOT redirect (loop guard)
curl -I https://presentail.com/en-lb/beirut/shop
# Expected: HTTP/2 200  (no redirect)
```

---

## Step 4 — Google Search Console

After the redirects are confirmed live, submit each old subdomain to Google
Search Console → Change of Address if it was previously a verified property.
This accelerates the transfer of search equity and suppresses the old subdomain
from the index.

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
