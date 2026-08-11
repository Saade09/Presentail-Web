/**
 * CyberSource Unified Checkout (UC) route handlers.
 *
 * Endpoints:
 *   POST /api/payment/cybersource/capture-context   — returns a capture-context JWT
 *   POST /api/payment/cybersource/authorize         — resolves cart server-side, authorizes + captures
 *   GET  /api/admin/cybersource/config-check        — lists env-var presence (admin-only)
 *
 * All CyberSource endpoints enforce the Lebanon-IP + USD routing gate server-side.
 * The gate is evaluated independently on each endpoint so neither can be reached
 * by bypassing the other.
 *
 * Payment integrity: the `/authorize` endpoint computes the payable total entirely
 * server-side from catalog prices and delivery fees, then passes that amount to
 * CyberSource. The client-supplied `amount` is never used for pricing. The canonical
 * cart snapshot is stored in the checkout intent so `/woo/order` can verify the
 * submitted order matches what was actually paid for.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import {
  getCyberSourceConfig,
  cyberSourceFetch,
  signCyberSourceRequest,
  isCyberSourceRoute,
  CS_AUTHORIZED_STATUSES,
  CYBERSOURCE_REQUIRED_ENV_VARS,
} from "../lib/cyberSource";
import { storePaymentIntent } from "../lib/checkoutIntents";
import {
  resolveCartItems,
  computeDistrictFeeUsd,
  computeSlotFeeUsd,
  countryForDistrict,
  expressSurchargeUsd,
} from "../lib/catalog";
import { resolveOsDeliveryConfig } from "../lib/osLocationsCache";
import { resolveStoreFromRequest } from "../lib/wooStore";
import { validateCoupon } from "../lib/couponValidation";

// Re-export for consumers that need the auth helper directly (e.g. tests).
export { signCyberSourceRequest };

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Admin gate: same PUSH_ADMIN_TOKEN used by other admin endpoints. */
function requireAdmin(req: Request, res: Response): boolean {
  const expected = process.env.PUSH_ADMIN_TOKEN;
  const supplied =
    req.header("x-push-admin-token") ?? req.header("x-admin-token");
  if (!expected || !supplied || supplied !== expected) {
    res.status(401).json({ ok: false, message: "Invalid or missing admin token" }); // i18n-ignore
    return false;
  }
  return true;
}

// ── POST /api/payment/cybersource/capture-context ─────────────────────────────
//
// Creates a UC capture-context JWT that the browser uses to initialise the
// CyberSource Microform (card-number / CVV iframes). The JWT is returned as a
// plain string — never as a nested object — so the client can pass it directly
// to the Microform SDK without unwrapping.

