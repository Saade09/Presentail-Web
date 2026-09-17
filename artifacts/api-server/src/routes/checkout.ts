import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";

/** Server-authoritative policy version for Cyprus checkout acceptance. Bump
 *  this string whenever the legal copy changes; the stored value in app_orders
 *  reflects which version was in force at the time of each order. */
const CURRENT_POLICY_VERSION = "cy-v1" as const;
import Stripe from "stripe";
import {
  isKlarnaEnabled,
  isKlarnaEligibleCountry,
  klarnaRolloutAllowed,
  klarnaCohortLabel,
} from "../lib/klarnaRollout";
import { pickClientIp, resolveGeoCurrency } from "../lib/geoCurrency";
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
  computeSlotFeeUsd,
  expressSurchargeUsd,
  countryForDistrict,
  checkSubmittedSlotBookable,
} from "../lib/catalog";
import { resolveOsDeliveryConfig } from "../lib/osLocationsCache";
import { resolveEffectiveExpressFeeUsd } from "../lib/deliveryFees";
import { storePaymentIntent, getPaymentIntentForOrder } from "../lib/checkoutIntents";
import { validateRedirectUrl } from "../lib/validateRedirectUrl";
import { resolveStoreFromRequest, type StoreKey } from "../lib/wooStore";
import { validateCoupon, FIRST_ORDER_COUPON_CODE, acquireFirst10Lock } from "../lib/couponValidation";
import { authenticate } from "../lib/auth";
import { db, customersTable, klarnaPendingCheckoutsTable } from "@workspace/db";

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
 * Return the currency Stripe will charge in for this account.
 * The Cyprus main account supports all display currencies.
 * The Gulf (AE) account handles AED and international currencies for UAE orders.
 * Both accept any SupportedCurrency — no fallback is needed.
 */
