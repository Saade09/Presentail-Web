/**
 * Beirut late-night delivery campaign builder.
 *
 * Evaluates the Asia/Beirut late-night campaign availability using only
 * authoritative OS-backed data sources (locations cache + products cache).
 * Fail-closed: any missing, stale, or contradictory data returns a non-tonight
 * status so no promise is made to the user without verified data.
 *
 * Nominal cutoff: 23:30 local (Asia/Beirut).
 * Effective cutoff: earliest of:
 *   - nominal cutoff (23:30)
 *   - city sameDayCutoffHour
 *   - selected late-slot cutoffHour
 *
 * A "late slot" qualifies when:
 *   - enabled === true
 *   - sameDayEnabled === true
 *   - slotId is present (explicit)
 *   - numeric startHour, endHour, cutoffHour
 *   - endHour >= 21
 */

import type { OSTimeSlot, OSProduct } from "@workspace/presentail-os";
import type { ProductPricingEntry } from "./osProductsCache";

// ── Constants ────────────────────────────────────────────────────────────────

export const CAMPAIGN_KEY = "campaign-beirut-late-night";
export const BEIRUT_TZ = "Asia/Beirut";
const NOMINAL_CUTOFF_HOUR = 23;
const NOMINAL_CUTOFF_MINUTE = 30;
const LATE_SLOT_END_HOUR_MIN = 21;
const LATE_SLOT_START_HOUR_MIN = 18;
const STALE_PRODUCTS_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
const QUOTE_MIN_AHEAD_MS = 60 * 1000; // 60 seconds
const NEXT_AVAILABLE_SCAN_DAYS = 7;
const MAX_REGULAR_PRODUCTS = 4;
const MAX_LUXURY_PRODUCTS = 8;

// ── Category classification ──────────────────────────────────────────────────

/** Floral-only category slugs that qualify a product as a flower product. */
const FLORAL_CATEGORY_SLUGS = new Set([
  "hand-bouquets",
  "flower-boxes",
  "flower-vases",
  "flower-baskets",
  "flowers",
  "preserved-flowers",
  "dried-flowers",
  "orchids",
  "roses",
  "roses-lebanon",
  "lux-arrangements",
]);

/** Non-flower gift category slugs. A product with any of these is excluded. */
const NON_FLOWER_GIFT_CATEGORY_SLUGS = new Set([
  "cakes",
  "chocolate",
  "chocolates",
  "cake",
  "balloons",
  "balloon",
  "stuffed-animals",
  "bundles",
  "gift-bundles",
  "gift-boxes",
  "gifts",
  "baskets",
  "arabic-sweets",
  "personal-gifts",
  "beauty",
  "spirits",
  "gaming",
  "electronics",
  "plants",
]);

/** Category that marks luxury products. */
const LUX_CATEGORY_SLUG = "lux-arrangements";

// ── Types ────────────────────────────────────────────────────────────────────

export type CampaignStatus = "tonight" | "next-available" | "unavailable";

export type CampaignReason =
  | "eligible"
  | "after-cutoff"
  | "early-closure"
  | "slot-unavailable"
  | "inventory-unavailable"
  | "source-stale"
  | "operations-unverified";

export type DeliveryWindow = {
  date: string;
  label: string;
  slotId: string;
  startHour: number;
  endHour: number;
};

export type SourceFreshness = {
  locationsStatus: "live" | "stale" | "fallback";
  productRefreshedAt: string | null;
};

export type CampaignProduct = {
  id: string;
  name: string;
  price: string;
  priceValue: number;
  image: { uri: string } | null;
  images: { uri: string }[];
  categories: string[];
  inStock: boolean;
  popularity: number;
  isBestSeller: boolean;
  discountPriceValue: number | null;
  discountPriceAed: number | null;
};

export type CampaignSection = {
  title: string;
  subtitle: string;
  viewAllHref: string;
  products: CampaignProduct[];
};

