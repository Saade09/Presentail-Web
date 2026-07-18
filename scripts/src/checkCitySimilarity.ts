/**
 * checkCitySimilarity
 *
 * Detects same-country city pages that share more than 80% of their
 * prerendered text content (Jaccard similarity on word tokens). When any pair
 * of city pages within the same country exceeds this threshold the script fails
 * with exit code 1 and lists all offending pairs.
 *
 * How it works
 * ────────────
 * The check calls `injectSeoTagsAsync` from the web artifact's seo-inject.mjs
 * directly — the same function the production serve.mjs uses per-request — to
 * generate the full prerendered HTML for each city homepage route
 * (/{lang}-{country}/{city}). City homepage routes only use static string
 * templates (title, description, h1, FAQ headings) so no API server needs to
 * be running.  No network calls are made.
 *
 * Text extraction
 * ───────────────
 * Inline <script> blocks (JSON-LD structured data) are stripped before
 * tokenisation because structured data is not visible page content and its
 * boilerplate would artificially inflate similarity scores. The remaining HTML
 * tags are stripped and the text is lowercased and split into word tokens of
 * three or more non-numeric characters.
 *
 * Similarity metric
 * ─────────────────
 * Jaccard similarity = |A ∩ B| / |A ∪ B| on the word-token sets. Two pages
 * are flagged when their similarity exceeds SIMILARITY_THRESHOLD (0.80).
 *
 * Missing CITY_SEO entries
 * ────────────────────────
 * Before running the similarity check the script verifies that every city slug
 * in CITY_SLUGS_BY_COUNTRY has a matching entry in city-seo.mjs (keyed by
 * "{country}-{city}"). If any entry is absent the script fails immediately with
 * exit code 1 and lists every missing key. This catches the case where a new
 * city is added to CITY_SLUGS_BY_COUNTRY without a corresponding CITY_SEO
 * entry, which would cause the Jaccard gate to fail silently later anyway.
 *
 * Exit codes
 * ──────────
 *   0 — all CITY_SEO entries are present and all same-country city page pairs
 *       are below the threshold
 *   1 — one or more CITY_SEO entries are missing, at least one pair is too
 *       similar, or the script encountered an error
 *
 * Usage
 * ─────
 *   pnpm --filter @workspace/scripts run check-city-similarity
 */

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../");
const SEO_INJECT_PATH = path.join(
  REPO_ROOT,
  "artifacts/presentail-web/seo-inject.mjs",
);
const CITY_SEO_PATH = path.join(
  REPO_ROOT,
  "artifacts/presentail-web/src/data/city-seo.mjs",
);

/** Maximum allowed Jaccard similarity for any same-country city pair. */
const SIMILARITY_THRESHOLD = 0.8;

/**
 * Minimal SPA shell HTML fed to injectSeoTagsAsync.  The function replaces
 * placeholders inside <head> and the #root div, so we only need these markers
 * to be present.
 */
const BASE_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Presentail</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

/**
 * Strip inline <script> blocks, HTML tags, and common entities, then return
 * the lowercased word-token set.  Words shorter than 3 chars or purely numeric
 * are excluded (they carry little semantic signal and inflate union size).
 */
