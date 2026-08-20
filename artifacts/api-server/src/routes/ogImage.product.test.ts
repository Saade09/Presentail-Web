import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import sharp from "sharp";

const {
  getOsProductBySlugMock,
  getProductSocialShareMock,
  rowToProductSocialOverridesMock,
  upsertProductSocialShareMock,
} = vi.hoisted(() => ({
  getOsProductBySlugMock: vi.fn(),
  getProductSocialShareMock: vi.fn(),
  rowToProductSocialOverridesMock: vi.fn(),
  upsertProductSocialShareMock: vi.fn(),
}));

vi.mock("../lib/osProductsCache", () => ({
  getOsProductBySlug: getOsProductBySlugMock,
  getOsBrands: vi.fn().mockReturnValue([]),
  getOsOccasions: vi.fn().mockReturnValue([]),
}));
vi.mock("../lib/productSocialShareStore", () => ({
  getProductSocialShare: getProductSocialShareMock,
  rowToProductSocialOverrides: rowToProductSocialOverridesMock,
  upsertProductSocialShare: upsertProductSocialShareMock,
}));

async function buildApp() {
  const { default: router } = await import("./ogImage");
  const app = express();
  app.use((req: any, _res, next) => {
    req.log = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
    next();
  });
  app.use("/api", router);
  return app;
}

describe("GET /api/og-image/product/:slug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    rowToProductSocialOverridesMock.mockReturnValue({ layout: "product", templateVersion: "ivory-v1" });
    getProductSocialShareMock.mockResolvedValue(null);
    upsertProductSocialShareMock.mockResolvedValue(undefined);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("returns a cacheable 1200×630 JPEG card for a catalog product", async () => {
    const source = await sharp({
      create: { width: 900, height: 900, channels: 3, background: "#d49d87" },
    }).jpeg().toBuffer();
    getOsProductBySlugMock.mockImplementation((slug: string) =>
      slug === "gift-box"
        ? { id: slug, name: "An intentionally very long product name that must never be baked into a social image", images: [{ url: "https://cdn.test/gift.jpg" }], inStock: true }
        : null,
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
    }));
    const app = await buildApp();
    const response = await request(app).get("/api/og-image/product/gift-box?v=abc");
    const metadata = await sharp(response.body).metadata();
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("image/jpeg");
    expect(response.headers["cache-control"]).toContain("public");
    expect(response.headers["cache-control"]).toContain("max-age=86400");
    expect(metadata).toMatchObject({ width: 1200, height: 630, format: "jpeg" });
  });

  it("uses a valid generic fallback for a missing catalog product", async () => {
    getOsProductBySlugMock.mockReturnValue(null);
    const app = await buildApp();
    const response = await request(app).get("/api/og-image/product/missing");
    const metadata = await sharp(response.body).metadata();
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toContain("max-age=300");
    expect(metadata).toMatchObject({ width: 1200, height: 630, format: "jpeg" });
  });

  it("returns a JPEG for max-scale square and portrait editorial cards", async () => {
    const sources = await Promise.all([
      sharp({ create: { width: 900, height: 900, channels: 3, background: "#c8322a" } }).jpeg().toBuffer(),
      sharp({ create: { width: 700, height: 1400, channels: 3, background: "#2a62a8" } }).png().toBuffer(),
    ]);
    getOsProductBySlugMock.mockImplementation((slug: string) =>
      slug === "scaled-square" || slug === "scaled-portrait"
        ? { id: slug, name: "Scaled card", images: [{ url: `https://cdn.test/${slug}.jpg` }], inStock: true }
        : null,
    );
    rowToProductSocialOverridesMock.mockReturnValue({
      customImageUrl: "https://cdn.presentail.com/social/scaled-override.png",
      layout: "product",
      scale: 2,
      focalX: 0.8,
      focalY: 0.2,
      positionX: 1,
      positionY: -1,
      templateVersion: "ivory-v2",
    });
    let requestIndex = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      const source = sources[requestIndex++ % sources.length];
      return { ok: true, arrayBuffer: async () => source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) };
    }));
    const app = await buildApp();
    for (const slug of ["scaled-square", "scaled-portrait"]) {
      const response = await request(app).get(`/api/og-image/product/${slug}`);
      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("image/jpeg");
      expect(await sharp(response.body).metadata()).toMatchObject({ width: 1200, height: 630, format: "jpeg" });
    }
  });
});