import { Router, type IRouter } from "express";
import type { OSProductOccasion } from "@workspace/presentail-os";
import { getOsOccasionStatsMap } from "../lib/osOccasionStats";
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
import { getOsBrandProductCounts, getOsBrands, getOsCategories, getOsCategoryProductCounts, getOsCategoryProductCountsByCountry, getOsOccasionProductCounts, getOsOccasionProductCountsByCountry, getOsOccasions, getOsOccasionsForCity, getOsOccasionsForCountry, getOsProductOccasions, getOsRawCatalogBrands, getOsProductEmbeddedCategories, getOsProductPricingMap, getCachedBestSellerIds, getOsProducts } from "../lib/osProductsCache";
import { getRankingConfig } from "./homepage";
import { scoreCollections, getCollectionClickScores } from "../lib/collectionRanking";
import { transformImage, resolveWidth, resolveFormat, resolveQuality } from "../lib/imageTransform";
import { buildCatalogProductImageUrl, CATALOG_CARD_IMAGE_WIDTH } from "../lib/catalogProductImagePolicy";
import { db } from "@workspace/db";
import { plantEnvironmentCacheTable } from "@workspace/db/schema";
import { logger } from "../lib/logger";
import { translateCategoryOccasionNames, type CategoryOccasionLang } from "../lib/categoryOccasionTranslation";
import {
  IMAGE_FETCH_TIMEOUT_MS,
  ImageDeliveryError,
  parseOsImageUrl,
  readBoundedImageBody,
  withImageLoadLimit,
} from "../lib/imageDelivery";

const router: IRouter = Router();

// These payloads contain public reference/catalog data only. Keep a browser
// cache short enough for storefront changes to appear promptly, while allowing
// shared caches to absorb repeated menu and app-launch requests.
const PUBLIC_CATALOG_CACHE_CONTROL =
  "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

async function fetchAndTransformCatalogImage(
  rawUrl: string,
  apiKey: string,
  options: { width: number; format: "webp" | "jpeg"; quality: number },
) {
  return withImageLoadLimit(async () => {
    const target = parseOsImageUrl(rawUrl);
    const upstream = await fetch(target.toString(), {
      // Send NO auth headers. The /api/storage/public-objects/ endpoint is
      // publicly accessible and the OS API key causes the server to return
      // different (non-image) bytes even when the HTTP status is 200. Verified
      // by curl: the URL serves a real JPEG with no auth headers present.
      redirect: "manual",
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      throw new ImageDeliveryError("redirect", "Catalog image redirected", 502, upstream.status);
    }
    if (!upstream.ok) {
      const status = upstream.status === 404 || upstream.status === 410 ? 404 : 502;
      throw new ImageDeliveryError("upstream-status", "Catalog image fetch failed", status, upstream.status);
    }
    const source = await readBoundedImageBody(upstream);
    try {
      return await transformImage(source, options);
    } catch (error) {
      if (error instanceof ImageDeliveryError) throw error;
      throw new ImageDeliveryError("invalid-url", "Catalog image is corrupt", 422);
    }
  });
}

const CATALOG_DEFAULT_OCCASION_ORDER = [
  "birthday", "love-romance", "congratulations", "thank-you", "get-well-soon",
  "new-born", "anniversary", "wedding", "katb-kitab", "graduation",
  "housewarming", "im-sorry", "funeral",
];

function catalogResolveStoreKey(countryCode?: string | null): string {
  if (countryCode === "AE") return "dubai";
  if (countryCode === "CY") return "cyprus";
  return "lebanon";
}

// ── Shared LRU image cache ─────────────────────────────────────────────────
// Bounded in-memory LRU cache shared across all catalog image proxy endpoints.
// Max 300 entries or ~75 MB total (catalog images can be larger than product
// thumbnails so we allocate a slightly bigger pool than imgProxy.ts).

type CacheEntry = { data: Buffer; contentType: string; size: number; cachedAt: number };

const CACHE_MAX_ENTRIES = 300;
const CACHE_MAX_BYTES = 75 * 1024 * 1024;
const CATALOG_IMAGE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CATALOG_IMAGE_CACHE_CONTROL =
  "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400";
const catalogImageCache = new Map<string, CacheEntry>();
let catalogCacheBytes = 0;

function catalogCacheGet(key: string): CacheEntry | undefined {
  const entry = catalogImageCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.cachedAt >= CATALOG_IMAGE_CACHE_TTL_MS) {
    catalogImageCache.delete(key);
    catalogCacheBytes -= entry.size;
    return undefined;
  }
  catalogImageCache.delete(key);
  catalogImageCache.set(key, entry);
  return entry;
}

