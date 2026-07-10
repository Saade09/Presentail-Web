// Unit tests for the OS webhook loyalty crediting path in handleOrderStatusUpdated.
//
// Covers:
//   - delivered → creditDeliveredOrder called with os:{osOrderId} source
//   - delivered (already delivered) → no double credit (previousState guard)
//   - delivered then cancelled → reverseDeliveredOrder called
//   - delivered then refunded → reverseDeliveredOrder called
//   - guest order (customerId null) → loyalty skipped with a warn log
//   - loyalty error → non-fatal, handler still completes
//
// The handler is exported for unit testing — see the comment on the export.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoist: loyalty mocks
// ---------------------------------------------------------------------------

const { creditMock, reverseMock } = vi.hoisted(() => {
  const creditMock = vi.fn().mockResolvedValue({
    credited: true,
    pointsAwarded: 150,
    totalPoints: 150,
    newCoupons: [],
  });
  const reverseMock = vi.fn().mockResolvedValue({
    reversed: true,
    pointsReversed: 150,
    totalPoints: 0,
  });
  return { creditMock, reverseMock };
});

vi.mock("../lib/loyalty", () => ({
  creditDeliveredOrder: creditMock,
  reverseDeliveredOrder: reverseMock,
}));

// ---------------------------------------------------------------------------
// Hoist: DB mock
// ---------------------------------------------------------------------------

const { dbMock, selectRows } = vi.hoisted(() => {
  const selectRows: Record<string, unknown>[][] = [[]];
  let selectCallCount = 0;

  const limitMock = vi.fn().mockImplementation(() => {
    const idx = selectCallCount;
    selectCallCount = (selectCallCount + 1) % selectRows.length;
    return Promise.resolve(selectRows[idx] ?? []);
  });
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });

  const dbMock = {
    select: selectMock,
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  };

  return { dbMock, selectRows };
});

vi.mock("@workspace/db", () => ({
  db: dbMock,
  appOrdersTable: {
    appOrderId: "appOrderId",
    osOrderId: "osOrderId",
    state: "state",
    updatedAt: "updatedAt",
    gadsConversionUploadedAt: "gadsConversionUploadedAt",
    id: "id",
    userId: "userId",
    deviceId: "deviceId",
    recipientName: "recipientName",
    senderPhone: "senderPhone",
    storeKey: "storeKey",
    customerId: "customerId",
    deliveryDate: "deliveryDate",
    deliverySlot: "deliverySlot",
    totalUsdCents: "totalUsdCents",
    lineItemsJson: "lineItemsJson",
    marketingAttributionJson: "marketingAttributionJson",
  },
  customersTable: {
    id: "id",
    email: "email",
    preferredLang: "preferredLang",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (_col: unknown, _val: unknown) => ({ type: "eq" }),
  and: (..._args: unknown[]) => ({ type: "and" }),
  or: (..._args: unknown[]) => ({ type: "or" }),
  isNull: (_col: unknown) => ({ type: "isNull" }),
}));

// Stub out the side-effects we don't care about in these tests.
vi.mock("../lib/googleAdsConversions", () => ({
  uploadGoogleAdsConversion: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/orderEvents", () => ({
  sendOrderEventPush: vi.fn().mockResolvedValue(0),
}));
vi.mock("../lib/smsNotify", () => ({
  sendOrderEventSms: vi.fn().mockResolvedValue({ smsSent: 0, smsSkipped: true }),
}));
vi.mock("../lib/emailNotify", () => ({
  sendOrderEventEmail: vi.fn().mockResolvedValue({ emailSent: false, emailSkipped: true }),
}));
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Subject under test — imported after vi.mock
// ---------------------------------------------------------------------------

import { handleOrderStatusUpdated } from "./osWebhook";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fakeReq = { log: { info: vi.fn(), warn: vi.fn() } };

function makeOrderRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    appOrderId: "LB-2026-00001",
    userId: null,
    deviceId: null,
    recipientName: "Bob",
    senderPhone: "+96170000000",
    storeKey: "lb",
    customerId: 42,
    deliveryDate: "2026-07-01",
    deliverySlot: "Morning",
    totalUsdCents: 15000,
    lineItemsJson: null,
    marketingAttributionJson: null,
    gadsConversionUploadedAt: null,
    state: "out_for_delivery",
    ...overrides,
  };
}

function resetSelectRows(rows: Record<string, unknown>[]): void {
  selectRows[0] = rows;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  resetSelectRows([makeOrderRow()]);

  // Re-wire update().set().where() to resolve cleanly for state updates.
  dbMock.update.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });
});

afterEach(() => {
  selectRows[0] = [];
});

// ---------------------------------------------------------------------------
// Delivered → credit
// ---------------------------------------------------------------------------

