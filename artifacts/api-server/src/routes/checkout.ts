import { Router, type IRouter } from "express";
import Stripe from "stripe";

const router: IRouter = Router();

type LineItem = {
  name: string;
  description?: string;
  image?: string;
  amount: number; // unit amount in cents
  quantity: number;
};

type Body = {
  items: LineItem[];
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
    currency = "usd",
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

  try {
    const stripe = new Stripe(key);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: items.map((i) => ({
        quantity: i.quantity,
        price_data: {
          currency,
          unit_amount: Math.round(i.amount),
          product_data: {
            name: i.name,
            description: i.description,
            images: i.image ? [i.image] : undefined,
          },
        },
      })),
      metadata: metadata ?? {},
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return res.json({
      ok: true,
      id: session.id,
      url: session.url,
    });
  } catch (err: any) {
    return res
      .status(500)
      .json({ ok: false, code: "stripe_error", message: err?.message ?? "Stripe error" });
  }
});

export default router;
