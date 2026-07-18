# SEO-02: Canonical-Host Consolidation and Indexing Protection — Implementation Specification

> ⚠️ **PLANNING ONLY** — Not approved for implementation. Requires separate review and sign-off
> before any redirect rule, noindex directive, or deployment configuration is applied.

---

## 1. Background and Current State

### 1.1 Hostname redirect (`www.presentail.com`)

`serve.mjs` lines 67–79 and 861–872 define an env-var-driven www → apex redirect.
Two constants control it:

```js
// serve.mjs lines 67–79
const DEFAULT_WWW_REDIRECT_HOST   = "www.presentail.com";
const WWW_REDIRECT_HOST           = (process.env.WEB_CANONICAL_REDIRECT_FROM_HOST
                                      ?? DEFAULT_WWW_REDIRECT_HOST).trim().toLowerCase();
const WWW_REDIRECT_TARGET_ORIGIN  = (process.env.WEB_CANONICAL_REDIRECT_TARGET_ORIGIN
                                      ?? "https://presentail.com").trim();
const WWW_REDIRECT_ENABLED        = WWW_REDIRECT_HOST !== "" && WWW_REDIRECT_TARGET_ORIGIN !== "";
```

The redirect fires at lines 861–872:

```js
const isWwwHost =
  WWW_REDIRECT_ENABLED &&
  (normalizeHostHeader(req.headers["x-forwarded-host"]) === WWW_REDIRECT_HOST ||
   normalizeHostHeader(req.headers.host)                === WWW_REDIRECT_HOST);
if (isWwwHost) {
  res.writeHead(301, { location: `${WWW_REDIRECT_TARGET_ORIGIN}${req.url ?? "/"}` });
  res.end();
  return;
}
```

**Gap**: setting `WEB_CANONICAL_REDIRECT_FROM_HOST=""` in any deployment disables the www redirect
entirely. There is no hardcoded fallback that always catches `www.presentail.com`.

### 1.2 Hostname redirect (`new.presentail.com`)

No code path exists for this host. The replit.md documents `new.presentail.com` as a retired
legacy subdomain (see `check-legacy-domain` script). There is no unconditional redirect from it
to `presentail.com`.

### 1.3 X-Robots-Tag — current behaviour

`"x-robots-tag": "index, follow"` is written unconditionally for every HTML response in two
places:

| Location | Line(s) | Condition |
|---|---|---|
| Direct `.html` file response | 1301 | Always |
| SPA fallback response | 1470 | Always |

This has two unintended consequences:

1. **Private pages are contradicted.** `seo-inject.mjs` already emits
   `<meta name="robots" content="noindex, follow">` for every route key in
   `NONINDEX_ROUTE_KEYS` (cart, checkout, orderConfirmed, auth, account, favorites, privacy,
   terms, careers, partner, blog). However, the `X-Robots-Tag: index, follow` response header
   takes precedence over the meta tag for HTTP-level crawlers and Googlebot, effectively
   nullifying the meta-tag noindex signal for those pages.

2. **Replit preview domains are indexed.** The `.replit.app` preview URL for this artifact is
   meant to receive Replit's platform-default `X-Robots-Tag: noindex`. The unconditional
   `"index, follow"` override in serve.mjs defeats that default for every HTML response,
   making the preview URL indexable and risking duplicate-content penalties.

### 1.4 Robots.txt — current state

`artifacts/presentail-web/public/robots.txt` already contains `Disallow` entries for all private
path patterns:

```
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
```

These `Disallow` rules are the **first layer** of protection. The planned noindex meta tags and
`X-Robots-Tag` headers are a defence-in-depth **second layer** for crawlers that ignore
robots.txt (e.g. AI crawlers such as GPTBot, ClaudeBot).

---

## 2. Specification

### 2.1 Hostname redirect — `www.presentail.com` (hardened)

**File**: `artifacts/presentail-web/serve.mjs`

**Position**: Immediately after the existing `normalizeHostHeader` helper definition (around
line 856), before the current `isWwwHost` check (line 861), and **before** any URL parsing,
file serving, SEO injection, or route resolution.

**Change**: Add a hardcoded hostname guard for `www.` that fires regardless of the
`WEB_CANONICAL_REDIRECT_FROM_HOST` env var. The guard fires when the `www.` prefix appears in
the first normalised token of either `Host` or `X-Forwarded-Host`.

