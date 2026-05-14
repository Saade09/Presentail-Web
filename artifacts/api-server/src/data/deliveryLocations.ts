import type { DeliveryCountry } from "@workspace/api-zod";
import {
  DELIVERY_COUNTRIES as LIB_DELIVERY_COUNTRIES,
  feeForDistrict,
  localizedNamesForCity,
  localizedNamesForCountry,
} from "@workspace/catalog-data";

// Single source of truth: `lib/catalog-data` ships the canonical list of
// supported delivery countries / cities. We enrich each city with its
// per-country delivery `fee` and any localized translations so the
// `/delivery-locations` endpoint serves a complete payload to both the
// mobile app and the web storefront.
export const DELIVERY_COUNTRIES: DeliveryCountry[] = LIB_DELIVERY_COUNTRIES.map(
  (country) => ({
    id: country.id,
    name: country.name,
    code: country.code,
    flag: country.flag,
    currency: country.currency,
    isActive: country.isActive,
    ...(country.preferredDefaultCityId
      ? { preferredDefaultCityId: country.preferredDefaultCityId }
      : {}),
    localizedNames: localizedNamesForCountry(country.code),
    cities: country.cities.map((city) => ({
      id: city.id,
      name: city.name,
      isActive: city.isActive,
      fee: feeForDistrict(country.code, city.name),
      localizedNames: localizedNamesForCity(city.id),
    })),
  }),
);
