/**
 * CyberSource Unified Checkout (UC) backend helpers.
 *
 * Covers:
 *   - Config validation (getCyberSourceConfig)
 *   - HTTP Signature authentication (signCyberSourceRequest)
 *   - Lebanon-USD routing gate (isCyberSourceRoute)
 *   - Low-level fetch helper (cyberSourceFetch)
 *
 * No secrets are ever returned to the client.
 */

import { createHmac, createHash } from "node:crypto";
import type { Request } from "express";
import { pickClientIp, resolveGeoCurrency } from "./geoCurrency";

// ── Config ────────────────────────────────────────────────────────────────────

export type CyberSourceConfig = {
  merchantId: string;
  apiKeyId: string;
  sharedSecretKey: string;
  baseUrl: string;
  environment: "test" | "production";
};

/**
 * Read CyberSource credentials from environment variables and return a typed
 * config object. Throws a descriptive error when any required var is missing
 * so misconfiguration is caught at request time and surfaced clearly in logs.
 */
export function getCyberSourceConfig(): CyberSourceConfig {
  const merchantId = process.env.CYBERSOURCE_MERCHANT_ID;
  const apiKeyId = process.env.CYBERSOURCE_API_KEY_ID;
  const sharedSecretKey = process.env.CYBERSOURCE_SHARED_SECRET_KEY;

  // Normalise the environment value: accept "production", "prod", "live",
  // "in prod", "in production" etc. as equivalent to "production".
  // Anything else (including the default empty/absent case) is "test".
  const rawEnv = (process.env.CYBERSOURCE_ENV ?? "").trim().toLowerCase();
  const env: "test" | "production" = /prod/.test(rawEnv) ? "production" : "test";

  const baseUrl =
    env === "production"
      ? process.env.CYBERSOURCE_BASE_URL_PROD
      : process.env.CYBERSOURCE_BASE_URL_TEST;

  const missing: string[] = [];
  if (!merchantId) missing.push("CYBERSOURCE_MERCHANT_ID");
  if (!apiKeyId) missing.push("CYBERSOURCE_API_KEY_ID");
  if (!sharedSecretKey) missing.push("CYBERSOURCE_SHARED_SECRET_KEY");
  if (!baseUrl) {
    missing.push(
      env === "production"
        ? "CYBERSOURCE_BASE_URL_PROD"
        : "CYBERSOURCE_BASE_URL_TEST",
    );
  }

  if (missing.length > 0) {
    throw new Error(
      `CyberSource not fully configured. Missing env vars: ${missing.join(", ")}`, // i18n-ignore
    );
  }

  return {
    merchantId: merchantId!,
    apiKeyId: apiKeyId!,
    sharedSecretKey: sharedSecretKey!,
    baseUrl: baseUrl!,
    environment: env,
  };
}

// ── HTTP Signature authentication ─────────────────────────────────────────────
//
// CyberSource REST APIs require HTTP Signature auth per the spec documented at:
// https://developer.cybersource.com/api/developer-guides/dita-gettingstarted/authentication/GenerateHeader/httpSignatureAuthentication.html
//
// The signature covers: host, date, (request-target), and — for POST — digest.
// Uses Node's built-in `crypto` module only; no extra packages.

/**
 * Build the HTTP headers required for CyberSource HTTP Signature authentication.
 *
 * @param method  HTTP verb in UPPERCASE (e.g. "POST", "GET").
 * @param path    Request path including query string (e.g. "/pts/v2/payments").
 * @param body    Serialised request body (pass null/"" for GET/DELETE).
 * @param config  CyberSource credentials from getCyberSourceConfig().
 * @returns       An object of header name → value pairs to merge into the request.
 */
export function signCyberSourceRequest(
  method: string,
  path: string,
  body: string | null,
  config: CyberSourceConfig,
): Record<string, string> {
  const verb = method.toLowerCase();
  const date = new Date().toUTCString();

  // Extract host from baseUrl (no scheme, no trailing slash).
  const hostMatch = config.baseUrl.match(/^https?:\/\/([^/]+)/);
  const host = hostMatch ? hostMatch[1] : config.baseUrl;

  // Build the digest header for POST/PUT (SHA-256 over the raw body).
  const hasBody = verb === "post" || verb === "put" || verb === "patch";
  const digestValue = hasBody
    ? "SHA-256=" +
      createHash("sha256")
        .update(body ?? "")
        .digest("base64")
    : null;

  // Compose the signing string.  CyberSource requires these specific pseudo-
  // headers in this order; the order in the Signature header must match.
  const signingParts: [string, string][] = [
    ["host", host],
    ["date", date],
    ["(request-target)", `${verb} ${path}`],
  ];
  if (digestValue) {
    signingParts.push(["digest", digestValue]);
  }
  signingParts.push(["v-c-merchant-id", config.merchantId]);

  const signingString = signingParts
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  const headerNames = signingParts.map(([k]) => k).join(" ");

  const signatureBytes = createHmac("sha256", Buffer.from(config.sharedSecretKey, "base64"))
    .update(signingString)
    .digest("base64");

  const signatureHeader = [
    `keyid="${config.apiKeyId}"`,
    `algorithm="HmacSHA256"`,
    `headers="${headerNames}"`,
    `signature="${signatureBytes}"`,
  ].join(", ");

  const headers: Record<string, string> = {
    Host: host,
    Date: date,
    Signature: signatureHeader,
    "v-c-merchant-id": config.merchantId,
  };
  if (digestValue) {
    headers["Digest"] = digestValue;
  }
  return headers;
}

