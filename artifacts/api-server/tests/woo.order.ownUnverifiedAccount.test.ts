import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import wooRouter from "../src/routes/woo";

// ─── Mocks ──────────────────────────────────────────────────────────────────
//
// Task #3467 regression coverage: an authenticated-but-unverified customer
// must still get `customerId` attached to their own order (so it shows up in
// GET /me/orders before they verify their email), while an unauthenticated
// caller who merely supplies someone else's (unverified) email must NOT get
// `customerId` attached — preserving the anti-account-takeover guarantee.

const {
  insertChain,
  dbMock,
  upsertCustomerMock,
  syncCustomerToWooMock,
  authenticateMock,
  resolveAuthenticatedCustomerMock,
  UNVERIFIED_CUSTOMER,
} = vi.hoisted(() => {
  const insertChain = {
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  };
  const dbMock = { insert: vi.fn().mockReturnValue(insertChain) };
  // The unverified account under test — id 42, emailVerified: false.
  const UNVERIFIED_CUSTOMER = {
    id: 42,
    email: "victim@example.com",
    wcCustomerId: 4242,
    emailVerified: false,
    deletedAt: null,
  };
  return {
    insertChain,
    dbMock,
    upsertCustomerMock: vi.fn(),
    syncCustomerToWooMock: vi.fn(),
    authenticateMock: vi.fn(),
    resolveAuthenticatedCustomerMock: vi.fn(),
    UNVERIFIED_CUSTOMER,
  };
});

vi.mock("@workspace/db", () => ({
  db: dbMock,
  appOrdersTable: { appOrderId: "appOrderId" },
  pendingWooOrdersTable: { appOrderId: "appOrderId" },
  pushTokensTable: {},
}));

vi.mock("../src/lib/orderEvents", () => ({
  sendOrderEventPush: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/lib/customers", () => ({
  upsertCustomer: (...args: unknown[]) => upsertCustomerMock(...args),
  syncCustomerToWoo: (...args: unknown[]) => syncCustomerToWooMock(...args),
  getCustomerByWcId: vi.fn().mockResolvedValue(null),
  getCustomerById: vi.fn().mockResolvedValue(UNVERIFIED_CUSTOMER),
}));

vi.mock("../src/lib/auth", () => ({
  authenticate: (...args: unknown[]) => authenticateMock(...args),
  resolveAuthenticatedCustomer: (...args: unknown[]) => resolveAuthenticatedCustomerMock(...args),
}));

vi.mock("../src/lib/fx", () => ({
  convertFromUsd: async (usd: number) => usd,
  normalizeCurrency: () => "USD",
  roundForCurrency: (v: number) => Math.round(v * 100) / 100,
}));

vi.mock("../src/lib/wooOrders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/wooOrders")>();
  return {
    ...actual,
    attemptCreateOsOrder: vi.fn().mockResolvedValue({
      ok: true,
      osOrderId: "os-test-456",
      recipientName: "John Smith",
      totalUsdCents: 5800,
    }),
  };
});

vi.mock("../src/lib/loyalty", () => ({
  creditReferralRedemption: vi.fn().mockResolvedValue(undefined),
}));

// ─── Harness ────────────────────────────────────────────────────────────────

let app: Express;
let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  vi.clearAllMocks();

  upsertCustomerMock.mockResolvedValue({
    customer: { id: 42, email: "victim@example.com", wcCustomerId: 4242 },
    created: false,
  });
  syncCustomerToWooMock.mockResolvedValue(4242);

  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes("/products/")) {
      return new Response(
        JSON.stringify({ id: 99, price: "50.00", name: "Bouquet" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({ id: 12345, order_key: "wc_order_abc" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });

  app = express();
  app.use(express.json());
  app.use("/api", wooRouter);
});

afterEach(() => {
  fetchSpy.mockRestore();
});

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    orderId: "PR-OWN-1",
    items: [{ name: "Bouquet", quantity: 1, price: 50, wcId: 99 }],
    billing: {
      firstName: "Jane",
      lastName: "Doe",
      email: "victim@example.com",
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
    deliveryDate: "2099-01-10",
    deliverySlot: "9:00 AM – 2:00 PM",
    paymentMethod: "whish",
    ...overrides,
  };
}

describe("POST /api/woo/order — unverified-account customerId attachment", () => {
  it("attaches customerId when the caller is authenticated as the unverified account's own owner", async () => {
    authenticateMock.mockResolvedValue({ ok: true, customerId: 4242 });
    resolveAuthenticatedCustomerMock.mockResolvedValue({
      ok: true,
      customer: UNVERIFIED_CUSTOMER,
    });

    const res = await request(app)
      .post("/api/woo/order")
      .set("Authorization", "Bearer victim-own-token")
      .send(basePayload());

    expect(res.status).toBe(200);

    await new Promise((r) => setImmediate(r));
    const inserted = insertChain.values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted).toBeDefined();
    // Own authenticated session proves ownership — customerId is attached
    // even though the account is unverified.
    expect(inserted.customerId).toBe(42);
  });

  it("does NOT attach customerId when an unauthenticated caller merely supplies the victim's unverified email", async () => {
    authenticateMock.mockResolvedValue({ ok: false, status: 401, message: "no auth" });
    resolveAuthenticatedCustomerMock.mockResolvedValue({ ok: false, status: 401, message: "no auth" });

    const res = await request(app)
      .post("/api/woo/order")
      .send(basePayload({ orderId: "PR-OWN-2" }));

    expect(res.status).toBe(200);

    await new Promise((r) => setImmediate(r));
    const inserted = insertChain.values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted).toBeDefined();
    // No session proof of ownership — anti-takeover guarantee: customerId
    // must stay null even though upsertCustomer resolved to the same
    // unverified row by email.
    expect(inserted.customerId).toBeNull();
  });

  it("does NOT attach customerId when a different authenticated customer supplies the victim's unverified email", async () => {
    // Attacker is authenticated as their OWN account (id 999), but submits
    // an order using the victim's email — upsertCustomer still resolves to
    // the victim's row (42) by email lookup priority, since the attacker's
    // own row has no matching email. authenticatedCustomerId (999) must not
    // equal the resolved row's id (42), so the anti-takeover gate holds.
    authenticateMock.mockResolvedValue({ ok: true, customerId: 999 });
    resolveAuthenticatedCustomerMock.mockResolvedValue({
      ok: true,
      customer: { id: 999, email: "attacker@example.com", emailVerified: true, deletedAt: null },
    });

    const res = await request(app)
      .post("/api/woo/order")
      .set("Authorization", "Bearer attacker-token")
      .send(basePayload({ orderId: "PR-OWN-3" }));

    expect(res.status).toBe(200);

    await new Promise((r) => setImmediate(r));
    const inserted = insertChain.values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted).toBeDefined();
    expect(inserted.customerId).toBeNull();
  });
});
