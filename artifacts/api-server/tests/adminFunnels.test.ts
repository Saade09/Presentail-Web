import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { aggregateDailyPurchaseBuckets } from "../src/lib/checkoutPurchaseFunnelMonitor";
import { aggregateDailyLoginBuckets } from "../src/lib/checkoutLoginFunnelMonitor";

vi.mock("../src/lib/checkoutPurchaseFunnelMonitor", async () => {
  const actual = await vi.importActual<
    typeof import("../src/lib/checkoutPurchaseFunnelMonitor")
  >("../src/lib/checkoutPurchaseFunnelMonitor");
  return {
    ...actual,
    loadDailyPurchaseBuckets: vi.fn(),
  };
});
vi.mock("../src/lib/checkoutLoginFunnelMonitor", async () => {
  const actual = await vi.importActual<
    typeof import("../src/lib/checkoutLoginFunnelMonitor")
  >("../src/lib/checkoutLoginFunnelMonitor");
  return {
    ...actual,
    loadDailyLoginBuckets: vi.fn(),
  };
});

const { loadDailyPurchaseBuckets } = await import(
  "../src/lib/checkoutPurchaseFunnelMonitor"
);
const { loadDailyLoginBuckets } = await import(
  "../src/lib/checkoutLoginFunnelMonitor"
);
const adminFunnelsRouter = (await import("../src/routes/adminFunnels"))
  .default;

describe("aggregateDailyPurchaseBuckets", () => {
  it("groups counts by day + platform and reuses the per-day aggregator", () => {
    const buckets = aggregateDailyPurchaseBuckets([
      { day: "2026-05-10", name: "cart_viewed", platform: "ios", count: 100 },
      { day: "2026-05-10", name: "checkout_started", platform: "ios", count: 40 },
      { day: "2026-05-10", name: "payment_method_selected", platform: "ios", count: 25 },
      { day: "2026-05-10", name: "order_placed", platform: "ios", count: 10 },
      { day: "2026-05-11", name: "cart_viewed", platform: "ios", count: 50 },
      { day: "2026-05-11", name: "cart_viewed", platform: "web", count: 80 },
    ]);
    // Newest day first.
    expect(buckets.map((b) => `${b.day}:${b.platform}`)).toEqual([
      "2026-05-11:ios",
      "2026-05-11:web",
      "2026-05-10:ios",
    ]);
    const may10ios = buckets.find(
      (b) => b.day === "2026-05-10" && b.platform === "ios",
    )!;
    expect(may10ios.cartViewed).toBe(100);
    expect(may10ios.checkoutStarted).toBe(40);
    expect(may10ios.paymentMethodSelected).toBe(25);
    expect(may10ios.orderPlaced).toBe(10);
  });
});

describe("aggregateDailyLoginBuckets", () => {
  it("groups by day + platform + surface and folds actions into bucket fields", () => {
    const buckets = aggregateDailyLoginBuckets([
      {
        day: "2026-05-10",
        name: "checkout_login_prompt_viewed",
        platform: "ios",
        surface: "cart",
        action: null,
        count: 100,
      },
      {
        day: "2026-05-10",
        name: "checkout_login_prompt_action",
        platform: "ios",
        surface: "cart",
        action: "guest",
        count: 30,
      },
      {
        day: "2026-05-10",
        name: "checkout_login_prompt_action",
        platform: "ios",
        surface: "cart",
        action: "google",
        count: 5,
      },
    ]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({
      day: "2026-05-10",
      platform: "ios",
      surface: "cart",
      viewed: 100,
      guest: 30,
      signin: 5,
    });
  });
});

describe("admin funnels routes", () => {
  function makeApp() {
    const app = express();
    app.use("/api", adminFunnelsRouter);
    return app;
  }

  it("rejects /data without a matching admin token", async () => {
    process.env.PUSH_ADMIN_TOKEN = "secret-test-token";
    const app = makeApp();
    const noToken = await request(app).get("/api/admin/funnels/data");
    expect(noToken.status).toBe(401);
    const wrongToken = await request(app)
      .get("/api/admin/funnels/data")
      .set("x-push-admin-token", "wrong");
    expect(wrongToken.status).toBe(401);
  });

  it("rejects /data when PUSH_ADMIN_TOKEN is unset (fail-closed)", async () => {
    delete process.env.PUSH_ADMIN_TOKEN;
    const app = makeApp();
    const res = await request(app)
      .get("/api/admin/funnels/data")
      .set("x-push-admin-token", "anything");
    expect(res.status).toBe(401);
  });

  it("returns shaped rows + clamps days to the 30-day max", async () => {
    process.env.PUSH_ADMIN_TOKEN = "secret-test-token";
    (loadDailyPurchaseBuckets as any).mockResolvedValueOnce([
      {
        day: "2026-05-11",
        platform: "ios",
        cartViewed: 200,
        checkoutStarted: 80,
        paymentMethodSelected: 40,
        orderPlaced: 20,
      },
    ]);
    (loadDailyLoginBuckets as any).mockResolvedValueOnce([
      {
        day: "2026-05-11",
        platform: "web",
        surface: "cart",
        viewed: 100,
        signin: 25,
        guest: 50,
        dismissed: 25,
        other: 0,
      },
    ]);
    const app = makeApp();
    const res = await request(app)
      .get("/api/admin/funnels/data?days=999")
      .set("x-push-admin-token", "secret-test-token");
    expect(res.status).toBe(200);
    expect(res.body.days).toBe(30);
    expect(res.body.purchase[0]).toMatchObject({
      day: "2026-05-11",
      platform: "ios",
      cartViewed: 200,
      cartToCheckoutPct: 40,
      checkoutToPaymentPct: 50,
      paymentToOrderPct: 50,
      cartToOrderPct: 10,
    });
    expect(res.body.login[0]).toMatchObject({
      day: "2026-05-11",
      platform: "web",
      surface: "cart",
      viewed: 100,
      signinPct: 25,
      guestPct: 50,
      dismissedPct: 25,
    });
    // Date window is exactly `days` UTC days wide, ending at start-of-today.
    const start = new Date(res.body.rangeStartUtc);
    const end = new Date(res.body.rangeEndUtc);
    expect((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)).toBe(30);
  });

  it("returns an empty payload when no events are present (no zero-division)", async () => {
    process.env.PUSH_ADMIN_TOKEN = "secret-test-token";
    (loadDailyPurchaseBuckets as any).mockResolvedValueOnce([]);
    (loadDailyLoginBuckets as any).mockResolvedValueOnce([]);
    const app = makeApp();
    const res = await request(app)
      .get("/api/admin/funnels/data")
      .set("x-push-admin-token", "secret-test-token");
    expect(res.status).toBe(200);
    expect(res.body.days).toBe(14);
    expect(res.body.purchase).toEqual([]);
    expect(res.body.login).toEqual([]);
  });

  it("serves the HTML dashboard shell without auth (no data is exposed)", async () => {
    const app = makeApp();
    const res = await request(app).get("/api/admin/funnels");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.text).toContain("Checkout Funnels");
    // Must not embed the admin token anywhere in the page.
    expect(res.text).not.toContain("secret-test-token");
  });
});
