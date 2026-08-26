// Authoritative server-side pricing data.
// The client is never trusted as the source of truth for prices or fees.

import { resolveStore, wooAuthHeader, type WooStoreConfig } from "./wooStore";
import { getOsProductBySlug, getOsProductByWcId, getOsProductPricingMap, hasOsProducts } from "./osProductsCache";
import {
  getOsCountryFreeDeliveryThresholdUsd,
  getOsCountryFreeDeliveryEnabled,
  getOsCityFreeDeliveryThresholdUsd,
  getOsCityFreeDeliveryEnabled,
  getOsCityDeliveryFeeUsd,
  getDeliverySlots,
  getExpressConfig,
} from "./osLocationsCache";
import {
  getLocalIso,
  isSlotStillBookable,
  isMidnightSlot,
  isMidnightServiceSlot,
  isMidnightEligibleCity,
  MIDNIGHT_FEE_USD,
  midnightWindowForOccasionDate,
  type SlotBookability,
} from "@workspace/delivery";

// District delivery fees in USD. Mirrors the client-side list but lives
// server-side so the client cannot manipulate the delivery fee.
export const DISTRICT_FEES: Record<string, number> = {
  Akkar: 39,
  Aley: 19,
  Baabda: 11,
  Baalbeck: 39,
  Batroun: 19,
  Bcharee: 39,
  Beirut: 8,
  "Bent Jbeil": 39,
  Chouf: 29,
  Hasbaya: 39,
  Hermel: 39,
  Jbeil: 19,
  Jezzine: 29,
  Kesserwan: 11,
  Koura: 29,
  Marjayoun: 39,
  Metn: 11,
  "Minnieh-Dennaya": 39,
  Nabatieh: 39,
  Rechaya: 39,
  Saida: 29,
  Tripoli: 29,
  Tyre: 39,
  "West Bekaa": 39,
  Zahle: 29,
  Zgharta: 39,
  Dubai: 13.61,
  "Ras Al Khaimah": 13.61,
  "Umm Al Quwain": 13.61,
  Fujairah: 13.61,
  Ajman: 13.61,
  Sharjah: 13.61,
  "Abu Dhabi": 13.61,
  Larnaca: 11,
  Limassol: 11,
  Nicosia: 11,
  Paphos: 11,
};

export const EXPRESS_SURCHARGE_USD = 15;
export const FREE_DELIVERY_THRESHOLD_USD = 130;

const UAE_DISTRICT_NAMES = new Set([
  "Dubai", "Ras Al Khaimah", "Umm Al Quwain", "Fujairah", "Ajman", "Sharjah", "Abu Dhabi",
]);
const CY_DISTRICT_NAMES = new Set(["Larnaca", "Limassol", "Nicosia", "Paphos"]);

export function countryForDistrict(district: string): string {
  if (UAE_DISTRICT_NAMES.has(district)) return "AE";
  if (CY_DISTRICT_NAMES.has(district)) return "CY";
  return "LB";
}

export function expressSurchargeUsd(countryCode?: string): number {
  if (countryCode === "AE") return 4.90;
  return 15;
}

/** Hardcoded fallback free-delivery thresholds (USD) used when the OS cache is empty. */
export function freeDeliveryThresholdUsd(countryCode?: string): number {
  if (countryCode === "AE") return 89.84;
  if (countryCode === "CY") return 120;
  return 90;
}

// Returns the base district fee (before applying the free-delivery threshold).
export function baseDistrictFeeUsd(district: string): number {
  // Unknown districts default to the highest tier so we never under-charge.
  return DISTRICT_FEES[district] ?? 39;
}

// Returns the effective district fee after applying the free-delivery threshold.
// The "Ask the recipient for the address" toggle does NOT change this fee —
// no-address orders pay exactly the same district/city fee as regular orders.
// City-level OS settings take precedence over country-level; both fall back to
// the hardcoded per-country defaults when the OS cache is empty.
export function computeDistrictFeeUsd(
  district: string,
  subtotalUsd: number,
): number {
  const country = countryForDistrict(district);
  // City-level wins over country-level, country-level wins over hardcoded.
  const threshold =
    getOsCityFreeDeliveryThresholdUsd(country, district) ??
    getOsCountryFreeDeliveryThresholdUsd(country) ??
    freeDeliveryThresholdUsd(country);
  const freeDeliveryEnabled =
    getOsCityFreeDeliveryEnabled(country, district) ??
    getOsCountryFreeDeliveryEnabled(country) ??
    true;
  if (freeDeliveryEnabled && subtotalUsd >= threshold) return 0;
  // OS city fee wins over hardcoded table; hardcoded table is the cold-start fallback.
  return getOsCityDeliveryFeeUsd(country, district) ?? baseDistrictFeeUsd(district);
}

