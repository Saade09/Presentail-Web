import { Router, type Request, type Response } from "express";
import { imageSize } from "image-size";
import { logger } from "../lib/logger";

const router = Router();

const OG_MIN_WIDTH = 1200;
const OG_TARGET_RATIO = 1.91;
const OG_RATIO_TOLERANCE = 0.1;
const BATCH_MAX_URLS = 25;

function requireAdmin(req: Request, res: Response): boolean {
  const expected = process.env.PUSH_ADMIN_TOKEN;
  const supplied =
    req.header("x-push-admin-token") ?? req.header("x-admin-token");
  if (!expected || !supplied || supplied !== expected) {
    res.status(401).json({ ok: false, message: "Invalid or missing admin token" });
    return false;
  }
  return true;
}

function parseMetaTag(
  html: string,
  selector: { property?: string; name?: string },
): string | null {
  const attr = selector.property ? `property` : `name`;
  const value = selector.property ?? selector.name ?? "";
  const re = new RegExp(
    `<meta\\s[^>]*${attr}="${escapeRegex(value)}"[^>]*content="([^"]*)"`,
    "i",
  );
  let m = re.exec(html);
  if (m) return m[1];
  const re2 = new RegExp(
    `<meta\\s[^>]*content="([^"]*)"[^>]*${attr}="${escapeRegex(value)}"`,
    "i",
  );
  m = re2.exec(html);
  return m ? m[1] : null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseTitleTag(html: string): string | null {
  const m = /<title>([^<]*)<\/title>/i.exec(html);
  return m ? m[1] : null;
}

function parseCanonical(html: string): string | null {
  const m = /<link[^>]*rel="canonical"[^>]*href="([^"]*)"[^>]*>/i.exec(html);
  if (m) return m[1];
  const m2 = /<link[^>]*href="([^"]*)"[^>]*rel="canonical"[^>]*>/i.exec(html);
  return m2 ? m2[1] : null;
}

