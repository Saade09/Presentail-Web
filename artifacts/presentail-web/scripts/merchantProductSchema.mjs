/**
 * Pure, dependency-free merchant product schema builder.
 *
 * Produces the Schema.org Product JSON-LD node required for Google's Merchant
 * Listings (Shopping) rich results. Imported by:
 *   - scripts/src/merchantRichResult.test.ts  (unit tests)
 *
 * Intentionally kept free of all workspace imports so it can be imported from
 * the scripts package without pulling in the full web-artifact dependency graph.
 * The values below are kept in sync with seo-inject.mjs and @workspace/delivery;
 * any change to those sources must be reflected here too.
 *
 * Exported API:
 *   buildProductSchema(params)  — Schema.org Product JSON-LD node (plain object)
 *   buildOfferShipping(params)  — shippingDetails + hasMerchantReturnPolicy sub-nodes
 *   RETURN_WINDOW_DAYS          — satisfaction-guarantee return window in days
 *   LB_STANDARD_SHIPPING_USD   — LB below-threshold standard delivery fee in USD
 */

// Keep in sync with RETURN_WINDOW_DAYS in seo-inject.mjs.
export const RETURN_WINDOW_DAYS = 7;

// Standard delivery fee in USD for LB orders that are below the free-delivery
// threshold. AE and CY always ship free (see buildOfferShipping).
export const LB_STANDARD_SHIPPING_USD = 3;

// Free delivery threshold in USD for Lebanon. Mirrors freeDeliveryThresholdUsd("LB")
// in @workspace/delivery (returns 90). AE and CY always ship free regardless of price.
const LB_FREE_THRESHOLD_USD = 90;

// Hardcoded FX rates for display-currency conversion in structured data.
// AED is pegged to USD at 3.6725 by the UAE Central Bank (fixed rate).
// EUR is approximate and mirrors the same rate used in seo-inject.mjs.
const COUNTRY_FX = { AE: 3.6725, CY: 0.92 };

// Per-country display/offer currency. LB uses USD (the OS/WC store base currency).
const COUNTRY_CURRENCY = { AE: "AED", CY: "EUR" };

/**
 * Round a price to the nearest "clean" unit for display and charging.
 * Mirrors roundToNearestFive from @workspace/display-currency (which cannot
 * be imported here since this file must remain dependency-free for tests).
 *
 *  - LBP: nearest 500
 *  - USD: nearest cent (2 decimal precision)
 *  - All other currencies (AED, EUR, …): nearest 5
 *
 * @param {number} amount
 * @param {string} currency  ISO 4217 currency code
 * @returns {number}
 */
function roundToNearestFive(amount, currency) {
  const upper = String(currency).toUpperCase();
  if (upper === "LBP") return Math.round(amount / 500) * 500;
  if (upper === "USD") return Math.round(amount * 100) / 100;
  return Math.round(amount / 5) * 5;
}

// Per-country native currency for the shipping-rate MonetaryAmount node.
// Matches the storefront's transactional currency so Google can display
// localised shipping costs without a conversion step.
const COUNTRY_SHIPPING_CURRENCY = { AE: "AED", CY: "EUR" };

/**
 * Build the OfferShippingDetails + MerchantReturnPolicy sub-nodes for a Product
 * Offer so the listing qualifies for Google's enhanced/free merchant results.
 *
 * AE and CY always ship free. LB ships free above the threshold; otherwise the
 * standard delivery fee (LB_STANDARD_SHIPPING_USD) is emitted.
 * deliveryTime is always emitted: 1–3 business days standard transit.
 *
 * Returns {} when priceValue is unusable so we never emit a malformed offer.
 *
 * @param {{ countryCode: string, priceValue: number }} params
 * @returns {object}
 */
