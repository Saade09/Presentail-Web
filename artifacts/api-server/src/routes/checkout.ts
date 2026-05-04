import { Router, type IRouter } from "express";
import Stripe from "stripe";
import {
  convertFromUsd,
  normalizeCurrency,
  toStripeMinorUnits,
} from "../lib/fx";
import { resolveCartItems } from "../lib/catalog";
import { storePaymentIntent } from "../lib/checkoutIntents";
import { resolveStoreFromRequest } from "../lib/wooStore";

const router: IRouter = Router();

type LineItemInput = {
  wcId: number;
  quantity: number;
  // Display-only fields forwarded to Stripe; prices are never read from here.
  name?: string;
  description?: string;
  image?: string;
};

type Body = {
  items: LineItemInput[];
  orderId: string; // app order ID — bound to the intent so /woo/order can verify
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
    orderId,
    currency: rawCurrency,
    email,
    metadata,
    successUrl,
    cancelUrl,
  } = req.body as Body;

  if (!orderId) {
    return res.status(400).json({ ok: false, message: "orderId is required" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, message: "No items in cart" });
  }
  if (items.some((i) => !i.wcId || !Number.isInteger(i.quantity) || i.quantity < 1)) {
    return res.status(400).json({
      ok: false,
      message: "Each item must have a valid wcId and a positive integer quantity",
    });
  }
  if (!successUrl || !cancelUrl) {
    return res.status(400).json({ ok: false, message: "successUrl and cancelUrl are required" });
  }

  // Resolve catalog prices server-side. Client-supplied amounts are ignored.
  const store = resolveStoreFromRequest(req);
  const catalogResult = await resolveCartItems(items, store);
  if (!catalogResult.ok) {
    return res.status(422).json({ ok: false, message: catalogResult.message });
  }

  const currency = normalizeCurrency(rawCurrency ?? "USD");
  const stripeCurrency = currency.toLowerCase();

  try {
    const convertedItems = await Promise.all(
      catalogResult.items.map(async (i) => {
        const convertedUnit = await convertFromUsd(i.priceUsd, currency);
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
      // orderId is embedded in metadata so verifyStripePayment can confirm
      // this session was not created for a different order and replayed.
      metadata: { ...(metadata ?? {}), orderId, presented_currency: currency },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    // Store a payment intent that binds this Stripe session to the specific
    // orderId AND records the authoritative cart snapshot (catalog-resolved
    // wcId+quantity+priceUsd). The /woo/order endpoint will verify that the
    // submitted cart matches this snapshot before marking the order as paid.
    // For Stripe, the charged total covers product subtotal only (no delivery).
    storePaymentIntent({
      orderId,
      paymentRef: session.id,
      provider: "stripe",
      totalUsd: catalogResult.subtotalUsd,
      snapshot: {
        items: catalogResult.items.map((i) => ({
          wcId: i.wcId,
          quantity: i.quantity,
          priceUsd: i.priceUsd,
        })),
        // District/express are not part of the Stripe charge for this flow,
        // but they are stored for audit purposes. The /woo/order endpoint
        // computes delivery fees independently from the server-side table.
        district: "",
        expressDelivery: false,
      },
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
