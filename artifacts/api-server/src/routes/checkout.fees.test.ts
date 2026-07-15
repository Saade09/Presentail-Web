// Unit tests for POST /checkout/fees
// (artifacts/api-server/src/routes/checkout.ts)
//
// Coverage:
//   (a) UAE standard delivery — subtotal + district fee
//   (b) Slot with extraFee — slot surcharge added to total
//   (c) Coupon discount — discount applied and reflected in total
//   (d) Free-delivery threshold — district fee zeroed when subtotal qualifies
//   (e) No-address flat fee — flat fee returned when noAddress=true
//   (f) Express delivery — express surcharge included, slot fee excluded

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoist fee mocks
// ---------------------------------------------------------------------------

const {
  computeDistrictFeeUsdMock,
  expressSurchargeUsdMock,
  countryForDistrictMock,
  getDeliverySlotsMock,
} = vi.hoisted(() => {
  const computeDistrictFeeUsdMock = vi.fn().mockReturnValue(8);
  const expressSurchargeUsdMock = vi.fn().mockReturnValue(5);
  const countryForDistrictMock = vi.fn().mockReturnValue("LB");
  const getDeliverySlotsMock = vi.fn().mockReturnValue([]);
  return { computeDistrictFeeUsdMock, expressSurchargeUsdMock, countryForDistrictMock, getDeliverySlotsMock };
});

vi.mock("../lib/catalog", () => ({
  resolveCartItems: vi.fn().mockResolvedValue({
    ok: true,
    subtotalUsd: 100,
    items: [{ wcId: 42, osSlug: undefined, quantity: 1, priceUsd: 100, name: "Rose", description: "", image: "" }],
  }),
  computeDistrictFeeUsd: computeDistrictFeeUsdMock,
  expressSurchargeUsd: expressSurchargeUsdMock,
  countryForDistrict: countryForDistrictMock,
}));

vi.mock("../lib/osLocationsCache", () => ({
  getDeliverySlots: getDeliverySlotsMock,
}));

vi.mock("../lib/fx", () => ({
  normalizeCurrency: (c: string) => (c ?? "USD").toUpperCase(),
  convertFromUsd: vi.fn().mockImplementation(async (usd: number) => usd),
  roundToNearestFive: (amount: number) => Math.round(amount),
  toStripeMinorUnits: vi.fn().mockImplementation((amount: number) => Math.round(amount * 100)),
}));

vi.mock("../lib/couponValidation", () => ({
  validateCoupon: vi.fn().mockResolvedValue({ valid: false, discountAmountUsd: 0 }),
}));

vi.mock("../lib/wooStore", () => ({
  resolveStoreFromRequest: vi.fn().mockReturnValue({ storeKey: "lebanon" }),
}));

vi.mock("../lib/auth", () => ({
  authenticate: vi.fn().mockResolvedValue({ ok: false, status: 401, message: "Unauthorized" }), // i18n-ignore
}));

vi.mock("stripe", () => {
  class MockStripe {
    paymentIntents = { create: vi.fn(), retrieve: vi.fn(), update: vi.fn(), search: vi.fn() };
    customers = { create: vi.fn() };
    paymentMethods = { list: vi.fn() };
  }
  return { default: MockStripe };
});

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) }),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
  },
  customersTable: {},
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

vi.mock("pino-http", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ---------------------------------------------------------------------------
// Build a minimal Express app
// ---------------------------------------------------------------------------

import express from "express";
import request from "supertest";
import { resolveCartItems } from "../lib/catalog";
import { validateCoupon } from "../lib/couponValidation";

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

const BASE_ITEMS = [{ wcId: 42, quantity: 1 }];

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_fake";
  computeDistrictFeeUsdMock.mockReturnValue(8);
  expressSurchargeUsdMock.mockReturnValue(5);
  countryForDistrictMock.mockReturnValue("LB");
  getDeliverySlotsMock.mockReturnValue([]);
  vi.mocked(resolveCartItems).mockResolvedValue({
    ok: true,
    subtotalUsd: 100,
    items: [{ wcId: 42, osSlug: undefined, quantity: 1, priceUsd: 100, name: "Rose", description: "", image: "" }],
  });
  vi.mocked(validateCoupon).mockResolvedValue({ valid: false, error: "invalid", message: "Invalid coupon" }); // i18n-ignore
});

afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
});

describe("POST /checkout/fees", () => {
  it("(a) standard delivery — returns subtotal + district fee in total", async () => {
    computeDistrictFeeUsdMock.mockReturnValue(8);

    const app = await buildApp();
    const res = await request(app)
      .post("/checkout/fees")
      .send({ items: BASE_ITEMS, currency: "USD", district: "Beirut" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.subtotalUsd).toBe(100);
    expect(res.body.districtFeeUsd).toBe(8);
    expect(res.body.expressFeeUsd).toBe(0);
    expect(res.body.slotFeeUsd).toBe(0);
    expect(res.body.couponDiscountUsd).toBe(0);
    expect(res.body.totalUsd).toBe(108);
    expect(res.body.currency).toBe("USD");
    expect(res.body.total).toBe(108);
    expect(res.body.totalMinorUnits).toBe(10800);
  });

  it("(b) slot with extraFee — slot surcharge added to total", async () => {
    computeDistrictFeeUsdMock.mockReturnValue(8);
    getDeliverySlotsMock.mockReturnValue([
      { label: "10:00 – 12:00", extraFee: 10 },
      { label: "14:00 – 16:00", extraFee: 0 },
    ]);

    const app = await buildApp();
    const res = await request(app)
      .post("/checkout/fees")
      .send({
        items: BASE_ITEMS,
        currency: "USD",
        district: "Beirut",
        deliverySlot: "10:00 – 12:00",
        cityId: "1",
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.slotFeeUsd).toBe(10);
    expect(res.body.totalUsd).toBe(118);
  });

  it("(c) coupon discount — discount subtracted from total", async () => {
    computeDistrictFeeUsdMock.mockReturnValue(8);
    vi.mocked(validateCoupon).mockResolvedValue({ valid: true, couponId: "C1", discountType: "fixed", discountValue: 20, discountAmountUsd: 20, finalTotalUsd: 88 });

    const app = await buildApp();
    const res = await request(app)
      .post("/checkout/fees")
      .send({ items: BASE_ITEMS, currency: "USD", district: "Beirut", couponCode: "SAVE20" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.couponDiscountUsd).toBe(20);
    expect(res.body.totalUsd).toBe(88);
  });

  it("(d) free-delivery threshold — district fee zeroed when subtotal qualifies", async () => {
    computeDistrictFeeUsdMock.mockReturnValue(0);

    const app = await buildApp();
    const res = await request(app)
      .post("/checkout/fees")
      .send({ items: BASE_ITEMS, currency: "USD", district: "Beirut" });

    expect(res.status).toBe(200);
    expect(res.body.districtFeeUsd).toBe(0);
    expect(res.body.totalUsd).toBe(100);
  });

  it("(e) no-address flat fee — flat fee applied", async () => {
    computeDistrictFeeUsdMock.mockReturnValue(35);

    const app = await buildApp();
    const res = await request(app)
      .post("/checkout/fees")
      .send({ items: BASE_ITEMS, currency: "USD", noAddress: true });

    expect(res.status).toBe(200);
    expect(res.body.districtFeeUsd).toBe(35);
    expect(res.body.totalUsd).toBe(135);
    expect(computeDistrictFeeUsdMock).toHaveBeenCalledWith("Beirut", 100, true);
  });

  it("(f) express delivery — express surcharge included, slot fee excluded", async () => {
    computeDistrictFeeUsdMock.mockReturnValue(8);
    expressSurchargeUsdMock.mockReturnValue(5);
    getDeliverySlotsMock.mockReturnValue([{ label: "10:00 – 12:00", extraFee: 10 }]);

    const app = await buildApp();
    const res = await request(app)
      .post("/checkout/fees")
      .send({
        items: BASE_ITEMS,
        currency: "USD",
        district: "Beirut",
        expressDelivery: true,
        deliverySlot: "10:00 – 12:00",
        cityId: "1",
      });

    expect(res.status).toBe(200);
    expect(res.body.expressFeeUsd).toBe(5);
    expect(res.body.slotFeeUsd).toBe(0);
    expect(res.body.totalUsd).toBe(113);
  });

  it("(g) missing items — returns 400", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/checkout/fees")
      .send({ currency: "USD" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});
