import { Router, type IRouter, type Request, type Response } from "express";
import {
  convertFromUsd,
  normalizeCurrency,
  paypalCurrencyFor,
  roundForCurrency,
} from "../lib/fx";
import {
  resolveCartItems,
  computeDistrictFeeUsd,
  computeSlotFeeUsd,
  countryForDistrict,
  expressSurchargeUsd,
} from "../lib/catalog";
import {
  getCybersourceMerchantId,
  getCybersourceGooglePayMerchantId,
  getCybersourceEnvironment,
  authorizeAndCaptureGooglePay,
  validateApplePayMerchant,
  authorizeAndCaptureApplePay,
} from "../lib/cybersource";
import { storePaymentIntent } from "../lib/checkoutIntents";
import { resolveOsDeliveryConfig } from "../lib/osLocationsCache";
import { resolveStoreFromRequest, resolveStore } from "../lib/wooStore";
import { validateRedirectUrl } from "../lib/validateRedirectUrl";
import { db, csPaymentAttemptsTable, type CsAttemptCartSnapshot } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger as rootLogger } from "../lib/logger";
import {
  attemptCreateOsOrder,
  recordSuccessfulWcOrder,
  WooOrderSchema,
} from "../lib/wooOrders";

const router: IRouter = Router();

// ── Payment-return bridge ─────────────────────────────────────────────────
// Payment providers (Mamo, PayPal) only accept HTTPS return URLs. We give them
// this endpoint which validates and 302-redirects to the app's custom scheme.
// expo-web-browser's openAuthSessionAsync detects the deep link and closes
// the in-app browser, returning control to the app.
//
// Security measures:
//   1. Strict scheme allowlist — only the Presentail app scheme is accepted.
//   2. No user-supplied values are reflected into HTML/JS/anchors; the
//      deep-link target is placed only in a Location header and a safe <meta>
//      redirect whose content attribute is fully escaped.
const ALLOWED_DEEP_LINK_SCHEMES = new Set(["presentail"]);

function htmlEncode(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

function parseScheme(url: string): string {
  const m = url.match(/^([a-z][a-z0-9+.-]*):/i);
  return m ? m[1].toLowerCase() : "";
}

router.get("/payment/return", (req, res) => {
  const rawDeeplink = String(req.query.deeplink ?? "");
  const rawStatus = String(req.query.status ?? "success");

  // Validate deep link: must be a non-empty string using an explicitly
  // allowed custom scheme. We never accept http/https (open redirect risk)
  // or javascript/data (injection risk).
  if (!rawDeeplink) {
    return res.status(400).send("Missing deeplink parameter");
  }
  const scheme = parseScheme(rawDeeplink);
  if (!ALLOWED_DEEP_LINK_SCHEMES.has(scheme)) {
    return res.status(400).send("Unsupported deep link scheme");
  }

  // Validate status to a known safe set before appending it to the URL.
  const status = rawStatus === "cancel" ? "cancel" : "success";

  const sep = rawDeeplink.includes("?") ? "&" : "?";
  const target = `${rawDeeplink}${sep}status=${encodeURIComponent(status)}`;

  // Primary redirect via Location header — custom scheme handlers on iOS/Android
  // intercept it correctly.
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Location", target);
  // Secondary: meta-refresh with fully escaped target in case some WebView
  // contexts don't follow the Location header for custom schemes.
  const safeTarget = htmlEncode(target);
  return res.status(302).send(
    `<!doctype html><html><head><meta charset="utf-8"><title>Returning to Presentail\u2026</title>` +
    `<meta http-equiv="refresh" content="0;url=${safeTarget}">` +
    `</head><body>` +
    `<p>Returning to Presentail\u2026 <a href="${safeTarget}">Tap here if nothing happens</a></p>` +
    `</body></html>`,
  );
});

// ── Mamo Payment Link ──────────────────────────────────────────────────────
// The client sends cart items (with WC product IDs), delivery info, and the
// app orderId. The server resolves catalog prices and computes the true total
// server-side so the client cannot manipulate the charged amount.
// The cart snapshot and orderId→paymentRef mapping are stored so /woo/order
// can verify both the binding and that the submitted cart matches the paid cart.
router.post("/payment/mamo", async (req, res) => {
  const key = process.env.MAMO_SECRET_KEY;
  if (!key) {
    return res.status(503).json({
      ok: false,
      code: "mamo_not_configured",
      message: "Mamo is not configured. Add MAMO_SECRET_KEY to enable.", // i18n-ignore
    });
  }

  const {
    items,
    orderId,
    district,
    expressDelivery,
    noAddress,
    currency: rawCurrency,
    title,
    description,
    email,
    firstName,
    lastName,
    returnUrl,
    failureReturnUrl,
    deliverySlot: rawDeliverySlot,
    deliverySlotId: rawDeliverySlotId,
    cityId: rawCityId,
    deliveryDate: rawDeliveryDate,
  } = req.body as {
    items: { wcId: number; osSlug?: string; quantity: number }[];
    orderId: string;
    district?: string;
    expressDelivery?: boolean;
    noAddress?: boolean;
    currency?: string;
    title?: string;
    description?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    returnUrl: string;
    failureReturnUrl: string;
    deliverySlot?: string;
    deliverySlotId?: string;
    cityId?: string;
    deliveryDate?: string;
  };

  if (!orderId) {
    return res.status(400).json({ ok: false, message: "orderId is required" }); // i18n-ignore
  }
  if (!returnUrl || !failureReturnUrl) {
    return res.status(400).json({ ok: false, message: "returnUrl and failureReturnUrl are required" }); // i18n-ignore
  }
  const returnUrlErr = validateRedirectUrl(returnUrl, "payment-return");
  if (returnUrlErr) {
    return res.status(400).json({ ok: false, code: "invalid_redirect_url", message: returnUrlErr }); // i18n-ignore
  }
  const failureReturnUrlErr = validateRedirectUrl(failureReturnUrl, "payment-return");
  if (failureReturnUrlErr) {
    return res.status(400).json({ ok: false, code: "invalid_redirect_url", message: failureReturnUrlErr }); // i18n-ignore
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, message: "items is required" }); // i18n-ignore
  }

  // Resolve catalog prices server-side.
  const store = resolveStoreFromRequest(req);
  const catalogResult = await resolveCartItems(items, store);
  if (!catalogResult.ok) {
    return res.status(422).json({ ok: false, code: "catalog_error", message: catalogResult.message });
  }

  const resolvedDistrict = district ?? "Beirut";
  const isExpress = expressDelivery === true;
  const isNoAddress = noAddress === true;
  const subtotalUsd = catalogResult.subtotalUsd;
  const districtCountry = countryForDistrict(resolvedDistrict);
  // Bugs A+B fix: prefer OS city-level delivery config (keyed by cityId) so the
  // Mamo charge matches the fee wooOrders.ts will record at order creation.
  const mamoOsConfig = rawCityId ? resolveOsDeliveryConfig(districtCountry, rawCityId) : null;
  const districtFeeUsd = (() => {
    if (!isNoAddress && mamoOsConfig && typeof mamoOsConfig.cityFeeUsd === "number") {
      const isFreeByOs =
        mamoOsConfig.freeDeliveryEnabled === true &&
        typeof mamoOsConfig.freeDeliveryThresholdUsd === "number" &&
        subtotalUsd >= mamoOsConfig.freeDeliveryThresholdUsd;
      return isFreeByOs ? 0 : mamoOsConfig.cityFeeUsd;
    }
    return computeDistrictFeeUsd(resolvedDistrict, subtotalUsd, isNoAddress);
  })();
  const expressFeeUsd = isExpress
    ? (mamoOsConfig && mamoOsConfig.expressSurchargeUsd > 0
        ? mamoOsConfig.expressSurchargeUsd
        : expressSurchargeUsd(districtCountry))
    : 0;
  // Slot fee is computed server-side from the OS locations cache and included
  // in the Mamo charge so a shopper cannot pay the standard rate and then
  // submit an order with a premium slot at finalization.
  const mamoSlotFeeUsd = computeSlotFeeUsd({
    expressDelivery: isExpress,
    deliverySlot: rawDeliverySlot,
    deliverySlotId: rawDeliverySlotId,
    cityId: rawCityId,
    deliveryDate: rawDeliveryDate,
    district: resolvedDistrict,
  });
  const totalUsd = subtotalUsd + districtFeeUsd + expressFeeUsd + mamoSlotFeeUsd;

  // Mamo settles in AED only — convert the server-computed USD total.
  const presented = normalizeCurrency(rawCurrency ?? "USD");
  const aedAmount = roundForCurrency(await convertFromUsd(totalUsd, "AED"), "AED");

  // Mamo rejects amounts below 2.00 AED with a generic VALIDATION_ERROR. Catch
  // it early so the customer sees an actionable message instead of a hosted
  // page that never opens.
  const MAMO_MIN_AED = 2;
  if (aedAmount < MAMO_MIN_AED) {
    return res.status(422).json({
      ok: false,
      code: "mamo_amount_too_small",
      message: `Mamo requires a minimum of ${MAMO_MIN_AED.toFixed(2)} AED. Your order total is ${aedAmount.toFixed(2)} AED.`, // i18n-ignore
    });
  }

  const outgoingPayload = {
    title: title ?? "Presentail Order", // i18n-ignore
    amount: aedAmount,
    return_url: returnUrl,
    failure_return_url: failureReturnUrl,
    description: description ?? undefined,
    email: email ?? undefined,
    first_name: firstName ?? undefined,
    last_name: lastName ?? undefined,
  };

  try {
    const r = await fetch("https://business.mamopay.com/manage_api/v1/links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(outgoingPayload),
    });

    const rawBody = await r.text();
    let data: any = null;
    try {
      data = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      data = null;
    }

    if (!r.ok) {
      // Mamo's actual error shape is:
      //   { messages: ["See errors"], error_code: "VALIDATION_ERROR",
      //     errors: ["Amount must be greater than 2.00"] }
      // `errors[0]` is a plain string, not an object — the previous parser
      // (`errors[0].message`) always fell through to the literal "Mamo error".
      const errorsField = data?.errors;
      const messagesField = data?.messages;
      const pickFirstString = (v: unknown): string | undefined => {
        if (typeof v === "string" && v.trim()) return v.trim();
        if (Array.isArray(v)) {
          for (const entry of v) {
            if (typeof entry === "string" && entry.trim()) return entry.trim();
            if (entry && typeof entry === "object") {
              const m = (entry as any).message ?? (entry as any).detail;
              if (typeof m === "string" && m.trim()) return m.trim();
            }
          }
        }
        return undefined;
      };
      const msg =
        pickFirstString(errorsField) ??
        pickFirstString(messagesField) ??
        (typeof data?.message === "string" && data.message.trim()
          ? data.message.trim()
          : undefined) ??
        (typeof data?.error === "string" && data.error.trim()
          ? data.error.trim()
          : undefined) ??
        (typeof data?.error_code === "string" && data.error_code.trim()
          ? `Mamo rejected the request (${data.error_code.trim()}).` // i18n-ignore
          : undefined) ??
        `Mamo rejected the request (HTTP ${r.status}).`; // i18n-ignore

      req.log.warn(
        {
          mamoStatus: r.status,
          mamoBody: rawBody.slice(0, 1000),
          outgoing: {
            amount: outgoingPayload.amount,
            currency: "AED",
            hasReturnUrl: !!outgoingPayload.return_url,
            hasFailureReturnUrl: !!outgoingPayload.failure_return_url,
            hasEmail: !!outgoingPayload.email,
            hasFirstName: !!outgoingPayload.first_name,
            hasLastName: !!outgoingPayload.last_name,
            titleLength: outgoingPayload.title?.length ?? 0,
          },
        },
        "Mamo link creation failed",
      );
      return res.status(r.status).json({ ok: false, code: "mamo_error", message: msg });
    }

    // Defensive guard: Mamo returned 2xx but the body is missing the fields we
    // need to drive the hosted checkout. Surface this as a server error rather
    // than handing the client `ok:true` with undefined url/id.
    if (!data || typeof data.payment_url !== "string" || data.id == null) {
      req.log.warn(
        { mamoStatus: r.status, mamoBody: rawBody.slice(0, 1000) },
        "Mamo returned success but response is missing payment_url or id",
      );
      return res.status(502).json({
        ok: false,
        code: "mamo_error",
        message: "Mamo returned an unexpected response. Please try again or choose another payment method.", // i18n-ignore
      });
    }

    // Store the intent with the full cart snapshot so /woo/order can verify:
    //   1. orderId↔paymentRef binding (prevents replay for a different order)
    //   2. submitted cart matches the paid-for cart (prevents cart substitution)
    storePaymentIntent({
      orderId,
      paymentRef: String(data.id),
      provider: "mamo",
      currency: "AED",
      totalUsd,
      snapshot: {
        items: catalogResult.items.map((i) => ({
          wcId: i.wcId,
          osSlug: i.osSlug,
          quantity: i.quantity,
          priceUsd: i.priceUsd,
        })),
        district: resolvedDistrict,
        expressDelivery: isExpress,
        noAddress: isNoAddress,
        deliverySlot: rawDeliverySlot ?? "",
        districtFeeUsd,
        expressFeeUsd,
        slotFeeUsd: mamoSlotFeeUsd,
      },
    });

    return res.json({
      ok: true,
      url: data.payment_url,
      id: data.id,
      amount: aedAmount,
      currency: "AED",
      presentedCurrency: presented,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, code: "mamo_error", message: e?.message ?? "Mamo error" }); // i18n-ignore
  }
});

// ── PayPal Order ───────────────────────────────────────────────────────────
const PAYPAL_BASE =
  process.env.PAYPAL_SANDBOX === "true"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";

