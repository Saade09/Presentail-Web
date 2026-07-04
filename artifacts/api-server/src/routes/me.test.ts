import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Hoisted mock state — must be declared before vi.mock() factories
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  dbRows: [] as any[],
  fetchOsOrderStatus: vi.fn(),
  authenticate: vi.fn(),
  getCustomerById: vi.fn(),
  getCustomerByWcId: vi.fn(),
  resolveStoreFromRequest: vi.fn(),
  wooAuthHeader: vi.fn(),
  fetch: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: null }),
  createClerkClient: () => ({}),
}));

vi.mock("drizzle-orm", () => ({
  eq: (_col: unknown, _val: unknown) => ({}),
  desc: (_col: unknown) => ({}),
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => Promise.resolve(mocks.dbRows),
          limit: () => Promise.resolve([]),
        }),
      }),
    }),
  },
  appOrdersTable: {
    customerId: "customer_id",
    createdAt: "created_at",
  },
  customersTable: {
    id: "id",
    emailVerified: "email_verified",
  },
}));

vi.mock("../lib/auth", () => ({
  authenticate: (...args: any[]) => mocks.authenticate(...args),
}));

vi.mock("../lib/customers", () => ({
  getCustomerById: (...args: any[]) => mocks.getCustomerById(...args),
  getCustomerByWcId: (...args: any[]) => mocks.getCustomerByWcId(...args),
}));

vi.mock("@workspace/presentail-os", () => ({
  fetchOsOrderStatus: (...args: any[]) => mocks.fetchOsOrderStatus(...args),
}));

vi.mock("../lib/wooStore", () => ({
  resolveStoreFromRequest: (...args: any[]) => mocks.resolveStoreFromRequest(...args),
  wooAuthHeader: (...args: any[]) => mocks.wooAuthHeader(...args),
}));

// ---------------------------------------------------------------------------
// Import router under test (after mocks are registered)
// ---------------------------------------------------------------------------

import meRouter from "./me";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  // Attach a no-op pino-style logger so req.log?.warn?.() doesn't throw
  app.use((req, _res, next) => {
    (req as any).log = { warn: () => {}, info: () => {}, error: () => {} };
    next();
  });
  app.use(meRouter);
  return app;
}

function makeOsRow(overrides: Partial<Record<string, any>> = {}) {
  return {
    appOrderId: "LB-001",
    wcOrderId: null,
    osOrderId: "os-uuid-abc",
    state: "pending",
    recipientName: "Alice",
    deliveryDate: "2026-07-01",
    deliverySlot: "morning",
    createdAt: new Date("2026-06-28T10:00:00Z"),
    totalUsdCents: 4500,
    lineItemsJson: JSON.stringify([{ name: "Rose Bouquet", quantity: 1, priceUsdCents: 4500 }]),
    customerId: 42,
    userId: null,
    ...overrides,
  };
}

function makeWcRow(overrides: Partial<Record<string, any>> = {}) {
  return {
    appOrderId: "LB-002",
    wcOrderId: 999,
    osOrderId: null,
    state: "processing",
    recipientName: "Bob",
    deliveryDate: "2026-07-02",
    deliverySlot: "afternoon",
    createdAt: new Date("2026-06-27T12:00:00Z"),
    totalUsdCents: null,
    lineItemsJson: null,
    customerId: 42,
    userId: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup: reset per-test state
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Clear DB rows in-place
  mocks.dbRows.length = 0;

  // Reset all mock functions
  mocks.fetchOsOrderStatus.mockReset();
  mocks.authenticate.mockReset();
  mocks.getCustomerById.mockReset();
  mocks.getCustomerByWcId.mockReset();
  mocks.resolveStoreFromRequest.mockReset();
  mocks.wooAuthHeader.mockReset();
  mocks.fetch.mockReset();

  // Default: auth resolves to customer 42
  mocks.authenticate.mockResolvedValue({ ok: true, localCustomerId: 42, customerId: 42, token: "tok" });
  mocks.getCustomerById.mockResolvedValue({ id: 42 });
  mocks.getCustomerByWcId.mockResolvedValue(null);

  // Default: no WC store configured (skips WC enrichment)
  mocks.resolveStoreFromRequest.mockReturnValue({
    baseUrl: "https://woo.example.com",
    consumerKey: "",
    consumerSecret: "",
    wpBaseUrl: "https://woo.example.com",
    currency: "USD",
    countryCode: "LB",
  });

  mocks.wooAuthHeader.mockReturnValue("Basic dGVzdA==");

  // Default: OS status fetch returns null (simulates failure)
  mocks.fetchOsOrderStatus.mockResolvedValue(null);

  // Stub global fetch (used by WC enrichment)
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockResolvedValue({ ok: false });

  // Set OS API key so fetchOsOrderStatus is attempted
  process.env.PRESENTAIL_OS_API_KEY = "test-os-key";
  process.env.PRESENTAIL_OS_API_URL = "https://os.example.com";
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /me/orders — unauthenticated", () => {
  it("returns 401 when authenticate fails", async () => {
    mocks.authenticate.mockResolvedValue({ ok: false, status: 401, message: "Unauthorized" });

    const app = buildApp();
    const res = await request(app)
      .get("/me/orders")
      .set("Authorization", "Bearer bad-token");

    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });
});