export type BeirutLateNightCampaignResult = {
  campaignKey: string;
  status: CampaignStatus;
  reason: CampaignReason;
  timeZone: string;
  evaluatedAt: string;
  quoteExpiresAt: string;
  nominalCutoffAt: string;
  effectiveCutoffAt: string | null;
  cutoffLabel: string | null;
  sourceFreshness: SourceFreshness;
  deliveryWindow: DeliveryWindow | null;
  nextAvailableWindow: DeliveryWindow | null;
  availableTonight: CampaignSection;
  luxury: CampaignSection;
};

// ── Location context ─────────────────────────────────────────────────────────

export type BeirutLocationContext = {
  /** dataStatus of the OS locations cache */
  locationsStatus: "live" | "stale" | "fallback";
  /** true only when the Beirut city entry was found and has been OS-verified */
  operationsConfigVerified: boolean;
  /** expressAvailable flag from OS */
  expressAvailable: boolean;
  /** sameDayCutoffHour from OS (hour 0–23) */
  sameDayCutoffHour: number;
  /** Minute component from the OS cutoff time. */
  sameDayCutoffMinute?: number;
  /** flat time slots */
  timeSlots: OSTimeSlot[];
  /** per-day slots (keyed by lowercase weekday name) */
  slotsByDay?: Record<string, OSTimeSlot[]>;
  /** country is active */
  countryActive: boolean;
  /** city is active */
  cityActive: boolean;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the local date components for a given UTC instant in IANA tz.
 * Uses Intl.DateTimeFormat to ensure correct DST handling.
 */
function toBeirutLocalParts(utcDate: Date): {
  year: number;
  month: number; // 1-based
  day: number;
  hour: number;
  minute: number;
  weekdayLong: string;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: BEIRUT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "long",
  });
  const parts = fmt.formatToParts(utcDate);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    year: parseInt(get("year"), 10),
    month: parseInt(get("month"), 10),
    day: parseInt(get("day"), 10),
    hour: parseInt(get("hour"), 10),
    minute: parseInt(get("minute"), 10),
    weekdayLong: get("weekday").toLowerCase(),
  };
}

/**
 * Converts a local Beirut date+time (hour, minute) back to UTC.
 * Uses binary search to find the UTC instant that maps to that local time.
 */
function fromBeirutLocal(
  year: number,
  month: number, // 1-based
  day: number,
  hour: number,
  minute: number,
): Date {
  // First estimate: try UTC-2 (Beirut is UTC+2 in winter, UTC+3 in summer).
  // We use a search so DST is handled correctly via Intl.
  const approxUtcMs =
    Date.UTC(year, month - 1, day, hour, minute) - 3 * 60 * 60 * 1000;

  // Binary search within ±4 hours
  let lo = approxUtcMs - 4 * 3600 * 1000;
  let hi = approxUtcMs + 4 * 3600 * 1000;

  for (let i = 0; i < 30; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const parts = toBeirutLocalParts(new Date(mid));
    const midMinutes =
      (parts.year - year) * 525960 +
      (parts.month - month) * 43800 +
      (parts.day - day) * 1440 +
      (parts.hour - hour) * 60 +
      (parts.minute - minute);
    if (midMinutes === 0) return new Date(mid);
    if (midMinutes < 0) lo = mid + 1;
    else hi = mid - 1;
  }
  return new Date(Math.floor((lo + hi) / 2));
}

/**
 * Returns the local date YYYY-MM-DD for the given local day offset from now.
 */
function toBeirutLocalDateIso(utcDate: Date, dayOffset = 0): string {
  const parts = toBeirutLocalParts(utcDate);
  if (dayOffset === 0) {
    return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  }
  // Create UTC midnight in Beirut, then add days
  const base = fromBeirutLocal(parts.year, parts.month, parts.day, 0, 0);
  const shifted = new Date(base.getTime() + dayOffset * 24 * 3600 * 1000);
  const sp = toBeirutLocalParts(shifted);
  return `${sp.year}-${String(sp.month).padStart(2, "0")}-${String(sp.day).padStart(2, "0")}`;
}

/**
 * Format hour as "HH:MM AM/PM" style (e.g. hour=23, minute=30 → "11:30 PM").
 */
