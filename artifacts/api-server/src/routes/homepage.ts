import { Router, type IRouter } from "express";
import {
  GetHomepageBannersQueryParams,
  GetHomepageBannersResponse,
  GetHomepageCategoriesResponse,
  GetHomepageOccasionsResponse,
} from "@workspace/api-zod";
import type { HomepageCollectionItem } from "@workspace/api-zod";
import { getActiveBanners } from "../data/homepageBanners";
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

// Returns the active hero banner carousel for the supplied country.
// Filtering by isActive, the optional startsAt/endsAt window, and country
// code (with "*" matching every country) plus sortOrder ordering all happen
// here so clients can render the response verbatim.
router.get("/homepage/banners", (req, res) => {
  const { countryCode } = GetHomepageBannersQueryParams.parse(req.query);
  const code = (countryCode ?? "*").toUpperCase();
  const now = Date.now();

  const banners = getActiveBanners().filter((b) => {
    if (!b.isActive) return false;
    if (b.countryCode !== "*" && b.countryCode.toUpperCase() !== code) return false;
    if (b.startsAt && new Date(b.startsAt).getTime() > now) return false;
    if (b.endsAt && new Date(b.endsAt).getTime() < now) return false;
    return true;
  }).sort((a, b) => a.sortOrder - b.sortOrder);

  const data = GetHomepageBannersResponse.parse({ banners });
  res.json(data);
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
const HIDDEN_CATEGORY_SLUGS = new Set(["electronics", "board-games", "coffee"]);

const PRODUCT_TYPE_SLUGS = new Set([
  "hand-bouquets", "flower-boxes", "flower-vases", "flower-baskets",
  "flowers", "plants", "balloons", "cakes", "chocolate", "bundles",
  "stuffed-animals", "preserved-flowers", "dried-flowers",
  "lux-arrangements", "orchids", "roses", "roses-lebanon",
  "arabic-sweets", "personal-gifts", "beauty",
  "gift-bundles", "baskets", "spirits", "gaming",
  "summer-collection",
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
      .filter((c) => PRODUCT_TYPE_SLUGS.has(c.slug) && !HIDDEN_CATEGORY_SLUGS.has(c.slug))
      .map((c, i) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        imageUrl: "",
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
  // Preserve DEFAULT_OCCASION_SLUGS ordering and filter to known occasions.
  const bySlug = new Map(osOccasions.map((o) => [o.slug, o]));
  const result: HomepageCollectionItem[] = [];
  for (const slug of DEFAULT_OCCASION_SLUGS) {
    const o = bySlug.get(slug);
    if (!o) continue;
    result.push({
      id: o.id,
      name: o.name,
      slug: o.slug,
      imageUrl: "",
      sortOrder: result.length,
      isActive: true,
    });
  }
  // Append any OS occasions not in DEFAULT_OCCASION_SLUGS.
  for (const o of osOccasions) {
    if (bySlug.has(o.slug) && !DEFAULT_OCCASION_SLUGS.includes(o.slug)) {
      result.push({
        id: o.id,
        name: o.name,
        slug: o.slug,
        imageUrl: "",
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