function extractTokens(html: string): Set<string> {
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&[a-z#\d]+;/gi, " ")
    .toLowerCase();

  const tokens = new Set<string>();
  for (const word of text.split(/[\s\W]+/)) {
    if (word.length >= 3 && !/^\d+$/.test(word)) {
      tokens.add(word);
    }
  }
  return tokens;
}

/** Jaccard similarity: |A ∩ B| / |A ∪ B|.  Returns 1 when both sets are empty. */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

type InjectFn = (
  html: string,
  pathname: string,
  opts?: Record<string, unknown>,
) => Promise<string>;

async function main(): Promise<void> {
  // Load seo-inject.mjs — canonical source of truth for CITY_SLUGS_BY_COUNTRY
  // and the injectSeoTagsAsync function used by both checks.
  const seoInjectMod = (await import(pathToFileURL(SEO_INJECT_PATH).href)) as {
    CITY_SLUGS_BY_COUNTRY: Record<string, readonly string[]>;
    injectSeoTagsAsync: InjectFn;
  };
  const { CITY_SLUGS_BY_COUNTRY, injectSeoTagsAsync } = seoInjectMod;

  if (
    !CITY_SLUGS_BY_COUNTRY ||
    typeof CITY_SLUGS_BY_COUNTRY !== "object"
  ) {
    console.error(
      "check-city-similarity: CITY_SLUGS_BY_COUNTRY not found in seo-inject.mjs",
    );
    process.exit(1);
  }

  if (typeof injectSeoTagsAsync !== "function") {
    console.error(
      "check-city-similarity: injectSeoTagsAsync not found in seo-inject.mjs",
    );
    process.exit(1);
  }

  // ── Step 1: Verify every city has a CITY_SEO entry ──────────────────────
  const citySeoMod = (await import(pathToFileURL(CITY_SEO_PATH).href)) as {
    CITY_SEO: Record<string, unknown>;
  };
  const { CITY_SEO } = citySeoMod;

  if (!CITY_SEO || typeof CITY_SEO !== "object") {
    console.error(
      "check-city-similarity: CITY_SEO not found in city-seo.mjs",
    );
    process.exit(1);
  }

  const missingKeys: string[] = [];
  for (const [country, cities] of Object.entries(CITY_SLUGS_BY_COUNTRY)) {
    for (const city of cities) {
      const key = `${country}-${city}`;
      if (!Object.prototype.hasOwnProperty.call(CITY_SEO, key)) {
        missingKeys.push(key);
      }
    }
  }

  if (missingKeys.length > 0) {
    console.error(
      `\ncheck-city-similarity: ${missingKeys.length} city slug(s) are missing from CITY_SEO in city-seo.mjs:\n`,
    );
    for (const key of missingKeys) {
      console.error(`  ${key}`);
    }
    console.error(
      `\nAdd an entry for each missing key to artifacts/presentail-web/src/data/city-seo.mjs.`,
    );
    console.error(
      `Each entry must include "en", "ar", and "fr" copy with 4-5 neighbourhood names`,
    );
    console.error(
      `unique to that city so the check-city-similarity Jaccard gate passes.`,
    );
    process.exit(1);
  }

  // ── Step 2: Run Jaccard similarity check ────────────────────────────────

  const ORIGIN = "https://presentail.com";
  const LANG = "en";

  type PageEntry = { city: string; tokens: Set<string> };

  const failures: string[] = [];
  let totalPairs = 0;

  for (const [country, cities] of Object.entries(CITY_SLUGS_BY_COUNTRY)) {
    const pages: PageEntry[] = [];

    for (const city of cities) {
      const pathname = `/${LANG}-${country}/${city}`;
      const html = await injectSeoTagsAsync(BASE_HTML, pathname, {
        origin: ORIGIN,
        basePath: "",
        apiBaseUrl: "",
        search: "",
      });
      const tokens = extractTokens(html);
      pages.push({ city, tokens });
    }

    for (let i = 0; i < pages.length; i++) {
      for (let j = i + 1; j < pages.length; j++) {
        totalPairs++;
        const sim = jaccardSimilarity(pages[i].tokens, pages[j].tokens);
        if (sim > SIMILARITY_THRESHOLD) {
          const pct = (sim * 100).toFixed(1);
          failures.push(
            `  [${country}] ${pages[i].city} \u2194 ${pages[j].city}: ${pct}%`,
          );
        }
      }
    }
  }

  if (failures.length === 0) {
    console.log(
      `check-city-similarity: all ${totalPairs} same-country city page pairs are below the ${SIMILARITY_THRESHOLD * 100}% similarity threshold.`,
    );
    process.exit(0);
  }

  console.error(
    `\ncheck-city-similarity: ${failures.length} of ${totalPairs} city page pair(s) exceed the ${SIMILARITY_THRESHOLD * 100}% Jaccard similarity threshold:\n`,
  );
  for (const f of failures) {
    console.error(f);
  }
  console.error(
    `\nAdd city-specific content (unique copy, local SEO text, neighbourhood highlights,`,
  );
  console.error(
    `etc.) to the affected pages so that same-country pages are sufficiently distinct.`,
  );
  console.error(
    `See .local/plans/seo-10-city-specific-landing-pages.md for the full spec.`,
  );
  process.exit(1);
}

main().catch((err: unknown) => {
  console.error("check-city-similarity failed unexpectedly:", err);
  process.exit(1);
});