function formatHourMinuteLabel(hour: number, minute = 0): string {
  const ampm = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const mm = String(minute).padStart(2, "0");
  return `${h12}:${mm} ${ampm}`;
}

/**
 * Select the effective late-night slot for a given day.
 * Prefers slotsByDay[weekday] over flat timeSlots.
 * Returns the slot with the highest endHour >= LATE_SLOT_END_HOUR_MIN that
 * has enabled === true, sameDayEnabled === true, and explicit slotId.
 * Returns null when no such slot exists.
 */
export function selectLateSlot(
  timeSlots: OSTimeSlot[],
  slotsByDay: Record<string, OSTimeSlot[]> | undefined,
  weekdayLong: string,
): OSTimeSlot | null {
  // When the OS supplied a per-day schedule, an absent weekday is an explicit
  // closure. Falling back to the flat union would borrow a slot from another
  // day and create a false promise.
  const candidates: OSTimeSlot[] = slotsByDay
    ? (slotsByDay[weekdayLong] ?? [])
    : timeSlots;

  // Filter to OS-backed late slots: explicit slotId, enabled, sameDayEnabled, endHour >= 21
  const lateSlots = candidates.filter(
    (s): boolean =>
      typeof s.slotId === "string" &&
      s.slotId.length > 0 &&
      s.enabled === true &&
      s.sameDayEnabled === true &&
      typeof s.startHour === "number" &&
      typeof s.endHour === "number" &&
      typeof s.cutoffHour === "number" &&
      s.startHour >= LATE_SLOT_START_HOUR_MIN &&
      isPlausibleLateWindow(s) &&
      isCutoffInsideSlot(s),
  );

  if (lateSlots.length === 0) return null;

  // Among late slots, pick the one with the latest startHour (most "late night")
  lateSlots.sort((a, b) => (b.startHour ?? 0) - (a.startHour ?? 0));
  return lateSlots[0] ?? null;
}

function isPlausibleLateWindow(slot: OSTimeSlot): boolean {
  const startMinutes = (slot.startHour ?? -1) * 60;
  let endMinutes = (slot.endHour ?? -1) * 60;
  if (endMinutes < startMinutes) endMinutes += 24 * 60;
  const durationMinutes = endMinutes - startMinutes;
  return (
    ((slot.endHour ?? -1) >= LATE_SLOT_END_HOUR_MIN ||
      (slot.endHour ?? -1) < (slot.startHour ?? -1)) &&
    durationMinutes > 0 &&
    durationMinutes <= 8 * 60
  );
}

function isCutoffInsideSlot(slot: OSTimeSlot): boolean {
  const startMinutes = (slot.startHour ?? -1) * 60;
  let endMinutes = (slot.endHour ?? -1) * 60;
  let cutoffMinutes = (slot.cutoffHour ?? -1) * 60 + (slot.cutoffMinute ?? 0);
  if (endMinutes < startMinutes) endMinutes += 24 * 60;
  if (cutoffMinutes < startMinutes) cutoffMinutes += 24 * 60;
  return cutoffMinutes >= startMinutes && cutoffMinutes <= endMinutes;
}

/**
 * Returns the UTC timestamp for the nominal cutoff (23:30 local) on a given
 * local date.
 */
export function nominalCutoffUtcMs(
  year: number,
  month: number,
  day: number,
): number {
  return fromBeirutLocal(
    year,
    month,
    day,
    NOMINAL_CUTOFF_HOUR,
    NOMINAL_CUTOFF_MINUTE,
  ).getTime();
}

/**
 * Returns the UTC timestamp for a given cutoff hour (local, minute=0) on the
 * given local date.
 */
function cutoffHourUtcMs(
  year: number,
  month: number,
  day: number,
  cutoffHour: number,
  cutoffMinute = 0,
): number {
  return fromBeirutLocal(year, month, day, cutoffHour, cutoffMinute).getTime();
}

// ── Product filtering & building ─────────────────────────────────────────────