async function fetchPageHtml(pageUrl: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(pageUrl, {
      signal: controller.signal,
      headers: { "user-agent": "Presentail-SeoDebug/1.0" },
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function checkOgImageDimensions(
  width: number,
  height: number,
): { widthOk: boolean; ratioOk: boolean; sizeOk: boolean } {
  const widthOk = width >= OG_MIN_WIDTH;
  const ratio = width / height;
  const ratioOk =
    Math.abs(ratio - OG_TARGET_RATIO) / OG_TARGET_RATIO <= OG_RATIO_TOLERANCE;
  return { widthOk, ratioOk, sizeOk: widthOk && ratioOk };
}

async function resolveImageDimensions(
  imageUrl: string,
): Promise<{ width: number; height: number } | null> {
  const CHUNK_SIZES = [4096, 65536];
  for (const chunkSize of CHUNK_SIZES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const resp = await fetch(imageUrl, {
        signal: controller.signal,
        headers: { Range: `bytes=0-${chunkSize - 1}` },
      });
      if (!resp.ok && resp.status !== 206) break;
      const buffer = await resp.arrayBuffer();
      const uint8 = new Uint8Array(buffer);
      try {
        const result = imageSize(uint8);
        if (result.width && result.height) {
          return { width: result.width, height: result.height };
        }
      } catch {
        if (chunkSize === CHUNK_SIZES[CHUNK_SIZES.length - 1]) return null;
      }
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

async function checkImageReachability(imageUrl: string): Promise<{
  reachable: boolean;
  bytes: number | null;
  actualWidth: number | null;
  actualHeight: number | null;
  widthOk: boolean | null;
  ratioOk: boolean | null;
  sizeOk: boolean | null;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  let reachable = false;
  let bytes: number | null = null;
  try {
    const resp = await fetch(imageUrl, {
      method: "HEAD",
      signal: controller.signal,
    });
    const contentLength = resp.headers.get("content-length");
    reachable = resp.ok;
    bytes = contentLength != null ? parseInt(contentLength, 10) : null;
  } catch {
    return {
      reachable: false,
      bytes: null,
      actualWidth: null,
      actualHeight: null,
      widthOk: null,
      ratioOk: null,
      sizeOk: null,
    };
  } finally {
    clearTimeout(timer);
  }

  if (!reachable) {
    return {
      reachable: false,
      bytes,
      actualWidth: null,
      actualHeight: null,
      widthOk: null,
      ratioOk: null,
      sizeOk: null,
    };
  }

  const dims = await resolveImageDimensions(imageUrl);
  if (!dims) {
    return {
      reachable: true,
      bytes,
      actualWidth: null,
      actualHeight: null,
      widthOk: null,
      ratioOk: null,
      sizeOk: null,
    };
  }

  const { widthOk, ratioOk, sizeOk } = checkOgImageDimensions(
    dims.width,
    dims.height,
  );
  return {
    reachable: true,
    bytes,
    actualWidth: dims.width,
    actualHeight: dims.height,
    widthOk,
    ratioOk,
    sizeOk,
  };
}

function resolveTargetUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return parsed.toString();
  } catch {
    const origin =
      process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/api\/?$/, "") ??
      `http://localhost:${process.env.PORT ?? 80}`;
    const path = rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`;
    return `${origin}${path}`;
  }
}

interface SeoDebugResult {
  ok: boolean;
  url: string;
  error?: string;
  title: string | null;
  description: string | null;
  canonical: string | null;
  ogImage: string | null;
  ogImageWidth: string | null;
  ogImageHeight: string | null;
  ogImageAlt: string | null;
  twitterImageAlt: string | null;
  ogImageReachable: boolean | null;
  ogImageBytes: number | null;
  ogImageActualWidth: number | null;
  ogImageActualHeight: number | null;
  ogImageWidthOk: boolean | null;
  ogImageRatioOk: boolean | null;
  ogImageSizeOk: boolean | null;
  fallbackUsed: boolean;
}

async function debugPageUrl(rawUrl: string): Promise<SeoDebugResult> {
  const targetUrl = resolveTargetUrl(rawUrl);
  const html = await fetchPageHtml(targetUrl);
  if (!html) {
    return {
      ok: false,
      url: targetUrl,
      error: "Could not fetch the page HTML",
      title: null,
      description: null,
      canonical: null,
      ogImage: null,
      ogImageWidth: null,
      ogImageHeight: null,
      ogImageAlt: null,
      twitterImageAlt: null,
      ogImageReachable: null,
      ogImageBytes: null,
      ogImageActualWidth: null,
      ogImageActualHeight: null,
      ogImageWidthOk: null,
      ogImageRatioOk: null,
      ogImageSizeOk: null,
      fallbackUsed: false,
    };
  }

  const title = parseTitleTag(html);
  const description = parseMetaTag(html, { name: "description" });
  const canonical = parseCanonical(html);
  const ogImage = parseMetaTag(html, { property: "og:image" });
  const ogImageWidth = parseMetaTag(html, { property: "og:image:width" });
  const ogImageHeight = parseMetaTag(html, { property: "og:image:height" });
  const ogImageAlt = parseMetaTag(html, { property: "og:image:alt" });
  const twitterImageAlt = parseMetaTag(html, { name: "twitter:image:alt" });

  const defaultOgImagePath = "/opengraph.jpg";
  const fallbackUsed = !ogImage || ogImage.endsWith(defaultOgImagePath);

  let ogImageReachable: boolean | null = null;
  let ogImageBytes: number | null = null;
  let ogImageActualWidth: number | null = null;
  let ogImageActualHeight: number | null = null;
  let ogImageWidthOk: boolean | null = null;
  let ogImageRatioOk: boolean | null = null;
  let ogImageSizeOk: boolean | null = null;

  if (ogImage) {
    const result = await checkImageReachability(ogImage);
    ogImageReachable = result.reachable;
    ogImageBytes = result.bytes;
    ogImageActualWidth = result.actualWidth;
    ogImageActualHeight = result.actualHeight;
    ogImageWidthOk = result.widthOk;
    ogImageRatioOk = result.ratioOk;
    ogImageSizeOk = result.sizeOk;
  }

  return {
    ok: true,
    url: targetUrl,
    title,
    description,
    canonical,
    ogImage,
    ogImageWidth,
    ogImageHeight,
    ogImageAlt,
    twitterImageAlt,
    ogImageReachable,
    ogImageBytes,
    ogImageActualWidth,
    ogImageActualHeight,
    ogImageWidthOk,
    ogImageRatioOk,
    ogImageSizeOk,
    fallbackUsed,
  };
}

router.get("/seo/debug/ui", (_req: Request, res: Response) => {
  res.type("html").send(SEO_DEBUG_HTML);
});

router.get("/seo/debug", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const rawUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";
  if (!rawUrl) {
    res.status(400).json({ ok: false, message: "Missing required query param: url" });
    return;
  }

  const targetUrl = resolveTargetUrl(rawUrl);
  logger.info({ targetUrl }, "seo.debug: fetching page");

  const result = await debugPageUrl(rawUrl);
  if (!result.ok) {
    res.status(502).json({ ok: false, message: result.error ?? "Could not fetch the page HTML", url: targetUrl });
    return;
  }

  res.json(result);
});

router.post("/seo/batch-debug", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const body = req.body as unknown;
  if (!body || typeof body !== "object" || !Array.isArray((body as { urls?: unknown }).urls)) {
    res.status(400).json({ ok: false, message: "Request body must be JSON with a `urls` array" });
    return;
  }

  const rawUrls: unknown[] = (body as { urls: unknown[] }).urls;
  if (rawUrls.length === 0) {
    res.status(400).json({ ok: false, message: "`urls` array must not be empty" });
    return;
  }
  if (rawUrls.length > BATCH_MAX_URLS) {
    res.status(400).json({ ok: false, message: `Too many URLs — maximum is ${BATCH_MAX_URLS}` });
    return;
  }
  const invalidIdx = rawUrls.findIndex((u) => typeof u !== "string" || !(u as string).trim());
  if (invalidIdx !== -1) {
    res.status(400).json({ ok: false, message: `urls[${invalidIdx}] is not a non-empty string` });
    return;
  }

  const urls = rawUrls as string[];
  logger.info({ count: urls.length }, "seo.batch-debug: starting batch check");

  const results = await Promise.all(urls.map((u) => debugPageUrl(u.trim())));

  res.json({ ok: true, results });
});

const SEO_DEBUG_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SEO Preview Debug — Admin</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.4 -apple-system, system-ui, Segoe UI, sans-serif; margin: 24px; max-width: 940px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #666; margin-bottom: 16px; font-size: 12px; }
  .controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 20px; }
  .controls input, .controls button { font: inherit; padding: 5px 10px; border: 1px solid #ccc; border-radius: 4px; }
  .controls input[type="text"] { flex: 1; min-width: 280px; }
  .controls button { background: #0066cc; color: #fff; border-color: #0055aa; cursor: pointer; font-weight: 500; }
  .controls button:hover { background: #0055aa; }
  .controls button:disabled { opacity: 0.6; cursor: default; }
  .muted { color: #888; }
  .err { color: #b00020; font-weight: 500; }
  .ok { color: #109618; font-weight: 500; }
  #status { font-size: 13px; }

  /* card */
  #result { display: none; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }
  .card-header { padding: 14px 18px; background: rgba(127,127,127,0.07); border-bottom: 1px solid #ddd; font-size: 13px; word-break: break-all; }
  .card-body { display: flex; gap: 0; }
  .card-meta { flex: 1; padding: 16px 18px; }
  .card-image { flex: 0 0 240px; background: #f0f0f0; display: flex; align-items: flex-start; justify-content: center; padding: 12px; }
  @media (max-width: 620px) {
    .card-body { flex-direction: column; }
    .card-image { flex: none; }
  }
  .card-image img { max-width: 100%; border-radius: 4px; display: block; }
  .card-image .no-image { color: #999; font-size: 12px; text-align: center; padding: 24px 8px; }

  /* fields */
  .field { margin-bottom: 14px; }
  .field-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #555; margin-bottom: 3px; display: flex; align-items: center; gap: 6px; }
  .field-value { font-size: 13px; word-break: break-all; }
  .field-value.missing { color: #b00020; font-style: italic; }
  .field-value.warn { color: #b06000; }
  .field-hint { font-size: 11px; color: #888; margin-top: 2px; }

  .badge { display: inline-block; font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 10px; }
  .badge-green { background: #d4edda; color: #155724; }
  .badge-red { background: #f8d7da; color: #721c24; }
  .badge-yellow { background: #fff3cd; color: #856404; }

  .reachability { display: flex; align-items: center; gap: 6px; font-size: 12px; margin-top: 4px; flex-wrap: wrap; }
  .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .dot-green { background: #28a745; }
  .dot-red { background: #dc3545; }
  .dot-yellow { background: #e6a817; }

  /* token row */
  .token-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
  .token-row label { font-size: 13px; display: flex; gap: 6px; align-items: center; }
  .token-row input { font: inherit; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; width: 260px; }

  /* quick checks */
  .quick-section { margin-bottom: 20px; }
  .quick-section h2 { font-size: 13px; font-weight: 600; margin: 0 0 8px; color: #444; }
  .quick-list { display: flex; flex-wrap: wrap; gap: 8px; }
  .quick-item { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border: 1px solid #ccc; border-radius: 20px; background: #f9f9f9; cursor: pointer; font: inherit; font-size: 12px; color: #333; transition: background 0.15s, border-color 0.15s; }
  .quick-item:hover { background: #eef4ff; border-color: #99bbee; color: #0044aa; }
  .quick-item .quick-label { font-weight: 500; }
  .quick-item .quick-badge { display: none; }
  .quick-item.has-badge .quick-badge { display: inline-block; }
  .quick-item.checking { opacity: 0.7; cursor: default; }

  /* audit button */
  #auditBtn { background: #2d6a2d; border-color: #1e4d1e; }
  #auditBtn:hover { background: #1e4d1e; }

  /* fallback banner */
  .fallback-banner { background: #fff3cd; border: 1px solid #ffc107; color: #856404; border-radius: 4px; padding: 8px 12px; font-size: 12px; margin-bottom: 12px; }

  /* size warning */
  .size-warnings { margin-top: 6px; display: flex; flex-direction: column; gap: 3px; }
  .size-warn-item { font-size: 11px; color: #856404; display: flex; align-items: center; gap: 4px; }
  .size-warn-item::before { content: "⚠️"; }

  /* batch audit table */
  #batchSection { display: none; margin-bottom: 28px; }
  #batchSection h2 { font-size: 15px; font-weight: 600; margin: 0 0 12px; }
  .batch-summary { font-size: 13px; color: #555; margin-bottom: 10px; }
  .batch-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .batch-table th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #555; font-weight: 600; border-bottom: 2px solid #ddd; padding: 6px 10px; }
  .batch-table td { padding: 8px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
  .batch-table tr:last-child td { border-bottom: none; }
  .batch-table tr.row-green { background: #f6fff8; }
  .batch-table tr.row-yellow { background: #fffdf0; }
  .batch-table tr.row-red { background: #fff8f8; }
  .batch-table tr.row-error { background: #fdf2f2; }
  .batch-table .page-label { font-weight: 600; }
  .batch-table .page-url { font-size: 11px; color: #888; word-break: break-all; }
  .batch-table .issues-list { font-size: 12px; color: #666; margin-top: 2px; }
  .batch-table .issue-item { display: inline-block; margin-right: 6px; }
  .batch-row-details { cursor: pointer; font-size: 11px; color: #0066cc; white-space: nowrap; }
  .batch-row-details:hover { text-decoration: underline; }
  .batch-status-cell { white-space: nowrap; }
  .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid #ccc; border-top-color: #555; border-radius: 50%; animation: spin 0.7s linear infinite; vertical-align: middle; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
  <h1>SEO Preview Debug</h1>
  <div class="sub">Inspect the resolved Open Graph metadata for any Presentail page. Paste the token once — it's saved in your browser.</div>

  <div class="token-row">
    <label>Admin token <input id="token" type="password" placeholder="x-push-admin-token"></label>
  </div>

  <div class="quick-section">
    <h2>Quick checks</h2>
    <div class="quick-list" id="quickList">
      <button class="quick-item" data-url="https://new.presentail.com/en-lb/beirut" data-label="Homepage">
        <span class="quick-label">Homepage</span>
        <span class="quick-badge"></span>
      </button>
      <button class="quick-item" data-url="https://new.presentail.com/en-lb/beirut/product/pink-roses" data-label="Product page">
        <span class="quick-label">Product page</span>
        <span class="quick-badge"></span>
      </button>
      <button class="quick-item" data-url="https://new.presentail.com/en-lb/beirut/brand/roses-only" data-label="Brand page">
        <span class="quick-label">Brand page</span>
        <span class="quick-badge"></span>
      </button>
      <button class="quick-item" data-url="https://new.presentail.com/en-lb/beirut/shop?category=flowers" data-label="Category page">
        <span class="quick-label">Category page</span>
        <span class="quick-badge"></span>
      </button>
    </div>
  </div>

  <div class="controls">
    <input id="url" type="text" placeholder="https://new.presentail.com/en-lb/beirut/p/pink-roses or /en-lb/..." autocomplete="off" spellcheck="false" />
    <button id="checkBtn">Check</button>
    <button id="auditBtn">Audit key pages</button>
    <span id="status" class="muted"></span>
  </div>

  <!-- Batch audit results -->
  <div id="batchSection">
    <h2>Key-page audit</h2>
    <div class="batch-summary" id="batchSummary"></div>
    <table class="batch-table">
      <thead>
        <tr>
          <th>Page</th>
          <th>Status</th>
          <th>Issues</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="batchBody"></tbody>
    </table>
  </div>

  <div id="result">
    <div class="card-header" id="resolvedUrl"></div>
    <div id="fallbackBanner" class="fallback-banner" style="display:none;margin:12px 18px 0">
      ⚠️ <strong>Using default OG image</strong> — no page-specific og:image was injected. Check that the SEO inject middleware matched this URL.
    </div>
    <div class="card-body">
      <div class="card-meta" id="meta"></div>
      <div class="card-image" id="imagePanel"></div>
    </div>
  </div>

<script>
(function () {
  var TOKEN_KEY = 'presentail_admin_token';
  var tokenEl = document.getElementById('token');
  var urlEl = document.getElementById('url');
  var checkBtn = document.getElementById('checkBtn');
  var auditBtn = document.getElementById('auditBtn');
  var statusEl = document.getElementById('status');
  var resultEl = document.getElementById('result');
  var resolvedUrlEl = document.getElementById('resolvedUrl');
  var fallbackBanner = document.getElementById('fallbackBanner');
  var metaEl = document.getElementById('meta');
  var imagePanelEl = document.getElementById('imagePanel');
  var batchSection = document.getElementById('batchSection');
  var batchSummary = document.getElementById('batchSummary');
  var batchBody = document.getElementById('batchBody');

  // Restore saved token
  try { tokenEl.value = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) {}

  // Key pages for the audit
  var KEY_PAGES = [
    { label: 'Homepage (LB)', url: 'https://new.presentail.com/en-lb/beirut' },
    { label: 'Homepage (AE — Dubai)', url: 'https://new.presentail.com/en-ae/dubai' },
    { label: 'Homepage (CY)', url: 'https://new.presentail.com/en-cy/nicosia' },
    { label: 'Product page', url: 'https://new.presentail.com/en-lb/beirut/product/pink-roses' },
    { label: 'Brand page', url: 'https://new.presentail.com/en-lb/beirut/brand/roses-only' },
    { label: 'Category page', url: 'https://new.presentail.com/en-lb/beirut/shop?category=flowers' },
    { label: 'Occasion page', url: 'https://new.presentail.com/en-lb/beirut/shop?occasion=birthday' },
  ];

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function badge(text, color) {
    return '<span class="badge badge-' + color + '">' + esc(text) + '</span>';
  }

  function field(label, valueHtml, hint) {
    return '<div class="field">'
      + '<div class="field-label">' + esc(label) + '</div>'
      + '<div class="field-value">' + valueHtml + '</div>'
      + (hint ? '<div class="field-hint">' + esc(hint) + '</div>' : '')
      + '</div>';
  }

  function fieldValue(val, opts) {
    opts = opts || {};
    if (val == null || val === '') {
      return '<span class="missing">missing</span>';
    }
    var cls = '';
    var hint = '';
    var minLen = opts.minLen || 0;
    var maxLen = opts.maxLen || 0;
    if (minLen && val.length < minLen) {
      cls = ' warn';
      hint = 'Too short (< ' + minLen + ' chars). Current: ' + val.length + '.';
    } else if (maxLen && val.length > maxLen) {
      cls = ' warn';
      hint = 'Too long (> ' + maxLen + ' chars). Current: ' + val.length + '.';
    }
    var html = '<span class="' + cls.trim() + '">' + esc(val) + '</span>';
    if (hint) html += '<div class="field-hint">' + esc(hint) + '</div>';
    return html;
  }

  function renderOgImageField(data) {
    if (!data.ogImage) {
      return field('og:image', '<span class="missing">missing</span>');
    }

    var reachDot, reachBadge;
    if (data.ogImageReachable === true) {
      var sizeKnownBad = data.ogImageSizeOk === false;
      reachDot = '<span class="dot ' + (sizeKnownBad ? 'dot-yellow' : 'dot-green') + '"></span>';
      var sizeHint = data.ogImageBytes ? ' · ' + Math.round(data.ogImageBytes / 1024) + ' KB' : '';
      var reachLabel = sizeKnownBad ? 'reachable · size issues' : 'reachable';
      reachBadge = badge(reachLabel, sizeKnownBad ? 'yellow' : 'green');
      var reachRow = '<div class="reachability">' + reachDot + reachBadge + sizeHint + '</div>';

      var dimsHtml = '';
      if (data.ogImageActualWidth && data.ogImageActualHeight) {
        var ratio = (data.ogImageActualWidth / data.ogImageActualHeight).toFixed(2);
        dimsHtml = data.ogImageActualWidth + ' × ' + data.ogImageActualHeight + ' px · ratio ' + ratio + ':1';
      }

      var warnings = [];
      if (data.ogImageWidthOk === false) {
        warnings.push('Image is ' + (data.ogImageActualWidth || '?') + ' px wide — minimum 1200 px required for rich link cards on WhatsApp / iMessage.');
      }
      if (data.ogImageRatioOk === false) {
        var actualRatio = data.ogImageActualWidth && data.ogImageActualHeight
          ? (data.ogImageActualWidth / data.ogImageActualHeight).toFixed(2)
          : '?';
        warnings.push('Ratio ' + actualRatio + ':1 deviates from the recommended 1.91:1 by more than 10%. This may cause letterboxing or cropping in link previews.');
      }

      var warningsHtml = '';
      if (warnings.length) {
        warningsHtml = '<div class="size-warnings">'
          + warnings.map(function (w) { return '<div class="size-warn-item">' + esc(w) + '</div>'; }).join('')
          + '</div>';
      }

      var urlHtml = fieldValue(data.ogImage);
      return field('og:image', urlHtml + reachRow + warningsHtml, dimsHtml || null);

    } else if (data.ogImageReachable === false) {
      var unreachRow = '<div class="reachability"><span class="dot dot-red"></span>'
        + badge('unreachable', 'red') + ' — image URL returned an error</div>';
      return field('og:image', fieldValue(data.ogImage) + unreachRow);
    }

    return field('og:image', fieldValue(data.ogImage));
  }

  function render(data) {
    resolvedUrlEl.textContent = data.url;
    fallbackBanner.style.display = data.fallbackUsed ? '' : 'none';

    var html = '';

    html += field('Page title', fieldValue(data.title, { minLen: 20, maxLen: 70 }),
      data.title ? (data.title.length + ' chars') : null);

    html += field('og:description / meta description', fieldValue(data.description, { minLen: 50, maxLen: 160 }),
      data.description ? (data.description.length + ' chars') : null);

    html += field('canonical', data.canonical
      ? '<a href="' + esc(data.canonical) + '" target="_blank" rel="noopener">' + esc(data.canonical) + '</a>'
      : '<span class="missing">missing</span>');

    html += renderOgImageField(data);

    html += field('og:image:alt / twitter:image:alt',
      fieldValue(data.ogImageAlt || data.twitterImageAlt, { minLen: 5 }));

    var issues = collectIssues(data);
    var summaryColor = issues.length === 0 ? 'green'
      : (data.ogImageReachable === false || !data.ogImage || !data.title || !data.description) ? 'red'
      : 'yellow';

    var summaryHtml;
    if (issues.length === 0) {
      summaryHtml = badge('All good', 'green');
    } else {
      summaryHtml = badge(issues.length + ' issue' + (issues.length > 1 ? 's' : ''), summaryColor)
        + ' <span class="muted" style="font-size:12px">' + issues.map(esc).join(' · ') + '</span>';
    }
    html = field('Summary', summaryHtml) + html;

    metaEl.innerHTML = html;

    if (data.ogImage) {
      imagePanelEl.innerHTML = '<img src="' + esc(data.ogImage) + '" alt="og:image preview" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'\'"><span class="no-image" style="display:none">Image failed to load</span>';
    } else {
      imagePanelEl.innerHTML = '<span class="no-image">No og:image set</span>';
    }

    resultEl.style.display = '';
  }

  function collectIssues(data) {
    var issues = [];
    if (!data.title) issues.push('no title');
    else if (data.title.length < 20) issues.push('title too short');
    else if (data.title.length > 70) issues.push('title too long');
    if (!data.description) issues.push('no description');
    else if (data.description.length < 50) issues.push('description too short');
    if (!data.ogImage) issues.push('no og:image');
    else if (data.ogImageReachable === false) issues.push('og:image unreachable');
    else if (data.ogImageWidthOk === false) issues.push('og:image too small (< 1200 px)');
    else if (data.ogImageRatioOk === false) issues.push('og:image wrong ratio');
    if (data.fallbackUsed) issues.push('using default image');
    if (!data.canonical) issues.push('no canonical');
    if (!(data.ogImageAlt || data.twitterImageAlt)) issues.push('no image alt');
    return issues;
  }

  // kept for quick-check badge compat
  function countIssues(data) { return collectIssues(data).length; }

  function doCheck() {
    var url = urlEl.value.trim();
    if (!url) { statusEl.textContent = 'Enter a URL to check.'; statusEl.className = 'err'; return; }
    doCheckUrl(url, null);
  }

  checkBtn.addEventListener('click', doCheck);
  urlEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') doCheck(); });

  // Quick checks
  var quickItems = document.querySelectorAll('.quick-item');
  quickItems.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var url = btn.getAttribute('data-url');
      if (!url || btn.classList.contains('checking')) return;
      urlEl.value = url;
      doCheckUrl(url, btn);
    });
  });

  function doCheckUrl(url, quickBtn) {
    var token = tokenEl.value.trim();
    if (!token) { statusEl.textContent = 'Paste your admin token first.'; statusEl.className = 'err'; return; }

    try { localStorage.setItem(TOKEN_KEY, token); } catch (e) {}

    checkBtn.disabled = true;
    auditBtn.disabled = true;
    statusEl.textContent = 'Checking\u2026';
    statusEl.className = 'muted';
    resultEl.style.display = 'none';

    if (quickBtn) {
      quickBtn.classList.add('checking');
      var badgeEl = quickBtn.querySelector('.quick-badge');
      if (badgeEl) { badgeEl.className = 'quick-badge badge badge-yellow'; badgeEl.textContent = '\u2026'; }
      quickBtn.classList.add('has-badge');
    }

    fetch('/api/seo/debug?url=' + encodeURIComponent(url), {
      headers: { 'x-push-admin-token': token },
    })
      .then(function (r) {
        if (r.status === 401) throw new Error('Invalid admin token');
        if (!r.ok) return r.json().then(function (d) { throw new Error(d.message || 'HTTP ' + r.status); });
        return r.json();
      })
      .then(function (data) {
        statusEl.textContent = '';
        render(data);
        if (quickBtn) {
          var issues = countIssues(data);
          var badgeEl2 = quickBtn.querySelector('.quick-badge');
          if (issues === 0) {
            badgeEl2.className = 'quick-badge badge badge-green';
            badgeEl2.textContent = '\u2713';
          } else {
            badgeEl2.className = 'quick-badge badge badge-red';
            badgeEl2.textContent = issues + ' issue' + (issues > 1 ? 's' : '');
          }
        }
      })
      .catch(function (err) {
        statusEl.textContent = err.message;
        statusEl.className = 'err';
        if (quickBtn) {
          var badgeEl3 = quickBtn.querySelector('.quick-badge');
          badgeEl3.className = 'quick-badge badge badge-red';
          badgeEl3.textContent = 'error';
        }
      })
      .finally(function () {
        checkBtn.disabled = false;
        auditBtn.disabled = false;
        if (quickBtn) quickBtn.classList.remove('checking');
      });
  }

  // ── Audit key pages ────────────────────────────────────────────────────────

  auditBtn.addEventListener('click', function () {
    var token = tokenEl.value.trim();
    if (!token) { statusEl.textContent = 'Paste your admin token first.'; statusEl.className = 'err'; return; }
    try { localStorage.setItem(TOKEN_KEY, token); } catch (e) {}

    checkBtn.disabled = true;
    auditBtn.disabled = true;
    statusEl.textContent = 'Auditing ' + KEY_PAGES.length + ' pages\u2026';
    statusEl.className = 'muted';
    resultEl.style.display = 'none';

    // Show skeleton rows while waiting
    batchSection.style.display = '';
    batchSummary.textContent = 'Checking all pages in parallel\u2026';
    batchBody.innerHTML = KEY_PAGES.map(function (p) {
      return '<tr><td><div class="page-label">' + esc(p.label) + '</div>'
        + '<div class="page-url">' + esc(p.url) + '</div></td>'
        + '<td class="batch-status-cell"><span class="spinner"></span></td>'
        + '<td></td><td></td></tr>';
    }).join('');

    fetch('/api/seo/batch-debug', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-push-admin-token': token },
      body: JSON.stringify({ urls: KEY_PAGES.map(function (p) { return p.url; }) }),
    })
      .then(function (r) {
        if (r.status === 401) throw new Error('Invalid admin token');
        if (!r.ok) return r.json().then(function (d) { throw new Error(d.message || 'HTTP ' + r.status); });
        return r.json();
      })
      .then(function (payload) {
        statusEl.textContent = '';
        renderBatchResults(payload.results);
      })
      .catch(function (err) {
        statusEl.textContent = err.message;
        statusEl.className = 'err';
        batchSection.style.display = 'none';
      })
      .finally(function () {
        checkBtn.disabled = false;
        auditBtn.disabled = false;
      });
  });

  function renderBatchResults(results) {
    var green = 0, yellow = 0, red = 0, errCount = 0;
    var rows = '';

    results.forEach(function (data, idx) {
      var page = KEY_PAGES[idx] || { label: data.url, url: data.url };

      if (!data.ok) {
        errCount++;
        rows += '<tr class="row-error">'
          + '<td><div class="page-label">' + esc(page.label) + '</div>'
          + '<div class="page-url">' + esc(data.url) + '</div></td>'
          + '<td class="batch-status-cell">' + badge('error', 'red') + '</td>'
          + '<td class="issues-list">' + esc(data.error || 'Could not fetch page') + '</td>'
          + '<td></td>'
          + '</tr>';
        return;
      }

      var issues = collectIssues(data);
      var color, rowClass;
      var critical = !data.ogImage || data.ogImageReachable === false || !data.title || !data.description;
      if (issues.length === 0) { color = 'green'; rowClass = 'row-green'; green++; }
      else if (critical)        { color = 'red';    rowClass = 'row-red';    red++; }
      else                      { color = 'yellow'; rowClass = 'row-yellow'; yellow++; }

      var issueListHtml = issues.length
        ? issues.map(function (i) { return '<span class="issue-item">· ' + esc(i) + '</span>'; }).join('')
        : '<span style="color:#155724">No issues</span>';

      var dimsHtml = '';
      if (data.ogImageActualWidth && data.ogImageActualHeight) {
        dimsHtml = ' <span class="muted">(' + data.ogImageActualWidth + '×' + data.ogImageActualHeight + ')</span>';
      }

      rows += '<tr class="' + rowClass + '" data-idx="' + idx + '">'
        + '<td><div class="page-label">' + esc(page.label) + '</div>'
        + '<div class="page-url"><a href="' + esc(data.url) + '" target="_blank" rel="noopener">' + esc(data.url) + '</a></div></td>'
        + '<td class="batch-status-cell">' + badge(issues.length === 0 ? 'Good' : issues.length + ' issue' + (issues.length > 1 ? 's' : ''), color) + dimsHtml + '</td>'
        + '<td class="issues-list">' + issueListHtml + '</td>'
        + '<td><button class="batch-row-details" data-idx="' + idx + '">Details</button></td>'
        + '</tr>';
    });

    batchBody.innerHTML = rows;

    // Summary line
    var total = results.length;
    var parts = [];
    if (green) parts.push(green + ' good');
    if (yellow) parts.push(yellow + ' warning' + (yellow > 1 ? 's' : ''));
    if (red) parts.push(red + ' critical');
    if (errCount) parts.push(errCount + ' error' + (errCount > 1 ? 's' : ''));
    batchSummary.innerHTML = '<strong>' + total + ' pages checked</strong> — ' + parts.join(', ')
      + (red + errCount > 0
        ? ' <span style="color:#b00020">· ' + (red + errCount) + ' page' + (red + errCount > 1 ? 's' : '') + ' need attention</span>'
        : ' <span style="color:#155724">· All good!</span>');

    // Wire up "Details" buttons
    var detailBtns = batchBody.querySelectorAll('.batch-row-details');
    detailBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx2 = parseInt(btn.getAttribute('data-idx'), 10);
        var data2 = results[idx2];
        if (!data2 || !data2.ok) return;
        urlEl.value = data2.url;
        render(data2);
        resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }
})();
</script>
</body>
</html>`;

export default router;
