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
 * Six checks are run:
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
 * 4. ORPHAN LOCALE KEYS — keys present in AR or FR but absent from EN.
 *    These accumulate when a feature is partially rolled back or when a
 *    translator adds keys ahead of the EN copy landing.  They are
 *    unreachable at runtime and indicate drift between the locale objects.
 *
 * 5. PLACEHOLDER / COPY-PASTE STRINGS — AR or FR values that are
 *    byte-for-byte identical to the EN value (copy-pasted without
 *    translating), plus AR values that contain no Arabic-script characters
 *    (Unicode U+0600–U+06FF), which strongly indicates English text was
 *    committed verbatim as the Arabic translation.
 *
 * 6. EMPTY LOCALE VALUES — AR or FR entries whose value is an empty string
 *    ("").  TypeScript cannot catch this because the key is present and
 *    correctly typed; shoppers on those locales see blank text instead of a
 *    translation.  The EN value and its translatability are checked first to
 *    avoid false positives on language-neutral or purely-variable strings.
 *
 * 7. CROSS-LOCALE PARITY (AR vs FR) — keys present in one non-English
 *    locale but absent from the other.  Checks 2 and 4 together cover the
 *    symmetric EN↔AR and EN↔FR gaps, but a key can be added to AR (or FR)
 *    without a matching EN entry and without appearing in FR (or AR).  That
 *    edge case — invisible to the EN-anchored checks — is caught here.
 *
 * Exit code 0 → all checks pass.
 * Exit code 1 → at least one check failed (details printed to stderr).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run check-unused-mobile-translations
 *   pnpm --filter @workspace/scripts run check-translations   (combined)
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
 * Returns true when the file content uses the `t` translation object — either
 * via the `useT()` hook or a direct `translations[lang]` access.  Filtering
 * to these files prevents false positives from the many other places in the
 * codebase that happen to use `t` as a generic variable name.
 */
export function usesTranslationObject(src: string): boolean {
  return /\buseT\s*\(/.test(src) || /translations\s*\[/.test(src);
}

/**
 * Extract every literal translation-key identifier accessed via the `t`
 * translation object in a block of source text, together with the 1-based
 * line number of each match.
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
export function extractLiteralKeyRefsWithLines(
  src: string,
): Array<{ key: string; line: number }> {
  const results: Array<{ key: string; line: number }> = [];
  // Track (key, line) pairs we have already recorded so duplicate accesses on
  // the same line are not emitted twice (e.g. `t.key && t.key`).
  const seen = new Map<string, Set<number>>();

  function add(key: string, index: number) {
    const line = getLine(src, index);
    if (!seen.has(key)) seen.set(key, new Set());
    if (seen.get(key)!.has(line)) return;
    seen.get(key)!.add(line);
    results.push({ key, line });
  }

  // Dot notation: word boundary before `t`; lookahead ensures method calls
  // such as `t.map(` or `t.then(` are not captured.
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
 * Extract the top-level property keys from a named locale block.
 *
 * Matches `const <NAME>[optional type annotation] = {` … `};` where the
 * closing `};` appears at the start of a line — this avoids false positives
 * from nested objects inside the block.
 */
export function extractLocaleKeys(src: string, localeName: string): string[] {
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
 * Extract top-level key → value pairs from a locale block.
 *
 * Only handles single-line string values (single or double quoted).
 * Template-literal values and multi-line values are skipped — they produce
 * no false positives, only possible false negatives.
 *
 * Returns a Map<key, rawValue> for the given locale block.
 */
export function extractLocaleKeyValues(
  src: string,
  localeName: string,
): Map<string, string> {
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
  const result = new Map<string, string>();
  const pairRe =
    /^\s+([a-zA-Z_][a-zA-Z0-9_]*):\s*"((?:[^"\\]|\\.)*)"|^\s+([a-zA-Z_][a-zA-Z0-9_]*):\s*'((?:[^'\\]|\\.)*)'/gm;
  let m: RegExpExecArray | null;
  while ((m = pairRe.exec(block)) !== null) {
    if (m[1] !== undefined) {
      result.set(m[1], m[2]);
    } else if (m[3] !== undefined) {
      result.set(m[3], m[4]);
    }
  }
  return result;
}

/**
 * Returns true if the string contains at least one Arabic-script character
 * (Unicode block U+0600–U+06FF).
 */
export function containsArabicScript(value: string): boolean {
  return /[\u0600-\u06FF]/.test(value);
}