describe("GET /me/orders — OS order with live status", () => {
  it("sets liveStatus:true and status from OS when fetch succeeds", async () => {
    mocks.fetchOsOrderStatus.mockResolvedValue({ status: "shipped" });
    mocks.dbRows.push(makeOsRow({ state: "pending" }));

    const app = buildApp();
    const res = await request(app)
      .get("/me/orders")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.orders).toHaveLength(1);

    const order = res.body.orders[0];
    expect(order.liveStatus).toBe(true);
    expect(order.status).toBe("shipped");
    // Stored state is still present
    expect(order.state).toBe("pending");
  });

  it("uses the live OS status even when stored state differs", async () => {
    mocks.fetchOsOrderStatus.mockResolvedValue({ status: "delivered" });
    mocks.dbRows.push(makeOsRow({ state: "processing", osOrderId: "os-uuid-xyz" }));

    const app = buildApp();
    const res = await request(app).get("/me/orders").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    const order = res.body.orders[0];
    expect(order.liveStatus).toBe(true);
    expect(order.status).toBe("delivered");
  });

  it("populates itemsCount and total from stored data", async () => {
    mocks.fetchOsOrderStatus.mockResolvedValue({ status: "confirmed" });
    mocks.dbRows.push(
      makeOsRow({
        totalUsdCents: 9000,
        lineItemsJson: JSON.stringify([
          { name: "Roses", quantity: 2, priceUsdCents: 4500 },
        ]),
      }),
    );

    const app = buildApp();
    const res = await request(app).get("/me/orders").set("Authorization", "Bearer valid-token");

    const order = res.body.orders[0];
    expect(order.total).toBe("90.00");
    expect(order.currency).toBe("USD");
    expect(order.itemsCount).toBe(2);
    expect(order.items[0].name).toBe("Roses");
  });
});

describe("GET /me/orders — OS order where status fetch fails", () => {
  it("sets liveStatus:false and falls back to stored state when OS fetch returns null", async () => {
    mocks.fetchOsOrderStatus.mockResolvedValue(null);
    mocks.dbRows.push(makeOsRow({ state: "processing" }));

    const app = buildApp();
    const res = await request(app)
      .get("/me/orders")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const order = res.body.orders[0];
    expect(order.liveStatus).toBe(false);
    // Falls back to stored state column
    expect(order.status).toBe("processing");
  });

  it("sets liveStatus:false and falls back to stored state when OS returns null for a second order", async () => {
    // fetchOsOrderStatus catches its own network errors and returns null;
    // test two different osOrderIds — one resolves, one returns null — to
    // confirm the map is keyed per-order.
    mocks.fetchOsOrderStatus.mockResolvedValue(null);
    mocks.dbRows.push(makeOsRow({ state: "pending", osOrderId: "os-uuid-null" }));

    const app = buildApp();
    const res = await request(app)
      .get("/me/orders")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    const order = res.body.orders[0];
    expect(order.liveStatus).toBe(false);
    expect(order.status).toBe("pending");
  });

  it("sets liveStatus:false and status:null when stored state is also null", async () => {
    mocks.fetchOsOrderStatus.mockResolvedValue(null);
    mocks.dbRows.push(makeOsRow({ state: null }));

    const app = buildApp();
    const res = await request(app).get("/me/orders").set("Authorization", "Bearer valid-token");

    const order = res.body.orders[0];
    expect(order.liveStatus).toBe(false);
    expect(order.status).toBeNull();
  });

  it("skips OS fetch when PRESENTAIL_OS_API_KEY is unset", async () => {
    delete process.env.PRESENTAIL_OS_API_KEY;
    mocks.dbRows.push(makeOsRow({ state: "confirmed" }));

    const app = buildApp();
    const res = await request(app).get("/me/orders").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    const order = res.body.orders[0];
    expect(order.liveStatus).toBe(false);
    expect(order.status).toBe("confirmed");
    // fetchOsOrderStatus should NOT have been called when apiKey is missing
    expect(mocks.fetchOsOrderStatus).not.toHaveBeenCalled();
  });
});

