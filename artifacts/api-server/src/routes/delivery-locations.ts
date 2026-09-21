import { Router, type IRouter, type Request } from "express";
import { GetDeliveryLocationsResponse } from "@workspace/api-zod";
import { getLocations, getLocationsDataStatus } from "../lib/osLocationsCache";
import { resolveDeliveryConfig } from "../data/deliveryConfig";

const router: IRouter = Router();

const PUBLIC_DELIVERY_LOCATIONS_CACHE_CONTROL =
  "public, max-age=300, s-maxage=900, stale-while-revalidate=3600";

function readSelectedCityId(req: Request): string | null {
  const raw = typeof req.query.cityId === "string" ? req.query.cityId.trim() : "";
  return raw && /^[a-zA-Z0-9_-]+$/.test(raw) ? raw : null;
}

// Returns the canonical list of supported delivery countries and cities.
// Data is sourced from the Presentail OS cache (polled every 15 min) and
// falls back automatically to the hardcoded catalog-data list when OS is
// unreachable. Toggling a country/city active in Presentail OS propagates
// within the polling interval without requiring a code deploy.
router.get("/delivery-locations", (req, res) => {
  const locations = getLocations();
  const enriched = locations.map((country) => ({
    ...country,
    cities: country.cities.map((city) => {
      const cfg = resolveDeliveryConfig(country.code, city.id);
      return {
        ...city,
        freeDeliveryThresholdUsd:
          city.freeDeliveryThresholdUsd ?? cfg.freeDeliveryThresholdUsd,
        freeDeliveryEnabled:
          city.freeDeliveryEnabled ?? cfg.freeDeliveryEnabled,
      };
    }),
  }));
  const fullData = GetDeliveryLocationsResponse.parse({
    countries: enriched,
    dataStatus: getLocationsDataStatus(),
  });
  const profile = req.query.profile === "summary" ? "summary" : "full";
  const selectedCityId = readSelectedCityId(req);
  const data =
    profile === "summary"
      ? {
          ...fullData,
          countries: fullData.countries.map((country) => ({
            ...country,
            cities: country.cities.map((city) => {
              if (city.id === selectedCityId) return city;
              const { timeSlots: _timeSlots, slotsByDay: _slotsByDay, ...summary } = city;
              return summary;
            }),
          })),
        }
      : fullData;
  res.setHeader("Cache-Control", PUBLIC_DELIVERY_LOCATIONS_CACHE_CONTROL);
  res.setHeader("X-Delivery-Locations-Profile", profile);
  res.json(data);
});

export default router;
