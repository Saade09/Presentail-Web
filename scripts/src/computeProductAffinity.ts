/**
 * computeProductAffinity.ts — Re-computes co-purchase affinity scores from all
 * historical `app_orders` rows and upserts the results into `product_pair_affinity`.
 *
 * Algorithm:
 *   For each order that has a `line_items_json` payload, extract the set of
 *   unique OS product slugs present in that basket. Then emit every unique
 *   unordered pair of slugs from that set and accumulate a co-purchase count.
 *   After iterating all orders, upsert the final counts into `product_pair_affinity`.
 *
 * Pair storage convention:
 *   Pairs are stored with slugA < slugB (lexicographic) so each pair has
 *   exactly one row — no need to query both orders (a,b) and (b,a).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run compute-affinity
 */

import { db, appOrdersTable, productPairAffinityTable } from "@workspace/db";
import { sql } from "drizzle-orm";

type LineItem = {
  name?: string;
  quantity?: number;
  priceUsdCents?: number;
  osSlug?: string;
};

async function main() {
  console.log("computeProductAffinity: reading app_orders…");

  const orders = await db
    .select({
      appOrderId: appOrdersTable.appOrderId,
      lineItemsJson: appOrdersTable.lineItemsJson,
    })
    .from(appOrdersTable);

  console.log(`computeProductAffinity: found ${orders.length} orders`);

  // Accumulate co-purchase counts
  const pairCounts = new Map<string, number>();

  let ordersWithSlugs = 0;

  for (const order of orders) {
    if (!order.lineItemsJson) continue;

    let items: LineItem[];
    try {
      items = JSON.parse(order.lineItemsJson) as LineItem[];
    } catch {
      continue;
    }

    // Collect unique slugs for this basket
    const slugs = new Set<string>();
    for (const item of items) {
      if (item.osSlug && typeof item.osSlug === "string") {
        slugs.add(item.osSlug);
      }
    }

    if (slugs.size < 2) continue;
    ordersWithSlugs++;

    const slugArr = Array.from(slugs).sort();
    for (let i = 0; i < slugArr.length; i++) {
      for (let j = i + 1; j < slugArr.length; j++) {
        const slugA = slugArr[i]!;
        const slugB = slugArr[j]!;
        const key = `${slugA}\0${slugB}`;
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }

  console.log(
    `computeProductAffinity: ${ordersWithSlugs} orders had ≥2 product slugs; ${pairCounts.size} unique pairs found`,
  );

  if (pairCounts.size === 0) {
    console.log("computeProductAffinity: nothing to upsert — done");
    return;
  }

  // Upsert in batches of 500 to avoid parameter limits
  const BATCH = 500;
  const entries = Array.from(pairCounts.entries());
  const now = new Date();

  let upserted = 0;
  for (let start = 0; start < entries.length; start += BATCH) {
    const batch = entries.slice(start, start + BATCH);
    const rows = batch.map(([key, count]) => {
      const [slugA, slugB] = key.split("\0") as [string, string];
      return {
        productSlugA: slugA,
        productSlugB: slugB,
        coPurchaseCount: count,
        lastComputedAt: now,
      };
    });

    await db
      .insert(productPairAffinityTable)
      .values(rows)
      .onConflictDoUpdate({
        target: [
          productPairAffinityTable.productSlugA,
          productPairAffinityTable.productSlugB,
        ],
        set: {
          coPurchaseCount: sql`excluded.co_purchase_count`,
          lastComputedAt: sql`excluded.last_computed_at`,
        },
      });

    upserted += rows.length;
    if (entries.length > BATCH) {
      console.log(`computeProductAffinity: upserted ${upserted}/${entries.length} pairs…`);
    }
  }

  console.log(`computeProductAffinity: done — ${upserted} pairs upserted`);
}

main().catch((err) => {
  console.error("computeProductAffinity: fatal error", err);
  process.exit(1);
});
