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
vi.mock("../src/lib/socialAuthFailureAggregator", async () => {
  const actual = await vi.importActual<
    typeof import("../src/lib/socialAuthFailureAggregator")
  >("../src/lib/socialAuthFailureAggregator");
  return {
    ...actual,
    loadDailySocialFailureBuckets: vi.fn(),
  };
});
vi.mock("../src/lib/suggestedMessagesAggregator", async () => {
  const actual = await vi.importActual<
    typeof import("../src/lib/suggestedMessagesAggregator")
  >("../src/lib/suggestedMessagesAggregator");
  return {
    ...actual,
    loadDailySuggestedMessageBuckets: vi.fn(),
  };
});

const { loadDailyPurchaseBuckets } = await import(
  "../src/lib/checkoutPurchaseFunnelMonitor"
);
const { loadDailyLoginBuckets } = await import(
  "../src/lib/checkoutLoginFunnelMonitor"
);
const {
  loadDailySocialFailureBuckets,
  aggregateBuckets: aggregateSocialBuckets,
  aggregateDailySocialFailureBuckets,
  summariseDailyBuckets,
} = await import("../src/lib/socialAuthFailureAggregator");
const {
  loadDailySuggestedMessageBuckets,
  summariseSuggestedMessageBuckets,
} = await import("../src/lib/suggestedMessagesAggregator");
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
    // Revenue defaults to 0 when no app_orders rows are passed.
    expect(may10ios.revenueUsd).toBe(0);
  });

  it("attaches USD revenue from app_orders to the matching (day, platform) bucket", () => {
    const buckets = aggregateDailyPurchaseBuckets(
      [
        { day: "2026-05-11", name: "order_placed", platform: "ios", count: 3 },
        { day: "2026-05-11", name: "order_placed", platform: "web", count: 2 },
      ],
      [
        { day: "2026-05-11", platform: "ios", revenueUsdCents: 12345 },
        { day: "2026-05-11", platform: "web", revenueUsdCents: 6789 },
      ],
    );
    const ios = buckets.find((b) => b.platform === "ios")!;
    const web = buckets.find((b) => b.platform === "web")!;
    expect(ios.revenueUsd).toBeCloseTo(123.45);
    expect(web.revenueUsd).toBeCloseTo(67.89);
  });

  it("materialises a revenue-only bucket when orders exist without analytics events", () => {
    const buckets = aggregateDailyPurchaseBuckets(
      [],
      [{ day: "2026-05-11", platform: "ios", revenueUsdCents: 5000 }],
    );
    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({
      day: "2026-05-11",
      platform: "ios",
      cartViewed: 0,
      orderPlaced: 0,
      revenueUsd: 50,
    });
  });

  it("collapses null platform on app_orders to the same 'unknown' bucket as analytics events", () => {
    const buckets = aggregateDailyPurchaseBuckets(
      [
        { day: "2026-05-11", name: "order_placed", platform: null, count: 1 },
      ],
      [{ day: "2026-05-11", platform: null, revenueUsdCents: 4200 }],
    );
    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({
      platform: "unknown",
      orderPlaced: 1,
      revenueUsd: 42,
    });
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

describe("aggregateDailySocialFailureBuckets", () => {
  it("groups by (day, platform, provider) and ranks error codes desc", () => {
    const buckets = aggregateDailySocialFailureBuckets([
      { day: "2026-05-10", platform: "ios", action: "google", errorCode: "DEVELOPER_ERROR", count: 4 },
      { day: "2026-05-10", platform: "ios", action: "google", errorCode: "-61440", count: 2 },
      { day: "2026-05-10", platform: "android", action: "google", errorCode: "DEVELOPER_ERROR", count: 1 },
      { day: "2026-05-11", platform: "ios", action: "apple", errorCode: "no_identity_token", count: 3 },
    ]);
    // Newest day first; alphabetical platform within a day.
    expect(buckets.map((b) => `${b.day}:${b.platform}:${b.provider}`)).toEqual([
      "2026-05-11:ios:apple",
      "2026-05-10:android:google",
      "2026-05-10:ios:google",
    ]);
    const may10ios = buckets.find(
      (b) => b.day === "2026-05-10" && b.platform === "ios",
    )!;
    expect(may10ios.total).toBe(6);
    expect(may10ios.errorCodes).toEqual([
      { errorCode: "DEVELOPER_ERROR", count: 4 },
      { errorCode: "-61440", count: 2 },
    ]);
  });

  it("collapses null platform/provider/errorCode to 'unknown'", () => {
    const buckets = aggregateSocialBuckets([
      { platform: null, action: null, errorCode: null, count: 2 },
    ]);
    expect(buckets).toEqual([
      {
        platform: "unknown",
        provider: "unknown",
        total: 2,
        errorCodes: [{ errorCode: "unknown", count: 2 }],
      },
    ]);
  });
});

describe("summariseDailyBuckets", () => {
  it("sums across days and caps the per-bucket error-code list", () => {
    const summary = summariseDailyBuckets(
      [
        {
          day: "2026-05-10",
          platform: "ios",
          provider: "google",
          total: 5,
          errorCodes: [
            { errorCode: "DEVELOPER_ERROR", count: 3 },
            { errorCode: "-61440", count: 2 },
          ],
        },
        {
          day: "2026-05-11",
          platform: "ios",
          provider: "google",
          total: 4,
          errorCodes: [
            { errorCode: "DEVELOPER_ERROR", count: 1 },
            { errorCode: "no_id_token", count: 3 },
          ],
        },
      ],
      2,
    );
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({
      platform: "ios",
      provider: "google",
      total: 9,
    });
    expect(summary[0].errorCodes).toEqual([
      { errorCode: "DEVELOPER_ERROR", count: 4 },
      { errorCode: "no_id_token", count: 3 },
    ]);
  });
});

describe("summariseSuggestedMessageBuckets", () => {
  it("sums picks across days per (platform, category) and sorts by descending count", () => {
    const summary = summariseSuggestedMessageBuckets([
      { day: "2026-05-10", platform: "ios", category: "general", count: 3 },
      { day: "2026-05-11", platform: "ios", category: "general", count: 5 },
      { day: "2026-05-11", platform: "ios", category: "love", count: 9 },
      { day: "2026-05-11", platform: "web", category: "birthday", count: 2 },
    ]);
    // Same platform: highest count first.
    const ios = summary.filter((b) => b.platform === "ios");
    expect(ios).toEqual([
      { platform: "ios", category: "love", count: 9 },
      { platform: "ios", category: "general", count: 8 },
    ]);
    const web = summary.filter((b) => b.platform === "web");
    expect(web).toEqual([{ platform: "web", category: "birthday", count: 2 }]);
  });

  it("returns an empty array when there are no daily rows", () => {
    expect(summariseSuggestedMessageBuckets([])).toEqual([]);
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
        revenueUsd: 1234.56,
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
    (loadDailySocialFailureBuckets as any).mockResolvedValueOnce([
      {
        day: "2026-05-11",
        platform: "ios",
        provider: "google",
        total: 7,
        errorCodes: [
          { errorCode: "DEVELOPER_ERROR", count: 4 },
          { errorCode: "-61440", count: 3 },
        ],
      },
    ]);
    (loadDailySuggestedMessageBuckets as any).mockResolvedValueOnce([
      { day: "2026-05-11", platform: "ios", category: "love", count: 4 },
      { day: "2026-05-11", platform: "ios", category: "general", count: 2 },
      { day: "2026-05-10", platform: "ios", category: "love", count: 1 },
    ]);
    const app = makeApp();
    const res = await request(app)
      .get("/api/admin/funnels/data?days=999")
      .set("x-push-admin-token", "secret-test-token");
    expect(res.status).toBe(200);
    expect(res.body.days).toBe(30);
    expect(res.body.suggestedMessages.daily).toEqual([
      { day: "2026-05-11", platform: "ios", category: "love", count: 4 },
      { day: "2026-05-11", platform: "ios", category: "general", count: 2 },
      { day: "2026-05-10", platform: "ios", category: "love", count: 1 },
    ]);
    // Summary sums per-(platform, category) across all days, sorted by
    // descending count within a platform.
    expect(res.body.suggestedMessages.summary).toEqual([
      { platform: "ios", category: "love", count: 5 },
      { platform: "ios", category: "general", count: 2 },
    ]);
    expect(res.body.socialFailures.daily[0]).toMatchObject({
      day: "2026-05-11",
      platform: "ios",
      provider: "google",
      total: 7,
      topErrorCodes: [
        { errorCode: "DEVELOPER_ERROR", count: 4 },
        { errorCode: "-61440", count: 3 },
      ],
    });
    expect(res.body.socialFailures.summary).toEqual([
      {
        platform: "ios",
        provider: "google",
        total: 7,
        topErrorCodes: [
          { errorCode: "DEVELOPER_ERROR", count: 4 },
          { errorCode: "-61440", count: 3 },
        ],
      },
    ]);
    expect(res.body.purchase[0]).toMatchObject({
      day: "2026-05-11",
      platform: "ios",
      cartViewed: 200,
      cartToCheckoutPct: 40,
      checkoutToPaymentPct: 50,
      paymentToOrderPct: 50,
      cartToOrderPct: 10,
      // Wire payload rounds to whole USD (no point shipping pennies for a
      // per-day per-platform overview).
      revenueUsd: 1235,
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
    (loadDailySocialFailureBuckets as any).mockResolvedValueOnce([]);
    (loadDailySuggestedMessageBuckets as any).mockResolvedValueOnce([]);
    const app = makeApp();
    const res = await request(app)
      .get("/api/admin/funnels/data")
      .set("x-push-admin-token", "secret-test-token");
    expect(res.status).toBe(200);
    expect(res.body.days).toBe(14);
    expect(res.body.purchase).toEqual([]);
    expect(res.body.login).toEqual([]);
    expect(res.body.socialFailures).toEqual({ summary: [], daily: [] });
    expect(res.body.suggestedMessages).toEqual({ summary: [], daily: [] });
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
