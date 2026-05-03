import { Router, type IRouter } from "express";
import {
  convertFromUsd,
  normalizeCurrency,
  paypalCurrencyFor,
  roundForCurrency,
} from "../lib/fx";

const router: IRouter = Router();

// ── Payment-return bridge ─────────────────────────────────────────────────
// Payment providers (Mamo, PayPal) only accept HTTPS return URLs. We give them
// this URL with a `deeplink` query, then 302-redirect to the app's custom
// scheme. expo-web-browser's openAuthSessionAsync detects the deep link and
// closes the in-app browser, returning control to the app.

/** Escape a string for safe embedding in an HTML attribute or text node. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Allowlisted deep-link host+path combinations that the payment-return bridge
 * is permitted to redirect to. Only the expected payment-return screen is
 * accepted; every other destination is rejected.
 */
const ALLOWED_DEEPLINK_HOSTS = new Set(["payment-return"]);

/**
 * Build the strictly validated target deep link from the inbound query params.
 * Returns null if the caller-supplied deeplink is not on the allowlist.
 *
 * Rather than reflecting the raw `deeplink` value, we extract only the host
 * portion (the path segment after `presentail://`) and reconstruct the URL
 * from scratch so no injected characters can survive into the output.
 */
function buildTarget(deeplink: string, status: string): string | null {
  // Must start with exactly the expected scheme.
  if (!deeplink.startsWith("presentail://")) return null;

  // Extract and validate the host (everything between `presentail://` and the
  // first `?` or end of string — no path segments, no injected characters).
  const afterScheme = deeplink.slice("presentail://".length);
  const host = afterScheme.split("?")[0];

  if (!ALLOWED_DEEPLINK_HOSTS.has(host)) return null;

  // Reconstruct the target entirely from known-safe components.
  return `presentail://${host}?status=${encodeURIComponent(status)}`;
}

router.get("/payment/return", (req, res) => {
  const deeplink = String(req.query.deeplink ?? "");
  const rawStatus = String(req.query.status ?? "success");

  const target = buildTarget(deeplink, rawStatus);
  if (!target) {
    res.status(400).send("Invalid deep link");
    return;
  }

  res.setHeader("Cache-Control", "no-store");

  // Primary: 302 redirect — the fastest and cleanest path for browsers and
  // in-app WebViews that honour custom-scheme redirects.
  // Fallback HTML is provided for environments that do not follow 302s to
  // custom schemes (some older in-app browsers); all values are HTML-escaped.
  const safeTarget = escapeHtml(target);
  res.setHeader("Location", target);
  res.status(302).send(
    `<!doctype html><html><head><meta charset="utf-8"><title>Returning to Presentail\u2026</title>` +
    `<meta http-equiv="refresh" content="0;url=${safeTarget}">` +
    `<script>window.location.replace(${JSON.stringify(target)});</script>` +
    `</head><body style="font-family:-apple-system,Segoe UI,sans-serif;background:#fff8ec;color:#00414e;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:24px;">` +
    `<div><div style="font-size:18px;margin-bottom:8px">Returning to Presentail\u2026</div>` +
    `<div style="font-size:13px;opacity:.7">If nothing happens, <a href="${safeTarget}">tap here</a>.</div></div>` +
    `</body></html>`
  );
});

// ── Mamo Payment Link ──────────────────────────────────────────────────────
// Mamo settles in AED only. The app sends `amount` as the USD total plus the
// shopper's selected `currency`; the server converts to AED here so what the
// user sees in-app matches what Mamo charges (and persists the presented
// currency for receipts).
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
    amount,
    currency: rawCurrency,
    title,
    description,
    email,
    firstName,
    lastName,
    returnUrl,
    failureReturnUrl,
  } = req.body as {
    amount: number;
    currency?: string;
    title?: string;
    description?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    returnUrl: string;
    failureReturnUrl: string;
  };

  if (!returnUrl || !failureReturnUrl) {
    return res.status(400).json({ ok: false, message: "returnUrl and failureReturnUrl are required" });
  }

  // The app sends the USD subtotal; Mamo only accepts AED so we convert here.
  const presented = normalizeCurrency(rawCurrency ?? "USD");
  const usdAmount = Number(amount) || 0;
  const aedAmount = roundForCurrency(await convertFromUsd(usdAmount, "AED"), "AED");

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

  // The app sends `amount` as the USD total plus the shopper's selected
  // `currency`. PayPal supports a fixed presentment-currency list; if the
  // shopper picked something outside it (e.g. AED, KWD), we fall back to
  // USD so the order can still be created.
  const { amount, currency: rawCurrency, returnUrl, cancelUrl, orderId } = req.body as {
    amount: number;
    currency?: string;
    returnUrl: string;
    cancelUrl: string;
    orderId: string;
  };

  if (!returnUrl || !cancelUrl || !orderId) {
    return res.status(400).json({ ok: false, message: "returnUrl, cancelUrl and orderId are required" });
  }

  const presented = normalizeCurrency(rawCurrency ?? "USD");
  const settle = paypalCurrencyFor(presented);
  const usdAmount = Number(amount) || 0;
  const settleAmount = roundForCurrency(await convertFromUsd(usdAmount, settle), settle);

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