describe("GET /me/orders — WC-linked order", () => {
  beforeEach(() => {
    // Enable WC enrichment by providing a consumerKey
    mocks.resolveStoreFromRequest.mockReturnValue({
      baseUrl: "https://woo.example.com",
      consumerKey: "ck_test",
      consumerSecret: "cs_test",
      wpBaseUrl: "https://woo.example.com",
      currency: "USD",
      countryCode: "LB",
    });
  });

  it("always sets liveStatus:false for WC-linked orders", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 999,
        status: "completed",
        total: "55.00",
        currency: "USD",
        line_items: [{ name: "Lily Bouquet", quantity: 1, image: { src: "https://img.example.com/lily.jpg" } }],
      }),
    });
    mocks.dbRows.push(makeWcRow());

    const app = buildApp();
    const res = await request(app)
      .get("/me/orders")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    const order = res.body.orders[0];
    expect(order.liveStatus).toBe(false);
    expect(order.status).toBe("completed");
    expect(order.total).toBe("55.00");
    expect(order.currency).toBe("USD");
    expect(order.items[0].name).toBe("Lily Bouquet");
  });

  it("liveStatus:false even when WC fetch fails", async () => {
    mocks.fetch.mockResolvedValue({ ok: false });
    mocks.dbRows.push(makeWcRow({ state: "processing" }));

    const app = buildApp();
    const res = await request(app)
      .get("/me/orders")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    // WC fetch failed — row still returned but status comes from stored state
    const order = res.body.orders[0];
    expect(order.liveStatus).toBe(false);
  });

  it("does not call fetchOsOrderStatus for pure WC orders", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 999, status: "on-hold", total: "30.00", currency: "USD", line_items: [] }),
    });
    mocks.dbRows.push(makeWcRow());

    const app = buildApp();
    await request(app).get("/me/orders").set("Authorization", "Bearer valid-token");

    expect(mocks.fetchOsOrderStatus).not.toHaveBeenCalled();
  });
});

describe("GET /me/orders — mixed orders (OS + WC in same response)", () => {
  beforeEach(() => {
    mocks.resolveStoreFromRequest.mockReturnValue({
      baseUrl: "https://woo.example.com",
      consumerKey: "ck_test",
      consumerSecret: "cs_test",
      wpBaseUrl: "https://woo.example.com",
      currency: "USD",
      countryCode: "LB",
    });
  });

  it("enriches each order independently with correct liveStatus", async () => {
    mocks.fetchOsOrderStatus.mockResolvedValue({ status: "out_for_delivery" });
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 999,
        status: "completed",
        total: "25.00",
        currency: "USD",
        line_items: [],
      }),
    });

    mocks.dbRows.push(makeOsRow(), makeWcRow());

    const app = buildApp();
    const res = await request(app).get("/me/orders").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(2);

    const osOrder = res.body.orders.find((o: any) => o.osOrderId === "os-uuid-abc");
    const wcOrder = res.body.orders.find((o: any) => o.wcOrderId === 999);

    expect(osOrder.liveStatus).toBe(true);
    expect(osOrder.status).toBe("out_for_delivery");

    expect(wcOrder.liveStatus).toBe(false);
    expect(wcOrder.status).toBe("completed");
  });
});

describe("GET /me/orders — empty state", () => {
  it("returns an empty orders array when the customer has no orders", async () => {
    // No rows pushed — dbRows is empty
    const app = buildApp();
    const res = await request(app).get("/me/orders").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.orders).toEqual([]);
  });
});
