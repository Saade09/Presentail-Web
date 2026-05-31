/**
 * checkUnusedWebTranslationKeys
 *
 * Scans all TypeScript/TSX source files under `artifacts/presentail-web/src`
 * and runs three checks:
 *
 *   1. Unused-key check — every key defined in STRINGS / STRINGS_FR must be
 *      referenced at least once in the source corpus.
 *   2. FR-coverage check — every key in STRINGS must have a French translation
 *      in STRINGS_FR and vice-versa (no orphaned FR-only keys).
 *   3. Undefined-key check — every static t("some.key") call site must refer to
 *      a key that actually exists in STRINGS.  A typo here silently renders as
 *      blank text.  Dynamic template-literal calls (e.g. t(`prefix.${expr}`))
 *      are excluded from this hard check because the full key is only known at
 *      runtime; their static prefix is still used by check #1 so STRINGS keys
 *      reachable through dynamic calls are never reported as unused.
 *   4. Arabic-field check — every Dict entry must contain an `ar` field.
 *   5. Empty-value check — every Dict entry's `en` and `ar` values must be
 *      non-empty after trimming.  An empty string silently renders as blank
 *      text for visitors of the corresponding locale.
 *
 * Translation keys live in per-domain modules under
 * `artifacts/presentail-web/src/locales/`. Each module exports two objects:
 *   • `<domain>Strings`   — Dict with { en, ar } entries  (the STRINGS keys)
 *   • `<domain>StringsFr` — Record<string, string>        (the STRINGS_FR keys)
 *
 * The script distinguishes them by value format:
 *   • `"key": {`  → Dict entry  → STRINGS key
 *   • `"key": "`  → FR string   → STRINGS_FR key
 *
 * Exit code 0 → all checks pass.
 * Exit code 1 → at least one unused key, coverage gap, or undefined key
 *               reference was found (or the script errored).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run check-unused-web-translations
 *
 * Flags:
 *   --verbose   List the dynamic key prefixes that suppress unused-key
 *               warnings for matching keys.
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../");

const LOCALE_CONTEXT_FILE = path.join(
  REPO_ROOT,
  "artifacts/presentail-web/src/contexts/LocaleContext.tsx",
);
const SCAN_ROOT = path.join(REPO_ROOT, "artifacts/presentail-web/src");
const LOCALES_DIR = path.join(REPO_ROOT, "artifacts/presentail-web/src/locales");

const SKIP_DIRS = new Set([
  "node_modules",
  ".expo",
  "dist",
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
 * Extract all dot-notation translation keys from a block of source text.
 * Matches lines of the form:  "some.key.name": …
 * Skips plain property names ("en", "ar") that don't contain a dot.
 */
function extractKeysFromSection(src: string): Set<string> {
  const keysSet = new Set<string>();
  const keyRe = /^\s+"([^"]+)":/gm;
  let m: RegExpExecArray | null;
  while ((m = keyRe.exec(src)) !== null) {
    const candidate = m[1];
    if (candidate.includes(".")) {
      keysSet.add(candidate);
    }
  }
  return keysSet;
}

/**
 * Extract keys from a locale domain file, distinguishing between Dict entries
 * (STRINGS — value starts with `{`) and FR string entries (STRINGS_FR —
 * value starts with `"`).
 *
 * Both formats use the same key syntax `"dot.name": value` so we only need to
 * inspect the first non-whitespace character after the colon.
 */
function extractKeysWithType(src: string): {
  dictKeys: Set<string>;
  frKeys: Set<string>;
} {
  const dictKeys = new Set<string>();
  const frKeys = new Set<string>();
  // Match: "key.name": { (dict) or "key.name": " (fr string on same line)
  const keyRe = /^\s+"([^"]+)":\s*(\{|")/gm;
  let m: RegExpExecArray | null;
  while ((m = keyRe.exec(src)) !== null) {
    const key = m[1];
    if (!key.includes(".")) continue;
    if (m[2] === "{") {
      dictKeys.add(key);
    } else {
      frKeys.add(key);
    }
  }
  return { dictKeys, frKeys };
}

/**
 * Scan a locale file's source and return the keys of every Dict entry that is
 * missing an Arabic (`ar`) value.
 *
 * For each dict entry (`"key.name": { … }`) the function extracts the balanced
 * brace block and checks whether it contains an `ar:` field.  Both single-line
 * and multi-line entry formats are handled.
 */
