#!/usr/bin/env node
/**
 * check-nonproduct-jsonld-schema.mjs
 *
 * CI guard for the storefront's NON-product rich-result JSON-LD.
 *
 * Besides the product Offer (Merchant Listing) JSON-LD — which has its own
 * strict guard in check-product-jsonld-schema.mjs — the storefront also emits:
 *   BreadcrumbList, FAQPage, Organization, WebSite, LocalBusiness,
 *   WebPage, ContactPage, ItemList, and Article JSON-LD.
 *
 * Those were only soft-checked by the in-module `validateJsonLd` in
 * seo-inject.mjs, which merely `console.warn`s and is a no-op in production —
 * so a refactor that drops a required field (e.g. breadcrumb itemListElement
 * positions, FAQ acceptedAnswer, Organization url, Article datePublished) ships
 * silently and quietly loses the rich result in Google Search.
 *
 * This check builds the REAL heads (via the same builders serve.mjs uses) for a
 * set of representative fixtures, extracts every JSON-LD node that ships to
 * crawlers (flattening @graph wrappers), and asserts every required field per
 * @type is present AND well-formed. It also asserts every expected @type is
 * actually emitted at least once, so a refactor that silently stops emitting a
 * schema is caught too. It fails loudly (exit 1) so a regression is caught in
 * CI, never in production.
 *
 * Required field sets validated here:
 *   Organization / WebSite / LocalBusiness / WebPage / ContactPage : name, url
 *   Article                                                   : headline, datePublished, dateModified
 *   FAQPage          : mainEntity[].{name, acceptedAnswer.text}
 *   BreadcrumbList   : itemListElement[].{position, name}; item (URL) on every
 *                      crumb except the last; positions are 1..N in order
 *   ItemList         : itemListElement[].{position, name}; positions 1..N
 *
 * Exits 0 on PASS, 1 on FAIL.
 *
 * Usage:
 *   node artifacts/presentail-web/scripts/check-nonproduct-jsonld-schema.mjs
 */

import { fileURLToPath } from "node:url";
import {
  buildSeoHead,
  buildProductHead,
  buildBlogPostHead,
  buildBrandHead,
  buildCategoryHead,
  buildOccasionHead,
} from "../seo-inject.mjs";

const ORIGIN = "https://presentail.test";
const SHARED_OPTS = { origin: ORIGIN, basePath: "" };

const SAMPLE_PRODUCT = {
  name: "Grand Rose Box",
  description: "An opulent box of 100 long-stem roses.",
  image: { uri: "https://cdn.test/grand-rose-box.jpg" },
  priceValue: 499,
  wcId: 1001,
  inStock: true,
  categories: ["luxury-bouquets"],
};

const SAMPLE_ARTICLE = {
  title: "The Art of Gifting Flowers",
  description: "A guide to choosing the perfect bouquet for every occasion.",
  datePublished: "2026-01-15",
  ogImage: { url: "/blog/art-of-gifting.webp", width: 1200, height: 630 },
};

const SAMPLE_LISTING_ITEMS = [
  { name: "Velvet Rose Bouquet", slug: "velvet-rose-bouquet", image: "https://cdn.test/velvet.jpg" },
  { name: "Orchid Arrangement", slug: "orchid-arrangement", image: "https://cdn.test/orchid.jpg" },
];

/**
 * Each fixture produces a head snippet via the same builder serve.mjs uses, and
 * declares which JSON-LD @types it is expected to contain. The `expectTypes`
 * are aggregated across all fixtures to assert full coverage.
 */
