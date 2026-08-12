import { Router, type IRouter } from "express";
import { timingSafeEqual, createHash } from "node:crypto";
import {
  GetHomepageBannersQueryParams,
  GetHomepageBannersResponse,
  GetHomepageCategoriesResponse,
  GetHomepageOccasionsResponse,
} from "@workspace/api-zod";
import type { z } from "zod";
type HomepageCollectionItem = z.infer<typeof GetHomepageCategoriesResponse>["items"][number];
import { translateBanners, type BannerLang } from "../lib/bannerTranslation";
import { translateCategoryOccasionNames, type CategoryOccasionLang } from "../lib/categoryOccasionTranslation";
import { db, appOrdersTable, collectionRankingConfigTable } from "@workspace/db";
import type { CollectionRankingConfigRow } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { rankWithCache, RANKING_SCORE_VERSION } from "../lib/productRankingService";

import {
  getOsProducts,
  getOsCategories,
  getOsOccasions,
  getOsProductPricingMap,
  registerOsProductsRefreshListener,
  registerPricingEnrichmentListener,
  type ProductPricingEntry,
} from "../lib/osProductsCache";
import { scoreCollections, getCollectionClickScores } from "../lib/collectionRanking";
import { getOsOccasionStatsMap } from "../lib/osOccasionStats";
import { categories as staticCategories } from "@workspace/catalog-data";
import { resolveStoreFromRequest } from "../lib/wooStore";

// ── Ranking config cache ───────────────────────────────────────────────────
//
// The collection_ranking_config table is tiny and rarely changes, so we cache
// the full result set in-process with a 5-minute TTL. The admin PUT endpoint
// calls invalidateRankingConfigCache() to force an immediate reload.

const RANKING_CONFIG_TTL_MS = 5 * 60 * 1000;
let rankingConfigCache: { rows: CollectionRankingConfigRow[]; fetchedAt: number } | null = null;

export function invalidateRankingConfigCache(): void {
  rankingConfigCache = null;
}

export async function getRankingConfig(): Promise<CollectionRankingConfigRow[]> {
  const now = Date.now();
  if (rankingConfigCache && now - rankingConfigCache.fetchedAt < RANKING_CONFIG_TTL_MS) {
    return rankingConfigCache.rows;
  }
  try {
    const rows = await db.select().from(collectionRankingConfigTable);
    rankingConfigCache = { rows, fetchedAt: now };
    return rows;
  } catch {
    return rankingConfigCache?.rows ?? [];
  }
}

const router: IRouter = Router();

// ── Homepage banner stale-on-error cache ──────────────────────────────────
//
// The OS storefront/homepage-banners endpoint occasionally returns HTTP 500.
// Rather than surfacing a blank carousel, we cache the last successful
// normalised banner list per (countryCode|"*"):device key and serve it as
// a fallback whenever OS fails.  Fresh TTL is 10 min; stale entries are kept
// indefinitely as a safety net so a persistent OS outage never empties the
// banner slot for shoppers who already had a successful load.

const BANNER_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min fresh window

type BannerCacheEntry = {
  banners: unknown[]; // normalised list (pre-translation)
  fetchedAt: number;
};
const bannerSuccessCache = new Map<string, BannerCacheEntry>();

