import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { inferProductColors } from "../lib/productColorInference";
import {
  getOsProductBySlug,
  getOsProducts,
  getOsProductPricingMap,
  isOsProductsReady,
} from "../lib/osProductsCache";
import { logger } from "../lib/logger";
import { resolveStoreFromRequest } from "../lib/wooStore";
import {
  isDeliverable,
  isVisibleProduct,
  mapOsProductToWcShape,
  transformProduct,
} from "./woo";

const router: IRouter = Router();

const colorHintsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const gmcCheckoutLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

const GmcCheckoutLinkQuerySchema = z.object({
  item_id: z.string().trim().min(1).max(200)
    .regex(/^(?:\d{1,20}|[a-z0-9]+(?:-[a-z0-9]+)*)$/)
    .optional(),
  quantity: z.string().trim().max(12).optional(),
});

type GmcOutcome =
  | "disabled"
  | "missing_identifier"
  | "invalid_identifier"
  | "catalog_unavailable"
  | "not_found"
  | "out_of_market"
  | "out_of_stock"
  | "personalization_required"
  | "resolved";

function isGmcCheckoutLinksEnabled(): boolean {
  // Default-on preserves the normal deployment behaviour while still giving
  // operators an immediate runtime kill switch.
  return !["0", "false", "off"].includes(
    (process.env.GMC_CHECKOUT_DEEP_LINKS_ENABLED ?? "").trim().toLowerCase(),
  );
}

function numericProductId(value: string): boolean {
  return /^\d{1,20}$/.test(value);
}

function findProductByGmcId(
  products: ReturnType<typeof getOsProducts>,
  identifier: string,
) {
  const normalizedNumericId = identifier.replace(/^0+(?=\d)/, "");
  return (
    products?.find((product) =>
      numericProductId(identifier)
        ? String(product.osNumericId ?? "") === normalizedNumericId
        : product.id === identifier,
    ) ?? null
  );
}

