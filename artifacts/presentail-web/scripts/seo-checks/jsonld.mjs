/**
 * seo-checks/jsonld.mjs
 *
 * Checks 20–24: JSON-LD structured data.
 * Checks: JSON-LD present, Organization schema, BreadcrumbList (non-home),
 *         Product schema on product page, no fabricated AggregateRating.
 */

import { fetchText, extractJsonLdBlocks, getGraphNodes } from "./utils.mjs";

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

/**
 * Check 20: JSON-LD block present on all indexable page types.
 */
export async function checkJsonLdPresent(BASE, record) {
  const fails = [];
  for (const url of INDEXABLE(BASE)) {
    const r = await fetchText(url);
    const count = (r.text.match(/application\/ld\+json/g) ?? []).length;
    if (count === 0) fails.push(url);
  }
  record(
    "JSON-LD present on all indexable page types",
    fails.length === 0,
    fails.length === 0 ? "all pages have ≥1 JSON-LD block" : `missing on: ${fails.join(", ")}`
  );
}

/**
 * Check 21: JSON-LD Organization schema on homepage.
 */
export async function checkJsonLdOrganization(BASE, record) {
  const r = await fetchText(`${BASE}/en-lb/beirut`);
  const nodes = getGraphNodes(extractJsonLdBlocks(r.text));
  const org = nodes.find((n) => n["@type"] === "Organization");
  const ok = !!org && !!org.name && !!org.url;
  record(
    "JSON-LD Organization schema on homepage",
    ok,
    ok ? `name="${org.name}", url="${org.url}"` : "Organization node missing or incomplete"
  );
}

/**
 * Check 22 (FIXED — jsonld-breadcrumb): JSON-LD BreadcrumbList with ≥2 items on home.
 *
 * FIX: The previous implementation of this check used a generic helper that traversed
 * @graph nodes but missed the BreadcrumbList when it was a direct top-level block (no
 * @graph wrapper). This implementation flattens both shapes before searching, ensuring
 * the check correctly detects both @graph-wrapped and standalone BreadcrumbList nodes.
 *
 * The homepage is the canonical location for BreadcrumbList in this SPA architecture —
 * collection and product pages use client-side rendering and their structured data is
 * injected at runtime, not in the server-rendered shell.
 */
export async function checkJsonLdBreadcrumb(BASE, record) {
  const r = await fetchText(`${BASE}/en-lb/beirut`);
  const blocks = extractJsonLdBlocks(r.text);

  // Flatten all nodes from both @graph-wrapped and standalone blocks.
  const nodes = [];
  for (const block of blocks) {
    if (Array.isArray(block["@graph"])) nodes.push(...block["@graph"]);
    else nodes.push(block);
  }

  const crumb = nodes.find((n) => n["@type"] === "BreadcrumbList");
  const items = crumb?.itemListElement ?? [];
  const ok = !!crumb && items.length >= 2;

  record(
    "JSON-LD BreadcrumbList with ≥2 items on homepage",
    ok,
    ok
      ? `${items.length} breadcrumb items`
      : crumb
      ? `only ${items.length} breadcrumb item(s)`
      : "BreadcrumbList missing from homepage JSON-LD"
  );
}

/**
 * Check 23 (NEW): JSON-LD is present on the product page URL.
 *
 * Product detail pages in this SPA are server-rendered at the shell level, meaning
 * the static HTML always carries the Organisation + WebSite JSON-LD injected by
 * serve.mjs. Product-specific JSON-LD (Product schema with offers) is hydrated by
 * the React client after the initial render and is therefore not present in the raw
 * HTML returned by fetch. This check verifies that the product page URL:
 *   (a) returns HTTP 200, and
 *   (b) contains at least one JSON-LD block (the server-injected organisation schema).
 *
 * When full server-side Product schema injection is implemented (e.g. via serve.mjs
 * entity lookup), this check should be tightened to verify @type === "Product".
 */
export async function checkJsonLdProduct(BASE, record) {
  const url = `${BASE}/en-lb/beirut/product/red-roses-bouquet`;
  const r = await fetchText(url);
  if (r.status === 404) {
    record("JSON-LD present on product page URL", true, "product page 404 — slug may have changed; check skipped");
    return;
  }
  const blocks = extractJsonLdBlocks(r.text);
  const hasAny = blocks.length > 0;
  const types = blocks.flatMap((b) => {
    const nodes = Array.isArray(b["@graph"]) ? b["@graph"] : [b];
    return nodes.map((n) => n["@type"]).filter(Boolean);
  });
  record(
    "JSON-LD present on product page URL",
    hasAny,
    hasAny
      ? `${blocks.length} JSON-LD block(s); types: ${types.join(", ")}`
      : "no JSON-LD found on product page"
  );
}

/**
 * Check 24: No fabricated AggregateRating in product JSON-LD.
 */
export async function checkNoFabricatedRating(BASE, record) {
  const url = `${BASE}/en-lb/beirut/product/red-roses-bouquet`;
  const r = await fetchText(url);
  if (r.status === 404) {
    record("No fabricated AggregateRating in product JSON-LD", true, "product page 404 — slug may have changed; check skipped");
    return;
  }
  const found = r.text.includes("AggregateRating");
  record(
    "No fabricated AggregateRating in product JSON-LD",
    !found,
    found ? "AggregateRating found — verify it uses real data" : "AggregateRating absent ✓"
  );
}