describe("osWebhook loyalty — delivered: credits points", () => {
  it("calls creditDeliveredOrder with os:{osOrderId} source when delivered", async () => {
    resetSelectRows([makeOrderRow({ state: "out_for_delivery", customerId: 42 })]);

    await handleOrderStatusUpdated(fakeReq, {
      app_order_id: "LB-2026-00001",
      os_order_id: "9001",
      status: "delivered",
    });

    expect(creditMock).toHaveBeenCalledOnce();
    const args = creditMock.mock.calls[0][0] as Record<string, unknown>;
    expect(args.customerId).toBe(42);
    expect(args.source).toBe("os:9001");
    expect(args.totalUsdCents).toBe(15000);
    expect(args.storeKey).toBe("lb");
  });

  it("falls back to appOrderId in source when os_order_id is absent", async () => {
    resetSelectRows([makeOrderRow({ state: "confirmed", customerId: 42 })]);

    await handleOrderStatusUpdated(fakeReq, {
      app_order_id: "LB-2026-00001",
      status: "delivered",
    });

    expect(creditMock).toHaveBeenCalledOnce();
    const args = creditMock.mock.calls[0][0] as Record<string, unknown>;
    expect(args.source).toBe("os:LB-2026-00001");
  });

  it("does NOT call creditDeliveredOrder when order is already delivered (idempotency guard)", async () => {
    resetSelectRows([makeOrderRow({ state: "delivered", customerId: 42 })]);

    await handleOrderStatusUpdated(fakeReq, {
      app_order_id: "LB-2026-00001",
      os_order_id: "9001",
      status: "delivered",
    });

    expect(creditMock).not.toHaveBeenCalled();
  });

  it("skips loyalty when order has no customerId (guest order)", async () => {
    resetSelectRows([makeOrderRow({ state: "confirmed", customerId: null })]);

    await handleOrderStatusUpdated(fakeReq, {
      app_order_id: "LB-2026-00001",
      os_order_id: "9001",
      status: "delivered",
    });

    expect(creditMock).not.toHaveBeenCalled();
    expect(reverseMock).not.toHaveBeenCalled();
    // Ops gets a warn so they know loyalty was skipped.
    expect(fakeReq.log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ appOrderId: "LB-2026-00001" }),
      expect.stringContaining("no customerId"),
    );
  });
});

// ---------------------------------------------------------------------------
// Delivered then cancelled/refunded → reverse
// ---------------------------------------------------------------------------

describe("osWebhook loyalty — cancelled/refunded after delivered: reverses points", () => {
  it("calls reverseDeliveredOrder when cancelled after delivered", async () => {
    resetSelectRows([makeOrderRow({ state: "delivered", customerId: 42 })]);

    await handleOrderStatusUpdated(fakeReq, {
      app_order_id: "LB-2026-00001",
      os_order_id: "9001",
      status: "cancelled",
    });

    expect(reverseMock).toHaveBeenCalledOnce();
    const args = reverseMock.mock.calls[0][0] as Record<string, unknown>;
    expect(args.customerId).toBe(42);
    expect(args.source).toBe("os:9001");
    expect(args.reason).toBe("cancelled");
    expect(creditMock).not.toHaveBeenCalled();
  });

  it("calls reverseDeliveredOrder when refunded after delivered", async () => {
    resetSelectRows([makeOrderRow({ state: "delivered", customerId: 42 })]);

    await handleOrderStatusUpdated(fakeReq, {
      app_order_id: "LB-2026-00001",
      os_order_id: "9001",
      status: "refunded",
    });

    expect(reverseMock).toHaveBeenCalledOnce();
    const args = reverseMock.mock.calls[0][0] as Record<string, unknown>;
    expect(args.reason).toBe("refunded");
  });

  it("does NOT reverse when cancelled but was NOT previously delivered", async () => {
    resetSelectRows([makeOrderRow({ state: "confirmed", customerId: 42 })]);

    await handleOrderStatusUpdated(fakeReq, {
      app_order_id: "LB-2026-00001",
      os_order_id: "9001",
      status: "cancelled",
    });

    expect(reverseMock).not.toHaveBeenCalled();
    expect(creditMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Loyalty error is non-fatal
// ---------------------------------------------------------------------------

describe("osWebhook loyalty — error handling", () => {
  it("logs a warn and does not throw when creditDeliveredOrder rejects", async () => {
    resetSelectRows([makeOrderRow({ state: "confirmed", customerId: 42 })]);
    creditMock.mockRejectedValueOnce(new Error("DB connection error"));

    await expect(
      handleOrderStatusUpdated(fakeReq, {
        app_order_id: "LB-2026-00001",
        os_order_id: "9001",
        status: "delivered",
      }),
    ).resolves.not.toThrow();

    expect(fakeReq.log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: "DB connection error" }),
      expect.stringContaining("loyalty hook failed"),
    );
  });
});
