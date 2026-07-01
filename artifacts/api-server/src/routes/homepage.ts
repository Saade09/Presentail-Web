import { Router, type IRouter } from "express";
import {
  GetHomepageBannersQueryParams,
  GetHomepageBannersResponse,
  GetHomepageCategoriesResponse,
  GetHomepageOccasionsResponse,
} from "@workspace/api-zod";
import type { HomepageCollectionItem } from "@workspace/api-zod";

import {
  hasOsProducts,
  getOsProducts,
  getOsCategories,
  getOsOccasions,
  registerOsProductsRefreshListener,
} from "../lib/osProductsCache";
import { categories as staticCategories } from "@workspace/catalog-data";
import { resolveStoreFromRequest } from "../lib/wooStore";

const router: IRouter = Router();

// Returns the active hero banner carousel sourced directly from Presentail OS.
// OS handles all filtering (active status, schedule window, country/city
// targeting, device) server-side. On any fetch error the route returns an
// empty array so the homepage renders without crashing.
// Countries to fan-out to when a visitor has no country selected.
// OS requires countryCode on the storefront/homepage-banners endpoint;
// querying all three and merging gives no-country visitors the same set
// of banners a country-selected visitor would see.
const BANNER_FANOUT_COUNTRIES = ["LB", "AE", "CY"] as const;

