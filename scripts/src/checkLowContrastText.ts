/**
 * checkLowContrastText
 *
 * Scans web source files for Tailwind opacity-modifier patterns that are
 * known to push text contrast below WCAG AA thresholds on the project's
 * default white background.
 *
 * WCAG AA requires:
 *   - Normal text (<18 pt / <14 pt bold):  contrast ≥ 4.5:1
 *   - Large text  (≥18 pt / ≥14 pt bold):  contrast ≥ 3.0:1
 *   - Non-text UI components:              contrast ≥ 3.0:1  (SC 1.4.11)
 *
 * Contrast values for the project's design tokens on white (#fff):
 *   muted-foreground  hsl(213 8% 40%)  → 5.89:1  ✓ full
 *   muted-foreground/70               → 3.08:1  ✗ fails normal text
 *   muted-foreground/60               → 2.40:1  ✗ fails both
 *   foreground        hsl(20 19% 13%) → 15.9:1  ✓ full
 *   foreground/80                     → 7.29:1  ✓
 *   foreground/60                     → 3.94:1  ✗ fails normal text
 *   foreground/50                     → 3.00:1  ✗ fails normal text
 *   foreground/40                     → 2.29:1  ✗ fails both
 *
 * Banned patterns (any opacity ≤ 70 on muted-foreground; ≤ 60 on foreground):
 *   text-muted-foreground/<N>  where N is any number (all fail at ≤70)
 *   text-foreground/<N>        where N ≤ 60
 *
 * Escape hatch:
 *   Add a trailing `// contrast-ok: <reason>` comment on the same source
 *   line to suppress the check for that line. Only use this annotation for:
 *     - Disabled / inactive UI components (WCAG 1.4.3 exception)
 *     - Purely decorative elements (icons, illustrations, loading skeletons)
 *     - Hover / focus states where the resting state is intentionally subtle
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run check-low-contrast-text
 *
 * Exit code 0 — no violations found.
 * Exit code 1 — at least one violation, or script error.
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../");

const SCAN_ROOT = path.join(REPO_ROOT, "artifacts/presentail-web/src");

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  ".turbo",
  "__snapshots__",
]);

const SCAN_EXTENSIONS = new Set([".tsx", ".ts", ".jsx", ".js"]);

const ESCAPE_HATCH = "contrast-ok";

/**
 * Patterns that constitute a low-contrast violation.
 * Each entry describes one banned class family and a predicate that
 * determines whether a specific opacity value is problematic.
 */
const BANNED_PATTERNS: Array<{
  label: string;
  regex: RegExp;
  isBanned: (opacity: number) => boolean;
}> = [
  {
    label: "text-muted-foreground/<N>",
    // Matches text-muted-foreground/10 through text-muted-foreground/100
    regex: /text-muted-foreground\/(\d+)/g,
    // All opacity variants of muted-foreground fail WCAG AA normal text;
    // even /70 → 3.08:1 which fails 4.5:1.  Flag every opacity modifier.
    isBanned: (_opacity: number) => true,
  },
  {
    label: "text-foreground/<N> (N ≤ 60)",
    // Matches text-foreground/10 through text-foreground/60
    regex: /text-foreground\/(\d+)/g,
    // foreground/60 → 3.94:1 (fails normal text), /70 → ~4.6:1 (borderline ok)
    isBanned: (opacity: number) => opacity <= 60,
  },
];

interface Violation {
  file: string;
  line: number;
  col: number;
  match: string;
  source: string;
}

function collectFiles(dir: string, results: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        collectFiles(path.join(dir, entry.name), results);
      }
    } else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(path.join(dir, entry.name));
    }
  }
}

function checkFile(filePath: string): Violation[] {
  const violations: Violation[] = [];
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    // Escape hatch: suppress if the pattern "contrast-ok" appears on this line
    // OR on the immediately preceding non-empty source line (mirrors the
    // eslint-disable-next-line convention — useful for JSX where you cannot
    // attach a trailing comment to an opening tag).
    if (line.includes(ESCAPE_HATCH)) {
      continue;
    }
    // Also check the immediately preceding non-empty line — handles JSX {/* contrast-ok */} and
    // block /* contrast-ok */ comments where a trailing // annotation isn't syntactically possible.
    const prevLine = lineIdx > 0 ? lines[lineIdx - 1] : "";
    if (prevLine.includes(ESCAPE_HATCH)) {
      continue;
    }

    for (const { regex, isBanned } of BANNED_PATTERNS) {
      regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(line)) !== null) {
        const opacity = parseInt(m[1], 10);
        if (isBanned(opacity)) {
          violations.push({
            file: filePath,
            line: lineIdx + 1,
            col: m.index + 1,
            match: m[0],
            source: line.trim(),
          });
        }
      }
    }
  }

  return violations;
}

function run(): void {
  const files: string[] = [];
  collectFiles(SCAN_ROOT, files);

  const allViolations: Violation[] = [];
  for (const f of files) {
    allViolations.push(...checkFile(f));
  }

  if (allViolations.length === 0) {
    console.log("✓ check-low-contrast-text: no violations found.");
    process.exit(0);
  }

  console.error(
    `✗ check-low-contrast-text: ${allViolations.length} violation(s) found.\n`,
  );
  console.error(
    "These Tailwind opacity-modifier patterns push text contrast below WCAG AA.",
  );
  console.error(
    "Fix by removing the opacity modifier, or annotate with // contrast-ok: <reason>",
  );
  console.error(
    "if the element is disabled/inactive, decorative, or a hover-only state.\n",
  );

  const byFile = new Map<string, Violation[]>();
  for (const v of allViolations) {
    const rel = path.relative(REPO_ROOT, v.file);
    const list = byFile.get(rel) ?? [];
    list.push(v);
    byFile.set(rel, list);
  }

  for (const [rel, vs] of byFile) {
    console.error(`  ${rel}`);
    for (const v of vs) {
      console.error(`    line ${v.line}:${v.col}  ${v.match}`);
      console.error(`      ${v.source}`);
    }
    console.error("");
  }

  process.exit(1);
}

run();
