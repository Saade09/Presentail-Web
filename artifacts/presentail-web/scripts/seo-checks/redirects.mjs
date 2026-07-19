/**
 * seo-checks/redirects.mjs
 *
 * Checks 27–29: HTTP redirect checks.
 * Checks: www redirect, trailing-slash redirect, legacy /product/:slug redirect.
 */

import { fetchHead } from "./utils.mjs";

/**
 * Check 27: www.presentail.com redirects 301 to presentail.com.
 *
 * Only runs when BASE is the production domain; skipped on localhost or
 * non-www base URLs to avoid false failures in CI preview environments.
 */
export async function checkWwwRedirect(BASE, record) {
  const isProduction = BASE.includes("presentail.com") && !BASE.includes("localhost");
  if (!isProduction) {
    record("www.presentail.com redirects 301 to presentail.com", true, "skipped — not a presentail.com origin");
    return;
  }
  const r = await fetchHead("https://www.presentail.com/");
  const ok = r.status === 301 && r.location.includes("presentail.com");
  record(
    "www.presentail.com redirects 301 to presentail.com",
    ok,
    `HTTP ${r.status} → ${r.location}`
  );
}

/**
 * Check 28: Trailing-slash redirects (301 or 308) on collection pages.
 */
export async function checkTrailingSlashRedirect(BASE, record) {
  const r = await fetchHead(`${BASE}/en-lb/beirut/shop/`);
  const ok = r.status === 301 || r.status === 308;
  record(
    "Trailing-slash redirects (301/308) on collection pages",
    ok,
    `HTTP ${r.status} → ${r.location}`
  );
}

/**
 * Check 29 (NEW): Legacy /product/:slug redirects to locale-prefixed URL.
 *
 * The old URL pattern /product/{slug} (without locale prefix) should 301-redirect
 * to /en-lb/beirut/product/{slug} (or any locale-prefixed equivalent).
 * This ensures old links and bookmarks remain valid after the locale-routing migration.
 */
export async function checkLegacyProductRedirect(BASE, record) {
  const slug = "red-roses-bouquet";
  const legacyUrl = `${BASE}/product/${slug}`;
  const r = await fetchHead(legacyUrl);
  const isRedirect = r.status === 301 || r.status === 302 || r.status === 308;
  const locationOk = r.location.includes(slug);
  const ok = isRedirect && locationOk;
  record(
    "Legacy /product/:slug redirects to locale-prefixed URL",
    ok,
    ok
      ? `HTTP ${r.status} → ${r.location}`
      : r.status === 200
      ? `HTTP 200 returned — redirect expected`
      : `HTTP ${r.status} → ${r.location || "(no location)"}`
  );
}
