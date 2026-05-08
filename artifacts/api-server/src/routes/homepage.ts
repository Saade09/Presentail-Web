import type { Request } from "express";
import { Router, type IRouter } from "express";
import {
  GetHomepageBannersQueryParams,
  GetHomepageBannersResponse,
  GetHomepageCategoriesResponse,
  GetHomepageOccasionsResponse,
} from "@workspace/api-zod";
import type { HomepageCollectionItem } from "@workspace/api-zod";
import { getActiveBanners } from "../data/homepageBanners";

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

// --- Categories & Occasions carousels ---------------------------------------
//
// Both rows are sourced from WooCommerce product categories. Curation is
// expressed as a parent-category convention in WP admin: children of the
// `home-categories` parent populate the Categories row, and children of the
// `home-occasions` parent populate the Occasions row. PMs can rename, reorder
// (via WC's drag-to-reorder / `menu_order`), change images or hide entries
// from the WP admin without a redeploy. If the parent category is missing or
// WooCommerce is unavailable we fall back to a hand-rolled default set so the
// homepage never breaks.

import { resolveStoreFromRequest, wooAuthHeader } from "../lib/wooStore";

type WcCategoryRaw = {
  id: number;
  name: string;
  slug: string;
  parent: number;
  menu_order?: number;
  count?: number;
  display?: string;
  image?: { src?: string } | null;
};

import { resolveStore, type WooStoreConfig } from "../lib/wooStore";
import { logger } from "../lib/logger";

async function wooGet<T>(path: string, store?: WooStoreConfig): Promise<T> {
  const s = store ?? resolveStore();
  const r = await fetch(`${s.baseUrl}${path}`, {
    headers: {
      Authorization: wooAuthHeader(s),
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "PresentailApp/1.0",
    },
  });
  if (!r.ok) throw new Error(`WC ${path} -> ${r.status}`);
  return (await r.json()) as T;
}

// Probe a single WC category to confirm it actually contains at least one
// buyable product (published, in stock, and catalog-visible). This is
// stricter than the bare `count` field on the category response, which
// also includes drafts, hidden, and out-of-stock products and so leaves
// empty rails like "Gift Cards" / "Coffee" visible. Returns:
//  - true  : at least one buyable product exists
//  - false : confirmed empty
//  - null  : probe failed (caller should fall back to today's behavior so
//            a single transient WC error doesn't drop a real category)
async function categoryHasBuyableProduct(
  store: WooStoreConfig,
  categoryId: number,
  log: { warn: (obj: unknown, msg?: string) => void },
): Promise<boolean | null> {
  // WC REST does not expose a documented server-side `catalog_visibility`
  // filter, so we pull pages of in-stock published products and check the
  // field client-side. We paginate (bounded) so a category whose first
  // few rows happen to be `hidden` / `search`-only isn't mis-classified
  // as empty when later rows are buyable. `_fields` keeps each row tiny.
  const PER_PAGE = 50;
  const MAX_PAGES = 3; // up to 150 in-stock published rows scanned
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const products = await wooGet<Array<{ id: number; catalog_visibility?: string }>>(
        `/products?category=${categoryId}&per_page=${PER_PAGE}&page=${page}&status=publish&stock_status=instock&_fields=id,catalog_visibility`,
        store,
      );
      if (products.length === 0) return false;
      const hit = products.some((p) => {
        const v = p.catalog_visibility;
        // Default WC visibility is "visible" — when the field is absent
        // (older WC versions or `_fields` stripping), treat as buyable.
        return !v || v === "visible" || v === "catalog";
      });
      if (hit) return true;
      if (products.length < PER_PAGE) return false;
    }
    // Scanned the full bounded window and found only hidden/search rows.
    return false;
  } catch (err) {
    log.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        categoryId,
      },
      "categoryHasBuyableProduct: probe failed; falling back to count",
    );
    return null;
  }
}

// Filter a list of WC category rows down to those that have at least one
// buyable product. Probes run in parallel. On a per-category probe error
// we fall back to the existing `count > 0` check for that one category
// rather than dropping it from the rail.
async function filterBuyableCategories(
  cats: WcCategoryRaw[],
  store: WooStoreConfig,
  log: { warn: (obj: unknown, msg?: string) => void },
): Promise<WcCategoryRaw[]> {
  const checks = await Promise.all(
    cats.map((c) => categoryHasBuyableProduct(store, c.id, log)),
  );
  return cats.filter((c, i) => {
    const ok = checks[i];
    if (ok === null) return (c.count ?? 0) > 0;
    return ok;
  });
}

