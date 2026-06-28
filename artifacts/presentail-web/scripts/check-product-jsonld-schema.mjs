#!/usr/bin/env node
/**
 * check-product-jsonld-schema.mjs
 *
 * CI guard for the product rich-result (Merchant Listing) JSON-LD.
 *
 * The product page Offer JSON-LD emits `shippingDetails` +
 * `hasMerchantReturnPolicy` (built in seo-inject.mjs's
 * buildOfferDeliveryAndReturns) so listings qualify for Google's free /
 * enhanced merchant results. Google disqualifies a listing (or downgrades it
 * to a plain result, losing the free-listing eligibility) when any required
 * field is missing or malformed — and that happens silently: nothing in the
 * page breaks, the warning only shows up days later in Search Console.
 *
 * This check builds the real product head (via buildProductHead) for a set of
 * representative fixtures (free-shipping vs surcharge, every served country,
 * in-stock vs out-of-stock), extracts the Product Offer JSON-LD that ships to
 * crawlers, and asserts every required Merchant Listing field is present AND
 * well-formed. It fails loudly (exit 1) so a future refactor that drops a field
 * is caught in CI, never in production.
 *
 * Required field set (Google Merchant Listing structured data):
 *   offers.price
 *   offers.priceCurrency
 *   offers.availability
 *   offers.shippingDetails.shippingRate.value
 *   offers.shippingDetails.shippingRate.currency
 *   offers.shippingDetails.shippingDestination.addressCountry
 *   offers.hasMerchantReturnPolicy.applicableCountry
 *   offers.hasMerchantReturnPolicy.returnPolicyCategory
 *   offers.hasMerchantReturnPolicy.merchantReturnDays
 *   offers.hasMerchantReturnPolicy.returnMethod
 *   offers.hasMerchantReturnPolicy.returnFees
 *
 * Exits 0 on PASS, 1 on FAIL.
 *
 * Usage:
 *   node artifacts/presentail-web/scripts/check-product-jsonld-schema.mjs
 */

import { fileURLToPath } from "node:url";
import { buildProductHead } from "../seo-inject.mjs";

/**
 * Representative product fixtures. Each is a priced, real-shaped product so the
 * Offer block (and its shipping/return enrichment) is emitted. Together they
 * exercise: free-shipping (price at/above the country threshold → rate 0),
 * paid-shipping (price below threshold → surcharge), every served country, and
 * the out-of-stock availability branch.
 */
export const PRODUCT_FIXTURES = [
  {
    label: "Lebanon — high price (free-shipping branch)",
    countryCode: "LB",
    cityLabel: "Beirut",
    countryLabel: "Lebanon",
    pathname: "/en-lb/beirut/product/grand-rose-box",
    product: {
      name: "Grand Rose Box",
      description: "An opulent box of 100 long-stem roses.",
      image: { uri: "https://cdn.test/grand-rose-box.jpg" },
      priceValue: 499,
      wcId: 1001,
      inStock: true,
      categories: ["luxury-bouquets"],
    },
  },
  {
    label: "Lebanon — low price (surcharge branch)",
    countryCode: "LB",
    cityLabel: "Beirut",
    countryLabel: "Lebanon",
    pathname: "/en-lb/beirut/product/single-rose",
    product: {
      name: "Single Rose",
      description: "A single hand-tied red rose.",
      image: { uri: "https://cdn.test/single-rose.jpg" },
      priceValue: 9.99,
      wcId: 1002,
      inStock: true,
      categories: ["hand-bouquets"],
    },
  },
  {
    label: "UAE — in stock",
    countryCode: "AE",
    cityLabel: "Dubai",
    countryLabel: "United Arab Emirates",
    pathname: "/en-ae/dubai/product/velvet-rose-bouquet",
    product: {
      name: "Velvet Rose Bouquet",
      description: "A dozen long-stem velvet roses, hand-tied.",
      image: { uri: "https://cdn.test/velvet.jpg" },
      priceValue: 89.5,
      wcId: 2001,
      inStock: true,
      categories: ["roses"],
    },
  },
  {
    label: "Cyprus — in stock",
    countryCode: "CY",
    cityLabel: "Nicosia",
    countryLabel: "Cyprus",
    pathname: "/en-cy/nicosia/product/orchid-arrangement",
    product: {
      name: "Orchid Arrangement",
      description: "A serene orchid arrangement in a ceramic pot.",
      image: { uri: "https://cdn.test/orchid.jpg" },
      priceValue: 65,
      wcId: 3001,
      inStock: true,
      categories: ["plants"],
    },
  },
  {
    label: "UAE — out of stock (availability branch)",
    countryCode: "AE",
    cityLabel: "Dubai",
    countryLabel: "United Arab Emirates",
    pathname: "/en-ae/dubai/product/sold-out-tulips",
    product: {
      name: "Sold Out Tulips",
      description: "Seasonal tulips, currently unavailable.",
      image: { uri: "https://cdn.test/tulips.jpg" },
      priceValue: 45,
      wcId: 2002,
      inStock: false,
      categories: ["tulips"],
    },
  },
];

