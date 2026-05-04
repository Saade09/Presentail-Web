import { Router, type IRouter } from "express";
import {
  convertFromUsd,
  normalizeCurrency,
  paypalCurrencyFor,
  roundForCurrency,
} from "../lib/fx";
import {
  resolveCartItems,
  computeDistrictFeeUsd,
  EXPRESS_SURCHARGE_USD,
} from "../lib/catalog";
import { storePaymentIntent } from "../lib/checkoutIntents";
import { resolveStoreFromRequest } from "../lib/wooStore";

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
      message: "Mamo is not configured. Add MAMO_SECRET_KEY to enable.",
    });
  }

  const {
    items,
    orderId,
    district,
    expressDelivery,
    currency: rawCurrency,
    title,
    description,
    email,
    firstName,
    lastName,
    returnUrl,
    failureReturnUrl,
  } = req.body as {
    items: { wcId: number; quantity: number }[];
    orderId: string;
    district?: string;
    expressDelivery?: boolean;
    currency?: string;
    title?: string;
    description?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    returnUrl: string;
    failureReturnUrl: string;
  };

  if (!orderId) {
    return res.status(400).json({ ok: false, message: "orderId is required" });
  }
  if (!returnUrl || !failureReturnUrl) {
    return res.status(400).json({ ok: false, message: "returnUrl and failureReturnUrl are required" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, message: "items is required" });
  }

  // Resolve catalog prices server-side.
  const store = resolveStoreFromRequest(req);
  const catalogResult = await resolveCartItems(items, store);
  if (!catalogResult.ok) {
    return res.status(422).json({ ok: false, message: catalogResult.message });
  }

  const resolvedDistrict = district ?? "Beirut";
  const isExpress = expressDelivery === true;
  const subtotalUsd = catalogResult.subtotalUsd;
  const districtFeeUsd = computeDistrictFeeUsd(resolvedDistrict, subtotalUsd);
  const expressFeeUsd = isExpress ? EXPRESS_SURCHARGE_USD : 0;
  const totalUsd = subtotalUsd + districtFeeUsd + expressFeeUsd;

  // Mamo settles in AED only — convert the server-computed USD total.
  const presented = normalizeCurrency(rawCurrency ?? "USD");
  const aedAmount = roundForCurrency(await convertFromUsd(totalUsd, "AED"), "AED");

  try {
    const r = await fetch("https://business.mamopay.com/manage_api/v1/links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        title: title ?? "Presentail Order",
        amount: aedAmount,
        return_url: returnUrl,
        failure_return_url: failureReturnUrl,
        description: description ?? undefined,
        email: email ?? undefined,
        first_name: firstName ?? undefined,
        last_name: lastName ?? undefined,
      }),
    });

    const data = (await r.json()) as any;

    if (!r.ok) {
      const msg =
        data?.errors?.[0]?.message ?? data?.message ?? data?.error ?? "Mamo error";
      return res.status(r.status).json({ ok: false, code: "mamo_error", message: msg });
    }

    // Store the intent with the full cart snapshot so /woo/order can verify:
    //   1. orderId↔paymentRef binding (prevents replay for a different order)
    //   2. submitted cart matches the paid-for cart (prevents cart substitution)
    storePaymentIntent({
      orderId,
      paymentRef: String(data.id),
      provider: "mamo",
      totalUsd,
      snapshot: {
        items: catalogResult.items.map((i) => ({
          wcId: i.wcId,
          quantity: i.quantity,
          priceUsd: i.priceUsd,
        })),
        district: resolvedDistrict,
        expressDelivery: isExpress,
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
    return res.status(500).json({ ok: false, code: "mamo_error", message: e?.message ?? "Mamo error" });
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
    throw new Error(data?.error_description ?? "Failed to get PayPal token");
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
      message: "PayPal is not configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.",
    });
  }

  const {
    items,
    orderId,
    district,
    expressDelivery,
    currency: rawCurrency,
    returnUrl,
    cancelUrl,
  } = req.body as {
    items: { wcId: number; quantity: number }[];
    orderId: string;
    district?: string;
    expressDelivery?: boolean;
    currency?: string;
    returnUrl: string;
    cancelUrl: string;
  };

  if (!orderId) {
    return res.status(400).json({ ok: false, message: "orderId is required" });
  }
  if (!returnUrl || !cancelUrl) {
    return res.status(400).json({ ok: false, message: "returnUrl and cancelUrl are required" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, message: "items is required" });
  }

  // Resolve catalog prices server-side.
  const ppStore = resolveStoreFromRequest(req);
  const catalogResult = await resolveCartItems(items, ppStore);
  if (!catalogResult.ok) {
    return res.status(422).json({ ok: false, message: catalogResult.message });
  }

  const resolvedDistrict = district ?? "Beirut";
  const isExpress = expressDelivery === true;
  const subtotalUsd = catalogResult.subtotalUsd;
  const districtFeeUsd = computeDistrictFeeUsd(resolvedDistrict, subtotalUsd);
  const expressFeeUsd = isExpress ? EXPRESS_SURCHARGE_USD : 0;
  const totalUsd = subtotalUsd + districtFeeUsd + expressFeeUsd;

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
        .json({ ok: false, code: "paypal_error", message: data?.message ?? "PayPal error" });
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
      totalUsd,
      snapshot: {
        items: catalogResult.items.map((i) => ({
          wcId: i.wcId,
          quantity: i.quantity,
          priceUsd: i.priceUsd,
        })),
        district: resolvedDistrict,
        expressDelivery: isExpress,
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
      .json({ ok: false, code: "paypal_error", message: e?.message ?? "PayPal error" });
  }
});

export default router;
