// Unit tests for the PaymentIntent idempotency logic in
// POST /checkout/payment-intent (artifacts/api-server/src/routes/checkout.ts)
//
// Coverage:
//   (a) No prior PI for orderId → stripe.paymentIntents.create called once
//   (b) Prior PI exists with same amount/currency → create NOT called,
//       existing clientSecret returned
//   (c) Prior PI exists with different amount → stripe.paymentIntents.update
//       called, updated clientSecret returned

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoist Stripe mock internals so they are accessible across tests
// ---------------------------------------------------------------------------

const {
  createMock,
  retrieveMock,
  updateMock,
} = vi.hoisted(() => {
  const createMock = vi.fn();
  const retrieveMock = vi.fn();
  const updateMock = vi.fn();
  return { createMock, retrieveMock, updateMock };
});

vi.mock("stripe", () => {
  class MockStripe {
    paymentIntents = {
      create: createMock,
      retrieve: retrieveMock,
      update: updateMock,
    };
    customers = {
      create: vi.fn().mockResolvedValue({ id: "cus_test" }),
    };
    paymentMethods = {
      list: vi.fn().mockResolvedValue({ data: [] }),
    };
  }
  return { default: MockStripe };
});

// ---------------------------------------------------------------------------
// Catalog: always resolve to a single item worth $10 USD
// ---------------------------------------------------------------------------

vi.mock("../lib/catalog", () => ({
  resolveCartItems: vi.fn().mockResolvedValue({
    ok: true,
    subtotalUsd: 10,
    items: [{ wcId: 42, osSlug: undefined, quantity: 1, priceUsd: 10, name: "Rose", description: "", image: "" }],
  }),
}));

// ---------------------------------------------------------------------------
// FX: pass-through (1 USD = 1 unit of requested currency, minor units = cents)
// ---------------------------------------------------------------------------

vi.mock("../lib/fx", () => ({
  normalizeCurrency: (c: string) => (c ?? "USD").toUpperCase(),
  convertFromUsd: vi.fn().mockImplementation(async (usd: number) => usd),
  toStripeMinorUnits: vi.fn().mockImplementation((amount: number) => Math.round(amount * 100)),
}));

// ---------------------------------------------------------------------------
// Coupon validation: no coupon applied by default
// ---------------------------------------------------------------------------

vi.mock("../lib/couponValidation", () => ({
  validateCoupon: vi.fn().mockResolvedValue({ valid: false, discountAmountUsd: 0 }),
}));

// ---------------------------------------------------------------------------
// Store resolver: always return Lebanon
// ---------------------------------------------------------------------------

vi.mock("../lib/wooStore", () => ({
  resolveStoreFromRequest: vi.fn().mockReturnValue({ storeKey: "lebanon" }),
}));

// ---------------------------------------------------------------------------
// Auth: unauthenticated by default (guest checkout path)
// ---------------------------------------------------------------------------

vi.mock("../lib/auth", () => ({
  authenticate: vi.fn().mockResolvedValue({ ok: false, status: 401, message: "Unauthorized" }), // i18n-ignore
}));

// ---------------------------------------------------------------------------
// DB: not needed for guest checkout
// ---------------------------------------------------------------------------

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
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
  customersTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

// ---------------------------------------------------------------------------
// pino-http: suppress logger
// ---------------------------------------------------------------------------

vi.mock("pino-http", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ---------------------------------------------------------------------------
// Env: provide a fake Stripe key so the key guard passes
// ---------------------------------------------------------------------------

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_fake";
  createMock.mockReset();
  retrieveMock.mockReset();
  updateMock.mockReset();
});

afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
});

// ---------------------------------------------------------------------------
// Build a minimal Express app with only the checkout router mounted
// ---------------------------------------------------------------------------

import express from "express";
import request from "supertest";
import { getPaymentIntentForOrder, peekPaymentIntent } from "../lib/checkoutIntents";

