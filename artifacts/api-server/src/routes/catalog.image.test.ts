/**
 * Unit/integration tests for the two catalog image proxy handlers in catalog.ts:
 *   GET /catalog/brand-image/:filename
 *   GET /catalog/occasion-image/:id
 *
 * Verifies:
 *   1. w/f/q query params are accepted and forwarded to transformImage.
 *   2. The LRU cache key includes width, format, and quality — so different
 *      param combinations are stored separately and the same combination hits.
 *   3. The correct Content-Type header is returned for each format.
 *   4. Missing/invalid IDs return 404 (or 400 for bad filename patterns).
 *   5. Missing API key returns 503.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Hoisted mock references
// ---------------------------------------------------------------------------

const { transformImageMock, getOsOccasionsMock, fetchMock } = vi.hoisted(() => ({
  transformImageMock: vi.fn(),
  getOsOccasionsMock: vi.fn(),
  fetchMock: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../lib/imageTransform", () => ({
  transformImage: transformImageMock,
  // Keep pure resolver functions as real implementations so params are
  // correctly threaded through to transformImage.
  resolveWidth: (raw?: string) => {
    if (!raw) return 800;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 1600) : 800;
  },
  resolveFormat: (raw?: string) => (raw === "jpeg" ? "jpeg" : "webp"),
  resolveQuality: (raw?: string) => {
    if (!raw) return 82;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? Math.min(n, 100) : 82;
  },
}));

vi.mock("../lib/osProductsCache", () => ({
  getOsOccasions: getOsOccasionsMock,
  getOsCategories: vi.fn().mockReturnValue([]),
  getOsBrands: vi.fn().mockReturnValue([]),
  getOsRawCatalogBrands: vi.fn().mockReturnValue([]),
  getOsBrandProductCounts: vi.fn().mockReturnValue(new Map()),
  getOsCategoryProductCounts: vi.fn().mockReturnValue(new Map()),
  getOsOccasionProductCounts: vi.fn().mockReturnValue(new Map()),
  getOsProductOccasions: vi.fn().mockReturnValue(new Map()),
  getOsProductEmbeddedCategories: vi.fn().mockReturnValue(new Map()),
  registerOsProductsRefreshListener: vi.fn(),
  registerPricingEnrichmentListener: vi.fn(),
}));

vi.mock("pino-http", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("@workspace/catalog-data", () => ({
  categories: [],
  occasions: [],
  CURRENCIES: [],
  COUNTRY_TO_CURRENCY_MAP: {},
  FALLBACK_CURRENCY_CODE: "USD",
}));

vi.mock("@workspace/api-zod", () => ({
  GetCatalogMetadataResponse: { parse: (v: unknown) => v },
  GetCurrenciesResponse: { parse: (v: unknown) => v },
}));

// ---------------------------------------------------------------------------
// Fake image fixtures
// ---------------------------------------------------------------------------

const FAKE_WEBP = Buffer.from("FAKE_WEBP_DATA");
const FAKE_JPEG = Buffer.from("FAKE_JPEG_DATA");

function fakeTransformWebp() {
  return Promise.resolve({ data: FAKE_WEBP, contentType: "image/webp" });
}
function fakeTransformJpeg() {
  return Promise.resolve({ data: FAKE_JPEG, contentType: "image/jpeg" });
}

/** A mock Response that returns a small PNG-like buffer as an image. */
function makeFakeImageFetchResponse(contentType = "image/jpeg") {
  const buffer = Buffer.from("FAKE_SOURCE_IMAGE");
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: { get: (h: string) => (h === "content-type" ? contentType : null) },
    arrayBuffer: () => Promise.resolve(buffer.buffer),
  } as unknown as Response);
}

// ---------------------------------------------------------------------------
// App builder — re-imports catalog router after each resetModules() so the
// module-level LRU cache is fresh for each describe block.
// ---------------------------------------------------------------------------

async function buildApp() {
  const { default: catalogRouter } = await import("./catalog");
  const app = express();
  app.use(express.json());
  app.use((_req: any, _res: unknown, next: () => void) => {
    (_req as any).log = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() };
    next();
  });
  app.use("/api", catalogRouter);
  return app;
}

// ---------------------------------------------------------------------------
// brand-image handler
// ---------------------------------------------------------------------------