export const NONPRODUCT_FIXTURES = [
  {
    label: "Landing homepage (/)",
    expectTypes: ["Organization", "WebSite"],
    build: () => buildSeoHead("/", SHARED_OPTS).headSnippet,
  },
  {
    label: "Locale city homepage (/en-lb/beirut)",
    expectTypes: ["Organization", "WebSite", "LocalBusiness", "BreadcrumbList"],
    build: () => buildSeoHead("/en-lb/beirut", SHARED_OPTS).headSnippet,
  },
  {
    label: "Terms page (/en-lb/beirut/terms)",
    expectTypes: ["Organization", "WebPage", "BreadcrumbList"],
    build: () => buildSeoHead("/en-lb/beirut/terms", SHARED_OPTS).headSnippet,
  },
  {
    label: "Contact page (/en-lb/beirut/contact)",
    expectTypes: ["Organization", "ContactPage", "BreadcrumbList"],
    build: () => buildSeoHead("/en-lb/beirut/contact", SHARED_OPTS).headSnippet,
  },
  {
    label: "FAQs page (/en-lb/beirut/faqs)",
    expectTypes: ["Organization", "FAQPage", "BreadcrumbList"],
    build: () => buildSeoHead("/en-lb/beirut/faqs", SHARED_OPTS).headSnippet,
  },
  {
    label: "Shop page (/en-lb/beirut/shop)",
    expectTypes: ["Organization", "FAQPage", "BreadcrumbList"],
    build: () => buildSeoHead("/en-lb/beirut/shop", SHARED_OPTS).headSnippet,
  },
  {
    label: "Brands listing page (/en-lb/beirut/brands)",
    expectTypes: ["Organization", "FAQPage", "BreadcrumbList"],
    build: () => buildSeoHead("/en-lb/beirut/brands", SHARED_OPTS).headSnippet,
  },
  {
    label: "Occasions listing page (/en-lb/beirut/occasions)",
    expectTypes: ["Organization", "FAQPage", "BreadcrumbList"],
    build: () => buildSeoHead("/en-lb/beirut/occasions", SHARED_OPTS).headSnippet,
  },
  {
    label: "Product page (/en-lb/beirut/product/grand-rose-box)",
    expectTypes: ["Organization", "BreadcrumbList"],
    build: () =>
      buildProductHead({
        ...SHARED_OPTS,
        product: SAMPLE_PRODUCT,
        imageDimensions: { width: 1200, height: 800 },
        lang: "en",
        pathname: "/en-lb/beirut/product/grand-rose-box",
        cityLabel: "Beirut",
        countryLabel: "Lebanon",
        countryCode: "LB",
      }).headSnippet,
  },
  {
    label: "Blog post (/en-lb/beirut/blog/art-of-gifting)",
    expectTypes: ["Organization", "Article", "BreadcrumbList"],
    build: () =>
      buildBlogPostHead({
        ...SHARED_OPTS,
        article: SAMPLE_ARTICLE,
        lang: "en",
        pathname: "/en-lb/beirut/blog/art-of-gifting",
      }).headSnippet,
  },
  {
    label: "Brand page (/en-lb/beirut/brand/floral-house)",
    expectTypes: ["Organization", "BreadcrumbList"],
    build: () =>
      buildBrandHead({
        ...SHARED_OPTS,
        brand: { name: "Floral House", description: "Artisan florists.", image: "https://cdn.test/brand.jpg" },
        imageDimensions: { width: 1200, height: 800 },
        lang: "en",
        pathname: "/en-lb/beirut/brand/floral-house",
      }).headSnippet,
  },
  {
    label: "Category page (/en-lb/beirut/category/roses)",
    expectTypes: ["Organization", "BreadcrumbList", "ItemList"],
    build: () =>
      buildCategoryHead({
        ...SHARED_OPTS,
        category: { name: "Roses", description: "Long-stem roses.", image: "https://cdn.test/roses.jpg" },
        imageDimensions: { width: 1200, height: 800 },
        lang: "en",
        pathname: "/en-lb/beirut/category/roses",
        search: "",
        cityLabel: "Beirut",
        countryLabel: "Lebanon",
        productCount: 12,
        items: SAMPLE_LISTING_ITEMS,
      }).headSnippet,
  },
  {
    label: "Occasion page (/en-lb/beirut/occasion/birthday)",
    expectTypes: ["Organization", "BreadcrumbList", "ItemList"],
    build: () =>
      buildOccasionHead({
        ...SHARED_OPTS,
        occasion: { name: "Birthday", description: "Birthday gifts.", image: "https://cdn.test/birthday.jpg" },
        imageDimensions: { width: 1200, height: 800 },
        lang: "en",
        pathname: "/en-lb/beirut/occasion/birthday",
        search: "",
        cityLabel: "Beirut",
        countryLabel: "Lebanon",
        productCount: 8,
        items: SAMPLE_LISTING_ITEMS,
      }).headSnippet,
  },
  // Arabic locale fixture — validates Organization on a non-home page and that
  // BreadcrumbList names are in Arabic (not English) for AR routes.
  {
    label: "Arabic shop page (/ar-lb/beirut/shop) — localized breadcrumb",
    expectTypes: ["Organization", "FAQPage", "BreadcrumbList"],
    build: () => {
      const snippet = buildSeoHead("/ar-lb/beirut/shop", SHARED_OPTS).headSnippet;
      // Assert the breadcrumb uses the Arabic label "تسوّق" not the EN label "Shop"
      const nodes = extractAllJsonLd(snippet);
      const crumb = nodes.find((n) => n["@type"] === "BreadcrumbList");
      if (!crumb) return snippet; // will fail in expectTypes check
      const lastItem = crumb.itemListElement?.[crumb.itemListElement.length - 1];
      if (lastItem?.name !== "تسوّق") {
        throw new Error(
          `AR breadcrumb name must be "تسوّق" (Arabic) but got "${lastItem?.name}". ` +
          "ROUTE_CRUMB_LABELS must provide locale-specific labels for every supported language.",
        );
      }
      return snippet;
    },
  },
  // French locale fixture — validates Organization on a non-home page and that
  // BreadcrumbList names are in French for FR routes.
  {
    label: "French brands page (/fr-lb/beirut/brands) — localized breadcrumb",
    expectTypes: ["Organization", "FAQPage", "BreadcrumbList"],
    build: () => {
      const snippet = buildSeoHead("/fr-lb/beirut/brands", SHARED_OPTS).headSnippet;
      const nodes = extractAllJsonLd(snippet);
      const crumb = nodes.find((n) => n["@type"] === "BreadcrumbList");
      if (!crumb) return snippet;
      const lastItem = crumb.itemListElement?.[crumb.itemListElement.length - 1];
      if (lastItem?.name !== "Marques") {
        throw new Error(
          `FR breadcrumb name must be "Marques" (French) but got "${lastItem?.name}". ` +
          "ROUTE_CRUMB_LABELS must provide locale-specific labels for every supported language.",
        );
      }
      return snippet;
    },
  },
];

