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
import { validateCoupon } from "../lib/couponValidation";

const router: IRouter = Router();

// Currencies routed to the Gulf Stripe account.
const GULF_STRIPE_CURRENCIES = ["KWD", "OMR"] as const;

/**
 * Return the Stripe secret key for the given currency.
 * KWD and OMR are charged through the Gulf account (STRIPE_SECRET_KEY_GULF);
 * all other currencies use the main account (STRIPE_SECRET_KEY).
 * If the Gulf key is not set, logs a warning and falls back to the main key.
 */
function getStripeSecretKey(
  currency: string,
  log?: { warn: (obj: object, msg: string) => void },
): string | null {
  const isGulf = (GULF_STRIPE_CURRENCIES as readonly string[]).includes(currency);
  if (isGulf) {
    const gulfKey = process.env.STRIPE_SECRET_KEY_GULF;
    if (gulfKey) return gulfKey;
    log?.warn(
      { currency },
      "STRIPE_SECRET_KEY_GULF not set; falling back to default Stripe account for Gulf currency",
    );
    return process.env.STRIPE_SECRET_KEY ?? null;
  }
  return process.env.STRIPE_SECRET_KEY ?? null;
}

type LineItemInput = {
  wcId: number;
  // OS product slug — used when wcId is 0 (OS-native products not mirrored in WC).
  osSlug?: string;
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
    return res.status(400).json({ ok: false, message: "orderId is required" }); // i18n-ignore
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, message: "No items in cart" }); // i18n-ignore
  }
  if (items.some((i) => (!i.wcId && !i.osSlug) || !Number.isInteger(i.quantity) || i.quantity < 1)) {
    return res.status(400).json({
      ok: false,
      message: "Each item must have a valid product identifier and a positive integer quantity", // i18n-ignore
    });
  }
  if (!successUrl || !cancelUrl) {
    return res.status(400).json({ ok: false, message: "successUrl and cancelUrl are required" }); // i18n-ignore
  }

  const currency = normalizeCurrency(rawCurrency ?? "USD");

  const key = getStripeSecretKey(currency, req.log);
  if (!key) {
    return res.status(503).json({
      ok: false,
      code: "stripe_not_configured",
      message:
        "Stripe isn't configured yet. Add STRIPE_SECRET_KEY to enable real card payments.",
    });
  }

  const stripeCurrency = currency.toLowerCase();

  // Resolve catalog prices server-side. Client-supplied amounts are ignored.
  const store = resolveStoreFromRequest(req);
  const catalogResult = await resolveCartItems(items, store);
  if (!catalogResult.ok) {
    return res.status(422).json({ ok: false, message: catalogResult.message });
  }

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
      // Omitting payment_method_types lets Stripe use all payment methods
      // enabled on the account (card, Apple Pay, Google Pay, etc.).
      // Explicitly listing only ["card"] would suppress wallet options.
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
          osSlug: i.osSlug,
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
      .json({ ok: false, code: "stripe_error", message: err?.message ?? "Stripe error" }); // i18n-ignore
  }
});

type PaymentIntentBody = {
  items: { wcId: number; osSlug?: string; quantity: number }[];
  orderId: string;
  currency?: string;
  email?: string;
  deliveryFeeUsd?: number;
  district?: string;
  expressDelivery?: boolean;
  noAddress?: boolean;
  couponCode?: string;
  metadata?: Record<string, string>;
};

