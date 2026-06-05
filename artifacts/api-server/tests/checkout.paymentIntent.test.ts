// Tests for POST /checkout/payment-intent — the route that creates a Stripe
// PaymentIntent with server-resolved catalog prices and returns the clientSecret
// so the browser can confirm the card via stripe.confirmCardPayment().
//
// Security invariants verified here:
//   - Catalog prices come from the OS cache (resolveCartItems), not the client.
//   - STRIPE_SECRET_KEY must be present; requests are rejected otherwise.
//   - Invalid / empty inputs are rejected before Stripe is ever called.

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
const { mockStripeCreate } = vi.hoisted(() => {
  const mockStripeCreate = vi.fn().mockResolvedValue({
    id: "pi_test_abc123",
    client_secret: "pi_test_abc123_secret_xyz",
    status: "requires_payment_method",
  });
  return { mockStripeCreate };
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

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { resolveCartItems } from "../src/lib/catalog";
import checkoutRouter from "../src/routes/checkout";

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
