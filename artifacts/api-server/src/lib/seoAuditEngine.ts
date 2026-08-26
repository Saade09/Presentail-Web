// SEO audit engine — orchestrates 13 structured checks and persists results
// to the seo_audit_runs table. Each check returns an AuditCheckResult with
// severity, affected URLs, and an actionable recommendation.
//
// Sampling philosophy: HEAD/GET requests are limited to 10 URLs per check to
// avoid hammering the production server. Checks that depend on CI build
// artifacts (perf-budget) attempt to read those artifacts and fall back to
// info-level when unavailable at runtime.

import { desc, eq } from "drizzle-orm";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { db, seoAuditRunsTable } from "@workspace/db";
import { logger } from "./logger";
import {
  hasOsProducts,
  getOsProducts,
  getOsBrands,
  getOsCategories,
  getOsOccasions,
} from "./osProductsCache";

const execFileAsync = promisify(execFile);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuditCheckResult {
  checkId: string;
  severity: "critical" | "warn" | "pass" | "info";
  label: string;
  affectedUrls: string[];
  recommendation: string;
  requiresHumanApproval?: boolean;
}

export interface SeoAuditResult {
  runId: number | null;
  runAt: string;
  triggeredBy: string;
  durationMs: number;
  totalChecks: number;
  criticalCount: number;
  warnCount: number;
  passCount: number;
  checks: AuditCheckResult[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE = "https://presentail.com";
const SAMPLE_SIZE = 10;
const FETCH_TIMEOUT_MS = 10_000;

// Known product slug redirects (A → B). A redirect chain exists when B is
// also a key in this map. Populate this map as legacy URLs are retired.
// Using a let so tests can override via __setProductRedirectsForTest.
let PRODUCT_REDIRECTS: Record<string, string> = {};

/**
 * Override the redirect map for testing. Never call in production.
 */
export function __setProductRedirectsForTest(redirects: Record<string, string>): void {
  PRODUCT_REDIRECTS = redirects;
}

// Minimum product counts mirroring pageEligibility.mjs thresholds so the
// thin-pages check uses the same eligibility signal as the web sitemap builder.
const MIN_PRODUCTS_BY_TYPE: Record<string, number> = {
  city: 5,
  "city-category": 4,
  "city-occasion": 4,
  "city-brand": 3,
  "city-recipient": 4,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the HTTP status code for the URL **without** following redirects.
 * For sitemap and internal-link checks we require status === 200; a redirect
 * (3xx) means the URL itself is non-canonical and counts as failing.
 */
async function headUrlStrict(url: string): Promise<number | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method: "HEAD",
      signal: ctrl.signal,
      headers: { "user-agent": "Presentail-SeoEngine/1.0" },
      redirect: "manual", // do not follow redirects — 3xx counts as failure
    });
    return resp.status;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": "Presentail-SeoEngine/1.0" },
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function parseMetaContent(html: string, attr: "property" | "name", value: string): string | null {
  const esc = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re1 = new RegExp(`<meta\\s[^>]*${attr}="${esc}"[^>]*content="([^"]*)"`, "i");
  const m1 = re1.exec(html);
  if (m1) return m1[1];
  const re2 = new RegExp(`<meta\\s[^>]*content="([^"]*)"[^>]*${attr}="${esc}"`, "i");
  const m2 = re2.exec(html);
  return m2 ? m2[1] : null;
}

function parseTitle(html: string): string | null {
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  return m ? m[1].trim() : null;
}

function parseCanonical(html: string): string | null {
  const m = /<link[^>]*rel="canonical"[^>]*href="([^"]+)"/i.exec(html);
  if (m) return m[1];
  const m2 = /<link[^>]*href="([^"]+)"[^>]*rel="canonical"/i.exec(html);
  return m2 ? m2[1] : null;
}

function countH1(html: string): number {
  return (html.match(/<h1[\s>]/gi) ?? []).length;
}

