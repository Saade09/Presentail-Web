/**
 * checkUnusedTranslationKeys
 *
 * Scans all TypeScript/TSX source files under `artifacts/presentail` and
 * reports any key defined in `artifacts/presentail/lib/translations.ts` (the
 * EN object) that is never referenced.
 *
 * Exit code 0 → all keys are used.
 * Exit code 1 → at least one unused key was found (or the script errored).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run check-unused-translations
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

function extractEnKeys(src: string): string[] {
  const enMatch = src.match(/^const EN\s*=\s*\{([\s\S]*?)^};/m);
  if (!enMatch) throw new Error("Could not locate `const EN = { … }` block");
  const block = enMatch[1];
  const keys: string[] = [];
  for (const m of block.matchAll(/^\s+([a-zA-Z_][a-zA-Z0-9_]*):/gm)) {
    keys.push(m[1]);
  }
  return keys;
}

// ── main ─────────────────────────────────────────────────────────────────────

const translationsSrc = fs.readFileSync(TRANSLATIONS_FILE, "utf8");
const allKeys = extractEnKeys(translationsSrc);

if (allKeys.length === 0) {
  console.error("ERROR: No keys extracted from the EN object — aborting.");
  process.exit(1);
}

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
// The OR of these catches both direct usage and dynamic bracket-access patterns
// where the key appears as a typed string literal (e.g. { titleKey: "faqSec…" }).
function isKeyReferenced(key: string, corpus: string): boolean {
  // dot-notation: must be preceded by a word char boundary (avoid false matches
  // inside longer identifiers after the dot)
  const dotRe = new RegExp(`\\.${key}(?![a-zA-Z0-9_])`);
  if (dotRe.test(corpus)) return true;

  // string literal (single or double quote)
  const litRe = new RegExp(`['"]${key}['"]`);
  return litRe.test(corpus);
}

const unusedKeys = allKeys.filter((key) => !isKeyReferenced(key, corpus));

if (unusedKeys.length === 0) {
  console.log(`✓ All ${allKeys.length} translation keys are in use.`);
  process.exit(0);
} else {
  console.error(
    `\n✗ Found ${unusedKeys.length} unused translation key${unusedKeys.length === 1 ? "" : "s"} (out of ${allKeys.length}):\n`,
  );
  for (const key of unusedKeys) {
    console.error(`  - ${key}`);
  }
  console.error(
    "\nRemove these keys from all three language blocks in artifacts/presentail/lib/translations.ts.\n",
  );
  process.exit(1);
}
