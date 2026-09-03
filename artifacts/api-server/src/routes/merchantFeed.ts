import { Router, type Request, type Response } from "express";
import { getOsProducts } from "../lib/osProductsCache";
import type { OSProduct } from "@workspace/presentail-os";
import { checkAdminToken } from "../lib/admin-auth";

// Market → storeKeys + currency + ISO country code (for deliverability filtering)
// defaultCity: used in canonical product URLs so GMC links resolve to a locale-prefixed city path.
const MARKET_CONFIG: Record<
  string,
  { storeKeys: string[]; currency: string; countryCode: string; localePrefix: string; defaultCity: string }
> = {
  lb: { storeKeys: ["lebanon"], currency: "USD", countryCode: "LB", localePrefix: "en-lb", defaultCity: "beirut" },
  ae: { storeKeys: ["dubai", "abudhabi"], currency: "AED", countryCode: "AE", localePrefix: "en-ae", defaultCity: "dubai" },
  cy: { storeKeys: ["cyprus"], currency: "EUR", countryCode: "CY", localePrefix: "en-cy", defaultCity: "nicosia" },
};

// Static conversion rates from USD.
// AED is pegged to USD at exactly 3.6725 by the UAE Central Bank.
// EUR is approximate; replace with live FX when a dedicated feed FX endpoint exists.
const USD_RATE: Record<string, number> = {
  USD: 1,
  AED: 3.6725,
  EUR: 0.92,
};

// Google Product Category taxonomy IDs (en-US).
// Source: https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt
const GMC_CATEGORY_MAP: Record<string, number> = {
  flowers: 1026,
  "hand-bouquets": 1026,
  "roses-bouquets": 1026,
  "rose-bouquets": 1026,
  "flower-boxes": 1026,
  "flower-vases": 1026,
  vases: 1026,
  "lux-arrangements": 1026,
  "luxury-arrangements": 1026,
  "dried-flowers": 1026,
  "preserved-flowers": 1026,
  plants: 6761,
  "indoor-plants": 6761,
  succulents: 6761,
  chocolate: 4030,
  chocolates: 4030,
  cakes: 4030,
  "arabic-sweets": 4030,
  sweets: 4030,
  balloons: 6769,
  "stuffed-animals": 1253,
  "teddy-bears": 1253,
  plush: 1253,
  baskets: 5841,
  "gift-baskets": 5841,
  bundles: 5841,
  "gift-bundles": 5841,
  sets: 5841,
  beauty: 477,
  perfumes: 7098,
  candles: 2707,
  jewelry: 188,
};
const GMC_CATEGORY_DEFAULT = 5841; // Gift Baskets & Sets

const SITE_ORIGIN = "https://presentail.com";

function escXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function convertPrice(usdPrice: number, currency: string): string {
  const rate = USD_RATE[currency] ?? 1;
  const converted = Math.round(usdPrice * rate * 100) / 100;
  return `${converted.toFixed(2)} ${currency}`;
}

function getGmcCategory(categories: OSProduct["categories"]): number {
  for (const cat of categories) {
    const id = GMC_CATEGORY_MAP[cat.slug];
    if (id !== undefined) return id;
  }
  return GMC_CATEGORY_DEFAULT;
}

type FeedItem = {
  slug: string;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  additionalImages: string[];
  availability: string;
  price: string;
  salePrice: string | null;
  brand: string;
  condition: string;
  googleProductCategory: number;
  productType: string;
  customLabel0: string;
  customLabel1: string;
  customLabel2: string;
};

type ExclusionEntry = { slug: string; reason: string };

function isDeliverableToCountry(
  product: OSProduct,
  countryCode: string,
): boolean {
  // No restriction means deliverable everywhere.
  if (!product.deliverableCountries || product.deliverableCountries.length === 0) {
    return true;
  }
  return product.deliverableCountries.includes(countryCode);
}

/** Ensures a URL is absolute HTTPS. Relative or protocol-relative URLs are prefixed with https:. */
function ensureAbsoluteHttps(url: string): string {
  if (!url) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (!url.startsWith("http")) return `https://${url}`;
  return url.replace(/^http:/, "https:");
}

