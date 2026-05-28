/**
 * Integration tests for buildUpsellToOrderBySession.
 *
 * These tests run against the real PostgreSQL database (via @workspace/db).
 * They insert raw analytics_events rows and verify that the SQL CTE correctly
 * computes session-level conversion:
 *
 *   - Only sessions with BOTH upsell_item_added AND order_placed count as converted
 *   - Sessions with only an add are counted in sessionsWithAdd but not sessionsConverted
 *   - Rows where session_id IS NULL are excluded from all counts
 *
 * Each test uses a unique session-id prefix (test-upsell-<random>) and a
 * far-future date window (2099) so test rows cannot collide with real traffic.
 * All inserted rows are deleted in afterAll to keep the database clean.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, analyticsEventsTable } from "@workspace/db";
import { like, and, or, eq, sql } from "drizzle-orm";
import { buildUpsellToOrderBySession } from "../src/lib/upsellAggregator";

// Far-future window — no real traffic will ever land here, so assertions are
// unambiguous even when run against the production-ish Replit database.
const WIN_START = new Date("2099-05-01T00:00:00Z");
const WIN_END   = new Date("2099-05-15T00:00:00Z");
const WIN_MID   = new Date("2099-05-07T12:00:00Z");

// Unique prefix for all session IDs created by this test suite.
const SESSION_PREFIX = `test-upsell-${Math.random().toString(36).slice(2, 10)}`;

function sessionId(n: number) {
  return `${SESSION_PREFIX}-${n}`;
}

async function insertEvent(fields: {
  name: string;
  sessionId?: string | null;
  platform?: string;
  productId?: string;
}) {
  await db.insert(analyticsEventsTable).values({
    name: fields.name,
    sessionId: fields.sessionId !== undefined ? fields.sessionId : null,
    platform: fields.platform ?? "ios",
    productId: fields.productId ?? null,
    signedIn: false,
    createdAt: WIN_MID,
  });
}

beforeAll(async () => {
  // Verify the DB is reachable before running the suite. Throws if not,
  // which will abort the file (failing loudly is the right CI behaviour).
  await db.execute(sql`SELECT 1`);
}, 15_000);

afterAll(async () => {
  // Clean up every row we inserted (by session_id prefix).
  await db
    .delete(analyticsEventsTable)
    .where(like(analyticsEventsTable.sessionId, `${SESSION_PREFIX}%`));
  // Clean up null-session rows we inserted (within the 2099 window only).
  await db
    .delete(analyticsEventsTable)
    .where(
      and(
        or(
          eq(analyticsEventsTable.name, "upsell_item_added"),
          eq(analyticsEventsTable.name, "order_placed"),
        ),
        sql`${analyticsEventsTable.createdAt} >= ${WIN_START}`,
        sql`${analyticsEventsTable.createdAt} < ${WIN_END}`,
        sql`${analyticsEventsTable.sessionId} IS NULL`,
      )!,
    );
}, 15_000);

describe("buildUpsellToOrderBySession — integration (real DB)", () => {
  it(
    "counts a session with both upsell_item_added and order_placed as converted",
    async () => {
      const sid = sessionId(1);
      await insertEvent({ name: "upsell_item_added", sessionId: sid, productId: "prod-a", platform: "ios" });
      await insertEvent({ name: "order_placed",       sessionId: sid, platform: "ios" });

      const result = await buildUpsellToOrderBySession(WIN_START, WIN_END);
      const row = result.find((r) => r.platform === "ios" && r.productId === "prod-a");
      expect(row).toBeDefined();
      expect(row!.sessionsWithAdd).toBe(1);
      expect(row!.sessionsConverted).toBe(1);
      expect(row!.sessionConversionRatePct).toBe(100);
    },
    15_000,
  );

  it(
    "counts a session with only upsell_item_added as sessionsWithAdd but not sessionsConverted",
    async () => {
      const sid = sessionId(2);
      await insertEvent({ name: "upsell_item_added", sessionId: sid, productId: "prod-b", platform: "android" });
      // No order_placed for this session.

      const result = await buildUpsellToOrderBySession(WIN_START, WIN_END);
      const row = result.find((r) => r.platform === "android" && r.productId === "prod-b");
      expect(row).toBeDefined();
      expect(row!.sessionsWithAdd).toBe(1);
      expect(row!.sessionsConverted).toBe(0);
      expect(row!.sessionConversionRatePct).toBe(0);
    },
    15_000,
  );

  it(
    "excludes rows with NULL session_id from all counts",
    async () => {
      // Insert a null-session upsell_item_added for a product that appears
      // nowhere else in the test window; it must not create a bucket.
      await insertEvent({
        name: "upsell_item_added",
        sessionId: null,
        productId: "prod-null-session",
        platform: "web",
      });

      const result = await buildUpsellToOrderBySession(WIN_START, WIN_END);
      const row = result.find((r) => r.productId === "prod-null-session");
      expect(row).toBeUndefined();
    },
    15_000,
  );

  it(
    "computes sessionConversionRatePct correctly across multiple sessions for the same product",
    async () => {
      // 2 sessions add prod-c on platform "web"; 1 also places an order → 50%.
      const sid3 = sessionId(3); // adds + order
      const sid4 = sessionId(4); // adds only
      await insertEvent({ name: "upsell_item_added", sessionId: sid3, productId: "prod-c", platform: "web" });
      await insertEvent({ name: "order_placed",       sessionId: sid3, platform: "web" });
      await insertEvent({ name: "upsell_item_added", sessionId: sid4, productId: "prod-c", platform: "web" });

      const result = await buildUpsellToOrderBySession(WIN_START, WIN_END);
      const row = result.find((r) => r.platform === "web" && r.productId === "prod-c");
      expect(row).toBeDefined();
      expect(row!.sessionsWithAdd).toBe(2);
      expect(row!.sessionsConverted).toBe(1);
      expect(row!.sessionConversionRatePct).toBe(50);
    },
    15_000,
  );

  it(
    "returns an empty array when no events exist in the window",
    async () => {
      // A sub-window inside 2099 that contains none of our inserted rows.
      const emptyStart = new Date("2099-06-01T00:00:00Z");
      const emptyEnd   = new Date("2099-06-02T00:00:00Z");
      const result = await buildUpsellToOrderBySession(emptyStart, emptyEnd);
      expect(result).toEqual([]);
    },
    15_000,
  );
});