export function extractMissingArKeys(src: string): string[] {
  const missing: string[] = [];
  // Match the opening of every dict entry: "key.name": {
  const keyStartRe = /^\s+"([^"]+)":\s*\{/gm;
  let m: RegExpExecArray | null;
  while ((m = keyStartRe.exec(src)) !== null) {
    const key = m[1];
    if (!key.includes(".")) continue;

    // The opening brace is the last character of the match.
    const braceStart = m.index + m[0].length - 1;

    // Walk forward to find the matching closing brace.
    let depth = 0;
    let blockEnd = -1;
    for (let i = braceStart; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") {
        depth--;
        if (depth === 0) {
          blockEnd = i;
          break;
        }
      }
    }

    if (blockEnd === -1) continue; // malformed entry — skip

    const block = src.slice(braceStart, blockEnd + 1);

    // Accept either bare `ar:` or quoted `"ar":` / `'ar':` followed by a
    // string delimiter.  The \b boundary prevents matching e.g. `car:`.
    const hasAr = /\bar\s*:\s*["'`]/.test(block) || /["']ar["']\s*:\s*["'`]/.test(block);
    if (!hasAr) {
      missing.push(key);
    }
  }
  return missing;
}

/**
 * Extract the raw string value for a named field (`en` or `ar`) from a Dict
 * entry's brace block.
 *
 * Handles the two formats present in the locale files:
 *   • bare identifier:  en: "value"
 *   • quoted key:       "en": "value"
 *
 * Returns `null` when the field cannot be found or its value cannot be parsed
 * as a string literal (e.g. a template-literal expression — very rare in
 * locale files).
 */
function extractFieldValue(block: string, field: string): string | null {
  // Match  <field>: "..."  or  "<field>": "..."  (double-quoted value)
  // then   <field>: '...'  (single-quoted value)
  // then   <field>: `...`  (backtick, no expressions — plain empty/whitespace)
  const fieldPat = `(?:\\b${field}\\b|["']${field}["'])\\s*:\\s*`;
  for (const [open, close] of [
    ['"', '"'],
    ["'", "'"],
    ["`", "`"],
  ] as [string, string][]) {
    const re = new RegExp(`${fieldPat}${escapeRegExp(open)}([^${escapeRegExp(close)}]*)${escapeRegExp(close)}`);
    const fm = re.exec(block);
    if (fm !== null) return fm[1];
  }
  return null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Scan a locale file's source and return every Dict entry whose `en` or `ar`
 * value is empty (or whitespace-only) after trimming.
 *
 * These entries have a field present but blank, which silently renders as
 * empty text for visitors of that locale.  They are distinct from keys that
 * are entirely missing an `ar` field (caught by `extractMissingArKeys`).
 */
export function extractEmptyValueKeys(
  src: string,
): { key: string; fields: string[] }[] {
  const results: { key: string; fields: string[] }[] = [];
  const keyStartRe = /^\s+"([^"]+)":\s*\{/gm;
  let m: RegExpExecArray | null;
  while ((m = keyStartRe.exec(src)) !== null) {
    const key = m[1];
    if (!key.includes(".")) continue;

    // Extract the balanced brace block for this entry.
    const braceStart = m.index + m[0].length - 1;
    let depth = 0;
    let blockEnd = -1;
    for (let i = braceStart; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") {
        depth--;
        if (depth === 0) {
          blockEnd = i;
          break;
        }
      }
    }
    if (blockEnd === -1) continue; // malformed — skip

    const block = src.slice(braceStart, blockEnd + 1);
    const emptyFields: string[] = [];

    for (const field of ["en", "ar"] as const) {
      const value = extractFieldValue(block, field);
      // Only flag when the field is present (value !== null) but empty.
      // Missing `ar` fields are already caught by extractMissingArKeys.
      if (value !== null && value.trim() === "") {
        emptyFields.push(field);
      }
    }

    if (emptyFields.length > 0) {
      results.push({ key, fields: emptyFields });
    }
  }
  return results;
}

