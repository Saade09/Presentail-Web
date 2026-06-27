// Integration tests for the order.status_updated path in osWebhook.ts
//
// Verifies that handleOrderStatusUpdated:
//   1. Looks up the customer email from customersTable via customerId.
//   2. Passes the email (and lang) to sendOrderEventEmail.
//   3. Gracefully skips email when customer lookup fails or has no email.
//   4. Excludes OS placeholder emails (ending in @presentail-os.placeholder).
//   5. Skips the customer lookup entirely when customerId is null.

import { createHmac } from "node:crypto";
import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be established before any module imports
// ---------------------------------------------------------------------------

// DB: supports select().from().where().limit() and update().set().where()
const { limitMock, updateWhereMock, dbMock } = vi.hoisted(() => {
  const limitMock = vi.fn();
  const updateWhereMock = vi.fn().mockResolvedValue(undefined);
  const setMock = vi.fn().mockReturnValue({ where: updateWhereMock });
  const updateMock = vi.fn().mockReturnValue({ set: setMock });

  // select chain — each call to limit() is controlled per test via mockResolvedValueOnce
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: limitMock,
  };
  const selectMock = vi.fn().mockReturnValue(selectChain);

  // insert chain (analytics from emailNotify / smsNotify)
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const insertChain = { values: insertValues };
  const insertMock = vi.fn().mockReturnValue(insertChain);

  const dbMock = { select: selectMock, update: updateMock, insert: insertMock };
  return { limitMock, updateWhereMock, dbMock };
});

vi.mock("@workspace/db", () => ({
  db: dbMock,
  appOrdersTable: {
    appOrderId: "appOrderId",
    osOrderId: "osOrderId",
    state: "state",
    updatedAt: "updatedAt",
    customerId: "customerId",
  },
  customersTable: {
    id: "id",
    email: "email",
    preferredLang: "preferredLang",
  },
  analyticsEventsTable: {},
}));

// sendOrderEventEmail — spy on the module so we can inspect calls
const sendOrderEventEmailMock = vi.fn().mockResolvedValue({ emailSent: true, emailSkipped: false });
vi.mock("../src/lib/emailNotify", () => ({
  sendOrderEventEmail: (...args: unknown[]) => sendOrderEventEmailMock(...args),
}));

// sendOrderEventPush
vi.mock("../src/lib/orderEvents", () => ({
  sendOrderEventPush: vi.fn().mockResolvedValue(0),
}));

// sendOrderEventSms
vi.mock("../src/lib/smsNotify", () => ({
  sendOrderEventSms: vi.fn().mockResolvedValue({ smsSent: 0, smsSkipped: true }),
}));

