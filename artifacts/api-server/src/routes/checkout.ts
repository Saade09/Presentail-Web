import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import {
  convertFromUsd,
  normalizeCurrency,
  toStripeMinorUnits,
} from "../lib/fx";
import { resolveCartItems } from "../lib/catalog";
import { storePaymentIntent, getPaymentIntentForOrder } from "../lib/checkoutIntents";
import { resolveStoreFromRequest, type StoreKey } from "../lib/wooStore";
import { validateCoupon } from "../lib/couponValidation";
import { authenticate } from "../lib/auth";
import { db, customersTable } from "@workspace/db";

const router: IRouter = Router();

/**
 * Maps a resolved StoreKey to a human-readable market name for the Stripe
 * payment description (e.g. "Order PR-123 from Presentail Lebanon").
 * Both UAE store keys (dubai + abudhabi) map to "UAE".
 */
function storeKeyToCountry(storeKey: StoreKey): string {
  switch (storeKey) {
    case "dubai":
    case "abudhabi":
      return "UAE";
    case "cyprus":
      return "Cyprus";
    case "lebanon":
    default:
      return "Lebanon";
  }
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

  const key = process.env.STRIPE_SECRET_KEY ?? null;
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
      // description must be set on the underlying PaymentIntent via
      // payment_intent_data — SessionCreateParams has no top-level description.
      payment_intent_data: {
        description: `Order ${orderId} from Presentail ${storeKeyToCountry(store.storeKey)}`,
      },
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
      stripeAccount: "main",
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
  saveCard?: boolean;
  metadata?: Record<string, string>;
};

/**
 * Look up or create a Stripe Customer for the authenticated local customer.
 * Returns the Stripe Customer ID, or null when the DB update fails.
 *
 * Upserts the resulting customer ID into the `customers` row so subsequent
 * checkouts reuse the same Stripe Customer.
 */
async function getOrCreateStripeCustomer(
  localCustomerId: number,
  stripe: Stripe,
  email?: string,
  log?: { warn: (obj: object, msg: string) => void },
): Promise<string | null> {
  try {
    // Fetch the current customer row to check for an existing Stripe Customer ID.
    const [row] = await db
      .select({
        stripeCustomerId: customersTable.stripeCustomerId,
        email: customersTable.email,
        firstName: customersTable.firstName,
        lastName: customersTable.lastName,
      })
      .from(customersTable)
      .where(eq(customersTable.id, localCustomerId))
      .limit(1);

    if (!row) return null;

    if (row.stripeCustomerId) return row.stripeCustomerId;

    // No Stripe Customer yet — create one.
    const customerEmail = email || row.email;
    const name = [row.firstName, row.lastName].filter(Boolean).join(" ") || undefined;
    const stripeCustomer = await stripe.customers.create({
      email: customerEmail || undefined,
      name,
      metadata: { presentail_customer_id: String(localCustomerId) },
    });

    // Persist the new Stripe Customer ID.
    await db
      .update(customersTable)
      .set({ stripeCustomerId: stripeCustomer.id })
      .where(eq(customersTable.id, localCustomerId));

    return stripeCustomer.id;
  } catch (err: any) {
    log?.warn({ err: err?.message, localCustomerId }, "Failed to get/create Stripe Customer"); // i18n-ignore
    return null;
  }
}

