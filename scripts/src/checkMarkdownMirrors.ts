export {};

/**
 * checkMarkdownMirrors
 *
 * Integration test that verifies the per-page Markdown mirror system on the
 * running Presentail web server. Tests the following for each representative
 * page:
 *
 *   1. GET <path>.md returns HTTP 200 with Content-Type: text/markdown
 *   2. GET <path>.md body starts with YAML frontmatter ("---")
 *   3. YAML frontmatter includes all required fields
 *   4. GET <path> with Accept: text/markdown returns the same content
 *   5. GET <path> (HTML) includes <link rel="alternate" type="text/markdown">
 *   6. GET <path> (HTML) Link response header includes the .md alternate
 *   7. GET <path>.md Link response header includes rel="canonical" for HTML URL
 *
 * Additionally verifies:
 *   - /sitemap.md references per-page .md URLs
 *   - Private paths (cart, checkout) do NOT have .md mirrors (404)
 *   - Unknown .md paths return 404
 *
 * Coverage (minimum per task spec):
 *   - Homepage (root landing redirect): tested via /en-lb/beirut.md
 *   - City page: /en-lb/beirut.md
 *   - Shop page: /en-lb/beirut/shop.md
 *   - Category: /en-lb/beirut/category/<slug>.md
 *   - Occasion: /en-lb/beirut/occasion/<slug>.md
 *   - UAE city page: /en-ae/dubai.md
 *   - Cyprus city page: /en-cy/nicosia.md
 *
 * Exit codes
 * ──────────
 *   0 — all checks passed
 *   1 — one or more checks failed, or the server is not reachable
 *
 * Usage
 * ─────
 *   pnpm --filter @workspace/scripts run check-markdown-mirrors
 *
 * Environment
 * ───────────
 *   WEB_BASE_URL — base URL of the running web server (default: http://localhost:80)
 */

const BASE_URL = (process.env.WEB_BASE_URL ?? "http://localhost:80").replace(/\/$/, "");

// ---------------------------------------------------------------------------
// Required YAML frontmatter fields
// ---------------------------------------------------------------------------

const REQUIRED_FRONTMATTER_FIELDS = [
  "title",
  "description",
  "canonical_url",
  "markdown_url",
  "language",
  "locale",
  "page_type",
  "site_name",
  "last_modified",
];

// ---------------------------------------------------------------------------
// Test pages
// ---------------------------------------------------------------------------

const TEST_PAGES = [
  { path: "/en-lb/beirut",        label: "City home (Beirut, LB)",     expectType: "city_home" },
  { path: "/en-lb/beirut/shop",   label: "Shop page (Beirut)",         expectType: "shop" },
  { path: "/en-lb/beirut/brands", label: "Brands list (Beirut)",       expectType: "brands_list" },
  { path: "/en-lb/beirut/occasions", label: "Occasions list (Beirut)", expectType: "occasions_list" },
  { path: "/en-lb/beirut/contact", label: "Contact page (Beirut)",     expectType: "contact" },
  { path: "/en-lb/beirut/faqs",   label: "FAQs page (Beirut)",         expectType: "faqs" },
  { path: "/en-lb/beirut/weddings", label: "Weddings page (Beirut)",   expectType: "weddings" },
  { path: "/en-lb/beirut/corporate", label: "Corporate page (Beirut)", expectType: "corporate" },
  { path: "/en-ae/dubai",         label: "City home (Dubai, UAE)",      expectType: "city_home" },
  { path: "/en-cy/nicosia",       label: "City home (Nicosia, Cyprus)", expectType: "city_home" },
  { path: "/ar-lb/beirut",        label: "City home (Beirut, AR)",      expectType: "city_home" },
  { path: "/fr-lb/beirut",        label: "City home (Beirut, FR)",      expectType: "city_home" },
];