/** $5 same-day night surcharge applied when the OS sends no explicit fee override. */
export const NIGHT_SLOT_SURCHARGE_USD = 5;

/**
 * Compute the slot fee for a delivery slot.
 *
 * Returns:
 * - `extraFee` from the OS slot config when set and > 0
 * - $5 night-slot surcharge when the slot starts at or after 21:00 and
 *   `deliveryDate` is today in the recipient country (or when `deliveryDate`
 *   is absent)
 * - 0 otherwise (no premium slot chosen, or express delivery was selected)
 *
 * Mirrors the client-side logic in `checkoutFees.ts` and the local copy in
 * `routes/checkout.ts`. Centralised here so Mamo/PayPal/Tabby session-
 * creation routes can charge the authoritative slot fee in the same way.
 */
type SlotLike = {
  label: string;
  slotId?: string;
  extraFee?: number | null;
  startHour?: number;
  cutoffHour?: number;
  sameDayEnabled?: boolean;
  nextDayEnabled?: boolean;
  endHour?: number;
  enabled?: boolean;
  serviceType?: string;
};

/**
 * Date-aware server-side slot resolution — mirrors the client's
 * `displayedSlotsForDate` semantics so the server always charges for the
 * variant the UI displayed:
 *
 * 1. Filter by date eligibility: today → sameDayEnabled !== false,
 *    tomorrow-or-later → nextDayEnabled !== false. When no slot in the city
 *    list carries the relevant flag at all (legacy data), the filter is
 *    skipped.
 * 2. Deduplicate by label: today prefers sameDayEnabled=true then higher
 *    extraFee; other dates prefer nextDayEnabled=true then lower extraFee.
 * 3. Resolve the booked slot by slotId within the eligible set first; a
 *    slotId that is not eligible for the date (e.g. a next-day-free duplicate
 *    submitted for today) is normalized to the date-correct same-label
 *    variant instead of being trusted.
 */
export function resolveSlotForDate<T extends SlotLike>(
  citySlots: T[],
  opts: {
    deliverySlot: string;
    deliverySlotId?: string;
    dateIso: string;
    todayIso: string;
    cityId?: string;
  },
): T | undefined {
  const { deliverySlot, deliverySlotId, dateIso, todayIso } = opts;
  const isToday = dateIso === todayIso;

  // An OS slot ID is the authoritative identity. When one is submitted, never
  // substitute another same-label variant: identity, label, enabled state, and
  // date eligibility must all describe the same configured row. Midnight is
  // the sole date-flag exception because its selected start date owns a
  // 23:00 → following-day 01:00 window.
  if (deliverySlotId) {
    const exact = citySlots.find(
      (slot) => slot.slotId === deliverySlotId && slot.enabled !== false,
    );
    if (!exact || exact.label !== deliverySlot) return undefined;
    if (isMidnightSlot(exact, opts.cityId)) return exact;
    if (
      isToday &&
      citySlots.some((s) => s.sameDayEnabled !== undefined) &&
      exact.sameDayEnabled === false
    ) {
      return undefined;
    }
    if (
      !isToday &&
      citySlots.some((s) => s.nextDayEnabled !== undefined) &&
      exact.nextDayEnabled === false
    ) {
      return undefined;
    }
    return exact;
  }

  let eligible = citySlots.filter((slot) => slot.enabled !== false);
  if (isToday && citySlots.some((s) => s.sameDayEnabled !== undefined)) {
    eligible = citySlots.filter((s) => s.sameDayEnabled !== false);
  } else if (!isToday && citySlots.some((s) => s.nextDayEnabled !== undefined)) {
    // Tomorrow and later both use the next-day flag (matches client).
    eligible = citySlots.filter((s) => s.nextDayEnabled !== false);
  }

  // Deduplicate by label, keeping the variant best suited to the date.
  const byLabel = new Map<string, T>();
  for (const slot of eligible) {
    const existing = byLabel.get(slot.label);
    if (!existing) {
      byLabel.set(slot.label, slot);
      continue;
    }
    const prefer = (a: T, b: T): T => {
      if (isToday) {
        if ((a.sameDayEnabled === true) !== (b.sameDayEnabled === true)) {
          return a.sameDayEnabled === true ? a : b;
        }
        return (a.extraFee ?? 0) >= (b.extraFee ?? 0) ? a : b;
      }
      if ((a.nextDayEnabled === true) !== (b.nextDayEnabled === true)) {
        return a.nextDayEnabled === true ? a : b;
      }
      return (a.extraFee ?? 0) <= (b.extraFee ?? 0) ? a : b;
    };
    byLabel.set(slot.label, prefer(existing, slot));
  }
  const deduped = [...byLabel.values()];

  return deduped.find((s) => s.label === deliverySlot);
}

