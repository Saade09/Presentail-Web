import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Module mocks ----------------------------------------------------------
//
// The /woo/order route pulls in the Drizzle client, the push-notification
// helper, and the FX rate fetcher. None of those should run for real in a
// unit/integration test — we mock them so the suite is hermetic and fast.

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
  pushTokensTable: {},
}));

vi.mock("../src/lib/orderEvents", () => ({
  sendOrderEventPush: vi.fn().mockResolvedValue(undefined),
}));

// The customer upsert + WC sync layer is exercised by its own tests; here
// we stub it to return a stable mirror id so /woo/order can proceed.
vi.mock("../src/lib/customers", () => ({
  upsertCustomer: vi.fn().mockResolvedValue({
    customer: { id: 7, wcCustomerId: 777, email: "jane@example.com" },
    created: false,
  }),
  syncCustomerToWoo: vi.fn().mockResolvedValue(777),
  getCustomerByWcId: vi.fn().mockResolvedValue(null),
}));

const authenticateMock = vi.fn();
vi.mock("../src/lib/auth", () => ({
  authenticate: (...args: unknown[]) => authenticateMock(...args),
}));

// Pretend FX is the identity for tests so we can assert exact monetary
// values forwarded to WooCommerce without dragging in a live rate fetch.
vi.mock("../src/lib/fx", async () => {
  return {
    convertFromUsd: async (usd: number) => usd,
    normalizeCurrency: (v: unknown) =>
      typeof v === "string" && v.length === 3 ? v.toUpperCase() : "USD",
    roundForCurrency: (v: number) => Math.round(v * 100) / 100,
  };
});

// --- App harness -----------------------------------------------------------

let app: Express;
let wooRouter: express.IRouter;
let fetchSpy: ReturnType<typeof vi.spyOn>;
let lastWcRequest: { url: string; init: RequestInit } | null = null;

beforeEach(async () => {
  vi.clearAllMocks();
  lastWcRequest = null;

  // Default: WC accepts the order. Individual tests can override.
  fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url, init) => {
      lastWcRequest = { url: String(url), init: init ?? {} };
      return new Response(
        JSON.stringify({ id: 12345, order_key: "wc_order_abc" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

  // Re-import the router fresh so the env var checks run with our setup.
  const mod = await import("../src/routes/woo");
  wooRouter = mod.default;

  app = express();
  app.use(express.json());
  app.use("/api", wooRouter);
});

afterEach(() => {
  fetchSpy.mockRestore();
  vi.resetModules();
});

// Minimal valid payload — every test starts from this and overrides only
// the fields it cares about. Keeping the base in one place avoids drift.
function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    orderId: "PR-123456",
    items: [
      { name: "Bouquet", quantity: 1, price: 50, wcId: 99 },
    ],
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
    paymentMethod: "card",
    appDeviceId: "device-abc",
    ...overrides,
  };
}

describe("POST /api/woo/order — Zod validation", () => {
  it("rejects an empty body with 400 and surfaces zod issues", async () => {
    const res = await request(app).post("/api/woo/order").send({});
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(Array.isArray(res.body.issues)).toBe(true);
    // No outbound WC call should have happened on validation failure.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects an invalid email", async () => {
    const res = await request(app)
      .post("/api/woo/order")
      .send(basePayload({ billing: { firstName: "J", lastName: "D", email: "not-an-email", phone: "+1" } }));
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("rejects a non-ISO-2 country code", async () => {
    const res = await request(app)
      .post("/api/woo/order")
      .send(basePayload({ billingCountry: "USA" }));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown payment method", async () => {
    const res = await request(app)
      .post("/api/woo/order")
      .send(basePayload({ paymentMethod: "bitcoin" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/woo/order — country forwarding", () => {
  it("forwards billingCountry/shippingCountry to WooCommerce when supplied", async () => {
    const res = await request(app)
      .post("/api/woo/order")
      .send(
        basePayload({ billingCountry: "AE", shippingCountry: "GB" }),
      );
    expect(res.status).toBe(200);
    expect(lastWcRequest).not.toBeNull();
    const sent = JSON.parse(String(lastWcRequest!.init.body));
    expect(sent.billing.country).toBe("AE");
    expect(sent.shipping.country).toBe("GB");
  });

  it("uppercases lower-cased ISO codes from the client", async () => {
    await request(app)
      .post("/api/woo/order")
      .send(basePayload({ billingCountry: "ae", shippingCountry: "gb" }));
    const sent = JSON.parse(String(lastWcRequest!.init.body));
    expect(sent.billing.country).toBe("AE");
    expect(sent.shipping.country).toBe("GB");
  });

  it("defaults country to LB when not supplied (back-compat with older app builds)", async () => {
    await request(app).post("/api/woo/order").send(basePayload());
    const sent = JSON.parse(String(lastWcRequest!.init.body));
    expect(sent.billing.country).toBe("LB");
    expect(sent.shipping.country).toBe("LB");
  });
});

describe("POST /api/woo/order — appDeviceId handling", () => {
  it("drops appDeviceId for unauthenticated requests (no Authorization header)", async () => {
    const res = await request(app)
      .post("/api/woo/order")
      .send(basePayload({ appDeviceId: "should-be-dropped" }));
    expect(res.status).toBe(200);
    // The DB insert is fire-and-forget; await a microtask flush so the
    // background work has a chance to run before we assert.
    await new Promise((r) => setImmediate(r));
    expect(dbMock.insert).toHaveBeenCalled();
    const inserted = insertChain.values.mock.calls[0]?.[0];
    expect(inserted).toBeDefined();
    expect(inserted.deviceId).toBeNull();
    expect(inserted.userId).toBeNull();
  });

  it("persists appDeviceId when the request is authenticated", async () => {
    authenticateMock.mockResolvedValueOnce({
      ok: true,
      customerId: 42,
      token: "tkn",
    });
    const res = await request(app)
      .post("/api/woo/order")
      .set("Authorization", "Bearer good-token")
      .send(basePayload({ appDeviceId: "device-xyz" }));
    expect(res.status).toBe(200);
    await new Promise((r) => setImmediate(r));
    const inserted = insertChain.values.mock.calls[0]?.[0];
    expect(inserted.deviceId).toBe("device-xyz");
    expect(inserted.userId).toBe(42);
  });

  it("drops appDeviceId when authentication fails", async () => {
    authenticateMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      message: "bad",
    });
    const res = await request(app)
      .post("/api/woo/order")
      .set("Authorization", "Bearer bad-token")
      .send(basePayload({ appDeviceId: "device-xyz" }));
    expect(res.status).toBe(200);
    await new Promise((r) => setImmediate(r));
    const inserted = insertChain.values.mock.calls[0]?.[0];
    expect(inserted.deviceId).toBeNull();
    expect(inserted.userId).toBeNull();
  });
});