async function getPayPalToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("PayPal not configured");

  const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const r = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${encoded}`,
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
  });

  const data = (await r.json()) as any;
  if (!r.ok || !data.access_token) {
    throw new Error(data?.error_description ?? "Failed to get PayPal token"); // i18n-ignore
  }
  return data.access_token;
}

// The client sends cart items, delivery info, and orderId. The server computes
// the true total from catalog prices and stores the intent + cart snapshot for
// order binding verification.
router.post("/payment/paypal", async (req, res) => {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(503).json({
      ok: false,
      code: "paypal_not_configured",
      message: "PayPal is not configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.", // i18n-ignore
    });
  }

  const {
    items,
    orderId,
    district,
    expressDelivery,
    noAddress,
    currency: rawCurrency,
    returnUrl,
    cancelUrl,
    deliverySlot: ppRawDeliverySlot,
    deliverySlotId: ppRawDeliverySlotId,
    cityId: ppRawCityId,
    deliveryDate: ppRawDeliveryDate,
  } = req.body as {
    items: { wcId: number; osSlug?: string; quantity: number }[];
    orderId: string;
    district?: string;
    expressDelivery?: boolean;
    noAddress?: boolean;
    currency?: string;
    returnUrl: string;
    cancelUrl: string;
    deliverySlot?: string;
    deliverySlotId?: string;
    cityId?: string;
    deliveryDate?: string;
  };

  if (!orderId) {
    return res.status(400).json({ ok: false, message: "orderId is required" }); // i18n-ignore
  }
  if (!returnUrl || !cancelUrl) {
    return res.status(400).json({ ok: false, message: "returnUrl and cancelUrl are required" }); // i18n-ignore
  }
  const ppReturnUrlErr = validateRedirectUrl(returnUrl, "payment-return");
  if (ppReturnUrlErr) {
    return res.status(400).json({ ok: false, code: "invalid_redirect_url", message: ppReturnUrlErr }); // i18n-ignore
  }
  const ppCancelUrlErr = validateRedirectUrl(cancelUrl, "payment-return");
  if (ppCancelUrlErr) {
    return res.status(400).json({ ok: false, code: "invalid_redirect_url", message: ppCancelUrlErr }); // i18n-ignore
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, message: "items is required" }); // i18n-ignore
  }

  // Resolve catalog prices server-side.
  const ppStore = resolveStoreFromRequest(req);
  const catalogResult = await resolveCartItems(items, ppStore);
  if (!catalogResult.ok) {
    return res.status(422).json({ ok: false, code: "catalog_error", message: catalogResult.message });
  }

  const resolvedDistrict = district ?? "Beirut";
  const isExpress = expressDelivery === true;
  const isNoAddress = noAddress === true;
  const subtotalUsd = catalogResult.subtotalUsd;
  const districtCountryPP = countryForDistrict(resolvedDistrict);
  // Bugs A+B fix: prefer OS city-level delivery config (keyed by cityId) so the
  // PayPal charge matches the fee wooOrders.ts will record at order creation.
  const ppOsConfig = ppRawCityId ? resolveOsDeliveryConfig(districtCountryPP, ppRawCityId) : null;
  const districtFeeUsd = (() => {
    if (!isNoAddress && ppOsConfig && typeof ppOsConfig.cityFeeUsd === "number") {
      const isFreeByOs =
        ppOsConfig.freeDeliveryEnabled === true &&
        typeof ppOsConfig.freeDeliveryThresholdUsd === "number" &&
        subtotalUsd >= ppOsConfig.freeDeliveryThresholdUsd;
      return isFreeByOs ? 0 : ppOsConfig.cityFeeUsd;
    }
    return computeDistrictFeeUsd(resolvedDistrict, subtotalUsd, isNoAddress);
  })();
  const expressFeeUsd = isExpress
    ? (ppOsConfig && ppOsConfig.expressSurchargeUsd > 0
        ? ppOsConfig.expressSurchargeUsd
        : expressSurchargeUsd(districtCountryPP))
    : 0;
  // Slot fee is computed server-side and included in the PayPal charge so a
  // shopper cannot pay the standard rate and then submit a premium-slot order.
  const ppSlotFeeUsd = computeSlotFeeUsd({
    expressDelivery: isExpress,
    deliverySlot: ppRawDeliverySlot,
    deliverySlotId: ppRawDeliverySlotId,
    cityId: ppRawCityId,
    deliveryDate: ppRawDeliveryDate,
    district: resolvedDistrict,
  });
  const totalUsd = subtotalUsd + districtFeeUsd + expressFeeUsd + ppSlotFeeUsd;

  const presented = normalizeCurrency(rawCurrency ?? "USD");
  const settle = paypalCurrencyFor(presented);
  const settleAmount = roundForCurrency(await convertFromUsd(totalUsd, settle), settle);

  try {
    const token = await getPayPalToken();

    const r = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "PayPal-Request-Id": orderId,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: orderId,
            amount: {
              currency_code: settle,
              value: settleAmount.toFixed(2),
            },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              payment_method_preference: "IMMEDIATE_PAYMENT_REQUIRED",
              landing_page: "LOGIN",
              user_action: "PAY_NOW",
              return_url: returnUrl,
              cancel_url: cancelUrl,
            },
          },
        },
      }),
    });

    const data = (await r.json()) as any;

    if (!r.ok) {
      return res
        .status(r.status)
        .json({ ok: false, code: "paypal_error", message: data?.message ?? "PayPal error" }); // i18n-ignore
    }

    const approveLink =
      data.links?.find((l: any) => l.rel === "payer-action")?.href ??
      data.links?.find((l: any) => l.rel === "approve")?.href;

    // Store the intent with the full cart snapshot so /woo/order can verify:
    //   1. orderId↔paymentRef binding (prevents replay for a different order)
    //   2. submitted cart matches the paid-for cart (prevents cart substitution)
    storePaymentIntent({
      orderId,
      paymentRef: String(data.id),
      provider: "paypal",
      currency: settle,
      totalUsd,
      snapshot: {
        items: catalogResult.items.map((i) => ({
          wcId: i.wcId,
          osSlug: i.osSlug,
          quantity: i.quantity,
          priceUsd: i.priceUsd,
        })),
        district: resolvedDistrict,
        expressDelivery: isExpress,
        noAddress: isNoAddress,
        deliverySlot: ppRawDeliverySlot ?? "",
        districtFeeUsd,
        expressFeeUsd,
        slotFeeUsd: ppSlotFeeUsd,
      },
    });

    return res.json({
      ok: true,
      url: approveLink,
      id: data.id,
      amount: settleAmount,
      currency: settle,
      presentedCurrency: presented,
    });
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, code: "paypal_error", message: e?.message ?? "PayPal error" }); // i18n-ignore
  }
});

// ── Tabby BNPL ───────────────────────────────────────────────────────────────
// Pay-in-4 installments, AED only, UAE shoppers only.
// Secrets: TABBY_SECRET_KEY (required), TABBY_PUBLIC_KEY (optional, served to
// frontend promo snippets via /api/payment/tabby/public-key).
//
// Route overview:
//   POST /payment/tabby          → create Tabby checkout session, return hosted URL
//   POST /payment/tabby/webhook  → receive authorized-payment event, capture funds
//   POST /payment/tabby/refund   → admin-only partial/full refund

const TABBY_API_BASE = "https://api.tabby.ai/api/v2";

router.post("/payment/tabby", async (req, res) => {
  const key = process.env.TABBY_SECRET_KEY;
  if (!key) {
    return res.status(503).json({
      ok: false,
      code: "tabby_not_configured",
      message: "Tabby is not configured. Add TABBY_SECRET_KEY to enable.", // i18n-ignore
    });
  }

  const {
    items,
    orderId,
    district,
    expressDelivery,
    noAddress,
    currency: rawCurrency,
    email,
    firstName,
    lastName,
    returnUrl,
    failureReturnUrl,
    deliverySlot: tabbyRawDeliverySlot,
    deliverySlotId: tabbyRawDeliverySlotId,
    cityId: tabbyRawCityId,
    deliveryDate: tabbyRawDeliveryDate,
  } = req.body as {
    items: { wcId: number; osSlug?: string; quantity: number }[];
    orderId: string;
    district?: string;
    expressDelivery?: boolean;
    noAddress?: boolean;
    currency?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    returnUrl: string;
    failureReturnUrl: string;
    deliverySlot?: string;
    deliverySlotId?: string;
    cityId?: string;
    deliveryDate?: string;
  };

  if (!orderId) {
    return res.status(400).json({ ok: false, message: "orderId is required" }); // i18n-ignore
  }
  if (!returnUrl || !failureReturnUrl) {
    return res.status(400).json({ ok: false, message: "returnUrl and failureReturnUrl are required" }); // i18n-ignore
  }
  const tabbyReturnUrlErr = validateRedirectUrl(returnUrl, "payment-return");
  if (tabbyReturnUrlErr) {
    return res.status(400).json({ ok: false, code: "invalid_redirect_url", message: tabbyReturnUrlErr }); // i18n-ignore
  }
  const tabbyFailureReturnUrlErr = validateRedirectUrl(failureReturnUrl, "payment-return");
  if (tabbyFailureReturnUrlErr) {
    return res.status(400).json({ ok: false, code: "invalid_redirect_url", message: tabbyFailureReturnUrlErr }); // i18n-ignore
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, message: "items is required" }); // i18n-ignore
  }

  // Resolve catalog prices server-side.
  const tabbyStore = resolveStoreFromRequest(req);
  const catalogResult = await resolveCartItems(items, tabbyStore);
  if (!catalogResult.ok) {
    return res.status(422).json({ ok: false, code: "catalog_error", message: catalogResult.message });
  }

  const resolvedDistrict = district ?? "Dubai";
  const isExpress = expressDelivery === true;
  const isNoAddress = noAddress === true;
  const subtotalUsd = catalogResult.subtotalUsd;
  const districtCountry = countryForDistrict(resolvedDistrict);
  // Bugs A+B fix: prefer OS city-level delivery config (keyed by cityId) so the
  // Tabby charge matches the fee wooOrders.ts will record at order creation.
  const tabbyOsConfig = tabbyRawCityId ? resolveOsDeliveryConfig(districtCountry, tabbyRawCityId) : null;
  const districtFeeUsd = (() => {
    if (!isNoAddress && tabbyOsConfig && typeof tabbyOsConfig.cityFeeUsd === "number") {
      const isFreeByOs =
        tabbyOsConfig.freeDeliveryEnabled === true &&
        typeof tabbyOsConfig.freeDeliveryThresholdUsd === "number" &&
        subtotalUsd >= tabbyOsConfig.freeDeliveryThresholdUsd;
      return isFreeByOs ? 0 : tabbyOsConfig.cityFeeUsd;
    }
    return computeDistrictFeeUsd(resolvedDistrict, subtotalUsd, isNoAddress);
  })();
  const expressFeeUsd = isExpress
    ? (tabbyOsConfig && tabbyOsConfig.expressSurchargeUsd > 0
        ? tabbyOsConfig.expressSurchargeUsd
        : expressSurchargeUsd(districtCountry))
    : 0;
  const tabbySlotFeeUsd = computeSlotFeeUsd({
    expressDelivery: isExpress,
    deliverySlot: tabbyRawDeliverySlot,
    deliverySlotId: tabbyRawDeliverySlotId,
    cityId: tabbyRawCityId,
    deliveryDate: tabbyRawDeliveryDate,
    district: resolvedDistrict,
  });
  const totalUsd = subtotalUsd + districtFeeUsd + expressFeeUsd + tabbySlotFeeUsd;

  // Tabby settles in AED only — convert the server-computed USD total.
  const aedAmount = roundForCurrency(await convertFromUsd(totalUsd, "AED"), "AED");

  // Tabby minimum is 1.00 AED.
  if (aedAmount < 1) {
    return res.status(422).json({
      ok: false,
      code: "tabby_amount_too_small",
      message: `Tabby requires a minimum of 1.00 AED. Your order total is ${aedAmount.toFixed(2)} AED.`, // i18n-ignore
    });
  }

  const buyerName = [firstName, lastName].filter(Boolean).join(" ") || "Guest"; // i18n-ignore

  // Pre-convert per-item and shipping amounts to AED in parallel.
  const [shippingAed, ...itemAedPrices] = await Promise.all([
    convertFromUsd(districtFeeUsd, "AED"),
    ...catalogResult.items.map((i) => convertFromUsd(i.priceUsd, "AED")),
  ]);

  // Build Tabby checkout request.
  const outgoing = {
    payment: {
      amount: aedAmount.toFixed(2),
      currency: "AED",
      description: `Presentail order ${orderId}`, // i18n-ignore
      buyer: {
        phone: "",
        email: email ?? "",
        name: buyerName,
        dob: null,
      },
      buyer_history: {
        registered_since: new Date().toISOString(),
        loyalty_level: 0,
        is_phone_number_verified: false,
        is_id_verified: false,
      },
      order: {
        tax_amount: "0.00",
        shipping_amount: roundForCurrency(shippingAed, "AED").toFixed(2),
        discount_amount: "0.00",
        updated_at: new Date().toISOString(),
        reference_id: orderId,
        items: catalogResult.items.map((i, idx) => ({
          title: i.name,
          description: i.name,
          sku: i.osSlug ?? String(i.wcId),
          quantity: i.quantity,
          unit_price: roundForCurrency(itemAedPrices[idx] ?? 0, "AED").toFixed(2),
          discount_amount: "0.00",
          reference_id: i.osSlug ?? String(i.wcId),
          image_url: "",
        })),
      },
      order_history: [],
      shipping_address: {
        city: "Dubai",
        address: resolvedDistrict,
        zip: "",
      },
      meta: {
        order_id: orderId,
        customer: email ?? orderId,
      },
    },
    lang: "en",
    merchant_urls: {
      success: returnUrl,
      cancel: failureReturnUrl,
      failure: failureReturnUrl,
    },
  };

  try {
    const r = await fetch(`${TABBY_API_BASE}/checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(outgoing),
    });

    const rawBody = await r.text();
    let data: any = null;
    try {
      data = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      data = null;
    }

    if (!r.ok) {
      const msg =
        (typeof data?.error === "string" && data.error) ||
        (typeof data?.message === "string" && data.message) ||
        `Tabby rejected the request (HTTP ${r.status}).`; // i18n-ignore
      req.log.warn({ tabbyStatus: r.status, tabbyBody: rawBody.slice(0, 1000) }, "Tabby checkout creation failed"); // i18n-ignore
      return res.status(r.status >= 500 ? 502 : 422).json({ ok: false, code: "tabby_error", message: msg });
    }

    // Tabby v2 checkout response: status "created" | "rejected"
    if (data?.status === "rejected") {
      return res.status(422).json({
        ok: false,
        code: "tabby_rejected",
        message: data?.rejection_reason ?? "Tabby rejected this payment request.", // i18n-ignore
      });
    }

    // Extract the installments web URL from the response.
    const webUrl: string | undefined =
      data?.payment?.web_url ??
      data?.configuration?.available_products?.installments?.[0]?.web_url;

    if (!webUrl) {
      req.log.warn({ tabbyData: JSON.stringify(data).slice(0, 500) }, "Tabby response missing web_url"); // i18n-ignore
      return res.status(502).json({ ok: false, code: "tabby_no_url", message: "Tabby did not return a checkout URL." }); // i18n-ignore
    }

    const paymentId: string = data?.payment?.id ?? data?.id ?? orderId;

    storePaymentIntent({
      orderId,
      paymentRef: paymentId,
      provider: "tabby",
      currency: "AED",
      totalUsd,
      snapshot: {
        items: catalogResult.items.map((i) => ({
          wcId: i.wcId,
          osSlug: i.osSlug,
          quantity: i.quantity,
          priceUsd: i.priceUsd,
        })),
        district: resolvedDistrict,
        expressDelivery: isExpress,
        noAddress: isNoAddress,
        deliverySlot: tabbyRawDeliverySlot ?? "",
        districtFeeUsd,
        expressFeeUsd,
        slotFeeUsd: tabbySlotFeeUsd,
      },
    });

    return res.json({
      ok: true,
      url: webUrl,
      id: paymentId,
      amount: aedAmount,
      currency: "AED",
    });
  } catch (e: any) {
    req.log.error({ err: e }, "Tabby checkout request threw"); // i18n-ignore
    return res.status(500).json({ ok: false, code: "tabby_error", message: e?.message ?? "Tabby error" }); // i18n-ignore
  }
});

// Expose public key for frontend promo snippets (no secret leakage).
router.get("/payment/tabby/public-key", (_req, res) => {
  const pub = process.env.TABBY_PUBLIC_KEY;
  if (!pub) return res.status(503).json({ ok: false, message: "Tabby public key not configured." }); // i18n-ignore
  return res.json({ ok: true, publicKey: pub });
});