function getCategorySlugs(product: OSProduct): string[] {
  return (product.categories ?? []).map((c) =>
    typeof c === "string" ? c : (c as { slug?: string }).slug ?? "",
  ).filter(Boolean);
}

/**
 * Returns true when a product qualifies as floral (has at least one floral
 * category from the authoritative list).
 */
function isFloralProduct(product: OSProduct): boolean {
  const slugs = getCategorySlugs(product);
  return slugs.some((s) => FLORAL_CATEGORY_SLUGS.has(s));
}

/**
 * Returns true when a product has any non-flower gift categories.
 * These products are excluded from the campaign entirely.
 */
function hasNonFlowerGiftCategory(product: OSProduct): boolean {
  const slugs = getCategorySlugs(product);
  return slugs.some((s) => NON_FLOWER_GIFT_CATEGORY_SLUGS.has(s));
}

/**
 * Returns true when a product is in the luxury group (has lux-arrangements).
 */
function isLuxuryProduct(product: OSProduct): boolean {
  const slugs = getCategorySlugs(product);
  return slugs.includes(LUX_CATEGORY_SLUG);
}

function parseDiscountField(
  raw: string | number | null | undefined,
): number | null {
  if (raw == null || raw === "" || raw === "0" || raw === 0) return null;
  const n = typeof raw === "number" ? raw : parseFloat(raw);
  return isFinite(n) && n > 0 ? n : null;
}

function computeOsDisplayPrice(osP: OSProduct): number {
  const rp = parseDiscountField(osP.regular_price);
  return rp != null && rp > 0 ? rp : osP.price;
}

function computeOsDiscountPriceValue(osP: OSProduct): number | null {
  const regularPriceValue = parseDiscountField(osP.regular_price);
  const salePriceField = parseDiscountField(osP.sale_price);
  if (regularPriceValue != null && regularPriceValue > 0) {
    if (
      salePriceField != null &&
      salePriceField > 0 &&
      salePriceField < regularPriceValue
    ) {
      return salePriceField;
    } else if (osP.price > 0 && osP.price < regularPriceValue) {
      return osP.price;
    }
    return null;
  }
  return parseDiscountField(osP.discount_price_usd);
}

function resolveProductPricing(
  osP: OSProduct,
  pricingMap: ReadonlyMap<string, ProductPricingEntry>,
): { displayPrice: number; discountPriceValue: number | null; discountPriceAed: number | null } {
  const key = osP.osNumericId != null ? String(osP.osNumericId) : "";
  const entry = key ? pricingMap.get(key) : undefined;
  return {
    displayPrice: entry?.regularPriceUsd ?? computeOsDisplayPrice(osP),
    discountPriceValue:
      entry?.discountPriceUsd ?? computeOsDiscountPriceValue(osP),
    discountPriceAed:
      entry?.discountPriceAed ??
      parseDiscountField(osP.discount_price_aed),
  };
}

function formatPrice(usdValue: number): string {
  return `$${usdValue.toLocaleString("en-US")}`;
}

function buildCampaignProduct(
  osP: OSProduct,
  pricingMap: ReadonlyMap<string, ProductPricingEntry>,
): CampaignProduct {
  const { displayPrice, discountPriceValue, discountPriceAed } =
    resolveProductPricing(osP, pricingMap);
  const imageList = osP.images
    .map((img) => ({ uri: img.url }))
    .filter((img) => img.uri.length > 0);

  return {
    id: osP.id,
    name: osP.name,
    price: formatPrice(displayPrice),
    priceValue: displayPrice,
    image: imageList[0] ?? null,
    images: imageList,
    categories: getCategorySlugs(osP),
    inStock: osP.inStock,
    popularity: osP.totalSales ?? 0,
    isBestSeller: osP.isBestSeller ?? false,
    discountPriceValue,
    discountPriceAed,
  };
}

/**
 * Filter, deduplicate, and split products into regular and luxury groups.
 *
 * Rules:
 * - Must be in-stock
 * - Must be deliverable to LB (and lb-beirut when deliverableCities exists)
 * - Must be floral (has at least one FLORAL_CATEGORY_SLUGS category)
 * - Must not have any NON_FLOWER_GIFT_CATEGORY_SLUGS
 * - Luxury = has lux-arrangements; regular = not luxury
 * - Deduplicate by product id
 */
