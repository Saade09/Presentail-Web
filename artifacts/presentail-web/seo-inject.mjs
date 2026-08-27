// Server-side SEO HTML injection. Used by the Vite dev plugin and the
// production Node serve script so locale-prefixed URLs return HTML with
// <title>, <meta description>, OG/Twitter tags, canonical and hreflang
// alternates already present in the initial document (no JS required).

import { isPageEligible, MIN_PRODUCTS_BY_TYPE } from "./scripts/pageEligibility.mjs";
import { FAQ_COPY } from "./src/data/faqsCopy.js";
import { LOCATION_DATA } from "./src/lib/locationData.mjs";
import {
  BLOG_POSTS,
  getBlogPostMeta,
  getBlogPostLanguages,
  getBlogPostReadingTime,
  getFeaturedBlogSlug,
} from "@workspace/blog-content";
import {
  buildBlogArticleJsonLd,
  BLOG_OG_FALLBACK_IMAGE_PATH,
} from "./blog-article-schema.mjs";
import {
  freeDeliveryThresholdUsd,
  expressSurchargeForCountry,
} from "@workspace/delivery";
import { roundToNearestFive } from "@workspace/display-currency";

// Hub city per country — only these pages emit the LocalBusiness organisation
// block.  Declaring a near-identical Florist on all 37 city homepages sharing
// one phone number and one address is the multi-location spam pattern that
// Google's local-search systems penalise.  The hub cities match HUB_CITY in
// src/lib/hreflang.mjs; keep them in sync if that file ever changes.
const ORGANIZATION_HUB_CITIES = { lb: "beirut", ae: "dubai", cy: "nicosia" };

// Returns window (days) for the Google Merchant Listings hasMerchantReturnPolicy node.
// Must match the satisfaction-guarantee window documented in /faqs and Terms.tsx.
// Exported so returns-window-sync.test.ts can assert the FAQ/terms copy agrees.
export const RETURN_WINDOW_DAYS = 7;

// ---------------------------------------------------------------------------
// Product availability lifecycle
// ---------------------------------------------------------------------------

/**
 * Canonical availability state for an OS product, used to decide HTTP response
 * codes (200 / 301 / 410) and structured-data markup (InStock / OutOfStock).
 *
 * Priority order:
 *  1. status === 'discontinued' → DISCONTINUED (regardless of inStock)
 *  2. inStock === false + tags includes 'seasonal' → SEASONAL_UNAVAILABLE
 *  3. inStock === false (and not discontinued) → SOLD_OUT_TEMPORARILY
 *  4. inStock is true or undefined → ACTIVE
 */
export const PRODUCT_AVAILABILITY_STATE = /** @type {const} */ ({
  ACTIVE: "ACTIVE",
  SOLD_OUT_TEMPORARILY: "SOLD_OUT_TEMPORARILY",
  SEASONAL_UNAVAILABLE: "SEASONAL_UNAVAILABLE",
  DISCONTINUED: "DISCONTINUED",
});

/**
 * Map an OS product object to a lifecycle state.
 *
 * @param {object} product OS product shape (inStock, status, tags).
 * @returns {string} One of the PRODUCT_AVAILABILITY_STATE values.
 */
export function getProductAvailabilityState(product) {
  if (!product || typeof product !== "object") {
    return PRODUCT_AVAILABILITY_STATE.ACTIVE;
  }
  if (product.status === "discontinued") {
    return PRODUCT_AVAILABILITY_STATE.DISCONTINUED;
  }
  if (product.inStock === false) {
    if (Array.isArray(product.tags) && product.tags.includes("seasonal")) {
      return PRODUCT_AVAILABILITY_STATE.SEASONAL_UNAVAILABLE;
    }
    return PRODUCT_AVAILABILITY_STATE.SOLD_OUT_TEMPORARILY;
  }
  return PRODUCT_AVAILABILITY_STATE.ACTIVE;
}

// Title suffix appended to sold-out / seasonal product page titles in SERPs.
// Distinguishes the page from an active-product page without hurting brand
// perception (it signals the product will be available again).
const COMING_SOON_SUFFIX = { // i18n-ignore — locale-keyed "coming soon" suffix map
  en: " \u2013 Coming Soon",
  ar: " \u2013 \u0642\u0631\u064a\u0628\u0627\u064b",
  fr: " \u2013 Bient\u00f4t disponible",
  el: " \u2013 \u0388\u03c1\u03c7\u03b5\u03c4\u03b1\u03b9 \u03c3\u03cd\u03bd\u03c4\u03bf\u03bc\u03b1",
};

const SUPPORTED_LANGS = ["en", "ar", "fr", "el"];
const SUPPORTED_COUNTRY_SLUGS = ["ae", "lb", "cy"];

/**
 * Pick the best supported UI language from an HTTP Accept-Language header
 * value (e.g. "ar,en-US;q=0.9,fr;q=0.8"). Returns the first tag whose
 * primary subtag matches a SUPPORTED_LANGS entry, or null when none match.
 * Exported so callers (serve.mjs, vite.config.ts) can test it independently.
 */
export function pickLangFromAcceptLanguage(header) {
  if (!header) return null;
  const parts = String(header).split(",");
  for (const part of parts) {
    const tag = part.split(";")[0].trim().toLowerCase();
    const primary = tag.split("-")[0];
    if (SUPPORTED_LANGS.includes(primary)) return primary;
  }
  return null;
}

// Mirror of CITY_SLUGS_BY_COUNTRY in src/lib/locale-route.ts. Keep in sync
// with that file — both lists must agree or shoppers get an SEO-rendered
// page for a slug the SPA refuses to route to.
export const CITY_SLUGS_BY_COUNTRY = {
  lb: [
    "akkar", "aley", "baabda", "baalbeck", "batroun", "bcharee", "beirut",
    "bent-jbeil", "chouf", "hasbaya", "hermel", "jbeil", "jezzine",
    "kesserwan", "koura", "marjayoun", "metn", "minnieh-dennaya", "nabatieh",
    "rechaya", "saida", "tripoli", "tyre", "west-bekaa", "zahle", "zghorta",
  ],
  ae: [
    "abu-dhabi", "ajman", "dubai", "fujairah", "ras-al-khaimah", "sharjah",
    "umm-al-quwain",
  ],
  cy: ["larnaca", "limassol", "nicosia", "paphos"],
};

function isSupportedCity(country, city) {
  return CITY_SLUGS_BY_COUNTRY[country]?.includes(city) ?? false;
}

import {
  COUNTRY_NAMES,
  COUNTRY_PLAIN_NAMES,
  CITY_NAMES,
  TITLES,
  LANDING_OG,
  LANDING_TWITTER,
  HOME_OG,
  HOME_TWITTER,
  GENERIC_OG,
  GENERIC_TWITTER,
  DESCRIPTIONS,
  OG_LOCALE,
  OG_LOCALE_COUNTRY,
  SEO_SOCIAL_LINKS,
  NONINDEX_ROUTE_KEYS,
  STATIC_PAGE_GROUP,
  buildProductSeo,
  buildCategorySeo,
  buildOccasionSeo,
  buildBrandSeo,
  buildBlogSeo,
  buildStaticSeo,
  buildFaqsSeo,
  buildContactSeo,
  formatTemplate,
  getCityHomeSeoOverride,
} from "./src/lib/seo.mjs";

import { buildHreflangSet, HUB_CITY, remapPathnameToHubCity } from "./src/lib/hreflang.mjs";

import { getOccasionSeoContent } from "./src/data/occasionSeoContent.mjs";
import { getCategorySeoContent } from "./src/data/categorySeoContent.mjs";

import {
  BRAND_FAQ_COPY,
  BRAND_HEADING_COPY,
  BRAND_INTRO_FLOWERS_COPY,
  BRAND_INTRO_FOOD_COPY,
  BRAND_INTRO_GENERAL_COPY,
  BRANDS_FAQ_COPY,
  CATEGORY_FAQ_COPY,
  CATEGORY_HEADING_COPY,
  CATEGORY_INTRO_FLOWER_COPY,
  CATEGORY_INTRO_NONFLOWER_COPY,
  OCCASION_FAQ_COPY,
  OCCASION_HEADING_COPY,
  OCCASION_INTRO_COPY,
  HOMEPAGE_FAQ_COPY,
  SHOP_FAQ_COPY,
  CORPORATE_FAQ_COPY,
  WEDDINGS_FAQ_COPY,
  OCCASIONS_FAQ_COPY,
  CONTACT_FAQ_COPY,
} from "./src/lib/seo-shop-faqs.mjs";

import { CITY_SEO } from "./src/data/city-seo.mjs";

import { buildInternalLinks } from "./src/lib/internalLinks.mjs";

// Localised SEO strings for shared wishlist pages.
// The wishlist share path (/favorites/share/:token) has no locale prefix so
// these default to "en", but the dict is structured so a lang can be passed
// in future if a locale is ever derivable from the visitor context.
const WISHLIST_SEO = {
  en: {
    titleOne: "Gift Wishlist — 1 item on Presentail",
    titleMany: "Gift Wishlist — {count} items on Presentail",
    descriptionOne:
      "Someone shared a wishlist with you on Presentail — luxury flowers and gifts delivered across Lebanon, the UAE and Cyprus.",
    descriptionMany:
      "Someone shared a wishlist of {count} gifts with you on Presentail — luxury flowers and gifts delivered across Lebanon, the UAE and Cyprus.",
    imageAlt: "Presentail Gift Wishlist",
  },
  ar: {
    titleOne: "قائمة هدايا — هدية واحدة على Presentail",
    titleMany: "قائمة هدايا — {count} هدايا على Presentail",
    descriptionOne:
      "شارك شخص ما قائمة هدايا معك على Presentail — أزهار وهدايا فاخرة توصّل في لبنان والإمارات وقبرص.",
    descriptionMany:
      "شارك شخص ما قائمة بـ{count} هدايا معك على Presentail — أزهار وهدايا فاخرة توصّل في لبنان والإمارات وقبرص.",
    imageAlt: "قائمة هدايا Presentail",
  },
  fr: {
    titleOne: "Liste de souhaits — 1 article sur Presentail",
    titleMany: "Liste de souhaits — {count} articles sur Presentail",
    descriptionOne:
      "Quelqu'un a partagé une liste de souhaits avec vous sur Presentail — fleurs et cadeaux de luxe livrés au Liban, aux Émirats arabes unis et à Chypre.",
    descriptionMany:
      "Quelqu'un a partagé une liste de {count} cadeaux avec vous sur Presentail — fleurs et cadeaux de luxe livrés au Liban, aux Émirats arabes unis et à Chypre.",
    imageAlt: "Liste de souhaits Presentail",
  },
};

const ROUTE_KEYS = [
  { test: (r) => r === "" || r === "/", key: "home" },
  { test: (r) => r === "/shop", key: "shop" },
  { test: (r) => r === "/best-sellers", key: "bestSellers" },
  { test: (r) => r.startsWith("/product"), key: "product" },
  { test: (r) => r === "/brands", key: "brands" },
  { test: (r) => r.startsWith("/brand/"), key: "brand" },
  { test: (r) => r === "/occasions", key: "occasions" },
  { test: (r) => r.startsWith("/occasion/"), key: "occasion" },
  { test: (r) => r.startsWith("/category/"), key: "category" },
  // TODO: add { test: (r) => r.startsWith("/recipient/"), key: "recipient" }
  // when recipient pages are implemented, and wire isPageEligible({ pageType: "city-recipient" })
  // in the corresponding handler below (same pattern as brand/category/occasion).
  { test: (r) => r.startsWith("/blog/"), key: "blogPost" },
  { test: (r) => r === "/blog", key: "blog" },
  { test: (r) => r === "/cart", key: "cart" },
  { test: (r) => r === "/checkout", key: "checkout" },
  { test: (r) => r === "/order-confirmed", key: "orderConfirmed" },
  { test: (r) => r === "/auth", key: "auth" },
  { test: (r) => r === "/account" || r.startsWith("/account/"), key: "account" },
  { test: (r) => r === "/favorites", key: "favorites" },
  { test: (r) => r === "/sign-in" || r.startsWith("/sign-in/"), key: "auth" },
  { test: (r) => r === "/sign-up" || r.startsWith("/sign-up/"), key: "auth" },
  { test: (r) => r === "/reset-password", key: "auth" },
  { test: (r) => r === "/unauthorized", key: "auth" },
  { test: (r) => r === "/careers", key: "careers" },
  { test: (r) => r === "/partner", key: "partner" },
  { test: (r) => r === "/weddings", key: "weddings" },
  { test: (r) => r === "/corporate", key: "corporate" },
  { test: (r) => r === "/contact", key: "contact" },
  { test: (r) => r === "/faqs", key: "faqs" },
  { test: (r) => r === "/terms", key: "terms" },
  { test: (r) => r === "/privacy", key: "privacy" },
  { test: (r) => r === "/return-policy", key: "return-policy" },
  { test: (r) => r === "/shipping-policy", key: "shipping-policy" },
  { test: (r) => r === "/account-deletion", key: "account-deletion" },
  // Campaign landing — needs its own key so detectRouteKey does not fall
  // back to "home", which would set isUnknownSubRoute = true and suppress
  // the page's canonical / JSON-LD.
  { test: (r) => r === "/flower-delivery", key: "flower-delivery" },
  // Paid-only late-night campaign landing. Distinct key so detectRouteKey does
  // not fall back to "home" (which would set isUnknownSubRoute = true and
  // canonicalize to the city home). The route key is in NONINDEX_ROUTE_KEYS, so
  // it gets noindex,follow with a self-referencing canonical, no hreflang and no
  // JSON-LD. serve.mjs only serves this sub-route for /en-lb/beirut; every other
  // locale/city stays a 404 via the exact route guard.
  { test: (r) => r === "/late-night-flower-delivery", key: "late-night-flower-delivery" },
];

function detectRouteKey(rest) {
  for (const r of ROUTE_KEYS) if (r.test(rest)) return r.key;
  return "home";
}

const LOCALE_RE = /^([a-z]{2})-([a-z]{2})$/;

function parseLocalePath(pathname) {
  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0] ?? "";
  const m = first.match(LOCALE_RE);
  if (
    !m ||
    !SUPPORTED_LANGS.includes(m[1]) ||
    !SUPPORTED_COUNTRY_SLUGS.includes(m[2])
  ) {
    return {
      hasLocalePrefix: false,
      lang: null,
      country: null,
      city: null,
      rest: pathname || "/",
    };
  }
  // Greek is Cyprus-only: /el-ae/... and /el-lb/... are not valid locale
  // prefixes (serve.mjs 301s them to English) — treat as non-locale so we
  // never emit el canonicals/hreflang for non-Cyprus countries.
  if (m[1] === "el" && m[2] !== "cy") {
    return {
      hasLocalePrefix: false,
      lang: null,
      country: null,
      city: null,
      rest: pathname || "/",
    };
  }
  const city = segments[1] ?? null;
  const restSegs = city ? segments.slice(2) : [];
  const rest = restSegs.length ? "/" + restSegs.join("/") : "";
  return { hasLocalePrefix: true, lang: m[1], country: m[2], city, rest };
}

function buildLocalePath({ lang, country, city, rest }) {
  let p = `/${lang}-${country}`;
  if (city) p += `/${city}`;
  if (rest && rest !== "/") p += rest.startsWith("/") ? rest : "/" + rest;
  return p;
}

function format(template, params) {
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    k in params ? String(params[k]) : `{${k}}`,
  );
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const OS_IMAGE_HOSTNAME = "os.presentail.com";
const OS_IMAGE_PATH_PREFIX = "/api/storage/public-objects/";

