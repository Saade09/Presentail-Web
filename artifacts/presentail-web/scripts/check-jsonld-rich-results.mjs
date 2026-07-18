#!/usr/bin/env node
/**
 * check-jsonld-rich-results.mjs
 *
 * CI guard: fetches representative live pages from a running serve.mjs
 * instance, extracts every JSON-LD block from the returned HTML, and posts
 * each page's HTML to the schema.org validator API
 * (https://validator.schema.org/validate).  Fails (exit 1) when:
 *   - any required page returns a non-200 status or cannot be fetched, OR
 *   - any required page emits no JSON-LD at all, OR
 *   - the validator returns any Error-level issue.
 *
 * The only soft/warn path is when the external schema.org validator API
 * itself is unreachable (timeout, DNS failure, etc.) — in that case the page
 * is skipped with a WARN so external API flakiness does not block a PR merge.
 * Every other failure mode is a hard CI failure.
 *
 * This complements the static fixture-based guards
 * (check-product-jsonld-schema.mjs, check-nonproduct-jsonld-schema.mjs) and
 * the Playwright serve-backed spec (e2e-serve/jsonld-schema.spec.ts) by
 * exercising the full serve-time path — injectSeoTagsAsync → fetch → resolve
 * → assemble — and then confirming the resulting markup is accepted by the
 * same external validator Google's crawlers use.
 *
 * Pages checked (representative set covering all major entity types):
 *   /en-lb/beirut/                                city homepage
 *   /en-lb/beirut/product/rose-bouquet            product entity page
 *   /en-lb/beirut/brand/roses                     brand entity page
 *   /en-lb/beirut/blog/inside-spring-sourcing-trip blog post entity page
 *   /en-lb/beirut/category/flowers                category entity page
 *   /en-lb/beirut/occasion/birthday               occasion entity page
 *
 * ── Phase 2: Google Rich Results Test API (Merchant Listing) ─────────────────
 *
 * When GOOGLE_RICH_RESULTS_API_KEY is set, a second validation phase runs.
 * It posts a small set of live production product-page URLs to the Google
 * Rich Results Test API (searchconsole.googleapis.com/v1/richresults:run),
 * which applies Google's stricter Merchant Listing eligibility requirements
 * (review/aggregateRating, shippingDetails, hasMerchantReturnPolicy, etc.)
 * that schema.org's own validator does not enforce.
 *
 * The Google API crawls the page itself, so it requires publicly accessible
 * URLs.  The checked URLs point to the live production storefront
 * (https://presentail.com) — they do NOT use the local serve.mjs instance.
 *
 * When GOOGLE_RICH_RESULTS_API_KEY is absent the entire phase is skipped
 * with a notice so the check degrades gracefully on forks and contributor
 * PRs that lack the secret.  When the API is reachable but returns
 * Error-level issues for a Product rich result the step fails with exit 1.
 * Network/timeout errors reaching the Google API are treated as warnings
 * (same policy as the schema.org validator) so transient Google-side
 * flakiness never blocks a PR merge.
 *
 * Required environment variables:
 *   PLAYWRIGHT_BASE_URL         — base URL of the running serve.mjs instance
 *                                 (default: http://localhost:19234)
 *   GOOGLE_RICH_RESULTS_API_KEY — Google API key with Search Console API
 *                                 enabled; omit to skip Phase 2 entirely
 *
 * Usage (CI — serve.mjs must already be running):
 *   PLAYWRIGHT_BASE_URL=http://localhost:19234 \
 *     node artifacts/presentail-web/scripts/check-jsonld-rich-results.mjs
 *
 * Exit codes:
 *   0  All pages passed (or validator was unreachable — see WARN lines)
 *   1  One or more pages failed to fetch, emitted no JSON-LD, or have
 *      schema.org Error-level issues; OR a Product page returned Error-level
 *      issues from the Google Rich Results Test API
 */

const BASE_URL = (
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:19234"
).replace(/\/$/, "");

const VALIDATOR_URL = "https://validator.schema.org/validate";

/**
 * Google Rich Results Test API endpoint.
 * Requires a ?key= query parameter with a valid Google API key that has the
 * Google Search Console API enabled.
 * https://developers.google.com/webmaster-tools/v1/richresults/run
 */
const GOOGLE_RICH_RESULTS_API_BASE =
  "https://searchconsole.googleapis.com/v1/richresults:run";

