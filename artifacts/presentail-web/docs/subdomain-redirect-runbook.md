# Subdomain Redirect Runbook — lb. / ae. / cy. → presentail.com

> **Audience**: infra / DNS administrator  
> **Goal**: 301-redirect all traffic from the retired country subdomains
> (`lb.presentail.com`, `ae.presentail.com`, `cy.presentail.com`) to the
> canonical apex (`presentail.com`) so their indexed pages and link equity merge
> into the main domain.

---

## Overview

Two layers are required:

| Layer | Responsibility | Status |
|---|---|---|
| **DNS CNAME** | Route subdomain traffic to the same server as `presentail.com` | ⬜ TODO — infra team |
| **CDN / load-balancer redirect rule** | Issue the 301 response before the request reaches the origin server | ⬜ TODO — infra team |
| **serve.mjs in-server guard** | Fallback 301 for any traffic that bypasses the CDN layer | ✅ Implemented (this repo) |

The in-server guard in `serve.mjs` (`COUNTRY_SUBDOMAINS` Set + `isCountrySubdomain` check) is
already live, but it can only fire when DNS has been pointed at the Replit server.  Complete the
DNS and CDN steps below to fully activate the redirects.

---

## Step 1 — DNS CNAME records

Add the following CNAME records in your DNS provider (Cloudflare, Route 53, etc.):

| Name | Type | Value | TTL |
|---|---|---|---|
| `lb.presentail.com` | CNAME | `presentail.com` | 300 s (5 min) — lower TTL during cutover |
| `ae.presentail.com` | CNAME | `presentail.com` | 300 s |
| `cy.presentail.com` | CNAME | `presentail.com` | 300 s |

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
reaches the origin server).  The rule must:

- Match the full request path (capture group or wildcard)
- Preserve the query string
- Target `https://presentail.com`
- Never match `presentail.com` itself (to prevent a redirect loop)

### Cloudflare — Redirect Rules (recommended)

Go to **Cloudflare → your zone → Rules → Redirect Rules → Create Rule**.

Create one rule per subdomain (or use a single rule with an `or` expression):

```
Expression:
  (http.host eq "lb.presentail.com") or
  (http.host eq "ae.presentail.com") or
  (http.host eq "cy.presentail.com")

Then:
  Type: Dynamic
  Expression: concat("https://presentail.com", http.request.uri)
  Status code: 301
  Preserve query string: ✅ (included in http.request.uri)
```

> Cloudflare evaluates redirect rules **before** the request reaches the origin,
> so no traffic hits the Replit server for redirected subdomains.

### Google Cloud Load Balancer — URL map

Add a host rule and path matcher to your URL map YAML:

```yaml
hostRules:
  - hosts:
      - lb.presentail.com
      - ae.presentail.com
      - cy.presentail.com
    pathMatcher: country-subdomain-redirect

pathMatchers:
  - name: country-subdomain-redirect
    defaultRouteAction:
      urlRewrite:
        # Rewrite is handled by the redirect below; this is a placeholder.
    defaultUrlRedirect:
      httpsRedirect: true
      hostRedirect: presentail.com
      pathRedirect: /
      # For path-preserving redirects use prefixRedirect instead:
      prefixRedirect: ""
      redirectResponseCode: MOVED_PERMANENTLY_DEFAULT
      stripQuery: false
```

> **Note**: The GCP URL map approach rewrites to the apex root if path-level
> capture is not configured.  Prefer Cloudflare Redirect Rules or a Nginx
> `$request_uri` rewrite for full path+query preservation.

### Nginx (self-hosted)

In the nginx config for the server block that handles these subdomains:

```nginx
server {
    listen 443 ssl;
    server_name lb.presentail.com ae.presentail.com cy.presentail.com;

    return 301 https://presentail.com$request_uri;
}
```

---

## Step 3 — Verify

After both DNS propagation and CDN rule activation, run the automated smoke test:

```bash
pnpm --filter @workspace/scripts run check-subdomain-redirects
```

This checks all three subdomains, path preservation, and query-string
preservation.  It exits 0 when every redirect is correct, or 1 with a
detailed failure report.

Alternatively, verify manually with `curl`:

```bash
# Lebanon
curl -IL https://lb.presentail.com/en-lb/beirut/shop
# Expected: HTTP/2 301
#           location: https://presentail.com/en-lb/beirut/shop

# UAE
curl -IL https://ae.presentail.com/en-ae/dubai/shop
# Expected: HTTP/2 301
#           location: https://presentail.com/en-ae/dubai/shop

# Cyprus
curl -IL https://cy.presentail.com/en-cy/nicosia/shop
# Expected: HTTP/2 301
#           location: https://presentail.com/en-cy/nicosia/shop

# Query string preservation
curl -IL "https://lb.presentail.com/en-lb/beirut/shop?category=roses&sort=price"
# Expected: location: https://presentail.com/en-lb/beirut/shop?category=roses&sort=price

# Apex must NOT redirect (loop guard)
curl -IL https://presentail.com/en-lb/beirut/shop
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

`artifacts/presentail-web/serve.mjs` contains a `COUNTRY_SUBDOMAINS` Set and an
`isCountrySubdomain` guard that fires a 301 for any of the three hostnames when
they reach the origin server.  This acts as a defence-in-depth fallback in case
a CDN rule is misconfigured or bypassed.  The serve.mjs guard was implemented as
part of the same change that produced this runbook.

Unit tests: `artifacts/presentail-web/src/lib/serve-country-subdomain-redirect.test.ts`