/**
 * Returns true when a string is composed entirely of language-neutral
 * characters — digits, whitespace, punctuation, and common symbols — that
 * are legitimately identical across all locales (e.g. "+961", "—", "USD").
 * Used to suppress false positives in the Arabic-script check.
 */
export function isLanguageNeutralValue(value: string): boolean {
  return value.replace(/[\d\s\p{P}\p{S}\p{N}]/gu, "").length === 0;
}

/**
 * Returns the set of EN keys annotated with `// no-translate` on the same
 * line as their value.  These keys are intentionally identical across all
 * locales — either because the word is a French loan word used unchanged in
 * French, a proper brand name, or a universally recognised abbreviation —
 * and should be excluded from the placeholder / copy-paste check (Check 5).
 *
 * Example annotation in the EN block:
 *   boutique: "Boutique",  // no-translate — French loan word
 */
export function extractNoTranslateKeys(src: string): Set<string> {
  const blockRe = /^const EN(?:[^=]*)=\s*\{([\s\S]*?)^};/m;
  const match = src.match(blockRe);
  if (!match) return new Set();
  const block = match[1];
  const result = new Set<string>();
  // Match single-line string values followed by a // no-translate comment.
  const lineRe =
    /^\s+([a-zA-Z_][a-zA-Z0-9_]*):\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*,?\s*\/\/.*no-translate/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(block)) !== null) {
    result.add(m[1]);
  }
  return result;
}

/**
 * Returns true when the EN value has no human-translatable text — i.e. its
 * only "words" are template variables (`{…}`) or language-neutral content.
 * Example: `"{country}"` → nothing to translate; `"you@example.com"` → no.
 * Used to avoid false positives on values like `{country}` where AR/FR are
 * correctly identical to EN.
 */
export function enValueIsUntranslatable(enVal: string): boolean {
  // Strip all `{...}` template-variable tokens, then check if what remains
  // is language-neutral (digits, punctuation, whitespace, symbols only).
  const stripped = enVal.replace(/\{[^}]+\}/g, "");
  return stripped === "" || isLanguageNeutralValue(stripped);
}

/**
 * A key is considered referenced when it appears as:
 *   t.keyName   — dot-notation property access
 *   "keyName"   — double-quoted string literal (bracket or data access)
 *   'keyName'   — single-quoted string literal
 */
export function isKeyReferenced(key: string, corpus: string): boolean {
  if (new RegExp(`\\.${key}(?![a-zA-Z0-9_])`).test(corpus)) return true;
  if (new RegExp(`['"]${key}['"]`).test(corpus)) return true;
  return false;
}

// ── Check 5 helpers (exported for unit tests) ─────────────────────────────────

/**
 * Minimum EN-value character length for the copy-paste identical check.
 *
 * Values shorter than this are skipped to avoid false-positives on brand
 * names, abbreviations, and internationally shared terms (e.g. "Express",
 * "Presentail", "Total", "OK") that are legitimately identical across locales.
 * Any EN value of 25+ characters that is also untouched in AR or FR is almost
 * certainly a copy-paste oversight rather than an intentional match.
 */
export const MIN_COPY_PASTE_LENGTH = 25;

export type PlaceholderHit = {
  locale: string;
  key: string;
  reason: "identical_to_en" | "no_arabic_script";
  enValue: string;
  localeValue: string;
};

/**
 * Evaluate a single (locale, key, enVal, localeVal) tuple against the Check 5
 * copy-paste / placeholder rules and return the matching `PlaceholderHit`, or
 * `null` when the value passes.
 *
 * This is a pure function extracted from the main script loop so that unit
 * tests can exercise Check 5 logic — including the MIN_COPY_PASTE_LENGTH
 * threshold and the duplicate-diagnostic suppression — without running the
 * full I/O pipeline.
 *
 * Callers are responsible for pre-filtering:
 *   - enVal / localeVal must be non-empty strings (empty values are Check 6)
 *   - enValueIsUntranslatable(enVal) must be false (untranslatable EN → skip)
 *   - The key must not be in noTranslateKeys (annotated overrides → skip)
 */
export function classifyPlaceholderHit(
  locale: string,
  key: string,
  enVal: string,
  localeVal: string,
): PlaceholderHit | null {
  // (a) Identical to EN — only flag when EN is long enough to rule out brand
  // names and abbreviations that are legitimately identical across locales.
  if (localeVal === enVal && enVal.length >= MIN_COPY_PASTE_LENGTH) {
    return { locale, key, reason: "identical_to_en", enValue: enVal, localeValue: localeVal };
  }

  // (b) AR-specific: no Arabic-script characters in a value that differs from
  // EN.  Skip values identical to EN — those are already handled (and
  // potentially intentionally skipped due to length) by sub-check (a) above.
  // Flagging them here too would produce a duplicate / misleading diagnostic.
  if (
    locale === "AR" &&
    localeVal !== enVal &&
    !containsArabicScript(localeVal) &&
    !isLanguageNeutralValue(localeVal)
  ) {
    return { locale, key, reason: "no_arabic_script", enValue: enVal, localeValue: localeVal };
  }

  return null;
}