// Tabby sends a webhook with {id, status} when a payment is authorized.
// We re-fetch the payment to verify status, then capture funds.
router.post("/payment/tabby/webhook", async (req, res) => {
  const key = process.env.TABBY_SECRET_KEY;
  if (!key) {
    return res.status(503).json({ ok: false, message: "Tabby not configured." }); // i18n-ignore
  }

  const { id: paymentId } = req.body as { id?: string; status?: string };
  if (!paymentId) {
    return res.status(400).json({ ok: false, message: "Missing payment id in webhook body." }); // i18n-ignore
  }

  try {
    // Verify payment status directly with Tabby before capturing.
    const verify = await fetch(`${TABBY_API_BASE}/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const payment = (await verify.json()) as any;

    if (!verify.ok || payment?.status?.toUpperCase() !== "AUTHORIZED") {
      req.log.info({ paymentId, status: payment?.status }, "Tabby webhook: payment not AUTHORIZED, skipping capture"); // i18n-ignore
      // Acknowledge without error so Tabby does not retry.
      return res.json({ ok: true, captured: false });
    }

    // Capture the authorized payment.
    const capture = await fetch(`${TABBY_API_BASE}/payments/${paymentId}/captures`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ amount: payment.amount }),
    });

    if (!capture.ok) {
      const body = await capture.text();
      req.log.error({ paymentId, captureStatus: capture.status, body: body.slice(0, 500) }, "Tabby capture failed"); // i18n-ignore
      return res.status(502).json({ ok: false, message: "Tabby capture failed." }); // i18n-ignore
    }

    req.log.info({ paymentId }, "Tabby payment captured"); // i18n-ignore
    return res.json({ ok: true, captured: true });
  } catch (e: any) {
    req.log.error({ err: e }, "Tabby webhook handler threw"); // i18n-ignore
    return res.status(500).json({ ok: false, message: e?.message ?? "Tabby webhook error" }); // i18n-ignore
  }
});

// Admin-only refund endpoint. Protected by PUSH_ADMIN_TOKEN.
router.post("/payment/tabby/refund", async (req, res) => {
  const adminToken = process.env.PUSH_ADMIN_TOKEN;
  const provided = req.headers["x-push-admin-token"] ?? req.body?.adminToken;
  if (!adminToken || !provided || provided !== adminToken) {
    return res.status(401).json({ ok: false, message: "Unauthorized." }); // i18n-ignore
  }

  const key = process.env.TABBY_SECRET_KEY;
  if (!key) {
    return res.status(503).json({ ok: false, message: "Tabby not configured." }); // i18n-ignore
  }

  const { paymentId, amount } = req.body as { paymentId?: string; amount?: string };
  if (!paymentId || !amount) {
    return res.status(400).json({ ok: false, message: "paymentId and amount are required." }); // i18n-ignore
  }

  try {
    const r = await fetch(`${TABBY_API_BASE}/payments/${paymentId}/refunds`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ amount }),
    });

    const data = (await r.json()) as any;
    if (!r.ok) {
      return res.status(r.status >= 500 ? 502 : 422).json({
        ok: false,
        message: data?.message ?? `Tabby refund failed (HTTP ${r.status}).`, // i18n-ignore
      });
    }

    req.log.info({ paymentId, amount }, "Tabby refund issued"); // i18n-ignore
    return res.json({ ok: true, refund: data });
  } catch (e: any) {
    return res.status(500).json({ ok: false, message: e?.message ?? "Tabby refund error" }); // i18n-ignore
  }
});

// ── CyberSource Unified Checkout ─────────────────────────────────────────────
// Gate: LB only (USD, Lebanon merchant account).
// Two endpoints:
//   POST /payment/cybersource/capture-context  — resolves server-side cart
//       total and returns a short-lived CyberSource Capture Context JWT for
//       the client-side Microform SDK.
//   POST /payment/cybersource/charge           — accepts the transient-token
//       JWT produced by Microform, re-verifies the server-side total, charges
//       the card, and stores a payment intent binding orderId↔"cybs:{id}".
//
// Security model (mirrors Stripe/Mamo/PayPal):
//   • All amounts derived from Presentail OS catalog — client-supplied prices
//     are never trusted.
//   • Transient token never touches the server as a raw PAN.
//   • storePaymentIntent binds paymentRef to orderId + cart snapshot before
//     returning, so /woo/order can reject any replay or cart substitution.
import {
  isCybersourceConfigured,
  generateCaptureContext,
  authorizeAndCapture,
  isUnifiedCheckoutEnabled,
  generateUnifiedCheckoutSession,
  isApprovedPaymentStatus,
  verifyUnifiedCheckoutPayment,
  type PayerAuthenticationData,
} from "../lib/cybersource";
import { pickClientIp, lookupCountryFromIp } from "../lib/geoCurrency";
import {
  isPayerAuthEnabled,
  setupPayerAuth,
  checkEnrollment,
  validateAuthentication,
} from "../lib/cybersource-payer-auth";

// Allowed origins for the Microform capture context — whitelist only.
// The deployment origins from REPLIT_DOMAINS are added at runtime so the
// mobile WebView (which loads the tokenizer from the API server's own domain)
// is always covered without hardcoding environment-specific hostnames.
const CYBERSOURCE_EXTRA_ORIGINS = new Set([
  "https://new.presentail.com", // allow-legacy-domain — kept only as capture-context origin
  "http://localhost:3000",
  "http://localhost:5173",
]);

// Build the allowed-origins set once, lazily.  Includes presentail.com, any
// domain from REPLIT_DOMAINS (e.g. *.replit.app in production), and the static
// extra set above.  Same pattern as validateRedirectUrl.ts allowedHosts().
let _cachedCsOrigins: Set<string> | null = null;
function cybersourceAllowedOrigins(): Set<string> {
  if (_cachedCsOrigins) return _cachedCsOrigins;
  const s = new Set(CYBERSOURCE_EXTRA_ORIGINS);
  s.add("https://presentail.com");
  const replitDomains = process.env.REPLIT_DOMAINS ?? "";
  for (const d of replitDomains.split(",")) {
    const trimmed = d.trim();
    if (trimmed) s.add(`https://${trimmed}`);
  }
  _cachedCsOrigins = s;
  return s;
}

// Derive target origins for the capture context.  Always includes
// presentail.com + REPLIT_DOMAINS so the mobile WebView (served from the API
// server's own origin) can initialise Microform.  The client may pass an
// additional `targetOrigin` body field for dev overrides; validated server-side.
function resolveTargetOrigins(bodyOrigin?: string): string[] {
  const allowed = cybersourceAllowedOrigins();
  const base = ["https://presentail.com"];
  // Auto-include REPLIT_DOMAINS origins (covers mobile WebView in all envs)
  const replitDomains = process.env.REPLIT_DOMAINS ?? "";
  for (const d of replitDomains.split(",")) {
    const trimmed = d.trim();
    if (trimmed) {
      const origin = `https://${trimmed}`;
      if (!base.includes(origin)) base.push(origin);
    }
  }
  // CRITICAL for the Replit workspace preview: the app itself runs inside an
  // iframe hosted on replit.com, and CyberSource enforces targetOrigins via
  // CSP frame-ancestors — which the browser checks against EVERY ancestor
  // origin in the chain (flex iframe → app page → replit.com workspace).
  // Without replit.com in the list, the Microform iframes render
  // "flex.cybersource.com refused to connect" inside the preview pane even
  // though the iframe src is correct.  Harmless in production (no replit.com
  // ancestor exists there) and only added when running on Replit.
  if (replitDomains.trim()) {
    if (!base.includes("https://replit.com")) base.push("https://replit.com");
  }
  if (bodyOrigin && allowed.has(bodyOrigin) && !base.includes(bodyOrigin)) {
    base.push(bodyOrigin);
  }
  return base;
}

// ── Dev-only: decode a capture context JWT without any library ────────────
// Returns the payload fields needed to diagnose Microform issues.
// Never exposed in production.
function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("Not a 3-segment JWT"); // i18n-ignore
  const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, "base64").toString("utf-8"));
}

// Extract the versioned SDK URL and SRI integrity hash from the capture-context
// JWT so callers load the exact SDK version the capture context was built for.
// Per CyberSource docs: always use ctx[0].data.clientLibrary, not a hardcoded URL.
function extractClientLibraryInfo(jwt: string): {
  clientLibrary?: string;
  clientLibraryIntegrity?: string;
} {
  try {
    const payload = decodeJwtPayload(jwt) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const ctx = Array.isArray(payload?.ctx) ? payload.ctx[0]?.data : undefined;
    // Microform v2 and Unified Checkout v0 JWTs carry the SDK URL under
    // ctx[0].data; tolerate a flat data block too (observed in UC v1 docs'
    // session-response examples) so the extractor works for both shapes.
    const flat = payload?.data && typeof payload.data === "object" ? payload.data : undefined;
    return {
      clientLibrary: ctx?.clientLibrary ?? flat?.clientLibrary ?? undefined,
      clientLibraryIntegrity: ctx?.clientLibraryIntegrity ?? flat?.clientLibraryIntegrity ?? undefined,
    };
  } catch {
    return {};
  }
}

// GET /payment/cybersource/test-capture-context  (dev only)
// Returns a minimal capture context for the isolated /cs-test.html diagnostic
// page.  Uses a $1.00 dummy total so item pricing logic is not needed.
router.get("/payment/cybersource/test-capture-context", async (req, res) => {
  if (process.env.NODE_ENV === "production") return res.status(404).end();
  if (!isCybersourceConfigured()) {
    return res.status(503).json({ ok: false, message: "CyberSource not configured." }); // i18n-ignore
  }
  const pageOrigin =
    (req.headers.origin as string | undefined) ||
    (req.query.origin as string | undefined) ||
    (req.query.pageOrigin as string | undefined) ||
    (() => {
      const first = (process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim();
      return first ? `https://${first}` : "http://localhost:5173";
    })();
  const targetOrigins = resolveTargetOrigins(pageOrigin);
  const result = await generateCaptureContext({ targetOrigins, totalAmount: "1.00", currency: "USD" });
  if (!result.ok) {
    return res.status(502).json({ ok: false, message: result.message }); // i18n-ignore
  }
  const environment = (process.env.CYBERSOURCE_ENVIRONMENT ?? "test") as "test" | "live";
  const { clientLibrary, clientLibraryIntegrity } = extractClientLibraryInfo(result.captureContext);
  return res.json({ ok: true, captureContext: result.captureContext, environment, targetOrigins, clientLibrary, clientLibraryIntegrity });
});

// POST /payment/cybersource/decode-context  (dev only)
// Decodes the capture-context JWT payload and returns the fields needed to
// diagnose Microform issues (targetOrigins, environment, exp, etc.).
// Does NOT expose raw credentials or the full token back to the caller.
router.post("/payment/cybersource/decode-context", (req, res) => {
  if (process.env.NODE_ENV === "production") return res.status(404).end();
  const { captureContext } = req.body as { captureContext?: string };
  if (!captureContext || typeof captureContext !== "string") {
    return res.status(400).json({ ok: false, message: "captureContext required" }); // i18n-ignore
  }
  try {
    const payload = decodeJwtPayload(captureContext) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    // CyberSource Flex Microform v2 JWT structure:
    //   payload.ctx[0].data.targetOrigins, .allowedCardNetworks, .allowedPaymentTypes
    //   payload.iss, payload.exp, payload.jti
    const ctx = Array.isArray(payload?.ctx) ? payload.ctx[0]?.data : undefined;
    return res.json({
      ok: true,
      iss: payload?.iss,
      exp: payload?.exp,
      expDate: payload?.exp ? new Date((payload.exp as number) * 1000).toISOString() : undefined,
      targetOrigins: ctx?.targetOrigins,
      allowedCardNetworks: ctx?.allowedCardNetworks,
      allowedPaymentTypes: ctx?.allowedPaymentTypes,
      environment: ctx?.clientLibraryIntegrity ? "live" : payload?.environment,
      pageOriginForDiag: req.headers.origin ?? "(no Origin header sent)", // i18n-ignore
    });
  } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return res.status(422).json({ ok: false, message: e?.message });
  }
});

// Rollout gate: set CYBERSOURCE_CHECKOUT_ENABLED=true to show the CyberSource
// card tile in the web checkout for Lebanon+USD shoppers.  When absent or any
// other value, the tile is hidden and Stripe handles LB+USD cards instead.
function isCybersourceCheckoutEnabled(): boolean {
  return process.env.CYBERSOURCE_CHECKOUT_ENABLED === "true";
}

router.get("/payment/cybersource/available", (_req, res) => {
  const available = isCybersourceConfigured() && isCybersourceCheckoutEnabled();
  return res.json({
    available,
    merchantId: available ? getCybersourceMerchantId() : undefined,
    environment: available ? getCybersourceEnvironment() : undefined,
    // Payer Authentication (3DS) flag for the web checkout. False when PA
    // credentials are missing or CYBERSOURCE_PAYER_AUTH_ENABLED !== "true" —
    // the frontend must treat an absent field as false (older cached shapes).
    payerAuthEnabled: available ? isPayerAuthEnabled() : false,
    // Unified Checkout (v1) flag. The web checkout only renders the UC widget
    // when BOTH this server flag and its own VITE_ flag are true — keeping the
    // two sides in lockstep so a half-enabled rollout can never strand the
    // shopper without a working card form.
    unifiedCheckoutEnabled: available ? isUnifiedCheckoutEnabled() : false,
  });
});

