// CyberSource Unified Checkout — REST helper
//
// Implements two primitives:
//   generateCaptureContext   — POST /microform/v2/sessions
//   authorizeAndCapture      — POST /pts/v2/payments (capture:true)
//
// Authentication: HTTP Signature (keyId / HMAC-SHA256).
// The Shared Secret Key is stored base64-encoded in the environment variable;
// it is decoded before use as the HMAC key (CyberSource requirement).
//
// Environment variables consumed here:
//   CYBERSOURCE_MERCHANT_ID      — Business Center Merchant ID
//   CYBERSOURCE_API_KEY_ID       — REST API key ID
//   CYBERSOURCE_SHARED_SECRET_KEY — Base64-encoded HMAC-SHA256 shared secret
//   CYBERSOURCE_ENVIRONMENT      — "test" | "live" (default: "test")

import { createHmac, createHash } from "node:crypto";

// ── Base URL ─────────────────────────────────────────────────────────────────
function getCybersourceBase(): string {
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
// Signed headers: host date (request-target) digest v-c-date
// Algorithm: HmacSHA256
// The shared secret is BASE64-decoded before use as the HMAC key.
// IMPORTANT: Must be sent as "Authorization: Signature keyId=..." not "Signature: keyId=..."
function buildHeaders(opts: {
  method: string;
  path: string;
  body: string;
  merchantId: string;
  apiKeyId: string;
  sharedSecretKey: string;
}): Record<string, string> {
  const base = getCybersourceBase();
  const url = new URL(base);
  const host = url.hostname;
  const date = new Date().toUTCString();
  const { method, path, body, merchantId, apiKeyId, sharedSecretKey } = opts;

  const bodyDigest = createHash("sha256").update(body, "utf8").digest("base64");
  const digest = `SHA-256=${bodyDigest}`;

  const secretBytes = Buffer.from(sharedSecretKey, "base64");
  const signingString = [
    `host: ${host}`,
    `date: ${date}`,
    `(request-target): ${method.toLowerCase()} ${path}`,
    `digest: ${digest}`,
    `v-c-date: ${date}`,
  ].join("\n");
  const signatureValue = createHmac("sha256", secretBytes).update(signingString, "utf8").digest("base64");
  const signatureHeader =
    `keyId="${merchantId}/${apiKeyId}", ` +
    `algorithm="HmacSHA256", ` +
    `headers="host date (request-target) digest v-c-date", ` +
    `signature="${signatureValue}"`;

  return {
    "Content-Type": "application/json",
    Host: host,
    Date: date,
    "v-c-date": date,
    Digest: digest,
    Authorization: `Signature ${signatureHeader}`,
    "v-c-merchant-id": merchantId,
  };
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
}): Promise<{ ok: true; captureContext: string } | { ok: false; message: string }> {
  const { targetOrigins, totalAmount, currency } = opts;
  const { merchantId, apiKeyId, sharedSecretKey } = getCredentials();
  const base = getCybersourceBase();
  const path = "/microform/v2/sessions";

  const payload = {
    clientVersion: "v2",
    targetOrigins,
    allowedCardNetworks: ["VISA", "MASTERCARD", "AMEX"], // i18n-ignore
    allowedPaymentTypes: ["PANENTRY"], // i18n-ignore
    captureMandate: {
      billingType: "FULL", // i18n-ignore
      requestEmail: false,
      requestPhone: false,
      requestShipping: false,
      showAcceptPaymentTerms: false,
    },
    orderInformation: {
      amountDetails: {
        totalAmount,
        currency,
      },
    },
  };

  const body = JSON.stringify(payload);
  const headers = buildHeaders({ method: "POST", path, body, merchantId, apiKeyId, sharedSecretKey });

  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers,
      body,
    });

    const rawBody = await res.text();

    if (!res.ok) {
      // Include the raw body in the message so the caller can log it for diagnosis.
      let errorMessage = `CyberSource capture context failed (HTTP ${res.status}): ${rawBody.slice(0, 500)}`; // i18n-ignore
      try {
        const errData = JSON.parse(rawBody) as any;
        // Handle both standard CyberSource format and gateway proxy formats
        const detail =
          errData?.message ??
          errData?.response?.rmsg ??
          errData?.errors?.[0]?.message ??
          errData?.reason;
        if (detail) errorMessage = `CyberSource ${res.status}: ${detail} — raw: ${rawBody.slice(0, 400)}`; // i18n-ignore
      } catch {
        // not JSON
      }
      return { ok: false, message: errorMessage };
    }

    // Response is a plain JWT string
    const captureContext = rawBody.trim();
    if (!captureContext) {
      return { ok: false, message: "CyberSource returned an empty capture context" }; // i18n-ignore
    }

    return { ok: true, captureContext };
  } catch (err: any) {
    return { ok: false, message: err?.message ?? "CyberSource capture context request failed" }; // i18n-ignore
  }
}

