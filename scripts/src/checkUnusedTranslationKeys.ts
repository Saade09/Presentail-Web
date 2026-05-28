/**
 * checkUnusedTranslationKeys / checkMissingTranslationKeys
 *
 * Two complementary checks in one script:
 *
 * 1. UNUSED keys — keys defined in the EN locale that are never referenced in
 *    any TypeScript/TSX source file under `artifacts/presentail`.
 *
 * 2. MISSING keys — keys present in EN but absent from AR or FR, meaning a
 *    shopper on those locales would see a raw key string instead of translated
 *    text.
 *
 * Exit code 0 → all EN keys are in use AND AR/FR are complete.
 * Exit code 1 → at least one unused or missing key was found (or the script errored).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run check-translations
 *   pnpm --filter @workspace/scripts run check-unused-translations   (alias)
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../");

const TRANSLATIONS_FILE = path.join(
  REPO_ROOT,
  "artifacts/presentail/lib/translations.ts",
);
const SCAN_ROOT = path.join(REPO_ROOT, "artifacts/presentail");

const SKIP_DIRS = new Set([
  "node_modules",
  ".expo",
  "dist",
  ".turbo",
  "__generated__",
]);

// ── helpers ──────────────────────────────────────────────────────────────────

function collectFiles(dir: string, results: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectFiles(path.join(dir, entry.name), results);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

/**
 * Extract the top-level property keys from a locale block.
 *
 * Matches `const <NAME>[optional type annotation] = {` … `};` at the start
 * of a line so it won't accidentally capture nested objects.
 */
function extractLocaleKeys(src: string, localeName: string): string[] {
  // Allow for optional type annotation: `const AR: typeof EN = {`
  const blockRe = new RegExp(
    `^const ${localeName}(?:[^=]*)=\\s*\\{([\\s\\S]*?)^};`,
    "m",
  );
  const match = src.match(blockRe);
  if (!match) {
    throw new Error(
      `Could not locate \`const ${localeName} … = { … }\` block`,
    );
  }
  const block = match[1];
  const keys: string[] = [];
  for (const m of block.matchAll(/^\s+([a-zA-Z_][a-zA-Z0-9_]*):/gm)) {
    keys.push(m[1]);
  }
  return keys;
}

// ── main ─────────────────────────────────────────────────────────────────────

const translationsSrc = fs.readFileSync(TRANSLATIONS_FILE, "utf8");

const enKeys = extractLocaleKeys(translationsSrc, "EN");
if (enKeys.length === 0) {
  console.error("ERROR: No keys extracted from the EN object — aborting.");
  process.exit(1);
}

const arKeys = new Set(extractLocaleKeys(translationsSrc, "AR"));
const frKeys = new Set(extractLocaleKeys(translationsSrc, "FR"));

// ── Check 1: unused keys ─────────────────────────────────────────────────────
// Collect every source file except translations.ts itself
const files = collectFiles(SCAN_ROOT).filter(
  (f) => f !== TRANSLATIONS_FILE,
);

// Build a combined corpus of all source content for fast substring scanning.
// We concatenate with a sentinel so key names cannot straddle file boundaries.
const corpus = files.map((f) => fs.readFileSync(f, "utf8")).join("\n\0\n");

// For each key we accept any of:
//   t.keyName          – dot-notation property access
//   "keyName"          – double-quoted string literal (bracket / data access)
//   'keyName'          – single-quoted string literal
function isKeyReferenced(key: string, corpus: string): boolean {
  const dotRe = new RegExp(`\\.${key}(?![a-zA-Z0-9_])`);
  if (dotRe.test(corpus)) return true;
  const litRe = new RegExp(`['"]${key}['"]`);
  return litRe.test(corpus);
}

const unusedKeys = enKeys.filter((key) => !isKeyReferenced(key, corpus));

// ── Check 2: missing keys in AR / FR ─────────────────────────────────────────
type LocaleGap = { locale: string; missingKeys: string[] };

const localeGaps: LocaleGap[] = [];

for (const [locale, keySet] of [
  ["AR", arKeys],
  ["FR", frKeys],
] as [string, Set<string>][]) {
  const missing = enKeys.filter((k) => !keySet.has(k));
  if (missing.length > 0) {
    localeGaps.push({ locale, missingKeys: missing });
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
let failed = false;

if (unusedKeys.length > 0) {
  failed = true;
  console.error(
    `\n✗ Found ${unusedKeys.length} unused translation key${unusedKeys.length === 1 ? "" : "s"} (out of ${enKeys.length}):\n`,
  );
  for (const key of unusedKeys) {
    console.error(`  - ${key}`);
  }
  console.error(
    "\nRemove these keys from all three language blocks in artifacts/presentail/lib/translations.ts.\n",
  );
}

if (localeGaps.length > 0) {
  failed = true;
  for (const { locale, missingKeys } of localeGaps) {
    console.error(
      `\n✗ ${missingKeys.length} key${missingKeys.length === 1 ? "" : "s"} present in EN but missing from ${locale}:\n`,
    );
    for (const key of missingKeys) {
      console.error(`  - ${key}`);
    }
  }
  console.error(
    "\nAdd the missing keys to the affected locale block(s) in artifacts/presentail/lib/translations.ts.\n",
  );
}

if (!failed) {
  console.log(
    `✓ All ${enKeys.length} EN keys are in use and AR/FR are complete.`,
  );
  process.exit(0);
} else {
  process.exit(1);
}
