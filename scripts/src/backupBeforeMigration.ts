import { pool } from "@workspace/db";
import fs from "node:fs";
import path from "node:path";

// Pre-migration backup script. Exports key tables to timestamped SQL dump
// files using COPY … TO STDOUT so no pg_dump binary is required.
// The output directory defaults to ./backups relative to cwd.
//
// Run:
//   DATABASE_URL=<prod-url> pnpm --filter @workspace/scripts run backup-before-migration
//
// Options:
//   --dir=<path>    Output directory (default: ./backups)
//   --tables=a,b,c  Comma-separated list of tables (default: all five)
//
// The files are plain-text COPY FORMAT CSV. To restore a single table:
//   psql $DATABASE_URL -c "\COPY <table> FROM '<file>' CSV HEADER"

const DEFAULT_TABLES = [
  "customers",
  "customer_addresses",
  "app_orders",
  "loyalty_ledger",
  "loyalty_coupons",
];

const outDir = (() => {
  const flag = process.argv.find((a) => a.startsWith("--dir="));
  return flag ? flag.slice("--dir=".length) : path.join(process.cwd(), "backups");
})();

const tables = (() => {
  const flag = process.argv.find((a) => a.startsWith("--tables="));
  return flag
    ? flag.slice("--tables=".length).split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_TABLES;
})();

const SAFE_TABLE_NAME = /^[a-z_][a-z0-9_]*$/;

async function dumpTable(client: { query: (sql: string) => Promise<{ rows: any[]; fields: { name: string }[] }>; }, tableName: string, outPath: string): Promise<number> {
  // Security: reject any table name that doesn't look like a plain identifier.
  if (!SAFE_TABLE_NAME.test(tableName)) {
    throw new Error(`Unsafe table name: "${tableName}"`);
  }

  // Use COPY TO STDOUT with CSV HEADER so the output is human-readable and
  // importable by \COPY without schema knowledge.
  const chunks: Buffer[] = [];
  let rowCount = 0;

  // node-postgres exposes the COPY protocol via client.query(CopyToStream)
  // through the pg-copy-streams package (not available here), so we fall back
  // to a plain SELECT and write CSV manually. For backup purposes this is fine
  // (not streaming, but safe for typical customer table sizes).
  const result = await client.query(`SELECT * FROM ${tableName}`);
  rowCount = result.rows.length;

  if (rowCount === 0) {
    fs.writeFileSync(outPath, "");
    return 0;
  }

  const headers = result.fields.map((f: { name: string }) => f.name);
  const escapeCell = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = v instanceof Date ? v.toISOString() : String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const lines: string[] = [headers.join(",")];
  for (const row of result.rows) {
    lines.push(headers.map((h: string) => escapeCell(row[h])).join(","));
  }

  fs.writeFileSync(outPath, lines.join("\n") + "\n");
  return rowCount;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("[backup] DATABASE_URL must be set.");
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  console.log(`[backup] Writing to: ${outDir}`);
  console.log(`[backup] Tables: ${tables.join(", ")}`);

  const client = await pool.connect();
  try {
    for (const table of tables) {
      const outPath = path.join(outDir, `${table}-${ts}.csv`);
      try {
        const count = await dumpTable(client, table, outPath);
        console.log(`[backup] ${table}: ${count} rows → ${path.basename(outPath)}`);
      } catch (err: any) {
        console.error(`[backup] ${table}: FAILED — ${err?.message ?? err}`);
      }
    }
  } finally {
    client.release();
  }

  console.log(`\n[backup] Done. Files are in ${outDir}`);
  console.log(`[backup] To restore a table:`);
  console.log(`  psql $DATABASE_URL -c "\\COPY <table> FROM '<file>' CSV HEADER"`);
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[backup] failed:", err?.message ?? err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
