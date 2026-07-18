/**
 * check-image-alt — CI guard ensuring no <img> JSX element in the web app is
 * missing an accessible alt attribute.
 *
 * Rules:
 *  - An <img> JSX element with no `alt` attribute is always a violation.
 *  - An <img> JSX element with `alt=""` is a violation unless suppressed.
 *
 * Suppression (any one of the following):
 *  - `// image-alt-ok: <reason>` comment on the same source line as `<img` or `alt=`.
 *  - `aria-hidden="true"` inside the same img element block.
 *  - Spread props `{...someVar}` inside the element block (alt may come from the spread).
 *
 * False-positive guards:
 *  - `<img` inside JSDoc/comment lines (starting with `*` or `//`) is ignored.
 *  - `<img` inside string literals (preceded by an unmatched quote) is ignored.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run check-image-alt
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// scripts/src/ → workspace root → artifacts/presentail-web/src
const ROOT = resolve(__dirname, "../../artifacts/presentail-web/src");
const EXTENSIONS = new Set([".tsx", ".ts", ".jsx", ".js"]);
const IGNORE_DIRS = new Set(["node_modules", "dist", ".next", "build"]);

interface Violation {
  file: string;
  line: number;
  reason: string;
  snippet: string;
}

function walkFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (IGNORE_DIRS.has(name)) continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkFiles(full, acc);
    } else {
      const ext = name.slice(name.lastIndexOf("."));
      if (EXTENSIONS.has(ext)) acc.push(full);
    }
  }
  return acc;
}

/**
 * Return true if the `<img` occurrence at `imgIdx` on `line` is inside a
 * string literal or a comment and should therefore be skipped.
 */
function isInCommentOrString(line: string, imgIdx: number): boolean {
  const trimmed = line.trimStart();

  // JSDoc / block comment interior lines (start with * after whitespace).
  if (/^\s*\*/.test(line)) return true;

  // Single-line comment: // before <img
  const slashIdx = line.indexOf("//");
  if (slashIdx !== -1 && slashIdx < imgIdx) return true;

  // Inside a string literal: count unmatched quotes before imgIdx.
  // If an odd number of (single or double) quotes appear before <img,
  // we are inside a string and this is a documentation mention.
  const before = line.slice(0, imgIdx);
  const doubleQuotes = (before.match(/"/g) ?? []).length;
  const singleQuotes = (before.match(/(?<!\\)'/g) ?? []).length;
  if (doubleQuotes % 2 !== 0 || singleQuotes % 2 !== 0) return true;

  // JSX expression inside a JSX attribute value: {`...<img`}
  // Detect backtick template literal on the same line.
  const backticks = (before.match(/`/g) ?? []).length;
  if (backticks % 2 !== 0) return true;

  return false;
}

/**
 * Extract JSX <img ...> blocks from source text.
 * Returns { startLine (1-based), block } for each actual JSX element found.
 */
function extractImgBlocks(source: string): { startLine: number; block: string }[] {
  const results: { startLine: number; block: string }[] = [];
  const lines = source.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const imgIdx = line.indexOf("<img");

    if (imgIdx === -1) {
      i++;
      continue;
    }

    // Ensure it is `<img` followed by whitespace, / or > (JSX element, not e.g. <imgTag>).
    const charAfter = line[imgIdx + 4];
    if (charAfter && !/[\s/>]/.test(charAfter)) {
      i++;
      continue;
    }

    // Skip if inside a comment or string literal.
    if (isInCommentOrString(line, imgIdx)) {
      i++;
      continue;
    }

    // Collect the full element block (may span multiple lines) until we see />.
    let block = "";
    let j = i;
    while (j < lines.length) {
      block += (j > i ? "\n" : "") + lines[j];
      if (block.includes("/>")) break;
      // Safety: if we've consumed many lines without a close, stop.
      if (j - i > 20) break;
      j++;
    }

    results.push({ startLine: i + 1, block });
    i = j + 1;
  }

  return results;
}

function hasAltAttribute(block: string): boolean {
  // alt= as a JSX attribute (not inside a string).
  return /\balt\s*=/.test(block);
}

function hasEmptyAlt(block: string): boolean {
  return /\balt\s*=\s*["']\s*["']/.test(block) || /\balt\s*=\s*\{["']\s*["']\}/.test(block) || /\balt\s*=\s*\{""\}/.test(block);
}

function isSuppressed(block: string): boolean {
  // Explicit suppression annotation.
  if (/\/\/\s*image-alt-ok/i.test(block)) return true;
  // aria-hidden="true" makes the element invisible to assistive tech.
  if (/aria-hidden\s*=\s*["']true["']/.test(block)) return true;
  // Spread props: {... } may include alt; treat as suppressed (caller's responsibility).
  if (/\{\.\.\./.test(block)) return true;
  return false;
}

function checkFile(file: string): Violation[] {
  const source = readFileSync(file, "utf8");
  const blocks = extractImgBlocks(source);
  const violations: Violation[] = [];

  for (const { startLine, block } of blocks) {
    if (isSuppressed(block)) continue;

    if (!hasAltAttribute(block)) {
      violations.push({
        file,
        line: startLine,
        reason: "missing alt attribute",
        snippet: block.split("\n")[0].trim().slice(0, 80),
      });
    } else if (hasEmptyAlt(block)) {
      violations.push({
        file,
        line: startLine,
        reason: 'empty alt="" without aria-hidden="true" or // image-alt-ok annotation',
        snippet: block.split("\n")[0].trim().slice(0, 80),
      });
    }
  }

  return violations;
}

function main() {
  const files = walkFiles(ROOT);
  const allViolations: Violation[] = [];

  for (const file of files) {
    const violations = checkFile(file);
    allViolations.push(...violations);
  }

  if (allViolations.length === 0) {
    console.log(`✓ check-image-alt: no violations found in ${files.length} files.`);
    process.exit(0);
  }

  console.error(`\n✗ check-image-alt: ${allViolations.length} violation(s) found:\n`);
  for (const v of allViolations) {
    const rel = v.file.replace(process.cwd() + "/", "").replace(/^\/home\/runner\/workspace\//, "");
    console.error(`  ${rel}:${v.line} — ${v.reason}`);
    console.error(`    ${v.snippet}`);
    console.error();
  }
  console.error(
    "Fix: add a descriptive alt attribute, or suppress with:\n" +
      '  - aria-hidden="true"  (purely decorative, no information conveyed)\n' +
      "  - // image-alt-ok: <reason>  (on the same line as the alt= or <img)\n" +
      "  - {... spread props}  (alt provided via spread is auto-suppressed)\n",
  );
  process.exit(1);
}

main();
