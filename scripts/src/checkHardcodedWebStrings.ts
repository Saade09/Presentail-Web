/**
 * checkHardcodedWebStrings
 *
 * Scans all TSX source files under artifacts/presentail-web/src/ and reports
 * JSX text that appears to be hardcoded English prose — user-visible strings
 * that should be going through the t() translation function or a properly
 * localised COPY constant instead.
 *
 * Detection covers six patterns:
 *   A. Inline JSX text nodes  — text between ">…</"  on the same line, after
 *      stripping {JS expressions}.  This naturally covers <title>…</title>
 *      JSX elements used in Helmet-style components.
 *   B. Standalone text lines  — an indented line whose content is only prose
 *      characters (no JSX/code symbols), indicating a multi-line JSX text node.
 *   C. User-visible JSX prop strings — plain string literals on known props:
 *      placeholder, aria-label, title, alt, heading, label, description,
 *      subtitle, emptyText, noResultsText, emptyLabel.
 *   D. Nullish-coalescing / ternary fallback strings — `?? "text"` patterns
 *      that end up rendering in JSX.
 *   E. document.title string literal assignments — `document.title = "text"`
 *      imperative page-title updates that bypass the JSX tree (navigation
 *      equivalent of Expo Router's `options={{ title: "…" }}`).
 *   F. <meta> title content attributes — `content="text"` on any line that
 *      also carries  name="title", name="og:title", or name="twitter:title".
 *      Flags only when the content looks like English prose so og:image URLs
 *      and short technical strings are not reported.
 *
 * Exclusions (files / blocks / lines that are NOT flagged):
 *   • Test files  (*.test.tsx, *.test.ts)
 *   • The src/locales/ directory (translation source files)
 *   • The src/components/ui/ directory (shadcn boilerplate)
 *   • Blocks enclosed in  const COPY: Record<Language, …> = { … }  — these
 *     pages are already properly localised via the COPY pattern.
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
const SCAN_ROOT = path.join(REPO_ROOT, "artifacts/presentail-web/src");

const SKIP_DIRS = new Set([
  "node_modules",
  ".expo",
  "dist",
  ".turbo",
  "__generated__",
  "locales", // translation source — scanning these would always flag false positives
  "ui",      // shadcn boilerplate — no user-authored strings
]);

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

function collectFiles(dir: string, results: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectFiles(path.join(dir, entry.name), results);
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
 * Strip single-level JSX expression placeholders ({…}) from a string and
 * collapse runs of whitespace.  Handles nested braces one level deep.
 */
function stripExpressionsAndTrim(text: string): string {
  return text
    .replace(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)?\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
function looksLikeEnglishProse(raw: string): boolean {
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
function shouldSkipLine(line: string): boolean {
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
const INLINE_JSX_TEXT_RE = />([^<\n]+)<\//g;

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
const STANDALONE_TEXT_RE =
  /^[ \t]{2,}([a-zA-Z][a-zA-Z0-9 !\u2019\u2013\u2014\u2026']{3,}[a-zA-Z0-9\u2026!.])$/;

// Code keywords that must not be treated as standalone JSX text.
const CODE_KEYWORDS_RE =
  /^(return|throw|const|let|var|if|else|switch|case|import|export|async|await|try|catch|finally|new|delete|typeof|void|yield|function|class|extends|implements|interface|type|enum)\b/;

// C: User-visible JSX prop string literals.
const VISIBLE_PROP_RE =
  /\b(placeholder|aria-label|title|alt|heading|label|description|subtitle|noResultsText|emptyText|emptyLabel)\s*=\s*["']([^"'\n]{2,})["']/g;

// D: Nullish-coalescing fallback strings that end up rendered in JSX.
//    We intentionally exclude ternary `: "..."` to avoid flagging tech strings
//    like `dir === "ltr" ? "ltr" : "rtl"`.  ?? is a stronger signal.
const NULLISH_FALLBACK_RE = /\?\?\s*"([^"\n]{4,})"/g;

// E: document.title string literal assignment — imperative page-title updates
//    that bypass the JSX tree.  Only fires on a string literal (not a variable).
//    Catches both single and double-quoted values.
const DOC_TITLE_RE = /\bdocument\.title\s*=\s*["']([^"'\n]{4,})["']/g;

// F: <meta> title content attribute.  We look for the title-related name
//    first on the same line, then extract the content value.  Supports both
//    attribute orderings (name before content or content before name).
//    Names matched: "title", "og:title", "twitter:title".
const META_TITLE_NAME_RE = /\bname=["'](?:og:title|twitter:title|title)["']/;
const META_TITLE_CONTENT_RE = /\bcontent=["']([^"'\n]{4,})["']/g;

// ── main ────────────────────────────────────────────────────────────────────────

const files = collectFiles(SCAN_ROOT);
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

    // ── COPY block tracking ─────────────────────────────────────────────────
    // Detect the opening of a localised COPY constant, e.g.:
    //   const COPY: Record<Language, Copy> = {
    // The entire block (including the final `};`) is skipped — its strings are
    // already translated.
    if (!insideCopyBlock && /\bconst COPY\b[^=]*=\s*\{/.test(raw)) {
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
      // Skip if there is no Latin letter at all (icon-only, numeric, etc.)
      if (!/[a-zA-Z]/.test(inner)) continue;
      // Skip HTML entity strings (e.g. "&ldquo; &rdquo;") — not prose
      if (/^\s*&[a-z]+;/.test(inner)) continue;
      const text = stripExpressionsAndTrim(inner);
      if (looksLikeEnglishProse(text)) {
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
    }

    // ── Pattern C: User-visible JSX prop strings ─────────────────────────────
    VISIBLE_PROP_RE.lastIndex = 0;
    while ((m = VISIBLE_PROP_RE.exec(raw)) !== null) {
      const attr = m[1];
      const text = m[2].trim();
      if (!looksLikeEnglishProse(text)) continue;
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
      // Require 2+ word tokens: single-word ?? fallbacks are almost always
      // technical defaults ("carousel", "Banner", "Beirut"), not user-visible prose.
      const wordTokens = text.match(/\b[a-zA-Z]{2,}\b/g) ?? [];
      if (wordTokens.length < 2) continue;
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
      if (!looksLikeEnglishProse(text)) continue;
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
        if (!looksLikeEnglishProse(text)) continue;
        if (!hits.some((h) => h.file === rel && h.line === lineNum && h.text === text)) {
          hits.push({ file: rel, line: lineNum, kind: "meta-title", text });
        }
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
    "✓ No hardcoded English strings detected in web TSX files.\n" +
    "  All user-visible text appears to use t() or a localised COPY constant.",
  );
  process.exit(0);
}

console.error(
  `\n✗ Found ${hits.length} likely-hardcoded English string${hits.length === 1 ? "" : "s"} ` +
  `in ${byFile.size} web source file${byFile.size === 1 ? "" : "s"}:\n`,
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