export function buildTrustedOsImageProxyUrl(rawUrl, width, format = "webp") {
  try {
    const target = new URL(String(rawUrl).replace(/%(?![0-9a-fA-F]{2})/g, "%25"));
    if (
      target.protocol !== "https:" ||
      target.hostname !== OS_IMAGE_HOSTNAME ||
      target.username ||
      target.password ||
      !target.pathname.startsWith(OS_IMAGE_PATH_PREFIX) ||
      target.pathname === OS_IMAGE_PATH_PREFIX
    ) {
      return null;
    }
    return `/api/img/proxy?url=${encodeURIComponent(target.toString())}&w=${width}&f=${format}`;
  } catch {
    return null;
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function cityLabelFromSlug(slug) {
  return slug
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

// Small in-process LRU+TTL cache for the generic locale-aware head snippet.
// `buildSeoHead` is invoked for every request that hits the SPA shell —
// including high-traffic non-entity routes like `/{lang}-{country}/{city}` and
// `/shop` — and its output is fully determined by (pathname, basePath, origin,
// and any filter params present in the search string). Caching the result for
// ~60s makes repeat crawler / user hits essentially free without changing
// per-route content. Bounded with simple FIFO eviction (re-inserting on hit
// gives LRU-ish behaviour).
const GENERIC_SEO_CACHE_TTL_MS = 60_000;
const GENERIC_SEO_CACHE_MAX_ENTRIES = 500;
export const genericSeoCache = new Map();

/**
 * Compute a compact filter-params portion of the cache key.  Tracking params
 * (UTM, gclid, etc.) are intentionally excluded — they always produce noindex
 * and never affect the canonical, so all their combinations share one entry.
 * Filter/nav params DO affect the canonical on curated pages, so each unique
 * filter combination gets its own cache entry.
 */
function filterParamCacheKey(search) {
  if (!search || search === "?") return "";
  try {
    const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const entries = [];
    for (const [k, v] of sp.entries()) {
      if (FILTER_PARAMS_CANONICAL.has(k) || NAV_PARAMS_CANONICAL.has(k)) {
        entries.push(`${k}=${v}`);
      }
    }
    if (entries.length === 0) return "";
    return "\u0001f:" + entries.sort().join("&");
  } catch {
    return "";
  }
}

function genericSeoCacheKey(pathname, basePath, origin, search) {
  return `${pathname}\u0000${basePath}\u0000${origin}${filterParamCacheKey(search)}`;
}

export function getCachedGenericSeo(key) {
  const entry = genericSeoCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    genericSeoCache.delete(key);
    return null;
  }
  genericSeoCache.delete(key);
  genericSeoCache.set(key, entry);
  return entry.value;
}

export function setCachedGenericSeo(key, value) {
  if (genericSeoCache.size >= GENERIC_SEO_CACHE_MAX_ENTRIES) {
    const oldest = genericSeoCache.keys().next().value;
    if (oldest !== undefined) genericSeoCache.delete(oldest);
  }
  genericSeoCache.set(key, {
    value,
    expiresAt: Date.now() + GENERIC_SEO_CACHE_TTL_MS,
  });
}

/**
 * Build the SEO `<head>` snippet for the given pathname. `basePath` is the
 * artifact base prefix (e.g. "" or "/app"). `origin` is the site origin used
 * for absolute canonical / hreflang URLs.
 */
export function buildSeoHead(pathname, { origin = "", basePath = "", search = "" } = {}) {
  const cacheKey = genericSeoCacheKey(pathname, basePath, origin, search);
  const cached = getCachedGenericSeo(cacheKey);
  if (cached) return cached;
  const value = computeSeoHead(pathname, { origin, basePath, search });
  // Don't cache a shop-route entry built while the per-country category
  // availability is unknown — the body fragment omits the "Shop by Category"
  // list in that state, and caching it would pin the list-less version for
  // the full generic-cache TTL even after the metadata fetch succeeds.
  const parsedForCache = parseLocalePath(pathname);
  const isShopRoute =
    parsedForCache.hasLocalePrefix &&
    /^\/shop(?:\/|$)?/.test(parsedForCache.rest ?? "");
  if (
    !isShopRoute ||
    getShopCategorySlugsSync(parsedForCache.country) !== null
  ) {
    setCachedGenericSeo(cacheKey, value);
  }
  return value;
}

function computeSeoHead(pathname, { origin = "", basePath = "", search = "" } = {}) {
  const parsed = parseLocalePath(pathname);
  const hasValidCity =
    parsed.hasLocalePrefix &&
    parsed.country &&
    parsed.city &&
    isSupportedCity(parsed.country, parsed.city);
  // Treat unsupported city slugs (e.g. /en-ae/al-ain/...) as out-of-locale
  // so we don't emit a localized canonical/hreflang for a route the SPA
  // will redirect away from.
  const inLocale =
    parsed.hasLocalePrefix && parsed.country && (!parsed.city || hasValidCity);
  const lang = parsed.lang ?? "en";
  const dir = lang === "ar" ? "rtl" : "ltr";
  // Non-locale paths default to the global landing page, but the non-public
  // routes (cart, checkout, account, auth, favorites, order confirmation) are
  // also reachable without a locale prefix (e.g. bare `/cart`) and MUST be
  // marked noindex. Detect those specifically; every other bare path stays
  // "landing" so indexable pages keep their existing canonical/title behaviour.
  let routeKey;
  if (inLocale) {
    routeKey = detectRouteKey(parsed.rest);
  } else {
    const bareKey = detectRouteKey(parsed.rest);
    routeKey = NONINDEX_ROUTE_KEYS.has(bareKey) ? bareKey : "landing";
  }

  const cityKey =
    hasValidCity ? `${parsed.country}-${parsed.city}` : null;
  const cityLabel = cityKey
    ? CITY_NAMES[lang]?.[cityKey] ?? CITY_NAMES.en[cityKey] ?? cityLabelFromSlug(parsed.city)
    : "";
  const countryLabel = parsed.country
    ? COUNTRY_NAMES[lang]?.[parsed.country] ?? COUNTRY_NAMES.en[parsed.country]
    : "";

  const params = { city: cityLabel, country: countryLabel };
  // Contact and FAQs pages use a tiered title-length guardrail instead of the
  // plain TITLES template so all city names land in the 30–65 char audit window.
  const sharedSeo = routeKey === "contact"
    ? buildContactSeo({ lang, city: cityLabel, country: countryLabel })
    : routeKey === "faqs"
      ? buildFaqsSeo({ lang, city: cityLabel, country: countryLabel })
      : buildStaticSeo({ lang, routeKey, city: cityLabel, country: countryLabel });
  let title = sharedSeo.title;
  let h1 = sharedSeo.h1;
  if (process.env.NODE_ENV !== "production" && title.length > 65) {
    console.warn(
      `SEO title exceeds 65 chars (${title.length}) [${routeKey}/${lang}]: "${title}"`,
    );
  }
  let description = sharedSeo.description;

  // Per-city home-page overrides (hand-written, high-intent copy for selected
  // city landing pages, e.g. /en-lb/tripoli). Applied only on the exact city
  // home route so sub-routes and other cities keep template output.
  const cityHomeOverride =
    routeKey === "home" && cityKey && (parsed.rest === "" || parsed.rest === "/")
      ? getCityHomeSeoOverride(cityKey, lang)
      : null;
  if (cityHomeOverride) {
    title = cityHomeOverride.title;
    h1 = cityHomeOverride.h1;
    description = cityHomeOverride.description;
  }

  // /shop differentiation for Tripoli (EN): the landing page /en-lb/tripoli
  // owns the "flower delivery Tripoli" query; /shop is repositioned as the
  // full-catalogue browse experience so the two pages stop competing for the
  // same intent. Other cities keep the template title unchanged.
  const isTripoliShop =
    routeKey === "shop" && cityKey === "lb-tripoli" && lang === "en";
  if (isTripoliShop) {
    title = "Shop All Flowers & Gifts in Tripoli | Presentail"; // i18n-ignore — crawler-facing EN SEO copy
    description =
      "Browse Presentail's complete catalogue for Tripoli — every bouquet, rose arrangement, cake, chocolate box, plant and gift set available to order in one place."; // i18n-ignore
  }

  // /shop differentiation for Batroun (EN): mirrors the Tripoli pattern.
  // /en-lb/batroun owns the "flower delivery Batroun" query; /shop is the
  // full-catalogue browse experience so the two pages don't compete.
  const isBatrounShop =
    routeKey === "shop" && cityKey === "lb-batroun" && lang === "en";
  if (isBatrounShop) {
    title = "Shop All Flowers & Gifts in Batroun | Presentail"; // i18n-ignore — crawler-facing EN SEO copy
    description =
      "Browse Presentail's complete catalogue for Batroun — every bouquet, rose arrangement, cake, chocolate box, plant and gift set available to order in one place."; // i18n-ignore
  }

  // Shared paid-search flower landing (EN): the hydrated campaign is available
  // in Beirut, Dubai, and Abu Dhabi. Keep the server-rendered H1, intro, and
  // discoverability links aligned with that city-aware experience so direct
  // requests never fall back to the generic global storefront shell.
  //
  // Beirut's title/description stay untouched because that page already has
  // organic rankings. The two UAE routes need explicit metadata because the
  // generic route dictionaries do not define "flower-delivery" and otherwise
  // fall back to the global "Online Flower & Gift Delivery" metadata.
  const CAMPAIGN_LANDING_COPY = {
    "lb-beirut": {
      h1: "Flowers delivered in Beirut today",
      intro:
        "Hand-arranged this morning by our Achrafieh florists. Don't have their address? Order anyway — we'll collect it from the recipient for you.",
    },
    "ae-dubai": {
      title: "Flower Delivery in Dubai | Presentail",
      description:
        "Shop fresh flower arrangements available for delivery in Dubai. Choose a delivery date and time at checkout, with prices shown in AED.",
      h1: "Flower delivery in Dubai",
      intro:
        "Browse fresh arrangements available for Dubai. Delivery dates and times are confirmed at checkout.",
    },
    "ae-abu-dhabi": {
      title: "Flower Delivery in Abu Dhabi | Presentail",
      description:
        "Shop fresh flower arrangements available for delivery in Abu Dhabi. Choose a delivery date and time at checkout, with prices shown in AED.",
      h1: "Flower delivery in Abu Dhabi",
      intro:
        "Browse fresh arrangements available for Abu Dhabi. Delivery dates and times are confirmed at checkout.",
    },
  };
  const campaignLandingCopy =
    routeKey === "flower-delivery" && lang === "en" && cityKey
      ? CAMPAIGN_LANDING_COPY[cityKey] ?? null
      : null;
  if (campaignLandingCopy?.title) title = campaignLandingCopy.title;
  if (campaignLandingCopy?.description) {
    description = campaignLandingCopy.description;
  }

  // For product / category / occasion routes, extract the URL slug and derive
  // entity-specific title/description from it using the same builders that the
  // live entity branches use.  This replaces the completely generic
  // "Gift Delivery in {city} | Presentail" fallback with slug-specific copy
  // (e.g. "Plum Florals — Beirut | Presentail") so cold-cache / API-unavailable
  // responses are still meaningfully unique per page.  When the entity API
  // does respond, injectSeoTagsAsync overwrites these with the real fetched
  // title and description; this only affects the fallback path.
  if (
    (routeKey === "product" || routeKey === "category" || routeKey === "occasion") &&
    parsed.rest
  ) {
    const slugMatch = parsed.rest.match(
      /^\/(?:product|category|occasion)\/([^/?#]+)/,
    );
    if (slugMatch) {
      // Possessive occasion slugs lose their apostrophe when derived purely
      // from the URL (e.g. "mothers-day" → "Mothers Day"). Override the few
      // known cases so the generic fallback title is correct from the start,
      // before the entity fetch resolves and supplies the canonical name.
      const POSSESSIVE_SLUG_OVERRIDES = {
        "mothers-day": "Mother's Day",
        "fathers-day": "Father's Day",
        "valentines-day": "Valentine's Day",
        "womens-day": "Women's Day",
        "st-patricks-day": "St. Patrick's Day",
      };
      const slugName =
        POSSESSIVE_SLUG_OVERRIDES[slugMatch[1]] ??
        slugMatch[1]
          .split("-")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
      if (slugName) {
        const slugSeo =
          routeKey === "product"
            ? buildProductSeo({
                lang,
                productName: slugName,
                city: cityLabel,
                country: countryLabel,
                shortDescription: "",
              })
            : routeKey === "category"
            ? buildCategorySeo({
                lang,
                categoryName: slugName,
                city: cityLabel,
                country: countryLabel,
              })
            : buildOccasionSeo({
                lang,
                occasionName: slugName,
                city: cityLabel,
                country: countryLabel,
              });
        if (slugSeo.title) title = slugSeo.title;
        if (slugSeo.h1) h1 = slugSeo.h1;
        if (slugSeo.description) description = slugSeo.description;
      }
    }
  }

  const cleanBase = basePath.replace(/\/$/, "");
  // For locale-prefixed paths whose sub-route did not match any known route
  // (detectRouteKey fell back to "home"), canonicalize to the locale home
  // rather than self-canonicalizing the unknown URL.  This prevents soft-404
  // pages from pointing their canonical tag back at themselves.
  const isUnknownSubRoute =
    inLocale && routeKey === "home" && parsed.rest !== "" && parsed.rest !== "/";
  const canonicalPath = inLocale && !isUnknownSubRoute
    ? (pathname.replace(/\/$/, "") || "/")
    : inLocale
      ? buildLocalePath({ lang: parsed.lang, country: parsed.country, city: parsed.city, rest: "" })
      : "/";
  // For the root landing path (no locale prefix), CANONICAL_ORIGIN overrides
  // the request origin so the canonical tag points at the primary domain
  // (e.g. https://presentail.com) rather than the deployment hostname.
  const canonicalOrigin =
    routeKey === "landing" && !inLocale && process.env?.CANONICAL_ORIGIN
      ? process.env.CANONICAL_ORIGIN.replace(/\/$/, "")
      : origin;

  // Faceted-navigation crawl-budget controls:
  // Detect whether the request URL contains any filter/utility params and
  // whether the path+params match a curated filter landing page.
  const hasFilterParamsInSearch = search
    ? (function _chkFilter(s) {
        try {
          const sp = new URLSearchParams(s.startsWith("?") ? s.slice(1) : s);
          for (const k of sp.keys()) if (FILTER_PARAMS_CANONICAL.has(k)) return true;
        } catch { /* ignore */ }
        return false;
      })(search)
    : false;

  let isCuratedFilterPage = false;
  if (hasFilterParamsInSearch && CURATED_FILTER_PAGES.length > 0) {
    try {
      const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
      for (const entry of CURATED_FILTER_PAGES) {
        if (entry.path !== canonicalPath) continue;
        const matchesAll = Object.entries(entry.params ?? {}).every(
          ([k, v]) => sp.get(k) === String(v),
        );
        if (matchesAll) { isCuratedFilterPage = true; break; }
      }
    } catch { /* ignore */ }
  }

  // Canonical href: curated filter pages preserve their defining params so
  // Googlebot treats them as the authoritative URL.  All other pages (including
  // filter-parameterised non-curated URLs) point at the clean path.
  const canonicalHref = isCuratedFilterPage
    ? buildCanonicalUrl(pathname + (search || ""), { origin: canonicalOrigin, basePath })
    : canonicalOrigin + cleanBase + canonicalPath;

  // Landing, locale-prefixed home, and the generic browse routes (Shop,
  // Brands, All Occasions, and the Category fallback) use distinct, shorter OG
  // and Twitter copy. Other routes reuse the page title/description.
  const isLanding = routeKey === "landing" && !inLocale;
  const isHome = routeKey === "home" && inLocale && !isUnknownSubRoute;
  const hasGenericShareCopy = inLocale && Boolean(GENERIC_OG[routeKey]);
  let ogTitle = title;
  let ogDescription = description;
  let twitterTitle = title;
  let twitterDescription = description;
  if (isLanding) {
    const ogLang = LANDING_OG[lang] ?? LANDING_OG.en;
    const twLang = LANDING_TWITTER[lang] ?? LANDING_TWITTER.en;
    ogTitle = ogLang.title;
    ogDescription = ogLang.description;
    twitterTitle = twLang.title;
    twitterDescription = twLang.description;
  } else if (isHome) {
    if (cityHomeOverride) {
      // Overridden city homes share the exact page title/description so the
      // OG/Twitter share cards agree with the SERP snippet.
      ogTitle = title;
      ogDescription = description;
      twitterTitle = title;
      twitterDescription = description;
    } else {
      const ogLang = HOME_OG[lang] ?? HOME_OG.en;
      const twLang = HOME_TWITTER[lang] ?? HOME_TWITTER.en;
      ogTitle = format(ogLang.title, params);
      ogDescription = format(ogLang.description, params);
      twitterTitle = format(twLang.title, params);
      twitterDescription = format(twLang.description, params);
    }
  } else if (hasGenericShareCopy) {
    const ogLang = GENERIC_OG[routeKey][lang] ?? GENERIC_OG[routeKey].en;
    const twLang = GENERIC_TWITTER[routeKey][lang] ?? GENERIC_TWITTER[routeKey].en;
    ogTitle = format(ogLang.title, params);
    ogDescription = format(ogLang.description, params);
    twitterTitle = format(twLang.title, params);
    twitterDescription = format(twLang.description, params);
  }

  const siteUrl = `${origin}${cleanBase}`;

  const lines = [];
  lines.push(`<meta name="description" content="${escapeAttr(description)}" />`);
  // Satellite-city best-sellers use noindex,follow while hub-city pages
  // (/en-lb/beirut/best-sellers, /en-ae/dubai/best-sellers, etc.) remain
  // fully indexed. Both retain an in-document canonical: noindex controls
  // indexability, while canonical consolidates duplicate signals.
  const _isSatelliteBestSellers =
    routeKey === "bestSellers" &&
    Boolean(parsed.city) && Boolean(parsed.country) &&
    parsed.city !== HUB_CITY[parsed.country];
  lines.push(`<link rel="canonical" href="${escapeAttr(canonicalHref)}" />`);
  // Non-public routes (cart, checkout, account, auth, favorites, order
  // confirmation) must not be indexed, but their links may still be followed.
  // Filter-parameterised non-curated URLs also get noindex so Googlebot does
  // not spend crawl budget on duplicate pages like /shop?sort=price-asc.
  if (NONINDEX_ROUTE_KEYS.has(routeKey) || (hasFilterParamsInSearch && !isCuratedFilterPage) || _isSatelliteBestSellers) {
    lines.push(`<meta name="robots" content="noindex, follow" />`);
  }
  lines.push(`<meta property="og:title" content="${escapeAttr(ogTitle)}" />`);
  lines.push(
    `<meta property="og:description" content="${escapeAttr(ogDescription)}" />`,
  );
  lines.push(`<meta property="og:type" content="website" />`);
  lines.push(`<meta property="og:site_name" content="Presentail" />`);
  lines.push(
    `<meta property="og:locale" content="${escapeAttr((parsed.country && OG_LOCALE_COUNTRY[lang]?.[parsed.country]) || OG_LOCALE[lang] || "en_US")}" />`,
  );
  lines.push(`<meta property="og:url" content="${escapeAttr(canonicalHref)}" />`);
  lines.push(`<meta name="twitter:card" content="summary_large_image" />`);
  lines.push(`<meta name="twitter:site" content="@presentail" />`);
  lines.push(`<meta name="twitter:title" content="${escapeAttr(twitterTitle)}" />`);
  lines.push(
    `<meta name="twitter:description" content="${escapeAttr(twitterDescription)}" />`,
  );
  // OG / Twitter image for generic (non-entity) pages.
  // City pages (inLocale + valid city) get a per-city branded card from the
  // /api/og-image/city/:country/:city endpoint (same visual style as
  // product/brand/occasion cards — dark-green panel with city + country name).
  // All other pages fall back to the static opengraph.jpg.
  const hasCityOgImage = inLocale && hasValidCity && parsed.country && parsed.city;
  const cityOgImageUrl = hasCityOgImage
    ? `${origin}/api/og-image/city/${encodeURIComponent(parsed.country)}/${encodeURIComponent(parsed.city)}`
    : null;
  const defaultImage = cityOgImageUrl ?? `${origin}${cleanBase}/opengraph.jpg?v=2`;
  const defaultImageAlt = hasCityOgImage
    ? `${cityLabel}, ${countryLabel} — Presentail` // i18n-ignore — city/country name + brand
    : "Presentail — Luxury Flower & Gift Delivery"; // i18n-ignore — brand tagline used as OG image alt fallback
  lines.push(`<meta property="og:image" content="${escapeAttr(defaultImage)}" />`);
  lines.push(`<meta property="og:image:secure_url" content="${escapeAttr(defaultImage)}" />`);
  lines.push(`<meta property="og:image:type" content="image/jpeg" />`);
  lines.push(`<meta property="og:image:width" content="1200" />`);
  lines.push(`<meta property="og:image:height" content="630" />`);
  lines.push(`<meta property="og:image:alt" content="${escapeAttr(defaultImageAlt)}" />`);
  lines.push(`<meta name="twitter:image" content="${escapeAttr(defaultImage)}" />`);
  lines.push(`<meta name="twitter:image:alt" content="${escapeAttr(defaultImageAlt)}" />`);
  // Structured data (JSON-LD). Truly transactional / private routes (cart,
  // checkout, order confirmation, auth, account, favorites) carry NO structured
  // data because they are user-specific and non-public. Group B static content
  // pages (terms, privacy, careers, partner, blog) are noindex but still public
  // content — they keep their schema markup (WebPage etc.) since Googlebot may
  // still crawl them even without indexing.
  const emitJsonLd =
    !NONINDEX_ROUTE_KEYS.has(routeKey) || STATIC_PAGE_GROUP.B.has(routeKey);

  // Collect every JSON-LD node for this page, then emit them in ONE <script>
  // block (as a @graph when there is more than one). Grouping avoids duplicate
  // entities (e.g. a second Organization) and keeps the head tidy.
  const jsonLdNodes = [];

  if (emitJsonLd) {
    // Organization is the brand entity — emit on every public, indexable page.
    jsonLdNodes.push(buildOrganizationSchema(siteUrl));
    // WebSite — emit on top-level pages (homepage / landing / city home) but
    // NOT on deep entity/listing pages (brand, shop, product, occasion, etc.)
    // so schema validators never see duplicate WebSite nodes across page types.
    if (routeKey === "home" || routeKey === "landing") {
      jsonLdNodes.push(buildWebSiteSchema(siteUrl));
    }
  }

  // LocalBusiness organisation block + Home > {City} breadcrumb, emitted ONLY on
  // the canonical hub-city homepage for each country (Beirut/LB, Dubai/AE,
  // Nicosia/CY).  Non-hub city pages carry breadcrumb and product-list markup
  // only — repeating a near-identical local business schema across all 37 city
  // homepages with one shared phone/address is a false multi-location claim.
  const isHubCityHome =
    parsed.city &&
    parsed.country &&
    ORGANIZATION_HUB_CITIES[parsed.country] === parsed.city;
  if (emitJsonLd && routeKey === "home" && hasValidCity) {
    // LocalBusiness organisation node only on the hub-city homepage.
    if (isHubCityHome) {
      const countryPlain = parsed.country
        ? COUNTRY_PLAIN_NAMES[lang]?.[parsed.country] ??
          COUNTRY_PLAIN_NAMES.en[parsed.country] ??
          countryLabel
        : countryLabel;
      const cityCanonicalUrl = parsed.city
        ? `${origin}${cleanBase}/${lang}-${parsed.country}/${parsed.city}`
        : siteUrl;
      jsonLdNodes.push(
        buildLocalBusinessSchema({
          siteUrl,
          cityName: cityLabel,
          countryName: countryPlain,
          countryCode: parsed.country,
          cityUrl: cityCanonicalUrl,
        }),
      );
    }
    // Home > {Country} > {City} breadcrumb on EVERY city homepage. The
    // country level reinforces geo relevance for country-level queries without
    // needing a separate hub page to link through.
    const breadcrumbHomeLabel =
      lang === "ar" ? "الرئيسية" : lang === "fr" ? "Accueil" : "Home";
    const breadcrumbCountryLabel = parsed.country
      ? COUNTRY_PLAIN_NAMES[lang]?.[parsed.country] ??
        COUNTRY_PLAIN_NAMES.en[parsed.country] ??
        countryLabel
      : null;
    const countryBreadcrumbUrl = parsed.country
      ? `${origin}${cleanBase}/${lang}-${parsed.country}`
      : null;
    const cityBreadcrumb = buildBreadcrumbListSchema([
      { name: breadcrumbHomeLabel, url: siteUrl },
      ...(breadcrumbCountryLabel
        ? [{ name: breadcrumbCountryLabel, url: countryBreadcrumbUrl }]
        : []),
      { name: cityLabel },
    ]);
    // Give the breadcrumb a stable @id when the city home also emits a
    // CollectionPage node below, so the CollectionPage can reference it.
    if (cityHomeOverride) {
      cityBreadcrumb["@id"] = `${canonicalHref}#breadcrumb`;
    }
    jsonLdNodes.push(cityBreadcrumb);

    // CollectionPage entity for overridden city homes (e.g. /en-lb/tripoli):
    // ties the page's canonical URL, H1 and meta description together and
    // anchors it to the WebSite, BreadcrumbList and Organization nodes.
    if (cityHomeOverride) {
      jsonLdNodes.push({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "@id": canonicalHref,
        url: canonicalHref,
        name: cityHomeOverride.h1,
        description: cityHomeOverride.description,
        inLanguage: `${lang}-${(parsed.country || "").toUpperCase()}`,
        isPartOf: { "@id": `${siteUrl}/#website` },
        breadcrumb: { "@id": `${canonicalHref}#breadcrumb` },
        publisher: { "@id": `${siteUrl}/#organization` },
      });
    }
  }

  // BreadcrumbList on navigable non-home locale pages. Gives search engines a
  // clear trail for every major section so they can understand site hierarchy
  // without relying on JavaScript navigation.
  // Breadcrumb labels in each supported UI language, sourced from the same
  // locale catalogue used by the storefront (nav.ts / footer locale files).
  // These are JSON-LD values that must match visible page labels per locale.
  const ROUTE_CRUMB_LABELS = { // i18n-ignore — locale-keyed breadcrumb label map
    en: {
      home: "Home",
      shop: "Shop", brands: "Brands", occasions: "Occasions",
      weddings: "Weddings", corporate: "Corporate", contact: "Contact",
      faqs: "FAQs", terms: "Terms of Use", privacy: "Privacy Policy",
      blog: "Journal", careers: "Careers", partner: "Partner",
      "return-policy": "Return Policy", "shipping-policy": "Shipping Policy",
      "account-deletion": "Account Deletion Policy",
    },
    ar: {
      home: "الرئيسية",
      shop: "تسوّق", brands: "العلامات التجارية", occasions: "المناسبات",
      weddings: "الأفراح", corporate: "الشركات", contact: "اتصل بنا",
      faqs: "الأسئلة الشائعة", terms: "شروط الاستخدام",
      privacy: "سياسة الخصوصية", blog: "المدونة", careers: "الوظائف",
      partner: "شريك",
      "return-policy": "سياسة الإرجاع", "shipping-policy": "سياسة الشحن",
      "account-deletion": "سياسة حذف الحساب",
    },
    fr: {
      home: "Accueil",
      shop: "Boutique", brands: "Marques", occasions: "Occasions",
      weddings: "Mariages", corporate: "Entreprises", contact: "Contact",
      faqs: "FAQ", terms: "Conditions d'utilisation",
      privacy: "Politique de confidentialité", blog: "Journal",
      careers: "Carrières", partner: "Partenariat",
      "return-policy": "Politique de retour", "shipping-policy": "Politique de livraison",
      "account-deletion": "Politique de suppression de compte",
    },
    el: {
      home: "Αρχική",
      shop: "Κατάστημα", brands: "Μάρκες", occasions: "Περιστάσεις",
      weddings: "Γάμοι", corporate: "Εταιρικά", contact: "Επικοινωνία",
      faqs: "Συχνές ερωτήσεις", terms: "Όροι χρήσης",
      privacy: "Πολιτική απορρήτου", blog: "Ημερολόγιο",
      careers: "Καριέρα", partner: "Συνεργασία",
      "return-policy": "Πολιτική επιστροφών", "shipping-policy": "Πολιτική αποστολής",
      "account-deletion": "Πολιτική διαγραφής λογαριασμού",
    },
  };
  const crumbLabels = ROUTE_CRUMB_LABELS[lang] ?? ROUTE_CRUMB_LABELS.en;
  // Skip the "home" route here: city homepages already emit their own
  // Home > {City} breadcrumb alongside LocalBusiness above, and a plain
  // locale home needs no trail. Without this guard the generic builder
  // produced a second, malformed list ending in "Home" again, and search
  // engines discard pages with conflicting BreadcrumbList structures.
  if (emitJsonLd && inLocale && routeKey !== "home" && crumbLabels[routeKey]) {
    const localePathBase = parsed.city
      ? `${origin}${cleanBase}/${parsed.lang}-${parsed.country}/${parsed.city}`
      : `${origin}${cleanBase}/${parsed.lang}-${parsed.country}`;
    const navCrumbs = [{ name: crumbLabels.home, url: siteUrl }];
    if (cityLabel && localePathBase !== siteUrl) {
      navCrumbs.push({ name: cityLabel, url: localePathBase });
    }
    navCrumbs.push({ name: crumbLabels[routeKey] });
    jsonLdNodes.push(buildBreadcrumbListSchema(navCrumbs));
  }

  // WebPage schema for public policy pages, plus ContactPage for Contact.
  if (emitJsonLd && (routeKey === "terms" || routeKey === "privacy" || routeKey === "return-policy" || routeKey === "shipping-policy" || routeKey === "account-deletion")) {
    jsonLdNodes.push(
      buildWebPageSchema({
        siteUrl,
        url: canonicalHref,
        name: title,
        description,
      }),
    );
  }
  if (emitJsonLd && routeKey === "contact") {
    jsonLdNodes.push(
      buildContactPageSchema({
        siteUrl,
        url: canonicalHref,
        name: title,
        description,
      }),
    );
  }

  // Helper: build a FAQPage mainEntity array from a copy map (en/ar/fr),
  // substituting {city} and optionally {name} template placeholders.
  const buildFaqMainEntity = (copyMap, params) => {
    const pickLang = (/** @type {string} */ l) =>
      (l === "ar" || l === "fr") ? l : "en";
    const items = copyMap[pickLang(lang)] ?? copyMap.en;
    return (items ?? []).map(({ q, a }) => ({
      "@type": "Question",
      name: formatTemplate(q, params),
      acceptedAnswer: { "@type": "Answer", text: formatTemplate(a, params) },
    }));
  };

  // FAQPage JSON-LD for generic public routes whose FAQ section is rendered by
  // SEOContentSection. Emitting this in the initial HTML means AI crawlers and
  // bots that don't execute JS (GPTBot, ClaudeBot, PerplexityBot, social
  // preview fetchers) see the same Q&A signals that the rendered page shows.
  const genericFaqRoutes = {
    home:      HOMEPAGE_FAQ_COPY,
    shop:      SHOP_FAQ_COPY,
    corporate: CORPORATE_FAQ_COPY,
    weddings:  WEDDINGS_FAQ_COPY,
    occasions: OCCASIONS_FAQ_COPY,
    contact:   CONTACT_FAQ_COPY,
  };
  if (emitJsonLd && routeKey === "home" && hasValidCity) {
    // City home pages get city-specific delivery FAQs that vary by city name
    // and country, giving each of the 37 city pages distinct Q&A schema.
    const cityFaqs = buildCityFaqSchema(
      cityLabel || "",
      (parsed.country || "").toUpperCase(),
      lang,
    );
    const mainEntity = cityFaqs.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    }));
    if (mainEntity.length > 0) {
      jsonLdNodes.push({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity,
      });
    }
  } else if (emitJsonLd && genericFaqRoutes[routeKey]) {
    const params = { city: cityLabel || "" };
    const mainEntity = buildFaqMainEntity(genericFaqRoutes[routeKey], params);
    if (mainEntity.length > 0) {
      jsonLdNodes.push({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity,
      });
    }
  }

  // FAQPage JSON-LD: emit structured Q&A markup for the /brands listing page so
  // search engines can show expandable FAQ rich results. Mirrors the pattern used
  // for individual brand/category/occasion pages. Uses {city} substitution only
  // (no {name} — the brands listing is not scoped to a single entity).
  if (emitJsonLd && routeKey === "brands") {
    const params = { city: cityLabel || "" };
    const mainEntity = buildFaqMainEntity(BRANDS_FAQ_COPY, params);
    if (mainEntity.length > 0) {
      jsonLdNodes.push({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity,
      });
    }
  }

  // FAQPage JSON-LD: emit structured Q&A markup for the /faqs route so search
  // engines and AI crawlers can reliably understand the page as a Q&A resource.
  if (emitJsonLd && routeKey === "faqs") {
    const faqLangData = FAQ_COPY[lang] ?? FAQ_COPY.en;
    const mainEntity = (faqLangData.groups ?? []).flatMap((g) => g.items).map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    }));
    if (mainEntity.length > 0) {
      jsonLdNodes.push({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity,
      });
    }
  }

  if (jsonLdNodes.length === 1) {
    lines.push(jsonLdTag(jsonLdNodes[0]));
  } else if (jsonLdNodes.length > 1) {
    lines.push(jsonLdGraphTag(jsonLdNodes));
  }

  // Satellite best-sellers pages (_isSatelliteBestSellers) are excluded from
  // the hreflang block entirely: they carry noindex,follow + no canonical, so
  // emitting hreflang would create a cluster with no matching self-referencing
  // canonical — exactly the "conflicting hreflang / canonical" Semrush flag.
  // Google ignores noindexed pages in hreflang clusters anyway, so suppressing
  // hreflang here is both correct and prevents the cross-page conflict that
  // would otherwise appear on every other city's best-sellers page that
  // references this satellite URL as one of its alternates.
  if (inLocale && !NONINDEX_ROUTE_KEYS.has(routeKey) && !_isSatelliteBestSellers) {
    // Build the intra-city hreflang cluster: en/ar/fr variants of the SAME
    // city plus x-default pointing at the en variant of that city. No
    // cross-country links — each city's cluster stays self-contained so
    // Google never merges different cities. Soft-404 alternates point at the
    // locale home (entityPath = "").
    const entityPathForHreflang = isUnknownSubRoute
      ? ""
      : (parsed.rest || "").replace(/^\//, "").replace(/\/$/, "");
    const hreflangSet = buildHreflangSet(
      entityPathForHreflang,
      { country: parsed.country, city: parsed.city || HUB_CITY[parsed.country] },
      origin + cleanBase,
    );
    for (const { hreflang, href } of hreflangSet) {
      lines.push(
        `<link rel="alternate" hreflang="${escapeAttr(hreflang)}" href="${escapeAttr(href)}" />`,
      );
    }
  }

  // Root landing page (/) intentionally emits NO hreflang: with intra-city
  // clusters, listing every locale home here would create a non-reciprocal
  // cross-country cluster (the locale homes only reference their own city's
  // language variants), which Google ignores or misreads.

  const localeBase = inLocale && parsed.lang && parsed.country && parsed.city
    ? `${origin}${cleanBase}/${parsed.lang}-${parsed.country}/${parsed.city}`
    : null;

  // Collect resolved FAQ items for the prerendered body fragment. These mirror
  // the JSON-LD FAQPage nodes above so the crawler-visible body has the same
  // meaningful h2/h3 structure as the JSON-LD without relying on JavaScript.
  let bodyFaqItems = [];
  if (inLocale) {
    const pickFaqBodyLang = (l) => ((l === "ar" || l === "fr") ? l : "en");
    const faqBodyL = pickFaqBodyLang(lang);
    if (routeKey === "home" && hasValidCity) {
      // City home pages: use city-specific FAQ to match JSON-LD above.
      const cityFaqsBody = buildCityFaqSchema(
        cityLabel || "",
        (parsed.country || "").toUpperCase(),
        lang,
      );
      // Emit the FULL city FAQ set (not a slice) so the visible FAQ block in
      // the initial HTML matches the FAQPage JSON-LD above exactly — Google
      // treats hidden/mismatched FAQ schema as a cloaking signal.
      bodyFaqItems = cityFaqsBody.map(({ question, answer }) => ({
        q: question,
        a: answer,
      }));
    } else if (genericFaqRoutes[routeKey]) {
      const faqBodyParams = { city: cityLabel || "" };
      const raw = genericFaqRoutes[routeKey][faqBodyL] ?? genericFaqRoutes[routeKey].en ?? [];
      bodyFaqItems = raw.slice(0, 3).map(({ q, a }) => ({
        q: formatTemplate(q, faqBodyParams),
        a: formatTemplate(a, faqBodyParams),
      }));
    } else if (routeKey === "brands") {
      const faqBodyParams = { city: cityLabel || "" };
      const raw = BRANDS_FAQ_COPY[faqBodyL] ?? BRANDS_FAQ_COPY.en ?? [];
      bodyFaqItems = raw.slice(0, 3).map(({ q, a }) => ({
        q: formatTemplate(q, faqBodyParams),
        a: formatTemplate(a, faqBodyParams),
      }));
    } else if (routeKey === "faqs") {
      const faqLangData = FAQ_COPY[lang] ?? FAQ_COPY.en;
      bodyFaqItems = (faqLangData.groups ?? [])
        .flatMap((g) => g.items)
        .slice(0, 3)
        .map(({ q, a }) => ({ q, a }));
    }
  }

  // City-specific intro paragraph — injected into the prerendered body so
  // same-country city pages are distinct enough to pass the check-city-similarity
  // Jaccard-80% gate. Look up by the same "{country}-{city}" key used in CITY_SEO.
  // Extended to brands, occasions, and shop listing pages so those pages are
  // also textually differentiated per city, not just the home page.
  const CITY_SEO_ROUTES = new Set(["home", "brands", "occasions", "shop"]);
  let citySpecificContent = "";
  if (CITY_SEO_ROUTES.has(routeKey) && hasValidCity && cityKey) {
    const cityEntry = CITY_SEO[cityKey];
    if (cityEntry) {
      citySpecificContent = cityEntry[lang] ?? cityEntry.en ?? "";
    }
  }

  // Nearby-city navigation links — injected for city home pages so AI crawlers
  // and non-JS bots can follow links to other cities in the same country. Up to
  // 4 links, ordered by CITY_SLUGS_BY_COUNTRY array position, with localized
  // anchor text ("Flower delivery in {city}"). Provides a crawlable web of city
  // pages without relying on JavaScript navigation.
  let nearbyCityHtml = "";
  if (routeKey === "home" && hasValidCity && parsed.country && parsed.city && localeBase) {
    nearbyCityHtml = buildNearbyCityLinks({
      country: parsed.country,
      currentCity: parsed.city,
      lang,
      origin,
      cleanBase,
    });
  }

  const bodyHtml = buildGenericBodyHtml(routeKey, {
    h1,
    description,
    localeBase,
    faqItems: bodyFaqItems,
    cityContent: citySpecificContent,
    nearbyCityHtml,
    cityLabel,
    countryLabel,
    lang,
    cityKey,
    h1Override:
      cityHomeOverride?.h1 ??
      (isTripoliShop
        ? "Shop All Flowers & Gifts in Tripoli"
        : campaignLandingCopy?.h1),
    introOverride: cityHomeOverride?.intro ?? campaignLandingCopy?.intro,
    whyPoints: cityHomeOverride?.whyPoints,
    campaignLanding: campaignLandingCopy,
  });

  return {
    lang,
    dir,
    title,
    headSnippet: lines.join("\n    "),
    titleTag: `<title>${escapeHtml(title)}</title>`,
    cityLabel,
    countryLabel,
    bodyHtml,
  };
}

/**
 * Returns true when the given pathname resolves to a non-English blog post that
 * has no dedicated translation and therefore serves the English article as a
 * fallback.  Used by serve.mjs to set `X-Robots-Tag: noindex, follow` at the
 * HTTP-header level before the HTML body is generated — necessary because
 * crawlers that issue HEAD requests (e.g. Semrush) never see meta tags inside
 * the body.
 *
 * Matches two URL shapes:
 *   /{lang}/blog/{slug}                  (canonical lang-only path)
 *   /{lang}-{cc}/{city}/blog/{slug}      (city-prefixed legacy/redirect path)
 *
 * Only `ar`, `fr`, and `el` are checked; English is never a "fallback" to itself.
 *
 * @param {string} pathname
 * @returns {boolean}
 */
