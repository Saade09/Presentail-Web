/**
 * Backfill loyalty points for historical delivered (`completed`) orders.
 *
 * For each Presentail WooCommerce store, walks all completed orders, matches
 * each one to a local customer row by email, and POSTs to the API server's
 * admin credit-order endpoint. The endpoint uses the same idempotent ledger
 * path as the live order-event push handler — so this script is safe to
 * re-run as many times as needed; orders that have already been credited
 * become no-ops.
 *
 * Required env:
 *   PUSH_ADMIN_TOKEN          - server admin token, used as `x-push-admin-token`
 *   API_BASE_URL              - e.g. http://localhost:80 or https://presentail.com
 *   DATABASE_URL              - to look up local customer rows by email
 *   At least one store's WC creds, see STORES below.
 *
 * Optional flags:
 *   --store=lebanon|dubai|abudhabi|cyprus    (repeatable; default = all configured)
 *   --since=YYYY-MM-DD                       (skip older orders)
 *   --dry-run
 */

import { db, pool, customersTable, type Customer } from "@workspace/db";
import { eq } from "drizzle-orm";

type StoreKey = "lebanon" | "dubai" | "abudhabi" | "cyprus";

type StoreCfg = {
  key: StoreKey;
  country: string;
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
};

const STORES: StoreCfg[] = [
  {
    key: "lebanon",
    country: "LB",
    baseUrl: "https://presentail.com/lebanon/wp-json/wc/v3",
    consumerKey: process.env.WC_CONSUMER_KEY ?? "",
    consumerSecret: process.env.WC_CONSUMER_SECRET ?? "",
  },
  {
    key: "dubai",
    country: "AE",
    baseUrl: "https://presentail.com/dubai/wp-json/wc/v3",
    consumerKey: process.env.WC_DUBAI_CONSUMER_KEY ?? "",
    consumerSecret: process.env.WC_DUBAI_CONSUMER_SECRET ?? "",
  },
  {
    key: "abudhabi",
    country: "AE",
    baseUrl: "https://presentail.com/abudhabi/wp-json/wc/v3",
    consumerKey: process.env.WC_ABUDHABI_CONSUMER_KEY ?? "",
    consumerSecret: process.env.WC_ABUDHABI_CONSUMER_SECRET ?? "",
  },
  {
    key: "cyprus",
    country: "CY",
    baseUrl: "https://presentail.com/cyprus/wp-json/wc/v3",
    consumerKey: process.env.WC_CYPRUS_CONSUMER_KEY ?? "",
    consumerSecret: process.env.WC_CYPRUS_CONSUMER_SECRET ?? "",
  },
];

const adminToken = process.env.PUSH_ADMIN_TOKEN ?? "";
const apiBaseUrl = (process.env.API_BASE_URL ?? "http://localhost:80").replace(
  /\/$/,
  "",
);

if (!adminToken) {
  console.error("PUSH_ADMIN_TOKEN must be set");
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const onlyStores = args
  .filter((a) => a.startsWith("--store="))
  .map((a) => a.slice("--store=".length).toLowerCase());
const sinceArg = args.find((a) => a.startsWith("--since="));
const sinceDate = sinceArg ? new Date(sinceArg.slice("--since=".length)) : null;
if (sinceArg && sinceDate && Number.isNaN(sinceDate.getTime())) {
  console.error(`Invalid --since value: ${sinceArg}`);
  process.exit(1);
}

type WcOrder = {
  id: number;
  status: string;
  total: string;
  currency: string;
  date_completed_gmt?: string | null;
  date_created_gmt?: string | null;
  customer_id?: number | null;
  billing?: { email?: string };
};

async function wcGet(store: StoreCfg, path: string): Promise<Response> {
  const auth =
    "Basic " +
    Buffer.from(`${store.consumerKey}:${store.consumerSecret}`).toString(
      "base64",
    );
  return fetch(`${store.baseUrl}${path}`, {
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "PresentailBackfill/1.0",
    },
  });
}

