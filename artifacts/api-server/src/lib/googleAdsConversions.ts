/**
 * Google Ads Conversions API integration.
 *
 * Uploads click conversions (gclid / gbraid / wbraid) to the Google Ads
 * Conversions API when an order is confirmed, closing the attribution loop so
 * the ad platform can optimise bidding toward actual purchases.
 *
 * Required env vars (all optional — module silently no-ops when absent):
 *   GOOGLE_ADS_CUSTOMER_ID         Google Ads account customer ID (digits only or
 *                                  dash-separated, e.g. "123-456-7890").
 *   GOOGLE_ADS_DEVELOPER_TOKEN     Developer token from Google Ads API Centre.
 *   GOOGLE_ADS_CONVERSION_ACTION_ID  Numeric conversion action ID, or the full
 *                                  resource name "customers/{cid}/conversionActions/{id}".
 *   GOOGLE_ADS_CLIENT_ID           OAuth2 client ID (from Google Cloud console).
 *   GOOGLE_ADS_CLIENT_SECRET       OAuth2 client secret.
 *   GOOGLE_ADS_REFRESH_TOKEN       OAuth2 refresh token for a Google account that
 *                                  has access to the Ads account.
 *
 * Failures are logged at WARN level, fire a Slack alert via alerts.ts, and
 * record an `ads_conversion_ping_failed` analytics event (picked up by
 * googleAdsConversionMonitor.ts). They never throw or block callers.
 */

import { logger } from "./logger";
import { sendAlert } from "./alerts";
import { db, analyticsEventsTable } from "@workspace/db";

const API_VERSION = "v18"; // i18n-ignore
const GOOGLE_ADS_API_BASE = `https://googleads.googleapis.com/${API_VERSION}`; // i18n-ignore
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"; // i18n-ignore

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

type AdsConfig = {
  customerId: string;
  developerToken: string;
  conversionActionId: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

function resolveConfig(): AdsConfig | null {
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const conversionActionId = process.env.GOOGLE_ADS_CONVERSION_ACTION_ID;
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;

  if (
    !customerId ||
    !developerToken ||
    !conversionActionId ||
    !clientId ||
    !clientSecret ||
    !refreshToken
  ) {
    return null;
  }

  return { customerId, developerToken, conversionActionId, clientId, clientSecret, refreshToken };
}

// ---------------------------------------------------------------------------
// OAuth2 access token cache (50-minute TTL; access tokens last 60 min)
// ---------------------------------------------------------------------------

let cachedToken: { value: string; expiresAt: number } | null = null;

/** Reset the in-process token cache. Call from tests only. */
export function __resetTokenCacheForTest(): void {
  cachedToken = null;
}

async function fetchAccessToken(config: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < cachedToken.expiresAt) {
    return cachedToken.value;
  }

  const resp = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token", // i18n-ignore
    }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`OAuth2 token refresh failed (${resp.status}): ${text.slice(0, 128)}`);
  }

  const data = (await resp.json()) as { access_token: string; expires_in?: number };
  const expiresInMs = (typeof data.expires_in === "number" ? data.expires_in : 3600) * 1000;

  cachedToken = {
    value: data.access_token,
    expiresAt: now + expiresInMs - 10 * 60 * 1000, // 10-min buffer
  };

  return data.access_token;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MarketingAttribution = {
  source?: string;
  first_touch?: Record<string, string>;
  last_touch?: Record<string, string>;
  conversion?: Record<string, string>;
};

export type UploadClickConversionParams = {
  appOrderId: string;
  attribution: MarketingAttribution;
  /** Millisecond timestamp of the conversion (when the order was confirmed). */
  conversionTimeMs: number;
  /** Order total in USD cents. Null/undefined → conversion uploaded without a value. */
  totalUsdCents: number | null | undefined;
};

// ---------------------------------------------------------------------------
// Failure recording
// ---------------------------------------------------------------------------

async function recordFailure(errorCode: string): Promise<void> {
  await db
    .insert(analyticsEventsTable)
    .values({ name: "ads_conversion_ping_failed", errorCode: errorCode.slice(0, 64) }) // i18n-ignore
    .catch((err: unknown) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "googleAdsConversions: failed to record failure analytics event",
      );
    });
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Upload a click conversion to the Google Ads Conversions API.
 *
 * Reads `gclid`, `gbraid`, and `wbraid` from `attribution.first_touch`.
 * Silently no-ops when:
 *  - Any required env var is absent.
 *  - No click ID is present in the attribution (organic/direct order).
 *
 * Always resolves — never throws. Failures are logged + alerted.
 */