export function isBlogFallbackPath(pathname) {
  // Match the lang segment and slug from both path shapes.
  const m = pathname.match(/^\/(ar|fr|el)(?:-[a-z]{2})?(?:\/[^/]+)?\/blog\/([^/?#]+)$/);
  if (!m) return false;
  const lang = m[1];
  let slug;
  try { slug = decodeURIComponent(m[2]); } catch { slug = m[2]; }
  const articlesByLang = BLOG_POSTS[slug];
  if (!articlesByLang) return false;
  // Detect the "undefined key" pattern (language key simply absent) and the
  // "get-accessor alias" pattern (get ar() { return this.en }) used in some
  // blogPostsCopy.js entries.
  return articlesByLang[lang] === undefined || articlesByLang[lang] === articlesByLang.en;
}

/**
 * Inject locale-aware tags into a raw index.html string. Replaces the existing
 * <title> and <html lang="..."> attributes, and inserts the head snippet
 * immediately before </head>.
 */
export function injectSeoTags(html, pathname, opts = {}) {
  const { lang, dir, headSnippet, titleTag, bodyHtml } = buildSeoHead(pathname, opts);
  return assembleHtml(html, { lang, dir, headSnippet, titleTag, bodyHtml });
}

// Critical inline CSS for the pre-hydration SEO fallback content injected
// into <div id="root">. Before the compiled stylesheet loads, the fallback
// would otherwise paint as raw browser-default HTML (Times New Roman H1,
// blue underlined links, visible "sr-only" links). This block gives it brand
// typography/colors and an inline-safe .sr-only so screen-reader-only markup
// is never visible. It is emitted INSIDE #root, next to the fallback markup,
// so React's createRoot() removes both on hydration — the rules can never
// leak into the live app's styling. Values mirror src/index.css tokens:
// foreground 20 19% 13%, primary/teal 190 100% 15%, muted-foreground
// 213 8% 40%, radius 18px, content max-width 1200px.
export const SEO_FALLBACK_CRITICAL_CSS =
  // JS-enabled visitors must never see the fallback flash: the inline
  // SEO_FALLBACK_JS_FLAG_SCRIPT (emitted immediately before this stylesheet,
  // inside #root) sets data-seo-js on <html> before first paint, and this
  // rule hides the fallback under that flag. Without JavaScript the attribute
  // is never set, so crawlers and no-JS clients still see the content — and
  // the markup itself is unchanged in the served HTML either way.
  "html[data-seo-js] [data-seo-fallback]{display:none}" +
  "[data-seo-fallback]{font-family:'Inter',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;color:hsl(20 19% 13%);background:#fff;max-width:1200px;margin:0 auto;padding:2rem 1rem;line-height:1.6;-webkit-font-smoothing:antialiased}" +
  "[data-seo-fallback] h1{font-family:'Playfair Display','Noto Naskh Arabic',Georgia,serif;font-size:1.75rem;font-weight:700;line-height:1.25;margin:0 0 1rem;color:hsl(190 100% 15%)}" +
  "[data-seo-fallback] h2{font-family:'Playfair Display','Noto Naskh Arabic',Georgia,serif;font-size:1.25rem;font-weight:700;line-height:1.3;margin:2rem 0 .75rem;color:hsl(190 100% 15%)}" +
  "[data-seo-fallback] h3{font-size:1rem;font-weight:600;margin:1.25rem 0 .25rem}" +
  "[data-seo-fallback] p{margin:0 0 .75rem;color:hsl(213 8% 40%)}" +
  "[data-seo-fallback] a{color:hsl(190 100% 15%);text-decoration:none}" +
  "[data-seo-fallback] ul{list-style:none;margin:0 0 1rem;padding:0}" +
  "[data-seo-fallback] li{margin:.25rem 0}" +
  "[data-seo-fallback] .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}" +
  "[data-seo-fallback] section[data-ssr-products] ul{display:grid;grid-template-columns:repeat(2,1fr);gap:1rem}" +
  "@media(min-width:768px){[data-seo-fallback] section[data-ssr-products] ul{grid-template-columns:repeat(4,1fr)}}" +
  "[data-seo-fallback] section[data-ssr-products] li{margin:0}" +
  "[data-seo-fallback] section[data-ssr-products] a{display:block}" +
  "[data-seo-fallback] section[data-ssr-products] img{width:100%;height:auto;border-radius:18px;display:block;margin-bottom:.5rem;background:hsl(220 13% 95%)}" +
  "[data-seo-fallback] section[data-ssr-products] span{display:block;font-size:.875rem;color:hsl(20 19% 13%)}";

// Inline flag script emitted just before the fallback markup (inside #root,
// so React's createRoot() removes it on hydration together with the style
// and fallback nodes). It runs synchronously during HTML parsing — before
// the fallback content can paint — so JS-enabled visitors go from blank
// straight to the app with no flash of crawler-facing copy. No-JS clients
// never execute it, keeping the fallback fully visible for them.
export const SEO_FALLBACK_JS_FLAG_SCRIPT =
  '<script>document.documentElement.setAttribute("data-seo-js","")</script>'; // i18n-ignore

const SEO_FALLBACK_STYLE_TAG = `${SEO_FALLBACK_JS_FLAG_SCRIPT}<style data-seo-fallback-css>${SEO_FALLBACK_CRITICAL_CSS}</style>`;

function assembleHtml(html, { lang, dir, headSnippet, titleTag, bodyHtml = null }) {
  let out = html;
  out = out.replace(
    /<html[^>]*>/i,
    `<html lang="${escapeAttr(lang)}" dir="${escapeAttr(dir)}">`,
  );
  if (/<title>[\s\S]*?<\/title>/i.test(out)) {
    out = out.replace(/<title>[\s\S]*?<\/title>/i, titleTag);
  } else {
    out = out.replace(/<head>/i, `<head>\n    ${titleTag}`);
  }
  out = out.replace(/<\/head>/i, `    ${headSnippet}\n  </head>`);

  // Inject prerendered HTML into #root so AI crawlers (GPTBot, ClaudeBot,
  // PerplexityBot, Applebot-Extended, etc.) that do not execute JavaScript
  // can read real page content — headings, descriptions, navigation links, and
  // entity details — rather than an empty shell.  React's createRoot() in
  // main.tsx replaces all children of #root when JS runs, so JS users see the
  // fully interactive app with no visible flash or difference.
  if (bodyHtml) {
    out = out.replace(
      /<div\s+id="root"\s*><\/div>/i,
      `<div id="root">${SEO_FALLBACK_STYLE_TAG}<div data-seo-fallback>${bodyHtml}</div></div>`,
    );
  }

  return out;
}

// ---------------------------------------------------------------------------
// Prerendered body HTML builders
//
// These functions produce lightweight HTML that is injected into <div id="root">
// server-side.  The content is picked up by AI crawlers and other no-JS bots;
// React replaces it on mount for regular users.
// ---------------------------------------------------------------------------

// Mirrors FLOWER_CATEGORY_SLUGS in src/components/SEOContentSection.tsx.
// Must be kept in sync — both lists drive the introFlower vs introNonFlower
// selection so the server-rendered body and the React-rendered copy agree.
const FLOWER_CATEGORY_SLUGS_SERVER = new Set([
  "hand-bouquets",
  "flower-boxes",
  "flower-baskets",
]);

// Static featured category list for the Shop page body fragment.
// Mirrors the category pills rendered by Shop.tsx so the prerendered block
// and the hydrated React view contain exactly the same links (no cloaking).
// Up to 8 entries emitted as <ul> under a "Shop by Category" <h2>. // i18n-ignore — static EN-only crawlers-only category list
const FEATURED_SHOP_CATEGORIES = [
  { slug: "hand-bouquets", name: "Hand Bouquets" },
  { slug: "flower-boxes", name: "Flower Boxes" },
  { slug: "cakes", name: "Cakes" },
  // "chocolate" (singular) is the canonical OS category slug — "chocolates" was wrong.
  { slug: "chocolate", name: "Chocolates" },
  { slug: "plants", name: "Plants" },
  // "gift-baskets" is the canonical OS slug for hampers/baskets — "hampers" was wrong.
  { slug: "gift-baskets", name: "Gift Hampers" },
  { slug: "candles", name: "Candles" },
  // "stuffed-animals" replaces "perfume" which has no matching catalog category and 404s.
  { slug: "stuffed-animals", name: "Bears & Stuffed Animals" },
];

// Per-country available-category cache for the crawler-facing Shop fragment.
// The React Shop/BestSellers/Footer views already filter category links by
// per-country catalog metadata counts; the prerendered fragment must apply
// the same filter or crawlers see links to empty categories (e.g. Cyprus
// only stocks hand-bouquets/flower-vases/balloons, yet the static list used
// to link cakes, chocolate, plants, …). Populated asynchronously by
// ensureShopCategoriesForSeo(); read synchronously during body-fragment
// generation. Fail-closed: when counts for a country are unknown, no
// category list is emitted rather than a wrong one.
const SHOP_CATEGORY_CACHE_TTL_MS = 10 * 60 * 1000;
const SHOP_CATEGORY_FAILURE_TTL_MS = 60 * 1000;
const shopCategorySlugsByCountry = new Map(); // countrySlug -> { slugs: Set, expiresAt }
const shopCategoryInFlight = new Map(); // countrySlug -> Promise
const shopCategoryFailedUntil = new Map(); // countrySlug -> epoch ms (negative cache)

export async function ensureShopCategoriesForSeo(countrySlug, apiBaseUrl) {
  if (!countrySlug || !apiBaseUrl) return;
  const key = countrySlug.toLowerCase();
  const hit = shopCategorySlugsByCountry.get(key);
  if (hit && hit.expiresAt > Date.now()) return;
  // Negative cache: after a failed fetch, don't re-attempt (and re-block the
  // request path for up to 5s) for a short window — an API outage must not
  // add latency to every shop render.
  if ((shopCategoryFailedUntil.get(key) ?? 0) > Date.now()) return;
  const existing = shopCategoryInFlight.get(key);
  if (existing) return existing;
  const p = (async () => {
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/catalog/metadata?countryCode=${encodeURIComponent(key.toUpperCase())}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!res.ok) {
        shopCategoryFailedUntil.set(key, Date.now() + SHOP_CATEGORY_FAILURE_TTL_MS);
        return;
      }
      const body = await res.json();
      const slugs = new Set(
        (body?.categories ?? [])
          .filter((c) => (c?.count ?? 0) > 0 && typeof c?.id === "string")
          .map((c) => c.id),
      );
      shopCategorySlugsByCountry.set(key, {
        slugs,
        expiresAt: Date.now() + SHOP_CATEGORY_CACHE_TTL_MS,
      });
      shopCategoryFailedUntil.delete(key);
    } catch {
      // Leave the data cache empty — the shop fragment falls back to emitting
      // no category list for this country until a later fetch succeeds — but
      // negatively cache the failure so we don't re-await per request.
      shopCategoryFailedUntil.set(key, Date.now() + SHOP_CATEGORY_FAILURE_TTL_MS);
    } finally {
      shopCategoryInFlight.delete(key);
    }
  })();
  shopCategoryInFlight.set(key, p);
  return p;
}

function getShopCategorySlugsSync(countrySlug) {
  if (!countrySlug) return null;
  const hit = shopCategorySlugsByCountry.get(countrySlug.toLowerCase());
  if (!hit || hit.expiresAt <= Date.now()) return null;
  return hit.slugs;
}

// Test hook: seed the per-country category cache without a network fetch.
export function __setShopCategorySlugsForTest(countrySlug, slugs) {
  shopCategorySlugsByCountry.set(countrySlug.toLowerCase(), {
    slugs: new Set(slugs),
    expiresAt: Date.now() + SHOP_CATEGORY_CACHE_TTL_MS,
  });
}

// Static featured occasion list for the city homepage body fragment.
// Mirrors DEFAULT_OCCASION_SLUGS in api-server/src/routes/homepage.ts and
// the homepage occasions carousel so the prerendered block matches the
// visible page content (no cloaking). Up to 6 entries. // i18n-ignore — static EN-only crawlers-only occasion list
const FEATURED_HOME_OCCASIONS = [
  { slug: "birthday", name: "Birthday Flowers & Gifts" },
  { slug: "anniversary", name: "Anniversary Gifts" },
  { slug: "valentines-day", name: "Valentine's Day Flowers" },
  { slug: "wedding", name: "Wedding Gifts" },
  { slug: "new-born", name: "New Baby Gifts" },
  { slug: "funeral", name: "Funeral & Sympathy Flowers" },
];

// Static descriptive copy for each generic route type (English only — the SEO
// meta description is already localised; the body copy supplements it for
// crawlers that benefit from additional prose rather than needing exact
// translations).
const ROUTE_BODY_INTRO = {
  landing: "Presentail delivers premium flowers, plants, chocolates, cakes and curated gift sets across Lebanon, UAE, and Cyprus. Same-day delivery available on orders placed before midday.",
  home: "Shop luxury flowers, bouquets, plants, and curated gift sets with same-day and scheduled delivery across Lebanon, UAE, and Cyprus.",
  shop: "Browse our full catalogue of premium fresh flowers, chocolates, hampers, candles, perfumes, and gift sets available for delivery.",
  brands: "Presentail works with the finest florists and luxury gift producers to bring you hand-picked arrangements and carefully curated gifts.",
  occasions: "Find the perfect gift for every occasion — birthdays, anniversaries, Valentine's Day, Mother's Day, sympathy, weddings, and more.",
  contact: "Our team is available via phone, WhatsApp, and email to help with orders, delivery, and any questions you may have.",
  faqs: "Everything you need to know about ordering, delivery windows, payment options, cancellations, and returns.",
  careers: "We're growing fast. Join Presentail across operations, customer experience, marketing, and technology.",
  blog: "Floral inspiration, seasonal gifting guides, occasion ideas, and stories from the Presentail editorial team.",
  blogPost: "Read the latest story from the Presentail editorial team. Explore more articles on flowers, gifts, and seasonal occasions.",
  partner: "Presentail partners with premium florists, chocolatiers, perfumeries, and luxury goods producers across Lebanon, UAE, and Cyprus.",
  weddings: "From bridal bouquets and table centrepieces to welcome gifts, Presentail handles every floral and gift detail of your wedding day.",
  corporate: "Tailored corporate gifting programmes — branded hampers, premium flowers, and bulk delivery for your team, clients, and events.",
  terms: "By using Presentail you agree to our terms. Please read this page for the full terms governing orders, payments, and delivery.",
  privacy: "Presentail collects only the personal data needed to process your order. Read how we collect, use, store, and protect your information.",
  "account-deletion": "Delete your Presentail account in the app or on the website, or request deletion by email. Learn which personal data is erased, which records must be retained, and when deletion is completed.",
};

// Distinct H1 text per page type — covers the same topic as <title> but
// uses different phrasing and drops the "| Presentail" suffix, giving
// crawlers two separate text signals from the same page (title keyword
// density ≠ heading keyword density). Uses the same {city} placeholder
// convention as TITLES; format() resolves it at render time.
// i18n-ignore — these are static EN-only sr-only headings for crawlers;
// the SPA renders its own translated h1 after hydration.
function buildNavLinks(localeBase) {
  if (!localeBase) return "";
  // Blog canonical is /{lang}/blog — never city-scoped — so derive the
  // lang-only base from the localeBase which may be city-prefixed (e.g.
  // "/en-lb/beirut" or "https://presentail.com/en-lb/beirut"). This avoids
  // emitting city-prefixed blog links that Semrush flags as redirect hops.
  // Works for both relative (/en-lb/beirut) and absolute (https://…/en-lb/beirut) bases.
  const originPrefix = localeBase.match(/^https?:\/\/[^/]*/)?.[0] ?? "";
  const langCode = localeBase.match(/\/([a-z]{2})(?:[^/a-z]|\/|$)/)?.[1] ?? null;
  const blogBase = langCode ? `${originPrefix}/${langCode}` : localeBase;
  // i18n-ignore — crawler-facing static nav; not rendered in the client UI
  return (
    `<nav aria-label="Presentail">` + // i18n-ignore
    `<ul>` +
    `<li><a href="${localeBase}/">Home</a></li>` +
    `<li><a href="${localeBase}/shop">Shop</a></li>` +
    `<li><a href="${localeBase}/brands">Brands</a></li>` + // i18n-ignore
    `<li><a href="${localeBase}/occasions">Occasions</a></li>` + // i18n-ignore
    `<li><a href="${localeBase}/contact">Contact</a></li>` + // i18n-ignore
    `<li><a href="${localeBase}/faqs">FAQs</a></li>` +
    `<li><a href="${blogBase}/blog">Journal</a></li>` + // i18n-ignore — canonical /{lang}/blog, not city-scoped
    `</ul>` +
    `</nav>`
  );
}

/**
 * Build the article-link list for the blog index page. Emits an <ul> of
 * locale-prefixed <a href> links to every published article so the posts are
 * part of the crawlable internal link graph (the SPA renders the visible UI;
 * this fragment exists for non-rendering crawlers).
 */
export function buildBlogIndexBodyHtml(lang, { localeBase }) {
  if (!localeBase) return "";
  // Crawler-facing category labels (static EN — this fragment is not rendered
  // in the client UI). Mirrors the Blog.tsx pill taxonomy.
  const CATEGORY_LABELS = { // i18n-ignore
    flowers: "Flowers", // i18n-ignore
    "gifting-guides": "Gifting Guides", // i18n-ignore
    "behind-the-scenes": "Behind the Scenes", // i18n-ignore
    makers: "Makers", // i18n-ignore
  };
  const entryHtml = ([slug, byLang]) => {
    const article = byLang?.[lang] ?? byLang?.en;
    const title = article?.title;
    if (!slug || !title) return "";
    const category =
      CATEGORY_LABELS[getBlogPostMeta(slug).category] ?? "";
    const minutes = getBlogPostReadingTime(slug, lang);
    return (
      `<li><a href="${localeBase}/blog/${escapeAttr(encodeURIComponent(slug))}">${escapeHtml(title)}</a>` +
      (category ? ` — ${escapeHtml(category)}` : "") +
      ` · ${minutes} min read</li>` // i18n-ignore — crawler-facing metadata
    );
  };
  const entries = Object.entries(BLOG_POSTS ?? {});
  const featuredSlug = getFeaturedBlogSlug();
  const featuredEntry = entries.find(([slug]) => slug === featuredSlug);
  const featuredItem = featuredEntry ? entryHtml(featuredEntry) : "";
  const items = entries
    .filter(([slug]) => slug !== featuredSlug || !featuredItem)
    .map(entryHtml)
    .filter(Boolean);
  if (items.length === 0 && !featuredItem) return "";
  // i18n-ignore — static EN headings in crawlers-only body fragment
  const featuredHtml = featuredItem
    ? `<h2>Featured story</h2><ul>${featuredItem}</ul>` // i18n-ignore
    : "";
  return `${featuredHtml}<h2>Recent stories</h2><ul>${items.join("")}</ul>`; // i18n-ignore
}

function buildGenericBodyHtml(routeKey, { h1, description, localeBase, faqItems = [], cityContent = "", nearbyCityHtml = "", cityLabel = "", countryLabel = "", lang = "en", cityKey = null, h1Override = undefined, introOverride = undefined, whyPoints = undefined, campaignLanding = null }) {
  const intro = introOverride ?? ROUTE_BODY_INTRO[routeKey] ?? "";
  const h1Text = h1Override ?? h1;
  const safeH1 = escapeHtml(h1Text);
  const safeDesc = escapeHtml(description);
  const safeIntro = escapeHtml(intro);
  // City-specific paragraph for city home pages — provides unique vocabulary
  // tokens per city so the Jaccard similarity gate in check-city-similarity passes.
  const safeCityContent = cityContent ? escapeHtml(cityContent) : "";
  // Add FAQ questions as h2+h3 headings so pages with multiple sections have
  // the required subheading structure for AI crawlers and the Agent Ready scan.
  let faqHtml = "";
  if (faqItems.length > 0) {
    const faqH2 =
      lang === "ar" ? "الأسئلة الشائعة" :
      lang === "fr" ? "Questions fréquentes" :
      "Frequently Asked Questions";
    faqHtml =
      `<h2>${escapeHtml(faqH2)}</h2>` +
      faqItems.map(({ q, a }) => `<h3>${escapeHtml(q)}</h3><p>${escapeHtml(a)}</p>`).join("");
  }
  // Nearby-city links go in a <noscript> block so they are visible to
  // non-JS crawlers and AI bots but never rendered to end-users (React
  // replaces #root children on hydration, removing the noscript element).
  const nearbyCityNoscript = nearbyCityHtml
    ? `<noscript>${nearbyCityHtml}</noscript>`
    : "";

  // "Why Presentail" bullet points for overridden city homes (e.g. Tripoli) —
  // rendered as visible list content between the coverage copy and the FAQ.
  const whyHtml = Array.isArray(whyPoints) && whyPoints.length > 0
    ? `<h2>Why Presentail</h2><ul>${whyPoints.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>` // i18n-ignore — crawler-facing static heading
    : "";

  // The React campaign renders one primary flowers CTA, a support link, then
  // Flowers and Luxury Arrangements in that order. Mirror that information
  // architecture in the initial HTML for crawlers and no-JS/direct requests.
  // React replaces #root on hydration, so shoppers never see duplicate CTAs.
  let campaignExtras = "";
  if (campaignLanding && localeBase && cityLabel) {
    const supportMessage =
      `Hi! I need help choosing flowers for delivery in ${cityLabel}.`;
    const supportUrl =
      `https://wa.me/9613136532?text=${encodeURIComponent(supportMessage)}`;
    campaignExtras =
      `<section data-server-campaign-landing="${escapeAttr(cityKey ?? "")}">` +
      `<a data-server-campaign-cta href="${localeBase}/category/flowers">Shop flowers</a>` + // i18n-ignore — English-only crawler fallback
      `<a data-server-campaign-support href="${escapeAttr(supportUrl)}">Need help choosing? Chat with a support agent</a>` + // i18n-ignore — English-only crawler fallback
      `<h2>Flowers</h2>` + // i18n-ignore — English-only crawler fallback
      `<p>Explore fresh arrangements and confirm delivery dates and times at checkout.</p>` + // i18n-ignore — English-only crawler fallback
      `<a href="${localeBase}/category/flowers">View all flowers</a>` + // i18n-ignore — English-only crawler fallback
      `<h2>Luxury Arrangements</h2>` + // i18n-ignore — English-only crawler fallback
      `<p>Statement designs for unforgettable moments</p>` + // i18n-ignore — English-only crawler fallback
      `<a href="${localeBase}/category/lux-arrangements">View all luxury arrangements</a>` + // i18n-ignore — English-only crawler fallback
      `</section>`;
  }

  // Home route: add a city intro paragraph and featured occasion links so
  // AI crawlers see the city-specific delivery context and key landing targets.
  let homeExtras = "";
  if (routeKey === "home" && cityLabel && localeBase) {
    const safeCityLabel = escapeHtml(cityLabel);
    const safeCountryLabel = escapeHtml(countryLabel || cityLabel);
    // Batroun occasion pages are all noindexed (Batroun has too few products to
    // pass the isPageEligible threshold: ≥4 products, ≥15% unique vs parent).
    // Omit the generic "Shop by Occasion" occasion list for lb-batroun so the
    // landing page does not link to noindexed child pages. Re-enable once
    // Batroun inventory grows enough for those pages to become indexable.
    const emitOccasionList = cityKey !== "lb-batroun";
    const deliveryPara =
      lang === "ar"
        ? `<p>توصّل Presentail الزهور والكعك والشوكولاتة والنباتات والهدايا إلى ${safeCityLabel}، ${safeCountryLabel}. التوصيل في نفس اليوم متاح عند الطلب قبل الظهر.</p>` // i18n-ignore
        : lang === "fr"
        ? `<p>Presentail livre fleurs, gâteaux, chocolats, plantes et cadeaux à ${safeCityLabel}, ${safeCountryLabel}. Livraison le jour même disponible pour les commandes passées avant midi.</p>` // i18n-ignore
        : `<p>Presentail delivers flowers, cakes, chocolates, plants and gifts across ${safeCityLabel}, ${safeCountryLabel}. Same-day delivery available when ordered before midday.</p>`; // i18n-ignore
    const occasionH2 =
      lang === "ar"
        ? `<h2>تسوّق حسب المناسبة في ${safeCityLabel}</h2>` // i18n-ignore
        : lang === "fr"
        ? `<h2>Acheter par occasion à ${safeCityLabel}</h2>` // i18n-ignore
        : `<h2>Shop by Occasion in ${safeCityLabel}</h2>`; // i18n-ignore
    homeExtras =
      deliveryPara +
      (emitOccasionList
        ? occasionH2 +
          `<ul>` +
          FEATURED_HOME_OCCASIONS.map(({ slug, name }) =>
            `<li><a href="${localeBase}/occasion/${escapeAttr(slug)}">${escapeHtml(name)}</a></li>`,
          ).join("") +
          `</ul>`
        : "");
    // Tripoli landing page: visible "Popular flower types" section with
    // crawlable links to real, indexable category/occasion URLs — strengthens
    // the internal link graph between the landing page and its child pages.
    // Every href below is a canonical, sitemapped URL (spot-checked to 200).
    if (cityKey === "lb-tripoli" && lang === "en") {
      // i18n-ignore-block — crawler-facing EN copy for the Tripoli landing page
      const popularFlowerTypes = [
        { href: "/category/hand-bouquets", name: "Roses & Mixed Hand Bouquets" },
        { href: "/category/flower-boxes", name: "Flower Boxes" },
        { href: "/occasion/birthday", name: "Birthday Flowers" },
        { href: "/occasion/anniversary", name: "Anniversary Flowers" },
        { href: "/occasion/funeral", name: "Sympathy Flowers" },
        { href: "/occasion/wedding", name: "Wedding Flowers" },
        { href: "/occasion/new-born", name: "New Baby Gifts" },
      ];
      homeExtras +=
        `<h2>Popular Flower Types in Tripoli</h2>` + // i18n-ignore — crawler-facing EN copy
        `<ul>` +
        popularFlowerTypes.map(({ href, name }) =>
          `<li><a href="${localeBase}${escapeAttr(href)}">${escapeHtml(name)}</a></li>`,
        ).join("") +
        `</ul>`;
    }
    // Batroun landing page: the "Popular flower types" block was removed after
    // an end-to-end check confirmed that all candidate category/occasion URLs
    // (/en-lb/batroun/category/*, /en-lb/batroun/occasion/*) return
    // noindex, follow — Batroun has too few products to pass the isPageEligible
    // threshold (≥4 products, ≥15% unique vs parent city). Linking to noindexed
    // pages from the landing page wastes crawl budget and PageRank, so the
    // block was not added. Re-enable once Batroun inventory grows enough for
    // those pages to become indexable.
  }

  // Shop route: add a featured category list so AI crawlers can follow
  // category landing pages directly from the shop page body fragment.
  let shopExtras = "";
  if (routeKey === "shop" && localeBase) {
    // Filter the featured list by per-country catalog availability so the
    // crawler-facing fragment never links a category with zero inventory in
    // this country (mirrors the hydrated Shop/Footer filtering). cityKey is
    // "{country}-{city}" (e.g. "cy-paphos"). When counts are unknown (cold
    // cache / metadata fetch failed) emit NO list — wrong links are worse
    // than none.
    const countrySlug = cityKey ? cityKey.split("-")[0] : null;
    const availableSlugs = getShopCategorySlugsSync(countrySlug);
    const visibleShopCategories = availableSlugs
      ? FEATURED_SHOP_CATEGORIES.filter(({ slug }) => availableSlugs.has(slug))
      : [];
    // i18n-ignore — static EN-only crawlers-only copy
    shopExtras = visibleShopCategories.length
      ? `<h2>Shop by Category</h2>` + // i18n-ignore
        `<ul>` +
        visibleShopCategories.map(({ slug, name }) =>
          `<li><a href="${localeBase}/category/${escapeAttr(slug)}">${escapeHtml(name)}</a></li>`,
        ).join("") +
        `</ul>`
      : "";
    // Tripoli /shop: contextual back-link to the flower-delivery landing page.
    // /shop is the full-catalogue experience; the landing page owns the
    // delivery-intent query, so pass authority back to it with a natural anchor.
    if (cityKey === "lb-tripoli" && lang === "en") {
      // i18n-ignore — crawler-facing EN copy for the Tripoli shop page
      shopExtras +=
        `<p>Looking for a curated selection? See our <a href="${localeBase}/">flower delivery in Tripoli</a> page for hand-picked bouquets and same-day options.</p>`; // i18n-ignore
    }
    // Batroun /shop: contextual back-link to the Batroun landing page.
    if (cityKey === "lb-batroun" && lang === "en") {
      // i18n-ignore — crawler-facing EN copy for the Batroun shop page
      shopExtras +=
        `<p>Looking for a curated selection? See our <a href="${localeBase}/">flower delivery in Batroun</a> page for hand-picked bouquets and same-day options.</p>`; // i18n-ignore
    }
  }

  // Blog index route: list every published article as a crawlable link so
  // the Journal hub passes link equity to the posts (and vice versa).
  const blogExtras =
    routeKey === "blog" ? buildBlogIndexBodyHtml(lang, { localeBase }) : "";

  // The H1 and body copy are emitted as VISIBLE HTML — no sr-only, no
  // display:none. Google treats hidden keyword content as potentially cloaked
  // and can deweight it; the copy here is legitimate on-page content, so it
  // must be readable in the initial document. React's createRoot() replaces
  // all children of #root on hydration, so JS users only see this content for
  // the brief pre-hydration window before the SPA renders its own UI.
  return (
    `<h1>${safeH1}</h1>` +
    `<div>` +
    (safeDesc ? `<p>${safeDesc}</p>` : "") +
    (safeIntro && safeIntro !== safeDesc ? `<p>${safeIntro}</p>` : "") +
    // Insertion slot for the server-rendered product grid (see
    // buildProductGridHtml / injectSeoTagsAsync). Kept as an HTML comment so
    // the sync/cached body builder stays product-free; the async injector
    // replaces it for SSR-product-enabled city homes and it is invisible
    // (a comment node) everywhere else.
    SSR_PRODUCTS_SLOT +
    (safeCityContent ? `<p>${safeCityContent}</p>` : "") +
    whyHtml +
    campaignExtras +
    homeExtras +
    shopExtras +
    blogExtras +
    faqHtml +
    buildNavLinks(localeBase) +
    `</div>` +
    nearbyCityNoscript
  );
}

function buildProductBodyHtml(product, { title, description, localeBase, imageUrl, cityLabel = "", lang, country, city }) {
  const rawName = typeof product.name === "string" ? product.name.trim() : "";
  const safeTitle = escapeHtml(rawName || title);
  const rawDesc = typeof product.description === "string"
    ? stripHtml(product.description.trim())
    : "";
  const safeDesc = escapeHtml(rawDesc || description);

  // Brand attribution — list the first brand name after the product title.
  const brandNames = Array.isArray(product.brandNames)
    ? product.brandNames.filter((b) => typeof b === "string" && b.trim())
    : [];
  // i18n-ignore — "By {brand}" attribution in crawlers-only body
  const brandHtml = brandNames.length > 0
    ? `<p>By ${escapeHtml(brandNames[0].trim())}</p>` // i18n-ignore
    : "";

  // Availability + price in a single <p> so crawlers see stock status with
  // the price rather than an ambiguous price-only line.
  const hasPrice =
    typeof product.priceValue === "number" &&
    Number.isFinite(product.priceValue) &&
    product.priceValue > 0;
  const inStock = product.inStock !== false; // default to in-stock when field is absent
  // i18n-ignore — availability and price labels in crawlers-only body
  const availabilityHtml = hasPrice
    ? `<p>From $${escapeHtml(product.priceValue.toFixed(2))} USD — ${inStock ? "In Stock" : "Out of Stock"}</p>` // i18n-ignore
    : (inStock ? "" : `<p>Out of Stock</p>`); // i18n-ignore

  // City delivery note — emitted only when a city is known so city-less
  // product pages don't show a dangling "Delivered to " sentence.
  // i18n-ignore — static EN-only crawlers-only delivery note
  const cityDeliveryHtml = cityLabel
    ? `<p>Delivered to ${escapeHtml(cityLabel)}</p>` // i18n-ignore
    : "";

  const imgHtml = imageUrl
    ? `<img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(safeTitle)}" loading="lazy" />`
    : "";
  const nav = localeBase
    ? `<nav><a href="${localeBase}/">Home</a> › <a href="${localeBase}/shop">Shop</a></nav>` // i18n-ignore — breadcrumb labels
    : "";
  // i18n-ignore — "Product Details" and "Delivery" are static EN-only headings in crawlers-only body
  const detailsHeading = safeDesc ? `<h2>Product Details</h2>` : ""; // i18n-ignore
  const deliveryNote =
    `<h2>Delivery</h2>` + // i18n-ignore
    `<p>Available for same-day and scheduled delivery with Presentail. Order before midday for same-day dispatch.</p>`; // i18n-ignore

  // Contextual noscript internal-links nav — crawlers follow these to discover
  // related collection and city pages without executing JavaScript.
  // Uses the same buildInternalLinks rule engine as the client-side RelatedLinks
  // component so server and client output stay in lockstep.  Rule 5 (related
  // products) is skipped because the full product catalog is not available here;
  // the four structural rules (category, occasion, brand, city) are sufficient
  // for crawler discovery.
  let noscriptNav = "";
  if (localeBase && lang && country) {
    const brandName =
      (Array.isArray(product.brands) && product.brands[0] &&
        typeof product.brands[0].name === "string" && product.brands[0].name) ||
      (typeof product.brand === "object" && product.brand !== null &&
        typeof product.brand.name === "string" && product.brand.name) ||
      "";
    const brandSlug =
      (Array.isArray(product.brands) && product.brands[0] &&
        typeof product.brands[0].slug === "string" && product.brands[0].slug) ||
      "";
    const productForLinks = {
      id: typeof product.id === "string" ? product.id : "current",
      name: rawName,
      category: Array.isArray(product.categories) && typeof product.categories[0] === "string"
        ? product.categories[0] : "",
      categories: Array.isArray(product.categories) ? product.categories : [],
      occasions: Array.isArray(product.occasions) ? product.occasions : [],
      brandNames: brandName ? [brandName] : [],
    };
    const brandContext = brandName && brandSlug ? [{ slug: brandSlug, name: brandName }] : [];
    const links = buildInternalLinks(
      productForLinks,
      { lang, country, city: city || null, baseUrl: localeBase },
      { brands: brandContext },
    );
    if (links.length > 0) {
      const listItems = links
        .map((link) => `<li><a href="${escapeAttr(link.href)}">${escapeHtml(link.anchorText)}</a></li>`)
        .join("");
      noscriptNav =
        `<noscript><nav aria-label="Related pages"><ul>${listItems}</ul></nav></noscript>`; // i18n-ignore — static label in crawlers-only noscript block
    }
  }

  return `<h1 class="sr-only">${safeTitle}</h1><div style="display:none">${imgHtml}${brandHtml}${availabilityHtml}${cityDeliveryHtml}${detailsHeading}${safeDesc ? `<p>${safeDesc}</p>` : ""}${deliveryNote}${nav}</div>${noscriptNav}`;
}

function buildSimpleEntityBodyHtml(entity, { title, description, localeBase }) {
  const rawName = typeof entity.name === "string" ? entity.name.trim() : "";
  const safeTitle = escapeHtml(rawName || title);
  const rawDesc = entity.description ? stripHtml(entity.description) : "";
  const safeDesc = escapeHtml(rawDesc || description);
  const nav = localeBase
    ? `<nav><a href="${localeBase}/">Home</a> › <a href="${localeBase}/shop">Shop</a></nav>` // i18n-ignore — breadcrumb labels
    : "";
  // The sr-only h1 lives OUTSIDE the display:none wrapper so Googlebot indexes
  // it without the cloaking risk that display:none carries.
  return `<h1 class="sr-only">${safeTitle}</h1><div style="display:none">${safeDesc ? `<p>${safeDesc}</p>` : ""}${nav}</div>`;
}

/**
 * Build the prerendered body fragment for a blog article page.
 * Includes the headline, publish date, and all article sections so
 * non-rendering crawlers (GPTBot, ClaudeBot, PerplexityBot, etc.) can
 * read the full article copy without executing JavaScript.
 */

/**
 * Safely render a section body string as HTML, emitting author-controlled
 * `<a href="...">text</a>` anchors and `<strong>` emphasis as real elements
 * while HTML-escaping everything else. Only site-relative hrefs and canonical
 * https://presentail.com URLs are allowed; all other URLs are escaped.
 *
 * This function is deliberately narrow: it supports only the small subset of
 * HTML that blog authors embed in body strings (internal links). All other
 * markup is escaped normally, so there is no XSS risk.
 *
 * @param {string} body - Raw body string with narrow editorial markup.
 * @param {string} lang - Current article language, used to localise links.
 * @returns {string} - HTML-safe string with validated anchors preserved.
 */
function safeBodyHtml(body, lang) {
  const TOKEN_RE = /(<a\s+href="([^"<>]*)"[^>]*>(.*?)<\/a>|<strong>(.*?)<\/strong>)/g;
  let result = "";
  let lastIndex = 0;
  let match;
  while ((match = TOKEN_RE.exec(body)) !== null) {
    // Escape the text before this approved editorial token.
    result += escapeHtml(body.slice(lastIndex, match.index));
    const href = match[2];
    const text = match[3];
    const strongText = match[4];

    if (strongText !== undefined) {
      result += `<strong>${safeBodyHtml(strongText, lang)}</strong>`;
      lastIndex = match.index + match[0].length;
      continue;
    }

    const isRelativePath = /^\/[^/]/.test(href);
    const canonicalMatch = /^https:\/\/presentail\.com(\/[^/].*)$/.exec(href);
    if (isRelativePath || canonicalMatch) {
      const path = canonicalMatch?.[1] ?? href;
      const localeMatch = /^\/(en|ar|fr|el)(-[a-z]{2})?(\/.*)/.exec(path);
      const localizedPath =
        localeMatch && lang && lang !== localeMatch[1]
          ? `/${lang}${localeMatch[2] ?? ""}${localeMatch[3]}`
          : path;
      const localizedHref = canonicalMatch
        ? `https://presentail.com${localizedPath}`
        : localizedPath;
      result += `<a href="${escapeAttr(localizedHref)}">${escapeHtml(text)}</a>`;
    } else {
      // Fall back: emit the full unapproved anchor source as escaped text.
      result += escapeHtml(match[0]);
    }
    lastIndex = match.index + match[0].length;
  }
  result += escapeHtml(body.slice(lastIndex));
  return result;
}

// Localised heading for the related-articles section appended to each blog
// post's prerendered body fragment so crawlers discover cross-post links.
const RELATED_ARTICLES_LABEL = {
  en: "Related Articles",
  ar: "مقالات ذات صلة",
  fr: "Articles similaires",
};

function buildBlogPostBodyHtml(article, { localeBase, lang, currentSlug }) {
  // Use the display heading (h1) when set; fall back to the SEO title.
  const safeTitle = escapeHtml(article.h1 ?? article.title ?? "");
  const sections = Array.isArray(article.sections) ? article.sections : [];
  let inner = "";
  if (article.dek) {
    inner += `<p>${escapeHtml(article.dek)}</p>`;
  }
  if (article.datePublished) {
    inner += `<time datetime="${escapeAttr(article.datePublished)}">${escapeHtml(article.datePublished)}</time>`;
  }
  for (const sec of sections) {
    if (sec.heading) {
      const tag = sec.subheading ? "h3" : "h2";
      inner += `<${tag}>${escapeHtml(sec.heading)}</${tag}>`;
    }
    if (sec.body) inner += `<p>${safeBodyHtml(sec.body, lang)}</p>`;
    if (Array.isArray(sec.items) && sec.items.length > 0) {
      const listTag = sec.ordered ? "ol" : "ul";
      inner += `<${listTag}>${sec.items.map((item) => `<li>${safeBodyHtml(item, lang)}</li>`).join("")}</${listTag}>`;
    }
    if (sec.pullQuote) inner += `<blockquote>${escapeHtml(sec.pullQuote)}</blockquote>`;
    if (sec.callout?.body) {
      inner += `<p>${sec.callout.title ? `<strong>${escapeHtml(sec.callout.title)}</strong> ` : ""}${escapeHtml(sec.callout.body)}</p>`;
    }
    if (Array.isArray(sec.faqItems) && sec.faqItems.length > 0) {
      inner += `<dl>${sec.faqItems.map((faq) => `<dt>${escapeHtml(faq.q)}</dt><dd>${escapeHtml(faq.a)}</dd>`).join("")}</dl>`;
    }
  }

  // Related articles — up to 3 other posts in the same language (falling back
  // to English when a translation is absent), sorted newest-first. Emitted in
  // the display:none fragment so crawlers can follow cross-post internal links
  // even before client-side React hydrates the visible related-articles section.
  if (localeBase && currentSlug) {
    const effectiveLang = lang && RELATED_ARTICLES_LABEL[lang] ? lang : "en";
    const relatedLabel = RELATED_ARTICLES_LABEL[effectiveLang];
    const relatedPosts = Object.entries(BLOG_POSTS)
      .filter(([s]) => s !== currentSlug)
      .map(([s, byLang]) => {
        const post = byLang?.[effectiveLang] ?? byLang?.en;
        return post?.title ? { slug: s, title: post.title, datePublished: post.datePublished ?? "" } : null;
      })
      .filter(Boolean)
      .sort((a, b) => (b.datePublished > a.datePublished ? 1 : -1))
      .slice(0, 3);
    if (relatedPosts.length > 0) {
      inner +=
        `<section><h2>${escapeHtml(relatedLabel)}</h2><ul>` +
        relatedPosts
          .map(
            (p) =>
              `<li><a href="${escapeAttr(`${localeBase}/blog/${encodeURIComponent(p.slug)}`)}">${escapeHtml(p.title)}</a></li>`,
          )
          .join("") +
        `</ul></section>`;
    }
  }

  const navLabels = {
    en: { home: "Home", journal: "Journal" },
    ar: { home: "الرئيسية", journal: "المجلة" },
    fr: { home: "Accueil", journal: "Journal" },
  };
  const labels = navLabels[lang] ?? navLabels.en;
  const nav = localeBase
    ? `<nav aria-label="Breadcrumb"><a href="${localeBase}/">${escapeHtml(labels.home)}</a> › <a href="${localeBase}/blog">${escapeHtml(labels.journal)}</a></nav>` // i18n-ignore — standard accessibility landmark label
    : "";
  // The shared data-seo-fallback wrapper is hidden synchronously for
  // JavaScript-enabled visitors and replaced by React on mount. No-JS clients
  // and crawlers receive the full, visible semantic article instead of hidden
  // or screen-reader-only copy.
  return `<article><h1>${safeTitle}</h1>${inner}${nav}</article>`;
}

/**
 * Build the prerendered body fragment for a shared wishlist page.
 * Lists the item count and product links so non-rendering crawlers can
 * read the wishlist content without executing JavaScript.
 *
 * @param {object} opts
 * @param {number}   opts.count    - Number of wishlist items.
 * @param {Array}    opts.items    - Array of { productSlug, countryCode? }.
 * @param {string}   opts.title    - Localised page title.
 * @param {string}   opts.origin   - Site origin, e.g. "https://presentail.com".
 * @param {string}   opts.basePath - Artifact base prefix.
 */
