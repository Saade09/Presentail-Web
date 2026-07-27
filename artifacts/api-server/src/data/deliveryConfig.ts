import { GetDeliveryConfigResponse } from "@workspace/api-zod";
import type { z } from "zod";

type DeliveryConfigResponse = z.infer<typeof GetDeliveryConfigResponse>;
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
  expressSurchargeUsd: 0,
};

export const DELIVERY_CONFIG: Record<string, CountryEntry> = {
  AE: {
    default: {
      expressDeliveryTimeLabel: "Arrives in 90 minutes",
      freeDeliveryThreshold: "AED 330",
      currency: "AED",
      freeDeliveryThresholdUsd: 89.84,
      freeDeliveryEnabled: true,
      expressSurchargeUsd: 0,
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
    // Most LB cities outside Beirut/Aley/Baabda do not offer free delivery.
    default: {
      expressDeliveryTimeLabel: "Arrives in 90 minutes",
      freeDeliveryThreshold: "$90",
      currency: "USD",
      freeDeliveryThresholdUsd: 90,
      freeDeliveryEnabled: false,
      expressSurchargeUsd: 0,
    },
    cities: {
      // Greater Beirut area — free delivery above $90.
      "lb-beirut": { freeDeliveryThreshold: "$90", freeDeliveryThresholdUsd: 90, freeDeliveryEnabled: true },
      // Mount Lebanon districts — free delivery above $140.
      "lb-aley":   { freeDeliveryThreshold: "$140", freeDeliveryThresholdUsd: 140, freeDeliveryEnabled: true },
      "lb-baabda": { freeDeliveryThreshold: "$140", freeDeliveryThresholdUsd: 140, freeDeliveryEnabled: true },
    },
  },
  CY: {
    default: {
      expressDeliveryTimeLabel: "Arrives same day",
      freeDeliveryThreshold: "€120",
      currency: "EUR",
      freeDeliveryThresholdUsd: 120,
      freeDeliveryEnabled: true,
      expressSurchargeUsd: 0,
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
