/**
 * checkUnusedWebTranslationKeys
 *
 * Scans all TypeScript/TSX source files under `artifacts/presentail-web/src`
 * and reports any key defined in the STRINGS or STRINGS_FR dictionaries inside
 * `artifacts/presentail-web/src/contexts/LocaleContext.tsx` that is never
 * referenced.
 *
 * It also checks translation coverage:
 *   • Every key in STRINGS must have a matching entry in STRINGS_FR.
 *   • Every key in STRINGS_FR must have a matching entry in STRINGS (i.e. no
 *     orphaned French keys that don't exist in the base English/Arabic dict).
 *
 * The check understands both static references (`t("some.key")`) and dynamic
 * template-literal references (`t(\`lang.label.${lang}\`)`). For dynamic
 * calls the static prefix before the first interpolation is extracted; any key
 * whose full name starts with that prefix is considered referenced.
 *
 * Exit code 0 → all keys are used and coverage is complete.
 * Exit code 1 → at least one unused key or coverage gap was found (or the
 *               script errored).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run check-unused-web-translations
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
 * Extract all translation keys from LocaleContext.tsx, returning both the
 * combined set (for the unused-key check) and the per-dictionary sets (for
 * the coverage check).
 *
 * The file contains two dictionaries:
 *   const STRINGS: Dict = { "some.key": { en: "…", ar: "…" }, … }
 *   const STRINGS_FR: Record<string, string> = { "some.key": "…", … }
 */
function extractWebKeys(src: string): {
  all: string[];
  stringsKeys: Set<string>;
  stringsFrKeys: Set<string>;
} {
  const stringsMarker = src.indexOf("const STRINGS: Dict = {");
  const stringsFrMarker = src.indexOf("const STRINGS_FR:");

  if (stringsMarker === -1 || stringsFrMarker === -1) {
    console.error(
      "ERROR: Could not locate STRINGS or STRINGS_FR in LocaleContext.tsx — aborting.",
    );
    process.exit(1);
  }

  const stringsSection = src.slice(stringsMarker, stringsFrMarker);
  const stringsFrSection = src.slice(stringsFrMarker);

  const stringsKeys = extractKeysFromSection(stringsSection);
  const stringsFrKeys = extractKeysFromSection(stringsFrSection);

  const allKeys = new Set([...stringsKeys, ...stringsFrKeys]);

  return {
    all: Array.from(allKeys),
    stringsKeys,
    stringsFrKeys,
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
function extractStaticTCallKeys(corpus: string): string[] {
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
function extractDynamicPrefixes(corpus: string): string[] {
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

const localeContextSrc = fs.readFileSync(LOCALE_CONTEXT_FILE, "utf8");
const { all: allKeys, stringsKeys, stringsFrKeys } = extractWebKeys(localeContextSrc);

if (allKeys.length === 0) {
  console.error(
    "ERROR: No keys extracted from STRINGS / STRINGS_FR — aborting.",
  );
  process.exit(1);
}

// Collect every source file except LocaleContext.tsx itself.
const files = collectFiles(SCAN_ROOT).filter(
  (f) => f !== LOCALE_CONTEXT_FILE,
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
    `\n✗ Found ${unusedKeys.length} unused web translation key${unusedKeys.length === 1 ? "" : "s"} (out of ${allKeys.length}):\n`,
  );
  for (const key of unusedKeys) {
    console.error(`  - ${key}`);
  }
  console.error(
    "\nRemove these keys from STRINGS and/or STRINGS_FR in artifacts/presentail-web/src/contexts/LocaleContext.tsx.\n",
  );
}

if (missingFr.length > 0) {
  failed = true;
  console.error(
    `\n✗ Found ${missingFr.length} key${missingFr.length === 1 ? "" : "s"} in STRINGS with no French translation in STRINGS_FR:\n`,
  );
  for (const key of missingFr) {
    console.error(`  - ${key}`);
  }
  console.error(
    "\nAdd these keys to STRINGS_FR in artifacts/presentail-web/src/contexts/LocaleContext.tsx.\n",
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
    "\nRemove these orphaned keys from STRINGS_FR or add matching entries to STRINGS in artifacts/presentail-web/src/contexts/LocaleContext.tsx.\n",
  );
}

if (missingFromStrings.length > 0) {
  failed = true;
  console.error(
    `\n✗ Found ${missingFromStrings.length} call site key${missingFromStrings.length === 1 ? "" : "s"} used in t() that ${missingFromStrings.length === 1 ? "has" : "have"} no English/Arabic entry in STRINGS:\n`,
  );
  for (const key of missingFromStrings.sort()) {
    console.error(`  - ${key}`);
  }
  console.error(
    "\nAdd these keys (with both 'en' and 'ar' values) to STRINGS in artifacts/presentail-web/src/contexts/LocaleContext.tsx.\n",
  );
  console.error(
    "NOTE: Dynamic call sites such as t(`prefix.\${expr}`) are excluded from this check — only static string-literal keys are verified.\n",
  );
}

if (!failed) {
  console.log(
    `✓ All ${allKeys.length} web translation keys are in use, FR coverage is complete (${stringsFrKeys.size}/${stringsKeys.size} keys translated), and all ${staticCallKeys.length} static t() call site${staticCallKeys.length === 1 ? "" : "s"} resolve to defined keys.`,
  );
  process.exit(0);
} else {
  process.exit(1);
}
