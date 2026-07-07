/**
 * Admin API for collection ranking config CRUD.
 *
 * Endpoints:
 *   GET  /api/admin/collection-ranking           → all config rows
 *   PUT  /api/admin/collection-ranking/:kind/:slug → upsert a row
 *
 * Auth: same x-push-admin-token / x-admin-token header used by all admin
 * endpoints (PUSH_ADMIN_TOKEN env). No session, no cookie.
 *
 * After a successful PUT the ranking config cache is invalidated so the
 * next GET /homepage/categories or /homepage/occasions reflects the change
 * within one request cycle (no wait for the 5-min TTL to expire).
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { collectionRankingConfigTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { invalidateRankingConfigCache } from "./homepage";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response): boolean {
  const expected = process.env.PUSH_ADMIN_TOKEN;
  const supplied = req.header("x-push-admin-token") ?? req.header("x-admin-token");
  if (!expected || !supplied || supplied !== expected) {
    res.status(401).json({ ok: false, message: "Invalid or missing admin token" }); // i18n-ignore
    return false;
  }
  return true;
}

// GET /api/admin/collection-ranking — list all config rows
router.get("/admin/collection-ranking", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const rows = await db.select().from(collectionRankingConfigTable);
    return res.json({ ok: true, rows });
  } catch (err: unknown) {
    req.log.error({ err: (err as Error)?.message }, "admin/collection-ranking: DB read failed");
    return res.status(500).json({ ok: false, message: "Internal error" }); // i18n-ignore
  }
});

// PUT /api/admin/collection-ranking/:kind/:slug — upsert a config row
router.put("/admin/collection-ranking/:kind/:slug", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { kind, slug } = req.params;
  if (kind !== "category" && kind !== "occasion") {
    return res.status(400).json({ ok: false, message: "kind must be category or occasion" }); // i18n-ignore
  }
  if (!slug || typeof slug !== "string" || slug.trim() === "") {
    return res.status(400).json({ ok: false, message: "slug is required" }); // i18n-ignore
  }

  const body = req.body as {
    countryCode?: string | null;
    manualBoost?: number;
    pinnedPosition?: number | null;
    hiddenOverride?: boolean;
    seasonalBoosts?: Array<{ label: string; startMmDd: string; endMmDd: string; boost: number }>;
  };

  const manualBoost = typeof body.manualBoost === "number" ? body.manualBoost : undefined;
  const pinnedPosition =
    body.pinnedPosition === null || body.pinnedPosition === undefined
      ? body.pinnedPosition
      : typeof body.pinnedPosition === "number" && Number.isFinite(body.pinnedPosition)
        ? body.pinnedPosition
        : undefined;
  const hiddenOverride = typeof body.hiddenOverride === "boolean" ? body.hiddenOverride : undefined;
  const countryCode =
    body.countryCode === undefined ? undefined : body.countryCode ?? null;
  const seasonalBoosts = Array.isArray(body.seasonalBoosts) ? body.seasonalBoosts : undefined;

  try {
    // Check if a row already exists for this (kind, slug, countryCode) combination.
    const existing = await db
      .select()
      .from(collectionRankingConfigTable)
      .where(
        and(
          eq(collectionRankingConfigTable.kind, kind),
          eq(collectionRankingConfigTable.slug, slug),
          countryCode !== undefined
            ? eq(collectionRankingConfigTable.countryCode, countryCode as string)
            : eq(collectionRankingConfigTable.countryCode, null as unknown as string),
        ),
      )
      .limit(1);

    let row;
    if (existing.length > 0) {
      const updates: Partial<typeof collectionRankingConfigTable.$inferInsert> = {};
      if (manualBoost !== undefined) updates.manualBoost = manualBoost;
      if (pinnedPosition !== undefined) updates.pinnedPosition = pinnedPosition as number | null;
      if (hiddenOverride !== undefined) updates.hiddenOverride = hiddenOverride;
      if (seasonalBoosts !== undefined) updates.seasonalBoosts = seasonalBoosts;
      if (countryCode !== undefined) updates.countryCode = countryCode;

      const updated = await db
        .update(collectionRankingConfigTable)
        .set(updates)
        .where(eq(collectionRankingConfigTable.id, existing[0].id))
        .returning();
      row = updated[0];
    } else {
      const inserted = await db
        .insert(collectionRankingConfigTable)
        .values({
          kind: kind as "category" | "occasion",
          slug,
          countryCode: countryCode ?? null,
          manualBoost: manualBoost ?? 0,
          pinnedPosition: (pinnedPosition as number | null) ?? null,
          hiddenOverride: hiddenOverride ?? false,
          seasonalBoosts: seasonalBoosts ?? [],
        })
        .returning();
      row = inserted[0];
    }

    // Invalidate the in-process ranking config cache so the next homepage
    // request immediately picks up the new config.
    invalidateRankingConfigCache();

    return res.json({ ok: true, row });
  } catch (err: unknown) {
    req.log.error(
      { err: (err as Error)?.message },
      "admin/collection-ranking: DB upsert failed",
    );
    return res.status(500).json({ ok: false, message: "Internal error" }); // i18n-ignore
  }
});

export default router;