// ── Low-level fetch helper ────────────────────────────────────────────────────

export type CyberSourceFetchResult = {
  status: number;
  /** Parsed JSON body, or null when the response is empty or non-JSON. */
  data: unknown;
  /** Raw response body text (always present). Used for plain-text JWT responses
   *  such as the capture-context endpoint which returns the JWT directly. */
  raw: string;
};

/**
 * Make an authenticated HTTP request to the CyberSource REST API.
 * Applies HTTP Signature headers and returns both the raw body text and
 * the parsed JSON body (null when the body is not valid JSON, e.g. a JWT).
 * Throws on network errors.
 */
export async function cyberSourceFetch(
  method: string,
  path: string,
  body: object | null,
  config: CyberSourceConfig,
): Promise<CyberSourceFetchResult> {
  const serialised = body ? JSON.stringify(body) : null;
  const authHeaders = signCyberSourceRequest(method, path, serialised, config);

  const url = `${config.baseUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json;charset=utf-8",
      Accept: "application/hal+json;charset=utf-8",
      ...authHeaders,
    },
    ...(serialised ? { body: serialised } : {}),
  });

  const raw = await res.text();

  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    // Non-JSON response (e.g. the capture-context JWT which is plain text).
    data = null;
  }

  return { status: res.status, data, raw };
}

// ── CyberSource authorization status ─────────────────────────────────────────

/**
 * CyberSource Payments API statuses that indicate a successfully authorized
 * payment. AUTHORIZED_PENDING_REVIEW requires ops attention but the authorization
 * itself succeeded and the hold has been placed on the card.
 */
export const CS_AUTHORIZED_STATUSES = new Set([
  "AUTHORIZED",
  "AUTHORIZED_PENDING_REVIEW",
]);

// ── Lebanon-USD routing gate ───────────────────────────────────────────────────

export type CyberSourceRouteResult = {
  eligible: boolean;
  countryCode: string | null;
  reason:
    | "eligible"
    | "private-ip"
    | "wrong-country"
    | "wrong-currency"
    | "wrong-currency-and-country";
};

/**
 * Determine whether a request should be routed to CyberSource (as opposed to
 * Stripe). CyberSource is only offered when ALL of the following hold:
 *   1. The caller's IP geolocates to Lebanon (countryCode === "LB").
 *   2. The requested currency is USD.
 *
 * Private/loopback IPs (dev environments) are treated as ineligible because
 * they cannot be geolocated to Lebanon.
 *
 * Called independently on both capture-context and authorize so neither
 * endpoint can be reached by bypassing the other.
 */
export async function isCyberSourceRoute(
  req: Request,
  currency: string,
): Promise<CyberSourceRouteResult> {
  const xff = req.headers["x-forwarded-for"];
  const fallbackIp = (req.ip ?? "").toString();
  const clientIp = pickClientIp(xff, fallbackIp);

  const geoResult = await resolveGeoCurrency(clientIp);

  // Private/loopback IPs → source is "private-ip"; country is null.
  if (geoResult.source === "private-ip") {
    return { eligible: false, countryCode: null, reason: "private-ip" };
  }

  const isLb = geoResult.countryCode === "LB";
  const isUsd = currency.trim().toUpperCase() === "USD";

  if (isLb && isUsd) {
    return { eligible: true, countryCode: "LB", reason: "eligible" };
  }

  if (!isLb && !isUsd) {
    return {
      eligible: false,
      countryCode: geoResult.countryCode,
      reason: "wrong-currency-and-country",
    };
  }
  if (!isLb) {
    return {
      eligible: false,
      countryCode: geoResult.countryCode,
      reason: "wrong-country",
    };
  }
  return {
    eligible: false,
    countryCode: geoResult.countryCode,
    reason: "wrong-currency",
  };
}

// ── Required env-var manifest ─────────────────────────────────────────────────

export const CYBERSOURCE_REQUIRED_ENV_VARS = [
  "CYBERSOURCE_MERCHANT_ID",
  "CYBERSOURCE_API_KEY_ID",
  "CYBERSOURCE_SHARED_SECRET_KEY",
  "CYBERSOURCE_BASE_URL_TEST",
  "CYBERSOURCE_BASE_URL_PROD",
  "CYBERSOURCE_ENV",
  // CYBERSOURCE_ALLOWED_ORIGINS is required for Microform CORS and for the
  // 3DS return postMessage target — the capture-context endpoint hard-fails
  // (503) when it is absent, so treat it as required here.
  "CYBERSOURCE_ALLOWED_ORIGINS",
  // CYBERSOURCE_3DS_RETURN_URL is the public URL the ACS (card issuer) will POST to
  // after a 3DS challenge. Must be set when the API server is on a different origin
  // than the frontend. If absent, the server falls back to constructing the URL from
  // CYBERSOURCE_ALLOWED_ORIGINS[0] (works when API is behind the same reverse proxy).
  "CYBERSOURCE_3DS_RETURN_URL",
] as const;