// Every @type a non-product fixture is expected to emit somewhere across the
// suite. If any of these never appears, a builder silently stopped emitting it.
export const EXPECTED_TYPES = [
  "Organization",
  "WebSite",
  "LocalBusiness",
  "WebPage",
  "ContactPage",
  "FAQPage",
  "BreadcrumbList",
  "ItemList",
  "Article",
];

/**
 * Pull every JSON-LD node out of a head snippet, flattening @graph wrappers.
 * Returns an array of nodes (each retaining its own @type).
 */
export function extractAllJsonLd(headSnippet) {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  const nodes = [];
  let m;
  while ((m = re.exec(headSnippet)) !== null) {
    let parsed;
    try {
      parsed = JSON.parse(m[1]);
    } catch {
      continue;
    }
    if (Array.isArray(parsed?.["@graph"])) {
      for (const node of parsed["@graph"]) if (node && typeof node === "object") nodes.push(node);
    } else if (parsed && typeof parsed === "object") {
      nodes.push(parsed);
    }
  }
  return nodes;
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim() !== "";
}

function isUrl(v) {
  return isNonEmptyString(v) && /^https?:\/\//.test(v);
}

function isPositiveInteger(v) {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

function validateNameUrl(node, type) {
  const errors = [];
  if (!isNonEmptyString(node.name)) {
    errors.push(`${type}.name must be a non-empty string (got ${JSON.stringify(node.name)})`);
  }
  if (!isUrl(node.url)) {
    errors.push(`${type}.url must be an http(s) URL (got ${JSON.stringify(node.url)})`);
  }
  return errors;
}

function validateArticle(node) {
  const errors = [];
  if (!isNonEmptyString(node.headline)) {
    errors.push(`Article.headline must be a non-empty string (got ${JSON.stringify(node.headline)})`);
  }
  if (!isNonEmptyString(node.datePublished)) {
    errors.push(`Article.datePublished must be a non-empty string (got ${JSON.stringify(node.datePublished)})`);
  }
  if (!isNonEmptyString(node.dateModified)) {
    errors.push(`Article.dateModified must be a non-empty string (got ${JSON.stringify(node.dateModified)})`);
  }
  return errors;
}

function validateFaqPage(node) {
  const errors = [];
  const entities = node.mainEntity;
  if (!Array.isArray(entities) || entities.length === 0) {
    return ["FAQPage.mainEntity must be a non-empty array"];
  }
  entities.forEach((q, i) => {
    if (!q || typeof q !== "object") {
      errors.push(`FAQPage.mainEntity[${i}] is not an object`);
      return;
    }
    if (q["@type"] !== "Question") {
      errors.push(`FAQPage.mainEntity[${i}].@type must be "Question" (got ${JSON.stringify(q["@type"])})`);
    }
    if (!isNonEmptyString(q.name)) {
      errors.push(`FAQPage.mainEntity[${i}].name must be a non-empty string`);
    }
    const ans = q.acceptedAnswer;
    if (!ans || typeof ans !== "object") {
      errors.push(`FAQPage.mainEntity[${i}].acceptedAnswer must be an object`);
    } else {
      if (ans["@type"] !== "Answer") {
        errors.push(`FAQPage.mainEntity[${i}].acceptedAnswer.@type must be "Answer" (got ${JSON.stringify(ans["@type"])})`);
      }
      if (!isNonEmptyString(ans.text)) {
        errors.push(`FAQPage.mainEntity[${i}].acceptedAnswer.text must be a non-empty string`);
      }
    }
  });
  return errors;
}

function validateListItems(node, type, { requireItemExceptLast }) {
  const errors = [];
  const list = node.itemListElement;
  if (!Array.isArray(list) || list.length === 0) {
    return [`${type}.itemListElement must be a non-empty array`];
  }
  list.forEach((li, i) => {
    if (!li || typeof li !== "object") {
      errors.push(`${type}.itemListElement[${i}] is not an object`);
      return;
    }
    if (li["@type"] !== "ListItem") {
      errors.push(`${type}.itemListElement[${i}].@type must be "ListItem" (got ${JSON.stringify(li["@type"])})`);
    }
    if (!isPositiveInteger(li.position)) {
      errors.push(`${type}.itemListElement[${i}].position must be a positive integer (got ${JSON.stringify(li.position)})`);
    } else if (li.position !== i + 1) {
      errors.push(`${type}.itemListElement[${i}].position must be ${i + 1} to match its order (got ${li.position})`);
    }
    if (!isNonEmptyString(li.name)) {
      errors.push(`${type}.itemListElement[${i}].name must be a non-empty string`);
    }
    const isLast = i === list.length - 1;
    if (requireItemExceptLast && !isLast && !isUrl(li.item)) {
      errors.push(`${type}.itemListElement[${i}].item must be an http(s) URL (only the final crumb may omit it; got ${JSON.stringify(li.item)})`);
    }
  });
  return errors;
}

/**
 * Validate a single JSON-LD node against its @type's required field set.
 * Unknown @types return [] (not our concern here). Product is skipped — it has
 * its own dedicated guard.
 */
export function validateNode(node) {
  if (!node || typeof node !== "object") return ["JSON-LD node is missing"];
  const type = node["@type"];
  switch (type) {
    case "Organization":
    case "WebSite":
    case "LocalBusiness":
    case "WebPage":
    case "ContactPage":
      return validateNameUrl(node, type);
    case "Article":
      return validateArticle(node);
    case "FAQPage":
      return validateFaqPage(node);
    case "BreadcrumbList":
      return validateListItems(node, type, { requireItemExceptLast: true });
    case "ItemList":
      return validateListItems(node, type, { requireItemExceptLast: false });
    default:
      return [];
  }
}

/**
 * Run the check across every fixture. Returns the process exit code (0/1) and
 * logs a human-readable report. Exported so a unit test can drive it too.
 */
export function runCheck() {
  const failures = [];
  const seenTypes = new Set();

  for (const fixture of NONPRODUCT_FIXTURES) {
    let nodes;
    try {
      nodes = extractAllJsonLd(fixture.build());
    } catch (err) {
      failures.push({ label: fixture.label, errors: [`threw while building head: ${err?.message ?? err}`] });
      continue;
    }

    const errors = [];
    const typesInFixture = new Set();
    for (const node of nodes) {
      const t = node?.["@type"];
      if (isNonEmptyString(t)) {
        typesInFixture.add(t);
        seenTypes.add(t);
      }
      for (const e of validateNode(node)) errors.push(e);
    }

    // Each fixture must emit the schema types it promises — a builder that
    // silently drops one would otherwise pass the per-node validation.
    for (const expected of fixture.expectTypes) {
      if (!typesInFixture.has(expected)) {
        errors.push(`expected a ${expected} JSON-LD node but none was emitted`);
      }
    }

    if (errors.length > 0) failures.push({ label: fixture.label, errors });
  }

  // Global coverage: every expected @type must appear in at least one fixture.
  const missingGlobally = EXPECTED_TYPES.filter((t) => !seenTypes.has(t));
  if (missingGlobally.length > 0) {
    failures.push({
      label: "Global coverage",
      errors: missingGlobally.map((t) => `no fixture emitted a ${t} JSON-LD node anywhere`),
    });
  }

  if (failures.length > 0) {
    console.error("NON-PRODUCT JSON-LD RICH-RESULT CHECK FAILED:\n");
    for (const f of failures) {
      console.error(`  ✗ ${f.label}`);
      for (const e of f.errors) console.error(`      - ${e}`);
    }
    console.error(
      `\n${failures.length} fixture(s) emit invalid or missing rich-result JSON-LD.\n` +
        "Fix the matching builder in artifacts/presentail-web/seo-inject.mjs\n" +
        "(buildBreadcrumbListSchema, the FAQPage block in computeSeoHead,\n" +
        "buildOrganizationSchema/buildWebSiteSchema/buildLocalBusinessSchema,\n" +
        "buildWebPageSchema/buildContactPageSchema, buildItemListSchema, or the\n" +
        "Article block in buildBlogPostHead) so every required field is present —\n" +
        "otherwise Google silently drops the rich result.",
    );
    return 1;
  }

  console.log(
    `Non-product JSON-LD rich-result check passed — ${NONPRODUCT_FIXTURES.length} fixtures, ` +
      `all ${EXPECTED_TYPES.length} schema types present with every required field well-formed.`,
  );
  return 0;
}

// Only run (and exit) when invoked directly, so test imports stay side-effect free.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  process.exit(runCheck());
}
