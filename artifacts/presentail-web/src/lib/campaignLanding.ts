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

export type CampaignCatalogProduct = HomepageBestSellerProduct;

export type CampaignCatalogSections = {
  flowers: CampaignCatalogProduct[];
  luxury: CampaignCatalogProduct[];
};

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