router.get("/homepage/banners", async (req, res) => {
  const { countryCode, cityId, device } = GetHomepageBannersQueryParams.parse(req.query);
  const osBase = process.env.PRESENTAIL_OS_API_URL ?? "https://os.presentail.com";
  const apiKey = process.env.PRESENTAIL_OS_API_KEY ?? "";
  const workspace = process.env.PRESENTAIL_OS_WORKSPACE ?? "presentail";

  // Build a URLSearchParams for a single country request.
  // cityId is intentionally omitted: OS treats it as a strict filter and
  // returns no results even for banners with city_ids=[] (global for country).
  // Banners are country-level content; city-level targeting is not supported.
  function makeQs(cc: string): URLSearchParams {
    const qs = new URLSearchParams();
    qs.set("workspace", workspace);
    qs.set("apiKey", apiKey);
    qs.set("countryCode", cc);
    qs.set("device", device);
    return qs;
  }

  async function fetchForCountry(cc: string): Promise<unknown[]> {
    const r = await fetch(`${osBase}/api/storefront/homepage-banners?${makeQs(cc).toString()}`, {
      headers: {
        "x-api-key": apiKey,
        Accept: "application/json",
        "User-Agent": "PresentailApp/1.0",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      req.log.warn(
        { status: r.status, countryCode: cc, osError: body.slice(0, 200) },
        "homepage/banners: OS returned non-ok",
      );
      return [];
    }
    const json = (await r.json()) as { banners?: unknown[] };
    return Array.isArray(json.banners) ? json.banners : Array.isArray(json) ? json : [];
  }

  type NormBanner = {
    id: string;
    title: string | undefined;
    subtitle: string | undefined;
    headline: string | undefined;
    ctaText: string | undefined;
    mediaType: "image" | "video";
    mediaUrl: string;
    fallbackImageUrl: string | undefined;
    linkUrl: string | null;
    linkKind: "category" | "occasion" | null;
    linkSlug: string | null;
    linkName: string | null;
    sortOrder: number;
    priority: number | undefined;
  };

  function normaliseBanners(rawList: unknown[]): NormBanner[] {
    return rawList
      .map((item: unknown): NormBanner => {
        const b = item as Record<string, unknown>;
        const rawMediaUrl = (b.media_url ?? b.mediaUrl ?? "") as string;
        const mediaUrl = rawMediaUrl.startsWith("/") ? `${osBase}${rawMediaUrl}` : rawMediaUrl;
        const rawFallback = (b.fallback_image_url ?? b.fallbackImageUrl ?? "") as string;
        const fallbackImageUrl = rawFallback
          ? rawFallback.startsWith("/") ? `${osBase}${rawFallback}` : rawFallback
          : undefined;
        const rawLinkKind = b.link_kind ?? b.linkKind;
        const linkKind =
          rawLinkKind === "category" || rawLinkKind === "occasion" ? rawLinkKind : null;
        const rawLinkSlug = b.link_slug ?? b.linkSlug;
        const linkSlug = rawLinkSlug ? String(rawLinkSlug) : null;
        const rawLinkName = b.link_name ?? b.linkName;
        const linkName = rawLinkName ? String(rawLinkName) : null;
        const hasStructured = linkKind !== null && linkSlug !== null;
        const rawLinkUrl = b.link_url ?? b.linkUrl;
        const linkUrl = hasStructured ? null : rawLinkUrl ? String(rawLinkUrl) : null;
        return {
          id: String(b.id ?? ""),
          title: b.title ? String(b.title) : undefined,
          subtitle: b.subtitle ? String(b.subtitle) : undefined,
          headline: b.headline ? String(b.headline) : undefined,
          ctaText: b.cta_text ? String(b.cta_text) : b.ctaText ? String(b.ctaText) : undefined,
          mediaType: (b.media_type ?? b.mediaType ?? "image") as "image" | "video",
          mediaUrl,
          fallbackImageUrl,
          linkUrl,
          linkKind,
          linkSlug,
          linkName,
          sortOrder: Number(b.sort_order ?? b.sortOrder ?? 0),
          priority: b.priority != null ? Number(b.priority) : undefined,
        };
      })
      .filter((b) => b.id && b.mediaUrl)
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return (a.priority ?? 0) - (b.priority ?? 0);
      });
  }

  try {
    let rawList: unknown[];

    if (countryCode && countryCode !== "*") {
      // Country selected: single targeted request.
      rawList = await fetchForCountry(countryCode);
    } else {
      // No country selected: fan out to all supported countries and merge,
      // deduplicating by banner id so a banner targeted to multiple countries
      // only appears once.
      const results = await Promise.all(
        BANNER_FANOUT_COUNTRIES.map((cc) => fetchForCountry(cc)),
      );
      const seen = new Set<string>();
      rawList = [];
      for (const list of results) {
        for (const item of list) {
          const id = String((item as Record<string, unknown>).id ?? "");
          if (id && !seen.has(id)) {
            seen.add(id);
            rawList.push(item);
          }
        }
      }
    }

    const banners = normaliseBanners(rawList);
    return res.json(GetHomepageBannersResponse.parse({ banners }));
  } catch (err: unknown) {
    req.log.warn({ err: (err as Error)?.message }, "homepage/banners: OS fetch failed");
    return res.json(GetHomepageBannersResponse.parse({ banners: [] }));
  }
});

// In-memory best-sellers cache TTL (matches the collection pattern).
const COLLECTION_TTL_MS = 5 * 60 * 1000;

// Ordering reference for occasions carousel. Slugs not present in OS are
// silently skipped; any OS occasions missing from this list are appended
// at the end so newly-curated occasions always appear.
const DEFAULT_OCCASION_SLUGS = [
  "birthday",
  "love-romance",
  "thank-you",
  "get-well-soon",
  "anniversary",
  "congratulations",
  "graduation",
  "funeral",
  "newborn",
  "im-sorry",
  "wedding",
];

// Categories that must never surface in homepage rails or all-categories
// view, even when curated under a WC parent. Mirrors the server-side
// product filter in `routes/woo.ts` so the category disappears without
// requiring a WooCommerce-side curation change.
const HIDDEN_CATEGORY_SLUGS = new Set(["board-games", "coffee"]);