function makeBannerCacheKey(cc: string | undefined, dev: string): string {
  return `${cc ?? "*"}:${dev}`;
}

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
  const { countryCode, cityId, device, lang } = GetHomepageBannersQueryParams.parse(req.query);
  const resolvedLang = lang ?? "en";
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

  const cacheKey = makeBannerCacheKey(countryCode, device);

  // Serve a fresh cache hit without hitting OS at all.
  const cached = bannerSuccessCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < BANNER_CACHE_TTL_MS) {
    let banners = normaliseBanners(cached.banners);
    if (resolvedLang === "ar" || resolvedLang === "fr") {
      const textFields = banners.map((b) => ({
        title: b.title,
        headline: b.headline,
        subtitle: b.subtitle,
        ctaText: b.ctaText,
      }));
      const translated = await translateBanners(resolvedLang as BannerLang, textFields);
      banners = banners.map((b, i) => ({ ...b, ...translated[i] }));
    }
    return res.json(GetHomepageBannersResponse.parse({ banners }));
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

    // Only update the cache when OS actually returned banners; an empty list
    // from a 500 error must not overwrite a previously good entry.
    if (rawList.length > 0) {
      bannerSuccessCache.set(cacheKey, { banners: rawList, fetchedAt: now });
    }

    let banners = normaliseBanners(rawList);

    // If OS returned nothing (likely a transient 500), fall back to the stale
    // cache entry rather than rendering an empty carousel.
    if (banners.length === 0 && cached) {
      req.log.warn(
        { cacheKey, staleSecs: Math.round((now - cached.fetchedAt) / 1000) },
        "homepage/banners: OS returned empty — serving stale cache",
      );
      banners = normaliseBanners(cached.banners);
    }

    // For ar/fr: translate the English text we got from OS using our own LLM.
    // We always fetch English from OS and translate ourselves rather than relying
    // on OS-native localised fields (which the OS may not support yet).
    if (resolvedLang === "ar" || resolvedLang === "fr") {
      const textFields = banners.map((b) => ({
        title: b.title,
        headline: b.headline,
        subtitle: b.subtitle,
        ctaText: b.ctaText,
      }));
      const translated = await translateBanners(resolvedLang as BannerLang, textFields);
      banners = banners.map((b, i) => ({ ...b, ...translated[i] }));
    }

    return res.json(GetHomepageBannersResponse.parse({ banners }));
  } catch (err: unknown) {
    req.log.warn({ err: (err as Error)?.message }, "homepage/banners: OS fetch failed");
    // If we have any stale entry, serve it rather than returning empty.
    if (cached) {
      req.log.warn(
        { cacheKey, staleSecs: Math.round((now - cached.fetchedAt) / 1000) },
        "homepage/banners: exception — serving stale cache",
      );
      const banners = normaliseBanners(cached.banners);
      return res.json(GetHomepageBannersResponse.parse({ banners }));
    }
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
  "summer", "electronics",
]);

// Categories that must appear on the homepage even when OS does not mark them
// as featured. Add slugs here when OS admin curates them as non-featured but
// the product team still wants them in the carousel.
const FORCE_INCLUDE_CATEGORY_SLUGS = new Set(["electronics"]);

// ── Presentail OS-backed collection builders ─────────────────────────────
//
// When the OS products cache is populated these functions build the homepage
// categories / occasions carousel from OS data rather than WooCommerce. This
// eliminates the WC network round-trips for every homepage load and makes the
// navigation data consistent with the OS-sourced product listings.

export function buildOsCategoriesRaw(): HomepageCollectionItem[] | null {
  const osCategories = getOsCategories();
  if (osCategories && osCategories.length > 0) {
    return osCategories
      .filter(
        (c) =>
          (c.is_featured === true || FORCE_INCLUDE_CATEGORY_SLUGS.has(c.slug)) &&
          !HIDDEN_CATEGORY_SLUGS.has(c.slug),
      )
      .map((c, i) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        // OS category images are now publicly accessible via imagePublicUrl.
        // Use the CDN URL directly so the browser fetches without a proxy
        // round-trip. Fall back to empty string; the client resolves static
        // assets from CATEGORY_STATIC_IMAGES[slug] when imageUrl is empty.
        imageUrl: c.imagePublicUrl ?? "",
        sortOrder: i,
        isActive: true,
      }));
  }
  // Fall back to static catalog-data categories (same source as /catalog/metadata)
  // so the homepage carousel is never empty even before the OS cache warms up.
  // Do NOT forward external (WordPress) image URIs — they may be unreachable
  // and would override the client's own static-asset fallback. Return an empty
  // imageUrl; HomepageCollections fills it from CATEGORY_STATIC_IMAGES[slug].
  const OS_STORAGE_PREFIX = "https://os.presentail.com/api/storage/";
  return staticCategories
    .filter((c) => PRODUCT_TYPE_SLUGS.has(c.id) && !HIDDEN_CATEGORY_SLUGS.has(c.id))
    .map((c, i) => {
      const uri =
        "image" in c && c.image && "uri" in c.image ? c.image.uri : null;
      return {
        id: c.id,
        name: c.name,
        slug: c.id,
        // Only forward OS storage URLs (served via our proxy); drop external
        // WP/CDN URLs that may be broken or slow so the client uses its own
        // static images from CATEGORY_STATIC_IMAGES[slug] instead.
        imageUrl: uri?.startsWith(OS_STORAGE_PREFIX) ? uri : "",
        sortOrder: i,
        isActive: true,
      };
    });
}