router.post("/payment/cybersource/capture-context", async (req, res) => {
  const { currency, amount } = req.body as {
    currency?: string;
    amount?: number;
  };

  const currencyStr = (currency ?? "USD").trim().toUpperCase();

  // Enforce Lebanon-IP + USD gate independently on this endpoint.
  const gateResult = await isCyberSourceRoute(req, currencyStr);
  if (!gateResult.eligible) {
    req.log.warn(
      { csGate: gateResult },
      "cybersource capture-context: routing gate blocked request",
    );
    return res.status(403).json({
      ok: false,
      code: "cybersource_not_available",
      message:
        "CyberSource checkout is not available for your location or currency.", // i18n-ignore
    });
  }

  let config: ReturnType<typeof getCyberSourceConfig>;
  try {
    config = getCyberSourceConfig();
  } catch (err: unknown) {
    req.log.error({ err }, "cybersource: config error on capture-context");
    return res.status(503).json({
      ok: false,
      code: "cybersource_not_configured",
      message:
        err instanceof Error ? err.message : "CyberSource is not configured.", // i18n-ignore
    });
  }

  // Allowed card networks — configurable, falling back to Visa/MC/Amex.
  const allowedNetworks = process.env.CYBERSOURCE_ALLOWED_NETWORKS
    ? process.env.CYBERSOURCE_ALLOWED_NETWORKS.split(",")
        .map((n) => n.trim())
        .filter(Boolean)
    : ["VISA", "MASTERCARD", "AMEX"];

  // targetOrigins: required for the Microform CORS policy. Normalise each entry
  // to a bare origin (scheme + host + optional port, no trailing slash or path).
  // Also include the request's own Origin header so dev / preview environments
  // work without having to enumerate every Replit domain in the env var.
  const rawOrigins = process.env.CYBERSOURCE_ALLOWED_ORIGINS ?? "";
  const configuredOrigins = rawOrigins
    .split(",")
    .map((o) => {
      let candidate = o.trim().replace(/\/$/, "");
      // If the entry has no scheme (e.g. "presentail.com"), prepend https://
      // so it passes the URL constructor check.
      if (candidate && !/^https?:\/\//i.test(candidate)) {
        candidate = `https://${candidate}`;
      }
      return candidate;
    })
    .filter((o) => {
      try { new URL(o); return true; } catch { return false; }
    });

  // Always include the caller's Origin so the Microform loads in the browser
  // that made this request (covers dev, staging, and production preview URLs).
  const requestOrigin = req.headers.origin;
  const originSet = new Set(configuredOrigins);
  if (requestOrigin) originSet.add(requestOrigin.replace(/\/$/, ""));
  const targetOrigins = [...originSet];

  if (targetOrigins.length === 0) {
    req.log.error(
      "cybersource: no valid targetOrigins — set CYBERSOURCE_ALLOWED_ORIGINS to a comma-separated list of HTTPS origins",
    );
    return res.status(503).json({
      ok: false,
      code: "cybersource_not_configured",
      message:
        "CYBERSOURCE_ALLOWED_ORIGINS must be set to a comma-separated list of allowed origins for the Microform.", // i18n-ignore
    });
  }

  req.log.info({ targetOrigins }, "cybersource: capture-context targetOrigins");

  // clientVersion must match the Flex Microform bundle version loaded on the
  // frontend — "0.23" is the stable Flex Microform v2 identifier accepted by
  // the production UC capture-contexts endpoint (no "v" prefix).
  const clientVersion =
    process.env.CYBERSOURCE_CLIENT_VERSION ?? "0.23";

  // locale is required by CyberSource. Format MUST use underscore separator
  // per ISO 639 + ISO 3166: "en_US" not "en-US".
  // Override via CYBERSOURCE_LOCALE env var (e.g. "ar_LB", "fr_FR").
  const locale = process.env.CYBERSOURCE_LOCALE ?? "en_US";

  // totalAmount is required by the capture-contexts endpoint even though it
  // is informational at this stage — the actual charge happens in /authorize.
  // CyberSource rejects "0.00"; use "1.00" as the minimum valid placeholder
  // when the caller does not supply an amount. The authoritative total is
  // always resolved server-side in /authorize.
  const totalAmount = (amount != null && amount > 0) ? String(amount) : "1.00";

  // allowedPaymentTypes is required by the UC capture-contexts endpoint.
  // "PANENTRY" = manual card-number entry (Flex Microform / typed card details).
  // Valid values: PANENTRY, SRC, GOOGLEPAY, CLICKTOPAY, APPLEPAY, PAZE, etc.
  // Extend via CYBERSOURCE_ALLOWED_PAYMENT_TYPES env var if needed.
  const allowedPaymentTypes =
    (process.env.CYBERSOURCE_ALLOWED_PAYMENT_TYPES ?? "PANENTRY")
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);

  const captureContextBody: Record<string, unknown> = {
    clientVersion,
    locale,
    // country is required at the top-level of the capture-contexts request body.
    // CyberSource validates its presence at $.country (root), independently of
    // the country field inside orderInformation.amountDetails.
    country: process.env.CYBERSOURCE_MERCHANT_COUNTRY ?? "LB",
    targetOrigins,
    allowedCardNetworks: allowedNetworks,
    allowedPaymentTypes,
    orderInformation: {
      amountDetails: {
        totalAmount,
        currency: currencyStr,
      },
    },
    // Note: payerAuthenticationConfig is NOT valid on /up/v1/capture-contexts.
    // Payer authentication (3DS) is triggered at /pts/v2/payments time via
    // payerAuthEnrollService.run="true" — not during tokenization setup.
  };

  const path = "/up/v1/capture-contexts";

  // ── Debug: log full outbound request so mismatches are visible in logs ──
  console.log("[CS capture-context] OUTBOUND REQUEST");
  console.log("[CS capture-context] baseUrl     :", config.baseUrl.slice(0, 8) + "****" + config.baseUrl.slice(-12));
  console.log("[CS capture-context] merchantId  :", config.merchantId.slice(0, 4) + "****");
  console.log("[CS capture-context] environment :", config.environment);
  console.log("[CS capture-context] body        :", JSON.stringify(captureContextBody, null, 2));

  req.log.info(
    {
      csDebug: {
        environment: config.environment,
        baseUrl: config.baseUrl,
        merchantId: config.merchantId.slice(0, 4) + "****",
        apiKeyId: config.apiKeyId.slice(0, 6) + "****",
        requestBody: captureContextBody,
      },
    },
    "cybersource: capture-context outbound request",
  );

  const { status, raw } = await cyberSourceFetch(
    "POST",
    path,
    captureContextBody,
    config,
  );

  console.log("[CS capture-context] RESPONSE status :", status);
  console.log("[CS capture-context] RESPONSE body (raw, unmodified):");
  console.log(raw);

  req.log.info(
    { csStatus: status, csPath: path, csEnv: config.environment },
    "cybersource capture-context response",
  );

  if (status < 200 || status >= 300) {
    // Log the FULL raw response body — not truncated — so we can diagnose
    // CyberSource validation errors without guessing.
    console.log("[CS capture-context] ERROR — status:", status, "body:", raw);
    req.log.warn(
      {
        csStatus: status,
        csResponseRaw: raw,          // full body, untruncated
        csEnvironment: config.environment,
        csBaseUrl: config.baseUrl,
        csMerchantId: config.merchantId.slice(0, 4) + "****",
      },
      "cybersource: capture-context API error (full response)",
    );
    return res.status(502).json({
      ok: false,
      code: "cybersource_error",
      message: "CyberSource capture-context failed. Please try again.", // i18n-ignore
    });
  }

  // The capture-context response body is a JWT string (Base64-encoded).
  // Return it alongside the resolved environment so the client can select
  // the matching UC Microform SDK URL (testflex vs flex).
  return res.json({
    ok: true,
    captureContext: raw,
    environment: config.environment,
  });
});