function parseH1(html: string): string | null {
  const match = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  return match ? match[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : null;
}

function normalizeSeoText(value: string | null): string {
  return String(value ?? "")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n: string) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/gi, (entity) => ({
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": "\"",
      "&apos;": "'",
      "&nbsp;": " ",
    })[entity.toLowerCase()] ?? entity)
    .normalize("NFKC")
    .replace(/\s*(?:[|—–-]\s*)?presentail(?:['’]s)?\s*$/iu, "")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countHreflang(html: string): number {
  return (html.match(/rel="alternate"[^>]*hreflang=/gi) ?? []).length;
}

function hasProductJsonLd(html: string): boolean {
  return /"@type"\s*:\s*"Product"/i.test(html);
}

function hasImgWithoutAlt(html: string): boolean {
  const imgs = html.match(/<img\s[^>]*/gi) ?? [];
  return imgs.some((tag) => !/\balt=/i.test(tag));
}

// ── URL builders ──────────────────────────────────────────────────────────────

function sampleSitemapUrls(): string[] {
  const products = (getOsProducts() ?? []).slice(0, 3);
  const brands = (getOsBrands() ?? []).slice(0, 2);
  const categories = (getOsCategories() ?? []).slice(0, 2);
  const occasions = (getOsOccasions() ?? []).slice(0, 2);

  const urls: string[] = [
    `${BASE}/en-lb/beirut`,
    `${BASE}/en-ae/dubai`,
    `${BASE}/en-cy/nicosia`,
  ];

  for (const p of products) {
    urls.push(`${BASE}/en-lb/beirut/product/${p.id}`);
  }
  for (const b of brands) {
    if (b.slug) urls.push(`${BASE}/en-lb/beirut/brand/${b.slug}`);
  }
  for (const c of categories) {
    urls.push(`${BASE}/en-lb/beirut/category/${c.slug}`);
  }
  for (const o of occasions) {
    urls.push(`${BASE}/en-lb/beirut/occasion/${o.slug}`);
  }

  return urls.slice(0, SAMPLE_SIZE);
}

function sampleProductUrls(): string[] {
  const products = (getOsProducts() ?? []).slice(0, SAMPLE_SIZE);
  return products.map((p) => `${BASE}/en-lb/beirut/product/${p.id}`);
}

// ── Individual checks ─────────────────────────────────────────────────────────

async function checkSitemapIndexable(): Promise<AuditCheckResult> {
  const urls = sampleSitemapUrls();
  const failed: string[] = [];

  await Promise.all(
    urls.map(async (url) => {
      // Strict 200 required: 3xx counts as failure — a redirect means the
      // sitemap is pointing to a non-canonical URL and wastes crawl budget.
      const status = await headUrlStrict(url);
      if (status !== 200) {
        failed.push(url);
      }
    }),
  );

  return {
    checkId: "sitemap-indexable",
    severity: failed.length > 0 ? "critical" : "pass",
    label: "Sitemap URLs return exactly 200 (no redirects)",
    affectedUrls: failed,
    recommendation:
      failed.length > 0
        ? "These sitemap URLs do not return HTTP 200 directly. A 3xx redirect means the sitemap references non-canonical URLs and wastes crawl budget; a 4xx/5xx means the page is broken. Update the sitemap to list canonical URLs only."
        : "All sampled sitemap URLs returned 200 with no redirect.",
    requiresHumanApproval: false,
  };
}

async function checkDuplicateTitles(): Promise<AuditCheckResult> {
  const urls = sampleSitemapUrls();
  const titleMap = new Map<string, string[]>();

  await Promise.all(
    urls.map(async (url) => {
      const html = await fetchHtml(url);
      if (!html) return;
      const title = parseTitle(html);
      if (!title) return;
      if (!titleMap.has(title)) titleMap.set(title, []);
      titleMap.get(title)!.push(url);
    }),
  );

  const dupeUrls: string[] = [];
  for (const [, group] of titleMap) {
    if (group.length > 1) dupeUrls.push(...group);
  }

  return {
    checkId: "duplicate-titles",
    severity: dupeUrls.length > 0 ? "warn" : "pass",
    label: "No duplicate page titles",
    affectedUrls: [...new Set(dupeUrls)],
    recommendation:
      dupeUrls.length > 0
        ? "These pages share identical <title> tags. Each page should have a unique, descriptive title for SEO."
        : "No duplicate titles detected in the sample.",
  };
}

async function checkMissingDescriptions(): Promise<AuditCheckResult> {
  const urls = sampleSitemapUrls();
  const missing: string[] = [];

  await Promise.all(
    urls.map(async (url) => {
      const html = await fetchHtml(url);
      if (!html) return;
      const desc = parseMetaContent(html, "name", "description");
      if (!desc || desc.trim().length === 0) missing.push(url);
    }),
  );

  return {
    checkId: "missing-descriptions",
    severity: missing.length > 0 ? "warn" : "pass",
    label: "Meta descriptions present",
    affectedUrls: missing,
    recommendation:
      missing.length > 0
        ? "These pages are missing meta description tags. Add unique, descriptive meta descriptions (120–160 chars) to improve click-through rates from search results."
        : "All sampled pages have meta descriptions.",
  };
}

async function checkH1Issues(): Promise<AuditCheckResult> {
  const urls = sampleSitemapUrls();
  const affected: string[] = [];

  await Promise.all(
    urls.map(async (url) => {
      const html = await fetchHtml(url);
      if (!html) return;
      const count = countH1(html);
      if (count !== 1) affected.push(url);
    }),
  );

  return {
    checkId: "h1-issues",
    severity: affected.length > 0 ? "warn" : "pass",
    label: "Each page has exactly one H1",
    affectedUrls: affected,
    recommendation:
      affected.length > 0
        ? "These pages have 0 or more than 1 <h1> tag. Each page should have exactly one H1 that describes its primary topic."
        : "All sampled pages have exactly one H1.",
  };
}

async function checkH1TitleCollisions(): Promise<AuditCheckResult> {
  const urls = sampleSitemapUrls();
  const affected: string[] = [];

  await Promise.all(
    urls.map(async (url) => {
      const html = await fetchHtml(url);
      if (!html) return;
      const title = parseTitle(html);
      const h1 = parseH1(html);
      if (title && h1 && normalizeSeoText(title) === normalizeSeoText(h1)) {
        affected.push(url);
      }
    }),
  );

  return {
    checkId: "h1-title-collisions",
    severity: affected.length > 0 ? "warn" : "pass",
    label: "H1 and SEO title have distinct search intent",
    affectedUrls: affected,
    recommendation:
      affected.length > 0
        ? "These pages have an H1 and title with the same normalized meaning, including suffix-only differences. Keep the user-facing heading and add meaningful localized search context to the SEO title."
        : "No normalized H1/title collisions detected in the sample.",
  };
}

async function checkCanonicalConflicts(): Promise<AuditCheckResult> {
  const urls = sampleSitemapUrls();
  const conflicted: string[] = [];

  await Promise.all(
    urls.map(async (url) => {
      const html = await fetchHtml(url);
      if (!html) return;
      const canonical = parseCanonical(html);
      if (!canonical) return;
      const normalise = (u: string) => u.replace(/\/$/, "");
      if (normalise(canonical) !== normalise(url)) {
        conflicted.push(url);
      }
    }),
  );

  return {
    checkId: "canonical-conflicts",
    severity: conflicted.length > 0 ? "critical" : "pass",
    label: "Canonical URL matches page URL",
    affectedUrls: conflicted,
    recommendation:
      conflicted.length > 0
        ? "These pages declare a canonical URL that differs from their own URL. This can cause Google to ignore the page and consolidate signals to the canonical. Verify the seo-inject middleware sets the correct canonical for each route."
        : "All sampled pages have correct canonical URLs.",
    requiresHumanApproval: true,
  };
}

async function checkThinPages(): Promise<AuditCheckResult> {
  // Implements the same eligibility rule as pageEligibility.mjs:
  // a collection page (city-category or city-occasion) is eligible for indexing
  // only when its product count reaches MIN_PRODUCTS_BY_TYPE for that page type.
  //
  // Rather than scraping the rendered HTML, we count products per
  // category/occasion slug directly from the OS product cache — the same
  // source the web sitemap builder uses. Pages flagged ineligible by this
  // check but currently in the sitemap are "thin pages" that waste crawl budget.
  const allProducts = getOsProducts() ?? [];
  const categories = (getOsCategories() ?? []).slice(0, SAMPLE_SIZE);
  const occasions = (getOsOccasions() ?? []).slice(0, SAMPLE_SIZE);
  const MIN_CATEGORY = MIN_PRODUCTS_BY_TYPE["city-category"];
  const MIN_OCCASION = MIN_PRODUCTS_BY_TYPE["city-occasion"];

  // Count products per category slug
  const productsByCategory = new Map<string, number>();
  for (const cat of categories) {
    productsByCategory.set(cat.slug, 0);
  }
  for (const product of allProducts) {
    for (const cat of product.categories ?? []) {
      if (productsByCategory.has(cat.slug)) {
        productsByCategory.set(cat.slug, (productsByCategory.get(cat.slug) ?? 0) + 1);
      }
    }
  }

  // Count products per occasion slug
  const productsByOccasion = new Map<string, number>();
  for (const occ of occasions) {
    productsByOccasion.set(occ.slug, 0);
  }
  for (const product of allProducts) {
    for (const occ of product.occasions ?? []) {
      if (productsByOccasion.has(occ.slug)) {
        productsByOccasion.set(occ.slug, (productsByOccasion.get(occ.slug) ?? 0) + 1);
      }
    }
  }

  // Flag collections that fail the isPageEligible threshold — these are
  // "ineligible" per pageEligibility.mjs but may still be in the sitemap.
  const thin: string[] = [];

  for (const cat of categories) {
    const count = productsByCategory.get(cat.slug) ?? 0;
    if (count < MIN_CATEGORY) {
      thin.push(
        `${BASE}/en-lb/beirut/category/${cat.slug} (${count} products < minimum ${MIN_CATEGORY})`,
      );
    }
  }

  for (const occ of occasions) {
    const count = productsByOccasion.get(occ.slug) ?? 0;
    if (count < MIN_OCCASION) {
      thin.push(
        `${BASE}/en-lb/beirut/occasion/${occ.slug} (${count} products < minimum ${MIN_OCCASION})`,
      );
    }
  }

  return {
    checkId: "thin-pages",
    severity: thin.length > 0 ? "critical" : "pass",
    label: `isPageEligible: collection pages have ≥ min products (city-category ≥ ${MIN_CATEGORY}, city-occasion ≥ ${MIN_OCCASION})`,
    affectedUrls: thin,
    recommendation:
      thin.length > 0
        ? `These category/occasion pages have fewer products than the isPageEligible minimum defined in pageEligibility.mjs (city-category: ${MIN_CATEGORY}, city-occasion: ${MIN_OCCASION}). If they are still in the sitemap, they are thin pages that waste crawl budget. Either ensure the OS catalog assigns more products to these collections, or mark them ineligible in pageEligibility.mjs so the sitemap builder excludes them.`
        : "All sampled category/occasion pages meet the minimum product threshold from pageEligibility.mjs.",
    requiresHumanApproval: true,
  };
}

async function checkBrokenInternalLinks(): Promise<AuditCheckResult> {
  // Checks that known internal links (product pages) return exactly 200.
  // Uses the OS product catalog as the ground truth for buildInternalLinks().
  // 3xx is also a failure — an internal link should point to the canonical URL
  // directly, not require a redirect hop.
  const urls = sampleProductUrls().slice(0, SAMPLE_SIZE);
  const broken: string[] = [];

  await Promise.all(
    urls.map(async (url) => {
      const status = await headUrlStrict(url);
      if (status !== 200) broken.push(url);
    }),
  );

  return {
    checkId: "broken-internal-links",
    severity: broken.length > 0 ? "warn" : "pass",
    label: "Product pages return exactly 200 (internal link graph check)",
    affectedUrls: broken,
    recommendation:
      broken.length > 0
        ? "These product page URLs (sampled from the OS catalog's internal link graph) do not return HTTP 200 directly. A 3xx redirect on an internal link wastes crawl budget; a 4xx/5xx means the page is broken. Verify OS product slugs match the web app's routing and that links use canonical URLs."
        : "All sampled product pages (internal link graph) return 200 directly.",
  };
}

async function checkMissingImageAlt(): Promise<AuditCheckResult> {
  // Runtime equivalent of the check-image-alt CI script: fetches sample pages
  // and checks for <img> elements without alt attributes. The CI script runs
  // against the static build; this runs against the live server.
  const urls = sampleSitemapUrls().slice(0, 5);
  const affected: string[] = [];
  const details: string[] = [];

  await Promise.all(
    urls.map(async (url) => {
      const html = await fetchHtml(url);
      if (!html) return;
      if (hasImgWithoutAlt(html)) {
        affected.push(url);
        // Count how many imgs lack alt
        const imgs = html.match(/<img\s[^>]*/gi) ?? [];
        const missingCount = imgs.filter((tag) => !/\balt=/i.test(tag)).length;
        details.push(`${url} (${missingCount} img(s) missing alt)`);
      }
    }),
  );

  return {
    checkId: "missing-image-alt",
    severity: affected.length > 0 ? "warn" : "pass",
    label: "All images have alt text (runtime check, equivalent to check-image-alt CI)",
    affectedUrls: affected,
    recommendation:
      affected.length > 0
        ? `These pages contain <img> tags without alt attributes: ${details.join("; ")}. Add descriptive alt text to every product and content image for accessibility and image-search indexing. Run pnpm --filter @workspace/presentail-web run check-image-alt (if available) for a full static build scan.`
        : "All sampled pages have alt text on images.",
  };
}

async function checkPerfBudget(): Promise<AuditCheckResult> {
  // Attempts to invoke the check-chunk-budget.mjs script against the
  // presentail-web dist directory. Falls back to info-level when the build
  // artifact is unavailable (e.g. in development without a prior build).
  const scriptPath = "artifacts/presentail-web/scripts/check-chunk-budget.mjs";
  const distPath = "artifacts/presentail-web/dist/public";

  try {
    await execFileAsync("node", [scriptPath, distPath], {
      cwd: process.cwd(),
      timeout: 30_000,
    });
    // Exit 0 → all chunks within budget
    return {
      checkId: "perf-budget",
      severity: "pass",
      label: "JS chunk size budget",
      affectedUrls: [],
      recommendation: "All JS chunks are within the 200 kB Brotli budget.",
    };
  } catch (err: unknown) {
    const exitCode = (err as { code?: unknown })?.code;
    const stdout = (err as { stdout?: string })?.stdout ?? "";
    const stderr = (err as { stderr?: string })?.stderr ?? "";

    // Exit code 1 from the script means over-budget
    if (Number(exitCode) === 1) {
      const overBudgetLines = (stdout + "\n" + stderr)
        .split("\n")
        .filter((l) => l.includes("FAIL") || l.includes("over budget") || l.includes("kB"))
        .slice(0, 5);
      return {
        checkId: "perf-budget",
        severity: "warn",
        label: "JS chunk size budget",
        affectedUrls: overBudgetLines.length > 0 ? overBudgetLines : ["(see CI logs for details)"],
        recommendation:
          "One or more JS chunks exceed the 200 kB Brotli budget. Run pnpm --filter @workspace/presentail-web run check-chunk-budget after a production build for details.",
      };
    }

    // Other error (script not found, dist missing, etc.) → info
    logger.warn(
      { err: String(exitCode) },
      "seoAuditEngine: perf-budget check failed to run script — build artifact not available",
    );
    return {
      checkId: "perf-budget",
      severity: "info",
      label: "JS chunk size budget (build artifact not available)",
      affectedUrls: [],
      recommendation:
        "Could not run the chunk-budget check: the presentail-web dist/ directory is not present. Run pnpm --filter @workspace/presentail-web run build, then pnpm --filter @workspace/presentail-web run check-chunk-budget. Also runs automatically in the 'Web serve checks' CI workflow.",
    };
  }
}

/**
 * Extracts all JSON-LD blobs from an HTML page and returns the first one
 * where `@type` is "Product". Returns null when no Product block is found.
 */
function extractProductJsonLd(html: string): Record<string, unknown> | null {
  const scriptRe = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]) as Record<string, unknown>;
      if (data["@type"] === "Product") return data;
      // Also handle @graph arrays
      const graph = data["@graph"];
      if (Array.isArray(graph)) {
        const product = graph.find(
          (item) => (item as Record<string, unknown>)["@type"] === "Product",
        );
        if (product) return product as Record<string, unknown>;
      }
    } catch {
      // malformed JSON — counts as missing
    }
  }
  return null;
}

