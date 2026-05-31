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
vi.mock("../src/lib/upsellAggregator", async () => {
  const actual = await vi.importActual<
    typeof import("../src/lib/upsellAggregator")
  >("../src/lib/upsellAggregator");
  return {
    ...actual,
    loadDailyUpsellTabBuckets: vi.fn().mockResolvedValue([]),
    loadDailyUpsellItemBuckets: vi.fn().mockResolvedValue([]),
    loadDailyUpsellCheckoutBuckets: vi.fn().mockResolvedValue([]),
    loadDailyOrdersByPlatform: vi.fn().mockResolvedValue([]),
    buildUpsellToOrderBySession: vi.fn().mockResolvedValue([]),
  };
});
vi.mock("../src/lib/osProductsCache", async () => {
  const actual = await vi.importActual<
    typeof import("../src/lib/osProductsCache")
  >("../src/lib/osProductsCache");
  return {
    ...actual,
    getOsProducts: vi.fn().mockReturnValue(null),
  };
});
vi.mock("../src/lib/fx", async () => {
  const actual = await vi.importActual<
    typeof import("../src/lib/fx")
  >("../src/lib/fx");
  return {
    ...actual,
    getRates: vi.fn().mockResolvedValue({
      base: "USD",
      source: "fallback",
      fetchedAt: Date.now(),
      rates: {
        USD: 1,
        AED: 3.673,
        EUR: 0.92,
        GBP: 0.78,
        CAD: 1.37,
        AUD: 1.5,
        QAR: 3.64,
        SAR: 3.75,
        KWD: 0.307,
        OMR: 0.384,
        CHF: 0.88,
        LBP: 89_500,
      },
    }),
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
const {
  loadDailyUpsellTabBuckets,
  loadDailyUpsellItemBuckets,
  loadDailyUpsellCheckoutBuckets,
  loadDailyOrdersByPlatform,
  buildUpsellToOrderBySession,
} = await import("../src/lib/upsellAggregator");
const { getOsProducts } = await import("../src/lib/osProductsCache");
const adminFunnelsRouter = (await import("../src/routes/adminFunnels"))
  .default;

// Relative-date helpers — keeps tests green on any calendar date.
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
// DAY_A is the "older" of two test days; DAY_B is the "newer" one.
// They sort correctly as YYYY-MM-DD strings (DAY_A < DAY_B).
const DAY_A = daysAgo(2);
const DAY_B = daysAgo(1);

describe("aggregateDailyPurchaseBuckets", () => {
  it("groups counts by day + platform and reuses the per-day aggregator", () => {
    const buckets = aggregateDailyPurchaseBuckets([
      { day: DAY_A, name: "cart_viewed", platform: "ios", count: 100 },
      { day: DAY_A, name: "checkout_started", platform: "ios", count: 40 },
      { day: DAY_A, name: "payment_method_selected", platform: "ios", count: 25 },
      { day: DAY_A, name: "order_placed", platform: "ios", count: 10 },
      { day: DAY_B, name: "cart_viewed", platform: "ios", count: 50 },
      { day: DAY_B, name: "cart_viewed", platform: "web", count: 80 },
    ]);
    // Newest day first.
    expect(buckets.map((b) => `${b.day}:${b.platform}`)).toEqual([
      `${DAY_B}:ios`,
      `${DAY_B}:web`,
      `${DAY_A}:ios`,
    ]);
    const may10ios = buckets.find(
      (b) => b.day === DAY_A && b.platform === "ios",
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
        { day: DAY_B, name: "order_placed", platform: "ios", count: 3 },
        { day: DAY_B, name: "order_placed", platform: "web", count: 2 },
      ],
      [
        { day: DAY_B, platform: "ios", revenueUsdCents: 12345 },
        { day: DAY_B, platform: "web", revenueUsdCents: 6789 },
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
      [{ day: DAY_B, platform: "ios", revenueUsdCents: 5000 }],
    );
    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({
      day: DAY_B,
      platform: "ios",
      cartViewed: 0,
      orderPlaced: 0,
      revenueUsd: 50,
    });
  });

  it("collapses null platform on app_orders to the same 'unknown' bucket as analytics events", () => {
    const buckets = aggregateDailyPurchaseBuckets(
      [
        { day: DAY_B, name: "order_placed", platform: null, count: 1 },
      ],
      [{ day: DAY_B, platform: null, revenueUsdCents: 4200 }],
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
        day: DAY_A,
        name: "checkout_login_prompt_viewed",
        platform: "ios",
        surface: "cart",
        action: null,
        count: 100,
      },
      {
        day: DAY_A,
        name: "checkout_login_prompt_action",
        platform: "ios",
        surface: "cart",
        action: "guest",
        count: 30,
      },
      {
        day: DAY_A,
        name: "checkout_login_prompt_action",
        platform: "ios",
        surface: "cart",
        action: "google",
        count: 5,
      },
    ]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({
      day: DAY_A,
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
      { day: DAY_A, platform: "ios", action: "google", errorCode: "DEVELOPER_ERROR", count: 4 },
      { day: DAY_A, platform: "ios", action: "google", errorCode: "-61440", count: 2 },
      { day: DAY_A, platform: "android", action: "google", errorCode: "DEVELOPER_ERROR", count: 1 },
      { day: DAY_B, platform: "ios", action: "apple", errorCode: "no_identity_token", count: 3 },
    ]);
    // Newest day first; alphabetical platform within a day.
    expect(buckets.map((b) => `${b.day}:${b.platform}:${b.provider}`)).toEqual([
      `${DAY_B}:ios:apple`,
      `${DAY_A}:android:google`,
      `${DAY_A}:ios:google`,
    ]);
    const may10ios = buckets.find(
      (b) => b.day === DAY_A && b.platform === "ios",
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
          day: DAY_A,
          platform: "ios",
          provider: "google",
          total: 5,
          errorCodes: [
            { errorCode: "DEVELOPER_ERROR", count: 3 },
            { errorCode: "-61440", count: 2 },
          ],
        },
        {
          day: DAY_B,
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
      { day: DAY_A, platform: "ios", category: "general", count: 3 },
      { day: DAY_B, platform: "ios", category: "general", count: 5 },
      { day: DAY_B, platform: "ios", category: "love", count: 9 },
      { day: DAY_B, platform: "web", category: "birthday", count: 2 },
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
        day: DAY_B,
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
        day: DAY_B,
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
        day: DAY_B,
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
      { day: DAY_B, platform: "ios", category: "love", count: 4 },
      { day: DAY_B, platform: "ios", category: "general", count: 2 },
      { day: DAY_A, platform: "ios", category: "love", count: 1 },
    ]);
    const app = makeApp();
    const res = await request(app)
      .get("/api/admin/funnels/data?days=999")
      .set("x-push-admin-token", "secret-test-token");
    expect(res.status).toBe(200);
    expect(res.body.days).toBe(30);
    expect(res.body.suggestedMessages.daily).toEqual([
      { day: DAY_B, platform: "ios", category: "love", count: 4 },
      { day: DAY_B, platform: "ios", category: "general", count: 2 },
      { day: DAY_A, platform: "ios", category: "love", count: 1 },
    ]);
    // Summary sums per-(platform, category) across all days, sorted by
    // descending count within a platform.
    expect(res.body.suggestedMessages.summary).toEqual([
      { platform: "ios", category: "love", count: 5 },
      { platform: "ios", category: "general", count: 2 },
    ]);
    expect(res.body.socialFailures.daily[0]).toMatchObject({
      day: DAY_B,
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
      day: DAY_B,
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
      day: DAY_B,
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

// ── Per-store local-currency price tests ────────────────────────────────────

// Use dates within the last 7 days so they always fall inside the default
// 14-day display window (and the 7-day prior-week extension). Hardcoded
// dates eventually drift outside the window as time passes, causing the
// `r.day >= displayWindowStart` filter in buildUpsellPayload to exclude them.
// daysAgo() is defined at module scope above.
const RECENT_DAY = daysAgo(2);
const OLDER_DAY = daysAgo(3);

describe("upsell per-store local-currency prices", () => {
  // Shared test product with USD price $10.
  const PRODUCT_SLUG = "addon-flowers";
  const PRODUCT_USD = 10;

  // Known FX rates (matches the mock installed at the top of the file).
  // roundForCurrency(10 * 3.673, "AED") = 36.73
  // roundForCurrency(10 * 0.92,  "EUR") = 9.20
  // roundForCurrency(10 * 89500, "LBP") = 895000
  const EXPECTED_AED = 36.73;
  const EXPECTED_EUR = 9.20;
  const EXPECTED_LBP = 895_000;

  function makeProduct(overrides: Partial<{ id: string; name: string; price: number }> = {}) {
    return {
      id: overrides.id ?? PRODUCT_SLUG,
      name: overrides.name ?? "Flowers",
      price: overrides.price ?? PRODUCT_USD,
      images: [],
      inStock: true,
      categories: [],
      occasions: [],
      brands: [],
    };
  }

  function setupUpsellMocks({
    tabsDaily = [] as any[],
    itemsDaily = [] as any[],
    checkoutDaily = [] as any[],
    ordersDaily = [] as any[],
    sessionConversion = [] as any[],
  } = {}) {
    (loadDailyPurchaseBuckets as any).mockResolvedValueOnce([]);
    (loadDailyLoginBuckets as any).mockResolvedValueOnce([]);
    (loadDailySocialFailureBuckets as any).mockResolvedValueOnce([]);
    (loadDailySuggestedMessageBuckets as any).mockResolvedValueOnce([]);
    (loadDailyUpsellTabBuckets as any).mockResolvedValueOnce(tabsDaily);
    (loadDailyUpsellItemBuckets as any).mockResolvedValueOnce(itemsDaily);
    (loadDailyUpsellCheckoutBuckets as any).mockResolvedValueOnce(checkoutDaily);
    (loadDailyOrdersByPlatform as any).mockResolvedValueOnce(ordersDaily);
    (buildUpsellToOrderBySession as any).mockResolvedValueOnce(sessionConversion);
  }

  function makeApp() {
    const app = express();
    app.use("/api", adminFunnelsRouter);
    return app;
  }

  it("emits LBP prices for products in the Lebanon store cache", async () => {
    process.env.PUSH_ADMIN_TOKEN = "secret-test-token";
    (getOsProducts as any).mockImplementation((storeKey: string) => {
      if (storeKey === "lebanon") return [makeProduct()];
      return null;
    });
    setupUpsellMocks({
      tabsDaily: [{ day: RECENT_DAY, platform: "ios", tab: "extras", clicks: 50 }],
      itemsDaily: [{ day: RECENT_DAY, platform: "ios", tab: "extras", productId: PRODUCT_SLUG, adds: 5 }],
    });
    const res = await request(makeApp())
      .get("/api/admin/funnels/data")
      .set("x-push-admin-token", "secret-test-token");
    expect(res.status).toBe(200);
    const summary = res.body.upsell.itemAdds.summary;
    const item = summary.find((r: any) => r.productId === PRODUCT_SLUG);
    expect(item).toBeDefined();
    expect(item.prices.lebanon).toMatchObject({
      currency: "LBP",
      priceLocal: EXPECTED_LBP,
      decimals: 0,
    });
    // No AED/EUR entries when product is only in the Lebanon cache.
    expect(item.prices.dubai).toBeUndefined();
    expect(item.prices.cyprus).toBeUndefined();
  });

  it("emits AED prices for products in the UAE store caches", async () => {
    process.env.PUSH_ADMIN_TOKEN = "secret-test-token";
    (getOsProducts as any).mockImplementation((storeKey: string) => {
      if (storeKey === "dubai" || storeKey === "abudhabi") return [makeProduct()];
      return null;
    });
    setupUpsellMocks({
      tabsDaily: [{ day: RECENT_DAY, platform: "ios", tab: "extras", clicks: 50 }],
      itemsDaily: [{ day: RECENT_DAY, platform: "ios", tab: "extras", productId: PRODUCT_SLUG, adds: 5 }],
    });
    const res = await request(makeApp())
      .get("/api/admin/funnels/data")
      .set("x-push-admin-token", "secret-test-token");
    expect(res.status).toBe(200);
    const item = res.body.upsell.itemAdds.summary.find(
      (r: any) => r.productId === PRODUCT_SLUG,
    );
    expect(item).toBeDefined();
    expect(item.prices.dubai).toMatchObject({ currency: "AED", priceLocal: EXPECTED_AED, decimals: 2 });
    expect(item.prices.abudhabi).toMatchObject({ currency: "AED", priceLocal: EXPECTED_AED, decimals: 2 });
    expect(item.prices.lebanon).toBeUndefined();
    expect(item.prices.cyprus).toBeUndefined();
  });

  it("emits EUR prices for products in the Cyprus store cache", async () => {
    process.env.PUSH_ADMIN_TOKEN = "secret-test-token";
    (getOsProducts as any).mockImplementation((storeKey: string) => {
      if (storeKey === "cyprus") return [makeProduct()];
      return null;
    });
    setupUpsellMocks({
      tabsDaily: [{ day: RECENT_DAY, platform: "ios", tab: "extras", clicks: 50 }],
      itemsDaily: [{ day: RECENT_DAY, platform: "ios", tab: "extras", productId: PRODUCT_SLUG, adds: 5 }],
    });
    const res = await request(makeApp())
      .get("/api/admin/funnels/data")
      .set("x-push-admin-token", "secret-test-token");
    expect(res.status).toBe(200);
    const item = res.body.upsell.itemAdds.summary.find(
      (r: any) => r.productId === PRODUCT_SLUG,
    );
    expect(item).toBeDefined();
    expect(item.prices.cyprus).toMatchObject({ currency: "EUR", priceLocal: EXPECTED_EUR, decimals: 2 });
    expect(item.prices.lebanon).toBeUndefined();
    expect(item.prices.dubai).toBeUndefined();
  });

  it("emits all store prices when product appears in every store cache", async () => {
    process.env.PUSH_ADMIN_TOKEN = "secret-test-token";
    (getOsProducts as any).mockImplementation((_storeKey: string) => [makeProduct()]);
    setupUpsellMocks({
      tabsDaily: [{ day: RECENT_DAY, platform: "ios", tab: "extras", clicks: 50 }],
      itemsDaily: [{ day: RECENT_DAY, platform: "ios", tab: "extras", productId: PRODUCT_SLUG, adds: 5 }],
    });
    const res = await request(makeApp())
      .get("/api/admin/funnels/data")
      .set("x-push-admin-token", "secret-test-token");
    expect(res.status).toBe(200);
    const item = res.body.upsell.itemAdds.summary.find(
      (r: any) => r.productId === PRODUCT_SLUG,
    );
    expect(item).toBeDefined();
    expect(item.prices.lebanon).toMatchObject({ currency: "LBP", priceLocal: EXPECTED_LBP, decimals: 0 });
    expect(item.prices.dubai).toMatchObject({ currency: "AED", priceLocal: EXPECTED_AED, decimals: 2 });
    expect(item.prices.abudhabi).toMatchObject({ currency: "AED", priceLocal: EXPECTED_AED, decimals: 2 });
    expect(item.prices.cyprus).toMatchObject({ currency: "EUR", priceLocal: EXPECTED_EUR, decimals: 2 });
  });

  it("also populates prices on the daily item rows", async () => {
    process.env.PUSH_ADMIN_TOKEN = "secret-test-token";
    (getOsProducts as any).mockImplementation((_storeKey: string) => [makeProduct()]);
    setupUpsellMocks({
      tabsDaily: [{ day: RECENT_DAY, platform: "ios", tab: "extras", clicks: 20 }],
      itemsDaily: [{ day: RECENT_DAY, platform: "ios", tab: "extras", productId: PRODUCT_SLUG, adds: 2 }],
    });
    const res = await request(makeApp())
      .get("/api/admin/funnels/data")
      .set("x-push-admin-token", "secret-test-token");
    expect(res.status).toBe(200);
    const daily = res.body.upsell.itemAdds.daily;
    expect(daily).toHaveLength(1);
    expect(daily[0].prices.lebanon).toMatchObject({ currency: "LBP", priceLocal: EXPECTED_LBP });
    expect(daily[0].prices.cyprus).toMatchObject({ currency: "EUR", priceLocal: EXPECTED_EUR });
  });
});

// ── Session-level upsell → order conversion (route-level) ───────────────────

describe("upsell sessionConversion route response", () => {
  const PRODUCT_SLUG = "addon-flowers";

  function makeProduct(overrides: Partial<{ id: string; name: string; price: number }> = {}) {
    return {
      id: overrides.id ?? PRODUCT_SLUG,
      name: overrides.name ?? "Flowers",
      price: overrides.price ?? 10,
      images: [],
      inStock: true,
      categories: [],
      occasions: [],
      brands: [],
    };
  }

  function makeApp() {
    const app = express();
    app.use("/api", adminFunnelsRouter);
    return app;
  }

  function setupSessionMocks(sessionConversion: any[]) {
    (loadDailyPurchaseBuckets as any).mockResolvedValueOnce([]);
    (loadDailyLoginBuckets as any).mockResolvedValueOnce([]);
    (loadDailySocialFailureBuckets as any).mockResolvedValueOnce([]);
    (loadDailySuggestedMessageBuckets as any).mockResolvedValueOnce([]);
    (loadDailyUpsellTabBuckets as any).mockResolvedValueOnce([]);
    (loadDailyUpsellItemBuckets as any).mockResolvedValueOnce([]);
    (loadDailyUpsellCheckoutBuckets as any).mockResolvedValueOnce([]);
    (loadDailyOrdersByPlatform as any).mockResolvedValueOnce([]);
    (buildUpsellToOrderBySession as any).mockResolvedValueOnce(sessionConversion);
  }

  it("surfaces sessionConversion.summary with correct fields when sessions converted > 0", async () => {
    process.env.PUSH_ADMIN_TOKEN = "secret-test-token";
    (getOsProducts as any).mockImplementation((storeKey: string) => {
      if (storeKey === "lebanon") return [makeProduct()];
      return null;
    });
    setupSessionMocks([
      {
        platform: "ios",
        productId: PRODUCT_SLUG,
        sessionsWithAdd: 20,
        sessionsConverted: 8,
        sessionConversionRatePct: 40,
      },
    ]);
    const res = await request(makeApp())
      .get("/api/admin/funnels/data")
      .set("x-push-admin-token", "secret-test-token");
    expect(res.status).toBe(200);
    const summary = res.body.upsell.sessionConversion.summary;
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({
      platform: "ios",
      productId: PRODUCT_SLUG,
      sessionsWithAdd: 20,
      sessionsConverted: 8,
      sessionConversionRatePct: 40,
    });
  });

  it("surfaces sessionConversion.summary with null rate when sessionsWithAdd is 0", async () => {
    process.env.PUSH_ADMIN_TOKEN = "secret-test-token";
    (getOsProducts as any).mockReturnValue(null);
    setupSessionMocks([
      {
        platform: "web",
        productId: "add-on-candle",
        sessionsWithAdd: 0,
        sessionsConverted: 0,
        sessionConversionRatePct: null,
      },
    ]);
    const res = await request(makeApp())
      .get("/api/admin/funnels/data")
      .set("x-push-admin-token", "secret-test-token");
    expect(res.status).toBe(200);
    const summary = res.body.upsell.sessionConversion.summary;
    expect(summary).toHaveLength(1);
    expect(summary[0].sessionConversionRatePct).toBeNull();
    expect(summary[0].sessionsWithAdd).toBe(0);
  });

  it("returns an empty sessionConversion.summary when buildUpsellToOrderBySession returns []", async () => {
    process.env.PUSH_ADMIN_TOKEN = "secret-test-token";
    (getOsProducts as any).mockReturnValue(null);
    setupSessionMocks([]);
    const res = await request(makeApp())
      .get("/api/admin/funnels/data")
      .set("x-push-admin-token", "secret-test-token");
    expect(res.status).toBe(200);
    expect(res.body.upsell.sessionConversion.summary).toEqual([]);
  });

  it("attaches product name and price from the OS cache to sessionConversion rows", async () => {
    process.env.PUSH_ADMIN_TOKEN = "secret-test-token";
    (getOsProducts as any).mockImplementation((storeKey: string) => {
      if (storeKey === "lebanon") return [makeProduct({ id: PRODUCT_SLUG, name: "Flowers", price: 10 })];
      return null;
    });
    setupSessionMocks([
      {
        platform: "ios",
        productId: PRODUCT_SLUG,
        sessionsWithAdd: 5,
        sessionsConverted: 2,
        sessionConversionRatePct: 40,
      },
    ]);
    const res = await request(makeApp())
      .get("/api/admin/funnels/data")
      .set("x-push-admin-token", "secret-test-token");
    expect(res.status).toBe(200);
    const row = res.body.upsell.sessionConversion.summary[0];
    expect(row.productName).toBe("Flowers");
    expect(row.priceUsd).toBe(10);
    expect(row.prices.lebanon).toMatchObject({ currency: "LBP" });
  });

  it("uses null for productName/priceUsd when the product is not in the OS cache", async () => {
    process.env.PUSH_ADMIN_TOKEN = "secret-test-token";
    (getOsProducts as any).mockReturnValue(null);
    setupSessionMocks([
      {
        platform: "ios",
        productId: "unknown-product",
        sessionsWithAdd: 3,
        sessionsConverted: 1,
        sessionConversionRatePct: 33.3,
      },
    ]);
    const res = await request(makeApp())
      .get("/api/admin/funnels/data")
      .set("x-push-admin-token", "secret-test-token");
    expect(res.status).toBe(200);
    const row = res.body.upsell.sessionConversion.summary[0];
    expect(row.productName).toBeNull();
    expect(row.priceUsd).toBeNull();
    expect(row.prices).toEqual({});
  });
});
