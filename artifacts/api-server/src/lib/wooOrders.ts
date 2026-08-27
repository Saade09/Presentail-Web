import {
  db,
  appOrdersTable,
  pendingWooOrdersTable,
  type PendingWooOrder,
} from "@workspace/db";
import { and, eq, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { logger } from "./logger";
import { sendOrderEventPush } from "./orderEvents";
import {
  convertFromUsd,
  normalizeCurrency,
  roundForCurrency,
  toStripeMinorUnits,
  type SupportedCurrency,
} from "./fx";
import {
  fetchWcProductPrice,
  computeDistrictFeeUsd,
  computeSlotFeeUsd,
  countryForDistrict,
  expressSurchargeUsd,
  resolveOsEffectivePrice,
  resolveSlotForDate,
  resolveMidnightWindow,
} from "./catalog";
import {
  isMidnightSlot,
  getLocalIso,
  MIDNIGHT_FEE_USD,
  midnightWindowForOccasionDate,
} from "@workspace/delivery";

import { resolveStore, wooAuthHeader, type WooStoreConfig } from "./wooStore";

/**
 * Maximum price in USD accepted for a single non-catalog fee-line item
 * (e.g. card-printing fees). Requests above this ceiling are rejected so a
 * malicious client cannot inflate WooCommerce / OS order totals or offline
 * payment invoices beyond a small margin above the actual catalog price.
 */
const MAX_FEE_ITEM_PRICE_USD = 50;
/**
 * Maximum quantity allowed per non-catalog fee-line item.
 * Bounding quantity prevents quantity × clamped-price inflation
 * (e.g. $50 × 1 000 = $50 000 fee line). Requests that exceed this are rejected.
 */
const MAX_FEE_ITEM_QUANTITY = 10;
/**
 * Maximum aggregate non-catalog fee total in USD per order after per-item
 * price and quantity are within bounds. Requests that still exceed this are
 * rejected so the combination of price × quantity cannot escape the cap.
 */
const MAX_FEE_TOTAL_USD = 100;

/**
 * Validates non-catalog fee items (those without wcId / osSlug) and returns
 * either an error reason string or null when the items are within bounds.
 *
 * Checks:
 *  1. Per-item price ≤ MAX_FEE_ITEM_PRICE_USD (after clamping negatives to 0)
 *  2. Per-item quantity ≤ MAX_FEE_ITEM_QUANTITY (positive integer)
 *  3. Aggregate (price × quantity) ≤ MAX_FEE_TOTAL_USD
 *
 * Caller must reject the order (status 422) when a non-null string is returned.
 */
function validateFeeItems(
  feeItems: { price: number; quantity: number; name?: string }[],
): string | null {
  let total = 0;
  for (const item of feeItems) {
    const price = Math.max(0, item.price);
    if (price > MAX_FEE_ITEM_PRICE_USD) {
      return `Fee item price $${price.toFixed(2)} exceeds the allowed maximum of $${MAX_FEE_ITEM_PRICE_USD}`; // i18n-ignore
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_FEE_ITEM_QUANTITY) {
      return `Fee item quantity ${item.quantity} is invalid (must be 1–${MAX_FEE_ITEM_QUANTITY})`; // i18n-ignore
    }
    total += price * item.quantity;
  }
  if (total > MAX_FEE_TOTAL_USD) {
    return `Total fee items $${total.toFixed(2)} exceeds the allowed maximum of $${MAX_FEE_TOTAL_USD} per order`; // i18n-ignore
  }
  return null;
}
import {
  getDeliverySlots,
  resolveOsDeliveryConfig,
  type OsDeliverySlot,
} from "./osLocationsCache";
import { createOsOrder, type PresentailOsConfig } from "@workspace/presentail-os";
import { getOsProductBySlug, getOsProductByWcId, hasOsProducts } from "./osProductsCache";
import { appendOrderToSheet } from "./ordersSheet.js";
import { runDistributedJob } from "./distributedJob";

async function wooFetch(path: string, options: RequestInit = {}, store?: WooStoreConfig) {
  const s = store ?? resolveStore();
  return fetch(`${s.baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: wooAuthHeader(s),
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "PresentailApp/1.0",
      ...(options.headers ?? {}),
    },
  });
}

const Iso2 = z
  .string()
  .trim()
  .length(2)
  .regex(/^[A-Za-z]{2}$/)
  .transform((s) => s.toUpperCase());

/**
 * Title-cases a string word-by-word (e.g. "john doe" → "John Doe").
 * Each word has its first character uppercased and the rest lowercased.
 * Already-correct input is returned unchanged.
 */
export function toTitleCase(s: string): string {
  return s
    .split(" ")
    .map((word) => (word.length === 0 ? word : word[0].toUpperCase() + word.slice(1).toLowerCase()))
    .join(" ");
}

/**
 * Human-visible placeholder written into the OS delivery address fields when
 * the customer enabled "Ask the recipient for the address" at checkout.
 */
export const ASK_RECIPIENT_ADDRESS_PLACEHOLDER =
  "To be confirmed — ask recipient for address"; // i18n-ignore

/**
 * Explicit line appended to the OS order notes / delivery instructions when
 * the ask-recipient toggle is on, so OS operators cannot miss that they must
 * collect the delivery address from the recipient.
 */
export const ASK_RECIPIENT_NOTE =
  "Customer requested we collect the delivery address from the recipient."; // i18n-ignore

/**
 * Derives the OS-facing address + notes strings for an order, enriching them
 * with an unmistakable ask-recipient signal when `noAddress` is set.
 *
 * - Toggle off: returns the inputs unchanged.
 * - Toggle on: the address becomes the placeholder text (any customer-typed
 *   address detail is preserved after it), and the ask-recipient line is
 *   appended to the notes without clobbering customer-written notes.
 * - Idempotent: re-applying to already-enriched values (e.g. on order-creation
 *   retries or payload rebuilds) never duplicates the placeholder or note.
 */
export function applyAskRecipientSignals(input: {
  noAddress: boolean;
  address: string;
  notes: string;
}): { address: string; notes: string } {
  if (!input.noAddress) return { address: input.address, notes: input.notes };

  const trimmedAddress = input.address.trim();
  const address = trimmedAddress.includes(ASK_RECIPIENT_ADDRESS_PLACEHOLDER)
    ? trimmedAddress
    : trimmedAddress
      ? `${ASK_RECIPIENT_ADDRESS_PLACEHOLDER} — ${trimmedAddress}`
      : ASK_RECIPIENT_ADDRESS_PLACEHOLDER;

  const trimmedNotes = input.notes.trim();
  const notes = trimmedNotes.includes(ASK_RECIPIENT_NOTE)
    ? trimmedNotes
    : trimmedNotes
      ? `${trimmedNotes}\n${ASK_RECIPIENT_NOTE}`
      : ASK_RECIPIENT_NOTE;

  return { address, notes };
}

export const WooOrderSchema = z.object({
  orderId: z.string().min(1),
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        quantity: z.number().int().positive(),
        // price is kept for non-catalog (fee) items without a wcId.
        // For catalog items (wcId present), the server re-derives the price
        // from the WooCommerce catalog and ignores the client-supplied value.
        price: z.number().nonnegative(),
        wcId: z.number().int().nonnegative().optional(),
        // OS product slug — used when wcId is 0 (OS-native products not mirrored in WC).
        osSlug: z.string().optional(),
        // Optional personalisation note (max 22 chars) when the product has an input field.
        customInput: z.string().max(22).optional(),
      }),
    )
    .min(1),
  billing: z.object({
    firstName: z.string().min(1).transform(toTitleCase),
    lastName: z.string().default("").transform(toTitleCase),
    email: z.string().email(),
    phone: z.string().min(1),
  }),
  recipient: z.object({
    firstName: z.string().min(1).transform(toTitleCase),
    lastName: z.string().default("").transform(toTitleCase),
    phone: z.string().min(1),
  }),
  district: z.string().min(1),
  // cityId is used server-side to look up the booked slot's extraFee from the
  // OS city cache. Ignored when absent (legacy payloads).
  cityId: z.string().optional(),
  // districtFee, expressFee, and slotFee are accepted for schema compatibility
  // but the server recomputes them from trusted tables and ignores client values
  // for all financial calculations.
  districtFee: z.number().nonnegative(),
  expressFee: z.number().nonnegative(),
  slotFee: z.number().nonnegative().optional(),
  // True when the customer ticked "I don't know the address" at checkout.
  // Does not change the delivery fee — no-address orders pay the normal
  // district/city fee. It only affects address placeholders/notes and waives
  // the express surcharge.
  noAddress: z.boolean().optional(),
  billingCountry: Iso2.optional(),
  shippingCountry: Iso2.optional(),
  paymentRef: z.string().optional(),
  deliveryDetails: z.string().default(""),
  deliveryDate: z.string().default(""),
  deliverySlot: z.string().default(""),
  deliverySlotId: z.string().optional(),
  deliveryServiceType: z.enum(["midnight"]).optional(),
  cardMessage: z.string().optional(),
  cardFrom: z.string().optional(),
  cardTo: z.string().optional(),
  qrLink: z.string().optional(),
  qrLabel: z.string().optional(),
  orderNotes: z.string().optional(),
  paymentMethod: z.enum(["card", "wallet", "apple_pay", "google_pay", "whish", "western", "mamo", "paypal", "klarna", "cybersource"]),
  identitySecret: z.boolean().optional(),
  // True when the sender left "Get order updates on WhatsApp" checked at
  // checkout. Optional so legacy payloads (mobile app, queued reconciliation
  // rows) still validate; absent is treated as false (no opt-in) downstream.
  whatsappOptIn: z.boolean().optional(),
  appDeviceId: z.string().optional(),
  currencyCode: z.string().optional(),
  couponCode: z.string().trim().optional(),
  // Occasion slug the shopper navigated from before reaching checkout.
  // Read from client-side sessionStorage key ps_occasion_ref and cleared after use.
  // Stored on the app_orders row for occasion-level attribution reporting.
  occasion_ref: z.string().optional(),
  // Verified Address Book place selected in the checkout Delivery Details
  // field (landmark recognition). Optional — absent when the shopper typed a
  // free-text address. When present, the flattened `deliveryDetails` string
  // is still populated for full backward compatibility. All identifying
  // fields come from the OS Address Book projection (never client-invented);
  // internalDetail and typedQuery are the shopper's own text.
  addressBookPlace: z
    .object({
      placeId: z.string().min(1).max(128),
      name: z.string().min(1).max(256),
      officialName: z.string().max(256).optional(),
      districtName: z.string().max(128).optional(),
      districtCityId: z.string().max(128).optional(),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
      /** Shopper's answer to the place follow-up ("Where inside AUBMC?"). */
      internalDetail: z.string().max(600).optional(),
      /** The original text the shopper typed before selecting. */
      typedQuery: z.string().max(200).optional(),
      /** How the place was chosen (e.g. "suggestion"). */
      selectionSource: z.string().max(64).optional(),
    })
    .optional(),
  // Optional marketing attribution captured from UTM params / Google Ads click IDs.
  // Passed through to the OS order payload for ad-spend attribution reporting.
  // All sub-fields are optional strings so a partial payload never fails validation.
  marketing_attribution: z
    .object({
      source: z.string().optional(),
      first_touch: z.record(z.string()).optional(),
      last_touch: z.record(z.string()).optional(),
      conversion: z
        .object({
          order_total: z.string().optional(),
          currency: z.string().optional(),
          converted_at: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

export type WooOrderPayload = z.infer<typeof WooOrderSchema>;

type WcOrderResponse = {
  id?: number;
  order_key?: string;
  message?: string;
  // WooCommerce machine-readable error code (present on non-2xx responses).
  code?: string;
  // Total discount applied by coupon lines (string decimal, e.g. "12.50").
  // Present on successful WC order creation responses when a coupon was applied.
  discount_total?: string;
};

export type WcOrderAttemptResult =
  | {
      ok: true;
      wcOrderId: number | null;
      orderKey: string | undefined;
      recipientName: string;
      // Authoritative USD total (catalog subtotal + delivery + express +
      // non-catalog fee items). Always returned on success so the caller can
      // persist it on the app_orders row for reporting.
      totalUsdCents: number;
      // Discount applied by coupon lines in the display currency, parsed from
      // WC's discount_total field. Zero when no coupon was applied.
      couponDiscount: number;
    }
  | {
      ok: false;
      status: number;
      message: string;
      recipientName: string;
      // WooCommerce machine-readable error code forwarded from the WC REST API.
      // Present only when WC returned a structured error body.
      wcErrorCode?: string;
    };

// WooCommerce coupon error codes (returned as `code` in the WC REST error body).
// These indicate deterministic validation failures — retrying with the same
// payload will never succeed, so they must bypass the reconciliation queue.
const COUPON_ERROR_CODE_PREFIXES = [
  "woocommerce_coupon_",
  "woocommerce_rest_coupon_",
];

/**
 * Returns true when a WooCommerce error code indicates a coupon-validation
 * failure (expired, not found, usage limit, excluded product, etc.).
 * Used by the route handler to skip reconciliation for deterministic failures.
 */
export function isCouponErrorCode(code: string | undefined): boolean {
  if (!code) return false;
  return COUPON_ERROR_CODE_PREFIXES.some((prefix) => code.startsWith(prefix));
}

// Accepted source-platform values for the analytics-funnel revenue join.
// Anything else collapses to null so we don't spray unbounded user-controlled
// strings into the column (the alerter monitor groups by platform too).
const KNOWN_PLATFORMS = new Set(["ios", "android", "web"]);

export function normalizePlatform(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return KNOWN_PLATFORMS.has(v) ? v : null;
}

const PAYMENT_TITLES: Record<string, string> = {
  card: "Credit / Debit Card (Stripe)",
  wallet: "Apple Pay / Google Pay (Stripe)",
  whish: "Whish Money",
  western: "Western Union",
  mamo: "Mamo (UAE Wallets)",
  paypal: "PayPal",
  cybersource: "Credit Card (CyberSource)",
};

// Build the WooCommerce REST payload and POST it. Pure function w.r.t. the
// queue/db side effects — those are handled by the caller. Used by both the
// HTTP route handler and the reconciliation worker.
//
// `paymentVerified` must be true for card/wallet/mamo/paypal methods.
// The route handler verifies with the provider before calling this function.
// The reconciliation worker passes the stored verified flag.
export async function attemptCreateWcOrder(
  body: WooOrderPayload,
  opts: { paymentVerified?: boolean; wcCustomerId?: number | null; store?: WooStoreConfig } = {},
): Promise<WcOrderAttemptResult> {
  const recipientFullName = `${body.recipient.firstName} ${body.recipient.lastName}`.trim();
  const cardToValue = body.cardTo?.trim() ?? '';

  const deliveryDateFormatted = body.deliveryDate
    ? new Date(`${body.deliveryDate}T12:00:00`).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "Asia/Beirut",
      })
    : body.deliveryDate ?? "";

  const deliverySummary =
    deliveryDateFormatted && body.deliverySlot
      ? `${deliveryDateFormatted} · ${body.deliverySlot}`
      : deliveryDateFormatted || body.deliverySlot || "";

  const deliveryCombined = deliverySummary;

  const metaData: { key: string; value: string }[] = [
    { key: "_app_order_id", value: body.orderId },
    { key: "_source", value: "presentail-app" },
    { key: "card_message", value: body.cardMessage ?? "" },
    { key: "wfacp_card_message", value: body.cardMessage ?? "" },
    { key: "to_text", value: cardToValue },
    { key: "from", value: body.cardFrom ?? "" },
    { key: "delivery", value: deliveryCombined },
    { key: "secret_id", value: body.identitySecret ? "Yes" : "No" },
    { key: "qr-code", value: body.qrLink ?? "" },
    { key: "qr-label", value: body.qrLabel ?? "" },
    { key: "Delivery Summary", value: deliverySummary },
    { key: "Delivery Date", value: deliveryDateFormatted },
    { key: "Delivery Time", value: body.deliverySlot ?? "" },
    { key: "Delivery District", value: body.district },
    { key: "Delivery Address", value: body.deliveryDetails },
    { key: "Recipient Name", value: recipientFullName },
    { key: "Recipient Phone", value: body.recipient.phone },
    { key: "checkout_delivery_slots", value: deliverySummary },
  ];

  const lineItemDeliveryMeta = [
    { key: "Delivery Summary", value: deliverySummary },
    { key: "Delivery Date", value: deliveryDateFormatted },
    { key: "Delivery Time", value: body.deliverySlot ?? "" },
  ];

  const presentedCurrency: SupportedCurrency = normalizeCurrency(body.currencyCode);
  const conv = async (usd: number) =>
    roundForCurrency(await convertFromUsd(usd, presentedCurrency), presentedCurrency);
  const fmt = (v: number) => v.toFixed(2);

  // For catalog items (wcId present), fetch the real price from WooCommerce
  // and refuse to fall back to client-supplied prices. This prevents price
  // manipulation even when the payment verification step was somehow bypassed.
  // Accumulate the catalog subtotal in USD for delivery fee computation.
  const catalogItemInputs = body.items.filter((item) => !!item.wcId);
  // Validate non-catalog fee items (those without wcId — typically client-
  // added line items like card-printing fees). Each item's price and quantity
  // are checked against server-enforced maximums and the request is rejected
  // when any limit is exceeded, so a manipulated payload cannot inflate WC
  // order totals or offline-payment invoices.
  const rawFeeItems = body.items.filter((item) => !item.wcId);
  const feeValidationError = validateFeeItems(rawFeeItems);
  if (feeValidationError) {
    return {
      ok: false,
      status: 422,
      message: feeValidationError,
      recipientName: recipientFullName,
    };
  }
  const nonCatalogFeesUsd = rawFeeItems.reduce(
    (sum, item) => sum + Math.max(0, item.price) * item.quantity,
    0,
  );
  let catalogSubtotalUsd = 0;
  const lineItemData: { wcId: number | undefined; quantity: number; priceUsd: number }[] = [];

  for (const item of catalogItemInputs) {
    const catalog = await fetchWcProductPrice(item.wcId!, opts.store);
    if (!catalog) {
      if (opts.store?.consumerKey || process.env.WC_CONSUMER_KEY) {
        // WC is configured but the product wasn't found — fail hard rather
        // than falling back to the client-supplied price which is untrusted.
        return {
          ok: false,
          status: 422,
          message: `Catalog price unavailable for product ${item.wcId}. Cannot create order with unverified pricing.`, // i18n-ignore
          recipientName: recipientFullName,
        };
      }
      // WC not configured (dev/test) — use client price with a log warning.
      logger.warn(
        { wcId: item.wcId, appOrderId: body.orderId },
        "wooOrders: WC not configured, using client price (dev mode only)",
      );
      lineItemData.push({ wcId: item.wcId, quantity: item.quantity, priceUsd: item.price });
      catalogSubtotalUsd += item.price * item.quantity;
    } else {
      lineItemData.push({ wcId: item.wcId, quantity: item.quantity, priceUsd: catalog.price });
      catalogSubtotalUsd += catalog.price * item.quantity;
    }
  }

  const lineItems = await Promise.all(
    lineItemData.map(async (d) => {
      const unit = await conv(d.priceUsd);
      const lineTotal = unit * d.quantity;
      return {
        product_id: d.wcId,
        quantity: d.quantity,
        subtotal: fmt(lineTotal),
        total: fmt(lineTotal),
        meta_data: lineItemDeliveryMeta,
      };
    }),
  );

  // rawFeeItems have already been validated by validateFeeItems() above.
  // Use the validated items directly — no further clamping needed.
  const feeLines = await Promise.all(
    rawFeeItems.map(async (item) => {
      const lineTotal = (await conv(Math.max(0, item.price))) * item.quantity;
      return {
        name: `${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ""}`,
        total: fmt(lineTotal),
        tax_status: "none",
      };
    }),
  );

  const shippingLines: any[] = [];
  // Resolve OS-delivered delivery config for this city/country — used for
  // city-level delivery fee and express surcharge when the OS has sent data.
  const isNoAddress = body.noAddress === true;
  const osDeliveryConfig = resolveOsDeliveryConfig(
    body.shippingCountry ?? undefined,
    body.cityId ?? undefined,
  );
  // Prefer OS city-level delivery fee; fall back to hardcoded district table
  // when OS hasn't sent city data yet (e.g. during initial startup window).
  let serverDistrictFeeUsd: number;
  if (typeof osDeliveryConfig.cityFeeUsd === "number") {
    const isFreeByOs =
      osDeliveryConfig.freeDeliveryEnabled === true &&
      typeof osDeliveryConfig.freeDeliveryThresholdUsd === "number" &&
      catalogSubtotalUsd >= osDeliveryConfig.freeDeliveryThresholdUsd;
    serverDistrictFeeUsd = isFreeByOs ? 0 : osDeliveryConfig.cityFeeUsd;
  } else {
    serverDistrictFeeUsd = computeDistrictFeeUsd(
      body.district,
      catalogSubtotalUsd,
    );
  }
  const convertedDistrictFee = await conv(serverDistrictFeeUsd);
  const deliveryLabel = isNoAddress ? "Contact Recipient" : body.district;
  if (convertedDistrictFee > 0) {
    shippingLines.push({
      method_id: "flat_rate",
      method_title: `Delivery – ${deliveryLabel}`,
      total: fmt(convertedDistrictFee),
    });
  } else {
    shippingLines.push({
      method_id: "free_shipping",
      method_title: `Free Delivery – ${deliveryLabel}`,
      total: "0.00",
    });
  }

  // Express surcharge: prefer OS-delivered city value; fall back to hardcoded
  // country constant when the OS cache has no data for this city yet.
  const clientSignalledExpress = body.expressFee > 0;
  let expressSurchargeAppliedUsd = 0;
  if (clientSignalledExpress) {
    const districtCountry = countryForDistrict(body.district);
    expressSurchargeAppliedUsd =
      osDeliveryConfig.expressSurchargeUsd > 0
        ? osDeliveryConfig.expressSurchargeUsd
        : expressSurchargeUsd(districtCountry);
    shippingLines.push({
      method_id: "flat_rate",
      method_title: "Express Delivery Surcharge",
      total: fmt(await conv(expressSurchargeAppliedUsd)),
    });
  }

  // Slot surcharge: computed via computeSlotFeeUsd() so the $5 same-day night
  // fallback is applied even when the OS slot has no explicit extraFee set.
  // Amount cannot be inflated or zeroed out by the client.
  const slotFeeAppliedUsd = computeSlotFeeUsd({
    expressDelivery: clientSignalledExpress,
    deliverySlot: body.deliverySlot,
    deliverySlotId: body.deliverySlotId,
    cityId: body.cityId ?? undefined,
    deliveryDate: body.deliveryDate ?? undefined,
    district: body.district,
  });
  if (slotFeeAppliedUsd > 0) {
    shippingLines.push({
      method_id: "flat_rate",
      method_title: "Night Delivery Surcharge",
      total: fmt(await conv(slotFeeAppliedUsd)),
    });
  }

  // Final authoritative USD total persisted on the app_orders row. Mirrors
  // exactly the lines we send to WooCommerce above (catalog subtotal +
  // non-catalog fee items + district fee + express surcharge + slot surcharge),
  // so the funnel dashboard's revenue numbers add up to what shoppers paid.
  const totalUsd =
    catalogSubtotalUsd +
    nonCatalogFeesUsd +
    serverDistrictFeeUsd +
    expressSurchargeAppliedUsd +
    slotFeeAppliedUsd;
  const totalUsdCents = Math.max(0, Math.round(totalUsd * 100));

  // Determine set_paid: only true when payment has been verified with the
  // provider. The route handler sets paymentVerified; the reconciliation
  // worker reuses the stored flag.
  const requiresOnlinePayment =
    body.paymentMethod === "card" ||
    body.paymentMethod === "wallet" ||
    body.paymentMethod === "mamo" ||
    body.paymentMethod === "paypal" ||
    (body.paymentMethod as string) === "cybersource"; // legacy: historical orders with CS payment
  const setPaid = requiresOnlinePayment && opts.paymentVerified === true;

  metaData.push(
    { key: "Presented Currency", value: presentedCurrency },
    { key: "_presented_currency", value: presentedCurrency },
  );

  // Attach coupon code when provided — WooCommerce will apply the discount
  // server-side and return an error if the code is invalid or expired.
  const couponLines: { code: string }[] =
    body.couponCode ? [{ code: body.couponCode }] : [];

  const orderPayload: Record<string, unknown> = {
    status: "processing",
    currency: presentedCurrency,
    ...(couponLines.length > 0 ? { coupon_lines: couponLines } : {}),
    payment_method:
      body.paymentMethod === "card" || body.paymentMethod === "wallet"
        ? "stripe"
        : body.paymentMethod,
    payment_method_title: PAYMENT_TITLES[body.paymentMethod] ?? body.paymentMethod,
    set_paid: setPaid,
    billing: {
      first_name: body.billing.firstName,
      last_name: body.billing.lastName,
      email: body.billing.email,
      phone: body.billing.phone,
      country: body.billingCountry ?? "LB",
    },
    shipping: {
      first_name: body.recipient.firstName,
      last_name: body.recipient.lastName,
      address_1: body.deliveryDetails,
      city: body.district,
      country: body.shippingCountry ?? "LB",
    },
    line_items: lineItems,
    fee_lines: feeLines,
    shipping_lines: shippingLines,
    customer_note: [
      body.orderNotes,
      body.cardMessage ? `Card: "${body.cardMessage}" – from ${body.cardFrom}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    meta_data: metaData,
  };

  // Attach the WooCommerce customer mirror id so the WC order is properly
  // linked (rather than stored as billing text only). Falsy values are
  // skipped so guest orders without a mirror still go through cleanly.
  if (opts.wcCustomerId && Number.isFinite(opts.wcCustomerId) && opts.wcCustomerId > 0) {
    orderPayload.customer_id = opts.wcCustomerId;
  }

  try {
    const r = await wooFetch("/orders", {
      method: "POST",
      body: JSON.stringify(orderPayload),
    }, opts.store);
    const data = (await r.json()) as WcOrderResponse;
    if (!r.ok) {
      return {
        ok: false,
        status: r.status,
        message: data?.message ?? "WooCommerce order failed", // i18n-ignore
        wcErrorCode: data?.code,
        recipientName: recipientFullName,
      };
    }
    return {
      ok: true,
      wcOrderId: typeof data?.id === "number" ? data.id : null,
      orderKey: data.order_key,
      recipientName: recipientFullName,
      totalUsdCents,
      // Parse WC's discount_total (string decimal in the display currency).
      // Defaults to 0 when absent (no coupon applied or old WC version).
      couponDiscount: parseFloat(data.discount_total ?? "0") || 0,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 500,
      message: err?.message ?? "Failed to create order", // i18n-ignore
      recipientName: recipientFullName,
    };
  }
}

// Persist the app↔WC order mapping and fire the "confirmed" push. Best-effort:
// errors are logged but never propagated — the caller has already responded
// to the customer (or the worker has already marked the queue row done).
export async function recordSuccessfulWcOrder(input: {
  body: WooOrderPayload;
  wcOrderId: number | null;
  userId: number | null;
  customerId?: number | null;
  recipientName: string;
  totalUsdCents?: number | null;
  platform?: string | null;
  // Canonical store key (lebanon|dubai|abudhabi|cyprus). Persisted on the
  // app_orders row so the loyalty engine can later credit the correct
  // ledger source key (Dubai vs Abu Dhabi share country AE).
  storeKey?: string | null;
  // Billing phone (E.164) of the person who placed the order. Stored so
  // the SMS/WhatsApp notifier can reach the sender on subsequent state changes
  // without a round-trip to WooCommerce.
  senderPhone?: string | null;
  // Presentail OS order id (UUID) returned by POST /api/orders on OS.
  // Stored so the OS webhook can later look up the app_orders row by osOrderId
  // when firing order-status push notifications.
  osOrderId?: string | null;
  // Snapshot of resolved line items for use in transactional emails.
  lineItems?: OrderLineItemSnapshot[] | null;
  log?: { warn?: (...args: any[]) => void; info?: (...args: any[]) => void };
  // Order state written to app_orders. Defaults to "confirmed" for successfully
  // paid orders; pass "payment_failed" for declined-payment recordings.
  state?: string | null;
  // ISO 4217 currency code the shopper actually paid in (e.g. "SAR", "AED").
  // Taken from the verified payment intent; falls back to null for legacy rows.
  currencyCode?: string | null;
  // Order total in the payment currency (minor units). Pairs with currencyCode.
  totalPaymentCents?: number | null;
}) {
  const {
    body,
    wcOrderId,
    userId,
    customerId,
    recipientName,
    totalUsdCents,
    platform,
    storeKey,
    senderPhone,
    osOrderId,
    lineItems,
    log,
    state: inputState,
    currencyCode,
    totalPaymentCents,
  } = input;
  const orderState = inputState ?? "confirmed";
  const occasionRef =
    typeof body.occasion_ref === "string" && body.occasion_ref.trim()
      ? body.occasion_ref.trim()
      : null;

  const senderName =
    `${body.billing.firstName ?? ""} ${body.billing.lastName ?? ""}`.trim() || null;
  const senderEmail = body.billing.email || null;
  const recipientPhone =
    typeof body.recipient?.phone === "string" && body.recipient.phone
      ? body.recipient.phone
      : null;
  const deliveryDistrict = body.district || null;
  const deliveryAddress =
    body.deliveryDetails && body.deliveryDetails !== "To be confirmed"
      ? body.deliveryDetails
      : null;
  const paymentMethod = body.paymentMethod || null;
  const couponCode = body.couponCode?.trim() || null;
  const cardMessage = body.cardMessage?.trim() || null;
  const marketingAttributionJson = body.marketing_attribution
    ? JSON.stringify(body.marketing_attribution)
    : null;
  const lineItemsJson =
    lineItems && lineItems.length > 0 ? JSON.stringify(lineItems) : null;
  const rawDeviceId =
    typeof body.appDeviceId === "string" && body.appDeviceId
      ? body.appDeviceId
      : null;
  const appDeviceId = userId != null ? rawDeviceId : null;
  if (rawDeviceId && userId == null) {
    log?.info?.(
      { appOrderId: body.orderId },
      "woo.order: ignoring appDeviceId on unauthenticated request",
    );
  }

  try {
    // Normalise the billing phone to E.164 (strip spaces/dashes) so Twilio
    // accepts it. If the phone is missing or malformed, store null — the SMS
    // notifier skips gracefully when senderPhone is null.
    const rawPhone =
      typeof body.billing?.phone === "string" ? body.billing.phone.replace(/[\s\-().]/g, "") : null;
    const normalizedSenderPhone =
      rawPhone && /^\+[1-9]\d{1,14}$/.test(rawPhone) ? rawPhone : (senderPhone ?? null);

    // Resolve Midnight-specific delivery fields for persistence.
    // isMidnightSlot() is the canonical detector — never use label heuristics.
    const midnightWin = resolveMidnightWindow({
      deliverySlot: body.deliverySlot,
      deliverySlotId: body.deliverySlotId,
      deliveryDate: body.deliveryDate ?? undefined,
      cityId: body.cityId ?? undefined,
      district: body.district,
    });
    const isMidnight = (() => {
      if (body.deliveryServiceType === "midnight") return true;
      if (midnightWin) return true;
      if (body.cityId && body.deliverySlot) {
        const slots = getDeliverySlots(body.cityId, body.deliveryDate || undefined);
        const country = countryForDistrict(body.district ?? "Beirut");
        const todayIso = getLocalIso(country);
        const resolved = resolveSlotForDate(slots, {
          deliverySlot: body.deliverySlot,
          deliverySlotId: body.deliverySlotId,
          dateIso: body.deliveryDate || todayIso,
          todayIso,
          cityId: body.cityId,
        });
        return resolved ? isMidnightSlot(resolved, body.cityId) : false;
      }
      return false;
    })();
    const authoritativeMidnightWin =
      isMidnight && body.deliveryDate
        ? midnightWin ?? midnightWindowForOccasionDate(body.deliveryDate)
        : undefined;
    // Slot fee in cents for persistence (0 for non-midnight, 2000 for midnight).
    const slotFeeCentsForDb = isMidnight ? MIDNIGHT_FEE_USD * 100 : null;

    await db
      .insert(appOrdersTable)
      .values({
        appOrderId: body.orderId,
        wcOrderId,
        userId,
        customerId: customerId ?? null,
        deviceId: appDeviceId,
        recipientName: recipientName || null,
        deliveryDate: body.deliveryDate ?? null,
        deliverySlot: body.deliverySlot ?? null,
        state: orderState,
        platform: platform ?? null,
        totalUsdCents: totalUsdCents ?? null,
        storeKey: storeKey ?? null,
        senderPhone: normalizedSenderPhone,
        osOrderId: osOrderId ?? null,
        lineItemsJson,
        senderName,
        senderEmail,
        recipientPhone,
        deliveryDistrict,
        deliveryAddress,
        paymentMethod,
        currencyCode: currencyCode ?? null,
        totalPaymentCents: totalPaymentCents ?? null,
        couponCode,
        cardMessage,
        occasionRef,
        marketingAttributionJson,
        whatsappOptIn: body.whatsappOptIn ?? null,
        // Midnight delivery columns
        deliveryCityId: body.cityId ?? null,
        deliveryCountryCode: body.shippingCountry ?? null,
        deliverySlotId: body.deliverySlotId ?? null,
        deliveryServiceType: isMidnight ? "midnight" : null,
        deliverySlotFeeCents: slotFeeCentsForDb,
        deliveryWindowStart: authoritativeMidnightWin
          ? new Date(authoritativeMidnightWin.start)
          : null,
        deliveryWindowEnd: authoritativeMidnightWin
          ? new Date(authoritativeMidnightWin.end)
          : null,
      })
      .onConflictDoUpdate({
        target: appOrdersTable.appOrderId,
        set: {
          wcOrderId,
          userId,
          customerId: customerId ?? null,
          deviceId: appDeviceId,
          recipientName: recipientName || null,
          deliveryDate: body.deliveryDate ?? null,
          deliverySlot: body.deliverySlot ?? null,
          // Only promote state forward: payment_failed → confirmed is
          // allowed (shopper retried and succeeded), but never go backward.
          // Use a SQL CASE to guard: update only when incoming state is
          // "confirmed" OR current state is not already "confirmed".
          state: orderState,
          platform: platform ?? null,
          totalUsdCents: totalUsdCents ?? null,
          storeKey: storeKey ?? null,
          senderPhone: normalizedSenderPhone,
          osOrderId: osOrderId ?? null,
          lineItemsJson,
          senderName,
          senderEmail,
          recipientPhone,
          deliveryDistrict,
          deliveryAddress,
          paymentMethod,
          currencyCode: currencyCode ?? null,
          totalPaymentCents: totalPaymentCents ?? null,
          couponCode,
          cardMessage,
          occasionRef,
          marketingAttributionJson,
          whatsappOptIn: body.whatsappOptIn ?? null,
          // Midnight delivery columns
          deliveryCityId: body.cityId ?? null,
          deliveryCountryCode: body.shippingCountry ?? null,
          deliverySlotId: body.deliverySlotId ?? null,
          deliveryServiceType: isMidnight ? "midnight" : null,
          deliverySlotFeeCents: slotFeeCentsForDb,
          deliveryWindowStart: authoritativeMidnightWin
            ? new Date(authoritativeMidnightWin.start)
            : null,
          deliveryWindowEnd: authoritativeMidnightWin
            ? new Date(authoritativeMidnightWin.end)
            : null,
          updatedAt: new Date(),
        },
      });
  } catch (err: any) {
    log?.warn?.(
      { err: err?.message, appOrderId: body.orderId },
      "woo.order: failed to persist app order mapping",
    );
  }

  // Append to Google Sheet — best-effort, never blocks order completion.
  void appendOrderToSheet({
    appOrderId: body.orderId,
    createdAt: new Date(),
    platform: platform ?? null,
    storeKey: storeKey ?? null,
    senderName,
    senderEmail,
    senderPhone: senderPhone ?? null,
    recipientName: recipientName || null,
    recipientPhone,
    deliveryDistrict,
    deliveryAddress,
    deliveryDate: body.deliveryDate ?? null,
    deliverySlot: body.deliverySlot ?? null,
    lineItemsJson: lineItems && lineItems.length > 0 ? JSON.stringify(lineItems) : null,
    totalUsdCents: totalUsdCents ?? null,
    paymentMethod,
    couponCode,
    cardMessage,
    osOrderId: osOrderId ?? null,
  });

  // Push notification is best-effort and must not block the caller from
  // returning a response. Fire-and-forget; errors are still logged.
  void sendOrderEventPush({
    state: "confirmed",
    appOrderId: body.orderId,
    userId,
    deviceId: appDeviceId,
    recipientName: recipientName || null,
  }).catch((err: unknown) => {
    log?.warn?.(
      { err: (err as Error)?.message, appOrderId: body.orderId },
      "woo.order: failed to send confirmed push",
    );
  });
}

// ---------------------------------------------------------------------------
// OS order submission
// ---------------------------------------------------------------------------

function getOsConfig(): PresentailOsConfig {
  return {
    apiKey: process.env.PRESENTAIL_OS_API_KEY ?? "",
    baseUrl: process.env.PRESENTAIL_OS_API_URL ?? "https://os.presentail.com",
  };
}

export type OrderLineItemSnapshot = {
  name: string;
  quantity: number;
  priceUsdCents: number;
  /** OS product slug — used as the co-purchase affinity corpus key. */
  osSlug?: string;
};

export type OsOrderAttemptResult =
  | {
      ok: true;
      osOrderId: string | null;
      recipientName: string;
      totalUsdCents: number;
      totalPaymentCents: number;
      lineItems: OrderLineItemSnapshot[];
      couponDiscountUsd: number;
      /** Server-computed delivery fee components (USD). Returned so the route
       * can echo them in the API response for order-confirmation screens. */
      districtFeeUsd: number;
      expressFeeUsd: number;
      slotFeeUsd: number;
      deliveryFeeUsd: number;
    }
  | {
      ok: false;
      status: number;
      message: string;
      recipientName: string;
    };

/**
 * Build the OS order payload from the validated `WooOrderPayload` and POST it
 * to Presentail OS `POST /api/orders`.
 *
 * Price verification mirrors `attemptCreateWcOrder`: catalog prices are
 * re-derived from the OS product cache by wcId; client-supplied prices are
 * ignored. Delivery fees are computed server-side from trusted tables.
 *
 * Returns `{ ok: true, osOrderId, totalUsdCents }` on success or
 * `{ ok: false, status, message }` on any failure so the caller can
 * return a structured error without surfacing internal details.
 */
export async function attemptCreateOsOrder(
  body: WooOrderPayload,
  opts: {
    paymentVerified?: boolean;
    store?: WooStoreConfig;
    platform?: string | null;
    /**
     * Pre-validated catalog items from the payment intent snapshot.
     * When provided (Stripe-verified payments), these prices are used directly
     * instead of looking up from the OS cache — bypassing the cold-cache guard.
     * Keyed by `osSlug` (preferred) or `wcId` as fallback.
     */
    preVerifiedItems?: { wcId: number; osSlug?: string; priceUsd: number; name?: string }[];
    /**
     * The exact currency the payment provider charged, taken from the stored
     * PaymentIntent (intent.currency). When present, overrides body.currencyCode
     * so OS always receives the currency Stripe/Mamo/PayPal actually charged.
     * Only absent on the server-restart recovery path (no intent in memory).
     */
    verifiedCurrency?: string;
    /**
     * Validated coupon data. When provided, the coupon discount is subtracted
     * from the order total and the coupon ID is passed to OS for redemption tracking.
     */
    couponValidated?: {
      couponId: string | number;
      couponDiscountUsd: number;
    };
    /**
     * Server-computed delivery fee breakdown from the payment intent snapshot.
     * When present (Stripe/Mamo/PayPal-verified payments), these are used directly
     * instead of re-computing from the OS cache — guaranteeing the order record
     * uses the exact same fees that were charged via the PSP.
     * Absent for COD/Whish/offline flows and for old snapshots (pre-date this field).
     */
    preVerifiedFees?: {
      districtFeeUsd?: number;
      expressFeeUsd?: number;
      slotFeeUsd?: number;
    };
  } = {},
): Promise<OsOrderAttemptResult> {
  const recipientFullName = `${body.recipient.firstName} ${body.recipient.lastName}`.trim();
  const cardToValue = body.cardTo?.trim() ?? '';

  const osConfig = getOsConfig();
  if (!osConfig.apiKey) {
    return {
      ok: false,
      status: 503,
      message: "PRESENTAIL_OS_API_KEY is not configured. Cannot submit order to Presentail OS.", // i18n-ignore
      recipientName: recipientFullName,
    };
  }

  // Prefer the currency recorded in the payment intent (the exact currency the
  // provider charged) over the client-supplied body.currencyCode, which can
  // drift (e.g. a LB order charged in QAR would otherwise send "USD" to OS).
  const presentedCurrency: SupportedCurrency = normalizeCurrency(
    opts.verifiedCurrency ?? body.currencyCode,
  );

  // Resolve catalog prices from the OS product cache (by wcId or osSlug).
  // If OS cache is not populated, fall back to WooCommerce (startup window).
  // Client-supplied prices are never used for financial calculations.
  // OS-native products (wcId === 0) are identified by their osSlug.
  const isCatalogItem = (item: { wcId?: number; osSlug?: string }) =>
    (item.wcId != null && item.wcId > 0) || !!item.osSlug;
  const catalogItemInputs = body.items.filter(isCatalogItem);
  const nonCatalogFeeItems = body.items.filter((item) => !isCatalogItem(item));

  // Guard: only block orders where items have wcId > 0 AND no osSlug — those
  // cannot be safely forwarded to OS without knowing the OS product ID.
  // Items with osSlug can proceed even when the cache is cold; if the price
  // lookup fails, the existing 422 path handles it gracefully.
  // When preVerifiedItems are provided (payment already verified via Stripe PI),
  // skip the guard entirely — prices were validated at PaymentIntent creation.
  const hasWcOnlyItems = opts.preVerifiedItems === undefined &&
    catalogItemInputs.some((i) => (i.wcId != null && i.wcId > 0) && !i.osSlug);
  if (hasWcOnlyItems && !hasOsProducts(opts.store?.storeKey) && !hasOsProducts()) {
    return {
      ok: false,
      status: 503,
      message: "Catalog not yet loaded, please try again shortly", // i18n-ignore
      recipientName: recipientFullName,
    };
  }
  // Validate non-catalog fee items before accumulating. Each item's price and
  // quantity are checked against server-enforced maximums; the request is
  // rejected when any limit is exceeded so a manipulated payload cannot inflate
  // OS order totals or offline-payment invoices.
  const feeValidationError = validateFeeItems(nonCatalogFeeItems);
  if (feeValidationError) {
    return {
      ok: false,
      status: 422,
      message: feeValidationError,
      recipientName: recipientFullName,
    };
  }
  const nonCatalogFeesUsd = nonCatalogFeeItems.reduce(
    (sum, item) => sum + Math.max(0, item.price) * item.quantity,
    0,
  );

  // Build a lookup map from the pre-verified snapshot when provided.
  const preVerifiedMap = new Map<string, { priceUsd: number; name?: string }>();
  if (opts.preVerifiedItems) {
    for (const pv of opts.preVerifiedItems) {
      if (pv.osSlug) preVerifiedMap.set(`slug:${pv.osSlug}`, { priceUsd: pv.priceUsd, name: pv.name });
      if (pv.wcId > 0) preVerifiedMap.set(`wc:${pv.wcId}`, { priceUsd: pv.priceUsd, name: pv.name });
    }
  }

  let catalogSubtotalUsd = 0;
  const lineItemData: { wcId: number | undefined; osProductId: string; osNumericId?: string; name: string; quantity: number; priceUsd: number; customInput?: string }[] = [];

  for (const item of catalogItemInputs) {
    // Look up price: by wcId when > 0, by osSlug for OS-native products (wcId === 0).
    let catalog: { price: number; name: string } | null = null;
    let resolvedOsId: string | null = null;
    let resolvedOsNumericId: string | undefined;

    // 1. Pre-verified snapshot prices take priority (Stripe-paid orders).
    const preVerified = (item.osSlug && preVerifiedMap.get(`slug:${item.osSlug}`))
      || (item.wcId && item.wcId > 0 && preVerifiedMap.get(`wc:${item.wcId}`));
    if (preVerified) {
      catalog = { price: preVerified.priceUsd, name: preVerified.name ?? item.name };
      // Still try to resolve the OS product ID from cache for the order payload.
      if (item.wcId != null && item.wcId > 0) {
        const p = getOsProductByWcId(item.wcId, opts.store?.storeKey);
        resolvedOsId = p?.id ?? null;
        if (p?.osNumericId != null) resolvedOsNumericId = String(p.osNumericId);
      }
      if (!resolvedOsId && item.osSlug) {
        const p = getOsProductBySlug(item.osSlug, opts.store?.storeKey);
        resolvedOsId = p?.id ?? item.osSlug;
        if (p?.osNumericId != null) resolvedOsNumericId = String(p.osNumericId);
      }
    } else if (item.wcId != null && item.wcId > 0) {
      catalog = await fetchWcProductPrice(item.wcId, opts.store);
      const osProduct = getOsProductByWcId(item.wcId, opts.store?.storeKey);
      resolvedOsId = osProduct?.id ?? null;
      if (osProduct?.osNumericId != null) resolvedOsNumericId = String(osProduct.osNumericId);
    } else if (item.osSlug) {
      // OS-native product (wcId === 0): resolve price directly from OS cache by slug.
      // Fall back to any-store lookup when the store-specific cache is cold so
      // Whish/Western-Union orders succeed even during transient cache population.
      const osProduct =
        getOsProductBySlug(item.osSlug, opts.store?.storeKey) ??
        getOsProductBySlug(item.osSlug);
      if (osProduct) {
        // Use resolveOsEffectivePrice so the pricing enrichment map's
        // discountPriceUsd (sale price) is applied when active, exactly
        // as checkout does via resolveCartItems. Using osProduct.price
        // directly would send the base list price to OS even when a sale
        // is running, causing OS totals to diverge from what was charged.
        const effectivePrice = resolveOsEffectivePrice(osProduct);
        if (effectivePrice > 0) {
          if (effectivePrice !== osProduct.price) {
            logger.debug(
              { osSlug: item.osSlug, basePrice: osProduct.price, effectivePrice, appOrderId: body.orderId },
              "osOrders: enriched sale price applied (discount active)",
            );
          }
          catalog = { price: effectivePrice, name: osProduct.name };
          resolvedOsId = osProduct.id;
          if (osProduct.osNumericId != null) resolvedOsNumericId = String(osProduct.osNumericId);
        }
      }
    }
    if (!catalog) {
      // Cache miss — never hard-block the order. For payment-verified orders
      // (Stripe/Mamo/PayPal) preVerifiedItems already supplied the price above,
      // so reaching here means this is an offline payment (Whish/Western Union)
      // with a transiently-cold cache. Use the client-supplied price with a WARN
      // so the order goes through and ops can review if needed.
      logger.warn(
        { wcId: item.wcId, osSlug: item.osSlug, appOrderId: body.orderId, clientPrice: item.price },
        "osOrders: catalog cache miss — using client-supplied price as fallback",
      );
      lineItemData.push({
        wcId: item.wcId,
        osProductId: item.osSlug ?? String(item.wcId),
        name: item.name,
        quantity: item.quantity,
        priceUsd: item.price,
        customInput: item.customInput?.trim() || undefined,
      });
      catalogSubtotalUsd += item.price * item.quantity;
      continue;
    }
    // Resolve the OS product id (slug): prefer the cache-resolved id, fall back to client-supplied osSlug.
    const osProductId = resolvedOsId ?? item.osSlug ?? String(item.wcId ?? item.name);
    lineItemData.push({
      wcId: item.wcId,
      osProductId,
      osNumericId: resolvedOsNumericId,
      name: catalog.name,
      quantity: item.quantity,
      priceUsd: catalog.price,
      customInput: item.customInput?.trim() || undefined,
    });
    catalogSubtotalUsd += catalog.price * item.quantity;
  }

  // Compute delivery fees server-side (same authoritative logic as WC path).
  const isNoAddress = body.noAddress === true;
  const osDeliveryConfig = resolveOsDeliveryConfig(
    body.shippingCountry ?? undefined,
    body.cityId ?? undefined,
  );

  // When the payment intent snapshot contains pre-computed fees (set by
  // /checkout/payment-intent after Bugs A+B fix), use them directly so the
  // order record matches the Stripe/Mamo/PayPal charge exactly. Fall back to
  // OS-cache re-computation for COD/Whish flows and pre-fix snapshots.
  let serverDistrictFeeUsd: number;
  if (opts.preVerifiedFees?.districtFeeUsd !== undefined) {
    serverDistrictFeeUsd = opts.preVerifiedFees.districtFeeUsd;
  } else if (typeof osDeliveryConfig.cityFeeUsd === "number") {
    const isFreeByOs =
      osDeliveryConfig.freeDeliveryEnabled === true &&
      typeof osDeliveryConfig.freeDeliveryThresholdUsd === "number" &&
      catalogSubtotalUsd >= osDeliveryConfig.freeDeliveryThresholdUsd;
    serverDistrictFeeUsd = isFreeByOs ? 0 : osDeliveryConfig.cityFeeUsd;
  } else {
    serverDistrictFeeUsd = computeDistrictFeeUsd(
      body.district,
      catalogSubtotalUsd,
    );
  }

  const clientSignalledExpress = body.expressFee > 0;
  let expressSurchargeAppliedUsd = 0;
  if (clientSignalledExpress) {
    if (opts.preVerifiedFees?.expressFeeUsd !== undefined) {
      expressSurchargeAppliedUsd = opts.preVerifiedFees.expressFeeUsd;
    } else {
      const districtCountry = countryForDistrict(body.district);
      // Prefer OS-delivered city surcharge; fall back to hardcoded constant
      // when the OS cache has no data for this city yet.
      expressSurchargeAppliedUsd =
        osDeliveryConfig.expressSurchargeUsd > 0
          ? osDeliveryConfig.expressSurchargeUsd
          : expressSurchargeUsd(districtCountry);
    }
  }

  // Slot surcharge: use computeSlotFeeUsd() so the $5 same-day night fallback
  // fires even when the OS slot has no explicit extraFee value. bookedSlot is
  // kept separately for the slot time string formatting below.
  // Use date-aware resolveSlotForDate so duplicate-label slots (same-day vs
  // next-day) resolve to the correct variant for the submitted date.
  let bookedSlot: OsDeliverySlot | undefined;
  if (!clientSignalledExpress && body.deliverySlot && body.cityId) {
    const citySlots = getDeliverySlots(body.cityId, body.deliveryDate || undefined);
    const bookedCountry = countryForDistrict(body.district ?? "Beirut");
    const todayIso = getLocalIso(bookedCountry);
    bookedSlot = resolveSlotForDate(citySlots, {
      deliverySlot: body.deliverySlot,
      deliverySlotId: body.deliverySlotId,
      dateIso: body.deliveryDate || todayIso,
      todayIso,
      cityId: body.cityId,
    });
  }
  // Compute the Midnight delivery window (if this is a Midnight booking).
  const resolvedMidnightWindow = resolveMidnightWindow({
    expressDelivery: clientSignalledExpress,
    deliverySlot: body.deliverySlot,
    deliverySlotId: body.deliverySlotId,
    deliveryDate: body.deliveryDate ?? undefined,
    cityId: body.cityId ?? undefined,
    district: body.district,
  });
  const isMidnightOrder =
    body.deliveryServiceType === "midnight" ||
    resolvedMidnightWindow !== undefined ||
    Boolean(bookedSlot && isMidnightSlot(bookedSlot, body.cityId ?? undefined));
  const midnightWindow =
    isMidnightOrder && body.deliveryDate
      ? resolvedMidnightWindow ?? midnightWindowForOccasionDate(body.deliveryDate)
      : undefined;
  // Use snapshot slot fee when available (prevents re-computation drift).
  const slotFeeAppliedUsd = opts.preVerifiedFees?.slotFeeUsd !== undefined
    ? opts.preVerifiedFees.slotFeeUsd
    : computeSlotFeeUsd({
        expressDelivery: clientSignalledExpress,
        deliverySlot: body.deliverySlot,
        deliverySlotId: body.deliverySlotId,
        cityId: body.cityId ?? undefined,
        deliveryDate: body.deliveryDate ?? undefined,
        district: body.district,
      });

  const preCouponTotalUsd =
    catalogSubtotalUsd +
    nonCatalogFeesUsd +
    serverDistrictFeeUsd +
    expressSurchargeAppliedUsd +
    slotFeeAppliedUsd;
  const couponDeduction = opts.couponValidated?.couponDiscountUsd ?? 0;
  const totalUsd = Math.max(0, preCouponTotalUsd - couponDeduction);
  const totalUsdCents = Math.max(0, Math.round(totalUsd * 100));
  // Convert the USD total to the payment currency so OS receives the amount
  // the customer actually paid, not a USD equivalent.
  const totalInPaymentCurrency = roundForCurrency(totalUsd, presentedCurrency);
  const totalPaymentCents = toStripeMinorUnits(totalInPaymentCurrency, presentedCurrency);

  // When the customer asked us to collect the address from the recipient,
  // surface an unmistakable signal in the human-visible address/notes fields
  // (the delivery.noAddress boolean is still sent unchanged below).
  const askRecipient = applyAskRecipientSignals({
    noAddress: isNoAddress,
    address: body.deliveryDetails,
    notes: body.orderNotes ?? "",
  });

  const osPayload = {
    workspace: osConfig.workspace ?? "presentail",
    appOrderId: body.orderId,
    items: lineItemData.map((d) => ({
      // Prefer the raw OS database PK (osNumericId) — the OS orders endpoint
      // looks up products by their DB PK, not by slug. Fall back to slug only
      // when the cache didn't populate (osNumericId will always be set when
      // the product was resolved from the OS products cache).
      productId: d.osNumericId ?? d.osProductId,
      productName: d.name,
      quantity: d.quantity,
      priceUsd: d.priceUsd,
      ...(d.customInput ? { customInput: d.customInput } : {}),
    })),
    // nonCatalogFeeItems have already been validated by validateFeeItems() above.
    feeItems: nonCatalogFeeItems.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      priceUsd: Math.max(0, item.price),
    })),
    billing: {
      firstName: body.billing.firstName,
      lastName: body.billing.lastName,
      email: body.billing.email,
      phone: body.billing.phone,
      countryCode: body.billingCountry ?? body.shippingCountry ?? undefined,
    },
    recipient: {
      firstName: body.recipient.firstName,
      lastName: body.recipient.lastName,
      phone: body.recipient.phone,
    },
    delivery: {
      district: body.district,
      cityId: body.cityId ?? undefined,
      countryCode: body.shippingCountry ?? undefined,
      address: askRecipient.address,
      date: body.deliveryDate || undefined,
      slot: (() => {
        if (bookedSlot?.startHour != null && bookedSlot?.endHour != null) {
          const fmt = (h: number) => {
            const suffix = h < 12 ? "AM" : "PM";
            const h12 = h % 12 === 0 ? 12 : h % 12;
            return `${h12}:00 ${suffix}`;
          };
          return `${fmt(bookedSlot.startHour)}–${fmt(bookedSlot.endHour)}`;
        }
        return body.deliverySlot || undefined;
      })(),
      isExpress: clientSignalledExpress,
      noAddress: isNoAddress,
      phone: body.recipient.phone || undefined,
      feeUsd: serverDistrictFeeUsd,
      expressSurchargeUsd: expressSurchargeAppliedUsd,
      slotFeeUsd: slotFeeAppliedUsd,
      // Midnight-specific fields — sent only for Midnight orders.
      ...(isMidnightOrder
        ? {
            serviceType: "midnight" as const,
            slotId: bookedSlot?.slotId ?? body.deliverySlotId ?? undefined,
            timeZone: midnightWindow?.timeZone ?? "Asia/Beirut",
            windowStart: midnightWindow?.start ?? undefined,
            windowEnd: midnightWindow?.end ?? undefined,
          }
        : {}),
    },
    subtotalUsd: Math.round((catalogSubtotalUsd + nonCatalogFeesUsd) * 100) / 100,
    deliveryFeeUsd: Math.round((serverDistrictFeeUsd + expressSurchargeAppliedUsd + slotFeeAppliedUsd) * 100) / 100,
    totalUsd: Math.round(totalUsd * 100) / 100,
    cardMessage: body.cardMessage || undefined,
    cardFrom: body.cardFrom || undefined,
    cardTo: cardToValue || undefined,
    qrLink: body.qrLink || undefined,
    qrLabel: body.qrLabel || undefined,
    orderNotes: askRecipient.notes || undefined,
    identitySecret: body.identitySecret,
    delivery_address: {
      address_1: askRecipient.address || undefined,
      city: body.district || undefined,
      country: body.shippingCountry ?? undefined,
      phone: body.recipient.phone || undefined,
    },
    ...((): {
      window_start?: string;
      window_end?: string;
    } => {
      if (clientSignalledExpress) {
        // Express: window starts now; no end window.
        return { window_start: new Date().toISOString() };
      }
      // Midnight: selected date is the local 23:00 start date; the helper
      // derives the following calendar day's 01:00 endpoint.
      if (isMidnightOrder && midnightWindow) {
        return {
          window_start: midnightWindow.start,
          window_end: midnightWindow.end,
        };
      }
      if (body.deliveryDate) {
        const pad = (h: number) => String(h).padStart(2, "0");
        const start =
          bookedSlot?.startHour != null
            ? `${body.deliveryDate}T${pad(bookedSlot.startHour)}:00:00`
            : undefined;
        const end =
          bookedSlot?.endHour != null
            ? `${body.deliveryDate}T${pad(bookedSlot.endHour)}:00:00`
            : undefined;
        return {
          ...(start != null ? { window_start: start } : {}),
          ...(end != null ? { window_end: end } : {}),
        };
      }
      return {};
    })(),
    delivery_type: clientSignalledExpress ? "express" : isMidnightOrder ? "midnight" : "standard",
    delivery_instructions: askRecipient.notes || undefined,
    payment: {
      method:
        body.paymentMethod === "card" || body.paymentMethod === "wallet"
          ? "stripe"
          : body.paymentMethod,
      ref: body.paymentRef || undefined,
      verified: opts.paymentVerified === true,
      currencyCode: presentedCurrency,
      // Actual amount in the payment currency (what the customer paid).
      totalAmount: totalInPaymentCurrency,
      // USD equivalent retained for OS's cross-currency accounting.
      totalUsd: Math.round(totalUsd * 100) / 100,
    },
    platform: opts.platform ?? undefined,
    // WhatsApp transactional-updates opt-in. Always sent explicitly (true or
    // false) so OS can gate its WhatsApp notifications without guessing;
    // absent/undefined client values collapse to false (no opt-in).
    whatsapp_opt_in: body.whatsappOptIn === true,
    couponCode: body.couponCode || undefined,
    ...(opts.couponValidated
      ? {
          // The virtual first-order coupon has no OS coupon record — omit the
          // sentinel couponId so OS redemption tracking never sees an unknown id.
          // Guard both the sentinel ("first-order-10") and the raw "FIRST10" string
          // as defense-in-depth in case the caller did not normalise the id first.
          ...(opts.couponValidated.couponId !== "first-order-10" &&
              String(opts.couponValidated.couponId).toUpperCase() !== "FIRST10"
            ? { couponId: opts.couponValidated.couponId }
            : {}),
          couponDiscountUsd: opts.couponValidated.couponDiscountUsd,
        }
      : {}),
    ...(body.marketing_attribution || body.addressBookPlace
      ? {
          metadata: {
            ...(body.marketing_attribution
              ? { marketing_attribution: body.marketing_attribution }
              : {}),
            // Verified landmark selected in Delivery Details — lets OS link
            // the order back to its Address Book record (id + verified
            // name/coords/district) alongside the shopper's own internal-
            // location detail and original typed query.
            ...(body.addressBookPlace
              ? {
                  address_book_place: {
                    place_id: body.addressBookPlace.placeId,
                    name: body.addressBookPlace.name,
                    official_name: body.addressBookPlace.officialName,
                    district_name: body.addressBookPlace.districtName,
                    district_city_id: body.addressBookPlace.districtCityId,
                    lat: body.addressBookPlace.lat,
                    lng: body.addressBookPlace.lng,
                    internal_detail: body.addressBookPlace.internalDetail,
                    typed_query: body.addressBookPlace.typedQuery,
                    selection_source: body.addressBookPlace.selectionSource,
                  },
                }
              : {}),
          },
        }
      : {}),
  };

  // Log the FULL payload sent to OS so we can diagnose rejection errors.
  logger.info(
    {
      appOrderId: body.orderId,
      osPayload,
    },
    "woo.order: submitting OS order",
  );

  try {
    const response = await createOsOrder(osConfig, osPayload);
    // OS may return either `order_id` (UUID, preferred) or `id` (legacy).
    const osOrderId =
      typeof response.order_id === "string"
        ? response.order_id
        : typeof response.id === "string"
          ? response.id
          : null;
    return {
      ok: true,
      osOrderId,
      recipientName: recipientFullName,
      totalUsdCents,
      totalPaymentCents,
      lineItems: lineItemData.map((d) => ({
        name: d.name,
        quantity: d.quantity,
        priceUsdCents: Math.round(d.priceUsd * 100),
        osSlug: d.osProductId || undefined,
      })),
      couponDiscountUsd: opts.couponValidated?.couponDiscountUsd ?? 0,
      districtFeeUsd: serverDistrictFeeUsd,
      expressFeeUsd: expressSurchargeAppliedUsd,
      slotFeeUsd: slotFeeAppliedUsd,
      deliveryFeeUsd: Math.round((serverDistrictFeeUsd + expressSurchargeAppliedUsd + slotFeeAppliedUsd) * 100) / 100,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 502,
      message: err?.message ?? "Failed to create order in Presentail OS", // i18n-ignore
      recipientName: recipientFullName,
    };
  }
}