export function computeSlotFeeUsd({
  expressDelivery,
  deliverySlot,
  deliverySlotId,
  cityId,
  deliveryDate,
  district,
}: {
  expressDelivery?: boolean;
  deliverySlot?: string;
  deliverySlotId?: string;
  cityId?: string;
  deliveryDate?: string;
  district?: string;
}): number {
  if (expressDelivery || !deliverySlot || !cityId) return 0;
  const bookedCountry = countryForDistrict(district ?? "Beirut");
  const todayIso = getLocalIso(bookedCountry);
  const citySlots = getDeliverySlots(cityId, deliveryDate || todayIso);
  const bookedSlot = resolveSlotForDate(citySlots, {
    deliverySlot,
    deliverySlotId,
    dateIso: deliveryDate || todayIso,
    todayIso,
    cityId,
  });
  if (!bookedSlot) return 0;
  // MIDNIGHT: always charge exactly MIDNIGHT_FEE_USD ($20) — never use label
  // heuristic, never waive via free-delivery, never defer to extraFee.
  if (isMidnightSlot(bookedSlot, cityId)) return MIDNIGHT_FEE_USD;
  // extraFee: N > 0 → OS provides the exact fee; use it directly.
  // extraFee: 0/undefined/null → no real OS override; fall through to the
  // night-slot heuristic. This matches the client-side display logic
  // (displayedSlotsForDate / checkoutFees.ts): a same-day night slot with an
  // explicit 0 still shows and charges the $5 fallback, so the amount the
  // shopper sees always equals the amount charged.
  if (bookedSlot.extraFee !== undefined && bookedSlot.extraFee !== null && Number(bookedSlot.extraFee) > 0) {
    return Number(bookedSlot.extraFee);
  }
  const slotStartHour = bookedSlot.startHour ?? bookedSlot.cutoffHour ?? 0;
  const isNightSlot = slotStartHour >= 21;
  const isToday = !deliveryDate || deliveryDate === todayIso;
  if (isNightSlot && isToday) return NIGHT_SLOT_SURCHARGE_USD;
  return 0;
}

// ---------------------------------------------------------------------------
// Submission-time slot re-validation (stale same-day slot guard)
// ---------------------------------------------------------------------------

export type SubmittedSlotInput = {
  expressDelivery?: boolean;
  deliverySlot?: string;
  deliverySlotId?: string;
  deliveryDate?: string;
  cityId?: string;
  deliveryServiceType?: "midnight";
  district?: string;
  /** Injected clock for tests. */
  now?: Date;
};

/**
 * Server-authoritative re-check that a submitted delivery date + slot is
 * still bookable "now" in the store's local timezone. Express orders and
 * payloads without a slot label are always allowed (express has its own
 * availability gate). The slot is resolved from the OS city config
 * (slotId-first, date-aware) so we honour the real window end hour. A
 * scheduled order is unavailable unless its exact slot is currently supplied
 * by the selected city's OS schedule.
 */
