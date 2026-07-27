// CyberSource Unified Checkout — REST helper
//
// Primitives:
//   generateCaptureContext   — POST /microform/v2/sessions
//   authorizeAndCapture      — POST /pts/v2/payments (capture:true)
//   setupPayerAuth           — POST /risk/v1/authentication-setups (3DS device fingerprint)
//   checkEnrollment          — POST /risk/v1/authentications (3DS enrol)
//   validatePayerAuth        — POST /risk/v1/authentication-results (3DS validate)
//
// Authentication: HTTP Signature (keyId / HMAC-SHA256).
// The Shared Secret Key is stored base64-encoded in the environment variable;
// it is decoded before use as the HMAC key (CyberSource requirement).
//
// Environment variables consumed here:
//   CYBERSOURCE_MERCHANT_ID           — Business Center Merchant ID
//   CYBERSOURCE_API_KEY_ID            — REST API key ID
//   CYBERSOURCE_SHARED_SECRET_KEY     — Base64-encoded HMAC-SHA256 shared secret
//   CYBERSOURCE_ENVIRONMENT           — "test" | "live" (default: "test")
//   CYBERSOURCE_GOOGLE_PAY_MERCHANT_ID — Google Pay Business Console merchant ID

import { createHmac, createHash } from "node:crypto";

// ── Base URL ─────────────────────────────────────────────────────────────────
export function getCybersourceBase(): string {
  const env = process.env.CYBERSOURCE_ENVIRONMENT ?? "test";
  return env === "live"
    ? "https://api.cybersource.com"
    : "https://apitest.cybersource.com";
}

// ── Credentials ──────────────────────────────────────────────────────────────
export function isCybersourceConfigured(): boolean {
  return !!(
    process.env.CYBERSOURCE_MERCHANT_ID &&
    process.env.CYBERSOURCE_API_KEY_ID &&
    process.env.CYBERSOURCE_SHARED_SECRET_KEY
  );
}

function getCredentials(): {
  merchantId: string;
  apiKeyId: string;
  sharedSecretKey: string;
} {
  const merchantId = process.env.CYBERSOURCE_MERCHANT_ID?.trim();
  const apiKeyId = process.env.CYBERSOURCE_API_KEY_ID?.trim();
  const sharedSecretKey = process.env.CYBERSOURCE_SHARED_SECRET_KEY?.trim();
  if (!merchantId || !apiKeyId || !sharedSecretKey) {
    throw new Error("CyberSource credentials not configured"); // i18n-ignore
  }
  return { merchantId, apiKeyId, sharedSecretKey };
}

// ── HTTP Signature auth ───────────────────────────────────────────────────────
// Builds the Authorization header for CyberSource REST APIs.
// See: https://developer.cybersource.com/api/developer-guides/dita-gettingstarted/authentication/GenerateHeader/httpSignatureAuthentication.html
//
// Implementation mirrors the official cybersource-rest-client Node.js SDK
// (SignatureParameterGenerator.js + HTTPSigToken.js) exactly:
//
//   keyId       = apiKeyId alone (the UUID) — NOT "merchantId/apiKeyId"
//   headers     = "host date request-target digest v-c-merchant-id"  (POST)
//               = "host date request-target v-c-merchant-id"         (GET)
//   signing str = host\ndate\nrequest-target\ndigest\nv-c-merchant-id
//                 — note: "request-target" without parentheses
//                 — v-c-date and Accept are NOT signed
//   algorithm   = HmacSHA256
//   secret      = BASE64-decoded shared secret key
function buildHeaders(opts: {
  method: string;
  path: string;
  body: string;
  merchantId: string;
  apiKeyId: string;
  sharedSecretKey: string;
  // Accept must be scoped per endpoint:
  //   - /microform/v2/sessions returns a plain JWT → "application/jwt"
  //     (sending application/json there causes HTTP 406).
  //   - /pts/v2/payments returns HAL+JSON → "application/hal+json"
  //     (sending application/jwt there makes CyberSource return HTTP 404
  //     "Resource not found" — verified empirically against production:
  //     the identical signed request succeeds with hal+json or no Accept).
  accept: string;
}): Record<string, string> {
  const base = getCybersourceBase();
  const host = new URL(base).hostname;
  const date = new Date().toUTCString();
  const { method, path, body, merchantId, apiKeyId, sharedSecretKey, accept } = opts;

  // body must be the exact same serialized string used for the outgoing request body.
  const bodyDigest = createHash("sha256").update(body, "utf8").digest("base64");
  const digest = `SHA-256=${bodyDigest}`;

  const secretBytes = Buffer.from(sharedSecretKey, "base64");
  const methodLower = method.toLowerCase();

  // POST/PUT signing string includes digest; GET does not.
  const isBodyMethod = methodLower === "post" || methodLower === "put" || methodLower === "patch";
  const signingParts = [
    `host: ${host}`,
    `date: ${date}`,
    `request-target: ${methodLower} ${path}`,   // no parentheses — matches SDK
    ...(isBodyMethod ? [`digest: ${digest}`] : []),
    `v-c-merchant-id: ${merchantId}`,            // always last, always signed
  ];
  const signingString = signingParts.join("\n");
  const signatureValue = createHmac("sha256", secretBytes).update(signingString, "utf8").digest("base64");

  const headersField = isBodyMethod
    ? "host date request-target digest v-c-merchant-id"
    : "host date request-target v-c-merchant-id";

  const signatureHeader =
    `keyid="${apiKeyId}", ` +              // keyid = UUID only, not "merchantId/keyId"
    `algorithm="HmacSHA256", ` +
    `headers="${headersField}", ` +
    `signature="${signatureValue}"`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: accept,
    Host: host,
    Date: date,
    "v-c-merchant-id": merchantId,
    // The SDK sends the auth as a bare "signature:" header (not "Authorization: Signature ...").
    signature: signatureHeader,
  };

  if (isBodyMethod) {
    headers["digest"] = digest;
  }

  return headers;
}

