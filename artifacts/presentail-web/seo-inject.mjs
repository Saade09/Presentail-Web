// Server-side SEO HTML injection. Used by the Vite dev plugin and the
// production Node serve script so locale-prefixed URLs return HTML with
// <title>, <meta description>, OG/Twitter tags, canonical and hreflang
// alternates already present in the initial document (no JS required).

import { FAQ_COPY } from "./src/data/faqsCopy.js";
import { BLOG_POSTS } from "@workspace/blog-content";
import {
  buildBlogArticleJsonLd,
  BLOG_OG_FALLBACK_IMAGE_PATH,
} from "./blog-article-schema.mjs";
import {
  freeDeliveryThresholdUsd,
  expressSurchargeForCountry,
} from "@workspace/delivery";

// Returns window (days) for the merchant return policy in the Product offer.
// Mirrors the "Send us a photo within 7 days" satisfaction-guarantee window
// documented on the /faqs page (src/data/faqsCopy.js) and /terms page. Kept as
// a single constant so the JSON-LD and the on-page copy can't silently drift.
// Exported so returns-window-sync.test.ts can assert the FAQ/terms copy agrees.
export const RETURN_WINDOW_DAYS = 7;

const SUPPORTED_LANGS = ["en", "ar", "fr"];
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
const CITY_SLUGS_BY_COUNTRY = {
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
  buildFaqsSeo,
  buildContactSeo,
  formatTemplate,
} from "./src/lib/seo.mjs";

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
  { test: (r) => r.startsWith("/product"), key: "product" },
  { test: (r) => r === "/brands", key: "brands" },
  { test: (r) => r.startsWith("/brand/"), key: "brand" },
  { test: (r) => r === "/occasions", key: "occasions" },
  { test: (r) => r.startsWith("/occasion/"), key: "occasion" },
  { test: (r) => r.startsWith("/category/"), key: "category" },
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
// `/shop` — and its output is fully determined by (pathname, basePath, origin).
// Caching the result for ~60s makes repeat crawler / user hits essentially
// free without changing per-route content. Bounded with simple FIFO eviction
// (re-inserting on hit gives LRU-ish behaviour).
const GENERIC_SEO_CACHE_TTL_MS = 60_000;
const GENERIC_SEO_CACHE_MAX_ENTRIES = 500;
export const genericSeoCache = new Map();