async function buildOsCategories(
  countryCode?: string | null,
  cityId?: string | null,
): Promise<{ items: HomepageCollectionItem[] | null; debugMap: Map<string, import("../lib/collectionRanking").ScoreDebug> }> {
  const raw = buildOsCategoriesRaw();
  if (!raw) return { items: null, debugMap: new Map() };
  const configRows = await getRankingConfig();
  const osProducts = getOsProducts(cityId === "ae-dubai" ? "dubai" : cityId === "ae-abu-dhabi" ? "abudhabi" : countryCode === "AE" ? "dubai" : countryCode === "CY" ? "cyprus" : "lebanon") ?? [];
  const clickScores = await getCollectionClickScores("category", countryCode).catch(() => new Map<string, number>());
  const { items, debugMap } = scoreCollections<HomepageCollectionItem>(raw, {
    kind: "category",
    countryCode,
    citySlug: cityId ?? null,
    configRows,
    osProducts,
    clickScores,
    defaultOrder: [],
    availabilityFloor: 3,
  });
  return { items: items.map((item, i) => ({ ...item, sortOrder: i })), debugMap };
}

export function buildOsOccasionsRaw(): HomepageCollectionItem[] | null {
  const osOccasions = getOsOccasions();
  if (!osOccasions || osOccasions.length === 0) return null;

  // Prefer occasions flagged as featured by OS. When none are featured (e.g.
  // in development or on a fresh OS instance), fall back to all active
  // occasions so the homepage carousel is never empty.
  const isActive = (o: { isActive?: boolean; status?: string }) =>
    o.isActive !== false && o.status !== "inactive";

  const featured = osOccasions.filter((o) => o.featured === true && isActive(o));
  const pool = featured.length > 0 ? featured : osOccasions.filter((o) => isActive(o));

  if (pool.length === 0) return null;

  // Base order: OS best-selling rank (osPosition = index in the OS
  // best_selling-sorted response). Scoring downstream re-orders using
  // osOccasionStats when available; this keeps a sensible order otherwise.
  const sorted = [...pool].sort((a, b) => {
    const ap = typeof a.osPosition === "number" ? a.osPosition : Infinity;
    const bp = typeof b.osPosition === "number" ? b.osPosition : Infinity;
    return ap - bp;
  });
  return sorted.map((o, i) => ({
    id: String(o.id),
    name: o.name,
    slug: o.slug,
    imageUrl: o.imagePublicUrl ? `/api/catalog/occasion-image/${o.id}` : "",
    sortOrder: i,
    isActive: true,
  }));
}

async function buildOsOccasions(
  countryCode?: string | null,
  cityId?: string | null,
): Promise<{ items: HomepageCollectionItem[] | null; debugMap: Map<string, import("../lib/collectionRanking").ScoreDebug> }> {
  const raw = buildOsOccasionsRaw();
  if (!raw) return { items: null, debugMap: new Map() };
  const configRows = await getRankingConfig();
  const osProducts = getOsProducts(cityId === "ae-dubai" ? "dubai" : cityId === "ae-abu-dhabi" ? "abudhabi" : countryCode === "AE" ? "dubai" : countryCode === "CY" ? "cyprus" : "lebanon") ?? [];
  const [clickScores, osOccasionStats] = await Promise.all([
    getCollectionClickScores("occasion", countryCode).catch(() => new Map<string, number>()),
    getOsOccasionStatsMap().catch(() => new Map<string, number>()),
  ]);
  // OS best-selling positions (index in the best_selling-sorted OS response):
  // acts as the ordering key when the stats endpoint has no data.
  const osPositions = new Map<string, number>();
  for (const o of getOsOccasions() ?? []) {
    if (typeof o.osPosition === "number") osPositions.set(o.slug, o.osPosition);
  }
  const { items, debugMap } = scoreCollections<HomepageCollectionItem>(raw, {
    kind: "occasion",
    countryCode,
    citySlug: cityId ?? null,
    configRows,
    osProducts,
    clickScores,
    osOccasionStats,
    defaultOrder: DEFAULT_OCCASION_SLUGS,
    availabilityFloor: 3,
    osPositions,
  });
  // Final order: OS best-selling rank (osPosition from the best_selling-sorted
  // OS occasions endpoint — the same ranking as the OS admin "Top occasions"
  // chart). Scoring above still applies availability filtering and hidden
  // overrides; occasions without an OS rank keep their scored relative order
  // after the ranked ones.
  const ranked = items
    .map((item, scoredIdx) => ({ item, scoredIdx, pos: osPositions.get(item.slug) ?? Infinity }))
    .sort((a, b) => (a.pos !== b.pos ? a.pos - b.pos : a.scoredIdx - b.scoredIdx))
    .map(({ item }) => item);
  return { items: ranked.map((item, i) => ({ ...item, sortOrder: i })), debugMap };
}

