import { Router, type IRouter } from "express";
import { timingSafeEqual } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { db, analyticsEventsTable } from "@workspace/db";

const WEB_EVENT_TYPES = [
  "product_view",
  "add_to_cart",
  "checkout_step",
  "payment_started",
  "payment_completed",
  "promo_applied",
  "promo_failed",
] as const;

const webEventItemSchema = z.object({
  productId: z.string().max(128),
  name: z.string().max(256),
  price: z.number().finite().nonnegative(),
  quantity: z.number().int().min(1),
});

const webEventBodySchema = z.object({
  type: z.enum(WEB_EVENT_TYPES),
  sessionId: z.string().max(36).optional(),
  value: z.number().finite().nonnegative().optional(),
  currency: z.string().max(8).optional(),
  brand: z.string().max(128).optional(),
  city: z.string().max(128).optional(),
  items: z.array(webEventItemSchema).max(100).optional(),
  properties: z.record(z.unknown()).optional(),
});

const batchBodySchema = z.object({
  events: z.array(webEventBodySchema).min(1).max(500),
});

type WebEventBody = z.infer<typeof webEventBodySchema>;

const router: IRouter = Router();

const MAX_PAYLOAD_BYTES = 512 * 1024;

const webEventsLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(200).json({ ok: true, accepted: 0, dropped: 0 });
  },
});

function clip(value: string | undefined, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.length > max ? `${value.slice(0, max)}…[truncated]` : value;
}

function safeKeyCompare(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) {
      timingSafeEqual(aBuf, aBuf);
      return false;
    }
    return timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

function mapEventToRow(event: WebEventBody): typeof analyticsEventsTable.$inferInsert {
  const propertiesMeta: Record<string, unknown> = {};
  if (event.currency) propertiesMeta.currency = event.currency;
  if (event.brand) propertiesMeta.brand = event.brand;
  if (event.city) propertiesMeta.city = event.city;
  if (event.properties) Object.assign(propertiesMeta, event.properties);
  return {
    name: event.type,
    platform: "web",
    sessionId: clip(event.sessionId, 36) ?? null,
    metricValue:
      typeof event.value === "number" && Number.isFinite(event.value)
        ? Math.min(Math.max(event.value, 0), 999_999_999)
        : null,
    itemsJson: event.items ? JSON.stringify(event.items) : null,
    propertiesJson: Object.keys(propertiesMeta).length > 0 ? JSON.stringify(propertiesMeta) : null,
    signedIn: false,
  };
}

router.post(
  "/web-events",
  webEventsLimiter,
  (req, res, next) => {
    const cl = Number(req.header("content-length") ?? 0);
    if (Number.isFinite(cl) && cl > MAX_PAYLOAD_BYTES) {
      res.status(400).json({ ok: false, message: "Payload too large" }); // i18n-ignore
      return;
    }
    next();
  },
  (req, res): void => {
    const apiKey = process.env.PRESENTAIL_OS_API_KEY ?? "";
    const clientKey = (req.header("x-api-key") ?? "").trim();

    if (!apiKey || !clientKey || !safeKeyCompare(clientKey, apiKey)) {
      res.status(401).json({ ok: false, message: "Unauthorized" }); // i18n-ignore
      return;
    }

    const body = req.body as unknown;

    let events: WebEventBody[];

    const batchParsed = batchBodySchema.safeParse(body);
    if (batchParsed.success) {
      events = batchParsed.data.events;
    } else {
      const singleParsed = webEventBodySchema.safeParse(body);
      if (!singleParsed.success) {
        res.status(422).json({
          ok: false,
          message: singleParsed.error.issues[0]?.message ?? "Invalid body", // i18n-ignore
        });
        return;
      }
      events = [singleParsed.data];
    }

    const toInsert = events.filter((e) => e.sessionId && e.sessionId.trim().length > 0);
    const dropped = events.length - toInsert.length;

    if (toInsert.length > 0) {
      const rows = toInsert.map(mapEventToRow);
      void db
        .insert(analyticsEventsTable)
        .values(rows)
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          req.log.warn(
            { err: message, count: rows.length },
            "web-events: failed to persist events",
          );
        });
    }

    req.log.info(
      { accepted: toInsert.length, dropped, types: toInsert.map((e) => e.type) },
      "web-events ingested",
    );

    res.status(200).json({ ok: true, accepted: toInsert.length, dropped });
  },
);

export default router;
