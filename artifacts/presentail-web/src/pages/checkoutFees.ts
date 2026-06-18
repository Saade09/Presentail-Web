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
  type TimeSlot,
} from "@workspace/delivery";

export type CheckoutDeliveryMode = "express" | "schedule";

export interface CheckoutFeeInput {
  /** Cart subtotal in USD. */
  subtotal: number;
  /** ISO-3166-1 alpha-2 store country code (e.g. "LB", "AE", "CY"). */
  countryCode: string;
  /** When true, no fixed delivery address — a flat $35 fee is charged. */
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
export function calcCheckoutFees(input: CheckoutFeeInput): CheckoutFeeOutput {
  const {
    subtotal,
    countryCode,
    noAddress,
    cityFee,
    deliveryMode,
    timeSlots,
    deliverySlot,
    freeDeliveryThresholdUsd: thresholdOverride,
    freeDeliveryEnabled = true,
  } = input;

  const threshold = thresholdOverride ?? freeDeliveryThresholdUsd(countryCode);
  const surcharge =
    typeof input.expressSurchargeUsdOverride === "number" && input.expressSurchargeUsdOverride > 0
      ? input.expressSurchargeUsdOverride
      : expressSurchargeForCountry(countryCode);

  const baseFee = noAddress ? 35 : cityFee;
  const districtFee = (freeDeliveryEnabled && subtotal >= threshold) ? 0 : baseFee;
  const expressFee = deliveryMode === "express" ? surcharge : 0;
  const slotFee =
    deliveryMode !== "express"
      ? (timeSlots.find((s) => s.label === deliverySlot)?.extraFee ?? 0)
      : 0;
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