// ── POST /api/payment/cybersource/authorize ───────────────────────────────────
//
// Payment integrity model (mirrors Stripe/Mamo/PayPal):
//   1. Server resolves catalog prices from the OS cache — client amounts are ignored.
//   2. Server computes the authoritative total (subtotal + district + express + slot fees).
//   3. Server-computed total is sent to CyberSource as the charged amount.
//   4. A canonical cart snapshot is stored in checkoutIntents so /woo/order can
//      verify the submitted cart matches what was actually paid for.
//   5. `processingInformation.capture: true` → auth+capture (immediate settlement)
//      so there is no outstanding authorization that requires a separate capture.
//
// 3DS two-call flow:
//   Call 1 (enrollment): no threeDSAuthData.authenticationTransactionId.
//     Frictionless → AUTHORIZED immediately.
//     Challenge required → PENDING_AUTHENTICATION + stepUpUrl returned to client.
//     Server stores an EnrollmentSnapshot keyed by orderId before returning so the
//     validation call can reuse the same amounts without re-resolving catalog/fees.
//     This prevents amount divergence when cart prices or delivery fees change while
//     the shopper is inside the 3DS challenge iframe (which can take 1–5 minutes).
//
//   Call 2 (validation): threeDSAuthData.authenticationTransactionId is set.
//     Server looks up the stored EnrollmentSnapshot; if found, reuses its amounts.
//     If the snapshot has expired, falls back to re-resolving (fail-safe, not fail-open).

// EnrollmentSnapshot: resolved pricing values stored after a PENDING_AUTHENTICATION
// enrollment call so the validation call can reuse them without re-resolving catalog
// or delivery fees (which may change while the shopper is in the 3DS challenge).
type EnrollmentSnapshot = {
  subtotalUsd: number;
  districtFeeUsd: number;
  expressFeeUsd: number;
  slotFeeUsd: number;
  couponDiscountUsd: number;
  validatedCouponCode: string | null;
  totalUsd: number;
  totalFormatted: string;
  resolvedItems: { wcId: number; osSlug?: string; quantity: number; priceUsd: number }[];
  resolvedDistrict: string;
  isExpress: boolean;
  isNoAddress: boolean;
  rawDeliverySlot?: string;
  currencyStr: string;
  storedAt: number;
};

// In-memory snapshot store: orderId → snapshot. Entries expire after 30 minutes
// (longer than any realistic 3DS challenge session) and are deleted on consumption.
const enrollmentSnapshots = new Map<string, EnrollmentSnapshot>();
const ENROLLMENT_SNAPSHOT_TTL_MS = 30 * 60 * 1000;

function pruneExpiredSnapshots() {
  const now = Date.now();
  for (const [key, snap] of enrollmentSnapshots) {
    if (now - snap.storedAt > ENROLLMENT_SNAPSHOT_TTL_MS) {
      enrollmentSnapshots.delete(key);
    }
  }
}