// In-memory cache (consistent with the short-TTL pattern used in woo.ts).
const COLLECTION_TTL_MS = 5 * 60 * 1000;
const collectionCache = new Map<
  string,
  { fetchedAt: number; items: HomepageCollectionItem[] }
>();

// Hand-rolled defaults used when the WC `home-categories` /
// `home-occasions` parent category is not yet configured (or WC creds
// are unset). Slugs match the categories already wired into
// `/api/woo/category-products` and `/api/woo/occasion-products`, so
// links continue to land on a populated listing page. These are
// intentionally NOT used on a WC network/HTTP failure — that path
// returns an empty array so the homepage hides the section rather
// than risking stale curation.
const DEFAULT_OCCASION_SLUGS = [
  "birthday", "anniversary", "love-romance", "congratulations", "thank-you", "newborn",
];

const PRODUCT_TYPE_SLUGS = new Set([
  "hand-bouquets", "flower-boxes", "flower-vases", "flower-baskets",
  "flowers", "plants", "balloons", "cakes", "chocolate", "bundles",
  "stuffed-animals", "electronics", "preserved-flowers", "dried-flowers",
  "lux-arrangements", "orchids", "roses", "roses-lebanon",
  "arabic-sweets", "board-games", "personal-gifts", "beauty",
  "gift-bundles", "baskets", "spirits", "gaming",
  "summer-collection",
]);