// ── generateCaptureContext ────────────────────────────────────────────────────
// Calls POST /microform/v2/sessions and returns the short-lived JWT (capture
// context) the client needs to initialise the CyberSource Microform SDK.
//
// The response body from CyberSource is a plain JWT string (not JSON).
export async function generateCaptureContext(opts: {
  targetOrigins: string[];
  totalAmount: string;
  currency: string;
  /** Additional payment types to include (e.g. ["GOOGLEPAY","APPLEPAY"]).
   *  Merged with the base ["CARD"] list; duplicates are removed. */
  extraPaymentTypes?: string[];
}): Promise<{ ok: true; captureContext: string } | { ok: false; message: string }> {
  const { targetOrigins, totalAmount, currency, extraPaymentTypes } = opts;
  const { merchantId, apiKeyId, sharedSecretKey } = getCredentials();
  const base = getCybersourceBase();
  const path = "/microform/v2/sessions";

  const baseTypes = ["CARD"]; // i18n-ignore — CARD is correct for Flex Microform V2
  const allowedPaymentTypes = extraPaymentTypes?.length
    ? [...new Set([...baseTypes, ...extraPaymentTypes])]
    : baseTypes;

  const payload = {
    clientVersion: "v2",
    targetOrigins,
    allowedCardNetworks: ["VISA", "MASTERCARD", "AMEX"], // i18n-ignore
    allowedPaymentTypes,
    orderInformation: {
      amountDetails: {
        totalAmount,
        currency,
      },
    },
  };

  // body is serialized ONCE here and reused for Digest, signature, and the outgoing request.
  const body = JSON.stringify(payload);
  // Microform V2 sessions returns a plain JWT — Accept must be application/jwt
  // (application/json causes HTTP 406 because the endpoint cannot produce JSON).
  const headers = buildHeaders({ method: "POST", path, body, merchantId, apiKeyId, sharedSecretKey, accept: "application/jwt" });

  // Sanitized diagnostic record (no secret values).
  const diag = {
    env: getCybersourceEnvironment(),
    host: new URL(base).hostname,
    path,
    merchantId,
    keyIdPrefix: apiKeyId.slice(0, 8) + "…",
    signedHeaders: "host date request-target digest v-c-merchant-id", // i18n-ignore
    contentType: headers["Content-Type"],
    accept: headers["Accept"],
    requestBody: body,
  };

  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers,
      body,
    });

    const rawBody = await res.text();

    // Collect response headers for the diagnostic record.
    const respHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => { respHeaders[k] = v; });

    if (!res.ok) {
      let errorMessage = `CyberSource capture context failed (HTTP ${res.status}): ${rawBody.slice(0, 500)}`; // i18n-ignore
      try {
        const errData = JSON.parse(rawBody) as any;
        const detail =
          errData?.message ??
          errData?.response?.rmsg ??
          errData?.errors?.[0]?.message ??
          errData?.reason;
        if (detail) errorMessage = `CyberSource ${res.status}: ${detail} — raw: ${rawBody.slice(0, 400)}`; // i18n-ignore
      } catch {
        // not JSON — raw body already included in errorMessage
      }
      return {
        ok: false,
        message: errorMessage,
        // Attach sanitized diagnostic for the caller to log.
        diag: { ...diag, httpStatus: res.status, respContentType: respHeaders["content-type"], respBody: rawBody.slice(0, 800) },
      } as any;
    }

    // Success — response is a plain JWT string or a JSON object with captureContext field.
    const captureContext = rawBody.trim().startsWith("{")
      ? (JSON.parse(rawBody) as any)?.captureContext ?? rawBody.trim()
      : rawBody.trim();

    if (!captureContext) {
      return { ok: false, message: "CyberSource returned an empty capture context" }; // i18n-ignore
    }

    return { ok: true, captureContext };
  } catch (err: any) {
    return { ok: false, message: err?.message ?? "CyberSource capture context request failed" }; // i18n-ignore
  }
}

