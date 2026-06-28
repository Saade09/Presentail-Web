/**
 * Stateless SEO-entity fixture API for the "Web serve checks" CI workflow.
 *
 * The serve-backed og:image dimension specs for product / brand / category /
 * occasion entity pages (artifacts/presentail-web/e2e-serve/seo-injection.spec.ts
 * sections 4, 5 and 8) only assert real numeric og:image:width / og:image:height
 * when serve.mjs resolves a real entity image and measures it. In production
 * that resolution goes through the Presentail OS catalog upstreams, which are
 * unreachable in this web-only CI workflow — so those groups would silently
 * `test.skip` and a regression in the entity-page dimension path could ship
 * unnoticed.
 *
 * This tiny dependency-free HTTP server stands in for that upstream. serve.mjs
 * is pointed at it via INTERNAL_API_BASE_URL; it answers the four entity lookup
 * endpoints (plus the category/occasion listing endpoints used for the ItemList
 * count) for a fixed set of known fixture slugs, and serves a real, measurable
 * PNG for each entity's hero image. Every fixture entity's image URL is an
 * absolute URL pointing back at this server, so both serve.mjs's per-request
 * fetchImageDimensions() AND the spec's isMeasurableImage() probe resolve a
 * genuine `image/png` response with positive integer dimensions.
 *
 * It also stands in for the shared-wishlist resolution path so section 7 of
 * the same spec (resolved-wishlist og:image dimensions) actually runs instead
 * of degrading to test.skip: it answers GET /api/favorites/share/<token> for
 * the configured WISHLIST_SHARE_TOKEN by returning a single favorite that
 * references the `rose-bouquet` fixture product, whose hero image is the same
 * measurable PNG served for every other entity.
 *
 * Shapes mirror what seo-inject.mjs consumes:
 *   - product:  { ok, product:  { name, description, priceValue, inStock,
 *                                 image: { uri } } }
 *   - brand:    { ok, brand:    { name, image } }
 *   - category: { ok, category: { name, image } }
 *   - occasion: { ok, occasion: { name, image } }
 *   - category-products: { ok, products: [{ name }], count }
 *   - occasion-products: { ok, groups: [{ count, products: [{ name }] }], total }
 *   - favorites/share: { ok, favorites: [{ productSlug, countryCode }] }
 *     (consumed by fetchSharedFavoritesForSeo — the hero product slug is then
 *     resolved through the /api/woo/product endpoint above, so the fixture
 *     favorites simply point at the existing measurable "rose-bouquet" product)
 *
 * Unknown slugs and unrelated endpoints (banners, sitemap, etc.) return 404 so
 * serve.mjs degrades to its generic head exactly as it would in production when
 * an entity does not resolve — keeping the fixture's blast radius minimal.
 *
 * Port comes from SEO_FIXTURE_PORT (default 19235). The resolvable wishlist
 * token comes from WISHLIST_SHARE_TOKEN (default below) and must match the
 * value the Playwright run passes to section 7. Logs a ready line on listen so
 * the workflow's wait-on step can proceed.
 */

import http from "node:http";
import zlib from "node:zlib";

const PORT = Number(process.env.SEO_FIXTURE_PORT ?? 19235);
const ORIGIN = `http://localhost:${PORT}`;
const WISHLIST_SHARE_TOKEN = (
  process.env.WISHLIST_SHARE_TOKEN ?? "ci-wishlist-share-token"
).trim();

