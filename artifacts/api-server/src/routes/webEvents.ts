import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { db, analyticsEventsTable } from "@workspace/db";

const WEB_EVENT_TYPES = [
  "page_view",
  "product_view",
  "add_to_cart",
  "checkout_step",
  "payment_started",
  "payment_completed",
  "payment_failed",
  "promo_opened",
  "promo_apply_attempted",
  "promo_applied",
  "promo_failed",
  "promo_removed",
  "order_summary_viewed",
  "promo_code_expanded",
  "promo_code_submitted",
  "promo_code_removed",
  "checkout_clicked",
  "search",
  "search_no_result",
  "klarna_selected",
  "klarna_redirect_started",
  "klarna_payment_processing",
  "klarna_payment_failed",
  "free_delivery_prompt_viewed",
  "free_delivery_addons_clicked",
  "free_delivery_unlocked",
  "free_delivery_lost",
  "checkout_clicked",
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
  visitorId: z.string().max(64).optional(),
  occurredAt: z.string().max(64).optional(),
  value: z.number().finite().nonnegative().optional(),
  currency: z.string().max(8).optional(),
  brand: z.string().max(128).optional(),
  city: z.string().max(128).optional(),
  items: z.array(webEventItemSchema).max(100).optional(),
  properties: z.record(z.unknown()).optional(),
  utmSource: z.string().max(256).optional(),
  utmMedium: z.string().max(256).optional(),
  utmCampaign: z.string().max(256).optional(),
  utmTerm: z.string().max(256).optional(),
  utmContent: z.string().max(256).optional(),
  referrer: z.string().max(1024).optional(),
  trafficSource: z.string().max(256).optional(),
  deviceType: z.string().max(32).optional(),
  language: z.string().max(16).optional(),
  url: z.string().max(2048).optional(),
  path: z.string().max(1024).optional(),
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


function mapEventToRow(event: WebEventBody): typeof analyticsEventsTable.$inferInsert {
  const propertiesMeta: Record<string, unknown> = {};
  if (event.currency) propertiesMeta.currency = event.currency;
  if (event.brand) propertiesMeta.brand = event.brand;
  if (event.city) propertiesMeta.city = event.city;
  if (event.deviceType) propertiesMeta.deviceType = event.deviceType;
  if (event.trafficSource) propertiesMeta.trafficSource = event.trafficSource;
  if (event.utmSource) propertiesMeta.utmSource = event.utmSource;
  if (event.utmMedium) propertiesMeta.utmMedium = event.utmMedium;
  if (event.utmCampaign) propertiesMeta.utmCampaign = event.utmCampaign;
  if (event.path) propertiesMeta.path = event.path;
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

/**
 * Best-effort forward of web events to the OS ingestion endpoint.
 * Fires async after the local DB insert — never blocks the 200 response.
 */
function forwardToOs(events: WebEventBody[], log: { warn: (obj: unknown, msg: string) => void }): void {
  const osApiUrl = process.env.PRESENTAIL_OS_API_URL;
  const osApiKey = process.env.PRESENTAIL_OS_API_KEY;
  if (!osApiUrl || !osApiKey) return;

  const endpoint = `${osApiUrl}/api/web-events`;
  const body = events.length === 1 ? JSON.stringify(events[0]) : JSON.stringify({ events });

  void fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": osApiKey,
    },
    body,
  }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      log.warn({ status: res.status, body: text.slice(0, 256) }, "web-events: OS forward failed");
    }
  }).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    log.warn({ err: message }, "web-events: OS forward error");
  });
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

      forwardToOs(toInsert, req.log);
    }

    req.log.info(
      { accepted: toInsert.length, dropped, types: toInsert.map((e) => e.type) },
      "web-events ingested",
    );

    res.status(200).json({ ok: true, accepted: toInsert.length, dropped });
  },
);

export default router;
