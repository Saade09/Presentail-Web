// CyberSource Payer Authentication (EMV 3-D Secure 2.x) — REST helper
//
// Implements three Payer Auth stages via Cruise Control (Cardinal Commerce):
//   setupPayerAuth       — POST /risk/v1/authentication-setups
//   checkEnrollment      — POST /risk/v1/authentications
//   validateAuthentication — POST /risk/v1/authentication-results
//
// Authentication: HTTP Basic (Base64("API_IDENTIFIER:API_KEY")), plus
// OrgUnitId header set to ORG_UNIT_ID.
//
// Environment variables consumed here:
//   CYBERSOURCE_PA_API_IDENTIFIER  — Cruise Control API Identifier
//   CYBERSOURCE_PA_API_KEY         — Cruise Control API Key (secret)
//   CYBERSOURCE_PA_ORG_UNIT_ID     — Cruise Control Org Unit ID
//
// getCybersourceBase() is used for the host so test/live switches are shared
// with the main CyberSource REST credential helpers.

import { getCybersourceBase } from "./cybersource";

// ── PA credential helpers ────────────────────────────────────────────────────

export function isPaConfigured(): boolean {
  return !!(
    process.env.CYBERSOURCE_PA_API_IDENTIFIER &&
    process.env.CYBERSOURCE_PA_API_KEY &&
    process.env.CYBERSOURCE_PA_ORG_UNIT_ID
  );
}

export function isPayerAuthEnabled(): boolean {
  return isPaConfigured() && process.env.CYBERSOURCE_PAYER_AUTH_ENABLED === "true";
}

function getPaCredentials(): { apiIdentifier: string; apiKey: string; orgUnitId: string } {
  const apiIdentifier = process.env.CYBERSOURCE_PA_API_IDENTIFIER?.trim();
  const apiKey = process.env.CYBERSOURCE_PA_API_KEY?.trim();
  const orgUnitId = process.env.CYBERSOURCE_PA_ORG_UNIT_ID?.trim();
  if (!apiIdentifier || !apiKey || !orgUnitId) {
    throw new Error("CyberSource Payer Auth credentials not configured"); // i18n-ignore
  }
  return { apiIdentifier, apiKey, orgUnitId };
}

function buildPaHeaders(credentials: { apiIdentifier: string; apiKey: string; orgUnitId: string }): Record<string, string> {
  const { apiIdentifier, apiKey, orgUnitId } = credentials;
  // Cruise Control JWT: HTTP Basic using API Identifier + API Key, Base64-encoded.
  const encoded = Buffer.from(`${apiIdentifier}:${apiKey}`).toString("base64");
  return {
    "Content-Type": "application/json", // i18n-ignore
    Accept: "application/json", // i18n-ignore
    Authorization: `Basic ${encoded}`, // i18n-ignore
    OrgUnitId: orgUnitId,
  };
}

// ── Request/response types ───────────────────────────────────────────────────

export type PayerAuthSetupResult = {
  ok: true;
  accessToken: string;
  deviceDataCollectionUrl: string;
  referenceId: string;
} | {
  ok: false;
  code: "pa_setup_error";
  message: string;
};

export type PayerAuthBrowserInfo = {
  javaEnabled?: boolean;
  javaScriptEnabled?: boolean;
  acceptHeaders?: string;
  colorDepth?: string;
  screenHeight?: string;
  screenWidth?: string;
  timeZone?: string;
  userAgentBrowserValue?: string;
};

export type PayerAuthBillTo = {
  firstName?: string;
  lastName?: string;
  email?: string;
  address1?: string;
  locality?: string;
  country?: string;
  postalCode?: string;
};

// Frictionless: enrollment succeeded, no challenge needed.
export type EnrollmentFrictionless = {
  ok: true;
  enrolled: false;
  authenticationTransactionId: string;
  eci?: string;
  cavv?: string;
  xid?: string;
  specificationVersion?: string;
  directoryServerTransactionId?: string;
  paSpecificationVersion?: string;
};

// Challenge required: frontend must show the step-up iframe.
export type EnrollmentChallenge = {
  ok: true;
  enrolled: true;
  stepUpUrl: string;
  accessToken: string;
  authenticationTransactionId: string;
};

export type PayerAuthEnrollmentResult =
  | EnrollmentFrictionless
  | EnrollmentChallenge
  | { ok: false; code: "pa_enrollment_error"; message: string };

export type PayerAuthValidationResult = {
  ok: true;
  cavv?: string;
  eci?: string;
  eciRaw?: string;
  xid?: string;
  specificationVersion?: string;
  directoryServerTransactionId?: string;
  paSpecificationVersion?: string;
  authenticationTransactionId?: string;
  commerceIndicator?: string;
} | {
  ok: false;
  code: "pa_validation_error";
  message: string;
};

