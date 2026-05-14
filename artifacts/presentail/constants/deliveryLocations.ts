// Compatibility shim. The canonical list lives in `@workspace/catalog-data`
// and is now served verbatim by the API's `/delivery-locations` endpoint;
// this file just preserves the historical export names mobile callers use
// (`FALLBACK_DELIVERY_COUNTRIES`, `DeliveryCity`, `DeliveryCountry`).
import {
  DELIVERY_COUNTRIES,
  DEFAULT_FALLBACK_COUNTRY_CODE as LIB_DEFAULT_FALLBACK_COUNTRY_CODE,
  type DeliveryCityData,
  type DeliveryCountryData,
} from "@workspace/catalog-data";

export type DeliveryCity = DeliveryCityData;
export type DeliveryCountry = DeliveryCountryData;

export const FALLBACK_DELIVERY_COUNTRIES: DeliveryCountry[] = DELIVERY_COUNTRIES;
export const DEFAULT_FALLBACK_COUNTRY_CODE = LIB_DEFAULT_FALLBACK_COUNTRY_CODE;
