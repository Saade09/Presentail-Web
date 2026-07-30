// Production static server with locale-aware SEO injection.
// Serves files from dist/public and, for any request that resolves to
// index.html (the SPA shell), injects locale-aware <title>, meta description,
// OG/Twitter, canonical and hreflang link tags based on the request URL.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  SITEMAP_CITIES,
  SITEMAP_LANGS,
  SITEMAP_CANONICAL_CITIES,
  escXml,
  generateSitemap,
  buildSitemapXml,
  resolveSitemap,
} from "./sitemap.mjs";
import {
  generateLlmsTxt,
  generateLlmsFullTxt,
  resolveLlmsFullTxt,
} from "./llms.mjs";
import {
  isMirroredPath,
  getMarkdownForPath,
  buildSitemapMd,
  buildHomepageMarkdown,
  invalidateMarkdownCatalogCache,
} from "./markdown.mjs";
import { resolveXRobotsTag as resolveXRobotsTagPure } from "./serve-robots.mjs";
import {
  stripTrackingParams,
  stripTrackingParamsFromReqUrl,
} from "./serve-tracking.mjs";

// seo-inject.mjs and sidecar-cache.mjs are loaded via guarded dynamic import
// below so a missing or corrupt file produces a structured Slack alert rather
// than an unstructured module-load crash.
let injectSeoTagsAsync, initImageDimsDb, collectSidecars, PRODUCT_AVAILABILITY_STATE;

// Static redirect map for renamed / merged products (ops-editable).
import { PRODUCT_REDIRECTS } from "./scripts/productRedirects.mjs";

const brotliCompress = promisify(zlib.brotliCompress);
const gzipCompress = promisify(zlib.gzip);

/**
 * Returns an RFC 7231-formatted absolute date string suitable for the
 * `Expires` header, computed as now + maxAgeSeconds.
 */
function makeExpires(maxAgeSeconds) {
  return new Date(Date.now() + maxAgeSeconds * 1000).toUTCString();
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, "dist/public");
const PORT = Number(process.env.PORT ?? 24188);
const BASE_PATH = (process.env.BASE_PATH ?? "/").replace(/\/$/, "");
// When SERVE_TEST_HOOKS=1 the server exposes a /__test/trigger-500 endpoint
// that deliberately throws inside the request handler, exercising the catch
// block's text/plain 500 response.  This env var is only set by the local
// run-serve-e2e.sh test runner and the CI "Web serve checks" workflow; it is
// never set in production deployments.
const SERVE_TEST_HOOKS = process.env.SERVE_TEST_HOOKS === "1";
// Internal base URL used to fetch per-product data for server-rendered OG /
// Twitter Card meta tags on `/product/<slug>` pages. Defaults to the shared
// Replit proxy at localhost:80 so the API and web artifact can talk locally
// without an external HTTPS round-trip; can be overridden in unusual deploys.
const INTERNAL_API_BASE_URL =
  process.env.INTERNAL_API_BASE_URL ?? "http://localhost:80";

// Canonical-domain redirect. Requests arriving on www.* or new.presentail.com
// are hard-redirected to the apex unconditionally (cannot be disabled by env
// vars — see request handler guards below).
//
// WEB_CANONICAL_REDIRECT_TARGET_ORIGIN controls the apex origin used as the
// redirect target. When unset the default "https://presentail.com" is used.
// Setting it to an empty string is not recommended — the guards fall back to
// the hardcoded string anyway.
const WWW_REDIRECT_TARGET_ORIGIN = (
  process.env.WEB_CANONICAL_REDIRECT_TARGET_ORIGIN ?? "https://presentail.com"
).trim();

// ---------------------------------------------------------------------------
// product_lifecycle_410 analytics event recorder.
//
// Called whenever resolveProductLifecycleResponse() returns a 410 response
// (discontinued product with no redirect entry in PRODUCT_REDIRECTS).
//
// Fire-and-forget POST to the internal API analytics endpoint — never throws,
// never blocks the response path.  The productLifecycle410Monitor on the API
// server queries these events daily and fires a Slack alert listing all slugs
// that returned 410 in the prior UTC day so ops can add redirect entries before
// link equity is permanently lost.
// ---------------------------------------------------------------------------
function recordProduct410Event(productSlug) {
  if (!productSlug) return;
  const url = `${INTERNAL_API_BASE_URL}/api/analytics/events`;
  const body = JSON.stringify({
    name: "product_lifecycle_410",
    productId: String(productSlug).slice(0, 64),
    surface: "web",
  });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5_000);
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: ctrl.signal,
  })
    .then((res) => { clearTimeout(t); if (!res.ok) console.warn(`WARN: product_lifecycle_410 event POST responded ${res.status}`); })
    .catch((err) => { clearTimeout(t); console.warn(`WARN: product_lifecycle_410 event POST failed: ${err?.message}`); });
}

// ---------------------------------------------------------------------------
// Slack alert helper (mirrors artifacts/api-server/src/lib/alerts.ts)
// ---------------------------------------------------------------------------
async function sendSlackAlert(text) {
  const webhookUrl = process.env.ALERTS_SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5_000);
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      console.warn(`WARN: Slack webhook responded ${res.status} (startup alert)`);
    }
  } catch (err) {
    console.warn(`WARN: Slack webhook send failed (startup alert): ${err?.message}`);
  }
}

// ---------------------------------------------------------------------------
// Startup file guards — shared helpers used below to check required build
// artifacts before the HTTP server starts accepting connections.
//
// FATAL vs. NON-FATAL classification
// ───────────────────────────────────
// Fatal (exit 1):
//   • dist/index.html    — the SPA shell; without it every page request fails.
//   • seo-inject.mjs     — dynamically imported; without it SEO tag injection
//                          is completely broken and the module API is missing.
//
// Non-fatal (WARN + Slack alert, server continues):
//   • dist/site.webmanifest — the PWA manifest; browsers that request it will
//                             get a 404, but the app still loads and the rest
//                             of the build is almost certainly intact.  A
//                             missing manifest never blocks core shopping flows.
//   • sidecar-cache.mjs     — populates the SIDECAR_PATHS Set used to serve
//                             pre-compressed .br/.gz files.  Without it the Set
//                             stays empty and the server falls back to on-the-fly
//                             compression for all assets — slower but correct.
//
// Behaviour on failure:
//   production  — structured console.error/warn + awaited Slack alert + exit (fatal)
//                 or WARN log + fire-and-forget Slack alert (non-fatal)
//   development — console.warn (no Slack call in either case)
//
// All fatal helpers are async so that in production the Slack alert is awaited
// before process.exit() is called, ensuring deterministic exit ordering.
// ---------------------------------------------------------------------------

/**
 * Emit a structured error / warn, optionally await a Slack alert, then exit.
 * Never returns — always calls process.exit(1).
 *
 * @param {string} slackMsg  Full Slack message body (Markdown-formatted).
 * @param {string} logMsg    Plain-text log line (no Slack-specific markup).
 */
async function fatalStartupError(slackMsg, logMsg) {
  if (process.env.NODE_ENV === "production") {
    console.error(`ERROR: ${logMsg}`);
    await sendSlackAlert(slackMsg);
  } else {
    console.warn(`WARN: ${logMsg}`);
  }
  process.exit(1);
}

/**
 * Read a required build artifact from disk and return its UTF-8 content.
 * Calls fatalStartupError (and never returns) if the file cannot be read.
 *
 * @param {string} filePath Absolute path of the expected build artifact.
 * @param {string} label    Short human-readable name used in log / alert text.
 * @param {string} fixHint  One-sentence remedy to include in the Slack alert.
 * @returns {Promise<string>} File content on success.
 */
async function readStartupFile(filePath, label, fixHint) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (err) {
    const slackMsg =
      `:rotating_light: *presentail-web: ${label} missing at startup*\n` +
      `\`${filePath}\` could not be read (${err.code ?? err.message}). ` +
      `${fixHint} ` +
      "The server cannot serve the app and will exit now.";
    await fatalStartupError(slackMsg, `${label} missing at startup: ${err.message}`);
    // Unreachable — fatalStartupError always exits — satisfies TypeScript/linters.
    throw err;
  }
}

/**
 * Assert that a required build artifact exists on disk via `fs.statSync`.
 * Calls fatalStartupError (and never returns) if the file cannot be found.
 * Use this when existence-only confirmation is sufficient.
 *
 * @param {string} filePath Absolute path of the expected build artifact.
 * @param {string} label    Short human-readable name used in log / alert text.
 * @param {string} fixHint  One-sentence remedy to include in the Slack alert.
 * @returns {Promise<void>}
 */
async function checkStartupFile(filePath, label, fixHint) {
  try {
    fs.statSync(filePath);
  } catch (err) {
    const slackMsg =
      `:rotating_light: *presentail-web: ${label} missing at startup*\n` +
      `\`${filePath}\` could not be found (${err.code ?? err.message}). ` +
      `${fixHint} ` +
      "The server cannot serve the app and will exit now.";
    await fatalStartupError(slackMsg, `${label} missing at startup: ${err.message}`);
  }
}

/**
 * Assert that a non-critical build artifact exists on disk via `fs.statSync`.
 * Unlike checkStartupFile, this does NOT exit on failure — the server continues
 * in a degraded-but-functional mode.  Emits a WARN log and, in production,
 * fires a fire-and-forget Slack alert so ops are notified.
 *
 * @param {string} filePath Absolute path of the expected build artifact.
 * @param {string} label    Short human-readable name used in log / alert text.
 * @param {string} fixHint  One-sentence remedy to include in the Slack alert.
 * @returns {Promise<void>}
 */