// ── setupPayerAuth ────────────────────────────────────────────────────────────
// POST /risk/v1/authentication-setups
// Returns the device-data-collection parameters for the Sensor SDK iframe.
export async function setupPayerAuth(opts: {
  transientTokenJwt: string;
  orderId: string;
}): Promise<PayerAuthSetupResult> {
  const { transientTokenJwt, orderId } = opts;
  let credentials: ReturnType<typeof getPaCredentials>;
  try {
    credentials = getPaCredentials();
  } catch (err: any) {
    return { ok: false, code: "pa_setup_error", message: err?.message ?? "PA credentials not configured" }; // i18n-ignore
  }

  const base = getCybersourceBase();
  const path = "/risk/v1/authentication-setups";
  const headers = buildPaHeaders(credentials);

  const payload = {
    clientReferenceInformation: { code: orderId },
    tokenInformation: { transientToken: transientTokenJwt },
  };

  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const rawBody = await res.text();
    let data: any = null;
    try { data = rawBody ? JSON.parse(rawBody) : null; } catch { data = null; }

    if (!res.ok) {
      const msg = data?.message ?? data?.errorInformation?.message ?? `CyberSource PA setup failed (HTTP ${res.status})`; // i18n-ignore
      return { ok: false, code: "pa_setup_error", message: msg };
    }

    const accessToken: string = data?.consumerAuthenticationInformation?.accessToken ?? "";
    const deviceDataCollectionUrl: string = data?.consumerAuthenticationInformation?.deviceDataCollectionUrl ?? "";
    const referenceId: string = data?.consumerAuthenticationInformation?.referenceId ?? "";

    if (!accessToken || !deviceDataCollectionUrl) {
      return {
        ok: false,
        code: "pa_setup_error",
        message: "CyberSource PA setup returned incomplete device data collection info", // i18n-ignore
      };
    }

    return { ok: true, accessToken, deviceDataCollectionUrl, referenceId };
  } catch (err: any) {
    return { ok: false, code: "pa_setup_error", message: err?.message ?? "CyberSource PA setup request failed" }; // i18n-ignore
  }
}

// ── checkEnrollment ───────────────────────────────────────────────────────────
// POST /risk/v1/authentications
// Returns either a frictionless result (no challenge) or a challenge descriptor
// (step-up URL + accessToken for the iframe).
export async function checkEnrollment(opts: {
  transientTokenJwt: string;
  referenceId: string;
  amount: string;
  currency: string;
  billTo?: PayerAuthBillTo;
  browserInfo?: PayerAuthBrowserInfo;
  orderId: string;
  returnUrl: string;
}): Promise<PayerAuthEnrollmentResult> {
  const { transientTokenJwt, referenceId, amount, currency, billTo, browserInfo, orderId, returnUrl } = opts;
  let credentials: ReturnType<typeof getPaCredentials>;
  try {
    credentials = getPaCredentials();
  } catch (err: any) {
    return { ok: false, code: "pa_enrollment_error", message: err?.message ?? "PA credentials not configured" }; // i18n-ignore
  }

  const base = getCybersourceBase();
  const path = "/risk/v1/authentications";
  const headers = buildPaHeaders(credentials);

  const payload: Record<string, any> = {
    clientReferenceInformation: { code: orderId },
    orderInformation: {
      amountDetails: { totalAmount: amount, currency },
      ...(billTo ? { billTo } : {}),
    },
    tokenInformation: { transientToken: transientTokenJwt },
    consumerAuthenticationInformation: {
      referenceId,
      returnUrl,
      ...(browserInfo ? {
        browserJavaEnabled: browserInfo.javaEnabled ?? false,
        browserJavascriptEnabled: browserInfo.javaScriptEnabled ?? true,
        browserAcceptHeader: browserInfo.acceptHeaders ?? "application/json", // i18n-ignore
        browserColorDepth: browserInfo.colorDepth ?? "24",
        browserScreenHeight: browserInfo.screenHeight ?? "1080",
        browserScreenWidth: browserInfo.screenWidth ?? "1920",
        browserTimeZone: browserInfo.timeZone ?? "0",
        browserUserAgent: browserInfo.userAgentBrowserValue ?? "",
      } : {}),
    },
  };

  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const rawBody = await res.text();
    let data: any = null;
    try { data = rawBody ? JSON.parse(rawBody) : null; } catch { data = null; }

    if (!res.ok) {
      const msg = data?.message ?? data?.errorInformation?.message ?? `CyberSource PA enrollment failed (HTTP ${res.status})`; // i18n-ignore
      return { ok: false, code: "pa_enrollment_error", message: msg };
    }

    const caInfo = data?.consumerAuthenticationInformation ?? {};
    const status: string = (data?.status ?? "").toUpperCase();
    const authTxnId: string = caInfo.authenticationTransactionId ?? "";

    // PENDING_AUTHENTICATION = challenge required (step-up iframe).
    if (status === "PENDING_AUTHENTICATION") {
      const stepUpUrl: string = caInfo.stepUpUrl ?? "";
      const accessToken: string = caInfo.accessToken ?? "";
      if (!stepUpUrl || !accessToken) {
        return {
          ok: false,
          code: "pa_enrollment_error",
          message: "CyberSource PA enrollment returned PENDING_AUTHENTICATION but no stepUpUrl or accessToken", // i18n-ignore
        };
      }
      return {
        ok: true,
        enrolled: true,
        stepUpUrl,
        accessToken,
        authenticationTransactionId: authTxnId,
      };
    }

    // Explicit failure / cancellation statuses must NOT be treated as frictionless
    // success — doing so would permit a charge after failed authentication.
    // These statuses must bubble up as an enrollment error so the frontend can
    // surface an appropriate message and the charge endpoint is never reached.
    const FAILED_STATUSES = new Set([
      "AUTHENTICATION_FAILED",
      "AUTHENTICATION_COULD_NOT_BE_PERFORMED",
      "AUTHENTICATION_REJECTED",
    ]);
    if (FAILED_STATUSES.has(status)) {
      return {
        ok: false,
        code: "pa_enrollment_error",
        message: `CyberSource PA enrollment returned authentication failure status: ${status}`, // i18n-ignore
      };
    }

    // Frictionless success path: AUTHENTICATION_SUCCESSFUL, AUTHENTICATION_COMPLETED,
    // NOT_ENROLLED (issuer has not enabled 3DS — ECI/CAVV may be empty, which is
    // acceptable for that cardholder population).
    // Any other unrecognised status is treated as frictionless but without proof,
    // which lets the downstream pa_required guard on /charge catch it when enabled.
    return {
      ok: true,
      enrolled: false,
      authenticationTransactionId: authTxnId,
      eci: caInfo.eci ?? caInfo.eciRaw ?? undefined,
      cavv: caInfo.cavv ?? undefined,
      xid: caInfo.xid ?? undefined,
      specificationVersion: caInfo.specificationVersion ?? undefined,
      directoryServerTransactionId: caInfo.directoryServerTransactionId ?? undefined,
      paSpecificationVersion: caInfo.paSpecificationVersion ?? undefined,
    };
  } catch (err: any) {
    return { ok: false, code: "pa_enrollment_error", message: err?.message ?? "CyberSource PA enrollment request failed" }; // i18n-ignore
  }
}

