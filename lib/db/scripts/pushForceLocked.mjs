#!/usr/bin/env node

import { spawn } from "node:child_process";
import pg from "pg";

const { Client } = pg;
const LOCK_NAME = "presentail-production-schema-migration-v1";
const timeoutMs = Number(process.env.MIGRATION_LOCK_TIMEOUT_MS ?? 600_000);
const pollMs = 5_000;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is required for the production migration lock.",
  );
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  application_name: "presentail-schema-migration",
});

function runMigration() {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["run", "push-force"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `Schema migration failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`,
          ),
        );
    });
  });
}

async function acquireLock() {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await client.query(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",
      [LOCK_NAME],
    );
    if (result.rows[0]?.acquired === true) {
      console.log(
        `MIGRATION_LOCK acquired wait_ms=${Date.now() - started} name=${LOCK_NAME}`,
      );
      return;
    }
    console.log(`MIGRATION_LOCK waiting name=${LOCK_NAME}`);
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for another production schema migration to finish.`,
  );
}

try {
  await client.connect();
  await acquireLock();
  await runMigration();
} finally {
  try {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [LOCK_NAME]);
  } catch {
    // Closing the session releases the lock even when explicit unlock fails.
  }
  await client.end().catch(() => undefined);
}
