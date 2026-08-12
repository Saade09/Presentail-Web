import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import { checkAdminToken } from "../lib/admin-auth";
import { authenticate, resolveAuthenticatedCustomer } from "../lib/auth";
import { sortProducts, type ProductSortMode } from "../lib/productRanking";
import {
  WooOrderSchema,
  attemptCreateOsOrder,
  enqueuePendingWcOrder,
  listPendingWooOrders,
  normalizePlatform,
  recordFailedPaymentAttempt,
  recordSuccessfulWcOrder,
} from "../lib/wooOrders";
import {
  verifyStripePayment,
  verifyStripePaymentIntentPaid,
  fetchStripePaymentIntentDetails,
  resolveCartItems,
  computeDistrictFeeUsd,
  expressSurchargeUsd,
  countryForDistrict,
  verifyMamoPayment,
  captureAndVerifyPayPalOrder,
} from "../lib/catalog";
import { getDeliverySlots, resolveOsDeliveryConfig } from "../lib/osLocationsCache";
import {
  convertFromUsd,
  normalizeCurrency,
  roundToNearestFive,
  toStripeMinorUnits,
} from "../lib/fx";
import {
  consumePaymentIntent,
  peekAndValidatePaymentIntent,
  markPaymentIntentConsumed,
  releasePaymentIntent,
  verifyCartMatchesSnapshot,
} from "../lib/checkoutIntents";
import {
  upsertCustomer,
  syncCustomerToWoo,
} from "../lib/customers";
import { creditReferralRedemption } from "../lib/loyalty";
import { validateCoupon, acquireFirst10Lock, FIRST_ORDER_COUPON_CODE } from "../lib/couponValidation";
import { sendCapiPurchase } from "../lib/fbConversions";
import { sendUaeOrderSlackNotification, type UaeOrderNotification } from "../lib/orderSlackNotify";
import { getOsProductByWcId } from "../lib/osProductsCache";
import { translateProductContent, translateProductNamesBatch, type TranslationLang } from "../lib/productTranslation";
import type { WooOrderPayload } from "../lib/wooOrders";
import type { WooStoreConfig } from "../lib/wooStore";

// Normalise a product name for comparison: decode entities, lowercase,
// collapse whitespace. Used to make sure the image we attach to the Slack
// alert belongs to the product the customer actually ordered.
function normaliseProductName(name: string): string {
  return decodeHtmlEntities(name).toLowerCase().replace(/\s+/g, " ").trim();
}

// Resolve the catalog image for an ordered item, guarding against wrong-product
// matches: a slug/wcId lookup is only trusted when the resolved product's name
// matches the ordered item's name. Otherwise fall back to an exact name search
// in the store's OS catalog. When nothing matches by name, return null — no
// image is safer than the wrong product's image.
function resolveOrderItemImageUrl(
  item: { name: string; wcId?: number; osSlug?: string },
  store: WooStoreConfig,
): string | null {
  const wanted = normaliseProductName(item.name);
  const candidates: (OSProduct | null | undefined)[] = [
    item.osSlug ? getOsProductBySlug(item.osSlug, store.storeKey) : undefined,
    item.osSlug ? getOsProductBySlug(item.osSlug) : undefined,
    item.wcId && item.wcId > 0 ? getOsProductByWcId(item.wcId, store.storeKey) : undefined,
  ];
  for (const p of candidates) {
    if (p && normaliseProductName(p.name) === wanted) {
      return p.images?.[0]?.url ?? null;
    }
  }
  // Name-based fallback: exact (normalised) name match in the store's catalog.
  const all = getOsProducts(store.storeKey) ?? getOsProducts() ?? [];
  const byName = all.find((p) => normaliseProductName(p.name) === wanted);
  return byName?.images?.[0]?.url ?? null;
}

// Build the Slack notification payload for a UAE order from the validated
// order body, resolving product images from the OS catalog cache.
function buildUaeOrderNotification(
  body: WooOrderPayload,
  store: WooStoreConfig,
  extras: { osOrderId?: number | string | null; totalUsd?: number | null; chargedCurrency?: string | null },
): UaeOrderNotification {
  return {
    orderId: body.orderId,
    osOrderId: extras.osOrderId ?? null,
    customerName: `${body.billing.firstName} ${body.billing.lastName}`.trim(),
    customerPhone: body.billing.phone,
    recipientName: `${body.recipient.firstName} ${body.recipient.lastName}`.trim(),
    recipientPhone: body.recipient.phone,
    address: body.noAddress
      ? "Contact recipient for address"
      : body.deliveryDetails || undefined,
    district: body.district,
    deliveryDate: body.deliveryDate || undefined,
    deliverySlot: body.deliverySlot || undefined,
    cardMessage: body.cardMessage,
    cardTo: body.cardTo,
    cardFrom: body.cardFrom,
    totalUsd: extras.totalUsd ?? null,
    chargedCurrency: extras.chargedCurrency ?? null,
    items: body.items.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      imageUrl: resolveOrderItemImageUrl(i, store),
    })),
  };
}
import { db, pool, appOrdersTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import {
  resolveStoreFromRequest,
} from "../lib/wooStore";
import { getLocalIso } from "@workspace/delivery";
import {
  getOsProducts,
  getOsCategories,
  getOsBrands,
  getOsRawCatalogBrands,
  getOsOccasions,
  getOsProductOccasions,
  getOsProductBySlug,
  getCachedBestSellerIds,
  getOsBrandNameToCanonicalSlug,
  normaliseBrandName,
} from "../lib/osProductsCache";
import type { OSProduct, OSCatalogAttributeBrand } from "@workspace/presentail-os";
import { getCustomerById } from "../lib/customers";

const router: IRouter = Router();

// Narrow subset of the WooCommerce-shaped response used internally.
// mapOsProductToWcShape converts Presentail OS products into this shape
// so the isVisibleProduct / isDeliverable / transformProduct pipeline
// keeps working without modification.

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
  /** Raw OS numeric DB primary key. Passed through so the web app can call the
   *  single-product pricing proxy without a VITE_OS_API_KEY in the browser. */
  osNumericId?: number | string;
  name?: string;
  price?: string;
  short_description?: string;
  stock_status?: string;
  featured?: boolean;
  total_sales?: number;
  images?: WcImage[];
  categories?: WcProductCategory[];
  meta_data?: WcMeta[];
  brandNames?: string[];
  occasionNames?: string[];
  categoryNames?: string[];
  hasInputField?: boolean;
  hasLetterField?: boolean;
  personalisationRequired?: boolean;
  discountPriceValue?: number | null;
  discountPriceAed?: number | null;
  isBestSeller?: boolean;
};

const SUPPORTED_LANGS = ["en", "ar", "fr"] as const;
type Lang = (typeof SUPPORTED_LANGS)[number];

// Products that support a single-letter personalisation input.
// Used as a fallback until the OS API surfaces the `hasLetterField` flag.
const LETTER_INPUT_PRODUCT_NAMES = ["red letter box", "pink letter box"];

