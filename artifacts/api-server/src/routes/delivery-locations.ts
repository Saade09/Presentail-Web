import { Router, type IRouter } from "express";
import { GetDeliveryLocationsResponse } from "@workspace/api-zod";
import { getLocations } from "../lib/osLocationsCache";
import { resolveDeliveryConfig } from "../data/deliveryConfig";

const router: IRouter = Router();

// Returns the canonical list of supported delivery countries and cities.
// Data is sourced from the Presentail OS cache (polled every 15 min) and
// falls back automatically to the hardcoded catalog-data list when OS is
// unreachable. Toggling a country/city active in Presentail OS propagates
// within the polling interval without requiring a code deploy.
router.get("/delivery-locations", (_req, res) => {
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
  const data = GetDeliveryLocationsResponse.parse({ countries: enriched });
  res.json(data);
});

export default router;
