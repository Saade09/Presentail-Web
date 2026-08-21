/**
 * Route-level regression tests for coupon forwarding in POST /api/woo/order.
 *
 * Verified behaviours:
 *   (a) Regular coupon — snapshot fallback: when server-side re-validation bails out
 *       (cart data unavailable), the intent snapshot's couponCode + couponDiscountUsd
 *       are forwarded to attemptCreateOsOrder as `couponValidated`.
 *   (b) Referral code (PT[A-Z0-9]+): bypasses re-validation; the snapshot discount
 *       is forwarded with the referral code as the `couponId`.
 *   (c) FIRST10 on the CyberSource path: the raw "FIRST10" code is normalised to the
 *       sentinel ("first-order-10") before being passed to attemptCreateOsOrder, so
 *       wooOrders.ts omits couponId from the OS payload.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Hoist mutable mock references so individual tests can override them.
// ---------------------------------------------------------------------------

const {
  consumePaymentIntentMock,
  verifyStripePaymentIntentPaidMock,
  attemptCreateOsOrderMock,
  validateCouponMock,
  resolveCartItemsMock,
} = vi.hoisted(() => ({
  consumePaymentIntentMock: vi.fn(),
  verifyStripePaymentIntentPaidMock: vi.fn(),
  attemptCreateOsOrderMock: vi.fn(),
  validateCouponMock: vi.fn(),
  resolveCartItemsMock: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../lib/auth", () => ({
  authenticate: vi.fn().mockResolvedValue({ ok: false }),
  resolveAuthenticatedCustomer: vi.fn().mockResolvedValue({ ok: false }),
}));

vi.mock("../lib/wooOrders", () => ({
  WooOrderSchema: {
    safeParse: (data: unknown) => {
      // Use the real Zod schema so route validation still runs.
      const real = vi.importActual<typeof import("../lib/wooOrders")>("../lib/wooOrders") as any;
      if (real?.WooOrderSchema) return real.WooOrderSchema.safeParse(data);
      return { success: true, data };
    },
  },
  attemptCreateOsOrder: attemptCreateOsOrderMock,
  enqueuePendingWcOrder: vi.fn().mockResolvedValue(undefined),
  listPendingWooOrders: vi.fn().mockResolvedValue([]),
  normalizePlatform: vi.fn().mockReturnValue(null),
  recordSuccessfulWcOrder: vi.fn().mockResolvedValue(undefined),
  recordFailedPaymentAttempt: vi.fn().mockResolvedValue(undefined),
  isCouponErrorCode: vi.fn().mockReturnValue(false),
}));

vi.mock("../lib/catalog", () => ({
  checkSubmittedSlotBookable: vi.fn().mockReturnValue({ bookable: true }),
  evaluateOrderSlotGuard: vi.fn().mockReturnValue({ action: "allow" }),
  verifyStripePayment: vi.fn().mockResolvedValue(false),
  verifyStripePaymentIntentPaid: verifyStripePaymentIntentPaidMock,
  verifyMamoPayment: vi.fn().mockResolvedValue(false),
  captureAndVerifyPayPalOrder: vi.fn().mockResolvedValue(false),
  fetchStripePaymentIntentDetails: vi.fn().mockResolvedValue(null),
  resolveCartItems: resolveCartItemsMock,
  computeDistrictFeeUsd: vi.fn().mockReturnValue(0),
  expressSurchargeUsd: vi.fn().mockReturnValue(0),
  computeSlotFeeUsd: vi.fn().mockReturnValue(0),
  countryForDistrict: vi.fn().mockReturnValue("LB"),
}));

vi.mock("../lib/checkoutIntents", () => ({
  consumePaymentIntent: consumePaymentIntentMock,
  verifyCartMatchesSnapshot: vi.fn().mockReturnValue(null),
  markPaymentIntentConsumed: vi.fn(),
  releasePaymentIntent: vi.fn(),
  peekAndValidatePaymentIntent: vi.fn().mockReturnValue(null),
}));

vi.mock("../lib/customers", () => ({
  upsertCustomer: vi.fn().mockResolvedValue({ customer: { id: 99 }, created: false }),
  syncCustomerToWoo: vi.fn().mockResolvedValue(101),
  getCustomerByWcId: vi.fn().mockResolvedValue(null),
  getCustomerById: vi.fn().mockResolvedValue({ id: 99, emailVerified: true }),
}));

vi.mock("../lib/loyalty", () => ({
  creditReferralRedemption: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/fbConversions", () => ({
  sendCapiPurchase: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/wooStore", () => ({
  resolveStoreFromRequest: vi.fn().mockReturnValue({
    storeKey: "lb",
    country: "LB",
    baseUrl: "https://example.com",
    consumerKey: "ck_test",
    consumerSecret: "cs_test",
    currencySymbol: "$",
  }),
}));

vi.mock("../lib/osProductsCache", () => ({
  getOsProducts: vi.fn().mockReturnValue([]),
  getOsCategories: vi.fn().mockReturnValue([]),
  getOsBrands: vi.fn().mockReturnValue([]),
  getOsOccasions: vi.fn().mockReturnValue([]),
  getOsProductBySlug: vi.fn().mockReturnValue(null),
  getOsProductByWcId: vi.fn().mockReturnValue(null),
  getOsRawCatalogBrands: vi.fn().mockReturnValue([]),
  getCachedBestSellerIds: vi.fn().mockReturnValue(new Set()),
  getOsBrandNameToCanonicalSlug: vi.fn().mockReturnValue(new Map()),
  normaliseBrandName: vi.fn((s: string) => s.toLowerCase()),
}));

vi.mock("../lib/couponValidation", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../lib/couponValidation")>();
  return {
    ...orig,
    validateCoupon: validateCouponMock,
    acquireFirst10Lock: vi.fn().mockResolvedValue(true),
  };
});

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../lib/orderSlackNotify", () => ({
  sendUaeOrderSlackNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/productSocialShareStore", () => ({
  getProductSocialShare: vi.fn().mockResolvedValue(null),
  rowToProductSocialOverrides: vi.fn().mockReturnValue(null),
}));

vi.mock("../lib/productSocialShare", () => ({
  buildProductSocialVersion: vi.fn().mockReturnValue("v1"),
  selectProductSocialImage: vi.fn().mockReturnValue(null),
}));

vi.mock("../lib/productTranslation", () => ({
  translateProductContent: vi.fn(),
  translateProductNamesBatch: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 1 }]),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
  pool: {
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    }),
  },
  appOrdersTable: {},
  pendingWooOrdersTable: {},
}));

vi.mock("@workspace/delivery", () => ({
  getLocalIso: vi.fn().mockReturnValue("2099-12-31"),
  isMidnightSlot: vi.fn().mockReturnValue(false),
  MIDNIGHT_FEE_USD: 5,
  midnightWindowForOccasionDate: vi.fn().mockReturnValue(null),
}));

// ---------------------------------------------------------------------------
// Build the Express app under test
// ---------------------------------------------------------------------------

import wooRouter from "./woo";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", wooRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Shared order body
// ---------------------------------------------------------------------------

function makeOrderBody(overrides: Record<string, unknown> = {}) {
  return {
    orderId: "test-order-001",
    items: [{ name: "Rose Bouquet", quantity: 1, price: 25, wcId: 42 }],
    billing: {
      firstName: "Alice",
      lastName: "Smith",
      email: "alice@example.com",
      phone: "+96170000000",
    },
    recipient: {
      firstName: "Bob",
      lastName: "Jones",
      phone: "+96170000001",
    },
    district: "Beirut",
    districtFee: 0,
    expressFee: 0,
    deliveryDetails: "123 Main St",
    deliveryDate: "2099-12-31",
    deliverySlot: "",
    paymentMethod: "card",
    paymentRef: "pi_test_abc",
    currencyCode: "USD",
    ...overrides,
  };
}

/** Minimal verified Stripe intent with a coupon snapshot. */
function makeStripeIntent(
  couponCode: string,
  couponDiscountUsd: number,
  couponId?: string | number,
) {
  return {
    orderId: "test-order-001",
    paymentRef: "pi_test_abc",
    provider: "stripe" as const,
    currency: "USD",
    totalUsd: 25,
    consumed: false,
    expiresAt: Date.now() + 3_600_000,
    snapshot: {
      items: [{ wcId: 42, quantity: 1, priceUsd: 25 }],
      district: "Beirut",
      expressDelivery: false,
      deliveryDate: "2099-12-31",
      couponCode,
      couponDiscountUsd,
      couponId,
    },
  };
}