function genericSeoCacheKey(pathname, basePath, origin) {
  return `${pathname}\u0000${basePath}\u0000${origin}`;
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
export function buildSeoHead(pathname, { origin = "", basePath = "" } = {}) {
  const cacheKey = genericSeoCacheKey(pathname, basePath, origin);
  const cached = getCachedGenericSeo(cacheKey);
  if (cached) return cached;
  const value = computeSeoHead(pathname, { origin, basePath });
  setCachedGenericSeo(cacheKey, value);
  return value;
}

function computeSeoHead(pathname, { origin = "", basePath = "" } = {}) {
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
  const title = routeKey === "contact"
    ? buildContactSeo({ lang, city: cityLabel, country: countryLabel }).title
    : routeKey === "faqs"
    ? buildFaqsSeo({ lang, city: cityLabel, country: countryLabel }).title
    : format(
        TITLES[lang]?.[routeKey] ?? TITLES.en[routeKey] ?? TITLES.en.landing,
        params,
      );
  if (process.env.NODE_ENV !== "production" && title.length > 65) {
    console.warn(
      `SEO title exceeds 65 chars (${title.length}) [${routeKey}/${lang}]: "${title}"`,
    );
  }
  const description = format(
    DESCRIPTIONS[lang]?.[routeKey] ??
      DESCRIPTIONS.en[routeKey] ??
      DESCRIPTIONS.en.landing,
    params,
  );

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
  const canonicalHref = canonicalOrigin + cleanBase + canonicalPath;

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
    const ogLang = HOME_OG[lang] ?? HOME_OG.en;
    const twLang = HOME_TWITTER[lang] ?? HOME_TWITTER.en;
    ogTitle = format(ogLang.title, params);
    ogDescription = format(ogLang.description, params);
    twitterTitle = format(twLang.title, params);
    twitterDescription = format(twLang.description, params);
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
  lines.push(`<link rel="canonical" href="${escapeAttr(canonicalHref)}" />`);
  // Non-public routes (cart, checkout, account, auth, favorites, order
  // confirmation) must not be indexed, but their links may still be followed.
  if (NONINDEX_ROUTE_KEYS.has(routeKey)) {
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
  lines.push(`<meta name="twitter:title" content="${escapeAttr(twitterTitle)}" />`);
  lines.push(
    `<meta name="twitter:description" content="${escapeAttr(twitterDescription)}" />`,
  );
  // Default OG / Twitter image for generic (non-entity) pages.
  const defaultImage = `${origin}${cleanBase}/opengraph.jpg`;
  const defaultImageAlt = "Presentail — Luxury Flower & Gift Delivery"; // i18n-ignore — brand tagline used as OG image alt fallback
  lines.push(`<meta property="og:image" content="${escapeAttr(defaultImage)}" />`);
  lines.push(`<meta property="og:image:width" content="1280" />`);
  lines.push(`<meta property="og:image:height" content="720" />`);
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
    // WebSite identifies the site as a whole. Emit on every public page so
    // crawlers always have a site-level anchor regardless of entry point.
    jsonLdNodes.push(buildWebSiteSchema(siteUrl));
  }

  // LocalBusiness (Florist) + Home > {City} breadcrumb on city homepages —
  // anchors the brand to the served city/country for local search visibility.
  if (emitJsonLd && routeKey === "home" && hasValidCity) {
    const countryPlain = parsed.country
      ? COUNTRY_PLAIN_NAMES[lang]?.[parsed.country] ??
        COUNTRY_PLAIN_NAMES.en[parsed.country] ??
        countryLabel
      : countryLabel;
    jsonLdNodes.push(
      buildLocalBusinessSchema({
        siteUrl,
        cityName: cityLabel,
        countryName: countryPlain,
      }),
    );
    jsonLdNodes.push(
      buildBreadcrumbListSchema([
        { name: "Home", url: siteUrl },
        { name: cityLabel },
      ]),
    );
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
    },
    ar: {
      home: "الرئيسية",
      shop: "تسوّق", brands: "العلامات التجارية", occasions: "المناسبات",
      weddings: "الأفراح", corporate: "الشركات", contact: "اتصل بنا",
      faqs: "الأسئلة الشائعة", terms: "شروط الاستخدام",
      privacy: "سياسة الخصوصية", blog: "المدونة", careers: "الوظائف",
      partner: "شريك",
    },
    fr: {
      home: "Accueil",
      shop: "Boutique", brands: "Marques", occasions: "Occasions",
      weddings: "Mariages", corporate: "Entreprises", contact: "Contact",
      faqs: "FAQ", terms: "Conditions d'utilisation",
      privacy: "Politique de confidentialité", blog: "Journal",
      careers: "Carrières", partner: "Partenariat",
    },
  };
  const crumbLabels = ROUTE_CRUMB_LABELS[lang] ?? ROUTE_CRUMB_LABELS.en;
  if (emitJsonLd && inLocale && crumbLabels[routeKey]) {
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

  // WebPage (Terms / Privacy) and ContactPage (Contact) lightweight schema.
  if (emitJsonLd && (routeKey === "terms" || routeKey === "privacy")) {
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
  if (emitJsonLd && genericFaqRoutes[routeKey]) {
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

  if (inLocale) {
    for (const altLang of SUPPORTED_LANGS) {
      const altPath = buildLocalePath({
        lang: altLang,
        country: parsed.country,
        city: parsed.city,
        rest: parsed.rest,
      });
      const href = origin + cleanBase + altPath;
      const code = `${altLang}-${parsed.country.toUpperCase()}`;
      lines.push(
        `<link rel="alternate" hreflang="${escapeAttr(code)}" href="${escapeAttr(href)}" />`,
      );
    }
    const xDefaultPath = buildLocalePath({
      lang: "en",
      country: parsed.country,
      city: parsed.city,
      rest: parsed.rest,
    });
    lines.push(
      `<link rel="alternate" hreflang="x-default" href="${escapeAttr(origin + cleanBase + xDefaultPath)}" />`,
    );
  }

  const localeBase = inLocale && parsed.lang && parsed.country && parsed.city
    ? `${origin}${cleanBase}/${parsed.lang}-${parsed.country}/${parsed.city}`
    : null;

  // Collect resolved FAQ items for the prerendered body fragment. These mirror
  // the JSON-LD FAQPage nodes above so the crawler-visible body has the same
  // meaningful h2/h3 structure as the JSON-LD without relying on JavaScript.
  let bodyFaqItems = [];
  if (inLocale) {
    const faqBodyParams = { city: cityLabel || "" };
    const pickFaqBodyLang = (l) => ((l === "ar" || l === "fr") ? l : "en");
    const faqBodyL = pickFaqBodyLang(lang);
    if (genericFaqRoutes[routeKey]) {
      const raw = genericFaqRoutes[routeKey][faqBodyL] ?? genericFaqRoutes[routeKey].en ?? [];
      bodyFaqItems = raw.slice(0, 3).map(({ q, a }) => ({
        q: formatTemplate(q, faqBodyParams),
        a: formatTemplate(a, faqBodyParams),
      }));
    } else if (routeKey === "brands") {
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

  const bodyHtml = buildGenericBodyHtml(routeKey, { title, description, localeBase, faqItems: bodyFaqItems });

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
 * Inject locale-aware tags into a raw index.html string. Replaces the existing
 * <title> and <html lang="..."> attributes, and inserts the head snippet
 * immediately before </head>.
 */
export function injectSeoTags(html, pathname, opts = {}) {
  const { lang, dir, headSnippet, titleTag, bodyHtml } = buildSeoHead(pathname, opts);
  return assembleHtml(html, { lang, dir, headSnippet, titleTag, bodyHtml });
}

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
      `<div id="root">${bodyHtml}</div>`,
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

// Static descriptive copy for each generic route type (English only — the SEO
// meta description is already localised; the body copy supplements it for
// crawlers that benefit from additional prose rather than needing exact
// translations).
const ROUTE_BODY_INTRO = {
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
};

function buildNavLinks(localeBase) {
  if (!localeBase) return "";
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
    `</ul>` +
    `</nav>`
  );
}

function buildGenericBodyHtml(routeKey, { title, description, localeBase, faqItems = [] }) {
  const intro = ROUTE_BODY_INTRO[routeKey] ?? "";
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description);
  const safeIntro = escapeHtml(intro);
  // Add FAQ questions as h2+h3 headings so pages with multiple sections have
  // the required subheading structure for AI crawlers and the Agent Ready scan.
  let faqHtml = "";
  if (faqItems.length > 0) {
    faqHtml =
      `<h2>Frequently Asked Questions</h2>` + // i18n-ignore — crawlers-only heading in non-rendered body
      faqItems.map(({ q, a }) => `<h3>${escapeHtml(q)}</h3><p>${escapeHtml(a)}</p>`).join("");
  }
  return (
    `<div style="display:none">` +
    `<h1>${safeTitle}</h1>` +
    (safeDesc ? `<p>${safeDesc}</p>` : "") +
    (safeIntro && safeIntro !== safeDesc ? `<p>${safeIntro}</p>` : "") +
    faqHtml +
    buildNavLinks(localeBase) +
    `</div>`
  );
}

function buildProductBodyHtml(product, { title, description, localeBase, imageUrl }) {
  const rawName = typeof product.name === "string" ? product.name.trim() : "";
  const safeTitle = escapeHtml(rawName || title);
  const rawDesc = typeof product.description === "string"
    ? stripHtml(product.description.trim())
    : "";
  const safeDesc = escapeHtml(rawDesc || description);
  const hasPrice =
    typeof product.priceValue === "number" &&
    Number.isFinite(product.priceValue) &&
    product.priceValue > 0;
  const priceHtml = hasPrice
    ? `<p>From $${escapeHtml(product.priceValue.toFixed(2))} USD</p>` // i18n-ignore — price with currency unit
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
  return `<div style="display:none">${imgHtml}<h1>${safeTitle}</h1>${detailsHeading}${safeDesc ? `<p>${safeDesc}</p>` : ""}${priceHtml}${deliveryNote}${nav}</div>`;
}

function buildSimpleEntityBodyHtml(entity, { title, description, localeBase }) {
  const rawName = typeof entity.name === "string" ? entity.name.trim() : "";
  const safeTitle = escapeHtml(rawName || title);
  const rawDesc = entity.description ? stripHtml(entity.description) : "";
  const safeDesc = escapeHtml(rawDesc || description);
  const nav = localeBase
    ? `<nav><a href="${localeBase}/">Home</a> › <a href="${localeBase}/shop">Shop</a></nav>` // i18n-ignore — breadcrumb labels
    : "";
  return `<div style="display:none"><h1>${safeTitle}</h1>${safeDesc ? `<p>${safeDesc}</p>` : ""}${nav}</div>`;
}

/**
 * Build the prerendered body fragment for a blog article page.
 * Includes the headline, publish date, and all article sections so
 * non-rendering crawlers (GPTBot, ClaudeBot, PerplexityBot, etc.) can
 * read the full article copy without executing JavaScript.
 */
function buildBlogPostBodyHtml(article, { localeBase }) {
  const safeTitle = escapeHtml(article.title ?? "");
  const sections = Array.isArray(article.sections) ? article.sections : [];
  let inner = `<h1>${safeTitle}</h1>`;
  if (article.datePublished) {
    inner += `<time datetime="${escapeAttr(article.datePublished)}">${escapeHtml(article.datePublished)}</time>`;
  }
  for (const sec of sections) {
    if (sec.heading) inner += `<h2>${escapeHtml(sec.heading)}</h2>`;
    if (sec.body) inner += `<p>${escapeHtml(sec.body)}</p>`;
  }
  const nav = localeBase
    ? `<nav><a href="${localeBase}/">Home</a> › <a href="${localeBase}/blog">Journal</a></nav>` // i18n-ignore — breadcrumb labels
    : "";
  return `<div style="display:none">${inner}${nav}</div>`;
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
  let inner = `<h1>${safeTitle}</h1>`;
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
  return `<div style="display:none">${inner}</div>`;
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

// Small in-process LRU+TTL cache for the per-entity SEO lookup. WhatsApp /
// iMessage / Slack crawlers retry aggressively on shared product, brand, and
// category links, so caching the upstream lookup for ~60s makes repeat shares
// essentially free and protects the head-snippet renderer against transient
// upstream slowdowns. Negative results (404 / timeout / network error) are
// intentionally NOT cached so a transient blip can't pin an entity to the
// generic fallback for the full TTL.
const entitySeoCache = new Map();

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
  const result = await fetcher(fetchOpts);

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

  // 200 (new or changed entity): evict image-dims cache entries so the fresh
  // entity always gets freshly measured dimensions. This prevents stale dims
  // surviving up to 1 hour when the CDN replaces an image at an unchanged URL.
  if (result && result.value) {
    for (const url of extractEntityImageUrls(result.value)) evictImageDims(url);
    setCachedEntity(key, result.value, result.etag, result.lastModified);
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
      return null;
    }
    const body = await res.json();
    if (!body || body.ok !== true) {
      reportSeoFetchFailure(apiBaseUrl, responseKey);
      return null;
    }
    const value = body[responseKey] ?? null;
    if (!value) return null;
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
async function fetchBrandProductCountForSeo({ slug, countryCode, cityId, apiBaseUrl }) {
  if (!slug || !apiBaseUrl) return null;
  const params = new URLSearchParams({ slug });
  if (countryCode) params.set("countryCode", countryCode);
  if (cityId) params.set("cityId", cityId);
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
    return count !== null ? { count } : null;
  } catch {
    clearTimeout(timer);
    return null;
  }
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
async function fetchListingProductsForSeo({ kind, slug, lang, countryCode, cityId, apiBaseUrl }) {
  if (!slug || !apiBaseUrl) return null;
  const endpoint =
    kind === "occasion" ? "/api/woo/occasion-products" : "/api/woo/category-products";
  const params = new URLSearchParams({ slug });
  if (lang) params.set("lang", lang);
  if (countryCode) params.set("countryCode", countryCode);
  if (cityId) params.set("cityId", cityId);
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
      const groups = Array.isArray(body.groups) ? body.groups : [];
      const items = [];
      for (const g of groups) {
        for (const p of g.products ?? []) {
          const it = toItem(p);
          if (it) {
            items.push(it);
            if (items.length >= 10) break;
          }
        }
        if (items.length >= 10) break;
      }
      const count =
        typeof body.total === "number"
          ? body.total
          : groups.reduce((s, g) => s + (g.count ?? 0), 0);
      return { count, items };
    }
    const products = Array.isArray(body.products) ? body.products : [];
    const items = products.map(toItem).filter(Boolean).slice(0, 10);
    const count = typeof body.count === "number" ? body.count : products.length;
    return { count, items };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
    name: "Presentail",
    url: siteUrl,
    logo: `${siteUrl}/opengraph.jpg`,
    description: "Luxury flower and gift delivery in Lebanon, UAE, and Cyprus. Same-day and scheduled delivery available.", // i18n-ignore — EN-only schema description
    areaServed: ["LB", "AE", "CY"],
    sameAs: SEO_SOCIAL_LINKS,
  };
}

/**
 * LocalBusiness (Florist) JSON-LD for city homepages. Helps Google associate
 * the brand with each served city/country for local-pack visibility.
 */
function buildLocalBusinessSchema({ siteUrl, cityName, countryName }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Florist",
    name: "Presentail",
    url: siteUrl,
    image: `${siteUrl}/opengraph.jpg`,
    logo: `${siteUrl}/opengraph.jpg`,
  };
  if (cityName || countryName) {
    schema.address = {
      "@type": "PostalAddress",
      ...(cityName ? { addressLocality: cityName } : {}),
      ...(countryName ? { addressCountry: countryName } : {}),
    };
    schema.areaServed = countryName || cityName;
  }
  return schema;
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
    name: "Presentail",
    url: siteUrl,
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
]);

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
}) {
  const cleanBase = basePath.replace(/\/$/, "");
  const canonicalHref = origin + cleanBase + pathname + stripTrackingParams(search || "");
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
  const effectiveImageUrl = imageUrl || `${origin}${cleanBase}/opengraph.jpg`;
  const effectiveImageAlt = imageAlt || "Presentail — Luxury Flower & Gift Delivery"; // i18n-ignore — brand tagline used as OG image alt fallback
  lines.push(`<meta property="og:image" content="${escapeAttr(effectiveImageUrl)}" />`);
  if (!imageUrl) {
    lines.push(`<meta property="og:image:width" content="1280" />`);
    lines.push(`<meta property="og:image:height" content="720" />`);
  } else if (imageWidth && imageHeight) {
    lines.push(`<meta property="og:image:width" content="${escapeAttr(String(imageWidth))}" />`);
    lines.push(`<meta property="og:image:height" content="${escapeAttr(String(imageHeight))}" />`);
  }
  lines.push(`<meta property="og:image:alt" content="${escapeAttr(effectiveImageAlt)}" />`);
  lines.push(`<meta name="twitter:card" content="summary_large_image" />`);
  lines.push(`<meta name="twitter:title" content="${escapeAttr(title)}" />`);
  lines.push(
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
  );
  lines.push(`<meta name="twitter:image" content="${escapeAttr(effectiveImageUrl)}" />`);
  lines.push(`<meta name="twitter:image:alt" content="${escapeAttr(effectiveImageAlt)}" />`);
  // Organization + WebSite JSON-LD on every entity page so crawlers always
  // have a site-level anchor regardless of which page they enter through.
  lines.push(jsonLdTag(buildOrganizationSchema(`${origin}${cleanBase}`)));
  lines.push(jsonLdTag(buildWebSiteSchema(`${origin}${cleanBase}`)));
  for (const extra of extraLines) lines.push(extra);
  return { title, headSnippet: lines.join("\n    ") };
}