router.post("/payment/cybersource/capture-context", async (req, res) => {
  if (!isCybersourceConfigured()) {
    return res.status(503).json({ ok: false, message: "CyberSource not configured." }); // i18n-ignore
  }

  const {
    items,
    orderId,
    district,
    expressDelivery,
    noAddress,
    deliverySlot: rawDeliverySlot,
    deliverySlotId: rawDeliverySlotId,
    cityId: rawCityId,
    deliveryDate: rawDeliveryDate,
    targetOrigin: bodyOrigin,
  } = req.body as {
    items: { wcId: number; osSlug?: string; quantity: number }[];
    orderId?: string;
    district?: string;
    expressDelivery?: boolean;
    noAddress?: boolean;
    deliverySlot?: string;
    deliverySlotId?: string;
    cityId?: string;
    deliveryDate?: string;
    targetOrigin?: string;
  };

  if (!orderId) {
    return res.status(400).json({ ok: false, message: "orderId is required" }); // i18n-ignore
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, message: "items is required" }); // i18n-ignore
  }

  const store = resolveStoreFromRequest(req);
  if (store.storeKey !== "lebanon") {
    return res.status(400).json({ ok: false, message: "CyberSource is only available for the Lebanon storefront." }); // i18n-ignore
  }

  const catalogResult = await resolveCartItems(items, store);
  if (!catalogResult.ok) {
    return res.status(422).json({ ok: false, code: "catalog_error", message: catalogResult.message });
  }

  const resolvedDistrict = district ?? "Beirut";
  const isExpress = expressDelivery === true;
  const isNoAddress = noAddress === true;
  const subtotalUsd = catalogResult.subtotalUsd;
  const csWalletCountry = countryForDistrict(resolvedDistrict);
  // Bugs A+B fix: prefer OS city-level delivery config (keyed by cityId) so the
  // capture-context total matches the fee wooOrders.ts will record at order creation.
  const csWalletOsConfig = rawCityId ? resolveOsDeliveryConfig(csWalletCountry, rawCityId) : null;
  const districtFeeUsd = (() => {
    if (!isNoAddress && csWalletOsConfig && typeof csWalletOsConfig.cityFeeUsd === "number") {
      const isFreeByOs =
        csWalletOsConfig.freeDeliveryEnabled === true &&
        typeof csWalletOsConfig.freeDeliveryThresholdUsd === "number" &&
        subtotalUsd >= csWalletOsConfig.freeDeliveryThresholdUsd;
      return isFreeByOs ? 0 : csWalletOsConfig.cityFeeUsd;
    }
    return computeDistrictFeeUsd(resolvedDistrict, subtotalUsd, isNoAddress);
  })();
  const expressFeeUsd = isExpress
    ? (csWalletOsConfig && csWalletOsConfig.expressSurchargeUsd > 0
        ? csWalletOsConfig.expressSurchargeUsd
        : expressSurchargeUsd(csWalletCountry))
    : 0;
  const slotFeeUsd = computeSlotFeeUsd({
    expressDelivery: isExpress,
    deliverySlot: rawDeliverySlot,
    deliverySlotId: rawDeliverySlotId,
    cityId: rawCityId,
    deliveryDate: rawDeliveryDate,
    district: resolvedDistrict,
  });
  const totalUsd = subtotalUsd + districtFeeUsd + expressFeeUsd + slotFeeUsd;
  const totalAmount = totalUsd.toFixed(2);

  const targetOrigins = resolveTargetOrigins(bodyOrigin);

  // ── Wallet eligibility: IP must resolve to Lebanon + currency is USD ─────────
  // Per spec: determine country from IP only — never from delivery/billing address.
  const xff = req.headers["x-forwarded-for"];
  const clientIp = pickClientIp(xff, (req.ip ?? "").toString());
  const geoOutcome = await lookupCountryFromIp(clientIp);
  const ipCountry = geoOutcome.country ?? null;
  const walletsEligible = ipCountry === "LB";

  req.log.info(
    {
      PAYMENT_DIAG: true,
      stage: "capture_context",
      orderId,
      merchantId: getCybersourceMerchantId(),
      environment: getCybersourceEnvironment(),
      clientIp: clientIp.slice(0, 7) + "…",
      ipCountry,
      walletsEligible,
    },
    "CyberSource capture context: wallet eligibility resolved", // i18n-ignore
  );

  // Wallet eligibility only drives the response flags below (wallet tile
  // visibility + Google Pay merchant ID). It must NOT be merged into the
  // Microform session request — /microform/v2/sessions accepts only CARD/CHECK
  // payment types; sending GOOGLEPAY/APPLEPAY made live CyberSource reject
  // every capture context (UNIFIEDPAYMENTS_VALIDATION_FIELDS, 2026-07-27) and
  // silently pushed all Lebanon card shoppers to the Stripe fallback.
  const result = await generateCaptureContext({ targetOrigins, totalAmount, currency: "USD" });
  if (!result.ok) {
    const failureDiag = (result as any).diag as { httpStatus?: number } | undefined;
    req.log.warn(
      {
        PAYMENT_DIAG: true,
        stage: "capture_context",
        orderId,
        merchantId: getCybersourceMerchantId(),
        environment: getCybersourceEnvironment(),
        httpStatus: failureDiag?.httpStatus,
        reason: "capture_context_failed",
        message: result.message,
        diag: (result as any).diag,
      },
      "CyberSource capture context failed",
    );
    return res.status(502).json({ ok: false, code: "cybersource_error", message: result.message });
  }

  const environment = (process.env.CYBERSOURCE_ENVIRONMENT ?? "test") as "test" | "live";
  const { clientLibrary, clientLibraryIntegrity } = extractClientLibraryInfo(result.captureContext);
  const merchantId = getCybersourceMerchantId();
  const googlePayMerchantId = getCybersourceGooglePayMerchantId();

  req.log.info(
    { PAYMENT_DIAG: true, stage: "capture_context", orderId, merchantId, environment, totalUsd, clientLibrary, walletsEligible },
    "CyberSource capture context created",
  );
  return res.json({
    ok: true,
    captureContext: result.captureContext,
    totalUsd,
    environment,
    clientLibrary,
    clientLibraryIntegrity,
    merchantId,
    googlePayMerchantId: walletsEligible && googlePayMerchantId ? googlePayMerchantId : undefined,
    applePayEnabled: walletsEligible,
    googlePayEnabled: walletsEligible && !!googlePayMerchantId,
  });
});

router.post("/payment/cybersource/charge", async (req, res) => {
  if (!isCybersourceConfigured()) {
    return res.status(503).json({ ok: false, message: "CyberSource not configured." }); // i18n-ignore
  }

  const {
    orderId,
    transientTokenJwt,
    items,
    district,
    expressDelivery,
    noAddress,
    deliverySlot: rawDeliverySlot,
    deliverySlotId: rawDeliverySlotId,
    cityId: rawCityId,
    deliveryDate: rawDeliveryDate,
    billingDetails: rawBilling,
    payerAuthData,
    paymentAttemptId,
  } = req.body as {
    orderId: string;
    transientTokenJwt: string;
    items: { wcId: number; osSlug?: string; quantity: number }[];
    district?: string;
    expressDelivery?: boolean;
    noAddress?: boolean;
    deliverySlot?: string;
    deliverySlotId?: string;
    cityId?: string;
    deliveryDate?: string;
    billingDetails?: {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
    };
    payerAuthData?: PayerAuthenticationData;
    /** Client-generated attempt UUID — logged for cross-stage correlation. */
    paymentAttemptId?: string;
  };

  // Log every early validation reject at WARN with safe request-shape info
  // (never the token itself, PAN, or CVC) — a silent 400 here previously made
  // shopper-reported "card payment unavailable" errors undiagnosable from logs.
  const rejectShape = {
    hasOrderId: Boolean(orderId),
    tokenType: typeof transientTokenJwt,
    tokenSegments:
      typeof transientTokenJwt === "string" ? transientTokenJwt.split(".").length : null,
    itemCount: Array.isArray(items) ? items.length : null,
  };

  if (!orderId) {
    req.log.warn({ ...rejectShape, check: "orderId" }, "CyberSource charge rejected: missing orderId");
    return res.status(400).json({ ok: false, message: "orderId is required" }); // i18n-ignore
  }
  if (!transientTokenJwt) {
    req.log.warn({ ...rejectShape, orderId, check: "transientTokenJwt" }, "CyberSource charge rejected: missing transientTokenJwt");
    return res.status(400).json({ ok: false, message: "transientTokenJwt is required" }); // i18n-ignore
  }
  if (!Array.isArray(items) || items.length === 0) {
    req.log.warn({ ...rejectShape, orderId, check: "items" }, "CyberSource charge rejected: missing/empty items");
    return res.status(400).json({ ok: false, message: "items is required" }); // i18n-ignore
  }

  // When Payer Authentication is enabled, the charge endpoint must receive
  // meaningful 3DS metadata from the completed authentication flow. Accepting
  // a charge with no object, or with an empty/incomplete object, would silently
  // bypass the authentication step.
  // Minimum proof: at least one of cavv or eci/eciRaw must be present (these
  // are the fields CyberSource uses to validate the authentication outcome on
  // the /pts/v2/payments call).
  if (isPayerAuthEnabled()) {
    const hasMinimum3dsProof =
      payerAuthData &&
      typeof payerAuthData === "object" &&
      (
        (typeof payerAuthData.cavv === "string" && payerAuthData.cavv.trim() !== "") ||
        (typeof (payerAuthData.eciRaw ?? payerAuthData.eci) === "string" && (payerAuthData.eciRaw ?? payerAuthData.eci ?? "").trim() !== "")
      );
    if (!hasMinimum3dsProof) {
      req.log.warn(
        { orderId, check: "pa_required", hasPayerAuthData: !!payerAuthData },
        "CyberSource charge rejected: valid payerAuthData with 3DS proof required when Payer Auth is enabled",
      );
      return res.status(400).json({ ok: false, code: "pa_required", message: "Payer Authentication data is required." }); // i18n-ignore
    }
  }

  // Validate the transient token is a non-empty string that looks like a JWT
  // (three dot-separated segments). We do not verify the JWT signature —
  // CyberSource validates it when we submit the payment — but we reject
  // obvious garbage early to avoid a wasted round-trip.
  if (typeof transientTokenJwt !== "string" || transientTokenJwt.split(".").length !== 3) {
    req.log.warn({ ...rejectShape, orderId, check: "tokenFormat" }, "CyberSource charge rejected: transient token is not a 3-segment JWT");
    return res.status(400).json({ ok: false, message: "Invalid transient token." }); // i18n-ignore
  }

  const store = resolveStoreFromRequest(req);
  if (store.storeKey !== "lebanon") {
    req.log.warn({ ...rejectShape, orderId, storeKey: store.storeKey, check: "store" }, "CyberSource charge rejected: non-Lebanon storefront");
    return res.status(400).json({ ok: false, message: "CyberSource is only available for the Lebanon storefront." }); // i18n-ignore
  }

  const catalogResult = await resolveCartItems(items, store);
  if (!catalogResult.ok) {
    return res.status(422).json({ ok: false, code: "catalog_error", message: catalogResult.message });
  }

  const resolvedDistrict = district ?? "Beirut";
  const isExpress = expressDelivery === true;
  const isNoAddress = noAddress === true;
  const subtotalUsd = catalogResult.subtotalUsd;
  const csCountry = countryForDistrict(resolvedDistrict);
  // Bugs A+B fix: prefer OS city-level delivery config (keyed by cityId) so the
  // CyberSource card charge matches the fee wooOrders.ts will record.
  const csOsConfig = rawCityId ? resolveOsDeliveryConfig(csCountry, rawCityId) : null;
  const districtFeeUsd = (() => {
    if (!isNoAddress && csOsConfig && typeof csOsConfig.cityFeeUsd === "number") {
      const isFreeByOs =
        csOsConfig.freeDeliveryEnabled === true &&
        typeof csOsConfig.freeDeliveryThresholdUsd === "number" &&
        subtotalUsd >= csOsConfig.freeDeliveryThresholdUsd;
      return isFreeByOs ? 0 : csOsConfig.cityFeeUsd;
    }
    return computeDistrictFeeUsd(resolvedDistrict, subtotalUsd, isNoAddress);
  })();
  const expressFeeUsd = isExpress
    ? (csOsConfig && csOsConfig.expressSurchargeUsd > 0
        ? csOsConfig.expressSurchargeUsd
        : expressSurchargeUsd(csCountry))
    : 0;
  const slotFeeUsd = computeSlotFeeUsd({
    expressDelivery: isExpress,
    deliverySlot: rawDeliverySlot,
    deliverySlotId: rawDeliverySlotId,
    cityId: rawCityId,
    deliveryDate: rawDeliveryDate,
    district: resolvedDistrict,
  });
  const totalUsd = subtotalUsd + districtFeeUsd + expressFeeUsd + slotFeeUsd;
  const totalAmount = totalUsd.toFixed(2);

  const chargeResult = await authorizeAndCapture({
    transientTokenJwt,
    totalAmount,
    currency: "USD",
    orderId,
    billingDetails: rawBilling,
    payerAuthenticationData: payerAuthData,
  });

  if (!chargeResult.ok) {
    // Complete sanitized CyberSource response — never contains PAN, CVC,
    // the transient token, or the REST shared secret. The field names below
    // deliberately answer "did the 404 come from our backend or CyberSource?":
    // reaching this log line proves the backend route matched, and
    // cybersourceUrl is the exact absolute outbound URL used for the charge.
    req.log.warn(
      {
        PAYMENT_DIAG: true,
        stage: "charge",
        orderId,
        paymentAttemptId,
        merchantId: getCybersourceMerchantId(),
        environment: getCybersourceEnvironment(),
        // Payer-auth transaction ID (when 3DS ran before this charge) — kept in
        // the failure log so a PA-success-but-charge-fail case stays
        // reconcilable against CyberSource Business Center.
        paTransactionId: payerAuthData?.authenticationTransactionId,
        totalUsd,
        kind: chargeResult.kind,
        frontendRequestUrl: req.originalUrl,
        backendRouteMatched: true,
        cybersourceUrl: chargeResult.requestUrl,
        httpStatus: chargeResult.httpStatus,
        cybersourceHttpStatus: chargeResult.httpStatus,
        cybersourceContentType: chargeResult.responseContentType,
        cybersourceResponseBody: chargeResult.rawBody,
        cybersourceRequestId: chargeResult.correlationId ?? chargeResult.requestId,
        status: chargeResult.declineCode,
        reason: chargeResult.declineCode,
        message: chargeResult.message,
        details: chargeResult.details,
      },
      "CyberSource charge failed",
    );
    // Only a genuine processor decline is the shopper's problem (402).
    // Everything else — endpoint 404, auth, validation, gateway, network —
    // is a service-side error and must NOT be presented as a card decline.
    // Note: a 404 from CyberSource does NOT by itself prove the merchant is
    // not enabled for the Payments API — report the raw upstream response and
    // let ops/CyberSource support confirm entitlement.
    if (chargeResult.kind === "decline") {
      return res.status(402).json({
        ok: false,
        code: "payment_declined",
        declineCode: chargeResult.declineCode,
        requestId: chargeResult.requestId,
        cybersourceStatus: chargeResult.httpStatus,
        message: chargeResult.message,
      });
    }
    // Distinct codes let the client show an accurate message per failure
    // class instead of a blanket "card payment unavailable".
    const gatewayCode =
      chargeResult.kind === "endpoint"
        ? "gateway_endpoint_error"
        : chargeResult.kind === "auth"
          ? "gateway_auth_error"
          : chargeResult.kind === "validation"
            ? "gateway_validation_error"
            : "gateway_error";
    // The sanitized upstream identifiers (requestId, HTTP status) are safe to
    // return — they contain no card data and let the client surface/log the
    // ACTUAL processor response instead of a generic "unavailable".
    return res.status(502).json({
      ok: false,
      code: gatewayCode,
      declineCode: chargeResult.declineCode,
      requestId: chargeResult.requestId,
      cybersourceStatus: chargeResult.httpStatus,
      message: chargeResult.message,
    });
  }

  const paymentRef = `cybs:${chargeResult.paymentId}`;

  // Bind orderId↔paymentRef before returning so /woo/order can verify cart
  // snapshot and reject any replay attempt.
  storePaymentIntent({
    orderId,
    paymentRef,
    provider: "cybersource",
    currency: "USD",
    totalUsd,
    snapshot: {
      items: catalogResult.items.map((i) => ({
        wcId: i.wcId,
        osSlug: i.osSlug,
        quantity: i.quantity,
        priceUsd: i.priceUsd,
      })),
      district: resolvedDistrict,
      expressDelivery: isExpress,
      noAddress: isNoAddress,
      deliverySlot: rawDeliverySlot ?? "",
      districtFeeUsd,
      expressFeeUsd,
      slotFeeUsd,
    },
  });

  req.log.info(
    {
      PAYMENT_DIAG: true,
      stage: "charge",
      orderId,
      paymentAttemptId,
      merchantId: getCybersourceMerchantId(),
      environment: getCybersourceEnvironment(),
      paTransactionId: payerAuthData?.authenticationTransactionId,
      cybersourceRequestId: chargeResult.paymentId,
      status: chargeResult.status,
      paymentRef,
      totalUsd,
    },
    "CyberSource charge succeeded",
  );

  return res.json({ ok: true, paymentRef });
});

