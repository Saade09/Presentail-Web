/**
 * Shared guardrails for images fetched from Presentail OS.
 *
 * This module deliberately contains no Express code so catalog health checks
 * and delivery routes enforce the same URL, MIME, and body-size policy.
 */
import { recordImageProxyLoadState } from "./imageProxyMetrics";

export const OS_IMAGE_HOSTNAME = "os.presentail.com";
export const OS_IMAGE_PATH_PREFIX = "/api/storage/public-objects/";
export const MAX_SOURCE_IMAGE_BYTES = 12 * 1024 * 1024;
export const IMAGE_FETCH_TIMEOUT_MS = 12_000;
export const MAX_ACTIVE_IMAGE_LOADS = 8;
export const MAX_IMAGE_LOAD_WAITERS = 32;

let activeLoads = 0;
let waitingLoads = 0;
const loadWaiters: Array<() => void> = [];

function recordLoadState(): void {
  recordImageProxyLoadState({ activeLoads, waitingLoads });
}

async function acquireImageLoadSlot(): Promise<void> {
  if (activeLoads < MAX_ACTIVE_IMAGE_LOADS) {
    activeLoads += 1;
    recordLoadState();
    return;
  }
  if (waitingLoads >= MAX_IMAGE_LOAD_WAITERS) {
    throw new ImageDeliveryError("queue-full", "Image load queue is full", 503);
  }
  waitingLoads += 1;
  recordLoadState();
  await new Promise<void>((resolve) => loadWaiters.push(resolve));
  waitingLoads -= 1;
  recordLoadState();
}

function releaseImageLoadSlot(): void {
  const next = loadWaiters.shift();
  if (next) next();
  else activeLoads -= 1;
  recordLoadState();
}

export async function withImageLoadLimit<T>(operation: () => Promise<T>): Promise<T> {
  await acquireImageLoadSlot();
  try {
    return await operation();
  } finally {
    releaseImageLoadSlot();
  }
}

function escapeBarePercents(raw: string): string {
  return raw.replace(/%(?![0-9a-fA-F]{2})/g, "%25");
}

export type ImageDeliveryErrorCode =
  | "invalid-url"
  | "redirect"
  | "upstream-status"
  | "timeout"
  | "network"
  | "rate-limited"
  | "queue-full"
  | "non-image"
  | "empty"
  | "oversized";

export class ImageDeliveryError extends Error {
  readonly code: ImageDeliveryErrorCode;
  readonly status: number;
  readonly upstreamStatus?: number;

  constructor(
    code: ImageDeliveryErrorCode,
    message: string,
    status: number,
    upstreamStatus?: number,
  ) {
    super(message);
    this.name = "ImageDeliveryError";
    this.code = code;
    this.status = status;
    this.upstreamStatus = upstreamStatus;
  }
}

/**
 * Parse and validate one OS storage URL.  The URL must be HTTPS, must not
 * contain credentials, and must remain under the public storage API path.
 * Query strings are allowed because some OS objects are versioned that way.
 */
export function parseOsImageUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(escapeBarePercents(raw));
  } catch {
    throw new ImageDeliveryError("invalid-url", "Invalid image URL", 400);
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== OS_IMAGE_HOSTNAME ||
    parsed.username ||
    parsed.password ||
    !parsed.pathname.startsWith(OS_IMAGE_PATH_PREFIX) ||
    parsed.pathname === OS_IMAGE_PATH_PREFIX
  ) {
    throw new ImageDeliveryError("invalid-url", "Image URL is not allowed", 400);
  }

  return parsed;
}

export function safeImageIdentifier(target: URL): string {
  // Paths are useful for finding a bad catalog record, but never emit query
  // parameters, credentials, or a complete signed URL in logs or alerts.
  return target.pathname.slice(OS_IMAGE_PATH_PREFIX.length).slice(0, 180);
}

export function isTransientUpstreamStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

export function isTimeoutError(error: unknown): boolean {
  if (error instanceof ImageDeliveryError) return error.code === "timeout";
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  return name === "AbortError" || /timeout|timed out|aborted/i.test(message);
}

/**
 * Read a response without allowing a Content-Length lie or an unbounded
 * chunked response to exhaust the process.  A small compatibility fallback
 * keeps this usable with the minimal Response doubles used in unit tests.
 */
export async function readBoundedImageBody(
  response: Response,
  maxBytes = MAX_SOURCE_IMAGE_BYTES,
): Promise<Buffer> {
  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  if (!contentType.startsWith("image/")) {
    throw new ImageDeliveryError("non-image", "Upstream response was not an image", 415, response.status);
  }

  const declaredLength = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ImageDeliveryError("oversized", "Upstream image is too large", 413, response.status);
  }

  if (!response.body) {
    const body = Buffer.from(await response.arrayBuffer());
    if (body.byteLength === 0) {
      throw new ImageDeliveryError("empty", "Upstream image was empty", 422, response.status);
    }
    if (body.byteLength > maxBytes) {
      throw new ImageDeliveryError("oversized", "Upstream image is too large", 413, response.status);
    }
    return body;
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ImageDeliveryError("oversized", "Upstream image is too large", 413, response.status);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  if (total === 0) {
    throw new ImageDeliveryError("empty", "Upstream image was empty", 422, response.status);
  }
  return Buffer.concat(chunks, total);
}