/**
 * checkUnusedMobileTranslationKeys
 *
 * Scans all TypeScript/TSX source files under `artifacts/presentail` and
 * reports translation issues in the mobile app's three-language catalogue
 * (`artifacts/presentail/lib/translations.ts`).
 *
 * The catalogue exports a `translations` object with three locale blocks:
 *   • `EN` — canonical English strings (the source of truth for all keys)
 *   • `AR` — Arabic translations, typed `typeof EN` (TS enforces parity)
 *   • `FR` — French translations, typed `typeof EN` (TS enforces parity)
 *
 * Translation keys are flat camelCase identifiers (e.g. `heroTitle`,
 * `checkoutStep0`). Call sites access them as property reads on the `t`
 * object returned by `useT()`:
 *   • `t.keyName`        — dot notation
 *   • `t["keyName"]`     — bracket notation with string literal
 *
 * Three checks are run:
 *
 * 1. UNUSED KEYS — EN keys never referenced in any source file under
 *    `artifacts/presentail`.  Unused keys bloat the bundle and mislead
 *    translators.
 *
 * 2. LOCALE PARITY — EN keys absent from AR or FR (TypeScript already
 *    enforces this at build time, but the script gives a fast runtime
 *    confirmation without a full typecheck).
 *
 * 3. UNDEFINED KEY REFERENCES — static `t.keyName` / `t["keyName"]` call
 *    sites that reference a key not present in EN.  These silently resolve
 *    to `undefined` at runtime and render as blank strings to shoppers.
 *    Dynamic accesses (`t[someVar]`) cannot be statically resolved and are
 *    intentionally skipped.
 *
 * Exit code 0 → all checks pass.
 * Exit code 1 → at least one check failed (details printed to stderr).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run check-unused-mobile-translations
 *   pnpm --filter @workspace/scripts run check-translations   (combined)
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
  "dist-web-review",
  ".turbo",
  "__generated__",
]);

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true when the file content uses the `t` translation object — either
 * via the `useT()` hook or a direct `translations[lang]` access.  Filtering
 * to these files prevents false positives from the many other places in the
 * codebase that happen to use `t` as a generic variable name.
 */
