/**
 * Serve-backed Product JSON-LD Merchant Listing schema regression tests.
 *
 * check-product-jsonld-schema.mjs validates the product Offer JSON-LD by
 * calling buildProductHead() with *synthetic* fixture objects.  That exercises
 * the individual builder functions (buildOfferDeliveryAndReturns, etc.) in
 * isolation, but it bypasses injectSeoTagsAsync entirely — the glue that
 * fetches a real entity from the OS API (or the fixture API in CI), resolves
 * its slug/locale, and assembles the @graph before injecting it into the HTML.
 *
 * A regression in the fetch → resolve → assemble glue — a missing field
 * propagation, a changed entity shape, a broken branch in injectSeoTagsAsync
 * — could ship malformed Product/Offer Merchant Listing schema that the
 * fixture-based guard never catches, because the fixture guard bypasses
 * injectSeoTagsAsync entirely.
 *
 * This spec requests the product route through serve.mjs (backed by the SEO
 * entity fixture API started in the "Web serve checks" workflow), extracts
 * every JSON-LD block from the served HTML, and runs the same per-field
 * validators as check-product-jsonld-schema.mjs.  It fails the workflow when
 * the real served page emits invalid or missing product schema.
 *
 * Routes exercised (one describe block per market):
 *   /en-lb/beirut/product/rose-bouquet        — Lebanon  (LB, USD)
 *   /en-ae/dubai/product/velvet-rose-bouquet  — UAE      (AE, USD)
 *   /en-cy/nicosia/product/orchid-arrangement — Cyprus   (CY, USD)
 *
 * The validators below mirror the logic in check-product-jsonld-schema.mjs
 * (extractProductSchema, validateProductOffer) inlined here to avoid .mjs
 * import resolution issues in the Playwright TypeScript runner.
 *
 * Uses Playwright's APIRequestContext so the test exercises the real HTTP
 * layer (serve.mjs) without a browser — exactly the initial HTML crawlers
 * receive.
 */

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers — identical logic to check-product-jsonld-schema.mjs
// ---------------------------------------------------------------------------

/**
 * Pull every JSON-LD node out of a raw HTML string, flattening @graph
 * wrappers, and return the first node whose @type === "Product".
 * Returns null when no Product node is found.
 */
function extractProductSchema(
  html: string,
): Record<string, unknown> | null {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1]);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const nodes: unknown[] = Array.isArray(
      (parsed as Record<string, unknown>)["@graph"],
    )
      ? ((parsed as Record<string, unknown[]>)["@graph"] as unknown[])
      : [parsed];
    for (const node of nodes) {
      if (
        node &&
        typeof node === "object" &&
        (node as Record<string, unknown>)["@type"] === "Product"
      ) {
        return node as Record<string, unknown>;
      }
    }
  }
  return null;
}

function isNonEmptyString(v: unknown): boolean {
  return typeof v === "string" && (v as string).trim() !== "";
}

function isSchemaOrgUrl(v: unknown): boolean {
  return isNonEmptyString(v) && /^https?:\/\/schema\.org\//.test(v as string);
}

function isPositiveNumericString(v: unknown): boolean {
  return (
    isNonEmptyString(v) &&
    Number.isFinite(Number(v as string)) &&
    Number(v as string) > 0
  );
}

function isNonNegativeNumericString(v: unknown): boolean {
  return (
    isNonEmptyString(v) &&
    Number.isFinite(Number(v as string)) &&
    Number(v as string) >= 0
  );
}

/**
 * Validate a Product JSON-LD node against Google's required Merchant Listing
 * field set (same logic as validateProductOffer in
 * check-product-jsonld-schema.mjs).  Returns an array of human-readable error
 * strings; empty means the node is valid.
 */
