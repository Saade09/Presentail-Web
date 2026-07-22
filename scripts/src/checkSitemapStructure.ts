/**
 * checkSitemapStructure
 *
 * Fetches /sitemap.xml from a running serve.mjs instance and validates:
 *
 *   1. The HTTP response is 200.
 *   2. Content-Type is application/xml or text/xml.
 *   3. The XML is structurally sound — has an XML declaration, a <urlset>
 *      root element (or <sitemapindex> for index files), and a matching
 *      closing tag (catches truncation).
 *   4. At least MIN_URL_COUNT <url> entries are present for standard sitemaps
 *      (catches an empty or near-empty sitemap that silently dropped hundreds
 *      of URLs). Skipped for pure sitemap index files.
 *   5. Every <loc> value — whether inside a <url> (standard sitemap) or a
 *      <sitemap> element (sitemap index format) — starts with the expected
 *      canonical origin (default: https://presentail.com; override with
 *      SITEMAP_CANONICAL_ORIGIN env var).
 *   6. No duplicate <loc> values (duplicate URLs waste crawl budget and
 *      can confuse canonicalization signals).
 *   7. Every <loc> value uses the https:// scheme — not http://, //, or a
 *      relative path. This check is independent of the canonical-origin
 *      comparison so a misconfigured SITEMAP_CANONICAL_ORIGIN env var (e.g.
 *      http://presentail.com without TLS) is still caught.
 *
 * Sitemap index format support
 * ────────────────────────────
 *   Sites with very large catalogs sometimes publish a sitemap index — a
 *   <sitemapindex> root containing <sitemap><loc>…</loc></sitemap> children
 *   that point to individual sitemap files.  checkSitemapContent handles both
 *   formats:
 *     • Standard sitemap  (<urlset> root, <url><loc>…</loc></url> children)
 *     • Sitemap index     (<sitemapindex> root, <sitemap><loc>…</loc></sitemap>)
 *     • Mixed             (both <url> and <sitemap> <loc> entries present)
 *   HTTPS-scheme and canonical-origin checks are applied to all <loc> values
 *   regardless of which element wraps them.
 *
 * Exit codes
 * ──────────
 *   0 — all checks pass
 *   1 — at least one check failed, or the sitemap could not be fetched
 *
 * Usage
 * ─────
 *   pnpm --filter @workspace/scripts run check-sitemap-structure <base-url>
 *
 *   <base-url>  Base URL of the running serve.mjs instance.
 *               Example: http://localhost:19234
 *
 * Environment variables
 * ─────────────────────
 *   SITEMAP_CANONICAL_ORIGIN  Expected URL prefix for every <loc> value.
 *                             Default: https://presentail.com
 *   SITEMAP_MIN_URL_COUNT     Minimum number of <url> entries required.
 *                             Default: 250 (static city×path pages alone
 *                             produce 260+ even with an empty catalog).
 *                             Not applied to sitemap index <sitemap> entries.
 */

import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_CANONICAL_ORIGIN = "https://presentail.com";
const DEFAULT_MIN_URL_COUNT = 250;

export const CANONICAL_ORIGIN =
  process.env["SITEMAP_CANONICAL_ORIGIN"] ?? DEFAULT_CANONICAL_ORIGIN;

export const MIN_URL_COUNT = (() => {
  const raw = process.env["SITEMAP_MIN_URL_COUNT"];
  if (!raw) return DEFAULT_MIN_URL_COUNT;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MIN_URL_COUNT;
})();

export interface SitemapCheckResult {
  errors: string[];
  /** Number of <url><loc> entries (standard sitemap entries). */
  urlCount: number;
  /** Number of <sitemap><loc> entries (sitemap index entries). */
  sitemapIndexLocCount: number;
  duplicateLocs: string[];
  wrongOriginLocs: string[];
  nonHttpsLocs: string[];
}

