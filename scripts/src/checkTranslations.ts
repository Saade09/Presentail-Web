/**
 * checkTranslations
 *
 * Unified translation-health orchestrator.  Runs all translation checkers
 * in parallel and aggregates their results into a single pass/fail report:
 *
 *   1. checkUnusedMobileTranslationKeys — unused/missing/placeholder keys in
 *      the mobile three-locale catalogue (EN / AR / FR).
 *   2. checkUnusedWebTranslationKeys   — unused/missing/placeholder keys in
 *      the web locale modules (STRINGS / STRINGS_FR / ar fields).
 *   3. checkHardcodedMobileStrings     — JSX text that should go through
 *      useT() on mobile.
 *   4. checkHardcodedWebStrings        — JSX text that should go through t()
 *      on the web storefront.
 *   5. checkHardcodedApiStrings        — user-facing strings that should be
 *      localised in the API server responses.
 *
 * Each checker is spawned as a child process so its own process.exit() calls
 * are contained.  All checkers run concurrently; stdout/stderr are buffered
 * per checker and flushed to the terminal in a single grouped block once the
 * checker finishes.  At the end a compact summary table is printed and this
 * process exits with code 1 when any checker failed.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run check-translations [--verbose] [--assert-unused key1,key2,...]
 *
 * --verbose is forwarded to each sub-checker that supports it.
 *
 * --assert-unused <key1,key2,...>
 *   Exits non-zero if the specified comma-separated translation keys are NOT
 *   found to be unused in any platform (mobile or web).  A key is considered
 *   unused when at least one checker reports it as unused — union semantics, so
 *   a mobile-only key does not trip up the web checker and vice-versa.
 *
 *   Use this to confirm a problem exists before removing keys — if the
 *   assertion fails it means the keys are still referenced (or have already been
 *   removed), so no fix is needed.
 *
 *   Each unused-key checker writes its found unused-key set to a temp file
 *   (via the ASSERT_UNUSED_RESULT env var); the orchestrator reads both files
 *   and evaluates the union assertion after all checkers finish.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const verbose = process.argv.includes("--verbose");

const assertUnusedIdx = process.argv.indexOf("--assert-unused");
const assertUnusedValue =
  assertUnusedIdx !== -1 ? (process.argv[assertUnusedIdx + 1] ?? "") : null;

if (assertUnusedIdx !== -1 && !assertUnusedValue) {
  console.error(
    "ERROR: --assert-unused requires a comma-separated list of key names as the next argument.\n" +
      "  Example: --assert-unused heroTitle,checkoutStep0\n",
  );
  process.exit(1);
}

const assertedKeys: string[] = assertUnusedValue
  ? assertUnusedValue.split(",").map((s) => s.trim()).filter(Boolean)
  : [];

// Temp files for the unused-key checkers to write their results into.
// Only created when --assert-unused is active.
const mobileResultFile = assertedKeys.length > 0
  ? path.join(os.tmpdir(), `check-translations-mobile-${randomUUID()}.json`)
  : null;
const webResultFile = assertedKeys.length > 0
  ? path.join(os.tmpdir(), `check-translations-web-${randomUUID()}.json`)
  : null;

type CheckerDef = {
  name: string;
  script: string;
  extraEnv?: Record<string, string>;
};

const CHECKERS: CheckerDef[] = [
  {
    name: "Unused mobile translation keys",
    script: "checkUnusedMobileTranslationKeys.ts",
    extraEnv: mobileResultFile ? { ASSERT_UNUSED_RESULT: mobileResultFile } : {},
  },
  {
    name: "Unused web translation keys",
    script: "checkUnusedWebTranslationKeys.ts",
    extraEnv: webResultFile ? { ASSERT_UNUSED_RESULT: webResultFile } : {},
  },
  {
    name: "Hardcoded mobile strings",
    script: "checkHardcodedMobileStrings.ts",
  },
  {
    name: "Hardcoded web strings",
    script: "checkHardcodedWebStrings.ts",
  },
  {
    name: "Hardcoded API strings",
    script: "checkHardcodedApiStrings.ts",
  },
];

type Result = {
  name: string;
  passed: boolean;
  output: string;
};

function runChecker(checker: CheckerDef): Promise<Result> {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, checker.script);
    const args = verbose ? ["--verbose"] : [];

    const chunks: Buffer[] = [];

    const proc = spawn(
      process.execPath,
      ["--import", "tsx/esm", scriptPath, ...args],
      { env: { ...process.env, ...(checker.extraEnv ?? {}) } },
    );

    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));

    proc.on("error", (err) => {
      chunks.push(Buffer.from(`\nFailed to spawn checker: ${err.message}\n`));
      resolve({ name: checker.name, passed: false, output: Buffer.concat(chunks).toString() });
    });

    proc.on("close", (code) => {
      resolve({
        name: checker.name,
        passed: code === 0,
        output: Buffer.concat(chunks).toString(),
      });
    });
  });
}

// ── Run all checkers concurrently ─────────────────────────────────────────────

const results = await Promise.all(CHECKERS.map(runChecker));

// ── Print buffered output grouped per checker ─────────────────────────────────

for (const result of results) {
  console.log(`\n${"─".repeat(72)}`);
  console.log(`▶  ${result.name}`);
  console.log(`${"─".repeat(72)}`);
  process.stdout.write(result.output);
}

// ── Assert-unused check (union across mobile + web) ───────────────────────────
// After both unused-key checkers have finished, read their result files and
// evaluate the assertion against the union of unused keys they found.  Union
// semantics mean a mobile-only key does not cause the web checker to fail the
// assertion (and vice-versa) — the key only needs to be unused in at least one
// platform's catalogue for the assertion to pass.

let assertionFailed = false;

if (assertedKeys.length > 0) {
  // Collect every key found as unused by any checker.
  const foundAsUnused = new Set<string>();

  for (const resultFile of [mobileResultFile, webResultFile]) {
    if (!resultFile) continue;
    try {
      const raw = fs.readFileSync(resultFile, "utf8");
      const data = JSON.parse(raw) as { unusedKeys?: string[] };
      for (const key of data.unusedKeys ?? []) {
        foundAsUnused.add(key);
      }
    } catch {
      // File missing or malformed — checker may have crashed before writing.
    } finally {
      try { fs.unlinkSync(resultFile); } catch { /* ignore */ }
    }
  }

  const notUnused = assertedKeys.filter((k) => !foundAsUnused.has(k));
  if (notUnused.length > 0) {
    assertionFailed = true;
    console.error(`\n${"═".repeat(72)}`);
    console.error("  --assert-unused failed");
    console.error(`${"═".repeat(72)}`);
    console.error(
      `\n  ${notUnused.length} key${notUnused.length === 1 ? "" : "s"} expected to be unused but ${notUnused.length === 1 ? "was" : "were"} not found as unused in any platform:\n`,
    );
    for (const key of notUnused) {
      console.error(`    - ${key}  (still referenced, already removed, or not in any catalogue)`);
    }
    console.error(
      "\n  Either the key is still used in mobile or web source, it was never\n" +
      "  added to any translation catalogue, or the issue was already resolved.\n",
    );
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

const width = Math.max(...results.map((r) => r.name.length)) + 4;
const allChecksPassed = results.every((r) => r.passed);

console.log(`\n${"═".repeat(72)}`);
console.log("  Translation check summary");
console.log(`${"═".repeat(72)}`);

for (const r of results) {
  const icon = r.passed ? "✓" : "✗";
  const label = r.name.padEnd(width);
  console.log(`  ${icon}  ${label}${r.passed ? "passed" : "FAILED"}`);
}

console.log(`${"─".repeat(72)}`);

if (allChecksPassed && !assertionFailed) {
  console.log("  All checks passed.\n");
  process.exit(0);
} else {
  const failed = results.filter((r) => !r.passed).length;
  if (failed > 0) {
    console.error(
      `  ${failed} of ${results.length} check${results.length === 1 ? "" : "s"} failed.\n`,
    );
  }
  if (assertionFailed) {
    console.error("  --assert-unused assertion failed (see above).\n");
  }
  process.exit(1);
}