export function checkSubmittedSlotBookable(
  opts: SubmittedSlotInput,
): SlotBookability & { serviceType?: "midnight" } {
  if (opts.expressDelivery || !opts.deliverySlot) return { bookable: true };
  if (!opts.cityId) return { bookable: false, reason: "slot_unavailable" };
  const country = countryForDistrict(opts.district ?? "Beirut");
  const todayIso = getLocalIso(country, opts.now);
  const citySlots = opts.cityId
    ? getDeliverySlots(opts.cityId, opts.deliveryDate || todayIso)
    : [];
  let exactSubmittedSlot: (typeof citySlots)[number] | undefined;
  if (opts.deliverySlotId) {
    exactSubmittedSlot = citySlots.find(
      (slot) => slot.slotId === opts.deliverySlotId,
    );
    if (!exactSubmittedSlot || exactSubmittedSlot.enabled === false) {
      return {
        bookable: false,
        reason: "slot_unavailable",
      };
    }
  }
  const resolvedSlot = resolveSlotForDate(citySlots, {
    deliverySlot: opts.deliverySlot,
    deliverySlotId: opts.deliverySlotId,
    dateIso: opts.deliveryDate || todayIso,
    todayIso,
    cityId: opts.cityId,
  });
  if (!resolvedSlot) {
    return { bookable: false, reason: "slot_unavailable" };
  }
  const bookedSlot = resolvedSlot;
  const bookedIsMidnight = isMidnightSlot(
    bookedSlot as { serviceType?: string; startHour?: number; endHour?: number },
    opts.cityId,
  );
  if (
    isMidnightServiceSlot(
      bookedSlot as { serviceType?: string; startHour?: number; endHour?: number },
    ) &&
    !isMidnightEligibleCity(opts.cityId)
  ) {
    return { bookable: false, reason: "slot_unavailable" };
  }
  if (bookedIsMidnight && !opts.deliverySlotId) {
    return { bookable: false, reason: "slot_unavailable" };
  }
  if (
    bookedIsMidnight &&
    exactSubmittedSlot?.slotId !==
      (bookedSlot as { slotId?: string }).slotId
  ) {
    return { bookable: false, reason: "slot_unavailable" };
  }
  if (
    opts.deliveryServiceType === "midnight" &&
    (!opts.deliverySlotId || !bookedIsMidnight)
  ) {
    return { bookable: false, reason: "slot_unavailable" };
  }
  const { sameDayCutoffHour, sameDayCutoffMinute } = getExpressConfig(
    opts.cityId,
  );
  const isBeirutLateSlot =
    country === "LB" &&
    /(?:^|-)beirut$/i.test(opts.cityId ?? "") &&
    Boolean(opts.deliverySlotId) &&
    exactSubmittedSlot?.enabled === true &&
    exactSubmittedSlot.sameDayEnabled === true &&
    typeof exactSubmittedSlot.startHour === "number" &&
    exactSubmittedSlot.startHour >= 18 &&
    typeof exactSubmittedSlot.endHour === "number" &&
    (exactSubmittedSlot.endHour >= 21 ||
      exactSubmittedSlot.endHour < exactSubmittedSlot.startHour);
  const bookability = isSlotStillBookable({
    deliveryDate: opts.deliveryDate,
    slot: bookedSlot,
    countryCode: country,
    cityId: opts.cityId,
    sameDayCutoffHour,
    sameDayCutoffMinute,
    enforceSlotCutoff: isBeirutLateSlot,
    hardCutoffMinutes: isBeirutLateSlot ? 23 * 60 + 30 : undefined,
    now: opts.now,
  });
  return bookability.bookable && bookedIsMidnight
    ? { ...bookability, serviceType: "midnight" }
    : bookability;
}

export type OrderSlotGuardResult =
  | { action: "allow" }
  /** Stale slot but the order is already paid (paymentRef present) — a paid
   *  rescue (webhook / sweeper / recovery replay) must never be blocked; the
   *  caller logs/flags instead of rejecting. */
  | { action: "allow_paid"; reason: string }
  | { action: "reject"; reason: string };

/** Order-creation policy on top of checkSubmittedSlotBookable. */
export function evaluateOrderSlotGuard(
  opts: SubmittedSlotInput & { paymentRef?: string },
): OrderSlotGuardResult {
  const check = checkSubmittedSlotBookable(opts);
  if (check.bookable) return { action: "allow" };
  if (opts.paymentRef) return { action: "allow_paid", reason: check.reason };
  return { action: "reject", reason: check.reason };
}

