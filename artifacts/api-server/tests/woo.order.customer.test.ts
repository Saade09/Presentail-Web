import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────
//
// This file isolates the new customer-linking contract on /api/woo/order:
//   1. The WC POST body must carry `customer_id` (the WC mirror id returned
//      from `syncCustomerToWoo`), so the order is attached to the customer
//      record and not just stored as billing text.
//   2. The local `app_orders` row must persist the canonical `customerId`
//      from our own customers table — this is what survives WooCommerce
//      eventually being phased out.
//
// We use `paymentMethod: "whish"` (an offline method) so the route bypasses
// the card-payment verification gate; that gate is the subject of separate
// pre-existing tests and is not what we're exercising here.

const insertChain = {
  values: vi.fn().mockReturnThis(),
  onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
};
const dbMock = {
  insert: vi.fn().mockReturnValue(insertChain),
};

vi.mock("@workspace/db", () => ({
  db: dbMock,
  appOrdersTable: { appOrderId: "appOrderId" },
  pendingWooOrdersTable: { appOrderId: "appOrderId" },
  pushTokensTable: {},
}));

vi.mock("../src/lib/orderEvents", () => ({
  sendOrderEventPush: vi.fn().mockResolvedValue(undefined),
}));

const upsertCustomerMock = vi.fn();
const syncCustomerToWooMock = vi.fn();
vi.mock("../src/lib/customers", () => ({
  upsertCustomer: (...args: unknown[]) => upsertCustomerMock(...args),
  syncCustomerToWoo: (...args: unknown[]) => syncCustomerToWooMock(...args),
  getCustomerByWcId: vi.fn().mockResolvedValue(null),
}));

vi.mock("../src/lib/auth", () => ({
  authenticate: vi.fn().mockResolvedValue({
    ok: false,
    status: 401,
    message: "no auth",
  }),
}));

// FX is the identity for tests so monetary assertions are exact.
vi.mock("../src/lib/fx", () => ({
  convertFromUsd: async (usd: number) => usd,
  normalizeCurrency: () => "USD",
  roundForCurrency: (v: number) => Math.round(v * 100) / 100,
}));

// ─── Harness ────────────────────────────────────────────────────────────────

let app: Express;
let fetchSpy: ReturnType<typeof vi.spyOn>;
const wcRequests: Array<{ url: string; init: RequestInit }> = [];

beforeEach(async () => {
  vi.clearAllMocks();
  wcRequests.length = 0;

  upsertCustomerMock.mockResolvedValue({
    customer: {
      id: 7,
      email: "jane@example.com",
      wcCustomerId: 777,
    },
    created: false,
  });
  syncCustomerToWooMock.mockResolvedValue(777);

  // Route URL by suffix:
  //   /products/<id>  → catalog price lookup (USD)
  //   /orders         → the actual WC order create
  fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url, init) => {
      const u = String(url);
      wcRequests.push({ url: u, init: init ?? {} });
      if (u.includes("/products/")) {
        return new Response(
          JSON.stringify({ id: 99, price: "50.00", name: "Bouquet" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      // Default: order creation success.
      return new Response(
        JSON.stringify({ id: 12345, order_key: "wc_order_abc" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

  const mod = await import("../src/routes/woo");
  app = express();
  app.use(express.json());
  app.use("/api", mod.default);
});

afterEach(() => {
  fetchSpy.mockRestore();
  vi.resetModules();
});

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    orderId: "PR-CUST-1",
    items: [{ name: "Bouquet", quantity: 1, price: 50, wcId: 99 }],
    billing: {
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      phone: "+961 70 000 000",
    },
    recipient: {
      firstName: "John",
      lastName: "Smith",
      phone: "+961 71 111 111",
    },
    district: "Beirut",
    districtFee: 8,
    expressFee: 0,
    deliveryDetails: "Some street",
    deliveryDate: "2026-05-10",
    deliverySlot: "9:00 AM – 2:00 PM",
    paymentMethod: "whish",
    ...overrides,
  };
}

describe("POST /api/woo/order — customer linking", () => {
  it("forwards customer_id to WooCommerce and persists customerId locally", async () => {
    const res = await request(app)
      .post("/api/woo/order")
      .send(basePayload());

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // ── Contract 1: WC body carries `customer_id` from the synced mirror.
    const orderReq = wcRequests.find((r) => r.url.endsWith("/orders"));
    expect(orderReq).toBeDefined();
    const sent = JSON.parse(String(orderReq!.init.body));
    expect(sent.customer_id).toBe(777);

    // ── Contract 2: appOrders row persists the canonical local customerId.
    // recordSuccessfulWcOrder is fire-and-forget; flush microtasks first.
    await new Promise((r) => setImmediate(r));
    expect(dbMock.insert).toHaveBeenCalled();
    const inserted = insertChain.values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted).toBeDefined();
    expect(inserted.customerId).toBe(7);
    expect(inserted.appOrderId).toBe("PR-CUST-1");

    // ── Sanity: the route invoked both upsert + WC sync exactly once.
    expect(upsertCustomerMock).toHaveBeenCalledTimes(1);
    // syncCustomerToWoo now receives the resolved store config as the
    // second argument so it talks to the right WC instance for the
    // delivery country. The first argument remains the local customer id.
    expect(syncCustomerToWooMock).toHaveBeenCalledWith(7, expect.any(Object));
  });

  it("returns 502 customer_sync_failed when the WC mirror sync throws", async () => {
    syncCustomerToWooMock.mockRejectedValueOnce(new Error("WC down"));

    const res = await request(app)
      .post("/api/woo/order")
      .send(basePayload({ orderId: "PR-CUST-2" }));

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({
      ok: false,
      code: "customer_sync_failed",
    });
    // We must not have proceeded to create a WC order without a mirror id.
    expect(wcRequests.find((r) => r.url.endsWith("/orders"))).toBeUndefined();
  });
});