// ── getMerchantId / getEnvironment ───────────────────────────────────────────
// Convenience accessors that return public-safe values from the credentials.
export function getCybersourceMerchantId(): string {
  return process.env.CYBERSOURCE_MERCHANT_ID?.trim() ?? "";
}

export function getCybersourceGooglePayMerchantId(): string {
  return process.env.CYBERSOURCE_GOOGLE_PAY_MERCHANT_ID?.trim() ?? "";
}

export function getCybersourceEnvironment(): "test" | "live" {
  return (process.env.CYBERSOURCE_ENVIRONMENT ?? "test") === "live" ? "live" : "test";
}

// ── Payer Authentication (3DS) ────────────────────────────────────────────────
// Three-step flow:
//   1. setupPayerAuth      — device fingerprint setup (POST /risk/v1/authentication-setups)
//   2. checkEnrollment     — 3DS enrolment check (POST /risk/v1/authentications)
//   3. validatePayerAuth   — post-challenge validation (POST /risk/v1/authentication-results)
//
// After a successful validate, the returned consumerAuthenticationInformation is
// passed to authorizeAndCapture / authorizeAndCaptureGooglePay / authorizeAndCaptureApplePay.

export type PayerAuthSetupResult =
  | { ok: true; accessToken: string; deviceDataCollectionUrl: string; referenceId: string }
  | { ok: false; message: string };

export type EnrollmentAction = "CONTINUE" | "CONSUMER_AUTHENTICATION_REQUIRED";

export type EnrollmentResult =
  | { ok: true; action: "CONTINUE"; authenticationTransactionId: string; consumerAuthInfo: Record<string, string | undefined> }
  | { ok: true; action: "CONSUMER_AUTHENTICATION_REQUIRED"; stepUpUrl: string; accessToken: string; authenticationTransactionId: string }
  | { ok: false; message: string; upstreamStatus?: string };

export type PayerAuthValidateResult =
  | {
      ok: true;
      cavv?: string;
      eci?: string;
      xid?: string;
      ucafAuthenticationData?: string;
      ucafCollectionIndicator?: string;
      paSpecificationVersion?: string;
      directoryServerTransactionId?: string;
      authenticationTransactionId?: string;
    }
  | { ok: false; message: string };

/** consumerAuthenticationInformation block passed to the charge payload after 3DS. */
export type ConsumerAuthInfo = {
  cavv?: string;
  eci?: string;
  xid?: string;
  ucafAuthenticationData?: string;
  ucafCollectionIndicator?: string;
  paSpecificationVersion?: string;
  directoryServerTransactionId?: string;
  authenticationTransactionId?: string;
};

/**
 * Step 1 — POST /risk/v1/authentication-setups
 * Returns an accessToken and deviceDataCollectionUrl for device fingerprinting.
 * The referenceId (deviceFingerprintId) from this response must be passed to checkEnrollment.
 */
export async function setupPayerAuth(opts: {
  orderId: string;
  transientTokenJwt: string;
}): Promise<PayerAuthSetupResult> {
  const { orderId, transientTokenJwt } = opts;
  const { merchantId, apiKeyId, sharedSecretKey } = getCredentials();
  const base = getCybersourceBase();
  const path = "/risk/v1/authentication-setups"; // i18n-ignore

  const payload = {
    clientReferenceInformation: { code: orderId },
    tokenInformation: { transientTokenJwt },
  };

  const body = JSON.stringify(payload);
  const headers = buildHeaders({ method: "POST", path, body, merchantId, apiKeyId, sharedSecretKey, accept: "application/hal+json;charset=utf-8" });

  try {
    const res = await fetch(`${base}${path}`, { method: "POST", headers, body });
    const rawBody = await res.text();
    let data: any = null;
    try { data = rawBody ? JSON.parse(rawBody) : null; } catch { data = null; }

    const info = data?.consumerAuthenticationInformation;
    if ((res.status === 201 || res.status === 200) && info?.accessToken) {
      return {
        ok: true,
        accessToken: info.accessToken,
        deviceDataCollectionUrl: info.deviceDataCollectionUrl ?? "",
        referenceId: info.referenceId ?? orderId,
      };
    }

    const message = data?.errorInformation?.message ?? data?.message ?? `CyberSource payer auth setup failed (HTTP ${res.status})`; // i18n-ignore
    return { ok: false, message };
  } catch (err: any) {
    return { ok: false, message: err?.message ?? "CyberSource payer auth setup request failed" }; // i18n-ignore
  }
}

