import { useMemo } from "react";
import { useCart } from "@/contexts/CartContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { useDeliveryConfig } from "@/hooks/useDeliveryConfig";
import { expressSurchargeForCountry } from "@workspace/delivery";

export type PricingState = "known" | "unknown_area" | "from_min" | "error";

export type DeliveryPricingResult = {
  /**
   * Standard delivery fee in the shopper's native display currency.
   * Null when the exact area is not yet known.
   */
  standardFee: number | null;
  /**
   * Express add-on surcharge in native display currency. Always a finite
   * positive number (country-wide, never city-specific).
   */
  expressSurcharge: number;
  /**
   * Total express delivery charge (standard + surcharge) in native currency.
   * Null when standard fee is unknown (area not yet selected).
   * When isFreeStandard is true, expressTotal equals expressSurcharge only.
   */
  expressTotal: number | null;
  /**
   * Whether the projected cart value (after adding this product at the given
   * quantity) qualifies the order for free standard delivery.
   */
  isFreeStandard: boolean;
  /**
   * Projected cart total in native display currency after adding this product
   * at the given quantity (existing cart subtotal + product × quantity).
   */
  projectedCartTotal: number;
  /** Describes how reliably delivery pricing is known at this moment. */
  pricingState: PricingState;
};

/**
 * Computes transparent delivery pricing for the product detail screen.
 *
 * All monetary values are in the shopper's native display currency so they
 * can be passed directly to `formatNative()` from CurrencyContext.
 *
 * @param productPriceUsd - The product's price in USD (use discounted price
 *   when on sale, matching the cart's `effectiveUsdPrice` logic).
 * @param quantity - How many units the shopper intends to add (defaults to 1).
 */
export function useDeliveryPricing(
  productPriceUsd: number,
  quantity = 1,
): DeliveryPricingResult {
  const { total: cartTotalUsd } = useCart();
  const { convert } = useCurrency();
  const { selectedCountry, selectedCity } = useDeliveryLocation();
  const {
    freeDeliveryEnabled,
    freeDeliveryThresholdNative,
  } = useDeliveryConfig();

  return useMemo(() => {
    const cc = (selectedCountry?.code ?? "").toUpperCase();

    if (!cc) {
      // eslint-disable-next-line no-console
      console.warn("[useDeliveryPricing] pricingState=error: no country selected");
      return {
        standardFee: null,
        expressSurcharge: 0,
        expressTotal: null,
        isFreeStandard: false,
        projectedCartTotal: 0,
        pricingState: "error" as const,
      };
    }

    const expressSurcharge = convert(expressSurchargeForCountry(cc));

    const projectedCartTotal = convert(
      cartTotalUsd + (Number.isFinite(productPriceUsd) ? productPriceUsd : 0) * quantity,
    );

    let standardFee: number | null = null;
    let pricingState: PricingState = "unknown_area";

    if (selectedCity) {
      if (typeof selectedCity.fee === "number") {
        // selectedCity.fee is already in the country's native display currency
        // (DeliveryCity type documents it as "native currency"), so no
        // conversion is needed here.
        standardFee = selectedCity.fee;
        pricingState = "known";
      } else {
        // City selected but fee not yet configured in the OS catalog.
        pricingState = "from_min";
      }
    }

    const isFreeStandard =
      freeDeliveryEnabled &&
      freeDeliveryThresholdNative > 0 &&
      projectedCartTotal >= freeDeliveryThresholdNative;

    const expressTotal: number | null =
      standardFee !== null
        ? isFreeStandard
          ? expressSurcharge
          : standardFee + expressSurcharge
        : null;

    return {
      standardFee,
      expressSurcharge,
      expressTotal,
      isFreeStandard,
      projectedCartTotal,
      pricingState,
    };
  }, [
    selectedCountry,
    selectedCity,
    cartTotalUsd,
    productPriceUsd,
    quantity,
    convert,
    freeDeliveryEnabled,
    freeDeliveryThresholdNative,
  ]);
}