function buildWishlistBodyHtml({ count, items, title, origin, basePath }) {
  const cleanBase = (basePath ?? "").replace(/\/$/, "");
  const safeTitle = escapeHtml(title ?? "");
  let inner = "";
  if (count > 0) {
    inner += `<ul>`;
    for (const item of items ?? []) {
      if (!item?.productSlug) continue;
      const country = (item.countryCode ?? "LB").toLowerCase();
      const city = country === "lb" ? "beirut" : country === "ae" ? "dubai" : "nicosia";
      const href = `${origin}${cleanBase}/en-${country}/${city}/product/${encodeURIComponent(item.productSlug)}`;
      inner += `<li><a href="${escapeAttr(href)}">${escapeHtml(item.productSlug)}</a></li>`;
    }
    inner += `</ul>`;
  }
  // The sr-only h1 lives OUTSIDE the display:none wrapper so Googlebot indexes
  // it without the cloaking risk that display:none carries.
  return `<h1 class="sr-only">${safeTitle}</h1><div style="display:none">${inner}</div>`;
}

// ---------------------------------------------------------------------------
// Per-product / brand / category Open Graph / Twitter Card injection
//
// WhatsApp, iMessage, Slack, Facebook, X, etc. only honour static meta tags in
// the initial HTML response — they do not execute the JS bundle. The generic
// SEO injector above produces site-wide previews; for `/product/<slug>`,
// `/brand/<slug>`, and `/shop?n=<slug>` (category landing) paths we
// additionally fetch the matching record server-side and override
// og:title / og:description / og:image / og:url / twitter:* with real data so
// shared links render with the entity's name, blurb, and primary image. Any
// failure (404, network error, slow upstream) falls back silently to the
// generic locale-aware preview.
// ---------------------------------------------------------------------------

const ENTITY_FETCH_TIMEOUT_MS = 2500;
const ENTITY_CACHE_TTL_MS = 60_000;
const ENTITY_CACHE_MAX_ENTRIES = 500;
const LISTING_CACHE_TTL_MS = 15_000;
const LISTING_CACHE_MAX_ENTRIES = 300;

export const PAGINATION_PAGE_SIZE = 24;
const PAGINATION_SUFFIX_RE = /^(\/(?:category|occasion|brand)\/[^/]+)\/page\/(\d+)$/;

// Small in-process LRU+TTL cache for the per-entity SEO lookup. WhatsApp /
// iMessage / Slack crawlers retry aggressively on shared product, brand, and
// category links, so caching the upstream lookup for ~60s makes repeat shares
// essentially free and protects the head-snippet renderer against transient
// upstream slowdowns. Negative results (404 / timeout / network error) are
// intentionally NOT cached so a transient blip can't pin an entity to the
// generic fallback for the full TTL.
const entitySeoCache = new Map();
// A crawler burst commonly asks for the same cold entity several times before
// the first response has populated the TTL cache. Share that one upstream
// request instead of multiplying API/translation/image work. This map only
// contains active requests, so it is naturally bounded by server concurrency.
const entitySeoInFlight = new Map();
const listingSeoCache = new Map();
const listingSeoInFlight = new Map();

function entityCacheKey({ kind, slug, lang, countryCode, cityId }) {
  return `${kind}\u0000${slug}\u0000${lang ?? ""}\u0000${countryCode ?? ""}\u0000${cityId ?? ""}`;
}

function getCachedEntity(key) {
  const entry = entitySeoCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    entitySeoCache.delete(key);
    return null;
  }
  entitySeoCache.delete(key);
  entitySeoCache.set(key, entry);
  return entry.value;
}

// Returns the raw cache entry whether or not it has expired, so the caller
// can use stored ETag/Last-Modified headers to send a conditional request.
// Returns null only when the key is absent from the map entirely.
function getRawEntityCacheEntry(key) {
  return entitySeoCache.get(key) ?? null;
}

function setCachedEntity(key, value, etag = null, lastModified = null) {
  if (!value) return;
  if (entitySeoCache.size >= ENTITY_CACHE_MAX_ENTRIES) {
    const oldest = entitySeoCache.keys().next().value;
    if (oldest !== undefined) entitySeoCache.delete(oldest);
  }
  entitySeoCache.delete(key);
  entitySeoCache.set(key, {
    value,
    expiresAt: Date.now() + ENTITY_CACHE_TTL_MS,
    etag,
    lastModified,
  });
}

async function fetchEntityForSeoCached(kind, fetcher, opts, out = {}) {
  const key = entityCacheKey({
    kind,
    slug: opts.slug,
    lang: opts.lang,
    countryCode: opts.countryCode,
    cityId: opts.cityId,
  });

  const rawEntry = getRawEntityCacheEntry(key);
  const now = Date.now();
  const isFresh = rawEntry !== null && rawEntry.expiresAt > now;

  // When we have a cached entry that carries an ETag or Last-Modified header,
  // always send a conditional request — even within the cache TTL — so an
  // image swap at an unchanged CDN URL is detected on the very next crawler
  // hit rather than waiting up to 60 s for the entity TTL to expire. A 304
  // response is cheap (no body) and lets us serve the cached value unchanged;
  // a 200 tells us the entity changed so we evict dims and update the entry.
  //
  // When the upstream provided no validation headers (e.g. the API does not
  // yet emit ETag/Last-Modified), fall back to pure TTL-based caching so the
  // existing repeat-crawler protection remains in effect.
  const conditionalHeaders = {};
  if (rawEntry) {
    if (rawEntry.etag) conditionalHeaders["If-None-Match"] = rawEntry.etag;
    if (rawEntry.lastModified) conditionalHeaders["If-Modified-Since"] = rawEntry.lastModified;
  }
  const hasConditional = Object.keys(conditionalHeaders).length > 0;

  // No validation headers and still within TTL → serve cached value immediately.
  if (isFresh && !hasConditional) {
    entitySeoCache.delete(key);
    entitySeoCache.set(key, rawEntry);
    out.freshlyFetched = false;
    return rawEntry.value;
  }

  // Either the entry is stale OR we have validation headers: hit upstream.
  const fetchOpts = hasConditional ? { ...opts, conditionalHeaders } : opts;
  let fetchPromise = entitySeoInFlight.get(key);
  if (!fetchPromise) {
    fetchPromise = Promise.resolve().then(() => fetcher(fetchOpts));
    entitySeoInFlight.set(key, fetchPromise);
    fetchPromise.finally(() => {
      if (entitySeoInFlight.get(key) === fetchPromise) entitySeoInFlight.delete(key);
    }).catch(() => {});
  }
  const fetchStartedAt = performance.now();
  const result = await fetchPromise;
  opts.telemetry?.add?.("entity", performance.now() - fetchStartedAt);

  // 304 Not Modified: entity is unchanged. Restore the entry with a fresh TTL.
  // Image dims are NOT evicted — the entity's image URL(s) have not changed
  // so the cached dimensions remain accurate.
  if (result && result.notModified) {
    if (rawEntry) {
      const refreshed = { ...rawEntry, expiresAt: now + ENTITY_CACHE_TTL_MS };
      entitySeoCache.delete(key);
      if (entitySeoCache.size >= ENTITY_CACHE_MAX_ENTRIES) {
        const oldest = entitySeoCache.keys().next().value;
        if (oldest !== undefined) entitySeoCache.delete(oldest);
      }
      entitySeoCache.set(key, refreshed);
      out.freshlyFetched = false;
      return rawEntry.value;
    }
    out.freshlyFetched = false;
    return null;
  }

  // Definitive 404 from upstream: the entity does not exist. Signal to the
  // caller via out.definitelyNotFound so it can distinguish a genuine absence
  // from a transient error (503, timeout, network failure). Do NOT serve the
  // stale cached entry — a 404 is authoritative and should be honoured even
  // when a prior cache entry exists (the product was deleted).
  if (result && result.notFound) {
    out.definitelyNotFound = true;
    out.freshlyFetched = false;
    return null;
  }

  // 200 (new or changed entity): evict image-dims cache entries so the fresh
  // entity always gets freshly measured dimensions. This prevents stale dims
  // surviving up to 1 hour when the CDN replaces an image at an unchanged URL.
  if (result && result.value) {
    for (const url of extractEntityImageUrls(result.value)) evictImageDims(url);
    // Do NOT cache an English fallback under an ar/fr cache key: when the
    // upstream translation failed (contentLang === "en" despite lang=ar/fr),
    // caching would pin English content on the localized page for the full
    // entity TTL. Skipping the cache means the next hit retries translation.
    const isTranslationFallback =
      (opts.lang === "ar" || opts.lang === "fr") &&
      result.value.__contentLang === "en";
    if (!isTranslationFallback) {
      setCachedEntity(key, result.value, result.etag, result.lastModified);
    }
    out.freshlyFetched = true;
    return result.value;
  }

  // Fetch failed (network error, 4xx, timeout). If we were revalidating a
  // fresh cached entry (conditional request within TTL), serve the cached
  // value rather than degrading to the generic fallback — the entity content
  // has not been confirmed changed, so staleness is preferable to a broken
  // preview.
  if (isFresh && rawEntry) {
    out.freshlyFetched = false;
    return rawEntry.value;
  }

  out.freshlyFetched = false;
  return null;
}

// ---------------------------------------------------------------------------
// Image dimension cache + fetcher
//
// Crawlers that receive og:image without og:image:width / og:image:height may
// downgrade the preview card to a thumbnail rather than a banner. We resolve
// the actual pixel dimensions of entity images by fetching the first 4 KiB
// (Range: bytes=0-4095) and parsing the format header — enough for PNG (24 B),
// JPEG (scan SOF markers, typically within 2 KB), and WebP VP8X/VP8L.
//
// Results are cached for 1 hour so repeated crawler retries are free.
// Null (parsed but couldn't determine dims) IS cached; network errors are NOT
// (transient failures should be retried on the next crawler hit).
// ---------------------------------------------------------------------------

const IMAGE_DIMS_CACHE_TTL_MS = 3_600_000; // 1 hour
const IMAGE_DIMS_CACHE_MAX_ENTRIES = 1_000;
const IMAGE_DIM_FETCH_TIMEOUT_MS = 2_000;
const imageDimsCache = new Map();

// ---------------------------------------------------------------------------
// L2 durable store for image dims (injected by the production server at boot).
//
// Adapter interface: { get(url), set(url, dims), del(url) }
//   get  → Promise<{width,height}|null|undefined>
//           undefined = not in L2 (cache miss)
//           null      = URL was probed but no parseable dims were found
//           {width,height} = valid dimensions
//   set  → Promise<void>  (dims is {width,height} or null)
//   del  → Promise<void>
// ---------------------------------------------------------------------------
let imageDimsL2 = null;

/**
 * Inject a durable L2 backend for image dimensions (e.g. a PostgreSQL adapter).
 * Must be called once at server startup before any requests are served. The
 * in-process Map remains the L1; the adapter is consulted on an L1 miss and
 * written to whenever a new network fetch produces a result.
 * Pass null to disable L2 (the default; used in dev and tests).
 */
export function initImageDimsDb(adapter) {
  imageDimsL2 = adapter;
}

function _setCachedImageDimsL1(url, value) {
  if (imageDimsCache.size >= IMAGE_DIMS_CACHE_MAX_ENTRIES) {
    const oldest = imageDimsCache.keys().next().value;
    if (oldest !== undefined) imageDimsCache.delete(oldest);
  }
  imageDimsCache.set(url, {
    value,
    expiresAt: Date.now() + IMAGE_DIMS_CACHE_TTL_MS,
  });
}

async function getCachedImageDims(url) {
  const entry = imageDimsCache.get(url);
  if (entry !== undefined) {
    if (entry.expiresAt > Date.now()) {
      // L1 hit — move to tail for LRU behaviour and return.
      imageDimsCache.delete(url);
      imageDimsCache.set(url, entry);
      return entry.value;
    }
    // L1 expired — evict and fall through to L2.
    imageDimsCache.delete(url);
  }
  // L1 miss: consult L2 (if configured).
  if (imageDimsL2) {
    try {
      const l2val = await imageDimsL2.get(url);
      if (l2val !== undefined) {
        // L2 hit — warm L1 and return.
        _setCachedImageDimsL1(url, l2val);
        return l2val;
      }
    } catch {
      // L2 errors are non-fatal; fall through to a fresh network fetch.
    }
  }
  return undefined;
}

function setCachedImageDims(url, value) {
  _setCachedImageDimsL1(url, value);
  // Fire-and-forget L2 write — errors are intentionally swallowed so a DB
  // hiccup never blocks the SEO response.
  if (imageDimsL2) {
    imageDimsL2.set(url, value).catch(() => {});
  }
}

// Evict the L1 image-dims cache entry for a given URL. Called when an entity
// is freshly fetched (entity cache miss) so the image dimensions are
// re-measured on the very next request rather than waiting up to 1 hour for
// the L1 TTL to expire. This handles cases where the CDN serves a new image
// at an unchanged URL (e.g. a product photo update).
//
// NOTE: Only the L1 in-process Map is evicted here. The L2 durable store
// keeps its own TTL (default 24 h) and is intentionally NOT evicted on
// routine entity cache misses — its purpose is to survive server restarts.
// Evicting L2 here would mean that every post-restart entity fetch deletes
// the persisted dims entry before measuring, defeating the whole point of L2.
function evictImageDims(url) {
  if (url && typeof url === "string") {
    imageDimsCache.delete(url);
    // L2 is NOT evicted here — see note above.
  }
}

// Extract all image URLs an entity may carry. Handles both the product shape
// (entity.image.uri / entity.images[].uri) and the simpler brand/category/
// occasion shape (entity.image as a plain string).
function extractEntityImageUrls(entity) {
  if (!entity || typeof entity !== "object") return [];
  const urls = new Set();
  // Product: { image: { uri: "..." }, images: [{ uri: "..." }, ...] }
  if (entity.image && typeof entity.image.uri === "string" && entity.image.uri) {
    urls.add(entity.image.uri);
  }
  if (Array.isArray(entity.images)) {
    for (const img of entity.images) {
      if (img && typeof img.uri === "string" && img.uri) urls.add(img.uri);
    }
  }
  // Brand / category / occasion: { image: "https://..." }
  if (typeof entity.image === "string" && entity.image) {
    urls.add(entity.image);
  }
  return [...urls];
}

function parsePngDims(b) {
  if (b.length < 24) return null;
  const w = ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0;
  const h = ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0;
  return w > 0 && h > 0 ? { width: w, height: h } : null;
}

function parseJpegDims(b) {
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xFF) break;
    const marker = b[i + 1];
    if (marker === 0xFF) { i++; continue; }
    const segLen = (b[i + 2] << 8) | b[i + 3];
    if (
      (marker >= 0xC0 && marker <= 0xC3) ||
      (marker >= 0xC5 && marker <= 0xC7) ||
      (marker >= 0xC9 && marker <= 0xCB) ||
      (marker >= 0xCD && marker <= 0xCF)
    ) {
      if (i + 8 < b.length) {
        const h = ((b[i + 5] << 8) | b[i + 6]) >>> 0;
        const w = ((b[i + 7] << 8) | b[i + 8]) >>> 0;
        return w > 0 && h > 0 ? { width: w, height: h } : null;
      }
    }
    if (segLen < 2) break;
    i += 2 + segLen;
  }
  return null;
}

function parseWebpDims(b) {
  if (b.length < 16) return null;
  const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
  if (chunk === "VP8X" && b.length >= 30) {
    const w = ((b[24] | (b[25] << 8) | (b[26] << 16)) >>> 0) + 1;
    const h = ((b[27] | (b[28] << 8) | (b[29] << 16)) >>> 0) + 1;
    return w > 0 && h > 0 ? { width: w, height: h } : null;
  }
  if (chunk === "VP8L" && b.length >= 25 && b[20] === 0x2F) {
    const bits =
      b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    const w = (bits & 0x3FFF) + 1;
    const h = ((bits >>> 14) & 0x3FFF) + 1;
    return w > 0 && h > 0 ? { width: w, height: h } : null;
  }
  return null;
}

export function parseDimsFromBuffer(buf) {
  const b = new Uint8Array(buf);
  if (b.length < 4) return null;
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) {
    return parsePngDims(b);
  }
  // JPEG
  if (b[0] === 0xFF && b[1] === 0xD8) {
    return parseJpegDims(b);
  }
  // WebP (RIFF....WEBP)
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return parseWebpDims(b);
  }
  return null;
}

async function fetchImageDimensions(url) {
  if (!url) return null;
  const cached = await getCachedImageDims(url);
  if (cached !== undefined) return cached;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), IMAGE_DIM_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-4095" },
      signal: ac.signal,
    });
    if (!res.ok && res.status !== 206) {
      setCachedImageDims(url, null);
      return null;
    }
    const buf = await res.arrayBuffer();
    const dims = parseDimsFromBuffer(buf);
    setCachedImageDims(url, dims);
    return dims;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractSlugFor(prefix, rest) {
  if (!rest || !rest.startsWith(prefix)) return null;
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/([^/?#]+)`);
  const m = rest.match(re);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

function extractProductSlug(rest) {
  return extractSlugFor("/product", rest);
}

function extractBrandSlug(rest) {
  return extractSlugFor("/brand", rest);
}

function extractBlogPostSlug(rest) {
  return extractSlugFor("/blog", rest);
}

function extractCategorySlugFromSearch(search) {
  if (!search) return null;
  const s = search.startsWith("?") ? search.slice(1) : search;
  if (!s) return null;
  const params = new URLSearchParams(s);
  // The live storefront uses `?category=<slug>` (see Shop.tsx and the
  // homepage CategoriesGrid / MainNavbar links). `?n=<slug>` is kept as a
  // backward-compatible alias in case older shared links surface.
  const raw = params.get("category") ?? params.get("n");
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

function extractBrandsFilterFromSearch(search) {
  if (!search) return null;
  const s = search.startsWith("?") ? search.slice(1) : search;
  if (!s) return null;
  const params = new URLSearchParams(s);
  // The Brands page can additionally be filtered (or eventually be filtered)
  // by category or occasion via `?category=<slug>` / `?occasion=<slug>`. We
  // accept the same `?n=<slug>` alias the shop page does for parity.
  const rawCategory = (params.get("category") ?? params.get("n") ?? "").trim();
  if (rawCategory) return { kind: "category", slug: rawCategory };
  const rawOccasion = (params.get("occasion") ?? "").trim();
  if (rawOccasion) return { kind: "occasion", slug: rawOccasion };
  return null;
}

function extractOccasionSlugFromSearch(search) {
  if (!search) return null;
  const s = search.startsWith("?") ? search.slice(1) : search;
  if (!s) return null;
  const params = new URLSearchParams(s);
  const raw = params.get("occasion");
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

// Matches /favorites/share/<token>
const SHARE_TOKEN_RE = /^\/favorites\/share\/([A-Za-z0-9_-]{8,})(?:\/)?$/;

function extractShareToken(pathname) {
  const m = pathname.match(SHARE_TOKEN_RE);
  return m ? m[1] : null;
}

async function fetchSharedFavoritesForSeo({ token, apiBaseUrl }) {
  if (!token) return null;
  const url = `${apiBaseUrl.replace(/\/$/, "")}/api/favorites/share/${encodeURIComponent(token)}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ENTITY_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) return null;
    const body = await res.json();
    if (!body || body.ok !== true || !Array.isArray(body.favorites)) return null;
    return body.favorites;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function buildWishlistHead({
  count,
  imageUrl,
  imageWidth,
  imageHeight,
  basePath,
  origin,
  pathname,
  lang,
}) {
  const seo = WISHLIST_SEO[lang ?? "en"] ?? WISHLIST_SEO.en;
  const title =
    count === 1 ? seo.titleOne : format(seo.titleMany, { count });
  const description =
    count === 1
      ? seo.descriptionOne
      : format(seo.descriptionMany, { count });
  return buildEntityHead({
    ogType: "website",
    title,
    description,
    imageUrl: imageUrl ?? null,
    imageAlt: seo.imageAlt,
    imageWidth,
    imageHeight,
    basePath,
    origin,
    pathname,
    search: "",
    lang: lang ?? "en",
  });
}

/**
 * Fire-and-forget: emit a `seo_entity_fetch_failed` analytics event so ops
 * can query the `analytics_events` table and detect systematic SEO-preview
 * outages (broken API route, upstream down) before social previews silently
 * degrade across all product and brand pages without anyone noticing.
 *
 * `entityKind` is a fixed server-side value (e.g. "product", "brand",
 * "category", "occasion") stored in the `error_code` column for filtering.
 */
function reportSeoFetchFailure(apiBaseUrl, entityKind) {
  if (!apiBaseUrl) return;
  const base = apiBaseUrl.replace(/\/$/, "");
  try {
    void fetch(`${base}/api/analytics/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "seo_entity_fetch_failed",
        platform: "web",
        errorCode: String(entityKind).slice(0, 64),
      }),
    }).catch(() => {});
  } catch {
    // Best-effort — never let failure reporting block or throw.
  }
}

// Returns one of:
//   { value, etag, lastModified }  — successful 200 fetch
//   { notModified: true }          — 304 Not Modified (only when conditionalHeaders were sent)
//   null                           — error / entity not found
async function fetchEntityForSeo({
  endpoint,
  responseKey,
  slug,
  lang,
  countryCode,
  cityId,
  apiBaseUrl,
  conditionalHeaders,
}) {
  if (!slug) return null;
  const params = new URLSearchParams({ slug });
  if (lang) params.set("lang", lang);
  if (countryCode) params.set("countryCode", countryCode);
  if (cityId) params.set("cityId", cityId);
  const url = `${apiBaseUrl.replace(/\/$/, "")}${endpoint}?${params.toString()}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ENTITY_FETCH_TIMEOUT_MS);
  try {
    const reqOptions = { signal: ac.signal };
    if (conditionalHeaders && Object.keys(conditionalHeaders).length > 0) {
      reqOptions.headers = { ...conditionalHeaders };
    }
    const res = await fetch(url, reqOptions);
    // 304: upstream confirms entity is unchanged — no body to parse.
    if (res.status === 304) return { notModified: true };
    if (!res.ok) {
      reportSeoFetchFailure(apiBaseUrl, responseKey);
      // Return a distinct sentinel for genuine HTTP 404 (product definitively
      // absent) so callers can distinguish it from a transient error (503,
      // network failure, timeout) that does NOT confirm the product is gone.
      if (res.status === 404) return { notFound: true };
      return null;
    }
    const body = await res.json();
    if (!body || body.ok !== true) {
      reportSeoFetchFailure(apiBaseUrl, responseKey);
      return null;
    }
    const value = body[responseKey] ?? null;
    // A successful (ok: true) response with no entity data is a definitive
    // absence — not a transient error.  Return the same sentinel as HTTP 404
    // so callers can issue proper 404/410 responses rather than a misleading
    // 200 with an indexable page for a slug that simply does not exist.
    if (!value) return { notFound: true };
    // The product API reports which language the payload is ACTUALLY in
    // (contentLang === "en" when an ar/fr translation failed and English was
    // served). Carry it on the entity so callers can (a) avoid emitting an
    // hreflang that falsely claims translated content and (b) avoid caching
    // the English fallback under the ar/fr cache key.
    if (typeof body.contentLang === "string" && value && typeof value === "object") {
      value.__contentLang = body.contentLang;
    }
    // Capture validation headers so subsequent requests can use them for
    // conditional fetches, avoiding a full round-trip when nothing changed.
    const etag = res.headers?.get?.("etag") ?? null;
    const lastModified = res.headers?.get?.("last-modified") ?? null;
    return { value, etag, lastModified };
  } catch {
    reportSeoFetchFailure(apiBaseUrl, responseKey);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function fetchProductForSeo(opts) {
  return fetchEntityForSeo({
    endpoint: "/api/woo/product",
    responseKey: "product",
    ...opts,
  });
}

function fetchBrandForSeo(opts) {
  return fetchEntityForSeo({
    endpoint: "/api/woo/brand",
    responseKey: "brand",
    ...opts,
  });
}

/**
 * Fetch the deliverable product count for a brand page. Used to gate FAQ
 * structured data — the UI only shows the FAQ section when hasProducts is true,
 * so the server must apply the same check. Best-effort: returns null on any
 * failure so the page still renders without a count (FAQ will be suppressed
 * rather than risk emitting it for an empty page).
 */
async function fetchBrandProductCountForSeoUncached({ slug, countryCode, cityId, lang, apiBaseUrl }) {
  if (!slug || !apiBaseUrl) return null;
  const params = new URLSearchParams({ slug });
  if (countryCode) params.set("countryCode", countryCode);
  if (cityId) params.set("cityId", cityId);
  if (lang && lang !== "en") params.set("lang", lang);
  const url = `${apiBaseUrl.replace(/\/$/, "")}/api/woo/brand-products?${params.toString()}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ENTITY_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const body = await res.json();
    if (!body || body.ok !== true) return null;
    const count = typeof body.count === "number" ? body.count : null;
    const products = Array.isArray(body.products)
      ? body.products.slice(0, 10)
      : [];
    return count !== null ? { count, products } : null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

async function fetchBrandProductCountForSeo(args) {
  const { slug, countryCode, cityId, lang } = args;
  const key = [
    "brand",
    args.apiBaseUrl ?? "",
    slug,
    lang ?? "",
    countryCode ?? "",
    cityId ?? "",
    1,
  ].join("\u0000");
  const hit = listingSeoCache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    listingSeoCache.delete(key);
    listingSeoCache.set(key, hit);
    return hit.value;
  }
  if (hit) listingSeoCache.delete(key);

  let fetchPromise = listingSeoInFlight.get(key);
  if (!fetchPromise) {
    fetchPromise = fetchBrandProductCountForSeoUncached(args);
    listingSeoInFlight.set(key, fetchPromise);
    fetchPromise.finally(() => {
      if (listingSeoInFlight.get(key) === fetchPromise) listingSeoInFlight.delete(key);
    }).catch(() => {});
  }
  const fetchStartedAt = performance.now();
  const value = await fetchPromise;
  args.telemetry?.add?.("listing", performance.now() - fetchStartedAt);
  if (value) {
    if (listingSeoCache.size >= LISTING_CACHE_MAX_ENTRIES) {
      const oldest = listingSeoCache.keys().next().value;
      if (oldest !== undefined) listingSeoCache.delete(oldest);
    }
    listingSeoCache.delete(key);
    listingSeoCache.set(key, {
      value,
      expiresAt: Date.now() + LISTING_CACHE_TTL_MS,
    });
  }
  return value;
}

function fetchCategoryForSeo(opts) {
  return fetchEntityForSeo({
    endpoint: "/api/woo/category",
    responseKey: "category",
    ...opts,
  });
}

function fetchOccasionForSeo(opts) {
  return fetchEntityForSeo({
    endpoint: "/api/woo/occasion",
    responseKey: "occasion",
    ...opts,
  });
}

/**
 * Fetch the deliverable product count and first (≤10) product names for a
 * category or occasion listing page. Used to (a) emit an ItemList JSON-LD and
 * (b) mark genuinely empty listing pages as `noindex, follow`. Best-effort:
 * returns null on any failure so the page still renders without a count.
 */