async function checkStructuredDataErrors(): Promise<AuditCheckResult> {
  // Required merchant fields per Google's Product rich result spec:
  //   name, image, and at least one of: offers, aggregateRating, review.
  // See: https://developers.google.com/search/docs/appearance/structured-data/product
  const urls = sampleProductUrls().slice(0, 5);
  const failing: string[] = [];
  const details: string[] = [];

  await Promise.all(
    urls.map(async (url) => {
      const html = await fetchHtml(url);
      if (!html) {
        failing.push(url);
        details.push(`${url} — page not fetchable`);
        return;
      }
      const product = extractProductJsonLd(html);
      if (!product) {
        failing.push(url);
        details.push(`${url} — no Product JSON-LD block`);
        return;
      }
      const missingFields: string[] = [];
      if (!product["name"]) missingFields.push("name");
      if (!product["image"]) missingFields.push("image");
      const hasMerchantSignal =
        product["offers"] || product["aggregateRating"] || product["review"];
      if (!hasMerchantSignal) missingFields.push("offers/aggregateRating/review");
      if (missingFields.length > 0) {
        failing.push(url);
        details.push(`${url} — missing required fields: ${missingFields.join(", ")}`);
      }
    }),
  );

  return {
    checkId: "structured-data-errors",
    severity: failing.length > 0 ? "warn" : "pass",
    label: "Product JSON-LD has required merchant fields (name, image, offers)",
    affectedUrls: failing,
    recommendation:
      failing.length > 0
        ? `These product pages are missing required Product JSON-LD fields. Google requires at minimum: name, image, and at least one of offers/aggregateRating/review for merchant listings. Issues: ${details.slice(0, 3).join("; ")}. Verify the seo-inject middleware injects complete JSON-LD for product routes.`
        : "All sampled product pages have valid Product JSON-LD with required merchant fields.",
  };
}