// ---------------------------------------------------------------------------
// PNG generation — a real, valid PNG of the requested dimensions so the image
// is genuinely measurable by parseDimsFromBuffer (IHDR is in the first bytes,
// well within the Range: bytes=0-4095 window both probers use).
// ---------------------------------------------------------------------------

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "latin1");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crc = zlib.crc32(Buffer.concat([typeBuf, data])) >>> 0;
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function makePng(width, height) {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour (RGB)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  // Raw image: each scanline is a filter byte (0) followed by RGB triples.
  const rowLength = width * 3 + 1;
  const raw = Buffer.alloc(rowLength * height, 0);
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// A single standard-sized OG hero (1200x630) reused for every fixture entity.
const HERO_PNG = makePng(1200, 630);
const HERO_IMAGE_URL = `${ORIGIN}/fixtures/hero.png`;

// ---------------------------------------------------------------------------
// Fixture entity catalogue, keyed by slug, matching the paths exercised in
// seo-injection.spec.ts.
// ---------------------------------------------------------------------------

const PRODUCTS = {
  "rose-bouquet": {
    name: "Rose Bouquet",
    description: "A luxurious bouquet of fresh roses.",
    priceValue: 89,
    inStock: true,
    image: { uri: HERO_IMAGE_URL },
  },
  "sold-out-roses": {
    name: "Sold Out Roses",
    description: "A premium arrangement of red roses — currently out of stock.",
    priceValue: 120,
    inStock: false,
    image: { uri: HERO_IMAGE_URL },
  },
};

const BRANDS = {
  roses: { name: "Roses", image: HERO_IMAGE_URL },
};

const CATEGORIES = {
  flowers: { name: "Flowers", image: HERO_IMAGE_URL },
};

const OCCASIONS = {
  birthday: { name: "Birthday", image: HERO_IMAGE_URL },
};

// ---------------------------------------------------------------------------
// Shared-wishlist fixture. The "Web serve checks" workflow exports
// WISHLIST_SHARE_TOKEN (see the env-driven const near the top of this file) so
// the shared-wishlist og:image dimension group in seo-injection.spec.ts
// resolves a real, measurable hero image instead of test.skip-ing on the
// unreachable /api/favorites/share upstream. The favorites point at the
// existing measurable "rose-bouquet" product, whose hero image is served by
// /fixtures/hero.png above.
const SHARED_FAVORITES = [{ productSlug: "rose-bouquet", countryCode: "LB" }];

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function notFound(res) {
  sendJson(res, 404, { ok: false });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, ORIGIN);
  const slug = url.searchParams.get("slug") ?? "";

  if (url.pathname === "/fixtures/hero.png") {
    res.writeHead(200, {
      "content-type": "image/png",
      "content-length": HERO_PNG.length,
      "cache-control": "no-store",
    });
    res.end(HERO_PNG);
    return;
  }

  // Readiness probe for the workflow's wait-on step.
  if (url.pathname === "/healthz") {
    sendJson(res, 200, { ok: true });
    return;
  }

  // Shared-wishlist resolution: /api/favorites/share/<token>. The token is a
  // path segment (not a ?slug= query param), so match it before the switch.
  // Only the known fixture token resolves; any other token 404s so serve.mjs
  // degrades to its generic head exactly as it would for an unresolved token.
  const shareMatch = url.pathname.match(/^\/api\/favorites\/share\/(.+)$/);
  if (shareMatch) {
    const token = decodeURIComponent(shareMatch[1]);
    return token === WISHLIST_SHARE_TOKEN
      ? sendJson(res, 200, { ok: true, favorites: SHARED_FAVORITES })
      : notFound(res);
  }

  switch (url.pathname) {
    case "/api/woo/product": {
      const product = PRODUCTS[slug];
      return product ? sendJson(res, 200, { ok: true, product }) : notFound(res);
    }
    case "/api/woo/brand": {
      const brand = BRANDS[slug];
      return brand ? sendJson(res, 200, { ok: true, brand }) : notFound(res);
    }
    case "/api/woo/category": {
      const category = CATEGORIES[slug];
      return category
        ? sendJson(res, 200, { ok: true, category })
        : notFound(res);
    }
    case "/api/woo/occasion": {
      const occasion = OCCASIONS[slug];
      return occasion
        ? sendJson(res, 200, { ok: true, occasion })
        : notFound(res);
    }
    case "/api/woo/category-products": {
      if (!CATEGORIES[slug]) return notFound(res);
      const products = [{ name: "Rose Bouquet" }, { name: "Tulip Bunch" }];
      return sendJson(res, 200, { ok: true, products, count: products.length });
    }
    case "/api/woo/occasion-products": {
      if (!OCCASIONS[slug]) return notFound(res);
      const products = [{ name: "Rose Bouquet" }, { name: "Tulip Bunch" }];
      const groups = [{ count: products.length, products }];
      return sendJson(res, 200, { ok: true, groups, total: products.length });
    }
    default:
      // Banners, sitemap, and any other upstream calls degrade gracefully.
      return notFound(res);
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`SEO entity fixture server listening on ${ORIGIN}`);
});
