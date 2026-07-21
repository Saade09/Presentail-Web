import { describe, it, expect } from "vitest";
import { checkSitemapContent } from "./checkSitemapStructure.js";

const CANONICAL_ORIGIN = "https://presentail.com";
const MIN_URL_COUNT = 250;

// Build a minimal but structurally valid sitemap XML with the given number of
// synthetic <url> entries, all using the canonical origin.
function buildValidSitemap(urlCount: number, origin = CANONICAL_ORIGIN): string {
  const urls = Array.from(
    { length: urlCount },
    (_, i) =>
      `  <url><loc>${origin}/en-lb/beirut/product/item-${i}</loc><lastmod>2026-01-01</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
  ).join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls +
    `\n</urlset>`
  );
}

// ---------------------------------------------------------------------------
// Well-formed XML structure checks
// ---------------------------------------------------------------------------

describe("checkSitemapContent — XML structure", () => {
  it("passes a fully valid sitemap", () => {
    const xml = buildValidSitemap(MIN_URL_COUNT);
    const { errors } = checkSitemapContent(xml, CANONICAL_ORIGIN, MIN_URL_COUNT);
    expect(errors).toEqual([]);
  });

  it("fails when the XML declaration is missing", () => {
    const xml = buildValidSitemap(MIN_URL_COUNT).replace(/^<\?xml[^?]*\?>\n/, "");
    const { errors } = checkSitemapContent(xml, CANONICAL_ORIGIN, MIN_URL_COUNT);
    expect(errors.some((e) => e.includes("XML declaration"))).toBe(true);
  });

  it("fails when the <urlset> root element is missing", () => {
    const xml = buildValidSitemap(MIN_URL_COUNT)
      .replace(/<urlset[^>]*>/, "")
      .replace("</urlset>", "");
    const { errors } = checkSitemapContent(xml, CANONICAL_ORIGIN, MIN_URL_COUNT);
    expect(errors.some((e) => e.includes("<urlset>"))).toBe(true);
  });

  it("fails when the closing </urlset> tag is missing (truncated response)", () => {
    const xml = buildValidSitemap(MIN_URL_COUNT).replace("</urlset>", "");
    const { errors } = checkSitemapContent(xml, CANONICAL_ORIGIN, MIN_URL_COUNT);
    expect(errors.some((e) => e.includes("</urlset>"))).toBe(true);
  });

  it("fails when there is trailing garbage content after </urlset>", () => {
    const xml = buildValidSitemap(MIN_URL_COUNT) + "\n<extra>junk</extra>";
    const { errors } = checkSitemapContent(xml, CANONICAL_ORIGIN, MIN_URL_COUNT);
    expect(errors.some((e) => e.includes("Content found after"))).toBe(true);
  });

  it("passes when there is only trailing whitespace/newlines after </urlset>", () => {
    const xml = buildValidSitemap(MIN_URL_COUNT) + "\n   \n";
    const { errors } = checkSitemapContent(xml, CANONICAL_ORIGIN, MIN_URL_COUNT);
    expect(errors.some((e) => e.includes("Content found after"))).toBe(false);
  });

  it("fails when <url> opening and closing tags are mismatched (one unclosed)", () => {
    // Add an extra opening <url> without a closing </url>
    const xml = buildValidSitemap(MIN_URL_COUNT).replace(
      "</urlset>",
      "  <url><loc>https://presentail.com/orphan</loc>\n</urlset>",
    );
    const { errors } = checkSitemapContent(xml, CANONICAL_ORIGIN, MIN_URL_COUNT);
    expect(errors.some((e) => e.includes("Mismatched <url> tag counts"))).toBe(true);
  });

  it("fails when there is an extra closing </url> with no matching opening tag", () => {
    const xml = buildValidSitemap(MIN_URL_COUNT).replace(
      "</urlset>",
      "</url>\n</urlset>",
    );
    const { errors } = checkSitemapContent(xml, CANONICAL_ORIGIN, MIN_URL_COUNT);
    expect(errors.some((e) => e.includes("Mismatched <url> tag counts"))).toBe(true);
  });

  it("fails on a completely empty string", () => {
    const { errors } = checkSitemapContent("", CANONICAL_ORIGIN, MIN_URL_COUNT);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("XML declaration"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Minimum URL count check
// ---------------------------------------------------------------------------

describe("checkSitemapContent — minimum URL count", () => {
  it("passes when URL count equals the minimum", () => {
    const xml = buildValidSitemap(MIN_URL_COUNT);
    const { errors, urlCount } = checkSitemapContent(xml, CANONICAL_ORIGIN, MIN_URL_COUNT);
    expect(urlCount).toBe(MIN_URL_COUNT);
    expect(errors.some((e) => e.includes("entr"))).toBe(false);
  });

  it("passes when URL count exceeds the minimum", () => {
    const xml = buildValidSitemap(MIN_URL_COUNT + 100);
    const { errors } = checkSitemapContent(xml, CANONICAL_ORIGIN, MIN_URL_COUNT);
    expect(errors.some((e) => e.includes("entr"))).toBe(false);
  });

  it("fails when URL count is below the minimum", () => {
    const xml = buildValidSitemap(10);
    const { errors, urlCount } = checkSitemapContent(xml, CANONICAL_ORIGIN, MIN_URL_COUNT);
    expect(urlCount).toBe(10);
    expect(errors.some((e) => e.includes("10") && e.includes("entr"))).toBe(true);
    expect(errors.some((e) => e.includes(String(MIN_URL_COUNT)))).toBe(true);
  });

  it("fails for a sitemap with zero URL entries", () => {
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`;
    const { errors, urlCount } = checkSitemapContent(xml, CANONICAL_ORIGIN, MIN_URL_COUNT);
    expect(urlCount).toBe(0);
    expect(errors.some((e) => e.includes("0") && e.includes("entr"))).toBe(true);
  });

  it("reports the correct urlCount in the result", () => {
    const n = MIN_URL_COUNT + 42;
    const xml = buildValidSitemap(n);
    const { urlCount } = checkSitemapContent(xml, CANONICAL_ORIGIN, MIN_URL_COUNT);
    expect(urlCount).toBe(n);
  });
});