router.post("/checkout/payment-intent", async (req, res) => {
  const { items, orderId, currency: rawCurrency, email, metadata, deliveryFeeUsd: rawDeliveryFeeUsd, district, expressDelivery, noAddress, couponCode } =
    req.body as PaymentIntentBody;

  if (!orderId) {
    return res.status(400).json({ ok: false, message: "orderId is required" }); // i18n-ignore
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, message: "No items in cart" }); // i18n-ignore
  }
  if (items.some((i) => (!i.wcId && !i.osSlug) || !Number.isInteger(i.quantity) || i.quantity < 1)) {
    return res.status(400).json({
      ok: false,
      message: "Each item must have a valid product identifier and a positive integer quantity", // i18n-ignore
    });
  }

  const currency = normalizeCurrency(rawCurrency ?? "USD");

  const key = getStripeSecretKey(currency, req.log);
  if (!key) {
    return res.status(503).json({
      ok: false,
      code: "stripe_not_configured",
      message:
        "Stripe isn't configured yet. Add STRIPE_SECRET_KEY to enable real card payments.",
    });
  }

  const store = resolveStoreFromRequest(req);
  const catalogResult = await resolveCartItems(items, store);
  if (!catalogResult.ok) {
    return res.status(422).json({ ok: false, message: catalogResult.message });
  }

  // Use the client-computed delivery fee (district + express + slot). The client
  // derives this from the same OS /delivery-locations data the customer sees on
  // screen, so the charged amount matches the displayed total exactly.
  // Cap at $200 and floor at $0 for basic sanity; never trust for product prices.
  const clientDeliveryFeeUsd =
    typeof rawDeliveryFeeUsd === "number" && rawDeliveryFeeUsd >= 0
      ? Math.min(rawDeliveryFeeUsd, 200)
      : 0;
  const subtotalUsd = catalogResult.subtotalUsd;
  const totalUsd = subtotalUsd + clientDeliveryFeeUsd;

  const stripeCurrency = currency.toLowerCase();

  try {
    const convertedSubtotal = await Promise.all(
      catalogResult.items.map(async (i) => {
        const convertedUnit = await convertFromUsd(i.priceUsd, currency);
        return { ...i, minorUnit: toStripeMinorUnits(convertedUnit, currency) };
      }),
    );

    const subtotalMinorUnits = convertedSubtotal.reduce(
      (sum, i) => sum + i.minorUnit * i.quantity,
      0,
    );

    // Include delivery fee in the charged amount.
    const deliveryFeeMinorUnits = clientDeliveryFeeUsd > 0
      ? toStripeMinorUnits(await convertFromUsd(clientDeliveryFeeUsd, currency), currency)
      : 0;

    // Apply coupon discount if a code is provided.
    // The server re-validates the code (never trusts client-supplied discount amounts).
    let couponDiscountUsd = 0;
    let couponDiscountMinorUnits = 0;
    if (couponCode && couponCode.trim()) {
      const cartItemsForCoupon = catalogResult.items.map((i) => ({
        osSlug: i.osSlug ?? "",
        priceUsd: i.priceUsd,
        quantity: i.quantity,
      }));
      const couponResult = await validateCoupon(couponCode.trim(), {
        customerEmail: email ?? "",
        cartItems: cartItemsForCoupon,
        cartTotalUsd: subtotalUsd,
      });
      if (couponResult.valid) {
        couponDiscountUsd = couponResult.discountAmountUsd;
        couponDiscountMinorUnits = toStripeMinorUnits(
          await convertFromUsd(couponDiscountUsd, currency),
          currency,
        );
      }
    }

    const totalMinorUnits = Math.max(0, subtotalMinorUnits + deliveryFeeMinorUnits - couponDiscountMinorUnits);

    const stripe = new Stripe(key);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalMinorUnits,
      currency: stripeCurrency,
      // automatic_payment_methods lets Stripe include Apple Pay, Google Pay, and
      // card without enumerating them explicitly, and automatically surfaces any
      // future wallet methods Stripe adds to the account.
      automatic_payment_methods: { enabled: true },
      metadata: { ...(metadata ?? {}), orderId, presented_currency: currency },
      ...(email ? { receipt_email: email } : {}),
    });

    storePaymentIntent({
      orderId,
      paymentRef: paymentIntent.id,
      provider: "stripe",
      totalUsd,
      snapshot: {
        items: catalogResult.items.map((i) => ({
          wcId: i.wcId,
          osSlug: i.osSlug,
          quantity: i.quantity,
          priceUsd: i.priceUsd,
        })),
        district: district ?? "Beirut",
        expressDelivery: expressDelivery === true,
        noAddress: noAddress === true,
      },
    });

    return res.json({
      ok: true,
      clientSecret: paymentIntent.client_secret,
      orderId,
      amount: totalMinorUnits,
      currency,
    });
  } catch (err: any) {
    return res
      .status(500)
      .json({ ok: false, code: "stripe_error", message: err?.message ?? "Stripe error" }); // i18n-ignore
  }
});

export default router;
