import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { getAuth } from "@clerk/express";
import {
  RecordAnalyticsEventBody,
  RecordAnalyticsEventResponse,
} from "@workspace/api-zod";
import { db, analyticsEventsTable } from "@workspace/db";

const router: IRouter = Router();

const MAX_FIELD = 200;

function clip(value: string | undefined, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.length > max ? `${value.slice(0, max)}…[truncated]` : value;
}

const analyticsLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    const body: ReturnType<typeof RecordAnalyticsEventResponse.parse> = {
      ok: true,
    };
    res.status(200).json(body);
  },
});

router.post(
  "/analytics/events",
  analyticsLimiter,
  (req, res, next) => {
    const cl = Number(req.header("content-length") ?? 0);
    if (Number.isFinite(cl) && cl > 4 * 1024) {
      res.status(400).json({ ok: false, message: "Payload too large" });
      return;
    }
    next();
  },
  (req, res): void => {
    const parsed = RecordAnalyticsEventBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Invalid body",
      });
      return;
    }
    const { name, surface, action, platform, appVersion, errorCode, productId, sessionId, state, appOrderId, wcOrderId } = parsed.data;

    let userId: string | undefined;
    try {
      const auth = getAuth(req);
      userId = auth?.userId ?? undefined;
    } catch {
      userId = undefined;
    }

    const clippedAppVersion = clip(appVersion, MAX_FIELD);
    const clippedErrorCode = clip(errorCode, 64);
    const clippedProductId = clip(productId, 64);
    const clippedSessionId = clip(sessionId, 36);
    const clippedState = clip(state, 64);
    const clippedAppOrderId = clip(appOrderId, 64);
    const clippedWcOrderId = clip(wcOrderId, 64);

    req.log.info(
      {
        analytics: true,
        event: name,
        surface,
        action,
        platform,
        appVersion: clippedAppVersion,
        errorCode: clippedErrorCode,
        productId: clippedProductId,
        sessionId: clippedSessionId,
        state: clippedState,
        appOrderId: clippedAppOrderId,
        wcOrderId: clippedWcOrderId,
        userId,
        signedIn: Boolean(userId),
      },
      "analytics event",
    );

    // Persist the event so the scheduled funnel monitor can compute
    // platform/surface ratios after the fact. Best-effort: a DB outage
    // must not break analytics ingestion.
    void db
      .insert(analyticsEventsTable)
      .values({
        name,
        surface: surface ?? null,
        action: action ?? null,
        platform: platform ?? null,
        appVersion: clippedAppVersion ?? null,
        errorCode: clippedErrorCode ?? null,
        productId: clippedProductId ?? null,
        sessionId: clippedSessionId ?? null,
        state: clippedState ?? null,
        appOrderId: clippedAppOrderId ?? null,
        wcOrderId: clippedWcOrderId ?? null,
        userId: userId ?? null,
        signedIn: Boolean(userId),
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        req.log.warn(
          { err: message, event: name },
          "analytics: failed to persist event",
        );
      });

    const body = RecordAnalyticsEventResponse.parse({ ok: true });
    res.status(200).json(body);
  },
);

export default router;
