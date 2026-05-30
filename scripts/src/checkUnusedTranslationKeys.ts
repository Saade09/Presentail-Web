/**
 * checkUnusedTranslationKeys / checkMissingTranslationKeys
 *
 * Three complementary checks in one script:
 *
 * 1. UNUSED keys — keys defined in the EN locale that are never referenced in
 *    any TypeScript/TSX source file under `artifacts/presentail`.
 *
 * 2. MISSING locale keys — keys present in EN but absent from AR or FR, meaning
 *    a shopper on those locales would see a raw key string instead of translated
 *    text.
 *
 * 3. UNDEFINED keys — keys accessed in source via `t.keyName` or `t["keyName"]`
 *    (literal accesses only; dynamic `t[someVar]` is skipped) that do not exist
 *    in the EN object. These would silently resolve to `undefined` at runtime and
 *    render as blank strings.
 *
 * Exit code 0 → all EN keys are in use, AR/FR are complete, and no undefined
 *               key references were found.
 * Exit code 1 → at least one check failed (or the script errored).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run check-translations
 *   pnpm --filter @workspace/scripts run check-unused-translations   (alias)
 *   pnpm --filter @workspace/scripts run check-missing-translations  (alias)
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
 * Returns true when the file content indicates it actually uses the `t`
 * translation object (via the `useT` hook or a direct `translations[lang]`
 * access).  We only run the key-reference extractor on these files to avoid
 * false positives from the hundreds of other places in the codebase that
 * happen to use `t` as a variable name (gesture handlers, React internals,
 * type parameters, etc.).
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
 *                        skipped — they are property accesses on a different `t`)
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
  // Dot notation: word boundary before `t`; the lookahead ensures we do NOT
  // capture method calls such as `t.map(` or `t.then(`.
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

// ── Check 3: keys referenced in source that are missing from EN ───────────────
// Only scan files that actually use the translation object (contain `useT()` or
// `translations[…]`).  This avoids false positives from the many other places
// in the codebase that happen to use `t` as a variable name (gesture handlers,
// React internals, type parameters, etc.).
// translations.ts itself is already excluded from `files`.

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

// ── GitHub Actions annotations ────────────────────────────────────────────────
// When running inside GitHub Actions, emit workflow commands that surface as
// inline PR annotations on the diff view.  Plain-text output is always kept so
// local runs remain readable.

const IS_GHA = process.env["GITHUB_ACTIONS"] === "true";

/**
 * Emit a GitHub Actions `::error` annotation pointing at the translations file,
 * plus the same message to stderr for local / log readability.
 *
 * Annotation format: `::error file=<path>,title=<title>::<message>`
 */
function annotateError(title: string, message: string): void {
  if (IS_GHA) {
    // Escape characters that would break the workflow command syntax.
    const escapeValue = (s: string) =>
      s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
    const escapeProp = (s: string) =>
      escapeValue(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
    process.stdout.write(
      `::error file=${escapeProp("artifacts/presentail/lib/translations.ts")},title=${escapeProp(title)}::${escapeValue(message)}\n`,
    );
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
    annotateError(
      "Unused translation key",
      `Key "${key}" is defined in EN but not referenced anywhere in the mobile source — remove it from all three locale blocks.`,
    );
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
      annotateError(
        `Missing ${locale} translation`,
        `Key "${key}" is present in EN but missing from the ${locale} locale block — add a ${locale} translation for it.`,
      );
    }
  }
  console.error(
    "\nAdd the missing keys to the affected locale block(s) in artifacts/presentail/lib/translations.ts.\n",
  );
}

if (undefinedKeys.length > 0) {
  failed = true;
  console.error(
    `\n✗ Found ${undefinedKeys.length} translation key${undefinedKeys.length === 1 ? "" : "s"} referenced in source that do not exist in EN:\n`,
  );
  for (const key of undefinedKeys) {
    console.error(`  - ${key}`);
    annotateError(
      "Undefined translation key",
      `Key "${key}" is referenced in source via t.${key} or t["${key}"] but does not exist in the EN locale block — add it to all three locale blocks or fix the reference.`,
    );
  }
  console.error(
    "\nAdd these keys to all three language blocks in artifacts/presentail/lib/translations.ts, or fix the references in source.\n",
  );
}

if (!failed) {
  console.log(
    `✓ All ${enKeys.length} EN keys are in use, AR/FR are complete, and no undefined key references were found.`,
  );
  process.exit(0);
} else {
  process.exit(1);
}