const SHARED_OPTS = {
  imageDimensions: { width: 1200, height: 800 },
  lang: "en",
  basePath: "",
  origin: "https://presentail.test",
};

/**
 * Pull every JSON-LD object out of a head snippet, flattening @graph wrappers,
 * and return the first Product node. Returns null when none is present.
 */
export function extractProductSchema(headSnippet) {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(headSnippet)) !== null) {
    let parsed;
    try {
      parsed = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const nodes = Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [parsed];
    for (const node of nodes) {
      if (node && node["@type"] === "Product") return node;
    }
  }
  return null;
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim() !== "";
}

function isSchemaOrgUrl(v) {
  return isNonEmptyString(v) && /^https?:\/\/schema\.org\//.test(v);
}

function isPositiveNumericString(v) {
  return isNonEmptyString(v) && Number.isFinite(Number(v)) && Number(v) > 0;
}

function isNonNegativeNumericString(v) {
  return isNonEmptyString(v) && Number.isFinite(Number(v)) && Number(v) >= 0;
}

/**
 * Validate a single Product JSON-LD node against Google's required Merchant
 * Listing field set. Returns an array of human-readable error strings; empty
 * means the node is valid.
 */
export function validateProductOffer(product) {
  const errors = [];
  if (!product || typeof product !== "object") {
    return ["Product JSON-LD node is missing"];
  }

  const offer = product.offers;
  if (!offer || typeof offer !== "object" || Array.isArray(offer)) {
    return ['Product is missing a single "offers" object'];
  }

  // Core offer fields.
  if (!isPositiveNumericString(offer.price)) {
    errors.push(`offers.price must be a positive numeric string (got ${JSON.stringify(offer.price)})`);
  }
  if (!isNonEmptyString(offer.priceCurrency)) {
    errors.push(`offers.priceCurrency must be a non-empty string (got ${JSON.stringify(offer.priceCurrency)})`);
  }
  if (!isSchemaOrgUrl(offer.availability)) {
    errors.push(`offers.availability must be a schema.org URL (got ${JSON.stringify(offer.availability)})`);
  }

  // shippingDetails.
  const shipping = offer.shippingDetails;
  if (!shipping || typeof shipping !== "object") {
    errors.push("offers.shippingDetails is missing");
  } else {
    const rate = shipping.shippingRate;
    if (!rate || typeof rate !== "object") {
      errors.push("offers.shippingDetails.shippingRate is missing");
    } else {
      if (!isNonNegativeNumericString(rate.value)) {
        errors.push(`offers.shippingDetails.shippingRate.value must be a non-negative numeric string (got ${JSON.stringify(rate.value)})`);
      }
      if (!isNonEmptyString(rate.currency)) {
        errors.push(`offers.shippingDetails.shippingRate.currency must be a non-empty string (got ${JSON.stringify(rate.currency)})`);
      }
    }
    const dest = shipping.shippingDestination;
    if (!dest || typeof dest !== "object") {
      errors.push("offers.shippingDetails.shippingDestination is missing");
    } else if (!isNonEmptyString(dest.addressCountry)) {
      errors.push(`offers.shippingDetails.shippingDestination.addressCountry must be a non-empty string (got ${JSON.stringify(dest.addressCountry)})`);
    }
  }

  // hasMerchantReturnPolicy.
  const policy = offer.hasMerchantReturnPolicy;
  if (!policy || typeof policy !== "object") {
    errors.push("offers.hasMerchantReturnPolicy is missing");
  } else {
    if (!isNonEmptyString(policy.applicableCountry)) {
      errors.push(`offers.hasMerchantReturnPolicy.applicableCountry must be a non-empty string (got ${JSON.stringify(policy.applicableCountry)})`);
    }
    if (!isSchemaOrgUrl(policy.returnPolicyCategory)) {
      errors.push(`offers.hasMerchantReturnPolicy.returnPolicyCategory must be a schema.org URL (got ${JSON.stringify(policy.returnPolicyCategory)})`);
    }
    if (typeof policy.merchantReturnDays !== "number" || !Number.isInteger(policy.merchantReturnDays) || policy.merchantReturnDays < 0) {
      errors.push(`offers.hasMerchantReturnPolicy.merchantReturnDays must be a non-negative integer (got ${JSON.stringify(policy.merchantReturnDays)})`);
    }
    if (!isSchemaOrgUrl(policy.returnMethod)) {
      errors.push(`offers.hasMerchantReturnPolicy.returnMethod must be a schema.org URL (got ${JSON.stringify(policy.returnMethod)})`);
    }
    if (!isSchemaOrgUrl(policy.returnFees)) {
      errors.push(`offers.hasMerchantReturnPolicy.returnFees must be a schema.org URL (got ${JSON.stringify(policy.returnFees)})`);
    }
  }

  return errors;
}

