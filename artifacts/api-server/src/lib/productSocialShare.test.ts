import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  SOCIAL_CARD_HEIGHT,
  SOCIAL_CARD_WIDTH,
  buildProductSocialVersion,
  renderProductSocialCard,
  selectProductSocialImage,
} from "./productSocialShare";

describe("product social-share renderer", () => {
  it("uses editorial images before the primary and gallery catalog images", () => {
    const product = {
      images: [{ url: "https://catalog.example/primary.jpg" }, { url: "https://catalog.example/gallery.jpg" }],
    };
    expect(selectProductSocialImage(product, { customImageUrl: "https://admin.example/custom.png" }))
      .toEqual({ url: "https://admin.example/custom.png", source: "custom" });
    expect(selectProductSocialImage(product, { preferredImageUrl: "https://admin.example/preferred.jpg" }))
      .toEqual({ url: "https://admin.example/preferred.jpg", source: "preferred" });
    expect(selectProductSocialImage(product)).toEqual({ url: "https://catalog.example/primary.jpg", source: "primary" });
    expect(selectProductSocialImage({ images: [{ url: "" }, { url: "https://catalog.example/gallery.jpg" }] }))
      .toEqual({ url: "https://catalog.example/gallery.jpg", source: "gallery" });
    expect(selectProductSocialImage({ images: [] })).toBeNull();
  });

  it("changes a public version when source or controls change", () => {
    const baseline = buildProductSocialVersion("https://catalog.example/rose.jpg", { layout: "product" });
    expect(buildProductSocialVersion("https://catalog.example/new-rose.jpg", { layout: "product" })).not.toBe(baseline);
    expect(buildProductSocialVersion("https://catalog.example/rose.jpg", { layout: "photo", focalX: 0.2 })).not.toBe(baseline);
  });

  it("returns a generic, valid 1200×630 JPEG for a missing image", async () => {
    const result = await renderProductSocialCard();
    const metadata = await sharp(result.buffer).metadata();
    expect(metadata.format).toBe("jpeg");
    expect(metadata.width).toBe(SOCIAL_CARD_WIDTH);
    expect(metadata.height).toBe(SOCIAL_CARD_HEIGHT);
    expect(result.qualityFlags).toContain("missing-image");
  });

  it("preserves transparent, portrait, and lifestyle sources without stretching", async () => {
    const transparentPng = await sharp({
      create: { width: 240, height: 520, channels: 4, background: { r: 220, g: 120, b: 150, alpha: 0.5 } },
    }).png().toBuffer();
    const productResult = await renderProductSocialCard({ imageBuffer: transparentPng, layout: "portrait" });
    const lifestyleResult = await renderProductSocialCard({
      imageBuffer: transparentPng,
      layout: "photo",
      focalX: 0.8,
      focalY: 0.2,
    });
    expect(productResult.qualityFlags).toEqual(expect.arrayContaining(["transparent-source", "portrait-source", "low-resolution"]));
    expect(lifestyleResult.qualityFlags).toContain("lifestyle-crop");
    expect((await sharp(productResult.buffer).metadata()).width).toBe(1200);
    expect((await sharp(lifestyleResult.buffer).metadata()).height).toBe(630);
  });

  it("keeps the selected catalog photo visibly above the ivory template", async () => {
    const redSource = await sharp({
      create: { width: 900, height: 900, channels: 3, background: "#e1261c" },
    }).png().toBuffer();
    const card = await renderProductSocialCard({ imageBuffer: redSource, layout: "product" });
    const { data, info } = await sharp(card.buffer).raw().toBuffer({ resolveWithObject: true });
    const pixelOffset = (315 * info.width + 380) * info.channels;
    // Center of the left photo panel: it must retain the source's red pixels,
    // not the warm-ivory template background (whose green channel is ~241).
    expect(data[pixelOffset + 1]).toBeLessThan(100);
    expect(data[pixelOffset]).toBeGreaterThan(150);
  });

  it("keeps max-scale square and portrait layouts inside the share-card canvas", async () => {
    const square = await sharp({
      create: { width: 900, height: 900, channels: 3, background: "#cd372e" },
    }).jpeg().toBuffer();
    const portrait = await sharp({
      create: { width: 700, height: 1400, channels: 3, background: "#2e72ae" },
    }).png().toBuffer();
    for (const imageBuffer of [square, portrait]) {
      const card = await renderProductSocialCard({
        imageBuffer,
        layout: "product",
        scale: 2,
        focalX: 0.8,
        focalY: 0.2,
        positionX: 1,
        positionY: -1,
      });
      expect(await sharp(card.buffer).metadata()).toMatchObject({ width: 1200, height: 630, format: "jpeg" });
    }
  });

  it("applies position controls to lifestyle crops and flags under-40% occupancy", async () => {
    const wide = await sharp({
      create: { width: 1800, height: 700, channels: 3, background: "#d92d25" },
    }).composite([{ input: Buffer.from('<svg width="900" height="700"><rect width="900" height="700" fill="#1766c2"/></svg>'), left: 900, top: 0 }]).png().toBuffer();
    const leftCrop = await renderProductSocialCard({ imageBuffer: wide, layout: "photo", focalX: 0.5, positionX: -1 });
    const rightCrop = await renderProductSocialCard({ imageBuffer: wide, layout: "photo", focalX: 0.5, positionX: 1 });
    const leftPixel = await sharp(leftCrop.buffer).raw().toBuffer({ resolveWithObject: true });
    const rightPixel = await sharp(rightCrop.buffer).raw().toBuffer({ resolveWithObject: true });
    const offset = (315 * 1200 + 380) * leftPixel.info.channels;
    expect(leftPixel.data[offset]).toBeGreaterThan(rightPixel.data[offset]);
    expect(rightPixel.data[offset + 2]).toBeGreaterThan(leftPixel.data[offset + 2]);

    const narrowPortrait = await sharp({
      create: { width: 480, height: 1000, channels: 3, background: "#444444" },
    }).png().toBuffer();
    const contained = await renderProductSocialCard({ imageBuffer: narrowPortrait, layout: "product" });
    expect(contained.qualityFlags).toContain("small-product-occupancy");
  });
});