// ---------------------------------------------------------------------------
// Canonical origin check
// ---------------------------------------------------------------------------

describe("checkSitemapContent — canonical origin", () => {
  it("passes when all <loc> values use the canonical origin", () => {
    const xml = buildValidSitemap(MIN_URL_COUNT);
    const { errors } = checkSitemapContent(xml, CANONICAL_ORIGIN, MIN_URL_COUNT);
    expect(errors.some((e) => e.includes("canonical origin"))).toBe(false);
  });

  it("fails when one <loc> uses a different origin", () => {
    const offendingLoc = "http://localhost:19234/en-lb/beirut/product/oops";
    const xml =
      buildValidSitemap(MIN_URL_COUNT - 1) +
      `\n  <url><loc>${offendingLoc}</loc></url>\n</urlset>`;
    const { errors, wrongOriginLocs } = checkSitemapContent(
      xml,
      CANONICAL_ORIGIN,
      MIN_URL_COUNT,
    );
    expect(errors.some((e) => e.includes("canonical origin"))).toBe(true);
    expect(wrongOriginLocs).toContain(offendingLoc);
  });

  it("fails when all <loc> values use a wrong origin", () => {
    const wrongOrigin = "https://new.presentail.com";
    const xml = buildValidSitemap(MIN_URL_COUNT, wrongOrigin);
    const { errors, wrongOriginLocs } = checkSitemapContent(
      xml,
      CANONICAL_ORIGIN,
      MIN_URL_COUNT,
    );
    expect(errors.some((e) => e.includes("canonical origin"))).toBe(true);
    expect(wrongOriginLocs).toHaveLength(MIN_URL_COUNT);
  });

  it("uses a custom canonical origin when provided", () => {
    const customOrigin = "https://staging.presentail.com";
    const xml = buildValidSitemap(MIN_URL_COUNT, customOrigin);
    const { errors } = checkSitemapContent(xml, customOrigin, MIN_URL_COUNT);
    expect(errors.some((e) => e.includes("canonical origin"))).toBe(false);
  });

  it("fails when the origin is the retired new. subdomain", () => {
    const retiredOrigin = "https://new.presentail.com";
    const xml = buildValidSitemap(MIN_URL_COUNT, retiredOrigin);
    const { errors, wrongOriginLocs } = checkSitemapContent(
      xml,
      CANONICAL_ORIGIN,
      MIN_URL_COUNT,
    );
    expect(errors.some((e) => e.includes("canonical origin") || e.includes("origin"))).toBe(true);
    expect(wrongOriginLocs).toHaveLength(MIN_URL_COUNT);
  });

  it("rejects a host-spoof origin that shares the canonical string as a prefix", () => {
    // https://presentail.com.evil.com starts with https://presentail.com
    // but its URL origin is https://presentail.com.evil.com — must be rejected.
    const spoofOrigin = "https://presentail.com.evil.com";
    const xml = buildValidSitemap(MIN_URL_COUNT, spoofOrigin);
    const { errors, wrongOriginLocs } = checkSitemapContent(
      xml,
      CANONICAL_ORIGIN,
      MIN_URL_COUNT,
    );
    expect(errors.some((e) => e.includes("origin"))).toBe(true);
    expect(wrongOriginLocs).toHaveLength(MIN_URL_COUNT);
  });
});

