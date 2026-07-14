import { Router, type IRouter } from "express";
import type { OSProductOccasion } from "@workspace/presentail-os";
import {
  GetCatalogMetadataResponse,
  GetCurrenciesResponse,
} from "@workspace/api-zod";
import {
  categories,
  COUNTRY_TO_CURRENCY_MAP,
  CURRENCIES,
  FALLBACK_CURRENCY_CODE,
  occasions,
} from "@workspace/catalog-data";
import { getOsBrandProductCounts, getOsBrands, getOsCategories, getOsCategoryProductCounts, getOsCategoryProductCountsByCountry, getOsOccasionProductCounts, getOsOccasionProductCountsByCountry, getOsOccasions, getOsProductOccasions, getOsRawCatalogBrands, getOsProductEmbeddedCategories, getOsProductPricingMap, getCachedBestSellerIds } from "../lib/osProductsCache";
import { transformImage, resolveWidth, resolveFormat, resolveQuality } from "../lib/imageTransform";

const router: IRouter = Router();

// ── Shared LRU image cache ─────────────────────────────────────────────────
// Bounded in-memory LRU cache shared across all catalog image proxy endpoints.
// Max 300 entries or ~75 MB total (catalog images can be larger than product
// thumbnails so we allocate a slightly bigger pool than imgProxy.ts).

type CacheEntry = { data: Buffer; contentType: string; size: number };

const CACHE_MAX_ENTRIES = 300;
const CACHE_MAX_BYTES = 75 * 1024 * 1024;
const catalogImageCache = new Map<string, CacheEntry>();
let catalogCacheBytes = 0;

function catalogCacheGet(key: string): CacheEntry | undefined {
  const entry = catalogImageCache.get(key);
  if (!entry) return undefined;
  catalogImageCache.delete(key);
  catalogImageCache.set(key, entry);
  return entry;
}

function catalogCacheSet(key: string, entry: CacheEntry): void {
  if (catalogImageCache.has(key)) {
    const old = catalogImageCache.get(key)!;
    catalogCacheBytes -= old.size;
    catalogImageCache.delete(key);
  }
  while (
    catalogImageCache.size >= CACHE_MAX_ENTRIES ||
    catalogCacheBytes + entry.size > CACHE_MAX_BYTES
  ) {
    const firstKey = catalogImageCache.keys().next().value;
    if (firstKey === undefined) break;
    const evicted = catalogImageCache.get(firstKey)!;
    catalogCacheBytes -= evicted.size;
    catalogImageCache.delete(firstKey);
  }
  catalogImageCache.set(key, entry);
  catalogCacheBytes += entry.size;
}

// ── Brand image proxy ─────────────────────────────────────────────────────────

const OS_BRAND_IMAGE_PREFIX =
  "https://os.presentail.com/api/storage/public-objects/catalog_brands/";

function toBrandImageProxyUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith(OS_BRAND_IMAGE_PREFIX)) {
    const filename = url.slice(OS_BRAND_IMAGE_PREFIX.length);
    if (/^[a-zA-Z0-9_-]+\.[a-zA-Z]{2,5}$/.test(filename)) {
      return `/api/catalog/brand-image/${filename}`;
    }
  }
  return url;
}

router.get("/catalog/brand-image/:filename", async (req, res) => {
  const { filename } = req.params;
  if (!/^[a-zA-Z0-9_-]+\.[a-zA-Z]{2,5}$/.test(filename)) {
    res.status(400).json({ error: "Invalid filename" });
    return;
  }
  const apiKey = process.env.PRESENTAIL_OS_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "OS API key not configured" });
    return;
  }

  const width = resolveWidth(typeof req.query.w === "string" ? req.query.w : undefined);
  const format = resolveFormat(typeof req.query.f === "string" ? req.query.f : undefined);
  const quality = resolveQuality(typeof req.query.q === "string" ? req.query.q : undefined);
  const cacheKey = `brand|${filename}|${width}|${format}|${quality}`;

  const cached = catalogCacheGet(cacheKey);
  if (cached) {
    res.setHeader("Content-Type", cached.contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Cache", "HIT"); // i18n-ignore
    res.send(cached.data);
    return;
  }

  const upstream = `${OS_BRAND_IMAGE_PREFIX}${filename}`;
  try {
    const upstream_res = await fetch(upstream, {
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream_res.ok) {
      res.status(upstream_res.status).json({ error: "Upstream error" });
      return;
    }
    const contentType = upstream_res.headers.get("content-type") ?? "image/webp";
    if (!contentType.startsWith("image/")) {
      res.status(404).json({ error: "Brand image not accessible" });
      return;
    }
    const sourceBuffer = Buffer.from(await upstream_res.arrayBuffer());
    let result: { data: Buffer; contentType: string };
    try {
      result = await transformImage(sourceBuffer, { width, format, quality });
    } catch (err) {
      req.log.warn({ err }, "catalog/brand-image: sharp transform failed");
      res.status(500).end();
      return;
    }
    catalogCacheSet(cacheKey, { data: result.data, contentType: result.contentType, size: result.data.byteLength });
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Cache", "MISS"); // i18n-ignore
    res.send(result.data);
  } catch {
    res.status(502).json({ error: "Failed to fetch brand image" });
  }
});

