/**
 * Maps a Presentail OS product to the web app's Product type.
 *
 * Key rules:
 * - id = p.id (slug)
 * - wcId = p.wcId (required for checkout line items)
 * - name decoded from HTML entities
 * - priceValue = p.price (USD number)
 * - image = first image url
 * - category mapped via CATEGORY_MAP (matches API server logic)
 * - inStock = p.inStock
 * - description with HTML tags stripped
 * - tag = "Featured" when p.featured
 * - occasions as array of slugs
 * - popularity = p.totalSales
 *
 * Products belonging to any HIDDEN_CATEGORY_SLUGS are excluded.
 *
 * Deliverability filtering (deliverableCountries / deliverableCities) is
 * applied in the query hook so callers only receive products valid for the
 * current locale.
 */

import type { OSProduct } from "@workspace/presentail-os";
import type { Product } from "./queries";
import { CATEGORY_SLUG_REMAP } from "./categoryGroups";

// Must match the server-side HIDDEN_CATEGORY_SLUGS in routes/woo.ts.
const HIDDEN_CATEGORY_SLUGS = new Set(["board-games", "coffee"]);

const CATEGORY_MAP: Record<string, string> = {
  "hand-bouquets": "hand-bouquets",
  "flower-boxes": "flower-boxes",
  "flower-vases": "flower-vases",
  bundles: "bundles",
  baskets: "baskets",
  "lux-arrangements": "lux-arrangements",
  "dried-flowers": "dried-flowers",
  "preserved-flowers": "preserved-flowers",
  plants: "plants",
  balloons: "balloons",
  "board-games": "board-games",
  cakes: "cakes",
  chocolate: "chocolate",
  "arabic-sweets": "arabic-sweets",
  coffee: "coffee",
  "stuffed-animals": "stuffed-animals",
  "electronics": "electronics",
};

function mapCategory(cats: { slug: string }[]): string {
  for (const cat of cats) {
    const mapped = CATEGORY_MAP[cat.slug];
    if (mapped) return mapped;
  }
  return cats[0]?.slug ?? "bundles";
}

function decodeHtmlEntities(str: string): string {
  return str
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

function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "").trim();
}

/** Returns true when the product should be shown (in-stock, no hidden categories). */
export function isVisibleOsProduct(p: OSProduct): boolean {
  if (!p.inStock) return false;
  return !p.categories.some((c) => HIDDEN_CATEGORY_SLUGS.has(c.slug));
}

/** Returns true when the product is deliverable to the given country/city. */
export function isDeliverableOsProduct(
  p: OSProduct,
  countryCode: string | null,
  cityId: string | null,
): boolean {
  if (p.deliverableCountries && p.deliverableCountries.length > 0 && countryCode) {
    const wanted = countryCode.toUpperCase();
    if (!p.deliverableCountries.some((c) => c.toUpperCase() === wanted)) return false;
  }
  if (p.deliverableCities && p.deliverableCities.length > 0 && cityId) {
    if (!p.deliverableCities.some((c) => c === cityId)) return false;
  }
  return true;
}

/** Maps a raw OS product to the web app's Product shape. */
export function mapOsProduct(p: OSProduct): Product {
  const imageList = p.images
    .filter((img) => img.url && img.url.length > 0)
    .map((img) => ({ uri: img.url }));

  const rawPrice = p.price;

  function parseDiscountField(raw: string | null | undefined): number | null {
    if (raw == null || raw === "" || raw === "0") return null;
    const n = parseFloat(raw);
    return isFinite(n) && n > 0 ? n : null;
  }

  // Prefer OS-native regular_price / sale_price pair over legacy discount fields.
  // regular_price is the crossed-out "was" price; the active sale price is resolved as:
  //   1. sale_price (explicit field), if valid and < regular_price
  //   2. p.price (WooCommerce always sets `price` = active selling price), if < regular_price
  //   3. No discount (regular_price == p.price means no actual sale is active)
  // When regular_price is absent, fall back to legacy discount_price_usd.
  const regularPriceValue = parseDiscountField(p.regular_price);
  const salePriceField = parseDiscountField(p.sale_price);

  const priceValue =
    regularPriceValue != null && regularPriceValue > 0 ? regularPriceValue : rawPrice;

  let discountPriceValue: number | null;
  if (regularPriceValue != null && regularPriceValue > 0) {
    if (salePriceField != null && salePriceField > 0 && salePriceField < regularPriceValue) {
      // Explicit sale_price field
      discountPriceValue = salePriceField;
    } else if (rawPrice > 0 && rawPrice < regularPriceValue) {
      // p.price is already the active (discounted) price — WC sets it automatically
      discountPriceValue = rawPrice;
    } else {
      discountPriceValue = null;
    }
  } else {
    discountPriceValue = parseDiscountField(p.discount_price_usd);
  }

  const discountPriceAed = parseDiscountField(p.discount_price_aed);

  const formattedPrice = `$${priceValue.toLocaleString()}`;

  return {
    id: String(p.id),
    osNumericId: p.osNumericId,
    wcId: p.wcId ?? 0,
    name: decodeHtmlEntities(p.name),
    price: formattedPrice,
    priceValue,
    discountPriceValue,
    discountPriceAed,
    image: imageList[0] ?? null,
    images: imageList,
    category: mapCategory(p.categories),
    categories: p.categories.map((c) => CATEGORY_SLUG_REMAP[c.slug] ?? c.slug),
    inStock: p.inStock,
    description: p.description
      ? decodeHtmlEntities(stripHtml(p.description))
      : undefined,
    tag: p.featured ? "Featured" : undefined,
    occasions: p.occasions.map((o) => o.slug),
    brandNames: p.brands.map((b) => b.name),
    popularity: p.totalSales ?? 0,
    hasInputField: p.hasInputField ?? false,
  };
}
