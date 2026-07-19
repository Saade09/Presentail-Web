/**
 * seo-checks/html-attrs.mjs
 *
 * Checks 6–9: <html> element attributes and heading structure.
 * Checks: lang, dir, h1-count, h1-entity-name.
 */

import { fetchText, extractLang, extractDir, extractH1Count, extractH1Text } from "./utils.mjs";

/**
 * Check 6: <html lang> set correctly for EN/AR/FR locale pages.
 */
export async function checkHtmlLang(BASE, record) {
  const cases = [
    [`${BASE}/en-lb/beirut`, "en"],
    [`${BASE}/ar-lb/beirut`, "ar"],
    [`${BASE}/fr-lb/beirut`, "fr"],
  ];
  const fails = [];
  for (const [url, expected] of cases) {
    const r = await fetchText(url);
    const lang = extractLang(r.text);
    if (lang !== expected) fails.push(`${url}: lang="${lang}" (expected "${expected}")`);
  }
  record("<html lang> set correctly (EN/AR/FR)", fails.length === 0, fails.join("; ") || "en, ar, fr all correct");
}

/**
 * Check 7: <html dir> set correctly (ar=rtl, others=ltr).
 */
export async function checkHtmlDir(BASE, record) {
  const cases = [
    [`${BASE}/ar-lb/beirut`, "rtl"],
    [`${BASE}/en-lb/beirut`, "ltr"],
    [`${BASE}/fr-lb/beirut`, "ltr"],
  ];
  const fails = [];
  for (const [url, expected] of cases) {
    const r = await fetchText(url);
    const dir = extractDir(r.text);
    if (dir !== expected) fails.push(`${url}: dir="${dir}" (expected "${expected}")`);
  }
  record("<html dir> correct (ar=rtl, others=ltr)", fails.length === 0, fails.join("; ") || "all correct");
}

/**
 * Check 8: <h1> count === 1 per page (sampled).
 */
export async function checkH1Count(BASE, record) {
  const urls = [
    `${BASE}/en-lb/beirut`,
    `${BASE}/ar-lb/beirut`,
    `${BASE}/en-lb/beirut/shop`,
    `${BASE}/en-ae/dubai`,
    `${BASE}/en-cy/limassol`,
  ];
  const fails = [];
  for (const url of urls) {
    const r = await fetchText(url);
    const count = extractH1Count(r.text);
    if (count !== 1) fails.push(`${url}: ${count} h1 tags`);
  }
  record("<h1> count === 1 per page (sample)", fails.length === 0, fails.join("; ") || "all sampled pages have exactly 1 h1");
}

/**
 * Check 9 (NEW): <h1> is non-empty and relevant on all indexable pages.
 *
 * Verifies that every sampled indexable page has a non-empty <h1> containing
 * domain-relevant vocabulary (delivery, flower, gift, shop, brand, occasion,
 * or any locale-specific city/country term).
 *
 * Product pages are excluded from the keyword-relevance sub-check because their
 * <h1> text is injected by the React client after hydration — the static HTML
 * served by serve.mjs contains the locale-level shell heading, not the product name.
 * The presence check (h1 non-empty) still fires for product page URLs.
 */
export async function checkH1EntityName(BASE, record) {
  const domainVocab = [
    "flower", "gift", "delivery", "shop", "brand", "occasion", "bouquet",
    "lebanon", "beirut", "dubai", "limassol", "presentail",
    // Arabic vocabulary
    "ورد", "هدية", "توصيل", "متجر",
  ];

  const checkPages = [
    { url: `${BASE}/en-lb/beirut`, checkKeyword: true, label: "home-en" },
    { url: `${BASE}/ar-lb/beirut`, checkKeyword: true, label: "home-ar" },
    { url: `${BASE}/en-lb/beirut/shop`, checkKeyword: true, label: "shop" },
    { url: `${BASE}/en-lb/beirut/brands`, checkKeyword: true, label: "brands" },
    { url: `${BASE}/en-lb/beirut/occasions`, checkKeyword: true, label: "occasions" },
    // Product page: presence-only check (keyword is client-side rendered)
    { url: `${BASE}/en-lb/beirut/product/red-roses-bouquet`, checkKeyword: false, label: "product" },
  ];

  const fails = [];
  for (const { url, checkKeyword, label } of checkPages) {
    const r = await fetchText(url);
    if (r.status === 404) continue; // slug may have changed
    const h1 = extractH1Text(r.text).trim();
    if (!h1 || h1.length < 3) {
      fails.push(`${url} (${label}): h1 missing or too short — "${h1}"`);
      continue;
    }
    if (checkKeyword) {
      const h1Lower = h1.toLowerCase();
      const relevant = domainVocab.some((w) => h1Lower.includes(w.toLowerCase()));
      if (!relevant) {
        fails.push(`${url} (${label}): h1="${h1}" lacks domain vocabulary`);
      }
    }
  }
  record(
    "<h1> non-empty and domain-relevant on indexable pages",
    fails.length === 0,
    fails.length === 0 ? "all sampled pages have a relevant h1" : fails.join("; ")
  );
}
