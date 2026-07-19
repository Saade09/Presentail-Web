/**
 * seo-checks/http-status.mjs
 *
 * Checks 1–5: HTTP status for indexable pages and required files.
 * Checks: HTTP 200 on all indexable pages, robots.txt, sitemap.xml,
 *         llms.txt, llms-full.txt.
 */

import { fetchHead } from "./utils.mjs";

const INDEXABLE = (BASE) => [
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

/**
 * Check 1: HTTP 200 on all indexable pages.
 */
export async function checkHttpStatus(BASE, record) {
  const urls = INDEXABLE(BASE);
  const fails = [];
  for (const url of urls) {
    const r = await fetchHead(url);
    if (r.status !== 200) fails.push(`${url} → ${r.status}`);
  }
  record("HTTP 200 — all indexable pages", fails.length === 0, fails.join(", ") || "all 200");
}

/**
 * Check 2: robots.txt HTTP 200.
 */
export async function checkRobotsTxt(BASE, record) {
  const r = await fetchHead(`${BASE}/robots.txt`);
  record("robots.txt returns HTTP 200", r.status === 200, `HTTP ${r.status}`);
}

/**
 * Check 3: sitemap.xml HTTP 200.
 */
export async function checkSitemapHttp(BASE, record) {
  const r = await fetchHead(`${BASE}/sitemap.xml`);
  record("sitemap.xml returns HTTP 200", r.status === 200, `HTTP ${r.status}`);
}

/**
 * Check 4: llms.txt HTTP 200.
 */
export async function checkLlmsTxtHttp(BASE, record) {
  const r = await fetchHead(`${BASE}/llms.txt`);
  record("llms.txt returns HTTP 200", r.status === 200, `HTTP ${r.status}`);
}

/**
 * Check 5: llms-full.txt HTTP 200.
 */
export async function checkLlmsFullTxtHttp(BASE, record) {
  const r = await fetchHead(`${BASE}/llms-full.txt`);
  record("llms-full.txt returns HTTP 200", r.status === 200, `HTTP ${r.status}`);
}