export async function uploadGoogleAdsConversion(
  params: UploadClickConversionParams,
): Promise<void> {
  const config = resolveConfig();
  if (!config) {
    logger.info(
      { appOrderId: params.appOrderId },
      "googleAdsConversions: env vars not fully configured — skipping upload",
    );
    return;
  }

  const firstTouch = params.attribution.first_touch ?? {};
  const gclid = typeof firstTouch.gclid === "string" && firstTouch.gclid ? firstTouch.gclid : null;
  const gbraid = typeof firstTouch.gbraid === "string" && firstTouch.gbraid ? firstTouch.gbraid : null;
  const wbraid = typeof firstTouch.wbraid === "string" && firstTouch.wbraid ? firstTouch.wbraid : null;

  if (!gclid && !gbraid && !wbraid) {
    logger.info(
      { appOrderId: params.appOrderId },
      "googleAdsConversions: no click ID in attribution — skipping upload",
    );
    return;
  }

  // Normalise customer ID: strip dashes (e.g. "123-456-7890" → "1234567890").
  const normalizedCustomerId = config.customerId.replace(/-/g, "");

  // Build conversion action resource name if a bare numeric ID was supplied.
  const conversionAction = config.conversionActionId.includes("/")
    ? config.conversionActionId
    : `customers/${normalizedCustomerId}/conversionActions/${config.conversionActionId}`; // i18n-ignore

  // Google Ads API expects "YYYY-MM-DD HH:MM:SS+HH:MM" format.
  const d = new Date(params.conversionTimeMs);
  const pad = (n: number, len = 2): string => String(n).padStart(len, "0");
  const conversionDateTime =
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+00:00`;

  const clickConversion: Record<string, unknown> = {
    conversionAction,
    conversionDateTime,
    orderId: params.appOrderId,
  };

  if (gclid) clickConversion.gclid = gclid;
  if (gbraid) clickConversion.gbraid = gbraid;
  if (wbraid) clickConversion.wbraid = wbraid;

  if (params.totalUsdCents != null) {
    clickConversion.conversionValue = params.totalUsdCents / 100;
    clickConversion.currencyCode = "USD"; // i18n-ignore
  }

  const requestBody = { conversions: [clickConversion], partialFailure: true };
  const url = `${GOOGLE_ADS_API_BASE}/customers/${normalizedCustomerId}/googleAds:uploadClickConversions`; // i18n-ignore

  try {
    const accessToken = await fetchAccessToken({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      refreshToken: config.refreshToken,
    });

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`, // i18n-ignore
        "developer-token": config.developerToken, // i18n-ignore
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(10_000),
    });

    const responseText = await resp.text().catch(() => "");

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${responseText.slice(0, 256)}`);
    }

    // Inspect for partial failures (returned with 200 when partialFailure=true).
    let partialFailureError: unknown = null;
    try {
      const json = JSON.parse(responseText) as Record<string, unknown>;
      partialFailureError = json.partialFailureError ?? null;
    } catch {
      // Non-JSON or empty body — treat as success.
    }

    if (partialFailureError) {
      const errStr = JSON.stringify(partialFailureError).slice(0, 256);
      logger.warn(
        { appOrderId: params.appOrderId, partialFailureError },
        "googleAdsConversions: partial failure in upload response",
      );
      await recordFailure(errStr.slice(0, 64));
      await sendAlert({
        title: "Google Ads conversion upload — partial failure", // i18n-ignore
        body:
          `Order ${params.appOrderId}: the Google Ads Conversions API reported a partial failure. ` +
          `Check that the conversion action ID and click IDs are valid. Details: ${errStr}`,
        severity: "warn",
        fields: [
          { title: "appOrderId", value: params.appOrderId }, // i18n-ignore
          { title: "error", value: errStr.slice(0, 200) }, // i18n-ignore
        ],
        source: "googleAdsConversions", // i18n-ignore
      });
      return;
    }

    logger.info(
      {
        appOrderId: params.appOrderId,
        hasGclid: Boolean(gclid),
        hasGbraid: Boolean(gbraid),
        hasWbraid: Boolean(wbraid),
        valueUsd: params.totalUsdCents != null ? params.totalUsdCents / 100 : null,
      },
      "googleAdsConversions: click conversion uploaded successfully",
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      { appOrderId: params.appOrderId, err: message },
      "googleAdsConversions: upload failed (non-fatal)",
    );
    await recordFailure(message.slice(0, 64));
    await sendAlert({
      title: "Google Ads conversion upload failed", // i18n-ignore
      body:
        `Order ${params.appOrderId}: failed to upload click conversion to Google Ads Conversions API. ` +
        `Attribution data may be lost for this order. Error: ${message.slice(0, 200)}`,
      severity: "warn",
      fields: [
        { title: "appOrderId", value: params.appOrderId }, // i18n-ignore
        { title: "error", value: message.slice(0, 200) }, // i18n-ignore
      ],
      source: "googleAdsConversions", // i18n-ignore
    });
  }
}