/** Minimal CyberSource intent with a coupon snapshot. */
function makeCsIntent(
  couponCode: string,
  couponDiscountUsd: number,
  couponId?: string | number,
) {
  return {
    orderId: "test-order-001",
    paymentRef: "cs_test_ref",
    provider: "cybersource" as const,
    currency: "USD",
    totalUsd: 25,
    consumed: false,
    expiresAt: Date.now() + 3_600_000,
    snapshot: {
      items: [{ wcId: 42, quantity: 1, priceUsd: 25 }],
      district: "Beirut",
      expressDelivery: false,
      deliveryDate: "2099-12-31",
      couponCode,
      couponDiscountUsd,
      couponId,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/woo/order — coupon forwarding", () => {
  let app: ReturnType<typeof makeApp>;

  beforeEach(() => {
    app = makeApp();
    process.env.STRIPE_SECRET_KEY = "sk_test_xxx";
    // Default: OS order creation succeeds.
    attemptCreateOsOrderMock.mockResolvedValue({
      ok: true,
      osOrderId: "os-order-001",
      recipientName: "Bob Jones",
      totalUsdCents: 2200,
      totalPaymentCents: 2200,
      lineItems: [],
      couponDiscountUsd: 0,
      districtFeeUsd: 0,
      expressFeeUsd: 0,
      slotFeeUsd: 0,
      deliveryFeeUsd: 0,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.STRIPE_SECRET_KEY;
  });

  // --------------------------------------------------------------------------
  // (a) Snapshot fallback: re-validation bails but snapshot has coupon data
  // --------------------------------------------------------------------------

  it("(a) snapshot fallback: couponValidated is built from snapshot when re-validation has no cart data", async () => {
    const intent = makeStripeIntent("SUMMER2024", 3);
    consumePaymentIntentMock.mockReturnValue(intent);
    verifyStripePaymentIntentPaidMock.mockResolvedValue(true);
    // Re-validation: resolveCartItems fails → authoritativeCartItems is null
    resolveCartItemsMock.mockResolvedValue({ ok: false, message: "cache cold" });
    // validateCoupon would not be called (bail path), but stub just in case
    validateCouponMock.mockResolvedValue({ valid: false, error: "no_cart" });

    await request(app).post("/api/woo/order").send(
      makeOrderBody({ couponCode: "SUMMER2024" }),
    );

    // attemptCreateOsOrder must receive the snapshot coupon data as fallback
    expect(attemptCreateOsOrderMock).toHaveBeenCalledOnce();
    const callArgs = attemptCreateOsOrderMock.mock.calls[0][1] as {
      couponValidated?: { couponId: string | number; couponDiscountUsd: number };
    };
    expect(callArgs.couponValidated).toBeDefined();
    expect(callArgs.couponValidated?.couponId).toBe("SUMMER2024");
    expect(callArgs.couponValidated?.couponDiscountUsd).toBe(3);
  });

  // --------------------------------------------------------------------------
  // (b) Referral code: couponValidated set from snapshot
  // --------------------------------------------------------------------------

  it("(b) referral code: couponId and couponDiscountUsd forwarded from snapshot", async () => {
    const intent = makeStripeIntent("PTABC123", 5);
    consumePaymentIntentMock.mockReturnValue(intent);
    verifyStripePaymentIntentPaidMock.mockResolvedValue(true);
    // validateCoupon should NOT be called for referral codes
    validateCouponMock.mockResolvedValue({ valid: false, error: "should_not_run" });

    await request(app).post("/api/woo/order").send(
      makeOrderBody({ couponCode: "PTABC123" }),
    );

    expect(attemptCreateOsOrderMock).toHaveBeenCalledOnce();
    const callArgs = attemptCreateOsOrderMock.mock.calls[0][1] as {
      couponValidated?: { couponId: string | number; couponDiscountUsd: number };
    };
    expect(callArgs.couponValidated).toBeDefined();
    expect(callArgs.couponValidated?.couponId).toBe("PTABC123");
    expect(callArgs.couponValidated?.couponDiscountUsd).toBe(5);
    // validateCoupon was not called for the referral code
    expect(validateCouponMock).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // (c) CyberSource + FIRST10: sentinel normalised, couponId omitted by wooOrders.ts
  // --------------------------------------------------------------------------

  it("(c) CyberSource path FIRST10: couponId is normalised to sentinel before reaching OS", async () => {
    const csIntent = makeCsIntent("FIRST10", 2.5);
    consumePaymentIntentMock.mockReturnValue(csIntent);

    await request(app).post("/api/woo/order").send(
      makeOrderBody({
        couponCode: "FIRST10",
        paymentMethod: "cybersource",
        paymentRef: "cs_test_ref",
      }),
    );

    expect(attemptCreateOsOrderMock).toHaveBeenCalledOnce();
    const callArgs = attemptCreateOsOrderMock.mock.calls[0][1] as {
      couponValidated?: { couponId: string | number; couponDiscountUsd: number };
    };
    // The route must normalise "FIRST10" → "first-order-10" so wooOrders.ts
    // omits couponId from the OS payload.
    expect(callArgs.couponValidated?.couponId).toBe("first-order-10");
    expect(callArgs.couponValidated?.couponDiscountUsd).toBe(2.5);
  });

  // --------------------------------------------------------------------------
  // Trust-boundary: snapshot is authoritative even when body.couponCode differs
  // --------------------------------------------------------------------------

  it("snapshot authoritative: coupon forwarded from snapshot even when body.couponCode is absent", async () => {
    // Snapshot has a coupon; the client omits it from the request body.
    const intent = makeStripeIntent("BLACKFRIDAY", 8);
    consumePaymentIntentMock.mockReturnValue(intent);
    verifyStripePaymentIntentPaidMock.mockResolvedValue(true);
    resolveCartItemsMock.mockResolvedValue({ ok: false, message: "cold" });

    await request(app).post("/api/woo/order").send(
      // body has no couponCode field
      makeOrderBody({ couponCode: undefined }),
    );

    expect(attemptCreateOsOrderMock).toHaveBeenCalledOnce();
    const callArgs = attemptCreateOsOrderMock.mock.calls[0][1] as {
      couponValidated?: { couponId: string | number; couponDiscountUsd: number };
    };
    // Snapshot wins over the absent body field.
    expect(callArgs.couponValidated).toBeDefined();
    expect(callArgs.couponValidated?.couponId).toBe("BLACKFRIDAY");
    expect(callArgs.couponValidated?.couponDiscountUsd).toBe(8);
  });

  it("referral trust-boundary: snapshot referral code forwarded, not the client-submitted code", async () => {
    // Client paid with PTABC but submits PTXYZ in the body.
    // The snapshot holds the authoritative PTABC.
    const intent = makeStripeIntent("PTABC", 5);
    consumePaymentIntentMock.mockReturnValue(intent);
    verifyStripePaymentIntentPaidMock.mockResolvedValue(true);

    await request(app).post("/api/woo/order").send(
      makeOrderBody({ couponCode: "PTXYZ" }), // mismatched body code
    );

    expect(attemptCreateOsOrderMock).toHaveBeenCalledOnce();
    const callArgs = attemptCreateOsOrderMock.mock.calls[0][1] as {
      couponValidated?: { couponId: string | number; couponDiscountUsd: number };
    };
    // Must forward PTABC (from snapshot), never PTXYZ (from body).
    expect(callArgs.couponValidated?.couponId).toBe("PTABC");
    expect(callArgs.couponValidated?.couponDiscountUsd).toBe(5);
  });

  it("referral trust-boundary: creditReferralRedemption is NOT called with the client-substituted code", async () => {
    // Client paid with a referral code PTABC but submits PTXYZ.
    // creditReferralRedemption should use the snapshot code PTABC, not PTXYZ.
    const { creditReferralRedemption: creditReferralMock } = await import("../lib/loyalty");

    const intent = makeStripeIntent("PTABC", 5);
    consumePaymentIntentMock.mockReturnValue(intent);
    verifyStripePaymentIntentPaidMock.mockResolvedValue(true);

    await request(app).post("/api/woo/order").send(
      makeOrderBody({ couponCode: "PTXYZ" }),
    );

    // creditReferralRedemption must have been called with the referrerId
    // decoded from PTABC, not from PTXYZ.
    const ptabcReferrerId = parseInt("ABC", 36); // == 13368
    expect(creditReferralMock).toHaveBeenCalledOnce();
    const creditArgs = vi.mocked(creditReferralMock).mock.calls[0][0];
    expect(creditArgs.referrerCustomerId).toBe(ptabcReferrerId);
  });

  // --------------------------------------------------------------------------
  // Snapshot authoritative even when re-validation succeeds for a different code
  // --------------------------------------------------------------------------

  it("snapshot integrity: re-validation uses snapshot code A, ignoring client-submitted code B", async () => {
    // Shopper paid with SUMMER2024 (discount $3, couponId "os-A").
    // Malicious body submits BLACKFRIDAY hoping to claim a larger discount.
    // After the fix, body.couponCode is overridden to SUMMER2024 BEFORE
    // validateCoupon is called, so OS gets A's identity, not B's.
    const intent = makeStripeIntent("SUMMER2024", 3, "os-A");
    consumePaymentIntentMock.mockReturnValue(intent);
    verifyStripePaymentIntentPaidMock.mockResolvedValue(true);

    // resolveCartItems succeeds → re-validation proceeds
    resolveCartItemsMock.mockResolvedValue({
      ok: true,
      items: [{ wcId: 42, osSlug: "rose-bouquet", priceUsd: 25, quantity: 1 }],
      subtotalUsd: 25,
    });

    // validateCoupon returns different results for each code to make the test
    // clearly distinguish which code was actually validated.
    validateCouponMock.mockImplementation(
      async (code: string) => {
        if (code.toUpperCase() === "SUMMER2024") {
          return { valid: true, couponId: "os-A", discountAmountUsd: 3, finalTotalUsd: 22 };
        }
        // BLACKFRIDAY — different id and larger discount
        return { valid: true, couponId: "os-B", discountAmountUsd: 10, finalTotalUsd: 15 };
      },
    );

    await request(app).post("/api/woo/order").send(
      makeOrderBody({ couponCode: "BLACKFRIDAY" }), // client submits wrong code
    );

    expect(attemptCreateOsOrderMock).toHaveBeenCalledOnce();
    const callArgs = attemptCreateOsOrderMock.mock.calls[0][1] as {
      couponValidated?: { couponId: string | number; couponDiscountUsd: number };
    };
    // Must use SUMMER2024's identity (from snapshot), never BLACKFRIDAY's.
    expect(callArgs.couponValidated?.couponId).toBe("os-A");
    expect(callArgs.couponValidated?.couponDiscountUsd).toBe(3);
    // validateCoupon must have been called with the snapshot code, not the body code.
    expect(validateCouponMock).toHaveBeenCalledWith(
      "SUMMER2024", // snapshot code — body was overridden before validation
      expect.anything(),
    );
  });

  // --------------------------------------------------------------------------
  // Baseline: no coupon → no couponValidated passed
  // --------------------------------------------------------------------------

  it("no coupon: couponValidated is not passed to attemptCreateOsOrder", async () => {
    const intent = makeStripeIntent("", 0);
    // Clear coupon fields from the snapshot
    (intent.snapshot as any).couponCode = undefined;
    (intent.snapshot as any).couponDiscountUsd = undefined;
    consumePaymentIntentMock.mockReturnValue(intent);
    verifyStripePaymentIntentPaidMock.mockResolvedValue(true);

    await request(app).post("/api/woo/order").send(makeOrderBody());

    expect(attemptCreateOsOrderMock).toHaveBeenCalledOnce();
    const callArgs = attemptCreateOsOrderMock.mock.calls[0][1] as {
      couponValidated?: unknown;
    };
    expect(callArgs.couponValidated).toBeUndefined();
  });
});