// ---------------------------------------------------------------------------
// Duplicate <loc> detection
// ---------------------------------------------------------------------------

describe("checkSitemapContent — duplicate <loc> detection", () => {
  it("passes when all <loc> values are unique", () => {
    const xml = buildValidSitemap(MIN_URL_COUNT);
    const { errors, duplicateLocs } = checkSitemapContent(
      xml,
      CANONICAL_ORIGIN,
      MIN_URL_COUNT,
    );
    expect(errors.some((e) => e.includes("duplicate"))).toBe(false);
    expect(duplicateLocs).toHaveLength(0);
  });

  it("fails when the same <loc> appears more than once", () => {
    const duplicatedLoc = `${CANONICAL_ORIGIN}/en-lb/beirut/`;
    const extraUrls = Array.from(
      { length: 2 },
      () =>
        `  <url><loc>${duplicatedLoc}</loc><lastmod>2026-01-01</lastmod></url>`,
    ).join("\n");
    const baseSitemap = buildValidSitemap(MIN_URL_COUNT - 2);
    const xml = baseSitemap.replace(
      "</urlset>",
      `${extraUrls}\n</urlset>`,
    );
    const { errors, duplicateLocs } = checkSitemapContent(
      xml,
      CANONICAL_ORIGIN,
      MIN_URL_COUNT,
    );
    expect(errors.some((e) => e.includes("duplicate"))).toBe(true);
    expect(duplicateLocs).toContain(duplicatedLoc);
  });

  it("lists each offending loc only once in duplicateLocs even if it appears three times", () => {
    const loc = `${CANONICAL_ORIGIN}/en-lb/beirut/product/triple`;
    const repeatedUrls = Array.from(
      { length: 3 },
      () => `  <url><loc>${loc}</loc></url>`,
    ).join("\n");
    const baseSitemap = buildValidSitemap(MIN_URL_COUNT - 3);
    const xml = baseSitemap.replace("</urlset>", `${repeatedUrls}\n</urlset>`);
    const { duplicateLocs } = checkSitemapContent(xml, CANONICAL_ORIGIN, MIN_URL_COUNT);
    expect(duplicateLocs.filter((l) => l === loc)).toHaveLength(1);
  });

  it("does not flag similar but distinct <loc> values as duplicates", () => {
    const xml = buildValidSitemap(MIN_URL_COUNT);
    const { duplicateLocs } = checkSitemapContent(xml, CANONICAL_ORIGIN, MIN_URL_COUNT);
    expect(duplicateLocs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Combined / realistic cases
// ---------------------------------------------------------------------------

describe("checkSitemapContent — combined error scenarios", () => {
  it("accumulates multiple distinct errors in one result", () => {
    const xml =
      `<urlset>\n` +
      `  <url><loc>http://localhost/only-one-url</loc></url>\n` +
      `</urlset>`;
    const { errors } = checkSitemapContent(xml, CANONICAL_ORIGIN, MIN_URL_COUNT);
    expect(errors.length).toBeGreaterThanOrEqual(3);
    expect(errors.some((e) => e.includes("XML declaration"))).toBe(true);
    expect(errors.some((e) => e.includes("entr"))).toBe(true);
    expect(errors.some((e) => e.includes("canonical origin"))).toBe(true);
  });

  it("returns an empty errors array for a realistic sitemap with 300 valid URLs", () => {
    const xml = buildValidSitemap(300);
    const { errors } = checkSitemapContent(xml, CANONICAL_ORIGIN, MIN_URL_COUNT);
    expect(errors).toEqual([]);
  });
});
