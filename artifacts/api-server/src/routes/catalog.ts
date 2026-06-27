import { Router, type IRouter } from "express";
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
import { getOsBrandProductCounts, getOsBrands, getOsCategories, getOsCategoryProductCounts, getOsOccasionProductCounts, getOsOccasions } from "../lib/osProductsCache";

const router: IRouter = Router();

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
  const upstream = `${OS_BRAND_IMAGE_PREFIX}${filename}`;
  try {
    const upstream_res = await fetch(upstream, {
      headers: { "x-api-key": apiKey },
    });
    if (!upstream_res.ok) {
      res.status(upstream_res.status).json({ error: "Upstream error" });
      return;
    }
    const contentType = upstream_res.headers.get("content-type") ?? "image/webp";
    const buf = await upstream_res.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.send(Buffer.from(buf));
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
    const buf = await upstream_res.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.send(Buffer.from(buf));
  } catch {
    res.status(502).json({ error: "Failed to fetch occasion image" });
  }
});

// ── Category image proxy ──────────────────────────────────────────────────────
//
// Mirrors the occasion-image proxy. OS category images may be auth-gated;
// the browser cannot supply the API key, so we proxy through here.

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
  const osCategories = getOsCategories();
  const category = osCategories?.find((c) => c.id === id);
  // Prefer the public-objects URL; only fall back to the private path when no
  // public URL is available (the private path may return the OS web-app shell).
  const imageUrl = category?.imagePublicUrl ?? category?.image ?? null;
  if (!imageUrl) {
    res.status(404).json({ error: "Category image not found" });
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
    if (!contentType.startsWith("image/")) {
      res.status(404).json({ error: "Category image not accessible" });
      return;
    }
    const buf = await upstream_res.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.send(Buffer.from(buf));
  } catch {
    res.status(502).json({ error: "Failed to fetch category image" });
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

router.get("/catalog/occasions", (_req, res) => {
  const osOccasions = getOsOccasions();
  const featured = osOccasions
    ? osOccasions
        .filter((o) => o.featured === true)
        .map((o) => ({
          slug: o.slug,
          name: o.name,
          // Route through our proxy so the browser never needs the OS API key.
          image: o.image ? `/api/catalog/occasion-image/${o.id}` : null,
        }))
    : [];
  res.json({ occasions: featured });
});

router.get("/catalog/metadata", (_req, res) => {
  const osBrands = getOsBrands();
  const osOccasions = getOsOccasions();

  // Build a slug → OS occasion map so we can overlay images onto hardcoded occasions.
  const osOccasionBySlug = new Map(
    (osOccasions ?? []).map((o) => [o.slug, o]),
  );

  // Use the pre-computed per-brand / per-category / per-occasion in-stock
  // product counts from the cache. The cache layer recomputes counts after
  // every OS refresh cycle, so this is always consistent with the current
  // store caches without re-iterating over all products on every request.
  const brandCountMap = getOsBrandProductCounts();
  const categoryCountMap = getOsCategoryProductCounts();
  const occasionCountMap = getOsOccasionProductCounts();

  // Merge OS images into hardcoded occasions. The hardcoded list provides icons,
  // descriptions, and stable slugs; OS provides real photos. When OS has an image
  // for a slug, replace the bundled asset reference with a proxy URI so the browser
  // never needs to supply the API key. `count` is the number of in-stock products
  // tagged with this occasion across all stores — consumers (e.g. the sitemap)
  // use it to skip empty pages.
  const mergedOccasions = occasions.map((occ) => {
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

  const brands = osBrands
    ? osBrands.map((b) => ({
        name: b.name,
        slug: b.slug,
        image: toBrandImageProxyUrl(b.image),
        count: brandCountMap.get(b.slug) ?? 0,
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
  };
  const osCategories = getOsCategories();
  // When the OS cache is cold (null) fall back to the full hardcoded list so
  // the UI is never blank. Once the cache is warm, treat OS as the source of
  // truth: only show hardcoded categories whose slug appears in OS, and still
  // append any OS-only extras (e.g. dried-flowers, beauty) that have no
  // hardcoded entry.
  let mergedCategories;
  if (osCategories === null) {
    mergedCategories = categories.map((c) => ({
      ...c,
      count: categoryCountMap.get(c.id) ?? 0,
    }));
  } else {
    const osCategorySlugs = new Set(osCategories.map((c) => c.slug));
    const osCategoryBySlug = new Map(osCategories.map((c) => [c.slug, c]));
    const filteredHardcoded = categories.filter((c) => osCategorySlugs.has(c.id)).map((c) => ({
      ...c,
      description: osCategoryBySlug.get(c.id)?.description ?? null,
      count: categoryCountMap.get(c.id) ?? 0,
    }));
    const filteredSlugs = new Set(filteredHardcoded.map((c) => c.id));
    const extraOsCategories = osCategories
      .filter((c) => !filteredSlugs.has(c.slug))
      .map((c) => ({
        id: c.slug,
        name: c.name,
        icon: OS_CATEGORY_ICONS[c.slug] ?? "tag",
        image: null,
        description: c.description ?? null,
        count: categoryCountMap.get(c.slug) ?? 0,
      }));
    mergedCategories = [...filteredHardcoded, ...extraOsCategories];
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
  const allowlistStr = raw === undefined ? "presentail-flowers--gifts" : raw;
  const slugs = allowlistStr.trim()
    ? allowlistStr.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  res.json({ ok: true, slugs });
});

export default router;
