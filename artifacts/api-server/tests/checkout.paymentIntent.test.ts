// Tests for POST /checkout/payment-intent — the route that creates a Stripe
// PaymentIntent with server-resolved catalog prices and returns the clientSecret
// so the browser can confirm the card via stripe.confirmCardPayment().
//
// Security invariants verified here:
//   - Catalog prices come from the OS cache (resolveCartItems), not the client.
//   - STRIPE_SECRET_KEY must be present; requests are rejected otherwise.
//   - Invalid / empty inputs are rejected before Stripe is ever called.
//   - A PaymentIntent (paymentRef) can only be used to create one order:
//     a second submission with the same paymentRef is rejected with 402.

import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Mock the entire catalog module — resolveCartItems is the critical price-
// resolution step; we supply controlled outputs so price-security assertions
// are exact and hermetic.
vi.mock("../src/lib/catalog", () => ({
  resolveCartItems: vi.fn(),
  verifyStripePayment: vi.fn().mockResolvedValue(false),
  verifyStripePaymentIntentPaid: vi.fn().mockResolvedValue(false),
  verifyMamoPayment: vi.fn().mockResolvedValue(false),
  DISTRICT_FEES: {},
}));

vi.mock("../src/lib/fx", () => ({
  convertFromUsd: async (usd: number) => usd,
  normalizeCurrency: (v: unknown) =>
    typeof v === "string" && v.length === 3 ? v.toUpperCase() : "USD",
  toStripeMinorUnits: (amount: number) => Math.round(amount * 100),
}));

vi.mock("../src/lib/wooStore", () => ({
  resolveStoreFromRequest: vi.fn().mockReturnValue({ baseUrl: "https://store.example.com" }),
}));

// Stripe constructor mock — vi.hoisted so it is available before the checkout
// router is imported (which pulls in stripe at module load time).
const { mockStripeCreate, dbInsertChain, dbMock } = vi.hoisted(() => {
  const mockStripeCreate = vi.fn().mockResolvedValue({
    id: "pi_test_abc123",
    client_secret: "pi_test_abc123_secret_xyz",
    status: "requires_payment_method",
  });
  const dbInsertChain = {
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  };
  const dbMock = { insert: vi.fn().mockReturnValue(dbInsertChain) };
  return { mockStripeCreate, dbInsertChain, dbMock };
});

// The Stripe SDK exports a class (constructor). vi.fn().mockImplementation
// with an arrow function doesn't work for `new` calls because arrow functions
// are not constructors. We must use a regular `function` so that `this`
// is bound correctly when the route does `new Stripe(key)`.
vi.mock("stripe", () => ({
  default: vi.fn(function (this: Record<string, unknown>) {
    this.paymentIntents = { create: mockStripeCreate };
    this.checkout = { sessions: { create: vi.fn() } };
  }),
}));

// Mocks for modules consumed by the woo router (used in the replay-attack
// describe block below; harmless no-ops for the checkout-only tests above).
vi.mock("@workspace/db", () => ({
  db: dbMock,
  appOrdersTable: { appOrderId: "appOrderId" },
  pushTokensTable: {},
}));

vi.mock("../src/lib/customers", () => ({
  upsertCustomer: vi.fn().mockResolvedValue({
    customer: { id: 7, wcCustomerId: 777, email: "jane@example.com" },
    created: false,
  }),
  syncCustomerToWoo: vi.fn().mockResolvedValue(777),
  getCustomerByWcId: vi.fn().mockResolvedValue(null),
}));

vi.mock("../src/lib/auth", () => ({
  authenticate: vi.fn().mockResolvedValue({ ok: false }),
}));

vi.mock("../src/lib/orderEvents", () => ({
  sendOrderEventPush: vi.fn().mockResolvedValue(undefined),
}));

// Use importOriginal so WooOrderSchema and other real exports remain intact;
// only attemptCreateOsOrder (the OS network call) needs stubbing.
vi.mock("../src/lib/wooOrders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/wooOrders")>();
  return {
    ...actual,
    attemptCreateOsOrder: vi.fn().mockResolvedValue({
      ok: true,
      osOrderId: "os-test-123",
      recipientName: "John Smith",
      totalUsdCents: 5000,
    }),
  };
});

vi.mock("../src/lib/loyalty", () => ({
  creditReferralRedemption: vi.fn().mockResolvedValue(undefined),
}));

