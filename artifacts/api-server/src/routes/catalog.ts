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
import { getOsBrands, getOsOccasions, getOsProducts } from "../lib/osProductsCache";

const router: IRouter = Router();

const STORE_KEYS = ["lebanon", "dubai", "abudhabi", "cyprus"] as const;

// Rewrite an OS storage URL to our proxy path so the browser never has to
// supply the API key itself.
// Only rewrites the known public-objects/catalog_brands/ prefix; any other
// URL is returned as-is (or null if blank).
const OS_BRAND_IMAGE_PREFIX =
  "https://os.presentail.com/api/storage/public-objects/catalog_brands/";

function toBrandImageProxyUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith(OS_BRAND_IMAGE_PREFIX)) {
    const filename = url.slice(OS_BRAND_IMAGE_PREFIX.length);
    // Guard against path traversal — filename must be safe (no slashes, dots only for extension)
    if (/^[a-zA-Z0-9_-]+\.[a-zA-Z]{2,5}$/.test(filename)) {
      return `/api/catalog/brand-image/${filename}`;
    }
  }
  return url;
}

// Proxy brand images from OS storage — adds the API key that the browser
// cannot supply. Filename is restricted to a safe pattern.
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
        .map((o) => ({ slug: o.slug, name: o.name, image: o.image ?? null }))
    : [];
  res.json({ occasions: featured });
});

router.get("/catalog/metadata", (_req, res) => {
  const osBrands = getOsBrands();

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
    occasions,
    brands,
  });
  res.json(data);
});

export default router;
