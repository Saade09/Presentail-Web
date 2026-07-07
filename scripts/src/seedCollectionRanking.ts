/**
 * Seed default seasonal windows and manual boosts for the collection_ranking_config table.
 *
 * Upserts sensible defaults that document the intended business logic in code:
 *   - Valentine's Day (Feb 1–14): love-romance +0.4
 *   - Mother's Day (first two weeks of May): mothers-day +0.4
 *   - Graduation (June): graduation +0.3
 *   - Christmas / New Year (Dec 1–Jan 7): christmas +0.3, new-year +0.3
 *   - Birthday pinned to position 1 for occasions (always appears first)
 *
 * This script is idempotent (upsert via INSERT … ON CONFLICT DO UPDATE).
 * Run with: pnpm --filter @workspace/scripts run seed-collection-ranking
 */

import { db, collectionRankingConfigTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";

type SeasonalBoost = {
  label: string;
  startMmDd: string;
  endMmDd: string;
  boost: number;
};

type SeedRow = {
  kind: "category" | "occasion";
  slug: string;
  countryCode: string | null;
  manualBoost: number;
  pinnedPosition: number | null;
  hiddenOverride: boolean;
  seasonalBoosts: SeasonalBoost[];
};

const SEEDS: SeedRow[] = [
  {
    kind: "occasion",
    slug: "love-romance",
    countryCode: null,
    manualBoost: 0,
    pinnedPosition: null,
    hiddenOverride: false,
    seasonalBoosts: [
      {
        label: "Valentine's Day",
        startMmDd: "02-01",
        endMmDd: "02-16",
        boost: 0.4,
      },
    ],
  },
  {
    kind: "occasion",
    slug: "mothers-day",
    countryCode: null,
    manualBoost: 0,
    pinnedPosition: null,
    hiddenOverride: false,
    seasonalBoosts: [
      {
        label: "Mother's Day",
        startMmDd: "03-01",
        endMmDd: "03-31",
        boost: 0.4,
      },
    ],
  },
  {
    kind: "occasion",
    slug: "graduation",
    countryCode: null,
    manualBoost: 0,
    pinnedPosition: null,
    hiddenOverride: false,
    seasonalBoosts: [
      {
        label: "Graduation Season",
        startMmDd: "06-01",
        endMmDd: "06-30",
        boost: 0.3,
      },
    ],
  },
  {
    kind: "occasion",
    slug: "christmas",
    countryCode: null,
    manualBoost: 0,
    pinnedPosition: null,
    hiddenOverride: false,
    seasonalBoosts: [
      {
        label: "Christmas Season",
        startMmDd: "12-01",
        endMmDd: "12-31",
        boost: 0.3,
      },
    ],
  },
  {
    kind: "occasion",
    slug: "new-year",
    countryCode: null,
    manualBoost: 0,
    pinnedPosition: null,
    hiddenOverride: false,
    seasonalBoosts: [
      {
        label: "New Year",
        startMmDd: "12-25",
        endMmDd: "01-07",
        boost: 0.3,
      },
    ],
  },
  {
    kind: "occasion",
    slug: "birthday",
    countryCode: null,
    manualBoost: 0,
    pinnedPosition: 1,
    hiddenOverride: false,
    seasonalBoosts: [],
  },
];

async function seed(): Promise<void> {
  console.log(`Seeding ${SEEDS.length} collection ranking config rows…`);
  let upserted = 0;
  let skipped = 0;

  for (const row of SEEDS) {
    const existing = await db
      .select({ id: collectionRankingConfigTable.id })
      .from(collectionRankingConfigTable)
      .where(
        and(
          eq(collectionRankingConfigTable.kind, row.kind),
          eq(collectionRankingConfigTable.slug, row.slug),
          row.countryCode === null
            ? isNull(collectionRankingConfigTable.countryCode)
            : eq(collectionRankingConfigTable.countryCode, row.countryCode),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(collectionRankingConfigTable)
        .set({
          manualBoost: row.manualBoost,
          pinnedPosition: row.pinnedPosition,
          hiddenOverride: row.hiddenOverride,
          seasonalBoosts: row.seasonalBoosts,
        })
        .where(eq(collectionRankingConfigTable.id, existing[0].id));
      console.log(`  updated  ${row.kind}/${row.slug} (id=${existing[0].id})`);
      upserted++;
    } else {
      const [inserted] = await db
        .insert(collectionRankingConfigTable)
        .values(row)
        .returning({ id: collectionRankingConfigTable.id });
      console.log(`  inserted ${row.kind}/${row.slug} (id=${inserted.id})`);
      upserted++;
    }
    skipped;
  }

  console.log(`Done. ${upserted} upserted, ${skipped} skipped.`);
}

seed()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
