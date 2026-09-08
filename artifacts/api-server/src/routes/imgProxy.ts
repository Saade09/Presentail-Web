import { createHash } from "node:crypto";
import { Router, type Response as ExpressResponse } from "express";
import { transformImage, resolveWidth, resolveFormat, type ImageFormat } from "../lib/imageTransform";
import {
  IMAGE_FETCH_TIMEOUT_MS,
  ImageDeliveryError,
  isTimeoutError,
  isTransientUpstreamStatus,
  parseOsImageUrl,
  readBoundedImageBody,
  safeImageIdentifier,
  withImageLoadLimit,
} from "../lib/imageDelivery";
import {
  recordImageProxyOutcome,
  recordImageProxyCacheEvent,
  recordImageProxyRequestStart,
  type ImageProxyOutcome,
} from "../lib/imageProxyMetrics";
import { resolveSignedDeliveryRef } from "../lib/realDeliveries";

const router = Router();

export const MAX_WIDTH = 1600;
export const SRCSET_WIDTHS = [400, 800, 1200] as const;
const CACHE_MAX_ENTRIES = 200;
const CACHE_MAX_BYTES = 50 * 1024 * 1024;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RETRY_DELAY_MS = 100;
const CACHE_CONTROL = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400";

type CacheEntry = {
  data: Buffer;
  contentType: string;
  etag: string;
  size: number;
  expiresAt: number;
};

const cacheMap = new Map<string, CacheEntry>();
let cacheTotalBytes = 0;
const inFlight = new Map<string, Promise<CacheEntry>>();

function cacheGet(key: string): CacheEntry | undefined {
  const entry = cacheMap.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cacheMap.delete(key);
    cacheTotalBytes -= entry.size;
    return undefined;
  }
  cacheMap.delete(key);
  cacheMap.set(key, entry);
  return entry;
}

function cacheSet(key: string, entry: CacheEntry): void {
  if (cacheMap.has(key)) {
    cacheTotalBytes -= cacheMap.get(key)!.size;
    cacheMap.delete(key);
  }
  while (cacheMap.size >= CACHE_MAX_ENTRIES || cacheTotalBytes + entry.size > CACHE_MAX_BYTES) {
    const firstKey = cacheMap.keys().next().value;
    if (firstKey === undefined) break;
    cacheTotalBytes -= cacheMap.get(firstKey)!.size;
    cacheMap.delete(firstKey);
  }
  // A single unusually large transformed image must not evict the whole hot
  // cache or create an entry that can never be reused within the byte budget.
  if (entry.size <= CACHE_MAX_BYTES) {
    cacheMap.set(key, entry);
    cacheTotalBytes += entry.size;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSource(target: URL, apiKey: string, log: (data: unknown, message: string) => void): Promise<globalThis.Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(target.toString(), {
        headers: apiKey ? { "x-api-key": apiKey } : {},
        redirect: "manual",
        signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
      });
      if (isTransientUpstreamStatus(response.status) && attempt === 0) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === 0 && (isTimeoutError(error) || error instanceof TypeError)) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw new ImageDeliveryError(
        isTimeoutError(error) ? "timeout" : "network",
        "Image source request failed",
        isTimeoutError(error) ? 504 : 502,
      );
    }
  }
  log({ error: lastError instanceof Error ? lastError.message : String(lastError) }, "img-proxy: source retry exhausted");
  throw new ImageDeliveryError("network", "Image source request failed", 502);
}