router.post("/payment/cybersource/authorize", async (req, res) => {
  const {
    transientToken,
    threeDSAuthData,
    orderId,
    currency,
    items,
    district: rawDistrict,
    expressDelivery: rawExpressDelivery,
    noAddress: rawNoAddress,
    deliverySlot: rawDeliverySlot,
    deliverySlotId: rawDeliverySlotId,
    cityId: rawCityId,
    deliveryDate: rawDeliveryDate,
    couponCode: rawCouponCode,
    customerEmail: rawCustomerEmail,
  } = req.body as {
    transientToken?: string;
    threeDSAuthData?: {
      cavv?: string;
      eci?: string;
      authenticationTransactionId?: string;
      paReason?: string;
    };
    orderId?: string;
    currency?: string;
    items?: { wcId: number; osSlug?: string; quantity: number }[];
    district?: string;
    expressDelivery?: boolean;
    noAddress?: boolean;
    deliverySlot?: string;
    deliverySlotId?: string;
    cityId?: string;
    deliveryDate?: string;
    couponCode?: string;
    customerEmail?: string;
  };

  // paReturnUrl is ALWAYS constructed server-side — accepting it from the client
  // would allow an attacker to redirect ACS callbacks (containing the transactionId)
  // to an arbitrary URL — a material security exposure.
  //
  // Operators SHOULD set CYBERSOURCE_3DS_RETURN_URL to the exact public URL of this
  // API server's /api/payment/cybersource/3ds-return endpoint (e.g.
  // https://api.presentail.com/api/payment/cybersource/3ds-return). This is required
  // when the API server is on a different origin than the frontend, because the ACS
  // (card issuer) will POST to this URL and it must be reachable from the internet.
  //
  // If CYBERSOURCE_3DS_RETURN_URL is not set, falls back to constructing the URL
  // from CYBERSOURCE_ALLOWED_ORIGINS[0], which works when the API server is
  // accessible at the same origin as the frontend (e.g. behind a shared reverse proxy).
  const paReturnUrl = (() => {
    const explicit = process.env.CYBERSOURCE_3DS_RETURN_URL?.trim();
    if (explicit) return explicit;
    const origins = (process.env.CYBERSOURCE_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    return origins.length > 0
      ? `${origins[0]}/api/payment/cybersource/3ds-return`
      : null;
  })();

  if (!transientToken) {
    return res.status(400).json({ ok: false, message: "transientToken is required" }); // i18n-ignore
  }
  if (!orderId) {
    return res.status(400).json({ ok: false, message: "orderId is required" }); // i18n-ignore
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, message: "items is required" }); // i18n-ignore
  }

  const currencyStr = (currency ?? "USD").trim().toUpperCase();

  // Re-verify gate independently — cannot be bypassed by skipping capture-context.
  const gateResult = await isCyberSourceRoute(req, currencyStr);
  if (!gateResult.eligible) {
    req.log.warn(
      { csGate: gateResult },
      "cybersource authorize: routing gate blocked request",
    );
    return res.status(403).json({
      ok: false,
      code: "cybersource_not_available",
      message:
        "CyberSource checkout is not available for your location or currency.", // i18n-ignore
    });
  }

  let config: ReturnType<typeof getCyberSourceConfig>;
  try {
    config = getCyberSourceConfig();
  } catch (err: unknown) {
    req.log.error({ err }, "cybersource: config error on authorize");
    return res.status(503).json({
      ok: false,
      code: "cybersource_not_configured",
      message:
        err instanceof Error ? err.message : "CyberSource is not configured.", // i18n-ignore
    });
  }

  // ── Detect validation call early ─────────────────────────────────────────
  // A validation call is the second leg of a 3DS challenge flow: the client
  // passes back the authenticationTransactionId received from the ACS via
  // postMessage. On validation calls, attempt to reuse the enrollment snapshot
  // (stored when the enrollment call returned PENDING_AUTHENTICATION) so the
  // charged amount is identical to the enrolled amount, even if catalog prices
  // or delivery fees changed while the shopper was in the 3DS challenge iframe.
  const isValidationCall = !!threeDSAuthData?.authenticationTransactionId;

  // Pricing resolved values — populated either from the enrollment snapshot
  // (validation call) or via fresh catalog/fee resolution (enrollment call).
  let subtotalUsd: number;
  let districtFeeUsd: number;
  let expressFeeUsd: number;
  let slotFeeUsd: number;
  let couponDiscountUsd: number;
  let validatedCouponCode: string | null;
  let totalUsd: number;
  let totalFormatted: string;
  let resolvedDistrict: string;
  let isExpress: boolean;
  let isNoAddress: boolean;
  // Resolved items: used when storing the checkout intent on authorization success.
  let resolvedItems: { wcId: number; osSlug?: string; quantity: number; priceUsd: number }[];

  // Prune expired snapshots on each validation call (low-frequency, cheap operation).
  if (isValidationCall) pruneExpiredSnapshots();

  const storedSnap = isValidationCall ? enrollmentSnapshots.get(orderId) : undefined;

  if (storedSnap) {
    // Validation call: reuse the enrollment snapshot — same amounts, same items.
    enrollmentSnapshots.delete(orderId); // consume; do not reuse
    req.log.info({ orderId }, "cybersource: validation call — reusing enrollment snapshot");
    ({ subtotalUsd, districtFeeUsd, expressFeeUsd, slotFeeUsd,
       couponDiscountUsd, validatedCouponCode, totalUsd, totalFormatted,
       resolvedItems, resolvedDistrict, isExpress, isNoAddress } = storedSnap);
  } else {
    // Enrollment call (or validation without snapshot — snapshot may have expired).
    // Resolve catalog prices, fees, and coupon from authoritative server sources.

    // ── Server-side price resolution (same model as Stripe/Mamo/PayPal) ─────
    const store = resolveStoreFromRequest(req);
    const catalogResult = await resolveCartItems(items, store);
    if (!catalogResult.ok) {
      req.log.warn(
        { storeKey: store.storeKey, reason: catalogResult.message },
        "cybersource: resolveCartItems failed",
      );
      return res.status(422).json({
        ok: false,
        code: "catalog_error",
        message: catalogResult.message,
      });
    }

    // Compute delivery fees server-side.
    resolvedDistrict = rawDistrict ?? "Beirut";
    isExpress = rawExpressDelivery === true;
    isNoAddress = rawNoAddress === true;
    subtotalUsd = catalogResult.subtotalUsd;
    const districtCountry = countryForDistrict(resolvedDistrict);
    const osConfig = rawCityId
      ? resolveOsDeliveryConfig(districtCountry, rawCityId)
      : null;

    districtFeeUsd = (() => {
      if (!isNoAddress && osConfig && typeof osConfig.cityFeeUsd === "number") {
        const isFreeByOs =
          osConfig.freeDeliveryEnabled === true &&
          typeof osConfig.freeDeliveryThresholdUsd === "number" &&
          subtotalUsd >= osConfig.freeDeliveryThresholdUsd;
        return isFreeByOs ? 0 : osConfig.cityFeeUsd;
      }
      return computeDistrictFeeUsd(resolvedDistrict, subtotalUsd, isNoAddress);
    })();

    expressFeeUsd = isExpress
      ? (osConfig && osConfig.expressSurchargeUsd > 0
          ? osConfig.expressSurchargeUsd
          : expressSurchargeUsd(districtCountry))
      : 0;

    slotFeeUsd = computeSlotFeeUsd({
      expressDelivery: isExpress,
      deliverySlot: rawDeliverySlot,
      deliverySlotId: rawDeliverySlotId,
      cityId: rawCityId,
      deliveryDate: rawDeliveryDate,
      district: resolvedDistrict,
    });

    // ── Full pre-coupon total (subtotal + all delivery fees) ─────────────────
    const preTaxUsd = subtotalUsd + districtFeeUsd + expressFeeUsd + slotFeeUsd;

    // ── Coupon validation (server-side, mirrors Stripe/Mamo) ─────────────────
    couponDiscountUsd = 0;
    validatedCouponCode = null;

    const couponCodeTrimmed = rawCouponCode?.trim();
    if (couponCodeTrimmed) {
      const couponResult = await validateCoupon(couponCodeTrimmed, {
        customerEmail: rawCustomerEmail?.trim() ?? "",
        cartItems: catalogResult.items.map((i) => ({
          wcId: i.wcId,
          osSlug: i.osSlug ?? "",
          priceUsd: i.priceUsd,
          quantity: i.quantity,
          name: i.name ?? "",
        })),
        cartTotalUsd: preTaxUsd,
      });
      if (couponResult.valid) {
        couponDiscountUsd = couponResult.discountAmountUsd;
        validatedCouponCode = couponCodeTrimmed;
        req.log.info(
          { couponCode: couponCodeTrimmed, couponDiscountUsd },
          "cybersource: coupon validated successfully",
        );
      } else {
        req.log.warn(
          { couponCode: couponCodeTrimmed, reason: couponResult.error },
          "cybersource: coupon validation failed — proceeding without discount",
        );
      }
    }

    totalUsd = Math.max(0, preTaxUsd - couponDiscountUsd);
    totalFormatted = totalUsd.toFixed(2);
    resolvedItems = catalogResult.items.map((i) => ({
      wcId: i.wcId,
      osSlug: i.osSlug,
      quantity: i.quantity,
      priceUsd: i.priceUsd,
    }));
  }

  // ── CyberSource Payments request ──────────────────────────────────────────
  //
  // CyberSource UC payer-authentication inline flow (two-call pattern):
  //
  //   Call 1 — enrollment: no threeDSAuthData.authenticationTransactionId yet.
  //     Server adds payerAuthEnrollService.run="true" and a returnUrl so the ACS
  //     knows where to POST back after a challenge.
  //     · Frictionless result → CS returns AUTHORIZED. Done.
  //     · Challenge required → CS returns PENDING_AUTHENTICATION + stepUpUrl.
  //       Server stores an EnrollmentSnapshot keyed by orderId, then returns
  //       { pending3DS: true, stepUpUrl, accessToken } to the client.
  //       Client shows the ACS challenge in an iframe; ACS POSTs the result to
  //       our /payment/cybersource/3ds-return endpoint, which postMessages the
  //       transactionId back to the parent frame.
  //
  //   Call 2 — validation: client passes threeDSAuthData.authenticationTransactionId.
  //     Server adds payerAuthValidateService.run="true" so CS validates the 3DS
  //     result and returns the final CAVV/ECI. If valid, CS returns AUTHORIZED.

  const authorizeBody: Record<string, unknown> = {
    clientReferenceInformation: {
      code: orderId,
    },
    // auth+capture (immediate settlement) — eliminates the need for a
    // separate POST /pts/v2/captures/{id} step after authorization succeeds.
    processingInformation: {
      capture: true,
    },
    tokenInformation: {
      transientTokenJwt: transientToken,
    },
    orderInformation: {
      amountDetails: {
        totalAmount: totalFormatted,
        currency: currencyStr,
      },
    },
  };

  if (isValidationCall) {
    // Second call — validate the completed 3DS challenge.
    // CS uses the authenticationTransactionId to look up the challenge result
    // and attach CAVV/ECI to the payment.
    authorizeBody.payerAuthValidateService = { run: "true" };
    authorizeBody.consumerAuthenticationInformation = {
      authenticationTransactionId: threeDSAuthData!.authenticationTransactionId,
      ...(threeDSAuthData!.cavv ? { cavv: threeDSAuthData!.cavv } : {}),
      ...(threeDSAuthData!.eci ? { eci: threeDSAuthData!.eci } : {}),
      ...(threeDSAuthData!.paReason
        ? { paReason: threeDSAuthData!.paReason }
        : {}),
    };
  } else {
    // First call — trigger payer-auth enrollment alongside the payment.
    // returnUrl is constructed server-side (never from the client) and is where
    // the ACS POSTs back after a 3DS challenge completes. Operators must set
    // CYBERSOURCE_3DS_RETURN_URL to the public URL of this endpoint when the
    // API server is on a different origin than the frontend.
    authorizeBody.payerAuthEnrollService = { run: "true" };
    authorizeBody.consumerAuthenticationInformation = {
      // paReturnUrl is always present when CYBERSOURCE_3DS_RETURN_URL or
      // CYBERSOURCE_ALLOWED_ORIGINS is configured. When null (misconfiguration),
      // omit the field — frictionless flows will succeed; challenges will be
      // unresolvable (503 from 3ds-return) rather than silently exposing the
      // transactionId via an open redirect.
      ...(paReturnUrl ? { returnUrl: paReturnUrl } : {}),
      ...(threeDSAuthData?.cavv ? { cavv: threeDSAuthData.cavv } : {}),
      ...(threeDSAuthData?.eci ? { eci: threeDSAuthData.eci } : {}),
    };
  }

  const path = "/pts/v2/payments";
  const { status, data, raw } = await cyberSourceFetch(
    "POST",
    path,
    authorizeBody,
    config,
  );

  req.log.info(
    { csStatus: status, csPath: path, csEnv: config.environment },
    "cybersource authorize response",
  );

  if (status < 200 || status >= 300) {
    const csData = data as Record<string, unknown> | null;
    const csMessage =
      typeof csData?.message === "string"
        ? csData.message
        : typeof csData?.reason === "string"
          ? csData.reason
          : undefined;
    req.log.warn(
      { csStatus: status, csResponseRaw: raw.slice(0, 500) },
      "cybersource: authorize API error",
    );
    return res.status(502).json({
      ok: false,
      code: "cybersource_error",
      message: csMessage ?? "CyberSource authorization failed. Please try again.", // i18n-ignore
    });
  }

  // Validate the authorization status explicitly.
  // CyberSource can return 201 with non-authorized statuses such as DECLINED,
  // PENDING_AUTHENTICATION (3DS challenge required), or INVALID_REQUEST.
  // Only AUTHORIZED and AUTHORIZED_PENDING_REVIEW are accepted as successful
  // payments — anything else must be surfaced to the shopper.
  const csData = data as Record<string, unknown> | null;
  const csStatus =
    typeof csData?.status === "string" ? csData.status : "UNKNOWN";

  // ── PENDING_AUTHENTICATION: 3DS challenge required ────────────────────────
  // CyberSource returned a challenge URL. No money has moved yet, so no intent
  // is stored. Instead, persist an EnrollmentSnapshot (cart prices + fees) keyed
  // by orderId so the validation call can reuse the same amounts without
  // re-resolving, then return the stepUpUrl and accessToken to the client.
  //
  // The client presents the ACS challenge inside an iframe. After the shopper
  // completes the challenge, the ACS POSTs to our /payment/cybersource/3ds-return
  // endpoint, which postMessages the transactionId back to the parent frame.
  // The client then calls this endpoint again with
  // threeDSAuthData.authenticationTransactionId set (the validation call).
  if (csStatus === "PENDING_AUTHENTICATION") {
    const csAuthInfo = csData?.consumerAuthenticationInformation as
      | Record<string, unknown>
      | undefined;
    const stepUpUrl =
      typeof csAuthInfo?.stepUpUrl === "string" ? csAuthInfo.stepUpUrl : null;
    const accessToken =
      typeof csAuthInfo?.accessToken === "string"
        ? csAuthInfo.accessToken
        : null;

    // Store pricing snapshot for the validation call.
    enrollmentSnapshots.set(orderId, {
      subtotalUsd,
      districtFeeUsd,
      expressFeeUsd,
      slotFeeUsd,
      couponDiscountUsd,
      validatedCouponCode,
      totalUsd,
      totalFormatted,
      resolvedItems,
      resolvedDistrict,
      isExpress,
      isNoAddress,
      rawDeliverySlot,
      currencyStr,
      storedAt: Date.now(),
    });

    req.log.info(
      { csStatus, orderId, hasStepUpUrl: !!stepUpUrl },
      "cybersource: 3DS challenge required — snapshot stored, returning stepUpUrl to client",
    );

    return res.json({
      ok: false,
      pending3DS: true,
      csStatus,
      stepUpUrl,
      accessToken,
      message: "3D Secure authentication is required to proceed.", // i18n-ignore
    });
  }

  if (!CS_AUTHORIZED_STATUSES.has(csStatus)) {
    req.log.warn(
      { csStatus, csResponseRaw: raw.slice(0, 500), orderId },
      "cybersource: authorize returned non-authorized status — rejecting",
    );
    return res.status(402).json({
      ok: false,
      code: "cybersource_not_authorized",
      // Surface the CS status so the client can show appropriate messaging.
      csStatus,
      message:
        csStatus === "DECLINED"
          ? "Your card was declined. Please check your card details or try a different card." // i18n-ignore
          : "CyberSource authorization was not approved. Please try again.", // i18n-ignore
    });
  }

  const paymentRef =
    typeof csData?.id === "string" ? csData.id : `cs-${Date.now()}`;

  // Store a cybersource payment intent so the /woo/order finalization path
  // can consume it with the same binding verification logic used for other
  // providers. The full cart snapshot is stored so /woo/order can verify
  // the submitted cart matches exactly what was authorized.
  storePaymentIntent({
    orderId,
    paymentRef,
    provider: "cybersource",
    currency: currencyStr,
    totalUsd,
    snapshot: {
      items: resolvedItems,
      district: resolvedDistrict,
      expressDelivery: isExpress,
      noAddress: isNoAddress,
      deliverySlot: rawDeliverySlot ?? "",
      districtFeeUsd,
      expressFeeUsd,
      slotFeeUsd,
      couponDiscountUsd,
      couponCode: validatedCouponCode ?? undefined,
    },
    paymentMeta: {
      csStatus,
      csEnvironment: config.environment,
    },
  });

  return res.json({
    ok: true,
    paymentRef,
    status: csStatus,
    couponCode: validatedCouponCode ?? undefined,
  });
});