// ── Unified Checkout (v1) routes ─────────────────────────────────────────────
// CyberSource-mandated migration for the LB+USD web card flow (task: replace
// Microform v2 + manual Payer Auth with Unified Checkout + 3DS). Two routes:
//
//   POST /payment/cybersource/unified-checkout/session — resolves the
//       server-side cart total and creates a UC v1 session (capture context)
//       whose completeMandate { type: "CAPTURE", consumerAuthentication: "3DS" }
//       makes the UC SDK run 3DS and the authorization+capture itself in the
//       browser (autoProcessing). None of the /payer-auth/* endpoints are
//       involved in this flow.
//
//   POST /payment/cybersource/unified-checkout/complete — accepts the UC
//       payment result, enforces the strict paid gate (approved === true +
//       non-empty requestId + explicitly approved status), re-verifies the
//       server-side total against the session, and binds
//       orderId↔"cybs:{requestId}" via storePaymentIntent so /woo/order can
//       finalize the order. Any other outcome leaves the order unpaid.
//
// Pending-session records (orderId → session total) let the complete step
// verify the amount UC actually charged still matches the submitted cart.
type UcPendingSession = {
  totalUsd: number;
  paymentAttemptId?: string;
  createdAt: number;
};
const ucPendingSessions = new Map<string, UcPendingSession>(); // keyed by orderId
const UC_SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours — outlives any realistic checkout dwell
function sweepUcPendingSessions(): void {
  const now = Date.now();
  for (const [key, rec] of ucPendingSessions) {
    if (now - rec.createdAt > UC_SESSION_TTL_MS) ucPendingSessions.delete(key);
  }
}

// Server-side fee/total computation shared by the two UC routes — identical
// rules to the Microform capture-context/charge routes (OS city-level config
// preferred, district fallback), so a UC-charged total always matches what
// wooOrders.ts will record at order creation.
function computeUcServerTotals(args: {
  subtotalUsd: number;
  district?: string;
  expressDelivery?: boolean;
  noAddress?: boolean;
  deliverySlot?: string;
  deliverySlotId?: string;
  cityId?: string;
  deliveryDate?: string;
}): {
  totalUsd: number;
  districtFeeUsd: number;
  expressFeeUsd: number;
  slotFeeUsd: number;
  resolvedDistrict: string;
  isExpress: boolean;
  isNoAddress: boolean;
} {
  const resolvedDistrict = args.district ?? "Beirut"; // i18n-ignore
  const isExpress = args.expressDelivery === true;
  const isNoAddress = args.noAddress === true;
  const subtotalUsd = args.subtotalUsd;
  const ucCountry = countryForDistrict(resolvedDistrict);
  const ucOsConfig = args.cityId ? resolveOsDeliveryConfig(ucCountry, args.cityId) : null;
  const districtFeeUsd = (() => {
    if (!isNoAddress && ucOsConfig && typeof ucOsConfig.cityFeeUsd === "number") {
      const isFreeByOs =
        ucOsConfig.freeDeliveryEnabled === true &&
        typeof ucOsConfig.freeDeliveryThresholdUsd === "number" &&
        subtotalUsd >= ucOsConfig.freeDeliveryThresholdUsd;
      return isFreeByOs ? 0 : ucOsConfig.cityFeeUsd;
    }
    return computeDistrictFeeUsd(resolvedDistrict, subtotalUsd, isNoAddress);
  })();
  const expressFeeUsd = isExpress
    ? (ucOsConfig && ucOsConfig.expressSurchargeUsd > 0
        ? ucOsConfig.expressSurchargeUsd
        : expressSurchargeUsd(ucCountry))
    : 0;
  const slotFeeUsd = computeSlotFeeUsd({
    expressDelivery: isExpress,
    deliverySlot: args.deliverySlot,
    deliverySlotId: args.deliverySlotId,
    cityId: args.cityId,
    deliveryDate: args.deliveryDate,
    district: resolvedDistrict,
  });
  return {
    totalUsd: subtotalUsd + districtFeeUsd + expressFeeUsd + slotFeeUsd,
    districtFeeUsd,
    expressFeeUsd,
    slotFeeUsd,
    resolvedDistrict,
    isExpress,
    isNoAddress,
  };
}

router.post("/payment/cybersource/unified-checkout/session", async (req, res) => {
  if (!isCybersourceConfigured()) {
    return res.status(503).json({ ok: false, message: "CyberSource not configured." }); // i18n-ignore
  }
  if (!isUnifiedCheckoutEnabled()) {
    // Distinct code so the frontend can silently fall back to the Microform
    // path when the server-side flag is off (rollback safety).
    return res.status(503).json({ ok: false, code: "unified_checkout_disabled", message: "Unified Checkout is not enabled." }); // i18n-ignore
  }

  const {
    items,
    orderId,
    district,
    expressDelivery,
    noAddress,
    deliverySlot: rawDeliverySlot,
    deliverySlotId: rawDeliverySlotId,
    cityId: rawCityId,
    deliveryDate: rawDeliveryDate,
    targetOrigin: bodyOrigin,
    billingDetails: rawBilling,
    paymentAttemptId,
  } = req.body as {
    items: { wcId: number; osSlug?: string; quantity: number }[];
    orderId?: string;
    district?: string;
    expressDelivery?: boolean;
    noAddress?: boolean;
    deliverySlot?: string;
    deliverySlotId?: string;
    cityId?: string;
    deliveryDate?: string;
    targetOrigin?: string;
    billingDetails?: {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
    };
    /** Client-generated attempt UUID — logged for cross-stage correlation. */
    paymentAttemptId?: string;
  };

  if (!orderId) {
    return res.status(400).json({ ok: false, message: "orderId is required" }); // i18n-ignore
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, message: "items is required" }); // i18n-ignore
  }

  const store = resolveStoreFromRequest(req);
  if (store.storeKey !== "lebanon") {
    return res.status(400).json({ ok: false, message: "CyberSource is only available for the Lebanon storefront." }); // i18n-ignore
  }

  const catalogResult = await resolveCartItems(items, store);
  if (!catalogResult.ok) {
    return res.status(422).json({ ok: false, code: "catalog_error", message: catalogResult.message });
  }

  const totals = computeUcServerTotals({
    subtotalUsd: catalogResult.subtotalUsd,
    district,
    expressDelivery,
    noAddress,
    deliverySlot: rawDeliverySlot,
    deliverySlotId: rawDeliverySlotId,
    cityId: rawCityId,
    deliveryDate: rawDeliveryDate,
  });
  const totalAmount = totals.totalUsd.toFixed(2);
  const targetOrigins = resolveTargetOrigins(bodyOrigin);

  const result = await generateUnifiedCheckoutSession({
    targetOrigins,
    totalAmount,
    currency: "USD", // i18n-ignore
    orderId,
    billingDetails: rawBilling,
  });

  if (!result.ok) {
    req.log.warn(
      {
        PAYMENT_DIAG: true,
        stage: "unified_checkout_session",
        orderId,
        paymentAttemptId,
        merchantId: getCybersourceMerchantId(),
        environment: getCybersourceEnvironment(),
        reason: "session_failed",
        message: result.message,
        diag: (result as any).diag, // eslint-disable-line @typescript-eslint/no-explicit-any
      },
      "CyberSource Unified Checkout session failed",
    );
    return res.status(502).json({ ok: false, code: "cybersource_error", message: result.message });
  }

  // Record the session total so /unified-checkout/complete can verify the
  // amount UC charged still matches the cart being finalized.
  sweepUcPendingSessions();
  ucPendingSessions.set(orderId, {
    totalUsd: totals.totalUsd,
    paymentAttemptId,
    createdAt: Date.now(),
  });

  const environment = getCybersourceEnvironment();
  const { clientLibrary, clientLibraryIntegrity } = extractClientLibraryInfo(result.sessionJwt);

  req.log.info(
    {
      PAYMENT_DIAG: true,
      stage: "unified_checkout_session",
      orderId,
      paymentAttemptId,
      merchantId: getCybersourceMerchantId(),
      environment,
      totalUsd: totals.totalUsd,
      clientLibrary,
      hasIntegrity: Boolean(clientLibraryIntegrity),
    },
    "CyberSource Unified Checkout session created",
  );

  return res.json({
    ok: true,
    captureContext: result.sessionJwt,
    clientLibrary,
    clientLibraryIntegrity,
    totalUsd: totals.totalUsd,
    environment,
    merchantId: getCybersourceMerchantId(),
  });
});

router.post("/payment/cybersource/unified-checkout/complete", async (req, res) => {
  if (!isCybersourceConfigured()) {
    return res.status(503).json({ ok: false, message: "CyberSource not configured." }); // i18n-ignore
  }
  if (!isUnifiedCheckoutEnabled()) {
    return res.status(503).json({ ok: false, code: "unified_checkout_disabled", message: "Unified Checkout is not enabled." }); // i18n-ignore
  }

  const {
    orderId,
    paymentAttemptId,
    items,
    district,
    expressDelivery,
    noAddress,
    deliverySlot: rawDeliverySlot,
    deliverySlotId: rawDeliverySlotId,
    cityId: rawCityId,
    deliveryDate: rawDeliveryDate,
    result: ucResult,
  } = req.body as {
    orderId?: string;
    paymentAttemptId?: string;
    items: { wcId: number; osSlug?: string; quantity: number }[];
    district?: string;
    expressDelivery?: boolean;
    noAddress?: boolean;
    deliverySlot?: string;
    deliverySlotId?: string;
    cityId?: string;
    deliveryDate?: string;
    result?: {
      approved?: boolean;
      requestId?: string;
      status?: string;
      authenticationStatus?: string;
      ecommerceIndicator?: string;
      cavvPresent?: boolean;
      directoryServerTransactionId?: string;
      specificationVersion?: string;
      challengeRequired?: boolean;
      /** Raw completed-payment-result JWT returned by checkout.mount(). */
      paymentResultJwt?: string;
    };
  };

  if (!orderId) {
    return res.status(400).json({ ok: false, message: "orderId is required" }); // i18n-ignore
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, message: "items is required" }); // i18n-ignore
  }

  const store = resolveStoreFromRequest(req);
  if (store.storeKey !== "lebanon") {
    return res.status(400).json({ ok: false, message: "CyberSource is only available for the Lebanon storefront." }); // i18n-ignore
  }

  // ── Strict paid gate ───────────────────────────────────────────────────────
  // A UC result may ONLY be treated as paid when ALL of:
  //   1. approved === true
  //   2. a non-empty CyberSource requestId
  //   3. an explicitly approved payment status (same allowlist as the charge
  //      path — AUTHORIZED_RISK_DECLINED and DECLINED are never paid).
  // Anything else (failure, cancellation, missing fields) leaves the order
  // unpaid — no payment intent is stored, so /woo/order will reject it.
  const requestId =
    typeof ucResult?.requestId === "string" && ucResult.requestId.trim() !== ""
      ? ucResult.requestId.trim()
      : undefined;
  const paymentStatus = typeof ucResult?.status === "string" ? ucResult.status : undefined;
  const approved = ucResult?.approved === true;

  if (!approved || !requestId || !paymentStatus || !isApprovedPaymentStatus(paymentStatus)) {
    req.log.warn(
      {
        PAYMENT_DIAG: true,
        stage: "unified_checkout_complete",
        orderId,
        paymentAttemptId,
        merchantId: getCybersourceMerchantId(),
        environment: getCybersourceEnvironment(),
        approved,
        hasRequestId: Boolean(requestId),
        status: paymentStatus ?? "missing", // i18n-ignore
        challengeRequired: ucResult?.challengeRequired,
        authenticationStatus: ucResult?.authenticationStatus,
        reason: "paid_gate_rejected",
      },
      "CyberSource Unified Checkout complete rejected: result not approved",
    );
    return res.status(402).json({
      ok: false,
      code: "payment_not_approved",
      message: "Payment was not approved. The order has not been placed.", // i18n-ignore
    });
  }

  // ── Result-JWT cross-check ─────────────────────────────────────────────────
  // When the client posts the raw completed-payment-result JWT, decode it and
  // reject if its embedded id/status contradicts the flat fields. (Decode
  // failure is tolerated — the strict gate above remains authoritative — but a
  // successful decode that disagrees is always a hard reject.)
  if (typeof ucResult?.paymentResultJwt === "string" && ucResult.paymentResultJwt.split(".").length === 3) {
    try {
      const decoded = decodeJwtPayload(ucResult.paymentResultJwt) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      const pickString = (...candidates: unknown[]): string | undefined => {
        for (const c of candidates) {
          if (typeof c === "string" && c.trim() !== "") return c.trim();
        }
        return undefined;
      };
      const decodedId = pickString(
        decoded?.id,
        decoded?.data?.id,
        decoded?.ctx?.[0]?.data?.id,
        decoded?.paymentResponse?.id,
        decoded?.data?.paymentResponse?.id,
      );
      const decodedStatus = pickString(
        decoded?.status,
        decoded?.data?.status,
        decoded?.ctx?.[0]?.data?.status,
        decoded?.paymentResponse?.status,
        decoded?.data?.paymentResponse?.status,
      );
      if ((decodedId && decodedId !== requestId) || (decodedStatus && decodedStatus !== paymentStatus)) {
        req.log.warn(
          {
            PAYMENT_DIAG: true,
            stage: "unified_checkout_complete",
            orderId,
            paymentAttemptId,
            postedRequestId: requestId,
            decodedRequestId: decodedId,
            postedStatus: paymentStatus,
            decodedStatus,
            reason: "result_jwt_mismatch",
          },
          "CyberSource Unified Checkout complete rejected: result JWT contradicts posted fields",
        );
        return res.status(402).json({
          ok: false,
          code: "result_mismatch",
          message: "Payment result could not be verified. The order has not been placed.", // i18n-ignore
        });
      }
    } catch {
      req.log.info(
        { PAYMENT_DIAG: true, stage: "unified_checkout_complete", orderId, paymentAttemptId, reason: "result_jwt_undecodable" },
        "CyberSource Unified Checkout result JWT could not be decoded — proceeding on flat-field gate",
      );
    }
  }

  const catalogResult = await resolveCartItems(items, store);
  if (!catalogResult.ok) {
    return res.status(422).json({ ok: false, code: "catalog_error", message: catalogResult.message });
  }

  const totals = computeUcServerTotals({
    subtotalUsd: catalogResult.subtotalUsd,
    district,
    expressDelivery,
    noAddress,
    deliverySlot: rawDeliverySlot,
    deliverySlotId: rawDeliverySlotId,
    cityId: rawCityId,
    deliveryDate: rawDeliveryDate,
  });

  // ── Amount verification ────────────────────────────────────────────────────
  // UC charged the amount baked into the session. If the recomputed cart total
  // no longer matches the session total, the cart changed after the session
  // was created — refuse to finalize at a different amount.
  const pending = ucPendingSessions.get(orderId);
  if (pending && Math.abs(pending.totalUsd - totals.totalUsd) > 0.005) {
    req.log.warn(
      {
        PAYMENT_DIAG: true,
        stage: "unified_checkout_complete",
        orderId,
        paymentAttemptId,
        sessionTotalUsd: pending.totalUsd,
        recomputedTotalUsd: totals.totalUsd,
        reason: "amount_changed",
      },
      "CyberSource Unified Checkout complete rejected: cart total changed since session creation",
    );
    return res.status(409).json({
      ok: false,
      code: "amount_changed",
      message: "The cart total changed after payment started. Please contact support before retrying.", // i18n-ignore
    });
  }
  if (!pending) {
    // Server restarted (or session expired) between session creation and
    // completion. This is tolerated ONLY because the provider verification
    // below independently confirms status + amount with CyberSource itself —
    // a missing pending record never bypasses that gate.
    req.log.warn(
      { PAYMENT_DIAG: true, stage: "unified_checkout_complete", orderId, paymentAttemptId, reason: "pending_session_missing" },
      "CyberSource Unified Checkout complete: no pending session record (restart/expiry) — deferring to provider verification",
    );
  }

  // ── Server-authoritative provider verification ─────────────────────────────
  // Everything the client posted so far (approved flag, requestId, status —
  // even the result JWT, which we only payload-decode) is UNTRUSTED input.
  // The only thing that can mark this order paid is CyberSource itself:
  // confirm the transaction via the Transaction Details API and match its
  // captured amount against the server-recomputed total. Fail closed — any
  // lookup failure leaves the order unpaid.
  const verification = await verifyUnifiedCheckoutPayment({
    requestId,
    expectedTotalUsd: totals.totalUsd,
  });
  if (!verification.ok) {
    req.log.warn(
      {
        PAYMENT_DIAG: true,
        stage: "unified_checkout_complete",
        orderId,
        paymentAttemptId,
        requestId,
        verificationCode: verification.code,
        verificationMessage: verification.message,
      },
      "CyberSource Unified Checkout complete rejected: provider verification failed",
    );
    if (verification.code === "amount_mismatch") {
      return res.status(409).json({
        ok: false,
        code: "amount_changed",
        message: "The captured amount does not match the order total. Please contact support.", // i18n-ignore
      });
    }
    if (verification.code === "not_approved" || verification.code === "not_found") {
      return res.status(402).json({
        ok: false,
        code: "verification_failed",
        message: "CyberSource did not confirm this payment as approved.", // i18n-ignore
      });
    }
    return res.status(502).json({
      ok: false,
      code: "verification_unavailable",
      message: "Could not verify the payment with CyberSource. The order was not finalised — please try again or contact support.", // i18n-ignore
    });
  }

  const paymentRef = `cybs:${requestId}`;

  // Safe auth metadata stored alongside the order's payment-intent record —
  // never card data, never the raw JWT.
  const paymentMeta = {
    unifiedCheckoutUsed: true,
    consumerAuthenticationRequested: "3DS", // i18n-ignore
    paymentAttemptId,
    authenticationStatus: ucResult?.authenticationStatus,
    ecommerceIndicator: ucResult?.ecommerceIndicator,
    cavvPresent: ucResult?.cavvPresent,
    directoryServerTransactionId: ucResult?.directoryServerTransactionId,
    specificationVersion: ucResult?.specificationVersion,
    challengeRequired: ucResult?.challengeRequired,
    cybersourceRequestId: requestId,
    paymentStatus,
    // Provider-confirmed fields (Transaction Details API) — the authoritative
    // record of what CyberSource actually reported, independent of the client.
    serverVerified: true,
    verifiedPaymentStatus: verification.status,
    verifiedAmountUsd: verification.totalAmount,
  };

  // Bind orderId↔paymentRef before returning so /woo/order can verify cart
  // snapshot and reject any replay or cart substitution.
  storePaymentIntent({
    orderId,
    paymentRef,
    provider: "cybersource",
    currency: "USD", // i18n-ignore
    totalUsd: totals.totalUsd,
    snapshot: {
      items: catalogResult.items.map((i) => ({
        wcId: i.wcId,
        osSlug: i.osSlug,
        quantity: i.quantity,
        priceUsd: i.priceUsd,
      })),
      district: totals.resolvedDistrict,
      expressDelivery: totals.isExpress,
      noAddress: totals.isNoAddress,
      deliverySlot: rawDeliverySlot ?? "",
      districtFeeUsd: totals.districtFeeUsd,
      expressFeeUsd: totals.expressFeeUsd,
      slotFeeUsd: totals.slotFeeUsd,
    },
    paymentMeta,
  });
  ucPendingSessions.delete(orderId);

  req.log.info(
    {
      PAYMENT_DIAG: true,
      stage: "unified_checkout_complete",
      orderId,
      merchantId: getCybersourceMerchantId(),
      environment: getCybersourceEnvironment(),
      paymentRef,
      totalUsd: totals.totalUsd,
      ...paymentMeta,
    },
    "CyberSource Unified Checkout payment accepted",
  );

  return res.json({ ok: true, paymentRef });
});

