import { createHash, randomBytes } from "crypto";
import { logger } from "./logger";

const GRAPH_API_VERSION = "v19.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

type CountryKey = "lb" | "ae";

function configForCountry(countryKey: CountryKey): { pixelId: string; accessToken: string } | null {
  if (countryKey === "lb") {
    const pixelId = process.env.FACEBOOK_PIXEL_ID_LB ?? process.env.VITE_FB_PIXEL_ID_LB;
    const accessToken =
      process.env.FB_CONVERSIONS_TOKEN_LB ??
      process.env.FACEBOOK_ACCESS_TOKEN;
    if (!pixelId || !accessToken) return null;
    return { pixelId, accessToken };
  }
  if (countryKey === "ae") {
    const pixelId = process.env.FACEBOOK_PIXEL_ID_AE ?? process.env.VITE_FB_PIXEL_ID_AE;
    const accessToken =
      process.env.FB_CONVERSIONS_TOKEN_AE ??
      process.env.FACEBOOK_ACCESS_TOKEN;
    if (!pixelId || !accessToken) return null;
    return { pixelId, accessToken };
  }
  return null;
}

/**
 * Resolve which country a pixelId belongs to by comparing against the known
 * pixel IDs for LB and AE. Returns null when the pixelId is unrecognised or
 * the corresponding env vars are not set.
 */
function configForPixelId(pixelId: string): { pixelId: string; accessToken: string } | null {
  const lbPixelId = process.env.FACEBOOK_PIXEL_ID_LB ?? process.env.VITE_FB_PIXEL_ID_LB;
  const aePixelId = process.env.FACEBOOK_PIXEL_ID_AE ?? process.env.VITE_FB_PIXEL_ID_AE;

  if (lbPixelId && pixelId === lbPixelId) {
    const accessToken =
      process.env.FB_CONVERSIONS_TOKEN_LB ??
      process.env.FACEBOOK_ACCESS_TOKEN;
    if (!accessToken) return null;
    return { pixelId, accessToken };
  }
  if (aePixelId && pixelId === aePixelId) {
    const accessToken =
      process.env.FB_CONVERSIONS_TOKEN_AE ??
      process.env.FACEBOOK_ACCESS_TOKEN;
    if (!accessToken) return null;
    return { pixelId, accessToken };
  }
  return null;
}

function countryCodeToKey(countryCode: string | null | undefined): CountryKey | null {
  if (!countryCode) return null;
  const lower = countryCode.toLowerCase();
  if (lower === "lb") return "lb";
  if (lower === "ae") return "ae";
  return null;
}

