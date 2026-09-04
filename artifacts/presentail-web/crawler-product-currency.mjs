// Deliberately an allowlist, not a generic bot detector: AI and unrelated
// crawlers must receive the same currency behavior as human visitors.
const GOOGLE_COMMERCE_CRAWLER_RE =
  /(?:^|[\s(;])(Googlebot(?:-Image)?|Storebot-Google|AdsBot-Google(?:-Mobile)?)(?=\/[0-9][^\s;)]*|[\s;)])/i;

/**
 * Returns the product-price-only crawler currency override for an allowlisted
 * Google commerce UA and an AE/LB locale route; otherwise undefined.
 */
export function getCrawlerProductCurrencyOverride(userAgent, pathname) {
  const ua = typeof userAgent === "string" ? userAgent : "";
  if (!GOOGLE_COMMERCE_CRAWLER_RE.test(ua)) return undefined;
  const country = String(pathname ?? "")
    .match(/^\/[a-z]{2}-(ae|lb)\/[^/?#]+\/product\/[^/?#]+\/?$/i)?.[1]
    ?.toUpperCase();
  return country === "AE" ? "AED" : country === "LB" ? "USD" : undefined;
}