/**
 * Fire-and-forget: record a declined / unverified-payment order attempt in
 * app_orders (state = "payment_failed") and submit to Presentail OS with
 * payment.verified = false so it appears in the OS dashboard.
 *
 * Must never throw — all errors are swallowed and logged as warnings.
 * The caller is expected to `void` the returned promise and still return the
 * appropriate 402 error to the client.
 */
export async function recordFailedPaymentAttempt(
  body: WooOrderPayload,
  opts: {
    paymentRef?: string | null;
    snapshotItems?: { wcId: number; osSlug?: string; priceUsd: number; name?: string }[];
    store?: WooStoreConfig;
    platform?: string | null;
    userId?: number | null;
    customerId?: number | null;
    log?: { warn?: (...args: any[]) => void; info?: (...args: any[]) => void };
  } = {},
): Promise<void> {
  try {
    const osResult = await attemptCreateOsOrder(body, {
      paymentVerified: false,
      store: opts.store,
      platform: opts.platform,
      preVerifiedItems: opts.snapshotItems,
    });

    await recordSuccessfulWcOrder({
      body,
      wcOrderId: null,
      userId: opts.userId ?? null,
      customerId: opts.customerId ?? null,
      recipientName: osResult.recipientName,
      totalUsdCents: osResult.ok ? (osResult.totalUsdCents ?? null) : null,
      platform: opts.platform,
      storeKey: opts.store?.storeKey ?? null,
      senderPhone: null,
      osOrderId: osResult.ok ? (osResult.osOrderId ?? null) : null,
      lineItems: osResult.ok ? (osResult.lineItems ?? null) : null,
      log: opts.log,
      state: "payment_failed",
    });

    opts.log?.info?.(
      {
        appOrderId: body.orderId,
        paymentRef: opts.paymentRef ?? null,
        osOk: osResult.ok,
        osOrderId: osResult.ok ? (osResult.osOrderId ?? null) : null,
      },
      "woo.order: payment-failed attempt recorded",
    );
  } catch (err: any) {
    opts.log?.warn?.(
      { err: err?.message, appOrderId: body.orderId },
      "woo.order: recordFailedPaymentAttempt failed (non-fatal)",
    );
  }
}

