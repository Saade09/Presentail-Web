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
// 6. og:image:width / og:image:height on a shared wishlist hero image
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