function catalogCacheSet(key: string, entry: Omit<CacheEntry, "cachedAt">): void {
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
  catalogImageCache.set(key, { ...entry, cachedAt: Date.now() });
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
  return buildCatalogProductImageUrl(url, CATALOG_CARD_IMAGE_WIDTH);
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
    res.setHeader("Cache-Control", CATALOG_IMAGE_CACHE_CONTROL);
    res.setHeader("X-Cache", "HIT"); // i18n-ignore
    res.send(cached.data);
    return;
  }

  const upstream = `${OS_BRAND_IMAGE_PREFIX}${filename}`;
  try {
    const result = await fetchAndTransformCatalogImage(upstream, apiKey, { width, format, quality });
    catalogCacheSet(cacheKey, { data: result.data, contentType: result.contentType, size: result.data.byteLength });
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Cache-Control", CATALOG_IMAGE_CACHE_CONTROL);
    res.setHeader("X-Cache", "MISS"); // i18n-ignore
    res.send(result.data);
  } catch (error) {
    req.log.warn({ err: error }, "catalog/brand-image: delivery failed");
    res.status(error instanceof ImageDeliveryError ? error.status : 502).end();
  }
});

// ── Occasion image proxy ──────────────────────────────────────────────────────
//
// OS stores occasion images at auth-gated /objects/… paths. The browser cannot
// supply the API key, so we proxy through here. The occasion ID (numeric string
// as returned by the occasions API) is used as the cache key.
//
// Static fallbacks are used when OS has no image configured for an occasion, or
// when the stored imagePublicUrl is not a real image asset (e.g. an SPA route).
const OCCASION_STATIC_IMAGES_PROXY: Record<string, string> = {
  "birthday":     "/catalog/occasions/birthday.webp",
  "love-romance": "/catalog/occasions/love-romance.webp",
  "thank-you":    "/catalog/occasions/thank-you.webp",
  "condolences":  "/catalog/occasions/condolences.webp",
  "farewell":     "/catalog/occasions/farewell.avif",
  "housewarming": "/catalog/occasions/housewarming.avif",
  "new-job":      "/catalog/occasions/new-job.avif",
  "promotion":    "/catalog/occasions/promotion.avif",
};

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
    res.setHeader("Cache-Control", CATALOG_IMAGE_CACHE_CONTROL);
    res.setHeader("X-Cache", "HIT"); // i18n-ignore
    res.send(cached.data);
    return;
  }

  const osOccasions = getOsOccasions();
  // OS occasion ids may be numbers; the route param is always a string.
  const occasion = osOccasions?.find((o) => String(o.id) === id);
  // Prefer imagePublicUrl (public CDN); fall back to image (private upload with API-key auth).
  // This mirrors the category-image proxy which uses the same fallback chain. The OS occasions
  // API often omits image_public_url and only populates image_url, so without this fallback
  // all occasion images 404 even when images are configured in the OS admin.
  const imageUrl = occasion?.imagePublicUrl ?? occasion?.image ?? null;
  if (!imageUrl) {
    // Fall back to a bundled static asset when a known slug has one.
    // This benefits any consumer of the proxy (homepage carousel, all-occasions
    // page) without requiring a client-side change per consumer.
    const staticPath = occasion?.slug ? OCCASION_STATIC_IMAGES_PROXY[occasion.slug] : undefined;
    if (staticPath) {
      res.redirect(302, staticPath);
      return;
    }
    res.status(404).json({ error: "Occasion image not found" });
    return;
  }
  try {
    const result = await fetchAndTransformCatalogImage(imageUrl, apiKey, { width, format, quality });
    catalogCacheSet(cacheKey, { data: result.data, contentType: result.contentType, size: result.data.byteLength });
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Cache-Control", CATALOG_IMAGE_CACHE_CONTROL);
    res.setHeader("X-Cache", "MISS"); // i18n-ignore
    res.send(result.data);
  } catch (error) {
    req.log.warn({ err: error }, "catalog/occasion-image: delivery failed");
    // When OS provides a URL that isn't a real image asset (e.g. an SPA route
    // or a private upload path returning HTML), fall through to the static
    // fallback the same way we do when imagePublicUrl is absent entirely.
    const code = error instanceof ImageDeliveryError ? error.code : null;
    if (code === "invalid-url" || code === "non-image") {
      const staticPath = occasion?.slug ? OCCASION_STATIC_IMAGES_PROXY[occasion.slug] : undefined;
      if (staticPath) {
        res.redirect(302, staticPath);
        return;
      }
      res.status(404).json({ error: "Occasion image not found" });
      return;
    }
    res.status(error instanceof ImageDeliveryError ? error.status : 502).end();
  }
});