async function checkHreflangConflicts(): Promise<AuditCheckResult> {
  const products = (getOsProducts() ?? []).slice(0, 3);
  const testUrls = products
    .map((p) => `${BASE}/en-lb/beirut/product/${p.id}`)
    .slice(0, 3);

  // 9 expected alternates: 3 locales × 3 countries (en-lb, ar-lb, fr-lb,
  // en-ae, ar-ae, fr-ae, en-cy, ar-cy, fr-cy)
  const EXPECTED_HREFLANG_COUNT = 9;
  const wrongCount: string[] = [];

  await Promise.all(
    testUrls.map(async (url) => {
      const html = await fetchHtml(url);
      if (!html) return;
      const count = countHreflang(html);
      if (count !== EXPECTED_HREFLANG_COUNT) wrongCount.push(url);
    }),
  );

  return {
    checkId: "hreflang-conflicts",
    severity: wrongCount.length > 0 ? "warn" : "pass",
    label: `Pages have ${EXPECTED_HREFLANG_COUNT} hreflang alternates`,
    affectedUrls: wrongCount,
    recommendation:
      wrongCount.length > 0
        ? `These pages have a number of hreflang <link rel="alternate"> tags other than ${EXPECTED_HREFLANG_COUNT} (expected: en-lb, ar-lb, fr-lb, en-ae, ar-ae, fr-ae, en-cy, ar-cy, fr-cy). Check the seo-inject hreflang generation for these routes.`
        : "All sampled pages have the correct number of hreflang alternates.",
  };
}