// ── POST /payment/cybersource/applepay-session ───────────────────────────────
// Validates an Apple Pay merchant session via CyberSource. Called from the
// browser's ApplePaySession.onvalidatemerchant event handler. CyberSource
// contacts Apple on the merchant's behalf using the registered Apple Pay
// certificate and returns the merchant session object. Requires the Business
// Center to have an Apple Pay merchant certificate configured.
router.post("/payment/cybersource/applepay-session", async (req, res) => {
  if (!isCybersourceConfigured()) {
    return res.status(503).json({ ok: false, message: "CyberSource not configured." }); // i18n-ignore
  }

  const { validationURL, displayName, domainName } = req.body as {
    validationURL?: string;
    displayName?: string;
    domainName?: string;
  };

  if (!validationURL || typeof validationURL !== "string") {
    return res.status(400).json({ ok: false, message: "validationURL is required" }); // i18n-ignore
  }

  // Reject non-Apple validation URLs to prevent SSRF abuse.
  // Apple's validation URLs always use apple.com subdomains over HTTPS.
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(validationURL);
  } catch {
    return res.status(400).json({ ok: false, message: "validationURL is not a valid URL" }); // i18n-ignore
  }
  if (parsedUrl.protocol !== "https:" || !parsedUrl.hostname.endsWith(".apple.com")) {
    return res.status(400).json({ ok: false, message: "validationURL must be an apple.com HTTPS URL" }); // i18n-ignore
  }

  const result = await validateApplePayMerchant({
    validationURL,
    displayName: displayName ?? "Presentail", // i18n-ignore
    domainName: domainName ?? "presentail.com", // i18n-ignore
  });

  if (!result.ok) {
    req.log.warn({ message: result.message }, "CyberSource Apple Pay merchant validation failed");
    return res.status(502).json({ ok: false, message: result.message });
  }

  return res.json({ ok: true, merchantSession: result.merchantSession });
});

// ── POST /payment/cybersource/wallet-charge ──────────────────────────────────
// Charges a Google Pay or Apple Pay wallet token through CyberSource's payment
// API. The cart total is always recomputed server-side — the client-supplied
// token contains an amount for display only. Restricted to Lebanon (USD).
router.post("/payment/cybersource/wallet-charge", async (req, res) => {
  if (!isCybersourceConfigured()) {
    return res.status(503).json({ ok: false, message: "CyberSource not configured." }); // i18n-ignore
  }

  const {
    walletType,
    walletToken,
    orderId,
    items,
    district,
    expressDelivery,
    noAddress,
    deliverySlot: rawDeliverySlot,
    deliverySlotId: rawDeliverySlotId,
    cityId: rawCityId,
    deliveryDate: rawDeliveryDate,
    billingDetails: rawBilling,
  } = req.body as {
    walletType: "googlepay" | "applepay";
    walletToken: string;
    orderId: string;
    items: { wcId: number; osSlug?: string; quantity: number }[];
    district?: string;
    expressDelivery?: boolean;
    noAddress?: boolean;
    deliverySlot?: string;
    deliverySlotId?: string;
    cityId?: string;
    deliveryDate?: string;
    billingDetails?: { firstName?: string; lastName?: string; email?: string };
  };

  if (!orderId) {
    return res.status(400).json({ ok: false, message: "orderId is required" }); // i18n-ignore
  }
  if (!walletToken || typeof walletToken !== "string") {
    return res.status(400).json({ ok: false, message: "walletToken is required" }); // i18n-ignore
  }
  if (walletType !== "googlepay" && walletType !== "applepay") {
    return res.status(400).json({ ok: false, message: "walletType must be googlepay or applepay" }); // i18n-ignore
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, message: "items is required" }); // i18n-ignore
  }

  const store = resolveStoreFromRequest(req);
  if (store.storeKey !== "lebanon") {
    return res.status(400).json({ ok: false, message: "CyberSource wallets are only available for Lebanon." }); // i18n-ignore
  }

  const catalogResult = await resolveCartItems(items, store);
  if (!catalogResult.ok) {
    return res.status(422).json({ ok: false, code: "catalog_error", message: catalogResult.message });
  }

  const resolvedDistrict = district ?? "Beirut"; // i18n-ignore
  const isExpress = expressDelivery === true;
  const isNoAddress = noAddress === true;
  const subtotalUsd = catalogResult.subtotalUsd;
  const walletCountry = countryForDistrict(resolvedDistrict);
  // Bugs A+B fix: prefer OS city-level delivery config (keyed by cityId) so the
  // wallet charge matches the fee wooOrders.ts will record at order creation.
  const walletOsConfig = rawCityId ? resolveOsDeliveryConfig(walletCountry, rawCityId) : null;
  const districtFeeUsd = (() => {
    if (!isNoAddress && walletOsConfig && typeof walletOsConfig.cityFeeUsd === "number") {
      const isFreeByOs =
        walletOsConfig.freeDeliveryEnabled === true &&
        typeof walletOsConfig.freeDeliveryThresholdUsd === "number" &&
        subtotalUsd >= walletOsConfig.freeDeliveryThresholdUsd;
      return isFreeByOs ? 0 : walletOsConfig.cityFeeUsd;
    }
    return computeDistrictFeeUsd(resolvedDistrict, subtotalUsd, isNoAddress);
  })();
  const expressFeeUsd = isExpress
    ? (walletOsConfig && walletOsConfig.expressSurchargeUsd > 0
        ? walletOsConfig.expressSurchargeUsd
        : expressSurchargeUsd(walletCountry))
    : 0;
  const slotFeeUsd = computeSlotFeeUsd({
    expressDelivery: isExpress,
    deliverySlot: rawDeliverySlot,
    deliverySlotId: rawDeliverySlotId,
    cityId: rawCityId,
    deliveryDate: rawDeliveryDate,
    district: resolvedDistrict,
  });
  const totalUsd = subtotalUsd + districtFeeUsd + expressFeeUsd + slotFeeUsd;
  const totalAmount = totalUsd.toFixed(2);

  let chargeResult:
    | { ok: true; paymentId: string; status: string }
    | { ok: false; message: string; declineCode?: string };

  if (walletType === "googlepay") {
    chargeResult = await authorizeAndCaptureGooglePay({
      googlePayToken: walletToken,
      totalAmount,
      currency: "USD",
      orderId,
      billingDetails: rawBilling,
    });
  } else {
    chargeResult = await authorizeAndCaptureApplePay({
      applePayToken: walletToken,
      totalAmount,
      currency: "USD",
      orderId,
      billingDetails: rawBilling,
    });
  }

  const walletPaymentMethod = walletType === "googlepay" ? "cybersource_googlepay" : "cybersource_applepay"; // i18n-ignore

  if (!chargeResult.ok) {
    req.log.warn(
      { orderId, walletType, totalUsd, declineCode: chargeResult.declineCode, message: chargeResult.message },
      "CyberSource wallet charge failed",
    );
    return res.status(402).json({
      ok: false,
      code: "payment_declined",
      declineCode: chargeResult.declineCode,
      message: chargeResult.message,
    });
  }

  const paymentRef = `cybs:${chargeResult.paymentId}`;

  storePaymentIntent({
    orderId,
    paymentRef,
    provider: "cybersource",
    currency: "USD",
    totalUsd,
    snapshot: {
      items: catalogResult.items.map((i) => ({
        wcId: i.wcId,
        osSlug: i.osSlug,
        quantity: i.quantity,
        priceUsd: i.priceUsd,
      })),
      district: resolvedDistrict,
      expressDelivery: isExpress,
      noAddress: isNoAddress,
      deliverySlot: rawDeliverySlot ?? "",
      districtFeeUsd,
      expressFeeUsd,
      slotFeeUsd,
    },
  });

  req.log.info(
    { orderId, walletType, paymentRef, totalUsd, status: chargeResult.status },
    "CyberSource wallet charge succeeded",
  );

  return res.json({ ok: true, paymentRef, paymentMethod: walletPaymentMethod });
});

// ── CyberSource Payer Authentication (3DS) Routes ────────────────────────────
// Three-stage EMV 3DS 2.x flow via Cruise Control (Cardinal Commerce).
// All three endpoints return 503 { code: "pa_disabled" } when
// CYBERSOURCE_PAYER_AUTH_ENABLED !== "true". Stage-specific 502 codes let
// the frontend show the correct toast per failure class.

// POST /payment/cybersource/payer-auth/setup
// Called after Microform tokenization. Returns device-data-collection params.
router.post("/payment/cybersource/payer-auth/setup", async (req, res) => {
  if (!isPayerAuthEnabled()) {
    return res.status(503).json({ ok: false, code: "pa_disabled", message: "Payer Authentication is not enabled." }); // i18n-ignore
  }

  const { transientTokenJwt, orderId, paymentAttemptId } = req.body as {
    transientTokenJwt?: string;
    orderId?: string;
    paymentAttemptId?: string;
  };

  if (!transientTokenJwt || typeof transientTokenJwt !== "string") {
    return res.status(400).json({ ok: false, message: "transientTokenJwt is required" }); // i18n-ignore
  }
  if (!orderId || typeof orderId !== "string") {
    return res.status(400).json({ ok: false, message: "orderId is required" }); // i18n-ignore
  }

  const result = await setupPayerAuth({ transientTokenJwt, orderId });

  req.log.info(
    {
      PAYMENT_DIAG: true,
      paymentAttemptId: paymentAttemptId ?? orderId,
      stage: "pa_setup",
      orderId,
      merchantId: getCybersourceMerchantId(),
      environment: getCybersourceEnvironment(),
      ok: result.ok,
      ...(result.ok
        ? { referenceId: result.referenceId }
        : { code: result.code, message: result.message }),
    },
    "CyberSource PA setup",
  );

  if (!result.ok) {
    return res.status(502).json({ ok: false, code: result.code, message: result.message });
  }

  return res.json({
    ok: true,
    accessToken: result.accessToken,
    deviceDataCollectionUrl: result.deviceDataCollectionUrl,
    referenceId: result.referenceId,
  });
});