async function fetchListingProductsForSeoUncached({ kind, slug, lang, countryCode, cityId, apiBaseUrl, page }) {
  if (!slug || !apiBaseUrl) return null;
  const endpoint =
    kind === "occasion" ? "/api/woo/occasion-products" : "/api/woo/category-products";
  const params = new URLSearchParams({ slug });
  if (lang) params.set("lang", lang);
  if (countryCode) params.set("countryCode", countryCode);
  if (cityId) params.set("cityId", cityId);
  if (page && page > 1) params.set("page", String(page));
  const url = `${apiBaseUrl.replace(/\/$/, "")}${endpoint}?${params.toString()}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ENTITY_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) return null;
    const body = await res.json();
    if (!body || body.ok !== true) return null;
    // Normalise a transformProduct-shaped record into the minimal
    // `{ name, slug, image }` an ItemList ListItem needs. `id` is the product
    // slug (see transformProduct) and `image` is `{ uri }`.
    const toItem = (p) => {
      const name = p && typeof p.name === "string" ? p.name.trim() : "";
      if (!name) return null;
      const slug = typeof p.id === "string" && p.id ? p.id : "";
      const image =
        (p.image && typeof p.image.uri === "string" && p.image.uri) || "";
      return { name, slug, image };
    };
    if (kind === "occasion") {
      // When the API returns a flat pageItems array (page-aware slice), prefer
      // it over collecting from groups so the correct page offset is respected.
      if (Array.isArray(body.pageItems)) {
        const count =
          typeof body.total === "number"
            ? body.total
            : (Array.isArray(body.groups) ? body.groups : []).reduce(
                (s, g) => s + (g.count ?? 0),
                0,
              );
        const items = body.pageItems.map(toItem).filter(Boolean).slice(0, PAGINATION_PAGE_SIZE);
        return { count, items };
      }
      const groups = Array.isArray(body.groups) ? body.groups : [];
      const items = [];
      for (const g of groups) {
        for (const p of g.products ?? []) {
          const it = toItem(p);
          if (it) {
            items.push(it);
            if (items.length >= PAGINATION_PAGE_SIZE) break;
          }
        }
        if (items.length >= PAGINATION_PAGE_SIZE) break;
      }
      const count =
        typeof body.total === "number"
          ? body.total
          : groups.reduce((s, g) => s + (g.count ?? 0), 0);
      return { count, items };
    }
    const products = Array.isArray(body.products) ? body.products : [];
    const items = products.map(toItem).filter(Boolean).slice(0, PAGINATION_PAGE_SIZE);
    const count = typeof body.count === "number" ? body.count : products.length;
    return { count, items };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Short-lived listing cache for crawler-facing ItemList/noscript data.
 *
 * Listing responses are derived from the in-process catalog cache and can be
 * invalidated by the normal TTL when the catalog refreshes. Keep this shorter
 * than entity metadata so authoritative removals are not hidden for long, and
 * never cache failures.
 */
async function fetchListingProductsForSeo(args) {
  const { kind, slug, lang, countryCode, cityId, apiBaseUrl, page } = args;
  const key = [
    apiBaseUrl ?? "",
    kind,
    slug,
    lang ?? "",
    countryCode ?? "",
    cityId ?? "",
    page ?? 1,
  ].join("\u0000");
  const hit = listingSeoCache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    listingSeoCache.delete(key);
    listingSeoCache.set(key, hit);
    return hit.value;
  }
  if (hit) listingSeoCache.delete(key);

  let fetchPromise = listingSeoInFlight.get(key);
  if (!fetchPromise) {
    fetchPromise = fetchListingProductsForSeoUncached(args);
    listingSeoInFlight.set(key, fetchPromise);
    fetchPromise.finally(() => {
      if (listingSeoInFlight.get(key) === fetchPromise) listingSeoInFlight.delete(key);
    }).catch(() => {});
  }
  const fetchStartedAt = performance.now();
  const value = await fetchPromise;
  args.telemetry?.add?.("listing", performance.now() - fetchStartedAt);
  if (value) {
    if (listingSeoCache.size >= LISTING_CACHE_MAX_ENTRIES) {
      const oldest = listingSeoCache.keys().next().value;
      if (oldest !== undefined) listingSeoCache.delete(oldest);
    }
    listingSeoCache.delete(key);
    listingSeoCache.set(key, {
      value,
      expiresAt: Date.now() + LISTING_CACHE_TTL_MS,
    });
  }
  return value;
}

// ---------------------------------------------------------------------------
// Server-rendered product cards for selected city home pages
// ---------------------------------------------------------------------------

// City homes whose initial HTML embeds a server-rendered product grid.
// Keyed by "{country}-{city}". Deliberately scoped (Tripoli-only for now) —
// each addition puts a live product-API fetch on that city's HTML hot path,
// so cities are enabled one at a time after verifying response-time impact.
export const SSR_PRODUCT_CITY_KEYS = new Set(["lb-tripoli", "lb-batroun"]);

// Marker comment emitted by buildGenericBodyHtml where the product grid is
// spliced in (after the hero/intro copy, before delivery-coverage copy,
// city history, "Why Presentail" and FAQ blocks).
export const SSR_PRODUCTS_SLOT = "<!--ssr-products-slot-->";

// Localised heading for the server-rendered product grid.
const SSR_PRODUCTS_HEADING = { // i18n-ignore — locale-keyed heading map for the crawler-visible product grid
  en: "Shop Flowers & Gifts in {city}",
  ar: "تسوّق الأزهار والهدايا في {city}",
  fr: "Fleurs et cadeaux à {city}",
};

// In-process TTL cache for city product lists so high-traffic city homes
// don't hit the product API on every request. 5-minute TTL matches the
// API server's own listing cache windows.
const CITY_PRODUCTS_CACHE_TTL_MS = 5 * 60 * 1000;
const cityProductsCache = new Map();

/**
 * Fetch Tripoli-style city-eligible products from the live products API and
 * normalise them for server-side card rendering.
 *
 * Resolves to an empty array on ANY failure (timeout, network error, non-OK
 * response, malformed body) so the page never hangs or breaks — the city home
 * simply renders without the product block, exactly as before this feature.
 *
 * @returns {Promise<Array<{name:string, price:string, priceValue:number, slug:string, imageUrl:string, altText:string, canonicalPath:string}>>}
 */
export async function fetchCityProducts(
  apiBaseUrl,
  countryCode,
  cityId,
  lang,
  { limit = 12, timeoutMs = 2500 } = {},
) {
  if (!apiBaseUrl || !countryCode || !cityId) return [];
  const params = new URLSearchParams({
    countryCode,
    cityId,
    sort: "best_sellers",
  });
  if (lang) params.set("lang", lang);
  const url = `${apiBaseUrl.replace(/\/$/, "")}/api/woo/products?${params.toString()}`;
  const cacheKey = `${url}\u0000${limit}`;
  const cached = cityProductsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) return [];
    const body = await res.json();
    if (!body || body.ok !== true || !Array.isArray(body.products)) return [];
    const items = [];
    for (const p of body.products) {
      const name = p && typeof p.name === "string" ? p.name.trim() : "";
      const slug = p && typeof p.id === "string" ? p.id.trim() : "";
      const price = p && typeof p.price === "string" ? p.price.trim() : "";
      const priceValue =
        p && typeof p.priceValue === "number" && isFinite(p.priceValue)
          ? p.priceValue
          : 0;
      const imageUrl =
        (p && p.image && typeof p.image.uri === "string" && p.image.uri) || "";
      // Sale pricing fields must ride along so the hydrated React cards keep
      // showing the discounted price / sale badge after adoption (ProductCard
      // reads discountPriceValue / discountPriceAed via SalePrice).
      const discountPriceValue =
        p && typeof p.discountPriceValue === "number" && isFinite(p.discountPriceValue)
          ? p.discountPriceValue
          : null;
      const discountPriceAed =
        p && typeof p.discountPriceAed === "number" && isFinite(p.discountPriceAed)
          ? p.discountPriceAed
          : null;
      // Only fully renderable, crawlable products make the grid: a card
      // without a name, slug, visible price, or image would be thin markup
      // and its ItemList entry would point at a non-canonical URL.
      if (!name || !slug || !price || priceValue <= 0 || !imageUrl) continue;
      items.push({
        name,
        price,
        priceValue,
        discountPriceValue,
        discountPriceAed,
        slug,
        imageUrl,
        // i18n-ignore — crawler-facing EN alt text for the server-rendered grid
        altText: `${name} — flower & gift delivery`,
        canonicalPath: `/product/${encodeURIComponent(slug)}`,
      });
      if (items.length >= limit) break;
    }
    cityProductsCache.set(cacheKey, {
      value: items,
      expiresAt: Date.now() + CITY_PRODUCTS_CACHE_TTL_MS,
    });
    return items;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Render the server-side product grid: a semantic <section> (flagged with
 * data-ssr-products="true" so React can detect it on hydration and skip its
 * redundant first fetch) containing an <h2> heading and a <ul> of product
 * cards. Each card is a crawlable <a href> wrapping an <img> (explicit
 * width/height + aspect-ratio to prevent CLS; first image eager for LCP,
 * the rest lazy), the product name, and the formatted price with currency.
 *
 * A JSON payload of the same products is embedded so the client can adopt
 * the data without re-fetching (script[type=application/json] is inert).
 *
 * `localeBase` is the locale+city URL prefix (e.g. "/en-lb/tripoli").
 */
export function buildProductGridHtml(products, localeBase, { cityLabel = "", lang = "en" } = {}) {
  if (!Array.isArray(products) || products.length === 0) return "";
  const headingTemplate =
    SSR_PRODUCTS_HEADING[lang] ?? SSR_PRODUCTS_HEADING.en;
  const heading = format(headingTemplate, { city: cityLabel });
  const cards = products
    .map((p, i) => {
      const href = `${localeBase}${p.canonicalPath}`;
      const loading = i === 0 ? "eager" : "lazy";
      const priority = i === 0 ? ` fetchpriority="high"` : "";
      return (
        `<li>` +
        `<a href="${escapeAttr(href)}">` +
        `<img src="${escapeAttr(p.imageUrl)}" alt="${escapeAttr(p.altText)}" width="400" height="400" style="aspect-ratio:1/1;object-fit:cover" loading="${loading}"${priority} />` +
        `<span>${escapeHtml(p.name)}</span>` +
        `<span>${escapeHtml(p.price)}</span>` +
        `</a>` +
        `</li>`
      );
    })
    .join("");
  const jsonPayload = JSON.stringify(
    products.map(({ name, price, priceValue, discountPriceValue, discountPriceAed, slug, imageUrl }) => ({
      name,
      price,
      priceValue,
      discountPriceValue: discountPriceValue ?? null,
      discountPriceAed: discountPriceAed ?? null,
      slug,
      imageUrl,
    })),
  ).replace(/<\/script>/gi, "<\\/script>");
  return (
    `<section data-ssr-products="true">` +
    `<h2>${escapeHtml(heading)}</h2>` +
    `<ul>${cards}</ul>` +
    `<script type="application/json" data-ssr-products-data>${jsonPayload}</script>` +
    `</section>`
  );
}

/**
 * Build an ItemList JSON-LD node for the server-rendered product grid. Each
 * ListItem's url is the absolute canonical product URL — the same URLs the
 * visible cards link to (anti-cloaking parity).
 */
export function buildCityProductsItemListSchema(products, absoluteLocaleBase) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: products.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: p.name,
      url: `${absoluteLocaleBase}${p.canonicalPath}`,
    })),
  };
}

// Strip basic HTML tags and collapse whitespace. WooCommerce category and
// brand `description` fields commonly contain HTML (paragraphs, links).
// Plain text is what social previews want.
function stripHtml(s) {
  return String(s)
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function clampDescription(s, max = 300) {
  if (!s) return "";
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// JSON-LD (Schema.org) helpers
// ---------------------------------------------------------------------------

/**
 * Safely serialise a schema.org object as an inline <script> tag.
 * Escapes </script> sequences in the JSON to prevent XSS.
 */
function jsonLdTag(schema) {
  validateJsonLd(schema);
  return `<script type="application/ld+json">${JSON.stringify(schema).replace(/<\/script>/gi, "<\\/script>")}</script>`;
}

/**
 * Emit several related schemas as a single `<script>` block using a top-level
 * `@graph` array (the schema.org idiom for grouping multiple nodes on one
 * page). Each node is validated individually, then its per-node `@context` is
 * stripped because the context lives once at the top level of the graph. Nodes
 * that are null/undefined are skipped; an empty graph returns "".
 */
function jsonLdGraphTag(nodes) {
  const graph = (Array.isArray(nodes) ? nodes : [])
    .filter((n) => n && typeof n === "object")
    .map((n) => {
      validateJsonLd(n);
      const { ["@context"]: _ctx, ...rest } = n;
      return rest;
    });
  if (graph.length === 0) return "";
  const doc = { "@context": "https://schema.org", "@graph": graph };
  return `<script type="application/ld+json">${JSON.stringify(doc).replace(/<\/script>/gi, "<\\/script>")}</script>`;
}

// Required top-level fields per schema.org @type. Used by validateJsonLd to
// catch missing data during local development / tests before it ships.
const JSON_LD_REQUIRED_FIELDS = {
  Organization: ["name", "url"],
  WebSite: ["name", "url"],
  Florist: ["name", "url"],
  WebPage: ["name", "url"],
  ContactPage: ["name", "url"],
  Product: ["name"],
  Article: ["headline", "image", "datePublished", "url"],
  BreadcrumbList: ["itemListElement"],
  ItemList: ["itemListElement"],
  FAQPage: ["mainEntity"],
};

/**
 * Collect schema.org required-field problems for a single JSON-LD node, as an
 * array of human-readable strings (empty array == valid). This is the single
 * source of truth for "what makes a rich-result block broken": it is used both
 * by the dev/test-only console-warning path (validateJsonLd, below) and by the
 * test/CI guardrail in seo-inject.test.ts, which renders a representative set of
 * routes and turns any returned problem into a hard failure — so a regression
 * (a product losing its price, a breadcrumb shipping empty, a FAQPage with no
 * mainEntity) is caught before the invalid schema reaches Google rather than
 * silently warned about and shipped anyway.
 *
 * `@graph` wrappers are skipped (callers flatten those into individual nodes
 * first); nodes whose @type is not in JSON_LD_REQUIRED_FIELDS have nothing to
 * assert and return no problems.
 */
export function collectJsonLdProblems(obj) {
  const problems = [];
  if (!obj || typeof obj !== "object" || obj["@graph"]) return problems;
  const type = obj["@type"];
  const required = JSON_LD_REQUIRED_FIELDS[type];
  if (required) {
    for (const field of required) {
      const v = obj[field];
      if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) {
        problems.push(`missing required field "${field}"`);
      }
    }
  }
  // Product offers, when present, must carry price + currency + availability.
  if (type === "Product" && obj.offers) {
    for (const field of ["price", "priceCurrency", "availability"]) {
      if (obj.offers[field] == null || obj.offers[field] === "") {
        problems.push(`offer missing "${field}"`);
      }
    }
  }
  return problems;
}

/**
 * Dev/test-only guardrail: warn (never throw) when a JSON-LD object is missing
 * a required field for its @type, so a missing price/url/name surfaces as a
 * console warning locally rather than silent bad schema in production. No-op
 * in production so it never adds request-path overhead. The hard-failing
 * counterpart lives in seo-inject.test.ts via collectJsonLdProblems().
 */
function validateJsonLd(obj) {
  if (process.env?.NODE_ENV === "production") return obj;
  try {
    const type = obj && typeof obj === "object" ? obj["@type"] : undefined;
    for (const msg of collectJsonLdProblems(obj)) {
      console.warn(`WARN: JSON-LD ${type ?? "(no @type)"}: ${msg}`);
    }
  } catch {
    // Never let validation break HTML generation.
  }
  return obj;
}

function buildOrganizationSchema(siteUrl) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl}/#organization`,
    name: "Presentail",
    url: siteUrl,
    logo: `${siteUrl}/android-chrome-512x512.png`,
    description: "Luxury flower and gift delivery in Lebanon, UAE, and Cyprus. Same-day and scheduled delivery available.", // i18n-ignore — EN-only schema description
    areaServed: ["LB", "AE", "CY"],
    sameAs: SEO_SOCIAL_LINKS,
  };
}

/**
 * LocalBusiness (Florist) JSON-LD for city homepages. Helps Google associate
 * the brand with each served city/country for local-pack visibility.
 *
 * Enriched fields from LOCATION_DATA: telephone, email, openingHours, hasMap,
 * priceRange, areaServed (AdministrativeArea array), currenciesAccepted,
 * paymentAccepted, and url (city-level canonical).
 */
export function buildLocalBusinessSchema({ siteUrl, cityName, countryName, countryCode, cityUrl }) {
  const cc = (countryCode || "").toLowerCase();
  const loc = LOCATION_DATA[cc] ?? LOCATION_DATA.lb;
  const schema = {
    "@context": "https://schema.org",
    // LocalBusiness (not OnlineStore): schema.org's OnlineStore inherits from
    // Organization, which does not recognise openingHours, hasMap, priceRange,
    // currenciesAccepted, or paymentAccepted — Google flags them as invalid.
    // LocalBusiness (and its subtype Florist) does recognise all five fields.
    "@type": "LocalBusiness",
    name: "Presentail",
    url: cityUrl || siteUrl,
    image: `${siteUrl}/android-chrome-512x512.png`,
    logo: `${siteUrl}/android-chrome-512x512.png`,
    telephone: loc.phone,
    email: loc.email,
    openingHours: loc.openingHours,
    hasMap: loc.mapUrl,
    priceRange: loc.priceRange,
    currenciesAccepted: loc.currenciesAccepted,
    paymentAccepted: loc.paymentAccepted, // i18n-ignore — payment method labels
  };
  if (cityName || countryName) {
    schema.address = {
      "@type": "PostalAddress",
      ...(cityName ? { addressLocality: cityName } : {}),
      ...(countryName ? { addressCountry: countryName } : {}),
    };
  }
  // Single country-level areaServed string on the organisation node.
  // The previous AdministrativeArea array (26 governorates per city page) is
  // not a supported property of Google's local business rich result and,
  // repeated across 37 pages, read as a false multi-location claim.
  if (countryName || cityName) {
    schema.areaServed = countryName || cityName;
  }
  return schema;
}

/**
 * City-specific FAQ items for city home pages. Returns an array of
 * { question, answer } objects localised to `locale` (en/ar/fr).
 *
 * Replaces the generic HOMEPAGE_FAQ_COPY for city home pages in JSON-LD and
 * the prerendered body fragment so each of the 37 city pages has distinct Q&A.
 */
export function buildCityFaqSchema(cityName, countryCode, locale) {
  const cc = (countryCode || "").toUpperCase();
  const lang = locale === "ar" || locale === "fr" ? locale : "en";

  const loc = LOCATION_DATA[cc.toLowerCase()] ?? LOCATION_DATA.lb;
  const paymentAccepted = loc.paymentAccepted; // i18n-ignore — payment methods

  // Cities with hand-written landing-page overrides (e.g. Tripoli) carry an
  // expanded FAQ set defined once in CITY_HOME_SEO_OVERRIDES — the same array
  // feeds this JSON-LD, the server-injected visible FAQ block, and the
  // hydrated React page (SEOContentSection overrides), keeping all three
  // exactly in sync. Other cities and locales keep the generic set below.
  const overrideFaqs = getCityHomeSeoOverride(
    `${cc.toLowerCase()}-${String(cityName).toLowerCase()}`,
    lang,
  )?.faqs;
  if (overrideFaqs) return overrideFaqs;

  const questions = {
    en: [
      {
        question: `Does Presentail deliver flowers to ${cityName}?`, // i18n-ignore — city name only
        answer: `Yes, Presentail delivers fresh flowers, plants, and luxury gifts to ${cityName} with same-day and next-day delivery options.`, // i18n-ignore — city name only
      },
      {
        question: `What payment methods are accepted for orders in ${cityName}?`, // i18n-ignore — city name only
        answer: `We accept ${paymentAccepted} for all orders.`, // i18n-ignore — payment list
      },
      {
        question: `Can I send a gift to someone in ${cityName}?`, // i18n-ignore — city name only
        answer: `Yes, simply enter the recipient's address in ${cityName} at checkout. Your order will be delivered with a personalised card message.`, // i18n-ignore — city name only
      },
    ],
    ar: [
      {
        question: `هل تقوم Presentail بتوصيل الزهور إلى ${cityName}؟`,
        answer: `نعم، تقوم Presentail بتوصيل الزهور الطازجة والنباتات والهدايا الفاخرة إلى ${cityName} مع خيارات التوصيل في نفس اليوم والتوصيل في اليوم التالي.`,
      },
      {
        question: `ما هي طرق الدفع المقبولة للطلبات في ${cityName}؟`,
        answer: `نقبل ${paymentAccepted} لجميع الطلبات.`,
      },
      {
        question: `هل يمكنني إرسال هدية لشخص في ${cityName}؟`,
        answer: `نعم، أدخل عنوان المستلم في ${cityName} عند إتمام الطلب وسيتم التوصيل مع رسالة بطاقة شخصية.`,
      },
    ],
    fr: [
      {
        question: `Presentail livre-t-il des fleurs à ${cityName} ?`,
        answer: `Oui, Presentail livre des fleurs fraîches, des plantes et des cadeaux de luxe à ${cityName} avec des options de livraison le jour même ou le lendemain.`,
      },
      {
        question: `Quels modes de paiement sont acceptés pour les commandes à ${cityName} ?`,
        answer: `Nous acceptons ${paymentAccepted} pour toutes les commandes.`,
      },
      {
        question: `Puis-je envoyer un cadeau à quelqu'un à ${cityName} ?`,
        answer: `Oui, saisissez l'adresse du destinataire à ${cityName} lors du paiement. La commande sera livrée avec un message personnalisé.`,
      },
    ],
  };

  return questions[lang] ?? questions.en;
}

/** Locale-keyed prefix for the nearby-city anchor text. */
const NEARBY_CITY_ANCHOR_PREFIX = {
  en: "Flower delivery in", // i18n-ignore — locale-keyed crawler-only anchor prefix
  ar: "توصيل الزهور في", // i18n-ignore — locale-keyed crawler-only anchor prefix
  fr: "Livraison de fleurs à", // i18n-ignore — locale-keyed crawler-only anchor prefix
};

/**
 * Build a nav of up to 4 other cities in the same country. Rendered inside
 * a <noscript> block so AI crawlers and non-JS bots can discover other city
 * pages without relying on JS. Anchor text is localized for en/ar/fr.
 */
function buildNearbyCityLinks({ country, currentCity, lang, origin, cleanBase }) {
  const siblings = CITY_SLUGS_BY_COUNTRY[country];
  if (!siblings || siblings.length <= 1) return "";
  const cityNamesForLang = CITY_NAMES[lang] ?? CITY_NAMES.en;
  const nearby = siblings
    .filter((slug) => slug !== currentCity)
    .slice(0, 4);
  if (nearby.length === 0) return "";
  const prefix = NEARBY_CITY_ANCHOR_PREFIX[lang] ?? NEARBY_CITY_ANCHOR_PREFIX.en;
  const links = nearby.map((slug) => {
    const label = cityNamesForLang[`${country}-${slug}`] ?? CITY_NAMES.en[`${country}-${slug}`] ?? slug;
    const href = `${origin}${cleanBase}/${lang}-${country}/${slug}`;
    return `<a href="${escapeAttr(href)}">${escapeHtml(prefix)} ${escapeHtml(label)}</a>`;
  });
  return `<nav aria-label="Nearby cities">${links.join("")}</nav>`; // i18n-ignore
}

/**
 * ItemList JSON-LD for category / occasion listing pages — emits the first
 * (≤10) products with position, name, canonical product URL and image so
 * search engines understand the page lists products and can deep-link each one.
 * `items` is an array of `{ name, slug, image }`; `locBase` is the locale+city
 * base URL used to build each product's clean URL (`{locBase}/product/{slug}`).
 */
function buildItemListSchema(items, listName, locBase) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    ...(listName ? { name: listName } : {}),
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      ...(it.slug && locBase
        ? { url: `${locBase}/product/${encodeURIComponent(it.slug)}` }
        : {}),
      ...(it.image ? { image: it.image } : {}),
    })),
  };
}

function buildWebSiteSchema(siteUrl) {
  // No `potentialAction` SearchAction: the storefront has no dedicated,
  // crawlable search results page (search is a client-side overlay only), so
  // emitting a SearchAction would point Google's sitelinks search box at a
  // non-existent URL. Add one here only if a real `/search` route is shipped.
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl}/#website`,
    name: "Presentail",
    url: siteUrl,
    description: "Order flowers, gifts, cakes, chocolates, balloons, and plants online with delivery across Lebanon, the UAE, and Cyprus.", // i18n-ignore — EN-only schema description
    publisher: { "@id": `${siteUrl}/#organization` },
  };
}

/**
 * Generic WebPage JSON-LD for lightweight static content pages (Terms,
 * Privacy). Anchored to the WebSite so crawlers understand the page is part of
 * the wider site.
 */
function buildWebPageSchema({ siteUrl, url, name, description }) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name,
    url,
    ...(description ? { description } : {}),
    isPartOf: { "@type": "WebSite", name: "Presentail", url: siteUrl },
  };
}

/**
 * ContactPage JSON-LD for the /contact route.
 */
function buildContactPageSchema({ siteUrl, url, name, description }) {
  return {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name,
    url,
    ...(description ? { description } : {}),
    isPartOf: { "@type": "WebSite", name: "Presentail", url: siteUrl },
  };
}

/**
 * Build a BreadcrumbList JSON-LD from an ordered array of { name, url? }
 * items. The last item should omit `url` — it is the current page.
 */
function buildBreadcrumbListSchema(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(({ name, url }, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      ...(url != null ? { item: url } : {}),
    })),
  };
}

/**
 * Extract the locale+city base URL from a pathname like `/en-lb/beirut/...`
 * for use in breadcrumb item URLs.
 */
function localeBaseUrl(pathname, origin, basePath) {
  const cleanBase = basePath.replace(/\/$/, "");
  const parsed = parseLocalePath(pathname);
  if (!parsed.hasLocalePrefix) return `${origin}${cleanBase}`;
  let pfx = `/${parsed.lang}-${parsed.country}`;
  if (parsed.city) pfx += `/${parsed.city}`;
  return `${origin}${cleanBase}${pfx}`;
}

/**
 * Resolve the URL identity used by an entity page's canonical and structured
 * data. Entity pages at satellite cities may canonicalize to their country's
 * hub city, so every URL derived from that page must use the same pathname.
 * Curated city-specific pages pass remapCityToHub=false and remain
 * self-canonical.
 */
function buildEntityUrlContext({ pathname, origin, basePath, remapCityToHub }) {
  const canonicalPathname = remapCityToHub
    ? remapPathnameToHubCity(pathname)
    : pathname;
  return {
    canonicalPathname,
    localeBase: localeBaseUrl(canonicalPathname, origin, basePath),
    canonicalUrl: buildCanonicalUrl(canonicalPathname, { origin, basePath }),
  };
}

const TRACKING_PARAMS = new Set([
  "srsltid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "msclkid",
  "gad_source",
  "gad_campaignid",
  "ttclid",
  "twclid",
  "li_fat_id",
  "mc_cid",
  "mc_eid",
  "hsa_cam",
  "hsa_grp",
  "hsa_ad",
  "hsa_mt",
  "hsa_net",
  "hsa_src",
  "hsa_tgt",
  "hsa_ver",
  "hsa_kw",
  "campaignid",
  "adgroupid",
  "adid",
]);

// ---------------------------------------------------------------------------
// Faceted-navigation canonical URL normalization
//
// Filter / utility parameters that never produce a distinct landing page.
// Must stay in sync with:
//   - robots.txt Disallow rules (/*?<param>=)
//   - serve.mjs FILTER_NOINDEX_PARAMS
//   - scripts/src/canonicalNorm.ts FILTER_PARAMS
// ---------------------------------------------------------------------------

const FILTER_PARAMS_CANONICAL = new Set([
  "sort",
  "currency",
  "wmc-currency",
  "delivery",
  "availability",
  "price_min",
  "price_max",
  "page",
  "ref",
  "from",
  "scroll",
]);

// Navigation params that have dedicated path equivalents (/occasion/<slug>,
// /category/<slug>). Always stripped from canonical URLs.
const NAV_PARAMS_CANONICAL = new Set(["occasion", "category", "recipient"]);

/**
 * Curated filter landing pages whose canonical URL deliberately preserves the
 * filter params.  Empty by default — populated by the product team when a
 * curated filter collection (e.g. "same-day delivery in Beirut") is launched.
 *
 * Shape:
 *   { path: '/en-lb/beirut/shop', params: { delivery: 'today' },
 *     title: {...}, description: {...} }
 */
export const CURATED_FILTER_PAGES = [
  // Example: a curated "same-day delivery" collection
  // { path: '/en-lb/beirut/shop', params: { delivery: 'today' }, title: {...}, description: {...} }
];

/**
 * Build a canonical URL by stripping utility/filter, navigation, and tracking
 * parameters.  Curated filter-page combinations in CURATED_FILTER_PAGES are
 * exempt from stripping — their canonical URL preserves only the curated params.
 *
 * @param {string} reqUrl   Full request URL or path+query string.
 * @param {{ origin?: string, basePath?: string }} [opts]
 * @returns {string}        Absolute canonical URL with stripped params.
 */
export function buildCanonicalUrl(reqUrl, { origin = "https://presentail.com", basePath = "" } = {}) {
  const cleanBase = (basePath || "").replace(/\/$/, "");
  let pathname, search;
  try {
    const base = origin || "https://presentail.com";
    const parsed = new URL(reqUrl, base);
    pathname = parsed.pathname;
    search = parsed.search;
  } catch {
    return (origin || "") + cleanBase + (reqUrl || "/");
  }

  // Strip basePath prefix so path matching works on the locale-relative path.
  let cleanPathname = pathname;
  if (cleanBase && cleanPathname.startsWith(cleanBase)) {
    cleanPathname = cleanPathname.slice(cleanBase.length) || "/";
  }

  // Check curated filter pages — exempt from param stripping.
  for (const curated of CURATED_FILTER_PAGES) {
    if (cleanPathname === curated.path) {
      const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
      let matches = true;
      for (const [k, v] of Object.entries(curated.params ?? {})) {
        if (sp.get(k) !== v) { matches = false; break; }
      }
      if (matches) {
        const curatedParams = new URLSearchParams();
        for (const [k, v] of Object.entries(curated.params ?? {})) curatedParams.set(k, v);
        const curatedSearch = curatedParams.toString() ? `?${curatedParams.toString()}` : "";
        return (origin || "") + cleanBase + cleanPathname + curatedSearch;
      }
    }
  }

  // Strip all unwanted params (filter + navigation + tracking).
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const key of FILTER_PARAMS_CANONICAL) params.delete(key);
  for (const key of NAV_PARAMS_CANONICAL) params.delete(key);
  for (const key of TRACKING_PARAMS) params.delete(key);
  const cleanSearch = params.toString() ? `?${params.toString()}` : "";
  const cleanPath = cleanPathname.replace(/\/$/, "") || "/";
  return (origin || "") + cleanBase + cleanPath + cleanSearch;
}

/**
 * Remove known tracking/analytics query parameters from a raw query string.
 * Returns a clean query string (e.g. "?foo=bar") or an empty string when
 * nothing remains after stripping. Non-tracking params are preserved.
 *
 * @param {string} search - Raw query string, e.g. "?srsltid=abc&foo=bar"
 * @returns {string}
 */
export function stripTrackingParams(search) {
  if (!search) return "";
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const key of TRACKING_PARAMS) {
    params.delete(key);
  }
  const cleaned = params.toString();
  return cleaned ? "?" + cleaned : "";
}

function buildEntityHead({
  ogType,
  title,
  description,
  imageUrl,
  imageAlt,
  imageWidth,
  imageHeight,
  basePath,
  origin,
  pathname,
  search,
  lang,
  country,
  robots,
  extraLines = [],
  remapCityToHub = false,
}) {
  const cleanBase = basePath.replace(/\/$/, "");
  // Use buildCanonicalUrl so entity page canonicals strip both tracking params
  // AND filter/utility params (sort, currency, page, etc.) from the canonical
  // href, consistent with the faceted-navigation crawl-budget controls.
  //
  // remapCityToHub: entity pages (product/brand/category/occasion) at non-hub
  // cities canonicalize to the hub city for their country (e.g.
  // /en-lb/tripoli/product/roses → /en-lb/beirut/product/roses) so ranking
  // signals consolidate instead of fragmenting across near-duplicate city
  // URLs. City-level pages (home, shop, listings, static pages) keep
  // self-canonical — their stock/delivery content is genuinely city-specific.
  const { canonicalPathname } = buildEntityUrlContext({
    pathname,
    origin,
    basePath,
    remapCityToHub,
  });
  const canonicalHref = buildCanonicalUrl(canonicalPathname + (search || ""), { origin, basePath });
  const lines = [];
  lines.push(`<meta name="description" content="${escapeAttr(description)}" />`);
  lines.push(`<link rel="canonical" href="${escapeAttr(canonicalHref)}" />`);
  if (robots) {
    lines.push(`<meta name="robots" content="${escapeAttr(robots)}" />`);
  }
  lines.push(`<meta property="og:title" content="${escapeAttr(title)}" />`);
  lines.push(
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
  );
  lines.push(`<meta property="og:type" content="${escapeAttr(ogType)}" />`);
  lines.push(`<meta property="og:site_name" content="Presentail" />`);
  lines.push(
    `<meta property="og:locale" content="${escapeAttr((country && OG_LOCALE_COUNTRY[lang]?.[country]) || OG_LOCALE[lang] || "en_US")}" />`,
  );
  lines.push(`<meta property="og:url" content="${escapeAttr(canonicalHref)}" />`);
  const effectiveImageUrl = imageUrl || `${origin}${cleanBase}/opengraph.jpg?v=2`;
  const effectiveImageAlt = imageAlt || "Presentail — Luxury Flower & Gift Delivery"; // i18n-ignore — brand tagline used as OG image alt fallback
  lines.push(`<meta property="og:image" content="${escapeAttr(effectiveImageUrl)}" />`);
  lines.push(`<meta property="og:image:secure_url" content="${escapeAttr(effectiveImageUrl)}" />`);
  // Emit image/jpeg only when the URL is known to serve JPEG: the static
  // opengraph.jpg fallback, the /api/og-image/* branded card endpoints (which
  // always return JPEG), or blog-post fallback. CDN entity photos have an
  // unknown format and must not have a type declared.
  if (!imageUrl || effectiveImageUrl.includes("/api/og-image/")) {
    lines.push(`<meta property="og:image:type" content="image/jpeg" />`);
  }
  if (!imageUrl) {
    lines.push(`<meta property="og:image:width" content="1200" />`);
    lines.push(`<meta property="og:image:height" content="630" />`);
  } else if (imageWidth && imageHeight) {
    lines.push(`<meta property="og:image:width" content="${escapeAttr(String(imageWidth))}" />`);
    lines.push(`<meta property="og:image:height" content="${escapeAttr(String(imageHeight))}" />`);
  }
  lines.push(`<meta property="og:image:alt" content="${escapeAttr(effectiveImageAlt)}" />`);
  lines.push(`<meta name="twitter:card" content="summary_large_image" />`);
  lines.push(`<meta name="twitter:site" content="@presentail" />`);
  lines.push(`<meta name="twitter:title" content="${escapeAttr(title)}" />`);
  lines.push(
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
  );
  lines.push(`<meta name="twitter:image" content="${escapeAttr(effectiveImageUrl)}" />`);
  lines.push(`<meta name="twitter:image:alt" content="${escapeAttr(effectiveImageAlt)}" />`);
  // Organization JSON-LD on every entity page so crawlers always have a
  // site-level anchor regardless of which page they enter through.
  // WebSite is emitted only on the homepage (buildSeoHead) to avoid
  // duplicate WebSite nodes in schema validators.
  lines.push(jsonLdTag(buildOrganizationSchema(`${origin}${cleanBase}`)));
  for (const extra of extraLines) lines.push(extra);
  return { title, headSnippet: lines.join("\n    ") };
}

function genericFallbackDescription(lang, key) {
  const tpl = DESCRIPTIONS[lang]?.[key] ?? DESCRIPTIONS.en[key] ?? "";
  return tpl.replace(/\{(?:city|country)\}/g, "").replace(/\s+/g, " ").trim();
}

// Standard delivery fee in USD for LB orders below the free-delivery threshold.
// AE and CY always offer free standard delivery (see buildOfferDeliveryAndReturns).
const LB_STANDARD_SHIPPING_USD = 3;

// Per-country native currency for the shipping-rate structured data field.
// AE transacts in AED (pegged to USD), CY in EUR. LB uses USD (the store base).
const COUNTRY_SHIPPING_CURRENCY = { AE: "AED", CY: "EUR" };

/**
 * Build the `shippingDetails` + `hasMerchantReturnPolicy` fields for a Product
 * Offer so the listing qualifies for Google's enhanced/free merchant results.
 *
 * - shippingDetails: region is the page's recipient country (defaults to LB).
 *   AE and CY always ship free; LB ships free above the threshold, otherwise
 *   the standard delivery fee (LB_STANDARD_SHIPPING_USD) is emitted.
 *   The shipping currency matches the country's native transactional currency
 *   (AED for AE, EUR for CY, USD for LB) so Google can display localised
 *   shipping costs in the Shopping tab without a conversion step.
 *   deliveryTime is emitted for all countries: 1–3 business days transit.
 * - hasMerchantReturnPolicy: reflects the real 100% Satisfaction Guarantee —
 *   a finite RETURN_WINDOW_DAYS-day, free-of-charge return window.
 *
 * Returns `{}` when the price is unusable so we never emit a malformed offer.
 */
function buildOfferDeliveryAndReturns({ countryCode, priceValue }) {
  const country = (countryCode || "LB").toUpperCase();
  if (
    typeof priceValue !== "number" ||
    !Number.isFinite(priceValue) ||
    priceValue <= 0
  ) {
    return {};
  }

  // AE and CY always offer free standard delivery. LB: free above the
  // threshold, otherwise charge the standard per-order delivery fee.
  const shippingCurrency = COUNTRY_SHIPPING_CURRENCY[country] ?? "USD";
  let shippingRateValue;
  if (country === "AE" || country === "CY") {
    shippingRateValue = 0;
  } else {
    const thresholdUsd = freeDeliveryThresholdUsd(country);
    shippingRateValue = priceValue >= thresholdUsd ? 0 : LB_STANDARD_SHIPPING_USD;
  }

  return {
    shippingDetails: {
      "@type": "OfferShippingDetails",
      shippingRate: {
        "@type": "MonetaryAmount",
        value: shippingRateValue.toFixed(2),
        currency: shippingCurrency,
      },
      deliveryTime: {
        "@type": "ShippingDeliveryTime",
        transitTime: {
          "@type": "QuantitativeValue",
          minValue: 1,
          maxValue: 3,
          unitCode: "d",
        },
      },
      shippingDestination: {
        "@type": "DefinedRegion",
        addressCountry: country,
      },
    },
  };
}

