#!/usr/bin/env node
/**
 * Production release stages for the API.
 *
 * Migration remains before compilation so a failed schema push prevents a new
 * server from being promoted. The stages are separate and timed for release
 * reporting. The legacy combined command is available only with an explicit
 * opt-in for rollback while this gate is proven.
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
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "RELEASE_STAGE migration blocked: DATABASE_URL is required; refusing to compile a production release without the schema gate.",
    );
  }

  const allowLegacy = process.env.API_RELEASE_ALLOW_LEGACY_PIPELINE === "1";
  const staged = process.env.API_RELEASE_STAGED !== "0";
  if (!staged) {
    if (!allowLegacy) {
      throw new Error(
        "Legacy API release pipeline is disabled. Set API_RELEASE_ALLOW_LEGACY_PIPELINE=1 only for an approved rollback.",
      );
    }
    console.warn(
      "RELEASE_STAGE fallback=legacy enabled by explicit API_RELEASE_ALLOW_LEGACY_PIPELINE=1",
    );
    await run("migration-and-api-build-legacy", "sh", [
      "-c",
      "pnpm --filter @workspace/db run push-force-prod-locked && pnpm --filter @workspace/api-server run build",
    ]);
    return;
  }

  await run("schema-migration", "pnpm", [
    "--filter",
    "@workspace/db",
    "run",
    "push-force-prod-locked",
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