// POST /payment/cybersource/payer-auth/check-enrollment
// Called after device data collection. Returns frictionless result or challenge.
router.post("/payment/cybersource/payer-auth/check-enrollment", async (req, res) => {
  if (!isPayerAuthEnabled()) {
    return res.status(503).json({ ok: false, code: "pa_disabled", message: "Payer Authentication is not enabled." }); // i18n-ignore
  }

  const {
    transientTokenJwt,
    referenceId,
    orderId,
    amount,
    currency,
    billTo,
    browserInfo,
    returnUrl,
    paymentAttemptId,
  } = req.body as {
    transientTokenJwt?: string;
    referenceId?: string;
    orderId?: string;
    amount?: string;
    currency?: string;
    billTo?: Record<string, string>;
    browserInfo?: Record<string, string | boolean>;
    returnUrl?: string;
    paymentAttemptId?: string;
  };

  if (!transientTokenJwt || typeof transientTokenJwt !== "string") {
    return res.status(400).json({ ok: false, message: "transientTokenJwt is required" }); // i18n-ignore
  }
  if (!referenceId || typeof referenceId !== "string") {
    return res.status(400).json({ ok: false, message: "referenceId is required" }); // i18n-ignore
  }
  if (!orderId || typeof orderId !== "string") {
    return res.status(400).json({ ok: false, message: "orderId is required" }); // i18n-ignore
  }
  if (!amount || typeof amount !== "string") {
    return res.status(400).json({ ok: false, message: "amount is required" }); // i18n-ignore
  }
  if (!currency || typeof currency !== "string") {
    return res.status(400).json({ ok: false, message: "currency is required" }); // i18n-ignore
  }
  if (!returnUrl || typeof returnUrl !== "string") {
    return res.status(400).json({ ok: false, message: "returnUrl is required" }); // i18n-ignore
  }

  const result = await checkEnrollment({
    transientTokenJwt,
    referenceId,
    orderId,
    amount,
    currency,
    billTo: billTo as any,
    browserInfo: browserInfo as any,
    returnUrl,
  });

  req.log.info(
    {
      PAYMENT_DIAG: true,
      paymentAttemptId: paymentAttemptId ?? orderId,
      stage: "pa_enrollment",
      orderId,
      merchantId: getCybersourceMerchantId(),
      environment: getCybersourceEnvironment(),
      ok: result.ok,
      ...(result.ok
        ? {
            enrolled: result.enrolled,
            authenticationTransactionId: result.authenticationTransactionId,
          }
        : { code: result.code, message: result.message }),
    },
    "CyberSource PA enrollment",
  );

  if (!result.ok) {
    return res.status(502).json({ ok: false, code: result.code, message: result.message });
  }

  if (result.enrolled) {
    // Challenge path — persist the authenticationTransactionId in the backend
    // attempt row so runCsAttemptCompleteChain can validate without the client.
    if (
      paymentAttemptId &&
      ATTEMPT_ID_RE.test(paymentAttemptId) &&
      result.authenticationTransactionId
    ) {
      try {
        await db
          .update(csPaymentAttemptsTable)
          .set({
            status: "ENROLLED",
            csAuthenticationTransactionId: result.authenticationTransactionId,
            updatedAt: new Date(),
          })
          .where(eq(csPaymentAttemptsTable.attemptId, paymentAttemptId));
        req.log.info(
          {
            PAYMENT_DIAG: true,
            stage: "enrollment_result",
            attemptId: paymentAttemptId,
            authenticationTransactionId: result.authenticationTransactionId,
            enrolled: true,
          },
          "cs_attempt: attempt enrolled",
        );
      } catch (dbErr) {
        req.log.warn(
          { paymentAttemptId, err: (dbErr as Error)?.message },
          "cs_enrollment: failed to update attempt status — challenge will still proceed",
        );
      }
    }
    // Return only the fields the frontend needs to render the iframe.
    return res.json({
      ok: true,
      enrolled: true,
      stepUpUrl: result.stepUpUrl,
      accessToken: result.accessToken,
      authenticationTransactionId: result.authenticationTransactionId,
    });
  }

  // Frictionless path — return the 3DS metadata needed for the charge call.
  return res.json({
    ok: true,
    enrolled: false,
    authenticationTransactionId: result.authenticationTransactionId,
    eci: result.eci,
    cavv: result.cavv,
    xid: result.xid,
    specificationVersion: result.specificationVersion,
    directoryServerTransactionId: result.directoryServerTransactionId,
    paSpecificationVersion: result.paSpecificationVersion,
  });
});

// POST /payment/cybersource/payer-auth/validate
// Called after the challenge iframe completes. Returns 3DS metadata for charge.
router.post("/payment/cybersource/payer-auth/validate", async (req, res) => {
  if (!isPayerAuthEnabled()) {
    return res.status(503).json({ ok: false, code: "pa_disabled", message: "Payer Authentication is not enabled." }); // i18n-ignore
  }

  const { authenticationTransactionId, paymentAttemptId } = req.body as {
    authenticationTransactionId?: string;
    paymentAttemptId?: string;
  };

  if (!authenticationTransactionId || typeof authenticationTransactionId !== "string") {
    return res.status(400).json({ ok: false, message: "authenticationTransactionId is required" }); // i18n-ignore
  }

  const result = await validateAuthentication({ authenticationTransactionId });

  req.log.info(
    {
      PAYMENT_DIAG: true,
      paymentAttemptId: paymentAttemptId ?? authenticationTransactionId,
      stage: "pa_validation",
      merchantId: getCybersourceMerchantId(),
      environment: getCybersourceEnvironment(),
      paTransactionId: authenticationTransactionId,
      ok: result.ok,
      ...(result.ok
        ? {
            eci: result.eci,
            specificationVersion: result.specificationVersion,
            commerceIndicator: result.commerceIndicator,
          }
        : { code: result.code, message: result.message }),
    },
    "CyberSource PA validation",
  );

  if (!result.ok) {
    return res.status(502).json({ ok: false, code: result.code, message: result.message });
  }

  return res.json({
    ok: true,
    cavv: result.cavv,
    eci: result.eci,
    eciRaw: result.eciRaw,
    xid: result.xid,
    specificationVersion: result.specificationVersion,
    directoryServerTransactionId: result.directoryServerTransactionId,
    paSpecificationVersion: result.paSpecificationVersion,
    authenticationTransactionId: result.authenticationTransactionId,
    commerceIndicator: result.commerceIndicator,
  });
});

// ── CyberSource 3DS Payment Attempt Lifecycle ────────────────────────────────
// Persistent attempt tracking so the backend can complete the
// validate → authorize → order-create chain even when the browser tab is lost.

const ATTEMPT_ID_RE = /^[A-Za-z0-9_-]{8,80}$/;

/** Build a WooOrderPayload from a stored cart snapshot + charge paymentRef. */
function buildWooOrderPayloadFromSnapshot(
  snapshot: CsAttemptCartSnapshot,
  paymentRef: string,
): ReturnType<typeof WooOrderSchema.parse> {
  const raw = {
    orderId: snapshot.appOrderId,
    items: snapshot.items.map((i) => ({
      name: i.name ?? "Product",
      quantity: i.quantity,
      price: i.price,
      wcId: i.wcId,
      osSlug: i.osSlug,
      customInput: i.customInput,
    })),
    billing: snapshot.billing,
    recipient: snapshot.recipient,
    district: snapshot.district,
    cityId: snapshot.cityId,
    districtFee: snapshot.districtFee,
    expressFee: snapshot.expressFee,
    slotFee: snapshot.slotFee ?? 0,
    noAddress: snapshot.noAddress ?? false,
    billingCountry: snapshot.billingCountry,
    shippingCountry: snapshot.shippingCountry ?? "LB",
    deliveryDetails: snapshot.deliveryDetails ?? "",
    deliveryDate: snapshot.deliveryDate ?? "",
    deliverySlot: snapshot.deliverySlot ?? "",
    deliverySlotId: snapshot.deliverySlotId,
    cardMessage: snapshot.cardMessage,
    cardFrom: snapshot.cardFrom,
    cardTo: snapshot.cardTo,
    qrLink: snapshot.qrLink,
    orderNotes: snapshot.orderNotes,
    paymentMethod: "cybersource" as const,
    identitySecret: snapshot.identitySecret ?? false,
    currencyCode: snapshot.currencyCode ?? "USD",
    couponCode: snapshot.couponCode,
    occasion_ref: snapshot.occasion_ref,
    marketing_attribution: snapshot.marketing_attribution,
    paymentRef,
  };
  return WooOrderSchema.parse(raw);
}

/**
 * Server-side completion chain for a 3DS attempt.
 * Idempotent: if already COMPLETED returns stored orderId; if already
 * AUTHORIZED skips validate+charge and only retries order creation.
 * Never re-charges a customer.
 */