/**
 * Midnight-specific pre-payment guard (409 before charge creation).
 *
 * When the submitted delivery slot resolves to a Midnight slot for the given
 * cityId + selected start date, this verifier checks that the exact slotId still
 * exists and is enabled in the OS city config for that day. Returns a 409
 * error if the slot is missing or disabled so the client can show an
 * actionable error before any money moves.
 *
 * IMPORTANT: paid recovery replays (paymentRef present) always pass — a
 * charge has already been captured and must never be left orphaned.
 *
 * Returns `{ ok: true }` for all non-Midnight or express orders so callers
 * can use this unconditionally.
 */
export function checkMidnightSlotAvailable(opts: {
  expressDelivery?: boolean;
  deliverySlotId?: string;
  deliverySlot?: string;
  deliveryDate?: string;
  cityId?: string;
  district?: string;
  /** Paid recovery path — always allow. */
  paymentRef?: string;
}): { ok: true } | { ok: false; code: string; message: string } {
  if (opts.expressDelivery || !opts.cityId || !opts.deliverySlot) return { ok: true };
  // Paid recovery: charge is already captured — never block.
  if (opts.paymentRef) return { ok: true };

  const country = countryForDistrict(opts.district ?? "Beirut");
  const todayIso = getLocalIso(country);
  const citySlots = getDeliverySlots(opts.cityId, opts.deliveryDate || todayIso);

  // Any submitted OS slot identity must still exist for the selected date.
  // Never silently substitute a same-label slot when an exact ID was supplied.
  const exactSlot = opts.deliverySlotId
    ? citySlots.find((slot) => slot.slotId === opts.deliverySlotId)
    : undefined;
  if (opts.deliverySlotId && (!exactSlot || exactSlot.enabled === false)) {
    return {
      ok: false,
      code: "delivery_slot_unavailable",
      message:
        "The selected delivery slot is no longer available for this date. Please choose another time.", // i18n-ignore
    };
  }
  const resolvedSlot =
    exactSlot ??
    resolveSlotForDate(citySlots, {
      deliverySlot: opts.deliverySlot,
      deliverySlotId: opts.deliverySlotId,
      dateIso: opts.deliveryDate || todayIso,
      todayIso,
      cityId: opts.cityId,
    });

  // Only enforce the remaining gate for Midnight slots.
  if (!resolvedSlot || !isMidnightSlot(resolvedSlot, opts.cityId)) return { ok: true };

  // The slot resolved correctly — it exists and is eligible for the date.
  // (resolveSlotForDate already filters by sameDayEnabled / nextDayEnabled.)
  // Re-verify that the exact submitted slotId matches (tamper protection):
  // a client that forges a Midnight slotId against a standard slot must be
  // caught before the order is submitted to OS.
  if (!opts.deliverySlotId || resolvedSlot.slotId !== opts.deliverySlotId) {
    return {
      ok: false,
      code: "midnight_slot_unavailable",
      message:
        "The Midnight delivery slot is no longer available for the selected date. Please choose a different slot.", // i18n-ignore
    };
  }

  return { ok: true };
}
type CatalogProduct = { price: number; name: string };

// Fetch the authoritative catalog price (USD) for a single product by WC ID.
//
// Phase 2 price-verification hierarchy:
//   1. Presentail OS cache (primary, O(1) by wcId within the store's country).
//      When the OS cache is populated for this store, it is the sole authority
//      for prices — WooCommerce is NOT consulted on a miss. This prevents a
//      stale or mis-configured WC store from silently overriding OS prices and
//      closes the window where an attacker could manipulate prices by requesting
//      a WC product not yet in OS.
//   2. WooCommerce REST API (fallback) — consulted ONLY when the OS cache has
//      not yet been populated for this store (startup window before the first
//      successful OS poll). Once OS data is available, this path is bypassed.
//
// Returns null if the product is not found in the active source.
/**
 * Resolve the effective USD price for an OS product, consulting the pricing
 * enrichment map first.
 *
 * The OS list endpoint omits sale_price / regular_price / discount_price_* —
 * those are fetched per-product by the background enrichment step and stored in
 * cachedProductPricing (keyed by osNumericId string).
 *
 * Rule: if the enrichment map has a discountPriceUsd for this product, that IS
 * the price the customer should be charged. The raw osProduct.price is the
 * regular/list price and must NOT be used when a sale is active.
 */