// ── Presentail OS → WcProduct adapter ─────────────────────────────────────
//
// Maps an OSProduct to the internal WcProduct shape so the existing
// isVisibleProduct / isDeliverable / transformProduct pipeline works
// without modification. This is the Phase 2 adapter; Phase 3 will clean
// up the WcProduct type entirely.
/**
 * Decode HTML entities that WooCommerce (and Presentail OS, which is WC-powered)
 * HTML-encodes in API text fields. Applied to product names, brand names,
 * category names, occasion names, and short descriptions (after HTML tags have
 * already been stripped).
 */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#8216;/g, "\u2018")
    .replace(/&#8217;/g, "\u2019")
    .replace(/&#8220;/g, "\u201C")
    .replace(/&#8221;/g, "\u201D")
    .replace(/&#8211;/g, "\u2013")
    .replace(/&#8212;/g, "\u2014")
    .replace(/&#8230;/g, "\u2026")
    .replace(/&nbsp;/g, "\u00A0");
}

export function mapOsProductToWcShape(p: OSProduct): WcProduct {
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
    ...p.categories.map((c: { name: string; slug: string }, i: number) => ({ id: i + 1, name: decodeHtmlEntities(c.name), slug: c.slug })),
    ...p.occasions.map((o: { name: string; slug: string }, i: number) => ({ id: 10000 + i, name: decodeHtmlEntities(o.name), slug: o.slug })),
  ];

  function parseDiscountField(raw: string | null | undefined): number | null {
    if (raw == null || raw === "" || raw === "0") return null;
    const n = parseFloat(raw);
    return isFinite(n) && n > 0 ? n : null;
  }

  // Prefer OS-native regular_price / sale_price pair over legacy discount fields.
  // regular_price is the crossed-out "was" price; the active sale price is resolved as:
  //   1. sale_price (explicit field), if valid and < regular_price
  //   2. p.price (WooCommerce always sets `price` = active selling price), if < regular_price
  //   3. No discount (regular_price == p.price means no actual sale is active)
  // When regular_price is absent, fall back to legacy discount_price_usd.
  const regularPriceValue = parseDiscountField(p.regular_price);
  const salePriceField = parseDiscountField(p.sale_price);

  const basePrice =
    regularPriceValue != null && regularPriceValue > 0 ? regularPriceValue : p.price;

  let discountPriceValue: number | null;
  if (regularPriceValue != null && regularPriceValue > 0) {
    if (salePriceField != null && salePriceField > 0 && salePriceField < regularPriceValue) {
      discountPriceValue = salePriceField;
    } else if (p.price > 0 && p.price < regularPriceValue) {
      // p.price is the WooCommerce active selling price — already the discounted price
      discountPriceValue = p.price;
    } else {
      discountPriceValue = null;
    }
  } else {
    discountPriceValue = parseDiscountField(p.discount_price_usd);
  }

  return {
    id: p.wcId ?? 0,
    // p.id is the slug (normalised by fetchOsProducts in lib/presentail-os).
    slug: p.id,
    osNumericId: p.osNumericId,
    name: decodeHtmlEntities(p.name),
    price: String(basePrice),
    short_description: p.description,
    stock_status: p.inStock ? "instock" : "outofstock",
    featured: p.featured ?? false,
    total_sales: p.totalSales ?? 0,
    images: p.images.map((img: { url: string }) => ({
      src: img.url,
    })),
    categories,
    meta_data: meta,
    brandNames: p.brands.map((b) => decodeHtmlEntities(b.name)),
    occasionNames: p.occasions.map((o: { name: string; slug: string }) => decodeHtmlEntities(o.name)),
    categoryNames: p.categories.map((c: { name: string; slug: string }) => decodeHtmlEntities(c.name)),
    hasInputField: p.hasInputField ?? false,
    hasLetterField: p.hasLetterField ?? LETTER_INPUT_PRODUCT_NAMES.includes(p.name.toLowerCase().trim()),
    personalisationRequired: p.personalisationRequired ?? false,
    discountPriceValue,
    discountPriceAed: parseDiscountField(p.discount_price_aed),
    isBestSeller: p.isBestSeller ?? false,
  };
}

function readLang(req: { query: any }): Lang {
  const raw = typeof req.query?.lang === "string" ? req.query.lang.toLowerCase() : "";
  return (SUPPORTED_LANGS as readonly string[]).includes(raw) ? (raw as Lang) : "en";
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
  "other-gifts": { en: "Other Gifts", ar: "هدايا أخرى", fr: "Autres cadeaux" },
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

// Slugs of OS/WooCommerce categories that are treated as internal-only tags.
// A product is hidden only when ALL of its categories are in this set — i.e.
// it has no visible category at all. Products that carry one of these slugs
// alongside a visible category are still surfaced, because the visible category
// is the meaningful classification.
const HIDDEN_CATEGORY_SLUGS = new Set(["board-games", "coffee"]);

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
  // Show the product unless every category it belongs to is a hidden tag.
  // Products with at least one visible category (e.g. "bundles") are surfaced
  // even when they also carry an internal tag like "electronics". Only
  // products whose entire category set is hidden are suppressed.
  const hasVisibleCategory = slugs.some((s) => !HIDDEN_CATEGORY_SLUGS.has(s));
  return slugs.length === 0 || hasVisibleCategory;
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

const VALID_SORT_MODES = new Set<ProductSortMode>([
  "recommended", "best_sellers", "newest", "price_asc", "price_desc",
]);

function readSortMode(req: Request): ProductSortMode {
  const raw = typeof req.query.sort === "string" ? req.query.sort : "";
  return VALID_SORT_MODES.has(raw as ProductSortMode)
    ? (raw as ProductSortMode)
    : "recommended";
}

/**
 * Sort WC-shaped products (after mapOsProductToWcShape + visibility/delivery
 * filters, before transformProduct) using the composite ranking engine.
 *
 * WcProduct uses `total_sales` (number) and `price` (string) so we adapt
 * before delegating to sortProducts, then map back to original WcProduct
 * references by building a sorted-index list.
 */
function sortOsShapedProducts(products: WcProduct[], mode: ProductSortMode): WcProduct[] {
  if (products.length === 0) return products;
  const adaptable = products.map((p, originalIndex) => ({
    totalSales: p.total_sales,
    osNumericId: p.osNumericId,
    featured: p.featured,
    price: parseFloat(p.price ?? "") || 0,
    _originalIndex: originalIndex,
  }));
  const sorted = sortProducts(adaptable, mode);
  return sorted.map((a) => products[a._originalIndex]!);
}

/**
 * Apply batch name translations to a list of transformed products.
 * Returns a new array with translated names; falls back to English on any error.
 * Only called when lang is "ar" or "fr".
 */
async function applyProductNameTranslations<
  T extends { name: string; osNumericId?: number | string },
>(products: T[], lang: "ar" | "fr"): Promise<T[]> {
  const items = products
    .filter((p) => p.osNumericId != null)
    .map((p) => ({
      osNumericId: p.osNumericId as number | string,
      name: p.name,
    }));
  if (items.length === 0) return products;
  const translations = await translateProductNamesBatch(items, lang as TranslationLang);
  return products.map((p) => {
    if (p.osNumericId == null) return p;
    const translated = translations.get(String(p.osNumericId));
    return translated ? { ...p, name: translated } : p;
  });
}

export function transformProduct(p: WcProduct, currencySymbol = "$") {
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
    osNumericId: p.osNumericId,
    wcId: p.id,
    name: p.name ? decodeHtmlEntities(p.name) : "",
    price: formattedPrice,
    priceValue: price,
    image,
    images: imageList,
    category: mapCategory(p.categories ?? []),
    categories: (p.categories ?? [])
      .filter((c) => c.id < 10000)
      .map((c) => c.slug),
    inStock: p.stock_status === "instock",
    description: p.short_description
      ? decodeHtmlEntities(p.short_description.replace(/<[^>]*>/g, "").trim())
      : undefined,
    tag: p.featured ? "Featured" : undefined,
    occasions: (p.categories ?? [])
      .filter((c) => c.id >= 10000)
      .map((c) => c.slug),
    brandNames: p.brandNames ?? [],
    occasionNames: p.occasionNames ?? [],
    categoryNames: p.categoryNames ?? [],
    popularity: typeof p.total_sales === "number" ? p.total_sales : 0,
    hasInputField: p.hasInputField ?? false,
    hasLetterField: p.hasLetterField ?? false,
    personalisationRequired: p.personalisationRequired ?? false,
    discountPriceValue: p.discountPriceValue ?? null,
    discountPriceAed: p.discountPriceAed ?? null,
    isBestSeller: p.isBestSeller ?? false,
  };
}

router.get("/woo/brands", (_req, res) => {
  // Brands are served exclusively from the Presentail OS cache.
  // The WooCommerce fallback has been retired — add/manage brands in OS.
  const osBrands = getOsBrands() ?? [];
  if (!osBrands) {
    return res.status(503).json({ ok: false, message: "OS catalog not yet available" }); // i18n-ignore
  }
  const rawBrands = getOsRawCatalogBrands();
  return res.json({
    ok: true,
    brands: osBrands.map((b) => {
      const rawBrandEntry = rawBrands?.find((rb: OSCatalogAttributeBrand) => rb.slug === b.slug);
      // OS API returns banner_image_url (absolute CDN URL); cover_image is a
      // forward-compat alias kept for potential future OS API versions.
      const cover_image = rawBrandEntry?.banner_image_url ?? rawBrandEntry?.cover_image ?? null;
      return {
        id: b.slug,
        name: decodeHtmlEntities(b.name),
        slug: b.slug,
        image: b.image ?? null,
        cover_image,
      };
    }),
  });
});

router.get("/woo/brand-products", async (req, res) => {
  const brandSlug = String(req.query.slug ?? "");
  if (!brandSlug) return res.status(400).json({ ok: false, message: "Missing slug" }); // i18n-ignore

  const store = resolveStoreFromRequest(req);
  const osProducts = getOsProducts(store.storeKey) ?? [];
  const filter = readDeliveryFilter(req);
  const lang = readLang(req);
  const osBrands = getOsBrands() ?? [];
  const rawBrands = getOsRawCatalogBrands();
  const brandEntry = osBrands?.find((b) => b.slug === brandSlug);
  const rawBrandEntry = rawBrands?.find((b: OSCatalogAttributeBrand) => b.slug === brandSlug);
  const brandName = brandEntry ? decodeHtmlEntities(brandEntry.name) : brandSlug;
  const brandImage = brandEntry?.image ?? null;
  const brandDescription = brandEntry?.description ? decodeHtmlEntities(brandEntry.description) : null;
  const brandCoverImage: string | null =
    rawBrandEntry?.banner_image_url ?? rawBrandEntry?.cover_image ?? rawBrandEntry?.image_public_url ?? null;

  const sortMode = readSortMode(req);
  const browseFilter: DeliveryFilter = { countryCode: filter.countryCode, cityId: null };
  // Use the persisted best-seller ID set rather than relying solely on the
  // in-place p.isBestSeller annotation on each OSProduct.  The annotation is
  // written during the cache-refresh cycle; between a fresh product fetch and
  // the completion of the DB sales query, p.isBestSeller may still be
  // undefined (defaulting to false in mapOsProductToWcShape).
  // getCachedBestSellerIds() is a module-level Set that survives across refresh
  // cycles — it retains the IDs from the previous cycle until the new
  // annotation completes — so using it here ensures badges are correct even
  // while a refresh is in-flight.
  const bestSellerIds = getCachedBestSellerIds();
  // Brand slug lookup: resolve product-embedded brand names to canonical catalog-attribute
  // slugs so products are not missed when the embedded slug differs from the canonical one
  // (e.g. product brand slug "hallab" vs catalog slug "hallab-1881").
  const brandNameToCanonical = getOsBrandNameToCanonicalSlug();
  // Filter OS products to those belonging to this brand before mapping.
  // The brandNameToCanonical map is keyed by normaliseBrandName(b.name) so
  // we must normalise the embedded brand name — not the embedded slug — to
  // resolve mismatches (e.g. product brand slug "hallab" → catalog "hallab-1881").
  const brandOsProducts = osProducts.filter((p) =>
    p.brands.some((b) => {
      if (b.slug === brandSlug) return true;
      const canonical = brandNameToCanonical?.get(normaliseBrandName(b.name)) ?? b.slug;
      return canonical === brandSlug;
    }),
  );
  const eligible = brandOsProducts
    .map(mapOsProductToWcShape)
    .filter(isVisibleProduct)
    .filter((p) => isDeliverable(p, browseFilter));
  let products = sortOsShapedProducts(eligible, sortMode)
    .map((p) => transformProduct(p, store.currencySymbol))
    // Override isBestSeller from the persisted best-seller ID set: the
    // in-place p.isBestSeller annotation can be stale/undefined while a
    // cache refresh is in-flight, so the Set is authoritative here.
    .map((p) => ({ ...p, isBestSeller: bestSellerIds.has(String(p.id)) }));
  if (lang === "ar" || lang === "fr") {
    products = await applyProductNameTranslations(products, lang);
  }
  return res.json({ ok: true, products, count: products.length, brandName, brandImage, brandDescription, brandCoverImage });
});

const OCCASION_SLUGS = [
  "birthday", "housewarming", "new-job", "promotion", "thank-you",
  "love-romance", "farewell", "condolences", "anniversary", "wedding",
  "graduation", "newborn", "get-well-soon", "congratulations",
  "colleague", "friend", "thinking-of-you", "im-sorry", "eid", "ramadan",
  "children",
];

const OCCASION_LABELS: Record<string, string> = {
  "birthday": "Birthday",
  "housewarming": "Housewarming",
  "new-job": "New Job",
  "promotion": "Promotion",
  "thank-you": "Thank You",
  "love-romance": "Love & Romance",
  "farewell": "Farewell",
  "condolences": "Condolences",
  "anniversary": "Anniversary",
  "wedding": "Wedding",
  "graduation": "Graduation",
  "newborn": "Newborn",
  "get-well-soon": "Get Well Soon",
  "congratulations": "Congratulations",
  "colleague": "Colleague",
  "friend": "Friend",
  "thinking-of-you": "Thinking of You",
  "im-sorry": "I'm Sorry",
  "eid": "Eid",
  "ramadan": "Ramadan",
  "children": "Children",
};

export { OCCASION_SLUGS };
export type SupportedLang = Lang;
export const SUPPORTED_LANGS_LIST = SUPPORTED_LANGS;

const OCCASION_TYPE_CATEGORIES: { slug: string; label: string }[] = [
  { slug: "flowers", label: "Flowers & Bouquets" },
  // OS uses "roses-bouquets" and "hand-bouquet" (singular) for bouquet products
  { slug: "roses-bouquets", label: "Flowers & Bouquets" },
  { slug: "hand-bouquets", label: "Hand Bouquets" },
  { slug: "hand-bouquet", label: "Hand Bouquets" },
  { slug: "flower-boxes", label: "Flower Boxes" },
  { slug: "flower-vases", label: "Flower Vases" },
  // OS uses "vases" for vase products
  { slug: "vases", label: "Flower Vases" },
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
  // OS uses "gift-baskets" for basket products
  { slug: "gift-baskets", label: "Baskets" },
  { slug: "beauty", label: "Beauty" },
  { slug: "bundles", label: "Gift Bundles" },
];

router.get("/woo/category-products", async (req, res) => {
  const slugRaw = req.query.slug;
  const slug = typeof slugRaw === "string" ? slugRaw.trim() : "";
  if (!slug) {
    return res.status(400).json({ ok: false, message: "Missing slug" }); // i18n-ignore
  }

  const store = resolveStoreFromRequest(req);
  const osProducts = getOsProducts(store.storeKey) ?? [];
  const filter = readDeliveryFilter(req);
  const sortMode = readSortMode(req);
  const lang = readLang(req);
  const browseFilter: DeliveryFilter = { countryCode: filter.countryCode, cityId: null };
  const osCategories = getOsCategories();
  const catEntry = osCategories?.find((c) => c.slug === slug);
  const catName = catEntry?.name ?? slug;

  const eligible = osProducts
    .map(mapOsProductToWcShape)
    .filter(isVisibleProduct)
    .filter((p) => isDeliverable(p, browseFilter))
    // Filter to products that belong to the requested category.
    .filter((p) => (p.categories ?? []).some((c) => c.slug === slug));
  let allProducts = sortOsShapedProducts(eligible, sortMode)
    .map((p) => transformProduct(p, store.currencySymbol));
  if (lang === "ar" || lang === "fr") {
    allProducts = await applyProductNameTranslations(allProducts, lang);
  }
  const count = allProducts.length;

  // When `page` is explicitly provided (SEO injector for page 2+ noscript lists),
  // return the correct 24-item slice. Without it, return the full list so existing
  // SPA clients that expect all products are unaffected.
  const pageSize = 24;
  const pageParam = req.query.page;
  if (pageParam !== undefined) {
    const pageRaw = Number(pageParam);
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
    const offset = (page - 1) * pageSize;
    const products = allProducts.slice(offset, offset + pageSize);
    return res.json({ ok: true, products, count, categoryName: catName });
  }
  return res.json({ ok: true, products: allProducts, count, categoryName: catName });
});

router.get("/woo/occasion-products", async (req, res) => {
  const slugRaw = req.query.slug;
  const slug = typeof slugRaw === "string" ? slugRaw.trim() : "";
  if (!slug) {
    return res.json({ ok: true, groups: [] });
  }
  // Validate against live OS occasions (warm cache). Also accept slugs that
  // appear on products even when no formal occasion catalog entry exists
  // (e.g. products tagged "ramadan" before the OS admin creates the occasion).
  // Fall back to the static OCCASION_SLUGS list on cold start.
  const liveOccasions = getOsOccasions();
  const productOccasions = getOsProductOccasions();
  const validSlug = liveOccasions
    ? liveOccasions.some((o) => o.slug === slug) || productOccasions.has(slug)
    : OCCASION_SLUGS.includes(slug);
  if (!validSlug) {
    return res.json({ ok: true, groups: [] });
  }

  const store = resolveStoreFromRequest(req);
  const osProducts = getOsProducts(store.storeKey) ?? [];
  const filter = readDeliveryFilter(req);
  const lang = readLang(req);
  const sortMode = readSortMode(req);
  // Product listings filter by country only. City-level delivery restrictions
  // are enforced at checkout — not at browse time — because OS city IDs may not
  // match the web app's city slug format, which would incorrectly exclude all
  // products for unrecognised city slugs (e.g. "lb-akkar").
  const browseFilter: DeliveryFilter = { countryCode: filter.countryCode, cityId: null };
  const deliverable = osProducts
    .filter((p) => p.occasions.some((o) => o.slug === slug))
    .map(mapOsProductToWcShape)
    .filter(isVisibleProduct)
    .filter((p) => isDeliverable(p, browseFilter));

  // Apply sort before grouping so ranking is consistent within each group.
  const ranked = sortOsShapedProducts(deliverable, sortMode);

  // Transform ALL ranked products upfront so we can translate them in one
  // batch call and use the same translated set for both groups and pageItems.
  type TransformedProduct = ReturnType<typeof transformProduct>;
  let allTransformedProducts: TransformedProduct[] = ranked.map((p) =>
    transformProduct(p, store.currencySymbol),
  );

  // Translate product names when lang=ar|fr — one batch covers both the
  // grouped response and the pageItems SEO slice.
  if (lang === "ar" || lang === "fr") {
    const itemsToTranslate = allTransformedProducts
      .filter((p) => p.osNumericId != null)
      .map((p) => ({ osNumericId: p.osNumericId as number | string, name: p.name }));
    if (itemsToTranslate.length > 0) {
      const translations = await translateProductNamesBatch(itemsToTranslate, lang as TranslationLang);
      allTransformedProducts = allTransformedProducts.map((p) => {
        if (p.osNumericId == null) return p;
        const translated = translations.get(String(p.osNumericId));
        return translated ? { ...p, name: translated } : p;
      });
    }
  }

  // Build a slug → translated product index for O(1) group lookups.
  const transformedBySlug = new Map<string, TransformedProduct>(
    allTransformedProducts.map((p) => [p.id, p]),
  );

  // pageItems: correct 24-item slice for noscript/SEO crawlers.
  // Only included when `page` is explicitly provided.
  const pageSize = 24;
  const pageParam = req.query.page;
  const pageItems =
    pageParam !== undefined
      ? (() => {
          const pageRaw = Number(pageParam);
          const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
          const offset = (page - 1) * pageSize;
          return allTransformedProducts.slice(offset, offset + pageSize);
        })()
      : undefined;

  const groups = new Map<string, { label: string; products: TransformedProduct[] }>();
  const assigned = new Set<string>();

  for (const typecat of OCCASION_TYPE_CATEGORIES) {
    for (const p of ranked) {
      if (assigned.has(p.slug)) continue;
      const slugs = (p.categories ?? []).map((c) => c.slug);
      if (slugs.includes(typecat.slug)) {
        if (!groups.has(typecat.slug)) {
          const label = translateOccasionLabel(typecat.slug, typecat.label, lang);
          groups.set(typecat.slug, { label, products: [] });
        }
        // Use the pre-translated product from the index.
        const transformed = transformedBySlug.get(p.slug) ?? transformProduct(p, store.currencySymbol);
        groups.get(typecat.slug)!.products.push(transformed);
        assigned.add(p.slug);
      }
    }
  }

  // Catch-all: products tagged with this occasion but not matching any known
  // OCCASION_TYPE_CATEGORIES slug (e.g. rings, accessories, candles, or any
  // future category added in OS without a matching entry here).
  const unassigned = ranked.filter((p) => !assigned.has(p.slug));
  if (unassigned.length > 0) {
    const catchAllLabel = translateOccasionLabel("other-gifts", "Other Gifts", lang);
    groups.set("other-gifts", {
      label: catchAllLabel,
      products: unassigned.map(
        (p) => transformedBySlug.get(p.slug) ?? transformProduct(p, store.currencySymbol),
      ),
    });
  }

  const groupsArr = Array.from(groups.entries()).map(([groupSlug, g]) => ({
    slug: groupSlug,
    ...g,
  }));
  const totalReturned = groupsArr.reduce((sum, g) => sum + g.products.length, 0);
  return res.json({ ok: true, groups: groupsArr, total: totalReturned, pageItems });
});


router.get("/woo/products", async (req, res) => {
  const store = resolveStoreFromRequest(req);
  const osProducts = getOsProducts(store.storeKey) ?? [];
  const filter = readDeliveryFilter(req);
  const sortMode = readSortMode(req);
  const lang = readLang(req);
  // Product listings filter by country only. City-level delivery restrictions
  // are enforced at checkout — not at browse time — because OS city IDs may not
  // match the web app's city slug format, which would incorrectly exclude all
  // products for unrecognised city slugs (e.g. "lb-akkar").
  const browseFilter: DeliveryFilter = { countryCode: filter.countryCode, cityId: null };
  const eligible = osProducts
    .map(mapOsProductToWcShape)
    .filter(isVisibleProduct)
    .filter((p) => isDeliverable(p, browseFilter));
  let products = sortOsShapedProducts(eligible, sortMode)
    .map((p) => transformProduct(p, store.currencySymbol));
  if (lang === "ar" || lang === "fr") {
    products = await applyProductNameTranslations(products, lang);
  }
  return res.json({ ok: true, products, count: products.length });
});

// GET /api/woo/product?slug=...&lang=ar|fr|en
//
// Single-product lookup by slug, used primarily by the web app's server-side
// SEO injector to render per-product Open Graph / Twitter Card meta tags so
// that links pasted into WhatsApp, iMessage, Slack, etc. show a rich preview
// (product name, description, image) instead of the generic site-wide one.
//
// When lang=ar or lang=fr the product name and description are automatically
// translated via the OpenAI API (same credentials as banner translation) and
// cached in-process with a 7-day TTL so each product is only translated once.
// Falls back to English transparently on any translation error.
router.get("/woo/product", async (req, res) => {
  const slugRaw = req.query.slug;
  const slug = typeof slugRaw === "string" ? slugRaw.trim() : "";
  if (!slug) {
    return res.status(400).json({ ok: false, message: "Missing slug" }); // i18n-ignore
  }

  const store = resolveStoreFromRequest(req);
  const osProduct = getOsProductBySlug(slug, store.storeKey);
  if (!osProduct) {
    return res.status(404).json({ ok: false, message: "Product not found" }); // i18n-ignore
  }
  const wcProduct = mapOsProductToWcShape(osProduct);
  if (!isVisibleProduct(wcProduct)) {
    return res.status(404).json({ ok: false, message: "Product not found" }); // i18n-ignore
  }

  const product = transformProduct(wcProduct, store.currencySymbol);
  const lang = readLang(req);

  if (lang === "ar" || lang === "fr") {
    // Translate name + description in one cached API call.
    // translateProductContent never throws — returns English on any failure.
    const translated = await translateProductContent(
      product.osNumericId ?? osProduct.id,
      lang as TranslationLang,
      product.name,
      product.description ?? "",
    );
    return res.json({
      ok: true,
      product: {
        ...product,
        name: translated.name,
        // Only override description when we actually got a translated string
        // (translateProductContent returns "" when the English was also empty).
        ...(translated.description ? { description: translated.description } : {}),
      },
    });
  }

  return res.json({ ok: true, product });
});

// GET /api/woo/product-pricing/:osId
//
// Server-side proxy for the OS single-product pricing endpoint.
// The browser cannot call OS directly when VITE_OS_API_KEY is absent
// (no browser-side API key), so the web app routes through here instead.
// Returns only the pricing fields needed for the slash-price display:
//   { ok, regularPriceUsd, discountPriceUsd, discountPriceAed }
// regularPriceUsd is non-null only when the modern regular_price/sale_price
// scheme is active (i.e. the product has an OS-configured sale with a
// crossed-out "was" price).
router.get("/woo/product-pricing/:osId", async (req, res) => {
  const { osId } = req.params;
  if (!osId || !/^\d+$/.test(osId)) {
    return res.status(400).json({ ok: false, message: "Invalid osId" }); // i18n-ignore
  }

  const apiKey = process.env.PRESENTAIL_OS_API_KEY ?? "";
  const baseUrl = process.env.PRESENTAIL_OS_API_URL ?? "https://os.presentail.com";
  const workspace = process.env.PRESENTAIL_OS_WORKSPACE ?? "presentail";

  if (!apiKey) {
    return res.status(503).json({ ok: false, message: "OS API key not configured" }); // i18n-ignore
  }

  try {
    const url = new URL(`${baseUrl}/api/products/${osId}`);
    url.searchParams.set("workspace", workspace);
    url.searchParams.set("apiKey", apiKey);

    const osRes = await fetch(url.toString(), {
      headers: { Accept: "application/json", "x-api-key": apiKey },
      signal: AbortSignal.timeout(8000),
    });

    if (!osRes.ok) {
      return res.status(osRes.status).json({ ok: false, message: `OS returned ${osRes.status}` }); // i18n-ignore
    }

    const body = (await osRes.json()) as { product?: Record<string, unknown> };

    function parseP(v: unknown): number | null {
      if (v == null || v === "" || v === "0" || v === 0) return null;
      const n = parseFloat(String(v));
      return isFinite(n) && n > 0 ? n : null;
    }

    const p = (body.product ?? {}) as Record<string, unknown>;
    const regularPriceRaw = parseP(p.regular_price);
    const salePriceRaw = parseP(p.sale_price);
    const priceRaw = parseP(p.price);

    let regularPriceUsd: number | null = null;
    let discountPriceUsd: number | null = null;

    if (regularPriceRaw != null && regularPriceRaw > 0) {
      regularPriceUsd = regularPriceRaw;
      if (salePriceRaw != null && salePriceRaw > 0 && salePriceRaw < regularPriceRaw) {
        discountPriceUsd = salePriceRaw;
      } else if (priceRaw != null && priceRaw > 0 && priceRaw < regularPriceRaw) {
        discountPriceUsd = priceRaw;
      }
    } else {
      discountPriceUsd = parseP(p.discount_price_usd);
    }

    return res.json({
      ok: true,
      regularPriceUsd,
      discountPriceUsd,
      discountPriceAed: parseP(p.discount_price_aed),
    });
  } catch (err) {
    req.log?.warn?.({ err }, "product-pricing proxy: OS fetch failed"); // i18n-ignore
    return res.status(502).json({ ok: false, message: "OS fetch failed" }); // i18n-ignore
  }
});

// GET /api/woo/brand?slug=...
//
// Single-brand lookup by slug, used by the web app's server-side SEO injector
// to render brand-specific Open Graph / Twitter Card meta tags so that links
// to `/brand/<slug>` pasted into WhatsApp, iMessage, Slack, etc. show a rich
// preview (brand name, blurb, image) instead of the generic site-wide one.
router.get("/woo/brand", (req, res) => {
  const slugRaw = req.query.slug;
  const slug = typeof slugRaw === "string" ? slugRaw.trim() : "";
  if (!slug) {
    return res.status(400).json({ ok: false, message: "Missing slug" }); // i18n-ignore
  }

  const osBrands = getOsBrands() ?? [];
  const b = osBrands?.find((brand) => brand.slug === slug);
  if (!b) return res.status(404).json({ ok: false, message: "Brand not found" }); // i18n-ignore
  return res.json({
    ok: true,
    brand: {
      id: b.slug,
      name: decodeHtmlEntities(b.name),
      slug: b.slug,
      description: b.description ?? "",
      image: b.image ?? null,
    },
  });
});

// GET /api/woo/category?slug=...
//
// Single-category lookup by slug, used by the web app's server-side SEO
// injector to render category-specific Open Graph / Twitter Card meta tags
// so that links to category landing pages (e.g. `/shop?n=<slug>`) pasted
// into WhatsApp, iMessage, Slack, etc. show a rich preview (category name,
// blurb, image) instead of the generic site-wide one.
router.get("/woo/category", (req, res) => {
  const slugRaw = req.query.slug;
  const slug = typeof slugRaw === "string" ? slugRaw.trim() : "";
  if (!slug) {
    return res.status(400).json({ ok: false, message: "Missing slug" }); // i18n-ignore
  }
  if (isHiddenCategory(slug)) {
    return res.status(404).json({ ok: false, message: "Category not found" }); // i18n-ignore
  }

  const osCategories = getOsCategories();
  let resolved: { id: string; slug: string; name: string } | null =
    osCategories?.find((cat) => cat.slug === slug) ?? null;

  // Fallback: when the global catalog-attributes categories cache is empty or
  // uses a different slug than the canonical URL slug, derive the category from
  // product-embedded categories (which carry the canonical slug + display name).
  // Mirrors /woo/category-products, which already resolves products this way, so
  // category SEO/meta works even when getOsCategories() returns null.
  if (!resolved) {
  const store = resolveStoreFromRequest(req);
  const osProducts = getOsProducts(store.storeKey) ?? [];
    for (const p of osProducts) {
      const match = (p.categories ?? []).find((cat) => cat.slug === slug);
      if (match) {
        resolved = { id: match.slug, slug: match.slug, name: match.name };
        break;
      }
    }
  }

  if (!resolved) {
    return res.status(404).json({ ok: false, message: "Category not found" }); // i18n-ignore
  }
  return res.json({
    ok: true,
    category: {
      id: resolved.id,
      name: resolved.name,
      slug: resolved.slug,
      description: "",
      image: null,
    },
  });
});

// GET /api/woo/occasion?slug=...
//
// Single-occasion lookup by slug, used by the web app's server-side SEO
// injector to render occasion-specific Open Graph / Twitter Card meta tags
// so that links to occasion landing pages (e.g. `/shop?occasion=<slug>`)
// pasted into WhatsApp, iMessage, Slack, etc. show a rich preview
// (occasion name, blurb, image) instead of the generic site-wide one.
// Restricted to the `OCCASION_SLUGS` allowlist.
router.get("/woo/occasion", (req, res) => {
  const slugRaw = req.query.slug;
  const slug = typeof slugRaw === "string" ? slugRaw.trim() : "";
  if (!slug) {
    return res.status(400).json({ ok: false, message: "Missing slug" }); // i18n-ignore
  }

  const osOccasions = getOsOccasions();
  // Accept if present in live OS occasions OR in the static OCCASION_SLUGS
  // allowlist. The allowlist covers hardcoded occasions (colleague, friend,
  // children, etc.) that are defined in catalog-data and shown on the
  // shop/occasions pages but may not yet have a formal OS occasion catalog
  // entry. Accepting both prevents those pages from returning 404 when the
  // OS cache is warm but doesn't include them.
  const isValid = osOccasions
    ? osOccasions.some((o) => o.slug === slug) || OCCASION_SLUGS.includes(slug)
    : OCCASION_SLUGS.includes(slug);
  if (!isValid) {
    return res.status(404).json({ ok: false, message: "Occasion not found" }); // i18n-ignore
  }

  const o = osOccasions?.find((occ) => occ.slug === slug);
  if (!o) {
    // Slug is in OCCASION_SLUGS but not in the live OS catalog. Return the
    // static label so occasion detail pages render correctly instead of 404-ing.
    const fallbackName = OCCASION_LABELS[slug];
    if (!fallbackName) {
      return res.status(404).json({ ok: false, message: "Occasion not found" }); // i18n-ignore
    }
    return res.json({
      ok: true,
      occasion: {
        id: slug,
        name: fallbackName,
        slug,
        description: "",
        image: null,
      },
    });
  }
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
// 3. Catalog prices: Product prices are re-derived from the OS product cache
//    by wcId. Client-supplied prices are ignored for all financial calculations.
//
// 4. Server-side fees: Delivery fees are computed from an authoritative
//    server-side table; client-supplied districtFee/expressFee are ignored.
// ---------------------------------------------------------------------------
router.post("/woo/order", async (req, res) => {
  const store = resolveStoreFromRequest(req);

  // Validate recipient phone before schema parsing so that null, blank, and
  // prefix-only values (e.g. "+961" = 3 digits) all return 422 with a clear
  // error code rather than a generic 400 from Zod's z.string().min(1) check.
  // A real E.164 number needs at least 7 digits (country code + subscriber).
  const rawRecipientPhone = req.body?.recipient?.phone;
  const recipientPhoneDigits =
    typeof rawRecipientPhone === "string" ? rawRecipientPhone.replace(/\D/g, "") : "";
  if (recipientPhoneDigits.length < 7) {
    return res.status(422).json({
      ok: false,
      code: "recipient_phone_required",
      message: "Recipient phone number is required. Please enter a full phone number.", // i18n-ignore
    });
  }

  const parsed = WooOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    req.log?.warn?.(
      { issues: parsed.error.issues },
      "woo.order: invalid payload",
    );
    return res
      .status(400)
      .json({ ok: false, message: "Invalid order payload", issues: parsed.error.issues }); // i18n-ignore
  }
  const body = parsed.data;

  // ── Cross-instance duplicate guard ─────────────────────────────────────
  // The browser POST, the Stripe webhook, and the pending-checkout sweeper
  // can all submit the same order (each is a safety net for the others).
  // Serialize contenders on a Postgres advisory lock keyed by orderId —
  // this works across autoscale instances because they share one database.
  // The lock is released when the response closes, so the idempotency check
  // below runs strictly after any concurrent creation finished.
  try {
    const lockClient = await pool.connect();
    let lockReleased = false;
    const releaseOrderLock = () => {
      if (lockReleased) return;
      lockReleased = true;
      void lockClient
        .query("SELECT pg_advisory_unlock(hashtext($1))", [body.orderId])
        .catch(() => {})
        .finally(() => lockClient.release());
    };
    try {
      await lockClient.query("SELECT pg_advisory_lock(hashtext($1))", [body.orderId]);
      res.once("close", releaseOrderLock);
    } catch (lockErr) {
      releaseOrderLock();
      throw lockErr;
    }
  } catch (lockErr: any) {
    // Non-fatal: fall back to the idempotency pre-check alone.
    req.log?.warn?.(
      { err: lockErr?.message, appOrderId: body.orderId },
      "woo.order: advisory lock acquisition failed (non-fatal — proceeding unlocked)",
    );
  }

  // ── Idempotency guard ──────────────────────────────────────────────────
  // If a row for this appOrderId already exists with an OS order attached,
  // the order was fully created — return the existing refs instead of
  // creating a duplicate.
  try {
    const existingOrder = await db
      .select({ osOrderId: appOrdersTable.osOrderId })
      .from(appOrdersTable)
      .where(eq(appOrdersTable.appOrderId, body.orderId))
      .limit(1);
    if (existingOrder.length > 0 && existingOrder[0].osOrderId) {
      req.log?.info?.(
        { appOrderId: body.orderId, osOrderId: existingOrder[0].osOrderId },
        "woo.order: order already created — returning existing refs (idempotent)",
      );
      return res.json({
        ok: true,
        alreadyCreated: true,
        orderId: body.orderId,
        osOrderId: existingOrder[0].osOrderId,
      });
    }
  } catch (idemErr: any) {
    // Non-fatal: proceed with normal creation; the DB unique index on
    // app_order_id is the last-resort duplicate barrier.
    req.log?.warn?.(
      { err: idemErr?.message, appOrderId: body.orderId },
      "woo.order: idempotency pre-check failed (non-fatal)",
    );
  }

  // Server-side past-date guard — reject any scheduled delivery date that is
  // strictly before "today" in the recipient country's local timezone.  This
  // catches stale clients (e.g. a browser tab left open past midnight) that
  // still hold a UTC-derived date string from the previous calendar day.
  if (body.deliveryDate) {
    const todayLocal = getLocalIso(store.country);
    if (body.deliveryDate < todayLocal) {
      req.log?.warn?.(
        { deliveryDate: body.deliveryDate, todayLocal, country: store.country },
        "woo.order: delivery date is in the past — rejecting",
      );
      return res.status(422).json({
        ok: false,
        code: "past_delivery_date",
        message: "The selected delivery date has already passed. Please select a date from today onwards.", // i18n-ignore
      });
    }
  }

  const requestPlatform = normalizePlatform(req.header("x-app-platform"));

  // Resolve the owning user from the Authorization header (if any). The
  // legacy `userId` column stores the WC customer id (kept for backward
  // compatibility); the new `customerId` column points at the canonical
  // local customer row in `customers` and is populated below.
  let resolvedUserId: number | null = null;
  // Local customer row resolved from the caller's own session (proof of
  // ownership independent of the account's emailVerified status). Null for
  // guest checkouts or when the Authorization header is missing/invalid.
  let authenticatedCustomerId: number | null = null;
  const authHeader = req.header("authorization");
  if (authHeader) {
    const auth = await authenticate(authHeader, req);
    if (auth.ok) {
      resolvedUserId = auth.customerId;
    }
    const resolvedAuth = await resolveAuthenticatedCustomer(authHeader, req);
    if (resolvedAuth.ok) {
      authenticatedCustomerId = resolvedAuth.customer.id;
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
    // the auth identity so we patch it rather than creating a duplicate via
    // email lookup.
    const preferredCustomerId = authenticatedCustomerId;

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
    // Do not attach the order to an unverified account UNLESS the request is
    // authenticated as that very customer — i.e. the caller's own session
    // proves ownership, the same guarantee an emailVerified check exists to
    // provide. This keeps the anti-takeover protection intact for the guest/
    // email-matching case: an attacker who registers with the victim's email
    // (unverified, unauthenticated as the victim) still cannot get orders
    // attached to that row, since they can only reach this code path with
    // their own — not the victim's — session. We still create the order
    // record in the unverified+unauthenticated case — it just won't have a
    // customerId foreign key until the legitimate owner verifies and the
    // order is later reconciled by email.
    const upsertedRow = await getCustomerById(upserted.customer.id);
    const isOwnAuthenticatedOrder =
      authenticatedCustomerId != null && authenticatedCustomerId === upserted.customer.id;
    if (upsertedRow && !upsertedRow.emailVerified && !isOwnAuthenticatedOrder) {
      resolvedCustomerId = null;
    } else {
      resolvedCustomerId = upserted.customer.id;
    }

    // Best-effort: mirror to WooCommerce for legacy order linking.
    // WC is no longer used for order submission, so a sync failure must
    // not block the checkout — log a warning and proceed.
    // Skip the WC sync when the account is unverified (resolvedCustomerId
    // is null) to avoid creating a WC record for a potentially fraudulent row.
    try {
      if (resolvedCustomerId == null) throw new Error("skip: unverified customer");
      wcCustomerId = await syncCustomerToWoo(resolvedCustomerId, store);
    } catch (syncErr: any) {
      req.log?.warn?.(
        {
          err: syncErr?.message,
          appOrderId: body.orderId,
          customerId: resolvedCustomerId,
        },
        "woo.order: WooCommerce customer sync failed (non-fatal — OS order will still be created)",
      );
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
  // Snapshot items from the validated payment intent — populated after each
  // payment-verified branch so that attemptCreateOsOrder can use these prices
  // directly (bypassing the OS cache lookup and cold-cache guard).
  let snapshotItems: { wcId: number; osSlug?: string; priceUsd: number; name?: string }[] | undefined;
  // Server-computed fee breakdown from the payment intent snapshot. Set when
  // the intent is found and consumed; undefined for offline payments (Whish,
  // Western) and server-restart recovery paths. Passed to attemptCreateOsOrder
  // so the order record uses the exact fees that were charged via the PSP.
  let snapshotFees: { districtFeeUsd?: number; expressFeeUsd?: number; slotFeeUsd?: number } | undefined;
  // The exact currency the payment provider charged, sourced from the stored
  // intent (not from the client body). Passed to attemptCreateOsOrder so OS
  // receives the real charge currency (e.g. "QAR") instead of the display
  // currency the client sent in body.currencyCode.
  // Remains undefined on the server-restart recovery path (no intent available).
  let verifiedCurrency: string | undefined;

  let intentCouponSnapshot:
    | { couponCode: string; couponDiscountUsd: number }
    | undefined;

  if (body.paymentMethod === "card" || body.paymentMethod === "wallet" || body.paymentMethod === "apple_pay" || body.paymentMethod === "google_pay" || body.paymentMethod === "klarna") {
    if (!paymentRef) {
      return res.status(402).json({
        ok: false,
        code: "payment_reference_required",
        message: "A Stripe session ID (paymentRef) is required for card/wallet payments.", // i18n-ignore
      });
    }

    // Layer 1: Verify orderId↔paymentRef binding from the checkout intent.
    // This prevents replaying a paid session for a different order.
    const intent = consumePaymentIntent(paymentRef, body.orderId);

    if (!intent) {
      // The in-memory store is cleared on every server restart and entries
      // expire after 24 h. Recovery path for pi_ refs: probe Stripe directly.
      if (paymentRef.startsWith("pi_")) {
        const stripeKeysFallback = [
          process.env.STRIPE_SECRET_KEY,
          process.env.STRIPE_SECRET_KEY_GULF,
        ].filter((k): k is string => !!k);
        let recoveredPiDetails: Awaited<ReturnType<typeof fetchStripePaymentIntentDetails>> = null;
        for (const k of stripeKeysFallback) {
          const details = await fetchStripePaymentIntentDetails(paymentRef, body.orderId, k);
          if (details) {
            recoveredPiDetails = details;
            break;
          }
        }
        if (recoveredPiDetails) {
          req.log?.warn?.(
            { appOrderId: body.orderId, paymentRef },
            "woo.order: intent not in store (server restart / expiry) — verified directly with Stripe; checking amount against submitted cart",
          );

          // Layer 1-recovery: Without the original cart snapshot we cannot
          // verify item-for-item which products were paid for. We CAN verify
          // that the amount Stripe actually collected covers the full
          // authoritative cost: catalog subtotal + district fee + express fee
          // + slot fee for the params the client is now submitting. This
          // closes cheap-cart/cheap-delivery → expensive substitution attacks
          // after snapshot expiry.
          //
          // Fail-closed: if we cannot resolve catalog prices we cannot
          // verify the amount, so we must reject (never proceed unverified).
          const recoveredStore = resolveStoreFromRequest(req);
          const cartResolution = await resolveCartItems(
            body.items.map((i) => ({
              wcId: i.wcId ?? 0,
              osSlug: i.osSlug,
              quantity: i.quantity,
            })),
            recoveredStore,
          );
          if (!cartResolution.ok) {
            req.log?.warn?.(
              { appOrderId: body.orderId, paymentRef, reason: cartResolution.message },
              "woo.order: recovery path — cannot resolve catalog prices for amount verification; rejecting",
            );
            return res.status(402).json({
              ok: false,
              code: "amount_mismatch",
              message: "Cannot verify payment amount for the submitted cart. Please initiate checkout again.", // i18n-ignore
            });
          }

          {
            const piCurrency = normalizeCurrency(recoveredPiDetails.currency);
            // Compute the full server-side authoritative cost for the
            // submitted delivery parameters (district, express, slot).
            const isExpressRecovery = (body.expressFee ?? 0) > 0;
            const recoveredDistrict = body.district ?? "Beirut";
            const recoveredCountry = countryForDistrict(recoveredDistrict);
            const recoveredIsNoAddr = body.noAddress === true;
            // Bugs A+B: use resolveOsDeliveryConfig (city-ID lookup) when cityId
            // is present — matching the fee model used at PI creation time.
            // Fall back to legacy city-name helpers when cityId is absent.
            const recoveredOsConfig = body.cityId
              ? resolveOsDeliveryConfig(recoveredCountry, body.cityId)
              : null;
            const recoveredDistrictFeeUsd = (() => {
              if (!recoveredIsNoAddr && recoveredOsConfig && typeof recoveredOsConfig.cityFeeUsd === "number") {
                const isFreeByOs =
                  recoveredOsConfig.freeDeliveryEnabled === true &&
                  typeof recoveredOsConfig.freeDeliveryThresholdUsd === "number" &&
                  cartResolution.subtotalUsd >= recoveredOsConfig.freeDeliveryThresholdUsd;
                return isFreeByOs ? 0 : recoveredOsConfig.cityFeeUsd;
              }
              return computeDistrictFeeUsd(recoveredDistrict, cartResolution.subtotalUsd, recoveredIsNoAddr);
            })();
            const recoveredExpressFeeUsd = isExpressRecovery
              ? (recoveredOsConfig && recoveredOsConfig.expressSurchargeUsd > 0
                  ? recoveredOsConfig.expressSurchargeUsd
                  : expressSurchargeUsd(recoveredCountry))
              : 0;
            const recoveredSlotFeeUsd = (() => {
              if (isExpressRecovery || !body.deliverySlot || !body.cityId) return 0;
              const citySlots = getDeliverySlots(body.cityId);
              const bookedSlot = body.deliverySlotId
                ? (citySlots.find((s) => s.slotId === body.deliverySlotId) ?? citySlots.find((s) => s.label === body.deliverySlot))
                : citySlots.find((s) => s.label === body.deliverySlot);
              if (!bookedSlot || bookedSlot.extraFee === undefined || bookedSlot.extraFee === null) return 0;
              return Number(bookedSlot.extraFee);
            })();
            const recoveredTotalUsd =
              cartResolution.subtotalUsd + recoveredDistrictFeeUsd + recoveredExpressFeeUsd + recoveredSlotFeeUsd;
            // Subtract coupon discount so a coupon-paid order isn't falsely
            // rejected because the received amount is less than the full total.
            const REFERRAL_CODE_RE_RECOVERY = /^PT[A-Z0-9]+$/;
            let recoveredCouponDiscountUsd = 0;
            if (
              body.couponCode &&
              !REFERRAL_CODE_RE_RECOVERY.test(body.couponCode.trim().toUpperCase())
            ) {
              const recoveredCouponItems = cartResolution.items.map((i) => ({
                osSlug: i.osSlug ?? "",
                priceUsd: i.priceUsd,
                quantity: i.quantity,
              }));
              const recoveredCouponResult = await validateCoupon(body.couponCode.trim(), {
                customerEmail: body.billing.email ?? "",
                cartItems: recoveredCouponItems,
                cartTotalUsd: recoveredTotalUsd,
              }).catch(() => null);
              if (recoveredCouponResult?.valid) {
                recoveredCouponDiscountUsd = recoveredCouponResult.discountAmountUsd;
              }
            }
            const recoveredNetTotalUsd = Math.max(0, recoveredTotalUsd - recoveredCouponDiscountUsd);
            const requiredMinorUnits = toStripeMinorUnits(
              roundToNearestFive(await convertFromUsd(recoveredNetTotalUsd, piCurrency), piCurrency),
              piCurrency,
            );
            if (recoveredPiDetails.amountReceived < requiredMinorUnits) {
              req.log?.warn?.(
                {
                  appOrderId: body.orderId,
                  paymentRef,
                  amountReceived: recoveredPiDetails.amountReceived,
                  required: requiredMinorUnits,
                  currency: piCurrency,
                  subtotalUsd: cartResolution.subtotalUsd,
                  districtFeeUsd: recoveredDistrictFeeUsd,
                  expressFeeUsd: recoveredExpressFeeUsd,
                  slotFeeUsd: recoveredSlotFeeUsd,
                },
                "woo.order: recovery path — Stripe amount_received is less than authoritative total; rejecting",
              );
              return res.status(402).json({
                ok: false,
                code: "amount_mismatch",
                message: "Payment amount does not cover the submitted cart. Please initiate checkout again.", // i18n-ignore
              });
            }
          }

          paymentVerified = true;
          // snapshotItems remains undefined — attemptCreateOsOrder will use
          // the OS products cache for price lookup (same path as the
          // reconcile worker). preVerifiedItems is not passed.
        } else {
          req.log?.warn?.(
            { appOrderId: body.orderId, paymentRef },
            "woo.order: no valid payment intent found for this paymentRef+orderId pair",
          );
          return res.status(402).json({
            ok: false,
            code: "payment_intent_invalid",
            message: "No valid payment session found for this order. Please initiate checkout again.", // i18n-ignore
          });
        }
      } else {
        req.log?.warn?.(
          { appOrderId: body.orderId, paymentRef },
          "woo.order: no valid payment intent found for this paymentRef+orderId pair",
        );
        return res.status(402).json({
          ok: false,
          code: "payment_intent_invalid",
          message: "No valid payment session found for this order. Please initiate checkout again.", // i18n-ignore
        });
      }
    } else {
      // Intent found — verify cart snapshot and hoist verified prices.
      //
      // Layer 1b: Verify the submitted cart matches the canonical cart snapshot
      // stored when the payment session was created. This closes the cart-
      // substitution gap: a client cannot pay for a cheap cart and submit a
      // more expensive one to /woo/order — the wcId+quantity pairs must match.
      //
      // Delivery context (district, express, noAddress, slot) is now fully
      // bound in the Stripe charge and snapshot for all new sessions. Always
      // enable checkDelivery so district/slot mismatches are caught even for
      // sessions whose snapshot recorded district:"" (an attacker omitting
      // district gets snapshot.district="" and the submitted district must
      // also be "" — submitting any non-empty district will fail here).
    const cartMismatch = verifyCartMatchesSnapshot(body.items, intent.snapshot, {
      checkDelivery: true,
      submittedDistrict: body.district,
      submittedExpressDelivery: body.expressFee > 0,
      submittedNoAddress: body.noAddress === true,
      submittedDeliverySlot: body.deliverySlot ?? "",
    });
      if (cartMismatch) {
        req.log?.warn?.(
          { appOrderId: body.orderId, paymentRef, reason: cartMismatch },
          "woo.order: submitted cart does not match paid-for cart snapshot — rejecting",
        );
        return res.status(402).json({
          ok: false,
          code: "cart_mismatch",
          message: "The submitted cart does not match the paid-for cart. Please initiate checkout again.", // i18n-ignore
        });
      }

      // Hoist the verified prices so attemptCreateOsOrder can use them directly.
      snapshotItems = intent.snapshot.items;
      // Hoist snapshot fees so attemptCreateOsOrder uses the same fees that
      // were charged via Stripe, eliminating PI/order divergence (Bug A+B+Step3).
      snapshotFees = {
        districtFeeUsd: intent.snapshot.districtFeeUsd,
        expressFeeUsd: intent.snapshot.expressFeeUsd,
        slotFeeUsd: intent.snapshot.slotFeeUsd,
      };
      // Hoist the charge currency so OS receives the exact currency Stripe used,
      // not the client-supplied body.currencyCode (which can drift — e.g. a LB
      // order where the shopper's display currency is QAR).
      verifiedCurrency = intent.currency;

      // Resolve the Stripe key based on which account processed this payment.
      const stripeKey =
        intent.stripeAccount === "gulf"
          ? process.env.STRIPE_SECRET_KEY_GULF
          : process.env.STRIPE_SECRET_KEY;

      if (!stripeKey) {
        req.log?.warn?.(
          { appOrderId: body.orderId, paymentRef, stripeAccount: intent.stripeAccount },
          "woo.order: Stripe key not configured, recording order without set_paid",
        );
      } else {
        // Layer 2: Verify with Stripe. PaymentIntent IDs start with "pi_"
        // (inline Elements flow); Checkout Session IDs start with "cs_"
        // (hosted redirect flow). Route to the correct verification function.
        if (paymentRef.startsWith("pi_")) {
          paymentVerified = await verifyStripePaymentIntentPaid(paymentRef, body.orderId, stripeKey);
        } else {
          paymentVerified = await verifyStripePayment(paymentRef, body.orderId, stripeKey);
        }
        if (!paymentVerified) {
          req.log?.warn?.(
            { appOrderId: body.orderId, paymentRef, stripeAccount: intent.stripeAccount },
            "woo.order: Stripe payment not confirmed — rejecting order",
          );
          // Fire-and-forget: record the declined attempt in app_orders and
          // send to OS with payment.verified=false so ops can see it.
          void recordFailedPaymentAttempt(body, {
            paymentRef,
            snapshotItems,
            store,
            platform: requestPlatform,
            userId: resolvedUserId,
            customerId: resolvedCustomerId,
            log: req.log,
          });
          return res.status(402).json({
            ok: false,
            code: "payment_not_confirmed",
            message: "Payment could not be confirmed with Stripe. Please complete payment before placing the order.", // i18n-ignore
          });
        }
      }
    }
  } else if (body.paymentMethod === "mamo") {
    if (!paymentRef) {
      return res.status(402).json({
        ok: false,
        code: "payment_reference_required",
        message: "A Mamo payment link ID (paymentRef) is required for Mamo payments.", // i18n-ignore
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
        message: "No valid payment session found for this order. Please initiate checkout again.", // i18n-ignore
      });
    }

    const cartMismatch = verifyCartMatchesSnapshot(body.items, intent.snapshot, {
      checkDelivery: true,
      submittedDistrict: body.district,
      submittedExpressDelivery: body.expressFee > 0,
      submittedNoAddress: body.noAddress === true,
      submittedDeliverySlot: body.deliverySlot ?? "",
    });
    if (cartMismatch) {
      req.log?.warn?.(
        { appOrderId: body.orderId, paymentRef, reason: cartMismatch },
        "woo.order: submitted order does not match paid-for Mamo snapshot — rejecting",
      );
      return res.status(402).json({
        ok: false,
        code: "cart_mismatch",
        message: "The submitted order does not match the paid-for cart. Please initiate checkout again.", // i18n-ignore
      });
    }

    snapshotItems = intent.snapshot.items;
    snapshotFees = {
      districtFeeUsd: intent.snapshot.districtFeeUsd,
      expressFeeUsd: intent.snapshot.expressFeeUsd,
      slotFeeUsd: intent.snapshot.slotFeeUsd,
    };
    verifiedCurrency = intent.currency;

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
        // Fire-and-forget: record the declined attempt in app_orders and
        // send to OS with payment.verified=false so ops can see it.
        void recordFailedPaymentAttempt(body, {
          paymentRef,
          snapshotItems,
          store,
          platform: requestPlatform,
          userId: resolvedUserId,
          customerId: resolvedCustomerId,
          log: req.log,
        });
        return res.status(402).json({
          ok: false,
          code: "payment_not_confirmed",
          message: "Payment could not be confirmed with Mamo. Please complete payment before placing the order.", // i18n-ignore
        });
      }
    }
  } else if (body.paymentMethod === "paypal") {
    if (!paymentRef) {
      return res.status(402).json({
        ok: false,
        code: "payment_reference_required",
        message: "A PayPal order ID (paymentRef) is required for PayPal payments.", // i18n-ignore
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
        message: "No valid payment session found for this order. Please initiate checkout again.", // i18n-ignore
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
      submittedDeliverySlot: body.deliverySlot ?? "",
    });
    if (cartMismatch) {
      req.log?.warn?.(
        { appOrderId: body.orderId, paymentRef, reason: cartMismatch },
        "woo.order: submitted order does not match paid-for PayPal snapshot — rejecting",
      );
      return res.status(402).json({
        ok: false,
        code: "cart_mismatch",
        message: "The submitted order does not match the paid-for cart. Please initiate checkout again.", // i18n-ignore
      });
    }

    snapshotItems = intent.snapshot.items;
    snapshotFees = {
      districtFeeUsd: intent.snapshot.districtFeeUsd,
      expressFeeUsd: intent.snapshot.expressFeeUsd,
      slotFeeUsd: intent.snapshot.slotFeeUsd,
    };
    verifiedCurrency = intent.currency;

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
        // Fire-and-forget: record the declined attempt in app_orders and
        // send to OS with payment.verified=false so ops can see it.
        void recordFailedPaymentAttempt(body, {
          paymentRef,
          snapshotItems,
          store,
          platform: requestPlatform,
          userId: resolvedUserId,
          customerId: resolvedCustomerId,
          log: req.log,
        });
        return res.status(402).json({
          ok: false,
          code: "payment_not_confirmed",
          message: "Payment could not be captured with PayPal. Please complete payment before placing the order.", // i18n-ignore
        });
      }
    }
  } else if ((body.paymentMethod as string) === "cybersource") {
    if (!paymentRef) {
      return res.status(402).json({
        ok: false,
        code: "payment_reference_required",
        message: "A CyberSource payment ID (paymentRef) is required for CyberSource payments.", // i18n-ignore
      });
    }

    // Layer 1: Atomically claim and verify orderId↔paymentRef binding.
    // `consumePaymentIntent` is a synchronous operation that sets `consumed:true`
    // in the same tick — Node.js's event loop guarantees no other request can
    // interleave here, so only one concurrent submission per paymentRef can
    // claim the intent. Any second concurrent request will see `consumed:true`
    // and receive a 402.
    //
    // If the downstream OS write fails and the error is propagated to the client,
    // `releasePaymentIntent` is called in the enqueue-failure path below so the
    // shopper can retry without restarting the payment. Releasing is safe only
    // when the failure is definitive (enqueue threw, meaning no durable record
    // of the order exists); ambiguous network failures leave the intent consumed
    // and rely on the reconciliation queue — the same behavior as Stripe/Mamo.
    const intent = consumePaymentIntent(paymentRef, body.orderId);
    if (!intent) {
      req.log?.warn?.(
        { appOrderId: body.orderId, paymentRef },
        "woo.order: no valid CyberSource payment intent found for this paymentRef+orderId pair",
      );
      return res.status(402).json({
        ok: false,
        code: "payment_intent_invalid",
        message: "No valid payment session found for this order. Please initiate checkout again.", // i18n-ignore
      });
    }

    const cartMismatch = verifyCartMatchesSnapshot(body.items, intent.snapshot, {
      checkDelivery: true,
      submittedDistrict: body.district,
      submittedExpressDelivery: body.expressFee > 0,
      submittedNoAddress: body.noAddress === true,
      submittedDeliverySlot: body.deliverySlot ?? "",
    });
    if (cartMismatch) {
      req.log?.warn?.(
        { appOrderId: body.orderId, paymentRef, reason: cartMismatch },
        "woo.order: CyberSource submitted cart does not match paid-for snapshot — rejecting",
      );
      return res.status(402).json({
        ok: false,
        code: "cart_mismatch",
        message: "The submitted cart does not match the paid-for cart. Please initiate checkout again.", // i18n-ignore
      });
    }
    snapshotItems = intent?.snapshot?.items;
    snapshotFees = {
      districtFeeUsd: intent?.snapshot?.districtFeeUsd,
      expressFeeUsd: intent?.snapshot?.expressFeeUsd,
      slotFeeUsd: intent?.snapshot?.slotFeeUsd,
    };
    verifiedCurrency = intent?.currency;
    paymentVerified = true; // CS payment was already captured at /authorize
  }
  // whish / western / offline: paymentVerified stays false, order recorded pending.


  const REFERRAL_CODE_RE = /^PT[A-Z0-9]+$/;
  const isReferralCoupon =
    typeof body.couponCode === "string" &&
    REFERRAL_CODE_RE.test(body.couponCode.trim().toUpperCase());

  // ── Coupon validation (non-referral codes only) ──────────────────────────
  // Re-validate the coupon server-side so we can pass the OS coupon ID and
  // verified discount amount to the order. The payment was already captured at
  // the discounted amount during PI creation, so a validation failure here does
  // not block the order — we simply record no discount.
  let couponValidated:
    | { couponId: string | number; couponDiscountUsd: number }
    | undefined;
  // CyberSource shortcut: when intentCouponSnapshot is set the discount was
  // already server-validated against the full cart total (subtotal + fees) at
  // /authorize time and is stored in the intent. Use it directly so the OS order
  // records the same amount that CyberSource actually charged.
  if (intentCouponSnapshot) {
    couponValidated = {
      couponId: intentCouponSnapshot.couponCode,
      couponDiscountUsd: intentCouponSnapshot.couponDiscountUsd,
    };
  } else if (body.couponCode && !isReferralCoupon) {
    // Build cart items from authoritative snapshot prices when available.
    // Fall back to OS catalog resolution when the snapshot was lost (restart).
    // Never use client-supplied body.items[i].price — it is untrusted.
    let authoritativeCartItems: Array<{ osSlug: string; priceUsd: number; quantity: number }> | null =
      null;
    if (snapshotItems) {
      authoritativeCartItems = snapshotItems.map((si) => {
        const bodyItem = body.items.find(
          (bi) =>
            (si.wcId && si.wcId !== 0 && bi.wcId === si.wcId) ||
            (si.osSlug && bi.osSlug === si.osSlug),
        );
        return {
          osSlug: si.osSlug ?? "",
          priceUsd: si.priceUsd,
          quantity: bodyItem?.quantity ?? 1,
        };
      });
    } else {
      // Snapshot unavailable — resolve from OS catalog (authoritative prices).
      const catalogFallback = await resolveCartItems(
        body.items.map((i) => ({ wcId: i.wcId ?? 0, osSlug: i.osSlug, quantity: i.quantity })),
        store,
      );
      if (catalogFallback.ok) {
        authoritativeCartItems = catalogFallback.items.map((i) => ({
          osSlug: i.osSlug ?? "",
          priceUsd: i.priceUsd,
          quantity: i.quantity,
        }));
      }
    }
    if (authoritativeCartItems) {
      const authoritativeCartTotal = authoritativeCartItems.reduce(
        (sum, i) => sum + i.priceUsd * i.quantity,
        0,
      );
      const authoritativeDeliveryFeeUsd =
        (snapshotFees?.districtFeeUsd ?? 0) +
        (snapshotFees?.expressFeeUsd ?? 0) +
        (snapshotFees?.slotFeeUsd ?? 0);
      const couponResult = await validateCoupon(body.couponCode.trim(), {
        customerEmail: body.billing.email ?? "",
        cartItems: authoritativeCartItems,
        cartTotalUsd: authoritativeCartTotal + authoritativeDeliveryFeeUsd,
      }).catch(() => null);
      if (couponResult?.valid) {
        // For FIRST10: check the durable DB claim before recording the discount.
        // The claim must have been acquired at PI/session creation for this orderId.
        // A missing or stale claim means either a concurrent race or a restarted
        // process where a different session already holds the discount — deny here.
        let applyOrderCoupon = true;
        if (body.couponCode.trim().toUpperCase() === FIRST_ORDER_COUPON_CODE) {
          const emailForLock = (body.billing.email ?? "").trim().toLowerCase();
          if (emailForLock) {
            applyOrderCoupon = await acquireFirst10Lock(emailForLock, body.orderId).catch(() => false);
            if (!applyOrderCoupon) {
              req.log?.warn?.(
                { email: emailForLock, orderId: body.orderId },
                "FIRST10: order-creation claim check failed — recording no discount", // i18n-ignore
              );
            }
          }
        }
        if (applyOrderCoupon) {
          couponValidated = {
            couponId: couponResult.couponId,
            couponDiscountUsd: couponResult.discountAmountUsd,
          };
        }
      }
    }
  }

  // ── Submit order to Presentail OS ────────────────────────────────────────
  // For Stripe/Mamo/PayPal-verified payments, snapshotItems holds the catalog
  // prices from when the payment intent was created — those prices are already
  // server-validated. Pass them so attemptCreateOsOrder can use them directly
  // without re-querying the OS cache (which may be transiently empty).
  const result = await attemptCreateOsOrder(body, {
    paymentVerified,
    store,
    platform: requestPlatform,
    preVerifiedItems: snapshotItems,
    preVerifiedFees: snapshotFees,
    verifiedCurrency,
    couponValidated,
  });

  if (!result.ok) {
    req.log?.warn?.(
      {
        appOrderId: body.orderId,
        paymentRef: body.paymentRef,
        status: result.status,
        message: result.message,
        paymentVerified,
      },
      "woo.order: OS order creation failed",
    );

    // If payment was already captured by the PSP (Stripe / Mamo / PayPal),
    // the customer's money is committed — we must NOT return an error.
    // Instead, enqueue the order for automatic retry and respond with success
    // so the customer lands on the confirmation screen. The reconciliation
    // worker will keep retrying (up to 8 times, max 6 h backoff) and will
    // create the OS order as soon as it becomes available.
    if (paymentVerified) {
      // Enqueue the order for reconciliation retry. If the enqueue itself throws
      // (e.g. DB is unavailable), the error propagates to the caller and the
      // shopper receives a 500. In that case we release the CyberSource intent
      // so the shopper can retry — the intent was atomically claimed by
      // `consumePaymentIntent` above, so releasing is only safe here when the
      // write is definitively unrecorded (enqueue failure means no durable
      // record of the order exists yet).
      try {
        await enqueuePendingWcOrder({
          body,
          paymentRef: body.paymentRef ?? null,
          userId: resolvedUserId,
          customerId: resolvedCustomerId,
          wcCustomerId,
          errorMessage: result.message,
          paymentVerified: true,
          storeCountryCode: store.country,
          storeCityId: null,
          platform: requestPlatform,
          verifiedCurrency,
          log: req.log,
        });
      } catch (enqueueErr) {
        // Enqueue failed — no durable record of this order. Release the CS
        // intent so the shopper can retry without restarting the payment.
        if ((body.paymentMethod as string) === "cybersource" && body.paymentRef) {
          releasePaymentIntent(body.paymentRef);
        }
        throw enqueueErr;
      }
      req.log?.warn?.(
        { appOrderId: body.orderId, paymentRef: body.paymentRef },
        "woo.order: payment verified but OS order failed — enqueued for reconciliation",
      );
      // The customer's payment is captured and they will see a confirmation
      // screen, so from the ops team's perspective the order IS placed —
      // notify Slack now rather than waiting for the reconciliation retry.
      void sendUaeOrderSlackNotification(
        buildUaeOrderNotification(body, store, { chargedCurrency: verifiedCurrency ?? null }),
        req.log,
      );
      return res.json({
        ok: true,
        wcOrderId: null,
        osOrderId: null,
        queued: true,
        couponDiscount: couponValidated?.couponDiscountUsd ?? 0,
      });
    }

    return res
      .status(result.status)
      .json({ ok: false, message: result.message });
  }

  // Await the DB upsert so the app_orders row is committed before the CAPI
  // idempotency UPDATE runs below. recordSuccessfulWcOrder is internally
  // best-effort (errors are caught+logged, never re-thrown) so this cannot
  // reject and does not block the response beyond the DB write itself — the
  // push notification inside is fire-and-forget as of the change above.
  await recordSuccessfulWcOrder({
    body,
    wcOrderId: null,
    userId: resolvedUserId,
    customerId: resolvedCustomerId,
    recipientName: result.recipientName,
    totalUsdCents: result.totalUsdCents,
    totalPaymentCents: result.totalPaymentCents,
    lineItems: result.lineItems,
    platform: requestPlatform,
    storeKey: store.storeKey,
    osOrderId: result.osOrderId ?? null,
    currencyCode: verifiedCurrency,
    log: req.log,
  });

  // ── UAE order Slack notification (fire-and-forget) ──────────────────────
  // Abu Dhabi orders → #abudhabi-order; all other AE districts → #dubai-order.
  // Non-UAE orders are a no-op inside the helper. Never blocks the response.
  void sendUaeOrderSlackNotification(
    buildUaeOrderNotification(body, store, {
      osOrderId: result.osOrderId ?? null,
      totalUsd: result.totalUsdCents != null ? result.totalUsdCents / 100 : null,
      chargedCurrency: verifiedCurrency ?? null,
    }),
    req.log,
  );

  // ── Facebook Conversions API — Purchase (fire-and-forget, deduplicated) ──
  // Send a server-side Purchase event to Meta CAPI so Lebanon and UAE ad
  // campaigns can track conversions. The event_id mirrors the client-side
  // fbpurchase-<orderId> token so Meta can deduplicate the browser pixel
  // event and this server event.
  //
  // Idempotency guard: atomically set capiPurchaseSentAt WHERE it is still
  // NULL. If the UPDATE claims 0 rows the event was already sent (duplicate
  // webhook delivery, network retry, or support re-trigger) — skip it.
  // A CAPI failure must never block the order response.
  void (async () => {
    try {
      const capiClaimed = await db
        .update(appOrdersTable)
        .set({ capiPurchaseSentAt: new Date() })
        .where(
          and(
            eq(appOrdersTable.appOrderId, body.orderId),
            isNull(appOrdersTable.capiPurchaseSentAt),
          ),
        )
        .returning({ id: appOrdersTable.id });

      if (capiClaimed.length === 0) {
        req.log?.info?.(
          { appOrderId: body.orderId },
          "woo.order: CAPI Purchase already sent for this order — skipping duplicate",
        );
        return;
      }

      await sendCapiPurchase({
        eventId: `fbpurchase-${body.orderId}`,
        value: result.totalUsdCents != null ? result.totalUsdCents / 100 : 0,
        currency: verifiedCurrency ?? "USD",
        countryCode: store.country,
        userData: {
          email: body.billing.email ?? null,
          phone: body.billing.phone ?? null,
          firstName: body.billing.firstName ?? null,
          lastName: body.billing.lastName ?? null,
        },
      });
    } catch (err: unknown) {
      req.log?.warn?.(
        { err: (err as Error)?.message, appOrderId: body.orderId },
        "woo.order: CAPI Purchase event failed (non-fatal)",
      );
    }
  })();

  // ── Referral points (fire-and-forget) ────────────────────────────────────
  // When the order included a referral coupon (PT[A-Z0-9]+), decode the
  // referrer's local customer ID from the code and credit them points.
  // REFERRAL_POINTS_AWARD controls the award (default 0 = inert until ops
  // sets it). Never blocks or fails the checkout response.
  if (isReferralCoupon && body.couponCode) {
    const refCode = body.couponCode.trim().toUpperCase();
    const referrerId = parseInt(refCode.slice(2), 36);
    if (Number.isFinite(referrerId) && referrerId > 0) {
      const redeemerSource = result.osOrderId
        ? `os-order:${result.osOrderId}`
        : `order:${body.orderId}`;
      void creditReferralRedemption({
        referrerCustomerId: referrerId,
        redeemerSourceKey: redeemerSource,
        storeKey: store.storeKey,
        log: req.log,
      }).catch((err: unknown) => {
        req.log?.warn?.(
          { err: (err as Error)?.message, referrerId, refCode },
          "woo.order: creditReferralRedemption failed (non-fatal)",
        );
      });
    }
  }

  req.log?.info?.(
    {
      appOrderId: body.orderId,
      osOrderId: result.osOrderId,
      platform: requestPlatform,
    },
    "woo.order: OS order created successfully",
  );

  return res.json({
    ok: true,
    wcOrderId: null,
    osOrderId: result.osOrderId,
    couponDiscount: result.couponDiscountUsd,
    // Server-authoritative delivery fee breakdown. Confirmation screens should
    // display these values (not client-estimated fees) to show what was recorded.
    totalUsd: result.totalUsdCents / 100,
    districtFeeUsd: result.districtFeeUsd,
    expressFeeUsd: result.expressFeeUsd,
    slotFeeUsd: result.slotFeeUsd,
    deliveryFeeUsd: result.deliveryFeeUsd,
    // Echo validated items (including personalisation notes) back to the
    // client so confirmation screens can display them without a separate fetch.
    items: body.items.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      ...(i.customInput ? { customInput: i.customInput } : {}),
    })),
  });
});

// ---------------------------------------------------------------------------
// Admin: list pending/exhausted reconciliation rows.
// ---------------------------------------------------------------------------
// GET /api/woo/search?q=...
//
// Real-time product search over the in-memory Presentail OS product cache.
// Results are ranked by match quality: exact name match > name prefix >
// name substring > brand/category/description match. Only fields the UI
// actually renders are returned. q must be 2–100 chars; results are limited
// to 10 products plus all matching categories, occasions, and brands.
const SearchQuerySchema = z.object({
  q: z.string().min(2).max(100),
});

router.get("/woo/search", async (req, res) => {
  const parsed = SearchQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: "q must be 2–100 characters" }); // i18n-ignore
  }
  const { q } = parsed.data;
  const lower = q.toLowerCase();
  const lang = readLang(req);

  const store = resolveStoreFromRequest(req);
  const osProducts = getOsProducts(store.storeKey) ?? [];
  const filter = readDeliveryFilter(req);

  // Score each candidate: higher score = better match.
  // Scoring always uses English names so queries work regardless of lang.
  // 4 = exact name, 3 = name prefix, 2 = name substring, 1 = brand/category/description
  type Scored = { score: number; p: WcProduct };
  const scored: Scored[] = [];
  for (const op of osProducts) {
    const wc = mapOsProductToWcShape(op);
    if (!isVisibleProduct(wc) || !isDeliverable(wc, filter)) continue;
    const nameLower = (wc.name ?? "").toLowerCase();
    let score = 0;
    if (nameLower === lower) {
      score = 4;
    } else if (nameLower.startsWith(lower)) {
      score = 3;
    } else if (nameLower.includes(lower)) {
      score = 2;
    } else {
      const brandMatch = op.brands.some((b) => decodeHtmlEntities(b.name).toLowerCase().includes(lower));
      const catMatch = op.categories.some((c) => c.name.toLowerCase().includes(lower));
      const descMatch = (wc.short_description ?? "").toLowerCase().includes(lower);
      if (brandMatch || catMatch || descMatch) score = 1;
    }
    if (score > 0) scored.push({ score, p: wc });
  }

  scored.sort((a, b) => b.score - a.score);

  // Build with osNumericId so we can batch-translate names when lang=ar|fr.
  const matchingProductsRaw = scored
    .slice(0, 10)
    .map(({ p }) => {
      const transformed = transformProduct(p, store.currencySymbol);
      return {
        slug: transformed.id,
        name: transformed.name,
        osNumericId: transformed.osNumericId as number | string | undefined,
        image: transformed.image,
        price: transformed.price,
        priceValue: transformed.priceValue,
        discountPriceValue: transformed.discountPriceValue ?? null,
        discountPriceAed: transformed.discountPriceAed ?? null,
      };
    });

  // Translate product names when lang=ar|fr; strip osNumericId from response.
  let matchingProducts: Array<Omit<(typeof matchingProductsRaw)[number], "osNumericId">>;
  if ((lang === "ar" || lang === "fr") && matchingProductsRaw.length > 0) {
    const items = matchingProductsRaw
      .filter((p) => p.osNumericId != null)
      .map((p) => ({ osNumericId: p.osNumericId as number | string, name: p.name }));
    const translations =
      items.length > 0
        ? await translateProductNamesBatch(items, lang as TranslationLang)
        : new Map<string, string>();
    matchingProducts = matchingProductsRaw.map(({ osNumericId, ...rest }) => {
      if (osNumericId == null) return rest;
      const translated = translations.get(String(osNumericId));
      return translated ? { ...rest, name: translated } : rest;
    });
  } else {
    matchingProducts = matchingProductsRaw.map(({ osNumericId: _id, ...rest }) => rest);
  }

  const matchingCategories = OCCASION_TYPE_CATEGORIES
    .filter((c) => c.label.toLowerCase().includes(lower))
    .map((c) => ({ slug: c.slug, name: c.label }));

  // Use live OS occasions when available; fall back to static list on cold start.
  const liveOccasionsForSearch = getOsOccasions();
  const occasionSource = liveOccasionsForSearch
    ? liveOccasionsForSearch.map((o) => ({ slug: o.slug, name: o.name }))
    : OCCASION_SLUGS.map((slug) => ({ slug, name: OCCASION_LABELS[slug] ?? slug }));
  const matchingOccasions = occasionSource
    .filter((o) => o.name.toLowerCase().includes(lower));

  const osBrands = getOsBrands() ?? [];
  const matchingBrands = osBrands
    .filter((b) => decodeHtmlEntities(b.name).toLowerCase().includes(lower))
    .slice(0, 5)
    .map((b) => ({ slug: b.slug, name: decodeHtmlEntities(b.name), image: b.image ?? null }));

  return res.json({ ok: true, products: matchingProducts, categories: matchingCategories, occasions: matchingOccasions, brands: matchingBrands });
});


export default router;