/**
 * Step 2 — POST /risk/v1/authentications
 * Checks whether the card is enrolled in 3DS.
 * - action "CONTINUE"                        → frictionless; proceed to charge with consumerAuthInfo
 * - action "CONSUMER_AUTHENTICATION_REQUIRED" → open stepUpUrl in iframe for challenge
 */
export async function checkEnrollment(opts: {
  orderId: string;
  transientTokenJwt: string;
  totalAmount: string;
  currency: string;
  returnUrl: string;
  /** referenceId from setupPayerAuth (device fingerprint session ID). */
  referenceId?: string;
}): Promise<EnrollmentResult> {
  const { orderId, transientTokenJwt, totalAmount, currency, returnUrl, referenceId } = opts;
  const { merchantId, apiKeyId, sharedSecretKey } = getCredentials();
  const base = getCybersourceBase();
  const path = "/risk/v1/authentications"; // i18n-ignore

  const consumerAuthInfo: Record<string, string> = { returnUrl };
  if (referenceId) consumerAuthInfo.referenceId = referenceId;

  const payload = {
    clientReferenceInformation: { code: orderId },
    tokenInformation: { transientTokenJwt },
    orderInformation: { amountDetails: { totalAmount, currency } },
    consumerAuthenticationInformation: consumerAuthInfo,
  };

  const body = JSON.stringify(payload);
  const headers = buildHeaders({ method: "POST", path, body, merchantId, apiKeyId, sharedSecretKey, accept: "application/hal+json;charset=utf-8" });

  try {
    const res = await fetch(`${base}${path}`, { method: "POST", headers, body });
    const rawBody = await res.text();
    let data: any = null;
    try { data = rawBody ? JSON.parse(rawBody) : null; } catch { data = null; }

    const info = data?.consumerAuthenticationInformation ?? {};
    const status: string = data?.status ?? "";
    const authId: string = info.authenticationTransactionId ?? "";

    // Frictionless success statuses — proceed directly to charge
    if (
      (res.status === 201 || res.status === 200) &&
      (status === "AUTHENTICATION_SUCCESSFUL" || status === "AUTHENTICATION_ATTEMPTED" || status === "AUTHENTICATION_NOT_REQUIRED")
    ) {
      return { ok: true, action: "CONTINUE", authenticationTransactionId: authId, consumerAuthInfo: info };
    }

    // Challenge required — frontend must open stepUpUrl in an iframe
    if ((res.status === 201 || res.status === 200) && status === "PENDING_AUTHENTICATION") {
      return {
        ok: true,
        action: "CONSUMER_AUTHENTICATION_REQUIRED",
        stepUpUrl: info.stepUpUrl ?? "",
        accessToken: info.accessToken ?? "",
        authenticationTransactionId: authId,
      };
    }

    const message =
      data?.errorInformation?.message ??
      data?.message ??
      `3DS enrollment check failed: ${status || `HTTP ${res.status}`}`; // i18n-ignore
    return { ok: false, message, upstreamStatus: status };
  } catch (err: any) {
    return { ok: false, message: err?.message ?? "CyberSource enrollment check request failed" }; // i18n-ignore
  }
}

/**
 * Step 3 — POST /risk/v1/authentication-results
 * Called after the challenge iframe completes. Returns cavv/eci/xid
 * that must be included in the subsequent charge call.
 */
export async function validatePayerAuth(opts: {
  orderId: string;
  authenticationTransactionId: string;
}): Promise<PayerAuthValidateResult> {
  const { orderId, authenticationTransactionId } = opts;
  const { merchantId, apiKeyId, sharedSecretKey } = getCredentials();
  const base = getCybersourceBase();
  const path = "/risk/v1/authentication-results"; // i18n-ignore

  const payload = {
    clientReferenceInformation: { code: orderId },
    consumerAuthenticationInformation: { authenticationTransactionId },
  };

  const body = JSON.stringify(payload);
  const headers = buildHeaders({ method: "POST", path, body, merchantId, apiKeyId, sharedSecretKey, accept: "application/hal+json;charset=utf-8" });

  try {
    const res = await fetch(`${base}${path}`, { method: "POST", headers, body });
    const rawBody = await res.text();
    let data: any = null;
    try { data = rawBody ? JSON.parse(rawBody) : null; } catch { data = null; }

    if ((res.status === 201 || res.status === 200) && data?.consumerAuthenticationInformation) {
      const info = data.consumerAuthenticationInformation;
      return {
        ok: true,
        cavv: info.cavv,
        eci: info.eci ?? info.eciRaw,
        xid: info.xid,
        ucafAuthenticationData: info.ucafAuthenticationData,
        ucafCollectionIndicator: info.ucafCollectionIndicator,
        paSpecificationVersion: info.paSpecificationVersion,
        directoryServerTransactionId: info.directoryServerTransactionId,
        authenticationTransactionId: info.authenticationTransactionId ?? authenticationTransactionId,
      };
    }

    const message =
      data?.errorInformation?.message ??
      data?.message ??
      `Payer auth validation failed (HTTP ${res.status})`; // i18n-ignore
    return { ok: false, message };
  } catch (err: any) {
    return { ok: false, message: err?.message ?? "CyberSource payer auth validation request failed" }; // i18n-ignore
  }
}