export function resolveOsEffectivePrice(osProduct: { osNumericId?: number | string; price: number }): number {
  const key = osProduct.osNumericId != null ? String(osProduct.osNumericId) : "";
  if (key) {
    const entry = getOsProductPricingMap().get(key);
    if (entry?.discountPriceUsd != null && entry.discountPriceUsd > 0) {
      return entry.discountPriceUsd;
    }
  }
  return osProduct.price;
}

export async function fetchWcProductPrice(wcId: number, store?: WooStoreConfig): Promise<CatalogProduct | null> {
  const s = store ?? resolveStore();

  // Primary: Presentail OS cache (O(1) lookup by wcId, country-scoped).
  const osProduct = getOsProductByWcId(wcId, s.storeKey);
  if (osProduct) {
    const effectivePrice = resolveOsEffectivePrice(osProduct);
    if (effectivePrice > 0) {
      return { price: effectivePrice, name: osProduct.name };
    }
    // OS has the product but price is zero/invalid — treat as not orderable.
    return null;
  }

  // When OS is populated for this country, it is authoritative — do not fall
  // through to WooCommerce for products not yet mirrored in OS.
  if (hasOsProducts(s.storeKey)) return null;

  // Fallback: WooCommerce REST API — only reached before OS has first populated.
  if (!s.consumerKey) return null;
  try {
    const r = await fetch(`${s.baseUrl}/products/${wcId}`, {
      headers: {
        Authorization: wooAuthHeader(s),
        "Content-Type": "application/json",
        "User-Agent": "PresentailApp/1.0",
      },
    });
    if (!r.ok) return null;
    const data = (await r.json()) as { price?: string; name?: string };
    const price = parseFloat(data.price ?? "");
    if (isNaN(price) || price <= 0) return null;
    return { price, name: data.name ?? String(wcId) };
  } catch {
    return null;
  }
}

export type ResolvedCartItem = {
  wcId: number;
  osSlug?: string;
  name: string;
  priceUsd: number;
  quantity: number;
  description?: string;
  image?: string;
};

// Resolve catalog prices for a list of cart items.
// Each item must have a wcId > 0 OR an osSlug so the server can verify its price.
// Enforces positive integer quantities — fractional or zero quantities would
// silently distort the computed total.
// Returns an error if any item cannot be found in the catalog.
export async function resolveCartItems(
  items: { wcId: number; osSlug?: string; quantity: number; name?: string; description?: string; image?: string }[],
  store?: WooStoreConfig,
): Promise<{ ok: true; items: ResolvedCartItem[]; subtotalUsd: number } | { ok: false; message: string }> {
  const s = store ?? resolveStore();
  // Do not require WC credentials here — fetchWcProductPrice checks the OS
  // cache first (O(1), no network) and only falls back to the WC REST API
  // when the OS cache has no entry for that wcId. Failing early when WC is
  // unconfigured would break checkout for shops that are fully OS-backed.
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, message: "Cart is empty" }; // i18n-ignore
  }
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      return {
        ok: false,
        message: `Invalid quantity for product ${item.osSlug ?? item.wcId}: must be a positive integer (got ${item.quantity})`, // i18n-ignore
      };
    }
  }
  const resolved: ResolvedCartItem[] = [];
  for (const item of items) {
    let catalog: { price: number; name: string } | null = null;
    let resolvedSlug: string | undefined = item.osSlug;
    if (item.wcId > 0) {
      // Standard: look up by WooCommerce ID (also checks OS cache by wcId index).
      catalog = await fetchWcProductPrice(item.wcId, s);
      if (!resolvedSlug) {
        // Derive slug from the OS product entry when not provided by the client.
        const osProduct = getOsProductByWcId(item.wcId, s.storeKey);
        resolvedSlug = osProduct?.id;
      }
      // Fallback: if WC lookup failed (WC not configured or product not in the wcId
      // index) AND the client provided an osSlug, try the OS slug cache directly.
      // This handles the common production case where WC credentials are retired
      // but the OS cache is fully populated and carries accurate prices.
      if (!catalog && item.osSlug) {
        const osProduct =
          getOsProductBySlug(item.osSlug, s.storeKey) ??
          getOsProductBySlug(item.osSlug);
        if (osProduct) {
          const effectivePrice = resolveOsEffectivePrice(osProduct);
          if (effectivePrice > 0) {
            catalog = { price: effectivePrice, name: osProduct.name };
            resolvedSlug = osProduct.id;
          }
        }
      }
    } else if (item.osSlug) {
      // OS-native product (wcId === 0): look up directly by slug in the OS cache.
      // Fall back to any-store lookup when the store-specific cache is cold so
      // Whish/offline orders succeed even during transient cache population.
      const osProduct =
        getOsProductBySlug(item.osSlug, s.storeKey) ??
        getOsProductBySlug(item.osSlug);
      if (osProduct) {
        const effectivePrice = resolveOsEffectivePrice(osProduct);
        if (effectivePrice > 0) {
          catalog = { price: effectivePrice, name: osProduct.name };
          resolvedSlug = osProduct.id;
        }
      }
    }
    if (!catalog) {
      return { ok: false, message: `Product ${item.osSlug ?? item.wcId} not found in catalog` }; // i18n-ignore
    }
    resolved.push({
      wcId: item.wcId,
      osSlug: resolvedSlug,
      name: item.name ?? catalog.name,
      priceUsd: catalog.price,
      quantity: item.quantity,
      description: item.description,
      image: item.image,
    });
  }
  const subtotalUsd = resolved.reduce((sum, i) => sum + i.priceUsd * i.quantity, 0);
  return { ok: true, items: resolved, subtotalUsd };
}