// Dynamic pages — we discover slugs at test time from catalog metadata.
// Falls back to known static slugs when the API is unreachable.
const STATIC_CATEGORY_SLUG = "hand-bouquets";
const STATIC_OCCASION_SLUG = "birthday";
const STATIC_BRAND_SLUG = "bloom-boutique"; // present in live catalog; fallback only
const STATIC_PRODUCT_SLUG = "luxury-rose-bouquet"; // fallback only

// Non-mirrored pages — .md variant must return 404.
const NON_MIRRORED_PATHS = [
  "/en-lb/beirut/cart",
  "/en-lb/beirut/checkout",
  "/en-lb/beirut/account",
  "/en-lb/beirut/sign-in",
  "/en-lb/beirut/sign-up",
  "/unknown-path",
  "/sitemap.xml", // not a per-page mirror
];

// Unknown dynamic slugs — must return 404 (entity not in catalog).
const UNKNOWN_DYNAMIC_PATHS = [
  "/en-lb/beirut/product/this-product-does-not-exist-xyzzy",
  "/en-lb/beirut/brand/this-brand-does-not-exist-xyzzy",
  "/en-lb/beirut/category/this-category-does-not-exist-xyzzy",
  "/en-lb/beirut/occasion/this-occasion-does-not-exist-xyzzy",
];

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

interface CheckResult {
  label: string;
  pass: boolean;
  message: string;
}

const results: CheckResult[] = [];

function pass(label: string, message: string): void {
  results.push({ label, pass: true, message });
}

function fail(label: string, message: string): void {
  results.push({ label, pass: false, message });
  console.error(`  FAIL  ${label}: ${message}`);
}

async function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  timeoutMs = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse YAML frontmatter fields from a Markdown string.
 * Returns a key→value map for the first --- block.
 */
function parseFrontmatter(md: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const lines = md.split("\n");
  if (lines[0]?.trim() !== "---") return fields;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "---") break;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    // Strip surrounding JSON quotes if present
    if (value.startsWith('"') && value.endsWith('"')) {
      try { value = JSON.parse(value); } catch { /* keep raw */ }
    }
    fields[key] = value;
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Core checks
// ---------------------------------------------------------------------------

async function checkMdPath(label: string, path: string): Promise<void> {
  const mdUrl = `${BASE_URL}${path}.md`;
  const prefix = `[${label}]`;

  // 1. GET <path>.md → 200 with text/markdown
  let res: Response;
  try {
    res = await fetchWithTimeout(mdUrl, {});
  } catch (err: unknown) {
    fail(`${prefix} GET .md status`, `fetch failed: ${(err as Error).message}`);
    return;
  }

  if (res.status !== 200) {
    fail(`${prefix} GET .md status`, `expected 200, got ${res.status}`);
    return;
  }
  pass(`${prefix} GET .md status`, "HTTP 200");

  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("text/markdown")) {
    fail(`${prefix} GET .md content-type`, `expected text/markdown, got "${ct}"`);
  } else {
    pass(`${prefix} GET .md content-type`, ct);
  }

  // 2. Body starts with YAML frontmatter
  const body = await res.text();
  if (!body.startsWith("---")) {
    fail(`${prefix} frontmatter present`, "body does not start with ---");
    return;
  }
  pass(`${prefix} frontmatter present`, "starts with ---");

  // 3. All required frontmatter fields present
  const fm = parseFrontmatter(body);
  const missing = REQUIRED_FRONTMATTER_FIELDS.filter((k) => !(k in fm) || !fm[k]);
  if (missing.length > 0) {
    fail(`${prefix} frontmatter fields`, `missing: ${missing.join(", ")}`);
  } else {
    pass(`${prefix} frontmatter fields`, "all required fields present");
  }

  // 4. Link response header includes rel="canonical"
  const linkHeader = res.headers.get("link") ?? "";
  if (!linkHeader.includes('rel="canonical"') && !linkHeader.includes("rel=canonical")) {
    fail(`${prefix} Link header canonical`, `Link header missing canonical: "${linkHeader}"`);
  } else {
    pass(`${prefix} Link header canonical`, "present");
  }

  // 5. markdown_url field matches request URL (strip origin for portability)
  if (fm.markdown_url) {
    const mdUrlSuffix = `${path}.md`;
    if (!fm.markdown_url.endsWith(mdUrlSuffix)) {
      fail(`${prefix} markdown_url`, `expected to end with "${mdUrlSuffix}", got "${fm.markdown_url}"`);
    } else {
      pass(`${prefix} markdown_url`, fm.markdown_url);
    }
  }

  // 6. canonical_url field matches the HTML path (not .md)
  if (fm.canonical_url) {
    if (!fm.canonical_url.endsWith(path)) {
      fail(`${prefix} canonical_url`, `expected to end with "${path}", got "${fm.canonical_url}"`);
    } else {
      pass(`${prefix} canonical_url`, fm.canonical_url);
    }
  }
}