async function runCsAttemptCompleteChain(
  attemptId: string,
  log: { warn?: (...args: any[]) => void; info?: (...args: any[]) => void; error?: (...args: any[]) => void },
): Promise<{ ok: true; orderId: string } | { ok: false; errorMessage: string }> {
  const rows = await db
    .select()
    .from(csPaymentAttemptsTable)
    .where(eq(csPaymentAttemptsTable.attemptId, attemptId))
    .limit(1);
  const attempt = rows[0];

  if (!attempt) {
    return { ok: false, errorMessage: "Attempt not found" };
  }

  // ── Idempotency guards ────────────────────────────────────────────────────
  if (attempt.status === "COMPLETED" && attempt.orderId) {
    log.info?.({ attemptId, orderId: attempt.orderId }, "cs_attempt: already COMPLETED — returning stored orderId");
    return { ok: true, orderId: attempt.orderId };
  }
  if (attempt.status === "FAILED") {
    const err = attempt.errorDetails as { message?: string } | null;
    return { ok: false, errorMessage: err?.message ?? "Payment failed" };
  }

  const snapshot = attempt.cartSnapshot as CsAttemptCartSnapshot | null;
  if (!snapshot) {
    await db
      .update(csPaymentAttemptsTable)
      .set({ status: "FAILED", errorDetails: { message: "No cart snapshot stored" }, updatedAt: new Date() })
      .where(eq(csPaymentAttemptsTable.attemptId, attemptId));
    return { ok: false, errorMessage: "No cart snapshot stored" };
  }

  let paymentRef: string;

  // ── Concurrency lock ──────────────────────────────────────────────────────
  // Use a PostgreSQL session-level advisory lock keyed on this attemptId to
  // prevent two concurrent callers from both entering the validate+charge path
  // simultaneously.  pg_try_advisory_lock is non-blocking: if another session
  // already holds the lock it returns false immediately and we return a
  // "processing" signal so the caller retries via polling instead.
  // The lock is automatically released when the DB connection is returned to
  // the pool (end of async function) or when pg_advisory_unlock is called.
  let advisoryLockAcquired = false;
  try {
    const lockResult = await db.execute<{ acquired: boolean }>(
      sql`SELECT pg_try_advisory_lock(abs(hashtext(${attemptId}))) AS acquired`,
    );
    advisoryLockAcquired = (lockResult.rows[0] as { acquired: boolean }).acquired === true;
  } catch {
    // If advisory lock query itself fails (unlikely), proceed without locking
    // rather than blocking the payment entirely.
    advisoryLockAcquired = true;
  }
  if (!advisoryLockAcquired) {
    log.info?.(
      { attemptId },
      "cs_attempt: advisory lock not acquired — another worker is processing; caller should retry",
    );
    return { ok: false, errorMessage: "Payment processing in progress — please check status" };
  }

  try {
  // ── Phase 1: validate + charge (skip if already AUTHORIZED) ──────────────
  if (attempt.status !== "AUTHORIZED" && attempt.status !== "ORDER_CREATED" && attempt.status !== "OS_SYNCED") {
    if (!attempt.csAuthenticationTransactionId) {
      await db
        .update(csPaymentAttemptsTable)
        .set({ status: "FAILED", errorDetails: { message: "No authentication transaction ID" }, updatedAt: new Date() })
        .where(eq(csPaymentAttemptsTable.attemptId, attemptId));
      return { ok: false, errorMessage: "No authentication transaction ID — enrollment may not have completed" };
    }

    // 1a. Validate authentication
    log.info?.({ attemptId, csAuthTxnId: attempt.csAuthenticationTransactionId }, "cs_attempt: validate_authentication");
    const validateResult = await validateAuthentication({
      authenticationTransactionId: attempt.csAuthenticationTransactionId,
    });
    log.info?.({ attemptId, ok: validateResult.ok, stage: "validation_response", ...(validateResult.ok ? { eci: validateResult.eci } : { code: (validateResult as any).code }) }, "cs_attempt: validation_response");

    if (!validateResult.ok) {
      await db
        .update(csPaymentAttemptsTable)
        .set({ status: "FAILED", errorDetails: { message: validateResult.message, code: (validateResult as any).code }, updatedAt: new Date() })
        .where(eq(csPaymentAttemptsTable.attemptId, attemptId));
      return { ok: false, errorMessage: validateResult.message ?? "3DS validation failed" };
    }

    await db
      .update(csPaymentAttemptsTable)
      .set({ status: "VALIDATED", updatedAt: new Date() })
      .where(eq(csPaymentAttemptsTable.attemptId, attemptId));

    // 1b. Authorize + capture
    log.info?.({ attemptId, stage: "authorization_started" }, "cs_attempt: authorization_started");
    const chargeResult = await authorizeAndCapture({
      transientTokenJwt: snapshot.transientTokenJwt,
      totalAmount: snapshot.totalAmount,
      currency: snapshot.currency ?? "USD",
      orderId: snapshot.appOrderId,
      billingDetails: snapshot.billing as any,
      payerAuthenticationData: {
        authenticationTransactionId: attempt.csAuthenticationTransactionId,
        cavv: validateResult.cavv,
        eci: validateResult.eci,
        eciRaw: validateResult.eciRaw,
        xid: validateResult.xid,
        specificationVersion: validateResult.specificationVersion,
        directoryServerTransactionId: validateResult.directoryServerTransactionId,
        paSpecificationVersion: validateResult.paSpecificationVersion,
        commerceIndicator: validateResult.commerceIndicator,
      } as any,
    });
    log.info?.({ attemptId, ok: chargeResult.ok, stage: "authorization_response", requestId: chargeResult.ok ? (chargeResult as any).paymentId : undefined }, "cs_attempt: authorization_response");

    if (!chargeResult.ok) {
      await db
        .update(csPaymentAttemptsTable)
        .set({ status: "FAILED", errorDetails: { message: chargeResult.message, kind: chargeResult.kind }, updatedAt: new Date() })
        .where(eq(csPaymentAttemptsTable.attemptId, attemptId));
      return { ok: false, errorMessage: chargeResult.message ?? "Payment declined" };
    }

    paymentRef = `cybs:${(chargeResult as any).paymentId}`;

    // Bind paymentRef↔orderId in the in-memory intent store so /woo/order can
    // verify it if called later (reconciliation path).
    storePaymentIntent({
      orderId: snapshot.appOrderId,
      paymentRef,
      provider: "cybersource",
      currency: snapshot.currency ?? "USD",
      totalUsd: parseFloat(snapshot.totalAmount),
      snapshot: {
        items: snapshot.items.map((item: CsAttemptCartSnapshot["items"][number]) => ({
          wcId: item.wcId ?? 0,
          osSlug: item.osSlug,
          quantity: item.quantity,
          priceUsd: item.price,
        })),
        district: snapshot.district,
        expressDelivery: (snapshot.expressFee ?? 0) > 0,
        noAddress: snapshot.noAddress ?? false,
        deliverySlot: snapshot.deliverySlot ?? "",
        districtFeeUsd: snapshot.districtFee,
        expressFeeUsd: snapshot.expressFee,
        slotFeeUsd: snapshot.slotFee ?? 0,
      },
      stripeAccount: "direct" as any,
    });

    await db
      .update(csPaymentAttemptsTable)
      .set({ status: "AUTHORIZED", csRequestId: (chargeResult as any).paymentId, updatedAt: new Date() })
      .where(eq(csPaymentAttemptsTable.attemptId, attemptId));
  } else {
    // Already authorized — build paymentRef from stored csRequestId.
    if (!attempt.csRequestId) {
      return { ok: false, errorMessage: "Authorized but no csRequestId stored" };
    }
    paymentRef = `cybs:${attempt.csRequestId}`;
  }

  // ── Phase 2: order creation ───────────────────────────────────────────────
  // Retry-safe: if we reach here either fresh or after a previous OS failure.
  let orderPayload: ReturnType<typeof WooOrderSchema.parse>;
  try {
    orderPayload = buildWooOrderPayloadFromSnapshot(snapshot, paymentRef);
  } catch (parseErr: any) {
    await db
      .update(csPaymentAttemptsTable)
      .set({ status: "FAILED", errorDetails: { message: `Cart snapshot parse error: ${parseErr?.message}` }, updatedAt: new Date() })
      .where(eq(csPaymentAttemptsTable.attemptId, attemptId));
    return { ok: false, errorMessage: "Cart snapshot could not be parsed" };
  }

  log.info?.({ attemptId, appOrderId: snapshot.appOrderId, stage: "order_creation_started" }, "cs_attempt: order_created");
  const store = resolveStore(snapshot.shippingCountry ?? "LB");
  const osResult = await attemptCreateOsOrder(orderPayload, {
    paymentVerified: true,
    store,
    preVerifiedItems: snapshot.items.map((i) => ({ wcId: i.wcId ?? 0, osSlug: i.osSlug, priceUsd: i.price, name: i.name ?? "" })),
    preVerifiedFees: { districtFeeUsd: snapshot.districtFee, expressFeeUsd: snapshot.expressFee, slotFeeUsd: snapshot.slotFee ?? 0 },
  });
  log.info?.({ attemptId, ok: osResult.ok, stage: "os_sync_result", osOrderId: osResult.ok ? osResult.osOrderId : undefined, message: !osResult.ok ? osResult.message : undefined }, "cs_attempt: os_sync_result");

  if (!osResult.ok) {
    // Leave status as AUTHORIZED so the next poll retries order creation
    // without re-charging. The task spec requires retrying until the order
    // is recorded; never mark FAILED here for a temporary OS outage.
    log.warn?.({ attemptId, message: osResult.message }, "cs_attempt: OS order creation failed — will retry on next poll");
    return { ok: false, errorMessage: osResult.message };
  }

  // Record in app_orders (idempotent via onConflictDoUpdate on appOrderId).
  await recordSuccessfulWcOrder({
    body: orderPayload,
    wcOrderId: null,
    userId: null,
    customerId: attempt.customerId ? parseInt(attempt.customerId, 10) : null,
    recipientName: osResult.recipientName,
    totalUsdCents: osResult.totalUsdCents,
    totalPaymentCents: osResult.totalPaymentCents,
    platform: snapshot.platform ?? null,
    storeKey: store.storeKey ?? "lebanon",
    osOrderId: osResult.osOrderId ?? null,
    lineItems: osResult.lineItems,
    log,
    currencyCode: snapshot.currencyCode ?? "USD",
  });

  log.info?.({ attemptId, appOrderId: snapshot.appOrderId, stage: "order_created" }, "cs_attempt: order_created_confirmed");

  // Mark COMPLETED
  await db
    .update(csPaymentAttemptsTable)
    .set({
      status: "COMPLETED",
      orderId: snapshot.appOrderId,
      osOrderId: osResult.osOrderId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(csPaymentAttemptsTable.attemptId, attemptId));

  log.info?.({ attemptId, orderId: snapshot.appOrderId, stage: "confirmation_redirect" }, "cs_attempt: confirmation_redirect");
  return { ok: true, orderId: snapshot.appOrderId };

  } finally {
    // Release the session-level advisory lock so the next retry (if any) can
    // re-enter. Errors here are intentionally swallowed — a stale lock at
    // worst delays the next retry until the DB connection is returned to pool.
    await db
      .execute(sql`SELECT pg_advisory_unlock(abs(hashtext(${attemptId})))`)
      .catch(() => {});
  }
}

// POST /payment/cybersource/attempt
// Creates a payment attempt row before 3DS authentication begins.
// Receives the cart snapshot (including the transient Microform JWT) and
// returns an opaque attemptId the frontend stores in a ref.
router.post("/payment/cybersource/attempt", async (req, res) => {
  if (!isCybersourceConfigured()) {
    return res.status(503).json({ ok: false, code: "cs_disabled", message: "CyberSource is not configured." }); // i18n-ignore
  }

  const {
    amount,
    currency,
    transientTokenJwt,
    cartSnapshot,
    customerId,
    guestSessionId,
  } = req.body as {
    amount?: string;
    currency?: string;
    transientTokenJwt?: string;
    cartSnapshot?: Record<string, unknown>;
    customerId?: string;
    guestSessionId?: string;
  };

  if (!amount || typeof amount !== "string" || !/^\d+(\.\d{1,2})?$/.test(amount)) {
    return res.status(400).json({ ok: false, message: "amount is required (format: '45.00')" }); // i18n-ignore
  }
  if (!currency || typeof currency !== "string" || currency.length !== 3) {
    return res.status(400).json({ ok: false, message: "currency is required (ISO 4217 3-letter code)" }); // i18n-ignore
  }
  if (!transientTokenJwt || typeof transientTokenJwt !== "string") {
    return res.status(400).json({ ok: false, message: "transientTokenJwt is required" }); // i18n-ignore
  }
  if (!cartSnapshot || typeof cartSnapshot !== "object") {
    return res.status(400).json({ ok: false, message: "cartSnapshot is required" }); // i18n-ignore
  }

  // Merge transientTokenJwt into the snapshot for server-side use only.
  const storedSnapshot: CsAttemptCartSnapshot = {
    ...(cartSnapshot as Omit<CsAttemptCartSnapshot, "transientTokenJwt">),
    transientTokenJwt,
    totalAmount: amount,
    currency,
  };

  const { randomUUID } = await import("crypto");
  const attemptId = randomUUID();

  await db.insert(csPaymentAttemptsTable).values({
    attemptId,
    amount,
    currency,
    cartSnapshot: storedSnapshot,
    customerId: customerId ?? null,
    guestSessionId: guestSessionId ?? null,
    status: "CREATED",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  req.log.info({ attemptId, appOrderId: (cartSnapshot as any).appOrderId, stage: "attempt_created" }, "cs_attempt: attempt_created"); // i18n-ignore

  return res.json({ ok: true, attemptId });
});

// GET /payment/cybersource/attempt/:attemptId/status
// Returns the current status of a payment attempt.
// Safe to poll; never exposes auth tokens or 3DS fields.
router.get("/payment/cybersource/attempt/:attemptId/status", async (req, res) => {
  const { attemptId } = req.params;
  if (!ATTEMPT_ID_RE.test(attemptId)) {
    return res.status(400).json({ ok: false, message: "Invalid attemptId" }); // i18n-ignore
  }

  const rows = await db
    .select({
      status: csPaymentAttemptsTable.status,
      orderId: csPaymentAttemptsTable.orderId,
      errorDetails: csPaymentAttemptsTable.errorDetails,
    })
    .from(csPaymentAttemptsTable)
    .where(eq(csPaymentAttemptsTable.attemptId, attemptId))
    .limit(1);

  if (!rows[0]) {
    return res.status(404).json({ ok: false, message: "Attempt not found" }); // i18n-ignore
  }

  const { status, orderId, errorDetails } = rows[0];
  const errorSummary =
    status === "FAILED" && errorDetails
      ? ((errorDetails as any).message as string | undefined) ?? "Payment could not be completed"
      : undefined;

  return res.json({ ok: true, status, orderId: orderId ?? null, errorSummary: errorSummary ?? null });
});

// POST /payment/cybersource/attempt/:attemptId/complete
// Runs the full server-side chain: validate → authorize → order-create.
// Idempotent: repeated calls return the stored orderId without re-charging.
router.post("/payment/cybersource/attempt/:attemptId/complete", async (req, res) => {
  const { attemptId } = req.params;
  if (!ATTEMPT_ID_RE.test(attemptId)) {
    return res.status(400).json({ ok: false, message: "Invalid attemptId" }); // i18n-ignore
  }

  const result = await runCsAttemptCompleteChain(attemptId, req.log);

  if (!result.ok) {
    // 409 = transient failure (OS down); frontend should keep polling.
    // 422 = terminal failure (card declined, validation failed).
    const rows = await db
      .select({ status: csPaymentAttemptsTable.status })
      .from(csPaymentAttemptsTable)
      .where(eq(csPaymentAttemptsTable.attemptId, attemptId))
      .limit(1);
    const currentStatus = rows[0]?.status ?? "FAILED";
    const httpStatus = currentStatus === "FAILED" ? 422 : 409;
    return res.status(httpStatus).json({ ok: false, message: result.errorMessage, status: currentStatus });
  }

  return res.json({ ok: true, orderId: result.orderId, status: "COMPLETED" });
});

// POST /payment/cybersource/reconcile
// One-time reconciliation: given an attemptId or csRequestId, retries order
// creation without re-charging. For operations use only — not called by the
// normal checkout flow.
router.post("/payment/cybersource/reconcile", async (req, res) => {
  const { attemptId, csRequestId } = req.body as { attemptId?: string; csRequestId?: string };

  let resolvedAttemptId: string | null = null;

  if (attemptId && ATTEMPT_ID_RE.test(attemptId)) {
    resolvedAttemptId = attemptId;
  } else if (csRequestId && /^[A-Za-z0-9_-]{8,120}$/.test(csRequestId)) {
    const rows = await db
      .select({ attemptId: csPaymentAttemptsTable.attemptId })
      .from(csPaymentAttemptsTable)
      .where(eq(csPaymentAttemptsTable.csRequestId, csRequestId))
      .limit(1);
    resolvedAttemptId = rows[0]?.attemptId ?? null;
  }

  if (!resolvedAttemptId) {
    return res.status(400).json({ ok: false, message: "Provide a valid attemptId or csRequestId" }); // i18n-ignore
  }

  req.log.info({ resolvedAttemptId, csRequestId }, "cs_reconcile: triggered"); // i18n-ignore
  const result = await runCsAttemptCompleteChain(resolvedAttemptId, req.log);

  if (!result.ok) {
    return res.status(422).json({ ok: false, message: result.errorMessage });
  }
  return res.json({ ok: true, orderId: result.orderId, message: "Order reconciled successfully" }); // i18n-ignore
});

// ── Payer-auth challenge return relay ────────────────────────────────────────
// The Cardinal step-up iframe form-POSTs (or GETs) this URL when the issuer
// challenge finishes. It serves HTML that handles all three return contexts:
//
//   1. Separate tab  (window.opener present): postMessage to opener, ACK wait, close.
//   2. Iframe        (window.parent != window): postMessage to parent.
//   3. Top-level     (neither): redirect to /checkout/payment-resume?attempt=<id>.
//
// The target origin for postMessage is window.location.origin — the same
// origin as the checkout page — never "*".
//
// The completion chain is fired server-side asynchronously; the client polls
// GET /payment/cybersource/attempt/:attemptId/status to know when done.
const handlePayerAuthChallengeReturn = async (req: Request, res: Response) => {
  const rawTxnId = ((req.body as Record<string, unknown> | undefined)?.TransactionId ??
    (req.query?.TransactionId as unknown) ??
    "") as unknown;
  const transactionId =
    typeof rawTxnId === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(rawTxnId) ? rawTxnId : "";

  const rawRefId = ((req.body as Record<string, unknown> | undefined)?.ReferenceId ??
    (req.query?.ReferenceId as unknown) ??
    "") as unknown;
  const referenceId =
    typeof rawRefId === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(rawRefId) ? rawRefId : "";

  // Attempt ID passed by the enrollment returnUrl: ?attempt=<id>
  const rawAttemptId = (req.body as any)?.attempt ?? req.query?.attempt ?? "";
  const attemptId =
    typeof rawAttemptId === "string" && ATTEMPT_ID_RE.test(rawAttemptId) ? rawAttemptId : "";

  req.log.info(
    {
      PAYMENT_DIAG: true,
      stage: "challenge_return_received",
      hasTransactionId: transactionId !== "",
      hasReferenceId: referenceId !== "",
      hasAttemptId: attemptId !== "",
    },
    "CyberSource PA challenge return relay",
  );

  // ── Callback correlation check ───────────────────────────────────────────
  // Before firing the completion chain, verify the TransactionId returned by
  // Cardinal matches the one stored during enrollment. A mismatch means the
  // callback was misrouted or spoofed — do not trigger order creation.
  if (attemptId) {
    let shouldRunChain = true;
    try {
      const rows = await db
        .select({ csAuthTxnId: csPaymentAttemptsTable.csAuthenticationTransactionId })
        .from(csPaymentAttemptsTable)
        .where(eq(csPaymentAttemptsTable.attemptId, attemptId))
        .limit(1);
      const storedTxnId = rows[0]?.csAuthTxnId;
      if (storedTxnId && transactionId && storedTxnId !== transactionId) {
        req.log.warn(
          { attemptId, stage: "challenge_return_received", storedTxnId, receivedTxnId: transactionId },
          "cs_attempt: callback TransactionId mismatch — rejecting completion trigger", // i18n-ignore
        );
        shouldRunChain = false;
      }
    } catch (lookupErr) {
      req.log.error(
        { attemptId, err: (lookupErr as Error)?.message },
        "cs_attempt: callback correlation lookup failed — proceeding", // i18n-ignore
      );
      // On lookup failure, still fire the chain (fail-open is safer for payments).
    }

    // Fire the server-side completion chain asynchronously — do NOT await it
    // before returning the relay HTML. The browser must receive the HTML
    // immediately; the frontend polls /attempt/:id/complete for retry and
    // /attempt/:id/status for display.
    if (shouldRunChain) {
      void runCsAttemptCompleteChain(attemptId, rootLogger).catch((err) => {
        rootLogger.error({ attemptId, err: (err as Error)?.message }, "cs_attempt: background complete chain error"); // i18n-ignore
      });
    }
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const safeAttemptId = JSON.stringify(attemptId);
  const safeTransactionId = JSON.stringify(transactionId);

  // The relay HTML handles all three return contexts and targets
  // window.location.origin so the postMessage target is never "*".
  res.send(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Card verification</title></head>
<body style="font-family:system-ui,sans-serif;text-align:center;padding-top:48px;color:#555;">
<p>Verification complete. Returning to checkout\u2026</p>
<script>
(function () {
  var attemptId = ${safeAttemptId};
  var transactionId = ${safeTransactionId};
  var msg = JSON.stringify({
    type: "CYBERSOURCE_3DS_COMPLETE",
    attemptId: attemptId,
    // Legacy field kept for backward compatibility with old frictionless path
    MessageType: "cybersource.stepUpComplete",
    Status: "COMPLETE",
    TransactionId: transactionId
  });
  var origin = window.location.origin;

  try {
    // Context 1: opened in a separate browser tab (window.opener is the checkout)
    if (window.opener && window.opener !== window) {
      var acked = false;
      window.addEventListener("message", function (e) {
        if (e.origin === origin && e.data && e.data.type === "CYBERSOURCE_3DS_ACK") {
          acked = true;
          window.close();
        }
      });
      window.opener.postMessage(msg, origin);
      // Auto-close fallback if ACK never arrives
      setTimeout(function () { if (!acked) window.close(); }, 5000);
      return;
    }

    // Context 2: inside an iframe (window.parent is the checkout)
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(msg, origin);
      return;
    }
  } catch (e) { /* cross-origin access blocked — fall through to redirect */ }

  // Context 3: top-level navigation (no opener, no parent)
  if (attemptId) {
    window.location.replace("/checkout/payment-resume?attempt=" + encodeURIComponent(attemptId));
  } else {
    window.location.replace("/checkout");
  }
})();
</script>
</body>
</html>`); // i18n-ignore
};

router.post("/payment/cybersource/payer-auth/return", handlePayerAuthChallengeReturn);
router.get("/payment/cybersource/payer-auth/return", handlePayerAuthChallengeReturn);

export default router;

