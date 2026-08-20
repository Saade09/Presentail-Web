import { createHash } from "node:crypto";
import sharp from "sharp";

export const SOCIAL_CARD_WIDTH = 1200;
export const SOCIAL_CARD_HEIGHT = 630;
// Bump this whenever artwork composition changes. It is part of the public
// card version, so cached crawler cards cannot retain a superseded template.
export const SOCIAL_CARD_TEMPLATE_VERSION = "ivory-v3";
export const SOCIAL_CARD_SAFE_AREA = 60;

export type ProductSocialLayout = "product" | "portrait" | "photo" | "custom";
export type ProductSocialQualityFlag =
  | "missing-image"
  | "unusable-image"
  | "low-resolution"
  | "transparent-source"
  | "portrait-source"
  | "lifestyle-crop"
  | "small-product-occupancy"
  | "touches-safe-margin"
  | "important-content-crop"
  | "oversized-output"
  | "absent-primary"
  | "generic-fallback";

export type ProductSocialOverrides = {
  customImageUrl?: string | null;
  preferredImageUrl?: string | null;
  layout?: ProductSocialLayout | null;
  focalX?: number | null;
  focalY?: number | null;
  scale?: number | null;
  positionX?: number | null;
  positionY?: number | null;
  sourceVersion?: string | null;
  templateVersion?: string | null;
};

export type ProductImageCandidate = {
  url: string;
  source: "custom" | "preferred" | "primary" | "gallery";
};

export type RenderedProductSocialCard = {
  buffer: Buffer;
  qualityFlags: ProductSocialQualityFlag[];
  width: number;
  height: number;
};

