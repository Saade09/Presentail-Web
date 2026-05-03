import { Router, type IRouter } from "express";
import { GetDeliveryLocationsResponse } from "@workspace/api-zod";
import { DELIVERY_COUNTRIES } from "../data/deliveryLocations";

const router: IRouter = Router();

// Returns the canonical list of supported delivery countries and cities.
// The mobile app fetches this on launch (with the static
// `FALLBACK_DELIVERY_COUNTRIES` constant as offline fallback) so toggling
// a country/city active in this data file (or, eventually, an admin UI)
// is reflected on the next app launch without an OTA / store update.
router.get("/delivery-locations", (_req, res) => {
  const data = GetDeliveryLocationsResponse.parse({
    countries: DELIVERY_COUNTRIES,
  });
  res.json(data);
});

export default router;