async function fetchTopLevelCategories(store: WooStoreConfig): Promise<HomepageCollectionItem[]> {
  if (!store.consumerKey) return [];
  const cats = await wooGet<WcCategoryRaw[]>(
    "/products/categories?parent=0&per_page=100&order=asc",
    store,
  );
  const candidates = cats.filter(
    (c) => (c.count ?? 0) > 0 && c.display !== "hidden" && c.slug !== "uncategorized" && PRODUCT_TYPE_SLUGS.has(c.slug),
  );
  const buyable = await filterBuyableCategories(candidates, store, logger);
  return buyable
    .map((c, i) => ({
      id: String(c.id),
      name: c.name,
      slug: c.slug,
      imageUrl: c.image?.src ?? "",
      sortOrder: typeof c.menu_order === "number" ? c.menu_order : i,
      isActive: true,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

async function fetchOccasionCategories(store: WooStoreConfig): Promise<HomepageCollectionItem[]> {
  if (!store.consumerKey) return [];
  // Resolve each slug in parallel, then filter by the buyable-product
  // probe so empty occasions don't appear on the rail.
  const resolved = await Promise.all(
    DEFAULT_OCCASION_SLUGS.map(async (slug, i) => {
      try {
        const cats = await wooGet<WcCategoryRaw[]>(
          `/products/categories?slug=${encodeURIComponent(slug)}&per_page=1`,
          store,
        );
        if (!cats.length || (cats[0].count ?? 0) === 0) return null;
        return { raw: cats[0], sortOrder: i };
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err), slug },
          "fetchOccasionCategories: slug fetch failed",
        );
        return null;
      }
    }),
  );
  const candidates = resolved.filter((r): r is { raw: WcCategoryRaw; sortOrder: number } => r !== null);
  const checks = await Promise.all(
    candidates.map((c) => categoryHasBuyableProduct(store, c.raw.id, logger)),
  );
  return candidates
    .filter((c, idx) => {
      const ok = checks[idx];
      if (ok === null) return (c.raw.count ?? 0) > 0;
      return ok;
    })
    .map((c) => ({
      id: String(c.raw.id),
      name: c.raw.name,
      slug: c.raw.slug,
      imageUrl: c.raw.image?.src ?? "",
      sortOrder: c.sortOrder,
      isActive: true,
    }));
}

// Result type that distinguishes "WC said there is no curated parent
// (or WC is unconfigured) — use defaults" from "WC returned a curated
// list — use it verbatim, even if the curator chose zero items".
type CollectionResult =
  | { kind: "curated"; items: HomepageCollectionItem[] }
  | { kind: "unconfigured" };

// Fetch the curated children of a WC parent category, mapped into the
// shared HomepageCollectionItem shape. Returns `unconfigured` when WC
// creds are missing or the parent slug doesn't exist in WC (so the
// caller can serve sensible defaults). Returns `curated` with the
// mapped items when the parent exists — including an empty array if
// the curator deliberately removed all children. Throws on WC
// network/HTTP errors so the caller can return an empty 200.
async function fetchCollection(parentSlug: string, store?: WooStoreConfig): Promise<CollectionResult> {
  const s = store ?? resolveStore();
  if (!s.consumerKey) return { kind: "unconfigured" };

  const parents = await wooGet<WcCategoryRaw[]>(
    `/products/categories?slug=${encodeURIComponent(parentSlug)}&per_page=5`,
    s,
  );
  if (!parents.length) return { kind: "unconfigured" };
  const parentId = parents[0].id;

  const children = await wooGet<WcCategoryRaw[]>(
    `/products/categories?parent=${parentId}&per_page=100&orderby=menu_order&order=asc`,
    s,
  );

  const visible = children
    .filter((c) => (c.count ?? 0) > 0)
    // Honor WC's category visibility: skip anything explicitly hidden
    // in the storefront (display === "hidden"). Other display values
    // ("default", "products", "subcategories", "both") all render.
    .filter((c) => c.display !== "hidden");
  // Probe each child for a buyable product so curators don't have to
  // manually unpin "Gift Cards" / "Coffee" once they've sold out.
  const buyable = await filterBuyableCategories(visible, s, logger);
  const items = buyable
    .map((c, i) => ({
      id: String(c.id),
      name: c.name,
      slug: c.slug,
      imageUrl: c.image?.src ?? "",
      sortOrder: typeof c.menu_order === "number" ? c.menu_order : i,
      isActive: true,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return { kind: "curated", items };
}

async function getCollection(
  cacheKey: string,
  parentSlug: string,
  dynamicFallback: (store: WooStoreConfig) => Promise<HomepageCollectionItem[]>,
  log: { warn: (obj: unknown, msg?: string) => void },
  store?: WooStoreConfig,
): Promise<HomepageCollectionItem[]> {
  const now = Date.now();
  const cached = collectionCache.get(cacheKey);
  if (cached && now - cached.fetchedAt < COLLECTION_TTL_MS) {
    return cached.items;
  }
  const s = store ?? resolveStore();
  try {
    const result = await fetchCollection(parentSlug, s);
    let items: HomepageCollectionItem[];
    if (result.kind === "curated") {
      items = result.items;
    } else {
      items = await dynamicFallback(s);
    }
    collectionCache.set(cacheKey, { fetchedAt: now, items });
    return items;
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err), parentSlug },
      "homepage collection fetch failed; returning empty so the section hides",
    );
    collectionCache.set(cacheKey, { fetchedAt: now, items: [] });
    return [];
  }
}

// Slug + display defaults for the Summer Collection entry that we always
// pin to the end of the Categories rail when the active store has products
// in the WC `summer-collection` category. Mirrored on the client routes
// (`/category/summer-collection` on mobile, `/shop?category=summer-collection`
// on web) so taps land on the existing listing.
const SUMMER_COLLECTION_SLUG = "summer-collection";
const SUMMER_COLLECTION_FALLBACK_NAME = "Summer Collection";
const SUMMER_COLLECTION_FALLBACK_ASSET_PATH =
  "/api/assets/hero-summer-collection.png";

type SummerEntry = { id: string; name: string; imageUrl: string };

// Per-store cache of the Summer Collection WC category lookup. Kept
// separate from `collectionCache` so we can refresh it independently and
// so we never hand a request-scoped absolute URL into a cache that is
// reused across origins.
const summerCollectionCache = new Map<
  string,
  { fetchedAt: number; entry: SummerEntry | null }
>();

async function getSummerCollectionEntry(
  store: WooStoreConfig,
  log: { warn: (obj: unknown, msg?: string) => void },
): Promise<SummerEntry | null> {
  const now = Date.now();
  const cached = summerCollectionCache.get(store.baseUrl);
  if (cached && now - cached.fetchedAt < COLLECTION_TTL_MS) {
    return cached.entry;
  }
  if (!store.consumerKey) {
    summerCollectionCache.set(store.baseUrl, { fetchedAt: now, entry: null });
    return null;
  }
  try {
    const cats = await wooGet<WcCategoryRaw[]>(
      `/products/categories?slug=${encodeURIComponent(SUMMER_COLLECTION_SLUG)}&per_page=1`,
      store,
    );
    if (!cats.length || (cats[0].count ?? 0) === 0 || cats[0].display === "hidden") {
      summerCollectionCache.set(store.baseUrl, { fetchedAt: now, entry: null });
      return null;
    }
    const c = cats[0];
    // Confirm there's at least one buyable product before pinning the
    // entry. On a probe failure (null), fall back to today's behavior so
    // a transient WC blip doesn't drop the rail entry.
    const buyable = await categoryHasBuyableProduct(store, c.id, log);
    if (buyable === false) {
      summerCollectionCache.set(store.baseUrl, { fetchedAt: now, entry: null });
      return null;
    }
    const entry: SummerEntry = {
      id: String(c.id),
      name: c.name || SUMMER_COLLECTION_FALLBACK_NAME,
      imageUrl: c.image?.src ?? "",
    };
    summerCollectionCache.set(store.baseUrl, { fetchedAt: now, entry });
    return entry;
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "summer-collection lookup failed; omitting entry",
    );
    return null;
  }
}