async function* walkCompletedOrders(
  store: StoreCfg,
): AsyncGenerator<WcOrder> {
  const perPage = 100;
  for (let page = 1; ; page++) {
    const sinceQs = sinceDate
      ? `&after=${encodeURIComponent(sinceDate.toISOString())}`
      : "";
    const r = await wcGet(
      store,
      `/orders?status=completed&per_page=${perPage}&page=${page}&orderby=date&order=asc${sinceQs}`,
    );
    if (r.status === 400) {
      // WC returns 400 with rest_invalid_page_number past the last page.
      return;
    }
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new Error(
        `[${store.key}] WC orders page ${page} failed: ${r.status} ${body.slice(0, 200)}`,
      );
    }
    const batch = (await r.json()) as WcOrder[];
    if (!Array.isArray(batch) || batch.length === 0) return;
    for (const o of batch) yield o;
    if (batch.length < perPage) return;
  }
}

async function findLocalCustomer(email: string): Promise<Customer | null> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return null;
  const rows = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.email, trimmed))
    .limit(1);
  return rows[0] ?? null;
}

async function creditOrder(
  customerId: number,
  wcOrderId: number,
  totalUsdCents: number,
  storeKey: StoreKey,
): Promise<{ credited: boolean; pointsAwarded: number }> {
  if (dryRun) {
    return { credited: false, pointsAwarded: 0 };
  }
  const r = await fetch(`${apiBaseUrl}/api/admin/loyalty/credit-order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-push-admin-token": adminToken,
    },
    body: JSON.stringify({
      customerId,
      wcOrderId,
      totalUsdCents,
      storeKey,
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(
      `credit-order ${customerId}/${wcOrderId} failed: ${r.status} ${body.slice(0, 200)}`,
    );
  }
  const data = (await r.json()) as {
    credited: boolean;
    pointsAwarded: number;
  };
  return data;
}

function toUsdCents(total: string, currency: string): number | null {
  // The backfill assumes WC totals are stored in USD (matching the
  // "Currency on the wire" architecture decision in replit.md). If a store
  // returned non-USD totals at some point in the past, those orders need a
  // separate FX-aware backfill — skip them here so we don't credit wrong
  // amounts.
  if (currency && currency.toUpperCase() !== "USD") return null;
  const n = Number.parseFloat(total);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

async function processStore(store: StoreCfg): Promise<void> {
  if (!store.consumerKey || !store.consumerSecret) {
    console.log(`[${store.key}] skipped (no WC credentials)`);
    return;
  }
  console.log(`[${store.key}] starting backfill (country=${store.country})`);
  let scanned = 0;
  let matched = 0;
  let credited = 0;
  let pointsTotal = 0;
  let skippedNoEmail = 0;
  let skippedNonUsd = 0;
  let skippedNoCustomer = 0;
  let errors = 0;

  for await (const order of walkCompletedOrders(store)) {
    scanned++;
    const email = (order.billing?.email ?? "").trim();
    if (!email) {
      skippedNoEmail++;
      continue;
    }
    const usdCents = toUsdCents(order.total, order.currency);
    if (usdCents == null) {
      skippedNonUsd++;
      continue;
    }
    const customer = await findLocalCustomer(email);
    if (!customer) {
      skippedNoCustomer++;
      continue;
    }
    matched++;
    try {
      const r = await creditOrder(
        customer.id,
        order.id,
        usdCents,
        store.key,
      );
      if (r.credited) {
        credited++;
        pointsTotal += r.pointsAwarded;
      }
    } catch (err: any) {
      errors++;
      console.warn(
        `[${store.key}] order #${order.id} (${email}) failed: ${err?.message ?? err}`,
      );
    }
    if (scanned % 50 === 0) {
      console.log(
        `[${store.key}] scanned=${scanned} matched=${matched} credited=${credited}`,
      );
    }
  }

  console.log(
    `[${store.key}] done: scanned=${scanned} matched=${matched} credited=${credited} pointsAwarded=${pointsTotal} skippedNoEmail=${skippedNoEmail} skippedNonUsd=${skippedNonUsd} skippedNoCustomer=${skippedNoCustomer} errors=${errors}${dryRun ? " (dry-run)" : ""}`,
  );
}

async function main(): Promise<void> {
  const stores = STORES.filter(
    (s) => onlyStores.length === 0 || onlyStores.includes(s.key),
  );
  if (stores.length === 0) {
    console.error(`No stores matched --store=${onlyStores.join(",")}`);
    process.exit(1);
  }
  for (const s of stores) {
    try {
      await processStore(s);
    } catch (err: any) {
      console.error(`[${s.key}] aborted: ${err?.message ?? err}`);
    }
  }
}

main()
  .catch((err) => {
    console.error("backfill failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
