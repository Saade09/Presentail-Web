/**
 * Unit tests for the Google Ads conversion deduplication guard inside
 * handleOrderStatusUpdated (osWebhook.ts).
 *
 * The guard uses an atomic conditional UPDATE:
 *
 *   UPDATE app_orders
 *      SET gads_conversion_uploaded_at = NOW()
 *    WHERE app_order_id = ?
 *      AND gads_conversion_uploaded_at IS NULL
 *
 * If the UPDATE touches 0 rows, a concurrent or earlier handler already
 * claimed the order — skip silently.  If it touches 1 row, proceed with
 * the upload.  This eliminates a read-then-write race between concurrent
 * webhook deliveries.
 *
 * Three scenarios are covered:
 *
 *  1. Duplicate webhook (OS retries "confirmed") — uploadGoogleAdsConversion
 *     is called exactly once across both invocations.
 *
 *  2. Stamp is written (DB UPDATE resolved) before uploadGoogleAdsConversion
 *     is invoked — proves concurrent webhooks cannot both slip past the guard.
 *
 *  3. Order already has gads_conversion_uploaded_at set — the conditional
 *     UPDATE returns 0 rows and upload is never called; the skip message
 *     is logged.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoist vi.fn() factories so they can be referenced inside vi.mock() callbacks
// ---------------------------------------------------------------------------

const { mockUploadGoogleAdsConversion } = vi.hoisted(() => ({
  mockUploadGoogleAdsConversion: vi.fn<() => Promise<void>>(),
}));

const { mockDbSelect, mockDbUpdate } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
}));

const { mockSendOrderEventPush } = vi.hoisted(() => ({
  mockSendOrderEventPush: vi.fn(),
}));
const { mockSendOrderEventSms } = vi.hoisted(() => ({
  mockSendOrderEventSms: vi.fn(),
}));
const { mockSendOrderEventEmail } = vi.hoisted(() => ({
  mockSendOrderEventEmail: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks (must be declared before any import that triggers the module)
// ---------------------------------------------------------------------------

vi.mock("../lib/googleAdsConversions", () => ({
  uploadGoogleAdsConversion: mockUploadGoogleAdsConversion,
}));

vi.mock("../lib/orderEvents", () => ({
  sendOrderEventPush: mockSendOrderEventPush,
}));

vi.mock("../lib/smsNotify", () => ({
  sendOrderEventSms: mockSendOrderEventSms,
}));

vi.mock("../lib/emailNotify", () => ({
  sendOrderEventEmail: mockSendOrderEventEmail,
}));

vi.mock("../lib/customers", () => ({
  upsertCustomer: vi.fn(),
}));

vi.mock("../lib/osLocationsCache", () => ({
  storeLocationsFromWebhook: vi.fn(),
  invalidateOsLocationsCache: vi.fn(),
}));

vi.mock("../lib/sseBroadcast", () => ({
  broadcastLocationsUpdated: vi.fn(),
  getSseClientCount: vi.fn(() => 0),
}));

vi.mock("../lib/wooSync", () => ({
  sendAllStoresDataRefreshPush: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/osProductsCache", () => ({
  invalidateOsProductsCache: vi.fn(),
  removeOsProductById: vi.fn(),
}));

vi.mock("../lib/fxRateCache", () => ({
  setFxRates: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
  appOrdersTable: {
    appOrderId: "app_order_id",
    id: "id",
    userId: "user_id",
    deviceId: "device_id",
    recipientName: "recipient_name",
    senderPhone: "sender_phone",
    storeKey: "store_key",
    customerId: "customer_id",
    deliveryDate: "delivery_date",
    deliverySlot: "delivery_slot",
    totalUsdCents: "total_usd_cents",
    lineItemsJson: "line_items_json",
    marketingAttributionJson: "marketing_attribution_json",
    gadsConversionUploadedAt: "gads_conversion_uploaded_at",
    state: "state",
    updatedAt: "updated_at",
  },
  customersTable: {
    id: "id",
    email: "email",
    preferredLang: "preferred_lang",
    wcCustomerId: "wc_customer_id",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: unknown, _val: unknown) => ({ type: "eq" })),
  and: vi.fn((..._args: unknown[]) => ({ type: "and" })),
  isNull: vi.fn((_col: unknown) => ({ type: "isNull" })),
  or: vi.fn((...args: unknown[]) => args[0]),
}));

// ---------------------------------------------------------------------------
// Import the function under test after all mocks are registered
// ---------------------------------------------------------------------------

import { handleOrderStatusUpdated } from "./osWebhook";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq() {
  return {
    log: {
      info: vi.fn<(...args: unknown[]) => void>(),
      warn: vi.fn<(...args: unknown[]) => void>(),
    },
  };
}

/**
 * Base order row returned by the DB select mock.
 * Has a gclid in marketingAttributionJson so the upload path is exercised.
 * Set gadsConversionUploadedAt: null to represent a fresh order.
 */