function isDebugRequest(req: import("express").Request): boolean {
  const expected = process.env.PUSH_ADMIN_TOKEN;
  if (!expected) return false;
  const supplied = req.header("x-push-admin-token") ?? req.header("x-admin-token");
  if (!supplied) return false;
  const debugParam = req.query.debug === "1" || req.query.debug === "true";
  if (!debugParam) return false;
  // SHA-256 both values before comparing so the digest buffers are always
  // 32 bytes regardless of token length — this prevents the early-return on
  // unequal lengths from leaking whether the guessed value's length matched.
  const aBuf = createHash("sha256").update(supplied).digest();
  const bBuf = createHash("sha256").update(expected).digest();
  return timingSafeEqual(aBuf, bBuf);
}

router.get("/homepage/categories", async (req, res) => {
  const countryCode = typeof req.query.countryCode === "string" ? req.query.countryCode.toUpperCase() : null;
  const cityId = typeof req.query.cityId === "string" ? req.query.cityId : null;
  const lang = typeof req.query.lang === "string" ? req.query.lang.toLowerCase() : "en";
  const debug = isDebugRequest(req);

  const { items: scored, debugMap } = await buildOsCategories(countryCode, cityId);
  let items = scored ?? [];

  if (lang === "ar" || lang === "fr") {
    const englishNames = items.map((item) => item.name);
    const translatedNames = await translateCategoryOccasionNames(englishNames, lang as CategoryOccasionLang);
    items = items.map((item, i) => ({ ...item, name: translatedNames[i] ?? item.name }));
  }

  if (debug) {
    return res.json({
      items: items.map((item) => ({
        ...item,
        _rankingDebug: debugMap.get(item.slug),
      })),
    });
  }

  const data = GetHomepageCategoriesResponse.parse({ items });
  return res.json(data);
});

router.get("/homepage/occasions", async (req, res) => {
  const countryCode = typeof req.query.countryCode === "string" ? req.query.countryCode.toUpperCase() : null;
  const cityId = typeof req.query.cityId === "string" ? req.query.cityId : null;
  const lang = typeof req.query.lang === "string" ? req.query.lang.toLowerCase() : "en";
  const debug = isDebugRequest(req);

  const { items: scored, debugMap } = await buildOsOccasions(countryCode, cityId);
  let items = scored ?? [];

  if (lang === "ar" || lang === "fr") {
    const englishNames = items.map((item) => item.name);
    const translatedNames = await translateCategoryOccasionNames(englishNames, lang as CategoryOccasionLang);
    items = items.map((item, i) => ({ ...item, name: translatedNames[i] ?? item.name }));
  }

  if (debug) {
    return res.json({
      items: items.map((item) => ({
        ...item,
        _rankingDebug: debugMap.get(item.slug),
      })),
    });
  }

  const data = GetHomepageOccasionsResponse.parse({ items });
  return res.json(data);
});

const BEST_SELLERS_LIMIT = 20;

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

// Also bust the best-sellers cache when pricing enrichment completes so that
// any null-discount snapshot cached during the cold-start window (between OS
// refresh completing and enrichment finishing) is replaced with fresh data.
registerPricingEnrichmentListener(() => {
  bestSellersCache.clear();
});

// ── Local sales fetcher ───────────────────────────────────────────────────
//
// Queries app_orders for all confirmed/out_for_delivery/delivered rows and
// tallies sold quantities per normalised product name.
// Shape of line_items_json: [{name: string, quantity: number, priceUsdCents: number}]
//
// Returns a map of normalised-name → { count, priceUsdCents, originalName }
// so the route can build product entries even when the OS cache is cold.

type LocalSaleEntry = {
  count: number;
  priceUsdCents: number;
  originalName: string;
};

async function fetchLocalSales(): Promise<Map<string, LocalSaleEntry>> {
  const tally = new Map<string, LocalSaleEntry>();
  const rows = await db
    .select({ lineItemsJson: appOrdersTable.lineItemsJson })
    .from(appOrdersTable)
    .where(inArray(appOrdersTable.state, ["confirmed", "out_for_delivery", "delivered"]));
  for (const row of rows) {
    if (!row.lineItemsJson) continue;
    let items: unknown;
    try { items = JSON.parse(row.lineItemsJson); } catch { continue; }
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (typeof item !== "object" || item === null || !("name" in item)) continue;
      const rec = item as { name: string; quantity?: unknown; priceUsdCents?: unknown };
      if (typeof rec.name !== "string" || !rec.name.trim()) continue;
      const key = rec.name.toLowerCase().trim();
      const qty = typeof rec.quantity === "number" && rec.quantity > 0 ? rec.quantity : 1;
      const price = typeof rec.priceUsdCents === "number" && rec.priceUsdCents > 0
        ? rec.priceUsdCents : 0;
      const existing = tally.get(key);
      if (existing) {
        existing.count += qty;
        if (price > 0) existing.priceUsdCents = price;
      } else {
        tally.set(key, { count: qty, priceUsdCents: price, originalName: rec.name.trim() });
      }
    }
  }
  return tally;
}

