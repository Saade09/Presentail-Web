import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the db module before importing the engine — same pattern as the
// other tests in this folder. Each helper is reassignable per test so we
// can shape responses for different scenarios.
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock("@workspace/db", () => ({
  db: {
    select: (...args: any[]) => mockSelect(...args),
    insert: (...args: any[]) => mockInsert(...args),
    update: (...args: any[]) => mockUpdate(...args),
    delete: (...args: any[]) => mockDelete(...args),
  },
  loyaltyLedgerTable: { _: "loyaltyLedgerTable" },
  loyaltyCouponsTable: { _: "loyaltyCouponsTable" },
  pushTokensTable: { _: "pushTokensTable" },
}));

vi.mock("../src/lib/customers", () => ({
  getCustomerById: vi.fn(async (id: number) => ({
    id,
    email: "shopper@example.com",
    country: "LB",
  })),
}));

vi.mock("../src/lib/loyaltyPush", () => ({
  sendLoyaltyUnlockPush: vi.fn(async () => 0),
}));

vi.mock("../src/lib/expoPush", () => ({
  sendExpoPush: vi.fn(async () => ({ sent: 0, invalidTokens: [] })),
}));

import {
  computeTierState,
  unlockedCouponTiers,
  usdCentsToPoints,
  orderSourceKey,
  LOYALTY_TIERS,
  creditDeliveredOrder,
} from "../src/lib/loyalty";

describe("loyalty: tier math", () => {
  it("starts at New tier with 0 points", () => {
    const s = computeTierState(0);
    expect(s.tier.key).toBe("new");
    expect(s.nextTier?.key).toBe("regular");
    expect(s.pointsToNext).toBe(300);
  });

  it("crosses to Regular at exactly 300 pts", () => {
    expect(computeTierState(299).tier.key).toBe("new");
    expect(computeTierState(300).tier.key).toBe("regular");
  });

  it("crosses to Loyal at 600 and VIP at 1000", () => {
    expect(computeTierState(599).tier.key).toBe("regular");
    expect(computeTierState(600).tier.key).toBe("loyal");
    expect(computeTierState(999).tier.key).toBe("loyal");
    expect(computeTierState(1000).tier.key).toBe("vip");
  });

  it("VIP has no next tier", () => {
    const s = computeTierState(1500);
    expect(s.tier.key).toBe("vip");
    expect(s.nextTier).toBeNull();
    expect(s.pointsToNext).toBeNull();
  });

  it("clamps negative balances to 0 / New", () => {
    const s = computeTierState(-50);
    expect(s.points).toBe(0);
    expect(s.tier.key).toBe("new");
  });

  it("unlockedCouponTiers grows monotonically", () => {
    expect(unlockedCouponTiers(0).map((t) => t.key)).toEqual([]);
    expect(unlockedCouponTiers(300).map((t) => t.key)).toEqual(["regular"]);
    expect(unlockedCouponTiers(600).map((t) => t.key)).toEqual([
      "regular",
      "loyal",
    ]);
    expect(unlockedCouponTiers(1000).map((t) => t.key)).toEqual([
      "regular",
      "loyal",
      "vip",
    ]);
  });

  it("tier discounts match the spec", () => {
    const byKey = Object.fromEntries(LOYALTY_TIERS.map((t) => [t.key, t]));
    expect(byKey.new.discountPercent).toBe(0);
    expect(byKey.regular.discountPercent).toBe(10);
    expect(byKey.loyal.discountPercent).toBe(15);
    expect(byKey.vip.discountPercent).toBe(20);
  });
});

describe("loyalty: usdCentsToPoints", () => {
  it("awards 1 point per whole USD spent, rounded down", () => {
    expect(usdCentsToPoints(0)).toBe(0);
    expect(usdCentsToPoints(99)).toBe(0);
    expect(usdCentsToPoints(100)).toBe(1);
    expect(usdCentsToPoints(999)).toBe(9);
    expect(usdCentsToPoints(12345)).toBe(123);
  });

  it("treats null / undefined / negative as 0", () => {
    expect(usdCentsToPoints(null)).toBe(0);
    expect(usdCentsToPoints(undefined)).toBe(0);
    expect(usdCentsToPoints(-500)).toBe(0);
  });
});

describe("loyalty: orderSourceKey", () => {
  it("uses storeKey, not country, so Dubai vs Abu Dhabi cannot collide", () => {
    expect(orderSourceKey("dubai", 12345)).toBe("dubai:12345");
    expect(orderSourceKey("abudhabi", 12345)).toBe("abudhabi:12345");
    // Critical regression guard for the original bug:
    expect(orderSourceKey("dubai", 12345)).not.toBe(
      orderSourceKey("abudhabi", 12345),
    );
  });

  it("lower-cases mixed-case keys", () => {
    expect(orderSourceKey("Lebanon", 7)).toBe("lebanon:7");
  });

  it("falls back to 'unknown' when storeKey is missing", () => {
    expect(orderSourceKey(null, 9)).toBe("unknown:9");
    expect(orderSourceKey(undefined, 9)).toBe("unknown:9");
  });
});

