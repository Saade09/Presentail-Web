import { Router, type IRouter } from "express";
import {
  GetHomepageBannersQueryParams,
  GetHomepageBannersResponse,
  GetHomepageCategoriesResponse,
  GetHomepageOccasionsResponse,
} from "@workspace/api-zod";
import type { HomepageCollectionItem } from "@workspace/api-zod";
import { HOMEPAGE_BANNERS } from "../data/homepageBanners";

const router: IRouter = Router();

// Returns the active hero banner carousel for the supplied country.
// Filtering by isActive, the optional startsAt/endsAt window, and country
// code (with "*" matching every country) plus sortOrder ordering all happen
// here so clients can render the response verbatim.
router.get("/homepage/banners", (req, res) => {
  const { countryCode } = GetHomepageBannersQueryParams.parse(req.query);
  const code = (countryCode ?? "*").toUpperCase();
  const now = Date.now();

  const banners = HOMEPAGE_BANNERS.filter((b) => {
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
  return cats
    .filter((c) => (c.count ?? 0) > 0 && c.display !== "hidden" && c.slug !== "uncategorized" && PRODUCT_TYPE_SLUGS.has(c.slug))
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
  const items: HomepageCollectionItem[] = [];
  for (let i = 0; i < DEFAULT_OCCASION_SLUGS.length; i++) {
    const slug = DEFAULT_OCCASION_SLUGS[i];
    try {
      const cats = await wooGet<WcCategoryRaw[]>(
        `/products/categories?slug=${encodeURIComponent(slug)}&per_page=1`,
        store,
      );
      if (cats.length && (cats[0].count ?? 0) > 0) {
        items.push({
          id: String(cats[0].id),
          name: cats[0].name,
          slug: cats[0].slug,
          imageUrl: cats[0].image?.src ?? "",
          sortOrder: i,
          isActive: true,
        });
      }
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), slug },
        "fetchOccasionCategories: slug fetch failed",
      );
    }
  }
  return items;
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

  const items = children
    .filter((c) => (c.count ?? 0) > 0)
    // Honor WC's category visibility: skip anything explicitly hidden
    // in the storefront (display === "hidden"). Other display values
    // ("default", "products", "subcategories", "both") all render.
    .filter((c) => c.display !== "hidden")
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

router.get("/homepage/categories", async (req, res) => {
  const store = resolveStoreFromRequest(req);
  const items = await getCollection(
    `categories::${store.baseUrl}`,
    "home-categories",
    fetchTopLevelCategories,
    req.log,
    store,
  );
  const data = GetHomepageCategoriesResponse.parse({ items });
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

export default router;
