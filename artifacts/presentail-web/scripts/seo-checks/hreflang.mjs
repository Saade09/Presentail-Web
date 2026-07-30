/**
 * seo-checks/hreflang.mjs
 *
 * Check 10: Hreflang cluster correctness (intra-city, same-country only).
 *
 * Every page's hreflang cluster must contain ONLY same-city language variants
 * (en/ar/fr for the same country) plus x-default pointing at the en variant
 * of that city. Cross-country alternates (e.g. an -ae or -cy alternate on an
 * LB page) actively invite Google to merge distinct city pages and are a
 * regression.
 *
 * Casing is normalised to lowercase for comparison so servers emitting
 * either en-LB or en-lb both pass.
 */

import { fetchText, extractHreflangValues } from "./utils.mjs";

/**
 * Check 10: Hreflang cluster on the LB home page — same-country locales
 * present, no cross-country alternates.
 */
export async function checkHreflangCompleteness(BASE, record) {
  const r = await fetchText(`${BASE}/en-lb/beirut`);
  const hreflangs = extractHreflangValues(r.text);
  const normalised = hreflangs.map((v) => v.toLowerCase());

  const required = ["en-lb", "ar-lb", "fr-lb", "x-default"];
  const missing = required.filter((v) => !normalised.includes(v));

  // Cross-country alternates must be absent — clusters are intra-city only.
  const crossCountry = normalised.filter((v) => v.endsWith("-ae") || v.endsWith("-cy"));

  const ok = missing.length === 0 && crossCountry.length === 0;
  record(
    "Hreflang cluster on home (en-LB, ar-LB, fr-LB, x-default; no cross-country)",
    ok,
    ok
      ? `${hreflangs.length} hreflang entries; intra-city cluster only`
      : `missing: ${missing.join(", ") || "none"}; cross-country present: ${crossCountry.join(", ") || "none"}; found: ${hreflangs.join(", ")}`
  );
}
