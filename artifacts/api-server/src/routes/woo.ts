import { Router, type IRouter } from "express";
import { z } from "zod";
import { authenticate } from "../lib/auth";
import {
  WooOrderSchema,
  attemptCreateWcOrder,
  enqueuePendingWcOrder,
  listPendingWooOrders,
  normalizePlatform,
  recordSuccessfulWcOrder,
} from "../lib/wooOrders";
import {
  verifyStripePayment,
  verifyMamoPayment,
  captureAndVerifyPayPalOrder,
} from "../lib/catalog";
import { consumePaymentIntent, verifyCartMatchesSnapshot } from "../lib/checkoutIntents";
import {
  upsertCustomer,
  syncCustomerToWoo,
  getCustomerByWcId,
} from "../lib/customers";
import {
  readStoreContext,
  resolveStoreFromRequest,
  wooAuthHeader,
  type WooStoreConfig,
} from "../lib/wooStore";
import {
  hasOsProducts,
  getOsProducts,
  getOsCategories,
  getOsBrands,
  getOsOccasions,
  getOsProductBySlug,
} from "../lib/osProductsCache";
import type { OSProduct } from "@workspace/presentail-os";

const router: IRouter = Router();

// Narrow subsets of the WooCommerce REST responses we actually read.
// These intentionally model only the fields consumed by this route so a
// schema drift on the WC side surfaces as a typecheck error rather than
// a silent runtime mismatch.
type WcErrorResponse = { message?: string };

type WcMeta = {
  key?: string;
  // WC returns scalar or array values; keep it loose but explicit.
  value?: string | number | boolean | null | Array<string | number>;
};

type WcImage = { src?: string };

type WcProductCategory = {
  id: number;
  name: string;
  slug: string;
};

type WcProduct = {
  id: number;
  slug: string;
  name?: string;
  price?: string;
  short_description?: string;
  stock_status?: string;
  featured?: boolean;
  total_sales?: number;
  images?: WcImage[];
  categories?: WcProductCategory[];
  meta_data?: WcMeta[];
};

type WcBrand = {
  id: number;
  name: string;
  slug: string;
  count?: number;
  description?: string;
  image?: WcImage | null;
};

type WcCategory = {
  id: number;
  name?: string;
  slug: string;
  description?: string;
  image?: WcImage | null;
};

const SUPPORTED_LANGS = ["en", "ar", "fr"] as const;
type Lang = (typeof SUPPORTED_LANGS)[number];

// ── Presentail OS → WcProduct adapter ─────────────────────────────────────
//
// Maps an OSProduct to the internal WcProduct shape so the existing
// isVisibleProduct / isDeliverable / transformProduct pipeline works
// without modification. This is the Phase 2 adapter; Phase 3 will clean
// up the WcProduct type entirely.
function mapOsProductToWcShape(p: OSProduct): WcProduct {
  const meta: WcMeta[] = [];
  if (p.deliverableCountries && p.deliverableCountries.length > 0) {
    meta.push({
      key: "_deliverable_countries",
      value: p.deliverableCountries.join(","),
    });
  }
  if (p.deliverableCities && p.deliverableCities.length > 0) {
    meta.push({
      key: "_deliverable_cities",
      value: p.deliverableCities.join(","),
    });
  }

  // Categories array: combine product categories + occasions so that the
  // existing occasion-products and category-products filtering still works
  // (both read from p.categories[].slug in the WcProduct shape).
  const categories: WcProductCategory[] = [
    ...p.categories.map((c: { name: string; slug: string }, i: number) => ({ id: i + 1, name: c.name, slug: c.slug })),
    ...p.occasions.map((o: { name: string; slug: string }, i: number) => ({ id: 10000 + i, name: o.name, slug: o.slug })),
  ];

  return {
    id: p.wcId ?? 0,
    slug: p.id,
    name: p.name,
    price: String(p.price),
    short_description: p.description,
    stock_status: p.inStock ? "instock" : "outofstock",
    featured: p.featured ?? false,
    total_sales: p.totalSales ?? 0,
    images: p.images.map((img: { url: string }) => ({ src: img.url })),
    categories,
    meta_data: meta,
  };
}

function readLang(req: { query: any }): Lang {
  const raw = typeof req.query?.lang === "string" ? req.query.lang.toLowerCase() : "";
  return (SUPPORTED_LANGS as readonly string[]).includes(raw) ? (raw as Lang) : "en";
}

