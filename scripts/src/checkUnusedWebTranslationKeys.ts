/**
 * checkUnusedWebTranslationKeys
 *
 * Scans all TypeScript/TSX source files under `artifacts/presentail-web/src`
 * and reports any key defined in the STRINGS or STRINGS_FR dictionaries that
 * is never referenced.
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
const LOCALES_DIR = path.join(REPO_ROOT, "artifacts/presentail-web/src/locales");

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
 * French translation is missing.
 */
function extractWebKeys(localeContextSrc: string): {
  all: string[];
  stringsKeys: Set<string>;
  stringsFrKeys: Set<string>;
  stringsKeyToFile: Map<string, string>;
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

    for (const file of localeFiles) {
      const content = fs.readFileSync(file, "utf8");
      const { dictKeys, frKeys } = extractKeysWithType(content);
      for (const k of dictKeys) {
        stringsKeys.add(k);
        stringsKeyToFile.set(k, file);
      }
      for (const k of frKeys) stringsFrKeys.add(k);
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

  return {
    all: Array.from(allKeys),
    stringsKeys,
    stringsFrKeys,
    stringsKeyToFile: new Map(),
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
const { all: allKeys, stringsKeys, stringsFrKeys, stringsKeyToFile } = extractWebKeys(localeContextSrc);

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
    "\nRemove these keys from the appropriate locale domain file in artifacts/presentail-web/src/locales/.\n",
  );
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
