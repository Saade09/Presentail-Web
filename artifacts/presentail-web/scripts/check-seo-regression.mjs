#!/usr/bin/env node
/**
 * check-seo-regression.mjs
 *
 * Automated SEO regression tests for presentail.com.
 * Implements the 25 checks specified in SEO-12 planning task.
 *
 * Usage:
 *   node artifacts/presentail-web/scripts/check-seo-regression.mjs [base-url]
 *   node artifacts/presentail-web/scripts/check-seo-regression.mjs --dry-run
 *
 * Exits 0 when all checks pass, 1 when any check fails.
 * --dry-run fetches URLs and prints results but does not exit non-zero.
 */

import { createRequire } from "module";

const BASE = process.argv.find((a) => a.startsWith("http")) ?? "https://presentail.com";
const DRY_RUN = process.argv.includes("--dry-run");

const PASS = "✅ PASS";
const FAIL = "❌ FAIL";
const WARN = "⚠️  WARN";

const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

async function fetchText(url, { followRedirects = true } = {}) {
  const opts = followRedirects ? {} : { redirect: "manual" };
  const res = await fetch(url, opts);
  const text = await res.text().catch(() => "");
  return { status: res.status, headers: Object.fromEntries(res.headers.entries()), text, url: res.url };
}

async function fetchHead(url) {
  const res = await fetch(url, { method: "HEAD", redirect: "manual" }).catch(() => null);
  if (!res) return { status: 0, headers: {}, location: "" };
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    location: res.headers.get("location") ?? "",
  };
}

function extractMeta(html, name) {
  const m = html.match(new RegExp(`name=["']${name}["']\\s+content=["']([^"']*)["']`));
  const m2 = html.match(new RegExp(`content=["']([^"']*)["']\\s+name=["']${name}["']`));
  return (m?.[1] ?? m2?.[1] ?? "").trim();
}

function extractOgProp(html, prop) {
  const m = html.match(new RegExp(`property=["']${prop}["']\\s+content=["']([^"']*)["']`));
  const m2 = html.match(new RegExp(`content=["']([^"']*)["']\\s+property=["']${prop}["']`));
  return (m?.[1] ?? m2?.[1] ?? "").trim();
}

function extractTitle(html) {
  return (html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "").trim();
}

