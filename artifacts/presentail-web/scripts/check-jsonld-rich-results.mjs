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
 * Environment:
 *   PLAYWRIGHT_BASE_URL  — base URL of the running serve.mjs instance
 *                          (default: http://localhost:19234)
 *
 * Usage (CI — serve.mjs must already be running):
 *   PLAYWRIGHT_BASE_URL=http://localhost:19234 \
 *     node artifacts/presentail-web/scripts/check-jsonld-rich-results.mjs
 *
 * Exit codes:
 *   0  All pages passed (or validator was unreachable — see WARN lines)
 *   1  One or more pages failed to fetch, emitted no JSON-LD, or have
 *      schema.org Error-level issues
 */

const BASE_URL = (
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:19234"
).replace(/\/$/, "");

const VALIDATOR_URL = "https://validator.schema.org/validate";

const PAGE_FETCH_TIMEOUT_MS = 10_000;

/**
 * Abort a single validator API call after this many ms.
 * The schema.org validator can be slow on the first request; 20 s is generous
 * but keeps CI from hanging indefinitely on a transient network problem.
 */
const VALIDATOR_TIMEOUT_MS = 20_000;

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

  // ── Summary ──────────────────────────────────────────────────────────────────
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

  process.exit(exitCode);
}

main();