function decodeName(name: string): string {
  return name.replace(/&#8211;/g, "–").replace(/&amp;/g, "&").replace(/&#8217;/g, "'");
}

function parseDiscountField(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "" || raw === "0" || raw === 0) return null;
  const n = typeof raw === "number" ? raw : parseFloat(raw);
  return isFinite(n) && n > 0 ? n : null;
}

/**
 * Returns the display base price (crossed-out "was" price) for a product.
 * When `regular_price` is explicitly set and > 0, it is used as the display
 * price so the sale price can be shown alongside it. Falls back to `price`
 * (the current selling price) when no regular_price is configured.
 * Mirrors the `basePrice` logic in woo.ts / transformOsProduct.
 */
function computeOsDisplayPrice(osP: {
  price: number;
  regular_price?: string | null;
}): number {
  const rp = parseDiscountField(osP.regular_price);
  return rp != null && rp > 0 ? rp : osP.price;
}

function computeOsDiscountPriceValue(osP: {
  price: number;
  regular_price?: string | null;
  sale_price?: string | null;
  discount_price_usd?: string | null;
}): number | null {
  const regularPriceValue = parseDiscountField(osP.regular_price);
  const salePriceField = parseDiscountField(osP.sale_price);
  if (regularPriceValue != null && regularPriceValue > 0) {
    if (salePriceField != null && salePriceField > 0 && salePriceField < regularPriceValue) {
      return salePriceField;
    } else if (osP.price > 0 && osP.price < regularPriceValue) {
      return osP.price;
    }
    return null;
  }
  return parseDiscountField(osP.discount_price_usd);
}

type OsPricingInput = {
  osNumericId?: number | string;
  price: number;
  regular_price?: string | null;
  sale_price?: string | null;
  discount_price_usd?: string | null;
  discount_price_aed?: string | null;
};

/**
 * Primary pricing resolver for homepage product entries.
 *
 * The OS list endpoint DOES NOT return sale_price / regular_price / discount_price_*
 * fields — those are only available on the per-product detail endpoint, fetched
 * asynchronously by the pricing enrichment step and stored in cachedProductPricing
 * (keyed by osNumericId). This function reads from that enrichment map first and
 * falls back to computing from raw product fields (which are always null from the
 * list endpoint, but kept as a safety net for cold-start / enrichment-not-yet-run).
 */
function resolveProductPricing(
  osP: OsPricingInput,
  pricingMap: ReadonlyMap<string, ProductPricingEntry>,
): { displayPrice: number; discountPriceValue: number | null; discountPriceAed: number | null } {
  const key = osP.osNumericId != null ? String(osP.osNumericId) : "";
  const entry = key ? pricingMap.get(key) : undefined;
  return {
    displayPrice: entry?.regularPriceUsd ?? computeOsDisplayPrice(osP),
    discountPriceValue: entry?.discountPriceUsd ?? computeOsDiscountPriceValue(osP),
    discountPriceAed: entry?.discountPriceAed ?? parseDiscountField(osP.discount_price_aed),
  };
}

// ── Best-sellers route ────────────────────────────────────────────────────
//
// DB-first: always ranks from app_orders so the endpoint returns real sales
// data even when the OS products cache has not yet been populated.
// OS cache is used for enrichment (images, stock status, deliverability)
// when available. Products not found in the OS cache are included using
// price data from the order line items and a null image.