const baseOrderRow = {
  appOrderId: "LB-2026-001",
  userId: null,
  deviceId: null,
  recipientName: "Alice",
  senderPhone: null,
  storeKey: "lebanon",
  customerId: null,
  deliveryDate: "2026-06-29",
  deliverySlot: "Morning",
  totalUsdCents: 5000,
  lineItemsJson: null,
  marketingAttributionJson: JSON.stringify({
    first_touch: { gclid: "test-gclid-abc123" },
  }),
  gadsConversionUploadedAt: null,
};

const webhookData = {
  app_order_id: "LB-2026-001",
  os_order_id: "os-uuid-001",
  status: "confirmed",
};

/**
 * Wire up the DB select mock to return `orderRow` for the app_orders lookup.
 * customerId is null on the base row so the customer email sub-query is skipped.
 */
function setupDbSelectReturning(orderRow: typeof baseOrderRow) {
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([orderRow]),
      }),
    }),
  });
}

/**
 * Wire up the DB update mock.
 *
 * The handler issues two UPDATE calls:
 *  1. SET state + updatedAt (no .returning())
 *  2. SET gadsConversionUploadedAt WHERE ... IS NULL (.returning())
 *
 * We distinguish them by inspecting the values object passed to .set().
 * The `onGadsReturning` callback controls what the conditional UPDATE returns
 * so tests can simulate "claimed" vs "already claimed" outcomes.
 */
