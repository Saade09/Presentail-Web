import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { getAuth } from "@clerk/express";
import {
  RecordAnalyticsEventBody,
  RecordAnalyticsEventResponse,
} from "@workspace/api-zod";
import { db, analyticsEventsTable } from "@workspace/db";

const ADS_CONVERSION_ID = "AW-18281774261"; // i18n-ignore
const ADS_CONVERSION_LABEL = "XYi_CNabpMccELX5to1E"; // i18n-ignore

/**
 * Fire a Google Ads purchase conversion server-side using the standard
 * Google conversion pixel endpoint. This mirrors what web gtag.js sends
 * for client-side conversions, allowing mobile (React Native) purchases to
 * be attributed in the same Google Ads campaign as web purchases.
 *
 * Google deduplicates conversions by `transaction_id`, so retries and
 * network races are safe — only the first hit for a given transaction ID
 * counts.
 */
async function sendAdsConversionPing(
  transactionId: string,
  value: number,
  currency: string,
  log: { warn: (obj: Record<string, unknown>, msg: string) => void },
  gclid?: string,
): Promise<void> {
  const paramEntries: Record<string, string> = {
    cv: "9",
    fst: String(Date.now()),
    num: "1",
    label: ADS_CONVERSION_LABEL,
    guid: "ON",
    script: "0",
    value: String(value),
    currency_code: currency.toUpperCase(),
    transaction_id: transactionId,
    is_iframe: "0",
    fmt: "3",
  };
  if (gclid) {
    paramEntries.gclaw = gclid;
  }
  const params = new URLSearchParams(paramEntries);
  const url = `https://www.google.com/pagead/conversion/${ADS_CONVERSION_ID}/?${params.toString()}`; // i18n-ignore
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      log.warn(
        { status: res.status, transactionId },
        "ads-conversion: non-OK response from Google",
      );
      void db
        .insert(analyticsEventsTable)
        .values({ name: "ads_conversion_ping_failed", errorCode: String(res.status) })
        .catch((dbErr: unknown) => {
          log.warn(
            { err: dbErr instanceof Error ? dbErr.message : String(dbErr) },
            "ads-conversion: failed to record ping failure event",
          );
        });
    }
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err), transactionId },
      "ads-conversion: ping failed",
    );
    void db
      .insert(analyticsEventsTable)
      .values({
        name: "ads_conversion_ping_failed",
        errorCode: err instanceof Error ? err.message.slice(0, 64) : "unknown",
      })
      .catch((dbErr: unknown) => {
        log.warn(
          { err: dbErr instanceof Error ? dbErr.message : String(dbErr) },
          "ads-conversion: failed to record ping failure event",
        );
      });
  }
}

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

const adsConversionBody = z.object({
  transactionId: z.string().min(1).max(128),
  value: z.number().nonnegative().finite(),
  currency: z.string().min(1).max(8),
  /** Google Click ID from the deep link that drove the session. */
  gclid: z.string().min(1).max(512).optional(),
});

const adsConversionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(200).json({ ok: true });
  },
});

/**
 * POST /api/analytics/ads-conversion
 *
 * Fires a Google Ads purchase conversion server-side on behalf of the mobile
 * app (React Native has no browser gtag). The web storefront fires conversions
 * client-side via window.gtag; this endpoint provides parity for iOS/Android.
 *
 * Google deduplicates by `transaction_id`, so retrying a failed request is safe.
 */
router.post(
  "/analytics/ads-conversion",
  adsConversionLimiter,
  (req, res, next) => {
    const cl = Number(req.header("content-length") ?? 0);
    if (Number.isFinite(cl) && cl > 2 * 1024) {
      res.status(400).json({ ok: false, message: "Payload too large" }); // i18n-ignore
      return;
    }
    next();
  },
  (req, res): void => {
    const parsed = adsConversionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Invalid body", // i18n-ignore
      });
      return;
    }
    const { transactionId, value, currency, gclid } = parsed.data;
    req.log.info(
      { transactionId, value, currency, hasGclid: Boolean(gclid) },
      "ads-conversion: firing server-side ping",
    );
    void sendAdsConversionPing(transactionId, value, currency, req.log, gclid);
    res.status(200).json({ ok: true });
  },
);

router.post(
  "/analytics/events",
  analyticsLimiter,
  (req, res, next) => {
    const cl = Number(req.header("content-length") ?? 0);
    if (Number.isFinite(cl) && cl > 4 * 1024) {
      res.status(400).json({ ok: false, message: "Payload too large" }); // i18n-ignore
      return;
    }
    next();
  },
  (req, res): void => {
    const parsed = RecordAnalyticsEventBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Invalid body", // i18n-ignore
      });
      return;
    }
    const { name, surface, action, platform, appVersion, errorCode, productId, sessionId, campaignIdentity, state, appOrderId, wcOrderId, metricValue, bannerId, linkKind, linkSlug, linkUrl } = parsed.data;

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
    const clippedCampaignIdentity = clip(campaignIdentity, 64);
    const clippedState = clip(state, 64);
    const clippedAppOrderId = clip(appOrderId, 64);
    const clippedWcOrderId = clip(wcOrderId, 64);
    const clippedBannerId = clip(bannerId, 64);
    const clippedLinkKind = clip(linkKind, 32);
    const clippedLinkSlug = clip(linkSlug, 128);
    const clippedLinkUrl = clip(linkUrl, 512);

    // Clamp metric values to [0, 60000] — CLS ratios are tiny, timing
    // metrics max out well below 60 s in practice.
    const clampedMetricValue =
      typeof metricValue === "number" && Number.isFinite(metricValue)
        ? Math.min(Math.max(metricValue, 0), 60_000)
        : null;

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
        campaignIdentity: clippedCampaignIdentity,
        state: clippedState,
        appOrderId: clippedAppOrderId,
        wcOrderId: clippedWcOrderId,
        metricValue: clampedMetricValue,
        bannerId: clippedBannerId,
        linkKind: clippedLinkKind,
        linkSlug: clippedLinkSlug,
        linkUrl: clippedLinkUrl,
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
        propertiesJson: clippedCampaignIdentity
          ? JSON.stringify({ campaignIdentity: clippedCampaignIdentity })
          : null,
        state: clippedState ?? null,
        appOrderId: clippedAppOrderId ?? null,
        wcOrderId: clippedWcOrderId ?? null,
        metricValue: clampedMetricValue,
        bannerId: clippedBannerId ?? null,
        linkKind: clippedLinkKind ?? null,
        linkSlug: clippedLinkSlug ?? null,
        linkUrl: clippedLinkUrl ?? null,
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