const PRODUCT_TYPE_SLUGS = new Set([
  "hand-bouquets", "flower-boxes", "flower-vases", "flower-baskets",
  "flowers", "plants", "balloons", "cakes", "chocolate", "bundles",
  "stuffed-animals", "preserved-flowers", "dried-flowers",
  "lux-arrangements", "orchids", "roses", "roses-lebanon",
  "arabic-sweets", "personal-gifts", "beauty",
  "gift-bundles", "baskets", "spirits", "gaming",
  "summer",
]);

// ── Presentail OS-backed collection builders ─────────────────────────────
//
// When the OS products cache is populated these functions build the homepage
// categories / occasions carousel from OS data rather than WooCommerce. This
// eliminates the WC network round-trips for every homepage load and makes the
// navigation data consistent with the OS-sourced product listings.

function buildOsCategories(): HomepageCollectionItem[] | null {
  const osCategories = getOsCategories();
  if (osCategories && osCategories.length > 0) {
    return osCategories
      .filter((c) => c.is_featured === true && !HIDDEN_CATEGORY_SLUGS.has(c.slug))
      .map((c, i) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        // Only emit the proxy URL when a public CDN image is available.
        // The private c.image field returns the OS web-app HTML shell when
        // fetched without an auth token, so the proxy 404s and the mobile
        // falls through to the static asset anyway. Skip it to avoid the
        // unnecessary round-trip. Client handles empty imageUrl gracefully.
        imageUrl: c.imagePublicUrl ? `/api/catalog/category-image/${c.id}` : "",
        sortOrder: i,
        isActive: true,
      }));
  }
  // Fall back to static catalog-data categories (same source as /catalog/metadata)
  // so the homepage carousel is never empty even before the OS cache warms up.
  return staticCategories
    .filter((c) => PRODUCT_TYPE_SLUGS.has(c.id) && !HIDDEN_CATEGORY_SLUGS.has(c.id))
    .map((c, i) => ({
      id: c.id,
      name: c.name,
      slug: c.id,
      imageUrl: "image" in c && c.image && "uri" in c.image ? c.image.uri : "",
      sortOrder: i,
      isActive: true,
    }));
}

function buildOsOccasions(): HomepageCollectionItem[] | null {
  const osOccasions = getOsOccasions();
  if (!osOccasions || osOccasions.length === 0) return null;
  // Only surface occasions that OS has flagged as featured.
  const featured = osOccasions.filter((o) => o.featured === true);
  if (featured.length === 0) return null;
  // Preserve DEFAULT_OCCASION_SLUGS ordering for known occasions;
  // append any featured occasions not in the list at the end.
  const bySlug = new Map(featured.map((o) => [o.slug, o]));
  const result: HomepageCollectionItem[] = [];
  for (const slug of DEFAULT_OCCASION_SLUGS) {
    const o = bySlug.get(slug);
    if (!o) continue;
    result.push({
      id: o.id,
      name: o.name,
      slug: o.slug,
      imageUrl: o.image || o.imagePublicUrl ? `/api/catalog/occasion-image/${o.id}` : "",
      sortOrder: result.length,
      isActive: true,
    });
  }
  // Append featured occasions not already added via DEFAULT_OCCASION_SLUGS.
  for (const o of featured) {
    if (!DEFAULT_OCCASION_SLUGS.includes(o.slug)) {
      result.push({
        id: o.id,
        name: o.name,
        slug: o.slug,
        imageUrl: o.image || o.imagePublicUrl ? `/api/catalog/occasion-image/${o.id}` : "",
        sortOrder: result.length,
        isActive: true,
      });
    }
  }
  return result.length > 0 ? result : null;
}

router.get("/homepage/categories", (_req, res) => {
  const items = buildOsCategories() ?? [];
  const data = GetHomepageCategoriesResponse.parse({ items });
  return res.json(data);
});

router.get("/homepage/occasions", (_req, res) => {
  const items = buildOsOccasions() ?? [];
  const data = GetHomepageOccasionsResponse.parse({ items });
  return res.json(data);
});

const BEST_SELLERS_LIMIT = 12;