// ── Payment verification helpers ──────────────────────────────────────────

// Verify a Stripe checkout session was paid AND that it was created for the
// expected orderId. The orderId is embedded in session.metadata by the server
// when creating the session; a matching value proves this session was not
// created for a different (cheaper) order and replayed here.
//
// stripeKey must be the secret key for the Stripe account that created the
// session (STRIPE_SECRET_KEY — the single CY account used for all currencies).
export async function verifyStripePayment(
  sessionId: string,
  expectedOrderId: string,
  stripeKey?: string,
): Promise<boolean> {
  const key = stripeKey ?? process.env.STRIPE_SECRET_KEY;
  if (!key || !sessionId) return false;
  try {
    const encoded = Buffer.from(`${key}:`).toString("base64");
    const r = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      { headers: { Authorization: `Basic ${encoded}` } },
    );
    if (!r.ok) return false;
    const data = (await r.json()) as { payment_status?: string; metadata?: Record<string, string> };
    if (data.payment_status !== "paid") return false;
    // Verify the session was created for this specific order.
    const sessionOrderId = data.metadata?.orderId ?? "";
    return sessionOrderId === expectedOrderId;
  } catch {
    return false;
  }
}

// Verify a Stripe PaymentIntent was successfully paid AND that it was created
// for the expected orderId (stored in metadata). Used by the inline Elements
// card flow (paymentRef starts with "pi_") in contrast to verifyStripePayment
// which checks hosted Checkout sessions (paymentRef starts with "cs_").
//
// stripeKey must be the secret key for the Stripe account that created the
// PaymentIntent (STRIPE_SECRET_KEY — the single CY account used for all currencies).
export async function verifyStripePaymentIntentPaid(
  paymentIntentId: string,
  expectedOrderId: string,
  stripeKey?: string,
): Promise<boolean> {
  const details = await fetchStripePaymentIntentDetails(paymentIntentId, expectedOrderId, stripeKey);
  return details !== null;
}

