import { createHash } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import type { GeoCurrencyResponse } from "@workspace/api-zod";
import { db, analyticsEventsTable } from "@workspace/db";
import {
  FALLBACK_DISPLAY_CURRENCY,
  geoCurrencyForCountry,
  isPrivateOrLoopback,
  pickClientIp,
  resolveGeoCurrency,
  resolveGeoCurrencyByCoords,
} from "../lib/geoCurrency";

const router: IRouter = Router();

// Key the rate limiter on the same client IP we use for geolocation. With
// `trust proxy: 1` and Replit's multi-hop proxy chain, `req.ip` (the
// express-rate-limit default) is an internal proxy hop shared by every
// visitor, so without an explicit keyGenerator a single bucket would cap
// the entire fleet at 60 / 15 min. We deliberately don't widen
// `trust proxy` itself because other limiters (auth, etc.) still rely on
// `req.ip` and changing the global trust setting would let anyone spoof
// their key by appending an `X-Forwarded-For` value.
function clientIpKey(req: Request): string {
  const ip = pickClientIp(req.headers["x-forwarded-for"], (req.ip ?? "").toString());
  if (!ip) return "unknown";
  // express-rate-limit v8 requires IPv6 addresses to be normalized through
  // ipKeyGenerator (default /64 subnet) so a single visitor with a /64 of
  // addresses can't bypass the limit by rotating the suffix.
  return ipKeyGenerator(ip);
}

// Public, unauthenticated endpoint. Cap each IP at a generous-but-bounded
// number of lookups so a buggy client can't keep hammering it (and so we
// can't be used as an open IP-geolocation proxy). The result is also cached
// in-memory by IP for an hour, so legitimate clients usually hit the cache.
const geoCurrencyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientIpKey,
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

// Hash an IP for log correlation without storing the raw address. Truncated
// SHA-256 is a one-way mapping, so logs can be diffed/grouped per visitor
// during debugging without exposing the IP itself (per threat-model
// information-disclosure guidance).
function ipFingerprint(ip: string): string {
  if (!ip) return "";
  return createHash("sha256").update(ip).digest("hex").slice(0, 12);
}

function readCfIpCountry(req: Request): string | null {
  // Cloudflare (and some other edges) put a 2-letter ISO country in this
  // header. When present, it's already authoritative — skip the outbound
  // lookup entirely. `XX` and `T1` are Cloudflare's "unknown" / "Tor"
  // sentinel values and should be treated as missing.
  const raw = req.headers["cf-ipcountry"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(trimmed)) return null;
  if (trimmed === "XX" || trimmed === "T1") return null;
  return trimmed;
}

router.get("/geo/currency", geoCurrencyLimiter, async (req, res) => {
  // Dev-only: ?country=XX lets engineers test currency display without a VPN.
  // Silently ignored in production so it can never be used to spoof currency.
  if (process.env.NODE_ENV !== "production") {
    const countryOverride = req.query.country;
    if (
      typeof countryOverride === "string" &&
      /^[A-Za-z]{2}$/.test(countryOverride)
    ) {
      const country = countryOverride.toUpperCase();
      req.log.warn(
        { geo: { provider: "dev-override", country } },
        "geo: using ?country dev override — ignored in production",
      );
      const result = geoCurrencyForCountry(country);
      const body: GeoCurrencyResponse = {
        countryCode: result.countryCode,
        currencyCode: result.currencyCode,
      };
      res.json(body);
      return;
    }
  }

  // Replit puts requests through more than one proxy hop, so
  // `app.set("trust proxy", 1)` alone leaves `req.ip` pointing at an
  // internal hop — and `isPrivateOrLoopback` would short-circuit every
  // visitor to USD. Walk the x-forwarded-for chain and take the leftmost
  // publicly routable address as the real client IP.
  const reqIp = (req.ip ?? "").toString();
  const xff = req.headers["x-forwarded-for"];
  const clientIp = pickClientIp(xff, reqIp);
  const reqIpPrivate = isPrivateOrLoopback(reqIp);
  const clientIpPrivate = isPrivateOrLoopback(clientIp);

  const cfCountry = readCfIpCountry(req);
  if (cfCountry) {
    const result = geoCurrencyForCountry(cfCountry);
    req.log.info(
      {
        geo: {
          provider: "cf-ipcountry",
          country: result.countryCode,
          currency: result.currencyCode,
          reqIpPrivate,
          clientIpPrivate,
          clientIpFp: ipFingerprint(clientIp),
        },
      },
      "geo currency lookup",
    );
    const body: GeoCurrencyResponse = {
      countryCode: result.countryCode,
      currencyCode: result.currencyCode,
    };
    res.json(body);
    return;
  }

  const result = await resolveGeoCurrency(clientIp);
  req.log.info(
    {
      geo: {
        source: result.source,
        provider: result.lookup?.provider ?? null,
        reason: result.lookup?.reason ?? null,
        country: result.countryCode,
        currency: result.currencyCode,
        reqIpPrivate,
        clientIpPrivate,
        // Hashed, not raw — enough to group entries from the same visitor
        // during debugging without retaining a personally-identifiable IP.
        clientIpFp: ipFingerprint(clientIp),
      },
    },
    "geo currency lookup",
  );

  // When both providers fail to resolve the IP to a country the shopper
  // silently sees USD. Record a durable server-side event so the
  // geoCurrencyFallbackMonitor can count these per hour and Slack-alert
  // when the rate climbs above the configured threshold.
  if (result.source === "lookup" && result.countryCode === null) {
    void db
      .insert(analyticsEventsTable)
      .values({
        name: "geo_currency_fallback",
        platform: "server",
        action: result.lookup?.reason ?? null,
        surface: result.lookup?.provider ?? null,
        appVersion: null,
        errorCode: null,
        productId: null,
        sessionId: null,
        userId: null,
        signedIn: false,
      })
      .catch((err: unknown) => {
        req.log.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "geo: failed to persist geo_currency_fallback metric",
        );
      });
  }

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
  keyGenerator: clientIpKey,
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