// ── Category image proxy ──────────────────────────────────────────────────────
//
// Category images are configured in Presentail OS. Proxy them through the API
// so private/public storage variants both work without exposing OS credentials
// to the browser.

router.get("/catalog/category-image/:id", async (req, res) => {
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
  const cacheKey = `category|${id}|${width}|${format}|${quality}`;

  const cached = catalogCacheGet(cacheKey);
  if (cached) {
    res.setHeader("Content-Type", cached.contentType);
    res.setHeader("Cache-Control", CATALOG_IMAGE_CACHE_CONTROL);
    res.setHeader("X-Cache", "HIT"); // i18n-ignore
    res.send(cached.data);
    return;
  }

  const category = getOsCategories()?.find((item) => String(item.id) === id);
  const imageUrl = category?.imagePublicUrl ?? category?.image ?? null;
  if (!imageUrl) {
    res.status(404).json({ error: "Category image not found" });
    return;
  }

  try {
    const result = await fetchAndTransformCatalogImage(imageUrl, apiKey, { width, format, quality });

    catalogCacheSet(cacheKey, {
      data: result.data,
      contentType: result.contentType,
      size: result.data.byteLength,
    });
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Cache-Control", CATALOG_IMAGE_CACHE_CONTROL);
    res.setHeader("X-Cache", "MISS"); // i18n-ignore
    res.send(result.data);
  } catch (error) {
    req.log.warn({ err: error }, "catalog/category-image: delivery failed");
    res.status(error instanceof ImageDeliveryError ? error.status : 502).end();
  }
});

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/currencies", (_req, res) => {
  res.setHeader("Cache-Control", PUBLIC_CATALOG_CACHE_CONTROL);
  const data = GetCurrenciesResponse.parse({
    currencies: CURRENCIES,
    fallbackCode: FALLBACK_CURRENCY_CODE,
    countryToCurrency: COUNTRY_TO_CURRENCY_MAP,
  });
  res.json(data);
});

