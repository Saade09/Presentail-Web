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
import { getOsBrands, getOsCategories, getOsOccasions, getOsProducts } from "../lib/osProductsCache";

const router: IRouter = Router();

const STORE_KEYS = ["lebanon", "dubai", "abudhabi", "cyprus"] as const;

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

  // Merge OS images into hardcoded occasions. The hardcoded list provides icons,
  // descriptions, and stable slugs; OS provides real photos. When OS has an image
  // for a slug, replace the bundled asset reference with a proxy URI so the browser
  // never needs to supply the API key.
  const mergedOccasions = occasions.map((occ) => {
    const osOcc = osOccasionBySlug.get(occ.id); // hardcoded id === slug
    if (osOcc?.image) {
      return {
        ...occ,
        image: { uri: `/api/catalog/occasion-image/${osOcc.id}` },
      };
    }
    return occ;
  });

  // Compute per-brand in-stock product count across all stores,
  // deduplicating by product id so a product deliverable to multiple
  // regions is only counted once.
  const brandCountMap = new Map<string, number>();
  const seenProductIds = new Set<string>();
  for (const key of STORE_KEYS) {
    const products = getOsProducts(key) ?? [];
    for (const p of products) {
      if (!p.inStock || seenProductIds.has(p.id)) continue;
      seenProductIds.add(p.id);
      for (const b of p.brands ?? []) {
        brandCountMap.set(b.slug, (brandCountMap.get(b.slug) ?? 0) + 1);
      }
    }
  }

  const brands = osBrands
    ? osBrands.map((b) => ({
        name: b.name,
        slug: b.slug,
        image: toBrandImageProxyUrl(b.image),
        count: brandCountMap.get(b.slug) ?? 0,
      }))
    : [];

  const data = GetCatalogMetadataResponse.parse({
    categories,
    occasions: mergedOccasions,
    brands,
  });
  res.json(data);
});

export default router;
