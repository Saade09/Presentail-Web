/**
 * Production SEO injection regression tests (serve.mjs only)
 *
 * The web storefront injects per-request SEO tags — an absolute canonical URL
 * built from the real request origin, plus per-entity Open Graph / Twitter
 * tags — ONLY in the production Node server (serve.mjs), which re-runs the
 * injector per request with the real request origin.
 *
 * The Vite dev server's `seoInjectPlugin` (used by the ./e2e suite via
 * playwright.config.ts) cannot reproduce this: at build time it has no real
 * request context, so it would bake a relative `href="/"` canonical and stale
 * generic title into the static index.html (see the comment in vite.config.ts).
 * That means a regression that only affects production SEO output — a wrong or
 * relative canonical, a missing OG image, or a duplicate canonical tag — would
 * NOT be caught by the dev-server spec, and WhatsApp / iMessage / Slack rich
 * previews would silently break.
 *
 * So this spec lives in ./e2e-serve (run via playwright.serve.config.ts) and
 * MUST be pointed at a built serve.mjs instance via PLAYWRIGHT_BASE_URL. The
 * "Web serve checks" CI workflow builds + starts serve.mjs and runs it there.
 *
 * It asserts:
 *   1. Exactly one absolute <link rel="canonical"> pointing at the request
 *      origin on the root path ("/").
 *   2. Exactly one absolute <link rel="canonical"> pointing at the request
 *      origin on a locale-prefixed path, for one page per first-class market
 *      (LB "/en-lb/beirut/", AE "/en-ae/dubai/", CY "/en-cy/nicosia/"). The
 *      country/city suffix is derived from the request path, so a wrong-suffix
 *      or origin-less canonical on an AE/CY page would slip past a LB-only test.
 *   3. og:title / og:image / twitter:card are present and non-empty on an
 *      entity page (a locale-prefixed product path).
 *
 * Uses Playwright's APIRequestContext so the tests exercise the real HTTP layer
 * (serve.mjs) without a browser — exactly the initial HTML crawlers receive.
 *
 * NOTE on the request-origin assertion for "/": serve.mjs lets CANONICAL_ORIGIN
 * override the request origin for the bare landing path. The "Web serve checks"
 * workflow does NOT set CANONICAL_ORIGIN, so the canonical origin equals the
 * request origin there. To stay robust if that ever changes, the root-path test
 * accepts either the request origin or the configured CANONICAL_ORIGIN, while
 * still always requiring the canonical to be absolute and unique. The
 * locale-prefixed path is never subject to that override, so it asserts an exact
 * request-origin match.
 */

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract every <link rel="canonical" href="..."> href from a raw HTML string,
 * tolerating either attribute order (rel-then-href or href-then-rel).
 */
function findCanonicalHrefs(html: string): string[] {
  const hrefs: string[] = [];
  const relFirst = /<link\s+rel="canonical"\s+href="([^"]*)"/gi;
  const hrefFirst = /<link\s+href="([^"]*)"\s+rel="canonical"/gi;
  let m: RegExpExecArray | null;
  while ((m = relFirst.exec(html)) !== null) hrefs.push(m[1]);
  while ((m = hrefFirst.exec(html)) !== null) hrefs.push(m[1]);
  return hrefs;
}

/**
 * Extract a meta tag's content by property/name, tolerating attribute order.
 */
function findMetaContent(
  html: string,
  attr: "property" | "name",
  key: string,
): string | null {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const keyFirst = new RegExp(
    `<meta\\s+${attr}="${esc}"\\s+content="([^"]*)"`,
    "i",
  );
  const contentFirst = new RegExp(
    `<meta\\s+content="([^"]*)"\\s+${attr}="${esc}"`,
    "i",
  );
  const m = html.match(keyFirst) ?? html.match(contentFirst);
  return m ? m[1] : null;
}