async function buildApp() {
  const { default: checkoutRouter } = await import("./checkout");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).log = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
    next();
  });
  app.use(checkoutRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Shared request body — valid for all three test cases
// ---------------------------------------------------------------------------

const BASE_BODY = {
  orderId: "LB-TEST-001",
  items: [{ wcId: 42, quantity: 1 }],
  currency: "USD",
  deliveryFeeUsd: 0,
};

// ---------------------------------------------------------------------------
// Helpers to pre-seed the in-memory intent store between tests.
// We do this by calling the route once with a create mock, then resetting the
// create mock before the actual assertion call.
// ---------------------------------------------------------------------------

describe("POST /checkout/payment-intent — idempotency", () => {
  it("(a) no prior PI: calls stripe.paymentIntents.create once", async () => {
    createMock.mockResolvedValueOnce({
      id: "pi_new",
      client_secret: "pi_new_secret",
      status: "requires_payment_method",
      amount: 1000,
      currency: "usd",
    });

    const app = await buildApp();
    const res = await request(app)
      .post("/checkout/payment-intent")
      .send({ ...BASE_BODY, orderId: "LB-NO-PRIOR" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.clientSecret).toBe("pi_new_secret");
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(retrieveMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("(b) prior PI with same amount/currency: returns existing clientSecret without calling create, and refreshes the stored snapshot", async () => {
    const orderId = "LB-SAME-AMT";

    // First request — seeds the store
    createMock.mockResolvedValueOnce({
      id: "pi_existing",
      client_secret: "pi_existing_secret",
      status: "requires_payment_method",
      amount: 1000,
      currency: "usd",
    });
    const app = await buildApp();
    await request(app).post("/checkout/payment-intent").send({ ...BASE_BODY, orderId });

    // Verify the intent is stored after the first request.
    const firstRef = getPaymentIntentForOrder(orderId);
    expect(firstRef).toBe("pi_existing");
    const firstEntry = peekPaymentIntent("pi_existing");
    const firstExpiresAt = firstEntry?.expiresAt ?? 0;

    // Reset create so we can assert it isn't called on the second request.
    createMock.mockReset();
    retrieveMock.mockResolvedValueOnce({
      id: "pi_existing",
      client_secret: "pi_existing_secret",
      status: "requires_payment_method",
      amount: 1000,   // same as totalMinorUnits (10 USD × 100)
      currency: "usd",
    });

    // Advance time slightly so a refreshed TTL is distinguishable.
    await new Promise((r) => setTimeout(r, 5));

    const res = await request(app).post("/checkout/payment-intent").send({ ...BASE_BODY, orderId });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.clientSecret).toBe("pi_existing_secret");
    expect(createMock).not.toHaveBeenCalled();
    expect(retrieveMock).toHaveBeenCalledWith("pi_existing");
    expect(updateMock).not.toHaveBeenCalled();

    // The store entry should have been refreshed: same paymentRef, extended TTL.
    const secondRef = getPaymentIntentForOrder(orderId);
    expect(secondRef).toBe("pi_existing");
    const secondEntry = peekPaymentIntent("pi_existing");
    expect(secondEntry?.expiresAt).toBeGreaterThan(firstExpiresAt);
  });

  it("(c) prior PI with different amount: calls stripe.paymentIntents.update and returns updated clientSecret", async () => {
    const orderId = "LB-DIFF-AMT";

    // First request seeds the store with pi_old
    createMock.mockResolvedValueOnce({
      id: "pi_old",
      client_secret: "pi_old_secret",
      status: "requires_payment_method",
      amount: 1000,
      currency: "usd",
    });
    const app = await buildApp();
    await request(app).post("/checkout/payment-intent").send({ ...BASE_BODY, orderId });

    // Reset create; simulate a delivery fee that changes the total
    createMock.mockReset();
    retrieveMock.mockResolvedValueOnce({
      id: "pi_old",
      client_secret: "pi_old_secret",
      status: "requires_payment_method",
      amount: 1000,   // old amount
      currency: "usd",
    });
    updateMock.mockResolvedValueOnce({
      id: "pi_old",
      client_secret: "pi_old_updated_secret",
      status: "requires_payment_method",
      amount: 1500,
      currency: "usd",
    });

    // Second request adds a $5 delivery fee → new totalMinorUnits = 1500
    const res = await request(app)
      .post("/checkout/payment-intent")
      .send({ ...BASE_BODY, orderId, deliveryFeeUsd: 5 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.clientSecret).toBe("pi_old_updated_secret");
    expect(createMock).not.toHaveBeenCalled();
    expect(retrieveMock).toHaveBeenCalledWith("pi_old");
    expect(updateMock).toHaveBeenCalledWith(
      "pi_old",
      expect.objectContaining({ amount: 1500, currency: "usd" }),
    );
  });
});
