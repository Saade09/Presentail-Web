import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Tests for `lib/clerkCatchupSync` — the daily safety-net worker that
// ensures every local customer eventually has a corresponding Clerk
// user, even if the in-line per-request mirror in /auth/register and
// /auth/social/* missed them.
//
// The critical regression these tests guard against: with a default
// `MAX_PER_RUN` of 500, a table with thousands of customers must NOT
// re-scan only the first 500 rows on every tick. The cursor is
// persisted across ticks within a day, and only a sweep that reaches
// the end of the table marks the day as complete.

const ORIGINAL_SECRET = process.env.CLERK_SECRET_KEY;

const h = vi.hoisted(() => ({
  selectMock: vi.fn(),
}));

// Build a chained-builder shim that captures `where` arguments and
// returns rows from `selectMock` based on the `gt(id, cursor)` arg.
vi.mock("@workspace/db", () => {
  const where = (..._args: any[]) => ({ orderBy: () => ({ limit: (n: number) => h.selectMock(_args, n) }) });
  return {
    db: { select: () => ({ from: () => ({ where }) }) },
    customersTable: { id: "id", authProvider: "authProvider", authUserId: "authUserId" },
  };
});

// drizzle-orm operator stand-ins that just pass through serialisable
// markers so the test can introspect what `where` was given.
vi.mock("drizzle-orm", () => ({
  and: (...xs: any[]) => ({ op: "and", xs }),
  or: (...xs: any[]) => ({ op: "or", xs }),
  ne: (col: any, v: any) => ({ op: "ne", col, v }),
  isNull: (col: any) => ({ op: "isNull", col }),
  gt: (col: any, v: any) => ({ op: "gt", col, v }),
  asc: (col: any) => ({ op: "asc", col }),
}));

const ensureMock = vi.fn();
vi.mock("../src/lib/clerkUserSync", () => ({
  ensureClerkUserForCustomer: (...args: any[]) => ensureMock(...args),
  isClerkConfigured: () => true,
}));

