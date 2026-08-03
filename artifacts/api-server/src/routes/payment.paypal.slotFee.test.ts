// Contract tests for POST /payment/paypal delivery-slot fee handling.
//
// The web checkout sends deliverySlot, deliverySlotId, cityId, and
// deliveryDate to /payment/paypal (see usePaypalPayment in
// artifacts/presentail-web/src/lib/queries.ts). These tests verify the route
// actually READS those fields and includes the slot surcharge in the PayPal
// order total. If the route ignored the fields (destructuring drift), the
// computeSlotFeeUsd mock below would return 0 and the asserted total would
// be wrong — catching a silent undercharge before it reaches shoppers.
//
// Coverage:
//   (a) slot fields present → PayPal order total includes the slot surcharge,
//       computeSlotFeeUsd receives the exact fields from the request body,
//       and the stored intent snapshot records slotFeeUsd
//   (b) express delivery, no slot fields (baseline) → no slot fee, express
//       surcharge included instead

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const {
  resolveCartItemsMock,
  computeDistrictFeeUsdMock,
  computeSlotFeeUsdMock,
  expressSurchargeUsdMock,
  storePaymentIntentMock,
} = vi.hoisted(() => ({
  resolveCartItemsMock: vi.fn(),
  computeDistrictFeeUsdMock: vi.fn(),
  computeSlotFeeUsdMock: vi.fn(),
  expressSurchargeUsdMock: vi.fn(),
  storePaymentIntentMock: vi.fn(),
}));

vi.mock("../lib/catalog", () => ({
  resolveCartItems: resolveCartItemsMock,
  computeDistrictFeeUsd: computeDistrictFeeUsdMock,
  computeSlotFeeUsd: computeSlotFeeUsdMock,
  countryForDistrict: vi.fn().mockReturnValue("LB"),
  expressSurchargeUsd: expressSurchargeUsdMock,
}));

// Identity FX so USD totals flow straight through to the PayPal amount.
vi.mock("../lib/fx", () => ({
  convertFromUsd: vi.fn().mockImplementation(async (usd: number) => usd),
  normalizeCurrency: (c: string) => (c ?? "USD").toUpperCase(),
  paypalCurrencyFor: vi.fn().mockReturnValue("USD"),
  roundForCurrency: vi.fn().mockImplementation((amount: number) => amount),
}));

vi.mock("../lib/checkoutIntents", () => ({ storePaymentIntent: storePaymentIntentMock }));
vi.mock("../lib/wooStore", () => ({
  resolveStoreFromRequest: vi.fn().mockReturnValue({ storeKey: "lebanon" }),
  resolveStore: vi.fn().mockReturnValue({ storeKey: "lebanon" }),
}));
vi.mock("../lib/validateRedirectUrl", () => ({ validateRedirectUrl: vi.fn().mockReturnValue(null) }));
// No OS city config → route falls back to computeDistrictFeeUsd, which we control.
vi.mock("../lib/osLocationsCache", () => ({ resolveOsDeliveryConfig: vi.fn().mockReturnValue(null) }));

import paymentRouter from "./payment";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { log: Record<string, unknown> }).log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    next();
  });
  app.use(paymentRouter);
  return app;
}

/**
 * Mock global fetch for the two PayPal calls the route makes:
 *   1. POST /v1/oauth2/token   → access token
 *   2. POST /v2/checkout/orders → order id + approve link
 * Captures the order-create request body so tests can assert the amount.
 */
