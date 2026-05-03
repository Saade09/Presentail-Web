import { useLocationSelection } from "@/contexts/LocationContext";

export type DeliveryConfig = {
  expressDeliveryTimeLabel: string;
  freeDeliveryThreshold: string;
  currency: string;
};

const FALLBACK: DeliveryConfig = {
  expressDeliveryTimeLabel: "Arrives in 90 minutes",
  freeDeliveryThreshold: "AED 480",
  currency: "AED",
};

const COUNTRY_CONFIG: Record<string, Partial<DeliveryConfig>> = {
  AE: {
    expressDeliveryTimeLabel: "Arrives in 90 minutes",
    freeDeliveryThreshold: "AED 480",
    currency: "AED",
  },
  LB: {
    expressDeliveryTimeLabel: "Arrives in 2 hours",
    freeDeliveryThreshold: "$130",
    currency: "USD",
  },
  CY: {
    expressDeliveryTimeLabel: "Arrives same day",
    freeDeliveryThreshold: "€120",
    currency: "EUR",
  },
};

export function useDeliveryConfig(): DeliveryConfig {
  const { countryCode } = useLocationSelection();
  const code = (countryCode ?? "").toUpperCase();
  const overrides = COUNTRY_CONFIG[code] ?? {};
  return { ...FALLBACK, ...overrides };
}