/**
 * Validate the raw sitemap XML string. Pure and synchronous so it can be
 * unit-tested without a running server or any I/O.
 *
 * Handles both the standard sitemap format (<urlset> root) and the sitemap
 * index format (<sitemapindex> root with <sitemap><loc> children), as well as
 * files that contain entries from both formats simultaneously.
 *
 * @param xml             Raw XML text of the sitemap.
 * @param canonicalOrigin Expected origin (scheme + host, no trailing slash) for
 *                        every <loc>. Validated via `new URL(loc).origin` so
 *                        host-spoof variants like `presentail.com.evil.com` are
 *                        rejected even though they share the expected string as a
 *                        prefix.
 * @param minUrlCount     Minimum number of <url> entries (standard sitemap).
 *                        Not applied to sitemap index <sitemap> entries.
 */
export function checkSitemapContent(
  xml: string,
  canonicalOrigin = CANONICAL_ORIGIN,
  minUrlCount = MIN_URL_COUNT,
): SitemapCheckResult {
  const errors: string[] = [];

  // Detect which format(s) are present.
  const isSitemapIndex = xml.includes("<sitemapindex");
  const hasUrlset = xml.includes("<urlset");

  // --- Structural XML checks ------------------------------------------------

  if (!xml.trimStart().startsWith("<?xml")) {
    errors.push(
      'Sitemap does not begin with an XML declaration ("<?xml …") — the ' +
        "response may not be XML at all.",
    );
  }

  if (isSitemapIndex) {
    // Sitemap index: validate <sitemapindex> root and closing tag.
    if (!xml.includes("</sitemapindex>")) {
      errors.push(
        "Sitemap index is missing the closing </sitemapindex> tag — the " +
          "response may be truncated or the XML generator threw mid-write.",
      );
    } else {
      const afterRoot = xml.slice(
        xml.lastIndexOf("</sitemapindex>") + "</sitemapindex>".length,
      );
      if (afterRoot.trim().length > 0) {
        errors.push(
          "Content found after the closing </sitemapindex> tag — the XML may " +
            "be corrupted or the generator wrote a partial second response: " +
            JSON.stringify(afterRoot.trim().slice(0, 80)),
        );
      }
    }

    // Balanced <sitemap> / </sitemap> tag check: mismatched counts indicate
    // the XML generator produced broken nesting (e.g. an unclosed <sitemap>
    // block or a stray closing tag with no matching opener).
    const openSitemapCount = (xml.match(/<sitemap>/g) ?? []).length;
    const closeSitemapCount = (xml.match(/<\/sitemap>/g) ?? []).length;
    if (openSitemapCount !== closeSitemapCount) {
      errors.push(
        `Mismatched <sitemap> tag counts: ${openSitemapCount} opening tag(s) vs ` +
          `${closeSitemapCount} closing tag(s) — the XML is not well-formed.`,
      );
    }
  }

  if (hasUrlset || !isSitemapIndex) {
    // Standard sitemap (or a file that has neither format): validate <urlset>.
    if (!hasUrlset) {
      errors.push(
        "Sitemap is missing the <urlset> root element — the XML skeleton is broken.",
      );
    }

    if (!xml.includes("</urlset>")) {
      errors.push(
        "Sitemap is missing the closing </urlset> tag — the response may be " +
          "truncated or the XML generator threw mid-write.",
      );
    } else {
      const afterRoot = xml.slice(
        xml.lastIndexOf("</urlset>") + "</urlset>".length,
      );
      if (afterRoot.trim().length > 0) {
        errors.push(
          "Content found after the closing </urlset> tag — the XML may be " +
            "corrupted or the generator wrote a partial second response: " +
            JSON.stringify(afterRoot.trim().slice(0, 80)),
        );
      }
    }

    // Balanced <url> / </url> tag check: mismatched counts indicate the XML
    // generator produced broken nesting (e.g. an unclosed <url> block).
    const openUrlCount = (xml.match(/<url>/g) ?? []).length;
    const closeUrlCount = (xml.match(/<\/url>/g) ?? []).length;
    if (openUrlCount !== closeUrlCount) {
      errors.push(
        `Mismatched <url> tag counts: ${openUrlCount} opening tag(s) vs ` +
          `${closeUrlCount} closing tag(s) — the XML is not well-formed.`,
      );
    }
  }

  // --- Extract <loc> values by context --------------------------------------
  // Use context-aware regexes so standard <url><loc> entries and sitemap index
  // <sitemap><loc> entries are tracked separately for accurate counts.

  // Standard sitemap entries: <url>…<loc>…</loc>…</url>
  const urlLocMatches = [
    ...xml.matchAll(/<url>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/url>/g),
  ];
  const urlLocs = urlLocMatches.map((m) => m[1]!);
  const urlCount = urlLocs.length;

  // Sitemap index entries: <sitemap>…<loc>…</loc>…</sitemap>
  const sitemapLocMatches = [
    ...xml.matchAll(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/g),
  ];
  const sitemapIndexLocs = sitemapLocMatches.map((m) => m[1]!);
  const sitemapIndexLocCount = sitemapIndexLocs.length;

  // All <loc> values subject to scheme and origin checks.
  const allLocs = [...urlLocs, ...sitemapIndexLocs];

  // --- Minimum URL count (standard entries only) ----------------------------
  // Skipped for pure sitemap index files — the sub-sitemap count is not a
  // meaningful proxy for catalog coverage.

  if (!isSitemapIndex || urlCount > 0) {
    if (urlCount < minUrlCount) {
      errors.push(
        `Sitemap contains only ${urlCount} <url> entr${urlCount === 1 ? "y" : "ies"} — ` +
          `expected at least ${minUrlCount}. A regression may have silently ` +
          `dropped hundreds of URLs from the index.`,
      );
    }
  }

  // --- Canonical origin check -----------------------------------------------
  // Use new URL(loc).origin for strict host comparison so a spoofed host like
  // "https://presentail.com.evil.com/..." is rejected even though it shares
  // "https://presentail.com" as a string prefix.
  // Applied to all <loc> values: both standard <url> and index <sitemap> entries.

  const wrongOriginLocs: string[] = [];
  for (const loc of allLocs) {
    let locOrigin: string;
    try {
      locOrigin = new URL(loc).origin;
    } catch {
      // Unparseable loc — treat as wrong origin.
      wrongOriginLocs.push(loc);
      continue;
    }
    if (locOrigin !== canonicalOrigin) {
      wrongOriginLocs.push(loc);
    }
  }
  if (wrongOriginLocs.length > 0) {
    const sample = wrongOriginLocs.slice(0, 5).join("\n      ");
    const extra =
      wrongOriginLocs.length > 5
        ? `\n      … and ${wrongOriginLocs.length - 5} more`
        : "";
    errors.push(
      `${wrongOriginLocs.length} <loc> value(s) have an origin that does not ` +
        `match the canonical origin "${canonicalOrigin}":\n      ${sample}${extra}`,
    );
  }

  // --- HTTPS scheme check ---------------------------------------------------
  // Independent of the canonical-origin comparison: catches the case where
  // SITEMAP_CANONICAL_ORIGIN is itself misconfigured with an http:// scheme
  // (e.g. "http://presentail.com"), which would otherwise pass the origin
  // check while still submitting plain-HTTP URLs to search engines.
  // Applied to all <loc> values: both standard <url> and index <sitemap> entries.

  const nonHttpsLocs: string[] = [];
  for (const loc of allLocs) {
    if (!loc.startsWith("https://")) {
      nonHttpsLocs.push(loc);
    }
  }
  if (nonHttpsLocs.length > 0) {
    const sample = nonHttpsLocs.slice(0, 5).join("\n      ");
    const extra =
      nonHttpsLocs.length > 5
        ? `\n      … and ${nonHttpsLocs.length - 5} more`
        : "";
    errors.push(
      `${nonHttpsLocs.length} <loc> value(s) do not use the https:// scheme ` +
        `(http://, protocol-relative, or relative URLs are not valid for ` +
        `production sitemaps):\n      ${sample}${extra}`,
    );
  }

  // --- Duplicate <loc> detection --------------------------------------------

  const seen = new Set<string>();
  const duplicateLocs: string[] = [];
  for (const loc of allLocs) {
    if (seen.has(loc)) {
      if (!duplicateLocs.includes(loc)) duplicateLocs.push(loc);
    } else {
      seen.add(loc);
    }
  }
  if (duplicateLocs.length > 0) {
    const sample = duplicateLocs.slice(0, 5).join("\n      ");
    const extra =
      duplicateLocs.length > 5
        ? `\n      … and ${duplicateLocs.length - 5} more`
        : "";
    errors.push(
      `${duplicateLocs.length} duplicate <loc> value(s) found (duplicate URLs ` +
        `waste crawl budget and confuse canonicalization):\n      ${sample}${extra}`,
    );
  }

  return {
    errors,
    urlCount,
    sitemapIndexLocCount,
    duplicateLocs,
    wrongOriginLocs,
    nonHttpsLocs,
  };
}