function mockPayPalFetch() {
  const capturedOrderBodies: any[] = [];
  const fetchMock = vi.fn().mockImplementation(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/v1/oauth2/token")) {
      return new Response(JSON.stringify({ access_token: "test-token" }), { status: 200 });
    }
    if (u.includes("/v2/checkout/orders")) {
      capturedOrderBodies.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({
          id: "PP-ORDER-1",
          links: [{ rel: "payer-action", href: "https://paypal.example/approve" }],
        }),
        { status: 200 },
      );
    }
    throw new Error(`Unexpected fetch in test: ${u}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return capturedOrderBodies;
}

// Mirrors what the web checkout sends (usePaypalPayment in queries.ts).
const BASE_BODY = {
  items: [{ wcId: 42, quantity: 1 }],
  orderId: "PW-TEST-PP-1",
  district: "Beirut",
  currency: "USD",
  returnUrl: "https://presentail.com/checkout/return",
  cancelUrl: "https://presentail.com/checkout/cancel",
};

const SLOT_FIELDS = {
  deliverySlot: "9:00 PM – 11:00 PM",
  deliverySlotId: "slot-night",
  cityId: "city-7",
  deliveryDate: "2026-07-30",
};

beforeEach(() => {
  process.env.PAYPAL_CLIENT_ID = "test-client-id";
  process.env.PAYPAL_CLIENT_SECRET = "test-client-secret";
  resolveCartItemsMock.mockResolvedValue({
    ok: true,
    subtotalUsd: 100,
    items: [{ wcId: 42, osSlug: undefined, quantity: 1, priceUsd: 100, name: "Rose", description: "", image: "" }],
  });
  computeDistrictFeeUsdMock.mockReturnValue(8);
  expressSurchargeUsdMock.mockReturnValue(5);
  // Slot fee only when the route forwards the exact slot fields from the
  // request. If the route ignored/dropped the fields, this returns 0 and the
  // total assertions below fail — which is exactly the regression under test.
  computeSlotFeeUsdMock.mockImplementation((args: any) =>
    !args.expressDelivery && args.deliverySlotId === SLOT_FIELDS.deliverySlotId && args.cityId === SLOT_FIELDS.cityId
      ? 10
      : 0,
  );
  storePaymentIntentMock.mockReset();
});

afterEach(() => {
  delete process.env.PAYPAL_CLIENT_ID;
  delete process.env.PAYPAL_CLIENT_SECRET;
  vi.unstubAllGlobals();
});

describe("POST /payment/paypal — delivery-slot fee", () => {
  it("(a) includes the slot surcharge in the PayPal order total when slot fields are sent", async () => {
    const orderBodies = mockPayPalFetch();

    const res = await request(makeApp())
      .post("/payment/paypal")
      .send({ ...BASE_BODY, ...SLOT_FIELDS });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // The route must pass the request's slot fields straight through.
    expect(computeSlotFeeUsdMock).toHaveBeenCalledWith(
      expect.objectContaining({
        expressDelivery: false,
        deliverySlot: SLOT_FIELDS.deliverySlot,
        deliverySlotId: SLOT_FIELDS.deliverySlotId,
        cityId: SLOT_FIELDS.cityId,
        deliveryDate: SLOT_FIELDS.deliveryDate,
        district: "Beirut",
      }),
    );

    // PayPal charge = subtotal 100 + district 8 + slot 10 = 118 (identity FX).
    expect(orderBodies).toHaveLength(1);
    expect(orderBodies[0].purchase_units[0].amount.value).toBe("118.00");
    expect(res.body.amount).toBe(118);

    // The stored intent snapshot records the slot fee for order binding.
    expect(storePaymentIntentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: BASE_BODY.orderId,
        totalUsd: 118,
        snapshot: expect.objectContaining({
          slotFeeUsd: 10,
          deliverySlot: SLOT_FIELDS.deliverySlot,
        }),
      }),
    );
  });

  it("(b) express delivery without slot fields — no slot fee, express surcharge applied", async () => {
    const orderBodies = mockPayPalFetch();

    const res = await request(makeApp())
      .post("/payment/paypal")
      .send({ ...BASE_BODY, expressDelivery: true });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    expect(computeSlotFeeUsdMock).toHaveBeenCalledWith(
      expect.objectContaining({
        expressDelivery: true,
        deliverySlot: undefined,
        deliverySlotId: undefined,
      }),
    );

    // PayPal charge = subtotal 100 + district 8 + express 5 + slot 0 = 113.
    expect(orderBodies).toHaveLength(1);
    expect(orderBodies[0].purchase_units[0].amount.value).toBe("113.00");
    expect(res.body.amount).toBe(113);

    expect(storePaymentIntentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        totalUsd: 113,
        snapshot: expect.objectContaining({ slotFeeUsd: 0, expressDelivery: true }),
      }),
    );
  });
});