/**
 * Extract all translation keys, returning both the combined set (for the
 * unused-key check) and the per-dictionary sets (for the coverage check).
 *
 * When the `src/locales/` directory exists (split architecture) it is scanned
 * instead of LocaleContext.tsx, using value-format heuristics to distinguish
 * STRINGS vs STRINGS_FR keys.
 *
 * Falls back to the original single-file approach when the locales/ directory
 * is absent (backwards compatibility).
 *
 * Also returns `stringsKeyToFile` — a map from each base key to the domain
 * file it was defined in, used to produce per-file error messages when a
 * French or Arabic translation is missing.
 *
 * Also returns `missingArByFile` — a map from relative file path to the list
 * of Dict keys in that file that are missing an Arabic (`ar`) value.
 *
 * Also returns `emptyValuesByFile` — a map from relative file path to the list
 * of Dict keys whose `en` or `ar` value is present but empty after trimming.
 */
function extractWebKeys(localeContextSrc: string): {
  all: string[];
  stringsKeys: Set<string>;
  stringsFrKeys: Set<string>;
  stringsKeyToFile: Map<string, string>;
  frKeyToFile: Map<string, string>;
  missingArByFile: Map<string, string[]>;
  emptyValuesByFile: Map<string, { key: string; fields: string[] }[]>;
} {
  // ── Split-file architecture: scan src/locales/*.ts ────────────────────────
  if (fs.existsSync(LOCALES_DIR)) {
    const localeFiles = fs
      .readdirSync(LOCALES_DIR)
      .filter(
        (f) => f.endsWith(".ts") && f !== "index.ts" && f !== "types.ts",
      )
      .map((f) => path.join(LOCALES_DIR, f));

    if (localeFiles.length === 0) {
      console.error(
        "ERROR: src/locales/ directory exists but contains no domain files — aborting.",
      );
      process.exit(1);
    }

    const stringsKeys = new Set<string>();
    const stringsFrKeys = new Set<string>();
    const stringsKeyToFile = new Map<string, string>();
    const frKeyToFile = new Map<string, string>();
    const missingArByFile = new Map<string, string[]>();
    const emptyValuesByFile = new Map<string, { key: string; fields: string[] }[]>();

    for (const file of localeFiles) {
      const content = fs.readFileSync(file, "utf8");
      const { dictKeys, frKeys } = extractKeysWithType(content);
      const rel = path.relative(REPO_ROOT, file);
      for (const k of dictKeys) {
        stringsKeys.add(k);
        stringsKeyToFile.set(k, rel);
      }
      for (const k of frKeys) {
        stringsFrKeys.add(k);
        frKeyToFile.set(k, rel);
      }

      // Arabic coverage: find dict entries missing the `ar` field.
      const missingAr = extractMissingArKeys(content);
      if (missingAr.length > 0) {
        missingArByFile.set(rel, missingAr);
      }

      // Empty-value coverage: find dict entries where en or ar is blank.
      const emptyValues = extractEmptyValueKeys(content);
      if (emptyValues.length > 0) {
        emptyValuesByFile.set(rel, emptyValues);
      }
    }

    if (stringsKeys.size === 0 && stringsFrKeys.size === 0) {
      console.error(
        "ERROR: No keys extracted from src/locales/ domain files — aborting.",
      );
      process.exit(1);
    }

    return {
      all: Array.from(new Set([...stringsKeys, ...stringsFrKeys])),
      stringsKeys,
      stringsFrKeys,
      stringsKeyToFile,
      frKeyToFile,
      missingArByFile,
      emptyValuesByFile,
    };
  }

  // ── Legacy single-file approach: parse LocaleContext.tsx ──────────────────
  const stringsMarker = localeContextSrc.indexOf("const STRINGS: Dict = {");
  const stringsFrMarker = localeContextSrc.indexOf("const STRINGS_FR:");

  if (stringsMarker === -1 || stringsFrMarker === -1) {
    console.error(
      "ERROR: Could not locate STRINGS or STRINGS_FR in LocaleContext.tsx — aborting.",
    );
    process.exit(1);
  }

  const stringsSection = localeContextSrc.slice(stringsMarker, stringsFrMarker);
  const stringsFrSection = localeContextSrc.slice(stringsFrMarker);

  const stringsKeys = extractKeysFromSection(stringsSection);
  const stringsFrKeys = extractKeysFromSection(stringsFrSection);

  const allKeys = new Set([...stringsKeys, ...stringsFrKeys]);

  // Arabic coverage for the legacy single-file format.
  const missingArByFile = new Map<string, string[]>();
  const legacyMissingAr = extractMissingArKeys(stringsSection);
  if (legacyMissingAr.length > 0) {
    missingArByFile.set(
      path.relative(REPO_ROOT, LOCALE_CONTEXT_FILE),
      legacyMissingAr,
    );
  }

  // Empty-value coverage for the legacy single-file format.
  const emptyValuesByFile = new Map<string, { key: string; fields: string[] }[]>();
  const legacyEmptyValues = extractEmptyValueKeys(stringsSection);
  if (legacyEmptyValues.length > 0) {
    emptyValuesByFile.set(
      path.relative(REPO_ROOT, LOCALE_CONTEXT_FILE),
      legacyEmptyValues,
    );
  }

  return {
    all: Array.from(allKeys),
    stringsKeys,
    stringsFrKeys,
    stringsKeyToFile: new Map(),
    frKeyToFile: new Map(),
    missingArByFile,
    emptyValuesByFile,
  };
}

