import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import type { GeoCurrencyResponse } from "@workspace/api-zod";
import {
  FALLBACK_DISPLAY_CURRENCY,
  resolveGeoCurrency,
  resolveGeoCurrencyByCoords,
} from "../lib/geoCurrency";

const router: IRouter = Router();

// Public, unauthenticated endpoint. Cap each IP at a generous-but-bounded
// number of lookups so a buggy client can't keep hammering it (and so we
// can't be used as an open IP-geolocation proxy). The result is also cached
// in-memory by IP for an hour, so legitimate clients usually hit the cache.
const geoCurrencyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    // On rate-limit, still return a usable shape so the client doesn't fail
    // its first paint — they just get the safe USD fallback.
    const body: GeoCurrencyResponse = {
      countryCode: null,
      currencyCode: FALLBACK_DISPLAY_CURRENCY,
    };
    res.status(200).json(body);
  },
});

router.get("/geo/currency", geoCurrencyLimiter, async (req, res) => {
  // `req.ip` reflects the real client IP because `app.set("trust proxy", 1)`
  // is configured upstream. Falls back to "" for safety; resolveGeoCurrency()
  // treats empty / private ranges as the USD fallback without an outbound
  // call, which keeps local development snappy.
  const ip = (req.ip ?? "").toString();
  const result = await resolveGeoCurrency(ip);
  const body: GeoCurrencyResponse = {
    countryCode: result.countryCode,
    currencyCode: result.currencyCode,
  };
  res.json(body);
});

// Coordinate-based variant. Used by the mobile app when the shopper has
// granted foreground location permission so currency detection works on a
// VPN, on a foreign SIM while roaming, or behind a carrier CGNAT that
// resolves to the wrong country. Uses the same shape as /geo/currency so
// callers can drop it in. Same per-IP rate limit applies.
const geoCurrencyByCoordsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    const body: GeoCurrencyResponse = {
      countryCode: null,
      currencyCode: FALLBACK_DISPLAY_CURRENCY,
    };
    res.status(200).json(body);
  },
});

router.get("/geo/currency-by-coords", geoCurrencyByCoordsLimiter, async (req, res) => {
  const latRaw = req.query.lat;
  const lngRaw = req.query.lng;
  const lat = typeof latRaw === "string" ? Number(latRaw) : NaN;
  const lng = typeof lngRaw === "string" ? Number(lngRaw) : NaN;
  // Invalid / out-of-range inputs are coerced to the safe USD fallback so
  // a malformed client still gets a usable response shape rather than a 4xx.
  const result = await resolveGeoCurrencyByCoords(lat, lng);
  const body: GeoCurrencyResponse = {
    countryCode: result.countryCode,
    currencyCode: result.currencyCode,
  };
  res.json(body);
});

export default router;