function setupDbUpdate(onGadsReturning: () => Promise<{ id: string }[]>) {
  mockDbUpdate.mockImplementation(() => ({
    set: (values: Record<string, unknown>) => ({
      where: () => {
        if ("gadsConversionUploadedAt" in values) {
          return { returning: onGadsReturning };
        }
        return Promise.resolve(undefined);
      },
    }),
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleOrderStatusUpdated — Google Ads conversion deduplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSendOrderEventPush.mockResolvedValue(0);
    mockSendOrderEventSms.mockResolvedValue({ smsSent: 0, smsSkipped: true });
    mockSendOrderEventEmail.mockResolvedValue({ emailSent: false, emailSkipped: true });
    mockUploadGoogleAdsConversion.mockResolvedValue(undefined);
  });

  // ── Scenario 1 ─────────────────────────────────────────────────────────────
  it("calls uploadGoogleAdsConversion exactly once when the webhook fires twice for the same confirmed order", async () => {
    setupDbSelectReturning(baseOrderRow);

    const claimedOnce = vi
      .fn<() => Promise<{ id: string }[]>>()
      .mockResolvedValueOnce([{ id: "1" }])
      .mockResolvedValueOnce([]);

    setupDbUpdate(claimedOnce);

    const req = makeReq();

    await handleOrderStatusUpdated(req, webhookData);
    await handleOrderStatusUpdated(req, webhookData);

    expect(mockUploadGoogleAdsConversion).toHaveBeenCalledTimes(1);
  });

  it("does not call uploadGoogleAdsConversion on the second webhook when the first already claimed the stamp", async () => {
    setupDbSelectReturning(baseOrderRow);

    const claimedOnce = vi
      .fn<() => Promise<{ id: string }[]>>()
      .mockResolvedValueOnce([{ id: "1" }])
      .mockResolvedValueOnce([]);

    setupDbUpdate(claimedOnce);

    const req = makeReq();

    await handleOrderStatusUpdated(req, webhookData);

    const callsAfterFirst = mockUploadGoogleAdsConversion.mock.calls.length;

    await handleOrderStatusUpdated(req, webhookData);

    expect(mockUploadGoogleAdsConversion).toHaveBeenCalledTimes(callsAfterFirst);
  });

  // ── Scenario 2 ─────────────────────────────────────────────────────────────
  it("writes the gads_conversion_uploaded_at stamp (DB UPDATE) before invoking uploadGoogleAdsConversion", async () => {
    setupDbSelectReturning(baseOrderRow);

    const callOrder: string[] = [];

    const gadsReturning = vi.fn<() => Promise<{ id: string }[]>>(() => {
      callOrder.push("stamp-db-update");
      return Promise.resolve([{ id: "1" }]);
    });

    setupDbUpdate(gadsReturning);

    mockUploadGoogleAdsConversion.mockImplementation(() => {
      callOrder.push("upload-invoked");
      return Promise.resolve();
    });

    await handleOrderStatusUpdated(makeReq(), webhookData);

    expect(callOrder.indexOf("stamp-db-update")).toBeLessThan(
      callOrder.indexOf("upload-invoked"),
    );
  });

  it("uploadGoogleAdsConversion is not invoked until after the stamp UPDATE has been awaited", async () => {
    setupDbSelectReturning(baseOrderRow);

    let stampAwaitedBeforeUpload = false;
    let stampSettled = false;

    const gadsReturning = vi.fn<() => Promise<{ id: string }[]>>(async () => {
      await Promise.resolve();
      stampSettled = true;
      return [{ id: "1" }];
    });

    setupDbUpdate(gadsReturning);

    mockUploadGoogleAdsConversion.mockImplementation(() => {
      stampAwaitedBeforeUpload = stampSettled;
      return Promise.resolve();
    });

    await handleOrderStatusUpdated(makeReq(), webhookData);

    expect(stampAwaitedBeforeUpload).toBe(true);
  });

  // ── Scenario 3 ─────────────────────────────────────────────────────────────
  it("never calls uploadGoogleAdsConversion when gads_conversion_uploaded_at is already set", async () => {
    setupDbSelectReturning(baseOrderRow);

    const alreadyClaimed = vi
      .fn<() => Promise<{ id: string }[]>>()
      .mockResolvedValue([]);

    setupDbUpdate(alreadyClaimed);

    await handleOrderStatusUpdated(makeReq(), webhookData);

    expect(mockUploadGoogleAdsConversion).not.toHaveBeenCalled();
  });

  it("logs the skip message when the conditional UPDATE returns 0 rows", async () => {
    setupDbSelectReturning(baseOrderRow);

    setupDbUpdate(vi.fn<() => Promise<{ id: string }[]>>().mockResolvedValue([]));

    const req = makeReq();
    await handleOrderStatusUpdated(req, webhookData);

    const infoMessages = req.log.info.mock.calls
      .map((args) => (typeof args[args.length - 1] === "string" ? args[args.length - 1] : ""))
      .join(" ");

    expect(infoMessages).toContain("already uploaded");
  });

  it("does not log the skip message when the order is newly claimed", async () => {
    setupDbSelectReturning(baseOrderRow);

    setupDbUpdate(
      vi.fn<() => Promise<{ id: string }[]>>().mockResolvedValue([{ id: "1" }]),
    );

    const req = makeReq();
    await handleOrderStatusUpdated(req, webhookData);

    const infoMessages = req.log.info.mock.calls
      .map((args) => (typeof args[args.length - 1] === "string" ? args[args.length - 1] : ""))
      .join(" ");

    expect(infoMessages).not.toContain("already uploaded");
  });
});
