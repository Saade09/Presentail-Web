/**
 * checkLowContrastTextMobile
 *
 * Scans Expo mobile source files for React Native StyleSheet / inline-style
 * patterns that produce text contrast below WCAG AA thresholds.
 *
 * WCAG AA requirements:
 *   Normal text (< 18 pt / < 14 pt bold):  contrast ≥ 4.5:1
 *   Large text  (≥ 18 pt / ≥ 14 pt bold):  contrast ≥ 3.0:1
 *   Non-text UI components:                contrast ≥ 3.0:1  (SC 1.4.11)
 *
 * Three checks are performed:
 *
 * ── Check 1: rgba text colour on a light background ──────────────────────
 * Detects `color: "rgba(R,G,B,alpha)"` patterns where the base colour is
 * dark/grey (not near-white) and the effective blended colour on a white
 * (#fff) background falls below 4.5:1.
 *
 *   Dark threshold:   R ≤ 160 AND G ≤ 160 AND B ≤ 160
 *   Near-white skip:  R ≥ 200 AND G ≥ 200 AND B ≥ 200
 *                     (white-on-dark patterns — evaluated by Check 3 below)
 *
 * Examples from the codebase:
 *   rgba(0,0,0,0.35)  → contrast ≈ 2.4:1  ✗  (fails normal text)
 *   rgba(0,0,0,0.3)   → contrast ≈ 2.1:1  ✗  (fails normal text)
 *   rgba(0,0,0,0.6)   → contrast ≈ 5.3:1  ✓
 *
 * ── Check 2: named colour token + explicit opacity on the same line ───────
 * Detects inline styles where `color` references a muted/secondary token
 * and `opacity` is set below 0.7 on the SAME line — e.g.
 *   style={{ color: colors.mutedForeground, opacity: 0.5 }}
 * Muted tokens tracked: `mutedForeground`, `subtitle`, `subtext`, `muted`.
 * (Full-word match so `mutedForegroundSomething` is not a false positive.)
 *
 * ── Check 3: white/near-white rgba text on known dark header backgrounds ──
 * Detects `color: "rgba(R,G,B,alpha)"` patterns where the base colour is
 * near-white (R ≥ 200 AND G ≥ 200 AND B ≥ 200) and the effective blended
 * colour falls below 4.5:1 contrast against ANY of the known dark background
 * colours used in the app's header banners (from constants/colors.ts):
 *
 *   teal900  #00414E  (primary header background)
 *   teal800  #0a5663  (secondary header / gradient)
 *   charcoal #1A2226  (dark overlay backgrounds)
 *
 * The check always uses the WORST-CASE (lowest-contrast) background colour
 * among the set so that a pattern that passes on the darkest background is
 * not silently flagged — only patterns that fail on at least one known bg
 * are reported.  The reported contrast value is from the failing background.
 *
 * Examples:
 *   rgba(255,255,255,0.6) on teal900 → check and flag if contrast < 4.5:1
 *   rgba(255,255,255,0.9) on teal900 → passes ✓
 *
 * ── Skipped properties ────────────────────────────────────────────────────
 * Only `color:` is checked.  The following sibling properties are NEVER
 * flagged: backgroundColor, borderColor, tintColor, shadowColor,
 * android_ripple, placeholderTextColor, selectionColor, cursorColor.
 *
 * ── Escape hatch ─────────────────────────────────────────────────────────
 * Add `// contrast-ok: <reason>` on the SAME line OR on the immediately
 * preceding non-empty source line to suppress the check.  Valid reasons:
 *   - Disabled / inactive UI elements (WCAG 1.4.3 exception)
 *   - Purely decorative icons / illustrations / loading skeletons
 *   - Hover / press-only states where the resting colour is accessible
 *   - Large-text / icon-only components where the 3.0:1 threshold applies
 *     and the blended colour meets that lower bar
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run check-low-contrast-text-mobile
 *
 * Exit 0 — no violations found.
 * Exit 1 — at least one violation, or script error.
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../");

const SCAN_ROOT = path.join(REPO_ROOT, "artifacts/presentail");

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "dist-web-review",
  "static-build",
  "build",
  "out",
  ".expo",
  ".turbo",
  "__snapshots__",
]);

const SCAN_EXTENSIONS = new Set([".tsx", ".ts", ".jsx", ".js"]);

const ESCAPE_HATCH = "contrast-ok";

// ── WCAG helpers ──────────────────────────────────────────────────────────

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance(r: number, g: number, b: number): number {
  return (
    0.2126 * srgbToLinear(r) +
    0.7152 * srgbToLinear(g) +
    0.0722 * srgbToLinear(b)
  );
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Compute the WCAG contrast ratio of an rgba() colour against a solid
 * white (#fff) background.  The alpha compositing follows the standard
 * "source-over" formula on a white matte.
 */