// ── authorizeAndCapture ───────────────────────────────────────────────────────
// Calls POST /pts/v2/payments with capture:true.
// Uses the transient token JWT (from the client-side Microform tokenization)
// as the payment instrument — no raw PAN ever touches the server.
export type BillingDetails = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  postalCode?: string;
};

// Classification of a failed charge attempt so the route can distinguish a
// genuine card decline (shopper's problem) from a gateway/config error (our
// problem). "endpoint" specifically means CyberSource returned 404 for
// /pts/v2/payments with valid auth — i.e. the merchant account is not
// provisioned for the REST Payments API.
export type ChargeFailureKind =
  | "decline"
  | "validation"
  | "auth"
  | "endpoint"
  | "gateway"
  | "network";

export type ChargeFailure = {
  ok: false;
  kind: ChargeFailureKind;
  message: string;
  declineCode?: string;
  httpStatus?: number;
  rawBody?: string;
  // Sanitized diagnostics for structured logging — never contain PAN/CVC.
  responseContentType?: string;
  requestId?: string;
  details?: string;
  // The exact absolute URL of the outbound CyberSource request — lets logs
  // prove the request went to https://api.cybersource.com/pts/v2/payments
  // with no duplicated/prefixed path segments and the right host.
  requestUrl?: string;
  // The v-c-correlation-id response header — CyberSource's own request ID,
  // needed when escalating to CyberSource/BLOM support.
  correlationId?: string;
};

export type PayerAuthenticationData = {
  cavv?: string;
  eciRaw?: string;
  eci?: string;
  xid?: string;
  specificationVersion?: string;
  directoryServerTransactionId?: string;
  paSpecificationVersion?: string;
  authenticationTransactionId?: string;
  commerceIndicator?: string;
};

