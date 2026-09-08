import { createHash, randomBytes } from "crypto";
import { logger } from "./logger";

const GRAPH_API_VERSION = "v19.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

type CountryKey = "lb" | "ae";

/**
 * Maps Presentail country keys to ITU E.164 country dial codes (without the
 * leading `+`). Used to normalise local-format phone numbers before hashing.
 */
const COUNTRY_DIAL_CODES: Record<string, string> = {
  lb: "961",
  ae: "971",
  cy: "357",
};

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

/**
 * Derive the CountryKey from a known pixel ID so that `sendCapiEventByPixelId`
 * can apply country-specific phone normalisation. Returns null when the
 * pixel ID is unrecognised.
 */
function countryKeyForPixelId(pixelId: string): CountryKey | null {
  const lbPixelId = process.env.FACEBOOK_PIXEL_ID_LB ?? process.env.VITE_FB_PIXEL_ID_LB;
  const aePixelId = process.env.FACEBOOK_PIXEL_ID_AE ?? process.env.VITE_FB_PIXEL_ID_AE;
  if (lbPixelId && pixelId === lbPixelId) return "lb";
  if (aePixelId && pixelId === aePixelId) return "ae";
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

/**
 * Normalise a phone number to a digit-only E.164 string (without the leading
 * `+`) suitable for Meta's SHA-256 hashing requirement.
 *
 * Rules (applied in order):
 *  1. If the raw value starts with `+` it is already in international format —
 *     strip all non-digit characters and return.
 *  2. If the digits already start with the country's dial code, return as-is
 *     after stripping non-digits.
 *  3. If the digits start with `0` (local national prefix), remove it and
 *     prepend the country dial code.
 *  4. Otherwise prepend the country dial code directly.
 *  5. When no country key is available, strip non-digits and remove any
 *     leading zero so the value is at least consistent.
 */
function normalizePhoneDigits(phone: string, countryKey?: string | null): string {
  const trimmed = phone.trim();
  let digits = trimmed.replace(/\D/g, "");

  if (!digits) return "";

  // If the caller supplied an international format number (starts with +), the
  // digit string already contains the country code — return it unchanged.
  if (trimmed.startsWith("+")) return digits;

  const dialCode = countryKey ? (COUNTRY_DIAL_CODES[countryKey] ?? null) : null;

  if (dialCode) {
    if (digits.startsWith(dialCode)) return digits;  // already has dial code
    if (digits.startsWith("0")) digits = digits.slice(1);  // strip national trunk prefix
    return dialCode + digits;
  }

  // No country known — strip leading zero and return.
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

export type CAPIUserData = {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  /** 2-letter ISO country code (e.g. "lb", "ae") — will be hashed. */
  country?: string | null;
  /** Your internal customer ID — hashed as external_id before sending. */
  externalId?: string | null;
  fbp?: string | null;
  fbclid?: string | null;
  /**
   * Pre-formatted `fbc` value from the mobile app (`fb.1.<timestamp>.<fbclid>`).
   * When present, takes precedence over `fbclid` for the `fbc` CAPI field so
   * the correct cookie format is forwarded without server-side reformatting.
   */
  fbc?: string | null;
  /**
   * Real visitor IP address — sent RAW (not hashed) per Meta's CAPI spec.
   * Must be the original client IP, not the application server's address.
   * Supports both IPv4 and IPv6.
   */
  clientIpAddress?: string | null;
  /**
   * Browser User-Agent string — sent RAW (not hashed) per Meta's CAPI spec.
   */
  clientUserAgent?: string | null;
};

export type CAPIEventName =
  | "PageView"
  | "ViewContent"
  | "AddToCart"
  | "InitiateCheckout"
  | "AddPaymentInfo"
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
    /** Used for E.164 phone normalisation before hashing. */
    countryKey?: CountryKey | null;
  },
): Promise<void> {
  const eventTime = Math.floor(Date.now() / 1000);

  // Build user_data according to Meta's CAPI spec:
  //   - PII fields (em, ph, fn, ln, ct, country, external_id) must be SHA-256 hashed.
  //   - client_ip_address and client_user_agent must be sent RAW — do not hash.
  //   - fbp / fbc are sent as-is (opaque browser-set values).
  const userData: Record<string, string> = {};

  if (params.userData?.email) {
    userData.em = hashValue(params.userData.email);
  }
  if (params.userData?.phone) {
    const normalised = normalizePhoneDigits(params.userData.phone, params.countryKey);
    if (normalised) {
      userData.ph = createHash("sha256").update(normalised).digest("hex");
    }
  }
  if (params.userData?.firstName) {
    userData.fn = hashValue(params.userData.firstName);
  }
  if (params.userData?.lastName) {
    userData.ln = hashValue(params.userData.lastName);
  }
  if (params.userData?.city) {
    userData.ct = hashValue(params.userData.city);
  }
  if (params.userData?.country) {
    userData.country = hashValue(params.userData.country);
  }
  if (params.userData?.externalId) {
    userData.external_id = hashValue(params.userData.externalId);
  }
  if (params.userData?.fbp) {
    userData.fbp = params.userData.fbp;
  }
  // `fbc` (pre-formatted by the mobile client as `fb.1.<ts>.<fbclid>`) takes
  // precedence.  Fall back to the raw `fbclid` field used by the web pixel.
  if (params.userData?.fbc) {
    userData.fbc = params.userData.fbc;
  } else if (params.userData?.fbclid) {
    userData.fbc = params.userData.fbclid;
  }
  // Raw (unhashed) fields — must not be hashed per Meta CAPI spec.
  if (params.userData?.clientIpAddress) {
    userData.client_ip_address = params.userData.clientIpAddress;
  }
  if (params.userData?.clientUserAgent) {
    userData.client_user_agent = params.userData.clientUserAgent;
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
    user_data: userData,
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
    countryKey,
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

  const countryKey = countryKeyForPixelId(params.pixelId);
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
    countryKey,
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
  eventSourceUrl?: string | null;
};

export async function sendCapiPurchase(params: CAPIPurchaseParams): Promise<void> {
  const countryKey = countryCodeToKey(params.countryCode);
  if (!countryKey) return;

  const config = configForCountry(countryKey);
  if (!config) return;

  await sendCapiPayload(config, {
    eventName: "Purchase",
    eventId: params.eventId,
    actionSource: "website",
    value: params.value,
    currency: params.currency,
    userData: params.userData,
    eventSourceUrl: params.eventSourceUrl,
    countryKey,
  });
}