// ---------------------------------------------------------------------------
// CLI entry point — guarded with _isMain so the module can be imported in
// tests without triggering process.exit (mirrors the pattern in sitemap.mjs).
// ---------------------------------------------------------------------------

const _isMain =
  typeof process !== "undefined" &&
  process.argv[1] != null &&
  fileURLToPath(import.meta.url) === process.argv[1];

async function run(): Promise<void> {
  const baseUrl = process.argv[2];
  if (!baseUrl) {
    process.stderr.write(
      "Usage: pnpm --filter @workspace/scripts run check-sitemap-structure <base-url>\n" +
        "  Example: pnpm --filter @workspace/scripts run check-sitemap-structure http://localhost:19234\n",
    );
    process.exit(1);
  }

  const sitemapUrl = `${baseUrl.replace(/\/$/, "")}/sitemap.xml`;

  let xml: string;
  let contentType: string | null = null;

  try {
    const res = await fetch(sitemapUrl);
    if (!res.ok) {
      process.stderr.write(
        `✗ Fetching ${sitemapUrl} returned HTTP ${res.status} ${res.statusText}\n`,
      );
      process.exit(1);
    }
    contentType = res.headers.get("content-type");
    xml = await res.text();
  } catch (err) {
    process.stderr.write(`✗ Could not fetch ${sitemapUrl}: ${err}\n`);
    process.exit(1);
  }

  const allErrors: string[] = [];

  if (contentType && !contentType.includes("xml")) {
    allErrors.push(
      `Content-Type is "${contentType}" — expected application/xml or text/xml.`,
    );
  }

  const { errors, urlCount, sitemapIndexLocCount } = checkSitemapContent(xml);
  allErrors.push(...errors);

  if (allErrors.length > 0) {
    process.stderr.write(
      `\n✗ Sitemap structure check failed (${allErrors.length} error${allErrors.length === 1 ? "" : "s"}):\n\n`,
    );
    for (const e of allErrors) {
      process.stderr.write(`  • ${e}\n`);
    }
    process.stderr.write("\n");
    process.exit(1);
  }

  const locSummary =
    sitemapIndexLocCount > 0
      ? `${urlCount} <url> entr${urlCount === 1 ? "y" : "ies"} + ${sitemapIndexLocCount} sitemap index entr${sitemapIndexLocCount === 1 ? "y" : "ies"}`
      : `${urlCount} <url> entr${urlCount === 1 ? "y" : "ies"}`;

  process.stdout.write(
    `✓ Sitemap structure check passed — ${locSummary}, ` +
      `all <loc> values use the canonical origin "${CANONICAL_ORIGIN}", ` +
      `no duplicates, well-formed XML\n`,
  );
}

if (_isMain) {
  run().catch((err) => {
    process.stderr.write(`✗ Unexpected error: ${err}\n`);
    process.exit(1);
  });
}
