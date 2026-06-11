import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { sendCapiEvent, type CAPIEventName } from "../lib/fbConversions";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const FB_EVENT_NAMES: [CAPIEventName, ...CAPIEventName[]] = [
  "ViewContent",
  "AddToCart",
  "InitiateCheckout",
  "Purchase",
];

const FbMobileEventBodySchema = z.object({
  event: z.enum(FB_EVENT_NAMES),
  countryCode: z.string().max(8),
  value: z.number().optional(),
  currency: z.string().max(8).optional(),
  contentIds: z.array(z.string().max(128)).max(50).optional(),
  contentName: z.string().max(500).optional(),
  email: z.string().max(254).optional(),
  phone: z.string().max(30).optional(),
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

    const { event, countryCode, value, currency, contentIds, contentName, email, phone } = parsed.data;

    void sendCapiEvent({
      eventName: event,
      countryCode,
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

export { FbMobileEventBodySchema };
export default router;