function usesTranslationObject(src: string): boolean {
  return /\buseT\s*\(/.test(src) || /translations\s*\[/.test(src);
}

/**
 * Extract every literal translation-key identifier accessed via the `t`
 * translation object in a block of source text.
 *
 * Recognised patterns:
 *   t.keyName          – dot notation, NOT followed by `(` (method calls are
 *                        skipped — they are property accesses on a different
 *                        object that happens to also be named `t`)
 *   t["keyName"]       – bracket notation with double-quoted string literal
 *   t['keyName']       – bracket notation with single-quoted string literal
 *
 * Skipped (cannot be statically resolved):
 *   t[someVariable]    – dynamic bracket access
 *   t[`template`]      – template-literal bracket access
 *   t.push(…)          – method calls (property followed by `(`)
 */
function extractLiteralKeyRefs(src: string): Set<string> {
  const keys = new Set<string>();
  // Dot notation: word boundary before `t`; lookahead ensures method calls
  // such as `t.map(` or `t.then(` are not captured.
  const dotRe = /\bt\.([a-zA-Z_][a-zA-Z0-9_]*)(?!\s*\()/g;
  let m: RegExpExecArray | null;
  while ((m = dotRe.exec(src)) !== null) {
    keys.add(m[1]);
  }
  // Bracket notation with string literal.
  const bracketRe = /\bt\[['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]]/g;
  while ((m = bracketRe.exec(src)) !== null) {
    keys.add(m[1]);
  }
  return keys;
}

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
 * Extract the top-level property keys from a named locale block.
 *
 * Matches `const <NAME>[optional type annotation] = {` … `};` where the
 * closing `};` appears at the start of a line — this avoids false positives
 * from nested objects inside the block.
 */
function extractLocaleKeys(src: string, localeName: string): string[] {
  const blockRe = new RegExp(
    `^const ${localeName}(?:[^=]*)=\\s*\\{([\\s\\S]*?)^};`,
    "m",
  );
  const match = src.match(blockRe);
  if (!match) {
    throw new Error(
      `Could not locate \`const ${localeName} … = { … }\` block in translations.ts`,
    );
  }
  const block = match[1];
  const keys: string[] = [];
  for (const m of block.matchAll(/^\s+([a-zA-Z_][a-zA-Z0-9_]*):/gm)) {
    keys.push(m[1]);
  }
  return keys;
}

/**
 * A key is considered referenced when it appears as:
 *   t.keyName   — dot-notation property access
 *   "keyName"   — double-quoted string literal (bracket or data access)
 *   'keyName'   — single-quoted string literal
 */
function isKeyReferenced(key: string, corpus: string): boolean {
  if (new RegExp(`\\.${key}(?![a-zA-Z0-9_])`).test(corpus)) return true;
  if (new RegExp(`['"]${key}['"]`).test(corpus)) return true;
  return false;
}

// ── main ─────────────────────────────────────────────────────────────────────

const translationsSrc = fs.readFileSync(TRANSLATIONS_FILE, "utf8");

const enKeys = extractLocaleKeys(translationsSrc, "EN");
if (enKeys.length === 0) {
  console.error(
    "ERROR: No keys extracted from the EN locale block — aborting.",
  );
  process.exit(1);
}

const arKeys = new Set(extractLocaleKeys(translationsSrc, "AR"));
const frKeys = new Set(extractLocaleKeys(translationsSrc, "FR"));

// Collect every mobile source file except translations.ts itself.
const files = collectFiles(SCAN_ROOT).filter((f) => f !== TRANSLATIONS_FILE);

// Build a combined corpus for fast substring scanning.
// Files are joined with a sentinel so key names cannot straddle boundaries.
const corpus = files.map((f) => fs.readFileSync(f, "utf8")).join("\n\0\n");

// ── Check 1: unused keys ─────────────────────────────────────────────────────

const unusedKeys = enKeys.filter((key) => !isKeyReferenced(key, corpus));

// ── Check 2: locale parity (EN vs AR / FR) ───────────────────────────────────

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

// ── Check 3: undefined key references ────────────────────────────────────────
// Only scan files that actually use the `t` translation object to avoid false
// positives from other variables named `t` (gesture handlers, etc.).

const enKeySet = new Set(enKeys);
const allReferencedKeys = new Set<string>();

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  if (!usesTranslationObject(src)) continue;
  for (const key of extractLiteralKeyRefs(src)) {
    allReferencedKeys.add(key);
  }
}

const undefinedKeys = Array.from(allReferencedKeys)
  .filter((key) => !enKeySet.has(key))
  .sort();

// ── report ────────────────────────────────────────────────────────────────────

let failed = false;

if (unusedKeys.length > 0) {
  failed = true;
  console.error(
    `\n✗ Found ${unusedKeys.length} unused mobile translation key${unusedKeys.length === 1 ? "" : "s"} (out of ${enKeys.length}):\n`,
  );
  for (const key of unusedKeys) {
    console.error(`  - ${key}`);
  }
  console.error(
    "\nRemove these keys from all three locale blocks (EN, AR, FR) in artifacts/presentail/lib/translations.ts.\n",
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

if (undefinedKeys.length > 0) {
  failed = true;
  console.error(
    `\n✗ Found ${undefinedKeys.length} mobile translation key${undefinedKeys.length === 1 ? "" : "s"} referenced in source that do not exist in EN:\n`,
  );
  for (const key of undefinedKeys) {
    console.error(`  - ${key}`);
  }
  console.error(
    "\nAdd these keys to all three locale blocks in artifacts/presentail/lib/translations.ts, or fix the call sites in source.\n",
  );
  console.error(
    "NOTE: Dynamic accesses such as t[someVariable] cannot be statically resolved and are not checked.\n",
  );
}

if (!failed) {
  console.log(
    `✓ All ${enKeys.length} mobile EN keys are in use, AR/FR parity is complete, and no undefined key references were found.`,
  );
  process.exit(0);
} else {
  process.exit(1);
}
