import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useLocationSelection } from "@/contexts/LocationContext";

export type DeliveryConfig = {
  expressDeliveryTimeLabel: string;
  freeDeliveryThreshold: string;
  currency: string;
};

const FALLBACK: DeliveryConfig = {
  expressDeliveryTimeLabel: "Arrives in 90 minutes",
  freeDeliveryThreshold: "AED 330",
  currency: "AED",
};

const COUNTRY_FALLBACK: Record<string, Partial<DeliveryConfig>> = {
  AE: {
    expressDeliveryTimeLabel: "Arrives in 90 minutes",
    freeDeliveryThreshold: "AED 330",
    currency: "AED",
  },
  LB: {
    expressDeliveryTimeLabel: "Arrives in 90 minutes",
    freeDeliveryThreshold: "$90",
    currency: "USD",
  },
  CY: {
    expressDeliveryTimeLabel: "Arrives same day",
    freeDeliveryThreshold: "€120",
    currency: "EUR",
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