function buildFeedData(
  market: string,
  countryCode: string,
  localePrefix: string,
  defaultCity: string,
  products: OSProduct[],
  currency: string,
): { items: FeedItem[]; exclusions: ExclusionEntry[] } {
  const items: FeedItem[] = [];
  const exclusions: ExclusionEntry[] = [];

  for (const product of products) {
    const slug = product.id; // product.id IS the slug per OS types

    if (!product.name?.trim()) {
      exclusions.push({ slug, reason: "missing title" });
      continue;
    }

    if (!product.inStock) {
      exclusions.push({ slug, reason: "out of stock" });
      continue;
    }

    if (!isDeliverableToCountry(product, countryCode)) {
      exclusions.push({ slug, reason: `not deliverable to ${countryCode}` });
      continue;
    }

    const imageUrl = product.images?.[0]?.url;
    if (!imageUrl) {
      exclusions.push({ slug, reason: "missing image" });
      continue;
    }

    if (!product.price || product.price <= 0) {
      exclusions.push({ slug, reason: "missing or zero price" });
      continue;
    }

    const additionalImages = product.images
      .slice(1, 11)
      .map((i) => i.url)
      .filter(Boolean);

    const rawDesc = product.description ? stripHtml(product.description) : "";
    const description = (rawDesc || product.name).slice(0, 5000);

    // Resolve the base (regular) price in USD.
    // Prefer OS-native regular_price when present and valid; fall back to product.price.
    const regularPriceRaw = product.regular_price ? parseFloat(product.regular_price) : NaN;
    const hasRegularPrice = !isNaN(regularPriceRaw) && regularPriceRaw > 0;
    const basePriceUsd = hasRegularPrice ? regularPriceRaw : product.price;

    const price = convertPrice(basePriceUsd, currency);

    // Sale price resolution — mirrors mapOsProductToWcShape priority order:
    //   1. OS-native sale_price (explicit field, USD), if valid and < regular_price.
    //   2. product.price (WC active selling price), if < regular_price — handles the
    //      common case where the OS omits sale_price but already sets price=sale price.
    //   3. AED-native discount_price_aed (legacy, AED feed only).
    //   4. Legacy discount_price_usd (USD, converted to feed currency).
    let salePrice: string | null = null;

    if (hasRegularPrice) {
      // Try explicit sale_price field first.
      if (product.sale_price) {
        const salePriceUsd = parseFloat(product.sale_price);
        if (!isNaN(salePriceUsd) && salePriceUsd > 0 && salePriceUsd < regularPriceRaw) {
          salePrice = convertPrice(salePriceUsd, currency);
        }
      }
      // Fall back to product.price when it is lower than regular_price.
      if (salePrice === null && product.price > 0 && product.price < regularPriceRaw) {
        salePrice = convertPrice(product.price, currency);
      }
    }

    // Paths 3 & 4: legacy discount fields — used when regular_price is absent
    // OR when it was present but yielded no valid sale price.
    if (salePrice === null) {
      if (currency === "AED" && product.discount_price_aed) {
        // AED-native discount price — compare against the AED-equivalent base price.
        const discountAed = parseFloat(product.discount_price_aed);
        const baseAed = basePriceUsd * (USD_RATE["AED"] ?? 1);
        if (!isNaN(discountAed) && discountAed > 0 && discountAed < baseAed) {
          salePrice = `${discountAed.toFixed(2)} AED`;
        }
      } else if (product.discount_price_usd) {
        // Legacy USD discount — compare against the USD base price, then convert.
        const discountUsd = parseFloat(product.discount_price_usd);
        if (!isNaN(discountUsd) && discountUsd > 0 && discountUsd < basePriceUsd) {
          salePrice = convertPrice(discountUsd, currency);
        }
      }
    }

    const brandName = product.brands?.[0]?.name || "Presentail";
    const gmcCategory = getGmcCategory(product.categories);

    // product_type: "Primary Category Name > Primary Occasion Name"
    // GMC uses this for campaign targeting — include occasion for richer targeting.
    const primaryCategoryName = product.categories[0]?.name ?? "";
    const primaryOccasionName = product.occasions?.[0]?.name ?? "";
    const productType = [primaryCategoryName, primaryOccasionName]
      .filter(Boolean)
      .join(" > ");

    // Market-localized canonical product URL with default city segment so links
    // resolve to a fully-qualified locale path (required for GMC link validation).
    const canonicalLink = `${SITE_ORIGIN}/${localePrefix}/${defaultCity}/product/${encodeURIComponent(slug)}`;

    // Normalize image URLs to absolute HTTPS (some OS images may be protocol-relative or HTTP).
    const normalizedImageLink = ensureAbsoluteHttps(imageUrl);
    const normalizedAdditional = additionalImages.map(ensureAbsoluteHttps).filter(Boolean);

    items.push({
      slug,
      title: product.name.trim(),
      description,
      link: canonicalLink,
      imageLink: normalizedImageLink,
      additionalImages: normalizedAdditional,
      availability: "in stock",
      price,
      salePrice,
      brand: brandName,
      condition: "new",
      googleProductCategory: gmcCategory,
      productType,
      customLabel0: market, // market slug (lb/ae/cy)
      customLabel1: primaryCategoryName, // category name (not slug) for campaign labels
      customLabel2: primaryOccasionName, // primary occasion name for occasion targeting
    });
  }

  return { items, exclusions };
}