// Other osWebhook dependencies
vi.mock("../src/lib/osLocationsCache", () => ({
  storeLocationsFromWebhook: vi.fn(),
  invalidateOsLocationsCache: vi.fn(),
}));
vi.mock("../src/lib/sseBroadcast", () => ({
  broadcastLocationsUpdated: vi.fn(),
  getSseClientCount: vi.fn().mockReturnValue(0),
}));
vi.mock("../src/lib/wooSync", () => ({
  sendAllStoresDataRefreshPush: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/lib/osProductsCache", () => ({
  invalidateOsProductsCache: vi.fn(),
  removeOsProductById: vi.fn(),
}));
vi.mock("../src/lib/fxRateCache", () => ({
  setFxRates: vi.fn(),
}));
vi.mock("../src/lib/customers", () => ({
  upsertCustomer: vi.fn(),
}));
vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Pino-http used by app.ts — avoids "cannot read property of undefined" when
// creating the test harness without the real app bootstrap.
vi.mock("pino-http", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ---------------------------------------------------------------------------
// Import router under test (after mocks)
// ---------------------------------------------------------------------------

import osWebhookRouter from "../src/routes/osWebhook";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WEBHOOK_SECRET = "test-webhook-secret-xyz";
const APP_ORDER_ID = "PR-WEBHOOK-001";

/** Build a valid HMAC-signed webhook request body and headers. */
function makeWebhookRequest(event: string, data: Record<string, unknown>) {
  const deliveryId = "evt-test-" + Date.now();
  const timestamp = String(Date.now());
  const body = JSON.stringify({ event, data });
  const signingString = `${deliveryId}.${timestamp}.${body}`;
  const sig =
    "sha256=" +
    createHmac("sha256", WEBHOOK_SECRET)
      .update(signingString, "utf8")
      .digest("hex");
  return { body, deliveryId, timestamp, sig };
}

/** Minimal app_orders row returned by the first DB select. */
function makeOrderRow(overrides: Partial<{
  appOrderId: string;
  userId: string | null;
  deviceId: string | null;
  recipientName: string | null;
  senderPhone: string | null;
  storeKey: string | null;
  customerId: number | null;
  deliveryDate: string | null;
  deliverySlot: string | null;
  totalUsdCents: number | null;
  lineItemsJson: string | null;
}> = {}) {
  return {
    appOrderId: APP_ORDER_ID,
    userId: null,
    deviceId: null,
    recipientName: "Test Recipient",
    senderPhone: null,
    storeKey: "lb",
    customerId: 42,
    deliveryDate: "2026-07-01",
    deliverySlot: "Morning",
    totalUsdCents: 10000,
    lineItemsJson: null,
    ...overrides,
  };
}

/** Minimal customers row returned by the second DB select. */
function makeCustomerRow(email: string, preferredLang = "en") {
  return { email, preferredLang };
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let app: Express;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PRESENTAIL_OS_WEBHOOK_SECRET = WEBHOOK_SECRET;
  app = express();
  // Inject req.log (normally set by pino-http in the real app).
  app.use((req: any, _res, next) => {
    req.log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    next();
  });
  // The real app mounts raw-body parsing for /api/os/webhook before express.json()
  app.use("/api/os/webhook", express.raw({ type: "application/json", limit: "1mb" }));
  app.use("/api", osWebhookRouter);
});

afterEach(() => {
  delete process.env.PRESENTAIL_OS_WEBHOOK_SECRET;
});

// ---------------------------------------------------------------------------
// Helper: send webhook and wait for the async handler
// ---------------------------------------------------------------------------

async function sendStatusUpdated(
  data: Record<string, unknown>,
): Promise<void> {
  const { body, deliveryId, timestamp, sig } = makeWebhookRequest(
    "order.status_updated",
    data,
  );
  await request(app)
    .post("/api/os/webhook")
    .set("Content-Type", "application/json")
    .set("x-presentail-delivery-id", deliveryId)
    .set("x-presentail-timestamp", timestamp)
    .set("x-presentail-signature", sig)
    .send(body)
    .expect(200);

  // The handler is fire-and-forget (void + catch). Give it a few microtask
  // ticks so all awaited DB calls and sendOrderEventEmail resolve.
  await vi.waitFor(() => {
    expect(sendOrderEventEmailMock).toHaveBeenCalled();
  }, { timeout: 500 });
}

// ---------------------------------------------------------------------------
// Core: customer email is looked up and forwarded to sendOrderEventEmail
// ---------------------------------------------------------------------------

