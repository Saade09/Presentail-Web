/**
 * seo-checks/sitemap.mjs
 *
 * Checks 25–26: sitemap.xml content checks.
 * (HTTP 200 for sitemap.xml is check 3 in http-status.mjs.)
 */

import { fetchText } from "./utils.mjs";

/**
 * Check 25: sitemap.xml excludes private paths (/checkout, /cart, /account).
 */
export async function checkSitemapExcludesPrivate(BASE, record) {
  const r = await fetchText(`${BASE}/sitemap.xml`);
  const hasCheckout = r.text.includes("/checkout");
  const hasCart = r.text.includes("/cart");
  const hasAccount = r.text.includes("/account");
  const ok = !hasCheckout && !hasCart && !hasAccount;
  const urlCount = (r.text.match(/<loc>/g) ?? []).length;
  const hreflangCount = (r.text.match(/xhtml:link/g) ?? []).length;
  record(
    "sitemap.xml excludes /checkout, /cart, /account",
    ok,
    `${urlCount} URLs, ${hreflangCount} hreflang entries; private paths: checkout=${hasCheckout}, cart=${hasCart}, account=${hasAccount}`
  );
}

/**
 * Check 26: sitemap.xml hreflang coverage — % of <url> blocks with hreflang entries.
 */
export async function checkSitemapHreflangCoverage(BASE, record) {
  const r = await fetchText(`${BASE}/sitemap.xml`);
  const urlBlocks = (r.text.match(/<url>/g) ?? []).length;
  const urlsWithHreflang = r.text.split(/<url>/).slice(1).filter((b) => b.includes("xhtml:link")).length;
  const pct = urlBlocks > 0 ? Math.round((urlsWithHreflang / urlBlocks) * 100) : 0;
  const ok = urlsWithHreflang > 0;
  record(
    "sitemap.xml hreflang coverage",
    ok,
    `${urlsWithHreflang}/${urlBlocks} <url> blocks have hreflang alternates (${pct}% coverage)`
  );
}