/**
 * Extract all unique translation keys from static t("key") / t('key') call
 * sites in the source corpus.
 *
 * Only string-literal arguments are captured.  Dynamic template-literal calls
 * such as t(`seo.${route}.title`) are intentionally excluded from this set —
 * their key can only be determined at runtime, so they are handled separately
 * via extractDynamicPrefixes() and are never subjected to the hard missing-key
 * check.
 */
export function extractStaticTCallKeys(corpus: string): string[] {
  const keys = new Set<string>();
  // Match t("key") or t('key') where the first argument is a plain string
  // literal.  The pattern stops at the first quote boundary so it won't
  // accidentally capture multi-argument calls with non-key first args.
  const re = /\bt\(["']([^"'\n]+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(corpus)) !== null) {
    const key = m[1];
    // Only treat dot-notation strings as translation keys.
    if (key.includes(".")) {
      keys.add(key);
    }
  }
  return Array.from(keys);
}

/**
 * Scan each source file for static t("key") / t('key') calls and return a
 * map from key → all call sites (file path + 1-based line number).
 *
 * Dynamic template-literal calls are excluded here — they are handled
 * separately via extractDynamicPrefixes().
 */
function extractStaticTCallSites(
  files: string[],
): Map<string, CallSite[]> {
  const callSites = new Map<string, CallSite[]>();
  const re = /\bt\(["']([^"'\n]+)["']/g;
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(src)) !== null) {
      const key = m[1];
      if (!key.includes(".")) continue;
      const line = getLine(src, m.index);
      if (!callSites.has(key)) callSites.set(key, []);
      callSites.get(key)!.push({ file, line });
    }
  }
  return callSites;
}

/**
 * Extract static prefixes from dynamic template-literal t() calls.
 *
 * Finds patterns like t(`some.prefix.${expr}`) in the corpus and returns the
 * static text before the first `${`. Any key that starts with such a prefix
 * is treated as referenced.
 *
 * Example:
 *   t(`lang.label.${lang}`)      → prefix "lang.label."
 *   t(`seo.${routeKey}.title`)   → prefix "seo."
 */
export function extractDynamicPrefixes(corpus: string): string[] {
  const prefixes = new Set<string>();
  // Match t(`...${`) to capture the static prefix inside the backtick template.
  const re = /t\(`([^`$]*)(?:\$\{)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(corpus)) !== null) {
    const prefix = m[1];
    if (prefix.length > 0) {
      prefixes.add(prefix);
    }
  }
  return Array.from(prefixes);
}

/**
 * A key is considered referenced when either:
 *   (a) it appears as a string literal anywhere in the corpus
 *         t("some.key") / t('some.key') / { titleKey: "some.key" }
 *   (b) its name starts with a dynamic template-literal prefix
 *         t(`lang.label.${lang}`) references any "lang.label.*" key
 */
function isKeyReferenced(
  key: string,
  corpus: string,
  dynamicPrefixes: string[],
): boolean {
  // (a) static string literal
  const escaped = key.replace(/\./g, "\\.");
  if (new RegExp(`['"]${escaped}['"]`).test(corpus)) return true;

  // (b) dynamic template-literal prefix
  for (const prefix of dynamicPrefixes) {
    if (key.startsWith(prefix)) return true;
  }

  return false;
}

// ── GitHub Actions helpers ────────────────────────────────────────────────────

const IS_GHA = process.env["GITHUB_ACTIONS"] === "true";
const SUMMARY_FILE = process.env["GITHUB_STEP_SUMMARY"] ?? "";

/**
 * Emit a `::error` workflow command so the key appears as an inline annotation
 * on the PR diff.  Also writes to stderr for local readability.
 *
 * Annotation format: `::error file=<path>,title=<title>::<message>`
 */