function buildRssFeed(items: FeedItem[], market: string): string {
  const timestamp = new Date().toUTCString();
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">');
  lines.push("  <channel>");
  lines.push(
    `    <title>${escXml(`Presentail — ${market.toUpperCase()} Product Feed`)}</title>`,
  );
  lines.push(`    <link>${escXml(SITE_ORIGIN)}</link>`);
  lines.push(
    `    <description>${escXml("Presentail luxury flowers and gift delivery")}</description>`,
  );
  lines.push(`    <lastBuildDate>${timestamp}</lastBuildDate>`);

  for (const item of items) {
    lines.push("    <item>");
    lines.push(`      <g:id>${escXml(item.slug)}</g:id>`);
    lines.push(`      <g:title>${escXml(item.title)}</g:title>`);
    lines.push(`      <g:description>${escXml(item.description)}</g:description>`);
    lines.push(`      <g:link>${escXml(item.link)}</g:link>`);
    lines.push(`      <g:image_link>${escXml(item.imageLink)}</g:image_link>`);
    for (const img of item.additionalImages) {
      lines.push(
        `      <g:additional_image_link>${escXml(img)}</g:additional_image_link>`,
      );
    }
    lines.push(`      <g:availability>${escXml(item.availability)}</g:availability>`);
    lines.push(`      <g:price>${escXml(item.price)}</g:price>`);
    if (item.salePrice) {
      lines.push(`      <g:sale_price>${escXml(item.salePrice)}</g:sale_price>`);
    }
    lines.push(`      <g:brand>${escXml(item.brand)}</g:brand>`);
    lines.push(`      <g:condition>${escXml(item.condition)}</g:condition>`);
    lines.push(
      `      <g:google_product_category>${item.googleProductCategory}</g:google_product_category>`,
    );
    if (item.productType) {
      lines.push(
        `      <g:product_type>${escXml(item.productType)}</g:product_type>`,
      );
    }
    if (item.customLabel0) {
      lines.push(
        `      <g:custom_label_0>${escXml(item.customLabel0)}</g:custom_label_0>`,
      );
    }
    if (item.customLabel1) {
      lines.push(
        `      <g:custom_label_1>${escXml(item.customLabel1)}</g:custom_label_1>`,
      );
    }
    if (item.customLabel2) {
      lines.push(
        `      <g:custom_label_2>${escXml(item.customLabel2)}</g:custom_label_2>`,
      );
    }
    lines.push("    </item>");
  }

  lines.push("  </channel>");
  lines.push("</rss>");
  return lines.join("\n");
}

function requireAdmin(req: Request, res: Response): boolean {
  return checkAdminToken(req, res);
}

function resolveMarketProducts(
  config: { storeKeys: string[]; currency: string; countryCode: string; localePrefix: string; defaultCity: string },
): OSProduct[] {
  const seen = new Set<string>();
  const allProducts: OSProduct[] = [];
  for (const storeKey of config.storeKeys) {
    const products = getOsProducts(storeKey);
    if (!products) continue;
    for (const p of products) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      allProducts.push(p);
    }
  }
  return allProducts;
}

// ---------------------------------------------------------------------------
// Public feed: GET /feeds/google-merchant/:marketFile (e.g. lb.xml, ae.xml)
// ---------------------------------------------------------------------------
export const feedsRouter = Router();

feedsRouter.get(
  "/google-merchant/:marketFile",
  (req: Request, res: Response) => {
    const marketFile = String(req.params["marketFile"] ?? "");
    const market = marketFile.replace(/\.xml$/i, "").toLowerCase();

    // The UAE Merchant Center account is fed exclusively by OS-managed API
    // data sources. This legacy XML endpoint is intentionally retired so it
    // cannot be registered later as a competing source of truth.
    if (market === "ae") {
      res
        .status(410)
        .set({
          "Cache-Control": "public, max-age=86400",
          "X-Feed-Retired": "true",
        })
        .type("text/plain")
        .send("Gone: the UAE Merchant feed is managed by Presentail OS API data sources.");
      return;
    }

    const config = MARKET_CONFIG[market];
    if (!config) {
      res
        .status(404)
        .type("text/plain")
        .send(
          `Unknown market: ${market}. Supported markets: ${Object.keys(MARKET_CONFIG).join(", ")}`, // i18n-ignore — internal API error, not user-facing
        );
      return;
    }

    const allProducts = resolveMarketProducts(config);
    const { items } = buildFeedData(
      market,
      config.countryCode,
      config.localePrefix,
      config.defaultCity,
      allProducts,
      config.currency,
    );
    const xml = buildRssFeed(items, market);

    res.set({
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, must-revalidate",
      "X-Feed-Market": market,
      "X-Feed-Items": String(items.length),
    });
    res.send(xml);
  },
);

// ---------------------------------------------------------------------------
// Admin debug: GET /api/admin/merchant-feed-debug?market=lb
// ---------------------------------------------------------------------------
export const merchantFeedDebugRouter = Router();

merchantFeedDebugRouter.get(
  "/admin/merchant-feed-debug",
  (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;

    const market = String(req.query.market ?? "lb").toLowerCase();
    const config = MARKET_CONFIG[market];
    if (!config) {
      res.status(400).json({
        error: `Unknown market: ${market}. Supported: ${Object.keys(MARKET_CONFIG).join(", ")}`, // i18n-ignore — internal API error, not user-facing
      });
      return;
    }

    const allProducts = resolveMarketProducts(config);
    const { items, exclusions } = buildFeedData(
      market,
      config.countryCode,
      config.localePrefix,
      config.defaultCity,
      allProducts,
      config.currency,
    );

    res.json({
      market,
      currency: config.currency,
      storeKeys: config.storeKeys,
      totalConsidered: allProducts.length,
      totalIncluded: items.length,
      totalExcluded: exclusions.length,
      exclusions,
    });
  },
);