async function checkOrphanPages(): Promise<AuditCheckResult> {
  // Runtime equivalent of the check-orphan-pages CI check: verifies that
  // navigational pages (categories, occasions) appear in the homepage HTML
  // so they are reachable from the site root and not orphaned.
  // Pages that are unreachable from any inbound link are crawled less
  // frequently and may be treated as lower-priority by Google.
  const homepageHtml = await fetchHtml(`${BASE}/en-lb/beirut`);
  const categories = (getOsCategories() ?? []).slice(0, 4);
  const occasions = (getOsOccasions() ?? []).slice(0, 3);

  const orphans: string[] = [];

  if (homepageHtml) {
    for (const cat of categories) {
      const catPath = `/category/${cat.slug}`;
      if (!homepageHtml.includes(catPath)) {
        orphans.push(`${BASE}/en-lb/beirut${catPath}`);
      }
    }
    for (const occ of occasions) {
      const occPath = `/occasion/${occ.slug}`;
      if (!homepageHtml.includes(occPath)) {
        orphans.push(`${BASE}/en-lb/beirut${occPath}`);
      }
    }
  }

  return {
    checkId: "orphan-pages",
    severity: orphans.length > 0 ? "warn" : "pass",
    label: "Category/occasion pages linked from homepage (orphan-pages check)",
    affectedUrls: orphans,
    recommendation:
      orphans.length > 0
        ? "These category/occasion URLs do not appear to be linked from the homepage. Pages with no inbound internal links are crawled less frequently. Verify navigation and sitemaps include these URLs, and run pnpm --filter @workspace/scripts run check-orphan-pages for a full static analysis."
        : "All sampled category/occasion pages are linked from the homepage.",
  };
}

