/**
 * Tests for the WhatsApp order-updates opt-in flag in the order pipeline.
 *
 * The web checkout sends `whatsappOptIn` (boolean, optional) in the order
 * body. The OS order payload must always carry an explicit `whatsapp_opt_in`
 * boolean (snake_case on the wire) so OS can gate its transactional WhatsApp
 * notifications:
 *  - true only when the shopper left the checkbox checked
 *  - false when unchecked AND when the field is absent (legacy clients)
 *
 * The recovery/queue path stores the raw body and re-parses it through
 * WooOrderSchema, so the flag must survive a schema round-trip.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createOsOrderMock } = vi.hoisted(() => {
  const createOsOrderMock = vi.fn();
  return { createOsOrderMock };
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
  expressSurchargeUsd: vi.fn().mockReturnValue(0),
  resolveOsEffectivePrice: vi.fn((p: { price: number }) => p.price),
  resolveMidnightWindow: vi.fn().mockReturnValue(null),
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

import {
  attemptCreateOsOrder,
  WooOrderSchema,
  type WooOrderPayload,
} from "./wooOrders";

function makeBody(overrides: Partial<WooOrderPayload> = {}): WooOrderPayload {
  return {
    orderId: "order-wa-001",
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
    deliveryDate: "",
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

describe("attemptCreateOsOrder — whatsapp_opt_in", () => {
  beforeEach(() => {
    process.env.PRESENTAIL_OS_API_KEY = "test-api-key";
    process.env.PRESENTAIL_OS_API_URL = "https://os.example.com";
    createOsOrderMock.mockResolvedValue({ order_id: "os-order-wa" });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.PRESENTAIL_OS_API_KEY;
    delete process.env.PRESENTAIL_OS_API_URL;
  });

  it("checked order: OS payload carries whatsapp_opt_in: true", async () => {
    const payload = await submit(makeBody({ whatsappOptIn: true }));
    expect(payload.whatsapp_opt_in).toBe(true);
  });

  it("unchecked order: OS payload carries an explicit whatsapp_opt_in: false", async () => {
    const payload = await submit(makeBody({ whatsappOptIn: false }));
    expect(payload.whatsapp_opt_in).toBe(false);
  });

  it("legacy body without the flag: defaults to whatsapp_opt_in: false", async () => {
    const payload = await submit(makeBody());
    expect(payload.whatsapp_opt_in).toBe(false);
  });
});

describe("WooOrderSchema — recovery/queue round-trip", () => {
  // The pending-order queue stores the raw body and re-parses it via
  // WooOrderSchema before retrying, so the flag must survive parsing.
  it("preserves whatsappOptIn: true through a schema round-trip", () => {
    const parsed = WooOrderSchema.safeParse(makeBody({ whatsappOptIn: true }));
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.whatsappOptIn).toBe(true);
  });

  it("preserves whatsappOptIn: false through a schema round-trip", () => {
    const parsed = WooOrderSchema.safeParse(makeBody({ whatsappOptIn: false }));
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.whatsappOptIn).toBe(false);
  });

  it("accepts legacy payloads without the flag", () => {
    const parsed = WooOrderSchema.safeParse(makeBody());
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.whatsappOptIn).toBeUndefined();
  });
});