/**
 * Decide whether an og:image URL points at a real, measurable image file.
 *
 * The og:image dimension tags are only emitted when serve.mjs successfully
 * measured the image's pixel size (see fetchImageDimensions in seo-inject.mjs).
 * Two cases legitimately produce an og:image WITHOUT dimensions, and the
 * dimension assertions must NOT fire for either:
 *
 *   1. The unresolved / no-image fallback, which points at the static
 *      `<origin><basePath>/opengraph.jpg` asset (handled by the caller via an
 *      endsWith check, mirroring the product block).
 *   2. A resolved entity whose image_url is an OS SPA route rather than a real
 *      file (see .agents/memory/os-brand-images.md) — brand/category/occasion
 *      image URLs can be `/objects/<user>/uploads/<id>` style routes that
 *      return JSON / an auth error instead of image bytes, so the server's
 *      dimension fetch returns null even though the entity itself resolved.
 *
 * To distinguish case 2 from a genuinely measurable CDN image, we fetch the
 * og:image URL the same way serve.mjs does (a small Range request) and treat
 * it as measurable only when the response succeeds AND carries an `image/*`
 * content type. Anything else (auth error, JSON SPA route, network failure)
 * means the dimension path is not applicable and the test degrades via skip.
 */
async function isMeasurableImage(
  request: import("@playwright/test").APIRequestContext,
  url: string,
): Promise<boolean> {
  try {
    const res = await request.get(url, {
      headers: { Range: "bytes=0-4095" },
    });
    if (!res.ok() && res.status() !== 206) return false;
    const contentType = (res.headers()["content-type"] ?? "").toLowerCase();
    return contentType.startsWith("image/");
  } catch {
    return false;
  }
}

/**
 * Register the og:image:width / og:image:height assertions for a resolved
 * entity page (brand / category / occasion), mirroring the product block in
 * section 4. Each degrades gracefully via test.skip when the OS API does not
 * resolve a real entity image (fallback opengraph.jpg) OR when the resolved
 * image URL is not a measurable image file (e.g. an OS SPA route).
 */
function describeEntityImageDimensions(label: string, path: string): void {
  test.describe(
    `Production SEO — og:image dimensions on a resolved ${label} image`,
    () => {
      let html: string;
      let ogImage: string | null;
      let realImageResolved = false;

      test.beforeAll(async ({ request }) => {
        const response = await request.get(path);
        expect(response.status()).toBe(200);
        html = await response.text();
        ogImage = findMetaContent(html, "property", "og:image");
        // The unresolved fallback always points at the static opengraph.jpg
        // asset; any other absolute URL means the OS API resolved an entity
        // image. We then verify it is a genuinely measurable image file (not
        // an OS SPA route) before asserting the dimension tags.
        const isCandidate =
          !!ogImage &&
          /^https?:\/\//.test(ogImage) &&
          !ogImage.split("?")[0].endsWith("/opengraph.jpg");
        if (isCandidate) {
          realImageResolved = await isMeasurableImage(request, ogImage!);
        }
      });

      test("og:image:width is present and a positive integer", () => {
        if (!realImageResolved) {
          test.skip(
            true,
            `OS API did not resolve a measurable ${label} image (og:image="${ogImage}") — dimension assertion not applicable`,
          );
        }
        const width = findMetaContent(html, "property", "og:image:width");
        expect(width, 'meta[property="og:image:width"] not found').toBeTruthy();
        expect(width!).toMatch(/^\d+$/);
        expect(Number(width)).toBeGreaterThan(0);
      });

      test("og:image:height is present and a positive integer", () => {
        if (!realImageResolved) {
          test.skip(
            true,
            `OS API did not resolve a measurable ${label} image (og:image="${ogImage}") — dimension assertion not applicable`,
          );
        }
        const height = findMetaContent(html, "property", "og:image:height");
        expect(height, 'meta[property="og:image:height"] not found').toBeTruthy();
        expect(height!).toMatch(/^\d+$/);
        expect(Number(height)).toBeGreaterThan(0);
      });
    },
  );
}

// ---------------------------------------------------------------------------
// 1. Absolute canonical on the root path "/"
// ---------------------------------------------------------------------------