function isUsableUrl(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function normaliseSocialLayout(value: unknown): ProductSocialLayout {
  return value === "portrait" || value === "photo" || value === "custom"
    ? value
    : "product";
}

export function clampSocialControl(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

/**
 * Resolve the source in editorial order. Product data is deliberately treated
 * as untrusted/optional so an empty or malformed gallery never breaks a share.
 */
export function selectProductSocialImage(
  product: { images?: Array<{ url?: string | null }> } | null | undefined,
  overrides: ProductSocialOverrides = {},
): ProductImageCandidate | null {
  if (isUsableUrl(overrides.customImageUrl)) {
    return { url: overrides.customImageUrl.trim(), source: "custom" };
  }
  if (isUsableUrl(overrides.preferredImageUrl)) {
    return { url: overrides.preferredImageUrl.trim(), source: "preferred" };
  }
  const images = Array.isArray(product?.images) ? product.images : [];
  const primary = images[0]?.url;
  if (isUsableUrl(primary)) return { url: primary.trim(), source: "primary" };
  const gallery = images.slice(1).find((image) => isUsableUrl(image?.url))?.url;
  return isUsableUrl(gallery) ? { url: gallery.trim(), source: "gallery" } : null;
}

/**
 * A short opaque version is derived from every input that can change artwork.
 * It is safe in public URLs and lets crawlers discover a replacement card.
 */
export function buildProductSocialVersion(
  sourceUrl: string | null,
  overrides: ProductSocialOverrides = {},
): string {
  const payload = JSON.stringify({
    sourceUrl: sourceUrl ?? "",
    customImageUrl: overrides.customImageUrl ?? "",
    preferredImageUrl: overrides.preferredImageUrl ?? "",
    layout: normaliseSocialLayout(overrides.layout),
    focalX: clampSocialControl(overrides.focalX, 0, 1, 0.5),
    focalY: clampSocialControl(overrides.focalY, 0, 1, 0.5),
    scale: clampSocialControl(overrides.scale, 0.5, 2, 1),
    positionX: clampSocialControl(overrides.positionX, -1, 1, 0),
    positionY: clampSocialControl(overrides.positionY, -1, 1, 0),
    sourceVersion: overrides.sourceVersion ?? "1",
    templateVersion: overrides.templateVersion ?? SOCIAL_CARD_TEMPLATE_VERSION,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

function templateSvg(): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SOCIAL_CARD_WIDTH}" height="${SOCIAL_CARD_HEIGHT}">
    <rect width="1200" height="630" fill="#f7f1e7"/>
    <rect x="60" y="60" width="640" height="510" fill="#efe6d7"/>
    <line x1="736" y1="110" x2="736" y2="520" stroke="#c9a96e" stroke-width="2"/>
    <text x="790" y="270" font-family="Helvetica, Arial, sans-serif" font-size="38" font-weight="600" letter-spacing="7" fill="#173c31">PRESENTAIL</text>
    <line x1="790" y1="304" x2="1070" y2="304" stroke="#c9a96e" stroke-width="2"/>
    <text x="790" y="353" font-family="Georgia, serif" font-size="29" font-style="italic" fill="#173c31">Luxury gifting, delivered.</text>
    <text x="790" y="402" font-family="Helvetica, Arial, sans-serif" font-size="15" letter-spacing="2.4" fill="#173c31">THOUGHTFUL GIFTS, BEAUTIFULLY SENT</text>
  </svg>`);
}

/**
 * Render a metadata-free artwork card. Catalog photography is only resized,
 * positioned, or cropped; this never alters, retouches, or regenerates it.
 */
export async function renderProductSocialCard({
  imageBuffer,
  layout,
  focalX,
  focalY,
  scale,
  positionX,
  positionY,
}: {
  imageBuffer?: Buffer | null;
  layout?: ProductSocialLayout | null;
  focalX?: number | null;
  focalY?: number | null;
  scale?: number | null;
  positionX?: number | null;
  positionY?: number | null;
} = {}): Promise<RenderedProductSocialCard> {
  const qualityFlags: ProductSocialQualityFlag[] = [];
  const selectedLayout = normaliseSocialLayout(layout);
  const imageArea = { left: SOCIAL_CARD_SAFE_AREA, top: SOCIAL_CARD_SAFE_AREA, width: 640, height: 510 };
  const overlays: sharp.OverlayOptions[] = [];

  if (imageBuffer && imageBuffer.byteLength > 0 && imageBuffer.byteLength <= 15 * 1024 * 1024) {
    try {
      const source = sharp(imageBuffer, { limitInputPixels: 60_000_000, failOn: "error" });
      const metadata = await source.metadata();
      const sourceW = metadata.width ?? 0;
      const sourceH = metadata.height ?? 0;
      if (sourceW < 1 || sourceH < 1) throw new Error("missing source dimensions");
      if (sourceW < 700 || sourceH < 360) qualityFlags.push("low-resolution");
      if (metadata.hasAlpha) qualityFlags.push("transparent-source");
      if (sourceH / sourceW > 1.2) qualityFlags.push("portrait-source");

      const fX = clampSocialControl(focalX, 0, 1, 0.5);
      const fY = clampSocialControl(focalY, 0, 1, 0.5);
      const zoom = clampSocialControl(scale, 0.5, 2, 1);
      const offsetX = clampSocialControl(positionX, -1, 1, 0);
      const offsetY = clampSocialControl(positionY, -1, 1, 0);

      if (selectedLayout === "photo") {
        qualityFlags.push("lifestyle-crop");
        qualityFlags.push("important-content-crop");
        const targetW = imageArea.width;
        const targetH = imageArea.height;
        const cropZoom = Math.max(1, zoom);
        const coverScale = Math.max(targetW / sourceW, targetH / sourceH) * cropZoom;
        const coverW = Math.max(targetW, Math.ceil(sourceW * coverScale));
        const coverH = Math.max(targetH, Math.ceil(sourceH * coverScale));
        // Position is an editorial nudge applied on top of the focal point so
        // lifestyle cards respond to every saved composition control.
        const cropFocusX = clampSocialControl(fX + offsetX * 0.2, 0, 1, fX);
        const cropFocusY = clampSocialControl(fY + offsetY * 0.2, 0, 1, fY);
        const cropLeft = Math.max(0, Math.min(coverW - targetW, Math.round((coverW - targetW) * cropFocusX)));
        const cropTop = Math.max(0, Math.min(coverH - targetH, Math.round((coverH - targetH) * cropFocusY)));
        const resized = await source
          .resize(coverW, coverH, { fit: "fill" })
          .extract({ left: cropLeft, top: cropTop, width: targetW, height: targetH })
          .jpeg({ quality: 88, mozjpeg: true })
          .toBuffer();
        overlays.push({ input: resized, left: imageArea.left, top: imageArea.top });
      } else {
        const maxWidth = selectedLayout === "portrait" ? 430 : imageArea.width - 28;
        const maxHeight = imageArea.height;
        const scaled = await source
          .resize(Math.round(maxWidth * zoom), Math.round(maxHeight * zoom), {
            fit: "inside",
            withoutEnlargement: false,
          })
          .png()
          .toBuffer();
        const sized = await sharp(scaled).metadata();
        let renderedW = sized.width ?? 0;
        let renderedH = sized.height ?? 0;
        let bounded = scaled;
        // A zoomed contain layout can exceed the panel (and even the card
        // canvas). Crop it back to the panel before compositing so every
        // allowed editorial scale is renderable. Focal and position controls
        // determine the retained portion rather than letting Sharp reject an
        // oversized overlay.
        if (renderedW > imageArea.width || renderedH > imageArea.height) {
          qualityFlags.push("important-content-crop");
          const cropW = Math.min(renderedW, imageArea.width);
          const cropH = Math.min(renderedH, imageArea.height);
          const cropFocusX = clampSocialControl(fX + offsetX * 0.2, 0, 1, fX);
          const cropFocusY = clampSocialControl(fY + offsetY * 0.2, 0, 1, fY);
          const cropLeft = Math.max(0, Math.min(renderedW - cropW, Math.round((renderedW - cropW) * cropFocusX)));
          const cropTop = Math.max(0, Math.min(renderedH - cropH, Math.round((renderedH - cropH) * cropFocusY)));
          bounded = await sharp(scaled)
            .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
            .png()
            .toBuffer();
          renderedW = cropW;
          renderedH = cropH;
        }
        const left = Math.round(Math.max(
          imageArea.left,
          Math.min(
            imageArea.left + imageArea.width - renderedW,
            imageArea.left + (imageArea.width - renderedW) / 2 + offsetX * 60,
          ),
        ));
        const top = Math.round(Math.max(
          imageArea.top,
          Math.min(
            imageArea.top + imageArea.height - renderedH,
            imageArea.top + (imageArea.height - renderedH) / 2 + offsetY * 44,
          ),
        ));
        const occupancy = (renderedW * renderedH) / (imageArea.width * imageArea.height);
        if (occupancy < 0.4) qualityFlags.push("small-product-occupancy");
        if (
          left === imageArea.left ||
          top === imageArea.top ||
          left + renderedW === imageArea.left + imageArea.width ||
          top + renderedH === imageArea.top + imageArea.height
        ) {
          qualityFlags.push("touches-safe-margin");
        }
        overlays.push({ input: bounded, left, top });
      }
    } catch {
      qualityFlags.push("unusable-image");
    }
  } else {
    qualityFlags.push("missing-image");
  }

  let buffer = await sharp({
    create: {
      width: SOCIAL_CARD_WIDTH,
      height: SOCIAL_CARD_HEIGHT,
      channels: 3,
      background: "#f7f1e7",
    },
  })
    // The template establishes the ivory canvas and right-hand brand panel
    // first. Product overlays then occupy only the dedicated left panel, so
    // catalog photography remains visibly dominant rather than being hidden
    // under the template's ivory image-area background.
    .composite([{ input: templateSvg(), top: 0, left: 0 }, ...overlays])
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();
  // Keep social assets under the 1 MB operational target. Record the initial
  // oversize result so editors can replace a costly source, while the response
  // remains safe for crawlers and messaging apps.
  if (buffer.byteLength > 1_000_000) {
    qualityFlags.push("oversized-output");
    buffer = await sharp(buffer).jpeg({ quality: 70, mozjpeg: true }).toBuffer();
  }

  return { buffer, qualityFlags, width: SOCIAL_CARD_WIDTH, height: SOCIAL_CARD_HEIGHT };
}