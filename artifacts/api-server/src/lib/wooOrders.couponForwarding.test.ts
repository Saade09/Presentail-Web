/**
 * Unit tests for coupon forwarding in `attemptCreateOsOrder`.
 *
 * Verifies:
 *   (a) A regular coupon with `opts.couponValidated` set produces `couponId` +
 *       `couponDiscountUsd` in the OS payload.
 *   (c) FIRST10 sentinel ("first-order-10") causes `couponId` to be OMITTED from
 *       the OS payload (virtual coupon — no OS redemption record).
 *   (c) Raw "FIRST10" code used as `couponId` is also omitted (defense-in-depth
 *       guard in wooOrders.ts, independent of route normalization).
 *   Base: no `couponValidated` → no coupon fields in the OS payload.
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
  computeSlotFeeUsd: vi.fn().mockReturnValue(0),
  countryForDistrict: vi.fn().mockReturnValue("LB"),
  expressSurchargeUsd: vi.fn().mockReturnValue(0),
  resolveOsEffectivePrice: vi.fn((p: { price: number }) => p.price),
  resolveMidnightWindow: vi.fn().mockReturnValue(null),
  resolveSlotForDate: vi.fn().mockReturnValue(null),
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
  getOsProductPricingMap: vi.fn().mockReturnValue(new Map()),
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

const PREVERIFIED_ITEMS = [
  { wcId: 42, osSlug: undefined, priceUsd: 25, name: "Rose Bouquet" },
];

function makeBody(overrides: Partial<WooOrderPayload> = {}): WooOrderPayload {
  return {
    orderId: "order-coupon-test",
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
    deliveryDetails: "",
    deliveryDate: "",
    deliverySlot: "",
    paymentMethod: "card",
    paymentRef: "pi_test123",
    currencyCode: "USD",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("attemptCreateOsOrder — coupon OS payload forwarding", () => {
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

  it("(a) regular coupon: couponId and couponDiscountUsd are forwarded to OS payload", async () => {
    const body = makeBody({ couponCode: "SUMMER2024" });

    const result = await attemptCreateOsOrder(body, {
      paymentVerified: true,
      preVerifiedItems: PREVERIFIED_ITEMS,
      couponValidated: {
        couponId: "os-coupon-99",
        couponDiscountUsd: 5,
      },
    });

    expect(result.ok).toBe(true);
    const [, payload] = createOsOrderMock.mock.calls[0] as [
      unknown,
      { couponId?: unknown; couponDiscountUsd?: unknown; couponCode?: unknown },
    ];
    expect(payload.couponId).toBe("os-coupon-99");
    expect(payload.couponDiscountUsd).toBe(5);
  });

  it("(a) regular coupon: couponDiscountUsd is deducted from the OS totalUsd", async () => {
    const body = makeBody({ couponCode: "DISCOUNT10" });

    await attemptCreateOsOrder(body, {
      paymentVerified: true,
      preVerifiedItems: PREVERIFIED_ITEMS,
      couponValidated: {
        couponId: "os-coupon-10",
        couponDiscountUsd: 3,
      },
    });

    const [, payload] = createOsOrderMock.mock.calls[0] as [
      unknown,
      { totalUsd: number },
    ];
    // product $25 – $3 coupon = $22
    expect(payload.totalUsd).toBe(22);
  });

  it("(c) FIRST10 sentinel ('first-order-10'): couponId is omitted from OS payload", async () => {
    const body = makeBody({ couponCode: "FIRST10" });

    const result = await attemptCreateOsOrder(body, {
      paymentVerified: true,
      preVerifiedItems: PREVERIFIED_ITEMS,
      couponValidated: {
        couponId: "first-order-10", // sentinel — no OS coupon record
        couponDiscountUsd: 2.5,
      },
    });

    expect(result.ok).toBe(true);
    const [, payload] = createOsOrderMock.mock.calls[0] as [
      unknown,
      { couponId?: unknown; couponDiscountUsd?: unknown },
    ];
    // couponId must NOT be sent to OS for the virtual first-order coupon
    expect(payload.couponId).toBeUndefined();
    // But the discount amount is still forwarded for accounting purposes
    expect(payload.couponDiscountUsd).toBe(2.5);
  });

  it("(c) raw 'FIRST10' as couponId: also omitted from OS payload (defense-in-depth)", async () => {
    const body = makeBody({ couponCode: "FIRST10" });

    const result = await attemptCreateOsOrder(body, {
      paymentVerified: true,
      preVerifiedItems: PREVERIFIED_ITEMS,
      couponValidated: {
        couponId: "FIRST10", // raw code used as id — should also be omitted
        couponDiscountUsd: 2.5,
      },
    });

    expect(result.ok).toBe(true);
    const [, payload] = createOsOrderMock.mock.calls[0] as [
      unknown,
      { couponId?: unknown; couponDiscountUsd?: unknown },
    ];
    expect(payload.couponId).toBeUndefined();
    expect(payload.couponDiscountUsd).toBe(2.5);
  });

  it("no coupon: neither couponId nor couponDiscountUsd appear in the OS payload", async () => {
    const body = makeBody();

    const result = await attemptCreateOsOrder(body, {
      paymentVerified: true,
      preVerifiedItems: PREVERIFIED_ITEMS,
      // couponValidated intentionally omitted
    });

    expect(result.ok).toBe(true);
    const [, payload] = createOsOrderMock.mock.calls[0] as [
      unknown,
      { couponId?: unknown; couponDiscountUsd?: unknown },
    ];
    expect(payload.couponId).toBeUndefined();
    expect(payload.couponDiscountUsd).toBeUndefined();
  });

  it("numeric couponId (OS-database ID) is forwarded unchanged", async () => {
    const body = makeBody({ couponCode: "PROMO50" });

    await attemptCreateOsOrder(body, {
      paymentVerified: true,
      preVerifiedItems: PREVERIFIED_ITEMS,
      couponValidated: {
        couponId: 42, // numeric OS DB id
        couponDiscountUsd: 10,
      },
    });

    const [, payload] = createOsOrderMock.mock.calls[0] as [
      unknown,
      { couponId?: unknown },
    ];
    expect(payload.couponId).toBe(42);
  });

  it("absent body.couponCode + couponValidated set: OS payload gets couponId from opts, couponCode absent", async () => {
    // Simulates the post-snapshot-override state in woo.ts where body.couponCode
    // was overridden to the snapshot's value; here we test the wooOrders layer
    // directly with no body.couponCode to confirm couponId still flows through.
    const body = makeBody(); // no couponCode field

    await attemptCreateOsOrder(body, {
      paymentVerified: true,
      preVerifiedItems: PREVERIFIED_ITEMS,
      couponValidated: {
        couponId: "os-snapshot-id",
        couponDiscountUsd: 7,
      },
    });

    const [, payload] = createOsOrderMock.mock.calls[0] as [
      unknown,
      { couponId?: unknown; couponCode?: unknown; couponDiscountUsd?: unknown },
    ];
    // couponId must come from opts, not body.couponCode
    expect(payload.couponId).toBe("os-snapshot-id");
    expect(payload.couponDiscountUsd).toBe(7);
    // body had no couponCode, so the OS payload couponCode should be absent
    expect(payload.couponCode).toBeUndefined();
  });

  it("body.couponCode differs from opts.couponValidated identity: couponId from opts takes precedence", async () => {
    // Verifies that a body.couponCode string that doesn't match the opts couponId
    // doesn't corrupt the OS couponId. The route sets body.couponCode to the
    // snapshot value before calling attemptCreateOsOrder; this test confirms that
    // even if the two diverge, couponId is always opts-sourced.
    const body = makeBody({ couponCode: "SNAPSHOT_CODE" });

    await attemptCreateOsOrder(body, {
      paymentVerified: true,
      preVerifiedItems: PREVERIFIED_ITEMS,
      couponValidated: {
        couponId: 55, // OS-validated ID — should not be overridden by body.couponCode
        couponDiscountUsd: 4,
      },
    });

    const [, payload] = createOsOrderMock.mock.calls[0] as [
      unknown,
      { couponId?: unknown; couponCode?: unknown },
    ];
    // couponId is always from opts — never derived from body.couponCode
    expect(payload.couponId).toBe(55);
    // couponCode in OS payload comes from body.couponCode (already overridden by route)
    expect(payload.couponCode).toBe("SNAPSHOT_CODE");
  });
});