// ── Best-sellers cache ────────────────────────────────────────────────────
//
// The filter+sort+map over the full OS product array is cheap but
// proportional to catalog size. A short-TTL in-memory cache (matching the
// `COLLECTION_TTL_MS` pattern used by `collectionCache` above) keeps the
// endpoint O(1) under traffic spikes. The cache is also cleared immediately
// whenever the OS product cache is refreshed so rankings never lag behind
// a real catalog change by more than one polling interval.
//
// Cache key: `${storeKey}::${countryCode ?? ""}::${cityId ?? ""}`
// The currencySymbol is part of the formatted price stored in the cache, so
// it must be encoded in the key as well.

type BestSellersEntry = {
  fetchedAt: number;
  body: { ok: boolean; products: unknown[] };
};

const bestSellersCache = new Map<string, BestSellersEntry>();

// Invalidate the entire best-sellers cache on every OS products refresh so
// the ranking stays aligned with updated totalSales / inStock / price data.
registerOsProductsRefreshListener(() => {
  bestSellersCache.clear();
});

router.get("/homepage/best-sellers", (req, res) => {
  const store = resolveStoreFromRequest(req);

  if (!hasOsProducts(store.storeKey)) {
    return res.json({ ok: true, products: [] });
  }

  const countryCode =
    typeof req.query.countryCode === "string" ? req.query.countryCode.toUpperCase() : null;
  const cityId = typeof req.query.cityId === "string" ? req.query.cityId || null : null;
  const currencySymbol = store.currencySymbol ?? "$";

  const cacheKey = `${store.storeKey}::${countryCode ?? ""}::${cityId ?? ""}::${currencySymbol}`;
  const now = Date.now();
  const cached = bestSellersCache.get(cacheKey);
  if (cached && now - cached.fetchedAt < COLLECTION_TTL_MS) {
    return res.json(cached.body);
  }

  const osProducts = getOsProducts(store.storeKey)!;

  const filtered = osProducts
    .filter((p) => p.inStock)
    .filter((p) => {
      if (countryCode && p.deliverableCountries && p.deliverableCountries.length > 0) {
        if (!p.deliverableCountries.some((c) => c.toUpperCase() === countryCode)) return false;
      }
      if (cityId && p.deliverableCities && p.deliverableCities.length > 0) {
        if (!p.deliverableCities.some((c) => c === cityId)) return false;
      }
      return true;
    })
    .sort((a, b) => (b.totalSales ?? 0) - (a.totalSales ?? 0))
    .slice(0, BEST_SELLERS_LIMIT);

  const products = filtered.map((p) => {
    const price = p.price;
    const imageList = p.images
      .map((img) => ({ uri: img.url }))
      .filter((img) => img.uri.length > 0);
    const image = imageList[0] ?? null;
    const formattedPrice =
      currencySymbol.length > 1
        ? `${price.toLocaleString()} ${currencySymbol}`
        : `${currencySymbol}${price.toLocaleString()}`;
    return {
      id: p.id,
      name: p.name.replace(/&#8211;/g, "–").replace(/&amp;/g, "&").replace(/&#8217;/g, "'"),
      price: formattedPrice,
      priceValue: price,
      image,
      images: imageList,
      inStock: p.inStock,
      popularity: p.totalSales ?? 0,
    };
  });

  const body = { ok: true, products };
  bestSellersCache.set(cacheKey, { fetchedAt: now, body });
  return res.json(body);
});

// Return the current homepage Categories + Occasions from the OS cache.
// Used by the scheduled wooSync tick to obtain the latest collection
// snapshot for change detection (data_refresh push). Both collections
// are synchronous OS reads — no WC calls are made.
export function refreshHomepageCollectionsForStore(): {
  categories: HomepageCollectionItem[];
  occasions: HomepageCollectionItem[];
} {
  const categories = buildOsCategories() ?? [];
  const occasions = buildOsOccasions() ?? [];
  return { categories, occasions };
}

export default router;
