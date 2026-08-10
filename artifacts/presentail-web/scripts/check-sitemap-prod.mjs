#!/usr/bin/env node
/**
 * check-sitemap-prod.mjs
 *
 * Fetches /sitemap-ar.xml and /sitemap-fr.xml from the production domain
 * (https://presentail.com by default, or the URL passed as the first CLI
 * argument) and asserts that the Achrafieh and Roses blog posts appear as
 * <loc> entries with correct hreflang alternates.
 *
 * Usage:
 *   node artifacts/presentail-web/scripts/check-sitemap-prod.mjs [base-url]
 *
 * Exits 0 when all checks pass, 1 when any check fails.
 */

const BASE = process.argv[2] ?? "https://presentail.com";

// ── Slugs & locales to assert ─────────────────────────────────────────────────

const BLOG_SLUGS = [
  "flower-shop-in-achrafieh",
  "send-roses-to-lebanon",
];

const LOCALE_SITEMAPS = ["ar", "fr"];

// hreflang values expected on every blog-article <url> entry.
const EXPECTED_HREFLANGS = ["en", "ar", "fr", "x-default"];

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function pass(msg) {
  console.log(`PASS  ${msg}`);
  passed++;
}

function fail(msg) {
  console.log(`FAIL  ${msg}`);
  failed++;
}

/**
 * Fetch a URL and return the response text. Throws on network error or
 * non-2xx status.
 */
async function fetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Very lightweight XML parser: extract all <loc> text values and their
 * surrounding <url> block so we can inspect hreflang alternates without
 * pulling in a full DOM library.
 *
 * Returns an array of objects: { loc: string, block: string }
 * where `block` is the raw <url>…</url> XML string.
 */
function parseUrlEntries(xml) {
  const entries = [];
  // Match each <url>…</url> block (non-greedy, DOTALL via [\s\S]).
  const urlRe = /<url>([\s\S]*?)<\/url>/g;
  let urlMatch;
  while ((urlMatch = urlRe.exec(xml)) !== null) {
    const block = urlMatch[1];
    const locMatch = /<loc>([^<]+)<\/loc>/.exec(block);
    if (locMatch) {
      entries.push({ loc: locMatch[1].trim(), block });
    }
  }
  return entries;
}

/**
 * Extract hreflang attribute values from a <url> block string.
 * Returns an array of hreflang strings found on xhtml:link elements.
 */
function parseHreflangs(block) {
  const hreflangs = [];
  const re = /hreflang="([^"]+)"/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    hreflangs.push(m[1]);
  }
  return hreflangs;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function checkSitemap(locale) {
  const url = `${BASE}/sitemap-${locale}.xml`;
  let xml;
  try {
    xml = await fetchText(url);
  } catch (err) {
    fail(`fetch ${url} — ${err.message}`);
    // Can't do further checks for this locale.
    for (const slug of BLOG_SLUGS) {
      fail(`/${locale}/blog/${slug} — sitemap unreachable`);
    }
    return;
  }

  pass(`fetch ${url} (${xml.length.toLocaleString()} bytes)`);

  const entries = parseUrlEntries(xml);

  for (const slug of BLOG_SLUGS) {
    const encodedSlug = encodeURIComponent(slug);
    // The <loc> value for this locale's article.
    const expectedLoc = `${BASE}/${locale}/blog/${encodedSlug}`;
    // Also accept unencoded slug (slug has no special chars, so they're equal,
    // but be defensive).
    const expectedLocPlain = `${BASE}/${locale}/blog/${slug}`;

    const entry = entries.find(
      (e) => e.loc === expectedLoc || e.loc === expectedLocPlain,
    );

    if (!entry) {
      fail(`<loc> missing: ${expectedLocPlain}`);
      continue;
    }

    pass(`<loc> present: ${expectedLocPlain}`);

    // Assert hreflang alternates.
    const hreflangs = parseHreflangs(entry.block);

    for (const expected of EXPECTED_HREFLANGS) {
      if (hreflangs.includes(expected)) {
        pass(`  hreflang="${expected}" on ${expectedLocPlain}`);
      } else {
        fail(`  hreflang="${expected}" missing on ${expectedLocPlain} (found: ${hreflangs.join(", ") || "none"})`);
      }
    }

    // Also assert that the en/ alternate href actually points at the English URL.
    const enHrefMatch = entry.block.match(/hreflang="en"[^>]*href="([^"]+)"/);
    // Try the other attribute order too.
    const enHrefMatch2 = entry.block.match(/href="([^"]+)"[^>]*hreflang="en"/);
    const enHref = enHrefMatch?.[1] ?? enHrefMatch2?.[1];

    if (enHref) {
      const expectedEnHref = `${BASE}/en/blog/${slug}`;
      if (enHref === expectedEnHref) {
        pass(`  en href correct: ${enHref}`);
      } else {
        fail(`  en href wrong: got "${enHref}", want "${expectedEnHref}"`);
      }
    } else {
      fail(`  could not parse en href on ${expectedLocPlain}`);
    }
  }
}

// Run checks for all locale sitemaps in parallel.
await Promise.all(LOCALE_SITEMAPS.map(checkSitemap));

console.log("");
console.log(`Results: ${passed} passed, ${failed} failed`);

process.exit(failed > 0 ? 1 : 0);
