/**
 * Backfill legacy saved-address fields into the combined `address_line` column.
 *
 * Task #357 collapsed the mobile address form down to a single combined field.
 * Existing rows in `customer_addresses` still carry their old separate
 * `building`, `apartment`, and `directions` values. The saved-address picker
 * stitches them together at render time today, but the data is split across
 * columns the new form will never write to again. This one-shot script folds
 * those legacy pieces into `address_line` so the picker can fall back to
 * `item.addressLine` alone and we can eventually drop the unused columns.
 *
 * Idempotent: a row whose `address_line` already contains all of the legacy
 * fragments is left untouched, so re-runs are safe.
 *
 * Required env:
 *   DATABASE_URL
 *
 * Optional flags:
 *   --dry-run    Print the planned change for each row without writing.
 */

import { db, pool, customerAddressesTable } from "@workspace/db";
import { and, eq, isNotNull, ne, or, sql } from "drizzle-orm";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

function fragmentsFor(row: {
  building: string | null;
  apartment: string | null;
  directions: string | null;
}): string[] {
  const out: string[] = [];
  const b = (row.building ?? "").trim();
  const a = (row.apartment ?? "").trim();
  const d = (row.directions ?? "").trim();
  if (b) out.push(`Bldg: ${b}`);
  if (a) out.push(`Apt: ${a}`);
  if (d) out.push(d);
  return out;
}

function buildMergedLine(
  addressLine: string,
  fragments: string[],
): { merged: string; appended: string[] } {
  const base = (addressLine ?? "").trim();
  const haystack = base.toLowerCase();
  const toAppend: string[] = [];
  for (const f of fragments) {
    if (!haystack.includes(f.toLowerCase())) {
      toAppend.push(f);
    }
  }
  if (toAppend.length === 0) {
    return { merged: base, appended: [] };
  }
  const merged = base ? `${base} · ${toAppend.join(" · ")}` : toAppend.join(" · ");
  return { merged, appended: toAppend };
}

async function main(): Promise<void> {
  const candidates = await db
    .select({
      id: customerAddressesTable.id,
      customerId: customerAddressesTable.customerId,
      addressLine: customerAddressesTable.addressLine,
      building: customerAddressesTable.building,
      apartment: customerAddressesTable.apartment,
      directions: customerAddressesTable.directions,
    })
    .from(customerAddressesTable)
    .where(
      or(
        and(
          isNotNull(customerAddressesTable.building),
          ne(customerAddressesTable.building, ""),
        ),
        and(
          isNotNull(customerAddressesTable.apartment),
          ne(customerAddressesTable.apartment, ""),
        ),
        and(
          isNotNull(customerAddressesTable.directions),
          ne(customerAddressesTable.directions, ""),
        ),
      ),
    );

  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of candidates) {
    scanned++;
    const fragments = fragmentsFor(row);
    if (fragments.length === 0) {
      skipped++;
      continue;
    }
    const { merged, appended } = buildMergedLine(row.addressLine, fragments);
    if (appended.length === 0) {
      skipped++;
      continue;
    }
    console.log(
      `address #${row.id} (customer ${row.customerId}): "${row.addressLine}" -> "${merged}"`,
    );
    if (!dryRun) {
      await db
        .update(customerAddressesTable)
        .set({ addressLine: merged, updatedAt: sql`now()` })
        .where(eq(customerAddressesTable.id, row.id));
    }
    updated++;
  }

  console.log(
    `done: scanned=${scanned} updated=${updated} skipped=${skipped}${dryRun ? " (dry-run)" : ""}`,
  );
}

main()
  .catch((err) => {
    console.error("backfill-address-lines failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
