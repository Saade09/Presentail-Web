/**
 * Tests for Express delivery slot label and detection in the OS order pipeline.
 *
 * When a customer selects Express delivery the OS order must receive
 * `delivery.slot === "Express"` instead of a fabricated 2-hour clock range
 * derived from window_start. Additionally, express detection must be robust
 * against the zero-fee edge case: `expressDelivery: true` (with expressFee: 0)
 * must still produce `clientSignalledExpress` behaviour.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createOsOrderMock, resolveOsDeliveryConfigMock } = vi.hoisted(() => {
  const createOsOrderMock = vi.fn();
  const resolveOsDeliveryConfigMock = vi.fn();
  return { createOsOrderMock, resolveOsDeliveryConfigMock };
});

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
  expressSurchargeUsd: vi.fn().mockReturnValue(5),
  resolveOsEffectivePrice: vi.fn((p: { price: number }) => p.price),
  resolveMidnightWindow: vi.fn().mockReturnValue(null),
  resolveSlotForDate: vi.fn().mockReturnValue(undefined),
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
  resolveOsDeliveryConfig: resolveOsDeliveryConfigMock.mockReturnValue({
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

import {
  attemptCreateOsOrder,
  WooOrderSchema,
  type WooOrderPayload,
} from "./wooOrders";

function makeBody(overrides: Partial<WooOrderPayload> = {}): WooOrderPayload {
  return {
    orderId: "order-express-001",
    items: [{ name: "Rose Bouquet", quantity: 1, price: 25, wcId: 42 }],
    billing: {
      firstName: "Alice",
      lastName: "Smith",
      email: "alice@example.com",
      phone: "+96170000000",
    },
    recipient: { firstName: "Bob", lastName: "Jones", phone: "+96170000001" },
    district: "Beirut",
    districtFee: 0,
    expressFee: 0,
    deliveryDetails: "",
    deliveryDate: "2026-09-10",
    deliverySlot: "",
    paymentMethod: "card",
    paymentRef: "pi_test123",
    currencyCode: "USD",
    ...overrides,
  } as WooOrderPayload;
}

const PREVERIFIED_ITEMS = [
  { wcId: 42, osSlug: undefined, priceUsd: 25, name: "Rose Bouquet" },
];

async function submit(body: WooOrderPayload): Promise<Record<string, unknown>> {
  const result = await attemptCreateOsOrder(body, {
    paymentVerified: true,
    preVerifiedItems: PREVERIFIED_ITEMS,
  });
  expect(result.ok).toBe(true);
  const [, payload] = createOsOrderMock.mock.calls.at(-1) as [
    unknown,
    Record<string, unknown>,
  ];
  return payload;
}

describe("attemptCreateOsOrder — Express slot label", () => {
  beforeEach(() => {
    process.env.PRESENTAIL_OS_API_KEY = "test-api-key";
    process.env.PRESENTAIL_OS_API_URL = "https://os.example.com";
    createOsOrderMock.mockResolvedValue({ order_id: "os-order-express" });
    resolveOsDeliveryConfigMock.mockReturnValue({
      cityFeeUsd: undefined,
      freeDeliveryEnabled: false,
      freeDeliveryThresholdUsd: undefined,
      expressSurchargeUsd: 0,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.PRESENTAIL_OS_API_KEY;
    delete process.env.PRESENTAIL_OS_API_URL;
  });

  it("express order (expressFee > 0): delivery.slot is 'Express'", async () => {
    const payload = await submit(makeBody({ expressFee: 5 }));
    const delivery = payload.delivery as Record<string, unknown>;
    expect(delivery.slot).toBe("Express");
  });

  it("express order (expressFee > 0): delivery.isExpress is true", async () => {
    const payload = await submit(makeBody({ expressFee: 5 }));
    const delivery = payload.delivery as Record<string, unknown>;
    expect(delivery.isExpress).toBe(true);
  });

  it("express order (expressFee > 0): delivery_type is 'express'", async () => {
    const payload = await submit(makeBody({ expressFee: 5 }));
    expect(payload.delivery_type).toBe("express");
  });

  it("expressDelivery: true with expressFee: 0 produces slot 'Express'", async () => {
    const payload = await submit(makeBody({ expressFee: 0, expressDelivery: true }));
    const delivery = payload.delivery as Record<string, unknown>;
    expect(delivery.slot).toBe("Express");
  });

  it("expressDelivery: true with expressFee: 0 produces isExpress: true", async () => {
    const payload = await submit(makeBody({ expressFee: 0, expressDelivery: true }));
    const delivery = payload.delivery as Record<string, unknown>;
    expect(delivery.isExpress).toBe(true);
  });

  it("expressDelivery: true with expressFee: 0 produces delivery_type 'express'", async () => {
    const payload = await submit(makeBody({ expressFee: 0, expressDelivery: true }));
    expect(payload.delivery_type).toBe("express");
  });

  it("standard order: delivery.slot is NOT 'Express'", async () => {
    const payload = await submit(makeBody({ expressFee: 0, expressDelivery: false }));
    const delivery = payload.delivery as Record<string, unknown>;
    expect(delivery.slot).not.toBe("Express");
  });

  it("standard order: delivery.isExpress is false", async () => {
    const payload = await submit(makeBody({ expressFee: 0, expressDelivery: false }));
    const delivery = payload.delivery as Record<string, unknown>;
    expect(delivery.isExpress).toBe(false);
  });

  it("charges the full OS Express total ($15) below the threshold — Express replaces standard delivery", async () => {
    resolveOsDeliveryConfigMock.mockReturnValue({
      cityFeeUsd: 11,
      freeDeliveryEnabled: true,
      freeDeliveryThresholdUsd: 140,
      expressFeeTotalUsd: 15,
      expressSurchargeUsd: 0,
      expressSurchargeIsExplicit: false,
    });
    const payload = await submit(
      makeBody({
        district: "Baabda",
        cityId: "lb-baabda",
        expressFee: 0,
        expressDelivery: true,
      }),
    );
    const delivery = payload.delivery as Record<string, unknown>;
    // District fee is $0 — Express replaces standard delivery entirely.
    expect(delivery.feeUsd).toBe(0);
    // Express surcharge in the OS payload carries the full configured Express total.
    expect(delivery.expressSurchargeUsd).toBe(15);
    expect(payload.deliveryFeeUsd).toBe(15);
    expect(payload.totalUsd).toBe(40);
  });
});

describe("WooOrderSchema — expressDelivery field", () => {
  it("accepts expressDelivery: true and preserves it through a round-trip", () => {
    const parsed = WooOrderSchema.safeParse(makeBody({ expressDelivery: true }));
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.expressDelivery).toBe(true);
  });

  it("accepts expressDelivery: false and preserves it through a round-trip", () => {
    const parsed = WooOrderSchema.safeParse(makeBody({ expressDelivery: false }));
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.expressDelivery).toBe(false);
  });

  it("accepts legacy payloads without expressDelivery", () => {
    const parsed = WooOrderSchema.safeParse(makeBody());
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.expressDelivery).toBeUndefined();
  });
});