function withLang(path: string, lang: Lang): string {
  if (lang === "en") return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}lang=${lang}`;
}

async function wooFetch(path: string, options: RequestInit = {}, lang: Lang = "en", store?: WooStoreConfig) {
  const s = store ?? resolveStoreFromRequest({ query: {}, headers: {} });
  return fetch(`${s.baseUrl}${withLang(path, lang)}`, {
    ...options,
    headers: {
      Authorization: wooAuthHeader(s),
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "PresentailApp/1.0",
      ...(options.headers ?? {}),
    },
  });
}

// Translation tables for content that is hardcoded server-side (group labels,
// fallbacks). Product/brand/category names returned by WooCommerce are
// translated upstream by the multilingual plugin via the `lang` query param;
// when a translation is missing, we fall back to the English string.
const OCCASION_GROUP_LABELS: Record<string, Record<Lang, string>> = {
  flowers: { en: "Flowers & Bouquets", ar: "الأزهار والباقات", fr: "Fleurs et bouquets" },
  "hand-bouquets": { en: "Hand Bouquets", ar: "الباقات اليدوية", fr: "Bouquets à la main" },
  "flower-boxes": { en: "Flower Boxes", ar: "صناديق الأزهار", fr: "Boîtes de fleurs" },
  "flower-vases": { en: "Flower Vases", ar: "مزهريات الأزهار", fr: "Vases à fleurs" },
  "lux-arrangements": { en: "Lux Arrangements", ar: "تنسيقات فاخرة", fr: "Compositions de luxe" },
  "dried-flowers": { en: "Dried Flowers", ar: "أزهار مجففة", fr: "Fleurs séchées" },
  "preserved-flowers": { en: "Preserved Flowers", ar: "أزهار محفوظة", fr: "Fleurs préservées" },
  chocolate: { en: "Chocolates", ar: "الشوكولاتة", fr: "Chocolats" },
  cakes: { en: "Cakes & Sweets", ar: "الكعك والحلويات", fr: "Gâteaux et douceurs" },
  "arabic-sweets": { en: "Arabic Sweets", ar: "حلويات عربية", fr: "Pâtisseries orientales" },
  balloons: { en: "Balloons", ar: "البالونات", fr: "Ballons" },
  "stuffed-animals": { en: "Stuffed Animals", ar: "الدمى المحشوة", fr: "Peluches" },
  "board-games": { en: "Board Games", ar: "ألعاب الطاولة", fr: "Jeux de société" },
  plants: { en: "Plants", ar: "النباتات", fr: "Plantes" },
  baskets: { en: "Baskets", ar: "السلال", fr: "Paniers" },
  beauty: { en: "Beauty", ar: "الجمال", fr: "Beauté" },
  bundles: { en: "Gift Bundles", ar: "حزم الهدايا", fr: "Coffrets cadeaux" },
};

function translateOccasionLabel(slug: string, fallback: string, lang: Lang): string {
  const entry = OCCASION_GROUP_LABELS[slug];
  if (!entry) return fallback;
  return entry[lang] ?? entry.en ?? fallback;
}

const CATEGORY_MAP: Record<string, string> = {
  "hand-bouquets": "hand-bouquets",
  "flower-boxes": "flower-boxes",
  "flower-vases": "flower-vases",
  bundles: "bundles",
  baskets: "baskets",
  "lux-arrangements": "lux-arrangements",
  "dried-flowers": "dried-flowers",
  "preserved-flowers": "preserved-flowers",
  plants: "plants",
  balloons: "balloons",
  "board-games": "board-games",
  cakes: "cakes",
  chocolate: "chocolate",
  "arabic-sweets": "arabic-sweets",
  coffee: "coffee",
  "gift-cards": "gift-cards",
  "stuffed-animals": "stuffed-animals",
  "bears-balloons": "bears-balloons",
};

function mapCategory(cats: { id: number; name: string; slug: string }[]): string {
  for (const cat of cats) {
    const mapped = CATEGORY_MAP[cat.slug];
    if (mapped) return mapped;
  }
  return "bundles";
}

type DeliveryFilter = {
  countryCode: string | null;
  cityId: string | null;
};

function readDeliveryFilter(req: { query: any; headers?: any }): DeliveryFilter {
  // Read from query params first, then fall back to headers so that requests
  // routed by x-store-country / x-store-city (same source as resolveStoreFromRequest)
  // receive correct city-level product filtering.
  const country =
    typeof req.query.countryCode === "string"
      ? req.query.countryCode.trim()
      : typeof req.headers?.["x-store-country"] === "string"
        ? req.headers["x-store-country"].trim()
        : "";
  const city =
    typeof req.query.cityId === "string"
      ? req.query.cityId.trim()
      : typeof req.headers?.["x-store-city"] === "string"
        ? req.headers["x-store-city"].trim()
        : "";
  return {
    countryCode: country ? country.toUpperCase() : null,
    cityId: city || null,
  };
}

// Read a per-product deliverability list from WooCommerce meta_data.
function readMetaList(meta: WcMeta[] | undefined, ...keys: string[]): string[] | null {
  if (!Array.isArray(meta)) return null;
  for (const key of keys) {
    const entry = meta.find((m) => m && m.key === key);
    if (!entry) continue;
    const raw = entry.value;
    if (raw == null || raw === "") return null;
    if (Array.isArray(raw)) {
      const list = raw.map((v) => String(v).trim()).filter(Boolean);
      return list.length ? list : null;
    }
    const list = String(raw)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return list.length ? list : null;
  }
  return null;
}

// Slugs of WooCommerce categories that should never surface to clients.
// Products belonging to any of these categories are dropped from every
// product-listing response, even if they live in another category too.
const HIDDEN_CATEGORY_SLUGS = new Set(["electronics", "board-games", "coffee"]);

function isHiddenCategory(slug: string): boolean {
  return HIDDEN_CATEGORY_SLUGS.has(slug);
}

function isVisibleProduct(p: WcProduct): boolean {
  // Treat anything that isn't explicitly in stock as hidden so out-of-
  // stock products can never surface in any listing — direct product
  // links and shared links also rely on this gate via /woo/product.
  // Require an explicit `instock`: a missing / empty `stock_status`
  // counts as hidden so we fail closed when WC doesn't return the field.
  if (p.stock_status !== "instock") return false;
  const slugs = (p.categories ?? []).map((c) => c.slug);
  return !slugs.some((s) => HIDDEN_CATEGORY_SLUGS.has(s));
}

function isDeliverable(p: WcProduct, filter: DeliveryFilter): boolean {
  const countries = readMetaList(p?.meta_data, "_deliverable_countries", "deliverable_countries");
  if (countries && filter.countryCode) {
    const wanted = filter.countryCode.toUpperCase();
    if (!countries.some((c) => c.toUpperCase() === wanted)) return false;
  }
  const cities = readMetaList(p?.meta_data, "_deliverable_cities", "deliverable_cities");
  if (cities && filter.cityId) {
    if (!cities.some((c) => c === filter.cityId)) return false;
  }
  return true;
}

function transformProduct(p: WcProduct, currencySymbol = "$") {
  const price = parseFloat(p.price ?? "") || 0;
  const imageList = (p.images ?? [])
    .map((img) => img?.src)
    .filter((src): src is string => typeof src === "string" && src.length > 0)
    .map((src) => ({ uri: src }));
  const image = imageList[0] ?? null;
  const formattedPrice = currencySymbol.length > 1
    ? `${price.toLocaleString()} ${currencySymbol}`
    : `${currencySymbol}${price.toLocaleString()}`;
  return {
    id: p.slug,
    wcId: p.id,
    name: p.name?.replace(/&#8211;/g, "–").replace(/&amp;/g, "&").replace(/&#8217;/g, "'") ?? "",
    price: formattedPrice,
    priceValue: price,
    image,
    images: imageList,
    category: mapCategory(p.categories ?? []),
    inStock: p.stock_status === "instock",
    description: p.short_description
      ? p.short_description.replace(/<[^>]*>/g, "").trim()
      : undefined,
    tag: p.featured ? "Featured" : undefined,
    occasions: [],
    popularity: typeof p.total_sales === "number" ? p.total_sales : 0,
  };
}

router.get("/woo/brands", async (req, res) => {
  // Serve from OS cache when available.
  const osBrands = getOsBrands();
  if (osBrands) {
    return res.json({
      ok: true,
      brands: osBrands.map((b) => ({
        id: b.slug,
        name: b.name,
        slug: b.slug,
        count: undefined,
        image: b.image ?? null,
      })),
    });
  }

  const store = resolveStoreFromRequest(req);
  if (!store.consumerKey) {
    return res.status(503).json({ ok: false, message: "WooCommerce not configured" });
  }
  try {
    const lang = readLang(req);
    const r = await wooFetch("/products/brands?per_page=100", {}, lang, store);
    if (!r.ok) {
      const err = (await r.json()) as WcErrorResponse;
      return res.status(r.status).json({ ok: false, message: err?.message ?? "Failed to fetch brands" });
    }
    const brands = (await r.json()) as WcBrand[];
    return res.json({
      ok: true,
      brands: brands.map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        count: b.count,
        image: b.image?.src ?? null,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message ?? "Failed to fetch brands" });
  }
});

router.get("/woo/brand-products", async (req, res) => {
  const brandSlug = String(req.query.slug ?? "");
  if (!brandSlug) return res.status(400).json({ ok: false, message: "Missing slug" });

  const store = resolveStoreFromRequest(req);
  // Serve from OS cache when available.
  if (hasOsProducts(store.storeKey)) {
    const osProducts = getOsProducts(store.storeKey)!;
    const filter = readDeliveryFilter(req);
    const osBrands = getOsBrands();
    const brandEntry = osBrands?.find((b) => b.slug === brandSlug);
    const brandName = brandEntry?.name ?? brandSlug;

    const products = osProducts
      .filter((p) => p.brands.some((b) => b.slug === brandSlug))
      .map(mapOsProductToWcShape)
      .filter(isVisibleProduct)
      .filter((p) => isDeliverable(p, filter))
      .map((p) => transformProduct(p, store.currencySymbol));
    return res.json({ ok: true, products, count: products.length, brandName });
  }

  if (!store.consumerKey) {
    return res.status(503).json({ ok: false, message: "WooCommerce not configured" });
  }
  const lang = readLang(req);

  try {
    const brandRes = await wooFetch(
      `/products/brands?slug=${encodeURIComponent(brandSlug)}&per_page=5`,
      {},
      lang,
      store,
    );
    if (!brandRes.ok) {
      return res.status(brandRes.status).json({ ok: false, message: "Failed to lookup brand" });
    }
    const brandList = (await brandRes.json()) as WcBrand[];
    if (!brandList.length) {
      return res.json({ ok: true, products: [], count: 0 });
    }
    const brandId = brandList[0].id;
    const brandName = brandList[0].name;

    const r = await wooFetch(
      `/products?brand=${brandId}&per_page=50&status=publish&stock_status=instock`,
      {},
      lang,
      store,
    );
    if (!r.ok) {
      return res.status(r.status).json({ ok: false, message: "Failed to fetch brand products" });
    }
    const batch = (await r.json()) as WcProduct[];
    const filter = readDeliveryFilter(req);
    const products = batch
      .filter(isVisibleProduct)
      .filter((p) => isDeliverable(p, filter))
      .map((p) => transformProduct(p, store.currencySymbol));
    return res.json({ ok: true, products, count: products.length, brandName });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message ?? "Failed to fetch brand products" });
  }
});

const OCCASION_SLUGS = [
  "birthday", "housewarming", "new-job", "promotion", "thank-you",
  "love-romance", "farewell", "condolences", "anniversary", "wedding",
  "graduation", "newborn", "get-well-soon", "congratulations",
  "colleague", "friend", "thinking-of-you", "im-sorry", "eid", "children",
];

const occasionIdCache = new Map<string, { fetchedAt: number; map: Map<string, number> }>();
const OCCASION_ID_TTL = 5 * 60 * 1000;

export { OCCASION_SLUGS };
export type SupportedLang = Lang;
export const SUPPORTED_LANGS_LIST = SUPPORTED_LANGS;

// Force-refresh the occasion id cache for the given store. Each slug is
// resolved against WooCommerce; failures are swallowed so a single bad
// slug doesn't block the rest. Returns the count of slugs successfully
// (re)cached.
export async function refreshOccasionIdsForStore(
  store: WooStoreConfig,
): Promise<number> {
  occasionIdCache.delete(store.baseUrl);
  let resolved = 0;
  for (const slug of OCCASION_SLUGS) {
    try {
      const id = await resolveOccasionId(slug, "en", store);
      if (id != null) resolved += 1;
    } catch {
      // ignore — best effort
    }
  }
  return resolved;
}

async function resolveOccasionId(
  slug: string, lang: Lang, store: WooStoreConfig,
): Promise<number | null> {
  const cacheKey = store.baseUrl;
  const now = Date.now();
  const cached = occasionIdCache.get(cacheKey);
  if (cached) {
    const slugEntry = cached.map.get(slug);
    if (slugEntry !== undefined && now - cached.fetchedAt < OCCASION_ID_TTL) {
      return slugEntry;
    }
  }
  const r = await wooFetch(
    `/products/categories?slug=${encodeURIComponent(slug)}&per_page=1`,
    {}, lang, store,
  );
  if (!r.ok) return null;
  const cats = (await r.json()) as { id: number; slug: string }[];
  const map = cached?.map ?? new Map<string, number>();
  if (!cats.length) {
    map.set(slug, 0);
    occasionIdCache.set(cacheKey, { fetchedAt: now, map });
    return null;
  }
  map.set(slug, cats[0].id);
  occasionIdCache.set(cacheKey, { fetchedAt: now, map });
  return cats[0].id;
}

const OCCASION_TYPE_CATEGORIES: { slug: string; label: string }[] = [
  { slug: "flowers", label: "Flowers & Bouquets" },
  { slug: "hand-bouquets", label: "Hand Bouquets" },
  { slug: "flower-boxes", label: "Flower Boxes" },
  { slug: "flower-vases", label: "Flower Vases" },
  { slug: "lux-arrangements", label: "Lux Arrangements" },
  { slug: "dried-flowers", label: "Dried Flowers" },
  { slug: "preserved-flowers", label: "Preserved Flowers" },
  { slug: "chocolate", label: "Chocolates" },
  { slug: "cakes", label: "Cakes & Sweets" },
  { slug: "arabic-sweets", label: "Arabic Sweets" },
  { slug: "balloons", label: "Balloons" },
  { slug: "stuffed-animals", label: "Stuffed Animals" },
  { slug: "plants", label: "Plants" },
  { slug: "baskets", label: "Baskets" },
  { slug: "beauty", label: "Beauty" },
  { slug: "bundles", label: "Gift Bundles" },
];

router.get("/woo/category-products", async (req, res) => {
  const slug = String(req.query.slug ?? "");
  if (!slug) return res.status(400).json({ ok: false, message: "Missing slug" });
  if (isHiddenCategory(slug)) {
    return res.json({ ok: true, products: [], count: 0 });
  }

  const store = resolveStoreFromRequest(req);
  // Serve from OS cache when available.
  if (hasOsProducts(store.storeKey)) {
    const osProducts = getOsProducts(store.storeKey)!;
    const filter = readDeliveryFilter(req);
    const osCategories = getOsCategories();
    const catEntry = osCategories?.find((c) => c.slug === slug);
    const catName = catEntry?.name ?? slug;

    const products = osProducts
      .filter((p) => p.categories.some((c) => c.slug === slug))
      .map(mapOsProductToWcShape)
      .filter(isVisibleProduct)
      .filter((p) => isDeliverable(p, filter))
      .map((p) => transformProduct(p, store.currencySymbol));
    return res.json({ ok: true, products, count: products.length, categoryName: catName });
  }

  if (!store.consumerKey) {
    return res.status(503).json({ ok: false, message: "WooCommerce not configured" });
  }
  const lang = readLang(req);
  try {
    const catRes = await wooFetch(
      `/products/categories?slug=${encodeURIComponent(slug)}&per_page=5`,
      {},
      lang,
      store,
    );
    if (!catRes.ok) return res.status(catRes.status).json({ ok: false, message: "Failed to lookup category" });
    const catList = (await catRes.json()) as WcCategory[];
    if (!catList.length) return res.json({ ok: true, products: [], count: 0 });
    const catId = catList[0].id;
    const catName: string = catList[0].name ?? slug;

    const allProducts: WcProduct[] = [];
    let page = 1;
    // Paginate through every in-stock published product in this category.
    // Previously this was capped at 200 items, which silently truncated
    // larger categories (e.g. Cakes in some stores). WooCommerce returns
    // up to 100 per page; stop when a short page is returned.
    while (true) {
      const r = await wooFetch(
        `/products?category=${catId}&per_page=100&page=${page}&status=publish&stock_status=instock`,
        {},
        lang,
        store,
      );
      if (!r.ok) break;
      const batch = (await r.json()) as WcProduct[];
      if (!batch.length) break;
      allProducts.push(...batch);
      if (batch.length < 100) break;
      page++;
      // Hard ceiling to avoid runaway loops on unexpected upstream behavior.
      if (page > 50) break;
    }
    const filter = readDeliveryFilter(req);
    const filtered = allProducts
      .filter(isVisibleProduct)
      .filter((p) => isDeliverable(p, filter));
    return res.json({ ok: true, products: filtered.map((p) => transformProduct(p, store.currencySymbol)), count: filtered.length, categoryName: catName });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message ?? "Failed to fetch category products" });
  }
});

router.get("/woo/occasion-products", async (req, res) => {
  const slug = String(req.query.slug ?? "");
  if (!slug || !OCCASION_SLUGS.includes(slug)) {
    return res.json({ ok: true, groups: [] });
  }

  const store = resolveStoreFromRequest(req);
  // Serve from OS cache when available.
  if (hasOsProducts(store.storeKey)) {
    const osProducts = getOsProducts(store.storeKey)!;
    const filter = readDeliveryFilter(req);
    const lang = readLang(req);

    const deliverable = osProducts
      .filter((p) => p.occasions.some((o) => o.slug === slug))
      .map(mapOsProductToWcShape)
      .filter(isVisibleProduct)
      .filter((p) => isDeliverable(p, filter));

    type TransformedProduct = ReturnType<typeof transformProduct>;
    const groups = new Map<string, { label: string; products: TransformedProduct[] }>();
    const assigned = new Set<number>();

    for (const typecat of OCCASION_TYPE_CATEGORIES) {
      for (const p of deliverable) {
        if (assigned.has(p.id)) continue;
        const slugs = (p.categories ?? []).map((c) => c.slug);
        if (slugs.includes(typecat.slug)) {
          if (!groups.has(typecat.slug)) {
            const label = translateOccasionLabel(typecat.slug, typecat.label, lang);
            groups.set(typecat.slug, { label, products: [] });
          }
          groups.get(typecat.slug)!.products.push(transformProduct(p, store.currencySymbol));
          assigned.add(p.id);
        }
      }
    }

    const result = Array.from(groups.entries()).map(([groupSlug, g]) => ({
      slug: groupSlug,
      label: g.label,
      count: g.products.length,
      products: g.products.slice(0, 10),
    }));
    return res.json({ ok: true, groups: result, total: deliverable.length });
  }

  if (!store.consumerKey) {
    return res.status(503).json({ ok: false, message: "WooCommerce not configured" });
  }
  const lang = readLang(req);

  try {
    const categoryId = await resolveOccasionId(slug, lang, store);
    if (!categoryId) {
      return res.json({ ok: true, groups: [], total: 0 });
    }
    const allProducts: WcProduct[] = [];
    let page = 1;
    while (allProducts.length < 200) {
      const r = await wooFetch(
        `/products?category=${categoryId}&per_page=100&page=${page}&status=publish&stock_status=instock`,
        {},
        lang,
        store,
      );
      if (!r.ok) break;
      const batch = (await r.json()) as WcProduct[];
      if (!batch.length) break;
      allProducts.push(...batch);
      if (batch.length < 100) break;
      page++;
    }

    const filter = readDeliveryFilter(req);
    const deliverable = allProducts
      .filter(isVisibleProduct)
      .filter((p) => isDeliverable(p, filter));

    type TransformedProduct = ReturnType<typeof transformProduct>;
    const groups = new Map<string, { label: string; products: TransformedProduct[] }>();
    const assigned = new Set<number>();

    for (const typecat of OCCASION_TYPE_CATEGORIES) {
      for (const p of deliverable) {
        if (assigned.has(p.id)) continue;
        const slugs = (p.categories ?? []).map((c) => c.slug);
        if (slugs.includes(typecat.slug)) {
          if (!groups.has(typecat.slug)) {
            const label = translateOccasionLabel(typecat.slug, typecat.label, lang);
            groups.set(typecat.slug, { label, products: [] });
          }
          groups.get(typecat.slug)!.products.push(transformProduct(p, store.currencySymbol));
          assigned.add(p.id);
        }
      }
    }

    const result = Array.from(groups.entries()).map(([slug, g]) => ({
      slug,
      label: g.label,
      count: g.products.length,
      products: g.products.slice(0, 10),
    }));

    return res.json({ ok: true, groups: result, total: allProducts.length });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message ?? "Failed to fetch occasion products" });
  }
});

const ALL_PRODUCTS_TTL_MS = 5 * 60 * 1000;
const allProductsCache: Map<string, { fetchedAt: number; products: WcProduct[] }> = new Map();
const allProductsInflight: Map<string, Promise<WcProduct[]>> = new Map();

// Fetch all in-stock published products.
//
// Phase 2 source-of-truth hierarchy (for non-forced calls):
//   1. Presentail OS product cache (primary) — served when the OS poller has
//      successfully fetched at least once for this store's country code.
//   2. WooCommerce (secondary fallback) — consulted when OS has not yet
//      populated for this store AND WC credentials are configured. WC products
//      carry valid numeric wcIds so checkout price verification works correctly
//      in the startup window before OS data is available.
//   3. Static catalog (lib/catalog-data, emergency last-resort) — used only
//      when both OS and WC are unavailable. Static products have no real wcIds
//      so checkout will fail gracefully; they serve as browse-only fallback
//      during a full outage.
//
// force=true path (wooSync warming pass only):
//   Skips the hierarchy above and fetches directly from WooCommerce so the
//   per-store WC product hash used for data_refresh change detection stays
//   current.
export async function fetchAllProducts(
  lang: Lang,
  store: WooStoreConfig,
  opts: { force?: boolean } = {},
): Promise<WcProduct[]> {
  // ── 1. OS cache (primary, country-scoped) ───────────────────────────────
  if (!opts.force && hasOsProducts(store.storeKey)) {
    return getOsProducts(store.storeKey)!.map(mapOsProductToWcShape);
  }

  // ── 2. WooCommerce (secondary fallback or force-refresh) ─────────────────
  //
  // The WC path handles both:
  //  (a) non-forced reads when OS has not yet populated (startup window).
  //  (b) force=true reads from wooSync for hash/cache warming.
  if (store.consumerKey) {
    const cacheKey = `${store.baseUrl}::${lang}`;
    const now = Date.now();
    // Only apply TTL cache for non-forced reads.
    if (!opts.force) {
      const cached = allProductsCache.get(cacheKey);
      if (cached && now - cached.fetchedAt < ALL_PRODUCTS_TTL_MS) return cached.products;
    }
    const existing = allProductsInflight.get(cacheKey);
    if (existing) return existing;
    const promise = (async () => {
      const collected: WcProduct[] = [];
      let page = 1;
      while (true) {
        const r = await wooFetch(
          `/products?per_page=100&page=${page}&status=publish&stock_status=instock`,
          {},
          lang,
          store,
        );
        if (!r.ok) break;
        const batch = (await r.json()) as WcProduct[];
        if (!batch.length) break;
        collected.push(...batch);
        if (batch.length < 100) break;
        page++;
      }
      allProductsCache.set(cacheKey, { fetchedAt: Date.now(), products: collected });
      return collected;
    })().finally(() => {
      allProductsInflight.delete(cacheKey);
    });
    allProductsInflight.set(cacheKey, promise);
    return promise;
  }

  return []; // WC not configured and no force — nothing to return
}

router.get("/woo/products", async (req, res) => {
  const store = resolveStoreFromRequest(req);
  // Allow request to proceed when OS has products, even if WC is not configured.
  if (!store.consumerKey && !hasOsProducts(store.storeKey)) {
    return res.status(503).json({ ok: false, message: "WooCommerce not configured" });
  }
  try {
    const lang = readLang(req);
    const allProducts = await fetchAllProducts(lang, store);
    const filter = readDeliveryFilter(req);
    const products = allProducts
      .filter(isVisibleProduct)
      .filter((p) => isDeliverable(p, filter))
      .map((p) => transformProduct(p, store.currencySymbol));
    return res.json({ ok: true, products, count: products.length });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message ?? "Failed to fetch products" });
  }
});

// GET /api/woo/product?slug=...
//
// Single-product lookup by slug, used primarily by the web app's server-side
// SEO injector to render per-product Open Graph / Twitter Card meta tags so
// that links pasted into WhatsApp, iMessage, Slack, etc. show a rich preview
// (product name, description, image) instead of the generic site-wide one.
// Reuses the cached `fetchAllProducts` result so this is cheap on a warm cache.
router.get("/woo/product", async (req, res) => {
  const slugRaw = req.query.slug;
  const slug = typeof slugRaw === "string" ? slugRaw.trim() : "";
  if (!slug) {
    return res.status(400).json({ ok: false, message: "Missing slug" });
  }

  const store = resolveStoreFromRequest(req);
  // Fast path: look up directly from OS slug index when available.
  if (hasOsProducts(store.storeKey)) {
    const osProduct = getOsProductBySlug(slug, store.storeKey);
    if (!osProduct) {
      return res.status(404).json({ ok: false, message: "Product not found" });
    }
    const wcProduct = mapOsProductToWcShape(osProduct);
    if (!isVisibleProduct(wcProduct)) {
      return res.status(404).json({ ok: false, message: "Product not found" });
    }
    return res.json({
      ok: true,
      product: transformProduct(wcProduct, store.currencySymbol),
    });
  }

  if (!store.consumerKey) {
    return res.status(503).json({ ok: false, message: "WooCommerce not configured" });
  }
  try {
    const lang = readLang(req);
    const allProducts = await fetchAllProducts(lang, store);
    const match = allProducts.find((p) => p.slug === slug);
    if (!match || !isVisibleProduct(match)) {
      return res.status(404).json({ ok: false, message: "Product not found" });
    }
    return res.json({
      ok: true,
      product: transformProduct(match, store.currencySymbol),
    });
  } catch (err: any) {
    return res
      .status(500)
      .json({ ok: false, message: err?.message ?? "Failed to fetch product" });
  }
});

// GET /api/woo/brand?slug=...
//
// Single-brand lookup by slug, used by the web app's server-side SEO injector
// to render brand-specific Open Graph / Twitter Card meta tags so that links
// to `/brand/<slug>` pasted into WhatsApp, iMessage, Slack, etc. show a rich
// preview (brand name, blurb, image) instead of the generic site-wide one.
router.get("/woo/brand", async (req, res) => {
  const slugRaw = req.query.slug;
  const slug = typeof slugRaw === "string" ? slugRaw.trim() : "";
  if (!slug) {
    return res.status(400).json({ ok: false, message: "Missing slug" });
  }

  // Serve from OS cache when available.
  const osBrands = getOsBrands();
  if (osBrands) {
    const b = osBrands.find((brand) => brand.slug === slug);
    if (!b) return res.status(404).json({ ok: false, message: "Brand not found" });
    return res.json({
      ok: true,
      brand: {
        id: b.slug,
        name: b.name,
        slug: b.slug,
        description: b.description ?? "",
        image: b.image ?? null,
      },
    });
  }

  const store = resolveStoreFromRequest(req);
  if (!store.consumerKey) {
    return res.status(503).json({ ok: false, message: "WooCommerce not configured" });
  }
  try {
    const lang = readLang(req);
    const r = await wooFetch(
      `/products/brands?slug=${encodeURIComponent(slug)}&per_page=1`,
      {},
      lang,
      store,
    );
    if (!r.ok) {
      return res.status(r.status).json({ ok: false, message: "Failed to lookup brand" });
    }
    const list = (await r.json()) as WcBrand[];
    if (!list.length) {
      return res.status(404).json({ ok: false, message: "Brand not found" });
    }
    const b = list[0];
    return res.json({
      ok: true,
      brand: {
        id: b.id,
        name: b.name,
        slug: b.slug,
        description: typeof b.description === "string" ? b.description : "",
        image: b.image?.src ?? null,
      },
    });
  } catch (err: any) {
    return res
      .status(500)
      .json({ ok: false, message: err?.message ?? "Failed to fetch brand" });
  }
});

// GET /api/woo/category?slug=...
//
// Single-category lookup by slug, used by the web app's server-side SEO
// injector to render category-specific Open Graph / Twitter Card meta tags
// so that links to category landing pages (e.g. `/shop?n=<slug>`) pasted
// into WhatsApp, iMessage, Slack, etc. show a rich preview (category name,
// blurb, image) instead of the generic site-wide one.
router.get("/woo/category", async (req, res) => {
  const slugRaw = req.query.slug;
  const slug = typeof slugRaw === "string" ? slugRaw.trim() : "";
  if (!slug) {
    return res.status(400).json({ ok: false, message: "Missing slug" });
  }
  if (isHiddenCategory(slug)) {
    return res.status(404).json({ ok: false, message: "Category not found" });
  }

  // Serve from OS cache when available.
  const osCategories = getOsCategories();
  if (osCategories) {
    const c = osCategories.find((cat) => cat.slug === slug);
    if (!c) return res.status(404).json({ ok: false, message: "Category not found" });
    return res.json({
      ok: true,
      category: {
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: "",
        image: null,
      },
    });
  }

  const store = resolveStoreFromRequest(req);
  if (!store.consumerKey) {
    return res.status(503).json({ ok: false, message: "WooCommerce not configured" });
  }
  try {
    const lang = readLang(req);
    const r = await wooFetch(
      `/products/categories?slug=${encodeURIComponent(slug)}&per_page=1`,
      {},
      lang,
      store,
    );
    if (!r.ok) {
      return res.status(r.status).json({ ok: false, message: "Failed to lookup category" });
    }
    const list = (await r.json()) as WcCategory[];
    if (!list.length) {
      return res.status(404).json({ ok: false, message: "Category not found" });
    }
    const c = list[0];
    return res.json({
      ok: true,
      category: {
        id: c.id,
        name: c.name ?? c.slug,
        slug: c.slug,
        description: typeof c.description === "string" ? c.description : "",
        image: c.image?.src ?? null,
      },
    });
  } catch (err: any) {
    return res
      .status(500)
      .json({ ok: false, message: err?.message ?? "Failed to fetch category" });
  }
});

// GET /api/woo/occasion?slug=...
//
// Single-occasion lookup by slug, used by the web app's server-side SEO
// injector to render occasion-specific Open Graph / Twitter Card meta tags
// so that links to occasion landing pages (e.g. `/shop?occasion=<slug>`)
// pasted into WhatsApp, iMessage, Slack, etc. show a rich preview
// (occasion name, blurb, image) instead of the generic site-wide one.
// Restricted to the `OCCASION_SLUGS` allowlist so this can't be turned
// into an arbitrary WooCommerce category enumerator. Warms the shared
// `occasionIdCache` as a side effect so subsequent
// `/api/woo/occasion-products` calls for the same slug are cheaper.
router.get("/woo/occasion", async (req, res) => {
  const slugRaw = req.query.slug;
  const slug = typeof slugRaw === "string" ? slugRaw.trim() : "";
  if (!slug) {
    return res.status(400).json({ ok: false, message: "Missing slug" });
  }
  if (!OCCASION_SLUGS.includes(slug)) {
    return res.status(404).json({ ok: false, message: "Occasion not found" });
  }

  // Serve from OS cache when available.
  const osOccasions = getOsOccasions();
  if (osOccasions) {
    const o = osOccasions.find((occ) => occ.slug === slug);
    if (!o) return res.status(404).json({ ok: false, message: "Occasion not found" });
    return res.json({
      ok: true,
      occasion: {
        id: o.id,
        name: o.name,
        slug: o.slug,
        description: "",
        image: null,
      },
    });
  }

  const store = resolveStoreFromRequest(req);
  try {
    const lang = readLang(req);
    const r = await wooFetch(
      `/products/categories?slug=${encodeURIComponent(slug)}&per_page=1`,
      {},
      lang,
      store,
    );
    if (!r.ok) {
      return res.status(r.status).json({ ok: false, message: "Failed to lookup occasion" });
    }
    const list = (await r.json()) as WcCategory[];
    if (!list.length) {
      return res.status(404).json({ ok: false, message: "Occasion not found" });
    }
    const c = list[0];
    // Warm the occasion id cache so a subsequent /occasion-products call
    // doesn't have to re-resolve the slug → id mapping.
    const cacheKey = store.baseUrl;
    const now = Date.now();
    const cached = occasionIdCache.get(cacheKey);
    const map = cached?.map ?? new Map<string, number>();
    map.set(slug, c.id);
    occasionIdCache.set(cacheKey, { fetchedAt: now, map });
    return res.json({
      ok: true,
      occasion: {
        id: c.id,
        name: c.name ?? c.slug,
        slug: c.slug,
        description: typeof c.description === "string" ? c.description : "",
        image: c.image?.src ?? null,
      },
    });
  } catch (err: any) {
    return res
      .status(500)
      .json({ ok: false, message: err?.message ?? "Failed to fetch occasion" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/woo/order
//
// Security (layered defence):
//
// 1. Payment verification: The server calls the upstream PSP (Stripe, Mamo,
//    PayPal) to confirm the payment is genuinely paid/captured.
//
// 2. Intent binding (payment↔order): When a payment session is created, the
//    server stores a checkout intent that links the paymentRef (provider ID)
//    to the specific orderId. On finalization the intent is consumed (single
//    use) and the orderId must match. This prevents:
//      - Replay attacks: using a paid session for a different/higher-value order.
//      - Cross-order payment substitution.
//
// 3. Catalog prices: Product prices are re-derived from the WooCommerce catalog
//    by wcId. Client-supplied prices are ignored for all financial calculations.
//
// 4. Server-side fees: Delivery fees are computed from an authoritative
//    server-side table; client-supplied districtFee/expressFee are ignored.
// ---------------------------------------------------------------------------
router.post("/woo/order", async (req, res) => {
  const store = resolveStoreFromRequest(req);
  if (!store.consumerKey) {
    return res.status(503).json({ ok: false, message: "WooCommerce not configured" });
  }
  const parsed = WooOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    req.log?.warn?.(
      { issues: parsed.error.issues },
      "woo.order: invalid payload",
    );
    return res
      .status(400)
      .json({ ok: false, message: "Invalid order payload", issues: parsed.error.issues });
  }
  const body = parsed.data;
  const requestPlatform = normalizePlatform(req.header("x-app-platform"));

  // Resolve the owning user from the Authorization header (if any). The
  // legacy `userId` column stores the WC customer id (kept for backward
  // compatibility); the new `customerId` column points at the canonical
  // local customer row in `customers` and is populated below.
  let resolvedUserId: number | null = null;
  const authHeader = req.header("authorization");
  if (authHeader) {
    const auth = await authenticate(authHeader, req);
    if (auth.ok) {
      resolvedUserId = auth.customerId;
    }
  }

  // ── Canonical customer upsert ────────────────────────────────────────
  // Always link the order to a row in our own `customers` table — guest
  // and logged-in alike — so WooCommerce can later be removed without
  // losing customer continuity.
  let resolvedCustomerId: number | null = null;
  let wcCustomerId: number | null = null;
  try {
    // For authenticated requests, prefer the existing local row tied to
    // the auth identity (looked up via wcCustomerId) so we patch it rather
    // than creating a duplicate via email lookup.
    let preferredCustomerId: number | null = null;
    if (resolvedUserId != null) {
      const existing = await getCustomerByWcId(resolvedUserId);
      if (existing) preferredCustomerId = existing.id;
    }

    const upserted = await upsertCustomer({
      email: body.billing.email,
      phone: body.billing.phone,
      firstName: body.billing.firstName,
      lastName: body.billing.lastName,
      country: body.billingCountry ?? body.shippingCountry ?? null,
      city: body.district,
      source: "presentail.com",
      preferredCustomerId,
    });
    resolvedCustomerId = upserted.customer.id;

    // Mirror to WooCommerce so the WC order is properly attached to a
    // customer record (rather than being stored as billing text only).
    try {
      wcCustomerId = await syncCustomerToWoo(resolvedCustomerId, store);
    } catch (syncErr: any) {
      // While WooCommerce is still the order system, this is a hard
      // failure. The local customer row is already saved, so when WC is
      // phased out this branch can be relaxed to "best-effort".
      req.log?.error?.(
        {
          err: syncErr?.message,
          appOrderId: body.orderId,
          customerId: resolvedCustomerId,
        },
        "woo.order: WooCommerce customer sync failed",
      );
      return res.status(502).json({
        ok: false,
        code: "customer_sync_failed",
        message:
          "We saved your details but couldn't link them to your order. Please try again or contact support.",
      });
    }
  } catch (upsertErr: any) {
    req.log?.error?.(
      {
        err: upsertErr?.message,
        appOrderId: body.orderId,
        email: String(body.billing.email ?? "").trim().toLowerCase(),
      },
      "woo.order: customer upsert failed",
    );
    return res.status(500).json({
      ok: false,
      code: "customer_upsert_failed",
      message:
        "We couldn't save your contact details. Please double-check your email and try again.",
    });
  }

  // The WC order is attached to the WC customer mirror id when available.
  // Authenticated requests still take precedence — we keep their existing
  // WC id rather than overwriting it.
  if (resolvedUserId == null && wcCustomerId != null) {
    resolvedUserId = wcCustomerId;
  }

  // ── Payment verification (layered) ────────────────────────────────────
  let paymentVerified = false;
  const paymentRef = body.paymentRef;

  if (body.paymentMethod === "card" || body.paymentMethod === "wallet") {
    if (!paymentRef) {
      return res.status(402).json({
        ok: false,
        code: "payment_reference_required",
        message: "A Stripe session ID (paymentRef) is required for card/wallet payments.",
      });
    }

    // Layer 1: Verify orderId↔paymentRef binding from the checkout intent.
    // This prevents replaying a paid session for a different order.
    const intent = consumePaymentIntent(paymentRef, body.orderId);
    if (!intent) {
      req.log?.warn?.(
        { appOrderId: body.orderId, paymentRef },
        "woo.order: no valid payment intent found for this paymentRef+orderId pair",
      );
      return res.status(402).json({
        ok: false,
        code: "payment_intent_invalid",
        message: "No valid payment session found for this order. Please initiate checkout again.",
      });
    }

    // Layer 1b: Verify the submitted cart matches the canonical cart snapshot
    // stored when the payment session was created. This closes the cart-
    // substitution gap: a client cannot pay for a cheap cart and submit a more
    // expensive one to /woo/order — the wcId+quantity pairs must match exactly.
    const cartMismatch = verifyCartMatchesSnapshot(body.items, intent.snapshot);
    if (cartMismatch) {
      req.log?.warn?.(
        { appOrderId: body.orderId, paymentRef, reason: cartMismatch },
        "woo.order: submitted cart does not match paid-for cart snapshot — rejecting",
      );
      return res.status(402).json({
        ok: false,
        code: "cart_mismatch",
        message: "The submitted cart does not match the paid-for cart. Please initiate checkout again.",
      });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      req.log?.warn?.(
        { appOrderId: body.orderId, paymentRef },
        "woo.order: STRIPE_SECRET_KEY not configured, recording order without set_paid",
      );
    } else {
      // Layer 2: Verify with Stripe that payment_status is "paid" AND that
      // the session's metadata.orderId matches (guards against Stripe-side
      // tampering and confirms the session was created for this order).
      paymentVerified = await verifyStripePayment(paymentRef, body.orderId);
      if (!paymentVerified) {
        req.log?.warn?.(
          { appOrderId: body.orderId, paymentRef },
          "woo.order: Stripe payment not confirmed — rejecting order",
        );
        return res.status(402).json({
          ok: false,
          code: "payment_not_confirmed",
          message: "Payment could not be confirmed with Stripe. Please complete payment before placing the order.",
        });
      }
    }
  } else if (body.paymentMethod === "mamo") {
    if (!paymentRef) {
      return res.status(402).json({
        ok: false,
        code: "payment_reference_required",
        message: "A Mamo payment link ID (paymentRef) is required for Mamo payments.",
      });
    }

    // Layer 1: Verify orderId↔paymentRef binding.
    const intent = consumePaymentIntent(paymentRef, body.orderId);
    if (!intent) {
      req.log?.warn?.(
        { appOrderId: body.orderId, paymentRef },
        "woo.order: no valid Mamo payment intent found for this paymentRef+orderId pair",
      );
      return res.status(402).json({
        ok: false,
        code: "payment_intent_invalid",
        message: "No valid payment session found for this order. Please initiate checkout again.",
      });
    }

    // Layer 1b: Verify cart snapshot — submitted cart AND delivery context
    // must match the paid snapshot. Mamo charges the full total (products +
    // delivery), so a district or express substitution is also fraud.
    const cartMismatch = verifyCartMatchesSnapshot(body.items, intent.snapshot, {
      checkDelivery: true,
      submittedDistrict: body.district,
      submittedExpressDelivery: body.expressFee > 0,
      submittedNoAddress: body.noAddress === true,
    });
    if (cartMismatch) {
      req.log?.warn?.(
        { appOrderId: body.orderId, paymentRef, reason: cartMismatch },
        "woo.order: submitted order does not match paid-for Mamo snapshot — rejecting",
      );
      return res.status(402).json({
        ok: false,
        code: "cart_mismatch",
        message: "The submitted order does not match the paid-for cart. Please initiate checkout again.",
      });
    }

    if (!process.env.MAMO_SECRET_KEY) {
      req.log?.warn?.(
        { appOrderId: body.orderId, paymentRef },
        "woo.order: MAMO_SECRET_KEY not configured, recording order without set_paid",
      );
    } else {
      // Layer 2: Verify with Mamo provider.
      paymentVerified = await verifyMamoPayment(paymentRef);
      if (!paymentVerified) {
        req.log?.warn?.(
          { appOrderId: body.orderId, paymentRef },
          "woo.order: Mamo payment not confirmed — rejecting order",
        );
        return res.status(402).json({
          ok: false,
          code: "payment_not_confirmed",
          message: "Payment could not be confirmed with Mamo. Please complete payment before placing the order.",
        });
      }
    }
  } else if (body.paymentMethod === "paypal") {
    if (!paymentRef) {
      return res.status(402).json({
        ok: false,
        code: "payment_reference_required",
        message: "A PayPal order ID (paymentRef) is required for PayPal payments.",
      });
    }

    // Layer 1: Verify orderId↔paymentRef binding.
    const intent = consumePaymentIntent(paymentRef, body.orderId);
    if (!intent) {
      req.log?.warn?.(
        { appOrderId: body.orderId, paymentRef },
        "woo.order: no valid PayPal payment intent found for this paymentRef+orderId pair",
      );
      return res.status(402).json({
        ok: false,
        code: "payment_intent_invalid",
        message: "No valid payment session found for this order. Please initiate checkout again.",
      });
    }

    // Layer 1b: Verify cart snapshot — submitted cart AND delivery context
    // must match the paid snapshot. PayPal charges the full total (products +
    // delivery), so a district or express substitution is also fraud.
    const cartMismatch = verifyCartMatchesSnapshot(body.items, intent.snapshot, {
      checkDelivery: true,
      submittedDistrict: body.district,
      submittedExpressDelivery: body.expressFee > 0,
      submittedNoAddress: body.noAddress === true,
    });
    if (cartMismatch) {
      req.log?.warn?.(
        { appOrderId: body.orderId, paymentRef, reason: cartMismatch },
        "woo.order: submitted order does not match paid-for PayPal snapshot — rejecting",
      );
      return res.status(402).json({
        ok: false,
        code: "cart_mismatch",
        message: "The submitted order does not match the paid-for cart. Please initiate checkout again.",
      });
    }

    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
      req.log?.warn?.(
        { appOrderId: body.orderId, paymentRef },
        "woo.order: PayPal credentials not configured, recording order without set_paid",
      );
    } else {
      // Layer 2: Capture + verify with PayPal provider.
      paymentVerified = await captureAndVerifyPayPalOrder(paymentRef);
      if (!paymentVerified) {
        req.log?.warn?.(
          { appOrderId: body.orderId, paymentRef },
          "woo.order: PayPal payment capture/verification failed — rejecting order",
        );
        return res.status(402).json({
          ok: false,
          code: "payment_not_confirmed",
          message: "Payment could not be captured with PayPal. Please complete payment before placing the order.",
        });
      }
    }
  }
  // whish / western: offline payments — paymentVerified stays false,
  // WC order will be created with set_paid: false (pending payment).

  const result = await attemptCreateWcOrder(body, {
    paymentVerified,
    wcCustomerId,
    store,
  });

  if (!result.ok) {
    // Payment already succeeded but WC order creation failed. Persist the
    // payload to the reconciliation queue so the worker can keep retrying.
    const storeCtx = readStoreContext(req);
    await enqueuePendingWcOrder({
      body,
      paymentRef: body.paymentRef ?? null,
      userId: resolvedUserId,
      customerId: resolvedCustomerId,
      wcCustomerId,
      errorMessage: result.message,
      paymentVerified,
      storeCountryCode: storeCtx.countryCode,
      storeCityId: storeCtx.cityId,
      platform: requestPlatform,
      log: req.log,
    });
    req.log?.warn?.(
      {
        appOrderId: body.orderId,
        paymentRef: body.paymentRef,
        status: result.status,
        message: result.message,
      },
      "woo.order: WC create failed, queued for reconciliation",
    );
    return res
      .status(result.status)
      .json({ ok: false, message: result.message, queued: true });
  }

  void recordSuccessfulWcOrder({
    body,
    wcOrderId: result.wcOrderId,
    userId: resolvedUserId,
    customerId: resolvedCustomerId,
    recipientName: result.recipientName,
    totalUsdCents: result.totalUsdCents,
    platform: requestPlatform,
    storeKey: store.storeKey,
    log: req.log,
  });

  return res.json({
    ok: true,
    wcOrderId: result.wcOrderId,
    orderKey: result.orderKey,
  });
});

// ---------------------------------------------------------------------------
// Admin: list pending/exhausted reconciliation rows.
// ---------------------------------------------------------------------------
// GET /api/woo/search?q=...
//
// Real-time product and category search backed by the in-memory product cache
// and the static OCCASION_TYPE_CATEGORIES list.  Only fields the UI actually
// renders are returned so the payload stays small.  q must be 2–100 chars;
// results are limited to 10 products and all matching categories.
const SearchQuerySchema = z.object({
  q: z.string().min(2).max(100),
});

router.get("/woo/search", async (req, res) => {
  const parsed = SearchQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: "q must be 2–100 characters" });
  }
  const { q } = parsed.data;
  const lower = q.toLowerCase();

  const store = resolveStoreFromRequest(req);
  // No WC credential guard here — fetchAllProducts handles OS → WC
  // without requiring WC credentials when OS products are available.
  try {
    const lang = readLang(req);
    const allProducts = await fetchAllProducts(lang, store);
    const filter = readDeliveryFilter(req);

    const matchingProducts = allProducts
      .filter(isVisibleProduct)
      .filter((p) => isDeliverable(p, filter))
      .filter((p) => (p.name ?? "").toLowerCase().includes(lower))
      .slice(0, 10)
      .map((p) => {
        const transformed = transformProduct(p, store.currencySymbol);
        return {
          slug: transformed.id,
          name: transformed.name,
          image: transformed.image,
          price: transformed.price,
        };
      });

    const matchingCategories = OCCASION_TYPE_CATEGORIES
      .filter((c) => c.label.toLowerCase().includes(lower))
      .map((c) => ({ slug: c.slug, name: c.label }));

    return res.json({ ok: true, products: matchingProducts, categories: matchingCategories });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message ?? "Search failed" });
  }
});

router.get("/woo/pending-orders", async (req, res) => {
  const adminToken = process.env.PUSH_ADMIN_TOKEN;
  const supplied = req.header("x-admin-token") ?? req.header("x-push-admin-token");
  if (!adminToken || !supplied || supplied !== adminToken) {
    return res
      .status(401)
      .json({ ok: false, message: "Invalid or missing admin token" });
  }
  const rawStatus = typeof req.query.status === "string" ? req.query.status : "";
  const status =
    rawStatus === "pending" || rawStatus === "succeeded" || rawStatus === "exhausted"
      ? rawStatus
      : undefined;
  try {
    const rows = await listPendingWooOrders({ status });
    return res.json({
      ok: true,
      count: rows.length,
      orders: rows.map((r) => ({
        id: r.id,
        appOrderId: r.appOrderId,
        paymentRef: r.paymentRef,
        status: r.status,
        attempts: r.attempts,
        maxAttempts: r.maxAttempts,
        nextAttemptAt: r.nextAttemptAt,
        wcOrderId: r.wcOrderId,
        lastError: r.lastError,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    });
  } catch (err: any) {
    return res
      .status(500)
      .json({ ok: false, message: err?.message ?? "Failed to list pending orders" });
  }
});

export default router;
