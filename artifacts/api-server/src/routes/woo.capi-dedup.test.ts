/**
 * Unit tests for the Meta CAPI Purchase deduplication guard in
 * POST /api/woo/order (artifacts/api-server/src/routes/woo.ts).
 *
 * Scenario: The order-event webhook (or a network retry) fires the order
 * endpoint more than once with the same orderId. The idempotency guard
 * atomically claims capiPurchaseSentAt = NOW() WHERE capiPurchaseSentAt IS
 * NULL. If 0 rows are returned the event was already sent and sendCapiPurchase
 * must be skipped.
 *
 * Guarantees verified:
 *  1. First call (NULL slot) → DB claim succeeds → sendCapiPurchase called.
 *  2. Second call (slot already taken) → DB claim returns [] → sendCapiPurchase
 *     NOT called (duplicate suppressed).
 *  3. eventId passed to sendCapiPurchase is deterministic: `fbpurchase-<orderId>`.
 *  4. A DB error in the claim does not block the order HTTP response (fire-and-forget).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Hoist mutable mock references
// ---------------------------------------------------------------------------

const {
  mockDbUpdate,
  sendCapiPurchaseMock,
  attemptCreateOsOrderMock,
  consumePaymentIntentMock,
  verifyStripePaymentIntentPaidMock,
  verifyCartMatchesSnapshotMock,
} = vi.hoisted(() => ({
  mockDbUpdate: vi.fn(),
  sendCapiPurchaseMock: vi.fn(),
  attemptCreateOsOrderMock: vi.fn(),
  consumePaymentIntentMock: vi.fn(),
  verifyStripePaymentIntentPaidMock: vi.fn(),
  verifyCartMatchesSnapshotMock: vi.fn(),
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
    safeParse: (data: unknown) => ({ success: true, data }),
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
  fetchStripePaymentIntentDetails: vi.fn().mockResolvedValue(null),
  resolveCartItems: vi.fn().mockResolvedValue({ ok: true, items: [], subtotalUsd: 30 }),
  computeDistrictFeeUsd: vi.fn().mockReturnValue(0),
  expressSurchargeUsd: vi.fn().mockReturnValue(0),
  countryForDistrict: vi.fn().mockReturnValue("LB"),
  verifyMamoPayment: vi.fn().mockResolvedValue(false),
  captureAndVerifyPayPalOrder: vi.fn().mockResolvedValue(false),
}));

vi.mock("../lib/checkoutIntents", () => ({
  consumePaymentIntent: consumePaymentIntentMock,
  verifyCartMatchesSnapshot: verifyCartMatchesSnapshotMock,
}));

vi.mock("../lib/customers", () => ({
  upsertCustomer: vi.fn().mockResolvedValue({ customer: { id: 99 }, created: false }),
  syncCustomerToWoo: vi.fn().mockResolvedValue(101),
  getCustomerByWcId: vi.fn().mockResolvedValue(null),
  getCustomerById: vi.fn().mockResolvedValue(null),
}));

vi.mock("../lib/loyalty", () => ({
  creditReferralRedemption: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/fbConversions", () => ({
  sendCapiPurchase: sendCapiPurchaseMock,
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
  getCachedBestSellerIds: vi.fn().mockReturnValue(new Set()),
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("pino-http", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("@workspace/db", () => ({
  db: { update: mockDbUpdate },
  appOrdersTable: {
    appOrderId: "app_order_id",
    capiPurchaseSentAt: "capi_purchase_sent_at",
    id: "id",
  },
  pendingWooOrdersTable: {},
}));

// ---------------------------------------------------------------------------
// DB update mock helpers
// ---------------------------------------------------------------------------

/**
 * Make the DB UPDATE claim succeed: returning([{ id: 1 }]) simulates the
 * row being claimed for the first time (capiPurchaseSentAt was NULL).
 */
function setupDbClaimSucceeds() {
  mockDbUpdate.mockReturnValue({
    set: () => ({
      where: () => ({
        returning: () => Promise.resolve([{ id: 1 }]),
      }),
    }),
  });
}

/**
 * Make the DB UPDATE claim fail: returning([]) simulates the row already
 * having capiPurchaseSentAt set (duplicate send attempt).
 */
function setupDbClaimAlreadyTaken() {
  mockDbUpdate.mockReturnValue({
    set: () => ({
      where: () => ({
        returning: () => Promise.resolve([]),
      }),
    }),
  });
}

// ---------------------------------------------------------------------------
// App factory — import once (vi.mock() hoisting applies globally)
// ---------------------------------------------------------------------------

let _app: ReturnType<typeof express> | null = null;

async function buildApp() {
  if (!_app) {
    const { default: wooRouter } = await import("./woo");
    _app = express();
    _app.use(express.json());
    _app.use((_req: any, _res: unknown, next: () => void) => {
      (_req as any).log = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() };
      next();
    });
    _app.use(wooRouter);
  }
  return _app;
}

