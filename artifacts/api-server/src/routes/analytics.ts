import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { getAuth } from "@clerk/express";
import {
  RecordAnalyticsEventBody,
  RecordAnalyticsEventResponse,
} from "@workspace/api-zod";
import { db, analyticsEventsTable } from "@workspace/db";
import {
  analyticsSamplingMetadata,
  decideWebVitalSampling,
  getAnalyticsSamplingConfig,
  recordAnalyticsSamplingDecision,
  shouldLogAnalyticsEvent,
} from "../lib/analyticsSampling";

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

/**
 * POST /api/analytics/ads-conversion
 *
 * Retained as an explicit tombstone for older mobile clients. Purchase
 * conversions are uploaded only from the confirmed-order webhook, using the
 * order total and attribution persisted by the server. Never forward values
 * from this unauthenticated compatibility endpoint to an advertising network.
 */
router.post("/analytics/ads-conversion", (_req, res): void => {
  res.status(410).json({
    ok: false,
    message: "Purchase conversions are recorded from verified orders only", // i18n-ignore
  });
});

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
    const {
      name,
      surface,
      action,
      platform,
      appVersion,
      errorCode,
      productId,
      sessionId,
      campaignIdentity,
      state,
      appOrderId,
      wcOrderId,
      metricValue,
      bannerId,
      linkKind,
      linkSlug,
      linkUrl,
      locale,
      country,
      page_path,
      selected_country,
      selected_city,
      active_language,
      link_type,
    } = parsed.data;

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
    const clippedLocale = clip(locale, 8);
    const clippedCountry = clip(country, 8);
    const clippedPagePath = clip(page_path, 512);
    const clippedSelectedCountry = clip(selected_country, 8);
    const clippedSelectedCity = clip(selected_city, 64);
    const clippedActiveLanguage = clip(active_language, 8);
    const clippedLinkType = clip(link_type, 32);

    // Clamp metric values to [0, 60000] — CLS ratios are tiny, timing
    // metrics max out well below 60 s in practice.
    const clampedMetricValue =
      typeof metricValue === "number" && Number.isFinite(metricValue)
        ? Math.min(Math.max(metricValue, 0), 60_000)
        : null;
    const samplingConfig = getAnalyticsSamplingConfig();
    const samplingDecision =
      name === "web_vital"
        ? decideWebVitalSampling(
            {
              sessionId: clippedSessionId,
              action,
              metricValue: clampedMetricValue ?? undefined,
              errorCode: clippedErrorCode,
            },
            samplingConfig,
          )
        : null;
    recordAnalyticsSamplingDecision(name, samplingDecision);

    if (shouldLogAnalyticsEvent(name, samplingDecision)) {
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
          locale: clippedLocale,
          country: clippedCountry,
          page_path: clippedPagePath,
          selected_country: clippedSelectedCountry,
          selected_city: clippedSelectedCity,
          active_language: clippedActiveLanguage,
          link_type: clippedLinkType,
          userId,
          signedIn: Boolean(userId),
          analyticsSampling: samplingDecision
            ? {
                mode: samplingDecision.mode,
                rate: samplingDecision.sampleRate,
                selected: samplingDecision.selected,
                retainedByException: samplingDecision.retainedByException,
                persisted: samplingDecision.persist,
                reason: samplingDecision.reason,
              }
            : { mode: "full_fidelity", persisted: true },
        },
        "analytics event",
      );
    }

    // Persist the event so the scheduled funnel monitor can compute
    // platform/surface ratios after the fact. Best-effort: a DB outage
    // must not break analytics ingestion.
    if (!samplingDecision || samplingDecision.persist) {
      const properties: Record<string, unknown> = {};
      if (clippedCampaignIdentity) {
        properties.campaignIdentity = clippedCampaignIdentity;
      }
      if (clippedLocale) {
        properties.locale = clippedLocale;
      }
      if (clippedCountry) {
        properties.country = clippedCountry;
      }
      if (clippedPagePath) {
        properties.page_path = clippedPagePath;
      }
      if (clippedSelectedCountry) {
        properties.selected_country = clippedSelectedCountry;
      }
      if (clippedSelectedCity) {
        properties.selected_city = clippedSelectedCity;
      }
      if (clippedActiveLanguage) {
        properties.active_language = clippedActiveLanguage;
      }
      if (clippedLinkType) {
        properties.link_type = clippedLinkType;
      }
      if (samplingDecision) {
        properties.analyticsSampling =
          analyticsSamplingMetadata(samplingDecision);
      }

      void db
        .insert(analyticsEventsTable)
        .values({
          name: samplingDecision?.storedName ?? name,
          surface: surface ?? null,
          action: action ?? null,
          platform: platform ?? null,
          appVersion: clippedAppVersion ?? null,
          errorCode: clippedErrorCode ?? null,
          productId: clippedProductId ?? null,
          sessionId: clippedSessionId ?? null,
          propertiesJson:
            Object.keys(properties).length > 0
              ? JSON.stringify(properties)
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
    }

    const body = RecordAnalyticsEventResponse.parse({ ok: true });
    res.status(200).json(body);
  },
);

export default router;
