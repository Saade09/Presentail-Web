/**
 * checkUnusedWebTranslationKeys
 *
 * Scans all TypeScript/TSX source files under `artifacts/presentail-web/src`
 * and reports any key defined in the STRINGS or STRINGS_FR dictionaries inside
 * `artifacts/presentail-web/src/contexts/LocaleContext.tsx` that is never
 * referenced.
 *
 * The check understands both static references (`t("some.key")`) and dynamic
 * template-literal references (`t(\`lang.label.${lang}\`)`). For dynamic
 * calls the static prefix before the first interpolation is extracted; any key
 * whose full name starts with that prefix is considered referenced.
 *
 * Exit code 0 → all keys are used.
 * Exit code 1 → at least one unused key was found (or the script errored).
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
 * Extract all translation keys from LocaleContext.tsx.
 *
 * The file contains two dictionaries:
 *   const STRINGS: Dict = { "some.key": { en: "…", ar: "…" }, … }
 *   const STRINGS_FR: Record<string, string> = { "some.key": "…", … }
 *
 * Both use quoted dot-notation keys. We collect every distinct key that
 * appears in either object.
 */
function extractWebKeys(src: string): string[] {
  const keysSet = new Set<string>();

  // Match any line of the form:  "some.key": (optionally indented).
  // This covers both STRINGS and STRINGS_FR entries.
  const keyRe = /^\s+"([^"]+)":/gm;
  let m: RegExpExecArray | null;
  while ((m = keyRe.exec(src)) !== null) {
    const candidate = m[1];
    // Keys always contain at least one dot (e.g. "utility.deliverTo").
    // Skip plain value-level property names like "en", "ar".
    if (candidate.includes(".")) {
      keysSet.add(candidate);
    }
  }

  return Array.from(keysSet);
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
const allKeys = extractWebKeys(localeContextSrc);

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

const unusedKeys = allKeys.filter(
  (key) => !isKeyReferenced(key, corpus, dynamicPrefixes),
);

if (unusedKeys.length === 0) {
  console.log(`✓ All ${allKeys.length} web translation keys are in use.`);
  process.exit(0);
} else {
  console.error(
    `\n✗ Found ${unusedKeys.length} unused web translation key${unusedKeys.length === 1 ? "" : "s"} (out of ${allKeys.length}):\n`,
  );
  for (const key of unusedKeys) {
    console.error(`  - ${key}`);
  }
  console.error(
    "\nRemove these keys from STRINGS and/or STRINGS_FR in artifacts/presentail-web/src/contexts/LocaleContext.tsx.\n",
  );
  process.exit(1);
}