export function buildProductHead({
  product,
  availabilityState,
  imageDimensions,
  lang,
  basePath,
  origin,
  pathname,
  cityLabel,
  countryLabel,
  countryCode,
  country,
  city,
  ogImageUrl,
}) {
  const rawName = typeof product.name === "string" ? product.name.trim() : "";
  const rawDesc =
    typeof product.description === "string" ? product.description.trim() : "";
  const seo = buildProductSeo({
    lang,
    productName: rawName,
    city: cityLabel || "",
    country: countryLabel || "",
    shortDescription: clampDescription(stripHtml(rawDesc), 160),
  });
  // Compute the effective availability state. When the caller passes an
  // explicit state (e.g. from the serve.mjs lifecycle handler) we use it
  // directly; otherwise we derive it from the product object.
  const effectiveState =
    availabilityState ?? getProductAvailabilityState(product);
  const isUnavailable =
    effectiveState === PRODUCT_AVAILABILITY_STATE.SOLD_OUT_TEMPORARILY ||
    effectiveState === PRODUCT_AVAILABILITY_STATE.SEASONAL_UNAVAILABLE;
  // Append " – Coming Soon" to the page title for sold-out / seasonal products
  // so they appear distinctly in SERPs without hurting brand perception.
  const comingSoonSuffix = isUnavailable
    ? (COMING_SOON_SUFFIX[lang] ?? COMING_SOON_SUFFIX.en)
    : "";
  const title = rawName ? seo.title + comingSoonSuffix : "Presentail";
  const description =
    seo.description || genericFallbackDescription(lang, "product");
  // ogImageUrl is a pre-generated branded share image (1200×630 JPEG served
  // by the API). When provided it takes precedence over the raw product photo
  // so WhatsApp / iMessage / Slack previews show a Presentail-branded card
  // rather than a plain product photo.
  //
  // rawProductImageUrl is the original CDN photo. It is intentionally
  // JSON-LD-only (Product schema `image` field): crawlers expect the real item
  // image there, not a social card composite. It is NOT used as an og:image
  // fallback — see the "Design decision" comment in injectSeoTagsAsync for the
  // full rationale.
  const rawProductImageUrl =
    (product.image && typeof product.image.uri === "string" && product.image.uri) ||
    (Array.isArray(product.images) &&
      product.images.find((i) => i && typeof i.uri === "string" && i.uri)?.uri) ||
    null;
  const imageUrl = ogImageUrl || rawProductImageUrl;

  const inStock = effectiveState === PRODUCT_AVAILABILITY_STATE.ACTIVE;

  // Determine market currency from countryCode (ISO 3166-1 alpha-2).
  // AED is pegged to USD at 3.6725 by the UAE Central Bank (fixed rate).
  // EUR rate is approximate — same as feed generator.
  const COUNTRY_CURRENCY = { AE: "AED", CY: "EUR" };
  const COUNTRY_FX = { AE: 3.6725, CY: 0.92 };
  const marketCurrency =
    (countryCode && COUNTRY_CURRENCY[String(countryCode).toUpperCase()]) || "USD";
  const marketFx =
    (countryCode && COUNTRY_FX[String(countryCode).toUpperCase()]) || 1;

  const extraLines = [];
  if (
    inStock &&
    typeof product.priceValue === "number" &&
    Number.isFinite(product.priceValue) &&
    product.priceValue > 0
  ) {
    const marketPrice = roundToNearestFive(product.priceValue * marketFx, marketCurrency);
    extraLines.push(
      `<meta property="product:price:amount" content="${escapeAttr(marketPrice.toFixed(2))}" />`,
    );
    extraLines.push(`<meta property="product:price:currency" content="${escapeAttr(marketCurrency)}" />`);
  }

  // Canonical product URL (no query string) — reused for the Product `url`,
  // the offer `url`, and as the breadcrumb leaf reference. Use the same
  // effective pathname as buildEntityHead so satellite-city entity pages do
  // not emit schema URLs that disagree with their hub-city canonical.
  const cleanBase = basePath.replace(/\/$/, "");
  const siteRoot = `${origin}${cleanBase}`;
  const { localeBase: locBase, canonicalUrl } = buildEntityUrlContext({
    pathname,
    origin,
    basePath,
    remapCityToHub: true,
  });

  // Stable identifier: prefer the numeric OS product id, then WC id, fall back to the slug.
  // osNumericId is the canonical numeric DB primary key that is stable across
  // catalog changes; wcId is kept as a secondary fallback for older products
  // that may not yet carry osNumericId.
  const sku =
    typeof product.osNumericId === "number" && product.osNumericId > 0
      ? String(product.osNumericId)
      : typeof product.wcId === "number" && product.wcId > 0
        ? String(product.wcId)
        : typeof product.id === "string" && product.id
          ? product.id
          : "";

  // Shipping + return policy enrichment for the Offer. Both are required for
  // Google's enhanced/free merchant listings; without them the Rich Results
  // Test reports "missing field" warnings on shippingDetails and
  // hasMerchantReturnPolicy. Values are derived from the shared delivery rules
  // (@workspace/delivery) and the documented returns window so the schema can
  // never drift from the real policy.
  const offerExtras = buildOfferDeliveryAndReturns({
    countryCode,
    priceValue: product.priceValue,
  });

  // Schema.org Product JSON-LD for Google rich results.
  // Price is converted to the market's display currency (marketCurrency) using
  // the same FX rates that the web storefront's display layer applies — this
  // ensures the crawlable structured data agrees with the displayed price so
  // Google's Merchant Listings validator sees consistent numbers.
  // priceValidUntil is set 30 days out to inform Google the price is current
  // and to prevent stale-price penalties from cached structured data.
  // availability mirrors the lifecycle state: sold-out and seasonal products
  // keep their page alive but emit OutOfStock.
  const hasPrice =
    typeof product.priceValue === "number" &&
    Number.isFinite(product.priceValue) &&
    product.priceValue > 0;

  // priceValidUntil: 30 days from now, ISO 8601 date (YYYY-MM-DD).
  const priceValidUntilDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const priceValidUntil = priceValidUntilDate.toISOString().split("T")[0];

  // mpn: OS product SKU field (if present), then the numeric OS id, then
  // the WC id. Provides Google with a Manufacturer Part Number to unambiguously
  // match the product in the merchant catalogue.
  const mpn =
    (typeof product.sku === "string" && product.sku.trim()) ||
    (typeof product.osNumericId === "number" && product.osNumericId > 0
      ? String(product.osNumericId)
      : "") ||
    (typeof product.wcId === "number" && product.wcId > 0
      ? String(product.wcId)
      : "") ||
    (typeof product.id === "string" && product.id) ||
    "";

  // aggregateRating: emit only when the OS product carries genuine review data
  // (reviewCount >= 1). Never fabricate ratings — an empty node would cause
  // Google's Rich Results Test to flag the schema as incomplete.
  const hasRating =
    typeof product.rating === "number" &&
    Number.isFinite(product.rating) &&
    typeof product.reviewCount === "number" &&
    product.reviewCount >= 1;

  // Brand name resolution — used by the brand field on the Product node.
  const brandName =
    (product.brand && typeof product.brand.name === "string" && product.brand.name.trim()) ||
    (Array.isArray(product.brands) && product.brands[0] &&
      typeof product.brands[0].name === "string" && product.brands[0].name.trim()) ||
    null;

  // hasMerchantReturnPolicy belongs on the Product node per the task spec
  // ("Link via hasMerchantReturnPolicy on the Product node") so that Google's
  // Merchant Listings validator can find the return policy without needing to
  // traverse into the Offer. applicableCountry is derived from the locale country.
  const merchantReturnPolicy = {
    "@type": "MerchantReturnPolicy",
    applicableCountry: countryCode ? String(countryCode).toUpperCase() : "LB",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: RETURN_WINDOW_DAYS,
    returnMethod: "https://schema.org/ReturnByMail",
    returnFees: "https://schema.org/FreeReturn",
  };

  // Lifecycle-aware availability: sold-out / seasonal → OutOfStock, active → InStock.
  const schemaAvailability = inStock
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock";
  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: rawName || "Presentail",
    ...(rawDesc ? { description: clampDescription(stripHtml(rawDesc), 300) } : {}),
    ...(rawProductImageUrl ? { image: rawProductImageUrl } : {}),
    ...(sku ? { sku } : {}),
    ...(mpn ? { mpn } : {}),
    url: canonicalUrl,
    // itemCondition applies to the product itself, not just the offer.
    itemCondition: "https://schema.org/NewCondition",
    // hasMerchantReturnPolicy is the correct schema.org property for return
    // policy on a Product node (a nested MerchantReturnPolicy object).
    // The previously present top-level "returnPolicy" (a flat URL string) and
    // "seller" (an Organization object) are not recognised Product properties
    // and were causing ~7,373 Google structured-data validation errors.
    // The correct equivalents already exist: hasMerchantReturnPolicy below
    // and offers.seller inside the Offer node — those are kept as-is.
    hasMerchantReturnPolicy: merchantReturnPolicy,
    ...(brandName ? { brand: { "@type": "Brand", name: brandName } } : {}),
    ...(hasRating
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: product.rating,
            reviewCount: product.reviewCount,
          },
        }
      : {}),
    ...(hasPrice
      ? {
          offers: {
            "@type": "Offer",
            price: roundToNearestFive(product.priceValue * marketFx, marketCurrency).toFixed(2),
            priceCurrency: marketCurrency,
            priceValidUntil,
            availability: schemaAvailability,
            itemCondition: "https://schema.org/NewCondition",
            url: canonicalUrl,
            seller: {
              "@type": "Organization",
              name: "Presentail",
              url: "https://presentail.com",
            },
            ...offerExtras,
          },
        }
      : {}),
  };

  // BreadcrumbList JSON-LD — Home > {City} > {Category} > {Product}. The city
  // crumb is dropped when no city is in the path, and the category crumb when
  // the product has no resolvable category, so the trail never shows an empty
  // or dead segment.
  const categorySlug =
    Array.isArray(product.categories) &&
    typeof product.categories[0] === "string" &&
    product.categories[0]
      ? product.categories[0]
      : "";
  const categoryName = categorySlug
    ? categorySlug
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : "";
  const crumbItems = [{ name: "Home", url: siteRoot }];
  if (cityLabel && locBase !== siteRoot) {
    crumbItems.push({ name: cityLabel, url: locBase });
  }
  if (categorySlug) {
    crumbItems.push({
      name: categoryName,
      url: `${locBase}/category/${encodeURIComponent(categorySlug)}`,
    });
  }
  crumbItems.push({ name: rawName || "Product" });

  // Product + BreadcrumbList emitted together in a single @graph block.
  extraLines.push(
    jsonLdGraphTag([productSchema, buildBreadcrumbListSchema(crumbItems)]),
  );

  const bodyHtml = buildProductBodyHtml(product, {
    title: seo.h1,
    description,
    localeBase: locBase,
    imageUrl,
    cityLabel,
    lang,
    country,
    city,
  });
  // When a pre-generated branded OG image URL is provided use fixed 1200×630
  // dimensions (no need to probe the URL with a Range request).
  const effectiveImageWidth = ogImageUrl ? 1200 : imageDimensions?.width;
  const effectiveImageHeight = ogImageUrl ? 630 : imageDimensions?.height;
  return {
    ...buildEntityHead({
      ogType: "product",
      title,
      description,
      imageUrl,
      imageAlt: rawName
        ? `Presentail share image for ${rawName}`
        : "Presentail product share image", // i18n-ignore — exact branded share-image alt fallback
      imageWidth: effectiveImageWidth,
      imageHeight: effectiveImageHeight,
      basePath,
      origin,
      pathname,
      search: "",
      lang,
      country,
      extraLines,
      remapCityToHub: true,
    }),
    bodyHtml,
  };
}

/**
 * Per-article blog post head. Reads from the shared BLOG_POSTS source of truth
 * (@workspace/blog-content) — the same module the BlogPost page renders from —
 * so the server-side link preview and the live article can never disagree.
 */
export function buildBlogPostHead({ article, lang, country, basePath, origin, pathname }) {
  const rawTitle = typeof article.title === "string" ? article.title.trim() : "";
  const seo = buildBlogSeo({
    lang,
    seoTitle: article.seoTitle,
    articleTitle: rawTitle,
    h1: article.h1,
    description: clampDescription(article.description),
  });
  const title = seo.title;
  const description = seo.description || genericFallbackDescription(lang, "blogPost");
  const cleanBase = basePath.replace(/\/$/, "");
  // Blog posts carry a single language-scoped canonical: /{lang}/blog/:slug.
  // No city or country segment — blog content does not vary by delivery
  // location. All city-prefixed URLs 301-redirect here (serve.mjs § 7c);
  // other-language readers get /ar/blog/:slug or /fr/blog/:slug.
  // Using the lang prefix (instead of a bare /blog/:slug) lets Google serve
  // the right language variant to each reader via hreflang differentiation.
  const blogPostSlug = String(pathname).match(/\/blog\/([^/?#]+)/)?.[1] ?? "";
  const canonicalPathname = blogPostSlug
    ? `/${lang}/blog/${blogPostSlug}`
    : `/${lang}/blog`;
  const canonicalHref = origin + cleanBase + canonicalPathname;
  const extraLines = [];

  // Blog posts use language-only URLs, so their alternates are language
  // values (en/ar/fr), not the market-specific values used by storefront
  // pages. Exclude getter aliases that render the English fallback.
  const blogLanguages = getBlogPostLanguages(BLOG_POSTS[article.slug]);
  for (const alternateLang of blogLanguages) {
    extraLines.push(
      `<link rel="alternate" hreflang="${escapeAttr(alternateLang)}" href="${escapeAttr(
        `${origin}${cleanBase}/${alternateLang}/blog/${blogPostSlug}`,
      )}" />`,
    );
  }
  extraLines.push(
    `<link rel="alternate" hreflang="x-default" href="${escapeAttr(
      `${origin}${cleanBase}/en/blog/${blogPostSlug}`,
    )}" />`,
  );

  // Per-article hero image (src/data/blogPostsCopy.js) — a site-root-relative
  // path resolved to an absolute URL here so crawlers get a self-contained
  // og:image. Falls back to the site-wide default when an article has none.
  const ogImage =
    article.ogImage && typeof article.ogImage.url === "string"
      ? article.ogImage
      : null;
  // Always resolve to an absolute image URL — fall back to the site-wide
  // opengraph.jpg when the article has no custom hero so the Article JSON-LD
  // block always carries the required `image` field (Google rejects Article
  // rich results that omit it).
  // BLOG_OG_FALLBACK_IMAGE_PATH is the canonical fallback path shared with the
  // client-side BlogPost.tsx so both callers use the same fallback.
  const imageUrl = ogImage
    ? `${origin}${cleanBase}${ogImage.url}`
    : `${origin}${cleanBase}${BLOG_OG_FALLBACK_IMAGE_PATH}`;
  const imageWidth = ogImage ? ogImage.width : undefined;
  const imageHeight = ogImage ? ogImage.height : undefined;

  extraLines.push(
    `<meta property="article:published_time" content="${escapeAttr(article.datePublished)}" />`,
  );

  // Article JSON-LD — built by the shared buildBlogArticleJsonLd() from
  // blog-article-schema.mjs so server-side and client-side (BlogPost.tsx)
  // schemas can never silently diverge.
  extraLines.push(
    jsonLdTag(
      buildBlogArticleJsonLd({
        headline: rawTitle,
        description: article.description,
        datePublished: article.datePublished,
        dateModified: article.dateModified,
        image: imageUrl,
        publisherUrl: `${origin}${cleanBase}`,
        url: canonicalHref,
      }),
    ),
  );

  // BreadcrumbList JSON-LD — Home > Journal > Article Title.
  // Home links to the site root; Journal links to /{lang}/blog (the canonical
  // blog index). No city in the breadcrumb chain — consistent with the
  // city-independent canonical /{lang}/blog/:slug.
  const siteBase = `${origin}${cleanBase}`;
  const blogIndexUrl = `${siteBase}/${lang}/blog`;
  extraLines.push(
    jsonLdTag(
      buildBreadcrumbListSchema([
        { name: "Home", url: siteBase || "/" },
        { name: "Journal", url: blogIndexUrl },
        { name: rawTitle || "Article" },
      ]),
    ),
  );

  // Extra article-specific JSON-LD (e.g. LocalBusiness, FAQPage).
  // Defined per-article in blogPostsCopy.js as `extraJsonLd: [...]`.
  for (const schemaObj of article.extraJsonLd ?? []) {
    extraLines.push(jsonLdTag(schemaObj));
  }

  // Prerendered body fragment — includes the h1, publish date, and all
  // article sections so non-rendering crawlers can read the full copy.
  // localeBase uses the lang-only prefix so in-article links point to
  // /{lang}/blog/... (canonical) rather than city-prefixed variants.
  const bodyHtml = buildBlogPostBodyHtml(article, {
    localeBase: `${siteBase}/${lang}`,
    lang,
    currentSlug: blogPostSlug,
  });

  return {
    ...buildEntityHead({
      ogType: "article",
      title,
      description,
      imageUrl,
      imageAlt: seo.h1 || "Presentail",
      imageWidth,
      imageHeight,
      basePath,
      origin,
      pathname: canonicalPathname, // /{lang}/blog/:slug — city-independent canonical
      search: "",
      lang,
      // country omitted: blog canonicals have no country segment; og:locale
      // falls back to OG_LOCALE[lang] (lang-level default, e.g. "en_US").
      extraLines,
    }),
    bodyHtml,
  };
}

const BRANDS_FILTER_TITLES = {
  en: "{name} Brands in {city} | Presentail",
  ar: "علامات {name} في {city} | Presentail",
  fr: "Marques {name} à {city} | Presentail",
};

const BRANDS_FILTER_DESCRIPTIONS = {
  en: "Discover Presentail's hand-picked partner brands offering {name} for delivery in {city}, {country}.",
  ar: "اكتشف العلامات الشريكة المنتقاة من Presentail والتي تقدّم {name} للتوصيل في {city}، {country}.",
  fr: "Découvrez les marques partenaires sélectionnées par Presentail proposant {name} pour livraison à {city}, {country}.",
};

function buildBrandsFilterHead({
  entity,
  imageDimensions,
  lang,
  basePath,
  origin,
  pathname,
  search,
  cityLabel,
  countryLabel,
  country,
}) {
  const rawName = typeof entity.name === "string" ? entity.name.trim() : "";
  const params = {
    name: rawName || "",
    city: cityLabel || "",
    country: countryLabel || "",
  };
  const titleTpl =
    BRANDS_FILTER_TITLES[lang] ?? BRANDS_FILTER_TITLES.en;
  const descTpl =
    BRANDS_FILTER_DESCRIPTIONS[lang] ?? BRANDS_FILTER_DESCRIPTIONS.en;
  const title = rawName
    ? format(titleTpl, params).replace(/\s+/g, " ").trim()
    : format(TITLES[lang]?.brands ?? TITLES.en.brands, params);
  const rawDesc = entity.description ? stripHtml(entity.description) : "";
  const description =
    clampDescription(rawDesc) ||
    format(descTpl, params).replace(/\s+/g, " ").trim();
  const imageUrl =
    typeof entity.image === "string" && entity.image ? entity.image : null;
  const locBase = localeBaseUrl(pathname, origin, basePath);
  const bodyHtml = buildSimpleEntityBodyHtml(entity, { title, description, localeBase: locBase });
  const entityHead = buildEntityHead({
    ogType: "website",
    title,
    description,
    imageUrl,
    imageAlt: rawName || "Presentail brands", // i18n-ignore — brand+type label used as OG image alt fallback
    imageWidth: imageDimensions?.width,
    imageHeight: imageDimensions?.height,
    basePath,
    origin,
    pathname,
    search,
    lang,
    country,
  });
  // buildCanonicalUrl (used inside buildEntityHead) strips filter params like
  // ?category / ?occasion, but on the /brands filter page those params define
  // the page's identity — they must survive in the canonical and og:url. We
  // rebuild the canonical here, preserving the filter param but still stripping
  // tracking noise (gclid, fbclid, etc.).
  const cleanBase = (basePath || "").replace(/\/$/, "");
  const filteredSearch = stripTrackingParams(search);
  const bfCanonical = `${(origin || "").replace(/\/$/, "")}${cleanBase}${pathname}${filteredSearch}`;
  const fixedHeadSnippet = entityHead.headSnippet
    .replace(
      /<link\s+rel="canonical"\s+href="[^"]*"\s*\/>/,
      `<link rel="canonical" href="${escapeAttr(bfCanonical)}" />`,
    )
    .replace(
      /<meta property="og:url" content="[^"]*" \/>/,
      `<meta property="og:url" content="${escapeAttr(bfCanonical)}" />`,
    );
  return { ...entityHead, headSnippet: fixedHeadSnippet, bodyHtml };
}

export function buildBrandHead({ brand, imageDimensions, lang, basePath, origin, pathname, cityLabel, country, productCount, brandProducts, ogImageUrl }) {
  const rawName = typeof brand.name === "string" ? brand.name.trim() : "";
  const seo = buildBrandSeo({ lang, brandName: rawName, city: cityLabel || "" });
  const title = rawName ? seo.title : "Presentail";
  const rawDesc = brand.description ? stripHtml(brand.description) : "";
  const description =
    clampDescription(rawDesc) || seo.description || genericFallbackDescription(lang, "brand");
  // ogImageUrl is a pre-generated branded share image (1200×630 JPEG served
  // by the API). When provided it takes precedence over the raw brand image
  // so WhatsApp / iMessage / Slack previews show a Presentail-branded card
  // rather than a plain brand photo.
  const rawBrandImageUrl =
    typeof brand.image === "string" && brand.image ? brand.image : null;
  const imageUrl = ogImageUrl || rawBrandImageUrl;
  // BreadcrumbList JSON-LD — Home > City > Brands > Brand Name. Keep the
  // breadcrumb base aligned with the remapped entity canonical.
  // "Home" is the site root (not the locale/city page) so the trail is always
  // anchored to the top-level domain; a city crumb is inserted between Home and
  // Brands whenever a city is present in the path.
  const { localeBase: locBase } = buildEntityUrlContext({
    pathname,
    origin,
    basePath,
    remapCityToHub: true,
  });
  const requestLocBase = localeBaseUrl(pathname, origin, basePath);
  const cleanBase = basePath.replace(/\/$/, "");
  const siteRoot = `${origin}${cleanBase}`;
  const brandCrumbs = [{ name: "Home", url: siteRoot }];
  if (cityLabel && locBase !== siteRoot) {
    brandCrumbs.push({ name: cityLabel, url: locBase });
  }
  brandCrumbs.push({ name: "Brands", url: `${locBase}/brands` });
  brandCrumbs.push({ name: rawName || "Brand" });
  const extraLines = [
    jsonLdTag(buildBreadcrumbListSchema(brandCrumbs)),
  ];
  // FAQPage JSON-LD — emit structured Q&A markup so search engines can show
  // expandable FAQ rich results for brand detail pages. Mirrors the pattern
  // used for category and occasion pages. Only emitted when the brand has a
  // name AND we know the brand has deliverable products (or count is unknown
  // because the listing fetch failed — do not suppress on fetch failure).
  let brandBodyFaqItems = [];
  if (rawName && (productCount == null || productCount > 0)) {
    const pickLangFaq = (/** @type {string} */ l) => {
      if (l === "ar" || l === "fr") return l;
      return "en";
    };
    const faqItems = BRAND_FAQ_COPY[pickLangFaq(lang)] ?? BRAND_FAQ_COPY.en;
    const params = { name: rawName, city: cityLabel || "" };
    brandBodyFaqItems = faqItems.slice(0, 3).map(({ q, a }) => ({
      q: formatTemplate(q, params),
      a: formatTemplate(a, params),
    }));
    const mainEntity = brandBodyFaqItems.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: {
        "@type": "Answer",
        text: a,
      },
    }));
    if (mainEntity.length > 0) {
      extraLines.push(
        jsonLdTag({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity,
        }),
      );
    }
  }
  // Body HTML: include the localised heading + intro (selecting the correct
  // intro template from the brand type when available) so AI crawlers see the
  // real SEO section content without executing JS. FAQ questions are added as
  // h2+h3 so pages with multiple sections have the required heading structure
  // for AI crawlers and the Agent Ready scan.
  const pickBodyLangBrand = (/** @type {string} */ l) =>
    (l === "ar" || l === "fr") ? l : "en";
  const brandBodyLang = pickBodyLangBrand(lang);
  const brandParams = { name: rawName, city: cityLabel || "" };
  const brandHeadingTpl = BRAND_HEADING_COPY[brandBodyLang];
  // Select intro copy based on brand type when available (flowers vs food vs
  // general). Falls back to BRAND_INTRO_GENERAL_COPY for unknown types.
  const brandType = typeof brand.type === "string" ? brand.type.toLowerCase() : "general";
  const brandIntroCopyMap =
    brandType === "flowers" ? BRAND_INTRO_FLOWERS_COPY
    : brandType === "food" ? BRAND_INTRO_FOOD_COPY
    : BRAND_INTRO_GENERAL_COPY;
  const brandIntroTpl = brandIntroCopyMap[brandBodyLang] ?? BRAND_INTRO_GENERAL_COPY[brandBodyLang];
  const brandSeoHeading = brandHeadingTpl
    ? formatTemplate(brandHeadingTpl, brandParams)
    : "";
  const brandSeoIntro = brandIntroTpl
    ? formatTemplate(brandIntroTpl, brandParams)
    : "";
  const safeBrandTitle = escapeHtml(seo.h1 || rawName);
  const safeBrandDesc = escapeHtml(description);
  const safeBrandHeading = escapeHtml(brandSeoHeading);
  const safeBrandIntro = escapeHtml(brandSeoIntro);
  const brandNav = locBase
    ? `<nav><a href="${locBase}/">Home</a> › <a href="${locBase}/brands">Brands</a></nav>` // i18n-ignore — breadcrumb labels
    : "";
  let brandFaqBodyHtml = "";
  if (brandBodyFaqItems.length > 0) {
    brandFaqBodyHtml =
      `<h2>Frequently Asked Questions</h2>` + // i18n-ignore — crawlers-only heading in non-rendered body
      brandBodyFaqItems.map(({ q, a }) => `<h3>${escapeHtml(q)}</h3><p>${escapeHtml(a)}</p>`).join("");
  }
  // Product count paragraph + product links list so AI crawlers can discover
  // individual product pages from the brand page.
  let brandProductsHtml = "";
  if (typeof productCount === "number" && productCount > 0) {
    // i18n-ignore — static EN-only crawlers-only product count label
    brandProductsHtml += `<p>${escapeHtml(String(productCount))} products available from ${escapeHtml(rawName)}</p>`; // i18n-ignore
  }
  if (locBase && Array.isArray(brandProducts) && brandProducts.length > 0) {
    const productLinks = brandProducts
      .filter((p) => p && typeof p.slug === "string" && p.slug.trim() && typeof p.name === "string")
      .slice(0, 10)
      .map((p) =>
        `<li><a href="${locBase}/product/${escapeAttr(p.slug)}">${escapeHtml(p.name.trim())}</a></li>`,
      );
    if (productLinks.length > 0) {
      brandProductsHtml += `<ul>${productLinks.join("")}</ul>`;
    }
  }
  // The sr-only h1 lives OUTSIDE the display:none wrapper so Google indexes it
  // alongside the page. sr-only hides it visually while keeping it in the
  // accessibility tree and the crawlable DOM. React replaces all children of
  // #root on hydration, so JS users see the normal SPA h1 without any flash.
  // Tripoli brand pages: crawlable contextual link back to the city landing
  // page. sr-only (not display:none) so Google indexes it; anchor text
  // deliberately varied vs. the occasion-page and /shop back-links.
  const parsedBrandLoc = parseLocalePath(pathname);
  const tripoliBrandLinkHtml =
    parsedBrandLoc.country === "lb" &&
    parsedBrandLoc.city === "tripoli" &&
    lang === "en" &&
    requestLocBase
      ? `<div class="sr-only"><p>Discover our full <a href="${requestLocBase}/">Tripoli flower delivery</a> service.</p></div>` // i18n-ignore — crawler-facing EN copy
      : "";
  // Batroun brand pages: crawlable contextual link back to the city landing
  // page. Anchor text deliberately varied vs. the Tripoli brand and Batroun
  // occasion/shop back-links ("Batroun flowers and gifts" vs.
  // "flower delivery in Batroun" and "flowers and gifts in Batroun").
  const batrounBrandLinkHtml =
    parsedBrandLoc.country === "lb" &&
    parsedBrandLoc.city === "batroun" &&
    lang === "en" &&
    requestLocBase
      ? `<div class="sr-only"><p>Discover our full range of <a href="${requestLocBase}/">Batroun flowers and gifts</a>.</p></div>` // i18n-ignore — crawler-facing EN copy
      : "";
  const bodyHtml = (
    `<h1 class="sr-only">${safeBrandTitle}</h1>` +
    tripoliBrandLinkHtml +
    batrounBrandLinkHtml +
    `<div style="display:none">` +
    (safeBrandDesc ? `<p>${safeBrandDesc}</p>` : "") +
    (safeBrandHeading ? `<h2>${safeBrandHeading}</h2>` : "") +
    (safeBrandIntro ? `<p>${safeBrandIntro}</p>` : "") +
    brandProductsHtml +
    brandFaqBodyHtml +
    brandNav +
    `</div>`
  );
  // When a pre-generated branded OG image URL is provided use fixed 1200×630
  // dimensions (no need to probe the URL with a Range request).
  const effectiveBrandImageWidth = ogImageUrl ? 1200 : imageDimensions?.width;
  const effectiveBrandImageHeight = ogImageUrl ? 630 : imageDimensions?.height;
  return {
    ...buildEntityHead({
      ogType: "website",
      title,
      description,
      imageUrl,
      imageAlt: rawName || "Presentail brand", // i18n-ignore — brand+type label used as OG image alt fallback
      imageWidth: effectiveBrandImageWidth,
      imageHeight: effectiveBrandImageHeight,
      basePath,
      origin,
      pathname,
      search: "",
      lang,
      country,
      extraLines,
      remapCityToHub: true,
    }),
    bodyHtml,
  };
}

export function buildCategoryHead({
  category,
  imageDimensions,
  lang,
  basePath,
  origin,
  pathname,
  search,
  cityLabel,
  countryLabel,
  country,
  productCount,
  items,
}) {
  return buildShopEntityHead({
    entityKind: "category",
    entity: category,
    altText: "Presentail category",
    imageDimensions,
    lang,
    basePath,
    origin,
    pathname,
    search,
    cityLabel,
    countryLabel,
    country,
    productCount,
    items,
  });
}

export function buildOccasionHead({
  occasion,
  imageDimensions,
  lang,
  basePath,
  origin,
  pathname,
  search,
  cityLabel,
  countryLabel,
  country,
  productCount,
  items,
  ogImageUrl,
}) {
  return buildShopEntityHead({
    entityKind: "occasion",
    entity: occasion,
    altText: "Presentail occasion",
    imageDimensions,
    lang,
    basePath,
    origin,
    pathname,
    search,
    cityLabel,
    countryLabel,
    country,
    productCount,
    items,
    ogImageUrl,
  });
}