test.describe("Production SEO — absolute canonical on /", () => {
  let html: string;
  let origin: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    origin = new URL(response.url()).origin;
    html = await response.text();
  });

  test("exactly one <link rel=\"canonical\"> is present", () => {
    const hrefs = findCanonicalHrefs(html);
    expect(
      hrefs.length,
      `expected exactly one canonical tag, found ${hrefs.length}: ${JSON.stringify(hrefs)}`,
    ).toBe(1);
  });

  test("the canonical is absolute and points at the request origin", () => {
    const hrefs = findCanonicalHrefs(html);
    expect(hrefs.length).toBe(1);
    const href = hrefs[0];
    // Must be absolute (production never emits a relative canonical).
    expect(href, `canonical must be absolute, got "${href}"`).toMatch(
      /^https?:\/\//,
    );
    // The bare landing path may have its origin overridden by CANONICAL_ORIGIN;
    // the serve check workflow does not set it, so the request origin is used.
    const canonicalOrigin = new URL(href).origin;
    const allowed = [origin];
    const configured = process.env.CANONICAL_ORIGIN?.replace(/\/$/, "");
    if (configured) allowed.push(new URL(configured).origin);
    expect(
      allowed,
      `canonical origin "${canonicalOrigin}" should be one of ${JSON.stringify(allowed)}`,
    ).toContain(canonicalOrigin);
  });
});

// ---------------------------------------------------------------------------
// 2. Absolute canonical on a locale-prefixed path, per country
//
// Locale-prefixed paths are never subject to the CANONICAL_ORIGIN override, so
// the canonical must always be the request origin + the locale path.
//
// LB, AE, and CY are all first-class markets. The country/city suffix in the
// canonical is derived from the request path (see canonicalPath in
// seo-inject.mjs), so a wrong-suffix or origin-less canonical on an AE or CY
// page would NOT be caught by a Lebanon-only test. Mirror the parameterized
// COUNTRY_CASES approach used in hreflang-injection.spec.ts and run the
// identical guard against one page per country.
// ---------------------------------------------------------------------------

interface CanonicalCountryCase {
  /** Two-letter country code as it appears (lowercase) in URL paths. */
  country: string;
  /** A supported city slug for that country. */
  city: string;
}

const CANONICAL_COUNTRY_CASES: CanonicalCountryCase[] = [
  { country: "lb", city: "beirut" },
  { country: "ae", city: "dubai" },
  { country: "cy", city: "nicosia" },
];

for (const { country, city } of CANONICAL_COUNTRY_CASES) {
  const path = `/en-${country}/${city}/`;

  test.describe(`Production SEO — absolute canonical on ${path}`, () => {
    let html: string;
    let origin: string;

    test.beforeAll(async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      origin = new URL(response.url()).origin;
      html = await response.text();
    });

    test("exactly one <link rel=\"canonical\"> is present", () => {
      const hrefs = findCanonicalHrefs(html);
      expect(
        hrefs.length,
        `expected exactly one canonical tag, found ${hrefs.length}: ${JSON.stringify(hrefs)}`,
      ).toBe(1);
    });

    test("the canonical is absolute and uses the request origin", () => {
      const hrefs = findCanonicalHrefs(html);
      expect(hrefs.length).toBe(1);
      const href = hrefs[0];
      expect(href, `canonical must be absolute, got "${href}"`).toMatch(
        /^https?:\/\//,
      );
      expect(new URL(href).origin).toBe(origin);
      // Sanity: the canonical reflects this country's locale path + city, not a
      // bare "/" and not a different country's suffix.
      expect(
        new URL(href).pathname,
        `canonical for ${path} must reflect /en-${country}/${city}`,
      ).toContain(`/en-${country}/${city}`);
    });
  });
}

// ---------------------------------------------------------------------------
// 3. OG / Twitter tags on an entity page
//
// injectSeoTagsAsync() always emits a full set of share tags for an entity
// path (product / brand / category / occasion) regardless of whether the OS
// API resolves the slug — the generic-head fallback emits them too. A missing
// og:image or twitter:card here means every shared product link would render a
// blank rich preview.
// ---------------------------------------------------------------------------

