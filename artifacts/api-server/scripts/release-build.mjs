#!/usr/bin/env node
/**
 * Production release stages for the API.
 *
 * Production migration is deliberately not performed here. It runs in the
 * protected db-migrate-prod workflow before an operator starts publishing.
 * Keeping this command read-only with respect to the database prevents schema
 * locks from making an otherwise healthy serving image fail promotion.
 */

import { spawn } from "node:child_process";

function elapsed(started) {
  return (
    Math.round((Number(process.hrtime.bigint() - started) / 1_000_000) * 100) /
    100
  );
}

function run(label, command, args) {
  const started = process.hrtime.bigint();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      const durationMs = elapsed(started);
      console.log(
        `RELEASE_STAGE name=${label} duration_ms=${durationMs} status=${code === 0 ? "passed" : "failed"}`,
      );
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `${label} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`,
          ),
        );
    });
  });
}

async function main() {
  await run("migration-gate-verification", "pnpm", [
    "--filter",
    "@workspace/api-server",
    "run",
    "verify-migration-gate",
  ]);
  await run("api-compilation", "pnpm", [
    "--filter",
    "@workspace/api-server",
    "run",
    "build",
  ]);
  await run("api-artifact-verification", "pnpm", [
    "--filter",
    "@workspace/api-server",
    "run",
    "verify-build",
  ]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
