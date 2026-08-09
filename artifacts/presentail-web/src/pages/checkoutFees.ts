/**
 * Pure fee-calculation helpers for the web checkout.
 *
 * Extracted from Checkout.tsx so the logic can be unit-tested directly
 * and reused by any future checkout variant (one-page, express-only, etc.).
 *
 * All amounts are in USD — the cart's internal currency.
 */

import {
  freeDeliveryThresholdUsd,
  expressSurchargeForCountry,
  getLocalIso,
  type TimeSlot,
} from "@workspace/delivery";

export type CheckoutDeliveryMode = "express" | "schedule";

export interface CheckoutFeeInput {
  /** Cart subtotal in USD. */
  subtotal: number;
  /** ISO-3166-1 alpha-2 store country code (e.g. "LB", "AE", "CY"). */
  countryCode: string;
  /**
   * When true, the recipient's address will be collected later (ask-recipient
   * flow). Does not affect the delivery fee — the district fee chosen before
   * entering checkout is always used.
   */
  noAddress: boolean;
  /**
   * Per-city delivery fee in USD from the OS /delivery-locations payload.
   * Defaults to 0 when the city isn't found or the API hasn't loaded yet.
   */
  cityFee: number;
  /**
   * Free-delivery threshold in USD from the OS /delivery-locations payload.
   * When provided this overrides the hardcoded per-country default.
   */
  freeDeliveryThresholdUsd?: number;
  /**
   * Whether free delivery is enabled for this country (from OS).
   * When false, the district fee is always charged regardless of cart total.
   * Defaults to true when absent.
   */
  freeDeliveryEnabled?: boolean;
  /**
   * OS-derived express surcharge in USD for the selected city, from the
   * /delivery-config endpoint. When provided and > 0, overrides the hardcoded
   * per-country default from expressSurchargeForCountry().
   */
  expressSurchargeUsdOverride?: number;
  /** "express" triggers a per-country surcharge; "schedule" adds no surcharge. */
  deliveryMode: CheckoutDeliveryMode;
  /**
   * Slot catalogue for the selected city (from OS when available, otherwise
   * the hardcoded `timeSlotsForCountry` fallback).
   */
  timeSlots: TimeSlot[];
  /** Label of the currently selected delivery slot, e.g. "9:00 AM – 2:00 PM". */
  deliverySlot: string;
  /**
   * OS-assigned stable identifier for the selected slot (e.g. "night-same-day").
   * When present, slot lookup uses this ID first for accuracy; falls back to
   * label-based matching so legacy code without IDs continues to work.
   */
  deliverySlotId?: string;
  /**
   * The selected delivery date as an ISO-8601 date string (YYYY-MM-DD).
   * Used to determine whether the night-slot same-day surcharge applies.
   * When absent, the current local date for the country is assumed (today).
   */
  deliveryDate?: string;
}

export interface CheckoutFeeOutput {
  /** Delivery fee for the district/city, $0 when the subtotal is above the threshold. */
  districtFee: number;
  /** Express surcharge, $0 in scheduled mode. */
  expressFee: number;
  /** Optional extra fee for premium time slots, $0 for standard slots or in express mode. */
  slotFee: number;
  /** subtotal + districtFee + expressFee + slotFee */
  total: number;
}

/**
 * Compute all checkout delivery fees from a set of pure inputs.
 *
 * Mirrors the four inline fee assignments in Checkout.tsx so changes to the
 * rules here automatically propagate to both the component and the tests.
 */
/** $5 same-day night surcharge: applied when the OS sends no explicit fee override. */
const NIGHT_SLOT_SURCHARGE_USD = 5;

export function calcCheckoutFees(input: CheckoutFeeInput): CheckoutFeeOutput {
  const {
    subtotal,
    countryCode,
    cityFee,
    deliveryMode,
    timeSlots,
    deliverySlot,
    deliverySlotId,
    deliveryDate,
    freeDeliveryThresholdUsd: thresholdOverride,
    freeDeliveryEnabled = true,
  } = input;

  const threshold = thresholdOverride ?? freeDeliveryThresholdUsd(countryCode);
  const surcharge =
    typeof input.expressSurchargeUsdOverride === "number" && input.expressSurchargeUsdOverride > 0
      ? input.expressSurchargeUsdOverride
      : expressSurchargeForCountry(countryCode);

  const baseFee = cityFee;
  const districtFee = (freeDeliveryEnabled && subtotal >= threshold) ? 0 : baseFee;
  const expressFee = deliveryMode === "express" ? surcharge : 0;
  const slotFee = (() => {
    if (deliveryMode === "express") return 0;
    // Prefer ID-based lookup when available to handle same-label/different-config slots.
    const bookedSlotById = deliverySlotId
      ? (timeSlots.find((s) => s.slotId === deliverySlotId) ?? null)
      : null;
    const bookedSlot = bookedSlotById ?? timeSlots.find((s) => s.label === deliverySlot);
    if (!bookedSlot) return 0;
    // When the slot was found by OS-assigned slotId, any explicit extraFee (including 0)
    // is authoritative — extraFee: 0 means this slot is explicitly free.
    if (bookedSlotById !== null && bookedSlot.extraFee !== undefined && bookedSlot.extraFee !== null) {
      return bookedSlot.extraFee;
    }
    // When found by label only, only apply explicit non-zero surcharges.
    if (bookedSlot.extraFee !== undefined && bookedSlot.extraFee !== null && bookedSlot.extraFee > 0) {
      return bookedSlot.extraFee;
    }
    // Hardcoded same-day night surcharge: when the OS sends no fee override (undefined or 0),
    // a $5 fee applies for night slots (startHour ≥ 21) selected for today.
    const slotStartHour = bookedSlot.startHour ?? bookedSlot.cutoffHour ?? 0;
    const isNightSlot = slotStartHour >= 21;
    const todayForCountry = getLocalIso(countryCode);
    const isToday = !deliveryDate || deliveryDate === todayForCountry;
    if (isNightSlot && isToday) return NIGHT_SLOT_SURCHARGE_USD;
    return 0;
  })();
  const total = subtotal + districtFee + expressFee + slotFee;

  return { districtFee, expressFee, slotFee, total };
}

/**
 * Derive the active display currency from the store country code.
 *
 * AE → AED, CY → EUR, everything else → USD.
 * Mirrors the inline expression in Checkout.tsx.
 */
export function activeCurrencyForCountry(countryCode: string): string {
  if (countryCode === "AE") return "AED";
  if (countryCode === "CY") return "EUR";
  return "USD";
}