// osProductsCache is imported by woo.ts for product/category lookups that
// happen after payment verification. Stub it so the module loads cleanly;
// the replay-attack tests never reach the catalog-lookup code paths.
vi.mock("../src/lib/osProductsCache", () => ({
  hasOsProducts: vi.fn().mockReturnValue(true),
  getOsProducts: vi.fn().mockReturnValue([]),
  getOsCategories: vi.fn().mockReturnValue([]),
  getOsBrands: vi.fn().mockReturnValue([]),
  getOsOccasions: vi.fn().mockReturnValue([]),
  getOsProductBySlug: vi.fn().mockReturnValue(null),
  getOsProductByWcId: vi.fn().mockReturnValue(null),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { resolveCartItems, verifyStripePaymentIntentPaid } from "../src/lib/catalog";
import checkoutRouter from "../src/routes/checkout";
import wooRouter from "../src/routes/woo";
import { storePaymentIntent } from "../src/lib/checkoutIntents";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CATALOG_ITEM = {
  wcId: 99,
  quantity: 1,
  name: "Rose Bouquet",
  description: "Fresh red roses",
  image: null,
  priceUsd: 50,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let app: Express;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = "sk_test_route_key";

  vi.mocked(resolveCartItems).mockResolvedValue({
    ok: true,
    items: [CATALOG_ITEM],
    subtotalUsd: 50,
  } as any);

  app = express();
  app.use(express.json());
  app.use("/api", checkoutRouter);
});

afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /checkout/payment-intent", () => {
  it("creates a PaymentIntent and returns clientSecret (direct charge / no-3DS path)", async () => {
    const res = await request(app)
      .post("/api/checkout/payment-intent")
      .send({
        items: [{ wcId: 99, quantity: 1 }],
        orderId: "web-order-001",
        currency: "USD",
        email: "shopper@example.com",
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.clientSecret).toBe("pi_test_abc123_secret_xyz");
    expect(res.body.orderId).toBe("web-order-001");
  });

  it("calls Stripe with catalog-resolved amount in minor units, ignoring any client-supplied price", async () => {
    // The client passes `price: 0.01` but the server must use the catalog
    // price (50 USD = 5000 cents in minor units).
    await request(app)
      .post("/api/checkout/payment-intent")
      .send({
        items: [{ wcId: 99, quantity: 1, price: 0.01 }],
        orderId: "web-order-001",
      });

    expect(mockStripeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 5000, // 50 USD × 100 cents
        currency: "usd",
        metadata: expect.objectContaining({ orderId: "web-order-001" }),
      }),
    );
  });

  it("embeds orderId in PI metadata for replay-attack prevention", async () => {
    await request(app)
      .post("/api/checkout/payment-intent")
      .send({ items: [{ wcId: 99, quantity: 1 }], orderId: "web-order-999" });

    expect(mockStripeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ orderId: "web-order-999" }),
      }),
    );
  });

  it("returns 503 when STRIPE_SECRET_KEY is not configured", async () => {
    delete process.env.STRIPE_SECRET_KEY;

    const res = await request(app)
      .post("/api/checkout/payment-intent")
      .send({ items: [{ wcId: 99, quantity: 1 }], orderId: "web-order-001" });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("stripe_not_configured");
    expect(mockStripeCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when orderId is missing", async () => {
    const res = await request(app)
      .post("/api/checkout/payment-intent")
      .send({ items: [{ wcId: 99, quantity: 1 }] });

    expect(res.status).toBe(400);
    expect(mockStripeCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when items array is empty", async () => {
    const res = await request(app)
      .post("/api/checkout/payment-intent")
      .send({ items: [], orderId: "web-order-001" });

    expect(res.status).toBe(400);
    expect(mockStripeCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when an item has quantity less than 1", async () => {
    const res = await request(app)
      .post("/api/checkout/payment-intent")
      .send({ items: [{ wcId: 99, quantity: 0 }], orderId: "web-order-001" });

    expect(res.status).toBe(400);
    expect(mockStripeCreate).not.toHaveBeenCalled();
  });

  it("returns 422 when catalog lookup fails (product not found in OS cache)", async () => {
    vi.mocked(resolveCartItems).mockResolvedValue({
      ok: false,
      message: "Product 99 not found in catalog",
    } as any);

    const res = await request(app)
      .post("/api/checkout/payment-intent")
      .send({ items: [{ wcId: 99, quantity: 1 }], orderId: "web-order-001" });

    expect(res.status).toBe(422);
    expect(mockStripeCreate).not.toHaveBeenCalled();
  });

  it("returns 500 when Stripe API throws", async () => {
    mockStripeCreate.mockRejectedValueOnce(new Error("Stripe network timeout"));

    const res = await request(app)
      .post("/api/checkout/payment-intent")
      .send({ items: [{ wcId: 99, quantity: 1 }], orderId: "web-order-001" });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe("stripe_error");
  });

  it("multiplies price by quantity for multi-unit line items", async () => {
    vi.mocked(resolveCartItems).mockResolvedValue({
      ok: true,
      items: [{ ...CATALOG_ITEM, quantity: 3 }],
      subtotalUsd: 150,
    } as any);

    await request(app)
      .post("/api/checkout/payment-intent")
      .send({ items: [{ wcId: 99, quantity: 3 }], orderId: "web-order-002" });

    // 50 USD × 100 cents × 3 items = 15000 minor units
    expect(mockStripeCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 15000 }),
    );
  });
});