describe("handleOrderStatusUpdated — customer email lookup", () => {
  it("looks up the customer email from customersTable and passes it to the email notifier", async () => {
    // First select → app_orders row; second select → customers row
    limitMock
      .mockResolvedValueOnce([makeOrderRow({ customerId: 42 })])
      .mockResolvedValueOnce([makeCustomerRow("shopper@example.com", "en")]);

    await sendStatusUpdated({ app_order_id: APP_ORDER_ID, status: "confirmed" });

    expect(sendOrderEventEmailMock).toHaveBeenCalledOnce();
    const arg = sendOrderEventEmailMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.customerEmail).toBe("shopper@example.com");
    expect(arg.appOrderId).toBe(APP_ORDER_ID);
    expect(arg.state).toBe("confirmed");
  });

  it("forwards the customer preferred lang to the email notifier", async () => {
    limitMock
      .mockResolvedValueOnce([makeOrderRow({ customerId: 77 })])
      .mockResolvedValueOnce([makeCustomerRow("fr-user@example.com", "fr")]);

    await sendStatusUpdated({ app_order_id: APP_ORDER_ID, status: "confirmed" });

    const arg = sendOrderEventEmailMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.lang).toBe("fr");
  });

  it("forwards delivery date, slot, total, and recipient name to the email notifier", async () => {
    limitMock
      .mockResolvedValueOnce([makeOrderRow({
        customerId: 5,
        recipientName: "Aisha",
        deliveryDate: "2026-08-15",
        deliverySlot: "Afternoon",
        totalUsdCents: 25000,
      })])
      .mockResolvedValueOnce([makeCustomerRow("aisha-sender@example.com")]);

    await sendStatusUpdated({ app_order_id: APP_ORDER_ID, status: "delivered" });

    const arg = sendOrderEventEmailMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.recipientName).toBe("Aisha");
    expect(arg.deliveryDate).toBe("2026-08-15");
    expect(arg.deliverySlot).toBe("Afternoon");
    expect(arg.totalUsdCents).toBe(25000);
  });

  it("parses JSON line items from lineItemsJson and forwards them", async () => {
    const lineItems = [{ name: "Red Roses", quantity: 1, priceUsdCents: 8000 }];
    limitMock
      .mockResolvedValueOnce([makeOrderRow({
        customerId: 3,
        lineItemsJson: JSON.stringify(lineItems),
      })])
      .mockResolvedValueOnce([makeCustomerRow("buyer@example.com")]);

    await sendStatusUpdated({ app_order_id: APP_ORDER_ID, status: "confirmed" });

    const arg = sendOrderEventEmailMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.lineItems).toEqual(lineItems);
  });
});

// ---------------------------------------------------------------------------
// Graceful skips
// ---------------------------------------------------------------------------