```js
// --- PROPOSED ADDITION (www. hardcoded guard) ---
// Hard guard: requests arriving on any www.* hostname are unconditionally
// redirected to the apex. This fires even if WEB_CANONICAL_REDIRECT_FROM_HOST
// is overridden or cleared, so the www→apex consolidation can never be
// accidentally disabled by a misconfigured env var.
const normalizedHost    = normalizeHostHeader(req.headers.host);
const normalizedFwdHost = normalizeHostHeader(req.headers["x-forwarded-host"]);
const isWwwHost =
  normalizedHost.startsWith("www.") || normalizedFwdHost.startsWith("www.");
if (isWwwHost) {
  // Preserve path + query; redirect to the canonical apex origin.
  const apexOrigin = WWW_REDIRECT_TARGET_ORIGIN || "https://presentail.com";
  res.writeHead(301, { location: `${apexOrigin}${req.url ?? "/"}` });
  res.end();
  return;
}
// --- END PROPOSED ADDITION ---

// (The existing WWW_REDIRECT_ENABLED / isWwwHost env-var block below can be
// removed once the hardcoded guard above is in place, or retained as a
// secondary mechanism for future alternative-domain deployments.)
```

**Safeguards**:
- `startsWith("www.")` never matches `"presentail.com"` (no loop).
- `apexOrigin` falls back to the hardcoded string if the env var is empty, so the target
  is never blank.
- The `req.url` is preserved verbatim (path + query string), matching existing behaviour.

**QA check after implementation**:
```
curl -I https://www.presentail.com/en-lb/beirut/shop
→ HTTP/1.1 301  location: https://presentail.com/en-lb/beirut/shop
```

---

### 2.2 Hostname redirect — `new.presentail.com` (new)

**File**: `artifacts/presentail-web/serve.mjs`

**Position**: Immediately after the `www.` guard above (section 2.1), before any other
processing. Both guards must appear before URL parsing, file serving, SEO injection, and route
resolution.

**Change**: Add a hardcoded hostname check for `new.presentail.com`:

```js
// --- PROPOSED ADDITION (new. hardcoded guard) ---
// Hard guard: the retired new.presentail.com subdomain is permanently
// redirected to the canonical apex. This must fire unconditionally — no env
// var controls it — so the redirect cannot be accidentally disabled.
const isNewSubdomain =
  normalizedHost === "new.presentail.com" ||
  normalizedFwdHost === "new.presentail.com";
if (isNewSubdomain) {
  const apexOrigin = WWW_REDIRECT_TARGET_ORIGIN || "https://presentail.com";
  res.writeHead(301, { location: `${apexOrigin}${req.url ?? "/"}` });
  res.end();
  return;
}
// --- END PROPOSED ADDITION ---
```

**Safeguards**:
- Exact string equality (`=== "new.presentail.com"`) never matches `"presentail.com"` (no
  loop).
- `apexOrigin` uses the same fallback as the www guard (single source of truth).
- Path + query string preserved verbatim.

**QA check after implementation**:
```
curl -I https://new.presentail.com/en-lb/beirut/product/roses
→ HTTP/1.1 301  location: https://presentail.com/en-lb/beirut/product/roses
```

---

### 2.3 Hostname redirect — old country subdomains (`lb.`, `ae.`, etc.)

**Layer**: DNS / CDN (not addressable in `serve.mjs`).

**Proposed implementation**:

1. At the DNS level, add a CNAME record for each retired subdomain pointing to the canonical
   host (e.g. `lb.presentail.com CNAME presentail.com`).
2. At the load-balancer / CDN layer (e.g. Google Cloud Run ingress rules, or a Cloudflare
   Page Rule / Redirect Rule), configure a 301 redirect:
   - **Source**: `lb.presentail.com/*` → **Target**: `https://presentail.com/$1`  (301)
   - **Source**: `ae.presentail.com/*` → **Target**: `https://presentail.com/$1`  (301)
   - Repeat for any additional country subdomains identified in the legacy URL audit (SEO-01).

**Responsible configuration artefact**: Cloud Run service YAML / Cloudflare dashboard / Google
Load Balancer URL map — separate from this repository. Change to be coordinated with the infra
team at the time of implementation.

**Safeguards**:
- The CDN rule must capture the full path (`$1` / `:path*`) so deep links are not dropped.
- `presentail.com` itself must not be listed as a redirect source.
- Test with `curl -IL https://lb.presentail.com/en-lb/beirut/shop` after the CDN rule is live.

---

### 2.4 Noindex for private pages — `X-Robots-Tag` header

**File**: `artifacts/presentail-web/serve.mjs`

**Problem**: The two HTML response blocks (direct `.html` file at line 1301; SPA fallback at
line 1470) both set `"x-robots-tag": "index, follow"` unconditionally. This overrides the
`<meta name="robots" content="noindex, follow">` that `seo-inject.mjs` already injects for
NONINDEX_ROUTE_KEYS.

