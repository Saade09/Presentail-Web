import { Router } from "express";
import { getRealDeliveryFeed } from "../lib/realDeliveries";
import { readStoreContext } from "../lib/wooStore";

const router = Router();

router.get("/campaign/real-deliveries", async (req, res) => {
  const context = readStoreContext(req);
  const countryCode =
    typeof req.query.countryCode === "string"
      ? req.query.countryCode.trim().toUpperCase()
      : context.countryCode ?? "";
  const cityId =
    typeof req.query.cityId === "string" ? req.query.cityId.trim() : context.cityId ?? "";
  const lang = typeof req.query.lang === "string" ? req.query.lang.trim() : "en";

  const response = await getRealDeliveryFeed({
    countryCode,
    cityId,
    lang,
    request: req,
  });
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
  return res.json(response);
});

export default router;