export function buildOfferShipping({ countryCode, priceValue }) {
  const country = (countryCode || "LB").toUpperCase();
  if (
    typeof priceValue !== "number" ||
    !Number.isFinite(priceValue) ||
    priceValue <= 0
  ) {
    return {};
  }

  const shippingCurrency = COUNTRY_SHIPPING_CURRENCY[country] ?? "USD";
  let shippingRateValue;
  if (country === "AE" || country === "CY") {
    shippingRateValue = 0;
  } else {
    shippingRateValue =
      priceValue >= LB_FREE_THRESHOLD_USD ? 0 : LB_STANDARD_SHIPPING_USD;
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

/**
 * Build a complete Schema.org Product JSON-LD node for a Presentail product page.
 * Pure function — no I/O, no external dependencies.
 *
 * @param {object} params
 * @param {object} params.product      - product data from the OS/WC API
 * @param {string} params.countryCode  - ISO 3166-1 alpha-2 (AE, CY, LB)
 * @param {string} params.canonicalUrl - full canonical product URL
 * @param {Date}   [params.now]        - SSR reference date; defaults to new Date()
 * @returns {object} Schema.org Product JSON-LD node
 */
export function buildProductSchema({
  product,
  countryCode,
  canonicalUrl = "https://presentail.com",
  now = new Date(),
}) {
  const country = (countryCode || "LB").toUpperCase();
  const marketCurrency = COUNTRY_CURRENCY[country] ?? "USD";
  const marketFx = COUNTRY_FX[country] ?? 1;

  const rawName =
    typeof product.name === "string" ? product.name.trim() : "";
  const rawDesc =
    typeof product.description === "string" ? product.description.trim() : "";

  const inStock = product.inStock !== false;

  const hasPrice =
    typeof product.priceValue === "number" &&
    Number.isFinite(product.priceValue) &&
    product.priceValue > 0;

  // sku: prefer osNumericId, then wcId, then id
  const sku =
    (typeof product.osNumericId === "number" && product.osNumericId > 0
      ? String(product.osNumericId)
      : "") ||
    (typeof product.wcId === "number" && product.wcId > 0
      ? String(product.wcId)
      : "") ||
    (typeof product.id === "string" && product.id) ||
    "";

  // mpn: OS product SKU field if set, otherwise the same chain as sku.
  // Provides Google with a Manufacturer Part Number to match products in
  // the merchant catalogue without a gtin.
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

  // priceValidUntil: 30 days from the SSR reference date (ISO 8601 YYYY-MM-DD).
  // Tells Google the price is current and prevents stale-price penalties.
  const priceValidUntilDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const priceValidUntil = priceValidUntilDate.toISOString().split("T")[0];

  // aggregateRating: emit only when the OS product exposes genuine review data
  // with at least one review. Never fabricate ratings.
  const hasRating =
    typeof product.rating === "number" &&
    Number.isFinite(product.rating) &&
    typeof product.reviewCount === "number" &&
    product.reviewCount >= 1;

  // Brand name resolution
  const brandName =
    (product.brand &&
      typeof product.brand.name === "string" &&
      product.brand.name.trim()) ||
    (Array.isArray(product.brands) &&
      product.brands[0] &&
      typeof product.brands[0].name === "string" &&
      product.brands[0].name.trim()) ||
    null;

  // Raw product image URI
  const rawProductImageUri =
    (product.image &&
      typeof product.image.uri === "string" &&
      product.image.uri) ||
    (Array.isArray(product.images) &&
      product.images.find((i) => i && typeof i.uri === "string" && i.uri)
        ?.uri) ||
    null;

  const offerExtras = buildOfferShipping({
    countryCode: country,
    priceValue: product.priceValue,
  });

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: rawName || "Presentail",
    ...(rawDesc ? { description: rawDesc } : {}),
    ...(rawProductImageUri ? { image: rawProductImageUri } : {}),
    ...(sku ? { sku } : {}),
    ...(mpn ? { mpn } : {}),
    url: canonicalUrl,
    seller: {
      "@type": "Organization",
      name: "Presentail",
      url: "https://presentail.com",
    },
    // hasMerchantReturnPolicy on the Product node per task spec §3.
    hasMerchantReturnPolicy: {
      "@type": "MerchantReturnPolicy",
      applicableCountry: country,
      returnPolicyCategory:
        "https://schema.org/MerchantReturnFiniteReturnWindow",
      merchantReturnDays: RETURN_WINDOW_DAYS,
      returnMethod: "https://schema.org/ReturnByMail",
      returnFees: "https://schema.org/FreeReturn",
    },
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
            availability: inStock
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
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
}