function buildShopEntityHead({
  entityKind,
  entity,
  altText,
  imageDimensions,
  lang,
  basePath,
  origin,
  pathname,
  search,
  cityLabel,
  countryLabel,
  country,
  productCount,
  items,
  ogImageUrl,
}) {
  const rawName = typeof entity.name === "string" ? entity.name.trim() : "";
  // Curated per-occasion SEO content (title/description/H1/sections/FAQs).
  // Only defined for specific country/city/slug combinations and EN locale;
  // everything else keeps the template-based copy below.
  let curated = null;
  if (entityKind === "occasion") {
    const parsedLoc = parseLocalePath(pathname);
    const slugMatch = (parsedLoc.rest ?? "").match(/^\/occasion\/([^/?#]+)/);
    if (parsedLoc.hasLocalePrefix && slugMatch) {
      curated = getOccasionSeoContent({
        country: parsedLoc.country,
        city: parsedLoc.city,
        slug: decodeURIComponent(slugMatch[1]),
        lang,
      });
    }
  } else if (entityKind === "category") {
    // Curated per-category SEO content (title/description/H1/sections/FAQs).
    // Mirrors the occasion curated pattern: only specific country/city/slug
    // combinations carry hand-written copy (currently lb/beirut: chocolate + cakes, all locales).
    const parsedLoc = parseLocalePath(pathname);
    const slugMatch = (parsedLoc.rest ?? "").match(/^\/category\/([^/?#]+)/);
    if (parsedLoc.hasLocalePrefix && slugMatch) {
      curated = getCategorySeoContent({
        country: parsedLoc.country,
        city: parsedLoc.city,
        slug: decodeURIComponent(slugMatch[1]),
        lang,
      });
    }
  }
  const seo =
    entityKind === "occasion"
      ? buildOccasionSeo({
          lang,
          occasionName: rawName,
          city: cityLabel || "",
          country: countryLabel || "",
          productCount,
        })
      : buildCategorySeo({
          lang,
          categoryName: rawName,
          city: cityLabel || "",
          country: countryLabel || "",
          productCount,
        });
  const title = curated ? curated.title : (rawName ? seo.title : "Presentail");
  const rawDesc = entity.description ? stripHtml(entity.description) : "";
  const description = curated
    ? curated.metaDescription
    : (clampDescription(rawDesc) ||
       seo.description ||
       genericFallbackDescription(lang, "shop"));
  // Mark genuinely empty listing pages (zero deliverable products) as
  // noindex so search engines don't surface thin/empty results.
  const robots = seo.robots === "noindex, follow" ? "noindex, follow" : undefined;
  // ogImageUrl is a pre-generated branded share image (1200×630 JPEG served
  // by the API). When provided it takes precedence over the raw entity image.
  const imageUrl = ogImageUrl ||
    (typeof entity.image === "string" && entity.image ? entity.image : null);
  // Curated pages contain unique city-specific content and are self-canonical;
  // all other entity pages consolidate to their country's hub city. The same
  // context feeds canonical, breadcrumbs, ItemList URLs, and crawlable links.
  const remapCityToHub = !curated;
  // BreadcrumbList + ItemList JSON-LD, emitted together in one @graph block.
  // Breadcrumb: Home > {City} > {Category/Occasion}. "Home" is the site root,
  // "{City}" is the locale/city homepage; the city crumb is dropped when no
  // city is in the path so the trail never shows an empty label.
  const cleanBase = basePath.replace(/\/$/, "");
  const siteRoot = `${origin}${cleanBase}`;
  const { localeBase: locBase, canonicalUrl } = buildEntityUrlContext({
    pathname,
    origin,
    basePath,
    remapCityToHub,
  });
  const requestLocBase = localeBaseUrl(pathname, origin, basePath);
  const crumbItems = [{ name: "Home", url: siteRoot }];
  if (cityLabel && locBase !== siteRoot) {
    crumbItems.push({ name: cityLabel, url: locBase });
  }
  // Occasion detail pages include an intermediate "Occasions" crumb so the
  // full trail is Home > City > Occasions > OccasionName, matching the
  // equivalent breadcrumb the category pages show for their listing page.
  if (entityKind === "occasion" && rawName) {
    crumbItems.push({ name: "Occasions", url: `${locBase}/occasions` });
  }
  crumbItems.push({ name: rawName || altText });
  const graphNodes = [buildBreadcrumbListSchema(crumbItems)];
  // ItemList — first (≤10) products (name + URL + image) on the listing page.
  if (Array.isArray(items) && items.length > 0) {
    graphNodes.push(buildItemListSchema(items, rawName || altText, locBase));
  }
  // CollectionPage + Service nodes for curated city-category pages.
  // These carry hand-written unique content so they deserve richer structured
  // data — a CollectionPage node explicitly describes the listing, and a
  // Service node signals the areaServed geography to local-search systems.
  // Both are scoped to curated pages only; template pages already get
  // BreadcrumbList + ItemList which is sufficient for non-curated listings.
  if (curated && entityKind === "category" && locBase) {
    const selfHref = canonicalUrl;
    graphNodes.push({
      "@type": "CollectionPage",
      name: curated.title,
      description: curated.metaDescription,
      url: selfHref,
    });
    if (cityLabel) {
      graphNodes.push({
        "@type": "Service",
        name: `${rawName || "Gift"} Delivery in ${cityLabel}`,
        serviceType: "Gift Delivery",
        areaServed: [
          { "@type": "City", name: cityLabel },
          ...(countryLabel ? [{ "@type": "Country", name: countryLabel }] : []),
        ],
        provider: {
          "@type": "Organization",
          name: "Presentail",
          url: `${origin}${cleanBase}`,
        },
      });
    }
  }
  const extraLines = [jsonLdGraphTag(graphNodes)];
  // FAQPage JSON-LD — emit structured Q&A markup so search engines can show
  // expandable FAQ rich results for category and occasion listing pages.
  // Emitted as a standalone <script> (not in the @graph above) so validators
  // see a clean FAQPage root. Only emitted when the entity has a name AND the
  // page has deliverable products — a listing with no products never renders
  // the FAQ section in the UI, so the schema would not match visible content.
  let entityBodyFaqItems = [];
  if (curated) {
    // Curated FAQ copy replaces the templates entirely. The client route
    // renders the same curated Q&A visibly, so the schema always matches
    // on-page content regardless of product count.
    entityBodyFaqItems = curated.faqs.map(({ q, a }) => ({ q, a }));
    extraLines.push(
      jsonLdTag({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: entityBodyFaqItems.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      }),
    );
  } else if (rawName && productCount > 0) {
    const faqCopyMap =
      entityKind === "occasion" ? OCCASION_FAQ_COPY : CATEGORY_FAQ_COPY;
    const pickLangFaq = (/** @type {string} */ l) => {
      if (l === "ar" || l === "fr") return l;
      return "en";
    };
    const faqItems = faqCopyMap[pickLangFaq(lang)] ?? faqCopyMap.en;
    const params = { name: rawName, city: cityLabel || "" };
    entityBodyFaqItems = faqItems.slice(0, 3).map(({ q, a }) => ({
      q: formatTemplate(q, params),
      a: formatTemplate(a, params),
    }));
    const mainEntity = entityBodyFaqItems.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: {
        "@type": "Answer",
        text: a,
      },
    }));
    if (mainEntity.length > 0) {
      extraLines.push(
        jsonLdTag({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity,
        }),
      );
    }
  }
  // Body HTML: include the localised heading + intro template text and the FAQ
  // questions so AI crawlers (GPTBot, ClaudeBot, etc.) see the real SEO section
  // content and heading structure without executing JS.
  const pickBodyLang = (/** @type {string} */ l) =>
    (l === "ar" || l === "fr") ? l : "en";
  const bodyLang = pickBodyLang(lang);
  const headingTpl =
    entityKind === "occasion"
      ? OCCASION_HEADING_COPY[bodyLang]
      : CATEGORY_HEADING_COPY[bodyLang];
  const catSlug = entityKind === "category"
    ? extractCategorySlugFromSearch(search)
    : null;
  const introTpl =
    entityKind === "occasion"
      ? OCCASION_INTRO_COPY[bodyLang]
      : FLOWER_CATEGORY_SLUGS_SERVER.has(catSlug ?? "")
        ? CATEGORY_INTRO_FLOWER_COPY[bodyLang]
        : CATEGORY_INTRO_NONFLOWER_COPY[bodyLang];
  const entityParams = { name: rawName, city: cityLabel || "" };
  const seoHeading = headingTpl ? formatTemplate(headingTpl, entityParams) : "";
  const seoIntro = introTpl ? formatTemplate(introTpl, entityParams) : "";
  const rawEntityDesc = entity.description ? stripHtml(entity.description) : "";
  const resolvedH1 = curated?.h1 ?? seo.h1;
  const safeEntityTitle = escapeHtml(resolvedH1 || rawName);
  const safeEntityDesc = escapeHtml(clampDescription(rawEntityDesc) || description);
  const safeSeoHeading = escapeHtml(seoHeading);
  const safeSeoIntro = escapeHtml(seoIntro);
  const entityNav = locBase
    ? `<nav><a href="${locBase}/">Home</a> › <a href="${locBase}/shop">Shop</a></nav>` // i18n-ignore — breadcrumb labels
    : "";
  // Add FAQ questions as h2+h3 headings so pages with multiple sections have
  // the required subheading structure for AI crawlers and the Agent Ready scan.
  let entityFaqBodyHtml = "";
  if (entityBodyFaqItems.length > 0) {
    entityFaqBodyHtml =
      `<h2>Frequently Asked Questions</h2>` + // i18n-ignore — crawlers-only heading in non-rendered body
      entityBodyFaqItems.map(({ q, a }) => `<h3>${escapeHtml(q)}</h3><p>${escapeHtml(a)}</p>`).join("");
  }
  // Product count + product links so AI crawlers can discover individual
  // product pages from the category/occasion listing page body fragment.
  let entityProductsHtml = "";
  if (typeof productCount === "number" && productCount > 0) {
    // i18n-ignore — static EN-only crawlers-only product count label
    entityProductsHtml += `<p>${escapeHtml(String(productCount))} products available</p>`; // i18n-ignore
  }
  if (locBase && Array.isArray(items) && items.length > 0) {
    // No .slice() cap: every deliverable product on the listing page becomes a
    // crawlable link in the initial HTML so non-rendering crawlers (Bing, AI
    // answer engines, and Google's crawl queue before render) can discover the
    // full catalogue. Links are name+href only — no images — so even a
    // 300-product list adds just a few KB to the compressed response.
    const productLinks = items
      .filter((p) => p && typeof p.slug === "string" && p.slug.trim() && typeof p.name === "string")
      .map((p) =>
        `<li><a href="${locBase}/product/${escapeAttr(p.slug)}">${escapeHtml(p.name.trim())}</a></li>`,
      );
    if (productLinks.length > 0) {
      entityProductsHtml += `<ul>${productLinks.join("")}</ul>`;
    }
  }
  // The sr-only h1 lives OUTSIDE the display:none wrapper so Google (which
  // treats display:none as potentially cloaked content) indexes it alongside
  // the rest of the page. sr-only hides it visually while keeping it in the
  // accessibility tree and the crawlable DOM. React's createRoot() replaces
  // all children of #root on hydration, so JS users see the normal SPA h1.
  // Product links live OUTSIDE the display:none wrapper (like the h1) so
  // Google indexes them rather than merely crawling them — display:none
  // content is potentially deweighted or treated as cloaked. sr-only keeps
  // them out of the visual layout; React replaces all of #root on mount.
  // Curated occasion pages render a VISIBLE content block in the prerendered
  // body — visible H1 (differing from the <title>), intro paragraph, H2
  // sections with category links, and the FAQ Q&A — so crawlers fetching raw
  // HTML see real on-page content, not just sr-only/hidden fragments. React
  // replaces all of #root on hydration and re-renders the same curated copy.
  let curatedBodyHtml = "";
  if (curated) {
    const sectionsHtml = curated.sections
      .map((s) => {
        let linksHtml = "";
        if (locBase && Array.isArray(s.links) && s.links.length > 0) {
          linksHtml =
            `<ul>` +
            s.links
              // absolute:true links are already locale-prefixed full paths
              // (cross-city hub-and-spoke); do NOT prepend locBase to them.
              .map((l) => `<li><a href="${l.absolute ? escapeAttr(l.href) : locBase + escapeAttr(l.href)}">${escapeHtml(l.label)}</a></li>`)
              .join("") +
            `</ul>`;
        }
        return `<h2>${escapeHtml(s.heading)}</h2><p>${escapeHtml(s.body)}</p>${linksHtml}`;
      })
      .join("");
    const curatedFaqHtml =
      curated.faqs.length > 0
        ? `<h2>Frequently Asked Questions</h2>` + // i18n-ignore — curated content is EN-only
          curated.faqs.map(({ q, a }) => `<h3>${escapeHtml(q)}</h3><p>${escapeHtml(a)}</p>`).join("")
        : "";
    curatedBodyHtml =
      `<h1>${escapeHtml(curated.h1)}</h1>` +
      `<p>${escapeHtml(curated.intro)}</p>` +
      sectionsHtml +
      curatedFaqHtml;
  }
  // Tripoli occasion pages: crawlable contextual link back to the city
  // landing page (/en-lb/tripoli). Lives in the sr-only region (indexed by
  // Google, unlike display:none) so it strengthens the landing page's inbound
  // internal-link graph without altering the visible React UI. Anchor text
  // intentionally differs from the /shop back-link and brand-page anchors.
  const parsedEntityLoc = parseLocalePath(pathname);
  const tripoliOccasionLinkHtml =
    entityKind === "occasion" &&
    parsedEntityLoc.country === "lb" &&
    parsedEntityLoc.city === "tripoli" &&
    lang === "en" &&
    requestLocBase
      ? `<p>Explore more <a href="${requestLocBase}/">flowers and gifts in Tripoli</a> for every occasion.</p>` // i18n-ignore — crawler-facing EN copy
      : "";
  // Batroun occasion pages: crawlable contextual link back to the city landing
  // page (/en-lb/batroun). Anchor text varied vs. the /shop and brand back-links.
  const batrounOccasionLinkHtml =
    entityKind === "occasion" &&
    parsedEntityLoc.country === "lb" &&
    parsedEntityLoc.city === "batroun" &&
    lang === "en" &&
    requestLocBase
      ? `<p>Explore more <a href="${requestLocBase}/">flowers and gifts in Batroun</a> for every occasion.</p>` // i18n-ignore — crawler-facing EN copy
      : "";
  const bodyHtml = curated
    ? (
      curatedBodyHtml +
      (entityProductsHtml ? `<div class="sr-only">${entityProductsHtml}</div>` : "") +
      (tripoliOccasionLinkHtml ? `<div class="sr-only">${tripoliOccasionLinkHtml}</div>` : "") +
      (batrounOccasionLinkHtml ? `<div class="sr-only">${batrounOccasionLinkHtml}</div>` : "") +
      (entityNav ? `<div style="display:none">${entityNav}</div>` : "")
    )
    : (
      `<h1 class="sr-only">${safeEntityTitle}</h1>` +
      (entityProductsHtml ? `<div class="sr-only">${entityProductsHtml}</div>` : "") +
      (tripoliOccasionLinkHtml ? `<div class="sr-only">${tripoliOccasionLinkHtml}</div>` : "") +
      (batrounOccasionLinkHtml ? `<div class="sr-only">${batrounOccasionLinkHtml}</div>` : "") +
      `<div style="display:none">` +
      (safeEntityDesc ? `<p>${safeEntityDesc}</p>` : "") +
      (safeSeoHeading ? `<h2>${safeSeoHeading}</h2>` : "") +
      (safeSeoIntro ? `<p>${safeSeoIntro}</p>` : "") +
      entityFaqBodyHtml +
      entityNav +
      `</div>`
    );
  // When a pre-generated branded OG image URL is provided use fixed 1200×630
  // dimensions (no need to probe the URL with a Range request).
  const effectiveImageWidth = ogImageUrl ? 1200 : imageDimensions?.width;
  const effectiveImageHeight = ogImageUrl ? 630 : imageDimensions?.height;
  return {
    ...buildEntityHead({
      ogType: "website",
      title,
      description,
      imageUrl,
      imageAlt: rawName || altText,
      imageWidth: effectiveImageWidth,
      imageHeight: effectiveImageHeight,
      basePath,
      origin,
      pathname,
      search,
      lang,
      country,
      robots,
      extraLines,
      // Curated pages carry genuinely unique city-specific content
      // (hand-written H1, intro, sections, FAQs) so their canonical should
      // point at themselves, not at the hub city. Non-curated category pages
      // at non-hub cities keep remapCityToHub:true so ranking signals
      // consolidate on the hub-city canonical as before.
       remapCityToHub,
    }),
    bodyHtml,
  };
}

/**
 * Mark a collection page as ineligible for indexing by injecting (or replacing)
 * its robots meta with "noindex, follow".
 *
 * The canonical must remain in the HTML. A noindex directive controls indexing;
 * the canonical still tells crawlers which duplicate URL owns consolidation
 * signals. It is also the in-document counterpart to serve.mjs's HTTP Link
 * header, which is insufficient for crawlers that only inspect HTML.
 *
 * @param {{ headSnippet: string, [key: string]: any }} result
 * @returns {{ headSnippet: string, [key: string]: any }}
 */
function applyEligibilityNoindex(result) {
  let snippet = result.headSnippet ?? "";
  // Replace existing robots meta if present, otherwise inject one.
  const robotsTag = `<meta name="robots" content="noindex, follow" />`;
  if (/<meta\s+name="robots"/.test(snippet)) {
    snippet = snippet.replace(
      /<meta\s+name="robots"\s+content="[^"]*"\s*\/>/,
      robotsTag,
    );
  } else {
    snippet = robotsTag + "\n    " + snippet;
  }
  return { ...result, headSnippet: snippet };
}

/**
 * Async variant of injectSeoTags that, for `/product/<slug>`, `/brand/<slug>`,
 * `/shop?category=<slug>`, and `/shop?occasion=<slug>` routes, fetches the
 * matching record from the API and emits entity-specific OG/Twitter Card
 * meta so shared links show a rich preview. Falls back to the generic
 * locale-aware injector on any failure.
 */
export async function injectSeoTagsAsync(html, pathname, opts = {}) {
  const {
    apiBaseUrl,
    search,
    hintLang,
    acceptLanguage,
    firstBannerImageUrl,
    paginationRef,
    lifecycleOut,
    telemetry,
    ...rest
  } = opts;
  // Pre-warm the per-country available-category cache BEFORE building the
  // head/body so the shop route's crawler-facing "Shop by Category" list can
  // be filtered synchronously to categories with real inventory in this
  // country (no-op for non-locale paths and warm caches).
  const parsedEarly = parseLocalePath(pathname);
  if (
    parsedEarly.hasLocalePrefix &&
    parsedEarly.country &&
    apiBaseUrl &&
    // Only the shop route consumes the category list — don't add fetch
    // latency to every locale-prefixed page.
    /^\/shop(?:\/|$)?/.test(parsedEarly.rest ?? "")
  ) {
    await ensureShopCategoriesForSeo(parsedEarly.country, apiBaseUrl);
  }
  // Pass search so buildSeoHead can emit noindex meta for filter-parameterised
  // URLs and preserve curated filter page canonicals.
  const generic = buildSeoHead(pathname, { ...rest, search: search || "" });
  const parsed = parsedEarly;
  const paginationMatch = parsed?.rest?.match?.(PAGINATION_SUFFIX_RE);
  const paginationPage = paginationMatch ? parseInt(paginationMatch[2], 10) : null;
  let paginationListingCount = 0;
  let paginationListingItems = [];

  // For homepage routes, append a <link rel="preload"> for the first banner
  // image so the browser preload scanner can discover and fetch the LCP image
  // before the JS bundle executes. Skipped gracefully when the cache is cold.
  //
  // When the banner is an OS storage image (hostname os.presentail.com,
  // path /api/storage/…) we build a responsive preload with imagesrcset at
  // 400/800/1200 w via the /api/img/proxy endpoint — identical to what
  // HeroBannerSlide renders — so the browser reuses the preloaded bytes
  // instead of issuing a second fetch. For non-OS URLs (Unsplash, etc.) we
  // fall back to a plain href preload (still better than nothing).
  if (firstBannerImageUrl) {
    const isHomepage =
      (!parsed.hasLocalePrefix && (pathname === "/" || pathname === "")) ||
      (parsed.hasLocalePrefix && (parsed.rest === "" || parsed.rest === "/"));
    if (isHomepage) {
      const isOsStorage = buildTrustedOsImageProxyUrl(firstBannerImageUrl, 800) !== null;
      // Only emit the LCP preload for trusted OS storage image URLs.  Third-party
      // or unknown image domains (e.g. Unsplash CDN) are excluded: injecting an
      // arbitrary external URL as a preload hint exposes server-side SSRF risk via
      // the preload scanner, and the /api/img/proxy endpoint must not be used as a
      // general-purpose SSRF vector.  Non-trusted URLs degrade gracefully — the
      // banner image is still shown by React; it just lacks the preload hint.
      if (isOsStorage) {
        const widths = [400, 800, 1200];
        const srcset = widths
          .map((w) => `${buildTrustedOsImageProxyUrl(firstBannerImageUrl, w)} ${w}w`)
          .join(", ");
        const sizes = "(max-width: 1280px) 100vw, 1280px";
        const href = buildTrustedOsImageProxyUrl(firstBannerImageUrl, 800);
        const preloadTag =
          `<link rel="preload" as="image" fetchpriority="high"` +
          ` href="${escapeAttr(href)}"` +
          ` imagesrcset="${escapeAttr(srcset)}"` +
          ` imagesizes="${escapeAttr(sizes)}">`;
        generic.headSnippet += `\n    ${preloadTag}`;
      }
    }
  }
  if (!apiBaseUrl) {
    return assembleHtml(html, generic);
  }
  if (!parsed.hasLocalePrefix) {
    // Handle shared wishlist links: /favorites/share/:token
    const shareToken = extractShareToken(pathname);
    if (shareToken) {
      // Resolve language for the preview: explicit hint → ?lang= query param →
      // Accept-Language header → English fallback. This ensures Arabic and
      // French visitors see a localised social preview even though the wishlist
      // share path (/favorites/share/:token) carries no locale prefix.
      const langFromQuery = (() => {
        if (!search) return null;
        const s = search.startsWith("?") ? search.slice(1) : search;
        const v = new URLSearchParams(s).get("lang")?.trim().toLowerCase();
        return v && SUPPORTED_LANGS.includes(v) ? v : null;
      })();
      const wishlistLang =
        hintLang ??
        langFromQuery ??
        pickLangFromAcceptLanguage(acceptLanguage) ??
        "en";

      const cacheKey = entityCacheKey({ kind: "wishlist", slug: shareToken, lang: wishlistLang, countryCode: "", cityId: "" });
      let wishlistResult = getCachedEntity(cacheKey);
      if (!wishlistResult) {
        const favorites = await fetchSharedFavoritesForSeo({ token: shareToken, apiBaseUrl });
        if (favorites) {
          const count = favorites.length;
          let imageUrl = null;
          const productOut = {};
          if (count > 0 && favorites[0]?.productSlug) {
            const countryCode = favorites[0].countryCode ?? "LB";
            const product = await fetchEntityForSeoCached(
              "product",
              fetchProductForSeo,
              {
                slug: favorites[0].productSlug,
                lang: wishlistLang,
                countryCode,
                cityId: `${countryCode.toLowerCase()}-beirut`,
                apiBaseUrl,
              },
              productOut,
            );
            if (product) {
              imageUrl =
                (product.image && typeof product.image.uri === "string" && product.image.uri) ||
                (Array.isArray(product.images) &&
                  product.images.find((i) => i && typeof i.uri === "string" && i.uri)?.uri) ||
                null;
            }
          }
          // Store minimal item data (slug + country) for bodyHtml link
          // generation, capped at 20 so the cached entry stays small.
          const cachedItems = favorites.slice(0, 20).map((f) => ({
            productSlug: f.productSlug ?? null,
            countryCode: f.countryCode ?? null,
          }));
          wishlistResult = { count, imageUrl, items: cachedItems };
          // Evict image-dims only when the hero product was freshly fetched
          // (200 response). When the product came back 304 (unchanged), its
          // image URL has not changed so the cached dimensions remain accurate
          // — no need to waste a CDN Range-request re-measuring them.
          if (productOut.freshlyFetched) evictImageDims(imageUrl);
          setCachedEntity(cacheKey, wishlistResult);
        }
      }
      if (wishlistResult) {
        const wishlistImageDims = await fetchImageDimensions(wishlistResult.imageUrl);
        const result = buildWishlistHead({
          count: wishlistResult.count,
          imageUrl: wishlistResult.imageUrl,
          imageWidth: wishlistImageDims?.width,
          imageHeight: wishlistImageDims?.height,
          basePath: rest.basePath ?? "",
          origin: rest.origin ?? "",
          pathname,
          lang: wishlistLang,
        });
        const wishlistBodyHtml = buildWishlistBodyHtml({
          count: wishlistResult.count,
          items: wishlistResult.items ?? [],
          title: result.title,
          origin: rest.origin ?? "",
          basePath: rest.basePath ?? "",
        });
        return assembleHtml(html, {
          lang: wishlistLang,
          dir: wishlistLang === "ar" ? "rtl" : "ltr",
          headSnippet: result.headSnippet,
          titleTag: `<title>${escapeHtml(result.title)}</title>`,
          bodyHtml: wishlistBodyHtml,
        });
      }
    }

    // Fallback: handle bare /product/<slug> paths (e.g. links shared before
    // the locale-prefix fix, or external integrations, or mobile app shares).
    // Resolve the language from ?lang=, Accept-Language, or hintLang so that
    // Arabic and French social previews work the same as the wishlist path.
    const bareProductSlug = extractProductSlug(pathname);
    if (bareProductSlug) {
      const bareProductLangFromQuery = (() => {
        if (!search) return null;
        const s = search.startsWith("?") ? search.slice(1) : search;
        const v = new URLSearchParams(s).get("lang")?.trim().toLowerCase();
        return v && SUPPORTED_LANGS.includes(v) ? v : null;
      })();
      const bareProductLang =
        hintLang ??
        bareProductLangFromQuery ??
        pickLangFromAcceptLanguage(acceptLanguage) ??
        "en";
      const product = await fetchEntityForSeoCached(
        "product",
        fetchProductForSeo,
        {
          slug: bareProductSlug,
          lang: bareProductLang,
          countryCode: "LB",
          cityId: "lb-beirut",
          apiBaseUrl,
        },
      );
      if (product) {
        const bareProductState = getProductAvailabilityState(product);
        // DISCONTINUED products are handled by serve.mjs (301 or 410); return
        // generic head here so the HTML body stays neutral.
        if (bareProductState === PRODUCT_AVAILABILITY_STATE.DISCONTINUED) {
          if (lifecycleOut) {
            lifecycleOut.productSlug = bareProductSlug;
            lifecycleOut.productFound = true;
            lifecycleOut.productState = bareProductState;
          }
          return assembleHtml(html, generic);
        }
        if (lifecycleOut) {
          lifecycleOut.productSlug = bareProductSlug;
          lifecycleOut.productFound = true;
          lifecycleOut.productState = bareProductState;
        }
        const barePublicOrigin = (rest.origin ?? "").replace(/\/$/, "");
        const bareProductOgImageUrl = barePublicOrigin
          ? `${barePublicOrigin}/api/og-image/product/${encodeURIComponent(bareProductSlug)}`
          : null;
        const bareImageDims = bareProductOgImageUrl
          ? null
          : await fetchImageDimensions(
              (product.image && typeof product.image.uri === "string" && product.image.uri) ||
              (Array.isArray(product.images) &&
                product.images.find((i) => i && typeof i.uri === "string" && i.uri)?.uri) ||
              null,
            );
        const result = buildProductHead({
          product,
          availabilityState: bareProductState,
          imageDimensions: bareImageDims,
          ogImageUrl: bareProductOgImageUrl,
          lang: bareProductLang,
          basePath: rest.basePath ?? "",
          origin: rest.origin ?? "",
          pathname,
        });
        return assembleHtml(html, {
          lang: bareProductLang,
          dir: bareProductLang === "ar" ? "rtl" : "ltr",
          headSnippet: result.headSnippet,
          titleTag: `<title>${escapeHtml(result.title)}</title>`,
          bodyHtml: result.bodyHtml ?? null,
        });
      }
    }

    // Canonical lang-only blog paths: /{lang}/blog and /{lang}/blog/:slug.
    // These are the authoritative URLs for all blog content after the blog
    // canonical refactor (serve.mjs § 7c 301-redirects city-prefixed variants
    // here). The lang prefix routes language-specific content; no city needed
    // since articles are city-independent.
    const langOnlyBlogMatch = pathname.match(/^\/([a-z]{2})\/(blog(?:\/[^/?#]*)?)$/);
    if (langOnlyBlogMatch && SUPPORTED_LANGS.includes(langOnlyBlogMatch[1])) {
      const blogLang = langOnlyBlogMatch[1];
      const blogPath = `/${langOnlyBlogMatch[2]}`; // "/blog" or "/blog/slug"
      const blogSlugMatch = blogPath.match(/^\/blog\/([^/?#]+)$/);
      if (blogSlugMatch) {
        // /{lang}/blog/:slug — blog article page
        const slug = decodeURIComponent(blogSlugMatch[1]);
        const articlesByLang = BLOG_POSTS[slug];
        const article = articlesByLang?.[blogLang] ?? articlesByLang?.en;
        if (article) {
          // When this locale has no dedicated translation the article falls back
          // to English content.  Emit noindex,follow at the SSR level so crawlers
          // (which may not execute JS) see the directive.  Detects both the
          // undefined-key pattern and the get-accessor alias pattern
          // (get ar() { return this.en }).
          const isBlogFallback =
            blogLang !== "en" &&
            (articlesByLang?.[blogLang] === undefined ||
              articlesByLang?.[blogLang] === articlesByLang?.en);
          const result = buildBlogPostHead({
            article,
            lang: blogLang,
            basePath: rest.basePath ?? "",
            origin: rest.origin ?? "",
            pathname,
          });
          const headSnippet = isBlogFallback
            ? `<meta name="robots" content="noindex,follow" />\n    ${result.headSnippet}`
            : result.headSnippet;
          return assembleHtml(html, {
            lang: blogLang,
            dir: blogLang === "ar" ? "rtl" : "ltr",
            headSnippet,
            titleTag: `<title>${escapeHtml(result.title)}</title>`,
            bodyHtml: result.bodyHtml ?? null,
          });
        }
      } else if (blogPath === "/blog") {
        // /{lang}/blog — blog index page
        const cleanBase = (rest.basePath ?? "").replace(/\/$/, "");
        const siteOrigin = (rest.origin ?? "").replace(/\/$/, "");
        const blogIndexHref = `${siteOrigin}${cleanBase}/${blogLang}/blog`;
        const blogLocaleBase = `${siteOrigin}${cleanBase}/${blogLang}`;
        const blogSeo = buildStaticSeo({ lang: blogLang, routeKey: "blog" });
        const blogBodyHtml =
          `<h1>${escapeHtml(blogSeo.h1)}</h1><p>${escapeHtml(blogSeo.description)}</p>` +
          buildBlogIndexBodyHtml(blogLang, { localeBase: blogLocaleBase });
        const ogImage = `${siteOrigin}${cleanBase}/opengraph.jpg?v=2`;
        const alternateHref = (alternateLang) =>
          `${siteOrigin}${cleanBase}/${alternateLang}/blog`;
        const indexLines = [
          `<meta name="description" content="${escapeAttr(blogSeo.description)}" />`,
          `<link rel="canonical" href="${escapeAttr(blogIndexHref)}" />`,
          ...["en", "ar", "fr"].map((alternateLang) =>
            `<link rel="alternate" hreflang="${alternateLang}" href="${escapeAttr(alternateHref(alternateLang))}" />`),
          `<link rel="alternate" hreflang="x-default" href="${escapeAttr(alternateHref("en"))}" />`,
          `<meta property="og:title" content="${escapeAttr(blogSeo.ogTitle)}" />`,
          `<meta property="og:description" content="${escapeAttr(blogSeo.ogDescription)}" />`,
          `<meta property="og:type" content="website" />`,
          `<meta property="og:site_name" content="Presentail" />`,
          `<meta property="og:locale" content="${escapeAttr(OG_LOCALE[blogLang] || "en_US")}" />`,
          `<meta property="og:url" content="${escapeAttr(blogIndexHref)}" />`,
          `<meta property="og:image" content="${escapeAttr(ogImage)}" />`,
          `<meta property="og:image:secure_url" content="${escapeAttr(ogImage)}" />`,
          `<meta property="og:image:type" content="image/jpeg" />`,
          `<meta property="og:image:width" content="1200" />`,
          `<meta property="og:image:height" content="630" />`,
          `<meta name="twitter:card" content="summary_large_image" />`,
          `<meta name="twitter:site" content="@presentail" />`,
          `<meta name="twitter:title" content="${escapeAttr(blogSeo.twitterTitle)}" />`,
          `<meta name="twitter:description" content="${escapeAttr(blogSeo.twitterDescription)}" />`,
          `<meta name="twitter:image" content="${escapeAttr(ogImage)}" />`,
          jsonLdTag(buildOrganizationSchema(`${siteOrigin}${cleanBase}`)),
        ];
        return assembleHtml(html, {
          lang: blogLang,
          dir: blogLang === "ar" ? "rtl" : "ltr",
          headSnippet: indexLines.join("\n    "),
          titleTag: `<title>${escapeHtml(blogSeo.title)}</title>`,
          bodyHtml: blogBodyHtml,
        });
      }
    }

    // Fallback: handle bare /blog/<slug> paths (links shared before the
    // locale-prefix fix, or external integrations). Language resolves the same
    // way as the bare product path above.
    const bareBlogSlug = extractBlogPostSlug(pathname);
    if (bareBlogSlug) {
      const articlesByLang = BLOG_POSTS[bareBlogSlug];
      if (articlesByLang) {
        const bareBlogLangFromQuery = (() => {
          if (!search) return null;
          const s = search.startsWith("?") ? search.slice(1) : search;
          const v = new URLSearchParams(s).get("lang")?.trim().toLowerCase();
          return v && SUPPORTED_LANGS.includes(v) ? v : null;
        })();
        const bareBlogLang =
          hintLang ??
          bareBlogLangFromQuery ??
          pickLangFromAcceptLanguage(acceptLanguage) ??
          "en";
        const article = articlesByLang[bareBlogLang] ?? articlesByLang.en;
        if (article) {
          const isBlogFallback =
            bareBlogLang !== "en" &&
            (articlesByLang?.[bareBlogLang] === undefined ||
              articlesByLang?.[bareBlogLang] === articlesByLang?.en);
          const result = buildBlogPostHead({
            article,
            lang: bareBlogLang,
            basePath: rest.basePath ?? "",
            origin: rest.origin ?? "",
            pathname,
          });
          const headSnippet = isBlogFallback
            ? `<meta name="robots" content="noindex,follow" />\n    ${result.headSnippet}`
            : result.headSnippet;
          return assembleHtml(html, {
            lang: bareBlogLang,
            dir: bareBlogLang === "ar" ? "rtl" : "ltr",
            headSnippet,
            titleTag: `<title>${escapeHtml(result.title)}</title>`,
            bodyHtml: result.bodyHtml ?? null,
          });
        }
      }
    }
    // For the root landing page (/), inject crawlable country hub-city anchor
    // links into the initial HTML.  The React country-picker renders real
    // <a href> elements client-side, but non-rendering crawlers only see the
    // server-injected content.  These sr-only links give search engines a
    // route into each country's catalogue without needing to execute JS.
    const _isRootLanding =
      !parsed.hasLocalePrefix && (pathname === "/" || pathname === "");
    if (_isRootLanding) {
      const _landingBase = (rest.basePath ?? "").replace(/\/$/, "");
      const _landingNavHtml =
        `<nav aria-label="Delivery countries" class="sr-only">` + // i18n-ignore — crawler-facing static nav; not rendered in the client UI
        `<a href="${_landingBase}/en-lb/beirut">Lebanon \u2014 Flower &amp; Gift Delivery</a>` + // i18n-ignore — static EN-only SEO anchor text
        `<a href="${_landingBase}/en-ae/dubai">UAE \u2014 Flower &amp; Gift Delivery</a>` + // i18n-ignore — static EN-only SEO anchor text
        `<a href="${_landingBase}/en-cy/nicosia">Cyprus \u2014 Flower &amp; Gift Delivery</a>` + // i18n-ignore — static EN-only SEO anchor text
        `</nav>`;
      // Prepend the generic H1 + description block (from buildGenericBodyHtml) so
      // crawlers landing on the bare root URL see an sr-only H1 and description,
      // not just the hub-country nav.  The nav follows the content block.
      const _landingBodyHtml = (generic.bodyHtml ?? "") + _landingNavHtml;
      return assembleHtml(html, { ...generic, bodyHtml: _landingBodyHtml });
    }
    return assembleHtml(html, generic);
  }

  const productSlug = extractProductSlug(parsed.rest);
  const brandSlug = extractBrandSlug(parsed.rest);
  // Path-based slugs (new clean URLs)
  const categorySlugFromPath = extractSlugFor("/category", parsed.rest);
  const occasionSlugFromPath = extractSlugFor("/occasion", parsed.rest);
  // Recipient pages are not yet implemented in the router but we detect the
  // slug here so the eligibility noindex path is in place when they land.
  const recipientSlug = extractSlugFor("/recipient", parsed.rest);
  // Query-param slugs (legacy URLs — kept for backward compatibility)
  const categorySlugFromSearch = parsed.rest === "/shop" ? extractCategorySlugFromSearch(search) : null;
  const occasionSlugFromSearch =
    parsed.rest === "/shop" && !categorySlugFromSearch
      ? extractOccasionSlugFromSearch(search)
      : null;
  const categorySlug = categorySlugFromPath ?? categorySlugFromSearch;
  const occasionSlug = occasionSlugFromPath ?? occasionSlugFromSearch;
  const brandsFilter =
    parsed.rest === "/brands" ? extractBrandsFilterFromSearch(search) : null;

  // Individual blog posts resolve from the shared BLOG_POSTS source of truth
  // (no upstream fetch needed) so the preview head always matches the article.
  // Unknown slugs fall through to the generic head, matching the SPA's redirect
  // of unknown blog slugs back to /blog.
  const blogPostSlug = extractBlogPostSlug(parsed.rest);
  if (blogPostSlug) {
    const articlesByLang = BLOG_POSTS[blogPostSlug];
    const article = articlesByLang?.[generic.lang] ?? articlesByLang?.en;
    if (article) {
      const isBlogFallback =
        generic.lang !== "en" &&
        (articlesByLang?.[generic.lang] === undefined ||
          articlesByLang?.[generic.lang] === articlesByLang?.en);
      const result = buildBlogPostHead({
        article,
        lang: generic.lang,
        country: parsed.country,
        basePath: rest.basePath ?? "",
        origin: rest.origin ?? "",
        pathname,
      });
      const headSnippet = isBlogFallback
        ? `<meta name="robots" content="noindex,follow" />\n    ${result.headSnippet}`
        : result.headSnippet;
      return assembleHtml(html, {
        lang: generic.lang,
        dir: generic.dir,
        headSnippet,
        titleTag: `<title>${escapeHtml(result.title)}</title>`,
        bodyHtml: result.bodyHtml ?? null,
      });
    }
  }
  // For legacy query-param paths, compute the canonical clean path so search
  // engines are guided to the new URLs even before they follow the client-side redirect.
  const seoPathname =
    categorySlugFromSearch
      ? pathname.replace(/\/shop$/, `/category/${encodeURIComponent(categorySlugFromSearch)}`)
      : occasionSlugFromSearch
        ? pathname.replace(/\/shop$/, `/occasion/${encodeURIComponent(occasionSlugFromSearch)}`)
        : pathname;
  const seoSearch = categorySlugFromSearch || occasionSlugFromSearch ? "" : search;

  if (
    !productSlug &&
    !brandSlug &&
    !categorySlug &&
    !occasionSlug &&
    !brandsFilter
  ) {
    // Server-rendered product grid for SSR-enabled city home pages
    // (currently Tripoli only — see SSR_PRODUCT_CITY_KEYS). Fetch live
    // Tripoli-eligible products, splice a crawlable card grid into the body
    // (replacing the SSR_PRODUCTS_SLOT marker emitted by buildGenericBodyHtml
    // just after the hero copy, before coverage copy / city history / FAQ),
    // and add an ItemList JSON-LD plus an LCP preload for the first image.
    // Every failure path degrades to the plain city home — never blocks.
    const isCityHomeRest = parsed.rest === "" || parsed.rest === "/";
    const ssrCityKey =
      parsed.hasLocalePrefix && parsed.country && parsed.city && isCityHomeRest
        ? `${parsed.country}-${parsed.city}`
        : null;
    if (ssrCityKey && SSR_PRODUCT_CITY_KEYS.has(ssrCityKey)) {
      const ssrProducts = await fetchCityProducts(
        apiBaseUrl,
        parsed.country.toUpperCase(),
        ssrCityKey,
        generic.lang,
      );
      if (ssrProducts.length > 0) {
        const cleanBase = (rest.basePath ?? "").replace(/\/$/, "");
        const siteOrigin = (rest.origin ?? "").replace(/\/$/, "");
        const relLocaleBase = `${cleanBase}/${parsed.lang}-${parsed.country}/${parsed.city}`;
        const gridHtml = buildProductGridHtml(ssrProducts, relLocaleBase, {
          cityLabel: generic.cityLabel,
          lang: generic.lang,
        });
        const bodyHtml = (generic.bodyHtml ?? "").includes(SSR_PRODUCTS_SLOT)
          ? generic.bodyHtml.replace(SSR_PRODUCTS_SLOT, gridHtml)
          : (generic.bodyHtml ?? "") + gridHtml;
        let headSnippet =
          generic.headSnippet +
          `\n    ${jsonLdTag(
            buildCityProductsItemListSchema(
              ssrProducts,
              `${siteOrigin}${relLocaleBase}`,
            ),
          )}`;
        // Preload the first (eager / LCP-candidate) product image so the
        // browser preload scanner fetches it before the JS bundle executes.
        headSnippet += `\n    <link rel="preload" as="image" fetchpriority="high" href="${escapeAttr(ssrProducts[0].imageUrl)}">`;
        return assembleHtml(html, { ...generic, headSnippet, bodyHtml });
      }
    }
    return assembleHtml(html, generic);
  }

  const countryCode = parsed.country ? parsed.country.toUpperCase() : undefined;
  const cityId = parsed.city
    ? parsed.city.startsWith(`${parsed.country}-`)
      ? parsed.city
      : `${parsed.country}-${parsed.city}`
    : undefined;
  const fetchOpts = {
    lang: generic.lang,
    countryCode,
    cityId,
    apiBaseUrl,
    telemetry,
  };
  const headOpts = {
    lang: generic.lang,
    basePath: rest.basePath ?? "",
    origin: rest.origin ?? "",
    pathname: seoPathname,
    cityLabel: generic.cityLabel,
    countryLabel: generic.countryLabel,
    countryCode,
    country: parsed.country,
    city: parsed.city,
  };

  // Base public origin used to build OG image API URLs. The og:image tag must
  // contain an absolute URL accessible to crawlers (WhatsApp, iMessage, Slack,
  // etc.), so we use the request origin (e.g. https://presentail.com) plus the
  // /api/og-image/* path that the reverse proxy routes to the API server.
  // Vite development requests can enter this injector without an `origin`
  // field. Prefer the configured HTTPS preview domain in that case so product
  // crawlers still receive the branded absolute card URL rather than a raw OS
  // source image. In production the request/deployment origin remains first.
  const publicOrigin = (
    rest.origin ||
    (process.env.NODE_ENV === "development" && process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : "")
  ).replace(/\/$/, "");

  let result = null;
  if (productSlug) {
    // Capture the definitelyNotFound signal so we can distinguish a genuine
    // HTTP 404 (product absent) from a transient error (503, timeout, network)
    // before writing to lifecycleOut.  Only a confirmed 404 should yield
    // productFound = false; a network error must degrade gracefully to 200.
    const fetchOut = {};
    const product = await fetchEntityForSeoCached("product", fetchProductForSeo, {
      slug: productSlug,
      ...fetchOpts,
    }, fetchOut);
    if (product) {
      const productState = getProductAvailabilityState(product);
      // Write lifecycle info for serve.mjs to act on (301/410 decisions).
      if (lifecycleOut) {
        lifecycleOut.productSlug = productSlug;
        lifecycleOut.productFound = true;
        lifecycleOut.productState = productState;
      }
      // DISCONTINUED products are handled by serve.mjs (301 or 410 depending on
      // the redirect map); return a neutral generic head here so the HTML body
      // is consistent regardless of HTTP status.
      if (productState === PRODUCT_AVAILABILITY_STATE.DISCONTINUED) {
        return assembleHtml(html, generic);
      }
      // SOLD_OUT_TEMPORARILY and SEASONAL_UNAVAILABLE: render the rich product
      // head with OutOfStock availability so the page stays indexed and social
      // previews remain useful. The title suffix " – Coming Soon" is added by
      // buildProductHead for these states.
      // Design decision: use the branded OG image URL unconditionally when
      // publicOrigin is available, without probing the endpoint first.
      //
      // Rationale — why no runtime probe / CDN fallback in og:image:
      //   1. Latency: probing would add an extra HTTP round-trip to every
      //      product-page SSR render just to confirm what we already expect to
      //      be true in the steady state.
      //   2. False assurance: even a successful probe at render time cannot
      //      guarantee the endpoint is still up minutes later when WhatsApp /
      //      Slack / iMessage fetches the page. The probe would only help when
      //      the service is persistently down, not for transient failures.
      //   3. Co-deployment: the OG image API (/api/og-image/*) is served by
      //      the same Express process as the rest of /api. If that service is
      //      unreachable, the overall app is down and product pages themselves
      //      will not render successfully — so the share card image URL is the
      //      least of our worries.
      //
      // rawProductImageUrl (the CDN photo) is intentionally JSON-LD-only: it
      // provides the actual product photo in Product structured data, which
      // crawlers expect to be the real item image, not a social card composite.
      // Using the CDN URL as an og:image fallback would silently degrade social
      // previews to a plain crop rather than the branded 1200×630 card, so we
      // prefer the branded URL or nothing.
      //
      // If publicOrigin is empty (e.g. in unit tests with no proxy), fall back
      // to probing the raw product image URL for dimensions.
      const socialShareVersion =
        typeof product.socialShareVersion === "string" &&
        /^[a-f0-9]{8,64}$/i.test(product.socialShareVersion)
          ? product.socialShareVersion
          : "ivory-v1";
      const socialStore =
        parsed.country === "cy"
          ? "cyprus"
          : parsed.country === "ae" && parsed.city === "abudhabi"
            ? "abudhabi"
            : parsed.country === "ae"
              ? "dubai"
              : "lebanon";
      const productOgImageUrl = publicOrigin
        ? `${publicOrigin}/api/og-image/product/${encodeURIComponent(productSlug)}?v=${encodeURIComponent(socialShareVersion)}&store=${socialStore}`
        : null;
      const productImageDims = productOgImageUrl
        ? null // dimensions are always 1200×630 — no probe needed
        : await fetchImageDimensions(
            (product.image && typeof product.image.uri === "string" && product.image.uri) ||
            (Array.isArray(product.images) &&
              product.images.find((i) => i && typeof i.uri === "string" && i.uri)?.uri) ||
            null,
          );
      result = buildProductHead({
        product,
        availabilityState: productState,
        imageDimensions: productImageDims,
        ogImageUrl: productOgImageUrl,
        ...headOpts,
      });
      // Emit the intra-city hreflang cluster only when this page IS the hub
      // city for its country. Entity pages at satellite cities already point
      // their canonical at the hub city (remapCityToHub); if they also emit
      // hreflang alternates, every satellite URL simultaneously claims to be
      // a language alternate of the same handful of Beirut/Dubai/Nicosia URLs
      // without any of those satellite URLs appearing in the hub city's own
      // cluster — exactly the "no self-referencing hreflang" / "conflicting
      // hreflang" pattern Semrush flags at scale. Canonical alone is the
      // correct and sufficient signal for duplicate consolidation; hreflang is
      // for the canonical set only.
      // Honesty guard: when an ar/fr page is actually serving the English
      // fallback (upstream translation failed — product.__contentLang === "en"),
      // emitting hreflang would falsely declare this URL as the ar/fr language
      // alternate while crawlers detect English content — exactly the
      // "hreflang/content language mismatch" Semrush flags. Suppress the
      // cluster for this response; the fallback is uncached upstream, so the
      // next crawl retries translation and gets the cluster back.
      const _translationFellBack =
        (generic.lang === "ar" || generic.lang === "fr") &&
        product.__contentLang === "en";
      if (parsed.city === HUB_CITY[parsed.country] && !_translationFellBack) {
        const _prodHreflangSet = buildHreflangSet(
          `product/${encodeURIComponent(productSlug)}`,
          { country: parsed.country, city: HUB_CITY[parsed.country] },
          (rest.origin ?? "") + (rest.basePath ?? "").replace(/\/$/, ""),
        );
        if (_prodHreflangSet.length > 0) {
          const _prodHreflangLines = _prodHreflangSet
            .map(({ hreflang, href }) =>
              `<link rel="alternate" hreflang="${escapeAttr(hreflang)}" href="${escapeAttr(href)}" />`,
            )
            .join("\n    ");
          result = { ...result, headSnippet: result.headSnippet + "\n    " + _prodHreflangLines };
        }
      }

      // Satellite-city product pages: noindex,follow.  Canonical already points
      // at the hub city via remapCityToHub; explicit noindex makes the policy
      // consistent with satellite occasion/category pages and eliminates Semrush
      // "only one internal link" flags for products reachable only through a
      // satellite-city best-sellers page.  Hub-city product pages are unaffected.
      if (parsed.city && parsed.country && parsed.city !== HUB_CITY[parsed.country]) {
        result = applyEligibilityNoindex(result);
      }

      // Inject a <link rel="preload" as="image" fetchpriority="high"> for the
      // primary product image so the preload scanner can fetch it before the JS
      // bundle executes — improving LCP on product detail pages.
      //
      // Only emitted for OS storage images (os.presentail.com/api/storage/…)
      // to prevent injecting arbitrary external URLs as preload hints (SSRF
      // risk via the /api/img/proxy endpoint). The responsive preload uses the
      // same srcset widths and sizes as the ProductDetail gallery component so
      // the browser reuses the preloaded bytes and does not issue a second fetch.
      const _prodImageUri =
        (product.image && typeof product.image.uri === "string" && product.image.uri) ||
        (Array.isArray(product.images) &&
          product.images.find((i) => i && typeof i.uri === "string" && i.uri)?.uri) ||
        null;
      if (_prodImageUri) {
        const _isProdOsStorage = buildTrustedOsImageProxyUrl(_prodImageUri, 800) !== null;
        if (_isProdOsStorage) {
          const _pdpWidths = [400, 800, 1200];
          const _pdpSrcset = _pdpWidths
            .map((w) => `${buildTrustedOsImageProxyUrl(_prodImageUri, w)} ${w}w`)
            .join(", ");
          const _pdpSizes = "(max-width: 1280px) 100vw, 1280px";
          const _pdpHref = buildTrustedOsImageProxyUrl(_prodImageUri, 800);
          const _pdpPreloadTag =
            `<link rel="preload" as="image" fetchpriority="high"` +
            ` href="${escapeAttr(_pdpHref)}"` +
            ` imagesrcset="${escapeAttr(_pdpSrcset)}"` +
            ` imagesizes="${escapeAttr(_pdpSizes)}">`;
          result = { ...result, headSnippet: result.headSnippet + "\n    " + _pdpPreloadTag };
        }
      }
    } else {
      // Product not found in OS cache.
      // Only signal a definitive absence (triggering 410/301 in serve.mjs)
      // when the upstream API explicitly returned HTTP 404.  A transient error
      // — 503, network failure, timeout — yields null without
      // fetchOut.definitelyNotFound, so productFound is left unset and
      // resolveProductLifecycleResponse falls through to a graceful 200
      // instead of issuing a false-positive 410 during a catalog outage or
      // cold-cache miss.
      if (lifecycleOut && fetchOut.definitelyNotFound) {
        lifecycleOut.productSlug = productSlug;
        lifecycleOut.productFound = false;
        lifecycleOut.productState = null;
      }
    }
  } else if (brandSlug) {
    const _brandFetchOut = {};
    const brand = await fetchEntityForSeoCached("brand", fetchBrandForSeo, {
      slug: brandSlug,
      ...fetchOpts,
    }, _brandFetchOut);
    if (brand) {
      const brandImageUrl = typeof brand.image === "string" && brand.image ? brand.image : null;
      // Pre-generated branded OG image URL (1200×630 JPEG). When publicOrigin is
      // set the API always serves this URL — crawlers get a Presentail-branded
      // card rather than the raw brand photo. Dimensions are always 1200×630 so
      // no image-dimension probe is needed when this URL is available.
      const brandOgImageUrl = publicOrigin
        ? `${publicOrigin}/api/og-image/brand/${encodeURIComponent(brandSlug)}`
        : `/api/og-image/brand/${encodeURIComponent(brandSlug)}`;
      // Fetch city-specific count (productCount) and global count (parentProductCount)
      // in parallel. The global count omits cityId so it covers all cities for the
      // brand in this country — the ratio check requires both values.
      const { countryCode: brandCountryCode, apiBaseUrl: brandApiBaseUrl } = fetchOpts;
      const [brandImageDims, brandListing, brandParentListing] = await Promise.all([
        brandOgImageUrl
          ? Promise.resolve(null) // dimensions are always 1200×630 — no probe needed
          : fetchImageDimensions(brandImageUrl),
        fetchBrandProductCountForSeo({ slug: brandSlug, ...fetchOpts }),
        fetchBrandProductCountForSeo({
          slug: brandSlug,
          countryCode: brandCountryCode,
          apiBaseUrl: brandApiBaseUrl,
        }),
      ]);
      if (paginationPage !== null) {
        const maxPage = Math.ceil((brandListing?.count ?? 0) / PAGINATION_PAGE_SIZE);
        if (maxPage === 0 || paginationPage > maxPage) {
          if (paginationRef) paginationRef.outOfRange = true;
          return assembleHtml(html, {
            ...generic,
            headSnippet: generic.headSnippet + '\n    <meta name="robots" content="noindex" />',
          });
        }
      }
      paginationListingCount = brandListing?.count ?? 0;
      result = buildBrandHead({
        brand,
        imageDimensions: brandImageDims,
        ogImageUrl: brandOgImageUrl,
        productCount: brandListing?.count,
        brandProducts: brandListing?.products,
        ...headOpts,
      });
      // Hub-city guard: same rationale as the product hreflang block above —
      // only the hub city's entity pages should carry hreflang alternates.
      if (parsed.city === HUB_CITY[parsed.country]) {
        const _brandHreflangSet = buildHreflangSet(
          `brand/${encodeURIComponent(brandSlug)}`,
          { country: parsed.country, city: HUB_CITY[parsed.country] },
          (rest.origin ?? "") + (rest.basePath ?? "").replace(/\/$/, ""),
        );
        if (_brandHreflangSet.length > 0) {
          const _brandHreflangLines = _brandHreflangSet
            .map(({ hreflang, href }) =>
              `<link rel="alternate" hreflang="${escapeAttr(hreflang)}" href="${escapeAttr(href)}" />`,
            )
            .join("\n    ");
          result = { ...result, headSnippet: result.headSnippet + "\n    " + _brandHreflangLines };
        }
      }
      const brandParentCount = brandParentListing?.count ?? null;
      const brandEligibility = isPageEligible({
        pageType: "city-brand",
        country: parsed.country ?? undefined,
        city: parsed.city ?? undefined,
        brandSlug,
        productCount: brandListing?.count ?? null,
        parentProductCount: brandParentCount,
        parentEligible:
          brandParentCount !== null
            ? brandParentCount >= MIN_PRODUCTS_BY_TYPE["city-brand"]
            : null,
      });
      if (!brandEligibility.eligible) {
        result = applyEligibilityNoindex(result);
      }
    } else if (lifecycleOut && _brandFetchOut.definitelyNotFound) {
      lifecycleOut.entityNotFound = true;
    }
  } else if (categorySlug) {
    const _categoryFetchOut = {};
    const category = await fetchEntityForSeoCached(
      "category",
      fetchCategoryForSeo,
      { slug: categorySlug, ...fetchOpts },
      _categoryFetchOut,
    );
    if (category) {
      const catImageUrl = typeof category.image === "string" && category.image ? category.image : null;
      // Fetch city-specific listing (productCount) and country-wide listing
      // (parentProductCount, no cityId) in parallel so the ratio/identical-
      // inventory rules in isPageEligible can fire. catImageDims is also
      // kicked off in the same batch to avoid a sequential waterfall.
      const { countryCode: catCountryCode, lang: catLang, apiBaseUrl: catApiBaseUrl } = fetchOpts;
      const [catImageDims, listing, catParentListing] = await Promise.all([
        fetchImageDimensions(catImageUrl),
        fetchListingProductsForSeo({ kind: "category", slug: categorySlug, ...fetchOpts, page: paginationPage ?? 1 }),
        fetchListingProductsForSeo({
          kind: "category",
          slug: categorySlug,
          countryCode: catCountryCode,
          lang: catLang,
          apiBaseUrl: catApiBaseUrl,
        }),
      ]);
      if (paginationPage !== null) {
        const maxPage = Math.ceil((listing?.count ?? 0) / PAGINATION_PAGE_SIZE);
        if (maxPage === 0 || paginationPage > maxPage) {
          if (paginationRef) paginationRef.outOfRange = true;
          return assembleHtml(html, {
            ...generic,
            headSnippet: generic.headSnippet + '\n    <meta name="robots" content="noindex" />',
          });
        }
      }
      paginationListingCount = listing?.count ?? 0;
      paginationListingItems = listing?.items ?? [];
      // Canonical for category clean paths drops any query string.
      result = buildCategoryHead({
        category,
        imageDimensions: catImageDims,
        search: "",
        productCount: listing?.count,
        items: listing?.items ?? [],
        ...headOpts,
      });
      // Hub-city guard: same rationale as the product hreflang block above —
      // only the hub city's entity pages should carry hreflang alternates.
      if (parsed.city === HUB_CITY[parsed.country]) {
        const _catHreflangSet = buildHreflangSet(
          `category/${encodeURIComponent(categorySlug)}`,
          { country: parsed.country, city: HUB_CITY[parsed.country] },
          (rest.origin ?? "") + (rest.basePath ?? "").replace(/\/$/, ""),
        );
        if (_catHreflangSet.length > 0) {
          const _catHreflangLines = _catHreflangSet
            .map(({ hreflang, href }) =>
              `<link rel="alternate" hreflang="${escapeAttr(hreflang)}" href="${escapeAttr(href)}" />`,
            )
            .join("\n    ");
          result = { ...result, headSnippet: result.headSnippet + "\n    " + _catHreflangLines };
        }
      }
      const catParentCount = catParentListing?.count ?? null;
      const categoryEligibility = isPageEligible({
        pageType: "city-category",
        country: parsed.country ?? undefined,
        city: parsed.city ?? undefined,
        categorySlug,
        productCount: listing?.count ?? null,
        parentProductCount: catParentCount,
        parentEligible:
          catParentCount !== null
            ? catParentCount >= MIN_PRODUCTS_BY_TYPE["city-category"]
            : null,
      });
      // Curated category pages carry substantial unique on-page content
      // (hand-written intro, sections, FAQs), so the thin/duplicate-page
      // gate does not apply — keep them indexable regardless of product-count
      // ratios. Applies to all locales that have a curated entry.
      const hasCuratedCategoryContent = !!getCategorySeoContent({
        country: parsed.country,
        city: parsed.city,
        slug: categorySlug,
        lang: parsed.lang,
      });
      if (!categoryEligibility.eligible && !hasCuratedCategoryContent) {
        result = applyEligibilityNoindex(result);
      }
    } else if (lifecycleOut && _categoryFetchOut.definitelyNotFound) {
      lifecycleOut.entityNotFound = true;
    }
  } else if (occasionSlug) {
    const _occasionFetchOut = {};
    const occasion = await fetchEntityForSeoCached("occasion", fetchOccasionForSeo, {
      slug: occasionSlug,
      ...fetchOpts,
    }, _occasionFetchOut);
    if (occasion) {
      // Use the branded per-occasion OG image (generated on demand by the API
      // server) instead of the raw occasion photo.
      const occasionOgImageUrl = publicOrigin
        ? `${publicOrigin}/api/og-image/occasion/${encodeURIComponent(occasionSlug)}`
        : `/api/og-image/occasion/${encodeURIComponent(occasionSlug)}`;
      // Fetch city-specific listing (productCount) and country-wide listing
      // (parentProductCount, no cityId) in parallel so the ratio/identical-
      // inventory rules in isPageEligible can fire.
      const { countryCode: occCountryCode, lang: occLang, apiBaseUrl: occApiBaseUrl } = fetchOpts;
      const [occImageDims, listing, occParentListing] = await Promise.all([
        occasionOgImageUrl
          ? Promise.resolve(null) // dimensions are always 1200×630 — no probe needed
          : fetchImageDimensions(
              typeof occasion.image === "string" && occasion.image ? occasion.image : null,
            ),
        fetchListingProductsForSeo({ kind: "occasion", slug: occasionSlug, ...fetchOpts, page: paginationPage ?? 1 }),
        fetchListingProductsForSeo({
          kind: "occasion",
          slug: occasionSlug,
          countryCode: occCountryCode,
          lang: occLang,
          apiBaseUrl: occApiBaseUrl,
        }),
      ]);
      if (paginationPage !== null) {
        const maxPage = Math.ceil((listing?.count ?? 0) / PAGINATION_PAGE_SIZE);
        if (maxPage === 0 || paginationPage > maxPage) {
          if (paginationRef) paginationRef.outOfRange = true;
          return assembleHtml(html, {
            ...generic,
            headSnippet: generic.headSnippet + '\n    <meta name="robots" content="noindex" />',
          });
        }
      }
      paginationListingCount = listing?.count ?? 0;
      paginationListingItems = listing?.items ?? [];
      // Canonical for occasion clean paths drops any query string.
      result = buildOccasionHead({
        occasion,
        imageDimensions: occImageDims,
        ogImageUrl: occasionOgImageUrl,
        search: "",
        productCount: listing?.count,
        items: listing?.items ?? [],
        ...headOpts,
      });
      // Hub-city guard: same rationale as the product hreflang block above —
      // only the hub city's entity pages should carry hreflang alternates.
      if (parsed.city === HUB_CITY[parsed.country]) {
        const _occHreflangSet = buildHreflangSet(
          `occasion/${encodeURIComponent(occasionSlug)}`,
          { country: parsed.country, city: HUB_CITY[parsed.country] },
          (rest.origin ?? "") + (rest.basePath ?? "").replace(/\/$/, ""),
        );
        if (_occHreflangSet.length > 0) {
          const _occHreflangLines = _occHreflangSet
            .map(({ hreflang, href }) =>
              `<link rel="alternate" hreflang="${escapeAttr(hreflang)}" href="${escapeAttr(href)}" />`,
            )
            .join("\n    ");
          result = { ...result, headSnippet: result.headSnippet + "\n    " + _occHreflangLines };
        }
      }
      const occParentCount = occParentListing?.count ?? null;
      const occasionEligibility = isPageEligible({
        pageType: "city-occasion",
        country: parsed.country ?? undefined,
        city: parsed.city ?? undefined,
        occasionSlug,
        productCount: listing?.count ?? null,
        parentProductCount: occParentCount,
        parentEligible:
          occParentCount !== null
            ? occParentCount >= MIN_PRODUCTS_BY_TYPE["city-occasion"]
            : null,
      });
      // Curated occasion pages carry substantial unique on-page content
      // (hand-written intro, sections, FAQs), so the thin/duplicate-page
      // rationale behind the eligibility gate does not apply — keep them
      // indexable regardless of product-count ratios. Scoped to the locale
      // that actually renders curated copy (EN-only today): ar/fr variants
      // still show template content, so they keep the eligibility gate.
      const hasCuratedOccasionContent = !!getOccasionSeoContent({
        country: parsed.country,
        city: parsed.city,
        slug: occasionSlug,
        lang: parsed.lang,
      });
      if (!occasionEligibility.eligible && !hasCuratedOccasionContent) {
        result = applyEligibilityNoindex(result);
      }
    } else if (lifecycleOut && _occasionFetchOut.definitelyNotFound) {
      lifecycleOut.entityNotFound = true;
    }
  } else if (recipientSlug) {
    // Recipient city pages are not yet implemented (no route in App.tsx), so
    // this block will not execute at runtime until the route is added. It is
    // scaffolded here so the eligibility noindex is already in place the moment
    // recipient pages go live.
    //
    // productCount is null → fail-closed → noindex until a product-count fetch
    // is wired in (same pattern as the brand/category/occasion handlers above).
    const recipientEligibility = isPageEligible({
      pageType: "city-recipient",
      country: parsed.country ?? undefined,
      city: parsed.city ?? undefined,
      recipientSlug,
      productCount: null,
      parentProductCount: null,
      parentEligible: null,
    });
    if (!recipientEligibility.eligible) {
      result = applyEligibilityNoindex(result);
    }
  } else if (brandsFilter) {
    const fetcher =
      brandsFilter.kind === "category"
        ? fetchCategoryForSeo
        : fetchOccasionForSeo;
    const entity = await fetchEntityForSeoCached(
      brandsFilter.kind,
      fetcher,
      { slug: brandsFilter.slug, ...fetchOpts },
    );
    if (entity) {
      const bfImageUrl = typeof entity.image === "string" && entity.image ? entity.image : null;
      const bfImageDims = await fetchImageDimensions(bfImageUrl);
      result = buildBrandsFilterHead({
        entity,
        imageDimensions: bfImageDims,
        search,
        cityLabel: generic.cityLabel,
        countryLabel: generic.countryLabel,
        ...headOpts,
      });
    }
  }

  if (!result) {
    return assembleHtml(html, generic);
  }

  let finalHeadSnippet = result.headSnippet;
  let finalTitle = result.title;
  let finalBodyHtml = result.bodyHtml ?? null;

  const currentPage = paginationPage ?? 1;
  const paginationMaxPage =
    paginationListingCount > 0
      ? Math.ceil(paginationListingCount / PAGINATION_PAGE_SIZE)
      : 0;

  if (paginationMaxPage > 1 || paginationPage !== null) {
    const basePathname = pathname.replace(/\/page\/\d+\/?$/, "");
    const baseUrl = `${(rest.origin ?? "").replace(/\/$/, "")}${basePathname}`;

    if (currentPage > 1) {
      const prevHref =
        currentPage === 2 ? baseUrl : `${baseUrl}/page/${currentPage - 1}`;
      finalHeadSnippet += `\n    <link rel="prev" href="${escapeAttr(prevHref)}">`;
    }
    if (paginationMaxPage > 0 && currentPage < paginationMaxPage) {
      const nextHref = `${baseUrl}/page/${currentPage + 1}`;
      finalHeadSnippet += `\n    <link rel="next" href="${escapeAttr(nextHref)}">`;
    }

    if (paginationPage !== null && paginationPage >= 2) {
      const pageLabel =
        generic.lang === "ar"
          ? `\u0627\u0644\u0635\u0641\u062d\u0629 ${paginationPage}`
          : `Page ${paginationPage}`;
      finalTitle = finalTitle.replace(
        / \| Presentail$/,
        ` \u2013 ${pageLabel} | Presentail`,
      );
    }

    const noscriptItems = paginationListingItems.filter(
      (i) => i && i.slug && i.name,
    );
    if (noscriptItems.length > 0) {
      const basePfx = (rest.basePath ?? "").replace(/\/$/, "");
      const localePfx = parsed.hasLocalePrefix
        ? `/${parsed.lang}-${parsed.country}/${parsed.city}`
        : "";
      const links = noscriptItems
        .slice(0, PAGINATION_PAGE_SIZE)
        .map(
          (i) =>
            `<li><a href="${escapeAttr(`${basePfx}${localePfx}/product/${encodeURIComponent(i.slug)}`)}">${escapeHtml(i.name)}</a></li>`,
        )
        .join("");
      finalBodyHtml =
        (finalBodyHtml ?? "") +
        `<noscript><ul aria-label="Products">${links}</ul></noscript>`;
    }
  }

  return assembleHtml(html, {
    lang: generic.lang,
    dir: generic.dir,
    headSnippet: finalHeadSnippet,
    titleTag: `<title>${escapeHtml(finalTitle)}</title>`,
    bodyHtml: finalBodyHtml,
  });
}