async function warnStartupFile(filePath, label, fixHint) {
  try {
    fs.statSync(filePath);
  } catch (err) {
    console.warn(`WARN: ${label} missing at startup: ${err.message}`);
    if (process.env.NODE_ENV === "production") {
      const slackMsg =
        `:warning: *presentail-web: ${label} missing at startup*\n` +
        `\`${filePath}\` could not be found (${err.code ?? err.message}). ` +
        `${fixHint} ` +
        "The server will continue running in a degraded mode.";
      sendSlackAlert(slackMsg).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Guarded dynamic imports for seo-inject.mjs and sidecar-cache.mjs.
//
// Must run before the DB-adapter block below, which calls initImageDimsDb.
//
// Using static `import` for these modules would cause an unstructured Node.js
// crash if a file is missing or corrupt — before any guard code runs.  Dynamic
// import lets us catch the failure and emit a structured Slack alert.
//
// seo-inject.mjs is FATAL — the module API (injectSeoTagsAsync, initImageDimsDb)
// is called unconditionally on every HTML request; without it the server cannot
// serve pages at all.
//
// sidecar-cache.mjs is NON-FATAL — its only job is populating SIDECAR_PATHS.
// Without it the Set stays empty and the server falls back to on-the-fly
// compression, which is slower but correct.
// ---------------------------------------------------------------------------
let CURATED_FILTER_PAGES = [];
try {
  ({ injectSeoTagsAsync, initImageDimsDb, CURATED_FILTER_PAGES, PRODUCT_AVAILABILITY_STATE } = await import("./seo-inject.mjs"));
} catch (err) {
  await fatalStartupError(
    ":rotating_light: *presentail-web: seo-inject.mjs failed to load at startup*\n" +
      `Could not import \`seo-inject.mjs\` (${err.code ?? err.message}). ` +
      "The file may be missing or contain a syntax error. " +
      "The server cannot serve the app and will exit now.",
    `seo-inject.mjs failed to load at startup: ${err.message}`,
  );
}

try {
  ({ collectSidecars } = await import("./sidecar-cache.mjs"));
} catch (err) {
  console.warn(`WARN: sidecar-cache.mjs failed to load at startup: ${err.message}`);
  if (process.env.NODE_ENV === "production") {
    sendSlackAlert(
      ":warning: *presentail-web: sidecar-cache.mjs failed to load at startup*\n" +
        `Could not import \`sidecar-cache.mjs\` (${err.code ?? err.message}). ` +
        "The file may be missing or contain a syntax error. " +
        "The server will continue running — all assets will be served with on-the-fly compression instead of pre-compressed sidecars.",
    ).catch(() => {});
  }
  // Safe no-op fallback: leave SIDECAR_PATHS empty so every request falls
  // through to on-the-fly Brotli/gzip compression.
  collectSidecars = () => {};
}

// ---------------------------------------------------------------------------
// Image dims L2 cache — PostgreSQL via pg (if DATABASE_URL is configured).
//
// TTL: 24 hours.  The in-process L1 Map in seo-inject.mjs keeps a 1-hour
// window; on L1 miss the adapter is consulted so dims survive server restarts
// and cold-start crawler spikes pay only one CDN Range-fetch per URL per day.
// ---------------------------------------------------------------------------
const IMAGE_DIMS_L2_TTL_MS = 24 * 60 * 60 * 1000;

if (process.env.DATABASE_URL) {
  try {
    const pg = await import("pg");
    const Pool = pg.default?.Pool ?? pg.Pool;
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    initImageDimsDb({
      async get(url) {
        const { rows } = await pool.query(
          "SELECT width, height, fetched_at FROM image_dims WHERE url = $1",
          [url],
        );
        if (!rows.length) return undefined;
        const row = rows[0];
        const ageMs = Date.now() - new Date(row.fetched_at).getTime();
        if (ageMs > IMAGE_DIMS_L2_TTL_MS) {
          // Stale — treat as a miss so the next fetch refreshes both caches.
          return undefined;
        }
        if (row.width == null || row.height == null) return null;
        return { width: row.width, height: row.height };
      },
      async set(url, dims) {
        await pool.query(
          `INSERT INTO image_dims (url, width, height, fetched_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (url) DO UPDATE
             SET width      = EXCLUDED.width,
                 height     = EXCLUDED.height,
                 fetched_at = NOW()`,
          [url, dims?.width ?? null, dims?.height ?? null],
        );
      },
      async del(url) {
        await pool.query("DELETE FROM image_dims WHERE url = $1", [url]);
      },
    });

    // ---------------------------------------------------------------------------
    // Periodic cleanup — delete rows older than 7 days so the table doesn't grow
    // unbounded as product photos are rotated. Runs once ~30 s after startup (to
    // avoid delaying the server listen) and then every 24 h. Fire-and-forget so
    // it never blocks the request path or the startup sequence.
    // ---------------------------------------------------------------------------
    const IMAGE_DIMS_PRUNE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
    const IMAGE_DIMS_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

    async function pruneImageDims() {
      try {
        const cutoff = new Date(Date.now() - IMAGE_DIMS_PRUNE_AGE_MS).toISOString();
        const { rowCount } = await pool.query(
          "DELETE FROM image_dims WHERE fetched_at < $1",
          [cutoff],
        );
        if (rowCount > 0) {
          console.log(`Image dims L2 cache: pruned ${rowCount} stale row(s) older than 7 days`);
        }
      } catch (err) {
        console.warn("Image dims L2 cache: prune failed —", err.message);
      }
    }

    // Delay first run so it doesn't race with startup I/O.
    setTimeout(() => {
      pruneImageDims();
      setInterval(pruneImageDims, IMAGE_DIMS_PRUNE_INTERVAL_MS).unref();
    }, 30_000).unref();

    console.log("Image dims L2 cache: PostgreSQL adapter active (daily prune after 30 s)");
  } catch (err) {
    console.warn("Image dims L2 cache: failed to initialise DB adapter —", err.message);
  }
} else {
  console.log("Image dims L2 cache: DATABASE_URL not set, running L1-only");
}

/**
 * Returns true for transactional pages that must never be cached.
 * Matches both bare paths (/checkout) and locale-prefixed variants
 * (e.g. /en-lb/beirut/checkout) produced by the locale-aware URL scheme.
 */
function isTransactionalPage(pathname) {
  return /(?:^|\/)(?:checkout|cart|order-confirmed)(?:\/|$)/.test(pathname);
}

/**
 * After injectSeoTagsAsync fills lifecycleOut for a product URL, decide whether
 * the HTTP response should be a 301 (renamed/merged) or 410 (discontinued/gone).
 *
 * Returns null  → no lifecycle override; caller should return 200.
 * Returns { status, headers, body }  → caller must write this response.
 *
 * Rules (in priority order):
 *  1. Product found, DISCONTINUED, slug in PRODUCT_REDIRECTS → 301 to new slug.
 *  2. Product found, DISCONTINUED, no redirect entry → 410 Gone.
 *  3. Product NOT found in OS cache, slug in PRODUCT_REDIRECTS → 301 to new slug.
 *  4. Product NOT found in OS cache, no redirect entry → 410 Gone.
 *  5. Product found with any other state (ACTIVE / SOLD_OUT / SEASONAL) → null.
 *
 * The redirect target preserves the locale prefix so the user lands on the
 * correct locale+city page for the replacement product.
 */
function resolveProductLifecycleResponse(pathname, lifecycleOut, origin, basePath) {
  if (!lifecycleOut || !lifecycleOut.productSlug) return null;

  const { productSlug, productFound, productState } = lifecycleOut;
  const isDiscontinued =
    productFound &&
    PRODUCT_AVAILABILITY_STATE &&
    productState === PRODUCT_AVAILABILITY_STATE.DISCONTINUED;
  const isAbsent = productFound === false;

  if (!isDiscontinued && !isAbsent) return null;

  // Check the static redirect map for this slug.
  const redirectTarget = PRODUCT_REDIRECTS[productSlug];

  if (redirectTarget) {
    // Build an absolute redirect URL. Preserve locale prefix from the current
    // pathname so /en-lb/beirut/product/old-slug → /en-lb/beirut/product/new-slug.
    const localePrefix = extractLocalePrefix(pathname, basePath);
    const cleanBase = (basePath || "").replace(/\/$/, "");
    const location = redirectTarget.startsWith("http")
      ? redirectTarget
      : `${origin}${cleanBase}${localePrefix}/product/${encodeURIComponent(redirectTarget)}`;
    return {
      status: 301,
      headers: {
        location,
        "cache-control": "public, max-age=31536000, immutable",
        "x-robots-tag": "noindex",
      },
      body: `<!doctype html><html lang="en"><head><title>Moved</title>` + // i18n-ignore
        `<meta http-equiv="refresh" content="0;url=${location}" /></head>` + // i18n-ignore
        `<body><p>Redirecting…</p></body></html>`, // i18n-ignore
    };
  }

  // No redirect entry — the product is definitively gone. Issue 410.
  return {
    status: 410,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=86400",
      "x-robots-tag": "noindex",
    },
    body: `<!doctype html><html lang="en"><head><title>Gone – Presentail</title></head>` + // i18n-ignore
      `<body><h1>This product is no longer available.</h1>` + // i18n-ignore
      `<p><a href="/">Return to homepage</a></p></body></html>`, // i18n-ignore
  };
}

/**
 * Extracts the locale prefix from a product pathname so that redirect targets
 * preserve the original locale + city (e.g. "/en-lb/beirut").
 * Returns an empty string when no locale prefix is found.
 */
function extractLocalePrefix(pathname, basePath) {
  const base = (basePath || "").replace(/\/$/, "");
  const rel = base && pathname.startsWith(base)
    ? pathname.slice(base.length)
    : pathname;
  // Match /<lang>-<country>/<city> at the start of the relative path.
  const m = rel.match(/^(\/[a-z]{2}-[a-z]{2}\/[^/]+)(?=\/)/i);
  return m ? m[1] : "";
}

// All private-path and X-Robots-Tag logic lives in ./serve-robots.mjs.
// resolveXRobotsTagPure is imported above; this file wraps it with the
// runtime CURATED_FILTER_PAGES list via the resolveXRobotsTag() function below.

// Retired country subdomains whose link equity must be consolidated into the
// canonical apex.  Maps each lowercase, port-stripped hostname (as produced by
// normalizeHostHeader()) to the fixed locale-specific city-root target URL.
// ALL inbound paths on these hosts redirect to the city root — old WordPress
// URLs on these subdomains have no direct equivalent in the SPA, so the city
// homepage is the best landing destination.  Path is intentionally NOT
// preserved: lb.presentail.com/product-category/roses → /en-lb/beirut/.
const COUNTRY_SUBDOMAIN_TARGETS = new Map([
  ["lb.presentail.com", "https://presentail.com/en-lb/beirut/"],
  ["ae.presentail.com", "https://presentail.com/en-ae/dubai/"],
  ["cy.presentail.com", "https://presentail.com/en-cy/nicosia/"],
]);

// Rate-limit map: subdomain → last Slack alert timestamp (ms).
// Prevents Slack spam when CDN rules are not yet configured and the origin
// receives a burst of country-subdomain requests.  One alert per subdomain
// per 24-hour window is sufficient for ops to act on.
const COUNTRY_SUBDOMAIN_ALERT_LAST_MS = new Map();
const COUNTRY_SUBDOMAIN_ALERT_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Fire a rate-limited Slack alert when a country-subdomain request reaches the
 * origin server.  Indicates the CDN redirect layer is absent or misconfigured.
 * The alert is fire-and-forget and never blocks the redirect response.
 *
 * @param {string} subdomain  The matched hostname (e.g. "lb.presentail.com").
 * @param {string} path       The request URL (path + query string).
 */
function alertCountrySubdomainBypass(subdomain, path) {
  if (!process.env.ALERTS_SLACK_WEBHOOK_URL) return;
  const now = Date.now();
  const last = COUNTRY_SUBDOMAIN_ALERT_LAST_MS.get(subdomain) ?? 0;
  if (now - last < COUNTRY_SUBDOMAIN_ALERT_INTERVAL_MS) return;
  COUNTRY_SUBDOMAIN_ALERT_LAST_MS.set(subdomain, now);
  sendSlackAlert(
    `:warning: *presentail-web: country-subdomain request reached the origin server*\n` +
    `Host \`${subdomain}\` hit the in-server redirect guard (path: \`${path ?? "/"}\`).\n` +
    `This means traffic is bypassing the CDN redirect layer — check that the Cloudflare/GCP redirect rule is active.\n` +
    `See \`artifacts/presentail-web/docs/subdomain-redirect-runbook.md\` for setup steps.\n` +
    `_(This alert is rate-limited to once per subdomain per 24 h.)_`,
  ).catch(() => {});
}

/**
 * Local wrapper that forwards the runtime CURATED_FILTER_PAGES list to the
 * pure resolveXRobotsTag function imported from serve-robots.mjs.
 *
 * @param {string} host      Normalised hostname (no port, lowercase).
 * @param {string} pathname  URL pathname (after BASE_PATH stripping).
 * @param {string} [search]  URL query string (e.g. "?utm_source=foo").
 * @returns {string|null}    Header value, or null to omit the header.
 */
function resolveXRobotsTag(host, pathname, search) {
  return resolveXRobotsTagPure(host, pathname, search, CURATED_FILTER_PAGES);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

// Extensions that are already compressed or gain nothing from compression.
const BINARY_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".ico",
  ".woff", ".woff2", ".ttf",
  ".mp4", ".webm", ".mp3", ".ogg",
]);

// ---------------------------------------------------------------------------
// Compression helpers
// ---------------------------------------------------------------------------

/**
 * Pick the best compression encoding the client accepts, skipping binary types.
 * Returns "br", "gzip", or null (no compression).
 */
function pickEncoding(req, ext) {
  if (BINARY_EXTS.has(ext)) return null;
  const accept = req.headers["accept-encoding"] ?? "";
  if (accept.includes("br")) return "br";
  if (accept.includes("gzip")) return "gzip";
  return null;
}

/**
 * Compress a Buffer or string with the chosen encoding.
 * Returns a Buffer (or the original if encoding is null).
 */
async function compressBuffer(data, encoding) {
  if (encoding === "br") return brotliCompress(data);
  if (encoding === "gzip") return gzipCompress(data);
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

/**
 * Create a zlib transform stream for the chosen encoding, or null.
 */
function compressStream(encoding) {
  if (encoding === "br") return zlib.createBrotliCompress();
  if (encoding === "gzip") return zlib.createGzip();
  return null;
}

function safeJoin(root, urlPath) {
  const resolved = path.resolve(root, "." + urlPath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

// ---------------------------------------------------------------------------
// Load index.html — fail fast with a structured alert if the dist folder is
// absent (i.e. the Vite build step was skipped before this server started).
// ---------------------------------------------------------------------------
const indexHtml = await readStartupFile(
  path.join(DIST, "index.html"),
  "dist/index.html",
  "The Vite build step may not have run — fix by running `vite build` (or the deploy build step) and restarting the server.",
);

// ---------------------------------------------------------------------------
// Font preload hints — read the Vite manifest at startup to extract hashed
// .woff2 URLs and build <link rel="preload"> tag strings.
//
// Without preloads the browser must wait for the CSS bundle to download and
// parse before it discovers font URLs, adding ~100–200 ms to first paint.
// With preloads it can fetch fonts in parallel with the CSS bundle.
//
// Non-fatal: if the manifest is missing or unparseable the server continues
// without preload hints (a slower but correct degraded mode).
// ---------------------------------------------------------------------------
let fontPreloadTagsHtml = "";
{
  const manifestPath = path.join(DIST, ".vite", "manifest.json");
  try {
    const raw = fs.readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(raw);
    const links = Object.values(manifest)
      .filter((entry) => typeof entry.file === "string" && entry.file.endsWith(".woff2"))
      .map((entry) => {
        const href = `${BASE_PATH}/${entry.file}`;
        return `<link rel="preload" as="font" type="font/woff2" crossorigin href="${href}">`;
      });
    fontPreloadTagsHtml = links.join("\n    ");
    if (links.length > 0) {
      console.log(`Font preloads: ${links.length} woff2 file(s) registered from Vite manifest`);
    } else {
      console.warn("WARN: Font preloads: no .woff2 entries found in Vite manifest");
    }
  } catch (err) {
    console.warn(`WARN: Font preloads: could not read dist/.vite/manifest.json — ${err.message}`);
  }
}

/**
 * Inject font preload <link> tags immediately before </head>.
 * No-op when fontPreloadTagsHtml is empty (manifest missing or no fonts).
 *
 * @param {string} html
 * @returns {string}
 */
function injectFontPreloads(html) {
  if (!fontPreloadTagsHtml) return html;
  return html.replace("</head>", `    ${fontPreloadTagsHtml}\n  </head>`);
}

// ---------------------------------------------------------------------------
// Shared-chunk modulepreload hints — read the Vite manifest at startup and
// build <link rel="modulepreload"> tags for every non-page shared chunk.
//
// WHY: After a lazy page chunk (Home, Shop, etc.) loads, the browser discovers
// its static imports (dialog, input, app-shared, …) only at parse time and
// must make a 3rd-waterfall round-trip to fetch them.  Preloading them from
// the initial HTML response means they are already in the browser cache when
// any lazy chunk needs them, collapsing the 3-level chain to 2.
//
// What IS included: every JS chunk in the manifest that is NOT the main entry
// and NOT a lazy page-level chunk (identified by its source path basename).
//
// What IS NOT included: vendor chunks already covered by Vite's own
// modulePreload injection into the built index.html; but re-listing them in
// the HTTP response is harmless — the browser de-dupes link hints.
//
// Non-fatal: if the manifest is missing at startup (dev mode, or build hasn't
// run) the server skips injection silently and logs a single WARN.
// ---------------------------------------------------------------------------
const PAGE_BASENAMES = new Set([
  "Home", "Shop", "ProductDetail", "Cart", "Checkout",
  "SignIn", "SignUp", "Account", "Brands", "BrandDetail",
  "AllOccasions", "Landing", "OrderConfirmed", "Blog", "BlogPost",
  "Partner", "Weddings", "Corporate", "Contact", "Faqs", "Terms",
  "Privacy", "SharedFavorites", "Unauthorized", "ResetPassword",
  "PersonalInformation", "DeleteAccountDialog", "Favorites",
  "Careers", "not-found",
]);

let modulePreloadTagsHtml = "";
{
  const manifestPath = path.join(DIST, ".vite", "manifest.json");
  try {
    const raw = fs.readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(raw);
    const links = [];
    for (const entry of Object.values(manifest)) {
      if (typeof entry.file !== "string" || !entry.file.endsWith(".js")) continue;
      if (entry.isEntry) continue;
      if (entry.src) {
        const srcBase = path.basename(entry.src, path.extname(entry.src));
        if (PAGE_BASENAMES.has(srcBase)) continue;
      }
      const href = `${BASE_PATH}/${entry.file}`.replace(/\/+/g, "/");
      links.push(`<link rel="modulepreload" crossorigin href="${href}">`);
    }
    modulePreloadTagsHtml = links.join("\n    ");
    if (links.length > 0) {
      console.log(`Module preloads: ${links.length} shared chunk(s) registered from Vite manifest`);
    } else {
      console.warn("WARN: Module preloads: no shared chunks found in Vite manifest — waterfall fix inactive");
    }
  } catch (err) {
    console.warn(`WARN: Module preloads: could not read dist/.vite/manifest.json — ${err.message}`);
  }
}

/**
 * Inject modulepreload <link> tags for shared chunks immediately before </head>.
 * No-op when modulePreloadTagsHtml is empty (manifest missing or build not run).
 *
 * @param {string} html
 * @returns {string}
 */
function injectModulePreloads(html) {
  if (!modulePreloadTagsHtml) return html;
  return html.replace("</head>", `    ${modulePreloadTagsHtml}\n  </head>`);
}

// ---------------------------------------------------------------------------
// Check site.webmanifest — present in every Vite build; its absence suggests
// a partial build, but the app can still serve correctly without it (browsers
// requesting it will get a 404, which does not block core shopping flows).
// Non-fatal: logs WARN + Slack alert and continues.
// ---------------------------------------------------------------------------
await warnStartupFile(
  path.join(DIST, "site.webmanifest"),
  "dist/site.webmanifest",
  "The Vite build step may not have run or completed only partially — fix by running `vite build` and restarting the server.",
);

// ---------------------------------------------------------------------------
// Stripe Apple Pay merchant domain association file content.
//
// Set STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION to the exact contents of the file
// Stripe provides under Dashboard → Settings → Payment methods → Apple Pay →
// Domains → Add domain → Download file.  The secret must be the full file
// content (≥ 100 chars, not a "pmd_…" Payment Method Domain ID).
//
// When the secret is absent or invalid the endpoint returns 404 and Apple Pay
// in the browser will be disabled for all shoppers.  There is no built-in
// fallback — the previous one had an expired cert (May 2024) and would have
// silently broken checkout anyway.
// ---------------------------------------------------------------------------

/**
 * Returns the Stripe Apple Pay domain association file content to serve, or
 * null when the secret is absent or looks like a Stripe Payment Method Domain
 * ID rather than the downloaded file content.
 * @returns {string | null}
 */
function resolveStripeApplePayFileContent() {
  const envVal = process.env.STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION ?? "";
  if (envVal.length >= 100 && !envVal.startsWith("pmd_")) {
    return envVal;
  }
  return null;
}

/** @type {string | null} */
const STRIPE_APPLE_PAY_FILE_CONTENT = resolveStripeApplePayFileContent();

{
  const envVal = process.env.STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION ?? "";
  if (!envVal) {
    console.error(
      "WARN: STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION is not set — " +
        "Apple Pay domain association endpoint will return 404. " +
        "Apple Pay in the browser is DISABLED for all shoppers until this secret is set.",
    );
    console.error(
      "      Fix: Stripe Dashboard → Settings → Payment methods → Apple Pay → Domains → " +
        "presentail.com → Download verification file, then set the full file contents " +
        "(~1700 chars) as the STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION Replit secret and republish.",
    );
    if (process.env.NODE_ENV === "production") {
      sendSlackAlert(
        ":rotating_light: *presentail-web: STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION is not set*\n" +
          "The domain association endpoint returns *404* — Apple Pay in the browser is *disabled* for all shoppers.\n" +
          "Fix: Stripe Dashboard → Settings → Payment methods → Apple Pay → Domains → presentail.com → Download verification file, " +
          "then set the full file contents (~1700 chars) as the `STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION` Replit secret and republish.",
      ).catch(() => {});
    }
  } else if (envVal.startsWith("pmd_") || envVal.length < 100) {
    console.error(
      "WARN: STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION looks like a Stripe Payment Method Domain ID " +
        "(starts with 'pmd_' or is too short) rather than the file contents — " +
        "Apple Pay domain association endpoint will return 404. " +
        "To fix: update the secret to the full file content from Stripe Dashboard → " +
        "Settings → Payment methods → Apple Pay → Domains → Download file.",
    );
    if (process.env.NODE_ENV === "production") {
      sendSlackAlert(
        ":rotating_light: *presentail-web: STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION has wrong value*\n" +
          `The secret contains \`${envVal.slice(0, 30)}…\` — that is the Stripe Payment Method Domain ID, not the downloaded verification file.\n` +
          "The domain association endpoint returns *404* — Apple Pay in the browser is *disabled* for all shoppers.\n" +
          "Fix: Stripe Dashboard → Settings → Payment methods → Apple Pay → Domains → presentail.com → Download verification file, " +
          "then set the full file contents (~1700 chars) as the `STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION` Replit secret and republish.",
      ).catch(() => {});
    }
  } else {
    console.log(
      "INFO: STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION is set and looks valid — using env var value",
    );
  }
}

// ---------------------------------------------------------------------------
// Google Merchant Center site verification
//
// Setting GMC_VERIFICATION_FILE_TOKEN causes the server to respond to
// /{token}.html with "google-site-verification: {token}" — the HTML-file
// verification method that GMC uses to confirm domain ownership.
//
// Setting VITE_GOOGLE_MERCHANT_CENTER_VERIFICATION causes the server to inject
//   <meta name="google-site-verification" content="{token}" />
// into the <head> of every HTML page it serves — the meta-tag verification
// method.  Both env vars are optional; set whichever GMC asks for.
// ---------------------------------------------------------------------------
const GMC_VERIFICATION_FILE_TOKEN =
  process.env.GMC_VERIFICATION_FILE_TOKEN?.trim() || null;
const GMC_META_VERIFICATION_TOKEN =
  process.env.VITE_GOOGLE_MERCHANT_CENTER_VERIFICATION?.trim() || null;

/** Injects the GMC verification meta tag into HTML when configured. */
function injectGmcMeta(html) {
  if (!GMC_META_VERIFICATION_TOKEN) return html;
  return html.replace(
    "</head>",
    `<meta name="google-site-verification" content="${GMC_META_VERIFICATION_TOKEN}" /></head>`,
  );
}

// ---------------------------------------------------------------------------
// Sidecar (.br / .gz) existence cache
// ---------------------------------------------------------------------------
// Pre-compressed sidecars are build-time artifacts written by compress-assets.mjs.
// They never change while the process is running, so we cache their existence in a
// Set at startup instead of calling fs.existsSync on every request.
//
// NOTE: Sidecars generated after server start (e.g. by a post-deploy script that
// runs concurrently) are NOT detected — restart the server to pick them up.

const SIDECAR_PATHS = new Set();
collectSidecars(DIST, [".br", ".gz"], SIDECAR_PATHS);

{
  let brCount = 0;
  let gzCount = 0;
  for (const p of SIDECAR_PATHS) {
    if (p.endsWith(".br")) brCount++;
    else if (p.endsWith(".gz")) gzCount++;
  }
  console.log(`Sidecar cache: ${brCount} .br + ${gzCount} .gz paths loaded`);
  if (brCount === 0 && gzCount === 0 && process.env.NODE_ENV === "production") {
    console.warn("WARN: Sidecar cache is empty in production — compress-assets.mjs may not have run");
    sendSlackAlert(
      ":warning: *presentail-web: pre-compressed assets missing*\n" +
      "Both `.br` and `.gz` sidecar counts are 0 in production. " +
      "`compress-assets.mjs` may not have run during the last deploy. " +
      "All JS/CSS is being served with on-the-fly compression — fix by re-running `compress-assets.mjs` and restarting the server.",
    ).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// First-banner image URL cache
//
// Fetches the homepage banners once from the internal API and caches the first
// image-type banner's URL in memory. Injected into every homepage HTML response
// as a <link rel="preload"> tag so the browser preload scanner discovers and
// fetches the LCP hero image before the JS bundle executes.
//
// TTL: 5 minutes. Non-fatal: if the fetch fails the cache stays null and no
// preload tag is emitted — the page loads correctly, just without the hint.
// ---------------------------------------------------------------------------
let firstBannerImageUrl = null;
let firstBannerFetchedAt = 0;
const BANNER_CACHE_TTL_MS = 5 * 60 * 1000;

async function refreshFirstBannerImageUrl() {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 5_000);
    const res = await fetch(
      `${INTERNAL_API_BASE_URL}/api/homepage/banners?countryCode=LB`,
      { signal: ac.signal },
    );
    clearTimeout(timer);
    if (!res.ok) return;
    const json = await res.json();
    const banners = Array.isArray(json?.banners) ? json.banners : [];
    const first = banners.find((b) => b.mediaType === "image" && b.mediaUrl);
    firstBannerImageUrl = first?.mediaUrl ?? null;
    firstBannerFetchedAt = Date.now();
    if (firstBannerImageUrl) {
      console.log(`Banner preload cache: updated — ${firstBannerImageUrl.slice(0, 80)}`);
    }
  } catch {
    // Non-fatal — leave the existing cached value in place.
  }
}

// Fetch immediately at startup so the first incoming request always gets a
// preload tag (the API server is already up when the web server starts).
// Then refresh every 5 minutes when the cache has gone stale.
refreshFirstBannerImageUrl();
setInterval(() => {
  if (Date.now() - firstBannerFetchedAt >= BANNER_CACHE_TTL_MS) {
    refreshFirstBannerImageUrl();
  }
}, BANNER_CACHE_TTL_MS).unref();

// ---------------------------------------------------------------------------
// Dynamic sitemap.xml
// ---------------------------------------------------------------------------

// Sitemap constants and generation live in ./sitemap.mjs so the
// filtering / hreflang / lastmod logic can be unit-tested without booting the
// HTTP server. SITEMAP_CITIES, SITEMAP_LANGS and escXml are imported above
// because they are also used by the SPA route validation below.

// ---------------------------------------------------------------------------
// SPA route validation — mirrors the routes defined in src/App.tsx so the
// server can return a real HTTP 404 for locale-prefixed paths whose sub-route
// is not a known SPA route, rather than serving an indexable 200 shell.
// ---------------------------------------------------------------------------
const LOCALE_PATH_RE = /^\/([a-z]{2})-([a-z]{2})\/([^/]+)(\/.*)?$/;
const KNOWN_LOCALE_SUBROUTES_EXACT = new Set([
  "/shop", "/brands", "/occasions", "/cart", "/checkout",
  "/order-confirmed", "/careers", "/blog", "/partner",
  "/weddings", "/corporate", "/contact", "/faqs", "/terms", "/privacy",
  "/shipping-policy", "/return-policy",
  "/reset-password", "/unauthorized", "/account", "/favorites",
  "/sign-in", "/sign-up",
  // /auth is a recognised route in seo-inject.mjs (maps to routeKey "auth");
  // it must be listed here too so the SPA route guard does not 404 it.
  "/auth",
]);
function isKnownLocaleSubRoute(rest) {
  if (!rest || rest === "/" || rest === "") return true;
  if (KNOWN_LOCALE_SUBROUTES_EXACT.has(rest)) return true;
  if (
    rest.startsWith("/product/") ||
    rest.startsWith("/brand/") ||
    rest.startsWith("/occasion/") ||
    rest.startsWith("/category/") ||
    rest.startsWith("/blog/") ||
    rest.startsWith("/sign-in/") ||
    rest.startsWith("/sign-up/") ||
    rest.startsWith("/account/")
  ) return true;
  return false;
}

let sitemapCache = null;
let sitemapCacheTsMs = 0;
const SITEMAP_CACHE_TTL_MS = 15 * 60 * 1000;

let llmsTxtCache = null;
let llmsTxtCacheTsMs = 0;
const LLMS_TXT_CACHE_TTL_MS = 60 * 60 * 1000;

let llmsFullTxtCache = null;
let llmsFullTxtCacheTsMs = 0;

// llms.txt generation (generateLlmsTxt / generateLlmsFullTxt) lives in
// ./llms.mjs so its section assembly, fallback copy, and featured-product
// sorting/capping can be unit-tested without booting this HTTP server.

async function fetchSitemapJson(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    // Test-only hook: deliberately triggers the catch block so that the
    // ai-discovery-headers e2e-serve spec can assert the 500 path returns
    // text/plain and omits AI-discovery Link headers.  The guard ensures this
    // endpoint is never reachable in any production deployment.
    if (SERVE_TEST_HOOKS && req.url === "/__test/trigger-500") {
      throw new Error("Deliberate test-triggered 500 — SERVE_TEST_HOOKS=1");
    }

    const proto =
      (req.headers["x-forwarded-proto"]?.toString().split(",")[0] ?? "http").trim();
    // Canonical-domain redirect: send www.presentail.com → presentail.com with a
    // 301 before any file serving, SEO injection, or URL parsing so it is always
    // fast and unaffected by an unusual (e.g. comma-separated) host header. Both
    // the Host and X-Forwarded-Host headers are checked independently (logical
    // OR) — each is normalised (first comma-separated token, trimmed, lowercased,
    // and stripped of any :port suffix) so the redirect fires whenever either
    // header names the www host. The original path + query string (req.url) is
    // preserved verbatim on the redirect target.
    const normalizeHostHeader = (value) =>
      (value?.toString().split(",")[0] ?? "")
        .trim()
        .split(":")[0]
        .toLowerCase();

    // Hard guard: requests arriving on any www.* hostname are unconditionally
    // redirected to the apex. This fires even if WEB_CANONICAL_REDIRECT_FROM_HOST
    // is overridden or cleared, so the www→apex consolidation can never be
    // accidentally disabled by a misconfigured env var.
    const normalizedHost    = normalizeHostHeader(req.headers.host);
    const normalizedFwdHost = normalizeHostHeader(req.headers["x-forwarded-host"]);
    const isWwwHost =
      normalizedHost.startsWith("www.") || normalizedFwdHost.startsWith("www.");
    if (isWwwHost) {
      const apexOrigin = WWW_REDIRECT_TARGET_ORIGIN || "https://presentail.com";
      // stripTrackingParamsFromReqUrl removes utm_*, srsltid, fbclid, etc.
      // from the path+search before forwarding, so tracking params can never
      // appear in a server-issued Location header.
      res.writeHead(301, { location: `${apexOrigin}${stripTrackingParamsFromReqUrl(req.url)}` });
      res.end();
      return;
    }

    // Hard guard: the retired new.presentail.com subdomain is permanently
    // redirected to the canonical apex. This must fire unconditionally — no env
    // var controls it — so the redirect cannot be accidentally disabled.
    const isNewSubdomain =
      normalizedHost === "new.presentail.com" ||
      normalizedFwdHost === "new.presentail.com";
    if (isNewSubdomain) {
      const apexOrigin = WWW_REDIRECT_TARGET_ORIGIN || "https://presentail.com";
      res.writeHead(301, { location: `${apexOrigin}${stripTrackingParamsFromReqUrl(req.url)}` });
      res.end();
      return;
    }

    // Hard guard: retired country subdomains (lb., ae., cy.) are permanently
    // redirected to their canonical locale city-root on presentail.com so their
    // indexed pages and link equity merge into the apex.  Fires unconditionally
    // — no env var controls it.  The target is the fixed locale city homepage
    // (not path-preserving) because old WordPress paths on these subdomains have
    // no direct equivalent in the SPA; the city homepage is always a valid page.
    // This in-server guard activates once DNS CNAMEs for the subdomains are
    // pointed at this server; the CDN layer documented in
    // docs/subdomain-redirect-runbook.md should issue the 301 before traffic
    // ever reaches the origin server.
    const countrySubdomainTarget =
      COUNTRY_SUBDOMAIN_TARGETS.get(normalizedHost) ||
      COUNTRY_SUBDOMAIN_TARGETS.get(normalizedFwdHost);
    if (countrySubdomainTarget) {
      const matchedSubdomain = COUNTRY_SUBDOMAIN_TARGETS.has(normalizedHost)
        ? normalizedHost
        : normalizedFwdHost;
      // Alert ops that CDN layer may be absent — request reached origin directly.
      // Fire-and-forget; never blocks the redirect.
      alertCountrySubdomainBypass(matchedSubdomain, req.url ?? "/");
      res.writeHead(301, { location: countrySubdomainTarget });
      res.end();
      return;
    }

    const host = req.headers["x-forwarded-host"]?.toString() ?? req.headers.host ?? "localhost";
    const url = new URL(req.url ?? "/", `${proto}://${host}`);
    const origin = `${proto}://${host}`;

    // Strip BASE_PATH prefix for both asset lookup and SEO parsing so
    // canonical/hreflang reflect the locale path, not the deploy prefix.
    let pathname = url.pathname;
    if (BASE_PATH && pathname.startsWith(BASE_PATH)) {
      pathname = pathname.slice(BASE_PATH.length) || "/";
    }

    // Handle bare `/product/<slug>` (shared links from the mobile app).
    //
    // WhatsApp, iMessage, and other social-preview crawlers may not follow
    // 301 redirects, so a pure redirect means they never see the OG meta
    // tags and the link preview falls back to the default site card.
    //
    // Fix: serve the OG-injected HTML directly on this path so crawlers see
    // the product share card immediately.  A <meta http-equiv="refresh"> and
    // an inline JS redirect send real browsers to the canonical locale-
    // prefixed URL (e.g. /en-lb/beirut/product/<slug>) within milliseconds.
    // x-robots-tag: noindex prevents the redirect intermediary from competing
    // with the canonical page in search results.
    //
    // Fallback: if OG injection is unavailable (e.g. a cold-cache startup
    // error before seo-inject.mjs is ready), fall back to the original 301
    // so mobile share links still land on the correct page.
    //
    // NOTE: Must run BEFORE the trailing-slash redirect so /product/<slug>/
    // (with trailing slash) is handled here rather than being stripped to
    // /product/<slug> first.
    const productRedirectMatch = pathname.match(/^\/product\/([^/]+)\/?$/);
    if (productRedirectMatch) {
      const slug = productRedirectMatch[1];
      // `slug` already contains the raw path segment from the request URL
      // (percent-encoded characters are preserved as-is); do NOT
      // encodeURIComponent here or we double-encode the slug.
      const canonicalTarget = `${BASE_PATH}/en-lb/beirut/product/${slug}`;
      if (typeof injectSeoTagsAsync === "function") {
        try {
          // Use the locale-prefixed virtual path so seo-inject resolves the
          // correct product data and builds the product OG image URL.
          const virtualPath = `/en-lb/beirut/product/${slug}`;
          let productHtml = await injectSeoTagsAsync(indexHtml, virtualPath, {
            basePath: BASE_PATH,
            origin,
            apiBaseUrl: INTERNAL_API_BASE_URL,
            acceptLanguage: req.headers["accept-language"],
          });
          // Inject meta-refresh and JS redirect so real browsers navigate to
          // the canonical page immediately (crawlers ignore these and read the
          // OG tags instead).
          const safeTarget = canonicalTarget.replace(/"/g, "&quot;");
          const refreshMeta = `<meta http-equiv="refresh" content="0; url=${safeTarget}">`;
          const jsRedirect = `<script>window.location.replace(${JSON.stringify(canonicalTarget)});</script>`; // i18n-ignore — server-side JS redirect injected into HTML; not a UI string
          productHtml = productHtml.replace("</head>", `${refreshMeta}${jsRedirect}</head>`);
          res.writeHead(200, {
            "content-type": MIME[".html"],
            "x-robots-tag": "noindex",
            "cache-control": "public, no-cache, s-maxage=300, stale-while-revalidate=60",
            "expires": "0",
            "vary": "Accept-Encoding",
            "link": `<${origin}${canonicalTarget}>; rel="canonical"`,
          });
          res.end(productHtml);
          return;
        } catch (_err) {
          // OG injection failed — fall through to the 301 below.
        }
      }
      res.writeHead(301, { location: canonicalTarget });
      res.end();
      return;
    }

    // Handle bare `/brand/<slug>` (shared links from the mobile app).
    //
    // WhatsApp, iMessage, and other social-preview crawlers may not follow
    // 301 redirects, so a pure redirect means they never see the OG meta
    // tags and the link preview falls back to the default site card.
    //
    // Fix: serve the OG-injected HTML directly on this path so crawlers see
    // the branded share card immediately.  A <meta http-equiv="refresh"> and
    // an inline JS redirect send real browsers to the canonical locale-
    // prefixed URL (e.g. /en-lb/beirut/brand/<slug>) within milliseconds.
    // x-robots-tag: noindex prevents the redirect intermediary from competing
    // with the canonical page in search results.
    //
    // Fallback: if OG injection is unavailable (e.g. a cold-cache startup
    // error before seo-inject.mjs is ready), fall back to the original 301
    // so mobile share links still land on the correct page.
    //
    // NOTE: Must run BEFORE the trailing-slash redirect so /brand/<slug>/
    // (with trailing slash) is handled here rather than being stripped to
    // /brand/<slug> first.
    const brandRedirectMatch = pathname.match(/^\/brand\/([^/]+)\/?$/);
    if (brandRedirectMatch) {
      const slug = brandRedirectMatch[1];
      // `slug` already contains the raw path segment from the request URL
      // (percent-encoded characters are preserved as-is); do NOT
      // encodeURIComponent here or we double-encode the slug.
      const canonicalTarget = `${BASE_PATH}/en-lb/beirut/brand/${slug}`;
      if (typeof injectSeoTagsAsync === "function") {
        try {
          // Use the locale-prefixed virtual path so seo-inject resolves the
          // correct brand data and builds the branded OG image URL.
          const virtualPath = `/en-lb/beirut/brand/${slug}`;
          let brandHtml = await injectSeoTagsAsync(indexHtml, virtualPath, {
            basePath: BASE_PATH,
            origin,
            apiBaseUrl: INTERNAL_API_BASE_URL,
            acceptLanguage: req.headers["accept-language"],
          });
          // Inject meta-refresh and JS redirect so real browsers navigate to
          // the canonical page immediately (crawlers ignore these and read the
          // OG tags instead).
          const safeTarget = canonicalTarget.replace(/"/g, "&quot;");
          const refreshMeta = `<meta http-equiv="refresh" content="0; url=${safeTarget}">`;
          const jsRedirect = `<script>window.location.replace(${JSON.stringify(canonicalTarget)});</script>`; // i18n-ignore — server-side JS redirect injected into HTML; not a UI string
          brandHtml = brandHtml.replace("</head>", `${refreshMeta}${jsRedirect}</head>`);
          res.writeHead(200, {
            "content-type": MIME[".html"],
            "x-robots-tag": "noindex",
            "cache-control": "public, no-cache, s-maxage=300, stale-while-revalidate=60",
            "expires": "0",
            "vary": "Accept-Encoding",
            "link": `<${origin}${canonicalTarget}>; rel="canonical"`,
          });
          res.end(brandHtml);
          return;
        } catch (_err) {
          // OG injection failed — fall through to the 301 below.
        }
      }
      res.writeHead(301, { location: canonicalTarget });
      res.end();
      return;
    }

    // Handle bare `/occasion/<slug>` and `/category/<slug>` (share links).
    //
    // Same rationale as the /product and /brand blocks above: WhatsApp,
    // iMessage, and other social-preview crawlers may not follow 301
    // redirects, so these paths serve the OG-injected HTML directly (200)
    // with a <meta http-equiv="refresh"> + JS redirect for real browsers.
    // x-robots-tag: noindex keeps the redirect intermediary out of search
    // results.  Fallback: 301 when injectSeoTagsAsync is unavailable.
    //
    // NOTE: Must run BEFORE the trailing-slash redirect so /occasion/<slug>/
    // and /category/<slug>/ are handled here rather than being stripped first.
    const shopPageRedirectMatch = pathname.match(/^\/(occasion|category)\/([^/]+)\/?$/);
    if (shopPageRedirectMatch) {
      const kind = shopPageRedirectMatch[1];
      const slug = shopPageRedirectMatch[2];
      // `slug` already contains the raw path segment from the request URL
      // (percent-encoded characters are preserved as-is); do NOT
      // encodeURIComponent here or we double-encode the slug.
      const canonicalTarget = `${BASE_PATH}/en-lb/beirut/${kind}/${slug}`;
      if (typeof injectSeoTagsAsync === "function") {
        try {
          // Use the locale-prefixed virtual path so seo-inject resolves the
          // correct occasion/category data and builds the right OG tags.
          const virtualPath = `/en-lb/beirut/${kind}/${slug}`;
          let pageHtml = await injectSeoTagsAsync(indexHtml, virtualPath, {
            basePath: BASE_PATH,
            origin,
            apiBaseUrl: INTERNAL_API_BASE_URL,
            acceptLanguage: req.headers["accept-language"],
          });
          // Inject meta-refresh and JS redirect so real browsers navigate to
          // the canonical page immediately (crawlers ignore these and read the
          // OG tags instead).
          const safeTarget = canonicalTarget.replace(/"/g, "&quot;");
          const refreshMeta = `<meta http-equiv="refresh" content="0; url=${safeTarget}">`;
          const jsRedirect = `<script>window.location.replace(${JSON.stringify(canonicalTarget)});</script>`; // i18n-ignore — server-side JS redirect injected into HTML; not a UI string
          pageHtml = pageHtml.replace("</head>", `${refreshMeta}${jsRedirect}</head>`);
          res.writeHead(200, {
            "content-type": MIME[".html"],
            "x-robots-tag": "noindex",
            "cache-control": "public, no-cache, s-maxage=300, stale-while-revalidate=60",
            "expires": "0",
            "vary": "Accept-Encoding",
            "link": `<${origin}${canonicalTarget}>; rel="canonical"`,
          });
          res.end(pageHtml);
          return;
        } catch (_err) {
          // OG injection failed — fall through to the 301 below.
        }
      }
      res.writeHead(301, { location: canonicalTarget });
      res.end();
      return;
    }

    // Redirect old shop query-param URLs to clean SEO paths so external links
    // already indexed under the old format pass their ranking signals forward.
    //   /:lang-:country/:city/shop?category=<slug>  →  /:lang-:country/:city/category/<slug>
    //   /:lang-:country/:city/shop?occasion=<slug>  →  /:lang-:country/:city/occasion/<slug>
    // Uses 301 (permanent) so search engines update their indexes.
    // NOTE: Must run BEFORE the trailing-slash redirect so /shop/?param=value
    // (with trailing slash on the shop segment) is handled here rather than
    // being stripped and losing the query params redirect.
    const shopRedirectMatch = pathname.match(
      /^(\/[a-z]{2}-[a-z]{2}\/[^/]+)\/shop\/?$/,
    );
    if (shopRedirectMatch) {
      const localeCity = shopRedirectMatch[1];
      const categorySlug = url.searchParams.get("category");
      const occasionSlug = url.searchParams.get("occasion");
      if (categorySlug) {
        res.writeHead(301, { location: `${BASE_PATH}${localeCity}/category/${encodeURIComponent(categorySlug)}` });
        res.end();
        return;
      }
      if (occasionSlug) {
        res.writeHead(301, { location: `${BASE_PATH}${localeCity}/occasion/${encodeURIComponent(occasionSlug)}` });
        res.end();
        return;
      }
    }

    // -------------------------------------------------------------------------
    // Legacy WordPress / WooCommerce redirect + 410 Gone block.
    // Source of truth: .local/seo/legacy-redirect-proposal.md
    //
    // Sections 1–3: WP infrastructure paths, date archives, author archives
    //   → 410 Gone (no meaningful equivalent on the current Presentail site).
    // Section 4: WC shop pagination → /en-lb/beirut/shop (301).
    // Section 5: /product-category/:slug → /en-lb/beirut/category/:slug (301).
    // Section 6: /product-tag/:slug     → /en-lb/beirut/occasion/:slug (301).
    // Section 7: Vanity archive pages   → canonical equivalents (301).
    //
    // This block must run BEFORE the trailing-slash redirect so patterns that
    // include a trailing slash (e.g. /wp-admin/, /product-category/flowers/)
    // are matched directly rather than being stripped and re-evaluated.
    // -------------------------------------------------------------------------

    // Sections 1–3: WP infra paths, date/author archives → 410 Gone ----------
    if (
      pathname.startsWith("/wp-admin") ||
      pathname === "/wp-login.php" ||
      pathname.startsWith("/wp-json") ||
      pathname.startsWith("/wp-content") ||
      pathname.startsWith("/wp-includes") ||
      /^\/author\/[^/]/.test(pathname) ||
      /^\/\d{4}(\/\d{2})?(\/\d{2})?\/?$/.test(pathname)
    ) {
      res.writeHead(410, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=31536000, immutable",
      });
      res.end("Gone");
      return;
    }

    // Section 4: WC shop pagination → main shop (301) -----------------------
    if (/^\/shop\/page\/\d+\/?$/.test(pathname)) {
      res.writeHead(301, {
        location: `${BASE_PATH}/en-lb/beirut/shop`,
        "cache-control": "public, max-age=31536000, immutable",
      });
      res.end();
      return;
    }

    // Section 5: WP product-category → Presentail category (301) -----------
    // Slug map: WC category slug → Presentail category slug.
    // Unknown slugs fall through to /en-lb/beirut/shop.
    const WC_CATEGORY_SLUG_MAP = {
      "flowers":             "hand-bouquets",
      "flower-bouquets":     "hand-bouquets",
      "bouquets":            "hand-bouquets",
      "luxury-arrangements": "lux-arrangements",
      "lux-arrangements":    "lux-arrangements",
      "chocolates":          "chocolate",
      "chocolate":           "chocolate",
      "gift-boxes":          "gift-boxes",
      "hampers":             "hampers",
      "gift-baskets":        "gift-baskets",
      "plants":              "plants",
      "cakes":               "cakes",
      "cakes-pastries":      "cakes",
      "balloons":            "balloons",
      "flower-boxes":        "flower-boxes",
      "flower-baskets":      "flower-baskets",
      "bundles":             "bundles",
    };

    // Matches /product-category/:slug and /product-category/:slug/page/:n/
    const productCategoryMatch = pathname.match(
      /^\/product-category\/([^/]+?)(?:\/page\/\d+)?\/?$/
    );
    if (productCategoryMatch) {
      const wcSlug = productCategoryMatch[1];
      const presentailSlug = WC_CATEGORY_SLUG_MAP[wcSlug];
      const target = presentailSlug
        ? `${BASE_PATH}/en-lb/beirut/category/${encodeURIComponent(presentailSlug)}`
        : `${BASE_PATH}/en-lb/beirut/shop`;
      res.writeHead(301, {
        location: target,
        "cache-control": "public, max-age=31536000, immutable",
      });
      res.end();
      return;
    }

    // Section 6: WP product-tag → Presentail occasion (301) ----------------
    // Slug map: WC tag slug → Presentail occasion slug.
    // Unknown tags fall through to /en-lb/beirut/occasions.
    const WC_TAG_SLUG_MAP = {
      "birthday":        "birthday",
      "love":            "love-romance",
      "romance":         "love-romance",
      "love-romance":    "love-romance",
      "housewarming":    "housewarming",
      "anniversary":     "anniversary",
      "new-job":         "new-job",
      "promotion":       "promotion",
      "graduation":      "graduation",
      "congratulations": "congratulations",
      "thank-you":       "thank-you",
      "get-well-soon":   "get-well-soon",
      "newborn":         "new-born",
      "new-born":        "new-born",
      "eid":             "eid",
      "ramadan":         "ramadan",
      "wedding":         "wedding",
      "thinking-of-you": "thinking-of-you",
      "farewell":        "farewell",
      "condolences":     "condolences",
      "colleague":       "colleague",
      "colleagues":      "colleague",
      "friend":          "friend",
      "im-sorry":        "im-sorry",
      "sorry":           "im-sorry",
      "children":        "children",
      "valentine":       "valentines-day",
      "mothers-day":     "mothers-day",
      "womens-day":      "womens-day",
      "fathers-day":     "fathers-day",
      "christmas":       "christmas",
      "katb-kitab":      "katb-kitab",
    };

    // Matches /product-tag/:slug and /product-tag/:slug/page/:n/ (row 16)
    const productTagMatch = pathname.match(
      /^\/product-tag\/([^/]+?)(?:\/page\/\d+)?\/?$/
    );
    if (productTagMatch) {
      const wcTag = productTagMatch[1];
      const presentailOccasion = WC_TAG_SLUG_MAP[wcTag];
      const target = presentailOccasion
        ? `${BASE_PATH}/en-lb/beirut/occasion/${encodeURIComponent(presentailOccasion)}`
        : `${BASE_PATH}/en-lb/beirut/occasions`;
      res.writeHead(301, {
        location: target,
        "cache-control": "public, max-age=31536000, immutable",
      });
      res.end();
      return;
    }

    // Section 7: WC vanity archive pages → canonical equivalents (301) -----
    // Trailing slash is normalised out before the lookup so /offer and /offer/
    // both match.
    const VANITY_REDIRECT_MAP = {
      "/offer":        `${BASE_PATH}/en-lb/beirut/shop`,
      "/offers":       `${BASE_PATH}/en-lb/beirut/shop`,
      "/sale":         `${BASE_PATH}/en-lb/beirut/shop`,
      "/sales":        `${BASE_PATH}/en-lb/beirut/shop`,
      "/best-sellers": `${BASE_PATH}/en-lb/beirut/shop`,
      "/best-seller":  `${BASE_PATH}/en-lb/beirut/shop`,
      "/new-arrivals": `${BASE_PATH}/en-lb/beirut/shop`,
      "/new-arrival":  `${BASE_PATH}/en-lb/beirut/shop`,
      "/all-flowers":  `${BASE_PATH}/en-lb/beirut/category/hand-bouquets`,
      "/flowers":      `${BASE_PATH}/en-lb/beirut/category/hand-bouquets`,
    };

    const vanityKey =
      pathname.length > 1 && pathname.endsWith("/")
        ? pathname.slice(0, -1)
        : pathname;
    const vanityTarget = VANITY_REDIRECT_MAP[vanityKey];
    if (vanityTarget) {
      res.writeHead(301, {
        location: vanityTarget,
        "cache-control": "public, max-age=31536000, immutable",
      });
      res.end();
      return;
    }

    // Section 8: Legacy WordPress country-prefix redirects (301) ---------------
    // Maps old WordPress country-prefixed paths to the correct new locale-city
    // equivalents in a single hop. Sub-paths with /product/, /product-category/,
    // and /product-tag/ are mapped using the WC_CATEGORY_SLUG_MAP and
    // WC_TAG_SLUG_MAP defined in sections 5–6 above.
    // All redirect targets are built with BASE_PATH prefix and strip tracking
    // params from the outbound Location header.
    const COUNTRY_PREFIX_CONFIG = [
      { prefixes: ["lebanon"],      locale: "en-lb", city: "beirut" },
      { prefixes: ["cyprus"],       locale: "en-cy", city: "nicosia" },
      { prefixes: ["uae", "dubai"], locale: "en-ae", city: "dubai" },
    ];

    for (const { prefixes, locale, city } of COUNTRY_PREFIX_CONFIG) {
      for (const prefix of prefixes) {
        const base = `/${prefix}`;
        const isMatch =
          pathname === base ||
          pathname === `${base}/` ||
          pathname.startsWith(`${base}/`);
        if (!isMatch) continue;

        const rest = pathname.startsWith(`${base}/`)
          ? pathname.slice(base.length)
          : "";

        let countryRedirectTarget;

        // /country/product/slug → /locale/city/product/slug
        const productMatch = rest.match(/^\/product\/([^/]+?)\/?$/);
        if (productMatch) {
          countryRedirectTarget = `${BASE_PATH}/${locale}/${city}/product/${encodeURIComponent(productMatch[1])}`;
        } else {
          // /country/product-category/wc-slug → /locale/city/category/presentail-slug
          const catMatch = rest.match(/^\/product-category\/([^/]+?)(?:\/page\/\d+)?\/?$/);
          if (catMatch) {
            const mappedCat = WC_CATEGORY_SLUG_MAP[catMatch[1]];
            countryRedirectTarget = mappedCat
              ? `${BASE_PATH}/${locale}/${city}/category/${encodeURIComponent(mappedCat)}`
              : `${BASE_PATH}/${locale}/${city}/shop`;
          } else {
            // /country/product-tag/wc-tag → /locale/city/occasion/presentail-slug
            const tagMatch = rest.match(/^\/product-tag\/([^/]+?)(?:\/page\/\d+)?\/?$/);
            if (tagMatch) {
              const mappedTag = WC_TAG_SLUG_MAP[tagMatch[1]];
              countryRedirectTarget = mappedTag
                ? `${BASE_PATH}/${locale}/${city}/occasion/${encodeURIComponent(mappedTag)}`
                : `${BASE_PATH}/${locale}/${city}/occasions`;
            } else {
              // Bare country path or unrecognised sub-path → locale city home.
              // No trailing slash — avoids a two-hop chain with the trailing-
              // slash redirect that runs immediately after this block.
              countryRedirectTarget = `${BASE_PATH}/${locale}/${city}`;
            }
          }
        }

        res.writeHead(301, {
          location: countryRedirectTarget + stripTrackingParams(url.search),
          "cache-control": "public, max-age=31536000, immutable",
        });
        res.end();
        return;
      }
    }

    // Trailing-slash redirect: 301 any path that ends with "/" (other than the
    // root "/" itself, /.well-known/* paths, and bare /product/ which has no
    // slug and must fall through to the SPA shell) to the equivalent clean URL.
    // This eliminates the duplicate-content penalty caused by crawlers following
    // both /en-lb/beirut/faqs and /en-lb/beirut/faqs/ as separate URLs.
    // Applied after BASE_PATH stripping so the redirect target is correct.
    if (
      pathname.length > 1 &&
      pathname.endsWith("/") &&
      !pathname.startsWith("/.well-known") &&
      !pathname.startsWith("/api") &&
      // Bare /product/ or /brand/ (no slug) must not be trailing-slash-redirected;
      // they have already bypassed the respective redirect above (no slug) and
      // should reach the SPA fallback as-is so the client can render a 404 page.
      pathname !== "/product/" &&
      pathname !== "/brand/"
    ) {
      const cleanPath = BASE_PATH + pathname.slice(0, -1);
      // stripTrackingParams removes utm_*, srsltid, fbclid, etc. so the
      // Location header for the trailing-slash 301 is always tracking-free.
      res.writeHead(301, {
        location: cleanPath + stripTrackingParams(url.search),
        "cache-control": "public, max-age=31536000, immutable",
      });
      res.end();
      return;
    }

    // Stripe Apple Pay merchant domain association file.
    // Stripe requires this file to be served at
    // /.well-known/apple-developer-merchantid-domain-association so it can
    // verify the domain before enabling Apple Pay in the browser.
    // Set STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION to the exact file content Stripe
    // provides under Dashboard → Settings → Payment methods → Apple Pay →
    // Domains → Add domain → Download file.
    // Returns 404 when the secret is absent or invalid — no expired fallback.
    if (pathname === "/.well-known/apple-developer-merchantid-domain-association") {
      if (!STRIPE_APPLE_PAY_FILE_CONTENT) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end(
          "Apple Pay domain association file not configured. " +
            "Set the STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION secret to the file content " +
            "downloaded from Stripe Dashboard → Settings → Payment methods → Apple Pay → Domains.",
        );
        return;
      }
      res.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=3600, must-revalidate",
        "expires": makeExpires(3600),
      });
      res.end(STRIPE_APPLE_PAY_FILE_CONTENT);
      return;
    }

    // Google Merchant Center HTML-file verification.
    // GMC asks you to upload a file named after the verification token at the
    // root of the domain.  When GMC_VERIFICATION_FILE_TOKEN is set, we serve
    // that file dynamically so no build step or public-folder change is needed.
    // The response body follows the exact format GMC expects:
    //   google-site-verification: {token}
    if (
      GMC_VERIFICATION_FILE_TOKEN &&
      pathname === `/${GMC_VERIFICATION_FILE_TOKEN}.html`
    ) {
      res.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=3600, must-revalidate",
        "expires": makeExpires(3600),
      });
      res.end(`google-site-verification: ${GMC_VERIFICATION_FILE_TOKEN}`);
      return;
    }

    // Internal sitemap cache invalidation — called by the API server when a
    // product.updated or product.restocked OS webhook event is received, so the
    // next /sitemap.xml request regenerates with fresh availability data instead
    // of waiting up to SITEMAP_CACHE_TTL_MS (15 min) for the TTL to expire.
    // Protected by PUSH_ADMIN_TOKEN so it cannot be triggered by untrusted callers.
    if (req.method === "POST" && pathname === "/__internal/sitemap-invalidate") {
      const adminToken = (process.env.PUSH_ADMIN_TOKEN ?? "").trim();
      const rawToken = req.headers["x-push-admin-token"];
      const providedToken = (Array.isArray(rawToken) ? rawToken[0] : rawToken ?? "").trim();
      if (!adminToken || !providedToken || providedToken !== adminToken) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, message: "Unauthorized" })); // i18n-ignore
        return;
      }
      sitemapCache = null;
      sitemapCacheTsMs = 0;
      console.info("[sitemap] cache invalidated via internal webhook hook");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // Dynamic sitemap — intercept before file lookup so a missing
    // dist/public/sitemap.xml doesn't fall through to the SPA shell.
    // The cache has a TTL (SITEMAP_CACHE_TTL_MS) so catalog data stays current
    // without a server restart. On regeneration failure the previous cached
    // value is retained (stale-while-revalidate); on a cold-cache failure a
    // static, catalog-free sitemap (root + locale pages) is served so crawlers
    // never receive an empty body or a 500.
    if (pathname === "/sitemap.xml") {
      const resolved = await resolveSitemap({
        cache: { value: sitemapCache, tsMs: sitemapCacheTsMs },
        nowMs: Date.now(),
        ttlMs: SITEMAP_CACHE_TTL_MS,
        generateFull: () =>
          generateSitemap(origin, BASE_PATH, fetchSitemapJson, INTERNAL_API_BASE_URL),
        generateStatic: () => buildSitemapXml({ origin, basePath: BASE_PATH }),
        onError: (err, mode) => {
          // Log so ops can tell when regeneration is consistently failing.
          console.warn("[sitemap.xml] regeneration failed; serving %s. Error: %s",
            mode === "stale" ? "stale cache" : "static fallback",
            err?.message ?? err,
          );
        },
      });
      sitemapCache = resolved.value;
      sitemapCacheTsMs = resolved.tsMs;
      const encoding = pickEncoding(req, ".xml");
      const body = await compressBuffer(sitemapCache, encoding);
      const headers = {
        "content-type": MIME[".xml"],
        "cache-control": "public, max-age=3600, must-revalidate",
        "vary": "Accept-Encoding",
      };
      if (encoding) headers["content-encoding"] = encoding;
      res.writeHead(200, headers);
      res.end(body);
      return;
    }

    // /llms.txt — machine-readable storefront index for AI agents / LLM browsers.
    if (pathname === "/llms.txt") {
      const nowMs = Date.now();
      if (!llmsTxtCache || nowMs - llmsTxtCacheTsMs > LLMS_TXT_CACHE_TTL_MS) {
        llmsTxtCache = generateLlmsTxt(origin, BASE_PATH);
        llmsTxtCacheTsMs = nowMs;
      }
      const encoding = pickEncoding(req, ".txt");
      const body = await compressBuffer(llmsTxtCache, encoding);
      const headers = {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=3600, must-revalidate",
        "vary": "Accept-Encoding",
      };
      if (encoding) headers["content-encoding"] = encoding;
      res.writeHead(200, headers);
      res.end(body);
      return;
    }

    // /llms-full.txt — extended llmstxt.org variant: same index as /llms.txt
    // plus full body copy for each key static page, so LLM-powered tools can
    // ingest the entire site in a single fetch (max-age=3600, same as /llms.txt).
    // The cache has a TTL (LLMS_TXT_CACHE_TTL_MS) so product data stays current
    // without a server restart. On regeneration failure the previous cached value
    // is retained (stale-while-revalidate); on a cold-cache failure a minimal
    // placeholder is served so the route never crashes.
    if (pathname === "/llms-full.txt") {
      const resolved = await resolveLlmsFullTxt({
        cache: { value: llmsFullTxtCache, tsMs: llmsFullTxtCacheTsMs },
        nowMs: Date.now(),
        ttlMs: LLMS_TXT_CACHE_TTL_MS,
        generateFull: () =>
          generateLlmsFullTxt(origin, BASE_PATH, fetchSitemapJson, INTERNAL_API_BASE_URL),
        generateIndex: () => generateLlmsTxt(origin, BASE_PATH),
        onError: (err, mode) => {
          // Log so ops can tell when regeneration is consistently failing.
          console.warn("[llms-full.txt] regeneration failed; serving %s. Error: %s",
            mode === "stale" ? "stale cache" : "index-only fallback",
            err?.message ?? err,
          );
        },
      });
      llmsFullTxtCache = resolved.value;
      llmsFullTxtCacheTsMs = resolved.tsMs;
      const encoding = pickEncoding(req, ".txt");
      const body = await compressBuffer(llmsFullTxtCache, encoding);
      const headers = {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=3600, must-revalidate",
        "vary": "Accept-Encoding",
      };
      if (encoding) headers["content-encoding"] = encoding;
      res.writeHead(200, headers);
      res.end(body);
      return;
    }

    // /sitemap.md — Markdown index of all public per-page Markdown mirrors.
    // Fetches live catalog data (products, brands, occasions, categories) to
    // enumerate .md URLs grouped by section. Falls back gracefully on error.
    if (pathname === "/sitemap.md") {
      let catalogData = { products: [], brands: [], occasions: [], categories: [] };
      try {
        const [productsData, brandsData, metaData] = await Promise.all([
          fetchSitemapJson(`${INTERNAL_API_BASE_URL}/api/woo/products?lang=en&countryCode=LB`),
          fetchSitemapJson(`${INTERNAL_API_BASE_URL}/api/woo/brands`),
          fetchSitemapJson(`${INTERNAL_API_BASE_URL}/api/catalog/metadata`),
        ]);
        catalogData = {
          products: productsData?.products ?? [],
          brands: brandsData?.brands ?? [],
          occasions: metaData?.occasions ?? [],
          categories: metaData?.categories ?? [],
        };
      } catch {
        // fall through to empty catalog — sitemap.md still renders with sections intact
      }
      const sitemapMd = buildSitemapMd({
        origin,
        basePath: BASE_PATH,
        ...catalogData,
        lastmod: new Date().toISOString().slice(0, 10),
      });
      const encoding = pickEncoding(req, ".txt");
      const body = await compressBuffer(sitemapMd, encoding);
      const headers = {
        "content-type": "text/markdown; charset=utf-8",
        "cache-control": "public, max-age=3600, must-revalidate",
        "vary": "Accept-Encoding",
        // Link back to the canonical HTML sitemap so HTTP-level crawlers can
        // discover the XML sitemap even when requesting the Markdown version.
        "link": `<${origin}/sitemap.xml>; rel="alternate"; type="application/xml"`,
      };
      if (encoding) headers["content-encoding"] = encoding;
      res.writeHead(200, headers);
      res.end(body);
      return;
    }

    // /agents.md — agent guidance file describing what AI agents can find on this site.
    if (pathname === "/agents.md") {
      const agentsMd = [
        "# Presentail — Agent Guidance",
        "",
        "Presentail is a luxury flower and gift delivery platform serving Lebanon, the UAE (Dubai and Abu Dhabi), and Cyprus.",
        "Shoppers can order curated arrangements, gift boxes, hampers, and more from top local and international brands,",
        "with same-day Express delivery or scheduled delivery to a specific date and time slot.",
        "",
        "## Installation",
        "",
        "No installation is required. Presentail is a hosted web service accessible at https://presentail.com",
        "and via the Presentail iOS/Android mobile app. Use the API endpoints and Markdown mirrors described below",
        "to fetch structured content programmatically.",
        "",
        "## Configuration",
        "",
        "All pages are publicly accessible without authentication. Content is locale-prefixed:",
        "- **Lebanon**: /en-lb/beirut/, /ar-lb/beirut/, /fr-lb/beirut/",
        "- **UAE (Dubai)**: /en-ae/dubai/, /ar-ae/dubai/, /fr-ae/dubai/",
        "- **UAE (Abu Dhabi)**: /en-ae/abu-dhabi/",
        "- **Cyprus**: /en-cy/nicosia/, /ar-cy/nicosia/, /fr-cy/nicosia/",
        "",
        "Append **.md** to any public page URL to receive a Markdown version (YAML frontmatter + body).",
        "Add the header `Accept: text/markdown` as an alternative to the .md suffix.",
        "",
        "## Usage",
        "",
        "Fetch product, brand, category, and occasion data via the public Markdown mirrors:",
        "",
        "```",
        "# Homepage overview",
        "GET /index.md",
        "",
        "# City home (Lebanon/Beirut, English)",
        "GET /en-lb/beirut.md",
        "",
        "# Product listing for Beirut",
        "GET /en-lb/beirut/shop.md",
        "",
        "# Specific product",
        "GET /en-lb/beirut/product/{slug}.md",
        "",
        "# Specific brand",
        "GET /en-lb/beirut/brand/{slug}.md",
        "",
        "# Specific occasion",
        "GET /en-lb/beirut/occasion/{slug}.md",
        "",
        "# Blog article",
        "GET /en-lb/beirut/blog/{slug}.md",
        "```",
        "",
        "## Examples",
        "",
        "```",
        "# Fetch full LLM-ready content index",
        "curl https://presentail.com/llms-full.txt",
        "",
        "# Fetch Beirut shop as Markdown",
        "curl https://presentail.com/en-lb/beirut/shop.md",
        "",
        "# Fetch a product page as Markdown",
        "curl https://presentail.com/en-lb/beirut/product/red-roses-bouquet.md",
        "",
        "# Fetch a blog post as Markdown",
        "curl https://presentail.com/en-lb/beirut/blog/inside-spring-sourcing-trip.md",
        "",
        "# Content negotiation (alternative to .md suffix)",
        "curl -H 'Accept: text/markdown' https://presentail.com/en-lb/beirut/shop",
        "```",
        "",
        "## What agents can find on this site",
        "",
        "- **Products**: Hundreds of curated flower arrangements, gift boxes, hampers, chocolates, and more.",
        "- **Brands**: A curated list of premium florists, patisseries, chocolatiers, and gift boutiques.",
        "- **Occasions**: Gifts organised by occasion — Birthday, Anniversary, Valentine's Day, Mother's Day, Wedding, Eid, and more.",
        "- **Delivery information**: Areas covered, same-day cutoff times, and scheduled delivery slots.",
        "- **Pricing**: All prices shown in local currency (LBP, USD, AED, EUR).",
        "- **Payment methods**: Credit/debit card (Stripe), Mamo Pay, PayPal, Whish Money, Western Union.",
        "- **Corporate gifting**: Bulk orders, branded packaging, recurring gift programmes.",
        "- **Policies**: Terms, privacy policy, returns and refunds.",
        "",
        "## Countries and cities served",
        "",
        "- **Lebanon**: Beirut, Jounieh, Jbeil, Metn, Baabda, Aley, Chouf, and more",
        "- **UAE**: Dubai, Abu Dhabi",
        "- **Cyprus**: Nicosia, Limassol, Larnaca, Paphos",
        "",
        "## Machine-readable indexes",
        "",
        `- Concise index: https://presentail.com/llms.txt`,
        `- Full content (brands, occasions, featured products): https://presentail.com/llms-full.txt`,
        `- Human-readable sitemap: https://presentail.com/sitemap.md`,
        `- XML sitemap: https://presentail.com/sitemap.xml`,
        `- Homepage Markdown: https://presentail.com/index.md`,
        "",
        "## Contact",
        "",
        "- General enquiries: hello@presentail.com",
        "- Corporate gifting: corporate@presentail.com",
      ].join("\n");
      const encoding = pickEncoding(req, ".txt");
      const body = await compressBuffer(agentsMd, encoding);
      const headers = {
        "content-type": "text/plain; charset=utf-8",
        // Same 1-hour TTL policy as /llms.txt, /llms-full.txt, and /sitemap.md:
        // no content hash in the filename, so use a short TTL with mandatory
        // revalidation so AI crawlers pick up changes promptly after a deploy.
        "cache-control": "public, max-age=3600, must-revalidate",
        "vary": "Accept-Encoding",
      };
      if (encoding) headers["content-encoding"] = encoding;
      res.writeHead(200, headers);
      res.end(body);
      return;
    }

    // /index.md — Markdown mirror for the root homepage (/). AI agents and
    // crawlers can fetch a clean, structured overview of the storefront.
    if (pathname === "/index.md") {
      const indexMd = buildHomepageMarkdown({ origin });
      const encoding = pickEncoding(req, ".txt");
      const body = await compressBuffer(indexMd, encoding);
      const headers = {
        "content-type": "text/markdown; charset=utf-8",
        "cache-control": "public, max-age=900, stale-while-revalidate=60",
        "vary": "Accept-Encoding",
        "link": `<${origin}/>; rel="canonical"; type="text/html"`,
      };
      if (encoding) headers["content-encoding"] = encoding;
      res.writeHead(200, headers);
      res.end(body);
      return;
    }

    // Per-page Markdown mirrors.
    // Any locale-prefixed public path at <path>.md serves a Markdown version
    // of that HTML page with YAML frontmatter and real catalog data.
    // Unrecognised .md paths return 404; /sitemap.md and /agents.md are
    // already handled above and never reach this branch.
    if (pathname.endsWith(".md")) {
      const htmlPath = pathname.slice(0, -3);
      const mdContent = isMirroredPath(htmlPath)
        ? await getMarkdownForPath(htmlPath, {
            origin,
            basePath: BASE_PATH,
            fetchJson: fetchSitemapJson,
            apiBaseUrl: INTERNAL_API_BASE_URL,
          })
        : null;
      if (mdContent) {
        const cleanBase = BASE_PATH ? BASE_PATH.replace(/\/$/, "") : "";
        const canonicalHtmlHref = `${origin}${cleanBase}${htmlPath}`;
        const encoding = pickEncoding(req, ".txt");
        const body = await compressBuffer(mdContent, encoding);
        const headers = {
          "content-type": "text/markdown; charset=utf-8",
          "cache-control": "public, max-age=900, stale-while-revalidate=60",
          "vary": "Accept-Encoding",
          "link": `<${canonicalHtmlHref}>; rel="canonical"; type="text/html"`,
        };
        if (encoding) headers["content-encoding"] = encoding;
        res.writeHead(200, headers);
        res.end(body);
        return;
      }
      // Unknown .md path — return 404 rather than falling through to the SPA.
      res.writeHead(404, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-cache",
        "expires": "0",
        "x-robots-tag": "noindex",
      });
      res.end("Not Found");
      return;
    }

    let assetPath = pathname;
    if (assetPath === "/") assetPath = "/index.html";

    const filePath = safeJoin(DIST, assetPath);
    // Block direct requests for pre-compressed sidecar files. These are served
    // transparently by the encoding negotiation logic below; a raw request for
    // e.g. /assets/index-abc123.js.br would otherwise stream raw brotli bytes
    // with no Content-Encoding header, producing a corrupted download.
    if (filePath && /\.(br|gz)$/i.test(filePath)) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not Found");
      return;
    }
    if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      // index.html gets locale-aware SEO injection.
      if (ext === ".html") {
        const html = fs.readFileSync(filePath, "utf8");
        const lifecycleOut = {};
        const seoOut = await injectSeoTagsAsync(html, pathname, {
          basePath: BASE_PATH,
          origin,
          apiBaseUrl: INTERNAL_API_BASE_URL,
          search: url.search,
          acceptLanguage: req.headers["accept-language"],
          firstBannerImageUrl: firstBannerImageUrl ?? undefined,
          lifecycleOut,
        });
        // Product lifecycle: issue 301 (renamed) or 410 (discontinued/absent).
        const lifecycleResponse = resolveProductLifecycleResponse(
          pathname, lifecycleOut, origin, BASE_PATH,
        );
        if (lifecycleResponse) {
          if (lifecycleResponse.status === 410) {
            recordProduct410Event(lifecycleOut?.productSlug);
          }
          res.writeHead(lifecycleResponse.status, lifecycleResponse.headers);
          res.end(lifecycleResponse.body);
          return;
        }
        let out = injectModulePreloads(injectFontPreloads(injectGmcMeta(seoOut)));
        // Inject <link rel="alternate" type="text/markdown"> for pages with a
        // Markdown mirror. This allows crawlers and AI agents to discover the
        // structured Markdown version directly from the HTML head.
        if (isMirroredPath(pathname)) {
          const cleanBase = BASE_PATH ? BASE_PATH.replace(/\/$/, "") : "";
          const mdHref = `${origin}${cleanBase}${pathname}.md`;
          out = out.replace(
            "</head>",
            `    <link rel="alternate" type="text/markdown" href="${mdHref.replace(/"/g, "&quot;")}">\n  </head>`,
          );
        }
        // Inject markdown alternate link for the root homepage
        if (pathname === "/") {
          const indexMdHref = `${origin}/index.md`;
          out = out.replace(
            "</head>",
            `    <link rel="alternate" type="text/markdown" href="${indexMdHref}">\n  </head>`,
          );
        }
        const encoding = pickEncoding(req, ".html");
        const body = await compressBuffer(out, encoding);
        const canonicalHref = `${origin}${pathname.replace(/\/$/, "") || "/"}`;
        const xRobotsTag = resolveXRobotsTag(normalizeHostHeader(host), pathname, url.search);
        const cleanBaseForLink = BASE_PATH ? BASE_PATH.replace(/\/$/, "") : "";
        const mdAlternateLink = isMirroredPath(pathname)
          ? `, <${origin}${cleanBaseForLink}${pathname}.md>; rel="alternate"; type="text/markdown"`
          : "";
        const headers = {
          "content-type": MIME[".html"],
          // x-robots-tag is omitted on non-canonical hosts so Replit's default noindex applies.
          // On the canonical production host: "index, follow" for public pages,
          // "noindex" for private/transactional paths and UTM-parameterised URLs.
          ...(xRobotsTag !== null ? { "x-robots-tag": xRobotsTag } : {}),
          // Transactional pages (cart, checkout, order-confirmed) use no-store to
          // prevent any cache layer from serving stale payment/order state and to
          // opt Safari out of BFCache for those critical flows.
          // All other HTML pages use no-cache so browsers (especially Safari on iOS)
          // always revalidate index.html instead of serving a stale shell with old
          // chunk hashes after a redeploy — stale chunks produce a blank page.
          // s-maxage=300 allows CDN layers to cache the SEO-injected shell for up to
          // 5 minutes; no-cache only prevents browser disk/BFCache serving.
          // perf: browser always-revalidate + CDN cache for LCP/TTFB
          "cache-control": isTransactionalPage(pathname)
            ? "no-store, no-cache, must-revalidate"
            : "public, no-cache, s-maxage=300, stale-while-revalidate=60",
          "expires": "0",
          "vary": "Accept-Encoding",
          // HTTP Link header mirrors the <link rel="canonical"> injected into
          // the HTML by seo-inject.mjs so HTTP-level crawlers and preload
          // scanners see the canonical URL without parsing the body.
          // Also includes the Markdown alternate link for mirrored pages.
          "link": `<${canonicalHref}>; rel="canonical", <${origin}/llms.txt>; rel="describedby", <${origin}/llms-full.txt>; rel="describedby", <${origin}/sitemap.md>; rel="describedby", <${origin}/agents.md>; rel="describedby"${mdAlternateLink}`,
        };
        if (encoding) headers["content-encoding"] = encoding;
        res.writeHead(200, headers);
        res.end(body);
        return;
      }
      const baseName = path.basename(filePath);
      const isIconAsset =
        baseName === "favicon.ico" ||
        baseName === "apple-touch-icon.png" ||
        baseName === "site.webmanifest" ||
        /^favicon-\d+x\d+\.png$/.test(baseName) ||
        /^android-chrome-\d+x\d+\.png$/.test(baseName);
      // .well-known files (AASA, assetlinks) must be re-fetched regularly so
      // OS verifiers pick up updates; don't cache them for more than an hour.
      const isWellKnown = filePath.includes(`${path.sep}.well-known${path.sep}`);
      // robots.txt and llms.txt carry no content hash in their filename so they
      // cannot use immutable caching. Serve them with a 1-hour TTL so crawlers
      // pick up updates promptly while still reducing origin load.
      // perf: short-lived cache for unhashed SEO config files
      const isSeoConfigFile = baseName === "robots.txt" || baseName === "llms.txt";
      const maxAgeSeconds = isWellKnown || isSeoConfigFile ? 3600 : isIconAsset ? 86400 : 31536000;
      const cacheControl = isWellKnown || isSeoConfigFile
        ? "public, max-age=3600, must-revalidate"
        : isIconAsset
          ? "public, max-age=86400, must-revalidate"
          : "public, max-age=31536000, immutable";
      // apple-app-site-association has no extension — serve it as JSON so
      // Apple's CDN crawler accepts it. assetlinks.json already has .json.
      const contentType =
        baseName === "apple-app-site-association"
          ? "application/json; charset=utf-8"
          : (MIME[ext] ?? "application/octet-stream");
      const encoding = pickEncoding(req, ext);
      const headers = {
        "content-type": contentType,
        "cache-control": cacheControl,
        "expires": makeExpires(maxAgeSeconds),
        "vary": "Accept-Encoding",
      };

      // For compressible files, prefer a pre-built sidecar (.br / .gz) over
      // on-the-fly compression.  Sidecars are written at build time by
      // compress-assets.mjs for all JS and CSS bundles in dist/public/assets/.
      if (encoding) {
        const acceptHeader = req.headers["accept-encoding"] ?? "";
        let sidecarPath = null;
        let sidecarEncoding = null;
        if (acceptHeader.includes("br") && SIDECAR_PATHS.has(filePath + ".br")) {
          sidecarPath = filePath + ".br";
          sidecarEncoding = "br";
        } else if (
          acceptHeader.includes("gzip") &&
          SIDECAR_PATHS.has(filePath + ".gz")
        ) {
          sidecarPath = filePath + ".gz";
          sidecarEncoding = "gzip";
        }
        if (sidecarPath) {
          headers["content-encoding"] = sidecarEncoding;
          res.writeHead(200, headers);
          fs.createReadStream(sidecarPath).pipe(res);
          return;
        }
      }

      // No pre-compressed sidecar — fall back to on-the-fly compression.
      if (encoding) headers["content-encoding"] = encoding;
      res.writeHead(200, headers);
      const fileStream = fs.createReadStream(filePath);
      const compressor = compressStream(encoding);
      if (compressor) {
        fileStream.pipe(compressor).pipe(res);
      } else {
        fileStream.pipe(res);
      }
      return;
    }

    // Pagination /page/1 redirect → canonical base collection URL (301).
    // e.g. /en-lb/beirut/category/flowers/page/1 → /en-lb/beirut/category/flowers
    {
      const PAGE_ONE_RE =
        /^(\/[a-z]{2}-[a-z]{2}\/[^/]+\/(?:category|occasion|brand)\/[^/]+)\/page\/1\/?$/;
      const pageOneMatch = pathname.match(PAGE_ONE_RE);
      if (pageOneMatch) {
        res.writeHead(301, {
          location: `${BASE_PATH}${pageOneMatch[1]}`,
          "cache-control": "public, max-age=31536000, immutable",
        });
        res.end();
        return;
      }
    }

    // SPA route guard: return a real 404 for locale-prefixed paths that have a
    // recognised lang + country + city but an unknown sub-route.  Without this,
    // crawlers see an indexable 200 shell with homepage-like metadata for junk
    // URLs such as /en-lb/beirut/not-a-real-page, creating soft-404 pollution.
    // Paths with an unrecognised city are intentionally allowed through so the
    // SPA's CityFallbackRedirect can handle them client-side.
    const localeRouteMatch = pathname.match(LOCALE_PATH_RE);
    if (localeRouteMatch) {
      const [, lang, country, city, rest = ""] = localeRouteMatch;
      const supportedCountries = Object.keys(SITEMAP_CITIES);
      if (
        SITEMAP_LANGS.includes(lang) &&
        supportedCountries.includes(country) &&
        SITEMAP_CITIES[country]?.includes(city) &&
        !isKnownLocaleSubRoute(rest)
      ) {
        res.writeHead(404, {
          "content-type": "text/html; charset=utf-8",
          "x-robots-tag": "noindex",
          "cache-control": "no-cache",
          "expires": "0",
          // AI-discovery Link headers on error HTML so crawlers can still find
          // llms.txt and related files even when landing on a 404 page.
          "link": `<${origin}/llms.txt>; rel="describedby", <${origin}/llms-full.txt>; rel="describedby", <${origin}/sitemap.md>; rel="describedby", <${origin}/agents.md>; rel="describedby"`,
        });
        res.end(
          // i18n-ignore — server-side HTTP 404 response; not a UI string
          `<!doctype html><html lang="en"><head><title>404 Not Found – Presentail</title></head>` + // i18n-ignore
          `<body><h1>Page Not Found</h1><p>The requested page does not exist.</p>` + // i18n-ignore
          `<p><a href="/">Return to homepage</a></p></body></html>`, // i18n-ignore
        );
        return;
      }
    }

    // Non-locale path guard: return a real 404 for bare paths that are not
    // recognised entry points. Only "/" (the root landing page),
    // "/favorites/share/:token" (shared wishlist links), and bare "/product/"
    // or "/product" (no slug — falls through to the SPA to render a 404 page
    // client-side) are valid non-locale SPA entry points. Every other bare
    // path (e.g. "/does-not-exist") is not a real app route — it would receive
    // the homepage shell with HTTP 200, which search engines treat as a soft 404
    // and waste crawl budget on.
    //
    // Paths already handled above and therefore never reaching this point:
    //   • /sitemap.xml, /llms.txt, /llms-full.txt, /sitemap.md, /agents.md  (explicit route handlers)
    //   • /product/:slug  (301 redirect)
    //   • /brand/:slug    (200 OG-injected HTML + meta-refresh; 301 fallback)
    //   • /:lang-:country/:city/...  (locale-aware SPA fallback + 404 guard)
    //   • Static files in dist/public  (file-exists check above)
    //   • /.well-known/*  (earlier handlers)
    if (
      pathname !== "/" &&
      !pathname.match(/^\/favorites\/share\/[A-Za-z0-9_-]{8,}\/?$/) &&
      !pathname.match(/^\/[a-z]{2}-[a-z]{2}\//) &&
      // Bare /product or /product/ (no slug) passes through to the SPA shell so
      // the client can render a 404 page; the product redirect above only fires
      // when a slug is present.
      !pathname.match(/^\/product\/?$/) &&
      // Bare /brand or /brand/ (no slug) passes through to the SPA shell so
      // the client can render a 404 page; the brand redirect above only fires
      // when a slug is present.
      !pathname.match(/^\/brand\/?$/)
    ) {
      res.writeHead(404, {
        "content-type": "text/html; charset=utf-8",
        "x-robots-tag": "noindex",
        "cache-control": "no-cache",
        "expires": "0",
        // AI-discovery Link headers on error HTML so crawlers can still find
        // llms.txt and related files even when landing on a 404 page.
        "link": `<${origin}/llms.txt>; rel="describedby", <${origin}/llms-full.txt>; rel="describedby", <${origin}/sitemap.md>; rel="describedby", <${origin}/agents.md>; rel="describedby"`,
      });
      res.end(
        // i18n-ignore — server-side HTTP 404 response; not a UI string
        `<!doctype html><html lang="en"><head><title>404 Not Found – Presentail</title></head>` + // i18n-ignore
        `<body><h1>Page Not Found</h1><p>The requested page does not exist.</p>` + // i18n-ignore
        `<p><a href="/">Return to homepage</a></p></body></html>`, // i18n-ignore
      );
      return;
    }

    // Content negotiation: serve the Markdown mirror only when the client
    // genuinely prefers text/markdown over text/html and */*.
    // We parse the Accept header using q-values so that a browser sending
    // "text/html,application/xhtml+xml,*/*;q=0.9" never accidentally gets
    // Markdown served back.
    //
    // Algorithm:
    //   1. Split Accept header by comma, parse each entry's q-value (default 1.0).
    //   2. Compute the effective q for text/markdown, text/html, and */*.
    //   3. Serve Markdown only when text/markdown q > text/html q AND q > 0.
    function acceptsMarkdownPreferred(acceptHeader) {
      if (!acceptHeader) return false;
      let qMd = -1, qHtml = -1, qStar = -1;
      for (const part of acceptHeader.split(",")) {
        const [mimeRaw, ...params] = part.trim().split(";");
        const mime = mimeRaw.trim().toLowerCase();
        let q = 1.0;
        for (const p of params) {
          const kv = p.trim();
          if (kv.startsWith("q=")) { q = parseFloat(kv.slice(2)); break; }
        }
        if (isNaN(q)) q = 1.0;
        if (mime === "text/markdown") { if (q > qMd) qMd = q; }
        else if (mime === "text/html") { if (q > qHtml) qHtml = q; }
        else if (mime === "*/*" || mime === "text/*") { if (q > qStar) qStar = q; }
      }
      // text/markdown must be explicitly present with q > 0 and outrank text/html
      // and the wildcard fallback.
      if (qMd <= 0) return false;
      const maxOther = Math.max(qHtml >= 0 ? qHtml : 0, qStar >= 0 ? qStar : 0);
      return qMd > maxOther;
    }

    if (
      isMirroredPath(pathname) &&
      acceptsMarkdownPreferred(req.headers["accept"] ?? "")
    ) {
      const mdContent = await getMarkdownForPath(pathname, {
        origin,
        basePath: BASE_PATH,
        fetchJson: fetchSitemapJson,
        apiBaseUrl: INTERNAL_API_BASE_URL,
      });
      if (mdContent) {
        const cleanBase2 = BASE_PATH ? BASE_PATH.replace(/\/$/, "") : "";
        const mdEncoding = pickEncoding(req, ".txt");
        const mdBody = await compressBuffer(mdContent, mdEncoding);
        const mdHeaders = {
          "content-type": "text/markdown; charset=utf-8",
          "cache-control": "public, max-age=900, stale-while-revalidate=60",
          "vary": "Accept-Encoding, Accept",
          "link": `<${origin}${cleanBase2}${pathname}>; rel="canonical"; type="text/html"`,
        };
        if (mdEncoding) mdHeaders["content-encoding"] = mdEncoding;
        res.writeHead(200, mdHeaders);
        res.end(mdBody);
        return;
      }
    }

    // SPA fallback: rewrite to index.html with locale-aware SEO.
    const paginationRef = {};
    const spaLifecycleOut = {};
    const seoOut = await injectSeoTagsAsync(indexHtml, pathname, {
      basePath: BASE_PATH,
      origin,
      apiBaseUrl: INTERNAL_API_BASE_URL,
      search: url.search,
      acceptLanguage: req.headers["accept-language"],
      firstBannerImageUrl: firstBannerImageUrl ?? undefined,
      paginationRef,
      lifecycleOut: spaLifecycleOut,
    });
    if (paginationRef.outOfRange) {
      res.writeHead(404, {
        "content-type": "text/html; charset=utf-8",
        "x-robots-tag": "noindex",
        "cache-control": "no-cache",
        "expires": "0",
        // AI-discovery Link headers on error HTML so crawlers can still find
        // llms.txt and related files even when landing on a 404 page.
        "link": `<${origin}/llms.txt>; rel="describedby", <${origin}/llms-full.txt>; rel="describedby", <${origin}/sitemap.md>; rel="describedby", <${origin}/agents.md>; rel="describedby"`,
      });
      res.end(
        // i18n-ignore — server-side HTTP 404 response; not a UI string
        `<!doctype html><html lang="en"><head><title>404 Not Found – Presentail</title></head>` + // i18n-ignore
        `<body><h1>Page Not Found</h1><p>The requested page does not exist.</p>` + // i18n-ignore
        `<p><a href="/">Return to homepage</a></p></body></html>`, // i18n-ignore
      );
      return;
    }
    // Product lifecycle: issue 301 (renamed) or 410 (discontinued/absent).
    const spaLifecycleResponse = resolveProductLifecycleResponse(
      pathname, spaLifecycleOut, origin, BASE_PATH,
    );
    if (spaLifecycleResponse) {
      if (spaLifecycleResponse.status === 410) {
        recordProduct410Event(spaLifecycleOut?.productSlug);
      }
      res.writeHead(spaLifecycleResponse.status, spaLifecycleResponse.headers);
      res.end(spaLifecycleResponse.body);
      return;
    }
    // Brand, category or occasion slug definitively absent from the upstream
    // API (HTTP 404 from fetchEntityForSeoCached). Serve a real 404 with noindex
    // so stale/junk slugs are never indexed by search engines.
    if (spaLifecycleOut.entityNotFound) {
      const notFoundBody =
        `<!doctype html><html lang="en"><head><title>Not Found – Presentail</title></head>` + // i18n-ignore
        `<body><h1>Page Not Found</h1><p>The page you are looking for does not exist.</p>` + // i18n-ignore
        `<p><a href="/">Return to homepage</a></p></body></html>`; // i18n-ignore
      res.writeHead(404, {
        "content-type": "text/html; charset=utf-8",
        "x-robots-tag": "noindex",
        "cache-control": "no-cache",
        "expires": "0",
        "link": `<${origin}/llms.txt>; rel="describedby", <${origin}/llms-full.txt>; rel="describedby", <${origin}/sitemap.md>; rel="describedby", <${origin}/agents.md>; rel="describedby"`,
      });
      res.end(notFoundBody);
      return;
    }
    let spaOut = injectModulePreloads(injectFontPreloads(injectGmcMeta(seoOut)));
    // Inject <link rel="alternate" type="text/markdown"> for pages with a mirror.
    if (isMirroredPath(pathname)) {
      const cleanBaseSpa = BASE_PATH ? BASE_PATH.replace(/\/$/, "") : "";
      const spaMdHref = `${origin}${cleanBaseSpa}${pathname}.md`;
      spaOut = spaOut.replace(
        "</head>",
        `    <link rel="alternate" type="text/markdown" href="${spaMdHref.replace(/"/g, "&quot;")}">\n  </head>`,
      );
    }
    const encoding = pickEncoding(req, ".html");
    const body = await compressBuffer(spaOut, encoding);
    const spaCanonicalHref = `${origin}${pathname.replace(/\/$/, "") || "/"}`;
    const xRobotsTagSpa = resolveXRobotsTag(normalizeHostHeader(host), pathname, url.search);
    const spaCleanBase = BASE_PATH ? BASE_PATH.replace(/\/$/, "") : "";
    const spaMdAlternateLink = isMirroredPath(pathname)
      ? `, <${origin}${spaCleanBase}${pathname}.md>; rel="alternate"; type="text/markdown"`
      : "";
    const headers = {
      "content-type": MIME[".html"],
      // x-robots-tag is omitted on non-canonical hosts so Replit's default noindex applies.
      // On the canonical production host: "index, follow" for public pages,
      // "noindex" for private/transactional paths.
      ...(xRobotsTagSpa !== null ? { "x-robots-tag": xRobotsTagSpa } : {}),
      // Transactional pages keep no-store to prevent BFCache and payment-state
      // caching. Public SPA pages use CDN cache (s-maxage=300) with a 60-second
      // stale-while-revalidate window for fresh SEO-injected heads.
      // perf: CDN cache for LCP/TTFB
      "cache-control": isTransactionalPage(pathname)
        ? "no-store, no-cache, must-revalidate"
        : "public, no-cache, s-maxage=300, stale-while-revalidate=60",
      "expires": "0",
      "vary": "Accept-Encoding",
      "link": `<${spaCanonicalHref}>; rel="canonical", <${origin}/llms.txt>; rel="describedby", <${origin}/llms-full.txt>; rel="describedby", <${origin}/sitemap.md>; rel="describedby", <${origin}/agents.md>; rel="describedby"${spaMdAlternateLink}`,
    };
    if (encoding) headers["content-encoding"] = encoding;
    res.writeHead(200, headers);
    res.end(body);
  } catch (err) {
    console.error("serve error:", err);
    // No AI-discovery Link header here: this response is text/plain (not HTML),
    // so there is no <head> for a crawler to parse and no expectation that a
    // machine will follow Link hints on an error response.  If this branch is
    // ever changed to serve an HTML page, add the same `link` header entry used
    // in the 200/404 branches above.
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("Internal Server Error");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`presentail-web serving from ${DIST} on :${PORT}`);
});
