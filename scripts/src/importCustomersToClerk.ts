import { createClerkClient } from "@clerk/express";
import { db, pool, customersTable, type Customer } from "@workspace/db";
import { and, asc, gt, isNotNull, sql } from "drizzle-orm";

// Import existing local customer rows (originally backfilled from
// WordPress/WooCommerce by `backfillCustomers.ts`) into Clerk so that when a
// returning customer signs in via Clerk on the new web flow, our
// `authenticate()` upsert finds the existing customer row by email instead of
// creating a duplicate. Mobile (which still uses WP/social JWT) is unaffected
// because it never goes through Clerk.
//
// Notes:
//  - Clerk has no bulk-import REST endpoint; we paginate locally and create
//    users one-by-one with small concurrency. This is fine for the customer
//    volumes we have and is safely re-runnable.
//  - We don't migrate WordPress passwords (we don't have access to them from
//    here). Imported users will sign in via Clerk's email code / "forgot
//    password" / social flow on first login. The local customer row is then
//    matched by email in `authenticate()` (`upsertCustomer` looks up by email
//    before inserting), preserving order history.
//  - `external_id` is set to the local `customers.id` so an operator can
//    correlate Clerk users back to the local row.
//  - `public_metadata.userType = "customer"` mirrors what the Clerk webhook
//    and `authenticate()`'s lazy-tag would set, so `requireUserType(["customer"])`
//    keeps working immediately after the import.
//  - 422 "form_identifier_exists" responses (email already in Clerk) are
//    treated as a successful no-op so the script is idempotent.

const SECRET_KEY = process.env.CLERK_SECRET_KEY;
if (!SECRET_KEY) {
  throw new Error("CLERK_SECRET_KEY must be set to import customers into Clerk");
}

const DRY_RUN =
  process.argv.includes("--dry-run") || process.env.DRY_RUN === "1";
const ONLY_WP =
  process.argv.includes("--only-wp") || process.env.ONLY_WP === "1";
const LIMIT = (() => {
  const flag = process.argv.find((a) => a.startsWith("--limit="));
  if (!flag) return null;
  const n = Number(flag.slice("--limit=".length));
  return Number.isFinite(n) && n > 0 ? n : null;
})();
const CONCURRENCY = (() => {
  const flag = process.argv.find((a) => a.startsWith("--concurrency="));
  if (!flag) return 4;
  const n = Number(flag.slice("--concurrency=".length));
  return Number.isFinite(n) && n >= 1 && n <= 16 ? n : 4;
})();

const clerk = createClerkClient({ secretKey: SECRET_KEY });

type Outcome = "created" | "exists" | "skipped" | "failed";

function isValidEmail(raw: string | null | undefined): raw is string {
  if (!raw) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim().toLowerCase());
}

async function importOne(c: Customer): Promise<Outcome> {
  const email = c.email?.trim().toLowerCase();
  if (!isValidEmail(email)) return "skipped";

  // Skip rows already linked to a Clerk user (re-runs / partial imports).
  if (c.authProvider === "clerk" && c.authUserId) return "exists";

  if (DRY_RUN) {
    console.log(`[dry-run] would import ${email} (customer #${c.id})`);
    return "created";
  }

  try {
    await clerk.users.createUser({
      emailAddress: [email],
      firstName: c.firstName || undefined,
      lastName: c.lastName || undefined,
      externalId: String(c.id),
      publicMetadata: { userType: "customer" },
      skipPasswordRequirement: true,
    });
    return "created";
  } catch (err: any) {
    // Clerk returns a structured error array. The "already exists" case
    // shows up as `form_identifier_exists` (or `form_identifier_exists__email`
    // depending on Clerk version) on the email_address field.
    const errors: any[] = err?.errors ?? err?.clerkError?.errors ?? [];
    const codes = errors.map((e) => String(e?.code ?? ""));
    const exists = codes.some((c) => /form_identifier_exists/.test(c));
    if (exists) return "exists";
    const status = err?.status ?? err?.clerkError?.status;
    const msg =
      errors[0]?.longMessage ??
      errors[0]?.message ??
      err?.message ??
      String(err);
    console.error(
      `[clerk] customer #${c.id} <${email}> failed (status=${status ?? "?"}): ${msg}`,
    );
    return "failed";
  }
}

async function* iterateCustomers(): AsyncGenerator<Customer[]> {
  const pageSize = 200;
  let lastId = 0;
  let yielded = 0;
  for (;;) {
    const where = ONLY_WP
      ? and(gt(customersTable.id, lastId), isNotNull(customersTable.wcCustomerId))
      : gt(customersTable.id, lastId);
    const remaining = LIMIT != null ? LIMIT - yielded : pageSize;
    if (remaining <= 0) return;
    const take = Math.min(pageSize, remaining);
    const rows = await db
      .select()
      .from(customersTable)
      .where(where)
      .orderBy(asc(customersTable.id))
      .limit(take);
    if (rows.length === 0) return;
    yielded += rows.length;
    lastId = rows[rows.length - 1].id;
    yield rows;
    if (rows.length < take) return;
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return out;
}

async function main(): Promise<void> {
  const [{ count: totalCount }] = (await db.execute(
    ONLY_WP
      ? sql`select count(*)::int as count from customers where wc_customer_id is not null`
      : sql`select count(*)::int as count from customers`,
  )).rows as Array<{ count: number }>;
  console.log(
    `[clerk-import] starting${DRY_RUN ? " (dry-run)" : ""}: ${totalCount} candidate customer rows${ONLY_WP ? " (WP-linked only)" : ""}, concurrency=${CONCURRENCY}${LIMIT != null ? `, limit=${LIMIT}` : ""}`,
  );

  let created = 0;
  let exists = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;

  for await (const batch of iterateCustomers()) {
    const results = await runWithConcurrency(batch, CONCURRENCY, importOne);
    for (const r of results) {
      processed++;
      if (r === "created") created++;
      else if (r === "exists") exists++;
      else if (r === "skipped") skipped++;
      else failed++;
    }
    console.log(
      `[clerk-import] processed=${processed} created=${created} exists=${exists} skipped=${skipped} failed=${failed}`,
    );
  }

  console.log(
    `[clerk-import] done. processed=${processed} created=${created} exists=${exists} skipped=${skipped} failed=${failed}`,
  );

  if (failed > 0) {
    throw new Error(`${failed} customer(s) failed to import; see logs above.`);
  }
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("clerk-import failed:", err?.message ?? err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