/**
 * Run the check across every fixture. Returns the process exit code (0/1) and
 * logs a human-readable report. Exported so a unit test can drive it too.
 */
export function runCheck() {
  const failures = [];

  for (const fixture of PRODUCT_FIXTURES) {
    let product;
    try {
      const { headSnippet } = buildProductHead({
        ...SHARED_OPTS,
        product: fixture.product,
        pathname: fixture.pathname,
        cityLabel: fixture.cityLabel,
        countryLabel: fixture.countryLabel,
        countryCode: fixture.countryCode,
      });
      product = extractProductSchema(headSnippet);
    } catch (err) {
      failures.push({ label: fixture.label, errors: [`threw while building head: ${err?.message ?? err}`] });
      continue;
    }
    const errors = validateProductOffer(product);
    if (errors.length > 0) failures.push({ label: fixture.label, errors });
  }

  if (failures.length > 0) {
    console.error("PRODUCT JSON-LD MERCHANT LISTING CHECK FAILED:\n");
    for (const f of failures) {
      console.error(`  ✗ ${f.label}`);
      for (const e of f.errors) console.error(`      - ${e}`);
    }
    console.error(
      `\n${failures.length} of ${PRODUCT_FIXTURES.length} product fixture(s) emit invalid Merchant Listing JSON-LD.\n` +
        "Fix buildOfferDeliveryAndReturns / buildProductHead in artifacts/presentail-web/seo-inject.mjs\n" +
        "so the product Offer carries every required field — otherwise Google disqualifies the free listing.",
    );
    return 1;
  }

  console.log(
    `Product JSON-LD Merchant Listing check passed — ${PRODUCT_FIXTURES.length} fixtures, all required Offer fields present and well-formed.`,
  );
  return 0;
}

// Only run (and exit) when invoked directly, so test imports stay side-effect free.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  process.exit(runCheck());
}