// Fetch full payment details for a Stripe PaymentIntent. Returns paid amount
// and currency in addition to the paid/orderId verification. Used by the
// expired-intent recovery path to verify that the amount Stripe actually
// collected covers the catalog value of the submitted order items.
//
// Returns null when the intent does not exist, has not succeeded, or
// metadata.orderId does not match expectedOrderId.
export async function fetchStripePaymentIntentDetails(
  paymentIntentId: string,
  expectedOrderId: string,
  stripeKey?: string,
): Promise<{ paid: boolean; amountReceived: number; currency: string } | null> {
  const key = stripeKey ?? process.env.STRIPE_SECRET_KEY;
  if (!key || !paymentIntentId) return null;
  try {
    const encoded = Buffer.from(`${key}:`).toString("base64");
    const r = await fetch(
      `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`,
      { headers: { Authorization: `Basic ${encoded}` } },
    );
    if (!r.ok) return null;
    const data = (await r.json()) as {
      status?: string;
      metadata?: Record<string, string>;
      amount_received?: number;
      currency?: string;
    };
    if (data.status !== "succeeded") return null;
    const piOrderId = data.metadata?.orderId ?? "";
    if (piOrderId !== expectedOrderId) return null;
    return {
      paid: true,
      amountReceived: data.amount_received ?? 0,
      currency: (data.currency ?? "usd").toUpperCase(),
    };
  } catch {
    return null;
  }
}

// Verify a Mamo payment link was paid. Returns true only if Mamo confirms
// the link is in a paid/completed state.
export async function verifyMamoPayment(linkId: string): Promise<boolean> {
  const key = process.env.MAMO_SECRET_KEY;
  if (!key || !linkId) return false;
  try {
    const r = await fetch(
      `https://business.mamopay.com/manage_api/v1/links/${encodeURIComponent(linkId)}`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    if (!r.ok) return false;
    const data = (await r.json()) as any;
    const status: string = (data.status ?? data.payment_status ?? "").toLowerCase();
    return status === "paid" || status === "completed";
  } catch {
    return false;
  }
}

const PAYPAL_BASE =
  process.env.PAYPAL_SANDBOX === "true"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";

async function getPayPalToken(): Promise<string | null> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  try {
    const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const r = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${encoded}`,
      },
      body: "grant_type=client_credentials",
    });
    const data = (await r.json()) as any;
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

// Capture a PayPal order and verify it completed. Returns true only when
// the capture API responds with COMPLETED status. This is idempotent —
// calling it on an already-captured order returns the existing capture.
export async function captureAndVerifyPayPalOrder(orderId: string): Promise<boolean> {
  if (!orderId) return false;
  const token = await getPayPalToken();
  if (!token) return false;
  try {
    const r = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    if (!r.ok) return false;
    const data = (await r.json()) as any;
    return (
      data.status === "COMPLETED" ||
      data.purchase_units?.[0]?.payments?.captures?.[0]?.status === "COMPLETED"
    );
  } catch {
    return false;
  }
}

/** Authoritative service marker for a submitted exact OS slot identity. */
export function resolveDeliveryServiceType(opts: {
  expressDelivery?: boolean;
  deliverySlotId?: string;
  deliverySlot?: string;
  deliveryDate?: string;
  cityId?: string;
  district?: string;
}): "midnight" | undefined {
  return resolveMidnightWindow(opts) ? "midnight" : undefined;
}

/**
 * Extract window timestamps for a Midnight booking so they can be stored in
 * app_orders.deliveryWindowStart / deliveryWindowEnd and sent to OS.
 *
 * Returns undefined for non-Midnight or express orders.
 */
export function resolveMidnightWindow(opts: {
  expressDelivery?: boolean;
  deliverySlotId?: string;
  deliverySlot?: string;
  deliveryDate?: string;
  cityId?: string;
  district?: string;
}): ReturnType<typeof midnightWindowForOccasionDate> | undefined {
  if (opts.expressDelivery || !opts.cityId || !opts.deliveryDate || !opts.deliverySlot) return undefined;
  const country = countryForDistrict(opts.district ?? "Beirut");
  const todayIso = getLocalIso(country);
  const citySlots = getDeliverySlots(opts.cityId, opts.deliveryDate);
  const resolvedSlot = resolveSlotForDate(citySlots, {
    deliverySlot: opts.deliverySlot,
    deliverySlotId: opts.deliverySlotId,
    dateIso: opts.deliveryDate,
    todayIso,
    cityId: opts.cityId,
  });
  if (!resolvedSlot || !isMidnightSlot(resolvedSlot, opts.cityId)) return undefined;
  return midnightWindowForOccasionDate(opts.deliveryDate);
}
