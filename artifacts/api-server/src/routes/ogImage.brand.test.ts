/**
 * Route-level tests for GET /api/og-image/brand/:slug
 *
 * Verifies:
 *   1. Returns 200 image/jpeg with Cache-Control: public, max-age=3600 for a
 *      known brand slug (found in the OS brand cache).
 *   2. Returns 200 image/jpeg with Cache-Control: public, max-age=300 (short
 *      TTL) when the slug is not found in the OS brand cache — the fallback
 *      generic branded card prevents crawlers from ever caching a non-image
 *      response for an og:image URL.
 *   3. Returns 400 when slug is an empty string after trimming.
 *   4. Cache hit: the second request for the same slug returns the cached buffer
 *      and sharp is only called once.
 *   5. Cache-Control contains stale-while-revalidate=600.
 *   6. Cache respects max-age=300 for unknown slugs and max-age=3600 for known.
 *
 * Sharp is mocked so the test suite has no native dependency and runs in CI
 * without a real image-processing step. The returned buffer is a fake value
 * that lets us assert the response body without worrying about valid JPEG magic.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Hoisted mock references — must be declared before any vi.mock() call.
// ---------------------------------------------------------------------------

const { getOsBrandsMock, sharpMock } = vi.hoisted(() => {
  const sharpInstance = {
    composite: vi.fn(),
    jpeg: vi.fn(),
    toBuffer: vi.fn(),
    resize: vi.fn(),
  };
  // sharp is called as a factory function; each chain returns the same instance
  // so we can spy on the final .toBuffer() call.
  sharpInstance.composite.mockReturnValue(sharpInstance);
  sharpInstance.jpeg.mockReturnValue(sharpInstance);
  sharpInstance.resize.mockReturnValue(sharpInstance);

  return {
    getOsBrandsMock: vi.fn(),
    sharpMock: vi.fn(() => sharpInstance),
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("sharp", () => ({ default: sharpMock }));

vi.mock("../lib/osProductsCache", () => ({
  getOsBrands: getOsBrandsMock,
  getOsProductBySlug: vi.fn().mockReturnValue(null),
  getOsOccasions: vi.fn().mockReturnValue([]),
}));

vi.mock("pino-http", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ---------------------------------------------------------------------------
// Shared fake JPEG buffer returned by the mocked sharp pipeline.
// ---------------------------------------------------------------------------

const FAKE_JPEG = Buffer.from("FAKE_JPEG_BUFFER");

// ---------------------------------------------------------------------------
// App builder — re-imports ogImage router AFTER vi.resetModules() so the
// in-process ogCache map is fresh for each test (prevents inter-test cache
// hits from muddying the assertions).
// ---------------------------------------------------------------------------

async function buildApp() {
  const { default: ogImageRouter } = await import("./ogImage");
  const app = express();
  app.use((_req: any, _res: unknown, next: () => void) => {
    (_req as any).log = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    next();
  });
  app.use("/api", ogImageRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/og-image/brand/:slug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Default: sharp pipeline returns the fake JPEG buffer.
    sharpMock.mockImplementation(() => {
      const inst = {
        composite: vi.fn().mockReturnThis(),
        jpeg: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(FAKE_JPEG),
        resize: vi.fn().mockReturnThis(),
      };
      return inst;
    });

    // Stub fetch so fetchImageBuffer never makes a real network call.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
      } as unknown as Response),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── 1. Known slug ──────────────────────────────────────────────────────────

  it("returns 200 image/jpeg for a known brand slug", async () => {
    getOsBrandsMock.mockReturnValue([
      { id: "b1", slug: "fleuriste", name: "Fleuriste", image: null },
    ]);
    const app = await buildApp();
    const res = await request(app).get("/api/og-image/brand/fleuriste");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/jpeg");
  });

  it("sets Cache-Control max-age=3600 for a known brand slug", async () => {
    getOsBrandsMock.mockReturnValue([
      { id: "b1", slug: "fleuriste", name: "Fleuriste", image: null },
    ]);
    const app = await buildApp();
    const res = await request(app).get("/api/og-image/brand/fleuriste");
    expect(res.headers["cache-control"]).toMatch(/max-age=3600/);
    expect(res.headers["cache-control"]).toContain("public");
  });

  it("includes stale-while-revalidate=600 for a known slug", async () => {
    getOsBrandsMock.mockReturnValue([
      { id: "b1", slug: "fleuriste", name: "Fleuriste", image: null },
    ]);
    const app = await buildApp();
    const res = await request(app).get("/api/og-image/brand/fleuriste");
    expect(res.headers["cache-control"]).toContain("stale-while-revalidate=600");
  });

  // ── 2. Unknown slug — generic branded card with short TTL ─────────────────

  it("returns 200 image/jpeg (generic card) when brand slug is not in OS cache", async () => {
    getOsBrandsMock.mockReturnValue([]); // slug not found
    const app = await buildApp();
    const res = await request(app).get("/api/og-image/brand/unknown-brand");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/jpeg");
  });

  it("sets Cache-Control max-age=300 (short TTL) when brand is not found", async () => {
    getOsBrandsMock.mockReturnValue([]);
    const app = await buildApp();
    const res = await request(app).get("/api/og-image/brand/unknown-brand");
    expect(res.headers["cache-control"]).toMatch(/max-age=300/);
  });

  it("returns 200 generic card even when getOsBrands() returns null (cold cache)", async () => {
    getOsBrandsMock.mockReturnValue(null); // cold cache
    const app = await buildApp();
    const res = await request(app).get("/api/og-image/brand/any-slug");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/jpeg");
    expect(res.headers["cache-control"]).toMatch(/max-age=300/);
  });

  // ── 3. Bad slug ────────────────────────────────────────────────────────────

  it("returns 400 when slug trims to an empty string", async () => {
    getOsBrandsMock.mockReturnValue([]);
    const app = await buildApp();
    // Express will not match `/api/og-image/brand/` (no slug segment) so the
    // route handler never receives an empty string from req.params.slug; the
    // guard exists for safety (e.g. if the route is re-wired with a catch-all).
    // We test the guard directly by calling it via the route module boundary.
    // A slug that is all whitespace trims to "" and must get a 400.
    // Note: URL-encoding a space → %20 keeps the param non-empty at the
    // routing layer but trimming gives "". We use the literal encoded space.
    const res = await request(app).get("/api/og-image/brand/%20");
    expect(res.status).toBe(400);
  });

  // ── 4. Cache hit ───────────────────────────────────────────────────────────

  it("serves the cached buffer on the second request without calling sharp again", async () => {
    getOsBrandsMock.mockReturnValue([
      { id: "b1", slug: "fleuriste", name: "Fleuriste", image: null },
    ]);

    let sharpCallCount = 0;
    sharpMock.mockImplementation(() => {
      sharpCallCount++;
      return {
        composite: vi.fn().mockReturnThis(),
        jpeg: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(FAKE_JPEG),
        resize: vi.fn().mockReturnThis(),
      };
    });

    const app = await buildApp();

    const first = await request(app).get("/api/og-image/brand/fleuriste");
    const second = await request(app).get("/api/og-image/brand/fleuriste");

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    // sharp is called twice per request (once for the background, once for
    // the photo resize attempt) but the overall JPEG generation only happens
    // once — the second request is served from the in-process cache.
    // We assert by comparing the raw response bodies.
    expect(first.body).toEqual(second.body);
    // And the sharp factory was only called for the first request.
    const firstCallCount = sharpCallCount;
    await request(app).get("/api/og-image/brand/fleuriste");
    // Third request: sharp call count unchanged (cache hit).
    expect(sharpCallCount).toBe(firstCallCount);
  });

  // ── 5. brand.image is a string URL — fetchImageBuffer is invoked ───────────

  it("attempts to fetch the brand image when brand.image is a string URL", async () => {
    getOsBrandsMock.mockReturnValue([
      {
        id: "b1",
        slug: "with-photo",
        name: "With Photo",
        image: "https://os.presentail.com/api/brand-photo.jpg",
      },
    ]);
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false, // simulate fetch failure — route falls through to text-only card
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchSpy);

    const app = await buildApp();
    const res = await request(app).get("/api/og-image/brand/with-photo");

    expect(res.status).toBe(200);
    // fetch was called with the brand image URL
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://os.presentail.com/api/brand-photo.jpg",
      expect.objectContaining({ redirect: "follow" }),
    );
  });
});