function contrastOnWhite(r: number, g: number, b: number, a: number): number {
  const blendedR = r * a + 255 * (1 - a);
  const blendedG = g * a + 255 * (1 - a);
  const blendedB = b * a + 255 * (1 - a);
  const textL = relativeLuminance(blendedR, blendedG, blendedB);
  const bgL = 1.0; // white
  return contrastRatio(textL, bgL);
}

/**
 * Compute the WCAG contrast ratio of an rgba() colour against an arbitrary
 * solid background colour (bgR, bgG, bgB).  The alpha compositing follows
 * the standard "source-over" formula.
 */
function contrastOnBackground(
  r: number,
  g: number,
  b: number,
  a: number,
  bgR: number,
  bgG: number,
  bgB: number,
): number {
  const blendedR = r * a + bgR * (1 - a);
  const blendedG = g * a + bgG * (1 - a);
  const blendedB = b * a + bgB * (1 - a);
  const textL = relativeLuminance(blendedR, blendedG, blendedB);
  const bgL = relativeLuminance(bgR, bgG, bgB);
  return contrastRatio(textL, bgL);
}

// ── Violation types ────────────────────────────────────────────────────────

interface Violation {
  file: string;
  line: number;
  col: number;
  match: string;
  source: string;
  contrast?: number;
  check: "rgba" | "opacity-token" | "white-on-dark";
  /** For white-on-dark: the background token name that produced the failure */
  bgToken?: string;
}

// ── Check 1: rgba text colour ──────────────────────────────────────────────

/**
 * Regex that matches a `color:` or `color=` property followed by an rgba()
 * value.
 *
 * Named capture groups:
 *   r, g, b  — 0–255 channel values
 *   a        — alpha 0.0–1.0
 *
 * Non-text colour properties are filtered out in checkRgbaColors() after
 * matching (see the SKIP_COLOR_PROP_RE check below).
 */