function hashValue(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

type CAPIUserData = {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fbp?: string | null;
  fbclid?: string | null;
};

export type CAPIEventName =
  | "PageView"
  | "ViewContent"
  | "AddToCart"
  | "InitiateCheckout"
  | "Purchase";

export type CAPIEventParams = {
  eventName: CAPIEventName;
  countryCode: string | null | undefined;
  value?: number | null;
  currency?: string | null;
  contentIds?: string[] | null;
  contentName?: string | null;
  userData?: CAPIUserData;
  eventId?: string;
  eventSourceUrl?: string | null;
  /**
   * Facebook CAPI action_source. Defaults to "website" to preserve existing
   * web purchase deduplication semantics. Pass "app" only for events that
   * originate from the native mobile app (via POST /api/fb/events).
   */
  actionSource?: "website" | "app";
};

export type CAPIEventByPixelIdParams = {
  eventName: CAPIEventName;
  pixelId: string;
  value?: number | null;
  currency?: string | null;
  contentIds?: string[] | null;
  contentName?: string | null;
  userData?: CAPIUserData;
  eventId?: string;
  eventSourceUrl?: string | null;
};

async function sendCapiPayload(
  config: { pixelId: string; accessToken: string },
  params: {
    eventName: CAPIEventName;
    eventId: string;
    actionSource: "website" | "app";
    value?: number | null;
    currency?: string | null;
    contentIds?: string[] | null;
    contentName?: string | null;
    userData?: CAPIUserData;
    eventSourceUrl?: string | null;
  },
): Promise<void> {
  const eventTime = Math.floor(Date.now() / 1000);

  const hashedUserData: Record<string, string> = {};
  if (params.userData?.email) {
    hashedUserData.em = hashValue(params.userData.email);
  }
  if (params.userData?.phone) {
    hashedUserData.ph = hashValue(params.userData.phone.replace(/\D/g, ""));
  }
  if (params.userData?.firstName) {
    hashedUserData.fn = hashValue(params.userData.firstName);
  }
  if (params.userData?.lastName) {
    hashedUserData.ln = hashValue(params.userData.lastName);
  }
  if (params.userData?.fbp) {
    hashedUserData.fbp = params.userData.fbp;
  }
  if (params.userData?.fbclid) {
    hashedUserData.fbc = params.userData.fbclid;
  }

  const customData: Record<string, unknown> = {};
  if (params.value != null) customData.value = params.value;
  if (params.currency) customData.currency = params.currency.toUpperCase();
  if (params.contentIds && params.contentIds.length > 0) {
    customData.content_ids = params.contentIds;
    customData.content_type = "product";
  }
  if (params.contentName) customData.content_name = params.contentName;

  const eventPayload: Record<string, unknown> = {
    event_name: params.eventName,
    event_time: eventTime,
    event_id: params.eventId,
    action_source: params.actionSource,
    user_data:
      Object.keys(hashedUserData).length > 0
        ? hashedUserData
        : { client_user_agent: "" },
  };
  if (params.eventSourceUrl) {
    eventPayload.event_source_url = params.eventSourceUrl;
  }
  if (Object.keys(customData).length > 0) {
    eventPayload.custom_data = customData;
  }

  const payload = { data: [eventPayload] };

  const url = `${GRAPH_API_BASE}/${config.pixelId}/events?access_token=${config.accessToken}`;

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/**
 * Generic CAPI event sender keyed by countryCode. Silently no-ops when:
 * - countryCode is not LB or AE (e.g. CY)
 * - The pixel ID or access token env vars are absent for the country
 */
export async function sendCapiEvent(params: CAPIEventParams): Promise<void> {
  const countryKey = countryCodeToKey(params.countryCode);
  if (!countryKey) return;

  const config = configForCountry(countryKey);
  if (!config) return;

  const eventId = params.eventId ?? randomBytes(16).toString("hex");

  await sendCapiPayload(config, {
    eventName: params.eventName,
    eventId,
    actionSource: params.actionSource ?? "website",
    value: params.value,
    currency: params.currency,
    contentIds: params.contentIds,
    contentName: params.contentName,
    userData: params.userData,
    eventSourceUrl: params.eventSourceUrl,
  });
}

/**
 * CAPI event sender keyed by pixelId (for web client requests that pass the
 * pixel ID directly). Resolves the access token server-side and silently
 * no-ops when the pixelId is unrecognised or the token is missing.
 */
export async function sendCapiEventByPixelId(
  params: CAPIEventByPixelIdParams,
): Promise<void> {
  const config = configForPixelId(params.pixelId);
  if (!config) return;

  const eventId = params.eventId ?? randomBytes(16).toString("hex");

  await sendCapiPayload(config, {
    eventName: params.eventName,
    eventId,
    actionSource: "website",
    value: params.value,
    currency: params.currency,
    contentIds: params.contentIds,
    contentName: params.contentName,
    userData: params.userData,
    eventSourceUrl: params.eventSourceUrl,
  });
}

// ---------------------------------------------------------------------------
// Startup validation
// ---------------------------------------------------------------------------

type PixelCountryHealth = {
  country: CountryKey;
  pixelIdConfigured: boolean;
  accessTokenConfigured: boolean;
  ok: boolean;
};

/**
 * Returns the pixel configuration health for all supported countries (LB, AE).
 * Used by both the startup validator and the admin diagnostics endpoint.
 */
export function getPixelConfigHealth(): PixelCountryHealth[] {
  const countries: CountryKey[] = ["lb", "ae"];
  return countries.map((country) => {
    const cfg = configForCountry(country);
    const pixelIdVar =
      country === "lb"
        ? (process.env.FACEBOOK_PIXEL_ID_LB ?? process.env.VITE_FB_PIXEL_ID_LB)
        : (process.env.FACEBOOK_PIXEL_ID_AE ?? process.env.VITE_FB_PIXEL_ID_AE);
    const tokenVar =
      country === "lb"
        ? (process.env.FB_CONVERSIONS_TOKEN_LB ?? process.env.FACEBOOK_ACCESS_TOKEN)
        : (process.env.FB_CONVERSIONS_TOKEN_AE ?? process.env.FACEBOOK_ACCESS_TOKEN);
    return {
      country,
      pixelIdConfigured: Boolean(pixelIdVar),
      accessTokenConfigured: Boolean(tokenVar),
      ok: cfg !== null,
    };
  });
}

/**
 * Call at API server startup. Logs a structured WARN for each country whose
 * pixel ID or Conversions API access token env var is absent. The log entry
 * names the exact missing variables so ops can fix them without reading source.
 * Silent no-ops for a country are expected in development but should never
 * occur in production, where every missing var means zero CAPI events are sent.
 */
export function validateFbPixelEnv(): void {
  const health = getPixelConfigHealth();
  const missing = health.filter((h) => !h.ok);
  if (missing.length === 0) {
    logger.info(
      { countries: health.map((h) => h.country) },
      "fbConversions: all pixel configs present",
    );
    return;
  }
  for (const h of missing) {
    const vars: string[] = [];
    if (!h.pixelIdConfigured) {
      vars.push(
        h.country === "lb"
          ? "FACEBOOK_PIXEL_ID_LB (or VITE_FB_PIXEL_ID_LB)"
          : "FACEBOOK_PIXEL_ID_AE (or VITE_FB_PIXEL_ID_AE)",
      );
    }
    if (!h.accessTokenConfigured) {
      vars.push(
        h.country === "lb"
          ? "FB_CONVERSIONS_TOKEN_LB (or FACEBOOK_ACCESS_TOKEN)"
          : "FB_CONVERSIONS_TOKEN_AE (or FACEBOOK_ACCESS_TOKEN)",
      );
    }
    logger.warn(
      { country: h.country, missingVars: vars },
      `fbConversions: pixel config incomplete for ${h.country.toUpperCase()} — CAPI events will be silently dropped. Missing: ${vars.join(", ")}`,
    );
  }
}

type CAPIPurchaseParams = {
  eventId: string;
  value: number;
  currency: string;
  countryCode: string | null | undefined;
  userData?: CAPIUserData;
};

export async function sendCapiPurchase(params: CAPIPurchaseParams): Promise<void> {
  await sendCapiEvent({
    eventName: "Purchase",
    countryCode: params.countryCode,
    value: params.value,
    currency: params.currency,
    userData: params.userData,
    eventId: params.eventId,
  });
}