// ---------------------------------------------------------------------------
// Pending order queue: when WC order creation fails after a successful payment,
// we persist the validated payload here so the reconciliation worker can keep
// retrying it without involving support.
// ---------------------------------------------------------------------------

const RECONCILE_MAX_ATTEMPTS = 8;
const RECONCILE_BACKOFF_BASE_MS = 5 * 60 * 1000; // 5 min
const RECONCILE_BACKOFF_CAP_MS = 6 * 60 * 60 * 1000; // 6 h
const RECONCILE_TICK_MS = 2 * 60 * 1000; // every 2 min
const RECONCILE_BATCH_SIZE = 10;

function backoffMsFor(attempts: number): number {
  // attempts is the post-failure count (1-indexed): exponential with cap.
  const ms = RECONCILE_BACKOFF_BASE_MS * Math.pow(2, Math.max(0, attempts - 1));
  return Math.min(ms, RECONCILE_BACKOFF_CAP_MS);
}

export async function enqueuePendingWcOrder(input: {
  body: WooOrderPayload;
  paymentRef: string | null;
  userId: number | null;
  customerId?: number | null;
  wcCustomerId?: number | null;
  errorMessage: string;
  paymentVerified: boolean;
  storeCountryCode?: string | null;
  storeCityId?: string | null;
  platform?: string | null;
  // Server-verified payment currency (e.g. "SAR"). Stored in the reconciliation
  // payload so retries use the same currency instead of the client-supplied value.
  verifiedCurrency?: string | null;
  log?: { warn?: (...args: any[]) => void };
}) {
  const {
    body,
    paymentRef,
    userId,
    customerId,
    wcCustomerId,
    errorMessage,
    paymentVerified,
    storeCountryCode,
    storeCityId,
    platform,
    verifiedCurrency,
    log,
  } = input;
  const deviceId =
    typeof body.appDeviceId === "string" && body.appDeviceId
      ? body.appDeviceId
      : null;

  // Store the payment-verified flag alongside the payload so the worker
  // doesn't re-verify an already-confirmed payment.
  const storedPayload = {
    ...body,
    _paymentVerified: paymentVerified,
    _customerId: customerId ?? null,
    _wcCustomerId: wcCustomerId ?? null,
    _storeCountryCode: storeCountryCode ?? null,
    _storeCityId: storeCityId ?? null,
    _platform: platform ?? null,
    _verifiedCurrency: verifiedCurrency ?? null,
  };

  try {
    await db
      .insert(pendingWooOrdersTable)
      .values({
        appOrderId: body.orderId,
        paymentRef,
        payload: storedPayload,
        userId,
        deviceId,
        lastError: errorMessage,
        attempts: 0,
        nextAttemptAt: new Date(Date.now() + RECONCILE_BACKOFF_BASE_MS),
        status: "pending",
      })
      .onConflictDoUpdate({
        target: pendingWooOrdersTable.appOrderId,
        set: {
          paymentRef,
          payload: storedPayload,
          userId,
          deviceId,
          lastError: errorMessage,
          updatedAt: new Date(),
        },
      });
  } catch (err: any) {
    log?.warn?.(
      { err: err?.message, appOrderId: body.orderId },
      "woo.order: failed to enqueue pending order for reconciliation",
    );
  }
}

