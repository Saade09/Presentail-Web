import { db, pool, customersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";

// Audit script: compare every WooCommerce customer across all regional
// stores against the local `customers` table and classify each record
// into one of three groups:
//   1. already_mirrored — email found locally AND wc_customer_id set
//   2. email_match_no_wc_id — email found locally but wc_customer_id is NULL
//   3. wc_only — no local row at all for this email
//
// Run:  DATABASE_URL=... WC_CONSUMER_KEY=... pnpm --filter @workspace/scripts run audit-wc-customers
// The script writes a timestamped CSV report to the current working directory.

const PAGE_SIZE = 100;

type StoreConfig = {
  key: string;
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
};

function getStores(): StoreConfig[] {
  const stores: StoreConfig[] = [];
  const lb = process.env.WC_CONSUMER_KEY;
  if (lb) {
    stores.push({
      key: "lebanon",
      baseUrl: "https://presentail.com/lebanon/wp-json/wc/v3",
      consumerKey: lb,
      consumerSecret: process.env.WC_CONSUMER_SECRET ?? "",
    });
  }
  const dubai = process.env.WC_DUBAI_CONSUMER_KEY;
  if (dubai) {
    stores.push({
      key: "dubai",
      baseUrl: "https://presentail.com/dubai/wp-json/wc/v3",
      consumerKey: dubai,
      consumerSecret: process.env.WC_DUBAI_CONSUMER_SECRET ?? "",
    });
  }
  const abudhabi = process.env.WC_ABUDHABI_CONSUMER_KEY;
  if (abudhabi) {
    stores.push({
      key: "abudhabi",
      baseUrl: "https://presentail.com/abudhabi/wp-json/wc/v3",
      consumerKey: abudhabi,
      consumerSecret: process.env.WC_ABUDHABI_CONSUMER_SECRET ?? "",
    });
  }
  const cyprus = process.env.WC_CYPRUS_CONSUMER_KEY;
  if (cyprus) {
    stores.push({
      key: "cyprus",
      baseUrl: "https://presentail.com/cyprus/wp-json/wc/v3",
      consumerKey: cyprus,
      consumerSecret: process.env.WC_CYPRUS_CONSUMER_SECRET ?? "",
    });
  }
  return stores;
}

function authHeader(store: StoreConfig): string {
  return "Basic " + Buffer.from(`${store.consumerKey}:${store.consumerSecret}`).toString("base64");
}

async function fetchPage(store: StoreConfig, page: number): Promise<any[]> {
  const url = `${store.baseUrl}/customers?per_page=${PAGE_SIZE}&page=${page}&orderby=id&order=asc`;
  const r = await fetch(url, {
    headers: { Authorization: authHeader(store) },
  });
  if (!r.ok) {
    console.warn(`[audit] ${store.key}: HTTP ${r.status} on page ${page}`);
    return [];
  }
  const data = await r.json() as any[];
  return Array.isArray(data) ? data : [];
}

async function* iterateStoreCustomers(store: StoreConfig): AsyncGenerator<any> {
  let page = 1;
  for (;;) {
    const batch = await fetchPage(store, page);
    for (const c of batch) yield c;
    if (batch.length < PAGE_SIZE) break;
    page++;
  }
}

type AuditRow = {
  wcStoreKey: string;
  wcCustomerId: number;
  wcEmail: string;
  wcFirstName: string;
  wcLastName: string;
  group: "already_mirrored" | "email_match_no_wc_id" | "wc_only";
  localId?: number;
  localWcCustomerId?: number | null;
};

async function main(): Promise<void> {
  const stores = getStores();
  if (stores.length === 0) {
    console.error("[audit] No WC credentials found — set WC_CONSUMER_KEY (and optionally WC_DUBAI_*, WC_ABUDHABI_*, WC_CYPRUS_*).");
    process.exit(1);
  }

  console.log(`[audit] Scanning ${stores.map((s) => s.key).join(", ")}…`);

  const rows: AuditRow[] = [];
  let totalWc = 0;

  for (const store of stores) {
    let storeTotal = 0;
    for await (const wc of iterateStoreCustomers(store)) {
      const email = String(wc.email ?? "").trim().toLowerCase();
      if (!email) continue;
      totalWc++;
      storeTotal++;

      const [local] = await db
        .select()
        .from(customersTable)
        .where(eq(customersTable.email, email))
        .limit(1);

      let group: AuditRow["group"];
      if (!local) {
        group = "wc_only";
      } else if (!local.wcCustomerId) {
        group = "email_match_no_wc_id";
      } else {
        group = "already_mirrored";
      }

      rows.push({
        wcStoreKey: store.key,
        wcCustomerId: wc.id as number,
        wcEmail: email,
        wcFirstName: String(wc.first_name ?? ""),
        wcLastName: String(wc.last_name ?? ""),
        group,
        localId: local?.id,
        localWcCustomerId: local?.wcCustomerId,
      });
    }
    console.log(`[audit] ${store.key}: ${storeTotal} WC customers scanned`);
  }

  const alreadyMirrored = rows.filter((r) => r.group === "already_mirrored").length;
  const emailMatchNoWcId = rows.filter((r) => r.group === "email_match_no_wc_id").length;
  const wcOnly = rows.filter((r) => r.group === "wc_only").length;

  console.log(`\n[audit] Results:`);
  console.log(`  Total WC customers scanned : ${totalWc}`);
  console.log(`  1. already_mirrored        : ${alreadyMirrored}`);
  console.log(`  2. email_match_no_wc_id    : ${emailMatchNoWcId}`);
  console.log(`  3. wc_only (need import)   : ${wcOnly}`);

  // Write CSV report
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = path.join(process.cwd(), `wc-customer-audit-${ts}.csv`);
  const header = "wc_store_key,wc_customer_id,wc_email,wc_first_name,wc_last_name,group,local_id,local_wc_customer_id\n";
  const lines = rows.map((r) =>
    [
      r.wcStoreKey,
      r.wcCustomerId,
      `"${r.wcEmail.replace(/"/g, '""')}"`,
      `"${r.wcFirstName.replace(/"/g, '""')}"`,
      `"${r.wcLastName.replace(/"/g, '""')}"`,
      r.group,
      r.localId ?? "",
      r.localWcCustomerId ?? "",
    ].join(","),
  );
  fs.writeFileSync(outPath, header + lines.join("\n") + "\n");
  console.log(`\n[audit] CSV report written to: ${outPath}`);
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[audit] failed:", err?.message ?? err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
