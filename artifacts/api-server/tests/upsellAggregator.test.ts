import { describe, expect, it, vi } from "vitest";

// `buildUpsellToOrderBySession` issues a single raw `db.execute(sql`...`)` call
// and transforms the result rows. We mock only `db.execute` here — the drizzle
// `sql` tag is a pure value constructor and does not need stubbing.

const h = vi.hoisted(() => {
  const executeQueue: Array<{ rows: unknown[] }> = [];
  const executeSpy = vi.fn(() => Promise.resolve(executeQueue.shift() ?? { rows: [] }));
  return { executeQueue, executeSpy };
});

vi.mock("@workspace/db", () => ({
  db: { execute: h.executeSpy },
  analyticsEventsTable: {},
}));

const { buildUpsellToOrderBySession } = await import("../src/lib/upsellAggregator");

const START = new Date("2026-05-01T00:00:00Z");
const END = new Date("2026-05-15T00:00:00Z");

function pushRows(rows: Array<{
  platform: string | null;
  productId: string | null;
  sessionsWithAdd: number;
  sessionsConverted: number;
}>) {
  h.executeQueue.push({ rows });
}

// ── SQL contract ─────────────────────────────────────────────────────────────
//
// Drizzle's `sql` tagged-template builds an SQL object whose `queryChunks`
// hold string parts and bound-parameter values interleaved.  Inspecting those
// chunks lets us verify the query encodes the expected conversion logic
// without executing against a real database.
//
// Chunk shape (from drizzle-orm/node-postgres internals, stable across minor
// versions):
//   { value: string[] }  — StringChunk: the static text fragments
//   string               — a bound-parameter value serialised by drizzle
//
// We extract the text-only portions and assert the required SQL predicates.

function extractQueryText(sqlArg: unknown): string {
  const obj = sqlArg as { queryChunks?: unknown[] } | null;
  if (!obj || !Array.isArray(obj.queryChunks)) return "";
  return obj.queryChunks
    .map((chunk: unknown) => {
      if (chunk && typeof chunk === "object" && Array.isArray((chunk as any).value)) {
        return (chunk as any).value.join("");
      }
      return "";
    })
    .join("");
}

describe("buildUpsellToOrderBySession — SQL contract", () => {
  it("filters session_id IS NOT NULL in the adds CTE so legacy null-session events are excluded", async () => {
    h.executeQueue.push({ rows: [] });
    await buildUpsellToOrderBySession(START, END);
    const captured = h.executeSpy.mock.calls[h.executeSpy.mock.calls.length - 1][0];
    const queryText = extractQueryText(captured);
    // The adds CTE must guard against NULL session IDs
    expect(queryText).toContain("session_id IS NOT NULL");
    // The event name filter must be present
    expect(queryText).toContain("upsell_item_added");
  });

  it("filters session_id IS NOT NULL in the orders CTE as well", async () => {
    h.executeQueue.push({ rows: [] });
    await buildUpsellToOrderBySession(START, END);
    const captured = h.executeSpy.mock.calls[h.executeSpy.mock.calls.length - 1][0];
    const queryText = extractQueryText(captured);
    // Both CTEs must exclude NULL — the count should be >= 2
    const nullGuardCount = (queryText.match(/session_id IS NOT NULL/g) ?? []).length;
    expect(nullGuardCount).toBeGreaterThanOrEqual(2);
    // The orders event name must be present
    expect(queryText).toContain("order_placed");
  });

  it("uses a LEFT JOIN so sessions with no matching order are still counted in sessionsWithAdd", async () => {
    h.executeQueue.push({ rows: [] });
    await buildUpsellToOrderBySession(START, END);
    const captured = h.executeSpy.mock.calls[h.executeSpy.mock.calls.length - 1][0];
    const queryText = extractQueryText(captured);
    expect(queryText).toContain("LEFT JOIN");
  });

  it("uses WITH…CTEs so the conversion join is a single pass over pre-deduplicated sessions", async () => {
    h.executeQueue.push({ rows: [] });
    await buildUpsellToOrderBySession(START, END);
    const captured = h.executeSpy.mock.calls[h.executeSpy.mock.calls.length - 1][0];
    const queryText = extractQueryText(captured);
    // CTE names both appear in the query text
    expect(queryText).toContain("WITH");
    // COUNT(o.session_id) is the conversion count — NULL-safe count of matched sessions
    expect(queryText).toContain("COUNT(o.session_id)");
  });
});

