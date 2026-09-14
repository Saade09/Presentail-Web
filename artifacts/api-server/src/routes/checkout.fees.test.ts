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
//   (h) Night slot with no extraFee and today's date → $5 surcharge applied
//   (i) Night slot with explicit extraFee: 7 → $7 surcharge (OS override wins)
//   (j) Non-night slot with no extraFee → $0 slot fee
//   (k) Night slot with a future date → $0 slot fee (same-day rule)
//   (l) Night slot with explicit extraFee: 0 → $5 same-day night fallback (matches client display)
//   (m) Coupon face value > product subtotal but ≤ full cart total — full coupon applied

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoist fee mocks
// ---------------------------------------------------------------------------

const {
  computeDistrictFeeUsdMock,
  expressSurchargeUsdMock,
  countryForDistrictMock,
  getDeliverySlotsMock,
  getLocalIsoMock,
  resolveOsDeliveryConfigMock,
} = vi.hoisted(() => {
  const computeDistrictFeeUsdMock = vi.fn().mockReturnValue(8);
  const expressSurchargeUsdMock = vi.fn().mockReturnValue(5);
  const countryForDistrictMock = vi.fn().mockReturnValue("LB");
  const getDeliverySlotsMock = vi.fn().mockReturnValue([]);
  const getLocalIsoMock = vi.fn().mockReturnValue("2026-07-20");
  const resolveOsDeliveryConfigMock = vi.fn().mockReturnValue(null);
  return { computeDistrictFeeUsdMock, expressSurchargeUsdMock, countryForDistrictMock, getDeliverySlotsMock, getLocalIsoMock, resolveOsDeliveryConfigMock };
});

vi.mock("@workspace/delivery", async (importActual) => {
  const actual = await importActual<typeof import("@workspace/delivery")>();
  return {
    ...actual,
    getLocalIso: getLocalIsoMock,
  };
});

vi.mock("../lib/catalog", async (importActual) => {
  const actual = await importActual<typeof import("../lib/catalog")>();
  return {
    ...actual,
    resolveCartItems: vi.fn().mockResolvedValue({
      ok: true,
      subtotalUsd: 100,
      items: [{ wcId: 42, osSlug: undefined, quantity: 1, priceUsd: 100, name: "Rose", description: "", image: "" }],
    }),
    computeDistrictFeeUsd: computeDistrictFeeUsdMock,
    expressSurchargeUsd: expressSurchargeUsdMock,
    countryForDistrict: countryForDistrictMock,
  };
});

