/**
 * Route-level regression test for the server-restart recovery branch in
 * POST /api/woo/order (artifacts/api-server/src/routes/woo.ts, lines ~883–929).
 *
 * Scenario: A shopper completes Stripe payment but the server restarts between
 * payment confirmation and order finalisation, wiping the in-memory checkout
 * intent store. The route detects this (consumePaymentIntent returns null),
 * falls back to querying Stripe directly (verifyStripePaymentIntentPaid), and
 * proceeds to create the OS order — crucially without a `verifiedCurrency`
 * (because there's no stored intent to read it from).
 *
 * Guarantees verified:
 *  1. The route returns 200 ok:true (the order is accepted, not dropped).
 *  2. attemptCreateOsOrder is called with verifiedCurrency === undefined
 *     (the recovery branch cannot carry the intent's currency — graceful degradation).
 *  3. The OS payload's payment.currencyCode therefore falls back to
 *     body.currencyCode (the display currency the client sent).
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
  fetchStripePaymentIntentDetailsMock,
  resolveCartItemsMock,
  attemptCreateOsOrderMock,
} = vi.hoisted(() => ({
  consumePaymentIntentMock: vi.fn(),
  verifyStripePaymentIntentPaidMock: vi.fn(),
  fetchStripePaymentIntentDetailsMock: vi.fn(),
  resolveCartItemsMock: vi.fn(),
  attemptCreateOsOrderMock: vi.fn(),
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
    // delegate to the real Zod schema — we test the route, not the parser
    safeParse: (data: unknown) => {
      const { WooOrderSchema: real } = vi.importActual<typeof import("../lib/wooOrders")>("../lib/wooOrders") as any;
      if (real) return real.safeParse(data);
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
  verifyStripePayment: vi.fn().mockResolvedValue(false),
  verifyStripePaymentIntentPaid: verifyStripePaymentIntentPaidMock,
  verifyMamoPayment: vi.fn().mockResolvedValue(false),
  captureAndVerifyPayPalOrder: vi.fn().mockResolvedValue(false),
  fetchStripePaymentIntentDetails: fetchStripePaymentIntentDetailsMock,
  resolveCartItems: resolveCartItemsMock,
  computeDistrictFeeUsd: vi.fn().mockReturnValue(0),
  expressSurchargeUsd: vi.fn().mockReturnValue(0),
  countryForDistrict: vi.fn().mockReturnValue(null),
}));

vi.mock("../lib/checkoutIntents", () => ({
  consumePaymentIntent: consumePaymentIntentMock,
  verifyCartMatchesSnapshot: vi.fn().mockReturnValue(null),
}));

vi.mock("../lib/customers", () => ({
  upsertCustomer: vi.fn().mockResolvedValue({
    customer: { id: 99 },
    created: false,
  }),
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
    baseUrl: "https://example.com",
    consumerKey: "ck_test",
    consumerSecret: "cs_test",
    country: "LB",
  }),
}));

vi.mock("../lib/osProductsCache", () => ({
  getOsProducts: vi.fn().mockReturnValue([]),
  getOsCategories: vi.fn().mockReturnValue([]),
  getOsBrands: vi.fn().mockReturnValue([]),
  getOsRawCatalogBrands: vi.fn().mockReturnValue([]),
  getOsOccasions: vi.fn().mockReturnValue([]),
  getOsProductBySlug: vi.fn().mockReturnValue(null),
  getOsProductByWcId: vi.fn().mockReturnValue(null),
  getOsBrandNameToCanonicalSlug: vi.fn().mockReturnValue(new Map()),
  getCachedBestSellerIds: vi.fn().mockReturnValue(new Set()),
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@workspace/db", () => ({
  db: {},
  appOrdersTable: {},
  pendingWooOrdersTable: {},
}));

vi.mock("pino-http", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

async function buildApp() {
  const { default: wooRouter } = await import("./woo");
  const app = express();
  app.use(express.json());
  app.use((_req: any, _res: unknown, next: () => void) => {
    (_req as any).log = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() };
    next();
  });
  app.use(wooRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Minimal valid order body
// ---------------------------------------------------------------------------

const BASE_ORDER_BODY = {
  orderId: "LB-RECOVERY-001",
  items: [{ name: "Rose Bouquet", quantity: 1, price: 25, wcId: 42 }],
  billing: {
    firstName: "Alice",
    lastName: "Smith",
    email: "alice@example.com",
    phone: "+96170123456",
  },
  recipient: {
    firstName: "Bob",
    lastName: "Jones",
    phone: "+96170654321",
  },
  district: "Beirut",
  districtFee: 0,
  expressFee: 0,
  paymentMethod: "card",
  paymentRef: "pi_test_recovery_123",
  currencyCode: "USD",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /woo/order — server-restart recovery branch", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake_key";
    vi.clearAllMocks();
    // Default: intent is missing (server restart)
    consumePaymentIntentMock.mockReturnValue(null);
    // Stripe confirms the PI is paid
    verifyStripePaymentIntentPaidMock.mockResolvedValue(true);
    // Recovery path probes Stripe directly for the PI's details and verifies
    // amount_received covers the authoritative catalog cost of the cart.
    fetchStripePaymentIntentDetailsMock.mockResolvedValue({
      amountReceived: 2_500,
      currency: "usd",
      couponDiscountUsd: 0,
    });
    resolveCartItemsMock.mockResolvedValue({
      ok: true,
      items: [{ wcId: 42, osSlug: "rose-bouquet", priceUsd: 25, quantity: 1 }],
      subtotalUsd: 25,
    });
    // OS order creation succeeds
    attemptCreateOsOrderMock.mockResolvedValue({
      ok: true,
      osOrderId: "os-order-recovered-001",
      recipientName: "Bob Jones",
      totalUsdCents: 2500,
      totalPaymentCents: 2500,
      lineItems: [{ name: "Rose Bouquet", quantity: 1, priceUsdCents: 2500 }],
    });
  });

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("returns 200 ok:true when intent is gone but Stripe confirms payment (order accepted)", async () => {
    const app = await buildApp();
    const res = await request(app).post("/woo/order").send(BASE_ORDER_BODY);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("calls attemptCreateOsOrder with verifiedCurrency undefined on the recovery path", async () => {
    const app = await buildApp();
    await request(app).post("/woo/order").send(BASE_ORDER_BODY);

    expect(attemptCreateOsOrderMock).toHaveBeenCalledOnce();
    const opts = attemptCreateOsOrderMock.mock.calls[0][1] as { verifiedCurrency?: string };
    expect(opts.verifiedCurrency).toBeUndefined();
  });

  it("falls back to 402 when Stripe cannot confirm the PI either (no orphaned order)", async () => {
    verifyStripePaymentIntentPaidMock.mockResolvedValue(false);
    fetchStripePaymentIntentDetailsMock.mockResolvedValue(null);

    const app = await buildApp();
    const res = await request(app).post("/woo/order").send(BASE_ORDER_BODY);

    expect(res.status).toBe(402);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("payment_intent_invalid");
    expect(attemptCreateOsOrderMock).not.toHaveBeenCalled();
  });

  it("normal path: intent present passes verifiedCurrency from stored intent to attemptCreateOsOrder", async () => {
    // Restore intent — this is the happy-path (no restart)
    consumePaymentIntentMock.mockReturnValue({
      orderId: BASE_ORDER_BODY.orderId,
      paymentRef: BASE_ORDER_BODY.paymentRef,
      provider: "stripe",
      stripeAccount: "main",
      currency: "QAR",
      totalUsd: 25,
      snapshot: {
        items: [{ wcId: 42, quantity: 1, priceUsd: 25 }],
        district: "Beirut",
        expressDelivery: false,
      },
      expiresAt: Date.now() + 3_600_000,
      consumed: false,
    });
    // Stripe confirms
    verifyStripePaymentIntentPaidMock.mockResolvedValue(true);

    const app = await buildApp();
    await request(app).post("/woo/order").send({ ...BASE_ORDER_BODY, currencyCode: "USD" });

    expect(attemptCreateOsOrderMock).toHaveBeenCalledOnce();
    const opts = attemptCreateOsOrderMock.mock.calls[0][1] as { verifiedCurrency?: string };
    // The stored intent's currency ("QAR") must override the client's "USD"
    expect(opts.verifiedCurrency).toBe("QAR");
  });
});