describe("GET /api/catalog/brand-image/:filename", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    process.env.PRESENTAIL_OS_API_KEY = "test-api-key";
    transformImageMock.mockImplementation(fakeTransformWebp);
    fetchMock.mockImplementation(() => makeFakeImageFetchResponse("image/jpeg"));
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    delete process.env.PRESENTAIL_OS_API_KEY;
  });

  it("returns 400 for a filename containing a semicolon (invalid char)", async () => {
    // The regex only allows [a-zA-Z0-9_-] + dot + 2-5 alpha extension.
    // A filename with a semicolon matches the route but fails the guard.
    const app = await buildApp();
    const res = await request(app).get("/api/catalog/brand-image/bad;file.jpg");
    expect(res.status).toBe(400);
  });

  it("returns 400 for a filename with no extension", async () => {
    const app = await buildApp();
    const res = await request(app).get("/api/catalog/brand-image/noextension");
    expect(res.status).toBe(400);
  });

  it("returns 503 when PRESENTAIL_OS_API_KEY is not set", async () => {
    delete process.env.PRESENTAIL_OS_API_KEY;
    const app = await buildApp();
    const res = await request(app).get("/api/catalog/brand-image/brand-logo.jpg");
    expect(res.status).toBe(503);
  });

  it("returns image/webp Content-Type when f=webp is requested", async () => {
    transformImageMock.mockImplementation(fakeTransformWebp);
    const app = await buildApp();
    const res = await request(app).get("/api/catalog/brand-image/brand-logo.jpg?w=288&f=webp");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/webp");
  });

  it("returns image/jpeg Content-Type when f=jpeg is requested", async () => {
    transformImageMock.mockImplementation(fakeTransformJpeg);
    const app = await buildApp();
    const res = await request(app).get("/api/catalog/brand-image/brand-logo.jpg?w=288&f=jpeg");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/jpeg");
  });

  it("passes w/f/q params to transformImage", async () => {
    const app = await buildApp();
    await request(app).get("/api/catalog/brand-image/brand-logo.jpg?w=144&f=webp&q=75");
    expect(transformImageMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ width: 144, format: "webp", quality: 75 }),
    );
  });

  it("uses default width=800 format=webp quality=82 when no params supplied", async () => {
    const app = await buildApp();
    await request(app).get("/api/catalog/brand-image/brand-logo.jpg");
    expect(transformImageMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ width: 800, format: "webp", quality: 82 }),
    );
  });

  it("sets Cache-Control immutable", async () => {
    const app = await buildApp();
    const res = await request(app).get("/api/catalog/brand-image/brand-logo.jpg?w=288&f=webp");
    expect(res.headers["cache-control"]).toContain("immutable");
  });

  it("returns X-Cache: MISS on the first request and HIT on the second", async () => {
    const app = await buildApp();
    const url = "/api/catalog/brand-image/brand-logo.jpg?w=288&f=webp&q=82";

    const first = await request(app).get(url);
    expect(first.headers["x-cache"]).toBe("MISS");

    const second = await request(app).get(url);
    expect(second.headers["x-cache"]).toBe("HIT");

    // transformImage should only have been called once (second served from cache).
    expect(transformImageMock).toHaveBeenCalledTimes(1);
  });

  it("stores separate cache entries for different widths", async () => {
    const app = await buildApp();

    const r144 = await request(app).get("/api/catalog/brand-image/brand-logo.jpg?w=144&f=webp");
    const r288 = await request(app).get("/api/catalog/brand-image/brand-logo.jpg?w=288&f=webp");

    // Both should be MISS since they have different cache keys.
    expect(r144.headers["x-cache"]).toBe("MISS");
    expect(r288.headers["x-cache"]).toBe("MISS");

    // transformImage called twice — once per distinct width.
    expect(transformImageMock).toHaveBeenCalledTimes(2);
  });

  it("stores separate cache entries for different formats", async () => {
    transformImageMock
      .mockImplementationOnce(fakeTransformWebp)
      .mockImplementationOnce(fakeTransformJpeg);

    const app = await buildApp();

    const rWebp = await request(app).get("/api/catalog/brand-image/brand-logo.jpg?w=288&f=webp");
    const rJpeg = await request(app).get("/api/catalog/brand-image/brand-logo.jpg?w=288&f=jpeg");

    expect(rWebp.headers["x-cache"]).toBe("MISS");
    expect(rJpeg.headers["x-cache"]).toBe("MISS");
    expect(transformImageMock).toHaveBeenCalledTimes(2);
  });

  it("stores separate cache entries for different quality values", async () => {
    const app = await buildApp();

    const r82 = await request(app).get("/api/catalog/brand-image/brand-logo.jpg?w=288&f=webp&q=82");
    const r60 = await request(app).get("/api/catalog/brand-image/brand-logo.jpg?w=288&f=webp&q=60");

    expect(r82.headers["x-cache"]).toBe("MISS");
    expect(r60.headers["x-cache"]).toBe("MISS");
    expect(transformImageMock).toHaveBeenCalledTimes(2);
  });

  it("bounds distinct concurrent catalog image fetches before buffering", async () => {
    let activeFetches = 0;
    let maxActiveFetches = 0;
    fetchMock.mockImplementation(async () => {
      activeFetches += 1;
      maxActiveFetches = Math.max(maxActiveFetches, activeFetches);
      await new Promise((resolve) => setTimeout(resolve, 25));
      activeFetches -= 1;
      return makeFakeImageFetchResponse("image/jpeg");
    });
    const app = await buildApp();
    const responses = await Promise.all(
      Array.from({ length: 16 }, (_, index) =>
        request(app).get(`/api/catalog/brand-image/concurrent-${index}.jpg`),
      ),
    );
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(maxActiveFetches).toBeLessThanOrEqual(8);
  });

  it("rejects an oversized chunked catalog image without using arrayBuffer", async () => {
    const oneMiB = new Uint8Array(1024 * 1024);
    const arrayBuffer = vi.fn(() => Promise.reject(new Error("must not buffer unbounded body")));
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (header: string) => (header === "content-type" ? "image/jpeg" : null) },
      body: new ReadableStream({
        start(controller) {
          for (let index = 0; index < 13; index += 1) controller.enqueue(oneMiB);
          controller.close();
        },
      }),
      arrayBuffer,
    } as unknown as Response);
    const app = await buildApp();
    const response = await request(app).get("/api/catalog/brand-image/oversized.jpg");
    expect(response.status).toBe(413);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(transformImageMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// occasion-image handler
// ---------------------------------------------------------------------------

describe("GET /api/catalog/occasion-image/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    process.env.PRESENTAIL_OS_API_KEY = "test-api-key";
    transformImageMock.mockImplementation(fakeTransformWebp);
    fetchMock.mockImplementation(() => makeFakeImageFetchResponse("image/jpeg"));
    getOsOccasionsMock.mockReturnValue([
      {
        id: "occ-123",
        slug: "birthday",
        name: "Birthday",
        image: "https://os.presentail.com/api/storage/public-objects/occasions/birthday.jpg",
        imagePublicUrl: "https://os.presentail.com/api/storage/public-objects/occasions/birthday.jpg",
        featured: true,
      },
    ]);
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    delete process.env.PRESENTAIL_OS_API_KEY;
  });

  it("returns 400 for an id containing a dot (invalid per the regex)", async () => {
    // The regex only allows [a-zA-Z0-9_-]; a dot in the id fails the guard.
    const app = await buildApp();
    const res = await request(app).get("/api/catalog/occasion-image/bad.id");
    expect(res.status).toBe(400);
  });

  it("returns 503 when PRESENTAIL_OS_API_KEY is not set", async () => {
    delete process.env.PRESENTAIL_OS_API_KEY;
    const app = await buildApp();
    const res = await request(app).get("/api/catalog/occasion-image/occ-123");
    expect(res.status).toBe(503);
  });

  it("returns 404 when occasion id is not in the OS cache", async () => {
    getOsOccasionsMock.mockReturnValue([]);
    const app = await buildApp();
    const res = await request(app).get("/api/catalog/occasion-image/occ-unknown");
    expect(res.status).toBe(404);
  });

  it("returns image/webp and 200 for a known occasion id with f=webp", async () => {
    const app = await buildApp();
    const res = await request(app).get("/api/catalog/occasion-image/occ-123?w=288&f=webp");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/webp");
  });

  it("passes w/f/q params to transformImage", async () => {
    const app = await buildApp();
    await request(app).get("/api/catalog/occasion-image/occ-123?w=480&f=webp&q=70");
    expect(transformImageMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ width: 480, format: "webp", quality: 70 }),
    );
  });

  it("returns X-Cache: MISS on first request and HIT on second for same params", async () => {
    const app = await buildApp();
    const url = "/api/catalog/occasion-image/occ-123?w=288&f=webp&q=82";

    const first = await request(app).get(url);
    expect(first.headers["x-cache"]).toBe("MISS");

    const second = await request(app).get(url);
    expect(second.headers["x-cache"]).toBe("HIT");

    expect(transformImageMock).toHaveBeenCalledTimes(1);
  });

  it("stores separate cache entries for different widths", async () => {
    const app = await buildApp();

    const r144 = await request(app).get("/api/catalog/occasion-image/occ-123?w=144&f=webp");
    const r480 = await request(app).get("/api/catalog/occasion-image/occ-123?w=480&f=webp");

    expect(r144.headers["x-cache"]).toBe("MISS");
    expect(r480.headers["x-cache"]).toBe("MISS");
    expect(transformImageMock).toHaveBeenCalledTimes(2);
  });

  it("stores separate cache entries for different formats", async () => {
    transformImageMock
      .mockImplementationOnce(fakeTransformWebp)
      .mockImplementationOnce(fakeTransformJpeg);

    const app = await buildApp();

    const rWebp = await request(app).get("/api/catalog/occasion-image/occ-123?w=288&f=webp");
    const rJpeg = await request(app).get("/api/catalog/occasion-image/occ-123?w=288&f=jpeg");

    expect(rWebp.headers["x-cache"]).toBe("MISS");
    expect(rJpeg.headers["x-cache"]).toBe("MISS");
    expect(transformImageMock).toHaveBeenCalledTimes(2);
  });

  it("stores separate cache entries for different quality values", async () => {
    const app = await buildApp();

    const r82 = await request(app).get("/api/catalog/occasion-image/occ-123?w=288&f=webp&q=82");
    const r60 = await request(app).get("/api/catalog/occasion-image/occ-123?w=288&f=webp&q=60");

    expect(r82.headers["x-cache"]).toBe("MISS");
    expect(r60.headers["x-cache"]).toBe("MISS");
    expect(transformImageMock).toHaveBeenCalledTimes(2);
  });
});