router.get("/homepage/best-sellers", async (req, res) => {
  const store = resolveStoreFromRequest(req);

  const countryCode =
    typeof req.query.countryCode === "string" ? req.query.countryCode.toUpperCase() : null;
  const currencySymbol = store.currencySymbol ?? "$";

  // Cache key: storeKey already encodes city for UAE (ae-dubai → "dubai" store,
  // ae-abu-dhabi → "abudhabi" store), so cityId is not needed here.
  const cacheKey = `${store.storeKey}::${countryCode ?? ""}::${currencySymbol}`;
  const now = Date.now();
  const cached = bestSellersCache.get(cacheKey);
  if (cached && now - cached.fetchedAt < COLLECTION_TTL_MS) {
    return res.json(cached.body);
  }

  // Fetch local sales first — this is the primary data source and works even
  // when the OS cache is cold.
  let localSales: Map<string, LocalSaleEntry>;
  try {
    localSales = await fetchLocalSales();
  } catch {
    localSales = new Map();
  }

  // OS cache enrichment — available in production, may be cold in dev.
  const osProducts = getOsProducts(store.storeKey) ?? [];

  // Pricing enrichment map (keyed by osNumericId string).
  // The OS list endpoint omits sale_price / regular_price / discount_price_* —
  // those are fetched per-product by the background enrichment step.
  const pricingMap = getOsProductPricingMap();

  // Build a normalised-name → OS product map for O(1) lookups.
  const osProductByName = new Map(osProducts.map((p) => [p.name.toLowerCase().trim(), p]));

  function formatPrice(usdValue: number): string {
    return currencySymbol.length > 1
      ? `${usdValue.toLocaleString()} ${currencySymbol}`
      : `${currencySymbol}${usdValue.toLocaleString()}`;
  }

  type ScoredEntry = {
    id: string;
    name: string;
    price: string;
    priceValue: number;
    discountPriceValue: number | null;
    discountPriceAed: number | null;
    image: { uri: string } | null;
    images: { uri: string }[];
    inStock: boolean;
    popularity: number;
    blendedScore: number;
  };

  const seen = new Set<string>();
  const entries: ScoredEntry[] = [];

  // ── Step 1: DB-sourced products (always present) ─────────────────────
  for (const [key, sale] of localSales) {
    const osP = osProductByName.get(key);

    // Country-level deliverability filter (matching the browse filter in woo.ts
    // which also sets cityId: null — city is already encoded in the storeKey).
    if (osP) {
      if (countryCode && osP.deliverableCountries && osP.deliverableCountries.length > 0) {
        if (!osP.deliverableCountries.some((c) => c.toUpperCase() === countryCode)) continue;
      }
    }

    const id = osP ? osP.id : key.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (seen.has(id)) continue;
    seen.add(id);

    const imageList = osP
      ? osP.images.map((img) => ({ uri: img.url })).filter((img) => img.uri.length > 0)
      : [];
    const pricing = osP ? resolveProductPricing(osP, pricingMap) : null;
    const priceValue = pricing ? pricing.displayPrice : sale.priceUsdCents / 100;

    entries.push({
      id,
      name: decodeName(osP ? osP.name : sale.originalName),
      price: formatPrice(priceValue),
      priceValue,
      discountPriceValue: pricing ? pricing.discountPriceValue : null,
      discountPriceAed: pricing ? pricing.discountPriceAed : null,
      image: imageList[0] ?? null,
      images: imageList,
      inStock: osP ? osP.inStock : true,
      popularity: (osP?.totalSales ?? 0) + sale.count,
      blendedScore: (osP?.totalSales ?? 0) + sale.count,
    });
  }

  // ── Step 2: OS-only products (sold but not in DB orders, or new stock) ─
  // Only add these when the OS cache is available so we don't pad with zeros.
  if (osProducts.length > 0) {
    for (const osP of osProducts) {
      if (!osP.inStock) continue;
      if (countryCode && osP.deliverableCountries && osP.deliverableCountries.length > 0) {
        if (!osP.deliverableCountries.some((c) => c.toUpperCase() === countryCode)) continue;
      }
      if (seen.has(osP.id)) continue;
      seen.add(osP.id);

      const imageList = osP.images.map((img) => ({ uri: img.url })).filter((img) => img.uri.length > 0);
      const { displayPrice, discountPriceValue, discountPriceAed } = resolveProductPricing(osP, pricingMap);
      entries.push({
        id: osP.id,
        name: decodeName(osP.name),
        price: formatPrice(displayPrice),
        priceValue: displayPrice,
        discountPriceValue,
        discountPriceAed,
        image: imageList[0] ?? null,
        images: imageList,
        inStock: true,
        popularity: osP.totalSales ?? 0,
        blendedScore: osP.totalSales ?? 0,
      });
    }
  }

  // Primary sort by blended score (fallback when metrics cache is empty).
  entries.sort((a, b) => b.blendedScore - a.blendedScore);

  // Apply server-side ranking via precomputed metrics. The ranking service
  // re-sorts the top-N pool using section-specific formula weights. When the
  // metrics cache is empty (first boot), the blendedScore order is preserved
  // unchanged because rankWithCache falls through to the fallback chain.
  const rankableEntries = entries.map((e) => ({
    ...e,
    totalSales: e.blendedScore,
  }));
  const { products: rankedEntries } = rankWithCache(rankableEntries, "best-sellers");
  const products = rankedEntries
    .slice(0, BEST_SELLERS_LIMIT)
    .map(({ blendedScore: _, totalSales: __, ...rest }) => rest);

  const body = { ok: true, products, rankingScoreVersion: RANKING_SCORE_VERSION };
  // Only cache when we have products (avoid caching empty cold-start responses).
  if (products.length > 0) {
    bestSellersCache.set(cacheKey, { fetchedAt: now, body });
  }
  return res.json(body);
});