async function checkContentNegotiation(label: string, path: string): Promise<void> {
  const htmlUrl = `${BASE_URL}${path}`;
  const mdUrl = `${BASE_URL}${path}.md`;
  const prefix = `[${label}] content-neg`;

  // Fetch .md directly first so we can compare body content.
  let mdRes: Response;
  try {
    mdRes = await fetchWithTimeout(mdUrl, {});
  } catch (err: unknown) {
    fail(`${prefix}`, `direct .md fetch failed: ${(err as Error).message}`);
    return;
  }
  if (mdRes.status !== 200) {
    fail(`${prefix}`, `direct .md returned ${mdRes.status}, skipping content-neg check`);
    return;
  }
  const mdBody = await mdRes.text();

  // Fetch the HTML URL with Accept: text/markdown preferred.
  let res: Response;
  try {
    res = await fetchWithTimeout(htmlUrl, {
      headers: { Accept: "text/markdown, */*;q=0.1" },
    });
  } catch (err: unknown) {
    fail(`${prefix}`, `fetch failed: ${(err as Error).message}`);
    return;
  }

  if (res.status !== 200) {
    fail(`${prefix} status`, `expected 200, got ${res.status}`);
    return;
  }
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("text/markdown")) {
    fail(`${prefix} content-type`, `expected text/markdown, got "${ct}"`);
    return;
  }
  pass(`${prefix}`, "served text/markdown via Accept header");
  const body = await res.text();
  if (!body.startsWith("---")) {
    fail(`${prefix} body`, "Markdown body does not start with ---");
  } else {
    pass(`${prefix} body`, "YAML frontmatter present");
  }

  // Content negotiation body must equal the direct .md body.
  if (body !== mdBody) {
    fail(`${prefix} body equality`, "content-neg body differs from direct .md body");
  } else {
    pass(`${prefix} body equality`, "content-neg body matches .md body");
  }

  // Verify that a browser-style Accept header (text/html preferred) does NOT
  // trigger Markdown content negotiation.
  let htmlPrefRes: Response;
  try {
    htmlPrefRes = await fetchWithTimeout(htmlUrl, {
      headers: { Accept: "text/html,application/xhtml+xml,*/*;q=0.9" },
    });
  } catch (err: unknown) {
    fail(`${prefix} html-preferred`, `fetch failed: ${(err as Error).message}`);
    return;
  }
  const htmlPrefCt = htmlPrefRes.headers.get("content-type") ?? "";
  if (htmlPrefCt.includes("text/markdown")) {
    fail(`${prefix} html-preferred`, `browser Accept header should NOT receive text/markdown, got "${htmlPrefCt}"`);
  } else {
    pass(`${prefix} html-preferred`, "browser Accept header correctly receives HTML");
  }
}

