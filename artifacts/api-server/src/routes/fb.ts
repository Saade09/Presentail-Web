import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import {
  sendCapiEvent,
  sendCapiEventByPixelId,
  type CAPIEventName,
} from "../lib/fbConversions";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const FB_EVENT_NAMES: [CAPIEventName, ...CAPIEventName[]] = [
  "PageView",
  "ViewContent",
  "AddToCart",
  "InitiateCheckout",
  "Purchase",
];

const FbMobileEventBodySchema = z.object({
  event: z.enum(["ViewContent", "AddToCart", "InitiateCheckout", "Purchase"]),
  countryCode: z.string().max(8),
  eventId: z.string().max(128).optional(),
  value: z.number().optional(),
  currency: z.string().max(8).optional(),
  contentIds: z.array(z.string().max(128)).max(50).optional(),
  contentName: z.string().max(500).optional(),
  email: z.string().max(254).optional(),
  phone: z.string().max(30).optional(),
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

    const { event, countryCode, eventId, value, currency, contentIds, contentName, email, phone } = parsed.data;

    void sendCapiEvent({
      eventName: event,
      countryCode,
      eventId,
      value,
      currency,
      contentIds,
      contentName,
      userData: { email, phone },
      actionSource: "app",
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ err: message, event, countryCode }, "fb/events: CAPI send failed");
    });

    res.status(200).json({ ok: true });
  },
);

// Web app → CAPI (new endpoint, keyed by pixelId passed from client)
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
        fbp,
        fbclid,
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