router.get("/catalog/occasions", async (req, res) => {
  const countryCode = typeof req.query.countryCode === "string" ? req.query.countryCode : null;
  const citySlug = typeof req.query.city === "string" ? req.query.city : null;
  const lang = typeof req.query.lang === "string" ? req.query.lang.toLowerCase() : "en";
  // Translate occasion names server-side for ar/fr/el (same cache-backed layer
  // as /catalog/metadata) so the mega menu renders localized tiles.
  async function localizeNames<T extends { name: string }>(items: T[]): Promise<T[]> {
    if (lang !== "ar" && lang !== "fr" && lang !== "el") return items;
    const translated = await translateCategoryOccasionNames(
      items.map((i) => i.name),
      lang as CategoryOccasionLang,
    );
    return items.map((item, i) => ({ ...item, name: translated[i] ?? item.name }));
  }
  // When a city slug is present, use city-specific occasions so the best-selling
  // sort reflects that city's own sales signal. When only a countryCode is known,
  // use the primary city for that country (e.g. ae-dubai for AE) — for
  // single-city countries (LB, CY) this falls back to the global cache.
  // Falls back to the global cached occasions when any fetch fails or is empty.
  const osOccasions = citySlug
    ? await getOsOccasionsForCity(citySlug).catch(() => getOsOccasions())
    : countryCode
      ? await getOsOccasionsForCountry(countryCode).catch(() => getOsOccasions())
      : getOsOccasions();
  const occasionCountMap = countryCode
    ? getOsOccasionProductCountsByCountry(countryCode)
    : getOsOccasionProductCounts();
  // Show all active occasions (not just featured). The featured flag is
  // included in each item so the mega menu can filter client-side.
  // Merge both sources: product-tag-derived occasions (base) + dedicated OS
  // occasions catalog (overrides same slug), same pattern as /catalog/metadata.
  // This ensures occasions like valentines-day that are only tagged on products
  // (not yet added to the OS dedicated occasions catalog) still surface here.
  function isOccasionActive(occ: { isActive?: boolean; status?: string }): boolean {
    if (occ.isActive === false || occ.status === "inactive") return false;
    return true;
  }
  // Merge product-tag occasions (base) with dedicated catalog occasions
  // (catalog wins for duplicate slugs). This matches /catalog/metadata logic.
  const osProductOccasions = getOsProductOccasions();
  const allOsOccasionsMap = new Map<string, OSProductOccasion>(osProductOccasions);
  for (const osOcc of osOccasions ?? []) {
    allOsOccasionsMap.set(osOcc.slug, osOcc);
  }
  // The OS API omits INACTIVE occasions entirely (verified Aug 2026: no
  // endpoint or query param returns them, and returned rows carry no
  // is_active field). Presence in the OS occasions catalog is therefore the
  // only reliable "active" signal. Treat the global catalog list as an
  // allowlist so occasions deactivated in OS (e.g. children/colleague/friend)
  // can't leak back in via product tags. Fail open when the list is empty
  // (OS fetch failed) to avoid blanking the occasions page.
  const activeSlugAllowlist = new Set((getOsOccasions() ?? []).map((o) => o.slug));
  const activeOs = Array.from(allOsOccasionsMap.values()).filter(
    (o) =>
      isOccasionActive(o) &&
      (activeSlugAllowlist.size === 0 || activeSlugAllowlist.has(o.slug)),
  );
  if (activeOs.length === 0) {
    res.setHeader("Cache-Control", PUBLIC_CATALOG_CACHE_CONTROL);
    res.json({ occasions: [] });
    return;
  }
  // Prefer imagePublicUrl (public CDN) over image (private auth-gated URL).
  // The /catalog/occasion-image/:id proxy serves via imagePublicUrl, so the
  // condition here must check the same field or proxy hits return 404.
  const rawItems = activeOs.map((o) => ({ id: o.id, slug: o.slug, name: o.name, osImage: o.imagePublicUrl ?? o.image, featured: o.featured ?? false }));
  // Build a map of OS best-selling position from the merged occasion set.
  // Only OS-catalog occasions (those from getOsOccasions()) carry osPosition;
  // product-tag-only occasions have no rank and are excluded from the map.
  const osPositions = new Map<string, number>();
  for (const osOcc of osOccasions ?? []) {
    if (typeof osOcc.osPosition === "number") {
      osPositions.set(osOcc.slug, osOcc.osPosition);
    }
  }
  try {
    const [configRows, clickScores, osOccasionStats] = await Promise.all([
      getRankingConfig(),
      getCollectionClickScores("occasion", countryCode).catch(() => new Map<string, number>()),
      getOsOccasionStatsMap().catch(() => new Map<string, number>()),
    ]);
    const storeKey = catalogResolveStoreKey(countryCode);
    const osProducts = getOsProducts(storeKey) ?? [];
    const { items: rankedItems } = scoreCollections(rawItems, {
      kind: "occasion",
      countryCode,
      citySlug,
      configRows,
      osProducts,
      clickScores,
      osOccasionStats,
      defaultOrder: CATALOG_DEFAULT_OCCASION_ORDER,
      availabilityFloor: 3,
      osPositions,
    });
    const occasions = await localizeNames(
      rankedItems
        .map((item) => ({
          slug: item.slug,
          name: item.name,
          image: item.osImage ? `/api/catalog/occasion-image/${item.id}` : null,
          count: occasionCountMap.get(item.slug) ?? 0,
          featured: item.featured,
        }))
        .filter((item) => item.count > 0),
    );
    res.setHeader("Cache-Control", PUBLIC_CATALOG_CACHE_CONTROL);
    res.json({ occasions });
  } catch {
    // Fallback: use OS best-selling order (osPosition) when available,
    // otherwise preserve the merged-map iteration order.
    const fallbackSorted = [...activeOs].sort((a, b) => {
      const ap = typeof a.osPosition === "number" ? a.osPosition : Infinity;
      const bp = typeof b.osPosition === "number" ? b.osPosition : Infinity;
      return ap - bp;
    });
    const occasions = await localizeNames(
      fallbackSorted
        .map((o) => ({
          slug: o.slug,
          name: o.name,
          image: (o.imagePublicUrl ?? o.image) ? `/api/catalog/occasion-image/${o.id}` : null,
          count: occasionCountMap.get(o.slug) ?? 0,
          featured: o.featured ?? false,
        }))
        .filter((item) => item.count > 0),
    );
    res.setHeader("Cache-Control", PUBLIC_CATALOG_CACHE_CONTROL);
    res.json({ occasions });
  }
});