// ── creditDeliveredOrder idempotency ─────────────────────────────────────

function makeChain(returnValue: any) {
  const chain: any = {};
  const methods = [
    "from",
    "where",
    "orderBy",
    "limit",
    "values",
    "set",
    "onConflictDoNothing",
    "onConflictDoUpdate",
    "returning",
  ];
  for (const m of methods) chain[m] = vi.fn(() => chain);
  // Make it thenable so `await db.select()...` resolves to returnValue when
  // no terminal `.returning()`/`.limit()` is called.
  chain.then = (resolve: any) => Promise.resolve(returnValue).then(resolve);
  return chain;
}

describe("loyalty: creditDeliveredOrder idempotency", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockInsert.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
  });

  it("returns credited=false when the ledger insert hits the unique constraint", async () => {
    // First select is the points balance — return [{ total: "0" }].
    mockSelect.mockReturnValue(makeChain([{ total: "0" }]));
    // Insert returns no rows → onConflictDoNothing collapsed the row.
    const insertChain = makeChain(undefined);
    insertChain.returning = vi.fn(() => Promise.resolve([]));
    mockInsert.mockReturnValue(insertChain);

    const result = await creditDeliveredOrder({
      customerId: 42,
      wcOrderId: 999,
      totalUsdCents: 5000,
      storeKey: "lebanon",
    });
    expect(result.credited).toBe(false);
    expect(result.pointsAwarded).toBe(0);
    expect(result.newCoupons).toEqual([]);
  });

  it("does not persist an active row when WC coupon creation fails (no fake codes)", async () => {
    const { ensureTierCoupon, LOYALTY_TIERS: tiers } = await import(
      "../src/lib/loyalty"
    );
    const regular = tiers.find((t) => t.key === "regular")!;

    // No existing active row for this tier.
    const selectChain = makeChain(undefined);
    selectChain.limit = vi.fn(() => Promise.resolve([]));
    mockSelect.mockReturnValue(selectChain);

    // Simulate WC coupon endpoint failing (500 / network).
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response("upstream exploded", { status: 500 }) as any,
      );

    const minted = await ensureTierCoupon({
      customerId: 42,
      email: "shopper@example.com",
      tier: regular,
      store: {
        baseUrl: "https://example.test",
        wpBaseUrl: "https://example.test",
        consumerKey: "k",
        consumerSecret: "s",
        currencySymbol: "$",
        currencyCode: "USD",
        country: "LB",
        storeKey: "lebanon",
      } as any,
    });

    expect(minted).toBeNull();
    // Critical: never insert an "active" row that would surface a fake code.
    expect(mockInsert).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("does not mint a duplicate coupon when an active row already exists at the same tier", async () => {
    const { ensureTierCoupon, LOYALTY_TIERS: tiers } = await import(
      "../src/lib/loyalty"
    );
    const regular = tiers.find((t) => t.key === "regular")!;

    // First select returns an existing active coupon for that tier.
    const existingRow = {
      id: 7,
      customerId: 42,
      tier: "regular",
      discountPercent: 10,
      code: "PRSNT-REGULAR-42-AAAA",
      status: "active",
      wcCouponId: 999,
      storeKey: "lebanon",
    };
    const selectChain = makeChain(undefined);
    selectChain.limit = vi.fn(() => Promise.resolve([existingRow]));
    mockSelect.mockReturnValue(selectChain);

    const minted = await ensureTierCoupon({
      customerId: 42,
      email: "shopper@example.com",
      tier: regular,
      store: {
        baseUrl: "x",
        wpBaseUrl: "x",
        consumerKey: "k",
        consumerSecret: "s",
        currencySymbol: "$",
        currencyCode: "USD",
        country: "LB",
        storeKey: "lebanon",
      } as any,
    });

    expect(minted).toBeNull();
    // Critical: insert must NOT have been called when an active row exists.
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("credits points and does not mint a coupon below the first threshold", async () => {
    // Balance reads: before = 0, then after-insert lookups never happen
    // because we short-circuit when no new tier was unlocked.
    let selectCall = 0;
    mockSelect.mockImplementation(() => {
      selectCall += 1;
      return makeChain([{ total: "0" }]);
    });
    const insertChain = makeChain(undefined);
    insertChain.returning = vi.fn(() =>
      Promise.resolve([{ id: 1 }]),
    );
    mockInsert.mockReturnValue(insertChain);

    const result = await creditDeliveredOrder({
      customerId: 42,
      wcOrderId: 1001,
      totalUsdCents: 5000, // 50 pts — below 300 threshold
      storeKey: "lebanon",
    });
    expect(result.credited).toBe(true);
    expect(result.pointsAwarded).toBe(50);
    expect(result.totalPoints).toBe(50);
    expect(result.newCoupons).toEqual([]);
    // Only one select needed (initial balance) when no tier crosses.
    expect(selectCall).toBe(1);
  });
});