// ---------------------------------------------------------------------------
// Replay-attack prevention: single-use PaymentIntent enforcement
//
// The woo/order route calls consumePaymentIntent before verifyStripePaymentIntentPaid.
// consumePaymentIntent marks the intent as consumed on first use, so any
// subsequent submission with the same paymentRef is rejected immediately —
// even if Stripe still considers the PaymentIntent paid.
// ---------------------------------------------------------------------------

describe("Replay-attack prevention — POST /api/woo/order with a card paymentRef", () => {
  let wooApp: Express;

  // Minimal valid woo/order payload for a card payment.
  function orderPayload(paymentRef: string, orderId: string): Record<string, unknown> {
    return {
      orderId,
      paymentRef,
      paymentMethod: "card",
      items: [{ name: "Rose Bouquet", quantity: 1, price: 50, wcId: 99 }],
      billing: {
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@example.com",
        phone: "+961 70 000 000",
      },
      recipient: {
        firstName: "John",
        lastName: "Smith",
        phone: "+961 71 111 111",
      },
      district: "Beirut",
      districtFee: 8,
      expressFee: 0,
      deliveryDetails: "Main Street",
      deliveryDate: "2026-07-01",
      deliverySlot: "9:00 AM – 2:00 PM",
      appDeviceId: "device-replay-test",
    };
  }

  // Register a payment intent directly (mirrors what POST /checkout/payment-intent
  // does internally) so each test starts with a clean, unconsumed intent.
  function seedIntent(paymentRef: string, orderId: string): void {
    storePaymentIntent({
      orderId,
      paymentRef,
      provider: "stripe",
      totalUsd: 50,
      snapshot: {
        items: [{ wcId: 99, quantity: 1, priceUsd: 50 }],
        district: "Beirut",
        expressDelivery: false,
      },
    });
  }

  beforeEach(() => {
    wooApp = express();
    wooApp.use(express.json());
    wooApp.use("/api", wooRouter);
  });

  it("rejects a second order submission that reuses the same paymentRef (replay attack)", async () => {
    const orderId = "order-replay-001";
    const paymentRef = "pi_test_replay_aaa";

    seedIntent(paymentRef, orderId);

    // First submission: verifyStripePaymentIntentPaid returns true → order accepted.
    vi.mocked(verifyStripePaymentIntentPaid).mockResolvedValueOnce(true);
    const first = await request(wooApp)
      .post("/api/woo/order")
      .send(orderPayload(paymentRef, orderId));
    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);

    // Second submission with the identical paymentRef: the intent is already
    // consumed so consumePaymentIntent returns null and the route rejects
    // before ever reaching Stripe.
    const second = await request(wooApp)
      .post("/api/woo/order")
      .send(orderPayload(paymentRef, orderId));
    expect(second.status).toBe(402);
    expect(second.body.ok).toBe(false);
    expect(second.body.code).toBe("payment_intent_invalid");

    // verifyStripePaymentIntentPaid must NOT have been called on the replay —
    // consumePaymentIntent gates it and the route returns early.
    // The mock was called exactly once (for the first, legitimate submission).
    expect(vi.mocked(verifyStripePaymentIntentPaid)).toHaveBeenCalledTimes(1);
  });

  it("rejects a cross-order replay (paymentRef from order A submitted for order B)", async () => {
    const paymentRefA = "pi_test_replay_bbb";

    // Register the intent for order A only.
    seedIntent(paymentRefA, "order-A");

    // Attempt to use order A's paymentRef to submit order B.
    const res = await request(wooApp)
      .post("/api/woo/order")
      .send(orderPayload(paymentRefA, "order-B"));

    expect(res.status).toBe(402);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("payment_intent_invalid");

    // Stripe must not have been consulted — the orderId mismatch is caught
    // by consumePaymentIntent before any network call is made.
    expect(vi.mocked(verifyStripePaymentIntentPaid)).not.toHaveBeenCalled();
  });

  it("rejects a submission with an unknown paymentRef (no stored intent)", async () => {
    // No call to seedIntent — the paymentRef was never registered.
    const res = await request(wooApp)
      .post("/api/woo/order")
      .send(orderPayload("pi_test_unknown_ref", "order-unknown"));

    expect(res.status).toBe(402);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("payment_intent_invalid");
    expect(vi.mocked(verifyStripePaymentIntentPaid)).not.toHaveBeenCalled();
  });
});