router.get("/catalog/metadata", async (req, res) => {
  const countryCode = typeof req.query.countryCode === "string" ? req.query.countryCode : null;
  const lang = typeof req.query.lang === "string" ? req.query.lang.toLowerCase() : "en";
  const osBrands = getOsBrands();
  const osOccasions = getOsOccasions();

  // Mirrors the brand-active convention so both boolean isActive and the
  // string status field are accepted.  Either isActive===false or
  // status==="inactive" marks an occasion as hidden.  This dual-field check
  // means a future OS API field rename is caught immediately by the unit tests
  // in catalog.occasions.test.ts rather than silently exposing all occasions.
  function isOccasionActive(occ: { isActive?: boolean; status?: string }): boolean {
    if (occ.isActive === false || occ.status === "inactive") return false;
    return true;
  }

  // Build a slug → OS occasion map (all statuses) so we can check whether a
  // hardcoded occasion's OS counterpart is inactive.
  const osOccasionBySlugAll = new Map(
    (osOccasions ?? []).map((o) => [o.slug, o]),
  );
  // Active-only map used for image overlays and OS-only appends.
  const osOccasionBySlug = new Map(
    (osOccasions ?? []).filter((o) => isOccasionActive(o)).map((o) => [o.slug, o]),
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
  // The OS API omits INACTIVE occasions entirely (no endpoint/param returns
  // them; rows carry no is_active field — verified Aug 2026). So "no OS
  // counterpart" cannot be treated as active: the occasion may exist in OS as
  // an inactive row we simply never see. When the OS catalog list is
  // non-empty, treat it as an allowlist; fail open when empty (fetch failed).
  const metadataAllowlist = new Set((osOccasions ?? []).map((o) => o.slug));
  let mergedOccasions = occasions
    .filter((occ) => {
      // Skip hardcoded occasions whose OS counterpart is marked inactive or
      // absent from the OS catalog allowlist.
      const osOccAll = osOccasionBySlugAll.get(occ.id);
      if (osOccAll !== undefined && !isOccasionActive(osOccAll)) return false;
      return metadataAllowlist.size === 0 || metadataAllowlist.has(occ.id);
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
    if (
      !hardcodedSlugs.has(osOcc.slug) &&
      isOccasionActive(osOcc) &&
      (metadataAllowlist.size === 0 || metadataAllowlist.has(osOcc.slug))
    ) {
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
    "balloon-arrangements": "balloon",
    "religious-gifts": "gift",
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
  const toOsCategoryImageRef = (
    category: { id: string; image?: string | null; imagePublicUrl?: string | null } | undefined,
  ) =>
    category?.imagePublicUrl || category?.image
      ? { uri: `/api/catalog/category-image/${encodeURIComponent(category.id)}` }
      : null;
  // Collect categories embedded in product data. Used as a fallback for
  // categories not yet listed in the OS /api/categories endpoint.
  const productEmbeddedCategories = getOsProductEmbeddedCategories();

  // When the OS cache is cold (null) fall back to the full hardcoded list so
  // the UI is never blank. Once the cache is warm, OS is the source of truth:
  // only categories normalized as featured === true are shown. Non-featured
  // categories are intentionally hidden even if they have products.
  let mergedCategories;
  if (osCategories === null) {
    mergedCategories = categories.map((c) => ({
      ...c,
      count: categoryCountMap.get(c.id) ?? 0,
    }));
  } else {
    // Split into active + featured (what we show) vs. all (used to block
    // product-embedded injection for categories OS knows about but chose not
    // to expose). Both flags must be explicitly true.
    const featuredOsCategories = osCategories.filter(
      (c) => c.is_active === true && c.is_featured === true,
    );
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
          image: toOsCategoryImageRef(osCat) ?? c.image,
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
        image: toOsCategoryImageRef(c),
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

  // Translate category and occasion names when the shopper is in AR or FR.
  // We always fetch English names from OS and translate server-side so the
  // client never needs to know about the translation layer.
  if (lang === "ar" || lang === "fr" || lang === "el") {
    const catLang = lang as CategoryOccasionLang;
    const [translatedCatNames, translatedOccNames] = await Promise.all([
      translateCategoryOccasionNames(mergedCategories.map((c) => c.name), catLang),
      translateCategoryOccasionNames(mergedOccasions.map((o) => o.name), catLang),
    ]);
    mergedCategories = mergedCategories.map((c, i) => ({
      ...c,
      name: translatedCatNames[i] ?? c.name,
    }));
    mergedOccasions = mergedOccasions.map((o, i) => ({
      ...o,
      name: translatedOccNames[i] ?? o.name,
    }));
  }

  const data = GetCatalogMetadataResponse.parse({
    categories: mergedCategories,
    occasions: mergedOccasions,
    brands,
  });
  res.setHeader("Cache-Control", PUBLIC_CATALOG_CACHE_CONTROL);
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
// priceAed, regularPriceUsd } for discounted products and products with an
// authoritative native AED regular price.
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
  const pricing: Record<string, {
    discountPriceUsd: number | null;
    discountPriceAed: number | null;
    discountPriceAedExact?: string | null;
    priceAed: number | null;
    priceAedExact?: string | null;
    regularPriceUsd: number | null;
  }> = {};
  for (const [id, entry] of pricingMap) {
    pricing[id] = {
      discountPriceUsd: entry.discountPriceUsd,
      discountPriceAed: entry.discountPriceAed,
      priceAed: entry.priceAed ?? null,
      regularPriceUsd: entry.regularPriceUsd,
      ...(entry.priceAedExact !== undefined
        ? { priceAedExact: entry.priceAedExact }
        : {}),
      ...(entry.discountPriceAedExact !== undefined
        ? { discountPriceAedExact: entry.discountPriceAedExact }
        : {}),
    };
  }
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json({ ok: true, pricing });
});

// Public endpoint: returns a map of osProductId → "indoor" | "outdoor" for all
// classified plant products. Unclassified products are omitted (frontend treats
// missing = indoor pending). No auth required — purely informational.
router.get("/catalog/plant-classifications", async (_req, res) => {
  try {
    const rows = await db.select().from(plantEnvironmentCacheTable);
    const classifications: Record<string, "indoor" | "outdoor"> = {};
    for (const row of rows) {
      classifications[row.osProductId] = row.classification as "indoor" | "outdoor";
    }
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json({ ok: true, classifications });
  } catch (err) {
    logger.error({ err }, "catalog/plant-classifications: DB query failed");
    res.status(500).json({ ok: false, message: "Failed to fetch plant classifications" }); // i18n-ignore
  }
});

export default router;
