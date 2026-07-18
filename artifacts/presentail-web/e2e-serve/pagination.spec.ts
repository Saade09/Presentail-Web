/**
 * Crawlable pagination e2e tests (serve.mjs only)
 *
 * Verifies:
 *  1. /page/1 redirects to the canonical base collection URL (301).
 *  2. /page/N returns 200 with <link rel="prev"> and <link rel="next"> where applicable.
 *  3. /page/N title includes "– Page N | Presentail".
 *  4. /page/N response includes a <noscript> product link list.
 *  5. Out-of-range /page/N returns 404.
 *
 * The fixture server returns count:50 for the `flowers` category, which
 * creates 3 pages at PAGE_SIZE=24 (24+24+2).
 *
 * Requires a built serve.mjs instance running at PLAYWRIGHT_BASE_URL (the
 * "Web serve checks" CI workflow supplies this automatically).
 */

import { test, expect } from "@playwright/test";

function findLinkRelHrefs(html: string, rel: string): string[] {
  const hrefs: string[] = [];
  const re = new RegExp(
    `<link[^>]+rel="${rel}"[^>]+href="([^"]*)"[^>]*>|<link[^>]+href="([^"]*)"[^>]+rel="${rel}"[^>]*>`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) hrefs.push(m[1] ?? m[2] ?? "");
  return hrefs.filter(Boolean);
}

function findCanonicalHrefs(html: string): string[] {
  return findLinkRelHrefs(html, "canonical");
}

const BASE = "/en-lb/beirut/category/flowers";
const PAGE2 = `${BASE}/page/2`;
const PAGE3 = `${BASE}/page/3`;
const PAGE999 = `${BASE}/page/999`;

// ---------------------------------------------------------------------------
// 1. /page/1 redirect
// ---------------------------------------------------------------------------

test.describe("Pagination — /page/1 redirects to canonical", () => {
  test("returns 301 and location = base collection URL", async ({ request }) => {
    const res = await request.get(`${BASE}/page/1`, {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(301);
    const location = res.headers()["location"];
    expect(location).toBeTruthy();
    expect(location).toContain("/category/flowers");
    expect(location).not.toContain("/page/1");
  });
});

// ---------------------------------------------------------------------------
// 2. /page/2 — middle page: prev + next links
// ---------------------------------------------------------------------------

test.describe("Pagination — page 2 (middle page)", () => {
  let html: string;
  let origin: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.get(PAGE2);
    expect(res.status()).toBe(200);
    origin = new URL(res.url()).origin;
    html = await res.text();
  });

  test("has <link rel='prev'> pointing at canonical base URL", () => {
    const prevLinks = findLinkRelHrefs(html, "prev");
    expect(prevLinks.length).toBeGreaterThan(0);
    const prevHref = prevLinks[0];
    expect(prevHref).toMatch(/\/category\/flowers$/);
    expect(prevHref).not.toContain("/page/");
    expect(prevHref).toMatch(/^https?:\/\//);
  });

  test("has <link rel='next'> pointing at /page/3", () => {
    const nextLinks = findLinkRelHrefs(html, "next");
    expect(nextLinks.length).toBeGreaterThan(0);
    const nextHref = nextLinks[0];
    expect(nextHref).toContain("/page/3");
    expect(nextHref).toMatch(/^https?:\/\//);
  });

  test("title includes 'Page 2'", () => {
    expect(html).toContain("Page 2");
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    expect(titleMatch).toBeTruthy();
    if (titleMatch) {
      expect(titleMatch[1]).toContain("Page 2");
      expect(titleMatch[1]).toContain("Presentail");
    }
  });

  test("has exactly one canonical tag", () => {
    const canonicals = findCanonicalHrefs(html);
    expect(canonicals.length).toBe(1);
  });

  test("noscript product links are present", () => {
    expect(html).toContain("<noscript>");
    expect(html).toContain("/product/");
    expect(html).toContain("<ul aria-label=\"Products\">");
  });
});

// ---------------------------------------------------------------------------
// 3. /page/3 — last page: prev link, no next link
// ---------------------------------------------------------------------------

test.describe("Pagination — page 3 (last page)", () => {
  let html: string;
  let origin: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.get(PAGE3);
    expect(res.status()).toBe(200);
    origin = new URL(res.url()).origin;
    html = await res.text();
  });

  test("has <link rel='prev'> pointing at /page/2", () => {
    const prevLinks = findLinkRelHrefs(html, "prev");
    expect(prevLinks.length).toBeGreaterThan(0);
    expect(prevLinks[0]).toContain("/page/2");
  });

  test("has no <link rel='next'>", () => {
    const nextLinks = findLinkRelHrefs(html, "next");
    expect(nextLinks.length).toBe(0);
  });

  test("title includes 'Page 3'", () => {
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    expect(titleMatch).toBeTruthy();
    if (titleMatch) expect(titleMatch[1]).toContain("Page 3");
  });
});

// ---------------------------------------------------------------------------
// 4. Page 1 (bare URL) — no prev, has next link, title unmodified
// ---------------------------------------------------------------------------

test.describe("Pagination — page 1 (bare URL)", () => {
  let html: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.get(BASE);
    expect(res.status()).toBe(200);
    html = await res.text();
  });

  test("has <link rel='next'> pointing at /page/2", () => {
    const nextLinks = findLinkRelHrefs(html, "next");
    expect(nextLinks.length).toBeGreaterThan(0);
    expect(nextLinks[0]).toContain("/page/2");
  });

  test("has no <link rel='prev'>", () => {
    const prevLinks = findLinkRelHrefs(html, "prev");
    expect(prevLinks.length).toBe(0);
  });

  test("title does NOT include 'Page 1'", () => {
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    expect(titleMatch).toBeTruthy();
    if (titleMatch) expect(titleMatch[1]).not.toContain("Page 1");
  });
});

// ---------------------------------------------------------------------------
// 5. Out-of-range /page/999 → 404
// ---------------------------------------------------------------------------

test.describe("Pagination — out-of-range page returns 404", () => {
  test("returns HTTP 404 for /page/999", async ({ request }) => {
    const res = await request.get(PAGE999);
    expect(res.status()).toBe(404);
  });

  test("404 response has x-robots-tag: noindex", async ({ request }) => {
    const res = await request.get(PAGE999);
    const robotsTag = res.headers()["x-robots-tag"];
    expect(robotsTag).toBeTruthy();
    expect(robotsTag).toContain("noindex");
  });
});