async function checkHtmlAlternateLink(label: string, path: string): Promise<void> {
  const htmlUrl = `${BASE_URL}${path}`;
  const prefix = `[${label}] HTML`;

  let res: Response;
  try {
    res = await fetchWithTimeout(htmlUrl, {
      headers: { Accept: "text/html" },
    });
  } catch (err: unknown) {
    fail(`${prefix} fetch`, `fetch failed: ${(err as Error).message}`);
    return;
  }

  if (res.status !== 200) {
    fail(`${prefix} status`, `expected 200, got ${res.status}`);
    return;
  }

  // Check Link header includes .md alternate
  const linkHeader = res.headers.get("link") ?? "";
  if (!linkHeader.includes("text/markdown")) {
    fail(`${prefix} Link header alternate`, `Link header missing text/markdown alternate: "${linkHeader}"`);
  } else {
    pass(`${prefix} Link header alternate`, "present");
  }

  // Check HTML head includes <link rel="alternate" type="text/markdown">
  const htmlBody = await res.text();
  if (!htmlBody.includes('rel="alternate"') || !htmlBody.includes("text/markdown")) {
    fail(`${prefix} head link tag`, "<link rel=\"alternate\" type=\"text/markdown\"> not found in HTML head");
  } else {
    pass(`${prefix} head link tag`, "<link rel=\"alternate\" type=\"text/markdown\"> present");
  }
}

async function checkNonMirrored(path: string): Promise<void> {
  const mdUrl = `${BASE_URL}${path}.md`;
  const label = `[non-mirrored ${path}]`;

  let res: Response;
  try {
    res = await fetchWithTimeout(mdUrl, {});
  } catch (err: unknown) {
    fail(`${label} 404`, `fetch failed: ${(err as Error).message}`);
    return;
  }

  if (res.status !== 404) {
    fail(`${label} 404`, `expected 404, got ${res.status}`);
  } else {
    pass(`${label} 404`, `correctly returned 404`);
  }
}

async function checkSitemapMd(): Promise<void> {
  const label = "[/sitemap.md]";
  let res: Response;
  try {
    res = await fetchWithTimeout(`${BASE_URL}/sitemap.md`, {});
  } catch (err: unknown) {
    fail(`${label} fetch`, `fetch failed: ${(err as Error).message}`);
    return;
  }

  if (res.status !== 200) {
    fail(`${label} status`, `expected 200, got ${res.status}`);
    return;
  }
  pass(`${label} status`, "HTTP 200");

  const body = await res.text();

  // sitemap.md must start with frontmatter or a heading
  if (!body.startsWith("---") && !body.startsWith("#")) {
    fail(`${label} body format`, "body does not start with --- or # heading");
  } else {
    pass(`${label} body format`, "valid Markdown");
  }

  // Must reference per-page .md URLs
  if (!body.includes(".md)")) {
    fail(`${label} .md references`, "body does not contain any .md) links");
  } else {
    pass(`${label} .md references`, ".md links present");
  }

  // Must reference city pages
  if (!body.includes("beirut") || !body.includes("dubai")) {
    fail(`${label} city coverage`, "missing beirut or dubai references");
  } else {
    pass(`${label} city coverage`, "beirut and dubai present");
  }
}

// ---------------------------------------------------------------------------
// Dynamic slug discovery
// ---------------------------------------------------------------------------

async function discoverSlugs(): Promise<{
  category: string;
  occasion: string;
  brand: string | null;
  product: string | null;
}> {
  try {
    const metaRes = await fetchWithTimeout(`${BASE_URL}/api/catalog/metadata`, {});
    if (metaRes.ok) {
      const meta = (await metaRes.json()) as {
        categories?: { id: string }[];
        occasions?: { id: string }[];
      };
      const firstCategory = meta?.categories?.[0]?.id ?? STATIC_CATEGORY_SLUG;
      const firstOccasion = meta?.occasions?.[0]?.id ?? STATIC_OCCASION_SLUG;
      return { category: firstCategory, occasion: firstOccasion, brand: null, product: null };
    }
  } catch {
    // fall through
  }
  return { category: STATIC_CATEGORY_SLUG, occasion: STATIC_OCCASION_SLUG, brand: null, product: null };
}