// ---------------------------------------------------------------------------
// A valid stored intent that allows the happy path without the recovery branch.
// The intent is consumed by consumePaymentIntentMock and verifyCartMatchesSnapshot
// returns null (no mismatch), so we reach attemptCreateOsOrder and then CAPI.
// ---------------------------------------------------------------------------

const ORDER_ID = "LB-CAPI-DEDUP-001";
const PAYMENT_REF = "pi_test_capi_dedup_abc";

const VALID_INTENT = {
  orderId: ORDER_ID,
  paymentRef: PAYMENT_REF,
  provider: "stripe" as const,
  stripeAccount: "main" as const,
  currency: "USD",
  totalUsd: 30,
  snapshot: {
    items: [{ wcId: 0, osSlug: "bouquet-1", quantity: 1, priceUsd: 30 }],
    district: "Beirut",
    expressDelivery: false,
    noAddress: false,
    deliverySlot: "",
  },
  expiresAt: Date.now() + 3_600_000,
  consumed: false,
};

const BASE_ORDER_BODY = {
  orderId: ORDER_ID,
  items: [{ name: "Bouquet", quantity: 1, price: 30, wcId: 0, osSlug: "bouquet-1" }],
  billing: {
    firstName: "Dana",
    lastName: "Khalil",
    email: "dana@example.com",
    phone: "+96170000001",
  },
  recipient: {
    firstName: "Rami",
    lastName: "Aziz",
    phone: "+96170000002",
  },
  district: "Beirut",
  districtFee: 0,
  expressFee: 0,
  paymentMethod: "card",
  paymentRef: PAYMENT_REF,
  currencyCode: "USD",
  marketing_attribution: {
    source: "website",
    conversion: {
      source_url: "https://presentail.com/en-lb/beirut/checkout",
    },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /woo/order — CAPI Purchase deduplication guard", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake_key";
    vi.clearAllMocks();

    // Intent is present → happy path (no recovery branch).
    consumePaymentIntentMock.mockReturnValue({ ...VALID_INTENT });
    // Cart matches snapshot (no mismatch).
    verifyCartMatchesSnapshotMock.mockReturnValue(null);
    // Stripe confirms the PI.
    verifyStripePaymentIntentPaidMock.mockResolvedValue(true);

    // OS order creation always succeeds.
    attemptCreateOsOrderMock.mockResolvedValue({
      ok: true,
      osOrderId: "os-order-capi-001",
      recipientName: "Rami Aziz",
      totalUsdCents: 3000,
      totalPaymentCents: 3000,
      lineItems: [{ name: "Bouquet", quantity: 1, priceUsdCents: 3000 }],
    });

    // Default CAPI mock: resolves immediately.
    sendCapiPurchaseMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("calls sendCapiPurchase when the DB claim succeeds (capiPurchaseSentAt was NULL)", async () => {
    setupDbClaimSucceeds();
    const app = await buildApp();

    const res = await request(app).post("/woo/order").send(BASE_ORDER_BODY);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Allow the async void IIFE to settle.
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(sendCapiPurchaseMock).toHaveBeenCalledOnce();
  });

  it("does NOT call sendCapiPurchase when the DB claim returns [] (already sent)", async () => {
    setupDbClaimAlreadyTaken();
    const app = await buildApp();

    const res = await request(app).post("/woo/order").send(BASE_ORDER_BODY);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(sendCapiPurchaseMock).not.toHaveBeenCalled();
  });

  it("passes the deterministic fbpurchase-<orderId> eventId to sendCapiPurchase", async () => {
    setupDbClaimSucceeds();
    const app = await buildApp();

    await request(app).post("/woo/order").send(BASE_ORDER_BODY);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(sendCapiPurchaseMock).toHaveBeenCalledOnce();
    const callArgs = sendCapiPurchaseMock.mock.calls[0][0] as { eventId: string };
    expect(callArgs.eventId).toBe(`fbpurchase-${ORDER_ID}`);
  });

  it("passes the stored checkout URL to the Purchase event", async () => {
    setupDbClaimSucceeds();
    const app = await buildApp();

    await request(app).post("/woo/order").send(BASE_ORDER_BODY);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(sendCapiPurchaseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventSourceUrl: "https://presentail.com/en-lb/beirut/checkout",
      }),
    );
  });

  it("does not block the order response when the DB claim throws (fire-and-forget)", async () => {
    mockDbUpdate.mockReturnValue({
      set: () => ({
        where: () => ({
          returning: () => Promise.reject(new Error("DB connection lost")),
        }),
      }),
    });
    const app = await buildApp();

    const res = await request(app).post("/woo/order").send(BASE_ORDER_BODY);
    // The order HTTP response must still succeed — CAPI is fire-and-forget.
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Error is swallowed by the IIFE catch — sendCapiPurchase is not reached.
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(sendCapiPurchaseMock).not.toHaveBeenCalled();
  });
});
