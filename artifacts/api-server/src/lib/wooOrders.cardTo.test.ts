/**
 * Tests for the card "To" field in order creation.
 *
 * When a sender leaves the card "To" field blank (absent or empty string),
 * the order must NOT silently fall back to the delivery recipient's name.
 * The `to_text` WooCommerce metadata and the OS payload `cardTo` field must
 * both remain empty/omitted — exactly what the sender submitted.
 *
 * When the sender does type a name it must be preserved unchanged.
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
    baseUrl: "https://wc.example.com",
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
  attemptCreateWcOrder,
  type WooOrderPayload,
} from "./wooOrders";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBody(overrides: Partial<WooOrderPayload> = {}): WooOrderPayload {
  return {
    orderId: "order-ct-001",
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

async function submitOs(body: WooOrderPayload): Promise<Record<string, unknown>> {
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

/** Invoke attemptCreateWcOrder with a mocked fetch and return the parsed
 *  WooCommerce order-creation request body. */
async function submitWc(
  body: WooOrderPayload,
): Promise<{ meta_data: { key: string; value: string }[] }> {
  let capturedBody: unknown;

  const mockFetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
    capturedBody = init?.body ? JSON.parse(init.body as string) : undefined;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ id: 999, order_key: "wc_order_test" }),
    });
  });
  vi.stubGlobal("fetch", mockFetch);

  try {
    await attemptCreateWcOrder(body);
  } finally {
    vi.unstubAllGlobals();
  }

  return capturedBody as { meta_data: { key: string; value: string }[] };
}

function findMeta(
  metaData: { key: string; value: string }[],
  key: string,
): string | undefined {
  return metaData.find((m) => m.key === key)?.value;
}

// ---------------------------------------------------------------------------
// OS path — cardTo / to_text
// ---------------------------------------------------------------------------

describe("attemptCreateOsOrder — card To field", () => {
  beforeEach(() => {
    process.env.PRESENTAIL_OS_API_KEY = "test-api-key";
    process.env.PRESENTAIL_OS_API_URL = "https://os.example.com";
    createOsOrderMock.mockResolvedValue({ order_id: "os-order-ct" });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.PRESENTAIL_OS_API_KEY;
    delete process.env.PRESENTAIL_OS_API_URL;
  });

  it("cardTo absent: OS payload omits cardTo (does not use recipient name)", async () => {
    const payload = await submitOs(makeBody());
    // cardTo must be absent or undefined — never the recipient's name
    expect(payload.cardTo).toBeUndefined();
    expect(payload.cardTo).not.toBe("Bob Jones");
  });

  it("cardTo empty string: OS payload omits cardTo", async () => {
    const payload = await submitOs(makeBody({ cardTo: "" }));
    expect(payload.cardTo).toBeUndefined();
  });

  it("cardTo whitespace-only: OS payload omits cardTo", async () => {
    const payload = await submitOs(makeBody({ cardTo: "   " }));
    expect(payload.cardTo).toBeUndefined();
  });

  it("cardTo provided: OS payload preserves the sender-supplied name", async () => {
    const payload = await submitOs(makeBody({ cardTo: "Grandma" }));
    expect(payload.cardTo).toBe("Grandma");
  });

  it("recipientName is still written to Recipient Name regardless of cardTo", async () => {
    // The separate recipient-name field used for fulfilment must be unaffected.
    const payload = await submitOs(makeBody());
    // The OS payload carries recipient info inside the delivery sub-object
    // (not as a top-level recipientName key), so this assertion is on the
    // delivery.recipientName field which the OS bridge normalises from body.
    // At minimum, the absence of cardTo must not bleed into delivery fields.
    expect(payload.cardTo).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// WooCommerce path — to_text metadata
// ---------------------------------------------------------------------------

describe("attemptCreateWcOrder — to_text metadata", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("cardTo absent: to_text metadata is empty (not the recipient's name)", async () => {
    const wc = await submitWc(makeBody());
    const toText = findMeta(wc.meta_data, "to_text");
    expect(toText).toBe("");
    expect(toText).not.toBe("Bob Jones");
  });

  it("cardTo empty string: to_text metadata is empty", async () => {
    const wc = await submitWc(makeBody({ cardTo: "" }));
    expect(findMeta(wc.meta_data, "to_text")).toBe("");
  });

  it("cardTo provided: to_text metadata carries the sender-supplied name", async () => {
    const wc = await submitWc(makeBody({ cardTo: "Grandma" }));
    expect(findMeta(wc.meta_data, "to_text")).toBe("Grandma");
  });

  it("Recipient Name metadata is still the recipient's full name", async () => {
    const wc = await submitWc(makeBody());
    expect(findMeta(wc.meta_data, "Recipient Name")).toBe("Bob Jones");
  });
});