// ── isCybersourceWalletsEnabled ───────────────────────────────────────────────
// Returns true when CYBERSOURCE_WALLETS_ENABLED is not explicitly disabled.
// Defaults to false (opt-in) so existing deployments are unaffected until the
// merchant Apple Pay certificate is provisioned.
export function isCybersourceWalletsEnabled(): boolean {
  const v = process.env.CYBERSOURCE_WALLETS_ENABLED ?? "0";
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
}

// ── generateWalletCaptureContext ──────────────────────────────────────────────
// Calls POST /microform/v2/sessions with allowedPaymentTypes APPLEPAY and
// GOOGLEPAY.  This is intentionally separate from generateCaptureContext (which
// uses PANENTRY) so neither path can interfere with the other.
//
// Guarded by CYBERSOURCE_WALLETS_ENABLED.  Returns { ok: false } when wallets
// are not enabled so the caller can hide the buttons without an error.
export async function generateWalletCaptureContext(opts: {
  targetOrigins: string[];
  totalAmount: string;
  currency: string;
}): Promise<{ ok: true; captureContext: string } | { ok: false; message: string }> {
  if (!isCybersourceWalletsEnabled()) {
    return { ok: false, message: "CyberSource wallets not enabled" }; // i18n-ignore
  }
  const { targetOrigins, totalAmount, currency } = opts;
  const { merchantId, apiKeyId, sharedSecretKey } = getCredentials();
  const base = getCybersourceBase();
  const path = "/microform/v2/sessions";

  const payload = {
    clientVersion: "v2",
    targetOrigins,
    allowedCardNetworks: ["VISA", "MASTERCARD", "AMEX"], // i18n-ignore
    allowedPaymentTypes: ["APPLEPAY", "GOOGLEPAY"], // i18n-ignore
    country: "LB", // i18n-ignore
    locale: "en_US", // i18n-ignore
    orderInformation: {
      amountDetails: {
        totalAmount,
        currency,
      },
    },
  };

  const body = JSON.stringify(payload);
  const headers = buildHeaders({ method: "POST", path, body, merchantId, apiKeyId, sharedSecretKey });

  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers,
      body,
    });

    const rawBody = await res.text();

    if (!res.ok) {
      let errorMessage = `CyberSource wallet capture context failed (HTTP ${res.status}): ${rawBody.slice(0, 500)}`; // i18n-ignore
      try {
        const errData = JSON.parse(rawBody) as any;
        const detail =
          errData?.message ??
          errData?.response?.rmsg ??
          errData?.errors?.[0]?.message ??
          errData?.reason;
        if (detail) errorMessage = `CyberSource ${res.status}: ${detail} — raw: ${rawBody.slice(0, 400)}`; // i18n-ignore
      } catch {
        // not JSON
      }
      return { ok: false, message: errorMessage };
    }

    const captureContext = rawBody.trim();
    if (!captureContext) {
      return { ok: false, message: "CyberSource returned an empty wallet capture context" }; // i18n-ignore
    }

    return { ok: true, captureContext };
  } catch (err: any) {
    return { ok: false, message: err?.message ?? "CyberSource wallet capture context request failed" }; // i18n-ignore
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
  address?: string;
  city?: string;
  country?: string;
  postalCode?: string;
};

export async function authorizeAndCapture(opts: {
  transientTokenJwt: string;
  totalAmount: string;
  currency: string;
  orderId: string;
  billingDetails?: BillingDetails;
}): Promise<
  | { ok: true; paymentId: string; status: string }
  | { ok: false; message: string; declineCode?: string }
> {
  const { transientTokenJwt, totalAmount, currency, orderId, billingDetails } = opts;
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

  const payload = {
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

  const body = JSON.stringify(payload);
  const headers = buildHeaders({ method: "POST", path, body, merchantId, apiKeyId, sharedSecretKey });

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

    // CyberSource uses 201 for success
    if (res.status === 201 && data?.id) {
      return { ok: true, paymentId: data.id, status: data.status ?? "AUTHORIZED_PENDING_REVIEW" }; // i18n-ignore
    }

    // Declined or error
    const reason = data?.errorInformation?.reason ?? data?.status ?? `HTTP ${res.status}`;
    const message =
      data?.errorInformation?.message ??
      data?.message ??
      `Payment declined (${reason}).`; // i18n-ignore

    return {
      ok: false,
      message,
      declineCode: typeof reason === "string" ? reason : undefined,
    };
  } catch (err: any) {
    return { ok: false, message: err?.message ?? "CyberSource payment request failed" }; // i18n-ignore
  }
}