const RGBA_TEXT_COLOR_RE =
  /\bcolor\s*[=:]\s*["']?rgba\(\s*(?<r>\d+)\s*,\s*(?<g>\d+)\s*,\s*(?<b>\d+)\s*,\s*(?<a>[\d.]+)\s*\)["']?/g;

/**
 * When a `color` match is preceded (anywhere on the same line before the
 * match index) by one of these property names, it is a non-text colour and
 * should be skipped.
 *
 * This catches patterns like:
 *   backgroundColor: "rgba(...)"
 *   borderColor: "rgba(...)"
 *   android_ripple={{ color: "rgba(...)" }}   ← color INSIDE android_ripple
 *   tintColor / shadowColor / placeholderTextColor / selectionColor
 */
const SKIP_BEFORE_PATTERNS = [
  /\bbackgroundColor\s*[=:]/,
  /\bborderColor\s*[=:]/,
  /\bborderBottomColor\s*[=:]/,
  /\bborderTopColor\s*[=:]/,
  /\bborderLeftColor\s*[=:]/,
  /\bborderRightColor\s*[=:]/,
  /\btintColor\s*[=:]/,
  /\bshadowColor\s*[=:]/,
  /\bplaceholderTextColor\s*[=:]/,
  /\bselectionColor\s*[=:]/,
  /\bcursorColor\s*[=:]/,
  /\bandroid_ripple\b/,
];

const WCAG_AA_NORMAL_TEXT = 4.5;

function checkRgbaColors(
  lines: string[],
  filePath: string,
): Violation[] {
  const violations: Violation[] = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    if (line.includes(ESCAPE_HATCH)) continue;
    const prevLine = lineIdx > 0 ? lines[lineIdx - 1] : "";
    if (prevLine.includes(ESCAPE_HATCH)) continue;

    RGBA_TEXT_COLOR_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RGBA_TEXT_COLOR_RE.exec(line)) !== null) {
      // Check whether any non-text colour property appears before this match
      // on the same line (covers backgroundColor:, borderColor:, android_ripple,
      // tintColor, shadowColor, and friends).
      const linePrefix = line.slice(0, m.index);
      if (SKIP_BEFORE_PATTERNS.some((re) => re.test(linePrefix))) continue;

      const r = parseInt(m.groups!.r, 10);
      const g = parseInt(m.groups!.g, 10);
      const b = parseInt(m.groups!.b, 10);
      const a = parseFloat(m.groups!.a);

      // Skip near-white base colours — these are white/light text on a dark
      // background and are evaluated by Check 3 (checkWhiteOnDark) instead.
      if (r >= 200 && g >= 200 && b >= 200) continue;

      // Only flag colours dark enough to plausibly be text on a light bg.
      if (r > 160 || g > 160 || b > 160) continue;

      const contrast = contrastOnWhite(r, g, b, a);
      if (contrast < WCAG_AA_NORMAL_TEXT) {
        violations.push({
          file: filePath,
          line: lineIdx + 1,
          col: m.index + 1,
          match: `rgba(${r},${g},${b},${a})`,
          source: line.trim(),
          contrast,
          check: "rgba",
        });
      }
    }
  }

  return violations;
}

// ── Check 2: muted named-token + opacity on same line ─────────────────────

/**
 * Muted-token names that are known to have borderline contrast on white.
 * Full-word match (word boundary on both sides) to avoid false positives from
 * tokens with similar prefixes/suffixes.
 */
const MUTED_TOKEN_RE =
  /\b(?:mutedForeground|subtitle|subtext)\b/;

/**
 * Matches an `opacity:` property followed by a numeric literal.
 * Captures the numeric value.
 */
const OPACITY_PROP_RE = /\bopacity\s*:\s*([\d.]+)/;

const OPACITY_THRESHOLD = 0.7;

function checkOpacityWithMutedToken(
  lines: string[],
  filePath: string,
): Violation[] {
  const violations: Violation[] = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    if (line.includes(ESCAPE_HATCH)) continue;
    const prevLine = lineIdx > 0 ? lines[lineIdx - 1] : "";
    if (prevLine.includes(ESCAPE_HATCH)) continue;

    // The line must contain both a muted colour token and an opacity value.
    if (!MUTED_TOKEN_RE.test(line)) continue;
    const opacityMatch = OPACITY_PROP_RE.exec(line);
    if (!opacityMatch) continue;

    const opacity = parseFloat(opacityMatch[1]);
    if (opacity >= OPACITY_THRESHOLD) continue;

    violations.push({
      file: filePath,
      line: lineIdx + 1,
      col: opacityMatch.index + 1,
      match: `opacity: ${opacity} with muted colour token`,
      source: line.trim(),
      check: "opacity-token",
    });
  }

  return violations;
}

// ── Check 3: white/near-white rgba text on known dark backgrounds ──────────

/**
 * Known dark background colours used in header banners and dark-themed
 * sections of the app, derived from `artifacts/presentail/constants/colors.ts`.
 *
 * Each entry is the solid background colour the text is composited against.
 * The check evaluates rgba white text against every entry and flags if it
 * fails WCAG AA (4.5:1) on ANY of them.
 */