/**
 * Production base URL for Phase 2.  The Google API crawls the page itself
 * and therefore requires a publicly accessible URL — localhost will not work.
 */
const PRODUCTION_BASE_URL = "https://presentail.com";

const PAGE_FETCH_TIMEOUT_MS = 10_000;

/**
 * Abort a single validator API call after this many ms.
 * The schema.org validator can be slow on the first request; 20 s is generous
 * but keeps CI from hanging indefinitely on a transient network problem.
 */
const VALIDATOR_TIMEOUT_MS = 20_000;

/**
 * Abort a single Google Rich Results Test API call after this many ms.
 * 30 s is generous; Google crawls the target URL server-side so the first
 * call can take longer than a pure API round-trip.
 */
const GOOGLE_API_TIMEOUT_MS = 30_000;

/**
 * Pages to validate.  Every entry is a required route — a fetch failure or
 * missing JSON-LD causes exit 1.  Brand, product, category, occasion, blog,
 * and homepage are all covered so every major entity-schema builder is
 * exercised end-to-end.
 */
const PAGES = [
  { path: "/en-lb/beirut/", label: "city homepage" },
  { path: "/en-lb/beirut/product/rose-bouquet", label: "product entity page" },
  { path: "/en-lb/beirut/brand/roses", label: "brand entity page" },
  {
    path: "/en-lb/beirut/blog/inside-spring-sourcing-trip",
    label: "blog post entity page",
  },
  { path: "/en-lb/beirut/category/flowers", label: "category entity page" },
  { path: "/en-lb/beirut/occasion/birthday", label: "occasion entity page" },
];

/**
 * Production product-page URLs submitted to the Google Rich Results Test API
 * (Phase 2).  These must be publicly accessible — the Google API crawls them
 * server-side.  Use paths that are canonical, stable, and carry a full
 * Merchant Listing schema (Product + Offer + shippingDetails + returnPolicy).
 *
 * Extend this list when new product slugs are added to the production catalog
 * and you want their Merchant Listing markup verified against Google's rules.
 */
const GOOGLE_PRODUCT_URLS = [
  `${PRODUCTION_BASE_URL}/en-lb/beirut/product/rose-bouquet`,
];

/**
 * The Google Rich Results type name for products.  The API returns
 * richResults.detectedItems[].richResultType — filter to this value so we
 * only fail on Product-specific Merchant Listing errors and not on unrelated
 * rich result types (Breadcrumb, Article, etc.) that appear on the same page.
 */
const PRODUCT_RICH_RESULT_TYPE = "Products";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * fetch() with an AbortController timeout so a slow upstream never hangs CI.
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} timeoutMs
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extract the raw text of every <script type="application/ld+json"> block
 * from an HTML string.
 * @param {string} html
 * @returns {string[]}
 */
function extractJsonLdBlocks(html) {
  const re = /<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  const blocks = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const text = m[1].trim();
    if (text) blocks.push(text);
  }
  return blocks;
}

/**
 * Post page HTML to the schema.org validator API and return the parsed
 * response body.  Throws on network error, timeout, or non-2xx status.
 * @param {string} html
 * @returns {Promise<Record<string, unknown>>}
 */
async function validateWithSchemaOrg(html) {
  const body = new URLSearchParams({ html }).toString();
  const res = await fetchWithTimeout(
    VALIDATOR_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    },
    VALIDATOR_TIMEOUT_MS,
  );

  if (!res.ok) {
    throw new Error(
      `schema.org validator returned HTTP ${res.status} ${res.statusText}`,
    );
  }

  return /** @type {Record<string, unknown>} */ (await res.json());
}

/**
 * Post a publicly accessible URL to the Google Rich Results Test API and
 * return the parsed response body.  Throws on network error, timeout, or
 * non-2xx status.
 *
 * @param {string} pageUrl  Fully-qualified, publicly accessible page URL.
 * @param {string} apiKey   Google API key with Search Console API enabled.
 * @returns {Promise<Record<string, unknown>>}
 */
async function validateWithGoogleApi(pageUrl, apiKey) {
  const endpoint = `${GOOGLE_RICH_RESULTS_API_BASE}?key=${encodeURIComponent(apiKey)}`;
  const res = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ url: pageUrl }),
    },
    GOOGLE_API_TIMEOUT_MS,
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Google Rich Results Test API returned HTTP ${res.status} ${res.statusText}${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }

  return /** @type {Record<string, unknown>} */ (await res.json());
}