// ── main ─────────────────────────────────────────────────────────────────────
// Guard lets unit tests import the exported functions without triggering I/O
// or process.exit().  Vitest sets process.env.VITEST; the guard checks for it.

if (!process.env.VITEST) {

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

const enValues = extractLocaleKeyValues(translationsSrc, "EN");
const arValues = extractLocaleKeyValues(translationsSrc, "AR");
const frValues = extractLocaleKeyValues(translationsSrc, "FR");
const noTranslateKeys = extractNoTranslateKeys(translationsSrc);

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
//
// For each key that is not in EN we collect every call site (file + line)
// so the developer can jump straight to the offending reference.

const enKeySet = new Set(enKeys);

// Map from key name → all call sites (file + 1-based line) where it appears.
const keyCallSites = new Map<string, CallSite[]>();

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

// ── Check 4: orphan keys in AR / FR ──────────────────────────────────────────
// Keys present in a non-English locale block but absent from EN cannot be
// reached at runtime. They accumulate when a feature is partially rolled back
// or when a translator adds keys ahead of the EN copy landing.

type LocaleOrphans = { locale: string; orphanKeys: string[] };
const localeOrphans: LocaleOrphans[] = [];

for (const [locale, keySet] of [
  ["AR", arKeys],
  ["FR", frKeys],
] as [string, Set<string>][]) {
  const orphans = Array.from(keySet)
    .filter((k) => !enKeySet.has(k))
    .sort();
  if (orphans.length > 0) {
    localeOrphans.push({ locale, orphanKeys: orphans });
  }
}

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
    const escapeValue = (s: string) =>
      s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
    const escapeProp = (s: string) =>
      escapeValue(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
    process.stdout.write(
      `::error file=${escapeProp("artifacts/presentail/lib/translations.ts")},title=${escapeProp(title)}::${escapeValue(message)}\n`,
    );
  }
}

// ── report ────────────────────────────────────────────────────────────────────

let failed = false;

if (unusedKeys.length > 0) {
  failed = true;
  console.error(
    `\n✗ Found ${unusedKeys.length} unused mobile translation key${unusedKeys.length === 1 ? "" : "s"} (out of ${enKeys.length}) — scanned ${files.length} source file${files.length === 1 ? "" : "s"}:\n`,
  );
  for (const key of unusedKeys) {
    console.error(`  - ${key}`);
    annotateError(
      "Unused mobile translation key",
      `Key "${key}" is defined in EN but not referenced anywhere in the mobile source — remove it from all three locale blocks (EN, AR, FR).`,
    );
  }
  console.error(
    "\nRemove these keys from all three locale blocks (EN, AR, FR) in artifacts/presentail/lib/translations.ts.\n",
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
        `Key "${key}" is present in EN but missing from the ${locale} locale block — add a ${locale} translation for it in artifacts/presentail/lib/translations.ts.`,
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
    `\n✗ Found ${undefinedKeys.length} mobile translation key${undefinedKeys.length === 1 ? "" : "s"} referenced in source that do not exist in EN:\n`,
  );
  for (const key of undefinedKeys) {
    const sites = keyCallSites.get(key) ?? [];
    console.error(`  - ${key}`);
    annotateError(
      "Undefined mobile translation key",
      `Key "${key}" is referenced in source via t.${key} or t["${key}"] but does not exist in the EN locale block — add it to all three locale blocks or fix the reference.`,
    );
    for (const { file, line } of sites) {
      console.error(`      ${path.relative(REPO_ROOT, file)}:${line}`);
    }
  }
  console.error(
    "\nAdd these keys to all three locale blocks in artifacts/presentail/lib/translations.ts, or fix the call sites in source.\n",
  );
  console.error(
    "NOTE: Dynamic accesses such as t[someVariable] cannot be statically resolved and are not checked.\n",
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
        `Key "${key}" is present in the ${locale} locale block but does not exist in EN — either add it to the EN block or remove it from ${locale} in artifacts/presentail/lib/translations.ts.`,
      );
    }
  }
  console.error(
    "\nEither add the missing keys to the EN block or remove the orphaned entries from the affected locale block(s) in artifacts/presentail/lib/translations.ts.\n",
  );
}