**Change**: Replace the unconditional `"x-robots-tag": "index, follow"` with a helper that
returns `"noindex"` for private paths and `"index, follow"` only when the host is the
canonical production domain.

#### 2.4.1 Define `isPrivatePath(pathname)`

Add a new helper function (near the existing `isTransactionalPage` helper at line 362):

```js
// Deny-list of route tokens that must carry noindex regardless of host.
// Must mirror NONINDEX_ROUTE_KEYS in src/lib/seo.mjs:
//   cart, checkout, orderConfirmed, auth, account, favorites,
//   privacy, terms, careers, partner, blog.
// Also covers auth-adjacent routes not in NONINDEX_ROUTE_KEYS directly:
//   sign-in, sign-up, reset-password (mapped to key "auth" by detectRouteKey).
// Keep in sync with public/robots.txt Disallow entries.
//
// "blog" is deliberately excluded from this regex: the listing page /blog IS
// noindex (route key "blog"), but individual posts /blog/{slug} ARE indexed
// (route key "blogPost"). A separate blog-listing check handles this case.
const PRIVATE_ROUTE_RE =
  /(?:^|\/)(?:cart|checkout|order-confirmed|auth|sign-in|sign-up|reset-password|account|personal-information|favorites|privacy|terms|careers|partner)(?:\/|$)/;

/**
 * Returns true when the pathname resolves to a private page that must carry a
 * noindex directive. Matches both bare paths (/cart) and locale-prefixed
 * variants (/en-lb/beirut/cart).
 *
 * Implemented as a deny-list (not an allow-list) so new public pages are
 * automatically indexable without a code change.
 *
 * The regex anchors each token with a leading slash (or start-of-string) and a
 * trailing slash-or-end — this means it matches the route token at the correct
 * segment position and never false-positives on a product slug that contains
 * a reserved word inside a longer path (e.g. /product/favorites-bundle would
 * not match because "favorites-bundle" is not "favorites"). Individual product
 * slugs named exactly "cart", "checkout", etc. cannot exist in practice because
 * those names are reserved route entries in the SPA's locale-route scheme.
 *
 * "blog" edge case: the blog listing (/blog) is noindex, but individual posts
 * (/blog/{slug}) are public and indexed. The listing is caught by the second
 * clause below.
 */
function isPrivatePath(pathname) {
  if (PRIVATE_ROUTE_RE.test(pathname)) return true;
  // Blog listing page (/blog or /{lang-country}/{city}/blog) is noindex;
  // individual blog posts (/blog/{slug}) are public. Match listing only by
  // requiring "blog" at the end of the path (with optional trailing slash).
  return /(?:^|\/)blog\/?$/.test(pathname);
}
```

**QA check for false-positive safety** (add to the QA list in section 5):
```
# Public blog post must NOT receive noindex
curl -I https://presentail.com/en-lb/beirut/blog/valentines-day-gifts
→ x-robots-tag: index, follow   (not noindex)
```

#### 2.4.2 Define `resolveXRobotsTag(host, pathname)`

Add a second helper alongside `isPrivatePath`:

```js
const CANONICAL_PRODUCTION_HOST = "presentail.com"; // i18n-ignore — canonical domain

/**
 * Returns the value for the X-Robots-Tag response header for an HTML response.
 *
 * Rules (applied in order):
 *  1. Private/transactional paths → "noindex" (regardless of host).
 *  2. Canonical production host ("presentail.com") and public path → "index, follow".
 *  3. All other hosts (Replit preview URLs, staging, etc.) → omit the header
 *     entirely (return null) so the platform's default noindex applies.
 *
 * @param {string} host      Normalised hostname (no port, lowercase).
 * @param {string} pathname  URL pathname (after BASE_PATH stripping).
 * @returns {string|null}    Header value, or null to omit the header.
 */
function resolveXRobotsTag(host, pathname) {
  if (isPrivatePath(pathname)) return "noindex";
  if (host === CANONICAL_PRODUCTION_HOST) return "index, follow";
  return null; // non-canonical host — omit; let platform default apply
}
```

#### 2.4.3 Apply the helper in the two HTML response blocks

**Block 1 — direct `.html` file response** (around line 1296–1316):

```js
// BEFORE (line 1301):
"x-robots-tag": "index, follow",

// AFTER:
// resolveXRobotsTag uses the normalised host derived earlier in the handler.
...(resolveXRobotsTag(normalizeHostHeader(host), pathname) !== null
  ? { "x-robots-tag": resolveXRobotsTag(normalizeHostHeader(host), pathname) }
  : {}),
```

