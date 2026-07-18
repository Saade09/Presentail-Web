/**
 * checkCityNameCoverage
 *
 * Verifies that every city slug in CITY_SLUGS_BY_COUNTRY (locale-route.ts) has
 * a corresponding entry in CITY_NAMES (seo.mjs) for all three supported
 * languages (en, ar, fr).
 *
 * This prevents a city page from falling back to showing the raw URL slug (e.g.
 * "bent-jbeil") as its H1 / <title> / meta description when a new city is
 * added to locale-route.ts without a matching CITY_NAMES entry.
 *
 * Exit codes:
 *   0 — every slug has complete EN/AR/FR coverage
 *   1 — at least one slug is missing one or more language entries
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run check-city-name-coverage
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../");

const LOCALE_ROUTE = path.join(
  REPO_ROOT,
  "artifacts/presentail-web/src/lib/locale-route.ts"
);
const SEO_MJS = path.join(
  REPO_ROOT,
  "artifacts/presentail-web/src/lib/seo.mjs"
);

// ── Parse CITY_SLUGS_BY_COUNTRY from locale-route.ts ──────────────────────

function parseCitySlugs(): Record<string, string[]> {
  const src = fs.readFileSync(LOCALE_ROUTE, "utf8");
  const blockMatch = src.match(
    /CITY_SLUGS_BY_COUNTRY\s*:\s*Record<[^>]+>\s*=\s*\{([\s\S]*?)\n\};/
  );
  if (!blockMatch) {
    throw new Error(
      "Could not locate CITY_SLUGS_BY_COUNTRY block in locale-route.ts"
    );
  }
  const block = blockMatch[1];
  const result: Record<string, string[]> = {};
  const countryRe = /(\w+)\s*:\s*\[([\s\S]*?)\]/g;
  let cm: RegExpExecArray | null;
  while ((cm = countryRe.exec(block)) !== null) {
    const country = cm[1];
    const slugs: string[] = [];
    const slugRe = /"([^"]+)"/g;
    let sm: RegExpExecArray | null;
    while ((sm = slugRe.exec(cm[2])) !== null) {
      slugs.push(sm[1]);
    }
    result[country] = slugs;
  }
  return result;
}

// ── Parse CITY_NAMES from seo.mjs ─────────────────────────────────────────

function parseCityNames(): Record<string, Record<string, string>> {
  const src = fs.readFileSync(SEO_MJS, "utf8");
  const blockMatch = src.match(
    /export const CITY_NAMES\s*=\s*\{([\s\S]*?)\n\};/
  );
  if (!blockMatch) {
    throw new Error("Could not locate CITY_NAMES block in seo.mjs");
  }
  const block = blockMatch[1];
  const result: Record<string, Record<string, string>> = {};
  const langRe = /(\w+)\s*:\s*\{([\s\S]*?)\}/g;
  let lm: RegExpExecArray | null;
  while ((lm = langRe.exec(block)) !== null) {
    const lang = lm[1];
    result[lang] = {};
    const entryRe = /"([^"]+)"\s*:\s*"([^"]+)"/g;
    let em: RegExpExecArray | null;
    while ((em = entryRe.exec(lm[2])) !== null) {
      result[lang][em[1]] = em[2];
    }
  }
  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────

const LANGS = ["en", "ar", "fr"] as const;

const slugsByCountry = parseCitySlugs();
const cityNames = parseCityNames();

let failures = 0;

for (const [country, slugs] of Object.entries(slugsByCountry)) {
  for (const slug of slugs) {
    const key = `${country}-${slug}`;
    for (const lang of LANGS) {
      if (!cityNames[lang]?.[key]) {
        console.error(
          `MISSING  CITY_NAMES.${lang}["${key}"]  (locale-route.ts slug: ${country}/${slug})`
        );
        failures++;
      }
    }
  }
}

if (failures === 0) {
  const total = Object.values(slugsByCountry).reduce(
    (sum, s) => sum + s.length,
    0
  );
  console.log(
    `✓ All ${total} city slugs have complete EN/AR/FR entries in CITY_NAMES.`
  );
  process.exit(0);
} else {
  console.error(
    `\n✗ ${failures} missing CITY_NAMES entr${failures === 1 ? "y" : "ies"} — add them to artifacts/presentail-web/src/lib/seo.mjs`
  );
  process.exit(1);
}