// ── Occasion image proxy ──────────────────────────────────────────────────────
//
// OS stores occasion images at auth-gated /objects/… paths. The browser cannot
// supply the API key, so we proxy through here. The occasion ID (numeric string
// as returned by the occasions API) is used as the cache key.

router.get("/catalog/occasion-image/:id", async (req, res) => {
  const { id } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const apiKey = process.env.PRESENTAIL_OS_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "OS API key not configured" });
    return;
  }

  const width = resolveWidth(typeof req.query.w === "string" ? req.query.w : undefined);
  const format = resolveFormat(typeof req.query.f === "string" ? req.query.f : undefined);
  const quality = resolveQuality(typeof req.query.q === "string" ? req.query.q : undefined);
  const cacheKey = `occasion|${id}|${width}|${format}|${quality}`;

  const cached = catalogCacheGet(cacheKey);
  if (cached) {
    res.setHeader("Content-Type", cached.contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Cache", "HIT"); // i18n-ignore
    res.send(cached.data);
    return;
  }

  const osOccasions = getOsOccasions();
  const occasion = osOccasions?.find((o) => o.id === id);
  // Only use the public-objects URL. The private upload path (/objects/…) returns
  // the OS web-app HTML shell instead of an image, so we never fall back to it.
  const imageUrl = occasion?.imagePublicUrl ?? null;
  if (!imageUrl) {
    res.status(404).json({ error: "Occasion image not found" });
    return;
  }
  try {
    const upstream_res = await fetch(imageUrl, {
      headers: { "x-api-key": apiKey, Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream_res.ok) {
      res.status(upstream_res.status).json({ error: "Upstream error" });
      return;
    }
    const contentType = upstream_res.headers.get("content-type") ?? "";
    // OS private storage paths return the web-app HTML shell instead of an image
    // when the storage URL is not directly accessible. Detect and surface as 404
    // so the client can fall back to its icon.
    if (!contentType.startsWith("image/")) {
      res.status(404).json({ error: "Occasion image not accessible" });
      return;
    }
    const sourceBuffer = Buffer.from(await upstream_res.arrayBuffer());
    let result: { data: Buffer; contentType: string };
    try {
      result = await transformImage(sourceBuffer, { width, format, quality });
    } catch (err) {
      req.log.warn({ err }, "catalog/occasion-image: sharp transform failed");
      res.status(500).end();
      return;
    }
    catalogCacheSet(cacheKey, { data: result.data, contentType: result.contentType, size: result.data.byteLength });
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Cache", "MISS"); // i18n-ignore
    res.send(result.data);
  } catch {
    res.status(502).json({ error: "Failed to fetch occasion image" });
  }
});

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/currencies", (_req, res) => {
  const data = GetCurrenciesResponse.parse({
    currencies: CURRENCIES,
    fallbackCode: FALLBACK_CURRENCY_CODE,
    countryToCurrency: COUNTRY_TO_CURRENCY_MAP,
  });
  res.json(data);
});

router.get("/catalog/occasions", (req, res) => {
  const countryCode = typeof req.query.countryCode === "string" ? req.query.countryCode : null;
  const osOccasions = getOsOccasions();
  const occasionCountMap = countryCode
    ? getOsOccasionProductCountsByCountry(countryCode)
    : getOsOccasionProductCounts();
  const featured = osOccasions
    ? osOccasions
        .filter((o) => o.featured === true)
        .map((o) => ({
          slug: o.slug,
          name: o.name,
          // Route through our proxy so the browser never needs the OS API key.
          image: o.image ? `/api/catalog/occasion-image/${o.id}` : null,
          count: occasionCountMap.get(o.slug) ?? 0,
        }))
    : [];
  res.json({ occasions: featured });
});

