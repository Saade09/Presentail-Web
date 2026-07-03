import { Router } from "express";
import { transformImage, resolveWidth, resolveFormat } from "../lib/imageTransform";

const router = Router();

const ALLOWED_HOSTNAME = "os.presentail.com";
const ALLOWED_PATH_PREFIX = "/api/storage/public-objects/";
const MAX_WIDTH = 1600;
const SRCSET_WIDTHS = [400, 800, 1200] as const;

type CacheEntry = {
  data: Buffer;
  contentType: string;
  size: number;
};

// Bounded in-memory LRU cache: max 200 entries or ~50 MB total.
const CACHE_MAX_ENTRIES = 200;
const CACHE_MAX_BYTES = 50 * 1024 * 1024;

const cacheMap = new Map<string, CacheEntry>();
let cacheTotalBytes = 0;

function cacheGet(key: string): CacheEntry | undefined {
  const entry = cacheMap.get(key);
  if (!entry) return undefined;
  // Move to end (most-recently-used).
  cacheMap.delete(key);
  cacheMap.set(key, entry);
  return entry;
}

function cacheSet(key: string, entry: CacheEntry): void {
  if (cacheMap.has(key)) {
    const old = cacheMap.get(key)!;
    cacheTotalBytes -= old.size;
    cacheMap.delete(key);
  }
  // Evict oldest entries until we fit.
  while (
    cacheMap.size >= CACHE_MAX_ENTRIES ||
    cacheTotalBytes + entry.size > CACHE_MAX_BYTES
  ) {
    const firstKey = cacheMap.keys().next().value;
    if (firstKey === undefined) break;
    const evicted = cacheMap.get(firstKey)!;
    cacheTotalBytes -= evicted.size;
    cacheMap.delete(firstKey);
  }
  cacheMap.set(key, entry);
  cacheTotalBytes += entry.size;
}

/**
 * GET /api/img/proxy?url=<encoded-os-image-url>&w=<width>[&f=webp|jpeg]
 *
 * Fetches an OS storage image, converts it to WebP (or JPEG) at the
 * requested width using Sharp, and returns the result with a long-lived
 * immutable Cache-Control header.
 *
 * Security: only proxies os.presentail.com URLs under /api/storage/public-objects/
 * to prevent both SSRF and credential-misuse against private OS storage objects.
 * Redirects are rejected so the allowlist cannot be bypassed by a redirect chain.
 * Width is clamped to MAX_WIDTH. No caller auth required — images are product
 * photos visible to all shoppers.
 */
router.get("/img/proxy", async (req, res) => {
  const urlParam = typeof req.query.url === "string" ? req.query.url.trim() : null;
  if (!urlParam) {
    return res.status(400).json({ ok: false, message: "Missing url" }); // i18n-ignore
  }

  let target: URL;
  try {
    target = new URL(urlParam);
  } catch {
    return res.status(400).json({ ok: false, message: "Invalid url" }); // i18n-ignore
  }

  if (
    target.hostname !== ALLOWED_HOSTNAME ||
    !target.pathname.startsWith(ALLOWED_PATH_PREFIX)
  ) {
    return res.status(400).json({ ok: false, message: "URL not allowed" }); // i18n-ignore
  }

  const width = resolveWidth(typeof req.query.w === "string" ? req.query.w : undefined);
  const format = resolveFormat(typeof req.query.f === "string" ? req.query.f : undefined);

  const cacheKey = `${urlParam}|${width}|${format}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    res.setHeader("Content-Type", cached.contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Cache", "HIT"); // i18n-ignore
    return res.send(cached.data);
  }

  const apiKey = process.env.PRESENTAIL_OS_API_KEY ?? "";
  let sourceBuffer: Buffer;
  try {
    const upstream = await fetch(target.toString(), {
      headers: apiKey ? { "x-api-key": apiKey } : {},
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
    });
    // Reject any redirect — we only trust the original allowlisted URL.
    if (upstream.status >= 300 && upstream.status < 400) {
      req.log.warn({ status: upstream.status, url: urlParam }, "img-proxy: upstream redirected; rejecting");
      return res.status(502).end();
    }
    if (!upstream.ok) {
      req.log.warn({ status: upstream.status, url: urlParam }, "img-proxy: upstream returned non-ok");
      return res.status(upstream.status).end();
    }
    sourceBuffer = Buffer.from(await upstream.arrayBuffer());
  } catch (err) {
    req.log.warn({ err }, "img-proxy: upstream fetch failed");
    return res.status(502).end();
  }

  let result: { data: Buffer; contentType: string };
  try {
    result = await transformImage(sourceBuffer, { width, format, quality: 82 });
  } catch (err) {
    req.log.warn({ err }, "img-proxy: sharp transform failed");
    return res.status(500).end();
  }

  cacheSet(cacheKey, { data: result.data, contentType: result.contentType, size: result.data.byteLength });

  res.setHeader("Content-Type", result.contentType);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("X-Cache", "MISS"); // i18n-ignore
  return res.send(result.data);
});

export { SRCSET_WIDTHS, MAX_WIDTH };
export default router;
