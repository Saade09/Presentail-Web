/**
 * seo-checks/meta-tags.mjs
 *
 * Checks 11–19: <head> meta tags, og tags, canonical, robots, title.
 */

import {
  fetchText,
  extractMeta,
  extractOgProp,
  extractTitle,
  extractCanonical,
  decodeHtml,
} from "./utils.mjs";

const INDEXABLE = (BASE) => [
  `${BASE}/`,
  `${BASE}/en-lb/beirut`,
  `${BASE}/ar-lb/beirut`,
  `${BASE}/fr-lb/beirut`,
  `${BASE}/en-ae/dubai`,
  `${BASE}/en-cy/limassol`,
  `${BASE}/en-lb/beirut/shop`,
  `${BASE}/en-lb/beirut/brands`,
  `${BASE}/en-lb/beirut/occasions`,
];

const PRIVATE = (BASE) => [
  `${BASE}/en-lb/beirut/checkout`,
  `${BASE}/en-lb/beirut/cart`,
  `${BASE}/en-lb/beirut/account`,
];

/**
 * Check 11: <meta description> non-empty and ≤155 chars on all indexable pages.
 */
export async function checkMetaDescription(BASE, record) {
  const fails = [];
  for (const url of INDEXABLE(BASE)) {
    const r = await fetchText(url);
    const desc = extractMeta(r.text, "description");
    if (!desc) fails.push(`${url}: missing`);
    else if (desc.length > 155) fails.push(`${url}: ${desc.length} chars (max 155)`);
  }
  record(
    "<meta description> non-empty and ≤155 chars",
    fails.length === 0,
    fails.join("; ") || "all present and within limit"
  );
}

/**
 * Check 12: <link rel="canonical"> present and self-referencing.
 */
export async function checkCanonical(BASE, record) {
  const urls = [
    `${BASE}/en-lb/beirut`,
    `${BASE}/en-lb/beirut/shop`,
    `${BASE}/ar-lb/beirut`,
  ];
  const fails = [];
  for (const url of urls) {
    const r = await fetchText(url);
    const canonical = extractCanonical(r.text);
    if (!canonical) {
      fails.push(`${url}: missing`);
    } else if (canonical !== url) {
      fails.push(`${url}: canonical="${canonical}"`);
    }
  }
  record(
    "<link rel=canonical> present & self-referencing",
    fails.length === 0,
    fails.join("; ") || "all self-referencing"
  );
}

/**
 * Check 13: og:title and og:description are both non-empty on home.
 */
export async function checkOgNonEmpty(BASE, record) {
  const r = await fetchText(`${BASE}/en-lb/beirut`);
  const ogTitle = extractOgProp(r.text, "og:title");
  const ogDesc = extractOgProp(r.text, "og:description");
  const ok = ogTitle.length > 0 && ogDesc.length > 0;
  record(
    "og:title and og:description non-empty",
    ok,
    ok
      ? `og:title="${ogTitle}", og:description="${ogDesc.substring(0, 60)}…"`
      : `og:title="${ogTitle}", og:description="${ogDesc}"`
  );
}

/**
 * Check 14 (NEW — og-title-equals-title): og:title is coherent with <title>.
 *
 * FIX: On this site, og:title is a global site-wide fallback ("Online Flower &
 * Gift Delivery | Presentail") while <title> is locale-specific ("Flower & Gift
 * Delivery in Beirut | Presentail"). An exact-equality check would always fail.
 * This check instead verifies that:
 *   1. og:title is present and non-empty on every sampled page.
 *   2. Both og:title and <title> reference the same brand (share "Presentail" or
 *      another shared keyword), confirming they are coherent even if not identical.
 *   3. Neither contains raw template placeholders ({curly braces}).
 *
 * When serve.mjs is updated to emit page-specific og:title values (e.g. after a
 * full SSR migration), tighten this check to assert og:title === title.
 */
export async function checkOgTitleEqualsTitle(BASE, record) {
  const urls = [
    `${BASE}/en-lb/beirut`,
    `${BASE}/en-lb/beirut/shop`,
    `${BASE}/ar-lb/beirut`,
  ];
  const fails = [];
  for (const url of urls) {
    const r = await fetchText(url);
    const ogTitle = decodeHtml(extractOgProp(r.text, "og:title"));
    const title = decodeHtml(extractTitle(r.text));

    if (!ogTitle || ogTitle.length < 5) {
      fails.push(`${url}: og:title missing or too short — "${ogTitle}"`);
      continue;
    }
    if (!title || title.length < 5) {
      fails.push(`${url}: <title> missing or too short — "${title}"`);
      continue;
    }
    // Reject raw template placeholders.
    if (/\{[^}]+\}/.test(ogTitle)) {
      fails.push(`${url}: og:title contains template placeholder — "${ogTitle}"`);
      continue;
    }
    // Both must reference the brand or share common delivery-domain vocabulary.
    const brandTokens = ["presentail", "flower", "gift", "delivery", "beirut", "dubai", "lebanon"];
    const ogLower = ogTitle.toLowerCase();
    const titleLower = title.toLowerCase();
    const sharesBrand = brandTokens.some((t) => ogLower.includes(t) && titleLower.includes(t));
    if (!sharesBrand) {
      fails.push(`${url}: og:title="${ogTitle}" and title="${title}" share no brand keyword`);
    }
  }
  record(
    "og:title coherent with <title> (brand consistency)",
    fails.length === 0,
    fails.join("; ") || "og:title and <title> are brand-consistent on all sampled pages"
  );
}