// ── validateAuthentication ────────────────────────────────────────────────────
// POST /risk/v1/authentication-results
// Called after the challenge iframe completes. Returns the 3DS metadata fields
// needed for the authorizeAndCapture consumerAuthenticationInformation block.
export async function validateAuthentication(opts: {
  authenticationTransactionId: string;
}): Promise<PayerAuthValidationResult> {
  const { authenticationTransactionId } = opts;
  let credentials: ReturnType<typeof getPaCredentials>;
  try {
    credentials = getPaCredentials();
  } catch (err: any) {
    return { ok: false, code: "pa_validation_error", message: err?.message ?? "PA credentials not configured" }; // i18n-ignore
  }

  const base = getCybersourceBase();
  const path = "/risk/v1/authentication-results";
  const headers = buildPaHeaders(credentials);

  const payload = {
    consumerAuthenticationInformation: { authenticationTransactionId },
  };

  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const rawBody = await res.text();
    let data: any = null;
    try { data = rawBody ? JSON.parse(rawBody) : null; } catch { data = null; }

    if (!res.ok) {
      const msg = data?.message ?? data?.errorInformation?.message ?? `CyberSource PA validation failed (HTTP ${res.status})`; // i18n-ignore
      return { ok: false, code: "pa_validation_error", message: msg };
    }

    const caInfo = data?.consumerAuthenticationInformation ?? {};

    return {
      ok: true,
      cavv: caInfo.cavv ?? undefined,
      eci: caInfo.eci ?? undefined,
      eciRaw: caInfo.eciRaw ?? undefined,
      xid: caInfo.xid ?? undefined,
      specificationVersion: caInfo.specificationVersion ?? undefined,
      directoryServerTransactionId: caInfo.directoryServerTransactionId ?? undefined,
      paSpecificationVersion: caInfo.paSpecificationVersion ?? undefined,
      authenticationTransactionId: caInfo.authenticationTransactionId ?? authenticationTransactionId,
      commerceIndicator: caInfo.commerceIndicator ?? undefined,
    };
  } catch (err: any) {
    return { ok: false, code: "pa_validation_error", message: err?.message ?? "CyberSource PA validation request failed" }; // i18n-ignore
  }
}
