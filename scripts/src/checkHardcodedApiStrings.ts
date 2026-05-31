/**
 * checkHardcodedApiStrings
 *
 * Scans all TS source files under artifacts/api-server/src/ and reports
 * string literals that appear to be hardcoded English prose in user-visible
 * positions — error messages returned in API JSON responses, push notification
 * bodies/titles, and SMS copy — regardless of the requesting user's language.
 *
 * Detection covers three patterns appropriate for plain TypeScript (no JSX):
 *
 *   A. Object-property string literals — plain string literals assigned to
 *      known user-visible keys in object literals:
 *        message, body, title, subtitle
 *      These cover `res.json({ message: "…" })` API error payloads,
 *      `{ title: "…", body: "…" }` push notification payloads, and
 *      `sendSms({ body: "…" })` SMS copy.
 *
 *   B. Nullish-coalescing fallback strings — `?? "text"` patterns that
 *      propagate a hardcoded English default when the dynamic value is nullish.
 *      Requires ≥ 2 word-tokens to reduce technical-default false positives.
 *
 *   C. Logical-OR fallback strings — `|| "text"` patterns.  Complements
 *      Pattern B.  Same word-token requirement.
 *
 * Exclusions (files / blocks / lines that are NOT flagged):
 *   • Test files (*.test.ts, *.spec.ts)
 *   • Declaration files (*.d.ts)
 *   • Skip dirs: node_modules, dist, .turbo, __generated__
 *   • Internal Slack-alerting files (*Monitor.ts, clerkUserSync.ts,
 *     clerkCatchupSync.ts, osProductsCache.ts, wooSync.ts) — those strings
 *     are ops tooling, not end-user-facing copy.
 *   • Comment lines (// …) and block-comment lines (/* … *\/)
 *   • Import / export / type / interface declaration lines.
 *   • Lines containing req.log / logger / console calls (server-side logging,
 *     not user-visible output).
 *   • Strings that do not look like English prose (pure numbers, URLs, emails,
 *     fewer than 2 word-tokens of 2+ letters, or a single word shorter than
 *     5 letters).
 *   • Lines with a trailing  // i18n-ignore  or  /* i18n-ignore *\/  comment.
 *
 * Exit code 0 — nothing found.
 * Exit code 1 — at least one likely-hardcoded string detected, or the script
 *               errored.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run check-hardcoded-api-strings
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../");

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".turbo",
  "__generated__",
]);

// File suffixes to skip — these files contain exclusively internal ops strings
// (Slack alert payloads, monitoring dashboards) that are never shown to end-users.
const SKIP_FILE_SUFFIX_PATTERNS: RegExp[] = [
  /Monitor\.ts$/,          // *Monitor.ts — all Slack alert monitors
  /clerkUserSync\.ts$/,    // internal Clerk sync Slack alerts
  /clerkCatchupSync\.ts$/, // internal Clerk catch-up sync
  /osProductsCache\.ts$/,  // internal price-change Slack alerts
  /wooSync\.ts$/,          // internal WC sync banner strings
];

// ── types ──────────────────────────────────────────────────────────────────────

type HitKind = "msg-prop" | "fallback-string";

interface Hit {
  file: string;    // repo-relative path
  line: number;    // 1-indexed
  kind: HitKind;
  attr?: string;   // for msg-prop: which property key
  text: string;    // the extracted string value
}

// ── helpers ────────────────────────────────────────────────────────────────────

export function collectFiles(dir: string, results: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectFiles(path.join(dir, entry.name), results);
    } else if (
      /\.ts$/.test(entry.name) &&
      !/\.test\.ts$/.test(entry.name) &&
      !/\.spec\.ts$/.test(entry.name) &&
      !/\.d\.ts$/.test(entry.name)
    ) {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

/**
 * Returns true when text looks like user-visible English prose.
 *
 * Passes when:
 *   - Contains at least one Latin letter.
 *   - Is not a URL or email address.
 *   - Has 2+ word-tokens (2+ consecutive letters each), OR a single word of
 *     5+ letters (to catch "Loading", "Deleted", "Failed", etc.).
 */
export function looksLikeEnglishProse(raw: string): boolean {
  const s = raw.replace(/\s+/g, " ").trim();
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
  if (t.startsWith("//")) return true;           // single-line comment
  if (t.startsWith("*")) return true;            // JSDoc / block-comment line
  if (t.startsWith("/*")) return true;           // block-comment open
  if (/^import\s/.test(t)) return true;          // import statement
  if (/^export\s+(type|interface)\s/.test(t)) return true;
  if (/^(type|interface)\s+[A-Z]/.test(t)) return true;
  // Server-side logging — never shown to end users
  if (/\breq\.log\.(info|warn|error|debug|trace|child)\b/.test(t)) return true;
  if (/\blogger\.(info|warn|error|debug|trace|child)\b/.test(t)) return true;
  if (/\bconsole\.(log|warn|error|info|debug)\b/.test(t)) return true;
  return false;
}

// ── regex patterns ─────────────────────────────────────────────────────────────

// A: Object-property string literals — `key: "value"` or `key: 'value'`
//    for the known user-visible property names used in API responses and push
//    notification / SMS payloads.  Matches both double and single quotes.
export const MSG_PROP_RE =
  /\b(message|body|title|subtitle)\s*:\s*["']([^"'\n]{2,})["']/g;

