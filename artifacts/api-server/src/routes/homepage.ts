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

const WC_BASE = "https://presentail.com/lebanon/wp-json/wc/v3";

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

function wooAuthHeader(): string {
  const key = process.env.WC_CONSUMER_KEY ?? "";
  const secret = process.env.WC_CONSUMER_SECRET ?? "";
  return "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");
}

async function wooGet<T>(path: string): Promise<T> {
  const r = await fetch(`${WC_BASE}${path}`, {
    headers: {
      Authorization: wooAuthHeader(),
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
const DEFAULT_CATEGORIES: HomepageCollectionItem[] = [
  { id: "cat-hand-bouquets", name: "Hand Bouquets", slug: "hand-bouquets", imageUrl: "", sortOrder: 1, isActive: true },
  { id: "cat-flower-boxes", name: "Flower Boxes", slug: "flower-boxes", imageUrl: "", sortOrder: 2, isActive: true },
  { id: "cat-flower-vases", name: "Flower Vases", slug: "flower-vases", imageUrl: "", sortOrder: 3, isActive: true },
  { id: "cat-plants", name: "Plants", slug: "plants", imageUrl: "", sortOrder: 4, isActive: true },
  { id: "cat-cakes", name: "Cakes", slug: "cakes", imageUrl: "", sortOrder: 5, isActive: true },
  { id: "cat-chocolate", name: "Chocolates", slug: "chocolate", imageUrl: "", sortOrder: 6, isActive: true },
];

const DEFAULT_OCCASIONS: HomepageCollectionItem[] = [
  { id: "occ-birthday", name: "Birthday", slug: "birthday", imageUrl: "", sortOrder: 1, isActive: true },
  { id: "occ-anniversary", name: "Anniversary", slug: "anniversary", imageUrl: "", sortOrder: 2, isActive: true },
  { id: "occ-love-romance", name: "Love & Romance", slug: "love-romance", imageUrl: "", sortOrder: 3, isActive: true },
  { id: "occ-congrats", name: "Congratulations", slug: "congratulations", imageUrl: "", sortOrder: 4, isActive: true },
  { id: "occ-thank-you", name: "Thank You", slug: "thank-you", imageUrl: "", sortOrder: 5, isActive: true },
  { id: "occ-newborn", name: "Newborn", slug: "newborn", imageUrl: "", sortOrder: 6, isActive: true },
];

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
async function fetchCollection(parentSlug: string): Promise<CollectionResult> {
  if (!process.env.WC_CONSUMER_KEY) return { kind: "unconfigured" };

  const parents = await wooGet<WcCategoryRaw[]>(
    `/products/categories?slug=${encodeURIComponent(parentSlug)}&per_page=5`,
  );
  if (!parents.length) return { kind: "unconfigured" };
  const parentId = parents[0].id;

  const children = await wooGet<WcCategoryRaw[]>(
    `/products/categories?parent=${parentId}&per_page=100&orderby=menu_order&order=asc`,
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
  fallback: HomepageCollectionItem[],
  log: { warn: (obj: unknown, msg?: string) => void },
): Promise<HomepageCollectionItem[]> {
  const now = Date.now();
  const cached = collectionCache.get(cacheKey);
  if (cached && now - cached.fetchedAt < COLLECTION_TTL_MS) {
    return cached.items;
  }
  try {
    const result = await fetchCollection(parentSlug);
    // Curated result wins, even when empty — that's the curator's
    // explicit choice. Only fall back to defaults if WC has no opinion
    // (creds missing or parent slug not yet created in WP admin).
    const items = result.kind === "curated" ? result.items : fallback;
    collectionCache.set(cacheKey, { fetchedAt: now, items });
    return items;
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err), parentSlug },
      "homepage collection fetch failed; returning empty so the section hides",
    );
    // On a real WC network/HTTP error we deliberately return empty
    // (cached briefly to avoid hammering WC) so the web client hides
    // the carousel rather than rendering potentially stale defaults.
    collectionCache.set(cacheKey, { fetchedAt: now, items: [] });
    return [];
  }
}

router.get("/homepage/categories", async (req, res) => {
  const items = await getCollection(
    "categories",
    "home-categories",
    DEFAULT_CATEGORIES,
    req.log,
  );
  const data = GetHomepageCategoriesResponse.parse({ items });
  res.json(data);
});

router.get("/homepage/occasions", async (req, res) => {
  const items = await getCollection(
    "occasions",
    "home-occasions",
    DEFAULT_OCCASIONS,
    req.log,
  );
  const data = GetHomepageOccasionsResponse.parse({ items });
  res.json(data);
});

export default router;