describe("handleOrderStatusUpdated — graceful email skips", () => {
  it("passes null customerEmail when customerId is null (no lookup attempted)", async () => {
    limitMock
      .mockResolvedValueOnce([makeOrderRow({ customerId: null })]);
    // Second limit call should NOT happen because customerId is null

    await sendStatusUpdated({ app_order_id: APP_ORDER_ID, status: "confirmed" });

    const arg = sendOrderEventEmailMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.customerEmail).toBeNull();
    // Only one select call (for app_orders, not customers)
    expect(limitMock).toHaveBeenCalledTimes(1);
  });

  it("passes null customerEmail when the customers row is not found", async () => {
    limitMock
      .mockResolvedValueOnce([makeOrderRow({ customerId: 99 })])
      .mockResolvedValueOnce([]); // no customer row

    await sendStatusUpdated({ app_order_id: APP_ORDER_ID, status: "delivered" });

    const arg = sendOrderEventEmailMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.customerEmail).toBeNull();
  });

  it("excludes OS placeholder emails (@presentail-os.placeholder)", async () => {
    limitMock
      .mockResolvedValueOnce([makeOrderRow({ customerId: 10 })])
      .mockResolvedValueOnce([makeCustomerRow("12345@presentail-os.placeholder")]);

    await sendStatusUpdated({ app_order_id: APP_ORDER_ID, status: "confirmed" });

    const arg = sendOrderEventEmailMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.customerEmail).toBeNull();
  });

  it("still calls sendOrderEventEmail when customer lookup throws (best-effort)", async () => {
    limitMock
      .mockResolvedValueOnce([makeOrderRow({ customerId: 55 })])
      .mockRejectedValueOnce(new Error("DB connection error"));

    await sendStatusUpdated({ app_order_id: APP_ORDER_ID, status: "confirmed" });

    // Email is still dispatched with null email so the notifier can skip gracefully
    expect(sendOrderEventEmailMock).toHaveBeenCalledOnce();
    const arg = sendOrderEventEmailMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.customerEmail).toBeNull();
  });

  it("does not call sendOrderEventEmail when no matching app_orders row is found", async () => {
    limitMock.mockResolvedValueOnce([]); // no order row

    const { body, deliveryId, timestamp, sig } = makeWebhookRequest(
      "order.status_updated",
      { app_order_id: "NONEXISTENT-ORDER", status: "confirmed" },
    );
    await request(app)
      .post("/api/os/webhook")
      .set("Content-Type", "application/json")
      .set("x-presentail-delivery-id", deliveryId)
      .set("x-presentail-timestamp", timestamp)
      .set("x-presentail-signature", sig)
      .send(body)
      .expect(200);

    // Allow microtasks to drain
    await new Promise((r) => setTimeout(r, 50));
    expect(sendOrderEventEmailMock).not.toHaveBeenCalled();
  });

  it("does not call sendOrderEventEmail when status is missing from the payload", async () => {
    const { body, deliveryId, timestamp, sig } = makeWebhookRequest(
      "order.status_updated",
      { app_order_id: APP_ORDER_ID }, // no status field
    );
    await request(app)
      .post("/api/os/webhook")
      .set("Content-Type", "application/json")
      .set("x-presentail-delivery-id", deliveryId)
      .set("x-presentail-timestamp", timestamp)
      .set("x-presentail-signature", sig)
      .send(body)
      .expect(200);

    await new Promise((r) => setTimeout(r, 50));
    expect(sendOrderEventEmailMock).not.toHaveBeenCalled();
  });

  it("skips email (but not the handler) when osStatus maps to null", async () => {
    // An unmapped status is logged and the handler returns early — before the
    // DB select, so no email call.
    const { body, deliveryId, timestamp, sig } = makeWebhookRequest(
      "order.status_updated",
      { app_order_id: APP_ORDER_ID, status: "unknown_custom_status" },
    );
    await request(app)
      .post("/api/os/webhook")
      .set("Content-Type", "application/json")
      .set("x-presentail-delivery-id", deliveryId)
      .set("x-presentail-timestamp", timestamp)
      .set("x-presentail-signature", sig)
      .send(body)
      .expect(200);

    await new Promise((r) => setTimeout(r, 50));
    expect(sendOrderEventEmailMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// OS status → OrderState mapping reaches email
// ---------------------------------------------------------------------------

describe("handleOrderStatusUpdated — status mapping", () => {
  it("maps 'processing' to the 'confirmed' state forwarded to the email notifier", async () => {
    limitMock
      .mockResolvedValueOnce([makeOrderRow({ customerId: 1 })])
      .mockResolvedValueOnce([makeCustomerRow("user@example.com")]);

    await sendStatusUpdated({ app_order_id: APP_ORDER_ID, status: "processing" });

    const arg = sendOrderEventEmailMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.state).toBe("confirmed");
  });

  it("maps 'delivered' OS status correctly", async () => {
    limitMock
      .mockResolvedValueOnce([makeOrderRow({ customerId: 2 })])
      .mockResolvedValueOnce([makeCustomerRow("user@example.com")]);

    await sendStatusUpdated({ app_order_id: APP_ORDER_ID, status: "delivered" });

    const arg = sendOrderEventEmailMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.state).toBe("delivered");
  });

  it("resolves the app_orders row by osOrderId when app_order_id is absent", async () => {
    limitMock
      .mockResolvedValueOnce([makeOrderRow({ customerId: 3, appOrderId: APP_ORDER_ID })])
      .mockResolvedValueOnce([makeCustomerRow("via-os-id@example.com")]);

    await sendStatusUpdated({ os_order_id: "os-order-999", status: "confirmed" });

    expect(sendOrderEventEmailMock).toHaveBeenCalledOnce();
    const arg = sendOrderEventEmailMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.customerEmail).toBe("via-os-id@example.com");
  });
});