function resolveStripeChargeCurrency(currency: SupportedCurrency, _isGulf: boolean): SupportedCurrency {
  return currency;
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
  /** Selected delivery date as YYYY-MM-DD. Used to determine whether the same-day night surcharge applies. */
  deliveryDate?: string;
  couponCode?: string;
  /**
   * ISO 3166-1 alpha-2 billing country hint (e.g. "DE", "US"). Used to pass
   * billing_details.address.country on the PaymentIntent so Stripe can make an
   * accurate Klarna eligibility decision before the Payment Element renders. The
   * server never trusts this for pricing or security decisions — it is a UX hint
   * only. Falls back to the store country when absent.
   */
  billingCountry?: string;
  /** True when the shopper has accepted the applicable policies before hosted checkout. Required for CY store. */
  policyAccepted?: boolean;
  /** Policy version string agreed to (e.g. "cy-v1"). */
  policyVersion?: string;
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
    deliveryDate: rawDeliveryDate,
    couponCode: sessionCouponCode,
    billingCountry,
    policyAccepted: sessionPolicyAccepted,
    policyVersion: sessionPolicyVersion,
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
  const successUrlErr = validateRedirectUrl(successUrl, "web");
  if (successUrlErr) {
    return res.status(400).json({ ok: false, code: "invalid_redirect_url", message: successUrlErr }); // i18n-ignore
  }
  const cancelUrlErr = validateRedirectUrl(cancelUrl, "web");
  if (cancelUrlErr) {
    return res.status(400).json({ ok: false, code: "invalid_redirect_url", message: cancelUrlErr }); // i18n-ignore
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

  // Policy acceptance guard — required for Cyprus store hosted-checkout sessions.
  if (store.storeKey === "cyprus" && sessionPolicyAccepted !== true) {
    return res.status(400).json({
      ok: false,
      code: "policy_acceptance_required",
      message: "Please accept the Terms, Shipping, and Returns & Refund policies before placing an order.", // i18n-ignore
    });
  }
  // Derive server-side policy audit fields (IP + timestamp cannot be client-supplied).
  // Policy version is server-authoritative — the client value is ignored.
  const sessionPolicySnapshotFields: { policyVersion?: string; policyAcceptedIp?: string; policyAcceptedAt?: string } = {};
  if (sessionPolicyAccepted === true) {
    sessionPolicySnapshotFields.policyVersion = CURRENT_POLICY_VERSION;
    sessionPolicySnapshotFields.policyAcceptedIp = pickClientIp(req.headers["x-forwarded-for"], (req.ip ?? "").toString()) || undefined;
    sessionPolicySnapshotFields.policyAcceptedAt = new Date().toISOString();
  }

  // Stale-slot guard — reject BEFORE any charge is initiated so a stale tab
  // can never pay for a same-day slot whose window has already ended.
  let sessionDeliveryServiceType: "midnight" | undefined;
  {
    const slotCheck = checkSubmittedSlotBookable({
      expressDelivery: rawExpressDelivery === true,
      deliverySlot: rawDeliverySlot,
      deliverySlotId: rawDeliverySlotId,
      deliveryDate: rawDeliveryDate,
      cityId: rawCityId,
      district: rawDistrict,
    });
    sessionDeliveryServiceType = slotCheck.serviceType;
    if (!slotCheck.bookable) {
      req.log.warn(
        { orderId, deliverySlot: rawDeliverySlot, deliveryDate: rawDeliveryDate, reason: slotCheck.reason },
        "checkout.session: expired delivery slot — rejecting before charge",
      );
      return res.status(422).json({
        ok: false,
        code:
          slotCheck.reason === "slot_unavailable"
            ? "delivery_slot_unavailable"
            : "expired_delivery_slot",
        reason: slotCheck.reason,
        message: "The selected delivery time is no longer available. Please pick a new date or time slot.", // i18n-ignore
      });
    }
  }

  // Slot-presence guard — reject before the session is created so a missing
  // slot (OS schedule API unreachable) can never reach a charge state.
  if (rawExpressDelivery !== true && !rawDeliverySlot?.trim()) {
    req.log.warn(
      { orderId, expressDelivery: rawExpressDelivery, deliverySlot: rawDeliverySlot },
      "checkout.session: non-express request with missing deliverySlot — rejecting before charge",
    );
    return res.status(400).json({
      ok: false,
      code: "missing_delivery_slot",
      message: "A delivery time slot is required. Please go back and select a delivery window.", // i18n-ignore
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
  // Bugs A+B fix: prefer OS city-level delivery config (keyed by cityId) so the
  // session fee matches the fee wooOrders.ts will record on the order. When
  // cityId is absent, fall back to the city-name lookup for backwards compat.
  const sessionCountry = countryForDistrict(sessionDistrict);
  const sessionOsConfig = rawCityId ? resolveOsDeliveryConfig(sessionCountry, rawCityId) : null;
  const sessionWouldBeStdFeeUsd = (() => {
    if (!sessionDistrict) return 0;
    if (sessionOsConfig && typeof sessionOsConfig.cityFeeUsd === "number") {
      const isFreeByOs =
        sessionOsConfig.freeDeliveryEnabled === true &&
        typeof sessionOsConfig.freeDeliveryThresholdUsd === "number" &&
        sessionSubtotalUsd >= sessionOsConfig.freeDeliveryThresholdUsd;
      return isFreeByOs ? 0 : sessionOsConfig.cityFeeUsd;
    }
    return computeDistrictFeeUsd(sessionDistrict, sessionSubtotalUsd);
  })();
  // Express delivery replaces standard delivery — the district fee is $0 for
  // Express orders. The Express fee is the full configured total.
  const sessionDistrictFeeUsd = sessionExpressDelivery ? 0 : sessionWouldBeStdFeeUsd;
  const sessionExpressFeeUsd =
    sessionDistrict && sessionExpressDelivery
      ? resolveEffectiveExpressFeeUsd(
          sessionOsConfig,
          sessionWouldBeStdFeeUsd,
          expressSurchargeUsd(sessionCountry),
        )
      : 0;
  // Slot fee is computed server-side from the OS locations cache. Only charged
  // when the customer chose a premium slot and is NOT on express delivery
  // (express is a flat surcharge that supersedes slot pricing).
  const sessionSlotFeeUsd = computeSlotFeeUsd({
    expressDelivery: sessionExpressDelivery,
    deliverySlot: sessionDeliverySlot,
    deliverySlotId: rawDeliverySlotId,
    cityId: rawCityId,
    deliveryDate: rawDeliveryDate,
    district: sessionDistrict,
  });
  const sessionDeliveryFeeUsd = sessionDistrictFeeUsd + sessionExpressFeeUsd + sessionSlotFeeUsd;
  const sessionTotalUsd = sessionSubtotalUsd + sessionDeliveryFeeUsd;

  try {
    // Validate coupon server-side and compute the discount amount.
    // Never trust a client-supplied discount — the server re-validates via OS.
    let sessionCouponDiscountUsd = 0;
    let sessionCouponDiscountMinorUnits = 0;
    // Authoritative coupon fields for the intent snapshot — set only when the
    // discount is actually applied so the fallback in /woo/order has the real data.
    let sessionAppliedCouponCode: string | undefined;
    let sessionAppliedCouponId: string | number | undefined;
    if (sessionCouponCode && sessionCouponCode.trim()) {
      const trimmedSessionCouponCode = sessionCouponCode.trim();
    const cartItemsForCoupon = catalogResult.items.map((i) => ({
      osSlug: i.osSlug ?? "",
      priceUsd: i.priceUsd,
      quantity: i.quantity,
    }));
    const couponResult = await validateCoupon(trimmedSessionCouponCode, {
      customerEmail: email ?? "",
      cartItems: cartItemsForCoupon,
      cartTotalUsd: sessionTotalUsd,
    });
      if (couponResult.valid) {
        // Guard against concurrent FIRST10 claims — same logic as /checkout/payment-intent.
        // Lock is acquired AFTER eligibility is confirmed to prevent lock-poisoning DoS
        // by unauthenticated / ineligible callers submitting arbitrary email addresses.
        let applySessionDiscount = true;
        if (trimmedSessionCouponCode.toUpperCase() === FIRST_ORDER_COUPON_CODE) {
        const emailForLock = (email ?? "").trim().toLowerCase();
          if (emailForLock && !(await acquireFirst10Lock(emailForLock, orderId))) {
            req.log.warn(
              { email: emailForLock, orderId },
              "FIRST10: concurrent claim detected on session checkout — denying coupon", // i18n-ignore
            );
            applySessionDiscount = false;
          }
        }
        if (applySessionDiscount) {
          sessionCouponDiscountUsd = couponResult.discountAmountUsd;
          sessionCouponDiscountMinorUnits = toStripeMinorUnits(
            roundToNearestFive(await convertFromUsd(sessionCouponDiscountUsd, currency), currency),
            currency,
          );
          // Store the authoritative coupon identity so the /woo/order fallback
          // can forward the OS-validated couponId when re-validation bails out.
          sessionAppliedCouponCode = trimmedSessionCouponCode;
          sessionAppliedCouponId = couponResult.couponId;
        }
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
        // Embed Klarna cohort in the PI metadata for analytics / debugging.
        metadata: {
          klarna_cohort: klarnaCohortLabel(orderId, key),
          ...(billingCountry
            ? { billing_country_hint: billingCountry.toUpperCase().slice(0, 2) }
            : {}),
        },
      },
      // Apply promo coupon when one was validated above (creates a discount
      // on the hosted Checkout page so the charged amount matches the UI).
      ...(stripeDiscountCouponId ? { discounts: [{ coupon: stripeDiscountCouponId }] } : {}),
      metadata: { ...(metadata ?? {}), orderId, presented_currency: currency },
      // Klarna rollout gate: for hosted Checkout Sessions, Klarna is controlled
      // via payment_method_types. When Klarna is not in the cohort (or the flag
      // is off), restrict to ["card"] so only card/wallet methods are available.
      // When Klarna is allowed, omit payment_method_types to let Stripe surface
      // all Dashboard-enabled methods (including Klarna for eligible countries).
      // Gulf (AED) sessions always restrict to card — Klarna does not support AED.
      ...(!isGulf && klarnaRolloutAllowed(orderId, key)
        ? {}
        : { payment_method_types: ["card"] as const }),
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
        deliveryCityId: rawCityId,
        deliveryDate: rawDeliveryDate,
        deliverySlotId: rawDeliverySlotId,
        deliveryServiceType: sessionDeliveryServiceType,
        // Fee snapshot (Step 3): store the server-computed fees so wooOrders.ts
        // can use them directly at order creation, guaranteeing the order record
        // uses the exact same fees as the Stripe charge.
        districtFeeUsd: sessionDistrictFeeUsd,
        expressFeeUsd: sessionExpressFeeUsd,
        slotFeeUsd: sessionSlotFeeUsd,
        // Coupon identity snapshot: store the server-validated code + OS coupon ID
        // so /woo/order can forward the authoritative couponId when re-validation
        // bails out (cold cache / server restart). Absent when no coupon applied.
        couponCode: sessionAppliedCouponCode,
        couponId: sessionAppliedCouponId,
        couponDiscountUsd: sessionCouponDiscountUsd > 0 ? sessionCouponDiscountUsd : undefined,
        ...sessionPolicySnapshotFields,
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
  /** Selected delivery date as YYYY-MM-DD. Used to determine whether the same-day night surcharge applies. */
  deliveryDate?: string;
  couponCode?: string;
  saveCard?: boolean;
  metadata?: Record<string, string>;
  /**
   * ISO 3166-1 alpha-2 billing country hint (e.g. "DE", "US"). Used to pass
   * billing_details.address.country on the PaymentIntent so Stripe can make an
   * accurate Klarna eligibility decision before the Payment Element renders.
   * Never used for pricing or security — UX hint only.
   */
  billingCountry?: string;
  /** True when the shopper has ticked the policy-acceptance checkbox. Required for CY store. */
  policyAccepted?: boolean;
  /** Policy version string agreed to (e.g. "cy-v1"). Echoed from the client; persisted for audit. */
  policyVersion?: string;
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
  const { items, orderId, currency: rawCurrency, email, metadata, deliveryFeeUsd: rawDeliveryFeeUsd, district, expressDelivery, noAddress, deliverySlot, deliverySlotId, cityId, deliveryDate, couponCode, saveCard, billingCountry, policyAccepted, policyVersion } =
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

  // Fall back to USD when the display currency isn't accepted by the Stripe
  // account (e.g. CAD/AUD/CHF on the LB main account).
  const chargeCurrency = resolveStripeChargeCurrency(currency, isGulf);
  const stripeCurrency = chargeCurrency.toLowerCase();

  // Policy acceptance guard — required for Cyprus store card/wallet/Klarna payments.
  if (store.storeKey === "cyprus" && policyAccepted !== true) {
    return res.status(400).json({
      ok: false,
      code: "policy_acceptance_required",
      message: "Please accept the Terms, Shipping, and Returns & Refund policies before placing an order.", // i18n-ignore
    });
  }
  // Derive server-side policy audit fields. IP and timestamp are always
  // stamped by the server — never trusted from the request body. The policy
  // version is also server-authoritative: the client-supplied value is ignored
  // so a caller cannot record a fake/outdated version string.
  const policySnapshotFields: { policyVersion?: string; policyAcceptedIp?: string; policyAcceptedAt?: string } = {};
  if (policyAccepted === true) {
    policySnapshotFields.policyVersion = CURRENT_POLICY_VERSION;
    policySnapshotFields.policyAcceptedIp = pickClientIp(req.headers["x-forwarded-for"], (req.ip ?? "").toString()) || undefined;
    policySnapshotFields.policyAcceptedAt = new Date().toISOString();
  }

  // Stale-slot guard — reject BEFORE the PaymentIntent is created so a stale
  // tab or app session can never charge for a same-day slot whose window has
  // already ended (order LB-2152 class of bug).
  let paymentDeliveryServiceType: "midnight" | undefined;
  {
    const slotCheck = checkSubmittedSlotBookable({
      expressDelivery: expressDelivery === true,
      deliverySlot,
      deliverySlotId,
      deliveryDate,
      cityId,
      district,
    });
    paymentDeliveryServiceType = slotCheck.serviceType;
    if (!slotCheck.bookable) {
      req.log.warn(
        { orderId, deliverySlot, deliveryDate, reason: slotCheck.reason },
        "checkout.payment-intent: expired delivery slot — rejecting before charge",
      );
      return res.status(422).json({
        ok: false,
        code:
          slotCheck.reason === "slot_unavailable"
            ? "delivery_slot_unavailable"
            : "expired_delivery_slot",
        reason: slotCheck.reason,
        message: "The selected delivery time is no longer available. Please pick a new date or time slot.", // i18n-ignore
      });
    }
  }

  // Slot-presence guard — reject before any PaymentIntent is created so a
  // missing slot (OS schedule API unreachable at checkout) can never reach a
  // charge state. Express orders need no slot; all others must carry one.
  if (expressDelivery !== true && !deliverySlot?.trim()) {
    req.log.warn(
      { orderId, expressDelivery, deliverySlot },
      "checkout.payment-intent: non-express request with missing deliverySlot — rejecting before charge",
    );
    return res.status(400).json({
      ok: false,
      code: "missing_delivery_slot",
      message: "A delivery time slot is required. Please go back and select a delivery window.", // i18n-ignore
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
      "checkout: resolveCartItems failed (Mamo/PayPal)",
    );
    return res.status(422).json({ ok: false, message: catalogResult.message });
  }

  const subtotalUsd = catalogResult.subtotalUsd;
  const piCountry = countryForDistrict(district ?? "Beirut");
  const piOsConfig = cityId ? resolveOsDeliveryConfig(piCountry, cityId) : null;
  const piWouldBeStdFeeUsd = (() => {
    if (piOsConfig && typeof piOsConfig.cityFeeUsd === "number") {
      const isFreeByOs =
        piOsConfig.freeDeliveryEnabled === true &&
        typeof piOsConfig.freeDeliveryThresholdUsd === "number" &&
        subtotalUsd >= piOsConfig.freeDeliveryThresholdUsd;
      return isFreeByOs ? 0 : piOsConfig.cityFeeUsd;
    }
    return computeDistrictFeeUsd(district ?? "Beirut", subtotalUsd);
  })();
  // Express delivery replaces standard delivery — district fee is $0 for Express.
  const serverDistrictFeeUsd = expressDelivery === true ? 0 : piWouldBeStdFeeUsd;
  const serverExpressFeeUsd =
    expressDelivery === true
      ? resolveEffectiveExpressFeeUsd(
          piOsConfig,
          piWouldBeStdFeeUsd,
          expressSurchargeUsd(piCountry),
        )
      : 0;
  // Slot fee is computed server-side from the OS locations cache. Only charged
  // when the customer chose a premium slot and is NOT on express delivery.
  const serverSlotFeeUsd = computeSlotFeeUsd({
    expressDelivery: expressDelivery === true,
    deliverySlot,
    deliverySlotId,
    cityId,
    deliveryDate,
    district,
  });
  const serverDeliveryFeeUsd = serverDistrictFeeUsd + serverExpressFeeUsd + serverSlotFeeUsd;
  // Pre-coupon total in USD — used for coupon eligibility checks and as the
  // baseline from which the coupon discount is subtracted.
  const rawTotalUsd = subtotalUsd + serverDeliveryFeeUsd;

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
      const [customerRow] = await db
        .select({
          stripeCustomerId: customersTable.stripeCustomerId,
          stripeCustomerIdGulf: customersTable.stripeCustomerIdGulf,
        })
        .from(customersTable)
        .where(eq(customersTable.id, auth.localCustomerId))
        .limit(1);
      if (customerRow) {
        const customerId = isGulf ? customerRow.stripeCustomerIdGulf : customerRow.stripeCustomerId;
        if (customerId) stripeCustomerId = customerId;
      }
    }
  }

  // Apply coupon discount if a code is provided.
  // The server re-validates the code (never trusts client-supplied discount amounts).
  // Resolved before computeStripeAmounts so the helper receives the final discount.
  // Authoritative coupon identity for the intent snapshot — set only when the
  // discount is actually applied, so /woo/order fallback has the real OS ID.
  let appliedCouponCode: string | undefined;
  let appliedCouponId: string | number | undefined;
  let couponDiscountUsd = 0;
  if (couponCode && couponCode.trim()) {
    const trimmedCouponCode = couponCode.trim();
    const cartItemsForCoupon = catalogResult.items.map((i) => ({
      osSlug: i.osSlug ?? "",
      priceUsd: i.priceUsd,
      quantity: i.quantity,
    }));
    const couponResult = await validateCoupon(couponCode.trim(), {
      customerEmail: email ?? "",
      cartItems: cartItemsForCoupon,
      cartTotalUsd: rawTotalUsd,
    });
    if (couponResult.valid) {
      // Guard against concurrent FIRST10 claims for the same email address.
      // The lock is acquired AFTER eligibility is confirmed so only callers
      // that actually passed the first-order check can compete for the lock —
      // preventing lock-poisoning DoS by unauthenticated / ineligible callers.
      //
      // The lock is keyed by (email, orderId): repeated calls from the same
      // orderId (e.g. PI amount update) are idempotent. A different orderId
      // for the same email is denied (concurrent race detected).
      //
      // Single-process guard — sufficient for the current single-instance
      // deployment; a distributed lock (Redis, DB advisory lock, etc.) would
      // be needed for multi-replica environments.
      let applyDiscount = true;
      if (trimmedCouponCode.toUpperCase() === FIRST_ORDER_COUPON_CODE) {
        const emailForLock = (email ?? "").trim().toLowerCase();
        if (emailForLock && !(await acquireFirst10Lock(emailForLock, orderId))) {
          req.log.warn(
            { email: emailForLock, orderId },
            "FIRST10: concurrent claim detected — denying coupon for this session", // i18n-ignore
          );
          applyDiscount = false;
        }
      }
      if (applyDiscount) {
        couponDiscountUsd = couponResult.discountAmountUsd;
        // Store the authoritative coupon identity so the /woo/order fallback
        // can forward the OS-validated couponId when re-validation bails out.
        appliedCouponCode = trimmedCouponCode;
        appliedCouponId = couponResult.couponId;
      }
    }
  }

  try {
    // Compute Stripe charge amounts using the shared helper. /checkout/fees uses
    // the same helper so the pre-payment quote exactly matches the actual charge.
    const { subtotalMinorUnits, deliveryFeeMinorUnits, couponDiscountMinorUnits, totalMinorUnits } =
      await computeStripeAmounts({
        catalogItems: catalogResult.items,
        currency: chargeCurrency,
        deliveryFeeUsd: serverDeliveryFeeUsd,
        couponDiscountUsd,
      });
    // Post-coupon total in USD — the canonical amount the shopper is charged.
    // All storePaymentIntent calls use this so the snapshot's totalUsd reflects
    // what was actually collected, not the pre-discount subtotal.
    const postCouponTotalUsd = Math.max(0, rawTotalUsd - couponDiscountUsd);

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
                deliveryCityId: cityId,
                deliveryDate,
                deliverySlotId,
                deliveryServiceType: paymentDeliveryServiceType,
                districtFeeUsd: serverDistrictFeeUsd,
                expressFeeUsd: serverExpressFeeUsd,
                slotFeeUsd: serverSlotFeeUsd,
                // Coupon identity snapshot: store the server-validated code + OS coupon ID
                // so /woo/order can forward the authoritative couponId when re-validation
                // bails out (cold cache / server restart). Absent when no coupon applied.
                couponCode: appliedCouponCode,
                couponId: appliedCouponId,
                couponDiscountUsd: couponDiscountUsd > 0 ? couponDiscountUsd : undefined,
                ...policySnapshotFields,
              },
            });
            return res.json({
              ok: true,
              clientSecret: existing.client_secret,
              orderId,
              amount: totalMinorUnits,
              currency: chargeCurrency,
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
              deliveryCityId: cityId,
              deliveryDate,
              deliverySlotId,
              deliveryServiceType: paymentDeliveryServiceType,
              districtFeeUsd: serverDistrictFeeUsd,
              expressFeeUsd: serverExpressFeeUsd,
              slotFeeUsd: serverSlotFeeUsd,
              couponCode: appliedCouponCode,
              couponId: appliedCouponId,
              couponDiscountUsd: couponDiscountUsd > 0 ? couponDiscountUsd : undefined,
              ...policySnapshotFields,
            },
          });
          return res.json({
            ok: true,
            clientSecret: updated.client_secret,
            orderId,
            amount: totalMinorUnits,
            currency: chargeCurrency,
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
          // If the cart total has changed since this PI was created (e.g. after a
          // server restart that cleared the in-memory cache, or a fee bug fix was
          // deployed mid-session), update the PI amount in Stripe before returning
          // the client_secret. Without this, the user would be charged the old
          // stale amount even though the server computed a different total.
          const resolvedPi =
            pi.amount !== totalMinorUnits || pi.currency !== stripeCurrency
              ? await stripe.paymentIntents.update(pi.id, {
                  amount: totalMinorUnits,
                  currency: stripeCurrency,
                })
              : pi;
          // Re-populate the cache so subsequent calls hit the fast path.
          storePaymentIntent({
            orderId,
            paymentRef: resolvedPi.id,
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
              deliveryCityId: cityId,
              deliveryDate,
              deliverySlotId,
              deliveryServiceType: paymentDeliveryServiceType,
              districtFeeUsd: serverDistrictFeeUsd,
              expressFeeUsd: serverExpressFeeUsd,
              slotFeeUsd: serverSlotFeeUsd,
              couponCode: appliedCouponCode,
              couponId: appliedCouponId,
              couponDiscountUsd: couponDiscountUsd > 0 ? couponDiscountUsd : undefined,
              ...policySnapshotFields,
            },
          });
          return res.json({
            ok: true,
            clientSecret: resolvedPi.client_secret,
            orderId,
            amount: totalMinorUnits,
            currency: chargeCurrency,
          });
        }
      }
    } catch {
      // Stripe search failure — fall through to create a new PI.
    }

    // Two-layer Klarna eligibility for PI creation:
    //   (1) Gulf/rollout gate — Gulf (AED) always blocks; KLARNA_ROLLOUT flag controls cohort.
    //   (2) IP payer country — Klarna only supports specific payer markets (not LB/AE/CY);
    //       uses the same IP lookup as /checkout/klarna-status so clients can't bypass it.
    // allow_redirects:'never' only blocks redirect-based methods (Klarna, iDEAL…);
    // Apple Pay and Google Pay are not affected.
    let klarnaAllowed = false;
    let payerCountryForMeta: string | undefined;
    if (!isGulf && klarnaRolloutAllowed(orderId, key)) {
      const piClientIp = pickClientIp(
        req.headers["x-forwarded-for"],
        (req.ip ?? "").toString(),
      );
      if (piClientIp) {
        try {
          const piGeo = await resolveGeoCurrency(piClientIp);
          const piStripeKey = resolveStripeKey(store.storeKey);
          const piIsTestMode = !!(piStripeKey && piStripeKey.startsWith("sk_test_"));
          klarnaAllowed = isKlarnaEnabled({
            sessionId: piClientIp,
            payerCountry: piGeo.countryCode,
            isTestMode: piIsTestMode,
          });
          payerCountryForMeta = piGeo.countryCode ?? undefined;
        } catch {
          // Best-effort: default to false (Klarna not allowed) on geo failure.
        }
      }
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalMinorUnits,
      currency: stripeCurrency,
      // Card PI always uses explicit payment_method_types so it is compatible
      // with both legacy confirmCardPayment() and confirmPayment(). Klarna is
      // paid via a separate PI (klarnaClientSecret) and does not share this PI.
      // Using automatic_payment_methods here causes a Stripe rejection when the
      // frontend Elements is initialised in explicit-type mode.
      payment_method_types: ["card"],
      description: `Order ${orderId} from Presentail ${storeKeyToCountry(store.storeKey)}`, // i18n-ignore
      metadata: {
        ...(metadata ?? {}),
        orderId,
        presented_currency: currency,
        klarna_cohort: klarnaCohortLabel(orderId, key),
        // payer_country is the IP-resolved billing country (not delivery address).
        // Stored for ops tracing, Klarna dispute resolution, and webhook correlation.
        ...(payerCountryForMeta ? { payer_country: payerCountryForMeta } : {}),
        ...(billingCountry
          ? { billing_country_hint: billingCountry.toUpperCase().slice(0, 2) }
          : {}),
      },
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
      // Pass the payer's billing country as a real Stripe field (not metadata-
      // only) so Klarna can determine eligibility and the Stripe Dashboard shows
      // the payer's country. Only set when Klarna is enabled for this session;
      // for non-Klarna PIs the country is set by the Payment Element at confirm.
      ...(billingCountry && klarnaAllowed
        ? {
            shipping: {
              name: "Billing", // i18n-ignore
              address: {
                country: billingCountry.toUpperCase().slice(0, 2),
              },
            },
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
        deliveryCityId: cityId,
        deliveryDate,
        deliverySlotId,
        deliveryServiceType: paymentDeliveryServiceType,
        districtFeeUsd: serverDistrictFeeUsd,
        expressFeeUsd: serverExpressFeeUsd,
        slotFeeUsd: serverSlotFeeUsd,
        couponCode: appliedCouponCode,
        couponId: appliedCouponId,
        couponDiscountUsd: couponDiscountUsd > 0 ? couponDiscountUsd : undefined,
        ...policySnapshotFields,
      },
    });

    return res.json({
      ok: true,
      clientSecret: paymentIntent.client_secret,
      orderId,
      amount: totalMinorUnits,
      currency: chargeCurrency,
      klarnaAllowed,
    });
  } catch (err: any) {
    req.log?.error?.(
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
    deliveryDate,
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
    /** Selected delivery date as YYYY-MM-DD. Used to determine whether the same-day night surcharge applies. */
    deliveryDate?: string;
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
  const slotCheck = checkSubmittedSlotBookable({
    expressDelivery: expressDelivery === true,
    deliverySlot,
    deliverySlotId,
    deliveryDate,
    cityId,
    district,
  });
  if (!slotCheck.bookable) {
    return res.status(422).json({
      ok: false,
      code:
        slotCheck.reason === "slot_unavailable"
          ? "delivery_slot_unavailable"
          : "expired_delivery_slot",
      reason: slotCheck.reason,
      message:
        "The selected delivery time is no longer available. Please choose another time.", // i18n-ignore
    });
  }
  // Bugs A+B fix: prefer OS city-level delivery config (keyed by cityId) so the
  // quoted fees match what wooOrders.ts will compute at order creation.
  // When cityId is absent, fall back to the city-name lookup for backwards compat.
  const feesCountry = countryForDistrict(district ?? "Beirut");
  const feesOsConfig = cityId ? resolveOsDeliveryConfig(feesCountry, cityId) : null;
  const feesWouldBeStdFeeUsd = (() => {
    if (feesOsConfig && typeof feesOsConfig.cityFeeUsd === "number") {
      const isFreeByOs =
        feesOsConfig.freeDeliveryEnabled === true &&
        typeof feesOsConfig.freeDeliveryThresholdUsd === "number" &&
        subtotalUsd >= feesOsConfig.freeDeliveryThresholdUsd;
      return isFreeByOs ? 0 : feesOsConfig.cityFeeUsd;
    }
    // Default district to "Beirut" — same behaviour as /checkout/payment-intent
    // and all charge routes, so the quoted fee always matches the charged fee.
    return computeDistrictFeeUsd(district ?? "Beirut", subtotalUsd);
  })();
  // Express delivery replaces standard delivery — district fee is $0 for Express.
  const districtFeeUsd = expressDelivery === true ? 0 : feesWouldBeStdFeeUsd;
  const expressFeeUsd =
    expressDelivery === true
      ? resolveEffectiveExpressFeeUsd(
          feesOsConfig,
          feesWouldBeStdFeeUsd,
          expressSurchargeUsd(feesCountry),
        )
      : 0;
  const slotFeeUsd = computeSlotFeeUsd({
    expressDelivery: expressDelivery === true,
    deliverySlot,
    deliverySlotId,
    cityId,
    deliveryDate,
    district,
  });
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
      cartTotalUsd: rawTotalUsd,
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

// ── GET /checkout/payment-status ─────────────────────────────────────────────
// Returns the current Stripe PaymentIntent status + orderId for a given PI id.
// Used by OrderConfirmed.tsx as a fallback when the sessionStorage stash is
// unavailable (Safari private mode, iOS app-state kill, etc.) after a Klarna
// redirect — allowing the page to confirm the payment was taken and still show
// a success screen with the correct order ref.
//
// Query params:
//   paymentIntentId — e.g. "pi_3Oq..."
//   storeKey        — optional; "main" (default) or "gulf"
//
// Response: { ok: true, status: string, orderId: string | null, amount: number, currency: string }
router.get("/checkout/payment-status", async (req, res) => {
  const piId = typeof req.query.pi === "string" ? req.query.pi : "";
  if (!piId || !piId.startsWith("pi_")) {
    return res.status(400).json({ ok: false, message: "paymentIntentId is required and must start with pi_" }); // i18n-ignore
  }

  // clientSecret is required as a proof-of-payment token. Stripe appends
  // payment_intent_client_secret to redirect return URLs so legitimate callers
  // (OrderConfirmed.tsx after a Klarna redirect) always have it. Callers who
  // only know the PI ID (which appears in Stripe dashboard URLs) cannot call
  // this endpoint without the client secret — limiting the exposure of order
  // metadata to the shopper who initiated the payment.
  const providedSecret = (req.query["clientSecret"] as string | undefined)?.trim();
  if (!providedSecret || !providedSecret.startsWith(`${piId}_secret_`)) {
    return res.status(400).json({ ok: false, message: "clientSecret is required and must be the PaymentIntent client secret" }); // i18n-ignore
  }

  const store = resolveStoreFromRequest(req);
  const key = resolveStripeKey(store.storeKey);
  if (!key) {
    return res.status(503).json({ ok: false, code: "stripe_not_configured", message: "Stripe not configured" }); // i18n-ignore
  }

  try {
    const stripe = new Stripe(key);
    const pi = await stripe.paymentIntents.retrieve(piId);

    // Verify the full client_secret matches what Stripe has on record.
    // This prevents one shopper from polling another's payment status even if
    // they somehow obtained a different PI ID.
    if (!pi.client_secret || pi.client_secret !== providedSecret) {
      return res.status(403).json({ ok: false, message: "Forbidden: clientSecret does not match" }); // i18n-ignore
    }

    const orderId = (pi.metadata?.["orderId"] as string | undefined) ?? null;
    return res.json({
      ok: true,
      status: pi.status,
      orderId,
      amount: pi.amount,
      currency: pi.currency.toUpperCase(),
    });
  } catch (err: any) {
    req.log.warn({ err: err?.message, piId }, "checkout/payment-status: PI retrieval failed");
    return res.status(404).json({ ok: false, message: "PaymentIntent not found or retrieval failed" }); // i18n-ignore
  }
});

// ── GET /checkout/klarna-status ──────────────────────────────────────────────
// Returns whether Klarna should be offered to this shopper based on:
//   1. KLARNA_ROLLOUT env var (off|test|percentage|on)
//   2. The payer's country (from the client — already determined via IP geo call)
//   3. Whether the active Stripe key is a test key (sk_test_…)
//
// The payer country must come from the client's own IP geolocation call
// (/api/geo/country), NOT from the delivery address. Klarna requires the
// *billing* country to be in a supported market, and the billing country is
// determined by the shopper's location, not the recipient's delivery address.
//
// Query params:
//   country   — ISO 3166-1 alpha-2 code of the payer's country (from /api/geo/country)
//   sessionId — stable per-session identifier used for percentage-rollout cohort bucketing
//
// Response: { ok: true, enabled: boolean, payerCountry: string | null }
router.get("/checkout/klarna-status", async (req, res) => {
  // sessionId is used for deterministic cohort bucketing in percentage mode.
  // The client sends a stable per-session identifier (e.g. analytics sessionId).
  const sessionId = (req.query["sessionId"] as string | undefined)?.trim() || req.ip || "unknown";

  // Resolve payer country from the client's real IP address.
  // This MUST be the payer's browsing IP, NOT the delivery address country,
  // because Klarna's eligibility is based on the shopper's own billing country.
  // Diaspora shoppers browse from US/UK/DE and send to LB/AE — their delivery
  // countryCode would be "LB" (ineligible for Klarna), but their payer IP
  // resolves to a supported market.
  const clientIp = pickClientIp(
    req.headers["x-forwarded-for"],
    (req.ip ?? "").toString(),
  );
  let payerCountry: string | null = null;
  if (clientIp) {
    try {
      const geoResult = await resolveGeoCurrency(clientIp);
      payerCountry = geoResult.countryCode;
    } catch {
      // Best-effort: if geo fails, Klarna is not offered (safe default).
    }
  }

  const store = resolveStoreFromRequest(req);
  const stripeKey = resolveStripeKey(store.storeKey);
  const isTestMode = !!(stripeKey && stripeKey.startsWith("sk_test_"));

  const enabled = isKlarnaEnabled({ sessionId, payerCountry, isTestMode });

  return res.json({ ok: true, enabled, payerCountry });
});

// ── POST /checkout/klarna-pending ─────────────────────────────────────────────
//
// Called by the frontend immediately before stripe.confirmPayment() redirects
// the shopper to Klarna. Writes a klarna_pending_checkouts record so the
// payment_intent.succeeded webhook can drive state transitions even when the
// shopper's browser is no longer open. The server verifies the piId matches the
// intent stored for this orderId to prevent arbitrary record injection.

router.post("/checkout/klarna-pending", async (req, res) => {
  const { orderId, piId, orderPayload } = req.body as {
    orderId?: unknown;
    piId?: unknown;
    orderPayload?: unknown;
  };

  if (!orderId || typeof orderId !== "string") {
    return res.status(400).json({ ok: false, message: "orderId is required" }); // i18n-ignore
  }
  if (!piId || typeof piId !== "string" || !piId.startsWith("pi_")) {
    return res.status(400).json({ ok: false, message: "piId must be a Stripe PaymentIntent ID" }); // i18n-ignore
  }

  // Validate the piId against the server-side intent store so callers cannot
  // create records for PIs they don't own.
  // getPaymentIntentForOrder returns the paymentRef string (pi_xxx) directly.
  const storedRef = getPaymentIntentForOrder(orderId);
  let piVerified = storedRef === piId;
  if (!piVerified) {
    // Autoscale / restart recovery: the PI may have been created on a
    // different instance, so the in-memory store misses. Verify ownership
    // directly with Stripe by checking the PI's metadata.orderId (set
    // server-side at PI creation time — clients cannot forge it).
    const verifyKeys = [
      process.env.STRIPE_SECRET_KEY,
      process.env.STRIPE_SECRET_KEY_GULF,
    ].filter((k): k is string => !!k);
    for (const key of verifyKeys) {
      try {
        const encoded = Buffer.from(`${key}:`).toString("base64");
        const r = await fetch(
          `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(piId)}`,
          { headers: { Authorization: `Basic ${encoded}` } },
        );
        if (!r.ok) continue;
        const data = (await r.json()) as { metadata?: Record<string, string> };
        if (data.metadata?.orderId === orderId) {
          piVerified = true;
          break;
        }
      } catch {
        // Try the next account key.
      }
    }
  }
  if (!piVerified) {
    req.log.warn(
      { orderId, piId, storedRef },
      "klarna-pending: piId does not match stored intent for orderId", // i18n-ignore
    );
    return res.status(400).json({ ok: false, message: "PaymentIntent does not match the order" }); // i18n-ignore
  }

  // Sanitise orderPayload: accept only plain objects (not arrays or primitives).
  const safePayload =
    orderPayload !== null &&
    typeof orderPayload === "object" &&
    !Array.isArray(orderPayload)
      ? (orderPayload as Record<string, unknown>)
      : null;

  try {
    await db
      .insert(klarnaPendingCheckoutsTable)
      .values({ orderId, piId, status: "pending", orderPayload: safePayload })
      .onConflictDoUpdate({
        target: klarnaPendingCheckoutsTable.orderId,
        set: { piId, status: "pending", orderPayload: safePayload, updatedAt: new Date() },
      });

    req.log.info(
      { orderId, piId, hasPayload: safePayload !== null },
      "klarna-pending: record stored", // i18n-ignore
    );
    return res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message, orderId, piId }, "klarna-pending: DB write failed"); // i18n-ignore
    return res.status(500).json({ ok: false, message: "Failed to store Klarna pending checkout" }); // i18n-ignore
  }
});