function extractCanonical(html) {
  return (html.match(/rel=["']canonical["'][^>]*href=["']([^"']*)["']/)?.[1] ?? "").trim();
}

function extractLang(html) {
  return html.match(/<html[^>]+lang=["']([^"']*)["']/)?.[1] ?? "";
}

function extractDir(html) {
  return html.match(/<html[^>]+dir=["']([^"']*)["']/)?.[1] ?? "";
}

function extractH1Count(html) {
  return (html.match(/<h1[\s>]/gi) ?? []).length;
}

function extractHreflangCount(html) {
  return (html.match(/rel=["']alternate["'][^>]*hreflang/gi) ?? []).length;
}

function extractHreflangValues(html) {
  const matches = [...html.matchAll(/hreflang=["']([^"']*)["']/gi)];
  return matches.map((m) => m[1]);
}

function extractJsonLdBlocks(html) {
  const blocks = [];
  const re = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      blocks.push(JSON.parse(m[1]));
    } catch {
      // skip unparseable blocks
    }
  }
  return blocks;
}

function getGraphNodes(jsonld) {
  const nodes = [];
  for (const block of jsonld) {
    if (block["@graph"]) nodes.push(...block["@graph"]);
    else nodes.push(block);
  }
  return nodes;
}

function decodeHtml(str) {
  return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

// ── helpers ──────────────────────────────────────────────────────────────────

const INDEXABLE = [
  `${BASE}/`,
  `${BASE}/en-lb/beirut`,
  `${BASE}/ar-lb/beirut`,
  `${BASE}/fr-lb/beirut`,
  `${BASE}/en-ae/dubai`,
  `${BASE}/en-cy/limassol`,
  `${BASE}/en-lb/beirut/shop`,
  `${BASE}/en-lb/beirut/brands`,
  `${BASE}/en-lb/beirut/occasions`,
];

const PRIVATE = [
  `${BASE}/en-lb/beirut/checkout`,
  `${BASE}/en-lb/beirut/cart`,
  `${BASE}/en-lb/beirut/account`,
];

// ── run checks ────────────────────────────────────────────────────────────────

async function runChecks() {
  console.log(`\nSEO Regression — ${BASE}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Dry-run: ${DRY_RUN}`);
  console.log("─".repeat(72));

  // 1. HTTP 200 on all indexable pages
  {
    const fails = [];
    for (const url of INDEXABLE) {
      const r = await fetchHead(url);
      if (r.status !== 200) fails.push(`${url} → ${r.status}`);
    }
    record("HTTP 200 — all indexable pages", fails.length === 0, fails.join(", ") || "all 200");
  }

  // 2. <html lang> attribute
  {
    const cases = [
      [`${BASE}/en-lb/beirut`, "en"],
      [`${BASE}/ar-lb/beirut`, "ar"],
      [`${BASE}/fr-lb/beirut`, "fr"],
    ];
    const fails = [];
    for (const [url, expected] of cases) {
      const r = await fetchText(url);
      const lang = extractLang(r.text);
      if (lang !== expected) fails.push(`${url}: lang="${lang}" (expected "${expected}")`);
    }
    record("<html lang> set correctly (EN/AR/FR)", fails.length === 0, fails.join("; ") || "en, ar, fr all correct");
  }

  // 3. <html dir> for Arabic/non-Arabic
  {
    const cases = [
      [`${BASE}/ar-lb/beirut`, "rtl"],
      [`${BASE}/en-lb/beirut`, "ltr"],
      [`${BASE}/fr-lb/beirut`, "ltr"],
    ];
    const fails = [];
    for (const [url, expected] of cases) {
      const r = await fetchText(url);
      const dir = extractDir(r.text);
      if (dir !== expected) fails.push(`${url}: dir="${dir}" (expected "${expected}")`);
    }
    record("<html dir> correct (ar=rtl, others=ltr)", fails.length === 0, fails.join("; ") || "all correct");
  }

  // 4. <meta name="description"> non-empty and ≤155 chars
  {
    const fails = [];
    for (const url of INDEXABLE) {
      const r = await fetchText(url);
      const desc = extractMeta(r.text, "description");
      if (!desc) fails.push(`${url}: missing`);
      else if (desc.length > 155) fails.push(`${url}: ${desc.length} chars (max 155)`);
    }
    record("<meta description> non-empty and ≤155 chars", fails.length === 0, fails.join("; ") || "all present and within limit");
  }

  // 5. <link rel="canonical"> present and self-referencing
  {
    const urls = [
      `${BASE}/en-lb/beirut`,
      `${BASE}/en-lb/beirut/shop`,
      `${BASE}/ar-lb/beirut`,
    ];
    const fails = [];
    for (const url of urls) {
      const r = await fetchText(url);
      const canonical = extractCanonical(r.text);
      if (!canonical) {
        fails.push(`${url}: missing`);
      } else if (canonical !== url) {
        fails.push(`${url}: canonical="${canonical}"`);
      }
    }
    record("<link rel=canonical> present & self-referencing", fails.length === 0, fails.join("; ") || "all self-referencing");
  }

  // 6. Hreflang set on home (at least en-LB, ar-LB, fr-LB, x-default)
  {
    const r = await fetchText(`${BASE}/en-lb/beirut`);
    const hreflangs = extractHreflangValues(r.text);
    const required = ["en-LB", "ar-LB", "fr-LB", "x-default"];
    const missing = required.filter((v) => !hreflangs.includes(v));
    record("Hreflang set completeness on home (en-LB, ar-LB, fr-LB, x-default)", missing.length === 0,
      missing.length === 0 ? `present: ${hreflangs.join(", ")}` : `missing: ${missing.join(", ")}`);
  }

  // 7. og:title and og:description non-empty
  {
    const r = await fetchText(`${BASE}/en-lb/beirut`);
    const ogTitle = extractOgProp(r.text, "og:title");
    const ogDesc = extractOgProp(r.text, "og:description");
    const ok = ogTitle.length > 0 && ogDesc.length > 0;
    record("og:title and og:description non-empty", ok,
      ok ? `og:title="${ogTitle}", og:description="${ogDesc.substring(0, 60)}…"` : `og:title="${ogTitle}", og:description="${ogDesc}"`);
  }

  // 8. JSON-LD present on all page types
  {
    const fails = [];
    for (const url of INDEXABLE) {
      const r = await fetchText(url);
      const count = (r.text.match(/application\/ld\+json/g) ?? []).length;
      if (count === 0) fails.push(url);
    }
    record("JSON-LD present on all indexable page types", fails.length === 0,
      fails.length === 0 ? "all pages have ≥1 JSON-LD block" : `missing on: ${fails.join(", ")}`);
  }

  // 9. JSON-LD Organization on home
  {
    const r = await fetchText(`${BASE}/en-lb/beirut`);
    const nodes = getGraphNodes(extractJsonLdBlocks(r.text));
    const org = nodes.find((n) => n["@type"] === "Organization");
    const ok = !!org && !!org.name && !!org.url;
    record("JSON-LD Organization schema on homepage", ok, ok ? `name="${org.name}", url="${org.url}"` : "Organization node missing or incomplete");
  }

  // 10. JSON-LD BreadcrumbList present on home
  {
    const r = await fetchText(`${BASE}/en-lb/beirut`);
    const nodes = getGraphNodes(extractJsonLdBlocks(r.text));
    const crumb = nodes.find((n) => n["@type"] === "BreadcrumbList");
    const items = crumb?.itemListElement ?? [];
    const ok = !!crumb && items.length >= 2;
    record("JSON-LD BreadcrumbList with ≥2 items on homepage", ok,
      ok ? `${items.length} items` : crumb ? `only ${items.length} items` : "BreadcrumbList missing");
  }

  // 11. No AggregateRating fabricated
  {
    const r = await fetchText(`${BASE}/en-lb/beirut/product/red-roses-bouquet`);
    const found = r.text.includes("AggregateRating");
    record("No fabricated AggregateRating in product JSON-LD", !found, found ? "AggregateRating found — verify it uses real data" : "AggregateRating absent ✓");
  }

  // 12. noindex on private pages
  {
    const fails = [];
    for (const url of PRIVATE) {
      const r = await fetchText(url);
      const robots = extractMeta(r.text, "robots");
      if (!robots.includes("noindex")) fails.push(`${url}: robots="${robots}"`);
    }
    record("noindex on private pages (checkout, cart, account)", fails.length === 0,
      fails.length === 0 ? "all private pages have noindex" : fails.join("; "));
  }

  // 13. No noindex on shop/product/category pages
  {
    const urls = [`${BASE}/en-lb/beirut/shop`, `${BASE}/en-lb/beirut/occasions`, `${BASE}/en-lb/beirut/brands`];
    const fails = [];
    for (const url of urls) {
      const r = await fetchText(url);
      const robots = extractMeta(r.text, "robots");
      if (robots.includes("noindex")) fails.push(`${url}: robots="${robots}"`);
    }
    record("No noindex on indexable collection pages", fails.length === 0,
      fails.length === 0 ? "no noindex on collection pages" : fails.join("; "));
  }

  // 14. <h1> count === 1 per indexable page
  {
    const fails = [];
    for (const url of INDEXABLE.slice(0, 5)) {
      const r = await fetchText(url);
      const count = extractH1Count(r.text);
      if (count !== 1) fails.push(`${url}: ${count} h1 tags`);
    }
    record("<h1> count === 1 per page (sample)", fails.length === 0,
      fails.length === 0 ? "all sampled pages have exactly 1 h1" : fails.join("; "));
  }

  // 15. Sitemap HTTP 200
  {
    const r = await fetchHead(`${BASE}/sitemap.xml`);
    record("sitemap.xml returns HTTP 200", r.status === 200, `HTTP ${r.status}`);
  }

  // 16. Sitemap excludes private paths
  {
    const r = await fetchText(`${BASE}/sitemap.xml`);
    const hasCheckout = r.text.includes("/checkout");
    const hasCart = r.text.includes("/cart");
    const hasAccount = r.text.includes("/account");
    const ok = !hasCheckout && !hasCart && !hasAccount;
    const urlCount = (r.text.match(/<loc>/g) ?? []).length;
    const hreflangCount = (r.text.match(/xhtml:link/g) ?? []).length;
    record("sitemap.xml excludes /checkout, /cart, /account", ok,
      `${urlCount} URLs, ${hreflangCount} hreflang entries; private paths: checkout=${hasCheckout}, cart=${hasCart}, account=${hasAccount}`);
  }

  // 17. robots.txt HTTP 200
  {
    const r = await fetchHead(`${BASE}/robots.txt`);
    record("robots.txt returns HTTP 200", r.status === 200, `HTTP ${r.status}`);
  }

  // 18. www redirect
  {
    const r = await fetchHead(`https://www.presentail.com/`);
    const ok = r.status === 301 && r.location.includes("presentail.com");
    record("www.presentail.com redirects 301 to presentail.com", ok, `HTTP ${r.status} → ${r.location}`);
  }

  // 19. Trailing-slash redirect
  {
    const r = await fetchHead(`${BASE}/en-lb/beirut/shop/`);
    const ok = r.status === 301 || r.status === 308;
    record("Trailing-slash redirects (301/308) on collection pages", ok, `HTTP ${r.status} → ${r.location}`);
  }

  // 20. llms.txt HTTP 200
  {
    const r = await fetchHead(`${BASE}/llms.txt`);
    record("llms.txt returns HTTP 200", r.status === 200, `HTTP ${r.status}`);
  }

  // 21. llms.txt content-type = text/plain
  {
    const r = await fetchHead(`${BASE}/llms.txt`);
    const ct = r.headers["content-type"] ?? "";
    const ok = ct.startsWith("text/plain");
    record("llms.txt Content-Type: text/plain", ok, `Content-Type: ${ct}`);
  }

  // 22. llms.txt has summary paragraph (after title, before ## Pages)
  {
    const r = await fetchText(`${BASE}/llms.txt`);
    const text = r.text;
    const titleIdx = text.indexOf("# Presentail");
    const pagesIdx = text.indexOf("## Pages");
    const between = titleIdx >= 0 && pagesIdx > titleIdx ? text.slice(titleIdx + "# Presentail".length, pagesIdx).trim() : "";
    const hasSummary = between.length > 20;
    record("llms.txt has summary paragraph before ## Pages", hasSummary,
      hasSummary ? `summary: "${between.substring(0, 80)}…"` : "no summary found between title and ## Pages");
  }

  // 23. llms-full.txt HTTP 200
  {
    const r = await fetchHead(`${BASE}/llms-full.txt`);
    record("llms-full.txt returns HTTP 200", r.status === 200, `HTTP ${r.status}`);
  }

  // 24. sitemap.xml hreflang coverage — % of <url> blocks that have at least one xhtml:link hreflang entry
  {
    const r = await fetchText(`${BASE}/sitemap.xml`);
    // Count total <url> blocks
    const urlBlocks = (r.text.match(/<url>/g) ?? []).length;
    // Count <url> blocks that contain at least one xhtml:link element (hreflang entry)
    const urlsWithHreflang = (r.text.split(/<url>/).slice(1).filter((b) => b.includes("xhtml:link"))).length;
    const pct = urlBlocks > 0 ? Math.round((urlsWithHreflang / urlBlocks) * 100) : 0;
    const ok = urlsWithHreflang > 0;
    record("sitemap.xml hreflang coverage", ok,
      `${urlsWithHreflang}/${urlBlocks} <url> blocks have hreflang alternates (${pct}% coverage)`);
  }

  // 25. Product page has canonical
  {
    const r = await fetchText(`${BASE}/en-lb/beirut/product/red-roses-bouquet`);
    const canonical = extractCanonical(r.text);
    const ok = canonical.length > 0 && canonical.includes("red-roses-bouquet");
    record("Product page has self-referencing canonical", ok, canonical ? `canonical="${canonical}"` : "canonical missing");
  }
}

await runChecks();

// ── summary ───────────────────────────────────────────────────────────────────

console.log("\n" + "═".repeat(72));
console.log("CHECK RESULTS");
console.log("═".repeat(72));

let passed = 0;
let failed = 0;
for (const r of results) {
  const icon = r.passed ? PASS : FAIL;
  console.log(`${icon}  ${r.name}`);
  if (r.detail) console.log(`         ${r.detail}`);
  if (r.passed) passed++;
  else failed++;
}

console.log("\n" + "─".repeat(72));
console.log(`TOTAL: ${passed} passed, ${failed} failed, ${results.length} total`);
console.log("─".repeat(72) + "\n");

if (!DRY_RUN && failed > 0) {
  process.exit(1);
}