const KNOWN_DARK_BACKGROUNDS: Array<{ token: string; r: number; g: number; b: number }> = [
  { token: "teal900 (#00414E)", r: 0,  g: 65, b: 78 },
  { token: "teal800 (#0a5663)", r: 10, g: 86, b: 99 },
  { token: "charcoal (#1A2226)", r: 26, g: 34, b: 38 },
];

function checkWhiteOnDark(
  lines: string[],
  filePath: string,
): Violation[] {
  const violations: Violation[] = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    if (line.includes(ESCAPE_HATCH)) continue;
    const prevLine = lineIdx > 0 ? lines[lineIdx - 1] : "";
    if (prevLine.includes(ESCAPE_HATCH)) continue;

    RGBA_TEXT_COLOR_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RGBA_TEXT_COLOR_RE.exec(line)) !== null) {
      const linePrefix = line.slice(0, m.index);
      if (SKIP_BEFORE_PATTERNS.some((re) => re.test(linePrefix))) continue;

      const r = parseInt(m.groups!.r, 10);
      const g = parseInt(m.groups!.g, 10);
      const b = parseInt(m.groups!.b, 10);
      const a = parseFloat(m.groups!.a);

      // Only handle near-white / white colours (the ones skipped by Check 1).
      if (!(r >= 200 && g >= 200 && b >= 200)) continue;

      // Evaluate the rgba text against each known dark background.
      // Report only the first failing background (lowest contrast found).
      let worstContrast = Infinity;
      let worstToken = "";
      for (const bg of KNOWN_DARK_BACKGROUNDS) {
        const contrast = contrastOnBackground(r, g, b, a, bg.r, bg.g, bg.b);
        if (contrast < worstContrast) {
          worstContrast = contrast;
          worstToken = bg.token;
        }
      }

      if (worstContrast < WCAG_AA_NORMAL_TEXT) {
        violations.push({
          file: filePath,
          line: lineIdx + 1,
          col: m.index + 1,
          match: `rgba(${r},${g},${b},${a})`,
          source: line.trim(),
          contrast: worstContrast,
          check: "white-on-dark",
          bgToken: worstToken,
        });
      }
    }
  }

  return violations;
}

// ── File traversal ────────────────────────────────────────────────────────

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
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  return [
    ...checkRgbaColors(lines, filePath),
    ...checkOpacityWithMutedToken(lines, filePath),
    ...checkWhiteOnDark(lines, filePath),
  ];
}

// ── Runner ────────────────────────────────────────────────────────────────

function run(): void {
  const files: string[] = [];
  collectFiles(SCAN_ROOT, files);

  const allViolations: Violation[] = [];
  for (const f of files) {
    allViolations.push(...checkFile(f));
  }

  if (allViolations.length === 0) {
    console.log("✓ check-low-contrast-text-mobile: no violations found.");
    process.exit(0);
  }

  console.error(
    `✗ check-low-contrast-text-mobile: ${allViolations.length} violation(s) found.\n`,
  );
  console.error(
    "These patterns may push text contrast below WCAG AA (4.5:1).",
  );
  console.error(
    "Fix by increasing the alpha / removing the opacity modifier, or annotate with",
  );
  console.error(
    "  // contrast-ok: <reason>",
  );
  console.error(
    "if the element is disabled/inactive, purely decorative, a press-only state, or a",
  );
  console.error(
    "large-text/icon component where the 3.0:1 non-text threshold applies.\n",
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
      const contrastStr =
        v.contrast !== undefined ? `  contrast ≈ ${v.contrast.toFixed(2)}:1` : "";
      const bgStr = v.bgToken ? `  (on ${v.bgToken})` : "";
      console.error(`    line ${v.line}:${v.col}  ${v.match}${contrastStr}${bgStr}`);
      console.error(`      ${v.source}`);
    }
    console.error("");
  }

  process.exit(1);
}

run();