export async function authorizeAndCapture(opts: {
  transientTokenJwt: string;
  totalAmount: string;
  currency: string;
  orderId: string;
  billingDetails?: BillingDetails;
  payerAuthenticationData?: PayerAuthenticationData;
}): Promise<{ ok: true; paymentId: string; status: string } | ChargeFailure> {
  const { transientTokenJwt, totalAmount, currency, orderId, billingDetails, payerAuthenticationData } = opts;
  const { merchantId, apiKeyId, sharedSecretKey } = getCredentials();
  const base = getCybersourceBase();
  const path = "/pts/v2/payments";

  const billTo = billingDetails
    ? {
        firstName: billingDetails.firstName ?? "Guest", // i18n-ignore
        lastName: billingDetails.lastName ?? "Customer", // i18n-ignore
        email: billingDetails.email ?? "guest@presentail.com", // i18n-ignore
        address1: billingDetails.address ?? "N/A", // i18n-ignore
        locality: billingDetails.city ?? "Beirut", // i18n-ignore
        country: billingDetails.country ?? "LB", // i18n-ignore
        postalCode: billingDetails.postalCode ?? "00000",
        ...(billingDetails.phone ? { phoneNumber: billingDetails.phone } : {}),
      }
    : {
        firstName: "Guest", // i18n-ignore
        lastName: "Customer", // i18n-ignore
        email: "guest@presentail.com", // i18n-ignore
        address1: "N/A", // i18n-ignore
        locality: "Beirut", // i18n-ignore
        country: "LB", // i18n-ignore
        postalCode: "00000",
      };

  const payload: Record<string, unknown> = {
    clientReferenceInformation: {
      code: orderId,
    },
    processingInformation: {
      capture: true,
    },
    orderInformation: {
      amountDetails: {
        totalAmount,
        currency,
      },
      billTo,
    },
    tokenInformation: {
      transientTokenJwt,
    },
  };
  // When 3DS data is supplied (post Payer Authentication), include it in the
  // consumerAuthenticationInformation block so CyberSource can validate the
  // authentication result before authorizing. When absent, the payload is
  // identical to the non-3DS flow.
  if (payerAuthenticationData) {
    // eciRaw is the primary ECI field CyberSource expects; fall back to eci
    // when only the semantic field is present (frictionless path returns `eci`).
    const eciValue = payerAuthenticationData.eciRaw ?? payerAuthenticationData.eci;
    payload.consumerAuthenticationInformation = {
      ...(payerAuthenticationData.cavv !== undefined ? { cavv: payerAuthenticationData.cavv } : {}),
      ...(eciValue !== undefined ? { eciRaw: eciValue } : {}),
      ...(payerAuthenticationData.xid !== undefined ? { xid: payerAuthenticationData.xid } : {}),
      ...(payerAuthenticationData.specificationVersion !== undefined ? { specificationVersion: payerAuthenticationData.specificationVersion } : {}),
      ...(payerAuthenticationData.directoryServerTransactionId !== undefined ? { directoryServerTransactionId: payerAuthenticationData.directoryServerTransactionId } : {}),
      ...(payerAuthenticationData.paSpecificationVersion !== undefined ? { paSpecificationVersion: payerAuthenticationData.paSpecificationVersion } : {}),
      ...(payerAuthenticationData.authenticationTransactionId !== undefined ? { authenticationTransactionId: payerAuthenticationData.authenticationTransactionId } : {}),
      ...(payerAuthenticationData.commerceIndicator !== undefined ? { commerceIndicator: payerAuthenticationData.commerceIndicator } : {}),
    };
  }

  const body = JSON.stringify(payload);
  const headers = buildHeaders({ method: "POST", path, body, merchantId, apiKeyId, sharedSecretKey, accept: "application/hal+json;charset=utf-8" });

  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers,
      body,
    });

    const rawBody = await res.text();
    let data: any = null;
    try {
      data = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      data = null;
    }

    // CyberSource uses HTTP 201 for BOTH approved and declined authorisations —
    // a real card decline comes back as 201 with status "DECLINED". Only treat
    // 201 as success when the status is not a decline/error status.
    if (res.status === 201 && data?.id && data?.status !== "DECLINED" && data?.status !== "INVALID_REQUEST") {
      return { ok: true, paymentId: data.id, status: data.status ?? "AUTHORIZED_PENDING_REVIEW" }; // i18n-ignore
    }

    const reason = data?.errorInformation?.reason ?? data?.status ?? `HTTP ${res.status}`;
    const declineCode = typeof reason === "string" ? reason : undefined;
    const rawBodySlice = rawBody.slice(0, 800);
    const upstreamMessage: string | undefined = data?.errorInformation?.message ?? data?.message;
    // Sanitized diagnostics shared by every failure branch — safe to log
    // (never contains PAN, CVC, or the transient token).
    const failureDiag = {
      httpStatus: res.status,
      rawBody: rawBodySlice,
      responseContentType: res.headers.get("content-type") ?? undefined,
      requestId: typeof data?.id === "string" ? data.id : undefined,
      details: Array.isArray(data?.errorInformation?.details)
        ? JSON.stringify(data.errorInformation.details).slice(0, 400)
        : undefined,
      requestUrl: `${base}${path}`,
      correlationId: res.headers.get("v-c-correlation-id") ?? undefined,
    };

    // Genuine processor decline: HTTP 201 with DECLINED status.
    if (res.status === 201) {
      return {
        ok: false,
        kind: "decline",
        message: upstreamMessage ?? `Payment declined (${reason}).`, // i18n-ignore
        declineCode,
        ...failureDiag,
      };
    }

    // 404 from CyberSource for /pts/v2/payments. Do NOT infer/claim the
    // merchant account "is not enabled" — REST credentials and payment-product
    // provisioning are separate, and a 404 alone does not prove entitlement
    // failure. Report exactly what CyberSource returned; only surface an
    // entitlement claim if CyberSource's own response body states it.
    if (res.status === 404) {
      return {
        ok: false,
        kind: "endpoint",
        message:
          upstreamMessage ??
          `CyberSource returned HTTP 404 for POST ${base}${path}. Correlation ID: ${res.headers.get("v-c-correlation-id") ?? "none"}.`, // i18n-ignore
        declineCode,
        ...failureDiag,
      };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        kind: "auth",
        message: upstreamMessage ?? `CyberSource authentication failed (HTTP ${res.status}).`, // i18n-ignore
        declineCode,
        ...failureDiag,
      };
    }

    if (res.status === 400) {
      return {
        ok: false,
        // 400 INVALID_DATA on a transient-token charge usually means the token
        // was malformed/expired — still not a card decline.
        kind: "validation",
        message: upstreamMessage ?? `CyberSource rejected the payment request (${reason}).`, // i18n-ignore
        declineCode,
        ...failureDiag,
      };
    }

    return {
      ok: false,
      kind: "gateway",
      message: upstreamMessage ?? `CyberSource payment request failed (HTTP ${res.status}).`, // i18n-ignore
      declineCode,
      ...failureDiag,
    };
  } catch (err: any) {
    return { ok: false, kind: "network", message: err?.message ?? "CyberSource payment request failed" }; // i18n-ignore
  }
}

