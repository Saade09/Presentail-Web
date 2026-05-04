import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@presentail/delivery-location-v1";

let cachedCountryCode: string | null = null;
let cachedCityId: string | null = null;

AsyncStorage.getItem(STORAGE_KEY)
  .then((raw) => {
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        cachedCountryCode = parsed?.selectedDeliveryCountryCode ?? null;
        cachedCityId = parsed?.selectedDeliveryCityId ?? null;
      } catch {
        // ignore
      }
    }
  })
  .catch(() => {});

export function updateCachedStoreLocation(countryCode: string | null, cityId: string | null) {
  cachedCountryCode = countryCode;
  cachedCityId = cityId;
}

export function getStoredStoreHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (cachedCountryCode) h["x-store-country"] = cachedCountryCode;
  if (cachedCityId) h["x-store-city"] = cachedCityId;
  return h;
}
