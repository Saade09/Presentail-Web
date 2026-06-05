import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useLocationSelection } from "@/contexts/LocationContext";

export type DeliveryConfig = {
  expressDeliveryTimeLabel: string;
  freeDeliveryThreshold: string;
  /** Raw USD equivalent of the free-delivery threshold (for FormattedPrice conversion). */
  freeDeliveryThresholdUsd?: number;
  currency: string;
  freeDeliveryEnabled: boolean;
  /** Standard delivery fee for the selected city in USD. Null when no city selected or fee unknown. */
  cityFeeUsd: number | null;
  /** Express surcharge for the country in USD. 0 when not applicable. */
  expressSurchargeUsd: number;
};

const FALLBACK: DeliveryConfig = {
  expressDeliveryTimeLabel: "Arrives in 90 minutes",
  freeDeliveryThreshold: "AED 330",
  freeDeliveryThresholdUsd: 89.84,
  currency: "AED",
  freeDeliveryEnabled: true,
  cityFeeUsd: null,
  expressSurchargeUsd: 0,
};

const COUNTRY_FALLBACK: Record<string, Partial<DeliveryConfig>> = {
  AE: {
    expressDeliveryTimeLabel: "Arrives in 90 minutes",
    freeDeliveryThreshold: "AED 330",
    freeDeliveryThresholdUsd: 89.84,
    currency: "AED",
    freeDeliveryEnabled: true,
    cityFeeUsd: null,
    expressSurchargeUsd: 4.9,
  },
  LB: {
    expressDeliveryTimeLabel: "Arrives in 90 minutes",
    freeDeliveryThreshold: "$90",
    freeDeliveryThresholdUsd: 90,
    currency: "USD",
    freeDeliveryEnabled: true,
    cityFeeUsd: null,
    expressSurchargeUsd: 15,
  },
  CY: {
    expressDeliveryTimeLabel: "Arrives same day",
    freeDeliveryThreshold: "€120",
    freeDeliveryThresholdUsd: 130,
    currency: "EUR",
    freeDeliveryEnabled: true,
    cityFeeUsd: null,
    expressSurchargeUsd: 15,
  },
};

function fallbackFor(countryCode: string | null): DeliveryConfig {
  const code = (countryCode ?? "").toUpperCase();
  return { ...FALLBACK, ...(COUNTRY_FALLBACK[code] ?? {}) };
}

export function useDeliveryConfig(): DeliveryConfig {
  const { countryCode, cityId } = useLocationSelection();
  const params = new URLSearchParams();
  if (countryCode) params.set("countryCode", countryCode);
  if (cityId) params.set("cityId", cityId);
  const qs = params.toString();

  const { data } = useQuery({
    queryKey: ["delivery-config", countryCode ?? null, cityId ?? null],
    queryFn: () =>
      apiFetch<DeliveryConfig>(`/delivery-config${qs ? `?${qs}` : ""}`),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  return data ?? fallbackFor(countryCode);
}