// ── Post-query transformation ─────────────────────────────────────────────────
//
// These tests verify how the application layer maps the raw DB rows into typed
// `UpsellToOrderBySessionBucket` values: null coercion, rate computation, and
// sort order.  They complement (but do not replace) the SQL contract tests above.

describe("buildUpsellToOrderBySession — transformation", () => {
  it("counts sessions with both upsell_item_added and order_placed as converted", async () => {
    pushRows([
      { platform: "ios", productId: "rose-bouquet", sessionsWithAdd: 10, sessionsConverted: 4 },
    ]);
    const result = await buildUpsellToOrderBySession(START, END);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      platform: "ios",
      productId: "rose-bouquet",
      sessionsWithAdd: 10,
      sessionsConverted: 4,
      sessionConversionRatePct: 40,
    });
  });

  it("counts sessions with only an add (no order) as sessionsWithAdd but not sessionsConverted", async () => {
    pushRows([
      { platform: "web", productId: "chocolate-box", sessionsWithAdd: 5, sessionsConverted: 0 },
    ]);
    const result = await buildUpsellToOrderBySession(START, END);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      platform: "web",
      productId: "chocolate-box",
      sessionsWithAdd: 5,
      sessionsConverted: 0,
      sessionConversionRatePct: 0,
    });
  });

  it("returns null sessionConversionRatePct when sessionsWithAdd is 0", async () => {
    pushRows([
      { platform: "android", productId: "add-on-candle", sessionsWithAdd: 0, sessionsConverted: 0 },
    ]);
    const result = await buildUpsellToOrderBySession(START, END);
    expect(result).toHaveLength(1);
    expect(result[0].sessionsWithAdd).toBe(0);
    expect(result[0].sessionsConverted).toBe(0);
    expect(result[0].sessionConversionRatePct).toBeNull();
  });

  it("collapses null platform to 'unknown'", async () => {
    pushRows([
      { platform: null, productId: "add-on-teddy", sessionsWithAdd: 2, sessionsConverted: 1 },
    ]);
    const result = await buildUpsellToOrderBySession(START, END);
    expect(result[0].platform).toBe("unknown");
  });

  it("collapses null productId to 'unknown'", async () => {
    pushRows([
      { platform: "ios", productId: null, sessionsWithAdd: 3, sessionsConverted: 2 },
    ]);
    const result = await buildUpsellToOrderBySession(START, END);
    expect(result[0].productId).toBe("unknown");
  });

  it("computes sessionConversionRatePct to 1 decimal place (rounds half-up)", async () => {
    pushRows([
      { platform: "ios", productId: "add-on-teddy", sessionsWithAdd: 3, sessionsConverted: 1 },
    ]);
    const result = await buildUpsellToOrderBySession(START, END);
    // 1/3 × 100 = 33.333… → Math.round(333.33…) / 10 = 33.3
    expect(result[0].sessionConversionRatePct).toBe(33.3);
  });

  it("sorts rows by sessionConversionRatePct descending — null rates sort last", async () => {
    pushRows([
      { platform: "ios", productId: "prod-a", sessionsWithAdd: 0, sessionsConverted: 0 }, // null rate
      { platform: "ios", productId: "prod-b", sessionsWithAdd: 5, sessionsConverted: 1 }, // 20 %
      { platform: "ios", productId: "prod-c", sessionsWithAdd: 4, sessionsConverted: 2 }, // 50 %
    ]);
    const result = await buildUpsellToOrderBySession(START, END);
    expect(result.map((r) => r.productId)).toEqual(["prod-c", "prod-b", "prod-a"]);
    expect(result.map((r) => r.sessionConversionRatePct)).toEqual([50, 20, null]);
  });

  it("breaks rate ties by descending sessionsWithAdd", async () => {
    pushRows([
      { platform: "ios", productId: "prod-low",  sessionsWithAdd: 2, sessionsConverted: 1 }, // 50 %, 2 adds
      { platform: "ios", productId: "prod-high", sessionsWithAdd: 8, sessionsConverted: 4 }, // 50 %, 8 adds
    ]);
    const result = await buildUpsellToOrderBySession(START, END);
    expect(result[0].productId).toBe("prod-high");
    expect(result[1].productId).toBe("prod-low");
  });

  it("returns an empty array when the database returns no rows at all", async () => {
    h.executeQueue.push({ rows: [] });
    const result = await buildUpsellToOrderBySession(START, END);
    expect(result).toEqual([]);
  });

  it("handles rows where rows.rows is undefined (falls back to empty array)", async () => {
    (h.executeSpy as any).mockResolvedValueOnce({});
    const result = await buildUpsellToOrderBySession(START, END);
    expect(result).toEqual([]);
  });
});
