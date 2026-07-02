import sharp from "sharp";

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
  const { width, format, quality } = opts;
  const pipeline = sharp(source).resize({ width, withoutEnlargement: true });
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
}
