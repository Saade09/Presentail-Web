import { Router, type IRouter } from "express";

const router: IRouter = Router();

// ── Payment-return bridge ─────────────────────────────────────────────────
// Payment providers (Mamo, PayPal) only accept HTTPS return URLs. We give them
// this URL with a `deeplink` query, then 302-redirect to the app's custom
// scheme. expo-web-browser's openAuthSessionAsync detects the deep link and
// closes the in-app browser, returning control to the app.
router.get("/payment/return", (req, res) => {
  const deeplink = String(req.query.deeplink ?? "");
  const status = String(req.query.status ?? "success");
  if (!deeplink || !/^[a-z][a-z0-9+.-]*:\/\//i.test(deeplink)) {
    res.status(400).send("Invalid deep link");
    return;
  }
  const sep = deeplink.includes("?") ? "&" : "?";
  const target = `${deeplink}${sep}status=${encodeURIComponent(status)}`;
  res.setHeader("Cache-Control", "no-store");
  // Use HTML meta-refresh + JS in case some browsers won't 302 to a custom scheme.
  res.status(200).send(`<!doctype html><html><head><meta charset="utf-8"><title>Returning to Presentail…</title><meta http-equiv="refresh" content="0;url=${target}"><script>window.location.replace(${JSON.stringify(target)});</script></head><body style="font-family:-apple-system,Segoe UI,sans-serif;background:#fff8ec;color:#00414e;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:24px;"><div><div style="font-size:18px;margin-bottom:8px">Returning to Presentail…</div><div style="font-size:13px;opacity:.7">If nothing happens, <a href="${target}">tap here</a>.</div></div></body></html>`);
});

// ── Mamo Payment Link ──────────────────────────────────────────────────────
router.post("/payment/mamo", async (req, res) => {
  const key = process.env.MAMO_SECRET_KEY;
  if (!key) {
    return res.status(503).json({
      ok: false,
      code: "mamo_not_configured",
      message: "Mamo is not configured. Add MAMO_SECRET_KEY to enable.",
    });
  }

  const { amount, title, description, email, firstName, lastName, returnUrl, failureReturnUrl } =
    req.body as {
      amount: number;
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

  try {
    const r = await fetch("https://business.mamopay.com/manage_api/v1/links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        title: title ?? "Presentail Order",
        amount,
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

    return res.json({ ok: true, url: data.payment_url, id: data.id });
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

  const { amount, currency = "USD", returnUrl, cancelUrl, orderId } = req.body as {
    amount: number;
    currency?: string;
    returnUrl: string;
    cancelUrl: string;
    orderId: string;
  };

  if (!returnUrl || !cancelUrl || !orderId) {
    return res.status(400).json({ ok: false, message: "returnUrl, cancelUrl and orderId are required" });
  }

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
              currency_code: currency.toUpperCase(),
              value: Number(amount).toFixed(2),
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

    return res.json({ ok: true, url: approveLink, id: data.id });
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, code: "paypal_error", message: e?.message ?? "PayPal error" });
  }
});

export default router;
