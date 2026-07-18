/**
 * checkRobotsTxt
 *
 * Parses `artifacts/presentail-web/public/robots.txt` and fails when:
 *
 *   1. A non-Sitemap / non-comment directive appears outside all User-agent
 *      blocks (orphaned directive — most parsers silently ignore it).
 *   2. The same Disallow pattern is listed more than once under the same
 *      User-agent (duplicate directive).
 *   3. Any of the required paths is absent from the `User-agent: *` block:
 *        /sign-in, /order-confirmed, /favorites, /cart, /checkout,
 *        /*?utm_*  (at least one Disallow matching /*?utm_… must be present)
 *   4. No `Sitemap:` directive is present in the file.
 *   5. Any `Sitemap:` value does not start with the expected base URL
 *      (default: `https://presentail.com/`; override with the
 *      `ROBOTS_TXT_SITEMAP_BASE` environment variable).
 *
 * Parsing model
 * ─────────────
 * A robots.txt file is a sequence of "record blocks". Each block begins
 * with one or more consecutive `User-agent:` lines followed by the
 * directives that apply to those agents. Once any directive (Allow,
 * Disallow, Crawl-delay, …) appears, the block is "sealed" — the next
 * `User-agent:` line starts a new block. A directive with no preceding
 * `User-agent:` line is orphaned. Sitemap lines are global and may appear
 * anywhere; they are not scoped to a block.
 *
 * Exit codes
 * ──────────
 *   0 — no structural problems found
 *   1 — at least one problem found, or the file could not be read
 *
 * Usage
 * ─────
 *   pnpm --filter @workspace/scripts run check-robots-txt
 *
 * Environment variables
 * ─────────────────────
 *   ROBOTS_TXT_SITEMAP_BASE  Expected URL prefix for every Sitemap directive
 *                            (default: https://presentail.com/)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../");
const ROBOTS_PATH = path.join(
  REPO_ROOT,
  "artifacts/presentail-web/public/robots.txt",
);

const SITEMAP_BASE =
  process.env["ROBOTS_TXT_SITEMAP_BASE"] ?? "https://presentail.com/";

export const REQUIRED_DISALLOW_PATTERNS: Array<{
  label: string;
  match: (p: string) => boolean;
}> = [
  { label: "/sign-in", match: (p) => p === "/sign-in" },
  { label: "/order-confirmed", match: (p) => p === "/order-confirmed" },
  { label: "/favorites", match: (p) => p === "/favorites" },
  { label: "/cart", match: (p) => p === "/cart" },
  { label: "/checkout", match: (p) => p === "/checkout" },
  {
    label: "/*?utm_* (at least one utm_ query parameter variant)",
    match: (p) => /^\/\*\?utm_/.test(p),
  },
];

export interface ParsedBlock {
  agents: string[];
  disallows: string[];
}

export interface ParseResult {
  blocks: ParsedBlock[];
  orphanedLines: Array<{ lineNo: number; line: string }>;
  sitemapUrls: string[];
}

export function parseRobotsTxt(content: string): ParseResult {
  const lines = content.split(/\r?\n/);
  const blocks: ParsedBlock[] = [];
  const orphanedLines: Array<{ lineNo: number; line: string }> = [];
  const sitemapUrls: string[] = [];

  let currentBlock: ParsedBlock | null = null;
  let blockSealed = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i];
    const line = raw.split("#")[0].trim();

    if (line === "") continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const field = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (field === "sitemap") {
      sitemapUrls.push(value);
      continue;
    }

    if (field === "user-agent") {
      if (currentBlock === null || blockSealed) {
        currentBlock = { agents: [value], disallows: [] };
        blockSealed = false;
        blocks.push(currentBlock);
      } else {
        currentBlock.agents.push(value);
      }
      continue;
    }

    if (currentBlock === null) {
      orphanedLines.push({ lineNo, line: raw.trim() });
      continue;
    }

    blockSealed = true;
    if (field === "disallow") {
      currentBlock.disallows.push(value);
    }
  }

  return { blocks, orphanedLines, sitemapUrls };
}

/**
 * Pure validation logic: parses `content` and returns a list of error
 * strings. An empty array means the content is structurally valid.
 * Exported so unit tests can exercise each error class in isolation.
 */
export function checkRobotsTxtContent(content: string): string[] {
  const { blocks, orphanedLines, sitemapUrls } = parseRobotsTxt(content);
  const errors: string[] = [];

  for (const { lineNo, line } of orphanedLines) {
    errors.push(
      `Line ${lineNo}: directive outside any User-agent block → "${line}"`,
    );
  }

  for (const block of blocks) {
    const agentLabel = block.agents.join(", ");
    const seen = new Set<string>();
    for (const disallow of block.disallows) {
      if (seen.has(disallow)) {
        errors.push(
          `User-agent: ${agentLabel} — duplicate Disallow: ${disallow || "(empty)"}`,
        );
      } else {
        seen.add(disallow);
      }
    }
  }

  const wildcardBlock = blocks.find((b) => b.agents.includes("*"));
  if (!wildcardBlock) {
    errors.push('No "User-agent: *" block found in robots.txt');
  } else {
    for (const { label, match } of REQUIRED_DISALLOW_PATTERNS) {
      if (!wildcardBlock.disallows.some(match)) {
        errors.push(`User-agent: * — required Disallow missing: ${label}`);
      }
    }
  }

  if (sitemapUrls.length === 0) {
    errors.push(
      `No Sitemap directive found — add "Sitemap: ${SITEMAP_BASE}sitemap.xml" (or another path under ${SITEMAP_BASE})`,
    );
  } else {
    for (const url of sitemapUrls) {
      if (!url.startsWith(SITEMAP_BASE)) {
        errors.push(
          `Sitemap URL does not start with expected base "${SITEMAP_BASE}": "${url}"`,
        );
      }
    }
  }

  return errors;
}

function run(): void {
  let content: string;
  try {
    content = fs.readFileSync(ROBOTS_PATH, "utf-8");
  } catch (err) {
    console.error(`✗ Could not read ${ROBOTS_PATH}: ${err}`);
    process.exit(1);
  }

  const errors = checkRobotsTxtContent(content);

  if (errors.length > 0) {
    console.error(
      `\n✗ robots.txt structural check failed (${errors.length} error${errors.length === 1 ? "" : "s"}):\n`,
    );
    for (const e of errors) {
      console.error(`  • ${e}`);
    }
    console.error("");
    process.exit(1);
  }

  const { blocks, sitemapUrls } = parseRobotsTxt(content);
  const blockSummary = blocks
    .map((b) => b.agents.join("|"))
    .join(", ");
  const sitemapSummary = sitemapUrls.join(", ");
  console.log(
    `✓ robots.txt structural check passed (${blocks.length} User-agent block${blocks.length === 1 ? "" : "s"}: ${blockSummary}; no orphaned directives, no duplicates, all required paths present; ${sitemapUrls.length} Sitemap directive${sitemapUrls.length === 1 ? "" : "s"} verified: ${sitemapSummary})`,
  );
}

run();
