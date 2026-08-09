#!/usr/bin/env node
/**
 * check-social-share-previews.mjs
 *
 * Regression check: verify that social-share (Open Graph / Twitter Card) meta
 * tags are present on representative pages when fetched with the user-agents
 * used by the major social-media link-preview scrapers, and that every distinct
 * og:image URL advertised by the sampled pages resolves to a valid 1200×630
 * JPEG.
 *
 * Checks performed:
 *   For each sampled page × each scraper user-agent:
 *     1. og:title    — present and non-empty
 *     2. og:image    — present and non-empty
 *     3. twitter:card — present (any value)
 *     4. og:image:width  declared in HTML as "1200"
 *     5. og:image:height declared in HTML as "630"
 *   For every distinct og:image URL found across all pages/scrapers:
 *     6. HTTP 200
 *     7. Content-Type: image/jpeg
 *     8. Actual pixel dimensions 1200×630 (parsed from JPEG SOF marker)
 *
 * Usage:
 *   node artifacts/presentail-web/scripts/check-social-share-previews.mjs [base-url]
 *
 * Defaults to http://localhost:80/
 * Exits 0 when all checks pass, 1 when any check fails.
 */

// ── Configuration ─────────────────────────────────────────────────────────────

const BASE = (process.argv[2] ?? "http://localhost:80").replace(/\/$/, "");

/**
 * API_BASE: base URL for paths that begin with /api/ (e.g. /api/og-image/*).
 * In production these are co-located on the same origin; in local check runs
 * serve.mjs does NOT proxy /api/* paths — the API server is a separate process.
 * Pass this as the second positional argument to target the local API server:
 *   node check-social-share-previews.mjs http://localhost:19235 http://localhost:8080
 * Defaults to BASE so the script still works when only the web server is running.
 */
const API_BASE = (process.argv[3] ?? BASE).replace(/\/$/, "");

/** Pages that must carry correct OG tags */
const PAGES = [
  { path: "/",                  label: "root redirect" },
  { path: "/en-lb/beirut",      label: "city home (EN-LB)" },
  { path: "/ar-lb/beirut",      label: "city home (AR-LB)" },
  { path: "/en-ae/dubai",       label: "city home (EN-AE)" },
  { path: "/en-lb/beirut/shop", label: "shop collection" },
];