function genericFallbackDescription(lang, key) {
  const tpl = DESCRIPTIONS[lang]?.[key] ?? DESCRIPTIONS.en[key] ?? "";
  return tpl.replace(/\{(?:city|country)\}/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Build the `shippingDetails` + `hasMerchantReturnPolicy` fields for a Product
 * Offer so the listing qualifies for Google's enhanced/free merchant results.
 *
 * - shippingDetails: region is the page's recipient country (defaults to LB).
 *   The shipping rate is derived from the shared delivery rules
 *   (@workspace/delivery): orders at/above the country's free-delivery
 *   threshold ship free (rate 0); below the threshold we surface the country's
 *   standard delivery surcharge — both values come straight from the shared
 *   lib, never hardcoded here.
 * - hasMerchantReturnPolicy: reflects the real 100% Satisfaction Guarantee —
 *   a finite 7-day, free-of-charge return window (see RETURN_WINDOW_DAYS).
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

  const thresholdUsd = freeDeliveryThresholdUsd(country);
  const qualifiesForFree = priceValue >= thresholdUsd;
  const shippingRateUsd = qualifiesForFree
    ? 0
    : expressSurchargeForCountry(country);

  return {
    shippingDetails: {
      "@type": "OfferShippingDetails",
      shippingRate: {
        "@type": "MonetaryAmount",
        value: shippingRateUsd.toFixed(2),
        currency: "USD",
      },
      shippingDestination: {
        "@type": "DefinedRegion",
        addressCountry: country,
      },
    },
    hasMerchantReturnPolicy: {
      "@type": "MerchantReturnPolicy",
      applicableCountry: country,
      returnPolicyCategory:
        "https://schema.org/MerchantReturnFiniteReturnWindow",
      merchantReturnDays: RETURN_WINDOW_DAYS,
      returnMethod: "https://schema.org/ReturnByMail",
      returnFees: "https://schema.org/FreeReturn",
    },
  };
}

export function buildProductHead({
  product,
  imageDimensions,
  lang,
  basePath,
  origin,
  pathname,
  cityLabel,
  countryLabel,
  countryCode,
  country,
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
  const title = rawName ? seo.title : "Presentail";
  const description =
    seo.description || genericFallbackDescription(lang, "product");
  // ogImageUrl is a pre-generated branded share image (1200×630 JPEG served
  // by the API). When provided it takes precedence over the raw product photo
  // so WhatsApp / iMessage / Slack previews show a Presentail-branded card
  // rather than a plain product photo.
  const imageUrl = ogImageUrl ||
    (product.image && typeof product.image.uri === "string" && product.image.uri) ||
    (Array.isArray(product.images) &&
      product.images.find((i) => i && typeof i.uri === "string" && i.uri)?.uri) ||
    null;

  const inStock = product.inStock !== false;

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
    const marketPrice = Math.round(product.priceValue * marketFx * 100) / 100;
    extraLines.push(
      `<meta property="product:price:amount" content="${escapeAttr(marketPrice.toFixed(2))}" />`,
    );
    extraLines.push(`<meta property="product:price:currency" content="${escapeAttr(marketCurrency)}" />`);
  }

  // Canonical product URL (no query string) — reused for the Product `url`,
  // the offer `url`, and as the breadcrumb leaf reference.
  const cleanBase = basePath.replace(/\/$/, "");
  const siteRoot = `${origin}${cleanBase}`;
  const canonicalUrl = `${siteRoot}${pathname}`;
  const locBase = localeBaseUrl(pathname, origin, basePath);

  // Stable identifier: prefer the numeric OS/WC id, fall back to the slug.
  const sku =
    typeof product.wcId === "number" && product.wcId > 0
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
  // Currency is USD because all prices are stored in the WC/OS USD base and the
  // server-rendered HTML (what crawlers index) shows the USD figure — display
  // currency is a client-only conversion applied after hydration via
  // CurrencyContext, so it is not present in the crawlable markup. This keeps
  // the price number and currency code internally consistent and matches the
  // existing `product:price` OG meta. availability mirrors the page: out-of-
  // stock products show a dead-end view, so we never emit InStock for them.
  const hasPrice =
    typeof product.priceValue === "number" &&
    Number.isFinite(product.priceValue) &&
    product.priceValue > 0;
  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: rawName || "Presentail",
    ...(rawDesc ? { description: clampDescription(stripHtml(rawDesc), 300) } : {}),
    ...(imageUrl ? { image: imageUrl } : {}),
    ...(sku ? { sku } : {}),
    url: canonicalUrl,
    brand: { "@type": "Brand", name: "Presentail" },
    ...(hasPrice
      ? {
          offers: {
            "@type": "Offer",
            price: (Math.round(product.priceValue * marketFx * 100) / 100).toFixed(2),
            priceCurrency: marketCurrency,
            availability: inStock
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
            itemCondition: "https://schema.org/NewCondition",
            url: canonicalUrl,
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
    title,
    description,
    localeBase: locBase,
    imageUrl,
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
      imageAlt: rawName || "Presentail product", // i18n-ignore — brand+type label used as OG image alt fallback
      imageWidth: effectiveImageWidth,
      imageHeight: effectiveImageHeight,
      basePath,
      origin,
      pathname,
      search: "",
      lang,
      country,
      extraLines,
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
  const title = rawTitle ? `${rawTitle} | Presentail` : "Presentail";
  const description =
    clampDescription(article.description) ||
    genericFallbackDescription(lang, "blogPost");
  const cleanBase = basePath.replace(/\/$/, "");
  const canonicalHref = origin + cleanBase + pathname;

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

  const extraLines = [];
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
        image: imageUrl,
        publisherUrl: `${origin}${cleanBase}`,
        url: canonicalHref,
      }),
    ),
  );

  // BreadcrumbList JSON-LD — Home > Journal > Article Title.
  const locBase = localeBaseUrl(pathname, origin, basePath);
  extraLines.push(
    jsonLdTag(
      buildBreadcrumbListSchema([
        { name: "Home", url: locBase },
        { name: "Journal", url: `${locBase}/blog` },
        { name: rawTitle || "Article" },
      ]),
    ),
  );

  // Prerendered body fragment — includes the h1, publish date, and all
  // article sections so non-rendering crawlers can read the full copy.
  const bodyHtml = buildBlogPostBodyHtml(article, { localeBase: locBase || null });

  return {
    ...buildEntityHead({
      ogType: "article",
      title,
      description,
      imageUrl,
      imageAlt: rawTitle || "Presentail",
      imageWidth,
      imageHeight,
      basePath,
      origin,
      pathname,
      search: "",
      lang,
      country,
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
  return {
    ...buildEntityHead({
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
    }),
    bodyHtml,
  };
}

export function buildBrandHead({ brand, imageDimensions, lang, basePath, origin, pathname, cityLabel, country, productCount }) {
  const rawName = typeof brand.name === "string" ? brand.name.trim() : "";
  const title = rawName ? `${rawName} | Presentail` : "Presentail";
  const rawDesc = brand.description ? stripHtml(brand.description) : "";
  const description =
    clampDescription(rawDesc) || genericFallbackDescription(lang, "brand");
  const imageUrl =
    typeof brand.image === "string" && brand.image ? brand.image : null;
  // BreadcrumbList JSON-LD — Home > Brands > Brand Name.
  const locBase = localeBaseUrl(pathname, origin, basePath);
  const extraLines = [
    jsonLdTag(
      buildBreadcrumbListSchema([
        { name: "Home", url: locBase },
        { name: "Brands", url: `${locBase}/brands` },
        { name: rawName || "Brand" },
      ]),
    ),
  ];
  // FAQPage JSON-LD — emit structured Q&A markup so search engines can show
  // expandable FAQ rich results for brand detail pages. Mirrors the pattern
  // used for category and occasion pages. Only emitted when the brand has a
  // name AND has deliverable products — the UI suppresses the FAQ section on
  // empty brand pages so the schema must match what the visitor actually sees.
  let brandBodyFaqItems = [];
  if (rawName && productCount > 0) {
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
  // Body HTML: include the localised heading + intro (general variant, since
  // brand category type is not available at server render time) so AI crawlers
  // see the real SEO section content without executing JS. FAQ questions are
  // added as h2+h3 so pages with multiple sections have the required heading
  // structure for AI crawlers and the Agent Ready scan.
  const pickBodyLangBrand = (/** @type {string} */ l) =>
    (l === "ar" || l === "fr") ? l : "en";
  const brandBodyLang = pickBodyLangBrand(lang);
  const brandParams = { name: rawName, city: cityLabel || "" };
  const brandHeadingTpl = BRAND_HEADING_COPY[brandBodyLang];
  const brandIntroTpl = BRAND_INTRO_GENERAL_COPY[brandBodyLang];
  const brandSeoHeading = brandHeadingTpl
    ? formatTemplate(brandHeadingTpl, brandParams)
    : "";
  const brandSeoIntro = brandIntroTpl
    ? formatTemplate(brandIntroTpl, brandParams)
    : "";
  const safeBrandTitle = escapeHtml(rawName || title);
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
  // The sr-only h1 lives OUTSIDE the display:none wrapper so Google indexes it
  // alongside the page. sr-only hides it visually while keeping it in the
  // accessibility tree and the crawlable DOM. React replaces all children of
  // #root on hydration, so JS users see the normal SPA h1 without any flash.
  const bodyHtml = (
    `<h1 class="sr-only">${safeBrandTitle}</h1>` +
    `<div style="display:none">` +
    (safeBrandDesc ? `<p>${safeBrandDesc}</p>` : "") +
    (safeBrandHeading ? `<h2>${safeBrandHeading}</h2>` : "") +
    (safeBrandIntro ? `<p>${safeBrandIntro}</p>` : "") +
    brandFaqBodyHtml +
    brandNav +
    `</div>`
  );
  return {
    ...buildEntityHead({
      ogType: "website",
      title,
      description,
      imageUrl,
      imageAlt: rawName || "Presentail brand", // i18n-ignore — brand+type label used as OG image alt fallback
      imageWidth: imageDimensions?.width,
      imageHeight: imageDimensions?.height,
      basePath,
      origin,
      pathname,
      search: "",
      lang,
      country,
      extraLines,
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
  const title = rawName ? seo.title : "Presentail";
  const rawDesc = entity.description ? stripHtml(entity.description) : "";
  const description =
    clampDescription(rawDesc) ||
    seo.description ||
    genericFallbackDescription(lang, "shop");
  // Mark genuinely empty listing pages (zero deliverable products) as
  // noindex so search engines don't surface thin/empty results.
  const robots = seo.robots === "noindex, follow" ? "noindex, follow" : undefined;
  // ogImageUrl is a pre-generated branded share image (1200×630 JPEG served
  // by the API). When provided it takes precedence over the raw entity image.
  const imageUrl = ogImageUrl ||
    (typeof entity.image === "string" && entity.image ? entity.image : null);
  // BreadcrumbList + ItemList JSON-LD, emitted together in one @graph block.
  // Breadcrumb: Home > {City} > {Category/Occasion}. "Home" is the site root,
  // "{City}" is the locale/city homepage; the city crumb is dropped when no
  // city is in the path so the trail never shows an empty label.
  const cleanBase = basePath.replace(/\/$/, "");
  const siteRoot = `${origin}${cleanBase}`;
  const locBase = localeBaseUrl(pathname, origin, basePath);
  const crumbItems = [{ name: "Home", url: siteRoot }];
  if (cityLabel && locBase !== siteRoot) {
    crumbItems.push({ name: cityLabel, url: locBase });
  }
  crumbItems.push({ name: rawName || altText });
  const graphNodes = [buildBreadcrumbListSchema(crumbItems)];
  // ItemList — first (≤10) products (name + URL + image) on the listing page.
  if (Array.isArray(items) && items.length > 0) {
    graphNodes.push(buildItemListSchema(items, rawName || altText, locBase));
  }
  const extraLines = [jsonLdGraphTag(graphNodes)];
  // FAQPage JSON-LD — emit structured Q&A markup so search engines can show
  // expandable FAQ rich results for category and occasion listing pages.
  // Emitted as a standalone <script> (not in the @graph above) so validators
  // see a clean FAQPage root. Only emitted when the entity has a name AND the
  // page has deliverable products — a listing with no products never renders
  // the FAQ section in the UI, so the schema would not match visible content.
  let entityBodyFaqItems = [];
  if (rawName && productCount > 0) {
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
  const safeEntityTitle = escapeHtml(rawName || title);
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
  // The sr-only h1 lives OUTSIDE the display:none wrapper so Google (which
  // treats display:none as potentially cloaked content) indexes it alongside
  // the rest of the page. sr-only hides it visually while keeping it in the
  // accessibility tree and the crawlable DOM. React's createRoot() replaces
  // all children of #root on hydration, so JS users see the normal SPA h1.
  const bodyHtml = (
    `<h1 class="sr-only">${safeEntityTitle}</h1>` +
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
    }),
    bodyHtml,
  };
}

/**
 * Async variant of injectSeoTags that, for `/product/<slug>`, `/brand/<slug>`,
 * `/shop?category=<slug>`, and `/shop?occasion=<slug>` routes, fetches the
 * matching record from the API and emits entity-specific OG/Twitter Card
 * meta so shared links show a rich preview. Falls back to the generic
 * locale-aware injector on any failure.
 */
export async function injectSeoTagsAsync(html, pathname, opts = {}) {
  const { apiBaseUrl, search, hintLang, acceptLanguage, firstBannerImageUrl, ...rest } = opts;
  const generic = buildSeoHead(pathname, rest);
  const parsed = parseLocalePath(pathname);

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
      const isOsStorage = (() => {
        try {
          const u = new URL(firstBannerImageUrl);
          return (
            u.hostname === "os.presentail.com" &&
            u.pathname.startsWith("/api/storage/")
          );
        } catch {
          return false;
        }
      })();
      let preloadTag;
      if (isOsStorage) {
        const widths = [400, 800, 1200];
        const srcset = widths
          .map(
            (w) =>
              `/api/img/proxy?url=${encodeURIComponent(firstBannerImageUrl)}&w=${w}&f=webp ${w}w`,
          )
          .join(", ");
        const sizes = "(max-width: 1280px) 100vw, 1280px";
        const href = `/api/img/proxy?url=${encodeURIComponent(firstBannerImageUrl)}&w=800&f=webp`;
        preloadTag =
          `<link rel="preload" as="image" fetchpriority="high"` +
          ` href="${escapeAttr(href)}"` +
          ` imagesrcset="${escapeAttr(srcset)}"` +
          ` imagesizes="${escapeAttr(sizes)}">`;
      } else {
        preloadTag = `<link rel="preload" as="image" fetchpriority="high" href="${escapeAttr(firstBannerImageUrl)}">`;
      }
      generic.headSnippet += `\n    ${preloadTag}`;
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
        // Out-of-stock products render a dead-end view in the SPA; return the
        // generic head so the HTML head matches the page body consistently.
        if (product.inStock === false) {
          return assembleHtml(html, generic);
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
          const result = buildBlogPostHead({
            article,
            lang: bareBlogLang,
            basePath: rest.basePath ?? "",
            origin: rest.origin ?? "",
            pathname,
          });
          return assembleHtml(html, {
            lang: bareBlogLang,
            dir: bareBlogLang === "ar" ? "rtl" : "ltr",
            headSnippet: result.headSnippet,
            titleTag: `<title>${escapeHtml(result.title)}</title>`,
            bodyHtml: result.bodyHtml ?? null,
          });
        }
      }
    }
    return assembleHtml(html, generic);
  }

  const productSlug = extractProductSlug(parsed.rest);
  const brandSlug = extractBrandSlug(parsed.rest);
  // Path-based slugs (new clean URLs)
  const categorySlugFromPath = extractSlugFor("/category", parsed.rest);
  const occasionSlugFromPath = extractSlugFor("/occasion", parsed.rest);
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
      const result = buildBlogPostHead({
        article,
        lang: generic.lang,
        country: parsed.country,
        basePath: rest.basePath ?? "",
        origin: rest.origin ?? "",
        pathname,
      });
      return assembleHtml(html, {
        lang: generic.lang,
        dir: generic.dir,
        headSnippet: result.headSnippet,
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
  };

  // Base public origin used to build OG image API URLs. The og:image tag must
  // contain an absolute URL accessible to crawlers (WhatsApp, iMessage, Slack,
  // etc.), so we use the request origin (e.g. https://presentail.com) plus the
  // /api/og-image/* path that the reverse proxy routes to the API server.
  const publicOrigin = (rest.origin ?? "").replace(/\/$/, "");

  let result = null;
  if (productSlug) {
    const product = await fetchEntityForSeoCached("product", fetchProductForSeo, {
      slug: productSlug,
      ...fetchOpts,
    });
    if (product) {
      // Out-of-stock products render a dead-end view in the SPA; return the
      // generic head so the HTML head matches the page body consistently.
      if (product.inStock === false) {
        return assembleHtml(html, generic);
      }
      // Use the branded per-product OG image (generated on demand by the API
      // server) instead of the raw product photo. This gives WhatsApp / iMessage
      // / Slack a 1200×630 card with the product name and Presentail branding.
      // If publicOrigin is empty (e.g. in unit tests), fall back to probing the
      // raw product image URL.
      const productOgImageUrl = publicOrigin
        ? `${publicOrigin}/api/og-image/product/${encodeURIComponent(productSlug)}`
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
        imageDimensions: productImageDims,
        ogImageUrl: productOgImageUrl,
        ...headOpts,
      });
    }
  } else if (brandSlug) {
    const brand = await fetchEntityForSeoCached("brand", fetchBrandForSeo, {
      slug: brandSlug,
      ...fetchOpts,
    });
    if (brand) {
      const brandImageUrl = typeof brand.image === "string" && brand.image ? brand.image : null;
      const [brandImageDims, brandListing] = await Promise.all([
        fetchImageDimensions(brandImageUrl),
        fetchBrandProductCountForSeo({ slug: brandSlug, ...fetchOpts }),
      ]);
      result = buildBrandHead({
        brand,
        imageDimensions: brandImageDims,
        productCount: brandListing?.count,
        ...headOpts,
      });
    }
  } else if (categorySlug) {
    const category = await fetchEntityForSeoCached(
      "category",
      fetchCategoryForSeo,
      { slug: categorySlug, ...fetchOpts },
    );
    if (category) {
      const catImageUrl = typeof category.image === "string" && category.image ? category.image : null;
      const catImageDims = await fetchImageDimensions(catImageUrl);
      const listing = await fetchListingProductsForSeo({
        kind: "category",
        slug: categorySlug,
        ...fetchOpts,
      });
      // Canonical for category clean paths drops any query string.
      result = buildCategoryHead({
        category,
        imageDimensions: catImageDims,
        search: "",
        productCount: listing?.count,
        items: listing?.items ?? [],
        ...headOpts,
      });
    }
  } else if (occasionSlug) {
    const occasion = await fetchEntityForSeoCached("occasion", fetchOccasionForSeo, {
      slug: occasionSlug,
      ...fetchOpts,
    });
    if (occasion) {
      // Use the branded per-occasion OG image (generated on demand by the API
      // server) instead of the raw occasion photo.
      const occasionOgImageUrl = publicOrigin
        ? `${publicOrigin}/api/og-image/occasion/${encodeURIComponent(occasionSlug)}`
        : null;
      const occImageDims = occasionOgImageUrl
        ? null // dimensions are always 1200×630 — no probe needed
        : await fetchImageDimensions(
            typeof occasion.image === "string" && occasion.image ? occasion.image : null,
          );
      const listing = await fetchListingProductsForSeo({
        kind: "occasion",
        slug: occasionSlug,
        ...fetchOpts,
      });
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
  return assembleHtml(html, {
    lang: generic.lang,
    dir: generic.dir,
    headSnippet: result.headSnippet,
    titleTag: `<title>${escapeHtml(result.title)}</title>`,
    bodyHtml: result.bodyHtml ?? null,
  });
}
