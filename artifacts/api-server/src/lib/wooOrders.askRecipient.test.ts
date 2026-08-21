/**
 * Tests for the ask-recipient-for-address signal in the OS order payload.
 *
 * When the customer enables "Ask the recipient for the address" at checkout
 * (payload `noAddress: true`), the OS order must carry an unmistakable
 * human-visible signal:
 *  - address fields read the placeholder text instead of an empty value
 *  - delivery instructions / order notes include an explicit ask-recipient line
 *  - the existing `delivery.noAddress` boolean keeps being sent unchanged
 *  - orders without the toggle are completely unaffected
 *  - the enrichment is idempotent (no double-append on retries/rebuilds)
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
  applyAskRecipientSignals,
  ASK_RECIPIENT_ADDRESS_PLACEHOLDER,
  ASK_RECIPIENT_NOTE,
  type WooOrderPayload,
} from "./wooOrders";

// ---------------------------------------------------------------------------
// Unit tests for the pure helper
// ---------------------------------------------------------------------------

describe("applyAskRecipientSignals", () => {
  it("toggle off: returns inputs unchanged", () => {
    const out = applyAskRecipientSignals({
      noAddress: false,
      address: "Hamra Street, Bldg 4",
      notes: "Ring the bell",
    });
    expect(out).toEqual({ address: "Hamra Street, Bldg 4", notes: "Ring the bell" });
  });

  it("toggle on, empty address/notes: placeholder + note", () => {
    const out = applyAskRecipientSignals({ noAddress: true, address: "", notes: "" });
    expect(out.address).toBe(ASK_RECIPIENT_ADDRESS_PLACEHOLDER);
    expect(out.notes).toBe(ASK_RECIPIENT_NOTE);
  });

  it("toggle on: preserves customer-written notes and address detail", () => {
    const out = applyAskRecipientSignals({
      noAddress: true,
      address: "Near the pharmacy",
      notes: "Please deliver after 6pm",
    });
    expect(out.address).toBe(
      `${ASK_RECIPIENT_ADDRESS_PLACEHOLDER} — Near the pharmacy`,
    );
    expect(out.notes).toBe(`Please deliver after 6pm\n${ASK_RECIPIENT_NOTE}`);
  });

  it("idempotent: re-applying to enriched values does not duplicate", () => {
    const first = applyAskRecipientSignals({
      noAddress: true,
      address: "Near the pharmacy",
      notes: "Please deliver after 6pm",
    });
    const second = applyAskRecipientSignals({
      noAddress: true,
      address: first.address,
      notes: first.notes,
    });
    expect(second).toEqual(first);
    expect(second.notes.split(ASK_RECIPIENT_NOTE).length - 1).toBe(1);
    expect(
      second.address.split(ASK_RECIPIENT_ADDRESS_PLACEHOLDER).length - 1,
    ).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Integration: OS payload built by attemptCreateOsOrder
// ---------------------------------------------------------------------------

function makeBody(overrides: Partial<WooOrderPayload> = {}): WooOrderPayload {
  return {
    orderId: "order-na-001",
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

type OsPayloadShape = {
  delivery: { address: string; noAddress: boolean };
  delivery_address?: { address_1?: string };
  delivery_instructions?: string;
  orderNotes?: string;
};

async function submit(body: WooOrderPayload): Promise<OsPayloadShape> {
  const result = await attemptCreateOsOrder(body, {
    paymentVerified: true,
    preVerifiedItems: PREVERIFIED_ITEMS,
  });
  expect(result.ok).toBe(true);
  const [, payload] = createOsOrderMock.mock.calls.at(-1) as [unknown, OsPayloadShape];
  return payload;
}

describe("attemptCreateOsOrder — ask-recipient signal", () => {
  beforeEach(() => {
    process.env.PRESENTAIL_OS_API_KEY = "test-api-key";
    process.env.PRESENTAIL_OS_API_URL = "https://os.example.com";
    createOsOrderMock.mockResolvedValue({ order_id: "os-order-na" });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.PRESENTAIL_OS_API_KEY;
    delete process.env.PRESENTAIL_OS_API_URL;
  });

  it("toggle on: address placeholder + note present, noAddress boolean unchanged", async () => {
    const payload = await submit(makeBody({ noAddress: true }));

    expect(payload.delivery.noAddress).toBe(true);
    expect(payload.delivery.address).toBe(ASK_RECIPIENT_ADDRESS_PLACEHOLDER);
    expect(payload.delivery_address?.address_1).toBe(ASK_RECIPIENT_ADDRESS_PLACEHOLDER);
    expect(payload.delivery_instructions).toBe(ASK_RECIPIENT_NOTE);
    expect(payload.orderNotes).toBe(ASK_RECIPIENT_NOTE);
  });

  it("toggle on with customer notes: notes preserved, ask-recipient line appended", async () => {
    const payload = await submit(
      makeBody({ noAddress: true, orderNotes: "Please deliver after 6pm" }),
    );

    expect(payload.delivery_instructions).toBe(
      `Please deliver after 6pm\n${ASK_RECIPIENT_NOTE}`,
    );
    expect(payload.orderNotes).toBe(`Please deliver after 6pm\n${ASK_RECIPIENT_NOTE}`);
  });

  it("retry with already-enriched notes: line not duplicated", async () => {
    const payload = await submit(
      makeBody({
        noAddress: true,
        orderNotes: `Please deliver after 6pm\n${ASK_RECIPIENT_NOTE}`,
      }),
    );

    const count = (payload.delivery_instructions ?? "").split(ASK_RECIPIENT_NOTE).length - 1;
    expect(count).toBe(1);
  });

  it("toggle off: payload completely unaffected", async () => {
    const payload = await submit(
      makeBody({
        deliveryDetails: "Hamra Street, Bldg 4",
        orderNotes: "Ring the bell",
      }),
    );

    expect(payload.delivery.noAddress).toBe(false);
    expect(payload.delivery.address).toBe("Hamra Street, Bldg 4");
    expect(payload.delivery_address?.address_1).toBe("Hamra Street, Bldg 4");
    expect(payload.delivery_instructions).toBe("Ring the bell");
    expect(payload.orderNotes).toBe("Ring the bell");
    expect(payload.delivery_instructions).not.toContain(ASK_RECIPIENT_NOTE);
  });

  it("toggle off, no notes: no note text injected", async () => {
    const payload = await submit(makeBody({}));

    expect(payload.delivery_instructions).toBeUndefined();
    expect(payload.orderNotes).toBeUndefined();
    expect(payload.delivery.address).toBe("");
  });
});
