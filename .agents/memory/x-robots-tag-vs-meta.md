---
name: X-Robots-Tag vs meta robots
description: HTTP header takes effect regardless of meta robots tag in HTML body; SSR noindex must be set at the header layer in serve.mjs, not just in seo-inject.mjs headSnippet.
---

## The rule

When a page needs `noindex`, the directive must appear in the HTTP `X-Robots-Tag` response header — not only in `<meta name="robots">` inside the HTML body.

**Why:** Crawlers like Semrush issue HEAD requests; they never read the body. Google, when it does read the body, applies the most restrictive rule between header and body — but if the header says `index, follow`, many tools and the user's eyes see that first and assume indexing.

## Where it's set

- **HTTP header**: `resolveXRobotsTag(host, pathname, search)` wrapper in `serve.mjs` (lines ~561–585). This is the authoritative layer.
- **serve-robots.mjs**: Pure `resolveXRobotsTagPure` function; handles private paths, UTM params, filter params, canonical host rule. Imported by serve.mjs.
- **seo-inject.mjs headSnippet**: `<meta name="robots">` inside `<head>` — belt-and-suspenders only; not visible to HEAD crawlers.

## How the blog fallback case was fixed (Aug 2026)

El/ar blog posts with no dedicated translation serve English content. The fix:
1. Exported `isBlogFallbackPath(pathname)` from `seo-inject.mjs` — reads `BLOG_POSTS[slug][lang]` to detect undefined-key or alias-accessor fallback.
2. Added `isBlogFallbackPath` to `serve.mjs` dynamic import destructuring and `let` declaration.
3. In `resolveXRobotsTag` wrapper: call `isBlogFallbackPath(pathname)` before `resolveXRobotsTagPure`; return `"noindex, follow"` when true.
4. The `<meta name="robots" content="noindex,follow">` in seo-inject.mjs headSnippet stays as belt-and-suspenders.

## How to apply

Any future page type that needs conditional noindex (not purely path-based) follows the same pattern:
1. Export a `isFooNoindex(pathname)` predicate from seo-inject.mjs (has access to all data).
2. Import it in serve.mjs and call it in the `resolveXRobotsTag` wrapper.
3. Do NOT rely solely on the meta tag in headSnippet.