// ── authorizeAndCaptureGooglePay ──────────────────────────────────────────────
// Processes a Google Pay payment token through CyberSource's payments API.
// The token is returned by the Google Pay API after the shopper authorises
// the payment; it is already encrypted for the CyberSource gateway.
export async function authorizeAndCaptureGooglePay(opts: {
  googlePayToken: string; // JSON string from google.payments.api.PaymentsClient.loadPaymentData()
  totalAmount: string;
  currency: string;
  orderId: string;
  billingDetails?: BillingDetails;
  /** 3DS authentication data — included when available. */
  consumerAuthenticationInformation?: ConsumerAuthInfo;
}): Promise<{ ok: true; paymentId: string; status: string } | { ok: false; message: string; declineCode?: string }> {
  const { googlePayToken, totalAmount, currency, orderId, billingDetails, consumerAuthenticationInformation } = opts;
  const { merchantId, apiKeyId, sharedSecretKey } = getCredentials();
  const base = getCybersourceBase();
  const path = "/pts/v2/payments";

  const billTo = billingDetails
    ? {
        firstName: billingDetails.firstName ?? "Guest", // i18n-ignore
        lastName: billingDetails.lastName ?? "Customer", // i18n-ignore
        email: billingDetails.email ?? "guest@presentail.com", // i18n-ignore
        address1: billingDetails.address ?? "N/A", // i18n-ignore
        locality: billingDetails.city ?? "Beirut", // i18n-ignore
        country: billingDetails.country ?? "LB", // i18n-ignore
        postalCode: billingDetails.postalCode ?? "00000",
        ...(billingDetails.phone ? { phoneNumber: billingDetails.phone } : {}),
      }
    : {
        firstName: "Guest", // i18n-ignore
        lastName: "Customer", // i18n-ignore
        email: "guest@presentail.com", // i18n-ignore
        address1: "N/A", // i18n-ignore
        locality: "Beirut", // i18n-ignore
        country: "LB", // i18n-ignore
        postalCode: "00000",
      };

  const payload: Record<string, unknown> = {
    clientReferenceInformation: { code: orderId },
    processingInformation: {
      capture: true,
      paymentSolution: "012", // i18n-ignore — 012 = Google Pay
    },
    paymentInformation: {
      googlePay: { paymentData: googlePayToken },
    },
    orderInformation: {
      amountDetails: { totalAmount, currency },
      billTo,
    },
  };
  if (consumerAuthenticationInformation && Object.keys(consumerAuthenticationInformation).length > 0) {
    payload.consumerAuthenticationInformation = consumerAuthenticationInformation;
  }

  const body = JSON.stringify(payload);
  const headers = buildHeaders({ method: "POST", path, body, merchantId, apiKeyId, sharedSecretKey, accept: "application/hal+json;charset=utf-8" });

  try {
    const res = await fetch(`${base}${path}`, { method: "POST", headers, body });
    const rawBody = await res.text();
    let data: any = null;
    try { data = rawBody ? JSON.parse(rawBody) : null; } catch { data = null; }

    if (res.status === 201 && data?.id) {
      return { ok: true, paymentId: data.id, status: data.status ?? "AUTHORIZED_PENDING_REVIEW" }; // i18n-ignore
    }
    const reason = data?.errorInformation?.reason ?? data?.status ?? `HTTP ${res.status}`;
    const message = data?.errorInformation?.message ?? data?.message ?? `Payment declined (${reason}).`; // i18n-ignore
    return { ok: false, message, declineCode: typeof reason === "string" ? reason : undefined };
  } catch (err: any) {
    return { ok: false, message: err?.message ?? "CyberSource Google Pay request failed" }; // i18n-ignore
  }
}

// ── validateApplePayMerchant ──────────────────────────────────────────────────
// Called during the Apple Pay session's onvalidatemerchant event. Passes the
// Apple-supplied validation URL to CyberSource, which returns a merchant
// session object used to complete merchant validation. Requires the CyberSource
// account to have an Apple Pay merchant certificate registered in Business
// Center (Setup → Payment Configuration → Apple Pay).
export async function validateApplePayMerchant(opts: {
  validationURL: string;
  displayName: string;
  domainName: string;
}): Promise<{ ok: true; merchantSession: unknown } | { ok: false; message: string }> {
  const { validationURL, displayName, domainName } = opts;
  const { merchantId, apiKeyId, sharedSecretKey } = getCredentials();
  const base = getCybersourceBase();
  const path = "/pts/v2/wallets/applepay/sessions";

  const payload = {
    pointOfSaleInformation: {
      terminalId: domainName,
      validationUrl: validationURL,
    },
    merchantInformation: {
      merchantName: displayName,
    },
  };

  const body = JSON.stringify(payload);
  const headers = buildHeaders({ method: "POST", path, body, merchantId, apiKeyId, sharedSecretKey, accept: "application/hal+json;charset=utf-8" });

  try {
    const res = await fetch(`${base}${path}`, { method: "POST", headers, body });
    const rawBody = await res.text();
    let data: any = null;
    try { data = rawBody ? JSON.parse(rawBody) : null; } catch { data = null; }

    if (res.ok && data) {
      return { ok: true, merchantSession: data };
    }
    const message = data?.message ?? `CyberSource Apple Pay validation failed (HTTP ${res.status})`; // i18n-ignore
    return { ok: false, message };
  } catch (err: any) {
    return { ok: false, message: err?.message ?? "CyberSource Apple Pay validation request failed" }; // i18n-ignore
  }
}