// ── Check 6: empty locale values ─────────────────────────────────────────────
// An AR or FR entry whose value is an empty string ("") renders as blank text
// to shoppers on that locale. TypeScript cannot detect this because the key is
// present and correctly typed — the script is the only safety net.
//
// Skipped when:
//   • The EN value is also empty or not parseable — nothing to flag.
//   • The EN value is entirely untranslatable (pure template variables, digits,
//     punctuation) — there is no human text to be written.
//
// Template literals and multi-line values cannot be parsed by the simple regex
// extractor, so they produce false negatives here — acceptable trade-off.

type EmptyValueHit = { locale: string; key: string; enValue: string };

const emptyValueHits: EmptyValueHit[] = [];

for (const [locale, localeValueMap] of [
  ["AR", arValues],
  ["FR", frValues],
] as [string, Map<string, string>][]) {
  for (const key of enKeys) {
    const enVal = enValues.get(key);
    const localeVal = localeValueMap.get(key);

    if (enVal === undefined || localeVal === undefined) continue;
    if (enVal === "") continue;
    if (enValueIsUntranslatable(enVal)) continue;
    if (localeVal === "") {
      emptyValueHits.push({ locale, key, enValue: enVal });
    }
  }
}

if (emptyValueHits.length > 0) {
  failed = true;
  const hitsByLocale = new Map<string, EmptyValueHit[]>();
  for (const hit of emptyValueHits) {
    if (!hitsByLocale.has(hit.locale)) hitsByLocale.set(hit.locale, []);
    hitsByLocale.get(hit.locale)!.push(hit);
  }
  for (const [locale, hits] of hitsByLocale) {
    console.error(
      `\n✗ ${hits.length} ${locale} translation value${hits.length === 1 ? " is" : "s are"} empty (shoppers on this locale will see blank text):\n`,
    );
    for (const hit of hits) {
      console.error(
        `  - ${hit.key} [${locale}]: value is "" (EN: "${hit.enValue}")`,
      );
      annotateError(
        `Empty ${locale} translation value`,
        `Key "${hit.key}" has an empty value in the ${locale} locale block — shoppers will see blank text. Add a ${locale} translation in artifacts/presentail/lib/translations.ts.`,
      );
    }
  }
  console.error(
    "\nFill in a real translation for each empty value in artifacts/presentail/lib/translations.ts.\n",
  );
}

// ── Check 7: cross-locale parity (AR vs FR) ──────────────────────────────────
// Checks 2 and 4 together guarantee symmetric coverage between EN and each
// non-English locale, but they leave one edge case open: a key added to AR
// without a matching EN entry (or vice versa for FR) also has no FR entry.
// The orphan check (4) flags the EN absence, but a dedicated AR↔FR check
// makes that gap explicit and actionable for translators.

type CrossLocaleGap = {
  presentIn: string;
  absentFrom: string;
  keys: string[];
};
const crossLocaleGaps: CrossLocaleGap[] = [];

const arOnlyKeys = Array.from(arKeys)
  .filter((k) => !frKeys.has(k))
  .sort();
const frOnlyKeys = Array.from(frKeys)
  .filter((k) => !arKeys.has(k))
  .sort();

if (arOnlyKeys.length > 0) {
  crossLocaleGaps.push({ presentIn: "AR", absentFrom: "FR", keys: arOnlyKeys });
}
if (frOnlyKeys.length > 0) {
  crossLocaleGaps.push({ presentIn: "FR", absentFrom: "AR", keys: frOnlyKeys });
}

// ── Check 5: placeholder / copy-paste strings ─────────────────────────────────
// Two classes of likely-untranslated strings are flagged:
//   (a) AR or FR value is byte-for-byte identical to the EN value, AND the EN
//       value is at least MIN_COPY_PASTE_LENGTH characters long.  Short values
//       (brand names, abbreviations, internationally shared terms like "Total",
//       "Express", "OK", "MM", "Presentail") are legitimately identical across
//       locales and are skipped to avoid false positives.
//   (b) AR value contains no Arabic-script characters (U+0600–U+06FF) and is
//       not language-neutral (digits, punctuation, symbols are fine as-is).
//       No length threshold applies here — even a short AR value with no
//       Arabic script is a genuine translation oversight.
//
// Values that could not be parsed (template literals, multi-line) are silently
// skipped — false negatives are acceptable, false positives are not.
// The check logic lives in the exported `classifyPlaceholderHit` helper above.

