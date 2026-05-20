import { Router, type IRouter } from "express";
import {
  GetDeliveryConfigQueryParams,
  GetDeliveryConfigResponse,
} from "@workspace/api-zod";
import { resolveOsDeliveryConfig } from "../lib/osLocationsCache";

const router: IRouter = Router();

// Returns the express-delivery time label, free-delivery threshold copy,
// and currency for the supplied country/city. The express delivery label
// is sourced from the Presentail OS cache when available (so ops can
// update it without a deploy), with all other values falling back to the
// hardcoded config in ../data/deliveryConfig.
router.get("/delivery-config", (req, res) => {
  const { countryCode, cityId } = GetDeliveryConfigQueryParams.parse(req.query);
  const resolved = resolveOsDeliveryConfig(countryCode, cityId);
  const data = GetDeliveryConfigResponse.parse(resolved);
  res.json(data);
});

export default router;