For clarity, resolve once and spread:

```js
const xRobotsTag = resolveXRobotsTag(normalizeHostHeader(host), pathname);
const headers = {
  "content-type": MIME[".html"],
  // x-robots-tag is omitted on non-canonical hosts so Replit's default noindex applies.
  ...(xRobotsTag !== null ? { "x-robots-tag": xRobotsTag } : {}),
  "cache-control": "no-store, no-cache, must-revalidate",
  ...
};
```

**Block 2 — SPA fallback** (around line 1468–1477):

```js
// BEFORE (line 1470):
"x-robots-tag": "index, follow",

// AFTER (same pattern as Block 1):
const xRobotsTagSpa = resolveXRobotsTag(normalizeHostHeader(host), pathname);
const headers = {
  "content-type": MIME[".html"],
  ...(xRobotsTagSpa !== null ? { "x-robots-tag": xRobotsTagSpa } : {}),
  "cache-control": isTransactionalPage(pathname)
    ? "no-store, no-cache, must-revalidate"
    : "no-cache",
  ...
};
```

**Note on `host` variable**: The `host` value at lines 874–876 is already the raw
`X-Forwarded-Host` / `Host` header. `normalizeHostHeader(host)` strips port and lowercases. At
implementation time, verify that `normalizeHostHeader` is accessible at the point where the two
HTML blocks run (it is currently defined inside the request handler at line 856; either hoist it
or move the helpers outside the handler).

**QA checks after implementation**:
```
curl -I https://presentail.com/en-lb/beirut/checkout
→ x-robots-tag: noindex

curl -I https://presentail.com/en-lb/beirut/shop
→ x-robots-tag: index, follow

curl -I https://{replit-preview-domain}.replit.app/en-lb/beirut/shop
→ (no x-robots-tag header from serve.mjs — Replit default noindex applies)
```

---

### 2.5 Noindex for private pages — `<meta name="robots">` in seo-inject.mjs

**No new changes required.** `seo-inject.mjs` already emits `<meta name="robots"
content="noindex, follow">` for every route key in `NONINDEX_ROUTE_KEYS` (lines 413–416 of
`seo-inject.mjs`). The `NONINDEX_ROUTE_KEYS` set (defined in `src/lib/seo.mjs`) covers:

```
cart, checkout, orderConfirmed, auth, account, favorites,
privacy, terms, careers, partner, blog
```

Once the `X-Robots-Tag` header fix (section 2.4) is in place, the meta tag and the header
will agree for all private pages, satisfying the defence-in-depth requirement.

**One gap to verify**: `personal-information` is listed in `robots.txt` as
`Disallow: /*/personal-information` but is not explicitly a route key in `NONINDEX_ROUTE_KEYS`.
In the SPA, `/personal-information` is a sub-path of `/account` (e.g.
`/en-lb/beirut/account/personal-information`), so the `account` key already covers it. Confirm
at implementation time that `detectRouteKey` in `seo-inject.mjs` maps this sub-path to the
`account` key and not to `home`.

---

### 2.6 Replit preview domain — conditional `X-Robots-Tag`

This is already fully covered by the `resolveXRobotsTag` helper specified in section 2.4.

**Logic recap**: when the `Host` header is not `presentail.com` (e.g. a `.replit.app` preview
URL) and the path is public, `resolveXRobotsTag` returns `null` and no `X-Robots-Tag` header
is emitted. Replit's platform-level `X-Robots-Tag: noindex` then applies unchanged.

**QA check after implementation**:
```
curl -I https://{replit-preview-domain}.replit.app/en-lb/beirut/shop
→ No "x-robots-tag: index, follow" header in response.
   (Replit's noindex should be visible if the platform injects it at the proxy layer.)
```

---

### 2.7 `ops.presentail.com` — indexing protection

**Scope**: This subdomain is a separate deployment (not part of `artifacts/presentail-web`).
No changes to `serve.mjs` are required or permitted.

**Required configuration for the `ops` deployment**:

#### 2.7.1 `robots.txt` — block all crawlers

Deploy a `robots.txt` at the root of the `ops` deployment with the following content:

```
User-agent: *
Disallow: /
```

This tells all compliant crawlers (including Googlebot) not to crawl any page on the subdomain.

#### 2.7.2 `X-Robots-Tag` on every response

Every HTTP response from the `ops` deployment — HTML, JSON, plain text, redirects — must
include:

```
X-Robots-Tag: noindex, nofollow
```

In a Node/Express `ops` server this is typically added as a global middleware:

```js
app.use((_req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
});
```

In a Cloud Run / NGINX / static-hosting setup, add the header in the service configuration:

```yaml
# Cloud Run: add to the service's headers in traffic.yaml / service.yaml
headers:
  - name: X-Robots-Tag
    value: "noindex, nofollow"
```

#### 2.7.3 Responsible configuration artefact

The exact file depends on how the `ops` subdomain is deployed. At implementation time, locate
the `ops` deployment configuration (Cloud Run YAML, NGINX site config, or equivalent) and apply
both the `robots.txt` and the universal header there.

The `ops` configuration is **not** in this repository and must be applied separately by the
team managing that deployment.

---

## 3. Summary of Changes by File

| File | Change |
|---|---|
| `artifacts/presentail-web/serve.mjs` | Add `www.` hard guard (before existing redirect block) |
| `artifacts/presentail-web/serve.mjs` | Add `new.presentail.com` hard guard (after www. guard) |
| `artifacts/presentail-web/serve.mjs` | Add `isPrivatePath()` helper function |
| `artifacts/presentail-web/serve.mjs` | Add `resolveXRobotsTag()` helper function |
| `artifacts/presentail-web/serve.mjs` | Replace unconditional `x-robots-tag: index, follow` in both HTML response blocks |
| `artifacts/presentail-web/seo-inject.mjs` | No changes — noindex meta tag already correct |
| `artifacts/presentail-web/public/robots.txt` | No changes — Disallow entries already correct |
| `ops` deployment config (out-of-repo) | Add `robots.txt Disallow: /` + `X-Robots-Tag: noindex, nofollow` on all responses |
| CDN / DNS (out-of-repo) | 301 rules for `lb.presentail.com`, `ae.presentail.com` → `presentail.com` |

---

## 4. Safeguard Checklist

| Safeguard | How it is satisfied |
|---|---|
| No redirect loops | `www.` guard uses `startsWith("www.")` — never matches `presentail.com`. `new.` guard uses exact equality. |
| Deny-list (not allow-list) for noindex | `PRIVATE_PATH_SEGMENTS` is a deny-list; new public pages are indexable by default. |
| `ops.` protection in separate config | Specified as out-of-repo deployment config, not a serve.mjs change. |
| No accidental noindex of indexable pages | `resolveXRobotsTag` returns `index, follow` for any path not in `PRIVATE_PATH_SEGMENTS` on the production host. |

---

## 5. Full QA Checklist (post-implementation)

```
# 1. www redirect
curl -I https://www.presentail.com/en-lb/beirut/shop
→ 301  Location: https://presentail.com/en-lb/beirut/shop

# 2. new. redirect
curl -I https://new.presentail.com/en-lb/beirut/product/roses
→ 301  Location: https://presentail.com/en-lb/beirut/product/roses

# 3. noindex on checkout — HTML meta tag
curl https://presentail.com/en-lb/beirut/checkout | grep 'name="robots"'
→ <meta name="robots" content="noindex, follow" />

# 4. noindex on checkout — response header
curl -I https://presentail.com/en-lb/beirut/checkout
→ x-robots-tag: noindex

# 5. index allowed on public shop page — no noindex anywhere
curl https://presentail.com/en-lb/beirut/shop | grep 'name="robots"'
→ (no noindex meta)
curl -I https://presentail.com/en-lb/beirut/shop
→ x-robots-tag: index, follow

# 6. Replit preview domain — no index, follow override
curl -I https://{replit-preview-domain}.replit.app/en-lb/beirut/shop
→ No "x-robots-tag: index, follow" header from serve.mjs

# 7. Blog post (public) must NOT be noindexed — isPrivatePath false-positive check
curl -I https://presentail.com/en-lb/beirut/blog/valentines-day-gifts
→ x-robots-tag: index, follow   (not noindex)

# 8. Blog listing page IS noindex
curl -I https://presentail.com/en-lb/beirut/blog
→ x-robots-tag: noindex

# 9. noindex carries on all NONINDEX_ROUTE_KEYS — spot-check account + privacy
curl -I https://presentail.com/en-lb/beirut/account
→ x-robots-tag: noindex
curl -I https://presentail.com/en-lb/beirut/privacy
→ x-robots-tag: noindex
```

---

## 6. Dependencies

- **SEO-01 (legacy URL audit)**: Any additional legacy hostnames identified in that audit
  should be added to the list of CDN redirect rules in section 2.3 before the infra change is
  applied.

---

*Document generated as part of SEO-02 planning. Requires review and sign-off before any of the
above changes are applied to production.*
