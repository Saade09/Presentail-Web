/**
 * checkUnusedTranslationKeys / checkMissingTranslationKeys
 *
 * Four complementary checks in one script:
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
 * 4. ORPHAN locale keys — keys present in AR or FR but absent from EN. These
 *    accumulate when a feature is partially rolled back or when a translator
 *    adds keys ahead of the EN copy landing. They are unreachable at runtime
 *    and indicate a drift between the locale objects.
 *
 * Exit code 0 → all EN keys are in use, AR/FR are complete, no undefined
 *               key references were found, and no orphan AR/FR keys exist.
 * Exit code 1 → at least one check failed (or the script errored).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run check-translations
 *   pnpm --filter @workspace/scripts run check-unused-translations   (alias)
 *   pnpm --filter @workspace/scripts run check-missing-translations  (alias)
 *
 * Flags:
 *   --verbose   Print the full list of scanned source files.
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

const verbose = process.argv.includes("--verbose");

// ── types ─────────────────────────────────────────────────────────────────────

type CallSite = { file: string; line: number };

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the 1-based line number of `index` within `src`.
 */
function getLine(src: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (src[i] === "\n") line++;
  }
  return line;
}

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
 * translation object in a block of source text, together with the 1-based
 * line number of each match.
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
function extractLiteralKeyRefsWithLines(
  src: string,
): Array<{ key: string; line: number }> {
  const results: Array<{ key: string; line: number }> = [];
  const seen = new Map<string, Set<number>>();

  function add(key: string, index: number) {
    const line = getLine(src, index);
    if (!seen.has(key)) seen.set(key, new Set());
    if (seen.get(key)!.has(line)) return;
    seen.get(key)!.add(line);
    results.push({ key, line });
  }

  // Dot notation: word boundary before `t`; the lookahead ensures we do NOT
  // capture method calls such as `t.map(` or `t.then(`.
  const dotRe = /\bt\.([a-zA-Z_][a-zA-Z0-9_]*)(?!\s*\()/g;
  let m: RegExpExecArray | null;
  while ((m = dotRe.exec(src)) !== null) {
    add(m[1], m.index);
  }
  // Bracket notation with string literal.
  const bracketRe = /\bt\[['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]]/g;
  while ((m = bracketRe.exec(src)) !== null) {
    add(m[1], m.index);
  }

  return results;
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
function isKeyReferenced(key: string, haystack: string): boolean {
  const dotRe = new RegExp(`\\.${key}(?![a-zA-Z0-9_])`);
  if (dotRe.test(haystack)) return true;
  const litRe = new RegExp(`['"]${key}['"]`);
  return litRe.test(haystack);
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

// Map from key name → all call sites (file + line) where it is referenced.
const keyCallSites = new Map<string, CallSite[]>();

// ── Check 4: orphan keys in AR / FR (present in non-EN locale but not in EN) ──
// These accumulate when a feature is partially rolled back or when a translator
// adds keys ahead of the EN copy landing. They are unreachable at runtime.
type LocaleOrphans = { locale: string; orphanKeys: string[] };

const localeOrphans: LocaleOrphans[] = [];

for (const [locale, keySet] of [
  ["AR", arKeys],
  ["FR", frKeys],
] as [string, Set<string>][]) {
  const orphans = Array.from(keySet).filter((k) => !enKeySet.has(k));
  if (orphans.length > 0) {
    localeOrphans.push({ locale, orphanKeys: orphans.sort() });
  }
}

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  if (!usesTranslationObject(src)) continue;
  for (const { key, line } of extractLiteralKeyRefsWithLines(src)) {
    if (!keyCallSites.has(key)) keyCallSites.set(key, []);
    keyCallSites.get(key)!.push({ file, line });
  }
}

const undefinedKeys = Array.from(keyCallSites.keys())
  .filter((key) => !enKeySet.has(key))
  .sort();

// ── GitHub Actions annotations ────────────────────────────────────────────────
// When running inside GitHub Actions, emit workflow commands that surface as
// inline PR annotations on the diff view.  Plain-text output is always kept so
// local runs remain readable.

const IS_GHA = process.env["GITHUB_ACTIONS"] === "true";
const SUMMARY_FILE = process.env["GITHUB_STEP_SUMMARY"] ?? "";

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

/**
 * Append a line of markdown to $GITHUB_STEP_SUMMARY when running in CI.
 * No-op when the env var is absent (local runs).
 */
function appendSummary(line: string): void {
  if (SUMMARY_FILE) {
    fs.appendFileSync(SUMMARY_FILE, line + "\n");
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
let failed = false;

if (unusedKeys.length > 0) {
  failed = true;
  console.error(
    `\n✗ Found ${unusedKeys.length} unused translation key${unusedKeys.length === 1 ? "" : "s"} (out of ${enKeys.length}) — scanned ${files.length} source file${files.length === 1 ? "" : "s"}:\n`,
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
} else if (verbose) {
  console.log(
    `  Scanned ${files.length} source file${files.length === 1 ? "" : "s"} — no unused keys found.`,
  );
}

if (verbose) {
  console.log("\n  Scanned files:");
  for (const f of files) {
    console.log(`    ${path.relative(REPO_ROOT, f)}`);
  }
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
    const sites = keyCallSites.get(key) ?? [];
    console.error(`  - ${key}`);
    annotateError(
      "Undefined translation key",
      `Key "${key}" is referenced in source via t.${key} or t["${key}"] but does not exist in the EN locale block — add it to all three locale blocks or fix the reference.`,
    );
    for (const { file, line } of sites) {
      console.error(`      ${path.relative(REPO_ROOT, file)}:${line}`);
    }
  }
  console.error(
    "\nAdd these keys to all three language blocks in artifacts/presentail/lib/translations.ts, or fix the references in source.\n",
  );
}

if (localeOrphans.length > 0) {
  failed = true;
  for (const { locale, orphanKeys } of localeOrphans) {
    console.error(
      `\n✗ ${orphanKeys.length} key${orphanKeys.length === 1 ? "" : "s"} present in ${locale} but missing from EN:\n`,
    );
    for (const key of orphanKeys) {
      console.error(`  - ${key}`);
      annotateError(
        "Orphan locale key",
        `Key "${key}" is present in the ${locale} locale block but does not exist in EN — either add it to the EN block or remove it from ${locale}.`,
      );
    }
  }
  console.error(
    "\nEither add the missing keys to the EN block or remove the orphaned entries from the affected locale block(s) in artifacts/presentail/lib/translations.ts.\n",
  );
}

// ── GitHub Step Summary ───────────────────────────────────────────────────────
if (SUMMARY_FILE) {
  if (!failed) {
    appendSummary(
      `## ✅ Mobile translation keys — all checks passed\n\n` +
        `All ${enKeys.length} EN keys are in use, AR/FR are complete, and no undefined key references were found.`,
    );
  } else {
    appendSummary("## ❌ Mobile translation key checks failed\n");

    if (unusedKeys.length > 0) {
      appendSummary(
        `### Unused keys (${unusedKeys.length} of ${enKeys.length})\n\n` +
          `These keys are defined in \`EN\` but never referenced in the mobile source.\n` +
          `Remove them from all three locale blocks in \`artifacts/presentail/lib/translations.ts\`.\n`,
      );
      appendSummary("| Key |");
      appendSummary("| --- |");
      for (const key of unusedKeys) {
        appendSummary(`| \`${key}\` |`);
      }
      appendSummary("");
    }

    for (const { locale, missingKeys } of localeGaps) {
      appendSummary(
        `### Missing ${locale} translations (${missingKeys.length})\n\n` +
          `These keys are present in \`EN\` but absent from the \`${locale}\` locale block.\n` +
          `Add translations in \`artifacts/presentail/lib/translations.ts\`.\n`,
      );
      appendSummary("| Key |");
      appendSummary("| --- |");
      for (const key of missingKeys) {
        appendSummary(`| \`${key}\` |`);
      }
      appendSummary("");
    }

    if (undefinedKeys.length > 0) {
      appendSummary(
        `### Undefined key references (${undefinedKeys.length})\n\n` +
          `These keys are accessed via \`t.key\` or \`t["key"]\` in source but do not exist in \`EN\`.\n` +
          `Add them to all three locale blocks or fix the references.\n`,
      );
      appendSummary("| Key |");
      appendSummary("| --- |");
      for (const key of undefinedKeys) {
        appendSummary(`| \`${key}\` |`);
      }
      appendSummary("");
    }

    for (const { locale, orphanKeys } of localeOrphans) {
      appendSummary(
        `### Orphan ${locale} keys (${orphanKeys.length})\n\n` +
          `These keys are present in the \`${locale}\` locale block but do not exist in \`EN\`.\n` +
          `Either add them to the EN block or remove them from \`${locale}\` in \`artifacts/presentail/lib/translations.ts\`.\n`,
      );
      appendSummary("| Key |");
      appendSummary("| --- |");
      for (const key of orphanKeys) {
        appendSummary(`| \`${key}\` |`);
      }
      appendSummary("");
    }
  }
}

if (!failed) {
  console.log(
    `✓ All ${enKeys.length} EN keys are in use, AR/FR are complete, no undefined key references were found, and no orphan AR/FR keys exist.`,
  );
  process.exit(0);
} else {
  process.exit(1);
}