vi.mock("../src/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

beforeEach(() => {
  process.env.CLERK_SECRET_KEY = "sk_test_xxx";
  h.selectMock.mockReset();
  ensureMock.mockReset();
  ensureMock.mockResolvedValue({
    ok: true,
    created: true,
    alreadyExisted: false,
    clerkUserId: "user_x",
  });
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CLERK_SECRET_KEY;
  else process.env.CLERK_SECRET_KEY = ORIGINAL_SECRET;
  vi.resetModules();
});

// Build a synthetic customer row.
const row = (id: number) => ({
  id,
  email: `c${id}@example.com`,
  firstName: "C",
  lastName: String(id),
  authProvider: null,
  authUserId: null,
});

// Helper: rig `selectMock` to behave like a real table walked by
// `gt(id, cursor)`. `dataset` is the full set of unlinked rows.
function rigDataset(dataset: ReturnType<typeof row>[], maxPerRun?: number) {
  if (maxPerRun !== undefined) {
    process.env.CLERK_CATCHUP_SYNC_MAX_PER_RUN = String(maxPerRun);
  }
  h.selectMock.mockImplementation((whereArgs: any[], take: number) => {
    // The shape we built in the route is and(gt(id,cursor), unlinkedClause)
    // → whereArgs[0] is the `and(...)` marker.
    const andNode = whereArgs[0];
    const gtNode = andNode.xs.find((x: any) => x.op === "gt");
    const cursor = gtNode.v as number;
    const slice = dataset.filter((r) => r.id > cursor).slice(0, take);
    return Promise.resolve(slice);
  });
}

describe("clerkCatchupSync.runOnce — pagination across capped passes", () => {
  it("walks the entire table across multiple capped ticks within the same day", async () => {
    // 1200 customers, cap=500 per run. Should take 3 ticks.
    const dataset = Array.from({ length: 1200 }, (_, i) => row(i + 1));
    rigDataset(dataset, 500);
    const { runOnce, __resetForTest } = await import("../src/lib/clerkCatchupSync");
    __resetForTest();

    const day = new Date("2026-05-12T00:00:00Z");

    const r1 = await runOnce(day);
    expect(r1.scanned).toBe(500);
    expect(r1.fullSweepCompleted).toBe(false);
    expect(r1.cursorAfter).toBe(500);

    // Same day → not gated by lastFullSweepDay; cursor continues.
    const r2 = await runOnce(day);
    expect(r2.scanned).toBe(500);
    expect(r2.fullSweepCompleted).toBe(false);
    expect(r2.cursorAfter).toBe(1000);

    const r3 = await runOnce(day);
    // Final 200 + an empty page → exhausted.
    expect(r3.scanned).toBe(200);
    expect(r3.fullSweepCompleted).toBe(true);

    // A 4th tick on the same day is a no-op (full sweep already done).
    const r4 = await runOnce(day);
    expect(r4.scanned).toBe(0);

    // ensureMock must have been called exactly 1200 times across the day,
    // not 500*N where N is the number of ticks.
    expect(ensureMock).toHaveBeenCalledTimes(1200);

    // Next day → cursor reset, a fresh sweep starts again.
    const tomorrow = new Date("2026-05-13T00:00:00Z");
    ensureMock.mockClear();
    const r5 = await runOnce(tomorrow);
    expect(r5.scanned).toBe(500);
    expect(r5.cursorAfter).toBe(500);
    expect(ensureMock).toHaveBeenCalledTimes(500);
  });

  it("reaches the tail of the table even when most rows are already linked (DB-side filter)", async () => {
    // Only the last few rows are unlinked. The DB-side filter must
    // exclude the linked rows, so the cap doesn't get burned scanning
    // them. We model this by making the dataset itself be the unlinked
    // rows only — selectMock pages through them directly.
    const dataset = [row(9998), row(9999), row(10000)];
    rigDataset(dataset, 500);
    const { runOnce, __resetForTest } = await import("../src/lib/clerkCatchupSync");
    __resetForTest();

    const r = await runOnce(new Date("2026-05-12T00:00:00Z"));
    expect(r.scanned).toBe(3);
    expect(r.created).toBe(3);
    expect(r.fullSweepCompleted).toBe(true);
    expect(ensureMock).toHaveBeenCalledTimes(3);
  });

  it("counts ok:false ensure results as failures, not as creations", async () => {
    rigDataset([row(1), row(2)], 500);
    ensureMock.mockResolvedValueOnce({ ok: true, created: true, alreadyExisted: false, clerkUserId: "u1" });
    ensureMock.mockResolvedValueOnce({ ok: false, reason: "error", message: "5xx" });
    const { runOnce, __resetForTest } = await import("../src/lib/clerkCatchupSync");
    __resetForTest();
    const r = await runOnce(new Date("2026-05-12T00:00:00Z"));
    expect(r).toMatchObject({
      scanned: 2,
      created: 1,
      failed: 1,
      fullSweepCompleted: true,
    });
  });

  it("is a no-op for a second concurrent invocation (re-entrancy guard)", async () => {
    // Make the first ensure block on a controllable promise so the second
    // runOnce call is invoked while the first is still in-flight.
    let release: (() => void) | null = null;
    const blocker = new Promise<void>((r) => {
      release = r;
    });
    rigDataset([row(1)], 500);
    ensureMock.mockImplementationOnce(async () => {
      await blocker;
      return { ok: true, created: true, alreadyExisted: false, clerkUserId: "u" };
    });
    const { runOnce, __resetForTest } = await import("../src/lib/clerkCatchupSync");
    __resetForTest();

    const day = new Date("2026-05-12T00:00:00Z");
    const first = runOnce(day);
    // Yield once so `first` enters the running guard.
    await new Promise((r) => setImmediate(r));
    const second = await runOnce(day);
    expect(second.scanned).toBe(0);
    expect(second.fullSweepCompleted).toBe(false);

    release!();
    await first;
  });
});
