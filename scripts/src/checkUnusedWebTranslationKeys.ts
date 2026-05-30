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
function extractMissingArKeys(src: string): string[] {
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
 */
function extractWebKeys(localeContextSrc: string): {
  all: string[];
  stringsKeys: Set<string>;
  stringsFrKeys: Set<string>;
  stringsKeyToFile: Map<string, string>;
  missingArByFile: Map<string, string[]>;
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
    const missingArByFile = new Map<string, string[]>();

    for (const file of localeFiles) {
      const content = fs.readFileSync(file, "utf8");
      const { dictKeys, frKeys } = extractKeysWithType(content);
      for (const k of dictKeys) {
        stringsKeys.add(k);
        stringsKeyToFile.set(k, file);
      }
      for (const k of frKeys) stringsFrKeys.add(k);

      // Arabic coverage: find dict entries missing the `ar` field.
      const missingAr = extractMissingArKeys(content);
      if (missingAr.length > 0) {
        const rel = path.relative(REPO_ROOT, file);
        missingArByFile.set(rel, missingAr);
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
      missingArByFile,
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

  return {
    all: Array.from(allKeys),
    stringsKeys,
    stringsFrKeys,
    stringsKeyToFile: new Map(),
    missingArByFile,
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

// ── main ─────────────────────────────────────────────────────────────────────
// Guard lets unit tests import the exported functions without triggering I/O
// or process.exit().  Vitest sets process.env.VITEST; the guard checks for it.

if (!process.env.VITEST) {

const localeContextSrc = fs.readFileSync(LOCALE_CONTEXT_FILE, "utf8");
const { all: allKeys, stringsKeys, stringsFrKeys, stringsKeyToFile, missingArByFile } = extractWebKeys(localeContextSrc);

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

if (missingFr.length > 0) {
  failed = true;
  console.error(
    `\n✗ Found ${missingFr.length} key${missingFr.length === 1 ? "" : "s"} in STRINGS with no French translation in STRINGS_FR:\n`,
  );

  // Group missing keys by the domain file they were defined in so the
  // developer knows exactly which file to edit.
  const byFile = new Map<string, string[]>();
  const noFile: string[] = [];
  for (const key of missingFr) {
    const file = stringsKeyToFile.get(key);
    if (file) {
      const rel = path.relative(REPO_ROOT, file);
      if (!byFile.has(rel)) byFile.set(rel, []);
      byFile.get(rel)!.push(key);
    } else {
      noFile.push(key);
    }
  }

  for (const [file, keys] of [...byFile.entries()].sort()) {
    console.error(`  In ${file} — add French translations for:`);
    for (const key of keys.sort()) {
      console.error(`    - ${key}`);
    }
  }
  if (noFile.length > 0) {
    console.error(`  (source file unknown):`);
    for (const key of noFile.sort()) {
      console.error(`    - ${key}`);
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
      console.error(`      ${path.relative(REPO_ROOT, file)}:${line}`);
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
    }
  }
  console.error(
    "\nFor each key above, add an \`ar\` field to its Dict entry in the locale file.\n",
  );
}

if (!failed) {
  console.log(
    `✓ All ${allKeys.length} web translation keys are in use, AR coverage is complete, FR coverage is complete (${stringsFrKeys.size}/${stringsKeys.size} keys translated), and all ${staticCallKeys.length} static t() call site${staticCallKeys.length === 1 ? "" : "s"} resolve to defined keys.`,
  );
  process.exit(0);
} else {
  process.exit(1);
}

} // end if (!process.env.VITEST)
