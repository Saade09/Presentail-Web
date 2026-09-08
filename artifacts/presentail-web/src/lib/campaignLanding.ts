import type { HomepageBestSellerProduct } from "@workspace/api-client-react";

export const TARGET_CAMPAIGN_CITY_IDS = [
  "lb-beirut",
  "ae-dubai",
  "ae-abu-dhabi",
] as const;

export type TargetCampaignCityId = (typeof TARGET_CAMPAIGN_CITY_IDS)[number];

export type CampaignMarket = {
  cityId: TargetCampaignCityId;
  timeZone: string;
  countryCode: "LB" | "AE";
};

const CAMPAIGN_MARKETS: Record<TargetCampaignCityId, CampaignMarket> = {
  "lb-beirut": {
    cityId: "lb-beirut",
    timeZone: "Asia/Beirut",
    countryCode: "LB",
  },
  "ae-dubai": {
    cityId: "ae-dubai",
    timeZone: "Asia/Dubai",
    countryCode: "AE",
  },
  "ae-abu-dhabi": {
    cityId: "ae-abu-dhabi",
    timeZone: "Asia/Dubai",
    countryCode: "AE",
  },
};

export const CAMPAIGN_FLOWER_CATEGORY_SLUGS = [
  "flowers",
  "roses-bouquets",
  "hand-bouquets",
  "hand-bouquet",
  "flower-boxes",
  "flower-vases",
  "vases",
  "flower-baskets",
  "dried-flowers",
  "preserved-flowers",
] as const;

export const CAMPAIGN_LUXURY_CATEGORY_SLUG = "lux-arrangements";

export const CAMPAIGN_QUERY_CATEGORY_SLUGS = [
  ...CAMPAIGN_FLOWER_CATEGORY_SLUGS,
  CAMPAIGN_LUXURY_CATEGORY_SLUG,
] as const;

const FLOWER_CATEGORY_SET = new Set<string>(CAMPAIGN_FLOWER_CATEGORY_SLUGS);

const NON_FLOWER_CATEGORY_SET = new Set([
  "cakes",
  "cake",
  "chocolate",
  "chocolates",
  "balloons",
  "stuffed-animals",
  "bundles",
  "gift-baskets",
  "arabic-sweets",
  "sweets",
  "beauty",
  "plants",
  "candles",
  "perfumes",
  "jewelry",
  "watches",
  "gift-cards",
]);

export type CampaignCatalogProduct = HomepageBestSellerProduct & {
  /** Optional availability flags retained when the catalog API provides them. */
  available?: boolean;
  availableToday?: boolean;
  deliverable?: boolean;
  deliverableCities?: string[];
  deliverableCountries?: string[];
  isPublished?: boolean;
  published?: boolean;
  sameDayEnabled?: boolean;
};

export const CAMPAIGN_QUICK_FILTER_QUERY_PARAM = "quick_filter";

export const CAMPAIGN_QUICK_FILTER_KEYS = [
  "available-today",
  "under-60",
  "50-100",
  "roses",
  "luxury",
  "best-sellers",
] as const;

export type CampaignQuickFilterKey = (typeof CAMPAIGN_QUICK_FILTER_KEYS)[number];

const CAMPAIGN_QUICK_FILTER_KEY_SET = new Set<string>(CAMPAIGN_QUICK_FILTER_KEYS);
const ROSE_CATEGORY_ALIASES = new Set([
  "rose",
  "roses",
  "roses-bouquets",
  "roses-lebanon",
  "red-roses",
]);

type CampaignProductEligibility = CampaignCatalogProduct;

export type CampaignCatalogSections = {
  flowers: CampaignCatalogProduct[];
  luxury: CampaignCatalogProduct[];
};

export function parseCampaignQuickFilter(search: string): CampaignQuickFilterKey {
  const value = new URLSearchParams(search).get(CAMPAIGN_QUICK_FILTER_QUERY_PARAM);
  return CAMPAIGN_QUICK_FILTER_KEY_SET.has(value ?? "")
    ? (value as CampaignQuickFilterKey)
    : "available-today";
}