/**
 * Extract Error-level issues from a schema.org validator response.
 *
 * Handles two known response shapes:
 *
 * Shape 1 — top-level `errors` array (older validator):
 *   { errors: [{ category: "ERROR"|"WARNING", description: "..." }] }
 *
 * Shape 2 — richResults nested issues (newer validator):
 *   { richResults: { detectedItems: [{ items: [{ issues: [{
 *       issueMessage: "...", severity: "ERROR"|"WARNING" }] }] }] } }
 *
 * An issue is treated as an error when its severity/category is "ERROR" (or
 * is absent, which we treat conservatively as an error).
 *
 * @param {Record<string, unknown>} result
 * @returns {{ description: string }[]}
 */
function extractErrors(result) {
  const errors = [];

  const topErrors = Array.isArray(result.errors) ? result.errors : [];
  for (const e of topErrors) {
    if (!e || typeof e !== "object") continue;
    const cat = String(
      /** @type {Record<string,unknown>} */ (e).category ??
        /** @type {Record<string,unknown>} */ (e).severity ??
        "ERROR",
    ).toUpperCase();
    if (cat === "ERROR") {
      errors.push({
        description: String(
          /** @type {Record<string,unknown>} */ (e).description ??
            /** @type {Record<string,unknown>} */ (e).message ??
            JSON.stringify(e),
        ),
      });
    }
  }

  const richResults = result.richResults;
  if (richResults && typeof richResults === "object") {
    const detected = Array.isArray(
      /** @type {Record<string,unknown>} */ (richResults).detectedItems,
    )
      ? /** @type {unknown[]} */ (
          /** @type {Record<string,unknown>} */ (richResults).detectedItems
        )
      : [];
    for (const detectedItem of detected) {
      if (!detectedItem || typeof detectedItem !== "object") continue;
      const items = Array.isArray(
        /** @type {Record<string,unknown>} */ (detectedItem).items,
      )
        ? /** @type {unknown[]} */ (
            /** @type {Record<string,unknown>} */ (detectedItem).items
          )
        : [];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const issues = Array.isArray(
          /** @type {Record<string,unknown>} */ (item).issues,
        )
          ? /** @type {unknown[]} */ (
              /** @type {Record<string,unknown>} */ (item).issues
            )
          : [];
        for (const issue of issues) {
          if (!issue || typeof issue !== "object") continue;
          const sev = String(
            /** @type {Record<string,unknown>} */ (issue).severity ?? "ERROR",
          ).toUpperCase();
          if (sev === "ERROR") {
            errors.push({
              description: String(
                /** @type {Record<string,unknown>} */ (issue).issueMessage ??
                  /** @type {Record<string,unknown>} */ (issue).description ??
                  JSON.stringify(issue),
              ),
            });
          }
        }
      }
    }
  }

  return errors;
}

/**
 * Extract Error-level issues from a Google Rich Results Test API response,
 * scoped to detectedItems whose richResultType matches `targetType`.
 *
 * Response shape from the Google Search Console API:
 *   {
 *     testStatus: { status: "COMPLETE" | "PARTIAL" | "FAIL" | ... },
 *     inspectionResultLink: "https://search.google.com/...",
 *     richResults: {
 *       detectedItems: [
 *         {
 *           richResultType: "Products",
 *           items: [
 *             {
 *               name: "...",
 *               issues: [
 *                 { issueMessage: "...", severity: "ERROR" | "SUGGESTION", issuePercent: 0 }
 *               ]
 *             }
 *           ]
 *         }
 *       ]
 *     }
 *   }
 *
 * Only items whose richResultType equals `targetType` are examined.  Issues
 * with severity "ERROR" (case-insensitive) are returned as hard failures;
 * "SUGGESTION" issues are silently ignored.
 *
 * @param {Record<string, unknown>} result  Parsed Google API response body.
 * @param {string} targetType               richResultType to filter on (e.g. "Products").
 * @returns {{ description: string }[]}
 */