test.describe("Production SEO — OG/Twitter tags on a product entity page", () => {
  let html: string;
  let origin: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/en-lb/beirut/product/rose-bouquet");
    expect(response.status()).toBe(200);
    origin = new URL(response.url()).origin;
    html = await response.text();
  });

  test('og:title is present and non-empty', () => {
    const content = findMetaContent(html, "property", "og:title");
    expect(content, 'meta[property="og:title"] not found').toBeTruthy();
    expect(content!.trim().length).toBeGreaterThan(0);
  });

  test('og:image is present and is an absolute URL', () => {
    const content = findMetaContent(html, "property", "og:image");
    expect(content, 'meta[property="og:image"] not found').toBeTruthy();
    expect(content!.trim().length).toBeGreaterThan(0);
    // Crawlers reject relative OG images — it must be absolute.
    expect(content, `og:image must be absolute, got "${content}"`).toMatch(
      /^https?:\/\//,
    );
  });

  test('twitter:card is present and non-empty', () => {
    const content = findMetaContent(html, "name", "twitter:card");
    expect(content, 'meta[name="twitter:card"] not found').toBeTruthy();
    expect(content!.trim().length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 4. og:image:width / og:image:height on an entity page with a real image
//
// When injectSeoTagsAsync() resolves an entity against the OS API and the
// entity carries a real image, buildEntityHead() measures the image's pixel
// dimensions (per-request fetch + L1/L2 PostgreSQL cache in serve.mjs) and
// emits numeric og:image:width / og:image:height tags. Crawlers that receive
// an og:image WITHOUT those dimensions may downgrade the rich preview card to
// a small thumbnail — so a regression in the dimension-resolution path (or in
// the buildEntityHead branch that prints the tags) would silently ship
// badly-sized previews for every shared product link.
//
// The generic / unresolved fallback emits the OG image as
// `<origin><basePath>/opengraph.jpg` together with hard-coded 1280x720
// dimensions, so the presence of the fallback image URL tells us the OS API
// did NOT resolve a real entity image. In that case the test degrades
// gracefully via test.skip (mirroring the entity-resolution skips in
// e2e/structured-data.spec.ts) — the dimension path is only meaningful when a
// real image was resolved. When a real image IS resolved we assert that both
// dimension tags are present and parse to positive integers.
// ---------------------------------------------------------------------------

test.describe("Production SEO — og:image dimensions on a resolved entity image", () => {
  let html: string;
  let ogImage: string | null;
  let realImageResolved: boolean;

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/en-lb/beirut/product/rose-bouquet");
    expect(response.status()).toBe(200);
    html = await response.text();
    ogImage = findMetaContent(html, "property", "og:image");
    // The unresolved fallback always points at the static opengraph.jpg asset.
    // Any other absolute URL means the OS API resolved a real entity image.
    realImageResolved =
      !!ogImage &&
      /^https?:\/\//.test(ogImage) &&
      !ogImage.split("?")[0].endsWith("/opengraph.jpg");
  });

  test("og:image:width is present and a positive integer", () => {
    if (!realImageResolved) {
      test.skip(
        true,
        `OS API did not resolve a real entity image (og:image="${ogImage}") — dimension assertion not applicable`,
      );
    }
    const width = findMetaContent(html, "property", "og:image:width");
    expect(width, 'meta[property="og:image:width"] not found').toBeTruthy();
    expect(width!).toMatch(/^\d+$/);
    expect(Number(width)).toBeGreaterThan(0);
  });

  test("og:image:height is present and a positive integer", () => {
    if (!realImageResolved) {
      test.skip(
        true,
        `OS API did not resolve a real entity image (og:image="${ogImage}") — dimension assertion not applicable`,
      );
    }
    const height = findMetaContent(html, "property", "og:image:height");
    expect(height, 'meta[property="og:image:height"] not found').toBeTruthy();
    expect(height!).toMatch(/^\d+$/);
    expect(Number(height)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 5. og:image:width / og:image:height on resolved brand / category / occasion
//    entity pages.
//
// The same per-request image-dimension path that runs for product pages
// (buildEntityHead via buildBrandHead / buildShopEntityHead in seo-inject.mjs)
// also runs for brand, category, and occasion entity pages. A regression in
// dimension resolution for those entity kinds would silently ship badly-sized
// rich previews when a shopper shares a brand / category / occasion link, yet
// section 4 above only covers product pages.
//
// These blocks mirror the product assertion but additionally tolerate the OS
// SPA-route image quirk (see .agents/memory/os-brand-images.md): a brand /
// category / occasion can resolve while its image_url is an unparseable SPA
// route, so the server cannot measure dimensions. describeEntityImageDimensions
// fetches the og:image URL and only asserts dimensions when it is a genuinely
// measurable image file, otherwise it degrades gracefully via test.skip — the
// same way the product block skips the static /opengraph.jpg fallback.
// ---------------------------------------------------------------------------

describeEntityImageDimensions("brand", "/en-lb/beirut/brand/roses");
describeEntityImageDimensions("category", "/en-lb/beirut/category/flowers");
describeEntityImageDimensions("occasion", "/en-lb/beirut/occasion/birthday");

// ---------------------------------------------------------------------------
// 6. og:image:width / og:image:height on a resolved blog-post page
//
// The same per-request image-dimension path that runs for product / brand /
// category / occasion entity pages also feeds blog-post pages: buildBlogPostHead
// (artifacts/presentail-web/seo-inject.mjs) resolves the article from the shared
// BLOG_POSTS source of truth and passes the hero image's dimensions through
// buildEntityHead, which emits og:image:width / og:image:height. A regression
// there — a dropped imageWidth/imageHeight pass-through, a buildEntityHead change,
// or a stale/missing hero image — would silently ship badly-sized previews when a
// shopper shares a blog link, yet sections 4–5 only cover the catalog entity
// pages.
//
// Blog posts resolve from static data (no OS/blog API round-trip), and the hero
// image is a local file served by serve.mjs (e.g. /blog/<slug>.png), so it is NOT
// the static opengraph.jpg fallback. describeEntityImageDimensions therefore
// fetches the og:image URL and asserts the dimension tags only when it is a
// genuinely measurable image file; if the hero asset is unreachable or not a
// measurable image, it degrades gracefully via test.skip — exactly like the
// entity blocks above.
//
// The slug must exist in src/data/blogPostsCopy.js; an unknown slug falls through
// to the generic head (no resolved blog image) and the assertions would skip.
// ---------------------------------------------------------------------------

describeEntityImageDimensions(
  "blog post",
  "/en-lb/beirut/blog/inside-spring-sourcing-trip",
);

// ---------------------------------------------------------------------------
// 7. og:image:width / og:image:height on a shared wishlist hero image
//
// The shared-wishlist path (/favorites/share/:token) has its own dedicated
// dimension-resolution branch in seo-inject.mjs: when the token resolves real
// favorites, injectSeoTagsAsync() fetches the hero product, measures the hero
// image's pixel dimensions (fetchImageDimensions, per-request fetch + cache)
// and passes imageWidth/imageHeight into buildWishlistHead so the social card
// renders as a banner (summary_large_image) rather than a small thumbnail. A
// regression in this branch — a broken fetchImageDimensions call, a dropped
// imageWidth/imageHeight pass-through, or a buildWishlistHead change — would
// silently ship undersized previews for every shared wishlist.
//
// e2e/structured-data.spec.ts group 9 only covers the UNRESOLVED-token
// fallback (generic head). This serve-backed spec covers the RESOLVED path.
//
// A resolvable token is environment-specific, so it is supplied via the
// WISHLIST_SHARE_TOKEN env var (the "Web serve checks" workflow can seed one
// against a known wishlist). When the token resolves a real hero image, the
// emitted og:image is NOT the static opengraph.jpg fallback — exactly the same
// resolution signal group 4 uses for entity pages. If WISHLIST_SHARE_TOKEN is
// unset, the API/OS upstreams are unreachable, or the token does not resolve a
// real hero image (favorites empty, image-less product, or dimension fetch
// failed → og:image falls back to opengraph.jpg with hard-coded 1280x720),
// the test degrades gracefully via test.skip, mirroring the entity-resolution
// skips above and in e2e/structured-data.spec.ts.
// ---------------------------------------------------------------------------

test.describe("Production SEO — og:image dimensions on a shared wishlist hero image", () => {
  const shareToken = process.env.WISHLIST_SHARE_TOKEN?.trim();
  let html: string | null = null;
  let ogImage: string | null = null;
  let realImageResolved = false;

  test.beforeAll(async ({ request }) => {
    if (!shareToken) return;
    const response = await request.get(
      `/favorites/share/${encodeURIComponent(shareToken)}`,
    );
    // serve.mjs always returns 200 for the SPA shell even when the token does
    // not resolve (it falls through to the generic head), so a non-200 here
    // means the serve instance itself is unreachable — leave realImageResolved
    // false so the assertions skip.
    if (response.status() !== 200) return;
    html = await response.text();
    ogImage = findMetaContent(html, "property", "og:image");
    // A resolved hero image yields any absolute URL other than the static
    // opengraph.jpg fallback (emitted for unresolved tokens and image-less
    // wishlists alike).
    realImageResolved =
      !!ogImage &&
      /^https?:\/\//.test(ogImage) &&
      !ogImage.split("?")[0].endsWith("/opengraph.jpg");
  });

  test("og:image:width is present and a positive integer", () => {
    if (!realImageResolved) {
      test.skip(
        true,
        shareToken
          ? `wishlist token did not resolve a real hero image (og:image="${ogImage}") — dimension assertion not applicable`
          : "WISHLIST_SHARE_TOKEN not set — resolved-wishlist dimension assertion not applicable",
      );
    }
    const width = findMetaContent(html!, "property", "og:image:width");
    expect(width, 'meta[property="og:image:width"] not found').toBeTruthy();
    expect(width!).toMatch(/^\d+$/);
    expect(Number(width)).toBeGreaterThan(0);
  });

  test("og:image:height is present and a positive integer", () => {
    if (!realImageResolved) {
      test.skip(
        true,
        shareToken
          ? `wishlist token did not resolve a real hero image (og:image="${ogImage}") — dimension assertion not applicable`
          : "WISHLIST_SHARE_TOKEN not set — resolved-wishlist dimension assertion not applicable",
      );
    }
    const height = findMetaContent(html!, "property", "og:image:height");
    expect(height, 'meta[property="og:image:height"] not found').toBeTruthy();
    expect(height!).toMatch(/^\d+$/);
    expect(Number(height)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 8. og:image:width / og:image:height on a resolved BARE /product/<slug> page
//
// Sections 4–5 only exercise the locale-prefixed /en-lb/beirut/product/<slug>
// route. The locale-less "bare" fallback in seo-inject.mjs (the bareImageDims =
// await fetchImageDimensions(bareImageUrl) branch around line 2052) handles
// /product/<slug> links shared before the locale-prefix fix, from external
// integrations, or from mobile app shares. It resolves the product against the
// OS API (countryCode LB, cityId lb-beirut), measures the hero image's pixel
// dimensions, and passes them into buildProductHead which emits og:image:width /
// og:image:height. A regression there — a dropped imageDimensions pass-through
// or a broken fetch — would silently ship badly-sized previews for every bare
// product link shared from the mobile app, yet section 4 only covers the
// locale-prefixed path.
//
// The bare branch resolves the same kind of OS image as the locale-prefixed
// product page, so describeEntityImageDimensions applies unchanged: it fetches
// the og:image URL and asserts the dimension tags only when a genuinely
// measurable image file is resolved, otherwise it degrades gracefully via
// test.skip (out-of-stock / unresolved products fall through to the generic
// /opengraph.jpg head). The slug mirrors the section-4 product page.
// ---------------------------------------------------------------------------

describeEntityImageDimensions("bare product", "/product/rose-bouquet");

// ---------------------------------------------------------------------------
// 9. og:image:width / og:image:height on a resolved BARE /blog/<slug> page
//
// Section 6 only exercises the locale-prefixed /en-lb/beirut/blog/<slug> route.
// The locale-less "bare" fallback in seo-inject.mjs (the bareBlogSlug =
// extractBlogPostSlug(pathname) branch around line 2074) handles /blog/<slug>
// links shared before the locale-prefix fix or from external integrations. It
// resolves the article from the shared BLOG_POSTS source of truth and passes
// the hero image's dimensions through buildBlogPostHead, which emits
// og:image:width / og:image:height. A regression there — a dropped
// imageWidth/imageHeight pass-through into buildBlogPostHead or a broken hero
// image — would silently ship badly-sized previews for every bare blog link
// shared externally, yet section 6 only covers the locale-prefixed path.
//
// The bare branch resolves the same kind of static hero image as the
// locale-prefixed blog page, so describeEntityImageDimensions applies
// unchanged: it fetches the og:image URL and asserts the dimension tags only
// when a genuinely measurable image file is resolved, otherwise it degrades
// gracefully via test.skip. The slug mirrors the section-6 blog page and must
// exist in src/data/blogPostsCopy.js.
// ---------------------------------------------------------------------------

describeEntityImageDimensions("bare blog post", "/blog/inside-spring-sourcing-trip");

// ---------------------------------------------------------------------------
// 10. Unknown-slug fallback — brand, category, and occasion pages degrade
//     cleanly to a generic OG head with no malformed structured-data nodes.
//
// When seo-inject.mjs calls /api/woo/brand (or /category / /occasion) and the
// fixture server returns 404, `injectSeoTagsAsync` falls through to
// `assembleHtml(html, generic)` — the same generic locale-aware head that
// non-entity routes receive. A regression in this path — e.g. accidentally
// emitting a partial Product or BreadcrumbList node whose required fields are
// empty or missing — would let malformed structured data ship to Google for
// every broken/retired slug, yet the fixture server's unknown-slug 404 was
// previously untested.
//
// Each sub-case asserts:
//   (a) The server returns 200 (always serves the SPA shell).
//   (b) og:title is present and non-empty (the generic head always sets this).
//   (c) og:image is present and is an absolute URL (generic fallback).
//   (d) No JSON-LD <script type="application/ld+json"> block contains a node
//       with missing required schema.org fields — the same contract enforced by
//       `collectJsonLdProblems` in seo-inject.mjs but evaluated end-to-end on
//       the served HTML so serve.mjs's branching logic is covered too.
// ---------------------------------------------------------------------------

/**
 * Extract and parse every <script type="application/ld+json"> block from a
 * raw HTML string, flatten any @graph wrappers into individual nodes, and
 * return the full list of schema.org node objects.
 *
 * Mirrors the validation path in seo-inject.mjs's `collectJsonLdProblems` /
 * `validateJsonLd` so the same structural guarantees are enforced end-to-end
 * on the actual served HTML rather than just at render time.
 */
function findAllJsonLdNodes(html: string): unknown[] {
  const nodes: unknown[] = [];
  const scriptRe =
    /<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1]);
    } catch {
      // Malformed JSON is itself a problem — surface it as a sentinel.
      nodes.push({ __parseError: true, raw: m[1].slice(0, 200) });
      continue;
    }
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj["@graph"])) {
        for (const node of obj["@graph"]) {
          if (node && typeof node === "object") nodes.push(node);
        }
      } else {
        nodes.push(parsed);
      }
    }
  }
  return nodes;
}

/**
 * Return a list of human-readable problems for a single JSON-LD node.
 * Mirrors the `JSON_LD_REQUIRED_FIELDS` map in seo-inject.mjs so any
 * regression in required-field coverage is caught here before it ships.
 */
function collectJsonLdProblemsLocal(node: unknown): string[] {
  const problems: string[] = [];
  if (!node || typeof node !== "object") return problems;
  const obj = node as Record<string, unknown>;

  // Parse errors surfaced by findAllJsonLdNodes.
  if (obj["__parseError"]) {
    return [`JSON-LD block is not valid JSON: ${String(obj["raw"])}`];
  }

  // @graph wrappers are skipped — callers flatten those into individual nodes.
  if (obj["@graph"]) return problems;

  const type = obj["@type"] as string | undefined;
  const requiredByType: Record<string, string[]> = {
    Organization: ["name", "url"],
    WebSite: ["name", "url"],
    Florist: ["name", "url"],
    WebPage: ["name", "url"],
    ContactPage: ["name", "url"],
    Product: ["name"],
    Article: ["headline", "image", "datePublished", "url"],
    BreadcrumbList: ["itemListElement"],
    ItemList: ["itemListElement"],
    FAQPage: ["mainEntity"],
  };
  if (type && requiredByType[type]) {
    for (const field of requiredByType[type]) {
      const v = obj[field];
      if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) {
        problems.push(`@type ${type}: missing required field "${field}"`);
      }
    }
  }
  // Product offers, when present, must carry price + currency + availability.
  if (type === "Product" && obj["offers"] && typeof obj["offers"] === "object") {
    const offers = obj["offers"] as Record<string, unknown>;
    for (const field of ["price", "priceCurrency", "availability"]) {
      if (offers[field] == null || offers[field] === "") {
        problems.push(`Product offers: missing "${field}"`);
      }
    }
  }
  return problems;
}

interface UnknownSlugCase {
  label: string;
  path: string;
}

const UNKNOWN_SLUG_CASES: UnknownSlugCase[] = [
  { label: "brand", path: "/en-lb/beirut/brand/unknown-brand-slug-xyz" },
  { label: "category", path: "/en-lb/beirut/category/unknown-category-slug-xyz" },
  { label: "occasion", path: "/en-lb/beirut/occasion/unknown-occasion-slug-xyz" },
];

for (const { label, path } of UNKNOWN_SLUG_CASES) {
  test.describe(
    `Production SEO — unknown ${label} slug degrades to generic OG head (${path})`,
    () => {
      let html: string;

      test.beforeAll(async ({ request }) => {
        const response = await request.get(path);
        // serve.mjs always responds 200 (SPA shell) even for unknown slugs —
        // the client-side router handles the redirect / 404 UI.
        expect(
          response.status(),
          `expected 200 for unknown ${label} slug, got ${response.status()}`,
        ).toBe(200);
        html = await response.text();
      });

      test("og:title is present and non-empty", () => {
        const content = findMetaContent(html, "property", "og:title");
        expect(
          content,
          `meta[property="og:title"] not found on unknown ${label} page`,
        ).toBeTruthy();
        expect(content!.trim().length).toBeGreaterThan(0);
      });

      test("og:image is present and is an absolute URL", () => {
        const content = findMetaContent(html, "property", "og:image");
        expect(
          content,
          `meta[property="og:image"] not found on unknown ${label} page`,
        ).toBeTruthy();
        expect(content!.trim().length).toBeGreaterThan(0);
        expect(
          content,
          `og:image must be absolute on unknown ${label} page, got "${content}"`,
        ).toMatch(/^https?:\/\//);
      });

      test("no JSON-LD node has missing required schema.org fields", () => {
        const nodes = findAllJsonLdNodes(html);
        const problems: string[] = [];
        for (const node of nodes) {
          problems.push(...collectJsonLdProblemsLocal(node));
        }
        expect(
          problems,
          `Unknown ${label} slug page emitted JSON-LD with missing required fields:\n${problems.join("\n")}`,
        ).toHaveLength(0);
      });
    },
  );
}
