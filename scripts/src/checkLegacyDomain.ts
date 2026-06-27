/**
 * checkLegacyDomain
 *
 * Repo guard that fails when the retired `new.presentail.com` domain is
 * reintroduced into production source. Every hard-coded reference was migrated
 * to the canonical `presentail.com` domain (share links, SEO canonicals,
 * sitemap, IndexNow, SMS/email tracking links, Stripe Apple Pay, Apple
 * Sign-In). If the old subdomain creeps back in it silently breaks
 * "Continue with Apple", Apple Pay, and rich link previews — this guard
 * catches the regression before it ships.
 *
 * What it scans:
 *   - Every text source file in the repo with a code/config extension
 *     (.ts, .tsx, .js, .jsx, .mjs, .cjs, .mts, .cts, .json, .yml, .yaml,
 *      .html, .css).
 *
 * Exclusions (NOT scanned):
 *   - Dependency / build / generated dirs: node_modules, dist, build, out,
 *     coverage, .turbo, .expo, .next, .git, .cache.
 *   - Historical docs & agent infra: attached_assets/, .agents/, .local/,
 *     and all Markdown (.md) files.
 *   - Any single line carrying a trailing `allow-legacy-domain` annotation
 *     (for the rare legitimate reference, e.g. a test asserting the old
 *     domain is absent).
 *
 * Exit code 0 — nothing found.
 * Exit code 1 — at least one occurrence detected, or the script errored.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run check-legacy-domain
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../");

// Directories never scanned (dependencies, build output, generated artifacts,
// historical docs, and agent infra).
export const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  ".turbo",
  ".expo",
  ".next",
  ".git",
  ".cache",
  "attached_assets",
  ".agents",
  ".local",
]);

// Only files with these extensions are scanned. Markdown is intentionally
// excluded (historical docs / memory notes may reference the old domain).
export const SCAN_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".json",
  ".yml",
  ".yaml",
  ".html",
  ".css",
]);

// The retired domain. Built from a regex whose source contains escaped dots so
// this guard file never contains a contiguous literal of the domain it forbids
// (which would make it flag itself).
export const LEGACY_DOMAIN_RE = /new\.presentail\.com/i;
export const LEGACY_DOMAIN = LEGACY_DOMAIN_RE.source.replace(/\\/g, "");

// Lines carrying this annotation are allowed to mention the old domain.
const ALLOW_ANNOTATION = "allow-legacy-domain";

export interface Hit {
  file: string; // repo-relative path
  line: number; // 1-indexed
  text: string; // trimmed offending line
}

// The guard's own definition and test files legitimately contain the forbidden
// domain (in their docs and test fixtures). A linter does not lint itself.
export const SKIP_FILES = new Set([
  "checkLegacyDomain.ts",
  "checkLegacyDomain.test.ts",
]);

export function collectFiles(dir: string, results: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectFiles(path.join(dir, entry.name), results);
    } else if (
      SCAN_EXTENSIONS.has(path.extname(entry.name)) &&
      !SKIP_FILES.has(entry.name)
    ) {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

/**
 * Returns every line in `content` that references the legacy domain without an
 * `allow-legacy-domain` annotation.
 */
export function findLegacyDomainHits(content: string, relPath: string): Hit[] {
  const hits: Hit[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!LEGACY_DOMAIN_RE.test(raw)) continue;
    if (raw.includes(ALLOW_ANNOTATION)) continue;
    hits.push({ file: relPath, line: i + 1, text: raw.trim() });
  }
  return hits;
}

// Guard lets unit tests import the exported helpers without triggering I/O
// or process.exit(). Vitest sets process.env.VITEST.
if (!process.env.VITEST) {
  const files = collectFiles(REPO_ROOT);
  const hits: Hit[] = [];

  for (const filePath of files) {
    const src = fs.readFileSync(filePath, "utf8");
    const rel = path.relative(REPO_ROOT, filePath);
    hits.push(...findLegacyDomainHits(src, rel));
  }

  if (hits.length === 0) {
    console.log(
      `\u2713 No references to the retired ${LEGACY_DOMAIN} domain in production source.`,
    );
    process.exit(0);
  }

  console.error(
    `\n\u2717 Found ${hits.length} reference${hits.length === 1 ? "" : "s"} to the retired ` +
      `${LEGACY_DOMAIN} domain. Use presentail.com instead:\n`,
  );

  const byFile = new Map<string, Hit[]>();
  for (const h of hits) {
    if (!byFile.has(h.file)) byFile.set(h.file, []);
    byFile.get(h.file)!.push(h);
  }
  for (const [file, fileHits] of byFile) {
    console.error(`  ${file}`);
    for (const h of fileHits) {
      console.error(`    line ${String(h.line).padStart(4)}  ${h.text}`);
    }
    console.error("");
  }

  function escapeGhaData(s: string): string {
    return s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  }

  if (process.env.GITHUB_ACTIONS === "true") {
    for (const h of hits) {
      process.stdout.write(
        `::error file=${h.file},line=${h.line},col=1::` +
          `Retired domain ${LEGACY_DOMAIN} found: "${escapeGhaData(h.text)}" \u2014 ` +
          `use presentail.com instead\n`,
      );
    }
  }

  console.error(
    "To fix:\n" +
      `  \u2022 Replace ${LEGACY_DOMAIN} with presentail.com.\n` +
      `  \u2022 For a genuinely legitimate reference (e.g. a test asserting the old\n` +
      `    domain is absent), add a trailing  // ${ALLOW_ANNOTATION}  comment.\n`,
  );

  process.exit(1);
}