router.get("/catalog/metadata", (req, res) => {
  const countryCode = typeof req.query.countryCode === "string" ? req.query.countryCode : null;
  const osBrands = getOsBrands();
  const osOccasions = getOsOccasions();

  function isOccasionActive(isActive?: boolean): boolean {
    if (isActive === false) return false;
    return true;
  }

  // Build a slug → OS occasion map (all statuses) so we can check whether a
  // hardcoded occasion's OS counterpart is inactive.
  const osOccasionBySlugAll = new Map(
    (osOccasions ?? []).map((o) => [o.slug, o]),
  );
  // Active-only map used for image overlays and OS-only appends.
  const osOccasionBySlug = new Map(
    (osOccasions ?? []).filter((o) => isOccasionActive(o.isActive)).map((o) => [o.slug, o]),
  );

  // Use the pre-computed per-brand / per-category / per-occasion in-stock
  // product counts from the cache. The cache layer recomputes counts after
  // every OS refresh cycle, so this is always consistent with the current
  // store caches without re-iterating over all products on every request.
  // When a countryCode is provided, use per-country counts so that the mega
  // menu only surfaces categories/occasions with products in the shopper's market.
  const brandCountMap = getOsBrandProductCounts();
  const categoryCountMap = countryCode
    ? getOsCategoryProductCountsByCountry(countryCode)
    : getOsCategoryProductCounts();
  const occasionCountMap = countryCode
    ? getOsOccasionProductCountsByCountry(countryCode)
    : getOsOccasionProductCounts();

  // Merge OS images into hardcoded occasions. The hardcoded list provides icons,
  // descriptions, and stable slugs; OS provides real photos. When OS has an image
  // for a slug, replace the bundled asset reference with a proxy URI so the browser
  // never needs to supply the API key. `count` is the number of in-stock products
  // tagged with this occasion across all stores — consumers (e.g. the sitemap)
  // use it to skip empty pages.
  const mergedOccasions = occasions
    .filter((occ) => {
      // Skip hardcoded occasions whose OS counterpart is marked inactive.
      const osOccAll = osOccasionBySlugAll.get(occ.id);
      return osOccAll === undefined || isOccasionActive(osOccAll.isActive);
    })
    .map((occ) => {
      const osOcc = osOccasionBySlug.get(occ.id); // hardcoded id === slug
      const count = occasionCountMap.get(occ.id) ?? 0;
      if (osOcc?.image) {
        return {
          ...occ,
          image: { uri: `/api/catalog/occasion-image/${osOcc.id}` },
          count,
        };
      }
      return { ...occ, count };
    });

  // Append OS-only occasions — occasions that exist in OS but are not in the
  // hardcoded list. These surface on the /occasions page automatically without
  // a code deploy. The featured flag is intentionally ignored here; that filter
  // only applies to the megamenu (/catalog/occasions endpoint).
  //
  // Two sources are merged so an occasion shows up even if it was only tagged
  // on products (e.g. "kateb-kitab") without being added to the OS occasions
  // catalog endpoint. The dedicated catalog endpoint takes precedence for image
  // and name when both sources have the same slug.
  // Best-effort icon map for known OS-only slugs; unmapped ones fall back to "star".
  const OS_OCCASION_ICONS: Record<string, string> = {
    "mothers-day": "flower-2",
    "fathers-day": "user",
    "valentines-day": "heart",
    "womens-day": "sparkles",
    christmas: "gift",
    "new-year": "party-popper",
    "national-day": "star",
    "katb-kitab": "ring",
  };
  const hardcodedSlugs = new Set(occasions.map((o) => o.id));
  // Merge: dedicated OS occasions catalog wins over product-tag occasions for
  // the same slug. Start with product-tag occasions as the base, then overwrite
  // with dedicated catalog entries.
  const osProductOccasions = getOsProductOccasions();
  const allOsOccasions = new Map<string, OSProductOccasion>(osProductOccasions);
  for (const osOcc of osOccasions ?? []) {
    allOsOccasions.set(osOcc.slug, osOcc);
  }
  for (const osOcc of allOsOccasions.values()) {
    if (!hardcodedSlugs.has(osOcc.slug) && isOccasionActive(osOcc.isActive)) {
      mergedOccasions.push({
        id: osOcc.slug,
        name: osOcc.name,
        icon: OS_OCCASION_ICONS[osOcc.slug] ?? "star",
        description: undefined,
        image: osOcc.image ? { uri: `/api/catalog/occasion-image/${osOcc.id}` } : null,
        count: occasionCountMap.get(osOcc.slug) ?? 0,
      });
    }
  }

  // Prefer raw catalog-attribute brands so that active brands with zero products
  // are still surfaced (the product-count filter in getOsBrands() removes them).
  //
  // Normalise is_active — the OS may send a boolean, a string, or nothing:
  //   absent / true  / "active"   → active (show in menu)
  //   false  / "inactive"         → inactive (hide from menu)
  //
  // Fall back to the product-filtered list when the raw cache hasn't been
  // populated yet (first cold-start request).
  function isBrandActive(isActive?: boolean | string): boolean {
    if (isActive === false || isActive === "inactive") return false;
    return true;
  }
  const rawCatalogBrands = getOsRawCatalogBrands();
  const OS_BASE = "https://os.presentail.com";
  const brands = rawCatalogBrands
    ? rawCatalogBrands
        .filter((b) => isBrandActive(b.is_active))
        .map((b) => {
          const rawImg = b.image_public_url || b.image_url || null;
          const fullImg = rawImg
            ? rawImg.startsWith("http") ? rawImg : `${OS_BASE}${rawImg}`
            : null;
          return {
            name: b.name,
            slug: b.slug!,
            image: toBrandImageProxyUrl(fullImg),
            count: brandCountMap.get(b.slug!) ?? 0,
            sort_order: b.sort_order ?? null,
          };
        })
        .sort((a, b) => {
          const aOrder = a.sort_order ?? Infinity;
          const bOrder = b.sort_order ?? Infinity;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return a.name.localeCompare(b.name);
        })
    : osBrands
    ? osBrands.map((b) => ({
        name: b.name,
        slug: b.slug,
        image: toBrandImageProxyUrl(b.image),
        count: brandCountMap.get(b.slug) ?? 0,
        sort_order: null,
      }))
    : [];

  // Merge live OS categories into the hardcoded list so dynamically added
  // categories (e.g. dried-flowers, lux-arrangements, beauty) have proper
  // display names. Hardcoded entries take precedence to preserve existing i18n keys.
  //
  // The CatalogCategory schema requires an `icon` field. We keep a best-effort
  // slug→icon map for known OS-only categories; anything not in the map falls
  // back to a generic "tag" icon so Zod validation never rejects the response.
  const OS_CATEGORY_ICONS: Record<string, string> = {
    "dried-flowers": "flower-poppy",
    "artificial-flowers": "flower-outline",
    "balloon-deco": "balloon",
    beauty: "lipstick",
    accessories: "hanger",
    candles: "candle",
    perfume: "bottle-tonic",
    jewelry: "diamond-stone",
    spa: "spa",
    "home-decor": "lamp",
    sweets: "candy",
    electronics: "devices",
  };

  const osCategories = getOsCategories();
  // Collect categories embedded in product data. Used as a fallback for
  // categories not yet listed in the OS /api/categories endpoint.
  const productEmbeddedCategories = getOsProductEmbeddedCategories();

  // When the OS cache is cold (null) fall back to the full hardcoded list so
  // the UI is never blank. Once the cache is warm, OS is the source of truth:
  // only categories marked is_featured === true are shown. Non-featured
  // categories are intentionally hidden even if they have products.
  let mergedCategories;
  if (osCategories === null) {
    mergedCategories = categories.map((c) => ({
      ...c,
      count: categoryCountMap.get(c.id) ?? 0,
    }));
  } else {
    // Split into featured (what we show) vs. all (used to block product-embedded
    // injection for categories OS knows about but chose not to feature).
    const featuredOsCategories = osCategories.filter((c) => c.is_featured === true);
    const allOsCategorySlugs = new Set(osCategories.map((c) => c.slug));
    const featuredOsCategorySlugs = new Set(featuredOsCategories.map((c) => c.slug));
    const featuredOsCategoryBySlug = new Map(featuredOsCategories.map((c) => [c.slug, c]));

    // Hardcoded categories: show when featured in OS, OR when OS doesn't know
    // about the slug at all but products are tagged with it (product-embedded
    // fallback for categories not yet on the OS endpoint).
    const filteredHardcoded = categories
      .filter((c) => featuredOsCategorySlugs.has(c.id) || (!allOsCategorySlugs.has(c.id) && productEmbeddedCategories.has(c.id)))
      .map((c) => {
        const osCat = featuredOsCategoryBySlug.get(c.id);
        return {
          ...c,
          description: osCat?.description ?? productEmbeddedCategories.get(c.id)?.description ?? null,
          count: categoryCountMap.get(c.id) ?? 0,
        };
      });
    const filteredSlugs = new Set(filteredHardcoded.map((c) => c.id));

    // Extra featured OS categories that have no hardcoded entry.
    const extraOsCategories = featuredOsCategories
      .filter((c) => !filteredSlugs.has(c.slug))
      .map((c) => ({
        id: c.slug,
        name: c.name,
        icon: OS_CATEGORY_ICONS[c.slug] ?? "tag",
        description: c.description ?? null,
        count: categoryCountMap.get(c.slug) ?? 0,
      }));
    mergedCategories = [...filteredHardcoded, ...extraOsCategories];

    // Inject product-embedded categories only for slugs OS doesn't know about
    // at all. If OS has the slug but it isn't featured, that's an explicit
    // hide decision — do not re-surface it via the product-embedded path.
    const existingSlugs = new Set(mergedCategories.map((c) => c.id));
    for (const [slug, cat] of productEmbeddedCategories) {
      if (existingSlugs.has(slug)) continue;
      if (allOsCategorySlugs.has(slug)) continue; // OS knows it but didn't feature it
      const count = categoryCountMap.get(slug) ?? 0;
      if (count === 0) continue;
      mergedCategories = [
        ...mergedCategories,
        {
          id: slug,
          name: cat.name,
          icon: OS_CATEGORY_ICONS[slug] ?? "tag",
          description: cat.description ?? null,
          count,
        },
      ];
      existingSlugs.add(slug);
    }
  }

  const data = GetCatalogMetadataResponse.parse({
    categories: mergedCategories,
    occasions: mergedOccasions,
    brands,
  });
  res.json(data);
});

