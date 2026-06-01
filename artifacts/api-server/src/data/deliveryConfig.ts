import type { DeliveryConfigResponse } from "@workspace/api-zod";

type CityOverride = Partial<DeliveryConfigResponse>;

type CountryEntry = {
  default: DeliveryConfigResponse;
  cities?: Record<string, CityOverride>;
};

export const GLOBAL_DEFAULT: DeliveryConfigResponse = {
  expressDeliveryTimeLabel: "Arrives in 90 minutes",
  freeDeliveryThreshold: "AED 330",
  currency: "AED",
  freeDeliveryThresholdUsd: 89.84,
  freeDeliveryEnabled: true,
};

export const DELIVERY_CONFIG: Record<string, CountryEntry> = {
  AE: {
    default: {
      expressDeliveryTimeLabel: "Arrives in 90 minutes",
      freeDeliveryThreshold: "AED 330",
      currency: "AED",
      freeDeliveryThresholdUsd: 89.84,
      freeDeliveryEnabled: true,
    },
    cities: {
      "ae-dubai": { expressDeliveryTimeLabel: "Arrives in 60 minutes" },
      "ae-abu-dhabi": { expressDeliveryTimeLabel: "Arrives in 90 minutes" },
      "ae-sharjah": { expressDeliveryTimeLabel: "Arrives in 90 minutes" },
      "ae-ajman": { expressDeliveryTimeLabel: "Arrives in 2 hours" },
      "ae-al-ain": { expressDeliveryTimeLabel: "Arrives in 3 hours" },
      "ae-ras-al-khaimah": { expressDeliveryTimeLabel: "Arrives same day" },
      "ae-fujairah": { expressDeliveryTimeLabel: "Arrives same day" },
      "ae-umm-al-quwain": { expressDeliveryTimeLabel: "Arrives same day" },
    },
  },
  LB: {
    default: {
      expressDeliveryTimeLabel: "Arrives in 90 minutes",
      freeDeliveryThreshold: "$130",
      currency: "USD",
      freeDeliveryThresholdUsd: 130,
      freeDeliveryEnabled: true,
    },
    cities: {},
  },
  CY: {
    default: {
      expressDeliveryTimeLabel: "Arrives same day",
      freeDeliveryThreshold: "€120",
      currency: "EUR",
      freeDeliveryThresholdUsd: 120,
      freeDeliveryEnabled: true,
    },
  },
};

export function resolveDeliveryConfig(
  countryCode: string | undefined,
  cityId: string | undefined,
): DeliveryConfigResponse {
  const code = (countryCode ?? "").toUpperCase();
  const country = DELIVERY_CONFIG[code];
  if (!country) return GLOBAL_DEFAULT;
  const cityOverride = cityId ? country.cities?.[cityId] ?? {} : {};
  return { ...country.default, ...cityOverride };
}