// Build the absolute URL the clients should use to load the bundled
// fallback hero image. We honor x-forwarded-proto so the URL is https in
// production behind the shared proxy.
function resolveAssetUrl(req: Request, assetPath: string): string {
  const forwardedProto =
    typeof req.headers["x-forwarded-proto"] === "string"
      ? req.headers["x-forwarded-proto"].split(",")[0]?.trim()
      : "";
  const proto = forwardedProto || req.protocol;
  const host = req.get("host") ?? "";
  return `${proto}://${host}${assetPath}`;
}

// Ensure the Summer Collection entry is present (pinned to the end of the
// rail) and has a usable image. If the curated/dynamic feed already
// contains a `summer-collection` slug we keep its position but enrich its
// `imageUrl` with the WC category image (or the bundled fallback) when the
// existing entry has none, so the rail shows a photo instead of a letter
// placeholder.
function mergeSummerCollection(
  items: HomepageCollectionItem[],
  entry: SummerEntry | null,
  fallbackImageUrl: string,
): HomepageCollectionItem[] {
  if (!entry) return items;
  const resolvedImage = entry.imageUrl || fallbackImageUrl;
  const existingIdx = items.findIndex((i) => i.slug === SUMMER_COLLECTION_SLUG);
  if (existingIdx !== -1) {
    const existing = items[existingIdx];
    if (existing.imageUrl) return items;
    const enriched = { ...existing, imageUrl: resolvedImage };
    const next = items.slice();
    next[existingIdx] = enriched;
    return next;
  }
  const sortOrder = items.length
    ? Math.max(...items.map((i) => i.sortOrder)) + 1
    : 0;
  return [
    ...items,
    {
      id: entry.id,
      name: entry.name,
      slug: SUMMER_COLLECTION_SLUG,
      imageUrl: resolvedImage,
      sortOrder,
      isActive: true,
    },
  ];
}

router.get("/homepage/categories", async (req, res) => {
  const store = resolveStoreFromRequest(req);
  const [items, summer] = await Promise.all([
    getCollection(
      `categories::${store.baseUrl}`,
      "home-categories",
      fetchTopLevelCategories,
      req.log,
      store,
    ),
    getSummerCollectionEntry(store, req.log),
  ]);
  const fallbackImageUrl = resolveAssetUrl(
    req,
    SUMMER_COLLECTION_FALLBACK_ASSET_PATH,
  );
  const merged = mergeSummerCollection(items, summer, fallbackImageUrl);
  const data = GetHomepageCategoriesResponse.parse({ items: merged });
  res.json(data);
});

router.get("/homepage/occasions", async (req, res) => {
  const store = resolveStoreFromRequest(req);
  const items = await getCollection(
    `occasions::${store.baseUrl}`,
    "home-occasions",
    fetchOccasionCategories,
    req.log,
    store,
  );
  const data = GetHomepageOccasionsResponse.parse({ items });
  res.json(data);
});

// Force-refresh the homepage Categories + Occasions caches for a given
// store. Used by the scheduled WooCommerce sync (lib/wooSync.ts) so the
// next request hits warm caches and a content delta can be computed.
export async function refreshHomepageCollectionsForStore(
  store: WooStoreConfig,
): Promise<{
  categories: HomepageCollectionItem[];
  occasions: HomepageCollectionItem[];
}> {
  const catKey = `categories::${store.baseUrl}`;
  const occKey = `occasions::${store.baseUrl}`;
  collectionCache.delete(catKey);
  collectionCache.delete(occKey);
  summerCollectionCache.delete(store.baseUrl);
  const [categoriesBase, occasions, summer] = await Promise.all([
    getCollection(catKey, "home-categories", fetchTopLevelCategories, logger, store),
    getCollection(occKey, "home-occasions", fetchOccasionCategories, logger, store),
    getSummerCollectionEntry(store, logger),
  ]);
  // Include the merged Summer Collection entry in the returned snapshot so
  // wooSync's category-id diff detects WC summer-collection
  // additions/removals and triggers the silent data_refresh push. The
  // image URL stays empty here because the snapshot is request-agnostic;
  // the per-request handler injects the absolute fallback URL when
  // serving clients.
  const categories = mergeSummerCollection(categoriesBase, summer, "");
  return { categories, occasions };
}

export default router;