// B: Nullish-coalescing fallback — `?? "text"` / `?? 'text'`
export const NULLISH_FALLBACK_RE = /\?\?\s*["']([^"'\n]{4,})["']/g;

// C: Logical-OR fallback — `|| "text"` / `|| 'text'`
export const LOGICAL_OR_FALLBACK_RE = /\|\|\s*["']([^"'\n]{4,})["']/g;

// ── main ────────────────────────────────────────────────────────────────────────
// Guard lets unit tests import the exported helpers without triggering I/O
// or process.exit().  Vitest sets process.env.VITEST; the guard checks for it.

if (!process.env.VITEST) {

const API_SRC = path.join(REPO_ROOT, "artifacts/api-server/src");

const allFiles = collectFiles(API_SRC);
const files = allFiles.filter((f) => {
  return !SKIP_FILE_SUFFIX_PATTERNS.some((re) => re.test(f));
});

const hits: Hit[] = [];

for (const filePath of files) {
  const src = fs.readFileSync(filePath, "utf8");
  const lines = src.split("\n");
  const rel = path.relative(REPO_ROOT, filePath);

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

    if (shouldSkipLine(raw)) continue;

    // ── i18n-ignore suppression ──────────────────────────────────────────────
    if (/\/\/\s*i18n-ignore\b|\/\*\s*i18n-ignore\b/.test(raw)) continue;

    // ── Pattern A: Object-property string literals ──────────────────────────
    MSG_PROP_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MSG_PROP_RE.exec(raw)) !== null) {
      const attr = m[1];
      const text = m[2].trim();
      // Skip template strings referenced via variables (no user-visible literal)
      if (!looksLikeEnglishProse(text)) continue;
      // Skip CSS-like strings and technical identifiers (hyphens, colons, slashes)
      if (/[:\\/]/.test(text)) continue;
      if (!hits.some((h) => h.file === rel && h.line === lineNum && h.text === text)) {
        hits.push({ file: rel, line: lineNum, kind: "msg-prop", attr, text });
      }
    }

    // ── Pattern B: Nullish-coalescing fallback strings ──────────────────────
    NULLISH_FALLBACK_RE.lastIndex = 0;
    while ((m = NULLISH_FALLBACK_RE.exec(raw)) !== null) {
      const text = m[1].trim();
      // Skip CSS-like or path-like strings
      if (/[-:/]/.test(text)) continue;
      // Skip bare domain names (e.g. "presentail.com")
      if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(text)) continue;
      const wordTokens = text.match(/\b[a-zA-Z]{2,}\b/g) ?? [];
      if (wordTokens.length < 2) continue;
      if (!hits.some((h) => h.file === rel && h.line === lineNum && h.text === text)) {
        hits.push({ file: rel, line: lineNum, kind: "fallback-string", text });
      }
    }

    // ── Pattern C: Logical-OR fallback strings ──────────────────────────────
    LOGICAL_OR_FALLBACK_RE.lastIndex = 0;
    while ((m = LOGICAL_OR_FALLBACK_RE.exec(raw)) !== null) {
      const text = m[1].trim();
      if (/[-:/]/.test(text)) continue;
      // Skip bare domain names (e.g. "presentail.com")
      if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(text)) continue;
      const wordTokens = text.match(/\b[a-zA-Z]{2,}\b/g) ?? [];
      if (wordTokens.length < 2) continue;
      if (!hits.some((h) => h.file === rel && h.line === lineNum && h.text === text)) {
        hits.push({ file: rel, line: lineNum, kind: "fallback-string", text });
      }
    }
  }
}

// ── report ─────────────────────────────────────────────────────────────────────

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
    "✓ No hardcoded English strings detected in API server TS files.\n" +
    "  All user-visible text appears to use dynamic values or i18n-ignore annotations.",
  );
  process.exit(0);
}

console.error(
  `\n✗ Found ${hits.length} likely-hardcoded English string${hits.length === 1 ? "" : "s"} ` +
  `in ${byFile.size} API server source file${byFile.size === 1 ? "" : "s"}:\n`,
);

for (const [file, fileHits] of byFile) {
  console.error(`  ${file}`);
  for (const h of fileHits) {
    const kindLabel =
      h.kind === "msg-prop"
        ? `[prop: ${(h.attr ?? "").padEnd(8)}]`
        : "[?? fallback]   ";
    console.error(`    line ${String(h.line).padStart(4)}  ${kindLabel}  "${h.text}"`);
  }
  console.error("");
}

console.error(
  "To fix:\n" +
  "  • For push notification strings (title, body): move copy to a locale-aware\n" +
  "    helper or constant so the message language matches the recipient's device locale.\n" +
  "  • For API error messages (message): ensure the response body carries a machine-\n" +
  "    readable `code` field that clients translate, rather than a hardcoded string.\n" +
  "  • For SMS copy (body): use a per-language template keyed on the customer locale.\n" +
  "\n" +
  "False positives (brand names, intentionally-untranslated labels, internal-only\n" +
  "strings, etc.) can be suppressed by adding a  // i18n-ignore  comment on the\n" +
  "same line.\n",
);

process.exit(1);

} // end if (!process.env.VITEST)
