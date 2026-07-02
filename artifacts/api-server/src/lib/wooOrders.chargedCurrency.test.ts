/**
 * Unit tests for the charge-currency routing inside `attemptCreateOsOrder`.
 *
 * Two scenarios are covered:
 *
 * 1. Normal path (intent in memory): `opts.verifiedCurrency` is present and
 *    must override `body.currencyCode` in the OS payload's `payment.currencyCode`
 *    field. This ensures OS always receives the currency Stripe/Mamo/PayPal
 *    actually charged — not the display currency the client happened to send.
 *
 * 2. Server-restart recovery path (intent gone): `opts.verifiedCurrency` is
 *    absent. The function must degrade gracefully and use `body.currencyCode`
 *    as the fallback, without crashing or rejecting the order.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoist the createOsOrder mock so we can inspect call arguments per-test.
// ---------------------------------------------------------------------------

const { createOsOrderMock } = vi.hoisted(() => {
  const createOsOrderMock = vi.fn();
  return { createOsOrderMock };
});

// ---------------------------------------------------------------------------
// Module mocks — all side-effectful imports stubbed so the module loads cleanly
// ---------------------------------------------------------------------------

vi.mock("@workspace/db", () => ({
  db: {},
  appOrdersTable: {},
  pendingWooOrdersTable: {},
}));

vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("./fx", () => ({
  normalizeCurrency: (c: string | undefined) => (c ?? "USD").toUpperCase(),
  convertFromUsd: vi.fn().mockResolvedValue(0),
  roundForCurrency: (amount: number) => Math.round(amount * 100) / 100,
  toStripeMinorUnits: (amount: number) => Math.round(amount * 100),
}));

vi.mock("./catalog", () => ({
  fetchWcProductPrice: vi.fn().mockResolvedValue({ price: 25, name: "Rose" }),
  computeDistrictFeeUsd: vi.fn().mockReturnValue(0),
  countryForDistrict: vi.fn().mockReturnValue("LB"),
  expressSurchargeUsd: vi.fn().mockReturnValue(0),
}));

vi.mock("./wooStore", () => ({
  resolveStore: vi.fn().mockReturnValue({
    storeKey: "lb",
    baseUrl: "https://example.com",
    consumerKey: "ck_test",
    consumerSecret: "cs_test",
  }),
  wooAuthHeader: vi.fn().mockReturnValue("Basic test"),
}));

vi.mock("./osLocationsCache", () => ({
  getDeliverySlots: vi.fn().mockReturnValue([]),
  resolveOsDeliveryConfig: vi.fn().mockReturnValue({
    cityFeeUsd: undefined,
    freeDeliveryEnabled: false,
    freeDeliveryThresholdUsd: undefined,
    expressSurchargeUsd: 0,
  }),
}));

vi.mock("@workspace/presentail-os", () => ({
  createOsOrder: createOsOrderMock,
}));

vi.mock("./osProductsCache", () => ({
  getOsProductBySlug: vi.fn().mockReturnValue(null),
  getOsProductByWcId: vi.fn().mockReturnValue(null),
  hasOsProducts: vi.fn().mockReturnValue(true),
}));

vi.mock("./ordersSheet.js", () => ({
  appendOrderToSheet: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./orderEvents", () => ({
  sendOrderEventPush: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Import SUT after all mocks are registered
// ---------------------------------------------------------------------------

import { attemptCreateOsOrder, type WooOrderPayload } from "./wooOrders";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBody(currencyCode: string): WooOrderPayload {
  return {
    orderId: "order-001",
    items: [
      {
        name: "Rose Bouquet",
        quantity: 1,
        price: 25,
        wcId: 42,
      },
    ],
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
    deliveryDetails: "",
    deliveryDate: "",
    deliverySlot: "",
    paymentMethod: "card",
    paymentRef: "pi_test123",
    currencyCode,
  };
}

const PREVERIFIED_ITEMS = [
  { wcId: 42, osSlug: undefined, priceUsd: 25, name: "Rose Bouquet" },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("attemptCreateOsOrder — charge currency routing", () => {
  beforeEach(() => {
    process.env.PRESENTAIL_OS_API_KEY = "test-api-key";
    process.env.PRESENTAIL_OS_API_URL = "https://os.example.com";
    createOsOrderMock.mockResolvedValue({ order_id: "os-order-abc" });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.PRESENTAIL_OS_API_KEY;
    delete process.env.PRESENTAIL_OS_API_URL;
  });

  it("normal path: verifiedCurrency overrides body.currencyCode in payment.currencyCode", async () => {
    const body = makeBody("USD");

    const result = await attemptCreateOsOrder(body, {
      paymentVerified: true,
      preVerifiedItems: PREVERIFIED_ITEMS,
      verifiedCurrency: "QAR",
    });

    expect(result.ok).toBe(true);
    expect(createOsOrderMock).toHaveBeenCalledOnce();

    const [, payload] = createOsOrderMock.mock.calls[0] as [unknown, { payment: { currencyCode: string } }];
    expect(payload.payment.currencyCode).toBe("QAR");
  });

  it("normal path: verifiedCurrency matching body.currencyCode still works correctly", async () => {
    const body = makeBody("AED");

    const result = await attemptCreateOsOrder(body, {
      paymentVerified: true,
      preVerifiedItems: PREVERIFIED_ITEMS,
      verifiedCurrency: "AED",
    });

    expect(result.ok).toBe(true);
    const [, payload] = createOsOrderMock.mock.calls[0] as [unknown, { payment: { currencyCode: string } }];
    expect(payload.payment.currencyCode).toBe("AED");
  });

  it("recovery path: verifiedCurrency absent → falls back to body.currencyCode without crashing", async () => {
    const body = makeBody("USD");

    const result = await attemptCreateOsOrder(body, {
      paymentVerified: true,
      preVerifiedItems: PREVERIFIED_ITEMS,
      // verifiedCurrency intentionally omitted — simulates server-restart path
    });

    expect(result.ok).toBe(true);
    const [, payload] = createOsOrderMock.mock.calls[0] as [unknown, { payment: { currencyCode: string } }];
    expect(payload.payment.currencyCode).toBe("USD");
  });

  it("recovery path: body.currencyCode absent + verifiedCurrency absent → defaults to USD", async () => {
    const body = makeBody("USD");
    // Simulate body with no currencyCode at all (undefined → normalizeCurrency falls back)
    body.currencyCode = undefined;

    const result = await attemptCreateOsOrder(body, {
      paymentVerified: true,
      preVerifiedItems: PREVERIFIED_ITEMS,
    });

    expect(result.ok).toBe(true);
    const [, payload] = createOsOrderMock.mock.calls[0] as [unknown, { payment: { currencyCode: string } }];
    expect(payload.payment.currencyCode).toBe("USD");
  });

  it("recovery path: order is accepted (ok: true) even without verifiedCurrency", async () => {
    const body = makeBody("KWD");

    const result = await attemptCreateOsOrder(body, {
      paymentVerified: true,
      preVerifiedItems: PREVERIFIED_ITEMS,
      // No verifiedCurrency — recovery path
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.osOrderId).toBe("os-order-abc");
    }
  });
});