export function filterAndSplitProducts(
  products: OSProduct[],
): { regular: OSProduct[]; luxury: OSProduct[] } {
  const seenIds = new Set<string>();
  const regular: OSProduct[] = [];
  const luxury: OSProduct[] = [];

  for (const p of products) {
    if (!p.inStock) continue;

    // Deliverability: must include LB
    if (
      p.deliverableCountries &&
      p.deliverableCountries.length > 0 &&
      !p.deliverableCountries.some((c) => c.toUpperCase() === "LB")
    ) {
      continue;
    }
    // City-level: must include lb-beirut when restrictions exist
    if (
      p.deliverableCities &&
      p.deliverableCities.length > 0 &&
      !p.deliverableCities.some(
        (c) => c.toLowerCase() === "lb-beirut",
      )
    ) {
      continue;
    }

    // Must be floral
    if (!isFloralProduct(p)) continue;
    // Must not have non-flower gift category
    if (hasNonFlowerGiftCategory(p)) continue;

    if (seenIds.has(p.id)) continue;
    seenIds.add(p.id);

    if (isLuxuryProduct(p)) {
      luxury.push(p);
    } else {
      regular.push(p);
    }
  }

  return { regular, luxury };
}

// ── Next-available window scanner ─────────────────────────────────────────────

export type NextAvailableParams = {
  timeSlots: OSTimeSlot[];
  slotsByDay?: Record<string, OSTimeSlot[]>;
  nextDayEnabled?: boolean;
  nowUtcMs: number;
};

/**
 * Scans up to NEXT_AVAILABLE_SCAN_DAYS days from tomorrow looking for the
 * first day that has an explicitly enabled, next-day-bookable OS slot.
 * Honors slotsByDay when present, falls back to flat timeSlots.
 * Returns null if none found within the scan window.
 */
export function findNextAvailableWindow(
  params: NextAvailableParams,
): DeliveryWindow | null {
  const { timeSlots, slotsByDay, nowUtcMs } = params;
  const nowParts = toBeirutLocalParts(new Date(nowUtcMs));

  for (let dayOffset = 1; dayOffset <= NEXT_AVAILABLE_SCAN_DAYS; dayOffset++) {
    // Advance the local calendar date, not 24 elapsed hours. This remains
    // correct across Beirut DST transitions where a local day is 23 or 25h.
    const calendarDate = new Date(
      Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day + dayOffset, 12),
    );
    const targetLocalNoon = fromBeirutLocal(
      calendarDate.getUTCFullYear(),
      calendarDate.getUTCMonth() + 1,
      calendarDate.getUTCDate(),
      12,
      0,
    );
    const parts = toBeirutLocalParts(targetLocalNoon);
    const weekdayLong = parts.weekdayLong;

    const candidates: OSTimeSlot[] = slotsByDay
      ? (slotsByDay[weekdayLong] ?? [])
      : timeSlots;
    const nextSlot = [...candidates]
      .filter(
      (s) =>
        typeof s.slotId === "string" &&
        s.slotId.length > 0 &&
        s.enabled === true &&
        s.nextDayEnabled === true &&
        typeof s.startHour === "number" &&
        typeof s.endHour === "number" &&
        typeof s.cutoffHour === "number",
      )
      .sort((a, b) => (a.startHour ?? 0) - (b.startHour ?? 0))[0];

    if (!nextSlot) continue;

    const dateIso = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
    return {
      date: dateIso,
      label: nextSlot.label,
      slotId: nextSlot.slotId!,
      startHour: nextSlot.startHour!,
      endHour: nextSlot.endHour!,
    };
  }
  return null;
}

// ── Build quoteExpiresAt ──────────────────────────────────────────────────────

