import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { sendAlert } from "../lib/alerts";
import {
  convertFromUsd,
  normalizeCurrency,
  roundToNearestFive,
  toStripeMinorUnits,
  type SupportedCurrency,
} from "../lib/fx";
import {
  resolveCartItems,
  computeDistrictFeeUsd,
  expressSurchargeUsd,
  countryForDistrict,
} from "../lib/catalog";
import { storePaymentIntent, getPaymentIntentForOrder } from "../lib/checkoutIntents";
import { getDeliverySlots } from "../lib/osLocationsCache";
import { resolveStoreFromRequest, type StoreKey } from "../lib/wooStore";
import { validateCoupon } from "../lib/couponValidation";
import { authenticate } from "../lib/auth";
import { db, customersTable } from "@workspace/db";

const router: IRouter = Router();

/**
 * Returns true when the store key corresponds to a UAE city (AED payments).
 */
function isGulfStore(storeKey: StoreKey): boolean {
  return storeKey === "dubai" || storeKey === "abudhabi";
}

/**
 * Resolves the correct Stripe secret key for a given store.
 * UAE stores (dubai, abudhabi) use the Gulf account key; all others use the
 * main key. Display currency (e.g. AED on Lebanon) does NOT affect account
 * selection — the delivery location is the sole routing signal.
 */