// ── Collection best-sellers cache ────────────────────────────────────────
//
// Same pattern as bestSellersCache but keyed by (categorySlug or occasionSlug,
// storeKey, countryCode, currencySymbol). Cleared on OS products refresh.
// Cache key: `${filterKind}:${slug}::${storeKey}::${countryCode}::${currencySymbol}`

const collectionBestSellersCache = new Map<string, BestSellersEntry>();

registerOsProductsRefreshListener(() => {
  collectionBestSellersCache.clear();
});

// Same cold-start bust for the collection cache.
registerPricingEnrichmentListener(() => {
  collectionBestSellersCache.clear();
});

// Returns in-stock products filtered to the given category or occasion slug,
// ranked by blended sales score (local app_orders tally + OS totalSales).
// Structured identically to /homepage/best-sellers so the same client Product
// type can be used.
router.get("/homepage/collection-best-sellers", async (req, res) => {
  const store = resolveStoreFromRequest(req);
  const countryCode =
    typeof req.query.countryCode === "string" ? req.query.countryCode.toUpperCase() : null;
  const currencySymbol = store.currencySymbol ?? "$";
  const categorySlug = typeof req.query.categorySlug === "string" ? req.query.categorySlug.trim() : null;
  const occasionSlug = typeof req.query.occasionSlug === "string" ? req.query.occasionSlug.trim() : null;

  if (!categorySlug && !occasionSlug) {
    return res.status(400).json({ ok: false, message: "categorySlug or occasionSlug is required" }); // i18n-ignore
  }

  const filterKind = categorySlug ? "category" : "occasion";
  const filterSlug = (categorySlug ?? occasionSlug)!;

  const cacheKey = `${filterKind}:${filterSlug}::${store.storeKey}::${countryCode ?? ""}::${currencySymbol}`;
  const now = Date.now();
  const cached = collectionBestSellersCache.get(cacheKey);
  if (cached && now - cached.fetchedAt < COLLECTION_TTL_MS) {
    return res.json(cached.body);
  }

  let localSales: Map<string, LocalSaleEntry>;
  try {
    localSales = await fetchLocalSales();
  } catch {
    localSales = new Map();
  }

  const osProducts = getOsProducts(store.storeKey) ?? [];

  // Pricing enrichment map — OS list endpoint omits sale/regular price fields.
  const pricingMap = getOsProductPricingMap();

  // Filter OS products to those belonging to the requested category or occasion.
  const slugNorm = filterSlug.toLowerCase().trim();
  const filteredOsProducts = osProducts.filter((p) => {
    if (categorySlug) {
      return (p.categories ?? []).some(
        (c) => (typeof c === "string" ? c : (c as { slug?: string }).slug ?? "").toLowerCase() === slugNorm
          || (typeof c !== "string" && (c as { name?: string }).name?.toLowerCase() === slugNorm),
      );
    }
    return (p.occasions ?? []).some(
      (o) => (typeof o === "string" ? o : (o as { slug?: string }).slug ?? "").toLowerCase() === slugNorm
        || (typeof o !== "string" && (o as { name?: string }).name?.toLowerCase() === slugNorm),
    );
  });

  // Build a normalised-name → OS product map from the *filtered* set only.
  const osProductByName = new Map(filteredOsProducts.map((p) => [p.name.toLowerCase().trim(), p]));
  const filteredOsIds = new Set(filteredOsProducts.map((p) => p.id));

  function formatPrice(usdValue: number): string {
    return currencySymbol.length > 1
      ? `${usdValue.toLocaleString()} ${currencySymbol}`
      : `${currencySymbol}${usdValue.toLocaleString()}`;
  }

  type ScoredEntry = {
    id: string;
    name: string;
    price: string;
    priceValue: number;
    discountPriceValue: number | null;
    discountPriceAed: number | null;
    image: { uri: string } | null;
    images: { uri: string }[];
    inStock: boolean;
    popularity: number;
    blendedScore: number;
  };

  const seen = new Set<string>();
  const entries: ScoredEntry[] = [];

  // Step 1: DB-sourced sales, enriched from filtered OS products
  for (const [key, sale] of localSales) {
    const osP = osProductByName.get(key);
    if (!osP) continue; // only include products in this category/occasion

    if (countryCode && osP.deliverableCountries && osP.deliverableCountries.length > 0) {
      if (!osP.deliverableCountries.some((c) => c.toUpperCase() === countryCode)) continue;
    }

    if (seen.has(osP.id)) continue;
    seen.add(osP.id);

    const imageList = osP.images.map((img) => ({ uri: img.url })).filter((img) => img.uri.length > 0);
    const { displayPrice, discountPriceValue, discountPriceAed } = resolveProductPricing(osP, pricingMap);
    entries.push({
      id: osP.id,
      name: decodeName(osP.name),
      price: formatPrice(displayPrice),
      priceValue: displayPrice,
      discountPriceValue,
      discountPriceAed,
      image: imageList[0] ?? null,
      images: imageList,
      inStock: osP.inStock,
      popularity: (osP.totalSales ?? 0) + sale.count,
      blendedScore: (osP.totalSales ?? 0) + sale.count,
    });
  }

  // Step 2: OS-only products in this collection (in-stock, not yet seen)
  for (const osP of filteredOsProducts) {
    if (!osP.inStock) continue;
    if (countryCode && osP.deliverableCountries && osP.deliverableCountries.length > 0) {
      if (!osP.deliverableCountries.some((c) => c.toUpperCase() === countryCode)) continue;
    }
    if (seen.has(osP.id)) continue;
    seen.add(osP.id);

    const imageList = osP.images.map((img) => ({ uri: img.url })).filter((img) => img.uri.length > 0);
    const { displayPrice, discountPriceValue, discountPriceAed } = resolveProductPricing(osP, pricingMap);
    entries.push({
      id: osP.id,
      name: decodeName(osP.name),
      price: formatPrice(displayPrice),
      priceValue: displayPrice,
      discountPriceValue,
      discountPriceAed,
      image: imageList[0] ?? null,
      images: imageList,
      inStock: true,
      popularity: osP.totalSales ?? 0,
      blendedScore: osP.totalSales ?? 0,
    });
  }

  // Out-of-stock products in this collection, appended after in-stock ranked results
  for (const osP of filteredOsProducts) {
    if (osP.inStock) continue;
    if (!filteredOsIds.has(osP.id)) continue;
    if (seen.has(osP.id)) continue;
    seen.add(osP.id);

    const imageList = osP.images.map((img) => ({ uri: img.url })).filter((img) => img.uri.length > 0);
    const { displayPrice, discountPriceValue, discountPriceAed } = resolveProductPricing(osP, pricingMap);
    entries.push({
      id: osP.id,
      name: decodeName(osP.name),
      price: formatPrice(displayPrice),
      priceValue: displayPrice,
      discountPriceValue,
      discountPriceAed,
      image: imageList[0] ?? null,
      images: imageList,
      inStock: false,
      popularity: osP.totalSales ?? 0,
      blendedScore: -1, // always sorted below in-stock
    });
  }

  // Primary sort by blended score (fallback when metrics cache is empty).
  entries.sort((a, b) => b.blendedScore - a.blendedScore);

  // Map filter slug to a known homepage section key so section-specific
  // formula weights are applied (e.g. Balloons gets its own engagement mix).
  function toSectionKey(kind: "category" | "occasion", slug: string): string {
    if (kind === "occasion" && slug === "summer") return "rail-summer";
    if (kind === "category" && slug === "flower-boxes") return "rail-boxes";
    if (kind === "category" && slug === "balloons") return "rail-balloons";
    return `rail-${kind}-${slug}`;
  }
  const sectionKey = toSectionKey(filterKind, filterSlug);

  const rankableEntries = entries.map((e) => ({ ...e, totalSales: e.blendedScore }));
  const { products: rankedEntries } = rankWithCache(rankableEntries, sectionKey);
  const products = rankedEntries.map(({ blendedScore: _, totalSales: __, ...rest }) => rest);

  const body = { ok: true, products, rankingScoreVersion: RANKING_SCORE_VERSION };
  if (products.length > 0) {
    collectionBestSellersCache.set(cacheKey, { fetchedAt: now, body });
  }
  return res.json(body);
});

// Return the current homepage Categories + Occasions from the OS cache.
// Used by the scheduled wooSync tick to obtain the latest collection
// snapshot for change detection (data_refresh push). Both collections
// are synchronous OS reads — no WC calls are made. Uses raw builders
// (no scoring) so this remains synchronous and zero-latency.
export function refreshHomepageCollectionsForStore(): {
  categories: HomepageCollectionItem[];
  occasions: HomepageCollectionItem[];
} {
  const categories = buildOsCategoriesRaw() ?? [];
  const occasions = buildOsOccasionsRaw() ?? [];
  return { categories, occasions };
}

export default router;