function validateProductOffer(
  product: Record<string, unknown> | null,
): string[] {
  if (!product || typeof product !== "object") {
    return ["Product JSON-LD node is missing"];
  }

  const offer = product.offers as Record<string, unknown> | undefined;
  if (!offer || typeof offer !== "object" || Array.isArray(offer)) {
    return ['Product is missing a single "offers" object'];
  }

  const errors: string[] = [];

  // Core offer fields.
  if (!isPositiveNumericString(offer.price)) {
    errors.push(
      `offers.price must be a positive numeric string (got ${JSON.stringify(offer.price)})`,
    );
  }
  if (!isNonEmptyString(offer.priceCurrency)) {
    errors.push(
      `offers.priceCurrency must be a non-empty string (got ${JSON.stringify(offer.priceCurrency)})`,
    );
  }
  if (!isSchemaOrgUrl(offer.availability)) {
    errors.push(
      `offers.availability must be a schema.org URL (got ${JSON.stringify(offer.availability)})`,
    );
  }

  // shippingDetails.
  const shipping = offer.shippingDetails as
    | Record<string, unknown>
    | undefined;
  if (!shipping || typeof shipping !== "object") {
    errors.push("offers.shippingDetails is missing");
  } else {
    const rate = shipping.shippingRate as Record<string, unknown> | undefined;
    if (!rate || typeof rate !== "object") {
      errors.push("offers.shippingDetails.shippingRate is missing");
    } else {
      if (!isNonNegativeNumericString(rate.value)) {
        errors.push(
          `offers.shippingDetails.shippingRate.value must be a non-negative numeric string (got ${JSON.stringify(rate.value)})`,
        );
      }
      if (!isNonEmptyString(rate.currency)) {
        errors.push(
          `offers.shippingDetails.shippingRate.currency must be a non-empty string (got ${JSON.stringify(rate.currency)})`,
        );
      }
    }
    const dest = shipping.shippingDestination as
      | Record<string, unknown>
      | undefined;
    if (!dest || typeof dest !== "object") {
      errors.push("offers.shippingDetails.shippingDestination is missing");
    } else if (!isNonEmptyString(dest.addressCountry)) {
      errors.push(
        `offers.shippingDetails.shippingDestination.addressCountry must be a non-empty string (got ${JSON.stringify(dest.addressCountry)})`,
      );
    }
  }

  // hasMerchantReturnPolicy.
  const policy = offer.hasMerchantReturnPolicy as
    | Record<string, unknown>
    | undefined;
  if (!policy || typeof policy !== "object") {
    errors.push("offers.hasMerchantReturnPolicy is missing");
  } else {
    if (!isNonEmptyString(policy.applicableCountry)) {
      errors.push(
        `offers.hasMerchantReturnPolicy.applicableCountry must be a non-empty string (got ${JSON.stringify(policy.applicableCountry)})`,
      );
    }
    if (!isSchemaOrgUrl(policy.returnPolicyCategory)) {
      errors.push(
        `offers.hasMerchantReturnPolicy.returnPolicyCategory must be a schema.org URL (got ${JSON.stringify(policy.returnPolicyCategory)})`,
      );
    }
    if (
      typeof policy.merchantReturnDays !== "number" ||
      !Number.isInteger(policy.merchantReturnDays) ||
      (policy.merchantReturnDays as number) < 0
    ) {
      errors.push(
        `offers.hasMerchantReturnPolicy.merchantReturnDays must be a non-negative integer (got ${JSON.stringify(policy.merchantReturnDays)})`,
      );
    }
    if (!isSchemaOrgUrl(policy.returnMethod)) {
      errors.push(
        `offers.hasMerchantReturnPolicy.returnMethod must be a schema.org URL (got ${JSON.stringify(policy.returnMethod)})`,
      );
    }
    if (!isSchemaOrgUrl(policy.returnFees)) {
      errors.push(
        `offers.hasMerchantReturnPolicy.returnFees must be a schema.org URL (got ${JSON.stringify(policy.returnFees)})`,
      );
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Per-market locale assertions
// ---------------------------------------------------------------------------

/**
 * Validate that the locale-specific fields in the Product Offer match the
 * expected values for the given market.  All three served markets use USD as
 * the JSON-LD price currency (display-currency conversion is client-only);
 * the addressCountry field must match the ISO-3166-1 alpha-2 country code.
 *
 * Returns an array of human-readable error strings; empty means the node
 * passes the locale checks.
 */
function validateLocaleFields(
  product: Record<string, unknown> | null,
  expectedCountry: string,
  expectedCurrency: string,
): string[] {
  if (!product || typeof product !== "object") {
    return ["Product JSON-LD node is missing — cannot check locale fields"];
  }
  const offer = product.offers as Record<string, unknown> | undefined;
  if (!offer || typeof offer !== "object" || Array.isArray(offer)) {
    return [
      'Product is missing a single "offers" object — cannot check locale fields',
    ];
  }

  const errors: string[] = [];

  if (offer.priceCurrency !== expectedCurrency) {
    errors.push(
      `offers.priceCurrency: expected "${expectedCurrency}", got ${JSON.stringify(offer.priceCurrency)}`,
    );
  }

  const shipping = offer.shippingDetails as Record<string, unknown> | undefined;
  if (shipping && typeof shipping === "object") {
    const rate = shipping.shippingRate as Record<string, unknown> | undefined;
    if (rate && typeof rate === "object") {
      if (rate.currency !== expectedCurrency) {
        errors.push(
          `offers.shippingDetails.shippingRate.currency: expected "${expectedCurrency}", got ${JSON.stringify(rate.currency)}`,
        );
      }
    }
    const dest = shipping.shippingDestination as
      | Record<string, unknown>
      | undefined;
    if (dest && typeof dest === "object") {
      if (dest.addressCountry !== expectedCountry) {
        errors.push(
          `offers.shippingDetails.shippingDestination.addressCountry: expected "${expectedCountry}", got ${JSON.stringify(dest.addressCountry)}`,
        );
      }
    }
  }

  const policy = offer.hasMerchantReturnPolicy as
    | Record<string, unknown>
    | undefined;
  if (policy && typeof policy === "object") {
    if (policy.applicableCountry !== expectedCountry) {
      errors.push(
        `offers.hasMerchantReturnPolicy.applicableCountry: expected "${expectedCountry}", got ${JSON.stringify(policy.applicableCountry)}`,
      );
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Parameterised test matrix — one describe block per market
// ---------------------------------------------------------------------------

/**
 * All prices in JSON-LD are denominated in USD regardless of market (display-
 * currency conversion is a client-side-only concern applied after hydration).
 * The country code in addressCountry / applicableCountry must match the locale
 * encoded in the URL path.
 */
const MARKET_CASES = [
  {
    label: "Lebanon",
    path: "/en-lb/beirut/product/rose-bouquet",
    expectedCountry: "LB",
    expectedCurrency: "USD",
  },
  {
    label: "UAE",
    path: "/en-ae/dubai/product/velvet-rose-bouquet",
    expectedCountry: "AE",
    expectedCurrency: "USD",
  },
  {
    label: "Cyprus",
    path: "/en-cy/nicosia/product/orchid-arrangement",
    expectedCountry: "CY",
    expectedCurrency: "USD",
  },
] as const;

for (const market of MARKET_CASES) {
  test.describe(
    `Product JSON-LD Merchant Listing schema — ${market.label} (${market.path})`,
    () => {
      let productNode: Record<string, unknown> | null;

      test.beforeAll(async ({ request }) => {
        const response = await request.get(market.path);
        expect(
          response.status(),
          `serve.mjs returned ${response.status()} for ${market.path}`,
        ).toBe(200);
        const html = await response.text();
        productNode = extractProductSchema(html);
      });

      test("a Product JSON-LD node is emitted", () => {
        expect(
          productNode,
          `${market.path} did not emit any Product JSON-LD node`,
        ).not.toBeNull();
      });

      test("Product Offer passes all required Merchant Listing field checks", () => {
        const errors = validateProductOffer(productNode);
        expect(
          errors,
          `${market.path} emitted invalid Product/Offer JSON-LD:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
        ).toHaveLength(0);
      });

      test(`locale fields match ${market.label} (country=${market.expectedCountry}, currency=${market.expectedCurrency})`, () => {
        const errors = validateLocaleFields(
          productNode,
          market.expectedCountry,
          market.expectedCurrency,
        );
        expect(
          errors,
          `${market.path} has mismatched locale fields:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
        ).toHaveLength(0);
      });
    },
  );
}

// ---------------------------------------------------------------------------
// Out-of-stock test suite — exercises the inStock=false → OutOfStock branch
// ---------------------------------------------------------------------------

const OUT_OF_STOCK_PATH = "/en-lb/beirut/product/sold-out-roses";

test.describe(`Product JSON-LD Merchant Listing schema — ${OUT_OF_STOCK_PATH} (out of stock)`, () => {
  let productNode: Record<string, unknown> | null;

  test.beforeAll(async ({ request }) => {
    const response = await request.get(OUT_OF_STOCK_PATH);
    expect(
      response.status(),
      `serve.mjs returned ${response.status()} for ${OUT_OF_STOCK_PATH}`,
    ).toBe(200);
    const html = await response.text();
    productNode = extractProductSchema(html);
  });

  test("a Product JSON-LD node is emitted for the out-of-stock product", () => {
    expect(
      productNode,
      `${OUT_OF_STOCK_PATH} did not emit any Product JSON-LD node`,
    ).not.toBeNull();
  });

  test("offers.availability is https://schema.org/OutOfStock for an out-of-stock product", () => {
    expect(productNode).not.toBeNull();
    const offer = (productNode as Record<string, unknown>)
      .offers as Record<string, unknown> | undefined;
    expect(
      offer?.availability,
      `${OUT_OF_STOCK_PATH} should emit OutOfStock availability but got ${JSON.stringify(offer?.availability)}`,
    ).toBe("https://schema.org/OutOfStock");
  });

  test("Product Offer passes all required Merchant Listing field checks (out of stock)", () => {
    const errors = validateProductOffer(productNode);
    expect(
      errors,
      `${OUT_OF_STOCK_PATH} emitted invalid Product/Offer JSON-LD:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    ).toHaveLength(0);
  });
});
