import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useLocationSelection } from "@/contexts/LocationContext";

export type DeliveryConfig = {
  expressDeliveryTimeLabel: string;
  freeDeliveryThreshold: string;
  currency: string;
  freeDeliveryEnabled: boolean;
};

const FALLBACK: DeliveryConfig = {
  expressDeliveryTimeLabel: "Arrives in 90 minutes",
  freeDeliveryThreshold: "AED 330",
  currency: "AED",
  freeDeliveryEnabled: true,
};

const COUNTRY_FALLBACK: Record<string, Partial<DeliveryConfig>> = {
  AE: {
    expressDeliveryTimeLabel: "Arrives in 90 minutes",
    freeDeliveryThreshold: "AED 330",
    currency: "AED",
    freeDeliveryEnabled: true,
  },
  LB: {
    expressDeliveryTimeLabel: "Arrives in 90 minutes",
    freeDeliveryThreshold: "$90",
    currency: "USD",
    freeDeliveryEnabled: true,
  },
  CY: {
    expressDeliveryTimeLabel: "Arrives same day",
    freeDeliveryThreshold: "€120",
    currency: "EUR",
    freeDeliveryEnabled: true,
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
