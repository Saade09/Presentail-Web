import { Router, type IRouter } from "express";
import {
  GetDeliveryConfigQueryParams,
  GetDeliveryConfigResponse,
} from "@workspace/api-zod";
import { resolveDeliveryConfig } from "../data/deliveryConfig";

const router: IRouter = Router();

// Returns the express-delivery time label, free-delivery threshold copy
// and currency for the supplied country/city. Values come from a server
// side config (see ../data/deliveryConfig) so operations can change them
// without a client release. Falls back to a country default when the city
// is unknown and to a global default when the country is unknown.
router.get("/delivery-config", (req, res) => {
  const { countryCode, cityId } = GetDeliveryConfigQueryParams.parse(req.query);
  const resolved = resolveDeliveryConfig(countryCode, cityId);
  const data = GetDeliveryConfigResponse.parse(resolved);
  res.json(data);
});

export default router;
