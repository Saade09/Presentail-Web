/**
 * Route-level regression tests for zero-fee Express delivery via the
 * `expressDelivery: boolean` field.
 *
 * Before this fix:
 * - `expressDelivery` was stripped by Zod (not in schema).
 * - `isExpressSubmission` was derived solely from `expressFee > 0`.
 * - A zero-fee express order would be rejected with 400 ("delivery time slot
 *   required") because the slot guard treated it as a standard order.
 *
 * After this fix:
 * - `expressDelivery: true` survives schema parsing.
 * - `isExpressSubmission = expressFee > 0 || expressDelivery === true`
 *   so zero-fee express orders skip the slot guard.
 * - `submittedExpressDelivery` in all snapshot comparisons also uses the
 *   combined signal, so a Stripe-paid zero-fee express order passes cart
 *   mismatch validation when the snapshot recorded expressDelivery: true.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Hoist mutable mock references
// ---------------------------------------------------------------------------

const {
  consumePaymentIntentMock,
  verifyStripePaymentIntentPaidMock,
  verifyCartMatchesSnapshotMock,
  attemptCreateOsOrderMock,
} = vi.hoisted(() => ({
  consumePaymentIntentMock: vi.fn(),
  verifyStripePaymentIntentPaidMock: vi.fn(),
  verifyCartMatchesSnapshotMock: vi.fn(),
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
    safeParse: (data: unknown) => {
      // Use the real schema to verify expressDelivery survives parsing.
      const { WooOrderSchema: real } =
        vi.importActual<typeof import("../lib/wooOrders")>(
          "../lib/wooOrders",
        ) as any;
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
  checkSubmittedSlotBookable: vi.fn().mockReturnValue({ bookable: true }),
  evaluateOrderSlotGuard: vi.fn().mockReturnValue({ action: "allow" }),
  verifyStripePayment: vi.fn().mockResolvedValue(false),
  verifyStripePaymentIntentPaid: verifyStripePaymentIntentPaidMock,
  verifyMamoPayment: vi.fn().mockResolvedValue(false),
  captureAndVerifyPayPalOrder: vi.fn().mockResolvedValue(false),
  fetchStripePaymentIntentDetails: vi.fn().mockResolvedValue(null),
  resolveCartItems: vi.fn().mockResolvedValue({
    ok: true,
    items: [{ wcId: 42, osSlug: "rose-bouquet", priceUsd: 25, quantity: 1 }],
    subtotalUsd: 25,
  }),
  computeDistrictFeeUsd: vi.fn().mockReturnValue(0),
  expressSurchargeUsd: vi.fn().mockReturnValue(0),
  computeSlotFeeUsd: vi.fn().mockReturnValue(0),
  countryForDistrict: vi.fn().mockReturnValue(null),
}));

vi.mock("../lib/checkoutIntents", () => ({
  consumePaymentIntent: consumePaymentIntentMock,
  peekAndValidatePaymentIntent: vi.fn().mockReturnValue(null),
  markPaymentIntentConsumed: vi.fn(),
  releasePaymentIntent: vi.fn(),
  verifyCartMatchesSnapshot: verifyCartMatchesSnapshotMock,
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
    (_req as any).log = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    next();
  });
  app.use(wooRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Base payloads
// ---------------------------------------------------------------------------

/** Offline (western) express order with zero expressFee — relies solely on
 *  the expressDelivery boolean to signal express mode. */
const ZERO_FEE_EXPRESS_WESTERN = {
  orderId: "LB-EXPRESS-ZF-001",
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
  expressDelivery: true,
  deliverySlot: "", // empty — would normally trigger 400 for standard orders
  paymentMethod: "western",
  currencyCode: "USD",
};

/** Stripe-paid express order where the snapshot recorded expressDelivery:true
 *  but the client submitted expressFee:0 (waived fee). */