async function loadAndTransform(
  target: URL,
  width: number,
  format: ImageFormat,
  apiKey: string,
  log: (data: unknown, message: string) => void,
): Promise<CacheEntry> {
  return withImageLoadLimit(async () => {
    const upstream = await fetchSource(target, apiKey, log);
    if (upstream.status >= 300 && upstream.status < 400) {
      throw new ImageDeliveryError("redirect", "Image source redirected", 502, upstream.status);
    }
    if (!upstream.ok) {
      if (upstream.status === 404 || upstream.status === 410) {
        throw new ImageDeliveryError("upstream-status", "Image source was not found", 404, upstream.status);
      }
      if (upstream.status === 429) {
        throw new ImageDeliveryError("rate-limited", "Image source rate limited the request", 503, upstream.status);
      }
      throw new ImageDeliveryError("upstream-status", "Image source request failed", 502, upstream.status);
    }

    const sourceBuffer = await readBoundedImageBody(upstream);
    let result: { data: Buffer; contentType: string };
    try {
      result = await transformImage(sourceBuffer, { width, format, quality: 82 });
    } catch (error) {
      if (error instanceof ImageDeliveryError) throw error;
      throw new ImageDeliveryError("invalid-url", "Image source is not a valid image", 422);
    }

    if (result.data.byteLength === 0) {
      throw new ImageDeliveryError("empty", "Image transform returned an empty body", 422);
    }
    return {
      data: result.data,
      contentType: result.contentType,
      etag: `"${createHash("sha256").update(result.data).digest("hex")}"`,
      size: result.data.byteLength,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
  });
}

function outcomeForError(error: unknown): ImageProxyOutcome {
  if (!(error instanceof ImageDeliveryError)) return "upstream_error";
  if (error.status === 400) return "bad_request";
  if (error.status === 404) return "not_found";
  if (error.code === "non-image") return "non_image";
  if (error.code === "oversized") return "oversized";
  if (error.code === "empty") return "empty";
  if (error.status === 422) return "invalid_image";
  if (error.code === "timeout") return "timeout";
  if (error.code === "queue-full") return "queue_full";
  return "upstream_error";
}

function sendCached(res: ExpressResponse, entry: CacheEntry, cacheState: "HIT" | "MISS" | "COALESCED"): void {
  res.setHeader("Content-Type", entry.contentType);
  res.setHeader("Cache-Control", CACHE_CONTROL);
  res.setHeader("ETag", entry.etag);
  res.setHeader("X-Cache", cacheState); // i18n-ignore
  if (res.req.headers["if-none-match"] === entry.etag) {
    res.status(304).end();
    return;
  }
  res.send(entry.data);
}

/**
 * GET /api/img/proxy?url=<encoded-os-image-url>&w=<width>[&f=webp|jpeg]
 *
 * The source URL is validated before fetch, source bytes are size-limited,
 * transient upstream failures get one retry, and identical cold variants
 * share one fetch/transform promise. Source URLs are intentionally cached with
 * a finite TTL because OS objects may be replaced at the same path.
 */
router.get("/img/proxy", async (req, res) => {
  recordImageProxyRequestStart();
  const startedAt = Date.now();
  let outcome: ImageProxyOutcome = "upstream_error";
  let upstreamStatus: number | undefined;
  let sourceForLog = "";
  try {
    const deliveryRef =
      typeof req.query.deliveryRef === "string" ? req.query.deliveryRef.trim() : "";
    const rawUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";
    const sourceUrl = deliveryRef ? resolveSignedDeliveryRef(deliveryRef) : rawUrl;
    sourceForLog = sourceUrl ?? "";
    if (!sourceUrl) {
      outcome = "bad_request";
      return res.status(400).json({ ok: false, message: "Missing image reference" }); // i18n-ignore
    }

    let target: URL;
    try {
      target = parseOsImageUrl(sourceUrl);
    } catch (error) {
      outcome = "bad_request";
      return res.status(400).json({ ok: false, message: "URL not allowed" }); // i18n-ignore
    }

    const width = resolveWidth(typeof req.query.w === "string" ? req.query.w : undefined);
    const format = resolveFormat(typeof req.query.f === "string" ? req.query.f : undefined);
    const canonicalUrl = target.toString();
    const cacheKey = `${canonicalUrl}|${width}|${format}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      recordImageProxyCacheEvent("hit");
      outcome = "success";
      return sendCached(res, cached, "HIT");
    }

    const existing = inFlight.get(cacheKey);
    if (existing) {
      recordImageProxyCacheEvent("coalesced");
      const entry = await existing;
      outcome = "success";
      return sendCached(res, entry, "COALESCED");
    }

    recordImageProxyCacheEvent("miss");
    const apiKey = process.env.PRESENTAIL_OS_API_KEY ?? "";
    const promise = loadAndTransform(target, width, format, apiKey, (data, message) => {
      req.log?.warn({ ...((data as Record<string, unknown>) ?? {}), asset: safeImageIdentifier(target) }, message);
    }).then((entry) => {
      cacheSet(cacheKey, entry);
      return entry;
    }).finally(() => {
      inFlight.delete(cacheKey);
    });
    inFlight.set(cacheKey, promise);
    const entry = await promise;
    outcome = "success";
    return sendCached(res, entry, "MISS");
  } catch (error) {
    if (error instanceof ImageDeliveryError) upstreamStatus = error.upstreamStatus;
    outcome = outcomeForError(error);
    const status = error instanceof ImageDeliveryError ? error.status : 502;
    req.log?.warn(
      {
        asset: (() => {
          try {
             return safeImageIdentifier(parseOsImageUrl(sourceForLog));
          } catch {
            return "invalid";
          }
        })(),
        code: error instanceof ImageDeliveryError ? error.code : "unexpected",
        upstreamStatus,
      },
      "img-proxy: image delivery failed",
    );
    return res.status(status).end();
  } finally {
    recordImageProxyOutcome(outcome, Date.now() - startedAt, upstreamStatus);
  }
});

export { CACHE_CONTROL };
export { CACHE_TTL_MS };
export {
  MAX_ACTIVE_IMAGE_LOADS as MAX_ACTIVE_LOADS,
  MAX_IMAGE_LOAD_WAITERS as MAX_LOAD_WAITERS,
} from "../lib/imageDelivery";
export default router;