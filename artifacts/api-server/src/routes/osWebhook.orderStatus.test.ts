// Integration tests for handleOrderStatusUpdated (artifacts/api-server/src/routes/osWebhook.ts)
//
// Tests that the Google Ads conversion upload is triggered for "confirmed" orders,
// skipped for "out_for_delivery", and guarded by the atomic dedup claim.
//
// The handler is exported for testing only — see the comment on the export.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoist mocks
// ---------------------------------------------------------------------------

// DB mock — selectRows controls what the app_orders SELECT returns;
// claimRows controls what the dedup UPDATE returning() returns.
const { dbMock, selectRows, claimRows, updateSetMock } = vi.hoisted(() => {
  const selectRows: Record<string, unknown>[][] = [[]];
  const claimRows: Record<string, unknown>[][] = [[]];

  const updateSetMock = vi.fn();
  const updateWhereMock = vi.fn();
  const returningMock = vi.fn();

  // Track which update call we're on to distinguish state-update from claim-update
  let updateCallCount = 0;

  returningMock.mockImplementation(() => {
    const idx = updateCallCount - 1;
    updateCallCount = 0; // reset after returning() signals end of this chain
    return Promise.resolve(claimRows[idx] ?? []);
  });

  updateWhereMock.mockImplementation((..._args: unknown[]) => {
    return { returning: returningMock };
  });

  updateSetMock.mockImplementation((..._args: unknown[]) => {
    updateCallCount++;
    return { where: updateWhereMock };
  });

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
    update: vi.fn().mockReturnValue({ set: updateSetMock }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
  };

  return { dbMock, selectRows, claimRows, updateSetMock };
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

const { uploadConversionMock } = vi.hoisted(() => {
  const uploadConversionMock = vi.fn().mockResolvedValue(undefined);
  return { uploadConversionMock };
});

vi.mock("../lib/googleAdsConversions", () => ({
  uploadGoogleAdsConversion: uploadConversionMock,
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

/** Fake req object — satisfies the handler's interface. */
const fakeReq = { log: { info: vi.fn(), warn: vi.fn() } };

/** An app_orders DB row returned from the SELECT. */
function makeOrderRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    appOrderId: "LB-2026-00001",
    userId: "user-123",
    deviceId: null,
    recipientName: "Alice",
    senderPhone: "+96170000000",
    storeKey: "lb",
    customerId: null,
    deliveryDate: "2026-07-01",
    deliverySlot: "Morning",
    totalUsdCents: 15000,
    lineItemsJson: null,
    marketingAttributionJson: JSON.stringify({
      first_touch: { gclid: "test-gclid-abc", utm_source: "google" },
    }),
    gadsConversionUploadedAt: null,
    ...overrides,
  };
}

/** Reset shared state between tests. */
function resetSelectRows(rows: Record<string, unknown>[]): void {
  selectRows[0] = rows;
}

/** Configure what the atomic claim UPDATE returns (1 row = claimed, 0 = already done). */
function resetClaimRows(rows: Record<string, unknown>[]): void {
  claimRows[0] = rows;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Default: one order row found, state update returns nothing, claim succeeds (1 row).
  resetSelectRows([makeOrderRow()]);
  resetClaimRows([{ id: 1 }]);

  // Re-wire update().set() to return different things per call:
  // Call 1 → state update (no .returning() — uses .where() only)
  // Call 2 → dedup claim (has .returning())
  let callIndex = 0;
  dbMock.update.mockImplementation(() => {
    callIndex++;
    const thisCall = callIndex;
    return {
      set: (_vals: unknown) => ({
        where: (_cond: unknown) => {
          if (thisCall === 1) {
            // State update — caller doesn't use .returning()
            return Promise.resolve();
          }
          // Dedup claim — caller uses .returning()
          return {
            returning: (_fields: unknown) => Promise.resolve(claimRows[0] ?? []),
          };
        },
      }),
    };
  });
});

afterEach(() => {
  selectRows[0] = [];
  claimRows[0] = [];
});

// ---------------------------------------------------------------------------
// Conversion upload triggered for "confirmed"
// ---------------------------------------------------------------------------

describe("handleOrderStatusUpdated — confirmed: triggers conversion upload", () => {
  it("calls uploadGoogleAdsConversion when state is confirmed and no prior upload", async () => {
    resetSelectRows([makeOrderRow({ gadsConversionUploadedAt: null })]);
    resetClaimRows([{ id: 1 }]); // claim succeeds

    await handleOrderStatusUpdated(fakeReq, {
      app_order_id: "LB-2026-00001",
      status: "confirmed",
    });

    expect(uploadConversionMock).toHaveBeenCalledOnce();
    const args = uploadConversionMock.mock.calls[0][0] as Record<string, unknown>;
    expect(args.appOrderId).toBe("LB-2026-00001");
    expect((args.attribution as Record<string, unknown>).first_touch).toMatchObject({
      gclid: "test-gclid-abc",
    });
    expect(typeof args.conversionTimeMs).toBe("number");
    expect(args.totalUsdCents).toBe(15000);
  });

  it("passes totalUsdCents=null when the order row has no total", async () => {
    resetSelectRows([makeOrderRow({ totalUsdCents: null })]);
    resetClaimRows([{ id: 1 }]);

    await handleOrderStatusUpdated(fakeReq, {
      app_order_id: "LB-2026-00001",
      status: "confirmed",
    });

    expect(uploadConversionMock).toHaveBeenCalledOnce();
    expect(uploadConversionMock.mock.calls[0][0]).toMatchObject({ totalUsdCents: null });
  });

  it("passes empty attribution when marketingAttributionJson is null", async () => {
    resetSelectRows([makeOrderRow({ marketingAttributionJson: null })]);
    resetClaimRows([{ id: 1 }]);

    await handleOrderStatusUpdated(fakeReq, {
      app_order_id: "LB-2026-00001",
      status: "confirmed",
    });

    expect(uploadConversionMock).toHaveBeenCalledOnce();
    expect(uploadConversionMock.mock.calls[0][0]).toMatchObject({ attribution: {} });
  });

  it("passes empty attribution when marketingAttributionJson is malformed JSON", async () => {
    resetSelectRows([makeOrderRow({ marketingAttributionJson: "not-valid-json{{{" })]);
    resetClaimRows([{ id: 1 }]);

    await handleOrderStatusUpdated(fakeReq, {
      app_order_id: "LB-2026-00001",
      status: "confirmed",
    });

    expect(uploadConversionMock).toHaveBeenCalledOnce();
    expect(uploadConversionMock.mock.calls[0][0]).toMatchObject({ attribution: {} });
  });
});

// ---------------------------------------------------------------------------
// Conversion upload skipped for "out_for_delivery"
// ---------------------------------------------------------------------------

describe("handleOrderStatusUpdated — out_for_delivery: upload not triggered", () => {
  it("does NOT call uploadGoogleAdsConversion for out_for_delivery status", async () => {
    resetSelectRows([makeOrderRow()]);

    await handleOrderStatusUpdated(fakeReq, {
      app_order_id: "LB-2026-00001",
      status: "out_for_delivery",
    });

    expect(uploadConversionMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Conversion upload skipped for "delivered"
// ---------------------------------------------------------------------------

describe("handleOrderStatusUpdated — delivered: upload never triggered", () => {
  it("does NOT call uploadGoogleAdsConversion for delivered status (confirmed-only trigger)", async () => {
    resetSelectRows([makeOrderRow({ gadsConversionUploadedAt: null })]);
    // Even if there has been no prior upload, delivered should not trigger.
    resetClaimRows([{ id: 1 }]);

    await handleOrderStatusUpdated(fakeReq, {
      app_order_id: "LB-2026-00001",
      status: "delivered",
    });

    expect(uploadConversionMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Edge cases: missing data / unrecognised status
// ---------------------------------------------------------------------------

describe("handleOrderStatusUpdated — edge cases", () => {
  it("returns early without DB call when status field is missing", async () => {
    await handleOrderStatusUpdated(fakeReq, { app_order_id: "LB-2026-00001" });
    expect(dbMock.select).not.toHaveBeenCalled();
    expect(uploadConversionMock).not.toHaveBeenCalled();
  });

  it("returns early for an unmapped OS status", async () => {
    await handleOrderStatusUpdated(fakeReq, {
      app_order_id: "LB-2026-00001",
      status: "pending_payment",
    });
    expect(dbMock.select).not.toHaveBeenCalled();
    expect(uploadConversionMock).not.toHaveBeenCalled();
  });

  it("returns early when neither app_order_id nor os_order_id is present", async () => {
    await handleOrderStatusUpdated(fakeReq, { status: "confirmed" });
    expect(dbMock.select).not.toHaveBeenCalled();
    expect(uploadConversionMock).not.toHaveBeenCalled();
  });

  it("returns early without upload when the order row is not found in DB", async () => {
    resetSelectRows([]); // no matching row

    await handleOrderStatusUpdated(fakeReq, {
      app_order_id: "NONEXISTENT-999",
      status: "confirmed",
    });

    expect(uploadConversionMock).not.toHaveBeenCalled();
  });

  it("maps OS status 'processing' to 'confirmed' and triggers upload", async () => {
    resetSelectRows([makeOrderRow()]);
    resetClaimRows([{ id: 1 }]);

    await handleOrderStatusUpdated(fakeReq, {
      app_order_id: "LB-2026-00001",
      status: "processing",
    });

    expect(uploadConversionMock).toHaveBeenCalledOnce();
  });

  it("skips upload for cancelled status", async () => {
    resetSelectRows([makeOrderRow()]);

    await handleOrderStatusUpdated(fakeReq, {
      app_order_id: "LB-2026-00001",
      status: "cancelled",
    });

    expect(uploadConversionMock).not.toHaveBeenCalled();
  });
});
