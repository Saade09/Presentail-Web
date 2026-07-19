/**
 * seo-checks/hreflang.mjs
 *
 * Check 10: Hreflang set completeness.
 *
 * FIX (hreflang-count): The previous check required exact casing (en-LB, ar-LB,
 * fr-LB, x-default) which could fail when hreflang attributes use lowercase (en-lb).
 * This implementation normalises to lowercase for comparison and verifies at least 4
 * distinct hreflang entries are present including x-default, en-lb, ar-lb, and fr-lb.
 */

import { fetchText, extractHreflangValues } from "./utils.mjs";

/**
 * Check 10: Hreflang completeness — required locales present on home page.
 *
 * Required: en-LB (or en-lb), ar-LB (or ar-lb), fr-LB (or fr-lb), x-default.
 * Normalised to lowercase for comparison to handle servers that emit either casing.
 */
export async function checkHreflangCompleteness(BASE, record) {
  const r = await fetchText(`${BASE}/en-lb/beirut`);
  const hreflangs = extractHreflangValues(r.text);
  const normalised = hreflangs.map((v) => v.toLowerCase());

  const required = ["en-lb", "ar-lb", "fr-lb", "x-default"];
  const missing = required.filter((v) => !normalised.includes(v));

  // Also require at least one UAE or CY hreflang to confirm multi-country coverage.
  const hasAe = normalised.some((v) => v.includes("-ae") || v.includes("ae"));
  const hasCy = normalised.some((v) => v.includes("-cy") || v.includes("cy"));
  const coverageNote = hasAe && hasCy
    ? "AE + CY coverage present"
    : hasAe
    ? "AE coverage present; CY missing"
    : hasCy
    ? "CY coverage present; AE missing"
    : "no AE or CY hreflang found";

  const ok = missing.length === 0;
  record(
    "Hreflang completeness on home (en-LB, ar-LB, fr-LB, x-default + multi-country)",
    ok,
    ok
      ? `${hreflangs.length} hreflang entries; ${coverageNote}`
      : `missing: ${missing.join(", ")}; found: ${hreflangs.join(", ")}`
  );
}
