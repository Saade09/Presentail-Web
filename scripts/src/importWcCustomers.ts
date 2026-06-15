import { db, pool, customersTable, wpCustomerIdMapTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createClerkClient } from "@clerk/express";

// Import WooCommerce customers from all regional stores into the local
// `customers` table and log each outcome in `wp_customer_id_map`.
//
// Run:
//   DATABASE_URL=... WC_CONSUMER_KEY=... pnpm --filter @workspace/scripts run import-wc-customers
//
// Options:
//   --dry-run          Print what would happen without writing
//   --store=<key>      Only import from one store (lebanon|dubai|abudhabi|cyprus)
//   --concurrency=<n>  Parallel DB writes per page (default 4, max 16)
//   --limit=<n>        Stop after processing this many WC customers total
//
// The script is idempotent: re-running it is safe. Already-existing rows
// are logged as "already_exists" and optionally updated with the wcCustomerId.
// WP passwords are NEVER copied — Clerk owns credentials going forward.

const PAGE_SIZE = 100;
const DRY_RUN = process.argv.includes("--dry-run") || process.env.DRY_RUN === "1";
const STORE_FILTER = (() => {
  const flag = process.argv.find((a) => a.startsWith("--store="));
  return flag ? flag.slice("--store=".length) : null;
})();
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

type StoreConfig = {
  key: string;
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
};

function getStores(): StoreConfig[] {
  const all: StoreConfig[] = [
    {
      key: "lebanon",
      baseUrl: "https://presentail.com/lebanon/wp-json/wc/v3",
      consumerKey: process.env.WC_CONSUMER_KEY ?? "",
      consumerSecret: process.env.WC_CONSUMER_SECRET ?? "",
    },
    {
      key: "dubai",
      baseUrl: "https://presentail.com/dubai/wp-json/wc/v3",
      consumerKey: process.env.WC_DUBAI_CONSUMER_KEY ?? "",
      consumerSecret: process.env.WC_DUBAI_CONSUMER_SECRET ?? "",
    },
    {
      key: "abudhabi",
      baseUrl: "https://presentail.com/abudhabi/wp-json/wc/v3",
      consumerKey: process.env.WC_ABUDHABI_CONSUMER_KEY ?? "",
      consumerSecret: process.env.WC_ABUDHABI_CONSUMER_SECRET ?? "",
    },
    {
      key: "cyprus",
      baseUrl: "https://presentail.com/cyprus/wp-json/wc/v3",
      consumerKey: process.env.WC_CYPRUS_CONSUMER_KEY ?? "",
      consumerSecret: process.env.WC_CYPRUS_CONSUMER_SECRET ?? "",
    },
  ];
  return all.filter(
    (s) => s.consumerKey && (!STORE_FILTER || s.key === STORE_FILTER),
  );
}

function authHeader(store: StoreConfig): string {
  return "Basic " + Buffer.from(`${store.consumerKey}:${store.consumerSecret}`).toString("base64");
}

async function fetchPage(store: StoreConfig, page: number): Promise<any[]> {
  const url = `${store.baseUrl}/customers?per_page=${PAGE_SIZE}&page=${page}&orderby=id&order=asc`;
  const r = await fetch(url, { headers: { Authorization: authHeader(store) } });
  if (!r.ok) {
    console.warn(`[import] ${store.key}: HTTP ${r.status} on page ${page}`);
    return [];
  }
  const data = await r.json() as any[];
  return Array.isArray(data) ? data : [];
}

// Optional Clerk propagation (best-effort, only when CLERK_SECRET_KEY is set)
const clerk = (() => {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) return null;
  return createClerkClient({ secretKey: key });
})();

async function ensureClerkUser(email: string, firstName: string | null, lastName: string | null, localId: number): Promise<void> {
  if (!clerk) return;
  try {
    const existing = await clerk.users.getUserList({ emailAddress: [email], limit: 1 }).catch(() => null);
    if (existing?.data?.[0]) return;
    await clerk.users.createUser({
      emailAddress: [email],
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      externalId: String(localId),
      publicMetadata: { userType: "customer" },
      skipPasswordRequirement: true,
    });
  } catch (err: any) {
    const errors: any[] = err?.errors ?? err?.clerkError?.errors ?? [];
    const isExists = errors.some((e) => /form_identifier_exists/.test(String(e?.code ?? "")));
    if (!isExists) {
      console.warn(`[import] Clerk propagation failed for ${email}: ${err?.message ?? err}`);
    }
  }
}

type Outcome = "imported" | "already_exists" | "skipped_duplicate" | "failed";