const ZERO_FEE_EXPRESS_STRIPE = {
  orderId: "LB-EXPRESS-ZF-002",
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
  expressDelivery: true,
  deliverySlot: "",
  paymentMethod: "card",
  paymentRef: "pi_test_express_zf_001",
  currencyCode: "USD",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /woo/order — zero-fee Express via expressDelivery boolean", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    vi.clearAllMocks();
    consumePaymentIntentMock.mockReturnValue(null);
    verifyStripePaymentIntentPaidMock.mockResolvedValue(false);
    verifyCartMatchesSnapshotMock.mockReturnValue(null); // no mismatch by default
    attemptCreateOsOrderMock.mockResolvedValue({
      ok: true,
      osOrderId: "os-order-express-zf",
      recipientName: "Bob Jones",
      totalUsdCents: 2500,
      totalPaymentCents: 2500,
      lineItems: [],
    });
  });

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });

  // ── Slot guard ────────────────────────────────────────────────────────────

  it("slot guard: zero-fee express order with empty deliverySlot is NOT rejected with 400", async () => {
    // expressDelivery:true + expressFee:0 → isExpressSubmission must be true
    // so the slot guard is skipped and the order proceeds (western = no payment check).
    const app = await buildApp();
    const res = await request(app)
      .post("/woo/order")
      .send(ZERO_FEE_EXPRESS_WESTERN);

    // Must NOT be 400 (the slot guard rejection). The order may succeed (200)
    // or fail for another reason (e.g. missing payment ref for western), but
    // "A delivery time slot is required" must not appear.
    expect(res.status).not.toBe(400);
    expect(res.body.message ?? "").not.toMatch(/delivery time slot/i);
  });

  it("slot guard: standard order with empty deliverySlot IS rejected with 400", async () => {
    // Baseline: without expressDelivery:true and no expressFee, slot is required.
    const app = await buildApp();
    const res = await request(app)
      .post("/woo/order")
      .send({ ...ZERO_FEE_EXPRESS_WESTERN, expressDelivery: false });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/delivery time slot/i);
  });

  // ── Snapshot verification ─────────────────────────────────────────────────

  it("snapshot check: zero-fee express body passes when snapshot recorded expressDelivery:true", async () => {
    // The Stripe intent snapshot recorded expressDelivery:true.
    // The submitted body has expressFee:0 + expressDelivery:true.
    // submittedExpressDelivery = false||true = true → matches snapshot → no mismatch.
    consumePaymentIntentMock.mockReturnValue({
      orderId: ZERO_FEE_EXPRESS_STRIPE.orderId,
      paymentRef: ZERO_FEE_EXPRESS_STRIPE.paymentRef,
      provider: "stripe",
      stripeAccount: "main",
      currency: "usd",
      totalUsd: 25,
      snapshot: {
        items: [{ wcId: 42, quantity: 1, priceUsd: 25 }],
        district: "Beirut",
        expressDelivery: true, // snapshot says express
        expressFeeUsd: 0,
      },
      expiresAt: Date.now() + 3_600_000,
      consumed: false,
    });
    verifyStripePaymentIntentPaidMock.mockResolvedValue(true);
    // The mock returns null (no mismatch) — but we also want to verify the
    // call received the correct submittedExpressDelivery value.
    verifyCartMatchesSnapshotMock.mockReturnValue(null);

    const app = await buildApp();
    const res = await request(app)
      .post("/woo/order")
      .send(ZERO_FEE_EXPRESS_STRIPE);

    // The call to verifyCartMatchesSnapshot must carry submittedExpressDelivery:true
    expect(verifyCartMatchesSnapshotMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ submittedExpressDelivery: true }),
    );
    // And the route must not return a 402 cart_mismatch.
    expect(res.body.code).not.toBe("cart_mismatch");
  });

  it("snapshot check: zero-fee non-express body correctly signals non-express to snapshot check", async () => {
    consumePaymentIntentMock.mockReturnValue({
      orderId: "LB-STD-001",
      paymentRef: "pi_std_001",
      provider: "stripe",
      stripeAccount: "main",
      currency: "usd",
      totalUsd: 25,
      snapshot: {
        items: [{ wcId: 42, quantity: 1, priceUsd: 25 }],
        district: "Beirut",
        expressDelivery: false,
      },
      expiresAt: Date.now() + 3_600_000,
      consumed: false,
    });
    verifyStripePaymentIntentPaidMock.mockResolvedValue(true);
    verifyCartMatchesSnapshotMock.mockReturnValue(null);

    const app = await buildApp();
    // Standard order: no expressDelivery flag, no expressFee, but has a slot
    const body = {
      ...ZERO_FEE_EXPRESS_STRIPE,
      orderId: "LB-STD-001",
      paymentRef: "pi_std_001",
      expressDelivery: false,
      expressFee: 0,
      deliverySlot: "2:00 PM–6:00 PM",
    };
    await request(app).post("/woo/order").send(body);

    expect(verifyCartMatchesSnapshotMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ submittedExpressDelivery: false }),
    );
  });
});