/** Scraper user-agents to rotate through */
const SCRAPERS = [
  { name: "facebookexternalhit", ua: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)" },
  { name: "LinkedInBot",         ua: "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient/4.5.13-1 +http://www.linkedin.com)" },
  { name: "Twitterbot",          ua: "Twitterbot/1.0" },
  { name: "WhatsApp",            ua: "WhatsApp/2.23.1 A" },
  { name: "Slackbot",            ua: "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract an Open Graph property value from raw HTML.
 * Handles both attribute orders: property=... content=... and content=... property=...
 */
function extractOgProp(html, prop) {
  const escaped = prop.replace(":", "\\:");
  const re1 = new RegExp(`property=["']${escaped}["']\\s+content=["']([^"']*)["']`);
  const re2 = new RegExp(`content=["']([^"']*)["']\\s+property=["']${escaped}["']`);
  return (html.match(re1)?.[1] ?? html.match(re2)?.[1] ?? "").trim();
}

/**
 * Extract a <meta name="..."> value from raw HTML.
 */
function extractMeta(html, name) {
  const re1 = new RegExp(`name=["']${name}["']\\s+content=["']([^"']*)["']`);
  const re2 = new RegExp(`content=["']([^"']*)["']\\s+name=["']${name}["']`);
  return (html.match(re1)?.[1] ?? html.match(re2)?.[1] ?? "").trim();
}

/**
 * Resolve a possibly-relative og:image URL against the appropriate local base.
 *
 * In production all paths share one origin. In local check runs serve.mjs and
 * the API server are separate processes on different ports: serve.mjs does NOT
 * proxy /api/* requests. So we route:
 *   - /api/* paths → API_BASE (the local API server)
 *   - everything else → BASE (serve.mjs)
 *
 * This preserves the path+query that identifies the image variant
 * (e.g. /api/og-image/city/ae/dubai) while pointing the fetch at whichever
 * local server actually handles that route.
 */
function resolveImageUrl(raw) {
  if (!raw) return "";
  try {
    const parsed = new URL(raw, BASE);
    const targetBase = parsed.pathname.startsWith("/api/") ? API_BASE : BASE;
    const target = new URL(targetBase);
    parsed.protocol = target.protocol;
    parsed.hostname = target.hostname;
    parsed.port = target.port;
    return parsed.toString();
  } catch {
    // Fallback: treat as path relative to BASE
    return `${BASE}${raw.startsWith("/") ? "" : "/"}${raw}`;
  }
}

/**
 * Parse JPEG dimensions by scanning for an SOF (Start-Of-Frame) marker.
 * Returns { width, height } or null if the marker is not found within
 * the provided buffer (fetch the first ~64 KB for any reasonable image).
 *
 * SOF marker byte values: 0xC0–0xCF, excluding 0xC4 (DHT), 0xC8, 0xCC.
 */
function parseJpegDimensions(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null; // not a JPEG
  let i = 2;
  while (i < buf.length - 8) {
    if (buf[i] !== 0xff) { i++; continue; }
    while (i < buf.length && buf[i] === 0xff) i++; // skip padding
    const marker = buf[i++];
    if (marker === 0xd8 || marker === 0xd9) continue; // SOI/EOI — no length field
    if (i + 2 > buf.length) break;
    const segLen = (buf[i] << 8) | buf[i + 1]; // includes the 2-byte length itself
    const isSOF =
      (marker >= 0xc0 && marker <= 0xcf) &&
      marker !== 0xc4 && // DHT
      marker !== 0xc8 && // JPG
      marker !== 0xcc;   // DAC
    if (isSOF && segLen >= 7) {
      const height = (buf[i + 3] << 8) | buf[i + 4];
      const width  = (buf[i + 5] << 8) | buf[i + 6];
      return { width, height };
    }
    i += segLen;
  }
  return null;
}

// ── Result tracking ───────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function pass(label, detail = "") {
  passed++;
  console.log(`PASS  ${label}${detail ? `  — ${detail}` : ""}`);
}

function fail(label, detail = "") {
  failed++;
  console.error(`FAIL  ${label}${detail ? `  — ${detail}` : ""}`);
}

// ── Phase 1: Meta tag checks per page × scraper UA ────────────────────────────

console.log(`\nSocial Share Preview Check — ${BASE}`);
console.log(`Timestamp: ${new Date().toISOString()}`);
console.log("─".repeat(72));

/**
 * Collect every distinct og:image URL found so we can validate all of them
 * in Phase 2 — not just the first one.  Key = resolved URL, value = a
 * representative "<scraperName> on <pageLabel>" string for reporting.
 */
const ogImagesSeen = new Map(); // resolvedUrl → "scraper on page label"

for (const page of PAGES) {
  const url = `${BASE}${page.path}`;
  console.log(`\n── ${page.label}  (${url})`);

  for (const scraper of SCRAPERS) {
    let res;
    let html = "";
    try {
      res = await fetch(url, {
        headers: { "user-agent": scraper.ua },
        redirect: "follow",
      });
      html = await res.text();
    } catch (err) {
      fail(`[${scraper.name}] ${page.label}: fetch error`, err.message);
      continue;
    }

    if (res.status !== 200) {
      fail(`[${scraper.name}] ${page.label}: HTTP ${res.status}`, url);
      continue;
    }

    const ogTitle  = extractOgProp(html, "og:title");
    const ogImage  = extractOgProp(html, "og:image");
    const twCard   = extractMeta(html, "twitter:card");
    const ogWidth  = extractOgProp(html, "og:image:width");
    const ogHeight = extractOgProp(html, "og:image:height");
    const prefix   = `[${scraper.name}] ${page.label}`;

    // 1. og:title
    ogTitle
      ? pass(`${prefix}: og:title`, `"${ogTitle.substring(0, 60)}"`)
      : fail(`${prefix}: og:title`, "missing or empty");

    // 2. og:image — record every distinct URL for Phase 2
    if (ogImage) {
      pass(`${prefix}: og:image`, ogImage.substring(0, 80));
      const resolved = resolveImageUrl(ogImage);
      if (!ogImagesSeen.has(resolved)) {
        ogImagesSeen.set(resolved, `${scraper.name} on ${page.label}`);
      }
    } else {
      fail(`${prefix}: og:image`, "missing or empty");
    }

    // 3. twitter:card
    twCard
      ? pass(`${prefix}: twitter:card`, `"${twCard}"`)
      : fail(`${prefix}: twitter:card`, "missing");

    // 4. og:image:width declared
    ogWidth === "1200"
      ? pass(`${prefix}: og:image:width`, "1200")
      : fail(`${prefix}: og:image:width`, `expected "1200", got "${ogWidth}"`);

    // 5. og:image:height declared
    ogHeight === "630"
      ? pass(`${prefix}: og:image:height`, "630")
      : fail(`${prefix}: og:image:height`, `expected "630", got "${ogHeight}"`);
  }
}

// ── Phase 2: Validate every distinct og:image asset ──────────────────────────

console.log("\n" + "─".repeat(72));
console.log(`og:image asset validation — ${ogImagesSeen.size} distinct URL(s)`);
console.log("─".repeat(72));

if (ogImagesSeen.size === 0) {
  fail("og:image assets", "no og:image URLs collected from any page — all meta-tag checks must have failed");
}

for (const [imageUrl, source] of ogImagesSeen) {
  console.log(`\n── ${imageUrl}  (first seen: ${source})`);

  let imageRes;
  let imageBytes;

  try {
    imageRes = await fetch(imageUrl, {
      headers: { "user-agent": SCRAPERS[0].ua },
    });
    const arrayBuf = await imageRes.arrayBuffer();
    imageBytes = new Uint8Array(arrayBuf);
  } catch (err) {
    fail(`og:image fetch  ${imageUrl}`, err.message);
    continue;
  }

  // 6. HTTP 200
  imageRes.status === 200
    ? pass(`og:image HTTP 200  ${imageUrl}`, `got ${imageRes.status}`)
    : fail(`og:image HTTP 200  ${imageUrl}`, `got ${imageRes.status}`);

  // 7. Content-Type: image/jpeg
  const ct = imageRes.headers.get("content-type") ?? "";
  (ct.includes("image/jpeg") || ct.includes("image/jpg"))
    ? pass(`og:image Content-Type  ${imageUrl}`, `"${ct}"`)
    : fail(`og:image Content-Type  ${imageUrl}`, `expected image/jpeg, got "${ct}"`);

  // 8. Actual pixel dimensions 1200×630
  if (!imageBytes || imageBytes.length === 0) {
    fail(`og:image dimensions  ${imageUrl}`, "empty response body");
    continue;
  }
  const dims = parseJpegDimensions(imageBytes);
  if (!dims) {
    fail(`og:image dimensions  ${imageUrl}`, `could not parse JPEG SOF marker (${imageBytes.length} bytes received)`);
  } else if (dims.width === 1200 && dims.height === 630) {
    pass(`og:image dimensions  ${imageUrl}`, `${dims.width}×${dims.height}`);
  } else {
    fail(`og:image dimensions  ${imageUrl}`, `expected 1200×630, got ${dims.width}×${dims.height}`);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log("\n" + "═".repeat(72));
const total = passed + failed;
console.log(`TOTAL: ${passed} passed, ${failed} failed, ${total} total`);
console.log("═".repeat(72) + "\n");

process.exit(failed > 0 ? 1 : 0);