async function processWcCustomer(
  wc: any,
  storeKey: string,
): Promise<Outcome> {
  const email = String(wc.email ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "failed";

  const wcId = Number(wc.id);
  const firstName = String(wc.first_name ?? "").trim() || null;
  const lastName = String(wc.last_name ?? "").trim() || null;
  const phone = String(wc.billing?.phone ?? "").trim() || null;
  const country = String(wc.billing?.country ?? "").trim() || null;

  if (DRY_RUN) {
    console.log(`[dry-run] would process: ${email} (WC #${wcId})`);
    return "imported";
  }

  try {
    const [existing] = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.email, email))
      .limit(1);

    if (existing) {
      // Row exists — update wcCustomerId if missing, log as "already_exists".
      const updateSet: Partial<typeof customersTable.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (!existing.wcCustomerId) {
        updateSet.wcCustomerId = wcId;
      }
      if (!existing.firstName && firstName) updateSet.firstName = firstName;
      if (!existing.lastName && lastName) updateSet.lastName = lastName;
      if (!existing.phoneE164 && phone) {
        const digits = phone.replace(/\D/g, "");
        if (digits.length >= 6) updateSet.phoneE164 = phone.startsWith("+") ? phone : "+" + digits;
      }

      if (Object.keys(updateSet).length > 1) {
        await db.update(customersTable).set(updateSet).where(eq(customersTable.id, existing.id));
      }

      await db.insert(wpCustomerIdMapTable).values({
        customersId: existing.id,
        wcCustomerId: wcId,
        wcStoreKey: storeKey,
        status: "already_exists",
        notes: `local_id=${existing.id}`,
      });

      return "already_exists";
    }

    // New customer — insert into local DB.
    let phoneE164: string | null = null;
    if (phone) {
      const digits = phone.replace(/\D/g, "");
      if (digits.length >= 6) phoneE164 = phone.startsWith("+") ? phone : "+" + digits;
    }

    const [inserted] = await db
      .insert(customersTable)
      .values({
        email,
        firstName: firstName ?? "",
        lastName: lastName ?? "",
        phoneE164,
        country,
        wcCustomerId: wcId,
        authProvider: null,
        authUserId: null,
        source: "woocommerce_import",
      })
      .returning();

    await db.insert(wpCustomerIdMapTable).values({
      customersId: inserted.id,
      wcCustomerId: wcId,
      wcStoreKey: storeKey,
      status: "imported",
      notes: `email=${email}`,
    });

    // Best-effort Clerk propagation (so web sign-in can find them).
    await ensureClerkUser(email, firstName, lastName, inserted.id);

    return "imported";
  } catch (err: any) {
    const msg: string = err?.message ?? String(err);
    // Unique constraint on email = duplicate from another store already imported.
    if (/unique|duplicate/i.test(msg)) {
      await db.insert(wpCustomerIdMapTable).values({
        customersId: null,
        wcCustomerId: wcId,
        wcStoreKey: storeKey,
        status: "skipped_duplicate",
        notes: msg.slice(0, 200),
      }).catch(() => {});
      return "skipped_duplicate";
    }
    console.error(`[import] FAILED: WC #${wcId} <${email}> — ${msg}`);
    await db.insert(wpCustomerIdMapTable).values({
      customersId: null,
      wcCustomerId: wcId,
      wcStoreKey: storeKey,
      status: "failed",
      notes: msg.slice(0, 200),
    }).catch(() => {});
    return "failed";
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length || 1) }, async () => {
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
  const stores = getStores();
  if (stores.length === 0) {
    console.error("[import] No WC credentials configured. Set WC_CONSUMER_KEY (and optionally WC_DUBAI_*, WC_ABUDHABI_*, WC_CYPRUS_*).");
    process.exit(1);
  }

  console.log(`[import] Starting${DRY_RUN ? " (dry-run)" : ""}. Stores: ${stores.map((s) => s.key).join(", ")}`);
  if (LIMIT) console.log(`[import] Limit: ${LIMIT}`);

  let imported = 0, alreadyExists = 0, skippedDuplicate = 0, failed = 0, processed = 0;

  for (const store of stores) {
    console.log(`\n[import] Processing store: ${store.key}`);
    let page = 1;

    for (;;) {
      const batch = await fetchPage(store, page);
      if (batch.length === 0) break;

      const remaining = LIMIT != null ? LIMIT - processed : batch.length;
      const slice = batch.slice(0, remaining);

      const results = await runWithConcurrency(slice, CONCURRENCY, (wc) =>
        processWcCustomer(wc, store.key),
      );

      for (const r of results) {
        processed++;
        if (r === "imported") imported++;
        else if (r === "already_exists") alreadyExists++;
        else if (r === "skipped_duplicate") skippedDuplicate++;
        else failed++;
      }

      console.log(`[import] ${store.key} page ${page}: processed=${processed} imported=${imported} already_exists=${alreadyExists} skipped_duplicate=${skippedDuplicate} failed=${failed}`);

      if (batch.length < PAGE_SIZE || (LIMIT != null && processed >= LIMIT)) break;
      page++;
    }
  }

  console.log(`\n[import] Done.`);
  console.log(`  imported        : ${imported}`);
  console.log(`  already_exists  : ${alreadyExists}`);
  console.log(`  skipped_dup     : ${skippedDuplicate}`);
  console.log(`  failed          : ${failed}`);
  console.log(`  total processed : ${processed}`);

  if (failed > 0) {
    throw new Error(`${failed} customer(s) failed to import. Check wp_customer_id_map for details.`);
  }
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[import] error:", err?.message ?? err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
