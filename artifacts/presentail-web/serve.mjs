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
  LLMS_INTRO,
  LLMS_PAGES,
  LLMS_PAGE_SECTIONS,
} from "./llms-content.mjs";
import {
  SITEMAP_CITIES,
  SITEMAP_LANGS,
  escXml,
  generateSitemap,
} from "./sitemap.mjs";

// seo-inject.mjs and sidecar-cache.mjs are loaded via guarded dynamic import
// below so a missing or corrupt file produces a structured Slack alert rather
// than an unstructured module-load crash.
let injectSeoTagsAsync, initImageDimsDb, collectSidecars;

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
// Internal base URL used to fetch per-product data for server-rendered OG /
// Twitter Card meta tags on `/product/<slug>` pages. Defaults to the shared
// Replit proxy at localhost:80 so the API and web artifact can talk locally
// without an external HTTPS round-trip; can be overridden in unusual deploys.
const INTERNAL_API_BASE_URL =
  process.env.INTERNAL_API_BASE_URL ?? "http://localhost:80";

// Canonical-domain redirect. Requests arriving with this Host (or
// X-Forwarded-Host) are 301-redirected to the same path on the apex domain so
// there is a single canonical URL (avoids duplicate-content SEO penalties and
// split sessions). Defined as a constant so it is easy to toggle or extend.
const WWW_REDIRECT_HOST = "www.presentail.com";
const WWW_REDIRECT_TARGET_ORIGIN = "https://presentail.com";

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
try {
  ({ injectSeoTagsAsync, initImageDimsDb } = await import("./seo-inject.mjs"));
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
// Check APPLE_DOMAIN_VERIFICATION_TOKEN — required so that
// /.well-known/apple-developer-domain-association is served and Apple can
// verify the domain for Sign In with Apple.  Without it the endpoint returns
// 404 and Apple Sign In is silently broken for all shoppers.
// Non-fatal: logs WARN + Slack alert in production and continues.
// ---------------------------------------------------------------------------
if (!process.env.APPLE_DOMAIN_VERIFICATION_TOKEN) {
  console.warn(
    "WARN: APPLE_DOMAIN_VERIFICATION_TOKEN is not set — " +
      "/.well-known/apple-developer-domain-association will return 404 " +
      "and Sign In with Apple will be disabled for all shoppers",
  );
  if (process.env.NODE_ENV === "production") {
    sendSlackAlert(
      ":warning: *presentail-web: APPLE_DOMAIN_VERIFICATION_TOKEN is not set*\n" +
        "`/.well-known/apple-developer-domain-association` will return 404 — " +
        "Sign In with Apple is disabled for all shoppers until this secret is set and the server is restarted.",
    ).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Check STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION — required so that
// /.well-known/apple-developer-merchantid-domain-association is served and
// Stripe can verify the domain for Apple Pay in the browser.  Without it the
// endpoint returns 404 and Apple Pay is silently disabled for all shoppers.
// Non-fatal: logs WARN + Slack alert in production and continues.
// ---------------------------------------------------------------------------
if (!process.env.STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION) {
  console.warn(
    "WARN: STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION is not set — " +
      "/.well-known/apple-developer-merchantid-domain-association will return 404 " +
      "and Apple Pay will be disabled for all shoppers",
  );
  if (process.env.NODE_ENV === "production") {
    sendSlackAlert(
      ":warning: *presentail-web: STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION is not set*\n" +
        "`/.well-known/apple-developer-merchantid-domain-association` will return 404 — " +
        "Apple Pay is disabled for all shoppers until this secret is set and the server is restarted.",
    ).catch(() => {});
  }
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

// Initial fetch after 10 s so startup I/O is not blocked, then refresh every
// 5 minutes when the cache has gone stale.
setTimeout(() => {
  refreshFirstBannerImageUrl();
  setInterval(() => {
    if (Date.now() - firstBannerFetchedAt >= BANNER_CACHE_TTL_MS) {
      refreshFirstBannerImageUrl();
    }
  }, BANNER_CACHE_TTL_MS).unref();
}, 10_000).unref();

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
  "/reset-password", "/unauthorized", "/account", "/favorites",
  "/sign-in", "/sign-up",
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

// generateLlmsTxt is intentionally static: LLMS_INTRO is a fixed service
// description and LLMS_PAGES is a fixed navigation index. Neither requires live
// catalog data — brand names, occasion names, and featured products are already
// included in /llms-full.txt, which uses a TTL-based live-fetch pattern. If the
// page list or intro copy ever needs to embed live counts or names, apply the
// same async + TTL pattern used in generateLlmsFullTxt below.
function generateLlmsTxt(origin, basePath) {
  const cleanBase = basePath.replace(/\/$/, "");
  const base = origin + cleanBase;
  const pagesList = LLMS_PAGES
    .map(({ label, path }) => `- [${label}](${base}${path})`)
    .join("\n");
  return `# Presentail\n\n${LLMS_INTRO}\n\n## Pages\n\n${pagesList}\n`;
}

async function generateLlmsFullTxt(origin, basePath) {
  const cleanBase = basePath.replace(/\/$/, "");
  const base = origin + cleanBase;

  const pagesList = LLMS_PAGES
    .map(({ label, path }) => `- [${label}](${base}${path})`)
    .join("\n");

  const fullContent = LLMS_PAGE_SECTIONS
    .map(({ title, path, body }) => `### ${title} (${base}${path})\n\n${body}`)
    .join("\n\n");

  // Fetch live catalog data to populate dynamic sections.
  const [brandsData, catalogData, productsData] = await Promise.all([
    fetchSitemapJson(`${INTERNAL_API_BASE_URL}/api/woo/brands`),
    fetchSitemapJson(`${INTERNAL_API_BASE_URL}/api/catalog/metadata`),
    fetchSitemapJson(`${INTERNAL_API_BASE_URL}/api/woo/products?lang=en&countryCode=LB`),
  ]);

  const brandNames = (brandsData?.brands ?? [])
    .map((b) => b.name)
    .filter(Boolean);

  const occasionNames = (catalogData?.occasions ?? [])
    .map((o) => o.name)
    .filter(Boolean);

  const brandsSection = brandNames.length > 0
    ? `## Brands\n\n${brandNames.map((n) => `- ${n}`).join("\n")}\n`
    : `## Brands\n\n_Brand list not yet available._\n`;

  const occasionsSection = occasionNames.length > 0
    ? `## Occasions\n\n${occasionNames.map((n) => `- ${n}`).join("\n")}\n`
    : `## Occasions\n\n_Occasion list not yet available._\n`;

  const occasionSlugToName = Object.fromEntries(
    (catalogData?.occasions ?? [])
      .filter((o) => o.slug && o.name)
      .map((o) => [o.slug, o.name])
  );

  const FEATURED_LIMIT = 50;
  const allProducts = (productsData?.products ?? [])
    .filter((p) => Boolean(p.name))
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
  const featuredProducts = allProducts.slice(0, FEATURED_LIMIT);
  const featuredSection = featuredProducts.length > 0
    ? `## Featured Products\n\n` +
      featuredProducts.map((p) => {
        const brand = (p.brandNames ?? [])[0] ?? null;
        const priceUsd = typeof p.priceValue === "number" ? `~$${Math.round(p.priceValue)}` : null;
        const resolvedOccasions = (p.occasions ?? [])
          .map((slug) => occasionSlugToName[slug] ?? slug)
          .filter(Boolean);
        const parts = [p.name];
        if (brand) parts.push(`by ${brand}`);
        if (priceUsd) parts.push(`(${priceUsd})`);
        if (resolvedOccasions.length > 0) parts.push(`— ${resolvedOccasions.join(", ")}`);
        return `- ${parts.join(" ")}`;
      }).join("\n") + "\n"
    : "";

  return (
    `# Presentail\n\n${LLMS_INTRO}\n\n` +
    `## Pages\n\n${pagesList}\n\n` +
    `${brandsSection}\n` +
    `${occasionsSection}\n` +
    (featuredSection ? `${featuredSection}\n` : "") +
    `## Full content\n\n${fullContent}\n`
  );
}

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
    const isWwwHost =
      normalizeHostHeader(req.headers["x-forwarded-host"]) ===
        WWW_REDIRECT_HOST ||
      normalizeHostHeader(req.headers.host) === WWW_REDIRECT_HOST;
    if (isWwwHost) {
      res.writeHead(301, {
        location: `${WWW_REDIRECT_TARGET_ORIGIN}${req.url ?? "/"}`,
      });
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

    // Apple Sign In domain verification file.
    // Apple requires this file to be served at
    // /.well-known/apple-developer-domain-association before it will let you
    // verify a domain under a Services ID in Apple Developer Console.
    // Set the APPLE_DOMAIN_VERIFICATION_TOKEN env var to the exact content of
    // the file Apple provides when you click "Download" next to the domain in
    // Apple Developer → Certificates, Identifiers & Profiles → Services IDs →
    // <your-services-id> → Sign In with Apple → Configure.
    if (pathname === "/.well-known/apple-developer-domain-association") {
      const token = process.env.APPLE_DOMAIN_VERIFICATION_TOKEN;
      if (!token) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("Not Found");
        return;
      }
      res.writeHead(200, {
        // Serve as text/plain — Apple's domain verifier fetches this as an
        // opaque blob and does not require a JSON content-type.
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=3600, must-revalidate",
        "expires": makeExpires(3600),
      });
      res.end(token);
      return;
    }

    // Stripe Apple Pay merchant domain association file.
    // Stripe requires this file to be served at
    // /.well-known/apple-developer-merchantid-domain-association so it can
    // verify the domain before enabling Apple Pay in the browser.
    // Set STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION to the exact file content Stripe
    // provides under Dashboard → Settings → Payment methods → Apple Pay →
    // Domains → Add domain → Download file.
    if (pathname === "/.well-known/apple-developer-merchantid-domain-association") {
      const token = process.env.STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION;
      if (!token) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("Not Found");
        return;
      }
      res.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=3600, must-revalidate",
        "expires": makeExpires(3600),
      });
      res.end(token);
      return;
    }

    // Dynamic sitemap — intercept before file lookup so a missing
    // dist/public/sitemap.xml doesn't fall through to the SPA shell.
    if (pathname === "/sitemap.xml") {
      const nowMs = Date.now();
      if (!sitemapCache || nowMs - sitemapCacheTsMs > SITEMAP_CACHE_TTL_MS) {
        sitemapCache = await generateSitemap(origin, BASE_PATH, fetchSitemapJson, INTERNAL_API_BASE_URL);
        sitemapCacheTsMs = nowMs;
      }
      const encoding = pickEncoding(req, ".xml");
      const body = await compressBuffer(sitemapCache, encoding);
      const headers = {
        "content-type": MIME[".xml"],
        "cache-control": "public, max-age=900, must-revalidate",
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
        "content-type": "text/markdown; charset=utf-8",
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
      const nowMs = Date.now();
      if (!llmsFullTxtCache || nowMs - llmsFullTxtCacheTsMs > LLMS_TXT_CACHE_TTL_MS) {
        try {
          llmsFullTxtCache = await generateLlmsFullTxt(origin, BASE_PATH);
          llmsFullTxtCacheTsMs = nowMs;
        } catch (err) {
          // Log so ops can tell when regeneration is consistently failing.
          console.warn("[llms-full.txt] regeneration failed; serving %s. Error: %s",
            llmsFullTxtCache ? "stale cache" : "index-only fallback",
            err?.message ?? err,
          );
          if (!llmsFullTxtCache) {
            // Cold cache — serve the lightweight index so the route never
            // crashes, and schedule a retry in 5 minutes rather than on every
            // request so a totally-down upstream doesn't cause a retry storm.
            llmsFullTxtCache = generateLlmsTxt(origin, BASE_PATH);
            llmsFullTxtCacheTsMs = nowMs - LLMS_TXT_CACHE_TTL_MS + 5 * 60 * 1000;
          } else {
            // Stale cache is still rich — back off 5 minutes before retrying
            // again so a flapping upstream doesn't spam the API on every hit.
            llmsFullTxtCacheTsMs = nowMs - LLMS_TXT_CACHE_TTL_MS + 5 * 60 * 1000;
          }
        }
      }
      const encoding = pickEncoding(req, ".txt");
      const body = await compressBuffer(llmsFullTxtCache, encoding);
      const headers = {
        "content-type": "text/markdown; charset=utf-8",
        "cache-control": "public, max-age=3600, must-revalidate",
        "vary": "Accept-Encoding",
      };
      if (encoding) headers["content-encoding"] = encoding;
      res.writeHead(200, headers);
      res.end(body);
      return;
    }

    // Redirect bare `/product/<slug>` (shared links from the mobile app) to the
    // default locale-prefixed canonical URL so mobile share links land correctly
    // when the app is not installed. Uses 301 (permanent) for SEO value.
    const productRedirectMatch = pathname.match(/^\/product\/([^/]+)\/?$/);
    if (productRedirectMatch) {
      const slug = productRedirectMatch[1];
      const target = `${BASE_PATH}/en-lb/beirut/product/${slug}`;
      res.writeHead(301, { location: target });
      res.end();
      return;
    }

    // Redirect old shop query-param URLs to clean SEO paths so external links
    // already indexed under the old format pass their ranking signals forward.
    //   /:lang-:country/:city/shop?category=<slug>  →  /:lang-:country/:city/category/<slug>
    //   /:lang-:country/:city/shop?occasion=<slug>  →  /:lang-:country/:city/occasion/<slug>
    // Uses 301 (permanent) so search engines update their indexes.
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
        const seoOut = await injectSeoTagsAsync(html, pathname, {
          basePath: BASE_PATH,
          origin,
          apiBaseUrl: INTERNAL_API_BASE_URL,
          search: url.search,
          acceptLanguage: req.headers["accept-language"],
          firstBannerImageUrl: firstBannerImageUrl ?? undefined,
        });
        const out = injectModulePreloads(injectFontPreloads(seoOut));
        const encoding = pickEncoding(req, ".html");
        const body = await compressBuffer(out, encoding);
        const headers = {
          "content-type": MIME[".html"],
          // Override any upstream X-Robots-Tag (e.g. Replit's default for
          // `.replit.app` preview domains) so Lighthouse / Googlebot don't
          // see "noindex" on a production deployment.
          "x-robots-tag": "index, follow",
          // Transactional pages (checkout, cart, order-confirmed) must never
          // be stored by any cache layer — use no-store. All other pages use
          // no-cache (must revalidate, but may cache).
          "cache-control": isTransactionalPage(pathname)
            ? "no-store, no-cache, must-revalidate"
            : "no-cache",
          "expires": "0",
          "vary": "Accept-Encoding",
          "link": `<${origin}/llms.txt>; rel="describedby", <${origin}/llms-full.txt>; rel="describedby"`,
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
      const maxAgeSeconds = isWellKnown ? 3600 : isIconAsset ? 86400 : 31536000;
      const cacheControl = isWellKnown
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

    // SPA fallback: rewrite to index.html with locale-aware SEO.
    const seoOut = await injectSeoTagsAsync(indexHtml, pathname, {
      basePath: BASE_PATH,
      origin,
      apiBaseUrl: INTERNAL_API_BASE_URL,
      search: url.search,
      acceptLanguage: req.headers["accept-language"],
      firstBannerImageUrl: firstBannerImageUrl ?? undefined,
    });
    const out = injectModulePreloads(injectFontPreloads(seoOut));
    const encoding = pickEncoding(req, ".html");
    const body = await compressBuffer(out, encoding);
    const headers = {
      "content-type": MIME[".html"],
      "x-robots-tag": "index, follow",
      "cache-control": isTransactionalPage(pathname)
        ? "no-store, no-cache, must-revalidate"
        : "no-cache",
      "expires": "0",
      "vary": "Accept-Encoding",
      "link": `<${origin}/llms.txt>; rel="describedby", <${origin}/llms-full.txt>; rel="describedby"`,
    };
    if (encoding) headers["content-encoding"] = encoding;
    res.writeHead(200, headers);
    res.end(body);
  } catch (err) {
    console.error("serve error:", err);
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("Internal Server Error");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`presentail-web serving from ${DIST} on :${PORT}`);
});