// ── authorizeAndCaptureApplePay ───────────────────────────────────────────────
// Sends the Apple Pay payment token to CyberSource as fluid data.
// CyberSource decrypts the token using the Apple Pay merchant certificate
// registered in Business Center (Setup → Payment Configuration → Apple Pay).
export async function authorizeAndCaptureApplePay(opts: {
  applePayToken: string; // JSON-stringified ApplePayPaymentToken from onpaymentauthorized
  totalAmount: string;
  currency: string;
  orderId: string;
  billingDetails?: BillingDetails;
  /** 3DS authentication data — included when available. */
  consumerAuthenticationInformation?: ConsumerAuthInfo;
}): Promise<{ ok: true; paymentId: string; status: string } | { ok: false; message: string; declineCode?: string }> {
  const { applePayToken, totalAmount, currency, orderId, billingDetails, consumerAuthenticationInformation } = opts;
  const { merchantId, apiKeyId, sharedSecretKey } = getCredentials();
  const base = getCybersourceBase();
  const path = "/pts/v2/payments";

  const billTo = billingDetails
    ? {
        firstName: billingDetails.firstName ?? "Guest", // i18n-ignore
        lastName: billingDetails.lastName ?? "Customer", // i18n-ignore
        email: billingDetails.email ?? "guest@presentail.com", // i18n-ignore
        address1: billingDetails.address ?? "N/A", // i18n-ignore
        locality: billingDetails.city ?? "Beirut", // i18n-ignore
        country: billingDetails.country ?? "LB", // i18n-ignore
        postalCode: billingDetails.postalCode ?? "00000",
        ...(billingDetails.phone ? { phoneNumber: billingDetails.phone } : {}),
      }
    : {
        firstName: "Guest", // i18n-ignore
        lastName: "Customer", // i18n-ignore
        email: "guest@presentail.com", // i18n-ignore
        address1: "N/A", // i18n-ignore
        locality: "Beirut", // i18n-ignore
        country: "LB", // i18n-ignore
        postalCode: "00000",
      };

  const payload: Record<string, unknown> = {
    clientReferenceInformation: { code: orderId },
    processingInformation: {
      capture: true,
      paymentSolution: "001", // i18n-ignore — 001 = Apple Pay
    },
    paymentInformation: {
      fluidData: {
        value: Buffer.from(applePayToken).toString("base64"),
        descriptor: "APL_AK_CN", // i18n-ignore
        encoding: "Base64", // i18n-ignore
      },
    },
    orderInformation: {
      amountDetails: { totalAmount, currency },
      billTo,
    },
  };
  if (consumerAuthenticationInformation && Object.keys(consumerAuthenticationInformation).length > 0) {
    payload.consumerAuthenticationInformation = consumerAuthenticationInformation;
  }

  const body = JSON.stringify(payload);
  const headers = buildHeaders({ method: "POST", path, body, merchantId, apiKeyId, sharedSecretKey, accept: "application/hal+json;charset=utf-8" });

  try {
    const res = await fetch(`${base}${path}`, { method: "POST", headers, body });
    const rawBody = await res.text();
    let data: any = null;
    try { data = rawBody ? JSON.parse(rawBody) : null; } catch { data = null; }

    if (res.status === 201 && data?.id) {
      return { ok: true, paymentId: data.id, status: data.status ?? "AUTHORIZED_PENDING_REVIEW" }; // i18n-ignore
    }
    const reason = data?.errorInformation?.reason ?? data?.status ?? `HTTP ${res.status}`;
    const message = data?.errorInformation?.message ?? data?.message ?? `Payment declined (${reason}).`; // i18n-ignore
    return { ok: false, message, declineCode: typeof reason === "string" ? reason : undefined };
  } catch (err: any) {
    return { ok: false, message: err?.message ?? "CyberSource Apple Pay payment request failed" }; // i18n-ignore
  }
}