router.post("/checkout/payment-intent", async (req, res) => {
  const { items, orderId, currency: rawCurrency, email, metadata, deliveryFeeUsd: rawDeliveryFeeUsd, district, expressDelivery, noAddress, couponCode, saveCard } =
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

  const key = process.env.STRIPE_SECRET_KEY ?? null;
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

  // Resolve Stripe Customer for any authenticated request.
  // - When saveCard=true: also sets setup_future_usage so the card is saved.
  // - When authenticated without saveCard: customer is still attached so the
  //   shopper can pay with a previously saved payment method (confirmPayment
  //   with paymentMethodId requires the PI to have a customer).
  // Authentication is opportunistic — unauthenticated requests skip this block
  // silently, so guest checkout is unaffected.
  let stripeCustomerId: string | undefined;
  const authHeader = req.header("authorization");
  if (authHeader) {
    const auth = await authenticate(authHeader, req);
    if (auth.ok && auth.localCustomerId != null) {
      const stripe = new Stripe(key);
      const customerId = await getOrCreateStripeCustomer(
        auth.localCustomerId,
        stripe,
        email,
        req.log,
      );
      if (customerId) stripeCustomerId = customerId;
    }
  }

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

    // Idempotency: if a PaymentIntent was already created for this orderId,
    // retrieve it and reuse or update it rather than calling create again.
    // This prevents duplicate "Incomplete" PI entries in the Stripe dashboard
    // when the wallet pre-creation effect fires multiple times per session.
    const existingRef = getPaymentIntentForOrder(orderId);
    if (existingRef) {
      try {
        const existing = await stripe.paymentIntents.retrieve(existingRef);
        const reusableStatuses = ["requires_payment_method", "requires_confirmation"];
        if (reusableStatuses.includes(existing.status)) {
          if (existing.amount === totalMinorUnits && existing.currency === stripeCurrency) {
            // Same amount and currency — return the existing clientSecret without
            // hitting stripe.paymentIntents.create at all.
            // Refresh the stored entry so the snapshot reflects the current
            // cart (items may have changed even though the total is the same)
            // and so the TTL is extended for the continued session.
            storePaymentIntent({
              orderId,
              paymentRef: existingRef,
              provider: "stripe",
              stripeAccount: "main",
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
              clientSecret: existing.client_secret,
              orderId,
              amount: totalMinorUnits,
              currency,
            });
          }
          // Amount or currency changed (e.g. shopper switched delivery country) —
          // update the existing PI in place so the client_secret stays stable.
          const updated = await stripe.paymentIntents.update(existingRef, {
            amount: totalMinorUnits,
            currency: stripeCurrency,
          });
          storePaymentIntent({
            orderId,
            paymentRef: updated.id,
            provider: "stripe",
            stripeAccount: "main",
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
            clientSecret: updated.client_secret,
            orderId,
            amount: totalMinorUnits,
            currency,
          });
        }
        // PI already paid or is being processed — do not create a duplicate.
        if (existing.status === "succeeded" || existing.status === "processing") {
          return res.status(409).json({ ok: false, code: "already_paid", message: "This order has already been paid." }); // i18n-ignore
        }
        // PI is in a canceled or other non-reusable status — fall through to
        // create a fresh one below.
      } catch {
        // PI could not be retrieved (e.g. deleted in the Stripe dashboard) —
        // fall through and create a new one.
      }
    }

    // Cache miss (post-restart or TTL expiry) — search Stripe for an existing
    // PI created for this orderId before creating a new one. This prevents a
    // duplicate PaymentIntent when the in-memory cache is wiped (e.g. after a
    // Replit deployment) and the shopper retries a declined card.
    try {
      const searchResult = await stripe.paymentIntents.search({
        query: `metadata['orderId']:'${orderId}'`,
        limit: 5,
      });
      for (const pi of searchResult.data) {
        if (pi.status === "succeeded" || pi.status === "processing") {
          return res.status(409).json({ ok: false, code: "already_paid", message: "This order has already been paid." }); // i18n-ignore
        }
        const reusableSearchStatuses = ["requires_payment_method", "requires_confirmation"];
        if (reusableSearchStatuses.includes(pi.status)) {
          // Re-populate the cache so subsequent calls hit the fast path.
          storePaymentIntent({
            orderId,
            paymentRef: pi.id,
            provider: "stripe",
            stripeAccount: "main",
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
            clientSecret: pi.client_secret,
            orderId,
            amount: totalMinorUnits,
            currency,
          });
        }
      }
    } catch {
      // Stripe search failure — fall through to create a new PI.
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalMinorUnits,
      currency: stripeCurrency,
      // automatic_payment_methods lets Stripe include Apple Pay, Google Pay, and
      // card without enumerating them explicitly, and automatically surfaces any
      // future wallet methods Stripe adds to the account.
      automatic_payment_methods: { enabled: true },
      description: `Order ${orderId} from Presentail ${storeKeyToCountry(store.storeKey)}`,
      metadata: { ...(metadata ?? {}), orderId, presented_currency: currency },
      ...(email ? { receipt_email: email } : {}),
      // Attach Stripe Customer when the shopper is authenticated.
      // setup_future_usage is only set when the shopper explicitly opted in to
      // saving their card — this tells Stripe to store the card for off-session
      // use. Without saveCard the customer is still attached (required for
      // paying with a saved payment method via confirmPayment + paymentMethodId).
      ...(stripeCustomerId
        ? {
            customer: stripeCustomerId,
            ...(saveCard === true ? { setup_future_usage: "off_session" } : {}),
          }
        : {}),
    });

    storePaymentIntent({
      orderId,
      paymentRef: paymentIntent.id,
      provider: "stripe",
      stripeAccount: "main",
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

// ── GET /checkout/payment-methods ────────────────────────────────────────────
// Returns the saved Stripe payment methods (cards) for the authenticated
// customer. Returns an empty array when the customer has no Stripe Customer
// record or no saved cards.
router.get("/checkout/payment-methods", async (req, res) => {
  const auth = await authenticate(req.header("authorization"), req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, message: auth.message });
  }
  if (auth.localCustomerId == null) {
    return res.json({ ok: true, paymentMethods: [] });
  }

  try {
    const [row] = await db
      .select({ stripeCustomerId: customersTable.stripeCustomerId })
      .from(customersTable)
      .where(eq(customersTable.id, auth.localCustomerId))
      .limit(1);

    if (!row || !row.stripeCustomerId) return res.json({ ok: true, paymentMethods: [] });

    const mainKey = process.env.STRIPE_SECRET_KEY;
    if (!mainKey) return res.json({ ok: true, paymentMethods: [] });

    const stripe = new Stripe(mainKey);
    const list = await stripe.paymentMethods.list({ customer: row.stripeCustomerId, type: "card" });
    const results = list.data
      .filter((pm) => pm.card)
      .map((pm) => ({
        id: pm.id,
        brand: pm.card!.brand,
        last4: pm.card!.last4,
        expMonth: pm.card!.exp_month,
        expYear: pm.card!.exp_year,
      }));

    return res.json({ ok: true, paymentMethods: results });
  } catch (err: any) {
    req.log.warn({ err: err?.message }, "Failed to list payment methods"); // i18n-ignore
    return res.json({ ok: true, paymentMethods: [] });
  }
});

// ── DELETE /checkout/payment-methods/:id ─────────────────────────────────────
// Detaches a saved payment method from the authenticated customer's Stripe
// Customer. Verifies ownership before detaching.
router.delete("/checkout/payment-methods/:id", async (req, res) => {
  const auth = await authenticate(req.header("authorization"), req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, message: auth.message });
  }
  if (auth.localCustomerId == null) {
    return res.status(404).json({ ok: false, message: "No saved payment methods" }); // i18n-ignore
  }

  const pmId = req.params.id;
  if (!pmId || typeof pmId !== "string" || !pmId.startsWith("pm_")) {
    return res.status(400).json({ ok: false, message: "Invalid payment method ID" }); // i18n-ignore
  }

  try {
    const [row] = await db
      .select({ stripeCustomerId: customersTable.stripeCustomerId })
      .from(customersTable)
      .where(eq(customersTable.id, auth.localCustomerId))
      .limit(1);

    if (!row || !row.stripeCustomerId) {
      return res.status(404).json({ ok: false, message: "No saved payment methods" }); // i18n-ignore
    }

    const mainKey = process.env.STRIPE_SECRET_KEY;
    if (!mainKey) {
      return res.status(503).json({ ok: false, message: "Stripe not configured" }); // i18n-ignore
    }

    const stripe = new Stripe(mainKey);
    const pm = await stripe.paymentMethods.retrieve(pmId);
    if (pm.customer !== row.stripeCustomerId) {
      return res.status(404).json({ ok: false, message: "Payment method not found" }); // i18n-ignore
    }
    await stripe.paymentMethods.detach(pmId);

    return res.json({ ok: true });
  } catch (err: any) {
    req.log.warn({ err: err?.message, pmId }, "Failed to delete payment method"); // i18n-ignore
    return res
      .status(500)
      .json({ ok: false, message: err?.message ?? "Failed to delete payment method" }); // i18n-ignore
  }
});

export default router;
