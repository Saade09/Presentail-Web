/**
 * checkTranslations
 *
 * Unified translation-health orchestrator.  Runs all four translation checkers
 * in sequence and aggregates their results into a single pass/fail report:
 *
 *   1. checkUnusedMobileTranslationKeys — unused/missing/placeholder keys in
 *      the mobile three-locale catalogue (EN / AR / FR).
 *   2. checkUnusedWebTranslationKeys   — unused/missing/placeholder keys in
 *      the web locale modules (STRINGS / STRINGS_FR / ar fields).
 *   3. checkHardcodedMobileStrings     — JSX text that should go through
 *      useT() on mobile.
 *   4. checkHardcodedWebStrings        — JSX text that should go through t()
 *      on the web storefront.
 *
 * Each checker is spawned as a child process so its own process.exit() calls
 * are contained.  stdout and stderr are forwarded in real time.  At the end a
 * compact summary table is printed and this process exits with code 1 when any
 * checker failed.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run check-translations [--verbose]
 *
 * --verbose is forwarded to each sub-checker that supports it.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const verbose = process.argv.includes("--verbose");

const CHECKERS: { name: string; script: string }[] = [
  {
    name: "Unused mobile translation keys",
    script: "checkUnusedMobileTranslationKeys.ts",
  },
  {
    name: "Unused web translation keys",
    script: "checkUnusedWebTranslationKeys.ts",
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
};

const results: Result[] = [];

for (const checker of CHECKERS) {
  const scriptPath = path.join(__dirname, checker.script);
  const args = verbose ? ["--verbose"] : [];

  console.log(`\n${"─".repeat(72)}`);
  console.log(`▶  ${checker.name}`);
  console.log(`${"─".repeat(72)}`);

  const proc = spawnSync(
    process.execPath,
    ["--import", "tsx/esm", scriptPath, ...args],
    { stdio: "inherit", env: { ...process.env } },
  );

  const passed = proc.status === 0;
  results.push({ name: checker.name, passed });

  if (proc.error) {
    console.error(`\nFailed to spawn checker: ${proc.error.message}`);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

const width = Math.max(...results.map((r) => r.name.length)) + 4;
const allPassed = results.every((r) => r.passed);

console.log(`\n${"═".repeat(72)}`);
console.log("  Translation check summary");
console.log(`${"═".repeat(72)}`);

for (const r of results) {
  const icon = r.passed ? "✓" : "✗";
  const label = r.name.padEnd(width);
  console.log(`  ${icon}  ${label}${r.passed ? "passed" : "FAILED"}`);
}

console.log(`${"─".repeat(72)}`);

if (allPassed) {
  console.log("  All checks passed.\n");
  process.exit(0);
} else {
  const failed = results.filter((r) => !r.passed).length;
  console.error(
    `  ${failed} of ${results.length} check${results.length === 1 ? "" : "s"} failed.\n`,
  );
  process.exit(1);
}