const placeholderHits: PlaceholderHit[] = [];

for (const [locale, localeValueMap] of [
  ["AR", arValues],
  ["FR", frValues],
] as [string, Map<string, string>][]) {
  for (const key of enKeys) {
    const enVal = enValues.get(key);
    const localeVal = localeValueMap.get(key);

    if (enVal === undefined || localeVal === undefined) continue;
    if (enVal === "" || localeVal === "") continue;
    // Skip values where there is nothing translatable in the EN string
    // (e.g. pure template variables like "{country}").
    if (enValueIsUntranslatable(enVal)) continue;
    // Skip keys explicitly annotated as `// no-translate` in the EN block
    // (brand names, French loan words used unchanged in FR, universal
    // abbreviations — values that are legitimately identical across locales).
    if (noTranslateKeys.has(key)) continue;

    const hit = classifyPlaceholderHit(locale, key, enVal, localeVal);
    if (hit) placeholderHits.push(hit);
  }
}

if (placeholderHits.length > 0) {
  failed = true;
  const hitsByLocale = new Map<string, PlaceholderHit[]>();
  for (const hit of placeholderHits) {
    if (!hitsByLocale.has(hit.locale)) hitsByLocale.set(hit.locale, []);
    hitsByLocale.get(hit.locale)!.push(hit);
  }
  for (const [locale, hits] of hitsByLocale) {
    console.error(
      `\n✗ ${hits.length} ${locale} translation${hits.length === 1 ? "" : "s"} look${hits.length === 1 ? "s" : ""} like placeholder or copy-pasted English text:\n`,
    );
    for (const hit of hits) {
      if (hit.reason === "identical_to_en") {
        console.error(
          `  - ${hit.key} [${locale}]: value is identical to EN ("${hit.enValue}")`,
        );
      } else {
        console.error(
          `  - ${hit.key} [AR]: no Arabic-script characters found — value is "${hit.localeValue}" (EN: "${hit.enValue}")`,
        );
      }
    }
  }
  console.error(
    "\nReplace the flagged values with real translations in artifacts/presentail/lib/translations.ts.\n",
  );
}

if (crossLocaleGaps.length > 0) {
  failed = true;
  for (const { presentIn, absentFrom, keys } of crossLocaleGaps) {
    console.error(
      `\n✗ ${keys.length} key${keys.length === 1 ? "" : "s"} present in ${presentIn} but missing from ${absentFrom}:\n`,
    );
    for (const key of keys) {
      console.error(`  - ${key}`);
      annotateError(
        `Cross-locale gap: ${presentIn} has key absent from ${absentFrom}`,
        `Key "${key}" exists in the ${presentIn} locale block but not in ${absentFrom} — add a ${absentFrom} translation or remove it from ${presentIn} in artifacts/presentail/lib/translations.ts.`,
      );
    }
  }
  console.error(
    "\nEnsure AR and FR locale blocks contain exactly the same set of keys in artifacts/presentail/lib/translations.ts.\n",
  );
}

// ── JSON output (for structured PR comment) ───────────────────────────────────
const JSON_OUT = process.env["MOBILE_TRANSLATION_JSON_OUT"];
if (JSON_OUT) {
  const result = {
    source: "mobile",
    passed: !failed,
    totalEnKeys: enKeys.length,
    scannedFiles: files.length,
    checks: {
      unusedKeys,
      missingLocale: localeGaps.map(({ locale, missingKeys }) => ({
        locale,
        keys: missingKeys,
      })),
      undefinedRefs: undefinedKeys.map((key) => ({
        key,
        sites: (keyCallSites.get(key) ?? []).map(({ file, line }) => ({
          file: path.relative(REPO_ROOT, file),
          line,
        })),
      })),
      orphanKeys: localeOrphans.map(({ locale, orphanKeys }) => ({
        locale,
        keys: orphanKeys,
      })),
      placeholders: placeholderHits.map(({ locale, key, reason }) => ({
        locale,
        key,
        reason,
      })),
    },
  };
  fs.writeFileSync(JSON_OUT, JSON.stringify(result, null, 2));
}

if (!failed) {
  console.log(
    `✓ All ${enKeys.length} mobile EN keys are in use, AR/FR parity is complete, no undefined key references were found, no orphan AR/FR keys exist, no empty locale values were detected, no placeholder or copy-pasted translations were detected, and AR/FR cross-locale parity is consistent.`,
  );
  process.exit(0);
} else {
  process.exit(1);
}

} // end if (!process.env.VITEST)