// ── GET /api/admin/cybersource/config-check ───────────────────────────────────

// ── POST /api/payment/cybersource/3ds-return ─────────────────────────────────
//
// ACS (Access Control Server) return endpoint for 3DS challenges.
//
// When the card issuer requires a step-up challenge, the client presents the ACS
// challenge UI inside an <iframe>. After the shopper completes the challenge the
// ACS does a form POST (application/x-www-form-urlencoded) to this URL with a
// `TransactionId` field. This endpoint renders a tiny HTML page that uses
// window.parent.postMessage to pass the transactionId back to the parent Checkout
// page, which then re-calls /authorize with
// threeDSAuthData.authenticationTransactionId set (the validation call).
//
// Body parsing: app.ts mounts express.urlencoded({ extended: true }) globally
// before the router, so req.body is already parsed when this handler runs.
// Do NOT add a second urlencoded parser here — double-mounting causes the body
// stream to be consumed twice and the second parse produces an empty object.
//
// Security: postMessage targets are restricted ONLY to origins listed in
// CYBERSOURCE_ALLOWED_ORIGINS. No wildcard ('*') is ever emitted — a missing
// configuration fails hard (503) rather than falling back to an insecure broadcast.
// frame-ancestors is set so the page can only be framed by our own domain.

router.post("/payment/cybersource/3ds-return", (req, res) => {
  // app.ts installs express.urlencoded() globally before the router, so req.body
  // is already a parsed key→value object for application/x-www-form-urlencoded
  // requests. Cast it defensively; fall through to query params as a backup for
  // GET-style ACS implementations.
  const body = (req.body ?? {}) as Record<string, string | undefined>;

  // CyberSource sends `TransactionId`; accept both casings defensively.
  const transactionId = (
    body.TransactionId ??
    body.transactionId ??
    (req.query.TransactionId as string | undefined) ??
    (req.query.transactionId as string | undefined) ??
    ""
  ).trim();

  const allowedOrigins = (process.env.CYBERSOURCE_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (allowedOrigins.length === 0) {
    // Cannot securely postMessage without a known origin.
    req.log.error(
      "cybersource 3ds-return: CYBERSOURCE_ALLOWED_ORIGINS not configured — cannot return transaction ID securely",
    );
    return res.status(503).send(
      "CyberSource not configured: CYBERSOURCE_ALLOWED_ORIGINS must be set.", // i18n-ignore
    );
  }

  const safeTransId = JSON.stringify(transactionId);

  // Build one postMessage call per configured origin.
  // No wildcard ('*') is included — each message is bound to an explicit origin
  // so cross-origin frames cannot intercept the transactionId.
  const postMessageCalls = allowedOrigins
    .map((o) => `  try{window.parent.postMessage(msg,${JSON.stringify(o)});}catch(e){}`)
    .join("\n");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Verifying card...</title></head>
<body>
<script>
(function(){
  var msg={type:'cs3dsReturn',transactionId:${safeTransId}};
${postMessageCalls}
})();
</script>
</body></html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Restrict framing to our own frontend domains to prevent click-jacking.
  res.setHeader(
    "Content-Security-Policy",
    `frame-ancestors ${allowedOrigins.join(" ")} 'self'`,
  );
  return res.end(html);
});

// ── GET /api/admin/cybersource/config-check ───────────────────────────────────

router.get("/admin/cybersource/config-check", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const envStatus = CYBERSOURCE_REQUIRED_ENV_VARS.map((key) => ({
    key,
    present: !!process.env[key],
    value: process.env[key] ? "***set***" : "(missing)", // i18n-ignore
  }));

  // Derive the resolved base URL without throwing.
  const csEnv = process.env.CYBERSOURCE_ENV ?? "test";
  const resolvedBaseUrl =
    csEnv === "production"
      ? process.env.CYBERSOURCE_BASE_URL_PROD
      : process.env.CYBERSOURCE_BASE_URL_TEST;

  return res.json({
    ok: true,
    environment: csEnv,
    resolvedBaseUrl: resolvedBaseUrl ?? "(missing)", // i18n-ignore
    vars: envStatus,
  });
});

export default router;