export function serializeCampaignQuickFilter(
  search: string,
  filter: CampaignQuickFilterKey,
): string {
  const params = new URLSearchParams(search);
  params.set(CAMPAIGN_QUICK_FILTER_QUERY_PARAM, filter);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export function getCampaignActiveSellingPrice(product: CampaignCatalogProduct): number {
  const regularPrice = Number(product.priceValue);
  const salePrice = Number(product.discountPriceValue);
  return Number.isFinite(salePrice) && salePrice > 0 && salePrice < regularPrice
    ? salePrice
    : regularPrice;
}

function isDeliverableToCampaignLocation(
  product: CampaignProductEligibility,
  countryCode?: string | null,
  cityId?: string | null,
): boolean {
  if (product.deliverable === false) return false;
  if (product.published === false || product.isPublished === false) return false;
  if (product.available === false || product.availableToday === false) return false;
  if (product.sameDayEnabled === false) return false;

  if (
    countryCode &&
    product.deliverableCountries &&
    product.deliverableCountries.length > 0 &&
    !product.deliverableCountries.some((country) => country.toUpperCase() === countryCode.toUpperCase())
  ) {
    return false;
  }
  if (cityId && product.deliverableCities && product.deliverableCities.length > 0) {
    const normalizedCityId = cityId.toLowerCase();
    const bareCitySlug = normalizedCityId.replace(/^[a-z]{2}-/, "");
    return product.deliverableCities.some((city) => {
      const normalized = city.toLowerCase();
      return normalized === normalizedCityId || normalized === bareCitySlug;
    });
  }
  return true;
}

export function filterCampaignProducts(
  products: CampaignCatalogProduct[],
  filter: CampaignQuickFilterKey,
  options: { countryCode?: string | null; cityId?: string | null } = {},
): CampaignCatalogProduct[] {
  const seen = new Set<string>();
  return products.filter((rawProduct) => {
    const product = rawProduct as CampaignProductEligibility;
    if (seen.has(product.id) || !product.inStock) return false;
    if (!isDeliverableToCampaignLocation(product, options.countryCode, options.cityId)) {
      return false;
    }

    const categories = product.categories.map((category) => category.toLowerCase());
    const activePrice = getCampaignActiveSellingPrice(product);
    const matches =
      filter === "available-today" ||
      (filter === "under-60" && activePrice < 60) ||
      (filter === "50-100" && activePrice >= 50 && activePrice <= 100) ||
      (filter === "roses" && categories.some((category) => ROSE_CATEGORY_ALIASES.has(category))) ||
      (filter === "luxury" && categories.includes(CAMPAIGN_LUXURY_CATEGORY_SLUG)) ||
      (filter === "best-sellers" && product.isBestSeller === true);
    if (!matches) return false;
    seen.add(product.id);
    return true;
  });
}

export function isTargetCampaignCity(
  cityId: string | null | undefined,
): cityId is TargetCampaignCityId {
  return TARGET_CAMPAIGN_CITY_IDS.includes(cityId as TargetCampaignCityId);
}

export function getCampaignMarket(
  cityId: string | null | undefined,
): CampaignMarket | null {
  return isTargetCampaignCity(cityId) ? CAMPAIGN_MARKETS[cityId] : null;
}

function categoriesFor(product: CampaignCatalogProduct): string[] {
  return product.categories.map((slug) => slug.toLowerCase());
}

function hasNonFlowerCategory(product: CampaignCatalogProduct): boolean {
  return categoriesFor(product).some((slug) => NON_FLOWER_CATEGORY_SET.has(slug));
}

function rankProducts(
  products: CampaignCatalogProduct[],
): CampaignCatalogProduct[] {
  return [...products].sort((a, b) => {
    const bestSellerDelta = Number(Boolean(b.isBestSeller)) - Number(Boolean(a.isBestSeller));
    if (bestSellerDelta !== 0) return bestSellerDelta;
    return (b.popularity ?? 0) - (a.popularity ?? 0);
  });
}

function dedupeProducts(
  products: CampaignCatalogProduct[],
): CampaignCatalogProduct[] {
  const seen = new Set<string>();
  return products.filter((product) => {
    if (seen.has(product.id)) return false;
    seen.add(product.id);
    return true;
  });
}

export function selectCampaignCatalogSections(
  products: CampaignCatalogProduct[],
): CampaignCatalogSections {
  const available = dedupeProducts(products).filter((product) => product.inStock);

  const luxury = rankProducts(
    available.filter((product) => {
      const categories = categoriesFor(product);
      return (
        categories.includes(CAMPAIGN_LUXURY_CATEGORY_SLUG) &&
        !hasNonFlowerCategory(product)
      );
    }),
  );
  const luxuryIds = new Set(luxury.map((product) => product.id));

  const flowers = rankProducts(
    available.filter((product) => {
      const categories = categoriesFor(product);
      return (
        !luxuryIds.has(product.id) &&
        !categories.includes(CAMPAIGN_LUXURY_CATEGORY_SLUG) &&
        categories.some((slug) => FLOWER_CATEGORY_SET.has(slug)) &&
        !hasNonFlowerCategory(product)
      );
    }),
  );

  return { flowers, luxury };
}

function localHourAndMinute(now: Date, timeZone: string): {
  hour: number;
  minute: number;
} | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    return Number.isFinite(hour) && Number.isFinite(minute) ? { hour, minute } : null;
  } catch {
    return null;
  }
}

/**
 * Return the number of whole local minutes remaining before today's cutoff.
 *
 * The caller is responsible for checking that the campaign is still in its
 * same-day window. Returning null for invalid timezone/cutoff data keeps the
 * landing page on its verified fallback copy instead of showing a misleading
 * timer.
 */
export function computeCountdownMinutes(
  now: Date,
  timeZone: string,
  cutoffHour?: number,
): number | null {
  if (
    cutoffHour == null ||
    !Number.isInteger(cutoffHour) ||
    cutoffHour < 0 ||
    cutoffHour > 23
  ) {
    return null;
  }
  const localTime = localHourAndMinute(now, timeZone);
  if (!localTime) return null;
  return Math.max(0, cutoffHour * 60 - (localTime.hour * 60 + localTime.minute));
}

export type CampaignAvailabilityState =
  | "same-day"
  | "next-available"
  | "unverified";

export function resolveCampaignAvailability({
  now,
  timeZone,
  cutoffHour,
  cityIsActive,
  operationsConfigVerified,
}: {
  now: Date;
  timeZone: string;
  cutoffHour?: number;
  cityIsActive?: boolean;
  operationsConfigVerified: boolean;
}): CampaignAvailabilityState {
  if (
    !operationsConfigVerified ||
    cityIsActive === false ||
    cutoffHour == null ||
    !Number.isInteger(cutoffHour) ||
    cutoffHour < 0 ||
    cutoffHour > 23
  ) {
    return "unverified";
  }
  const localTime = localHourAndMinute(now, timeZone);
  if (!localTime) return "unverified";
  return localTime.hour * 60 + localTime.minute < cutoffHour * 60
    ? "same-day"
    : "next-available";
}

export function buildCampaignSupportUrl(message: string): string {
  return `https://wa.me/9613136532?text=${encodeURIComponent(message)}`;
}