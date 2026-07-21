import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import {
  sendCapiEvent,
  sendCapiEventByPixelId,
  type CAPIEventName,
} from "../lib/fbConversions";
import { pickClientIp } from "../lib/geoCurrency";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const FB_EVENT_NAMES: [CAPIEventName, ...CAPIEventName[]] = [
  "PageView",
  "ViewContent",
  "AddToCart",
  "InitiateCheckout",
  "AddPaymentInfo",
  "Purchase",
];

const FbMobileEventBodySchema = z.object({
  event: z.enum(["ViewContent", "AddToCart", "InitiateCheckout", "AddPaymentInfo", "Purchase"]),
  countryCode: z.string().max(8),
  eventId: z.string().max(128).optional(),
  value: z.number().optional(),
  currency: z.string().max(8).optional(),
  contentIds: z.array(z.string().max(128)).max(50).optional(),
  contentName: z.string().max(500).optional(),
  email: z.string().max(254).optional(),
  phone: z.string().max(30).optional(),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  /** Pre-formatted Meta fbc value (`fb.1.<timestamp_ms>.<fbclid>`) captured
   *  from the Facebook ad deep-link that opened the app. */
  fbc: z.string().max(512).optional(),
});

const FbWebEventBodySchema = z.object({
  eventName: z.enum(FB_EVENT_NAMES),
  pixelId: z.string().min(1).max(64),
  eventId: z.string().max(128).optional(),
  fbp: z.string().max(256).optional(),
  fbclid: z.string().max(256).optional(),
  sourceUrl: z.string().max(2048).optional(),
  userData: z
    .object({
      em: z.string().max(254).optional(),
      ph: z.string().max(30).optional(),
      fn: z.string().max(100).optional(),
      ln: z.string().max(100).optional(),
    })
    .optional(),
  value: z.number().optional(),
  currency: z.string().max(8).optional(),
  contentIds: z.array(z.string().max(128)).max(50).optional(),
  contentName: z.string().max(500).optional(),
  numItems: z.number().int().optional(),
});

const fbEventsLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(200).json({ ok: true });
  },
});

// Mobile app → CAPI (existing endpoint, keyed by countryCode)
router.post(
  "/fb/events",
  fbEventsLimiter,
  (req, res, next) => {
    const cl = Number(req.header("content-length") ?? 0);
    if (Number.isFinite(cl) && cl > 4 * 1024) {
      res.status(400).json({ ok: false, message: "Payload too large" }); // i18n-ignore
      return;
    }
    next();
  },
  (req, res): void => {
    const parsed = FbMobileEventBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Invalid body", // i18n-ignore
      });
      return;
    }

    const { event, countryCode, eventId, value, currency, contentIds, contentName, email, phone, firstName, lastName, fbc } = parsed.data;

    void sendCapiEvent({
      eventName: event,
      countryCode,
      eventId,
      value,
      currency,
      contentIds,
      contentName,
      userData: { email, phone, firstName, lastName, fbc },
      actionSource: "app",
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ err: message, event, countryCode }, "fb/events: CAPI send failed");
    });

    res.status(200).json({ ok: true });
  },
);

// Web app → CAPI (keyed by pixelId from client; real visitor IP and UA
// are extracted server-side from the proxied browser request so they are
// never empty in the outgoing Meta payload).
router.post(
  "/pixel/event",
  fbEventsLimiter,
  (req, res, next) => {
    const cl = Number(req.header("content-length") ?? 0);
    if (Number.isFinite(cl) && cl > 4 * 1024) {
      res.status(400).json({ ok: false, message: "Payload too large" }); // i18n-ignore
      return;
    }
    next();
  },
  (req, res): void => {
    const parsed = FbWebEventBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Invalid body", // i18n-ignore
      });
      return;
    }

    const {
      eventName,
      pixelId,
      eventId,
      fbp,
      fbclid,
      sourceUrl,
      userData,
      value,
      currency,
      contentIds,
      contentName,
    } = parsed.data;

    // Extract the real visitor IP. The production environment runs behind
    // multiple proxy hops, so `req.ip` (with trust proxy: 1) may point at an
    // internal hop. `pickClientIp` walks the x-forwarded-for chain and returns
    // the leftmost publicly-routable address, falling back to req.ip.
    const rawIp = (req.ip ?? "").toString();
    const clientIpAddress = pickClientIp(req.headers["x-forwarded-for"], rawIp) || null;

    // Extract browser User-Agent from the proxied request headers.
    const clientUserAgent = (req.headers["user-agent"] ?? "").trim() || null;

    // Log only presence and validity — never log raw IP or UA values.
    logger.debug(
      { eventName, ipPresent: Boolean(clientIpAddress), uaPresent: Boolean(clientUserAgent) },
      "pixel/event: visitor signals",
    );

    void sendCapiEventByPixelId({
      eventName,
      pixelId,
      eventId,
      value,
      currency,
      contentIds,
      contentName,
      userData: {
        email: userData?.em,
        phone: userData?.ph,
        firstName: userData?.fn,
        lastName: userData?.ln,
        fbp,
        fbclid,
        clientIpAddress,
        clientUserAgent,
      },
      eventSourceUrl: sourceUrl,
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ err: message, eventName, pixelId }, "pixel/event: CAPI send failed");
    });

    res.status(200).json({ ok: true });
  },
);

export { FbMobileEventBodySchema };
export default router;