function readQueryCaseInsensitive(req: {
  query: Record<string, unknown>;
}, wanted: string): string | undefined {
  for (const [key, value] of Object.entries(req.query)) {
    if (key.toLowerCase() === wanted.toLowerCase() && typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

function gmcResponse(
  outcome: GmcOutcome,
  extra: Record<string, unknown> = {},
) {
  return { ok: outcome === "resolved", outcome, ...extra };
}

/**
 * Resolve a Merchant Center Buy-on-site identifier against the store selected
 * by the request context. The endpoint deliberately returns outcome codes
 * rather than catalog details for failures, so unpublished or out-of-market
 * products cannot be used as an enumeration oracle.
 *
 * GET /api/products/gmc-checkout-link?item_id=<feed-slug-or-os-id>&quantity=2
 */
router.get(
  "/products/gmc-checkout-link",
  gmcCheckoutLinkLimiter,
  (req, res) => {
    const parsed = GmcCheckoutLinkQuerySchema.safeParse({
      item_id: readQueryCaseInsensitive(req, "item_id"),
      quantity: readQueryCaseInsensitive(req, "quantity"),
    });
    const store = resolveStoreFromRequest(req);
    const city = store.storeKey === "abudhabi"
      ? "abu-dhabi"
      : store.storeKey === "lebanon"
        ? "beirut"
        : store.storeKey === "cyprus"
          ? "nicosia"
          : store.storeKey;
    const logContext = { country: store.country, city };

    if (!isGmcCheckoutLinksEnabled()) {
      logger.info({ ...logContext, outcome: "disabled" }, "gmc checkout link ignored");
      res.json(gmcResponse("disabled"));
      return;
    }
    if (!parsed.success) {
      logger.info({ ...logContext, outcome: "invalid_identifier" }, "gmc checkout link rejected");
      res.json(gmcResponse("invalid_identifier"));
      return;
    }

    const identifier = parsed.data.item_id;
    if (!identifier) {
      logger.info({ ...logContext, outcome: "missing_identifier" }, "gmc checkout link missing item");
      res.json(gmcResponse("missing_identifier"));
      return;
    }

    const selectedProducts = getOsProducts(store.storeKey);
    if (selectedProducts === null && !isOsProductsReady(store.storeKey)) {
      logger.info({ ...logContext, outcome: "catalog_unavailable" }, "gmc checkout link catalog unavailable");
      res.json(gmcResponse("catalog_unavailable"));
      return;
    }

    const selected = findProductByGmcId(selectedProducts, identifier);
    if (!selected) {
      // Do not expose which other market owns the item. This distinction only
      // helps the client choose a safe market-local destination.
      const knownElsewhere = ["lebanon", "dubai", "abudhabi", "cyprus"]
        .filter((key) => key !== store.storeKey)
        .some((key) => findProductByGmcId(getOsProducts(key), identifier) !== null);
      const outcome: GmcOutcome = knownElsewhere ? "out_of_market" : "not_found";
      logger.info({ ...logContext, outcome }, "gmc checkout link product unavailable");
      res.json(gmcResponse(outcome));
      return;
    }

    const wcProduct = mapOsProductToWcShape(selected);
    if (!isVisibleProduct(wcProduct)) {
      const outcome: GmcOutcome = selected.inStock ? "not_found" : "out_of_stock";
      logger.info({ ...logContext, outcome }, "gmc checkout link product not purchasable");
      res.json(gmcResponse(outcome));
      return;
    }
    if (!isDeliverable(wcProduct, {
      countryCode: typeof req.query.countryCode === "string"
        ? req.query.countryCode.trim() || store.country
        : store.country,
      cityId: typeof req.query.cityId === "string"
        ? req.query.cityId.trim() || null
        : typeof req.headers["x-store-city"] === "string"
          ? req.headers["x-store-city"].trim() || null
          : null,
    })) {
      logger.info({ ...logContext, outcome: "out_of_market" }, "gmc checkout link product outside market");
      res.json(gmcResponse("out_of_market"));
      return;
    }
    if (selected.personalisationRequired) {
      logger.info({ ...logContext, outcome: "personalization_required" }, "gmc checkout link needs personalization");
      res.json(gmcResponse("personalization_required", {
        product: transformProduct(wcProduct, store.currencySymbol),
      }));
      return;
    }

    const product = transformProduct(wcProduct, store.currencySymbol);
    const pricing = selected.osNumericId == null
      ? undefined
      : getOsProductPricingMap().get(String(selected.osNumericId));
    // `transformProduct` is the storefront's canonical product shape. The
    // pricing map is consulted only for the same current discount enrichment
    // used by the listing API; URL input never contributes a price.
    const enrichedProduct = pricing
      ? {
          ...product,
          priceValue: pricing.regularPriceUsd ?? product.priceValue,
          discountPriceValue: pricing.discountPriceUsd,
          discountPriceAed: pricing.discountPriceAed,
        }
      : product;
    logger.info({ ...logContext, outcome: "resolved" }, "gmc checkout link resolved");
    res.json(gmcResponse("resolved", {
      product: enrichedProduct,
      currencyCode: store.currencyCode,
    }));
  },
);

const ProductItemSchema = z.object({
  slug: z.string().min(1).max(200),
  name: z.string().min(1).max(500),
});

const ColorHintsRequestSchema = z.object({
  products: z.array(ProductItemSchema).min(1).max(200),
});

function decodeCatalogName(value: string): string {
  return value
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

router.post("/products/color-hints", colorHintsLimiter, async (req, res) => {
  const parsed = ColorHintsRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }

  const canonicalProducts = new Map<string, { slug: string; name: string }>();
  for (const requested of parsed.data.products) {
    const catalogProduct = getOsProductBySlug(requested.slug);
    if (!catalogProduct) {
      res.status(400).json({ error: "Unknown catalog product" });
      return;
    }

    const canonicalName = decodeCatalogName(catalogProduct.name);
    if (requested.name !== canonicalName) {
      res.status(400).json({ error: "Product name does not match catalog" });
      return;
    }

    canonicalProducts.set(requested.slug, {
      slug: requested.slug,
      name: canonicalName,
    });
  }

  const colors = await inferProductColors([...canonicalProducts.values()]);
  res.json({ colors });
});

type StoreCityInfo = {
  storeKey: string;
  countryCode: string;
  countrySlug: string;
  cityId: string | null;
  citySlug: string;
  cityLabel: string;
};

const STORE_CITY_INFO: Record<string, Omit<StoreCityInfo, "storeKey">> = {
  lebanon: { countryCode: "LB", countrySlug: "lb", cityId: null, citySlug: "beirut", cityLabel: "Lebanon" },
  dubai: { countryCode: "AE", countrySlug: "ae", cityId: "ae-dubai", citySlug: "dubai", cityLabel: "Dubai" },
  abudhabi: { countryCode: "AE", countrySlug: "ae", cityId: "ae-abu-dhabi", citySlug: "abu-dhabi", cityLabel: "Abu Dhabi" },
  cyprus: { countryCode: "CY", countrySlug: "cy", cityId: null, citySlug: "nicosia", cityLabel: "Cyprus" },
};

const KNOWN_STORE_KEYS = ["lebanon", "dubai", "abudhabi", "cyprus"] as const;

/**
 * GET /api/products/availability/:slug
 *
 * Cross-city availability check. Queries the in-process OS product cache
 * across all known stores to determine whether a product slug is known at all
 * (as opposed to not available in the shopper's current city). Used by the
 * web storefront to distinguish "city unavailable" from "truly not found".
 *
 * Returns:
 *   { exists: false }                              — slug unknown in any store
 *   { exists: true, productName, slug, category,
 *     brand, availableStores: [...] }              — product known; stores list
 */
router.get("/products/availability/:slug", (req, res) => {
  const slug = req.params.slug as string;
  if (!slug || slug.length > 300) {
    res.status(400).json({ ok: false, error: "Invalid slug" });
    return;
  }

  const availableStores: StoreCityInfo[] = [];
  let productName: string | undefined;
  let category: string | undefined;
  let brand: string | undefined;

  for (const storeKey of KNOWN_STORE_KEYS) {
    const p = getOsProductBySlug(slug, storeKey);
    if (p) {
      if (!productName) {
        productName = p.name;
        category = p.categories[0]?.slug;
        brand = p.brands[0]?.slug;
      }
      availableStores.push({ storeKey, ...STORE_CITY_INFO[storeKey] });
    }
  }

  if (availableStores.length === 0) {
    res.json({ exists: false });
    return;
  }

  res.json({
    exists: true,
    productName,
    slug,
    category,
    brand,
    availableStores,
  });
});

export default router;