// GET /api/catalog/brand-allowlist
//
// Returns the list of brand slugs that the storefront should show.
// Reads the PRESENTAIL_OS_BRAND_ALLOWLIST env var (same source as
// applyBrandAllowlist in osProductsCache.ts). The web client uses this to
// stay in sync with the server-side filter without a deploy.
// Returns { ok: true, slugs: [] } when filtering is disabled (empty env var).
router.get("/catalog/brand-allowlist", (_req, res) => {
  const raw = process.env.PRESENTAIL_OS_BRAND_ALLOWLIST;
  const allowlistStr = raw ?? "";
  const slugs = allowlistStr.trim()
    ? allowlistStr.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  res.json({ ok: true, slugs });
});

// GET /api/catalog/products-pricing
//
// Returns a JSON map of osNumericId → { discountPriceUsd, discountPriceAed,
// regularPriceUsd } for all products that have an active discount.
// Reads from the in-memory pricing enrichment cache populated after each
// OS product cache refresh. This is a fast cache-read with no OS calls at
// request time.
//
// Returns the current set of best-seller product IDs (OS slugs), computed
// from blended app_orders DB counts + OS totalSales on each cache refresh.
// The web's OS-direct path fetches this alongside OS products so the badge
// matches the homepage best-sellers rail even when VITE_OS_API_KEY is set
// and the browser bypasses the API server for the product list.
// 60-second cache — same TTL as products-pricing.
router.get("/catalog/best-seller-ids", (_req, res) => {
  const ids = Array.from(getCachedBestSellerIds());
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json({ ok: true, ids });
});

// Web collection pages (Shop, category, occasion, brand) call this once after
// loading the product list and merge the pricing data by osNumericId so that
// sale badges and strikethrough prices appear everywhere, not just on the PDP.
router.get("/catalog/products-pricing", (_req, res) => {
  const pricingMap = getOsProductPricingMap();
  const pricing: Record<string, { discountPriceUsd: number | null; discountPriceAed: number | null; regularPriceUsd: number | null }> = {};
  for (const [id, entry] of pricingMap) {
    pricing[id] = {
      discountPriceUsd: entry.discountPriceUsd,
      discountPriceAed: entry.discountPriceAed,
      regularPriceUsd: entry.regularPriceUsd,
    };
  }
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json({ ok: true, pricing });
});

export default router;