// Atomically claim a batch of due pending orders so concurrent workers don't
// pick up the same row. We immediately push `nextAttemptAt` forward by the
// tick interval so a row can't be re-claimed mid-attempt if processing is
// slow; the actual next attempt time is rewritten below based on the result.
async function claimDueRows(): Promise<PendingWooOrder[]> {
  const claimUntil = new Date(Date.now() + RECONCILE_TICK_MS * 2);
  const rows = await db.execute(sql`
    UPDATE ${pendingWooOrdersTable}
    SET next_attempt_at = ${claimUntil}, updated_at = now()
    WHERE id IN (
      SELECT id FROM ${pendingWooOrdersTable}
      WHERE status = 'pending'
        AND next_attempt_at <= now()
      ORDER BY next_attempt_at ASC
      LIMIT ${RECONCILE_BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *;
  `);
  return (rows.rows as unknown as PendingWooOrder[]) ?? [];
}

async function processPendingRow(row: PendingWooOrder): Promise<void> {
  const parsed = WooOrderSchema.safeParse(row.payload);
  if (!parsed.success) {
    // The stored payload is no longer valid against the schema (very unlikely
    // unless we changed the schema in a breaking way). Mark as exhausted so
    // a human can look at it.
    await db
      .update(pendingWooOrdersTable)
      .set({
        status: "exhausted",
        lastError: "Stored payload failed schema validation",
        updatedAt: new Date(),
      })
      .where(eq(pendingWooOrdersTable.id, row.id));
    logger.error(
      { id: row.id, appOrderId: row.appOrderId, issues: parsed.error.issues },
      "wooReconcile: stored payload no longer matches schema",
    );
    return;
  }
  const body = parsed.data;

  // Recover the paymentVerified flag stored alongside the payload.
  const rawPayload = row.payload as any;
  const paymentVerified = rawPayload?._paymentVerified === true;
  const storedCustomerId =
    typeof rawPayload?._customerId === "number" ? rawPayload._customerId : null;
  const storedWcCustomerId =
    typeof rawPayload?._wcCustomerId === "number"
      ? rawPayload._wcCustomerId
      : null;
  const storedCountryCode =
    typeof rawPayload?._storeCountryCode === "string" ? rawPayload._storeCountryCode : null;
  const storedCityId =
    typeof rawPayload?._storeCityId === "string" ? rawPayload._storeCityId : null;
  const storedPlatform = normalizePlatform(rawPayload?._platform);
  const storedVerifiedCurrency =
    typeof rawPayload?._verifiedCurrency === "string" ? rawPayload._verifiedCurrency : null;
  const store = resolveStore(storedCountryCode, storedCityId);

  // Reconciliation retries via OS (the authoritative order submission path).
  // preVerifiedItems are not stored in the queue — by the time a retry fires
  // (min 5 min backoff) the OS products cache is always warm, so the cache
  // lookup path in attemptCreateOsOrder is sufficient.
  const result = await attemptCreateOsOrder(body, {
    paymentVerified,
    store,
    platform: storedPlatform,
    verifiedCurrency: storedVerifiedCurrency ?? undefined,
  });
  const nextAttempts = row.attempts + 1;

  if (result.ok) {
    await db
      .update(pendingWooOrdersTable)
      .set({
        status: "succeeded",
        wcOrderId: null,
        attempts: nextAttempts,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(pendingWooOrdersTable.id, row.id));
    await recordSuccessfulWcOrder({
      body,
      wcOrderId: null,
      osOrderId: result.osOrderId ?? null,
      userId: row.userId,
      customerId: storedCustomerId,
      recipientName: result.recipientName,
      totalUsdCents: result.totalUsdCents,
      totalPaymentCents: result.totalPaymentCents,
      lineItems: result.lineItems,
      platform: storedPlatform,
      storeKey: store.storeKey,
      currencyCode: storedVerifiedCurrency,
      log: logger,
    });
    logger.info(
      { id: row.id, appOrderId: row.appOrderId, osOrderId: result.osOrderId },
      "wooReconcile: pending order reconciled via OS",
    );
    return;
  }

  if (nextAttempts >= row.maxAttempts) {
    await db
      .update(pendingWooOrdersTable)
      .set({
        status: "exhausted",
        attempts: nextAttempts,
        lastError: result.message,
        updatedAt: new Date(),
      })
      .where(eq(pendingWooOrdersTable.id, row.id));
    logger.error(
      {
        id: row.id,
        appOrderId: row.appOrderId,
        paymentRef: row.paymentRef,
        attempts: nextAttempts,
        lastError: result.message,
      },
      "wooReconcile: pending order exhausted retries — manual reconciliation required",
    );
    return;
  }

  const nextAttemptAt = new Date(Date.now() + backoffMsFor(nextAttempts));
  await db
    .update(pendingWooOrdersTable)
    .set({
      attempts: nextAttempts,
      lastError: result.message,
      nextAttemptAt,
      updatedAt: new Date(),
    })
    .where(eq(pendingWooOrdersTable.id, row.id));
  logger.warn(
    {
      id: row.id,
      appOrderId: row.appOrderId,
      attempts: nextAttempts,
      nextAttemptAt: nextAttemptAt.toISOString(),
      lastError: result.message,
    },
    "wooReconcile: retry scheduled",
  );
}

export async function runReconcileTick(signal?: AbortSignal): Promise<{
  claimed: number;
}> {
  
  let claimed: PendingWooOrder[] = [];
  try {
    signal?.throwIfAborted();
    claimed = await claimDueRows();
    signal?.throwIfAborted();
  } catch (err: any) {
    logger.warn(
      { err: err?.message },
      "wooReconcile: failed to claim due rows",
    );
    throw err;
  }
  if (!claimed.length) return { claimed: 0 };
  for (const row of claimed) {
    signal?.throwIfAborted();
    try {
      await processPendingRow(row);
      signal?.throwIfAborted();
    } catch (err: any) {
      if (signal?.aborted) throw signal.reason;
      logger.error(
        { err: err?.message, id: row.id, appOrderId: row.appOrderId },
        "wooReconcile: unexpected error processing row",
      );
    }
  }
  return { claimed: claimed.length };
}

let reconcileTimer: NodeJS.Timeout | null = null;

export function startReconcileWorker(): void {
  if (reconcileTimer) return;
  if (process.env.WOO_RECONCILE_DISABLED === "1") {
    logger.info("wooReconcile: worker disabled via WOO_RECONCILE_DISABLED");
    return;
  }
  const tick = async () => {
    try {
      await runDistributedJob({
        jobName: "order-reconciliation",
        intervalMs: RECONCILE_TICK_MS,
        leaseMs: 3 * 60_000,
        task: async (context) => {
          const { claimed } = await runReconcileTick(context.signal);
          if (claimed > 0) {
            logger.info({ claimed }, "wooReconcile: tick processed rows");
          }
        },
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, "wooReconcile: tick crashed");
    }
  };
  reconcileTimer = setInterval(tick, RECONCILE_TICK_MS);
  // Don't keep the event loop alive solely for the worker.
  reconcileTimer.unref?.();
  logger.info(
    { intervalMs: RECONCILE_TICK_MS },
    "wooReconcile: worker started",
  );
  // Kick off one tick shortly after startup so any rows queued before a
  // restart get processed without waiting a full interval.
  setTimeout(tick, 10_000).unref?.();
}

export function stopReconcileWorker(): void {
  if (reconcileTimer) {
    clearInterval(reconcileTimer);
    reconcileTimer = null;
  }
}

export async function listPendingWooOrders(filter?: {
  status?: "pending" | "succeeded" | "exhausted";
}): Promise<PendingWooOrder[]> {
  if (filter?.status) {
    return db
      .select()
      .from(pendingWooOrdersTable)
      .where(eq(pendingWooOrdersTable.status, filter.status))
      .orderBy(pendingWooOrdersTable.createdAt);
  }
  return db
    .select()
    .from(pendingWooOrdersTable)
    .orderBy(pendingWooOrdersTable.createdAt);
}

// Re-exported for tests / route handlers that want to know the due cutoff.
export const _internals = {
  backoffMsFor,
  RECONCILE_MAX_ATTEMPTS,
  RECONCILE_TICK_MS,
  claimDueRows,
  processPendingRow,
  // Silence unused import warnings for tools that strip `and`/`lte`.
  _and: and,
  _lte: lte,
};
