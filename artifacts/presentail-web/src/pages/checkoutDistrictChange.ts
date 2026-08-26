/**
 * Pure helpers for revalidating the current delivery selection when the
 * shopper changes the Delivery District (Emirate in AE, Governorate in LB)
 * on the checkout page.
 *
 * Extracted from Checkout.tsx so the classification rules can be unit-tested
 * directly. All amounts are USD — the cart's internal currency.
 */

import { displayedSlotsForDate } from "@/components/delivery/displayedSlots";
import {
  getCountryHour,
  getLocalIso,
  isExpressDeliveryAvailable,
  type TimeSlot,
} from "@workspace/delivery";
import { calcCheckoutFees } from "./checkoutFees";

/** Minimal structural view of an OS delivery city (from /api/delivery-locations). */
export interface DistrictCityInput {
  id?: string;
  name?: string;
  fee?: number;
  expressAvailable?: boolean;
  timeSlots?: TimeSlot[];
  slotsByDay?: Record<string, TimeSlot[] | undefined>;
  freeDeliveryThresholdUsd?: number;
  freeDeliveryEnabled?: boolean;
}

export type DistrictChangeOutcome =
  /** Nothing was selected (or only a date without a slot) — nothing to preserve or clear. */
  | { kind: "none" }
  /**
   * The current selection is still valid in the new district. `slotId` is the
   * id of the matching slot in the NEW city's catalogue (null for express or
   * legacy slots without ids) so the caller can re-point a same-label
   * selection at the new city's slot configuration. `newFeeUsd` is the
   * district+slot fee the checkout will charge after the change.
   */
  | { kind: "kept"; slotId: string | null; newFeeUsd: number }
  /** The selection cannot be fulfilled in the new district and must be cleared. */
  | { kind: "invalid"; reason: "express" | "slot" };

/**
 * Resolve the city's slot catalogue for a selected date. OS slot IDs are
 * weekday-specific, so a date-aware lookup must take priority over the flat
 * fallback list; otherwise checkout can replace a valid selected slot ID with
 * a same-label ID from a different weekday.
 */
export function slotCatalogueForCity(
  city: DistrictCityInput,
  dateIso?: string | null,
): TimeSlot[] {
  if (dateIso && city.slotsByDay) {
    const weekday = new Date(`${dateIso}T12:00:00Z`)
      .toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })
      .toLowerCase();
    if (Object.prototype.hasOwnProperty.call(city.slotsByDay, weekday)) {
      return city.slotsByDay[weekday] ?? [];
    }
  }
  if (city.timeSlots?.length) return city.timeSlots;
  if (city.slotsByDay) {
    const derived = Object.values(city.slotsByDay)
      .flat()
      .filter((s): s is TimeSlot => s !== undefined)
      .filter((s, i, arr) => arr.findIndex((t) => t.cutoffHour === s.cutoffHour) === i);
    if (derived.length > 0) return derived;
  }
  return [];
}

export interface ClassifyDistrictChangeInput {
  /** Current in-checkout delivery mode. */
  mode: "express" | "schedule";
  /** Label of the currently selected slot ("" when none). */
  slotLabel: string;
  /** OS slot id of the current selection, when known. */
  slotId: string | null;
  /** Selected delivery date (YYYY-MM-DD), or null/"" for "today". */
  dateIso: string | null;
  /** Store country code — drives market-local "today" and cutoff hours. */
  countryCode: string;
  /** Cart subtotal in USD (feeds the free-delivery threshold). */
  subtotal: number;
  /** Ask-recipient flow: no address collected now. */
  noAddress: boolean;
  /** The NEW city the shopper just selected. */
  city: DistrictCityInput;
  /** Country-level free-delivery fallbacks (city-level values win). */
  countryFreeDeliveryThresholdUsd?: number;
  countryFreeDeliveryEnabled?: boolean;
  /** Injectable clock for tests. */
  now?: Date;
}

/**
 * Decide what happens to the current delivery selection when the shopper
 * switches to `city`.
 *
 * Slot validity mirrors what the delivery picker would offer for the same
 * date in the new city: the city catalogue filtered through
 * displayedSlotsForDate, with today's slots additionally required to still be
 * before their order cutoff. Matching is slotId-first with a label fallback,
 * so a same-label slot with a different OS id in the new city counts as
 * valid (the caller re-points the id).
 */
export function classifyDistrictChange(
  input: ClassifyDistrictChangeInput,
): DistrictChangeOutcome {
  const { mode, slotLabel, slotId, countryCode, city } = input;
  const now = input.now ?? new Date();
  const todayIso = getLocalIso(countryCode, now);
  const dateIso = input.dateIso || todayIso;
  const catalogue = slotCatalogueForCity(city, dateIso);
  const cityIdStr = city.id ? String(city.id) : null;

  const feeFor = (
    lbl: string,
    sid: string | undefined,
    dateIso: string | undefined,
  ): number => {
    const fees = calcCheckoutFees({
      subtotal: input.subtotal,
      countryCode,
      cityId: cityIdStr,
      noAddress: input.noAddress,
      cityFee: city.fee ?? 0,
      deliveryMode: mode,
      timeSlots: catalogue,
      deliverySlot: lbl,
      deliverySlotId: sid,
      deliveryDate: dateIso,
      freeDeliveryThresholdUsd:
        city.freeDeliveryThresholdUsd ?? input.countryFreeDeliveryThresholdUsd,
      freeDeliveryEnabled:
        city.freeDeliveryEnabled ?? input.countryFreeDeliveryEnabled,
    });
    // The express surcharge is a country-level constant — it never changes
    // with the district, so the comparison fee is district + slot only.
    return fees.districtFee + fees.slotFee;
  };

  if (mode === "express") {
    const timeOk = isExpressDeliveryAvailable(countryCode, now);
    if (!timeOk || city.expressAvailable !== true) {
      return { kind: "invalid", reason: "express" };
    }
    return { kind: "kept", slotId: null, newFeeUsd: feeFor("", undefined, undefined) };
  }

  if (!slotLabel) return { kind: "none" };
  if (catalogue.length === 0) return { kind: "invalid", reason: "slot" };

  // A past date can never be fulfilled — treat as invalid rather than
  // silently re-dating the order.
  if (dateIso < todayIso) return { kind: "invalid", reason: "slot" };

  const displayed = displayedSlotsForDate(
    catalogue,
    dateIso,
    todayIso,
    addDaysIso(todayIso, 1),
    cityIdStr,
  );
  const eligible =
    dateIso === todayIso
      ? displayed.filter((s) => s.cutoffHour > getCountryHour(countryCode, now))
      : displayed;

  const byId = slotId ? eligible.find((s) => s.slotId === slotId) : undefined;
  const match = byId ?? eligible.find((s) => s.label === slotLabel);
  if (!match) return { kind: "invalid", reason: "slot" };

  const matchedId = match.slotId ?? null;
  return {
    kind: "kept",
    slotId: matchedId,
    newFeeUsd: feeFor(match.label, matchedId ?? undefined, input.dateIso || undefined),
  };
}

/** True when two USD fee amounts differ by at least one cent. */
export function feesDiffer(aUsd: number, bUsd: number): boolean {
  return Math.round(aUsd * 100) !== Math.round(bUsd * 100);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