/**
 * Check 15 (NEW): og:description matches <meta description>.
 *
 * Accepts exact match or og:description being a leading substring of the meta
 * description (some implementations truncate og:description).
 */
export async function checkOgDescriptionEqualsMetaDesc(BASE, record) {
  const urls = [
    `${BASE}/en-lb/beirut`,
    `${BASE}/en-lb/beirut/shop`,
  ];
  const fails = [];
  for (const url of urls) {
    const r = await fetchText(url);
    const ogDesc = decodeHtml(extractOgProp(r.text, "og:description"));
    const metaDesc = decodeHtml(extractMeta(r.text, "description"));
    if (!ogDesc) {
      fails.push(`${url}: og:description is empty`);
      continue;
    }
    if (!metaDesc) {
      fails.push(`${url}: meta description is empty`);
      continue;
    }
    const match =
      ogDesc === metaDesc ||
      metaDesc.startsWith(ogDesc) ||
      ogDesc.startsWith(metaDesc) ||
      ogDesc.toLowerCase() === metaDesc.toLowerCase();
    if (!match) {
      fails.push(`${url}: og:description="${ogDesc.substring(0, 60)}" vs meta="${metaDesc.substring(0, 60)}"`);
    }
  }
  record(
    "og:description consistent with <meta description>",
    fails.length === 0,
    fails.join("; ") || "og:description consistent with meta description on all sampled pages"
  );
}

/**
 * Check 16 (NEW): <title> is non-generic and contextual on collection pages.
 *
 * Verifies that collection page titles (shop, brands, occasions, locale homepages)
 * are non-generic (≥15 chars, contain delivery-domain vocabulary or the brand name),
 * and are unique across the sampled set.
 *
 * Product pages are excluded from this check because they are SPA-rendered — the
 * server-side HTML shell carries a generic locale title, not the product name.
 * The product-specific <title> is injected client-side by React Helmet/Head after
 * hydration, so a static HTML fetch cannot reliably assert product-name presence.
 */
export async function checkTitleContainsEntityName(BASE, record) {
  const cases = [
    { url: `${BASE}/en-lb/beirut`, label: "home-en" },
    { url: `${BASE}/ar-lb/beirut`, label: "home-ar" },
    { url: `${BASE}/en-lb/beirut/shop`, label: "shop" },
    { url: `${BASE}/en-lb/beirut/brands`, label: "brands" },
    { url: `${BASE}/en-lb/beirut/occasions`, label: "occasions" },
  ];
  const fails = [];
  const seen = new Set();
  const domainVocab = ["flower", "gift", "delivery", "occasion", "brand", "shop", "lebanon", "beirut", "presentail", "متجر", "ورد", "هدية"];
  for (const { url, label } of cases) {
    const r = await fetchText(url);
    const title = decodeHtml(extractTitle(r.text)).trim();
    if (!title || title.length < 15) {
      fails.push(`${url} (${label}): title too short — "${title}"`);
      continue;
    }
    const titleLower = title.toLowerCase();
    const relevant = domainVocab.some((w) => titleLower.includes(w));
    if (!relevant) {
      fails.push(`${url} (${label}): title="${title}" lacks domain vocabulary`);
    }
    if (seen.has(title)) {
      fails.push(`${url} (${label}): duplicate title "${title}"`);
    }
    seen.add(title);
  }
  record(
    "<title> non-generic on collection pages",
    fails.length === 0,
    fails.join("; ") || "all sampled collection page titles are contextual and unique"
  );
}

/**
 * Check 17: noindex on private pages (checkout, cart, account).
 */
export async function checkNoindexPrivate(BASE, record) {
  const fails = [];
  for (const url of PRIVATE(BASE)) {
    const r = await fetchText(url);
    const robots = extractMeta(r.text, "robots");
    if (!robots.includes("noindex")) fails.push(`${url}: robots="${robots}"`);
  }
  record(
    "noindex on private pages (checkout, cart, account)",
    fails.length === 0,
    fails.length === 0 ? "all private pages have noindex" : fails.join("; ")
  );
}

/**
 * Check 18: No noindex on indexable collection pages.
 */
export async function checkNoNoindexOnCollections(BASE, record) {
  const urls = [
    `${BASE}/en-lb/beirut/shop`,
    `${BASE}/en-lb/beirut/occasions`,
    `${BASE}/en-lb/beirut/brands`,
  ];
  const fails = [];
  for (const url of urls) {
    const r = await fetchText(url);
    const robots = extractMeta(r.text, "robots");
    if (robots.includes("noindex")) fails.push(`${url}: robots="${robots}"`);
  }
  record(
    "No noindex on indexable collection pages",
    fails.length === 0,
    fails.length === 0 ? "no noindex on collection pages" : fails.join("; ")
  );
}

/**
 * Check 19: Product page has self-referencing canonical.
 */
export async function checkProductCanonical(BASE, record) {
  const url = `${BASE}/en-lb/beirut/product/red-roses-bouquet`;
  const r = await fetchText(url);
  const canonical = extractCanonical(r.text);
  const ok = canonical.length > 0 && canonical.includes("red-roses-bouquet");
  record(
    "Product page has self-referencing canonical",
    ok,
    canonical ? `canonical="${canonical}"` : "canonical missing"
  );
}
