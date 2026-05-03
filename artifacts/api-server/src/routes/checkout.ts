import { Router, type IRouter } from "express";
import Stripe from "stripe";
import {
  convertFromUsd,
  normalizeCurrency,
  toStripeMinorUnits,
} from "../lib/fx";

const router: IRouter = Router();

type LineItem = {
  name: string;
  description?: string;
  image?: string;
  amount: number; // unit amount in USD cents (catalogue is priced in USD)
  quantity: number;
};

type Body = {
  items: LineItem[];
  // ISO 4217 of the currency the shopper saw in-app. Server converts USD →
  // this currency so Stripe charges the same amount the customer agreed to.
  currency?: string;
  email?: string;
  metadata?: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
};

router.post("/checkout/session", async (req, res) => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return res.status(503).json({
      ok: false,
      code: "stripe_not_configured",
      message:
        "Stripe isn't configured yet. Add STRIPE_SECRET_KEY to enable real card payments.",
    });
  }

  const {
    items,
    currency: rawCurrency,
    email,
    metadata,
    successUrl,
    cancelUrl,
  } = req.body as Body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, message: "No items in cart" });
  }
  if (!successUrl || !cancelUrl) {
    return res
      .status(400)
      .json({ ok: false, message: "successUrl and cancelUrl are required" });
  }

  const currency = normalizeCurrency(rawCurrency ?? "USD");
  const stripeCurrency = currency.toLowerCase();

  try {
    // Convert each line item's USD price into the customer's currency using
    // live FX rates, then format for Stripe's smallest-unit convention.
    const convertedItems = await Promise.all(
      items.map(async (i) => {
        const usdUnit = i.amount / 100; // amount was in USD cents
        const convertedUnit = await convertFromUsd(usdUnit, currency);
        return {
          ...i,
          minorUnit: toStripeMinorUnits(convertedUnit, currency),
        };
      }),
    );

    const stripe = new Stripe(key);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: convertedItems.map((i) => ({
        quantity: i.quantity,
        price_data: {
          currency: stripeCurrency,
          unit_amount: i.minorUnit,
          product_data: {
            name: i.name,
            description: i.description,
            images: i.image ? [i.image] : undefined,
          },
        },
      })),
      metadata: { ...(metadata ?? {}), presented_currency: currency },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return res.json({
      ok: true,
      id: session.id,
      url: session.url,
      currency,
    });
  } catch (err: any) {
    return res
      .status(500)
      .json({ ok: false, code: "stripe_error", message: err?.message ?? "Stripe error" });
  }
});

export default router;
