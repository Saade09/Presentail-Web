import {
  useGetDeliveryConfig,
} from "@workspace/api-client-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import {
  freeDeliveryThresholdUsd as hardcodedThresholdUsd,
} from "@workspace/delivery";

export type DeliveryConfig = {
  /** Whether free delivery is offered for the current country. */
  freeDeliveryEnabled: boolean;
  /** Free-delivery threshold in USD (for fee calculation at checkout). */
  freeDeliveryThresholdUsd: number;
  /**
   * Free-delivery threshold in the shopper's display currency.
   * Use this for price comparisons and formatted display in product cards
   * and product detail screens.
   */
  freeDeliveryThresholdNative: number;
};

/**
 * Returns the free-delivery config for the shopper's current country/city,
 * sourced from `/api/delivery-config` (which in turn reads from the
 * Presentail OS locations cache when available).
 *
 * Safe defaults (hardcoded per-country values) are returned while the
 * fetch is in-flight so nudges don't flicker on mount.
 * When the OS marks free delivery as disabled, `freeDeliveryEnabled` is
 * false and `freeDeliveryThresholdNative` is 0.
 */
export function useDeliveryConfig(): DeliveryConfig {
  const { selectedCountry, selectedCity } = useDeliveryLocation();
  const { currencyCode, convert } = useCurrency();

  const cc =
    selectedCountry?.code ||
    (currencyCode === "AED" ? "AE" : currencyCode === "EUR" ? "CY" : "LB");

  const cityId = selectedCity?.id;

  const fallbackUsd = hardcodedThresholdUsd(cc);

  const query = useGetDeliveryConfig(
    { countryCode: cc, ...(cityId ? { cityId } : {}) },
    { query: { staleTime: 5 * 60 * 1000 } },
  );

  if (!query.data) {
    return {
      freeDeliveryEnabled: true,
      freeDeliveryThresholdUsd: fallbackUsd,
      freeDeliveryThresholdNative: convert(fallbackUsd),
    };
  }

  const enabled = query.data.freeDeliveryEnabled ?? true;
  const thresholdUsd = query.data.freeDeliveryThresholdUsd ?? fallbackUsd;

  return {
    freeDeliveryEnabled: enabled,
    freeDeliveryThresholdUsd: thresholdUsd,
    freeDeliveryThresholdNative: enabled ? convert(thresholdUsd) : 0,
  };
}
