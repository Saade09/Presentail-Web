import sharp from "sharp";
import { ImageDeliveryError } from "./imageDelivery";
import { recordImageTransformState } from "./imageProxyMetrics";

export type ImageFormat = "webp" | "jpeg";

export interface TransformOptions {
  width: number;
  format: ImageFormat;
  quality: number;
}

export interface TransformResult {
  data: Buffer;
  contentType: string;
}

const MAX_WIDTH = 1600;
const DEFAULT_WIDTH = 800;
const DEFAULT_QUALITY = 82;
// 25 MP covers the largest OS catalog images (e.g. 4500×4500 occasion photos).
// 12 MP was too small and caused sharp to silently reject them.
export const MAX_INPUT_PIXELS = 25_000_000;
export const MAX_CONCURRENT_TRANSFORMS = 4;
export const MAX_TRANSFORM_WAITERS = 32;

let activeTransforms = 0;
let waitingTransforms = 0;
const transformWaiters: Array<() => void> = [];

function recordTransformState(): void {
  recordImageTransformState({ activeTransforms, waitingTransforms });
}

async function acquireTransformSlot(): Promise<void> {
  if (activeTransforms < MAX_CONCURRENT_TRANSFORMS) {
    activeTransforms += 1;
    recordTransformState();
    return;
  }
  if (waitingTransforms >= MAX_TRANSFORM_WAITERS) {
    throw new ImageDeliveryError("queue-full", "Image transform queue is full", 503);
  }
  waitingTransforms += 1;
  recordTransformState();
  await new Promise<void>((resolve) => transformWaiters.push(resolve));
  waitingTransforms -= 1;
  recordTransformState();
}

function releaseTransformSlot(): void {
  const next = transformWaiters.shift();
  if (next) next();
  else activeTransforms -= 1;
  recordTransformState();
}

/**
 * Clamp width to [1, MAX_WIDTH], falling back to DEFAULT_WIDTH when the input
 * is absent or non-positive.
 */
export function resolveWidth(raw: string | undefined): number {
  if (!raw) return DEFAULT_WIDTH;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_WIDTH) : DEFAULT_WIDTH;
}

/**
 * Resolve format from a raw string, defaulting to "webp".
 */
export function resolveFormat(raw: string | undefined): ImageFormat {
  return raw === "jpeg" ? "jpeg" : "webp";
}

/**
 * Resolve quality from a raw string, defaulting to DEFAULT_QUALITY.
 * Clamped to [1, 100].
 */
export function resolveQuality(raw: string | undefined): number {
  if (!raw) return DEFAULT_QUALITY;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 100) : DEFAULT_QUALITY;
}

/**
 * Resize and re-encode a source image buffer using Sharp.
 * Width is applied with `withoutEnlargement: true` so small originals are
 * never upscaled. Returns the transformed buffer and its MIME content-type.
 */
export async function transformImage(
  source: Buffer,
  opts: TransformOptions,
): Promise<TransformResult> {
  await acquireTransformSlot();
  try {
    const { width, format, quality } = opts;
    const pipeline = sharp(source, { limitInputPixels: MAX_INPUT_PIXELS })
      .resize({ width, withoutEnlargement: true });
    let data: Buffer;
    if (format === "jpeg") {
      data = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
    } else {
      data = await pipeline.webp({ quality }).toBuffer();
    }
    return {
      data,
      contentType: format === "jpeg" ? "image/jpeg" : "image/webp",
    };
  } finally {
    releaseTransformSlot();
  }
}