function annotateError(file: string, title: string, message: string): void {
  if (IS_GHA) {
    const escapeValue = (s: string) =>
      s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
    const escapeProp = (s: string) =>
      escapeValue(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
    process.stdout.write(
      `::error file=${escapeProp(file)},title=${escapeProp(title)}::${escapeValue(message)}\n`,
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

// ── main ─────────────────────────────────────────────────────────────────────
// Guard lets unit tests import the exported functions without triggering I/O
// or process.exit().  Vitest sets process.env.VITEST; the guard checks for it.

if (!process.env.VITEST) {

const localeContextSrc = fs.readFileSync(LOCALE_CONTEXT_FILE, "utf8");
const { all: allKeys, stringsKeys, stringsFrKeys, stringsKeyToFile, frKeyToFile, missingArByFile, emptyValuesByFile } = extractWebKeys(localeContextSrc);

if (allKeys.length === 0) {
  console.error(
    "ERROR: No keys extracted from STRINGS / STRINGS_FR — aborting.",
  );
  process.exit(1);
}

// Collect every source file except locale domain files themselves.
const files = collectFiles(SCAN_ROOT).filter(
  (f) =>
    f !== LOCALE_CONTEXT_FILE &&
    !f.startsWith(LOCALES_DIR + path.sep),
);

// Build a combined corpus of all source content for fast substring scanning.
// Concatenate with a sentinel so key names cannot straddle file boundaries.
const corpus = files.map((f) => fs.readFileSync(f, "utf8")).join("\n\0\n");

const dynamicPrefixes = extractDynamicPrefixes(corpus);

// ── 1. Unused-key check ───────────────────────────────────────────────────────

const unusedKeys = allKeys.filter(
  (key) => !isKeyReferenced(key, corpus, dynamicPrefixes),
);

// ── 2. FR coverage check ─────────────────────────────────────────────────────
// Every key in the base STRINGS dict must have a French translation in
// STRINGS_FR. Keys present in STRINGS_FR but absent from STRINGS are also
// flagged — they are unreachable orphans (and would have been caught by the
// unused-key check above too).

const missingFr = Array.from(stringsKeys).filter((k) => !stringsFrKeys.has(k));
const orphanedFr = Array.from(stringsFrKeys).filter((k) => !stringsKeys.has(k));

// ── 3. Missing-key check (call sites referencing undefined keys) ──────────────
// Scan every static t("key") / t('key') call site in the source corpus and
// verify the referenced key exists in STRINGS (which carries both the English
// and Arabic values for every defined key).
//
// Dynamic template-literal calls — e.g. t(`seo.${routeKey}.title`) — are
// intentionally excluded from this hard check because the full key name is
// only known at runtime.  The dynamic prefixes extracted above are still used
// in check #1 so that STRINGS keys reachable through dynamic calls are never
// reported as "unused".

// Build per-key call-site map for precise attribution in error output.
const staticCallSites = extractStaticTCallSites(files);
const staticCallKeys = extractStaticTCallKeys(corpus);

// A static call-site key is considered defined when it exists in STRINGS.
// We do not require it to be in STRINGS_FR — missing FR entries are already
// reported by check #2 above.
const missingFromStrings = staticCallKeys.filter(
  (k) => !stringsKeys.has(k),
);

// ── report ────────────────────────────────────────────────────────────────────

let failed = false;

if (unusedKeys.length > 0) {
  failed = true;
  console.error(
    `\n✗ Found ${unusedKeys.length} unused web translation key${unusedKeys.length === 1 ? "" : "s"} (out of ${allKeys.length}) — scanned ${files.length} source file${files.length === 1 ? "" : "s"}:\n`,
  );
  for (const key of unusedKeys) {
    console.error(`  - ${key}`);
    const unusedFile =
      stringsKeyToFile.get(key) ??
      frKeyToFile.get(key) ??
      "artifacts/presentail-web/src/locales";
    annotateError(
      unusedFile,
      "Unused web translation key",
      `Key "${key}" is defined but never referenced in the web source — remove it from the locale domain file.`,
    );
  }
  console.error(
    "\nRemove these keys from the appropriate locale domain file in artifacts/presentail-web/src/locales/.\n",
  );
} else if (verbose) {
  console.log(
    `  Scanned ${files.length} source file${files.length === 1 ? "" : "s"} — no unused keys found.`,
  );
}

if (verbose && dynamicPrefixes.length > 0) {
  const sorted = [...dynamicPrefixes].sort();
  console.log(
    `\n  Dynamic key prefixes (suppress unused-key warnings for any key starting with the prefix):`,
  );
  for (const prefix of sorted) {
    console.log(`    "${prefix}*"`);
  }
}

// Group missing-FR keys by domain file (used for both stderr and summary).
const missingFrByFile = new Map<string, string[]>();
const missingFrNoFile: string[] = [];

if (missingFr.length > 0) {
  failed = true;
  console.error(
    `\n✗ Found ${missingFr.length} key${missingFr.length === 1 ? "" : "s"} in STRINGS with no French translation in STRINGS_FR:\n`,
  );

  for (const key of missingFr) {
    const file = stringsKeyToFile.get(key);
    if (file) {
      if (!missingFrByFile.has(file)) missingFrByFile.set(file, []);
      missingFrByFile.get(file)!.push(key);
    } else {
      missingFrNoFile.push(key);
    }
  }

  for (const [file, keys] of [...missingFrByFile.entries()].sort()) {
    console.error(`  In ${file} — add French translations for:`);
    for (const key of keys.sort()) {
      console.error(`    - ${key}`);
      annotateError(
        file,
        "Missing French translation",
        `Key "${key}" has no French translation in STRINGS_FR — add it to the corresponding *StringsFr export.`,
      );
    }
  }
  if (missingFrNoFile.length > 0) {
    console.error(`  (source file unknown):`);
    for (const key of missingFrNoFile.sort()) {
      console.error(`    - ${key}`);
      annotateError(
        "artifacts/presentail-web/src/locales",
        "Missing French translation",
        `Key "${key}" has no French translation in STRINGS_FR — add it to the corresponding *StringsFr export.`,
      );
    }
  }
  console.error(
    "\nFor each file above, add the missing keys to the corresponding *StringsFr export.\n",
  );
}

if (orphanedFr.length > 0) {
  failed = true;
  console.error(
    `\n✗ Found ${orphanedFr.length} key${orphanedFr.length === 1 ? "" : "s"} in STRINGS_FR that do not exist in STRINGS:\n`,
  );
  for (const key of orphanedFr) {
    console.error(`  - ${key}`);
    const orphanFile =
      frKeyToFile.get(key) ?? "artifacts/presentail-web/src/locales";
    annotateError(
      orphanFile,
      "Orphaned French translation key",
      `Key "${key}" exists in STRINGS_FR but has no matching entry in STRINGS — remove it or add a base entry.`,
    );
  }
  console.error(
    "\nRemove these orphaned keys from the appropriate *StringsFr export or add matching entries to the base *Strings export in artifacts/presentail-web/src/locales/.\n",
  );
}

if (missingFromStrings.length > 0) {
  failed = true;
  console.error(
    `\n✗ Found ${missingFromStrings.length} call site key${missingFromStrings.length === 1 ? "" : "s"} used in t() that ${missingFromStrings.length === 1 ? "has" : "have"} no English/Arabic entry in STRINGS:\n`,
  );
  for (const key of missingFromStrings.sort()) {
    const sites = staticCallSites.get(key) ?? [];
    console.error(`  - ${key}`);
    for (const { file, line } of sites) {
      const relFile = path.relative(REPO_ROOT, file);
      console.error(`      ${relFile}:${line}`);
      annotateError(
        relFile,
        "Undefined web translation key",
        `Key "${key}" is used in a t() call but does not exist in STRINGS — add it (with 'en' and 'ar' values) to the appropriate *Strings export.`,
      );
    }
  }
  console.error(
    "\nAdd these keys (with both 'en' and 'ar' values) to the appropriate *Strings export in artifacts/presentail-web/src/locales/.\n",
  );
  console.error(
    "NOTE: Dynamic call sites such as t(`prefix.${expr}`) are excluded from this check — only static string-literal keys are verified.\n",
  );
}

// ── 4. Arabic coverage check ──────────────────────────────────────────────────
// Every Dict entry must have an `ar` field alongside its `en` field.  A key
// added with only English text silently renders English for Arabic-locale
// visitors; this check catches that at CI time.

if (missingArByFile.size > 0) {
  failed = true;
  const totalMissingAr = Array.from(missingArByFile.values()).reduce(
    (sum, keys) => sum + keys.length,
    0,
  );
  console.error(
    `\n✗ Found ${totalMissingAr} Dict entr${totalMissingAr === 1 ? "y" : "ies"} missing an Arabic (\`ar\`) value:\n`,
  );
  for (const [file, keys] of [...missingArByFile.entries()].sort()) {
    console.error(`  In ${file} — missing Arabic for:`);
    for (const key of keys.sort()) {
      console.error(`    - ${key}`);
      annotateError(
        file,
        "Missing Arabic translation",
        `Key "${key}" has no \`ar\` field in its Dict entry — add an Arabic value alongside the existing \`en\` value.`,
      );
    }
  }
  console.error(
    "\nFor each key above, add an \`ar\` field to its Dict entry in the locale file.\n",
  );
}

// ── 5. Empty-value check ──────────────────────────────────────────────────────
// A Dict entry may have both `en` and `ar` fields present but set to an empty
// string (or whitespace only).  These render as blank text for visitors of
// that locale and are caught here rather than at runtime.

if (emptyValuesByFile.size > 0) {
  failed = true;
  const totalEmpty = Array.from(emptyValuesByFile.values()).reduce(
    (sum, entries) => sum + entries.length,
    0,
  );
  console.error(
    `\n✗ Found ${totalEmpty} Dict entr${totalEmpty === 1 ? "y" : "ies"} with an empty \`en\` or \`ar\` value (blank after trimming):\n`,
  );
  for (const [file, entries] of [...emptyValuesByFile.entries()].sort()) {
    console.error(`  In ${file}:`);
    for (const { key, fields } of [...entries].sort((a, b) => a.key.localeCompare(b.key))) {
      console.error(`    - ${key}  (empty: ${fields.join(", ")})`);
      annotateError(
        file,
        "Empty translation value",
        `Key "${key}" has an empty value for: ${fields.join(", ")}. Fill in the missing text in the locale file.`,
      );
    }
  }
  console.error(
    "\nFor each key above, fill in the empty value(s) in the locale file.\n",
  );
}

// ── GitHub Step Summary ───────────────────────────────────────────────────────
if (SUMMARY_FILE) {
  if (!failed) {
    appendSummary(
      `## ✅ Web translation keys — all checks passed\n\n` +
        `All ${allKeys.length} web translation keys are in use, all values are non-empty, AR coverage is complete, ` +
        `FR coverage is complete (${stringsFrKeys.size}/${stringsKeys.size} keys translated), ` +
        `and all ${staticCallKeys.length} static t() call site${staticCallKeys.length === 1 ? "" : "s"} resolve to defined keys.`,
    );
  } else {
    appendSummary("## ❌ Web translation key checks failed\n");

    if (unusedKeys.length > 0) {
      appendSummary(
        `### Unused keys (${unusedKeys.length} of ${allKeys.length})\n\n` +
          `These keys are defined in the locale files but never referenced in the web source.\n` +
          `Remove them from the appropriate locale domain file in \`artifacts/presentail-web/src/locales/\`.\n`,
      );
      appendSummary("| Key |");
      appendSummary("| --- |");
      for (const key of unusedKeys) {
        appendSummary(`| \`${key}\` |`);
      }
      appendSummary("");
    }

    if (missingFr.length > 0) {
      appendSummary(
        `### Missing French translations (${missingFr.length})\n\n` +
          `These keys are in \`STRINGS\` but have no entry in \`STRINGS_FR\`.\n` +
          `Add the missing keys to the corresponding \`*StringsFr\` export.\n`,
      );
      for (const [file, keys] of [...missingFrByFile.entries()].sort()) {
        appendSummary(`\n**\`${file}\`**\n`);
        appendSummary("| Key |");
        appendSummary("| --- |");
        for (const key of keys.sort()) {
          appendSummary(`| \`${key}\` |`);
        }
      }
      if (missingFrNoFile.length > 0) {
        appendSummary("\n**(source file unknown)**\n");
        appendSummary("| Key |");
        appendSummary("| --- |");
        for (const key of missingFrNoFile.sort()) {
          appendSummary(`| \`${key}\` |`);
        }
      }
      appendSummary("");
    }

    if (orphanedFr.length > 0) {
      appendSummary(
        `### Orphaned French-only keys (${orphanedFr.length})\n\n` +
          `These keys exist in \`STRINGS_FR\` but have no matching entry in \`STRINGS\`.\n` +
          `Remove them or add a base entry in the appropriate \`*Strings\` export.\n`,
      );
      appendSummary("| Key |");
      appendSummary("| --- |");
      for (const key of orphanedFr) {
        appendSummary(`| \`${key}\` |`);
      }
      appendSummary("");
    }

    if (missingFromStrings.length > 0) {
      appendSummary(
        `### Undefined keys used in t() (${missingFromStrings.length})\n\n` +
          `These keys appear in static \`t("key")\` calls but do not exist in \`STRINGS\`.\n` +
          `Add them (with both \`en\` and \`ar\` values) to the appropriate \`*Strings\` export.\n` +
          `> Dynamic calls such as \`t(\`prefix.\${expr}\`)\` are excluded from this check.\n`,
      );
      appendSummary("| Key |");
      appendSummary("| --- |");
      for (const key of missingFromStrings.sort()) {
        appendSummary(`| \`${key}\` |`);
      }
      appendSummary("");
    }

    if (missingArByFile.size > 0) {
      const totalMissingAr = Array.from(missingArByFile.values()).reduce(
        (sum, keys) => sum + keys.length,
        0,
      );
      appendSummary(
        `### Missing Arabic translations (${totalMissingAr})\n\n` +
          `These Dict entries have an \`en\` value but are missing an \`ar\` field.\n` +
          `Add an \`ar\` value to each entry in the locale file.\n`,
      );
      for (const [file, keys] of [...missingArByFile.entries()].sort()) {
        appendSummary(`\n**\`${file}\`**\n`);
        appendSummary("| Key |");
        appendSummary("| --- |");
        for (const key of keys.sort()) {
          appendSummary(`| \`${key}\` |`);
        }
      }
      appendSummary("");
    }

    if (emptyValuesByFile.size > 0) {
      const totalEmpty = Array.from(emptyValuesByFile.values()).reduce(
        (sum, entries) => sum + entries.length,
        0,
      );
      appendSummary(
        `### Empty translation values (${totalEmpty})\n\n` +
          `These Dict entries have a blank \`en\` or \`ar\` value (empty or whitespace-only after trimming).\n` +
          `Fill in the missing text in the locale file.\n`,
      );
      for (const [file, entries] of [...emptyValuesByFile.entries()].sort()) {
        appendSummary(`\n**\`${file}\`**\n`);
        appendSummary("| Key | Empty fields |");
        appendSummary("| --- | --- |");
        for (const { key, fields } of [...entries].sort((a, b) => a.key.localeCompare(b.key))) {
          appendSummary(`| \`${key}\` | ${fields.join(", ")} |`);
        }
      }
      appendSummary("");
    }
  }
}

// ── JSON output (for structured PR comment) ───────────────────────────────────
const JSON_OUT = process.env["WEB_TRANSLATION_JSON_OUT"];
if (JSON_OUT) {
  const result = {
    source: "web",
    passed: !failed,
    totalKeys: allKeys.length,
    scannedFiles: files.length,
    checks: {
      unusedKeys,
      missingFr: [
        ...[...missingFrByFile.entries()].sort().map(([file, keys]) => ({
          file,
          keys: [...keys].sort(),
        })),
        ...(missingFrNoFile.length > 0
          ? [{ file: "(source file unknown)", keys: [...missingFrNoFile].sort() }]
          : []),
      ],
      orphanedFr,
      undefinedRefs: missingFromStrings.sort().map((key) => ({
        key,
        sites: (staticCallSites.get(key) ?? []).map(({ file, line }) => ({
          file: path.relative(REPO_ROOT, file),
          line,
        })),
      })),
      missingAr: [...missingArByFile.entries()].sort().map(([file, keys]) => ({
        file,
        keys: [...keys].sort(),
      })),
      emptyValues: [...emptyValuesByFile.entries()]
        .sort()
        .map(([file, entries]) => ({
          file,
          entries: [...entries]
            .sort((a, b) => a.key.localeCompare(b.key))
            .map(({ key, fields }) => ({ key, fields })),
        })),
    },
  };
  fs.writeFileSync(JSON_OUT, JSON.stringify(result, null, 2));
}

if (!failed) {
  console.log(
    `✓ All ${allKeys.length} web translation keys are in use, all values are non-empty, AR coverage is complete, FR coverage is complete (${stringsFrKeys.size}/${stringsKeys.size} keys translated), and all ${staticCallKeys.length} static t() call site${staticCallKeys.length === 1 ? "" : "s"} resolve to defined keys.`,
  );
  process.exit(0);
} else {
  process.exit(1);
}

} // end if (!process.env.VITEST)
