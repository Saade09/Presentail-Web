/**
 * checkHardcodedWebStrings
 *
 * Scans all TSX source files under artifacts/presentail-web/src/ AND all
 * .mjs files in the artifacts/presentail-web/ root (e.g. seo-inject.mjs)
 * and reports strings that appear to be hardcoded English prose — user-visible
 * strings that should be going through the t() translation function, a
 * properly localised COPY constant, or a locale-keyed dictionary.
 *
 * Detection covers seven patterns:
 *   A. Inline JSX text nodes  — text between ">…</"  on the same line, after
 *      stripping {JS expressions}.  This naturally covers <title>…</title>
 *      JSX elements used in Helmet-style components.
 *   B. Standalone text lines  — an indented line whose content is only prose
 *      characters (no JSX/code symbols), indicating a multi-line JSX text node.
 *   C. User-visible JSX prop strings — plain string literals on known props:
 *      placeholder, aria-label, title, alt, heading, label, description,
 *      subtitle, emptyText, noResultsText, emptyLabel.
 *   D. Nullish-coalescing fallback strings — `?? "text"` patterns
 *      that end up rendering in JSX.
 *   E. document.title string literal assignments — `document.title = "text"`
 *      imperative page-title updates that bypass the JSX tree (navigation
 *      equivalent of Expo Router's `options={{ title: "…" }}`).
 *   F. <meta> title content attributes — `content="text"` on any line that
 *      also carries  name="title", name="og:title", or name="twitter:title".
 *      Flags only when the content looks like English prose so og:image URLs
 *      and short technical strings are not reported.
 *   G. Logical-OR fallback strings — `|| "text"` patterns.  Complements
 *      Pattern D.  In .mjs SEO helpers these commonly appear as image-alt
 *      or title fallback values that bypass localisation.
 *
 * Exclusions (files / blocks / lines that are NOT flagged):
 *   • Test files  (*.test.tsx, *.test.ts)
 *   • The src/locales/ directory (translation source files)
 *   • The src/components/ui/ directory (shadcn boilerplate)
 *   • Blocks enclosed in  const COPY: Record<Language, …> = { … }  — these
 *     pages are already properly localised via the COPY pattern.
 *   • Blocks that are known locale-keyed dictionaries in seo-inject.mjs:
 *     TITLES, DESCRIPTIONS, COUNTRY_NAMES, CITY_NAMES, BRANDS_FILTER_TITLES,
 *     BRANDS_FILTER_DESCRIPTIONS, OG_LOCALE, WISHLIST_SEO.
 *   • Comment lines (// …) and block-comment lines (/* … *\/)
 *   • Import / export / type / interface declaration lines.
 *   • Lines that already contain a  t("…")  or  t('…')  call.
 *   • console.log / console.error / displayName lines.
 *   • Strings that do not look like English prose (pure numbers, URLs,
 *     emails, fewer than 2 word-tokens of 2+ letters, or a single word
 *     shorter than 5 letters).
 *
 * Exit code 0 — nothing found.
 * Exit code 1 — at least one likely-hardcoded string detected, or the
 *               script errored.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run check-hardcoded-web-strings
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../");
// Web artifact root — scanned for .mjs files (non-recursive; seo-inject.mjs lives here).
const WEB_ARTIFACT_ROOT = path.join(REPO_ROOT, "artifacts/presentail-web");

export const SKIP_DIRS = new Set([
  "node_modules",
  ".expo",
  "dist",
  ".turbo",
  "__generated__",
  "locales", // translation source — scanning these would always flag false positives
  "ui",      // shadcn boilerplate — no user-authored strings
]);

// Skip dirs used when scanning shared libs (subset — no web-specific exclusions)
const LIB_SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".turbo",
  "__generated__",
]);

// All source trees to scan: the web artifact plus shared libs
const SCAN_ROOTS: Array<{ root: string; skipDirs: Set<string> }> = [
  { root: path.join(REPO_ROOT, "artifacts/presentail-web/src"), skipDirs: SKIP_DIRS },
  { root: path.join(REPO_ROOT, "lib"), skipDirs: LIB_SKIP_DIRS },
];

// ── types ──────────────────────────────────────────────────────────────────────

type HitKind = "jsx-text" | "jsx-prop" | "standalone-text" | "fallback-string" | "doc-title" | "meta-title";

interface Hit {
  file: string;   // repo-relative path
  line: number;   // 1-indexed
  kind: HitKind;
  attr?: string;  // for jsx-prop: which attribute
  text: string;   // the extracted text (expressions stripped)
}

// ── helpers ────────────────────────────────────────────────────────────────────

export function collectFiles(dir: string, skipDirs: Set<string>, results: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      collectFiles(path.join(dir, entry.name), skipDirs, results);
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.test\.(tsx?|jsx?)$/.test(entry.name) &&
      !/\.d\.ts$/.test(entry.name)
    ) {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

/**
 * Collect .mjs files directly in `dir` (non-recursive).
 * Used to include the web artifact root scripts such as seo-inject.mjs.
 */
function collectMjsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && /\.mjs$/.test(entry.name)) {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

/**
 * Strip single-level JSX expression placeholders ({…}) from a string and
 * collapse runs of whitespace.  Handles nested braces one level deep.
 */
export function stripExpressionsAndTrim(text: string): string {
  return text
    .replace(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)?\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns true when text contains Arabic-script characters (U+0600–U+06FF).
 * Used to catch hardcoded Arabic strings that bypass the t() translation function.
 */
export function containsArabicScript(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

/**
 * Returns true when text contains French diacritic characters that are absent
 * from plain ASCII.  Catches hardcoded French strings (é, è, ê, ë, à, â, æ,
 * ç, î, ï, ô, œ, ù, û, ü, ÿ — and their uppercase equivalents) that would
 * slip past the looksLikeEnglishProse word-count check because the accented
 * characters break the /\b[a-zA-Z]{2,}\b/ token boundary.
 *
 * Examples that are caught only by this helper:
 *   "Résumé"        (é breaks token; looksLikeEnglishProse sees only "sum")
 *   "Ça va?"        (ç, à; base-Latin tokens ["va"] — too few / too short)
 *   "Réservé"       (two é breaks; only "serv" remains — 1 short token)
 */
export function containsFrenchAccents(text: string): boolean {
  return /[àâæçèéêëîïôœùûüÿÀÂÆÇÈÉÊËÎÏÔŒÙÛÜŸ]/.test(text);
}

/**
 * Returns true when text looks like user-visible English prose.
 *
 * Passes when:
 *   - Contains at least one Latin letter.
 *   - Is not a URL or email address.
 *   - Has 2+ word-tokens (2+ consecutive letters each), OR a single word of
 *     5+ letters (to catch "Loading", "Copied", "Delete", etc.).
 */
export function looksLikeEnglishProse(raw: string): boolean {
  const s = stripExpressionsAndTrim(raw);
  if (s.length < 2) return false;
  if (!/[a-zA-Z]/.test(s)) return false;
  if (/^https?:\/\//.test(s)) return false;
  if (/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]+$/i.test(s)) return false;

  const words = s.match(/\b[a-zA-Z]{2,}\b/g) ?? [];
  if (words.length >= 2) return true;
  if (words.length === 1 && words[0].length >= 5) return true;
  return false;
}

/**
 * Returns true when the entire line should be skipped unconditionally.
 */
export function shouldSkipLine(line: string): boolean {
  const t = line.trim();
  if (t === "") return true;
  if (t.startsWith("//")) return true;          // single-line comment
  if (t.startsWith("*")) return true;           // JSDoc / block-comment line
  if (t.startsWith("/*")) return true;          // block-comment open
  if (/^import\s/.test(t)) return true;         // import statement
  if (/^export\s+(type|interface)\s/.test(t)) return true;
  if (/^(type|interface)\s+[A-Z]/.test(t)) return true;
  if (/\bt\(["'`]/.test(t)) return true;        // already uses t()
  if (/console\.(log|warn|error|info|debug)\b/.test(t)) return true;
  if (/\.displayName\s*=/.test(t)) return true;
  return false;
}

// ── regex patterns ─────────────────────────────────────────────────────────────

// A: Inline JSX text — text between > and </ on the same line.
//    We allow {expressions} inside; they are stripped by looksLikeEnglishProse.
export const INLINE_JSX_TEXT_RE = />([^<\n]+)<\//g;

// B: Standalone text line — an indented multi-word line containing only prose
//    characters.  Deliberately conservative to minimise false positives:
//      • Requires 2+ leading spaces or a tab (indented)
//      • Starts with a letter
//      • Middle characters: letters, digits, spaces, apostrophes/right-quote,
//        en-dash (–), em-dash (—), ellipsis (…), exclamation marks
//        NOT included: hyphens (CSS utility classes use them: "flex-col"),
//        periods/dots (code property chains: "user.email"), question marks
//        (optional-chaining / ternaries: "data?.items")
//      • Ends with a letter, digit, ellipsis, exclamation, or sentence period
//      • Does NOT start with a JS keyword (checked separately in the loop)
//    Multi-word requirement (≥ 2 English word tokens) is enforced in the loop.
export const STANDALONE_TEXT_RE =
  /^[ \t]{2,}([a-zA-Z][a-zA-Z0-9 !\u2019\u2013\u2014\u2026']{3,}[a-zA-Z0-9\u2026!.])$/;

// B (Arabic): Standalone Arabic text line — a parallel to STANDALONE_TEXT_RE for
//    lines whose content is Arabic-script characters.  STANDALONE_TEXT_RE requires
//    the line to start with [a-zA-Z], so a developer who writes a multi-line JSX
//    Arabic text node:
//        <p>
//          أرسل الزهور
//        </p>
//    would have the inner line go undetected without this companion pattern.
//      • Requires 2+ leading spaces or a tab (indented)
//      • Starts with an Arabic-script character (U+0600–U+06FF)
//      • Middle: Arabic letters, Arabic punctuation (،؛؟), spaces, common
//        typographic punctuation (– — … !)
//      • Ends with an Arabic letter or Arabic/common punctuation
//    containsArabicScript() is still checked in the loop as the final gate.
export const STANDALONE_ARABIC_TEXT_RE =
  /^[ \t]{2,}([\u0600-\u06FF][\u0600-\u06FF\u060C\u061B\u061F \u0021\u2019\u2013\u2014\u2026]{1,}[\u0600-\u06FF\u060C\u061F\u2026\u0021])$/;

// Code keywords that must not be treated as standalone JSX text.
export const CODE_KEYWORDS_RE =
  /^(return|throw|const|let|var|if|else|switch|case|import|export|async|await|try|catch|finally|new|delete|typeof|void|yield|function|class|extends|implements|interface|type|enum)\b/;

// C: User-visible JSX prop string literals.
export const VISIBLE_PROP_RE =
  /\b(placeholder|aria-label|title|alt|heading|label|description|subtitle|noResultsText|emptyText|emptyLabel)\s*=\s*["']([^"'\n]{2,})["']/g;

// D: Nullish-coalescing fallback strings that end up rendered in JSX.
//    We intentionally exclude ternary `: "..."` to avoid flagging tech strings
//    like `dir === "ltr" ? "ltr" : "rtl"`.  ?? is a stronger signal.
export const NULLISH_FALLBACK_RE = /\?\?\s*"([^"\n]{4,})"/g;

// E: document.title string literal assignment — imperative page-title updates
//    that bypass the JSX tree.  Only fires on a string literal (not a variable).
//    Catches both single and double-quoted values.
export const DOC_TITLE_RE = /\bdocument\.title\s*=\s*["']([^"'\n]{4,})["']/g;

// F: <meta> title content attribute.  We look for the title-related name
//    first on the same line, then extract the content value.  Supports both
//    attribute orderings (name before content or content before name).
//    Names matched: "title", "og:title", "twitter:title".
export const META_TITLE_NAME_RE = /\bname=["'](?:og:title|twitter:title|title)["']/;
export const META_TITLE_CONTENT_RE = /\bcontent=["']([^"'\n]{4,})["']/g;

// G: Logical-OR fallback strings — `|| "text"` or `|| 'text'`.
//    Complements Pattern D (nullish-coalescing).  In .mjs SEO helpers these
//    appear as image-alt or default-title fallback values.  Same two-word-token
//    requirement as Pattern D; CSS-like strings (hyphens/colons) are skipped.
const LOGICAL_OR_FALLBACK_RE = /\|\|\s*["']([^"'\n]{4,})["']/g;

// Regex that detects the opening line of any locale-keyed constant whose body
// should be skipped entirely (all language variants are already present).
// Covers COPY blocks in TSX and the named dicts in seo-inject.mjs.
const LOCALISED_DICT_RE =
  /\bconst (?:COPY|TITLES|DESCRIPTIONS|COUNTRY_NAMES|CITY_NAMES|BRANDS_FILTER_TITLES|BRANDS_FILTER_DESCRIPTIONS|OG_LOCALE|WISHLIST_SEO)\b[^=]*=\s*\{/;

// ── main ────────────────────────────────────────────────────────────────────────
// Guard lets unit tests import the exported helpers without triggering I/O
// or process.exit().  Vitest sets process.env.VITEST; the guard checks for it.

if (!process.env.VITEST) {

// TSX/TS source files under all scan roots + .mjs files in the web artifact root.
const files = [
  ...SCAN_ROOTS.flatMap(({ root, skipDirs }) => collectFiles(root, skipDirs)),
  ...collectMjsFiles(WEB_ARTIFACT_ROOT),
];
const hits: Hit[] = [];

for (const filePath of files) {
  const src = fs.readFileSync(filePath, "utf8");
  const lines = src.split("\n");
  const rel = path.relative(REPO_ROOT, filePath);

  // State
  let insideCopyBlock = false;
  let copyBraceDepth = 0;
  let insideBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const raw = lines[i];

    // ── block-comment tracking ──────────────────────────────────────────────
    if (insideBlockComment) {
      if (raw.includes("*/")) insideBlockComment = false;
      continue;
    }
    if (raw.includes("/*") && !raw.includes("*/")) {
      insideBlockComment = true;
      continue;
    }

    // ── COPY / localised-dict block tracking ────────────────────────────────
    // Skip the entire body of any known locale-keyed constant so its
    // translated strings are not re-flagged (see LOCALISED_DICT_RE above).
    if (!insideCopyBlock && LOCALISED_DICT_RE.test(raw)) {
      insideCopyBlock = true;
      copyBraceDepth = 0;
    }
    if (insideCopyBlock) {
      for (const ch of raw) {
        if (ch === "{") copyBraceDepth++;
        else if (ch === "}") {
          copyBraceDepth--;
          if (copyBraceDepth === 0) {
            insideCopyBlock = false;
            break;
          }
        }
      }
      continue;
    }

    if (shouldSkipLine(raw)) continue;

    // ── i18n-ignore suppression ──────────────────────────────────────────────
    // A trailing  // i18n-ignore  comment on any line opts that line out of all
    // checks.  Use it for intentionally-untranslated strings such as brand
    // names, developer-only labels, or accessibility strings that are shared
    // across all supported languages.
    if (/\/\/\s*i18n-ignore\b/.test(raw)) continue;

    // ── Pattern A: Inline JSX text node ─────────────────────────────────────
    INLINE_JSX_TEXT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = INLINE_JSX_TEXT_RE.exec(raw)) !== null) {
      const inner = m[1];
      // Skip if the whole content is a single {expression}
      if (/^\s*\{[^{}]*\}\s*$/.test(inner)) continue;
      // Skip if there is no Latin letter AND no Arabic script AND no French accents (icon-only, numeric, etc.)
      if (!/[a-zA-Z]/.test(inner) && !containsArabicScript(inner) && !containsFrenchAccents(inner)) continue;
      // Skip HTML entity strings (e.g. "&ldquo; &rdquo;") — not prose
      if (/^\s*&[a-z]+;/.test(inner)) continue;
      const text = stripExpressionsAndTrim(inner);
      if (looksLikeEnglishProse(text) || containsArabicScript(text) || containsFrenchAccents(text)) {
        // De-duplicate: skip if we already recorded this exact line/text pair
        if (!hits.some((h) => h.file === rel && h.line === lineNum && h.text === text)) {
          hits.push({ file: rel, line: lineNum, kind: "jsx-text", text });
        }
      }
    }

    // ── Pattern B: Standalone text line ─────────────────────────────────────
    // Only check if pattern A didn't already match this line (avoid double-reporting
    // a line like "  <p>Loading…</p>" which would have two matches).
    const alreadyHitThisLine = hits.some((h) => h.file === rel && h.line === lineNum);
    if (!alreadyHitThisLine) {
      const sm = STANDALONE_TEXT_RE.exec(raw);
      if (sm) {
        const text = sm[1].trim();
        // Reject code keywords (return, throw, const, etc.)
        if (!CODE_KEYWORDS_RE.test(text)) {
          // Require at least 2 English word tokens to exclude single identifiers
          // (e.g. "Switch", "country", "replace") that slip through the regex.
          const wordTokens = text.match(/\b[a-zA-Z]{2,}\b/g) ?? [];
          if (wordTokens.length >= 2) {
            hits.push({ file: rel, line: lineNum, kind: "standalone-text", text });
          }
        }
      }

      // B (Arabic): Standalone Arabic text — catches indented lines whose content
      // is Arabic script (not caught by STANDALONE_TEXT_RE which requires [a-zA-Z]).
      if (!hits.some((h) => h.file === rel && h.line === lineNum)) {
        const am = STANDALONE_ARABIC_TEXT_RE.exec(raw);
        if (am) {
          const text = am[1].trim();
          if (containsArabicScript(text)) {
            hits.push({ file: rel, line: lineNum, kind: "standalone-text", text });
          }
        }
      }
    }

    // ── Pattern C: User-visible JSX prop strings ─────────────────────────────
    VISIBLE_PROP_RE.lastIndex = 0;
    while ((m = VISIBLE_PROP_RE.exec(raw)) !== null) {
      const attr = m[1];
      const text = m[2].trim();
      if (!looksLikeEnglishProse(text) && !containsArabicScript(text) && !containsFrenchAccents(text)) continue;
      if (!hits.some((h) => h.file === rel && h.line === lineNum && h.text === text)) {
        hits.push({ file: rel, line: lineNum, kind: "jsx-prop", attr, text });
      }
    }

    // ── Pattern D: Nullish-coalescing fallback strings ───────────────────────
    NULLISH_FALLBACK_RE.lastIndex = 0;
    while ((m = NULLISH_FALLBACK_RE.exec(raw)) !== null) {
      const text = m[1].trim();
      // Skip CSS-like strings (contain hyphens or colons — utility class tokens)
      if (/[-:]/.test(text)) continue;
      const isArabic = containsArabicScript(text);
      const hasFrenchAccents = containsFrenchAccents(text);
      // Require 2+ word tokens for plain-Latin text: single-word ?? fallbacks are
      // almost always technical defaults ("carousel", "Banner", "Beirut"), not
      // user-visible prose.  Arabic and French-accented text pass without the
      // Latin word-count check because accented chars break token boundaries.
      const wordTokens = text.match(/\b[a-zA-Z]{2,}\b/g) ?? [];
      if (!isArabic && !hasFrenchAccents && wordTokens.length < 2) continue;
      if (!hits.some((h) => h.file === rel && h.line === lineNum && h.text === text)) {
        hits.push({ file: rel, line: lineNum, kind: "fallback-string", text });
      }
    }

    // ── Pattern E: document.title string literal assignment ──────────────────
    // Catches imperative page-title updates that bypass the JSX tree, e.g.:
    //   document.title = "Shop Flowers & Gifts";
    // Variable assignments (document.title = title) are not flagged because
    // they contain no string literal.
    DOC_TITLE_RE.lastIndex = 0;
    while ((m = DOC_TITLE_RE.exec(raw)) !== null) {
      const text = m[1].trim();
      if (!looksLikeEnglishProse(text) && !containsArabicScript(text) && !containsFrenchAccents(text)) continue;
      if (!hits.some((h) => h.file === rel && h.line === lineNum && h.text === text)) {
        hits.push({ file: rel, line: lineNum, kind: "doc-title", text });
      }
    }

    // ── Pattern F: <meta> title content attribute ────────────────────────────
    // Flags `content="prose text"` only on lines that also carry
    // name="title", name="og:title", or name="twitter:title", preventing
    // false positives on unrelated <meta> content attributes.
    if (META_TITLE_NAME_RE.test(raw)) {
      META_TITLE_CONTENT_RE.lastIndex = 0;
      while ((m = META_TITLE_CONTENT_RE.exec(raw)) !== null) {
        const text = m[1].trim();
        // Skip URLs — og:image etc. sometimes sit adjacent to og:title on the same line
        if (/^https?:\/\//.test(text)) continue;
        if (!looksLikeEnglishProse(text) && !containsArabicScript(text) && !containsFrenchAccents(text)) continue;
        if (!hits.some((h) => h.file === rel && h.line === lineNum && h.text === text)) {
          hits.push({ file: rel, line: lineNum, kind: "meta-title", text });
        }
      }
    }

    // ── Pattern G: Logical-OR fallback strings ───────────────────────────────
    // Catches `|| "text"` / `|| 'text'` fallback values that bypass t() or a
    // localised dict.  Complements Pattern D (?? operator).  Same requirements:
    // skip CSS-like strings and require 2+ word tokens.
    LOGICAL_OR_FALLBACK_RE.lastIndex = 0;
    while ((m = LOGICAL_OR_FALLBACK_RE.exec(raw)) !== null) {
      const text = m[1].trim();
      // Skip CSS-like strings (contain hyphens or colons)
      if (/[-:]/.test(text)) continue;
      const isArabic = containsArabicScript(text);
      const hasFrenchAccents = containsFrenchAccents(text);
      // Require 2+ word tokens for plain-Latin text; Arabic and French-accented
      // text pass without the check (accents break token boundaries).
      const wordTokens = text.match(/\b[a-zA-Z]{2,}\b/g) ?? [];
      if (!isArabic && !hasFrenchAccents && wordTokens.length < 2) continue;
      if (!hits.some((h) => h.file === rel && h.line === lineNum && h.text === text)) {
        hits.push({ file: rel, line: lineNum, kind: "fallback-string", text });
      }
    }
  }
}

// ── report ─────────────────────────────────────────────────────────────────────

// Group hits by file
const byFile = new Map<string, Hit[]>();
for (const h of hits) {
  if (!byFile.has(h.file)) byFile.set(h.file, []);
  byFile.get(h.file)!.push(h);
}

// ── JSON output (when HARDCODED_STRINGS_JSON_OUT is set) ────────────────────────

const jsonOutPath = process.env["HARDCODED_STRINGS_JSON_OUT"];
if (jsonOutPath) {
  const result = {
    passed: hits.length === 0,
    hitCount: hits.length,
    fileCount: byFile.size,
    byFile: Array.from(byFile.entries()).map(([file, fileHits]) => ({
      file,
      hits: fileHits.map((h) => ({
        line: h.line,
        kind: h.kind,
        ...(h.attr !== undefined ? { attr: h.attr } : {}),
        text: h.text,
      })),
    })),
  };
  fs.writeFileSync(jsonOutPath, JSON.stringify(result, null, 2), "utf8");
}

// ── console output ──────────────────────────────────────────────────────────────

if (hits.length === 0) {
  console.log(
    "✓ No hardcoded English, Arabic, or French strings detected in web TSX/MJS files.\n" +
    "  All user-visible text appears to use t() or a localised COPY/dict constant.",
  );
  process.exit(0);
}

console.error(
  `\n✗ Found ${hits.length} likely-hardcoded string${hits.length === 1 ? "" : "s"} ` +
  `in ${byFile.size} web source file${byFile.size === 1 ? "" : "s"} (TSX + MJS):\n`,
);

for (const [file, fileHits] of byFile) {
  console.error(`  ${file}`);
  for (const h of fileHits) {
    const kindLabel =
      h.kind === "jsx-text"
        ? "[JSX text]      "
        : h.kind === "jsx-prop"
          ? `[prop: ${h.attr?.padEnd(14)}]`
          : h.kind === "fallback-string"
            ? "[?? fallback]   "
            : h.kind === "doc-title"
              ? "[document.title]"
              : h.kind === "meta-title"
                ? "[meta title]    "
                : "[standalone]    ";
    console.error(`    line ${String(h.line).padStart(4)}  ${kindLabel}  "${h.text}"`);
  }
  console.error("");
}

console.error(
  "To fix: wrap each string in a t() call (add the key to src/locales/)\n" +
  "or include the text in a  const COPY: Record<Language, Copy> = { en, ar, fr }  object.\n" +
  "\n" +
  "False positives (brand names, intentionally-untranslated labels, etc.) can be\n" +
  "suppressed by adding a  // i18n-ignore  comment on the same line.\n",
);

process.exit(1);

} // end if (!process.env.VITEST)