function resolveStripeKey(storeKey: StoreKey): string | null {
  if (isGulfStore(storeKey)) {
    return process.env.STRIPE_SECRET_KEY_GULF ?? null;
  }
  return process.env.STRIPE_SECRET_KEY ?? null;
}

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
  // Delivery context — must be provided so the server-side delivery fee is
  // included in the Stripe charge and recorded in the cart snapshot.
  // When omitted the session covers products only (legacy behaviour, no delivery check).
  district?: string;
  expressDelivery?: boolean;
  noAddress?: boolean;
  // Slot context — required when the shopper selected a premium delivery slot.
  // cityId is used to look up the slot's extraFee from the OS locations cache.
  deliverySlot?: string;
  /** Stable OS slot ID. When provided, overrides label-based slot lookup so same-label/different-config slots are resolved correctly. */
  deliverySlotId?: string;
  cityId?: string;
  couponCode?: string;
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
    district: rawDistrict,
    expressDelivery: rawExpressDelivery,
    noAddress: rawNoAddress,
    deliverySlot: rawDeliverySlot,
    deliverySlotId: rawDeliverySlotId,
    cityId: rawCityId,
    couponCode: sessionCouponCode,
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

  // Resolve catalog prices server-side. Client-supplied amounts are ignored.
  const store = resolveStoreFromRequest(req);
  const isGulf = isGulfStore(store.storeKey);
  const key = resolveStripeKey(store.storeKey);
  if (!key) {
    return res.status(503).json({
      ok: false,
      code: "stripe_not_configured",
      message:
        "Stripe isn't configured yet. Add STRIPE_SECRET_KEY to enable real card payments.",
    });
  }

  const stripeCurrency = currency.toLowerCase();

  // Gulf Stripe account (AE) only accepts AED. Guard here so the failure is
  // explicit and self-documenting rather than a cryptic Stripe rejection.
  if (isGulf && stripeCurrency !== "aed") {
    req.log.warn(
      { storeKey: store.storeKey, currency },
      "checkout: Gulf store requires AED but received different currency (session)", // i18n-ignore
    );
    return res.status(422).json({
      ok: false,
      code: "currency_mismatch",
      message: `UAE checkout requires AED but received ${currency}. Please reload and try again.`, // i18n-ignore
    });
  }

  const catalogResult = await resolveCartItems(items, store);
  if (!catalogResult.ok) {
    req.log.warn(
      {
        storeKey: store.storeKey,
        items: items.map((i) => ({ wcId: i.wcId, osSlug: i.osSlug })),
        reason: catalogResult.message,
      },
      "checkout: resolveCartItems failed (Stripe Checkout)",
    );
    return res.status(422).json({ ok: false, message: catalogResult.message });
  }

  // Compute delivery fees server-side so the Stripe session charge includes
  // the authoritative fee, not a client-supplied amount.
  // When district is not provided the session covers products only.
  const sessionDistrict = rawDistrict ?? "";
  const sessionExpressDelivery = rawExpressDelivery === true;
  const sessionNoAddress = rawNoAddress === true;
  const sessionDeliverySlot = rawDeliverySlot ?? "";
  const sessionSubtotalUsd = catalogResult.subtotalUsd;
  const sessionDistrictFeeUsd = sessionDistrict
    ? computeDistrictFeeUsd(sessionDistrict, sessionSubtotalUsd, sessionNoAddress)
    : 0;
  const sessionExpressFeeUsd =
    sessionDistrict && sessionExpressDelivery
      ? expressSurchargeUsd(countryForDistrict(sessionDistrict))
      : 0;
  // Slot fee is computed server-side from the OS locations cache. Only charged
  // when the customer chose a premium slot and is NOT on express delivery
  // (express is a flat surcharge that supersedes slot pricing).
  const sessionSlotFeeUsd = (() => {
    if (sessionExpressDelivery || !sessionDeliverySlot || !rawCityId) return 0;
    const citySlots = getDeliverySlots(rawCityId);
    const bookedSlot = rawDeliverySlotId
      ? (citySlots.find((s) => s.slotId === rawDeliverySlotId) ?? citySlots.find((s) => s.label === sessionDeliverySlot))
      : citySlots.find((s) => s.label === sessionDeliverySlot);
    if (!bookedSlot || bookedSlot.extraFee === undefined || bookedSlot.extraFee === null) return 0;
    return Number(bookedSlot.extraFee);
  })();
  const sessionDeliveryFeeUsd = sessionDistrictFeeUsd + sessionExpressFeeUsd + sessionSlotFeeUsd;
  const sessionTotalUsd = sessionSubtotalUsd + sessionDeliveryFeeUsd;

  try {
    // Validate coupon server-side and compute the discount amount.
    // Never trust a client-supplied discount — the server re-validates via OS.
    let sessionCouponDiscountUsd = 0;
    let sessionCouponDiscountMinorUnits = 0;
    if (sessionCouponCode && sessionCouponCode.trim()) {
      const cartItemsForCoupon = catalogResult.items.map((i) => ({
        osSlug: i.osSlug ?? "",
        priceUsd: i.priceUsd,
        quantity: i.quantity,
      }));
      const couponResult = await validateCoupon(sessionCouponCode.trim(), {
        customerEmail: email ?? "",
        cartItems: cartItemsForCoupon,
        cartTotalUsd: sessionSubtotalUsd,
      });
      if (couponResult.valid) {
        sessionCouponDiscountUsd = couponResult.discountAmountUsd;
        sessionCouponDiscountMinorUnits = toStripeMinorUnits(
          roundToNearestFive(await convertFromUsd(sessionCouponDiscountUsd, currency), currency),
          currency,
        );
      }
    }
    // The session totalUsd after coupon deduction — used for the intent snapshot.
    const sessionFinalTotalUsd = Math.max(0, sessionTotalUsd - sessionCouponDiscountUsd);

    const convertedItems = await Promise.all(
      catalogResult.items.map(async (i) => {
        const convertedUnit = roundToNearestFive(await convertFromUsd(i.priceUsd, currency), currency);
        return {
          ...i,
          minorUnit: toStripeMinorUnits(convertedUnit, currency),
        };
      }),
    );

    // Delivery fee line item (only added when a district was provided and fee > 0).
    const deliveryLineItems: Array<{
      quantity: number;
      price_data: { currency: string; unit_amount: number; product_data: { name: string } };
    }> = [];
    if (sessionDeliveryFeeUsd > 0) {
      const convertedDeliveryUnit = roundToNearestFive(
        await convertFromUsd(sessionDeliveryFeeUsd, currency),
        currency,
      );
      deliveryLineItems.push({
        quantity: 1,
        price_data: {
          currency: stripeCurrency,
          unit_amount: toStripeMinorUnits(convertedDeliveryUnit, currency),
          product_data: { name: "Delivery fee" }, // i18n-ignore
        },
      });
    }

    const stripe = new Stripe(key);
    // If a promo code was validated above, create a one-time Stripe coupon so
    // the hosted Checkout session charges the shopper the discounted amount.
    let stripeDiscountCouponId: string | undefined;
    if (sessionCouponDiscountMinorUnits > 0) {
      const stripeCoupon = await stripe.coupons.create({
        amount_off: sessionCouponDiscountMinorUnits,
        currency: stripeCurrency,
        duration: "once",
      });
      stripeDiscountCouponId = stripeCoupon.id;
    }
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Omitting payment_method_types lets Stripe use all payment methods
      // enabled on the account (card, Apple Pay, Google Pay, etc.).
      // Explicitly listing only ["card"] would suppress wallet options.
      customer_email: email,
      line_items: [
        ...convertedItems.map((i) => ({
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
        ...deliveryLineItems,
      ],
      // orderId is embedded in metadata so verifyStripePayment can confirm
      // this session was not created for a different order and replayed.
      // description must be set on the underlying PaymentIntent via
      // payment_intent_data — SessionCreateParams has no top-level description.
      payment_intent_data: {
        description: `Order ${orderId} from Presentail ${storeKeyToCountry(store.storeKey)}`, // i18n-ignore
        // Suppress Stripe's automatic receipt email — the app sends its own
        // order confirmation via SMTP so a duplicate Stripe receipt adds noise.
        // Stripe accepts null at runtime to explicitly clear the field, but the
        // SDK type is string | undefined, so we cast.
        receipt_email: null as unknown as string,
      },
      // Apply promo coupon when one was validated above (creates a discount
      // on the hosted Checkout page so the charged amount matches the UI).
      ...(stripeDiscountCouponId ? { discounts: [{ coupon: stripeDiscountCouponId }] } : {}),
      metadata: { ...(metadata ?? {}), orderId, presented_currency: currency },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    // Store a payment intent that binds this Stripe session to the specific
    // orderId AND records the authoritative cart snapshot (catalog-resolved
    // wcId+quantity+priceUsd) AND the delivery context. The /woo/order endpoint
    // verifies the submitted cart and delivery params match this snapshot before
    // marking the order as paid.
    storePaymentIntent({
      orderId,
      paymentRef: session.id,
      provider: "stripe",
      stripeAccount: isGulf ? "gulf" : "main",
      currency,
      totalUsd: sessionFinalTotalUsd,
      snapshot: {
        items: catalogResult.items.map((i) => ({
          wcId: i.wcId,
          osSlug: i.osSlug,
          quantity: i.quantity,
          priceUsd: i.priceUsd,
        })),
        // Delivery context is now part of the Stripe charge (included as a
        // line item when fee > 0). Store it in the snapshot so /woo/order can
        // enforce that the submitted delivery params match what was paid for.
        district: sessionDistrict,
        expressDelivery: sessionExpressDelivery,
        noAddress: sessionNoAddress,
        deliverySlot: sessionDeliverySlot,
      },
    });

    return res.json({
      ok: true,
      id: session.id,
      url: session.url,
      currency,
    });
  } catch (err: any) {
    req.log.error(
      { err, storeKey: store.storeKey, currency },
      "checkout: Stripe session creation failed", // i18n-ignore
    );
    if (isGulf) {
      sendAlert({
        title: "Gulf Stripe checkout session failed",
        body: `A Stripe Checkout session creation failed for a Gulf (UAE) store. Store: \`${store.storeKey}\`, currency: \`${currency}\`.`,
        severity: "critical",
        fields: [
          { title: "error", value: err?.message ?? String(err) },
          { title: "orderId", value: orderId ?? "unknown" },
        ],
        source: "checkout/session",
      }).catch(() => {});
    }
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
  // deliveryFeeUsd is accepted for backwards compat but intentionally ignored —
  // the server computes the authoritative fee from district/expressDelivery.
  deliveryFeeUsd?: number;
  district?: string;
  expressDelivery?: boolean;
  noAddress?: boolean;
  // Slot context — required when the shopper selected a premium delivery slot.
  deliverySlot?: string;
  /** Stable OS slot ID. When provided, overrides label-based slot lookup. */
  deliverySlotId?: string;
  cityId?: string;
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
 *
 * When accountType is "gulf", reads/writes `stripeCustomerIdGulf` instead of
 * `stripeCustomerId` so UAE shoppers get a separate Customer on the Gulf account.
 */
async function getOrCreateStripeCustomer(
  localCustomerId: number,
  stripe: Stripe,
  accountType: "main" | "gulf",
  email?: string,
  log?: { warn: (obj: object, msg: string) => void },
): Promise<string | null> {
  try {
    // Fetch the current customer row to check for an existing Stripe Customer ID.
    const [row] = await db
      .select({
        stripeCustomerId: customersTable.stripeCustomerId,
        stripeCustomerIdGulf: customersTable.stripeCustomerIdGulf,
        email: customersTable.email,
        firstName: customersTable.firstName,
        lastName: customersTable.lastName,
      })
      .from(customersTable)
      .where(eq(customersTable.id, localCustomerId))
      .limit(1);

    if (!row) return null;

    const existingId = accountType === "gulf" ? row.stripeCustomerIdGulf : row.stripeCustomerId;
    if (existingId) return existingId;

    // No Stripe Customer yet — create one.
    const customerEmail = email || row.email;
    const name = [row.firstName, row.lastName].filter(Boolean).join(" ") || undefined;
    const stripeCustomer = await stripe.customers.create({
      email: customerEmail || undefined,
      name,
      metadata: { presentail_customer_id: String(localCustomerId) },
    });

    // Persist the new Stripe Customer ID in the correct column.
    const updateField =
      accountType === "gulf"
        ? { stripeCustomerIdGulf: stripeCustomer.id }
        : { stripeCustomerId: stripeCustomer.id };
    await db
      .update(customersTable)
      .set(updateField)
      .where(eq(customersTable.id, localCustomerId));

    return stripeCustomer.id;
  } catch (err: any) {
    log?.warn({ err: err?.message, localCustomerId }, "Failed to get/create Stripe Customer"); // i18n-ignore
    return null;
  }
}

/**
 * Shared minor-unit computation used by both /checkout/fees and
 * /checkout/payment-intent. Both endpoints must use identical rounding so the
 * amount quoted by /checkout/fees exactly equals what Stripe charges.
 *
 * Rounding rules (match Stripe best-practice):
 *  - Subtotal: per-item roundToNearestFive then toStripeMinorUnits, summed
 *  - Delivery: aggregate roundToNearestFive then toStripeMinorUnits
 *  - Coupon:   aggregate roundToNearestFive then toStripeMinorUnits
 */
async function computeStripeAmounts({
  catalogItems,
  currency,
  deliveryFeeUsd,
  couponDiscountUsd,
}: {
  catalogItems: Array<{ priceUsd: number; quantity: number }>;
  currency: SupportedCurrency;
  deliveryFeeUsd: number;
  couponDiscountUsd: number;
}): Promise<{
  subtotalMinorUnits: number;
  deliveryFeeMinorUnits: number;
  couponDiscountMinorUnits: number;
  totalMinorUnits: number;
}> {
  const perItemMinorUnits = await Promise.all(
    catalogItems.map(async (i) => {
      const converted = roundToNearestFive(await convertFromUsd(i.priceUsd, currency), currency);
      return toStripeMinorUnits(converted, currency) * i.quantity;
    }),
  );
  const subtotalMinorUnits = perItemMinorUnits.reduce((s, n) => s + n, 0);

  const deliveryFeeMinorUnits =
    deliveryFeeUsd > 0
      ? toStripeMinorUnits(
          roundToNearestFive(await convertFromUsd(deliveryFeeUsd, currency), currency),
          currency,
        )
      : 0;

  const couponDiscountMinorUnits =
    couponDiscountUsd > 0
      ? toStripeMinorUnits(
          roundToNearestFive(await convertFromUsd(couponDiscountUsd, currency), currency),
          currency,
        )
      : 0;

  const totalMinorUnits = Math.max(
    0,
    subtotalMinorUnits + deliveryFeeMinorUnits - couponDiscountMinorUnits,
  );

  return { subtotalMinorUnits, deliveryFeeMinorUnits, couponDiscountMinorUnits, totalMinorUnits };
}

router.post("/checkout/payment-intent", async (req, res) => {
  const { items, orderId, currency: rawCurrency, email, metadata, deliveryFeeUsd: rawDeliveryFeeUsd, district, expressDelivery, noAddress, deliverySlot, deliverySlotId, cityId, couponCode, saveCard } =
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

  const store = resolveStoreFromRequest(req);
  const isGulf = isGulfStore(store.storeKey);
  const key = resolveStripeKey(store.storeKey);
  if (!key) {
    return res.status(503).json({
      ok: false,
      code: "stripe_not_configured",
      message:
        "Stripe isn't configured yet. Add STRIPE_SECRET_KEY to enable real card payments.",
    });
  }

  const stripeCurrency = currency.toLowerCase();

  // Gulf Stripe account (AE) only accepts AED. Guard here so the failure is
  // explicit and self-documenting rather than a cryptic Stripe rejection.
  // This also catches the case where checkoutCurrency failed to force AED
  // (e.g. countryCode was transiently null in the PI creation effect).
  if (isGulf && stripeCurrency !== "aed") {
    req.log.warn(
      { storeKey: store.storeKey, currency },
      "checkout: Gulf store requires AED but received different currency (payment-intent)", // i18n-ignore
    );
    return res.status(422).json({
      ok: false,
      code: "currency_mismatch",
      message: `UAE checkout requires AED but received ${currency}. Please reload and try again.`, // i18n-ignore
    });
  }

  const catalogResult = await resolveCartItems(items, store);
  if (!catalogResult.ok) {
    req.log.warn(
      {
        storeKey: store.storeKey,
        items: items.map((i) => ({ wcId: i.wcId, osSlug: i.osSlug })),
        reason: catalogResult.message,
      },
      "checkout: resolveCartItems failed (PaymentIntent)",
    );
    return res.status(422).json({ ok: false, message: catalogResult.message });
  }

  // Compute delivery fees server-side from authoritative tables. The client-
  // supplied deliveryFeeUsd is intentionally ignored — trusting it would allow
  // an attacker to send deliveryFeeUsd:0 and have Stripe charge only the product
  // subtotal, then finalize a fully-paid order with expensive delivery options.
  const subtotalUsd = catalogResult.subtotalUsd;
  const serverDistrictFeeUsd = computeDistrictFeeUsd(
    district ?? "Beirut",
    subtotalUsd,
    noAddress === true,
  );
  const serverExpressFeeUsd =
    expressDelivery === true
      ? expressSurchargeUsd(countryForDistrict(district ?? "Beirut"))
      : 0;
  // Slot fee is computed server-side from the OS locations cache. Only charged
  // when the customer chose a premium slot and is NOT on express delivery.
  const serverSlotFeeUsd = (() => {
    if (expressDelivery === true || !deliverySlot || !cityId) return 0;
    const citySlots = getDeliverySlots(cityId);
    const bookedSlot = deliverySlotId
      ? (citySlots.find((s) => s.slotId === deliverySlotId) ?? citySlots.find((s) => s.label === deliverySlot))
      : citySlots.find((s) => s.label === deliverySlot);
    if (!bookedSlot || bookedSlot.extraFee === undefined || bookedSlot.extraFee === null) return 0;
    return Number(bookedSlot.extraFee);
  })();
  const serverDeliveryFeeUsd = serverDistrictFeeUsd + serverExpressFeeUsd + serverSlotFeeUsd;
  const totalUsd = subtotalUsd + serverDeliveryFeeUsd;

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
        isGulf ? "gulf" : "main",
        email,
        req.log,
      );
      if (customerId) stripeCustomerId = customerId;
    }
  }

  // Apply coupon discount if a code is provided.
  // The server re-validates the code (never trusts client-supplied discount amounts).
  // Resolved before computeStripeAmounts so the helper receives the final discount.
  let couponDiscountUsd = 0;
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
    }
  }

  try {
    // Compute Stripe charge amounts using the shared helper. /checkout/fees uses
    // the same helper so the pre-payment quote exactly matches the actual charge.
    const { subtotalMinorUnits, deliveryFeeMinorUnits, couponDiscountMinorUnits, totalMinorUnits } =
      await computeStripeAmounts({
        catalogItems: catalogResult.items,
        currency,
        deliveryFeeUsd: serverDeliveryFeeUsd,
        couponDiscountUsd,
      });
    // Post-coupon total in USD — the canonical amount the shopper is charged.
    // All storePaymentIntent calls use this so the snapshot's totalUsd reflects
    // what was actually collected, not the pre-discount subtotal.
    const postCouponTotalUsd = Math.max(0, totalUsd - couponDiscountUsd);

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
              stripeAccount: isGulf ? "gulf" : "main",
              currency,
              totalUsd: postCouponTotalUsd,
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
                deliverySlot: deliverySlot ?? "",
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
            stripeAccount: isGulf ? "gulf" : "main",
            currency,
            totalUsd: postCouponTotalUsd,
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
              deliverySlot: deliverySlot ?? "",
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
            stripeAccount: isGulf ? "gulf" : "main",
            currency,
            totalUsd: postCouponTotalUsd,
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
              deliverySlot: deliverySlot ?? "",
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
      description: `Order ${orderId} from Presentail ${storeKeyToCountry(store.storeKey)}`, // i18n-ignore
      metadata: { ...(metadata ?? {}), orderId, presented_currency: currency },
      // receipt_email is intentionally omitted — the app sends its own order
      // confirmation via SMTP so a duplicate Stripe receipt adds noise.
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
      stripeAccount: isGulf ? "gulf" : "main",
      currency,
      totalUsd: postCouponTotalUsd,
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
        deliverySlot: deliverySlot ?? "",
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
    req.log.error(
      { err, storeKey: store.storeKey, currency },
      "checkout: Stripe PaymentIntent failed", // i18n-ignore
    );
    if (isGulf) {
      sendAlert({
        title: "Gulf Stripe PaymentIntent failed",
        body: `A Stripe PaymentIntent creation failed for a Gulf (UAE) store. Store: \`${store.storeKey}\`, currency: \`${currency}\`.`,
        severity: "critical",
        fields: [
          { title: "error", value: err?.message ?? String(err) },
          { title: "orderId", value: orderId ?? "unknown" },
        ],
        source: "checkout/payment-intent",
      }).catch(() => {});
    }
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

  const store = resolveStoreFromRequest(req);
  const gulf = isGulfStore(store.storeKey);
  const stripeKey = resolveStripeKey(store.storeKey);
  if (!stripeKey) return res.json({ ok: true, paymentMethods: [] });

  try {
    const [row] = await db
      .select({
        stripeCustomerId: customersTable.stripeCustomerId,
        stripeCustomerIdGulf: customersTable.stripeCustomerIdGulf,
      })
      .from(customersTable)
      .where(eq(customersTable.id, auth.localCustomerId))
      .limit(1);

    const customerId = gulf ? row?.stripeCustomerIdGulf : row?.stripeCustomerId;
    if (!row || !customerId) return res.json({ ok: true, paymentMethods: [] });

    const stripe = new Stripe(stripeKey);
    const list = await stripe.paymentMethods.list({ customer: customerId, type: "card" });
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

  const store = resolveStoreFromRequest(req);
  const gulf = isGulfStore(store.storeKey);
  const stripeKey = resolveStripeKey(store.storeKey);
  if (!stripeKey) {
    return res.status(503).json({ ok: false, message: "Stripe not configured" }); // i18n-ignore
  }

  try {
    const [row] = await db
      .select({
        stripeCustomerId: customersTable.stripeCustomerId,
        stripeCustomerIdGulf: customersTable.stripeCustomerIdGulf,
      })
      .from(customersTable)
      .where(eq(customersTable.id, auth.localCustomerId))
      .limit(1);

    const customerId = gulf ? row?.stripeCustomerIdGulf : row?.stripeCustomerId;
    if (!row || !customerId) {
      return res.status(404).json({ ok: false, message: "No saved payment methods" }); // i18n-ignore
    }

    const stripe = new Stripe(stripeKey);
    const pm = await stripe.paymentMethods.retrieve(pmId);
    if (pm.customer !== customerId) {
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

// ---------------------------------------------------------------------------
// POST /checkout/fees — server-authoritative fee breakdown
//
// Returns the exact subtotal, delivery fee components, coupon discount, and
// grand total that the server would charge for the given cart/delivery context.
// Clients should call this before opening the payment sheet and surface an
// alert when the server total differs from the displayed total by more than a
// rounding threshold. No Stripe or WooCommerce call is made — pure fee
// computation and FX conversion.
// ---------------------------------------------------------------------------
router.post("/checkout/fees", async (req, res) => {
  const {
    items,
    currency: rawCurrency,
    email,
    district,
    expressDelivery,
    noAddress,
    deliverySlot,
    deliverySlotId,
    cityId,
    couponCode,
  } = req.body as {
    items?: LineItemInput[];
    currency?: string;
    email?: string;
    district?: string;
    expressDelivery?: boolean;
    noAddress?: boolean;
    deliverySlot?: string;
    deliverySlotId?: string;
    cityId?: string;
    couponCode?: string;
  };

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, message: "No items in cart" }); // i18n-ignore
  }

  const currency = normalizeCurrency(rawCurrency ?? "USD");
  const store = resolveStoreFromRequest(req);

  const catalogResult = await resolveCartItems(items, store);
  if (!catalogResult.ok) {
    req.log.warn(
      {
        storeKey: store.storeKey,
        items: items.map((i) => ({ wcId: i.wcId, osSlug: i.osSlug })),
        reason: catalogResult.message,
      },
      "checkout: resolveCartItems failed (Mamo/PayPal)",
    );
    return res.status(422).json({ ok: false, message: catalogResult.message });
  }

  const subtotalUsd = catalogResult.subtotalUsd;
  const districtFeeUsd = computeDistrictFeeUsd(
    district ?? "Beirut",
    subtotalUsd,
    noAddress === true,
  );
  const expressFeeUsd =
    expressDelivery === true
      ? expressSurchargeUsd(countryForDistrict(district ?? "Beirut"))
      : 0;
  const slotFeeUsd = (() => {
    if (expressDelivery === true || !deliverySlot || !cityId) return 0;
    const citySlots = getDeliverySlots(cityId);
    const bookedSlot = deliverySlotId
      ? (citySlots.find((s) => s.slotId === deliverySlotId) ?? citySlots.find((s) => s.label === deliverySlot))
      : citySlots.find((s) => s.label === deliverySlot);
    if (!bookedSlot || bookedSlot.extraFee === undefined || bookedSlot.extraFee === null) return 0;
    return Number(bookedSlot.extraFee);
  })();
  const deliveryFeeUsd = districtFeeUsd + expressFeeUsd + slotFeeUsd;
  const rawTotalUsd = subtotalUsd + deliveryFeeUsd;

  let couponDiscountUsd = 0;
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
    }
  }

  const totalUsd = Math.max(0, rawTotalUsd - couponDiscountUsd);

  try {
    const [districtFee, expressFee, slotFee, couponDiscount, total] = await Promise.all([
      districtFeeUsd > 0
        ? convertFromUsd(districtFeeUsd, currency).then((v) => roundToNearestFive(v, currency))
        : Promise.resolve(0),
      expressFeeUsd > 0
        ? convertFromUsd(expressFeeUsd, currency).then((v) => roundToNearestFive(v, currency))
        : Promise.resolve(0),
      slotFeeUsd > 0
        ? convertFromUsd(slotFeeUsd, currency).then((v) => roundToNearestFive(v, currency))
        : Promise.resolve(0),
      couponDiscountUsd > 0
        ? convertFromUsd(couponDiscountUsd, currency).then((v) => roundToNearestFive(v, currency))
        : Promise.resolve(0),
      totalUsd > 0
        ? convertFromUsd(totalUsd, currency).then((v) => roundToNearestFive(v, currency))
        : Promise.resolve(0),
    ]);

    const subtotalConverted = await convertFromUsd(subtotalUsd, currency);
    const subtotal = roundToNearestFive(subtotalConverted, currency);

    // totalMinorUnits uses the shared helper (same per-item rounding path as
    // /checkout/payment-intent) so the quoted amount exactly matches the charge.
    const { totalMinorUnits } = await computeStripeAmounts({
      catalogItems: catalogResult.items,
      currency,
      deliveryFeeUsd,
      couponDiscountUsd,
    });

    return res.json({
      ok: true,
      subtotalUsd,
      districtFeeUsd,
      expressFeeUsd,
      slotFeeUsd,
      couponDiscountUsd,
      totalUsd,
      currency,
      subtotal,
      districtFee,
      expressFee,
      slotFee,
      couponDiscount,
      total,
      totalMinorUnits,
    });
  } catch (err: any) {
    req.log.warn({ err: err?.message }, "Failed to compute checkout fees"); // i18n-ignore
    return res.status(500).json({ ok: false, message: "Failed to compute fees" }); // i18n-ignore
  }
});

export default router;