async function checkRedirectChains(): Promise<AuditCheckResult> {
  const chains: string[] = [];

  for (const [from, to] of Object.entries(PRODUCT_REDIRECTS)) {
    if (to in PRODUCT_REDIRECTS) {
      chains.push(
        `/product/${from} → /product/${to} → /product/${PRODUCT_REDIRECTS[to]}`,
      );
    }
  }

  return {
    checkId: "redirect-chains",
    severity: chains.length > 0 ? "warn" : "pass",
    label: "No redirect chains in product URL map",
    affectedUrls: chains,
    recommendation:
      chains.length > 0
        ? "These redirect entries form chains (A→B where B is also a redirect key). Chains add latency and waste crawl budget. Update PRODUCT_REDIRECTS in seoAuditEngine.ts so every source maps directly to the final destination URL."
        : "No redirect chains detected in the product redirect map.",
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

const CHECKS: Array<() => Promise<AuditCheckResult>> = [
  checkSitemapIndexable,
  checkDuplicateTitles,
  checkMissingDescriptions,
  checkH1Issues,
  checkH1TitleCollisions,
  checkCanonicalConflicts,
  checkThinPages,
  checkBrokenInternalLinks,
  checkMissingImageAlt,
  checkPerfBudget,
  checkStructuredDataErrors,
  checkHreflangConflicts,
  checkOrphanPages,
  checkRedirectChains,
];

/**
 * Insert a "pending" run row and return its ID so the caller can return it
 * immediately to the HTTP client while the full audit runs asynchronously.
 * Returns null if the DB insert fails.
 */
export async function createPendingRun(
  triggeredBy: "scheduler" | "manual" | "ci",
): Promise<number | null> {
  try {
    const rows = await db
      .insert(seoAuditRunsTable)
      .values({
        triggeredBy,
        totalChecks: 0,
        criticalCount: 0,
        warnCount: 0,
        passCount: 0,
      })
      .returning({ id: seoAuditRunsTable.id });
    return rows[0]?.id ?? null;
  } catch (err) {
    logger.warn(
      { err: (err as Error)?.message },
      "seoAuditEngine: createPendingRun failed — runId will be null",
    );
    return null;
  }
}

/**
 * Run all SEO audit checks and persist the result to seo_audit_runs.
 *
 * @param triggeredBy  'scheduler' | 'manual' | 'ci'
 * @param existingRunId  When provided, UPDATE that row instead of inserting a
 *                       new one. Pass the ID returned by createPendingRun().
 */
export async function runSeoAudit(
  triggeredBy: "scheduler" | "manual" | "ci",
  existingRunId?: number | null,
): Promise<SeoAuditResult> {
  if (!hasOsProducts()) {
    throw new Error("OS catalog not ready — cannot run SEO audit");
  }

  const startMs = Date.now();
  logger.info({ triggeredBy, existingRunId }, "seoAuditEngine: audit started");

  const checks = await Promise.all(CHECKS.map((fn) => fn()));

  const durationMs = Date.now() - startMs;
  const criticalCount = checks.filter((c) => c.severity === "critical").length;
  const warnCount = checks.filter((c) => c.severity === "warn").length;
  const passCount = checks.filter((c) => c.severity === "pass" || c.severity === "info").length;

  logger.info(
    { triggeredBy, durationMs, criticalCount, warnCount, passCount },
    "seoAuditEngine: audit complete",
  );

  let runId: number | null = existingRunId ?? null;

  try {
    const payload = {
      triggeredBy,
      durationMs,
      totalChecks: checks.length,
      criticalCount,
      warnCount,
      passCount,
      summaryJson: { checks } as unknown as null,
    };

    if (existingRunId != null) {
      // Update the pre-created pending row
      await db
        .update(seoAuditRunsTable)
        .set(payload)
        .where(eq(seoAuditRunsTable.id, existingRunId));
    } else {
      // Insert a new complete row (scheduler / CI path where no pending row was created)
      const rows = await db
        .insert(seoAuditRunsTable)
        .values(payload)
        .returning({ id: seoAuditRunsTable.id });
      runId = rows[0]?.id ?? null;
    }
  } catch (err) {
    logger.warn(
      { err: (err as Error)?.message },
      "seoAuditEngine: failed to persist run to DB — returning in-memory result",
    );
  }

  return {
    runId,
    runAt: new Date().toISOString(),
    triggeredBy,
    durationMs,
    totalChecks: checks.length,
    criticalCount,
    warnCount,
    passCount,
    checks,
  };
}

/**
 * Load the latest seo_audit_runs row (with summaryJson).
 */
export async function getLatestAuditRun(): Promise<(SeoAuditResult & { id: number }) | null> {
  try {
    const rows = await db
      .select()
      .from(seoAuditRunsTable)
      .orderBy(desc(seoAuditRunsTable.runAt))
      .limit(1);
    if (rows.length === 0) return null;
    const row = rows[0];
    const summary = (row.summaryJson as { checks: AuditCheckResult[] } | null) ?? { checks: [] };
    return {
      id: row.id,
      runId: row.id,
      runAt: row.runAt.toISOString(),
      triggeredBy: row.triggeredBy,
      durationMs: row.durationMs ?? 0,
      totalChecks: row.totalChecks ?? 0,
      criticalCount: row.criticalCount ?? 0,
      warnCount: row.warnCount ?? 0,
      passCount: row.passCount ?? 0,
      checks: summary.checks ?? [],
    };
  } catch (err) {
    logger.warn({ err: (err as Error)?.message }, "seoAuditEngine: getLatestAuditRun failed");
    return null;
  }
}

/**
 * Load a specific audit run by ID.
 */
export async function getAuditRunById(
  id: number,
): Promise<(SeoAuditResult & { id: number }) | null> {
  try {
    const rows = await db
      .select()
      .from(seoAuditRunsTable)
      .where(eq(seoAuditRunsTable.id, id))
      .limit(1);
    if (rows.length === 0) return null;
    const row = rows[0];
    const summary = (row.summaryJson as { checks: AuditCheckResult[] } | null) ?? { checks: [] };
    return {
      id: row.id,
      runId: row.id,
      runAt: row.runAt.toISOString(),
      triggeredBy: row.triggeredBy,
      durationMs: row.durationMs ?? 0,
      totalChecks: row.totalChecks ?? 0,
      criticalCount: row.criticalCount ?? 0,
      warnCount: row.warnCount ?? 0,
      passCount: row.passCount ?? 0,
      checks: summary.checks ?? [],
    };
  } catch (err) {
    logger.warn({ err: (err as Error)?.message }, "seoAuditEngine: getAuditRunById failed");
    return null;
  }
}

/**
 * Load the last 10 audit run summaries (without full summaryJson).
 */
export async function listAuditRunHistory(): Promise<
  Array<{
    id: number;
    runAt: string;
    triggeredBy: string;
    durationMs: number | null;
    totalChecks: number | null;
    criticalCount: number | null;
    warnCount: number | null;
    passCount: number | null;
  }>
> {
  try {
    const rows = await db
      .select({
        id: seoAuditRunsTable.id,
        runAt: seoAuditRunsTable.runAt,
        triggeredBy: seoAuditRunsTable.triggeredBy,
        durationMs: seoAuditRunsTable.durationMs,
        totalChecks: seoAuditRunsTable.totalChecks,
        criticalCount: seoAuditRunsTable.criticalCount,
        warnCount: seoAuditRunsTable.warnCount,
        passCount: seoAuditRunsTable.passCount,
      })
      .from(seoAuditRunsTable)
      .orderBy(desc(seoAuditRunsTable.runAt))
      .limit(10);
    return rows.map((r) => ({
      ...r,
      runAt: r.runAt.toISOString(),
    }));
  } catch (err) {
    logger.warn({ err: (err as Error)?.message }, "seoAuditEngine: listAuditRunHistory failed");
    return [];
  }
}