// ── GET /stripe/payment-status ────────────────────────────────────────────────
//
// Polled by the frontend when Stripe redirects back with redirect_status=processing
// (Klarna approved the application asynchronously). Returns the DB-side status
// written by the payment_intent.succeeded / canceled / payment_failed webhook.
//
// ?pi=pi_xxx   — Stripe PaymentIntent ID (required)

router.get("/stripe/payment-status", async (req, res) => {
  const piId = req.query.pi;

  if (!piId || typeof piId !== "string" || !piId.startsWith("pi_")) {
    return res.status(400).json({ ok: false, message: "pi query parameter must be a Stripe PaymentIntent ID" }); // i18n-ignore
  }

  try {
    const rows = await db
      .select()
      .from(klarnaPendingCheckoutsTable)
      .where(eq(klarnaPendingCheckoutsTable.piId, piId))
      .limit(1);

    if (rows.length === 0) {
      // No pending checkout row — either a non-Klarna PI or record was never
      // written (e.g. the frontend failed before calling /checkout/klarna-pending).
      return res.status(404).json({ ok: false, message: "No pending checkout found" }); // i18n-ignore
    }

    return res.json({
      ok: true,
      orderId: rows[0].orderId,
      status: rows[0].status,
      // wooOrderRef is set by the payment_intent.succeeded webhook handler after
      // it successfully creates the WC order. The browser polls until this is
      // populated, then transitions to the success state using it as the order ref.
      ...(rows[0].wooOrderRef ? { wooOrderRef: rows[0].wooOrderRef } : {}),
    });
  } catch (err: any) {
    req.log.error({ err: err?.message, piId }, "stripe/payment-status: DB query failed"); // i18n-ignore
    return res.status(500).json({ ok: false, message: "Failed to check payment status" }); // i18n-ignore
  }
});


export default router;