function buildQuoteExpiresAt(
  nowMs: number,
  effectiveCutoffMs: number | null,
): string {
  const minExpiry = nowMs + QUOTE_MIN_AHEAD_MS;
  if (effectiveCutoffMs !== null && effectiveCutoffMs > nowMs) {
    return new Date(Math.min(minExpiry, effectiveCutoffMs)).toISOString();
  }
  return new Date(minExpiry).toISOString();
}

// ── Main builder ──────────────────────────────────────────────────────────────

export type BuildCampaignInput = {
  /** UTC now (injected for testability). */
  nowMs: number;
  /** Beirut location context from osLocationsCache. */
  location: BeirutLocationContext;
  /** OS products for 'lebanon' store. Null = cache empty. */
  products: OSProduct[] | null;
  /** Product pricing map from osProductsCache. */
  pricingMap: ReadonlyMap<string, ProductPricingEntry>;
  /** Timestamp of last products refresh. Null = never refreshed. */
  productRefreshedAt: Date | null;
};

/**
 * Evaluates the Beirut late-night campaign and returns a fully-typed result.
 * Pure function — does not read any module state.
 */
export function buildBeirutLateNightCampaign(
  input: BuildCampaignInput,
): BeirutLateNightCampaignResult {
  const { nowMs, location, products, pricingMap, productRefreshedAt } = input;

  const evaluatedAt = new Date(nowMs).toISOString();
  const sourceFreshness: SourceFreshness = {
    locationsStatus: location.locationsStatus,
    productRefreshedAt: productRefreshedAt
      ? productRefreshedAt.toISOString()
      : null,
  };

  // ── Empty sections (returned on failure paths) ────────────────────────────
  const emptySection = (
    title: string,
    subtitle: string,
    viewAllHref: string,
  ): CampaignSection => ({
    title,
    subtitle,
    viewAllHref,
    products: [],
  });

  const makeUnavailable = (
    reason: CampaignReason,
    nominalMs: number,
    effectiveCutoffMs: number | null,
    nextAvailableWindow: DeliveryWindow | null,
  ): BeirutLateNightCampaignResult => {
    const nominalCutoffAt = new Date(nominalMs).toISOString();
    const effectiveCutoffAt = effectiveCutoffMs
      ? new Date(effectiveCutoffMs).toISOString()
      : null;
    const quoteExpiresAt = buildQuoteExpiresAt(nowMs, effectiveCutoffMs);
    const status: CampaignStatus =
      nextAvailableWindow != null ? "next-available" : "unavailable";
    return {
      campaignKey: CAMPAIGN_KEY,
      status,
      reason,
      timeZone: BEIRUT_TZ,
      evaluatedAt,
      quoteExpiresAt,
      nominalCutoffAt,
      effectiveCutoffAt,
      cutoffLabel: effectiveCutoffMs
        ? (() => {
            const parts = toBeirutLocalParts(new Date(effectiveCutoffMs));
            return formatHourMinuteLabel(parts.hour, parts.minute);
          })()
        : null,
      sourceFreshness,
      deliveryWindow: null,
      nextAvailableWindow,
      availableTonight: emptySection(
        "Available Tonight",
        "Fresh flowers ready for late-night delivery in Beirut",
        "/category/flowers",
      ),
      luxury: emptySection(
        "Late-Night Luxury Arrangements",
        "Statement flowers for unforgettable last-minute moments",
        "/category/lux-arrangements",
      ),
    };
  };

  // ── 1. Source freshness checks ────────────────────────────────────────────

  // Locations must be "live"
  if (location.locationsStatus !== "live") {
    // Compute nominal cutoff even though we're failing
    const beirutParts = toBeirutLocalParts(new Date(nowMs));
    const nominalMs = nominalCutoffUtcMs(
      beirutParts.year,
      beirutParts.month,
      beirutParts.day,
    );
    return makeUnavailable("source-stale", nominalMs, null, null);
  }

  // Products must not be null and must be fresh (≤ 30 min old)
  if (products === null || products.length === 0) {
    const beirutParts = toBeirutLocalParts(new Date(nowMs));
    const nominalMs = nominalCutoffUtcMs(
      beirutParts.year,
      beirutParts.month,
      beirutParts.day,
    );
    return makeUnavailable("source-stale", nominalMs, null, null);
  }
  if (
    productRefreshedAt === null ||
    nowMs - productRefreshedAt.getTime() > STALE_PRODUCTS_MAX_AGE_MS
  ) {
    const beirutParts = toBeirutLocalParts(new Date(nowMs));
    const nominalMs = nominalCutoffUtcMs(
      beirutParts.year,
      beirutParts.month,
      beirutParts.day,
    );
    return makeUnavailable("source-stale", nominalMs, null, null);
  }

  // ── 2. Location eligibility checks ───────────────────────────────────────

  if (!location.countryActive || !location.cityActive) {
    const beirutParts = toBeirutLocalParts(new Date(nowMs));
    const nominalMs = nominalCutoffUtcMs(
      beirutParts.year,
      beirutParts.month,
      beirutParts.day,
    );
    return makeUnavailable("source-stale", nominalMs, null, null);
  }

  if (!location.expressAvailable) {
    const beirutParts = toBeirutLocalParts(new Date(nowMs));
    const nominalMs = nominalCutoffUtcMs(
      beirutParts.year,
      beirutParts.month,
      beirutParts.day,
    );
    return makeUnavailable("slot-unavailable", nominalMs, null, null);
  }

  if (!location.operationsConfigVerified) {
    const beirutParts = toBeirutLocalParts(new Date(nowMs));
    const nominalMs = nominalCutoffUtcMs(
      beirutParts.year,
      beirutParts.month,
      beirutParts.day,
    );
    return makeUnavailable("operations-unverified", nominalMs, null, null);
  }

  // ── 3. Time evaluation in Asia/Beirut ────────────────────────────────────

  const beirutParts = toBeirutLocalParts(new Date(nowMs));
  const nominalMs = nominalCutoffUtcMs(
    beirutParts.year,
    beirutParts.month,
    beirutParts.day,
  );
  const nominalCutoffAt = new Date(nominalMs).toISOString();
  const todayIso = toBeirutLocalDateIso(new Date(nowMs));

  // Determine which slots to use for today
  // Find the late slot
  const lateSlot = selectLateSlot(
    location.timeSlots,
    location.slotsByDay,
    beirutParts.weekdayLong,
  );

  if (!lateSlot) {
    // No qualifying late slot — look for next available
    const nextAvailableWindow = findNextAvailableWindow({
      timeSlots: location.timeSlots,
      slotsByDay: location.slotsByDay,
      nowUtcMs: nowMs,
    });
    return makeUnavailable("slot-unavailable", nominalMs, null, nextAvailableWindow);
  }

  // Compute effective cutoff: min(nominal, sameDayCutoffHour, lateSlot.cutoffHour)
  const sameDayCutoffMs = cutoffHourUtcMs(
    beirutParts.year,
    beirutParts.month,
    beirutParts.day,
    location.sameDayCutoffHour,
    location.sameDayCutoffMinute ?? 0,
  );
  const slotCutoffMs = cutoffHourUtcMs(
    beirutParts.year,
    beirutParts.month,
    beirutParts.day,
    lateSlot.cutoffHour,
    lateSlot.cutoffMinute ?? 0,
  );
  const effectiveCutoffMs = Math.min(nominalMs, sameDayCutoffMs, slotCutoffMs);
  const effectiveCutoffAt = new Date(effectiveCutoffMs).toISOString();

  const effectiveCutoffParts = toBeirutLocalParts(
    new Date(effectiveCutoffMs),
  );
  const cutoffLabel = formatHourMinuteLabel(
    effectiveCutoffParts.hour,
    effectiveCutoffParts.minute,
  );

  const quoteExpiresAt = buildQuoteExpiresAt(nowMs, effectiveCutoffMs);

  const deliveryWindow: DeliveryWindow = {
    date: todayIso,
    label: lateSlot.label,
    slotId: lateSlot.slotId!,
    startHour: lateSlot.startHour!,
    endHour: lateSlot.endHour!,
  };

  // ── 4. Cutoff check ───────────────────────────────────────────────────────

  if (nowMs >= effectiveCutoffMs) {
    // Determine reason: if effective cutoff < nominal it was an early closure
    const reason: CampaignReason =
      effectiveCutoffMs < nominalMs ? "early-closure" : "after-cutoff";

    const nextAvailableWindow = findNextAvailableWindow({
      timeSlots: location.timeSlots,
      slotsByDay: location.slotsByDay,
      nowUtcMs: nowMs,
    });

    return {
      campaignKey: CAMPAIGN_KEY,
      status: nextAvailableWindow != null ? "next-available" : "unavailable",
      reason,
      timeZone: BEIRUT_TZ,
      evaluatedAt,
      quoteExpiresAt,
      nominalCutoffAt,
      effectiveCutoffAt,
      cutoffLabel,
      sourceFreshness,
      deliveryWindow: null,
      nextAvailableWindow,
      availableTonight: emptySection(
        "Available Tonight",
        "Fresh flowers ready for late-night delivery in Beirut",
        "/category/flowers",
      ),
      luxury: emptySection(
        "Late-Night Luxury Arrangements",
        "Statement flowers for unforgettable last-minute moments",
        "/category/lux-arrangements",
      ),
    };
  }

  // ── 5. Inventory check ────────────────────────────────────────────────────

  const { regular, luxury } = filterAndSplitProducts(products);

  if (regular.length === 0 && luxury.length === 0) {
    const nextAvailableWindow = findNextAvailableWindow({
      timeSlots: location.timeSlots,
      slotsByDay: location.slotsByDay,
      nowUtcMs: nowMs,
    });
    return {
      campaignKey: CAMPAIGN_KEY,
      status: nextAvailableWindow != null ? "next-available" : "unavailable",
      reason: "inventory-unavailable",
      timeZone: BEIRUT_TZ,
      evaluatedAt,
      quoteExpiresAt,
      nominalCutoffAt,
      effectiveCutoffAt,
      cutoffLabel,
      sourceFreshness,
      deliveryWindow: null,
      nextAvailableWindow,
      availableTonight: emptySection(
        "Available Tonight",
        "Fresh flowers ready for late-night delivery in Beirut",
        "/category/flowers",
      ),
      luxury: emptySection(
        "Late-Night Luxury Arrangements",
        "Statement flowers for unforgettable last-minute moments",
        "/category/lux-arrangements",
      ),
    };
  }

  // ── 6. Build product sections ─────────────────────────────────────────────

  // Sort by popularity (totalSales) descending
  regular.sort((a, b) => (b.totalSales ?? 0) - (a.totalSales ?? 0));
  luxury.sort((a, b) => (b.totalSales ?? 0) - (a.totalSales ?? 0));

  const regularProducts = regular
    .slice(0, MAX_REGULAR_PRODUCTS)
    .map((p) => buildCampaignProduct(p, pricingMap));
  const luxuryProducts = luxury
    .slice(0, MAX_LUXURY_PRODUCTS)
    .map((p) => buildCampaignProduct(p, pricingMap));

  const availableTonight: CampaignSection = {
    title: "Available Tonight",
    subtitle: "Fresh flowers ready for late-night delivery in Beirut",
    viewAllHref: "/category/flowers",
    products: regularProducts,
  };

  const luxurySection: CampaignSection = {
    title: "Late-Night Luxury Arrangements",
    subtitle: "Statement flowers for unforgettable last-minute moments",
    viewAllHref: "/category/lux-arrangements",
    products: luxuryProducts,
  };

  return {
    campaignKey: CAMPAIGN_KEY,
    status: "tonight",
    reason: "eligible",
    timeZone: BEIRUT_TZ,
    evaluatedAt,
    quoteExpiresAt,
    nominalCutoffAt,
    effectiveCutoffAt,
    cutoffLabel,
    sourceFreshness,
    deliveryWindow,
    nextAvailableWindow: null,
    availableTonight,
    luxury: luxurySection,
  };
}
