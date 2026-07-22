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
// HTTPS scheme check
// ---------------------------------------------------------------------------

describe("checkSitemapContent — HTTPS scheme", () => {
  it("passes when all <loc> values use https://", () => {
    const xml = buildValidSitemap(MIN_URL_COUNT);
    const { errors, nonHttpsLocs } = checkSitemapContent(
      xml,
      CANONICAL_ORIGIN,
      MIN_URL_COUNT,
    );
    expect(errors.some((e) => e.includes("https://"))).toBe(false);
    expect(nonHttpsLocs).toHaveLength(0);
  });

  it("fails when one <loc> uses http:// instead of https://", () => {
    const httpLoc = "http://presentail.com/en-lb/beirut/product/item-http";
    const xml =
      buildValidSitemap(MIN_URL_COUNT - 1).replace(
        "</urlset>",
        `  <url><loc>${httpLoc}</loc></url>\n</urlset>`,
      );
    const { errors, nonHttpsLocs } = checkSitemapContent(
      xml,
      CANONICAL_ORIGIN,
      MIN_URL_COUNT,
    );
    expect(errors.some((e) => e.includes("https://"))).toBe(true);
    expect(nonHttpsLocs).toContain(httpLoc);
  });

  it("fails when all <loc> values use http:// (misconfigured canonical origin)", () => {
    // This is the key regression: SITEMAP_CANONICAL_ORIGIN set to
    // "http://presentail.com" would still pass the origin check, but the
    // HTTPS scheme check must catch it independently.
    const httpOrigin = "http://presentail.com";
    const xml = buildValidSitemap(MIN_URL_COUNT, httpOrigin);
    const { errors, nonHttpsLocs } = checkSitemapContent(
      xml,
      httpOrigin,
      MIN_URL_COUNT,
    );
    expect(errors.some((e) => e.includes("https://"))).toBe(true);
    expect(nonHttpsLocs).toHaveLength(MIN_URL_COUNT);
  });

  it("fails for a protocol-relative <loc> (// prefix)", () => {
    const protoRelativeLoc = "//presentail.com/en-lb/beirut/";
    const xml =
      buildValidSitemap(MIN_URL_COUNT - 1).replace(
        "</urlset>",
        `  <url><loc>${protoRelativeLoc}</loc></url>\n</urlset>`,
      );
    const { errors, nonHttpsLocs } = checkSitemapContent(
      xml,
      CANONICAL_ORIGIN,
      MIN_URL_COUNT,
    );
    expect(errors.some((e) => e.includes("https://"))).toBe(true);
    expect(nonHttpsLocs).toContain(protoRelativeLoc);
  });

  it("fails for a relative-path <loc>", () => {
    const relativeLoc = "/en-lb/beirut/product/item-relative";
    const xml =
      buildValidSitemap(MIN_URL_COUNT - 1).replace(
        "</urlset>",
        `  <url><loc>${relativeLoc}</loc></url>\n</urlset>`,
      );
    const { errors, nonHttpsLocs } = checkSitemapContent(
      xml,
      CANONICAL_ORIGIN,
      MIN_URL_COUNT,
    );
    expect(errors.some((e) => e.includes("https://"))).toBe(true);
    expect(nonHttpsLocs).toContain(relativeLoc);
  });

  it("reports each offending loc in nonHttpsLocs", () => {
    const httpLoc1 = "http://presentail.com/en-lb/beirut/";
    const httpLoc2 = "http://presentail.com/en-lb/tripoli/";
    const xml =
      buildValidSitemap(MIN_URL_COUNT - 2).replace(
        "</urlset>",
        `  <url><loc>${httpLoc1}</loc></url>\n  <url><loc>${httpLoc2}</loc></url>\n</urlset>`,
      );
    const { nonHttpsLocs } = checkSitemapContent(
      xml,
      CANONICAL_ORIGIN,
      MIN_URL_COUNT,
    );
    expect(nonHttpsLocs).toContain(httpLoc1);
    expect(nonHttpsLocs).toContain(httpLoc2);
    expect(nonHttpsLocs).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Sitemap index format (<sitemapindex> root with <sitemap><loc> children)
// ---------------------------------------------------------------------------

// Build a minimal but structurally valid sitemap index XML with the given
// number of synthetic <sitemap> entries, all using the canonical origin.
function buildValidSitemapIndex(
  sitemapCount: number,
  origin = CANONICAL_ORIGIN,
): string {
  const sitemaps = Array.from(
    { length: sitemapCount },
    (_, i) =>
      `  <sitemap><loc>${origin}/sitemap-${i}.xml</loc><lastmod>2026-01-01</lastmod></sitemap>`,
  ).join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    sitemaps +
    `\n</sitemapindex>`
  );
}

describe("checkSitemapContent — sitemap index format", () => {
  it("passes a valid sitemap index with all https:// sub-sitemap <loc> values", () => {
    const xml = buildValidSitemapIndex(5);
    const { errors, sitemapIndexLocCount } = checkSitemapContent(
      xml,
      CANONICAL_ORIGIN,
      MIN_URL_COUNT,
    );
    expect(errors).toEqual([]);
    expect(sitemapIndexLocCount).toBe(5);
  });

  it("fails when a sitemap index has an http:// child <loc> (non-HTTPS sub-sitemap URL)", () => {
    const httpLoc = "http://presentail.com/sitemap-products.xml";
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `  <sitemap><loc>https://presentail.com/sitemap-0.xml</loc></sitemap>\n` +
      `  <sitemap><loc>${httpLoc}</loc></sitemap>\n` +
      `</sitemapindex>`;
    const { errors, nonHttpsLocs, sitemapIndexLocCount } = checkSitemapContent(
      xml,
      CANONICAL_ORIGIN,
      MIN_URL_COUNT,
    );
    expect(errors.some((e) => e.includes("https://"))).toBe(true);
    expect(nonHttpsLocs).toContain(httpLoc);
    expect(sitemapIndexLocCount).toBe(2);
  });

  it("fails when a sitemap index <loc> uses the wrong canonical origin", () => {
    const wrongOriginLoc = "https://staging.presentail.com/sitemap-0.xml";
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `  <sitemap><loc>${wrongOriginLoc}</loc></sitemap>\n` +
      `</sitemapindex>`;
    const { errors, wrongOriginLocs } = checkSitemapContent(
      xml,
      CANONICAL_ORIGIN,
      MIN_URL_COUNT,
    );
    expect(errors.some((e) => e.includes("canonical origin"))).toBe(true);
    expect(wrongOriginLocs).toContain(wrongOriginLoc);
  });

  it("handles a mixed payload with both <url> and <sitemap> <loc> entries", () => {
    // Unusual but possible: a file that contains both standard <url> entries
    // and sitemap index <sitemap> entries.  Both sets of locs must be checked.
    const httpIndexLoc = "http://presentail.com/sitemap-extra.xml";
    const urlLocs = Array.from(
      { length: MIN_URL_COUNT },
      (_, i) =>
        `  <url><loc>${CANONICAL_ORIGIN}/en-lb/beirut/product/item-${i}</loc></url>`,
    ).join("\n");
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urlLocs +
      `\n  <sitemap><loc>https://presentail.com/sitemap-valid.xml</loc></sitemap>\n` +
      `  <sitemap><loc>${httpIndexLoc}</loc></sitemap>\n` +
      `</urlset>`;
    const { errors, nonHttpsLocs, urlCount, sitemapIndexLocCount } =
      checkSitemapContent(xml, CANONICAL_ORIGIN, MIN_URL_COUNT);
    expect(errors.some((e) => e.includes("https://"))).toBe(true);
    expect(nonHttpsLocs).toContain(httpIndexLoc);
    expect(urlCount).toBe(MIN_URL_COUNT);
    expect(sitemapIndexLocCount).toBe(2);
  });

  it("does not apply the minimum URL count check to a pure sitemap index", () => {
    // A sitemap index has very few entries (one per sub-sitemap file) so the
    // standard MIN_URL_COUNT threshold must not be applied to it.
    const xml = buildValidSitemapIndex(3);
    const { errors } = checkSitemapContent(xml, CANONICAL_ORIGIN, MIN_URL_COUNT);
    expect(errors.some((e) => e.includes("entr") && e.includes("expected at least"))).toBe(false);
  });

  it("reports sitemapIndexLocCount correctly in the result", () => {
    const xml = buildValidSitemapIndex(7);
    const { sitemapIndexLocCount } = checkSitemapContent(
      xml,
      CANONICAL_ORIGIN,
      MIN_URL_COUNT,
    );
    expect(sitemapIndexLocCount).toBe(7);
  });

  it("fails when the closing </sitemapindex> tag is missing (truncated response)", () => {
    const xml = buildValidSitemapIndex(3).replace("</sitemapindex>", "");
    const { errors } = checkSitemapContent(xml, CANONICAL_ORIGIN, MIN_URL_COUNT);
    expect(errors.some((e) => e.includes("</sitemapindex>"))).toBe(true);
  });

  it("fails when there is an extra unclosed <sitemap> tag (opening without closing)", () => {
    // Append an opening <sitemap> without a matching </sitemap> before the
    // closing </sitemapindex> — simulates a generator that started writing an
    // entry but threw before finishing it.
    const xml = buildValidSitemapIndex(3).replace(
      "</sitemapindex>",
      "  <sitemap><loc>https://presentail.com/sitemap-extra.xml</loc>\n</sitemapindex>",
    );
    const { errors } = checkSitemapContent(xml, CANONICAL_ORIGIN, MIN_URL_COUNT);
    expect(errors.some((e) => e.includes("Mismatched <sitemap> tag counts"))).toBe(true);
  });

  it("fails when there is an extra stray </sitemap> closing tag with no opener", () => {
    // Inject a bare </sitemap> that has no matching opening tag.
    const xml = buildValidSitemapIndex(3).replace(
      "</sitemapindex>",
      "</sitemap>\n</sitemapindex>",
    );
    const { errors } = checkSitemapContent(xml, CANONICAL_ORIGIN, MIN_URL_COUNT);
    expect(errors.some((e) => e.includes("Mismatched <sitemap> tag counts"))).toBe(true);
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