async function discoverProductSlug(): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      `${BASE_URL}/api/woo/products?lang=en&countryCode=LB`,
      {}
    );
    if (res.ok) {
      const data = (await res.json()) as { products?: { slug: string }[] };
      const first = data?.products?.find((p) => p?.slug);
      if (first?.slug) return first.slug;
    }
  } catch {
    // fall through
  }
  // Return null so the product test is skipped when the catalog is unavailable,
  // rather than testing a hardcoded slug that doesn't exist in a live catalog.
  return null;
}

async function discoverBrandSlug(): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/woo/brands`, {});
    if (res.ok) {
      const data = (await res.json()) as { brands?: { slug: string }[] };
      const first = data?.brands?.find((b) => b?.slug);
      if (first?.slug) return first.slug;
    }
  } catch {
    // fall through
  }
  // Return null so the brand test is skipped when the catalog is unavailable.
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`\ncheckMarkdownMirrors — target: ${BASE_URL}\n`);

  // Health check — fail fast if server is not responding.
  try {
    const health = await fetchWithTimeout(`${BASE_URL}/sitemap.md`, {});
    if (health.status !== 200) {
      console.error(`Server not reachable at ${BASE_URL}/sitemap.md (status ${health.status})`);
      process.exit(1);
    }
  } catch (err: unknown) {
    console.error(`Server not reachable at ${BASE_URL}: ${(err as Error).message}`);
    process.exit(1);
  }

  // --- /sitemap.md ---
  console.log("Checking /sitemap.md...");
  await checkSitemapMd();

  // --- Discover dynamic slugs ---
  console.log("Discovering catalog slugs...");
  const { category, occasion } = await discoverSlugs();
  const productSlug = await discoverProductSlug();
  const brandSlug = await discoverBrandSlug();

  // Build the full test page list including dynamic pages.
  const allPages = [
    ...TEST_PAGES,
    { path: `/en-lb/beirut/category/${category}`, label: `Category (${category})`, expectType: "category" },
    { path: `/en-lb/beirut/occasion/${occasion}`, label: `Occasion (${occasion})`, expectType: "occasion" },
    ...(productSlug ? [{ path: `/en-lb/beirut/product/${productSlug}`, label: `Product (${productSlug})`, expectType: "product" }] : []),
    ...(brandSlug ? [{ path: `/en-lb/beirut/brand/${brandSlug}`, label: `Brand (${brandSlug})`, expectType: "brand" }] : []),
  ];

  // --- Per-page checks ---
  console.log(`Checking ${allPages.length} pages...\n`);
  for (const { path, label } of allPages) {
    process.stdout.write(`  ${label}...\n`);
    await checkMdPath(label, path);
    await checkContentNegotiation(label, path);
    await checkHtmlAlternateLink(label, path);
  }

  // --- Non-mirrored paths return 404 for .md ---
  console.log("\nChecking non-mirrored paths return 404...");
  for (const p of NON_MIRRORED_PATHS) {
    await checkNonMirrored(p);
  }

  // --- Unknown dynamic slugs must also return 404 ---
  console.log("\nChecking unknown dynamic slugs return 404...");
  for (const p of UNKNOWN_DYNAMIC_PATHS) {
    await checkNonMirrored(p);
  }

  // --- Summary ---
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  const total = results.length;

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Results: ${passed}/${total} passed, ${failed} failed`);

  if (failed === 0) {
    console.log("✓ All Markdown mirror checks passed.\n");
    process.exit(0);
  } else {
    console.log("\nFailed checks:");
    for (const r of results.filter((r) => !r.pass)) {
      console.log(`  ✗ ${r.label}: ${r.message}`);
    }
    console.log();
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