function extractGoogleProductErrors(result, targetType) {
  const errors = [];

  const richResults = result.richResults;
  if (!richResults || typeof richResults !== "object") return errors;

  const detected = Array.isArray(
    /** @type {Record<string,unknown>} */ (richResults).detectedItems,
  )
    ? /** @type {unknown[]} */ (
        /** @type {Record<string,unknown>} */ (richResults).detectedItems
      )
    : [];

  for (const detectedItem of detected) {
    if (!detectedItem || typeof detectedItem !== "object") continue;
    const richResultType = String(
      /** @type {Record<string,unknown>} */ (detectedItem).richResultType ?? "",
    );
    if (richResultType !== targetType) continue;

    const items = Array.isArray(
      /** @type {Record<string,unknown>} */ (detectedItem).items,
    )
      ? /** @type {unknown[]} */ (
          /** @type {Record<string,unknown>} */ (detectedItem).items
        )
      : [];

    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const issues = Array.isArray(
        /** @type {Record<string,unknown>} */ (item).issues,
      )
        ? /** @type {unknown[]} */ (
            /** @type {Record<string,unknown>} */ (item).issues
          )
        : [];

      for (const issue of issues) {
        if (!issue || typeof issue !== "object") continue;
        const sev = String(
          /** @type {Record<string,unknown>} */ (issue).severity ?? "",
        ).toUpperCase();
        if (sev === "ERROR") {
          errors.push({
            description: String(
              /** @type {Record<string,unknown>} */ (issue).issueMessage ??
                /** @type {Record<string,unknown>} */ (issue).description ??
                JSON.stringify(issue),
            ),
          });
        }
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(
    `JSON-LD Rich Results check — validating ${PAGES.length} page(s) against schema.org validator`,
  );
  console.log(`  serve.mjs base URL : ${BASE_URL}`);
  console.log(`  validator API      : ${VALIDATOR_URL}\n`);

  let exitCode = 0;
  let validatorReachable = true;

  /** @type {{ label: string; path: string; status: "pass"|"fail"|"warn"; detail?: string }[]} */
  const summary = [];

  for (const { path, label } of PAGES) {
    const pageUrl = `${BASE_URL}${path}`;
    process.stdout.write(`  [fetch]    ${path} … `);

    // ── Step 1: fetch the served HTML (failure → hard CI failure) ────────────
    let html;
    try {
      const res = await fetchWithTimeout(pageUrl, {}, PAGE_FETCH_TIMEOUT_MS);
      if (!res.ok) {
        console.log(`FAIL (HTTP ${res.status})`);
        console.error(
          `      ✗ ${label} returned HTTP ${res.status} — serve.mjs must serve this route`,
        );
        summary.push({
          label,
          path,
          status: "fail",
          detail: `HTTP ${res.status}`,
        });
        exitCode = 1;
        continue;
      }
      html = await res.text();
    } catch (err) {
      const msg = /** @type {Error} */ (err).message;
      console.log(`FAIL (${msg})`);
      console.error(`      ✗ ${label} fetch error: ${msg}`);
      summary.push({ label, path, status: "fail", detail: msg });
      exitCode = 1;
      continue;
    }

    // ── Step 2: require at least one JSON-LD block ───────────────────────────
    const blocks = extractJsonLdBlocks(html);
    process.stdout.write(`${blocks.length} JSON-LD block(s) → `);

    if (blocks.length === 0) {
      console.log("FAIL (no JSON-LD emitted)");
      console.error(`      ✗ ${label} emitted no JSON-LD — injectSeoTagsAsync may be broken`);
      summary.push({
        label,
        path,
        status: "fail",
        detail: "no JSON-LD emitted",
      });
      exitCode = 1;
      continue;
    }

    // ── Step 3: post to schema.org validator (unreachable → warn only) ───────
    process.stdout.write("validating … ");

    if (!validatorReachable) {
      console.log("WARN (validator unreachable on earlier attempt)");
      summary.push({
        label,
        path,
        status: "warn",
        detail: "schema.org validator was unreachable on a previous attempt",
      });
      continue;
    }

    let result;
    try {
      result = await validateWithSchemaOrg(html);
    } catch (err) {
      // Treat the validator being unreachable as a warning, not a hard
      // failure — external API flakiness should not block a PR merge.
      const msg = /** @type {Error} */ (err).message;
      console.log(`WARN (${msg})`);
      summary.push({ label, path, status: "warn", detail: msg });
      validatorReachable = false;
      continue;
    }

    // ── Step 4: collect Error-level issues (any → hard CI failure) ───────────
    const errors = extractErrors(result);
    if (errors.length > 0) {
      console.log(`FAIL (${errors.length} error(s))`);
      for (const e of errors) {
        console.error(`      ✗ ${e.description}`);
      }
      summary.push({
        label,
        path,
        status: "fail",
        detail: `${errors.length} schema.org error(s)`,
      });
      exitCode = 1;
    } else {
      console.log("ok");
      summary.push({ label, path, status: "pass" });
    }
  }

  // ── Summary (Phase 1 — schema.org) ───────────────────────────────────────
  console.log("");
  const failed = summary.filter((r) => r.status === "fail");
  const warned = summary.filter((r) => r.status === "warn");
  const passed = summary.filter((r) => r.status === "pass");

  if (exitCode !== 0) {
    console.error(
      `JSON-LD Rich Results check FAILED — ${failed.length} page(s) have errors.`,
    );
    for (const f of failed) {
      console.error(`  ✗ ${f.label} (${f.path}): ${f.detail}`);
    }
    console.error(
      "Fix the matching builder(s) in artifacts/presentail-web/seo-inject.mjs so every required field is present.",
    );
  } else {
    const parts = [`${passed.length} passed`];
    if (warned.length > 0)
      parts.push(`${warned.length} not validated externally (schema.org validator unreachable)`);
    console.log(`JSON-LD Rich Results check passed — ${parts.join(", ")}.`);
    if (warned.length > 0) {
      console.log(
        "  NOTE: re-run with network access to https://validator.schema.org for full external coverage.",
      );
    }
  }

  // ── Phase 2: Google Rich Results Test API (Merchant Listing) ─────────────
  //
  // This phase is entirely optional — it runs only when GOOGLE_RICH_RESULTS_API_KEY
  // is set.  The Google API requires publicly accessible URLs (it crawls the
  // page server-side) so we submit production URLs, not localhost paths.

  const googleApiKey = process.env.GOOGLE_RICH_RESULTS_API_KEY ?? "";
  if (!googleApiKey) {
    console.log(
      "\nGoogle Rich Results Test API check — SKIPPED (GOOGLE_RICH_RESULTS_API_KEY not set).",
    );
    console.log(
      "  Set this secret in GitHub → Settings → Secrets → Actions to enable Google Merchant",
    );
    console.log(
      "  Listing eligibility checks (shippingDetails, hasMerchantReturnPolicy, etc.).",
    );
    process.exit(exitCode);
  }

  console.log(
    `\nGoogle Rich Results Test API check — validating ${GOOGLE_PRODUCT_URLS.length} product page(s)`,
  );
  console.log(`  production base    : ${PRODUCTION_BASE_URL}`);
  console.log(`  rich result type   : ${PRODUCT_RICH_RESULT_TYPE}`);
  console.log(
    `  NOTE: Google crawls these URLs; results reflect what is live on production.\n`,
  );

  /** @type {{ label: string; url: string; status: "pass"|"fail"|"warn"; detail?: string }[]} */
  const googleSummary = [];
  let googleApiReachable = true;

  for (const pageUrl of GOOGLE_PRODUCT_URLS) {
    const shortUrl = pageUrl.replace(PRODUCTION_BASE_URL, "");
    process.stdout.write(`  [google]   ${shortUrl} … `);

    if (!googleApiReachable) {
      console.log("WARN (Google API unreachable on earlier attempt)");
      googleSummary.push({
        label: shortUrl,
        url: pageUrl,
        status: "warn",
        detail: "Google Rich Results Test API was unreachable on a previous attempt",
      });
      continue;
    }

    /** @type {Record<string, unknown>} */
    let googleResult;
    try {
      googleResult = await validateWithGoogleApi(pageUrl, googleApiKey);
    } catch (err) {
      // Treat the Google API being unreachable as a warning, not a hard
      // failure — transient Google-side issues should not block a PR merge.
      const msg = /** @type {Error} */ (err).message;
      console.log(`WARN (${msg})`);
      googleSummary.push({ label: shortUrl, url: pageUrl, status: "warn", detail: msg });
      googleApiReachable = false;
      continue;
    }

    // Log the inspection result link for easy manual follow-up.
    const inspectionLink =
      typeof googleResult.inspectionResultLink === "string"
        ? googleResult.inspectionResultLink
        : null;

    // Surface the test status so a "FAIL" or "PARTIAL" crawl is visible.
    const testStatus =
      googleResult.testStatus &&
      typeof googleResult.testStatus === "object" &&
      typeof /** @type {Record<string,unknown>} */ (googleResult.testStatus).status === "string"
        ? String(/** @type {Record<string,unknown>} */ (googleResult.testStatus).status)
        : "UNKNOWN";

    if (testStatus === "FAIL") {
      // The page could not be fetched by Google (e.g. not yet indexed, DNS,
      // auth-wall).  Treat as a warning so a newly deployed slug does not
      // instantly block CI — the static checks already cover schema correctness
      // against the local serve.mjs instance.
      const detail =
        typeof /** @type {Record<string,unknown>} */ (googleResult.testStatus).details === "string"
          ? String(/** @type {Record<string,unknown>} */ (googleResult.testStatus).details)
          : "page could not be fetched by Google";
      console.log(`WARN (testStatus=FAIL: ${detail})`);
      if (inspectionLink) console.log(`      → ${inspectionLink}`);
      googleSummary.push({
        label: shortUrl,
        url: pageUrl,
        status: "warn",
        detail: `Google could not fetch page: ${detail}`,
      });
      continue;
    }

    const productErrors = extractGoogleProductErrors(
      googleResult,
      PRODUCT_RICH_RESULT_TYPE,
    );

    if (productErrors.length > 0) {
      console.log(`FAIL (${productErrors.length} Google Merchant Listing error(s))`);
      for (const e of productErrors) {
        console.error(`      ✗ ${e.description}`);
      }
      if (inspectionLink) console.log(`      → ${inspectionLink}`);
      googleSummary.push({
        label: shortUrl,
        url: pageUrl,
        status: "fail",
        detail: `${productErrors.length} Google Merchant Listing error(s)`,
      });
      exitCode = 1;
    } else {
      // Show how many non-error detectedItems were found to confirm the API
      // actually found Product markup (not just "no issues because no schema").
      const richResults = googleResult.richResults;
      const detected =
        richResults &&
        typeof richResults === "object" &&
        Array.isArray(/** @type {Record<string,unknown>} */ (richResults).detectedItems)
          ? /** @type {unknown[]} */ (
              /** @type {Record<string,unknown>} */ (richResults).detectedItems
            )
          : [];
      const productDetected = detected.filter(
        (d) =>
          d &&
          typeof d === "object" &&
          String(/** @type {Record<string,unknown>} */ (d).richResultType) ===
            PRODUCT_RICH_RESULT_TYPE,
      );
      const hasProduct = productDetected.length > 0;
      if (!hasProduct) {
        // No Product rich result detected at all — the Merchant Listing schema
        // may be absent or malformed enough that Google did not parse it.
        console.log("FAIL (no Product rich result detected by Google)");
        console.error(
          `      ✗ Google did not detect a ${PRODUCT_RICH_RESULT_TYPE} rich result on this page.`,
        );
        console.error(
          "        Check that the Product JSON-LD is present and valid on the live production URL.",
        );
        if (inspectionLink) console.log(`      → ${inspectionLink}`);
        googleSummary.push({
          label: shortUrl,
          url: pageUrl,
          status: "fail",
          detail: `no ${PRODUCT_RICH_RESULT_TYPE} rich result detected`,
        });
        exitCode = 1;
      } else {
        console.log(`ok (testStatus=${testStatus})`);
        if (inspectionLink) console.log(`      → ${inspectionLink}`);
        googleSummary.push({ label: shortUrl, url: pageUrl, status: "pass" });
      }
    }
  }

  // ── Summary (Phase 2 — Google) ────────────────────────────────────────────
  console.log("");
  const gFailed = googleSummary.filter((r) => r.status === "fail");
  const gWarned = googleSummary.filter((r) => r.status === "warn");
  const gPassed = googleSummary.filter((r) => r.status === "pass");

  if (gFailed.length > 0) {
    console.error(
      `Google Rich Results Test API check FAILED — ${gFailed.length} product page(s) have Merchant Listing errors.`,
    );
    for (const f of gFailed) {
      console.error(`  ✗ ${f.url}: ${f.detail}`);
    }
    console.error(
      "Fix the Product schema builder in artifacts/presentail-web/seo-inject.mjs — ensure",
    );
    console.error(
      "shippingDetails, hasMerchantReturnPolicy, and aggregateRating/review are present.",
    );
  } else {
    const gParts = [`${gPassed.length} passed`];
    if (gWarned.length > 0)
      gParts.push(
        `${gWarned.length} not validated (Google API unreachable or page not crawlable)`,
      );
    console.log(`Google Rich Results Test API check passed — ${gParts.join(", ")}.`);
    if (gWarned.length > 0) {
      console.log(
        "  NOTE: re-run with network access to https://searchconsole.googleapis.com for full Google coverage.",
      );
    }
  }

  process.exit(exitCode);
}

main();
