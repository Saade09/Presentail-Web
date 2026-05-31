import { Router, type Request, type Response } from "express";
import { imageSize } from "image-size";
import { logger } from "../lib/logger";
import { runAuditNow, getLastAuditSummary } from "../lib/seoAuditMonitor";

const router = Router();

const OG_MIN_WIDTH = 1200;
const OG_TARGET_RATIO = 1.91;
const OG_RATIO_TOLERANCE = 0.1;
const BATCH_MAX_URLS = 50;

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

router.post("/admin/seo-audit/run", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  try {
    const summary = await runAuditNow();
    res.json({ ok: true, ...summary });
  } catch (err) {
    const msg = (err as Error)?.message ?? "Internal error";
    if (msg === "Audit already in progress") {
      res.status(409).json({ ok: false, message: msg });
      return;
    }
    logger.error({ err }, "admin.seo-audit.run: unexpected error");
    res.status(500).json({ ok: false, message: msg });
  }
});

router.get("/admin/seo-audit/last", (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const summary = getLastAuditSummary();
  if (!summary) {
    res.status(404).json({ ok: false, message: "No audit has completed since the last server restart" });
    return;
  }
  res.json({ ok: true, ...summary });
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

  /* run monitor audit button */
  #runAuditBtn { background: #5a2d82; border-color: #3e1d5e; }
  #runAuditBtn:hover { background: #3e1d5e; }

  /* monitor audit result section */
  #monitorAuditSection { display: none; margin-bottom: 28px; }
  #monitorAuditSection h2 { font-size: 15px; font-weight: 600; margin: 0 0 4px; }
  .monitor-ran-at { font-size: 11px; color: #888; margin-bottom: 10px; }
  .monitor-summary { font-size: 13px; color: #555; margin-bottom: 10px; }

  /* fallback banner */
  .fallback-banner { background: #fff3cd; border: 1px solid #ffc107; color: #856404; border-radius: 4px; padding: 8px 12px; font-size: 12px; margin-bottom: 12px; }

  /* size warning */
  .size-warnings { margin-top: 6px; display: flex; flex-direction: column; gap: 3px; }
  .size-warn-item { font-size: 11px; color: #856404; display: flex; align-items: center; gap: 4px; }
  .size-warn-item::before { content: "⚠️"; }

  /* market selector tabs */
  .market-tabs { display: flex; gap: 4px; margin-bottom: 16px; flex-wrap: wrap; }
  .market-tab { font: inherit; font-size: 13px; padding: 5px 14px; border: 1px solid #ccc; border-radius: 20px; background: #f5f5f5; cursor: pointer; color: #444; transition: background 0.15s, border-color 0.15s, color 0.15s; }
  .market-tab:hover { background: #eef4ff; border-color: #99bbee; color: #0044aa; }
  .market-tab.active { background: #0066cc; border-color: #0055aa; color: #fff; font-weight: 600; }

  /* key pages editor */
  .key-pages-section { margin-bottom: 20px; }
  .key-pages-header { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .key-pages-header h2 { font-size: 13px; font-weight: 600; margin: 0; color: #444; }
  .key-pages-toggle { font-size: 12px; color: #0066cc; cursor: pointer; background: none; border: none; padding: 0; font: inherit; text-decoration: underline; }
  .key-pages-toggle:hover { color: #003f99; }
  .key-pages-body { display: none; }
  .key-pages-body.open { display: block; }
  .key-pages-hint { font-size: 11px; color: #888; margin-bottom: 6px; }
  .key-pages-textarea { width: 100%; box-sizing: border-box; font: 12px/1.5 ui-monospace, "Cascadia Code", "Fira Mono", monospace; padding: 8px 10px; border: 1px solid #ccc; border-radius: 4px; resize: vertical; min-height: 130px; }
  .key-pages-textarea:focus { outline: none; border-color: #0066cc; box-shadow: 0 0 0 2px rgba(0,102,204,0.15); }
  .key-pages-actions { display: flex; align-items: center; gap: 10px; margin-top: 5px; flex-wrap: wrap; }
  .key-pages-reset { font-size: 12px; color: #0066cc; cursor: pointer; background: none; border: none; padding: 0; font: inherit; text-decoration: underline; }
  .key-pages-reset:hover { color: #003f99; }
  .key-pages-count { font-size: 11px; color: #888; }
  .key-pages-copy-link { font: inherit; font-size: 12px; padding: 3px 10px; border: 1px solid #0066cc; border-radius: 4px; background: #fff; color: #0066cc; cursor: pointer; }
  .key-pages-copy-link:hover { background: #eef4ff; }
  .key-pages-copy-link:disabled { opacity: 0.6; cursor: default; }

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
  .batch-table tr.row-market-header td { background: #f0f4f8; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #445; padding: 5px 10px; border-bottom: 1px solid #ddd; }
  .batch-table .page-label { font-weight: 600; }
  .batch-table .page-url { font-size: 11px; color: #888; word-break: break-all; }
  .batch-table .issues-list { font-size: 12px; color: #666; margin-top: 2px; }
  .batch-table .issue-item { display: inline-block; margin-right: 6px; }
  .batch-row-details { cursor: pointer; font-size: 11px; color: #0066cc; white-space: nowrap; }
  .batch-row-details:hover { text-decoration: underline; }
  .batch-status-cell { white-space: nowrap; }
  .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid #ccc; border-top-color: #555; border-radius: 50%; animation: spin 0.7s linear infinite; vertical-align: middle; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* batch controls bar */
  .batch-controls { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
  .batch-controls h2 { font-size: 15px; font-weight: 600; margin: 0; flex: 1 1 auto; }
  .batch-filter-toggle { font: inherit; font-size: 12px; padding: 3px 10px; border: 1px solid #ccc; border-radius: 14px; background: #f5f5f5; cursor: pointer; color: #444; transition: background 0.15s, border-color 0.15s, color 0.15s; white-space: nowrap; }
  .batch-filter-toggle:hover { background: #eef4ff; border-color: #99bbee; color: #0044aa; }
  .batch-filter-toggle.active { background: #0066cc; border-color: #0055aa; color: #fff; font-weight: 600; }

  /* market header toggle */
  .batch-table tr.row-market-header td { cursor: pointer; user-select: none; }
  .batch-table tr.row-market-header td:hover { background: #e4eaf2; }
  .market-chevron { display: inline-block; margin-right: 6px; transition: transform 0.15s; font-style: normal; }
  .market-stat { margin-left: 8px; font-size: 11px; font-weight: 400; text-transform: none; letter-spacing: 0; }
  .market-stat.stat-red { color: #b00020; }
  .market-stat.stat-yellow { color: #856404; }
  .market-stat.stat-green { color: #155724; }

  /* hidden rows (problems-only filter and collapsed groups) */
  .batch-table tr.batch-row-hidden { display: none; }
  .batch-table tr.batch-market-collapsed { display: none; }
</style>
</head>
<body>
  <h1>SEO Preview Debug</h1>
  <div class="sub">Inspect the resolved Open Graph metadata for any Presentail page. Paste the token once — it's saved in your browser.</div>

  <div class="token-row">
    <label>Admin token <input id="token" type="password" placeholder="x-push-admin-token"></label>
  </div>

  <div class="market-tabs" id="marketTabs">
    <button class="market-tab active" data-market="all">All markets</button>
    <button class="market-tab" data-market="Lebanon">Lebanon</button>
    <button class="market-tab" data-market="UAE">UAE</button>
    <button class="market-tab" data-market="Cyprus">Cyprus</button>
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

  <div class="key-pages-section">
    <div class="key-pages-header">
      <h2>Key pages to audit</h2>
      <button class="key-pages-toggle" id="keyPagesToggle">Edit list</button>
    </div>
    <div class="key-pages-body" id="keyPagesBody">
      <div class="key-pages-hint">One entry per line. Format: <code>Market | Label | URL</code> (e.g. <code>Lebanon | Beirut | https://…</code>) or just <code>Label | URL</code>. Market lets the tabs above filter the list. Changes are saved automatically in your browser.</div>
      <textarea class="key-pages-textarea" id="keyPagesTextarea" spellcheck="false"></textarea>
      <div class="key-pages-actions">
        <button class="key-pages-reset" id="keyPagesReset">Reset to defaults</button>
        <button class="key-pages-copy-link" id="keyPagesCopyLink">Copy link</button>
        <span class="key-pages-count" id="keyPagesCount"></span>
      </div>
    </div>
  </div>

  <div class="controls">
    <input id="url" type="text" placeholder="https://new.presentail.com/en-lb/beirut/p/pink-roses or /en-lb/..." autocomplete="off" spellcheck="false" />
    <button id="checkBtn">Check</button>
    <button id="auditBtn">Audit key pages</button>
    <button id="runAuditBtn">Run monitor audit now</button>
    <span id="status" class="muted"></span>
  </div>

  <!-- Monitor audit results (last cached or on-demand) -->
  <div id="monitorAuditSection">
    <div class="batch-controls">
      <h2>Last monitor audit result</h2>
      <button class="batch-filter-toggle" id="monitorFilterToggle">Show problems only</button>
    </div>
    <div class="monitor-ran-at" id="monitorAuditRanAt"></div>
    <div class="monitor-summary" id="monitorAuditSummary"></div>
    <table class="batch-table">
      <thead>
        <tr>
          <th>Page</th>
          <th>Status</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody id="monitorAuditBody"></tbody>
    </table>
  </div>

  <!-- Batch audit results -->
  <div id="batchSection">
    <div class="batch-controls">
      <h2>Key-page audit</h2>
      <button class="batch-filter-toggle" id="batchFilterToggle">Show problems only</button>
    </div>
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
  var KEY_PAGES_STORAGE = 'presentail_seo_key_pages';
  var KEY_MARKET_STORAGE = 'presentail_seo_market';
  var tokenEl = document.getElementById('token');
  var urlEl = document.getElementById('url');
  var checkBtn = document.getElementById('checkBtn');
  var auditBtn = document.getElementById('auditBtn');
  var runAuditBtn = document.getElementById('runAuditBtn');
  var statusEl = document.getElementById('status');
  var resultEl = document.getElementById('result');
  var resolvedUrlEl = document.getElementById('resolvedUrl');
  var fallbackBanner = document.getElementById('fallbackBanner');
  var metaEl = document.getElementById('meta');
  var imagePanelEl = document.getElementById('imagePanel');
  var batchSection = document.getElementById('batchSection');
  var batchSummary = document.getElementById('batchSummary');
  var batchBody = document.getElementById('batchBody');
  var monitorAuditSection = document.getElementById('monitorAuditSection');
  var monitorAuditRanAt = document.getElementById('monitorAuditRanAt');
  var monitorAuditSummary = document.getElementById('monitorAuditSummary');
  var monitorAuditBody = document.getElementById('monitorAuditBody');
  var keyPagesToggle = document.getElementById('keyPagesToggle');
  var keyPagesBody = document.getElementById('keyPagesBody');
  var keyPagesTextarea = document.getElementById('keyPagesTextarea');
  var keyPagesReset = document.getElementById('keyPagesReset');
  var keyPagesCopyLink = document.getElementById('keyPagesCopyLink');
  var keyPagesCount = document.getElementById('keyPagesCount');

  // Restore saved token
  try { tokenEl.value = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) {}

  // On page load, fetch the cached audit result from the last monitor run so
  // the team can see current health without triggering a new (slow) audit.
  function loadLastAuditResult() {
    var token = tokenEl.value.trim();
    if (!token) return;

    monitorAuditSection.style.display = '';
    monitorAuditRanAt.textContent = '';
    monitorAuditSummary.innerHTML = '<span class="muted" style="font-size:13px">Loading last audit result\u2026</span>';
    monitorAuditBody.innerHTML = '';

    fetch('/api/admin/seo-audit/last', {
      headers: { 'x-push-admin-token': token },
    })
      .then(function (r) {
        if (r.status === 401) { monitorAuditSection.style.display = 'none'; return null; }
        if (r.status === 404) {
          monitorAuditSummary.innerHTML = '<span class="muted" style="font-size:13px">No audit result cached yet — click \u201cRun monitor audit now\u201d to run one.</span>';
          return null;
        }
        if (!r.ok) return r.json().then(function (d) { throw new Error(d.message || 'HTTP ' + r.status); });
        return r.json();
      })
      .then(function (payload) {
        if (payload) renderMonitorAuditResult(payload);
      })
      .catch(function () {
        monitorAuditSection.style.display = 'none';
      });
  }
  loadLastAuditResult();

  // Default key pages — all active cities per market
  var DEFAULT_KEY_PAGES = [
    // ── Lebanon — city homepages ────────────────────────────────────────────
    { market: 'Lebanon', label: 'Akkar', url: 'https://new.presentail.com/en-lb/akkar' },
    { market: 'Lebanon', label: 'Aley', url: 'https://new.presentail.com/en-lb/aley' },
    { market: 'Lebanon', label: 'Baabda', url: 'https://new.presentail.com/en-lb/baabda' },
    { market: 'Lebanon', label: 'Baalbeck', url: 'https://new.presentail.com/en-lb/baalbeck' },
    { market: 'Lebanon', label: 'Batroun', url: 'https://new.presentail.com/en-lb/batroun' },
    { market: 'Lebanon', label: 'Bcharee', url: 'https://new.presentail.com/en-lb/bcharee' },
    { market: 'Lebanon', label: 'Beirut', url: 'https://new.presentail.com/en-lb/beirut' },
    { market: 'Lebanon', label: 'Bent Jbeil', url: 'https://new.presentail.com/en-lb/bent-jbeil' },
    { market: 'Lebanon', label: 'Chouf', url: 'https://new.presentail.com/en-lb/chouf' },
    { market: 'Lebanon', label: 'Hasbaya', url: 'https://new.presentail.com/en-lb/hasbaya' },
    { market: 'Lebanon', label: 'Hermel', url: 'https://new.presentail.com/en-lb/hermel' },
    { market: 'Lebanon', label: 'Jbail', url: 'https://new.presentail.com/en-lb/jbail' },
    { market: 'Lebanon', label: 'Jezzine', url: 'https://new.presentail.com/en-lb/jezzine' },
    { market: 'Lebanon', label: 'Kasserwan', url: 'https://new.presentail.com/en-lb/kasserwan' },
    { market: 'Lebanon', label: 'Koura', url: 'https://new.presentail.com/en-lb/koura' },
    { market: 'Lebanon', label: 'Marjayoun', url: 'https://new.presentail.com/en-lb/marjayoun' },
    { market: 'Lebanon', label: 'Metn', url: 'https://new.presentail.com/en-lb/metn' },
    { market: 'Lebanon', label: 'Minnieh-Dennaya', url: 'https://new.presentail.com/en-lb/minnieh-dennaya' },
    { market: 'Lebanon', label: 'Nabatieh', url: 'https://new.presentail.com/en-lb/nabatieh' },
    { market: 'Lebanon', label: 'Rechaya', url: 'https://new.presentail.com/en-lb/rechaya' },
    { market: 'Lebanon', label: 'Saida', url: 'https://new.presentail.com/en-lb/saida' },
    { market: 'Lebanon', label: 'Tripoli', url: 'https://new.presentail.com/en-lb/tripoli' },
    { market: 'Lebanon', label: 'Tyre', url: 'https://new.presentail.com/en-lb/tyre' },
    { market: 'Lebanon', label: 'West Bekaa', url: 'https://new.presentail.com/en-lb/west-bekaa' },
    { market: 'Lebanon', label: 'Zahle', url: 'https://new.presentail.com/en-lb/zahle' },
    { market: 'Lebanon', label: 'Zghorta', url: 'https://new.presentail.com/en-lb/zghorta' },
    // ── Lebanon — content pages (Beirut) ────────────────────────────────────
    { market: 'Lebanon', label: 'Product page (Beirut)', url: 'https://new.presentail.com/en-lb/beirut/product/pink-roses' },
    { market: 'Lebanon', label: 'Brand page (Beirut)', url: 'https://new.presentail.com/en-lb/beirut/brand/roses-only' },
    { market: 'Lebanon', label: 'Category page (Beirut)', url: 'https://new.presentail.com/en-lb/beirut/shop?category=flowers' },
    { market: 'Lebanon', label: 'Occasion page (Beirut)', url: 'https://new.presentail.com/en-lb/beirut/shop?occasion=birthday' },
    // ── UAE — city homepages ─────────────────────────────────────────────────
    { market: 'UAE', label: 'Dubai', url: 'https://new.presentail.com/en-ae/dubai' },
    { market: 'UAE', label: 'Abu Dhabi', url: 'https://new.presentail.com/en-ae/abu-dhabi' },
    // ── UAE — content pages (Dubai) ──────────────────────────────────────────
    { market: 'UAE', label: 'Product page (Dubai)', url: 'https://new.presentail.com/en-ae/dubai/product/pink-roses' },
    { market: 'UAE', label: 'Brand page (Dubai)', url: 'https://new.presentail.com/en-ae/dubai/brand/roses-only' },
    { market: 'UAE', label: 'Category page (Dubai)', url: 'https://new.presentail.com/en-ae/dubai/shop?category=flowers' },
    { market: 'UAE', label: 'Occasion page (Dubai)', url: 'https://new.presentail.com/en-ae/dubai/shop?occasion=birthday' },
    // ── Cyprus — city homepages ──────────────────────────────────────────────
    { market: 'Cyprus', label: 'Larnaca', url: 'https://new.presentail.com/en-cy/larnaca' },
    { market: 'Cyprus', label: 'Limassol', url: 'https://new.presentail.com/en-cy/limassol' },
    { market: 'Cyprus', label: 'Nicosia', url: 'https://new.presentail.com/en-cy/nicosia' },
    { market: 'Cyprus', label: 'Paphos', url: 'https://new.presentail.com/en-cy/paphos' },
    // ── Cyprus — content pages (Nicosia) ─────────────────────────────────────
    { market: 'Cyprus', label: 'Product page (Nicosia)', url: 'https://new.presentail.com/en-cy/nicosia/product/pink-roses' },
    { market: 'Cyprus', label: 'Brand page (Nicosia)', url: 'https://new.presentail.com/en-cy/nicosia/brand/roses-only' },
    { market: 'Cyprus', label: 'Category page (Nicosia)', url: 'https://new.presentail.com/en-cy/nicosia/shop?category=flowers' },
    { market: 'Cyprus', label: 'Occasion page (Nicosia)', url: 'https://new.presentail.com/en-cy/nicosia/shop?occasion=birthday' },
  ];

  var selectedMarket = 'all';
  try { selectedMarket = localStorage.getItem(KEY_MARKET_STORAGE) || 'all'; } catch (e) {}

  // Serialize a page list to textarea text.
  // Format: "Market | Label | URL" (3-part) when market is set, otherwise "Label | URL".
  function pagesToText(pages) {
    return pages.map(function (p) {
      if (p.market) return p.market + ' | ' + p.label + ' | ' + p.url;
      return p.label + ' | ' + p.url;
    }).join('\n');
  }

  // Parse textarea text back to a page list.
  // Accepts: "Market | Label | URL" (3-part), "Label | URL" (2-part), or bare URL.
  function textToPages(text) {
    var lines = text.split('\n');
    var result = [];
    lines.forEach(function (line) {
      var trimmed = line.trim();
      if (!trimmed) return;
      var parts = trimmed.split(' | ');
      if (parts.length >= 3) {
        var market = parts[0].trim();
        var label = parts[1].trim();
        var url = parts.slice(2).join(' | ').trim();
        if (url) result.push({ market: market, label: label || url, url: url });
      } else if (parts.length === 2) {
        var label2 = parts[0].trim();
        var url2 = parts[1].trim();
        if (url2) result.push({ market: '', label: label2 || url2, url: url2 });
      } else {
        result.push({ market: '', label: trimmed, url: trimmed });
      }
    });
    return result;
  }

  function loadKeyPages() {
    try {
      var saved = localStorage.getItem(KEY_PAGES_STORAGE);
      if (saved) {
        var parsed = textToPages(saved);
        if (parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return DEFAULT_KEY_PAGES.slice();
  }

  function saveKeyPagesText(text) {
    try { localStorage.setItem(KEY_PAGES_STORAGE, text); } catch (e) {}
  }

  function updateCount() {
    var pages = textToPages(keyPagesTextarea.value);
    keyPagesCount.textContent = pages.length + ' page' + (pages.length !== 1 ? 's' : '');
  }

  // Initialise textarea from storage, then check for a shared ?pages= param
  var initialPages = loadKeyPages();
  keyPagesTextarea.value = pagesToText(initialPages);
  updateCount();

  // If the URL contains a shared page list, decode and apply it
  try {
    var urlParams = new URLSearchParams(location.search);
    var sharedPages = urlParams.get('pages');
    if (sharedPages) {
      var decoded = atob(sharedPages);
      if (decoded.trim()) {
        keyPagesTextarea.value = decoded;
        saveKeyPagesText(decoded);
        updateCount();
        // Open the editor panel so the user sees the imported list
        keyPagesBody.classList.add('open');
        keyPagesToggle.textContent = 'Hide';
      }
    }
  } catch (e) {}

  // Toggle editor visibility
  keyPagesToggle.addEventListener('click', function () {
    var open = keyPagesBody.classList.toggle('open');
    keyPagesToggle.textContent = open ? 'Hide' : 'Edit list';
  });

  // Persist on change and update count
  keyPagesTextarea.addEventListener('input', function () {
    saveKeyPagesText(keyPagesTextarea.value);
    updateCount();
  });

  // Reset to defaults
  keyPagesReset.addEventListener('click', function () {
    keyPagesTextarea.value = pagesToText(DEFAULT_KEY_PAGES);
    saveKeyPagesText(keyPagesTextarea.value);
    updateCount();
  });

  // Copy shareable link
  keyPagesCopyLink.addEventListener('click', function () {
    var encoded = btoa(keyPagesTextarea.value);
    var base = location.href.split('?')[0];
    var shareUrl = base + '?pages=' + encodeURIComponent(encoded);

    function showCopied() {
      keyPagesCopyLink.textContent = 'Copied!';
      keyPagesCopyLink.disabled = true;
      setTimeout(function () {
        keyPagesCopyLink.textContent = 'Copy link';
        keyPagesCopyLink.disabled = false;
      }, 2000);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareUrl).then(showCopied).catch(function () {
        fallbackCopy(shareUrl);
        showCopied();
      });
    } else {
      fallbackCopy(shareUrl);
      showCopied();
    }
  });

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

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

  // Market selector tabs
  var marketTabEls = document.querySelectorAll('.market-tab');
  // Restore active tab from persisted market selection
  marketTabEls.forEach(function (tab) {
    if ((tab.getAttribute('data-market') || 'all') === selectedMarket) {
      marketTabEls.forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
    }
  });
  marketTabEls.forEach(function (tab) {
    tab.addEventListener('click', function () {
      selectedMarket = tab.getAttribute('data-market') || 'all';
      marketTabEls.forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      try { localStorage.setItem(KEY_MARKET_STORAGE, selectedMarket); } catch (e) {}
    });
  });

  function activePages() {
    var all = textToPages(keyPagesTextarea.value);
    if (selectedMarket === 'all') return all;
    return all.filter(function (p) { return p.market === selectedMarket; });
  }

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

    var pages = activePages();
    if (pages.length === 0) { statusEl.textContent = 'Add at least one URL to the key pages list.'; statusEl.className = 'err'; return; }
    checkBtn.disabled = true;
    auditBtn.disabled = true;
    var marketLabel = selectedMarket === 'all' ? 'all markets' : selectedMarket;
    statusEl.textContent = 'Auditing ' + pages.length + ' pages (' + marketLabel + ')\u2026';
    statusEl.className = 'muted';
    resultEl.style.display = 'none';

    // Show skeleton rows while waiting (grouped by market)
    batchSection.style.display = '';
    batchSummary.textContent = 'Checking ' + pages.length + ' pages in parallel\u2026';
    var skeletonRows = '';
    var skeletonMarket = null;
    pages.forEach(function (p) {
      if (p.market !== skeletonMarket) {
        skeletonMarket = p.market;
        skeletonRows += '<tr class="row-market-header"><td colspan="4">' + esc(p.market) + '</td></tr>';
      }
      skeletonRows += '<tr><td><div class="page-label">' + esc(p.label) + '</div>'
        + '<div class="page-url">' + esc(p.url) + '</div></td>'
        + '<td class="batch-status-cell"><span class="spinner"></span></td>'
        + '<td></td><td></td></tr>';
    });
    batchBody.innerHTML = skeletonRows;

    fetch('/api/seo/batch-debug', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-push-admin-token': token },
      body: JSON.stringify({ urls: pages.map(function (p) { return p.url; }) }),
    })
      .then(function (r) {
        if (r.status === 401) throw new Error('Invalid admin token');
        if (!r.ok) return r.json().then(function (d) { throw new Error(d.message || 'HTTP ' + r.status); });
        return r.json();
      })
      .then(function (payload) {
        statusEl.textContent = '';
        renderBatchResults(payload.results, pages);
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

  runAuditBtn.addEventListener('click', function () {
    var token = tokenEl.value.trim();
    if (!token) { statusEl.textContent = 'Paste your admin token first.'; statusEl.className = 'err'; return; }
    try { localStorage.setItem(TOKEN_KEY, token); } catch (e) {}

    checkBtn.disabled = true;
    auditBtn.disabled = true;
    runAuditBtn.disabled = true;
    statusEl.textContent = 'Running monitor audit\u2026';
    statusEl.className = 'muted';
    resultEl.style.display = 'none';

    monitorAuditSection.style.display = '';
    monitorAuditRanAt.textContent = '';
    monitorAuditSummary.innerHTML = '<span class="spinner"></span> Auditing ' + 7 + ' key pages\u2026';
    monitorAuditBody.innerHTML = '';

    fetch('/api/admin/seo-audit/run', {
      method: 'POST',
      headers: { 'x-push-admin-token': token },
    })
      .then(function (r) {
        if (r.status === 401) throw new Error('Invalid admin token');
        if (r.status === 409) throw new Error('Audit already in progress — try again in a moment');
        if (!r.ok) return r.json().then(function (d) { throw new Error(d.message || 'HTTP ' + r.status); });
        return r.json();
      })
      .then(function (payload) {
        statusEl.textContent = '';
        renderMonitorAuditResult(payload);
      })
      .catch(function (err) {
        statusEl.textContent = err.message;
        statusEl.className = 'err';
        monitorAuditSection.style.display = 'none';
      })
      .finally(function () {
        checkBtn.disabled = false;
        auditBtn.disabled = false;
        runAuditBtn.disabled = false;
      });
  });

  function renderMonitorAuditResult(payload) {
    var ranAt = payload.ranAt ? new Date(payload.ranAt).toLocaleString() : '';
    monitorAuditRanAt.textContent = ranAt ? 'Run at: ' + ranAt : '';

    var parts = [];
    if (payload.passing) parts.push(payload.passing + ' good');
    if (payload.warned) parts.push(payload.warned + ' warning' + (payload.warned > 1 ? 's' : ''));
    if (payload.failing) parts.push(payload.failing + ' failing');
    var overallColor = payload.failing > 0 ? '#b00020' : (payload.warned > 0 ? '#856404' : '#155724');
    monitorAuditSummary.innerHTML = '<strong style="color:' + overallColor + '">' + payload.total + ' pages checked — ' + parts.join(', ') + '</strong>';

    var rows = '';
    (payload.pages || []).forEach(function (p) {
      var color = p.status === 'ok' ? 'green' : (p.status === 'error' ? 'red' : 'yellow');
      var rowClass = p.status === 'ok' ? 'row-green' : (p.status === 'error' ? 'row-red' : 'row-yellow');
      var badgeText = p.status === 'ok' ? 'Good' : (p.status === 'error' ? 'Failing' : 'Warning');
      var note = '';
      if (p.fetchFailed || p.error) {
        note = p.error || 'Could not fetch page';
      } else if (!p.ogImage) {
        note = 'og:image missing';
      } else if (p.ogImageReachable === false) {
        note = 'og:image not reachable';
      } else if (p.fallbackUsed) {
        note = 'Using site-wide fallback image';
      } else if (p.ogImageSizeOk === false) {
        note = 'og:image dimensions wrong';
      } else {
        note = 'No issues';
      }
      rows += '<tr class="' + rowClass + '">'
        + '<td><div class="page-label">' + esc(p.label) + '</div>'
        + '<div class="page-url"><a href="' + esc(p.url) + '" target="_blank" rel="noopener">' + esc(p.url) + '</a></div></td>'
        + '<td class="batch-status-cell">' + badge(badgeText, color) + '</td>'
        + '<td>' + esc(note) + '</td>'
        + '</tr>';
    });
    monitorAuditBody.innerHTML = rows;
    applyMonitorFilter();
  }

  // ── Monitor "Show problems only" toggle ────────────────────────────────────
  var monitorFilterToggle = document.getElementById('monitorFilterToggle');
  var monitorProblemsOnly = false;
  monitorFilterToggle.addEventListener('click', function () {
    monitorProblemsOnly = !monitorProblemsOnly;
    monitorFilterToggle.classList.toggle('active', monitorProblemsOnly);
    applyMonitorFilter();
  });

  function applyMonitorFilter() {
    var rows = monitorAuditBody.querySelectorAll('tr');
    rows.forEach(function (row) {
      if (monitorProblemsOnly && row.classList.contains('row-green')) {
        row.style.display = 'none';
      } else {
        row.style.display = '';
      }
    });
  }

  // ── "Show problems only" toggle ────────────────────────────────────────────
  var batchFilterToggle = document.getElementById('batchFilterToggle');
  var batchProblemsOnly = false;
  batchFilterToggle.addEventListener('click', function () {
    batchProblemsOnly = !batchProblemsOnly;
    batchFilterToggle.classList.toggle('active', batchProblemsOnly);
    applyBatchFilter();
  });

  // marketCollapsed tracks which markets are manually collapsed (true) or expanded (false).
  var marketCollapsed = {};

  function marketIdFor(market) {
    return 'market-hdr-' + market.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  function applyBatchFilter() {
    var headerRows = batchBody.querySelectorAll('tr.row-market-header');
    headerRows.forEach(function (hdr) {
      var market = hdr.getAttribute('data-market');
      var collapsed = !!marketCollapsed[market];
      // Only target data rows (not the header row itself) so the header always stays visible
      var dataRows = batchBody.querySelectorAll('tr:not(.row-market-header)[data-market="' + market + '"]');
      dataRows.forEach(function (row) {
        var isGreen = row.classList.contains('row-green');
        var hiddenByFilter = batchProblemsOnly && isGreen;
        if (collapsed || hiddenByFilter) {
          row.classList.add('batch-market-collapsed');
        } else {
          row.classList.remove('batch-market-collapsed');
        }
      });
      // Update chevron
      var chevron = hdr.querySelector('.market-chevron');
      if (chevron) chevron.style.transform = collapsed ? 'rotate(-90deg)' : '';
    });
  }

  function renderBatchResults(results, pages) {
    var green = 0, yellow = 0, red = 0, errCount = 0;
    var rows = '';
    var currentMarket = null;

    // Per-market counters for the summary breakdown
    var marketStats = {};
    // Track market order for summary (unique markets, first-seen order)
    var marketOrder = [];
    // Each market header gets a numbered placeholder so repeated-market blocks work safely
    var hdrPlaceholders = []; // [{token, market}]
    var hdrSeq = 0;

    results.forEach(function (data, idx) {
      var page = pages[idx] || { market: '', label: data.url, url: data.url };
      var market = page.market || '';

      // Market section header row
      if (market && market !== currentMarket) {
        currentMarket = market;
        if (!marketStats[market]) {
          marketStats[market] = { green: 0, yellow: 0, red: 0, err: 0 };
          marketOrder.push(market);
        }
        // Unique numbered placeholder — built after all rows so we know the final issue counts
        var token = '\x00MHDR' + hdrSeq + '\x00';
        hdrPlaceholders.push({ token: token, market: market });
        hdrSeq++;
        rows += token;
      }

      if (!data.ok) {
        errCount++;
        if (marketStats[market]) marketStats[market].err++;
        rows += '<tr class="row-error" data-market="' + esc(market) + '">'
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
      if (issues.length === 0) { color = 'green'; rowClass = 'row-green'; green++; if (marketStats[market]) marketStats[market].green++; }
      else if (critical)        { color = 'red';    rowClass = 'row-red';    red++;   if (marketStats[market]) marketStats[market].red++; }
      else                      { color = 'yellow'; rowClass = 'row-yellow'; yellow++; if (marketStats[market]) marketStats[market].yellow++; }

      var issueListHtml = issues.length
        ? issues.map(function (i) { return '<span class="issue-item">· ' + esc(i) + '</span>'; }).join('')
        : '<span style="color:#155724">No issues</span>';

      var dimsHtml = '';
      if (data.ogImageActualWidth && data.ogImageActualHeight) {
        dimsHtml = ' <span class="muted">(' + data.ogImageActualWidth + '×' + data.ogImageActualHeight + ')</span>';
      }

      rows += '<tr class="' + rowClass + '" data-market="' + esc(market) + '" data-idx="' + idx + '">'
        + '<td><div class="page-label">' + esc(page.label) + '</div>'
        + '<div class="page-url"><a href="' + esc(data.url) + '" target="_blank" rel="noopener">' + esc(data.url) + '</a></div></td>'
        + '<td class="batch-status-cell">' + badge(issues.length === 0 ? 'Good' : issues.length + ' issue' + (issues.length > 1 ? 's' : ''), color) + dimsHtml + '</td>'
        + '<td class="issues-list">' + issueListHtml + '</td>'
        + '<td><button class="batch-row-details" data-idx="' + idx + '">Details</button></td>'
        + '</tr>';
    });

    // Replace market header placeholders with real headers (now we know the issue counts).
    // hdrPlaceholders is ordered by first appearance, preserving correct insertion points
    // even when the same market appears in multiple non-contiguous segments.
    hdrPlaceholders.forEach(function (ph) {
      var market = ph.market;
      var s = marketStats[market];
      var hasIssues = s.red + s.yellow + s.err > 0;
      var totalM = s.green + s.yellow + s.red + s.err;
      var issuesM = s.yellow + s.red + s.err;
      var statClass = s.red + s.err > 0 ? 'stat-red' : (s.yellow > 0 ? 'stat-yellow' : 'stat-green');
      var statText = hasIssues
        ? issuesM + '/' + totalM + ' need attention'
        : 'all good';
      var hdrId = marketIdFor(market);

      // Auto-expand markets with issues; collapse all-green markets.
      // Only set on first encounter for this market; manual toggles survive re-renders.
      if (!(market in marketCollapsed)) {
        marketCollapsed[market] = !hasIssues;
      }

      var hdr = '<tr class="row-market-header" id="' + hdrId + '" data-market="' + esc(market) + '">'
        + '<td colspan="4"><em class="market-chevron">&#9660;</em>' + esc(market)
        + '<span class="market-stat ' + statClass + '">' + statText + '</span>'
        + '</td></tr>';
      // Each token is unique (numbered) so a plain replace hits exactly one occurrence
      rows = rows.replace(ph.token, hdr);
    });

    batchBody.innerHTML = rows;

    // Apply initial collapsed/filter state
    applyBatchFilter();

    // Wire up market header clicks (collapse/expand)
    var headerRows = batchBody.querySelectorAll('tr.row-market-header');
    headerRows.forEach(function (hdr) {
      hdr.addEventListener('click', function () {
        var market = hdr.getAttribute('data-market');
        marketCollapsed[market] = !marketCollapsed[market];
        applyBatchFilter();
      });
    });

    // Summary line — overall + per-market breakdown (clickable links)
    var total = results.length;
    var overallParts = [];
    if (green) overallParts.push(green + ' good');
    if (yellow) overallParts.push(yellow + ' warning' + (yellow > 1 ? 's' : ''));
    if (red) overallParts.push(red + ' critical');
    if (errCount) overallParts.push(errCount + ' error' + (errCount > 1 ? 's' : ''));

    var marketBreakdown = marketOrder.map(function (m) {
      var s = marketStats[m];
      var total2 = s.green + s.yellow + s.red + s.err;
      var issues2 = s.yellow + s.red + s.err;
      var color2 = issues2 === 0 ? '#155724' : (s.red + s.err > 0 ? '#b00020' : '#856404');
      var hdrId = marketIdFor(m);
      var label = issues2 === 0 ? 'all good' : issues2 + '/' + total2 + ' need attention';
      return '<a href="#' + hdrId + '" style="color:' + color2 + ';text-decoration:none" '
        + 'onclick="var el=document.getElementById(\'' + hdrId + '\');if(el){el.scrollIntoView({behavior:\'smooth\',block:\'start\'});return false;}">'
        + esc(m) + ': ' + label + '</a>';
    }).join(' &nbsp;·&nbsp; ');

    batchSummary.innerHTML = '<strong>' + total + ' pages checked</strong> — ' + overallParts.join(', ')
      + (red + errCount > 0
        ? ' <span style="color:#b00020">· ' + (red + errCount) + ' page' + (red + errCount > 1 ? 's' : '') + ' need attention</span>'
        : ' <span style="color:#155724">· All good!</span>')
      + (marketBreakdown ? '<br><span style="font-size:12px;color:#666">' + marketBreakdown + '</span>' : '');

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