vi.mock("../lib/osLocationsCache", () => ({
  getDeliverySlots: getDeliverySlotsMock,
  getExpressConfig: vi.fn().mockReturnValue({}),
  resolveOsDeliveryConfig: resolveOsDeliveryConfigMock,
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
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-07-20T04:00:00.000Z"));
  process.env.STRIPE_SECRET_KEY = "sk_test_fake";
  computeDistrictFeeUsdMock.mockReturnValue(8);
  expressSurchargeUsdMock.mockReturnValue(5);
  countryForDistrictMock.mockReturnValue("LB");
  getDeliverySlotsMock.mockReturnValue([]);
  resolveOsDeliveryConfigMock.mockReturnValue(null);
  getLocalIsoMock.mockReturnValue("2026-07-20");
  vi.mocked(resolveCartItems).mockResolvedValue({
    ok: true,
    subtotalUsd: 100,
    items: [{ wcId: 42, osSlug: undefined, quantity: 1, priceUsd: 100, name: "Rose", description: "", image: "" }],
  });
  vi.mocked(validateCoupon).mockResolvedValue({ valid: false, error: "invalid", message: "Invalid coupon" }); // i18n-ignore
});

afterEach(() => {
  vi.useRealTimers();
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

  it("(e) no-address toggle — normal district fee charged, no flat-fee substitution", async () => {
    computeDistrictFeeUsdMock.mockReturnValue(8);

    const app = await buildApp();
    const res = await request(app)
      .post("/checkout/fees")
      .send({ items: BASE_ITEMS, currency: "USD", noAddress: true });

    expect(res.status).toBe(200);
    // Same fee as a regular addressed order — the toggle adds $0.
    expect(res.body.districtFeeUsd).toBe(8);
    expect(res.body.totalUsd).toBe(108);
    expect(computeDistrictFeeUsdMock).toHaveBeenCalledWith("Beirut", 100);
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
    // Express replaces standard delivery: districtFeeUsd=0, expressFeeUsd=standard+surcharge=8+5=13.
    expect(res.body.districtFeeUsd).toBe(0);
    expect(res.body.expressFeeUsd).toBe(13);
    expect(res.body.slotFeeUsd).toBe(0);
    expect(res.body.totalUsd).toBe(113);
  });

  it("charges the OS Express total once below and above the free-delivery threshold", async () => {
    resolveOsDeliveryConfigMock.mockReturnValue({
      cityFeeUsd: 11,
      freeDeliveryEnabled: true,
      freeDeliveryThresholdUsd: 140,
      expressFeeTotalUsd: 15,
      expressSurchargeUsd: 0,
      expressSurchargeIsExplicit: false,
    });

    const app = await buildApp();

    vi.mocked(resolveCartItems).mockResolvedValueOnce({
      ok: true,
      subtotalUsd: 100,
      items: [{ wcId: 42, osSlug: undefined, quantity: 1, priceUsd: 100, name: "Rose", description: "", image: "" }],
    });
    const below = await request(app)
      .post("/checkout/fees")
      .send({
        items: BASE_ITEMS,
        currency: "USD",
        district: "Baabda",
        cityId: "lb-baabda",
        expressDelivery: true,
      });
    // Below threshold: Express replaces standard delivery — district fee is $0,
    // Express total is always the configured $15 regardless of the threshold.
    expect(below.status).toBe(200);
    expect(below.body.districtFeeUsd).toBe(0);
    expect(below.body.expressFeeUsd).toBe(15);
    expect(below.body.totalUsd).toBe(115);

    vi.mocked(resolveCartItems).mockResolvedValueOnce({
      ok: true,
      subtotalUsd: 220,
      items: [{ wcId: 42, osSlug: undefined, quantity: 1, priceUsd: 220, name: "Rose", description: "", image: "" }],
    });
    const above = await request(app)
      .post("/checkout/fees")
      .send({
        items: BASE_ITEMS,
        currency: "USD",
        district: "Baabda",
        cityId: "lb-baabda",
        expressDelivery: true,
      });
    // Above threshold: standard is free but Express total is still $15.
    expect(above.status).toBe(200);
    expect(above.body.districtFeeUsd).toBe(0);
    expect(above.body.expressFeeUsd).toBe(15);
    expect(above.body.totalUsd).toBe(235);
  });

  it("(g) missing items — returns 400", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/checkout/fees")
      .send({ currency: "USD" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("(h) night slot with no extraFee and today's date — $5 surcharge applied", async () => {
    computeDistrictFeeUsdMock.mockReturnValue(0);
    // Night slot: startHour=21, no extraFee configured by OS.
    getDeliverySlotsMock.mockReturnValue([
      { label: "9:00 PM – 11:00 PM", cutoffHour: 21, startHour: 21, endHour: 23 },
    ]);
    // getLocalIso returns "2026-07-20" (today) — default from beforeEach.

    const app = await buildApp();
    const res = await request(app)
      .post("/checkout/fees")
      .send({
        items: BASE_ITEMS,
        currency: "USD",
        district: "Beirut",
        deliverySlot: "9:00 PM – 11:00 PM",
        cityId: "1",
        deliveryDate: "2026-07-20",
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.slotFeeUsd).toBe(5);
    expect(res.body.totalUsd).toBe(105);
  });

  it("(i) night slot with explicit extraFee: 7 — OS override wins, returns $7", async () => {
    computeDistrictFeeUsdMock.mockReturnValue(0);
    getDeliverySlotsMock.mockReturnValue([
      { label: "9:00 PM – 11:00 PM", cutoffHour: 21, startHour: 21, endHour: 23, extraFee: 7 },
    ]);

    const app = await buildApp();
    const res = await request(app)
      .post("/checkout/fees")
      .send({
        items: BASE_ITEMS,
        currency: "USD",
        district: "Beirut",
        deliverySlot: "9:00 PM – 11:00 PM",
        cityId: "1",
        deliveryDate: "2026-07-20",
      });

    expect(res.status).toBe(200);
    expect(res.body.slotFeeUsd).toBe(7);
    expect(res.body.totalUsd).toBe(107);
  });

  it("(j) non-night slot with no extraFee — no surcharge, returns $0 slot fee", async () => {
    computeDistrictFeeUsdMock.mockReturnValue(0);
    // Morning slot: startHour=9, not a night slot.
    getDeliverySlotsMock.mockReturnValue([
      { label: "9:00 AM – 2:00 PM", cutoffHour: 9, startHour: 9, endHour: 14 },
    ]);

    const app = await buildApp();
    const res = await request(app)
      .post("/checkout/fees")
      .send({
        items: BASE_ITEMS,
        currency: "USD",
        district: "Beirut",
        deliverySlot: "9:00 AM – 2:00 PM",
        cityId: "1",
        deliveryDate: "2026-07-20",
      });

    expect(res.status).toBe(200);
    expect(res.body.slotFeeUsd).toBe(0);
    expect(res.body.totalUsd).toBe(100);
  });

  it("(k) night slot with a future date — $0 slot fee (same-day rule only)", async () => {
    computeDistrictFeeUsdMock.mockReturnValue(0);
    getDeliverySlotsMock.mockReturnValue([
      { label: "9:00 PM – 11:00 PM", cutoffHour: 21, startHour: 21, endHour: 23 },
    ]);
    // Today is "2026-07-20" but the shopper selected a future date.
    const app = await buildApp();
    const res = await request(app)
      .post("/checkout/fees")
      .send({
        items: BASE_ITEMS,
        currency: "USD",
        district: "Beirut",
        deliverySlot: "9:00 PM – 11:00 PM",
        cityId: "1",
        deliveryDate: "2026-07-21",
      });

    expect(res.status).toBe(200);
    expect(res.body.slotFeeUsd).toBe(0);
    expect(res.body.totalUsd).toBe(100);
  });

  it("(l) same-day night slot with explicit extraFee: 0 — $5 night fallback still applies (matches client display)", async () => {
    computeDistrictFeeUsdMock.mockReturnValue(0);
    // Night slot: startHour=21 with extraFee: 0. The client (displayedSlotsForDate)
    // shows the $5 same-day night fallback for such slots, so the server must
    // charge the same amount — extraFee: 0 is treated like "no real override".
    getDeliverySlotsMock.mockReturnValue([
      { label: "9:00 PM – 11:00 PM", cutoffHour: 21, startHour: 21, endHour: 23, extraFee: 0 },
    ]);
    // getLocalIso returns "2026-07-20" (today) — same-day → fallback applies.

    const app = await buildApp();
    const res = await request(app)
      .post("/checkout/fees")
      .send({
        items: BASE_ITEMS,
        currency: "USD",
        district: "Beirut",
        deliverySlot: "9:00 PM – 11:00 PM",
        cityId: "1",
        deliveryDate: "2026-07-20",
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.slotFeeUsd).toBe(5);
    expect(res.body.totalUsd).toBe(105);
  });

  it("(l2) NEXT-day night slot with explicit extraFee: 0 stays free (fallback is same-day only)", async () => {
    computeDistrictFeeUsdMock.mockReturnValue(0);
    getDeliverySlotsMock.mockReturnValue([
      { label: "9:00 PM – 11:00 PM", cutoffHour: 21, startHour: 21, endHour: 23, extraFee: 0 },
    ]);

    const app = await buildApp();
    const res = await request(app)
      .post("/checkout/fees")
      .send({
        items: BASE_ITEMS,
        currency: "USD",
        district: "Beirut",
        deliverySlot: "9:00 PM – 11:00 PM",
        cityId: "1",
        deliveryDate: "2026-07-21",
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.slotFeeUsd).toBe(0);
    expect(res.body.totalUsd).toBe(100);
  });

  it("(n) premium slot fee — districtFee + slotFee components sum to the combined delivery total", async () => {
    // AED-5 regression root cause: the client used to show districtFeeUsd and slotFeeUsd
    // as two separately-formatted amounts (each rounded independently to nearest 5 AED),
    // which can diverge from formatting the combined USD total once.
    // The server /checkout/fees correctly sums all USD components first, then rounds.
    // This test verifies that districtFeeUsd + slotFeeUsd == deliveryFeeUsd contribution
    // to totalUsd, so any future change that double-rounds components will be caught.
    computeDistrictFeeUsdMock.mockReturnValue(15);
    getDeliverySlotsMock.mockReturnValue([
      // A paid evening slot with explicit extraFee (avoids midnight city-eligibility checks
      // while still exercising the district + slot fee combination).
      { label: "9 PM – 11 PM", startHour: 21, endHour: 23, cutoffHour: 19, extraFee: 20, sameDayEnabled: true },
    ]);

    const app = await buildApp();
    const res = await request(app)
      .post("/checkout/fees")
      .send({
        items: BASE_ITEMS,
        currency: "USD",
        district: "Beirut",
        deliverySlot: "9 PM – 11 PM",
        cityId: "1",
        deliveryDate: "2026-07-20", // today (same as mocked getLocalIso)
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // District fee and slot upgrade fee reported separately.
    expect(res.body.districtFeeUsd).toBe(15);
    expect(res.body.slotFeeUsd).toBe(20);
    expect(res.body.expressFeeUsd).toBe(0);
    // Combined delivery total = district + slot.
    expect(res.body.totalUsd).toBe(135); // 100 subtotal + 15 district + 20 slot
    // The two components must sum exactly to the delivery contribution in totalUsd —
    // the server never rounds them independently before summing.
    expect(res.body.districtFeeUsd + res.body.slotFeeUsd).toBe(35);
  });

  it("(n) express delivery with noAddress — express surcharge still charged (noAddress toggle does not waive the fee)", async () => {
    expressSurchargeUsdMock.mockReturnValue(5);
    computeDistrictFeeUsdMock.mockReturnValue(8);

    const app = await buildApp();
    const res = await request(app)
      .post("/checkout/fees")
      .send({
        items: BASE_ITEMS,
        currency: "USD",
        district: "Beirut",
        expressDelivery: true,
        noAddress: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.expressFeeUsd).toBe(5);
    expect(res.body.totalUsd).toBe(113); // 100 subtotal + 8 district + 5 express
  });

  it("(m) coupon face value > product subtotal but ≤ full cart total — validateCoupon receives full cart total and full discount applied", async () => {
    // Product subtotal: $10, delivery fee: $8, full cart total: $18.
    // Coupon face value: $15 — exceeds the $10 subtotal but is within the $18 full total.
    // Before the fix, cartTotalUsd=$10 would be sent to OS, capping the discount at $10.
    // After the fix, cartTotalUsd=$18 is sent, so OS returns the full $15 discount.
    vi.mocked(resolveCartItems).mockResolvedValue({
      ok: true,
      subtotalUsd: 10,
      items: [{ wcId: 42, osSlug: undefined, quantity: 1, priceUsd: 10, name: "Rose", description: "", image: "" }],
    });
    computeDistrictFeeUsdMock.mockReturnValue(8);
    vi.mocked(validateCoupon).mockResolvedValue({
      valid: true,
      couponId: "AMER100",
      discountType: "fixed",
      discountValue: 15,
      discountAmountUsd: 15,
      finalTotalUsd: 3,
    });

    const app = await buildApp();
    const res = await request(app)
      .post("/checkout/fees")
      .send({ items: BASE_ITEMS, currency: "USD", district: "Beirut", couponCode: "AMER100" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.subtotalUsd).toBe(10);
    expect(res.body.districtFeeUsd).toBe(8);
    // Full $15 discount applied — not capped at the $10 product subtotal.
    expect(res.body.couponDiscountUsd).toBe(15);
    expect(res.body.totalUsd).toBe(3); // 10 + 8 - 15

    // Verify validateCoupon was called with the full cart total (products + delivery).
    expect(vi.mocked(validateCoupon)).toHaveBeenCalledWith(
      "AMER100",
      expect.objectContaining({ cartTotalUsd: 18 }),
    );
  });
});
