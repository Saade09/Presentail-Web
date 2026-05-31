// ---------------------------------------------------------------------------
// ETag / Last-Modified conditional request support
//
// When fetchEntityForSeoCached re-fetches an entity after its TTL expires, it
// sends If-None-Match / If-Modified-Since headers if the previous response
// provided an ETag or Last-Modified value. The upstream can then respond with
// 304 Not Modified to indicate that the entity — and therefore its image URLs
// — have not changed. In that case the cached entity is restored with a fresh
// TTL and image-dims are NOT re-fetched (they are still accurate). A 200
// response means the entity changed; dims ARE evicted and re-probed.
//
// Tests use vi.useFakeTimers({ toFake: ['Date'] }) so only Date.now() is faked;
// real setTimeout keeps the AbortController timer in fetchImageDimensions working.
// ---------------------------------------------------------------------------

const ETAG_HTML = `<!doctype html><html lang="en"><head><title>Old</title></head><body></body></html>`;
const ETAG_OPTS = {
  apiBaseUrl: "https://api.etag-test",
  origin: "https://presentail.etag-test",
  basePath: "",
};

function makeFakeHeaders(map: Record<string, string | null>) {
  return {
    get: (name: string) => map[name.toLowerCase()] ?? null,
  };
}

describe("ETag conditional requests — 304 branch (no dims eviction)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does NOT re-fetch image dims on a 304 response within cache TTL (product)", async () => {
    // When the upstream returns an ETag on the first fetch, a second request
    // WITHIN the 60s entity TTL must still send If-None-Match and skip dims
    // eviction when the server confirms the entity is unchanged (304).
    const pngBuf = makePngBuffer(800, 600);
    const imageUrl = "https://cdn.etag-test/product-etag-304-withinttl-unique.png";
    const entityEtag = '"etag-v1-within-ttl-product-304"';
    let entityFetchCount = 0;
    let dimsFetchCount = 0;

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/woo/product")) {
        entityFetchCount++;
        const ifNoneMatch = (init?.headers as Record<string, string> | undefined)?.["If-None-Match"];
        if (ifNoneMatch === entityEtag) {
          // Conditional request within TTL → entity unchanged → 304.
          return { ok: false, status: 304, headers: makeFakeHeaders({}) };
        }
        return {
          ok: true,
          status: 200,
          headers: makeFakeHeaders({ etag: entityEtag }),
          json: async () => ({
            ok: true,
            product: {
              name: "ETag 304 Within TTL Product",
              description: "Conditional within-TTL test.",
              image: { uri: imageUrl },
              priceValue: 75,
            },
          }),
        };
      }
      dimsFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => pngBuf };
    });
    vi.stubGlobal("fetch", fetchMock);

    // First call: entity + dims freshly fetched; ETag stored in entity cache.
    await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/product/etag-304-withinttl-product", ETAG_OPTS);
    expect(entityFetchCount).toBe(1);
    expect(dimsFetchCount).toBe(1);

    // Second call immediately (WITHIN TTL): because we stored an ETag, a
    // conditional request must be sent even though the TTL has not expired.
    // The server returns 304 → entity served from cache, dims NOT re-probed.
    await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/product/etag-304-withinttl-product", ETAG_OPTS);
    expect(entityFetchCount).toBe(2); // conditional request sent within TTL
    expect(dimsFetchCount).toBe(1);   // 304 → no dims eviction
  });

  it("does NOT re-fetch image dims on a 304 response within cache TTL (brand)", async () => {
    const pngBuf = makePngBuffer(600, 400);
    const imageUrl = "https://cdn.etag-test/brand-etag-304-withinttl-unique.png";
    const entityEtag = '"etag-v1-within-ttl-brand-304"';
    let entityFetchCount = 0;
    let dimsFetchCount = 0;

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/woo/brand")) {
        entityFetchCount++;
        const ifNoneMatch = (init?.headers as Record<string, string> | undefined)?.["If-None-Match"];
        if (ifNoneMatch === entityEtag) {
          return { ok: false, status: 304, headers: makeFakeHeaders({}) };
        }
        return {
          ok: true,
          status: 200,
          headers: makeFakeHeaders({ etag: entityEtag }),
          json: async () => ({
            ok: true,
            brand: { name: "ETag Within-TTL Brand", description: "Brand within-TTL test.", image: imageUrl },
          }),
        };
      }
      dimsFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => pngBuf };
    });
    vi.stubGlobal("fetch", fetchMock);

    await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/brand/etag-304-withinttl-brand", ETAG_OPTS);
    expect(entityFetchCount).toBe(1);
    expect(dimsFetchCount).toBe(1);

    // Second call within TTL: conditional request → 304 → no dims re-fetch.
    await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/brand/etag-304-withinttl-brand", ETAG_OPTS);
    expect(entityFetchCount).toBe(2);
    expect(dimsFetchCount).toBe(1);
  });

  it("sends If-None-Match on the second request within TTL (not just after expiry)", async () => {
    const imageUrl = "https://cdn.etag-test/product-etag-hdrcheck-withinttl-unique.png";
    const entityEtag = '"etag-hdrcheck-within-ttl-v1"';
    const capturedHeaders: Array<Record<string, string>> = [];

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/woo/product")) {
        const h = (init?.headers ?? {}) as Record<string, string>;
        capturedHeaders.push({ ...h });
        if (h["If-None-Match"] === entityEtag) {
          return { ok: false, status: 304, headers: makeFakeHeaders({}) };
        }
        return {
          ok: true,
          status: 200,
          headers: makeFakeHeaders({ etag: entityEtag }),
          json: async () => ({
            ok: true,
            product: {
              name: "Header Check Within TTL",
              description: "Verifies If-None-Match is sent within TTL.",
              image: { uri: imageUrl },
              priceValue: 50,
            },
          }),
        };
      }
      return { ok: true, status: 206, arrayBuffer: async () => makePngBuffer(800, 600) };
    });
    vi.stubGlobal("fetch", fetchMock);

    // First call: no conditional headers yet.
    await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/product/etag-hdrcheck-withinttl-product", ETAG_OPTS);
    // Second call immediately (within TTL): should carry If-None-Match.
    await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/product/etag-hdrcheck-withinttl-product", ETAG_OPTS);

    expect(capturedHeaders[0]?.["If-None-Match"]).toBeUndefined();
    expect(capturedHeaders[1]?.["If-None-Match"]).toBe(entityEtag);
  });

  it("falls back to cached entity when the conditional request fails within TTL", async () => {
    // Network error on the conditional request → cached entity must be served
    // instead of falling back to the generic SEO template.
    const imageUrl = "https://cdn.etag-test/product-etag-304-errf-withinttl-unique.png";
    const entityEtag = '"etag-errf-within-ttl-v1"';
    let entityFetchCount = 0;

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/woo/product")) {
        entityFetchCount++;
        const h = (init?.headers ?? {}) as Record<string, string>;
        if (h["If-None-Match"] === entityEtag) {
          // Conditional request within TTL fails.
          throw new Error("ETIMEDOUT");
        }
        return {
          ok: true,
          status: 200,
          headers: makeFakeHeaders({ etag: entityEtag }),
          json: async () => ({
            ok: true,
            product: {
              name: "Fallback Product",
              description: "Should be served from cache on conditional error.",
              image: { uri: imageUrl },
              priceValue: 70,
            },
          }),
        };
      }
      return { ok: true, status: 206, arrayBuffer: async () => makePngBuffer(800, 600) };
    });
    vi.stubGlobal("fetch", fetchMock);

    // First call: entity cached.
    await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/product/etag-errf-withinttl-product", ETAG_OPTS);

    // Second call within TTL: conditional request fails → should still serve
    // the cached entity (not the generic fallback).
    const out = await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/product/etag-errf-withinttl-product", ETAG_OPTS);
    expect(out).toContain("<title>Fallback Product | Presentail</title>");
    expect(entityFetchCount).toBe(2); // conditional attempt was made
  });
});

describe("ETag conditional requests — 200 branch (dims evicted on entity change)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("evicts and re-fetches dims when upstream returns 200 on a conditional request within TTL", async () => {
    const pngBuf = makePngBuffer(1200, 630);
    const imageUrl = "https://cdn.etag-test/product-etag-200-withinttl-unique.png";
    const entityEtag = '"etag-v1-within-ttl-200-changed"';
    const entityEtagV2 = '"etag-v2-within-ttl-200-changed"';
    let entityFetchCount = 0;
    let dimsFetchCount = 0;

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/woo/product")) {
        entityFetchCount++;
        const ifNoneMatch = (init?.headers as Record<string, string> | undefined)?.["If-None-Match"];
        // Second request carries the old ETag → server says content changed (200).
        const responseEtag = ifNoneMatch === entityEtag ? entityEtagV2 : entityEtag;
        return {
          ok: true,
          status: 200,
          headers: makeFakeHeaders({ etag: responseEtag }),
          json: async () => ({
            ok: true,
            product: {
              name: "ETag 200 Changed Within TTL",
              description: "Entity changed, dims must be re-fetched.",
              image: { uri: imageUrl },
              priceValue: 85,
            },
          }),
        };
      }
      dimsFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => pngBuf };
    });
    vi.stubGlobal("fetch", fetchMock);

    // First call: entity + dims fetched.
    await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/product/etag-200-withinttl-product", ETAG_OPTS);
    expect(entityFetchCount).toBe(1);
    expect(dimsFetchCount).toBe(1);

    // Second call within TTL: conditional request → upstream returns 200 (entity
    // changed) → dims must be evicted and re-fetched immediately.
    await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/product/etag-200-withinttl-product", ETAG_OPTS);
    expect(entityFetchCount).toBe(2);
    expect(dimsFetchCount).toBe(2); // dims re-probed because entity changed
  });

  it("uses Last-Modified for conditional request within TTL when no ETag is present", async () => {
    const pngBuf = makePngBuffer(640, 480);
    const imageUrl = "https://cdn.etag-test/product-lm-withinttl-unique.png";
    const lastModifiedValue = "Sat, 31 May 2026 10:00:00 GMT";
    const capturedHeaders: Array<Record<string, string>> = [];
    let entityFetchCount = 0;
    let dimsFetchCount = 0;

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/woo/product")) {
        entityFetchCount++;
        const h = (init?.headers ?? {}) as Record<string, string>;
        capturedHeaders.push({ ...h });
        const ifModifiedSince = h["If-Modified-Since"];
        if (ifModifiedSince === lastModifiedValue) {
          return { ok: false, status: 304, headers: makeFakeHeaders({}) };
        }
        return {
          ok: true,
          status: 200,
          headers: makeFakeHeaders({ "last-modified": lastModifiedValue }),
          json: async () => ({
            ok: true,
            product: {
              name: "LM Within TTL Product",
              description: "Last-Modified within-TTL test.",
              image: { uri: imageUrl },
              priceValue: 60,
            },
          }),
        };
      }
      dimsFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => pngBuf };
    });
    vi.stubGlobal("fetch", fetchMock);

    // First call: entity fetched, Last-Modified stored.
    await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/product/lm-withinttl-product", ETAG_OPTS);
    expect(entityFetchCount).toBe(1);
    expect(dimsFetchCount).toBe(1);
    expect(capturedHeaders[0]?.["If-Modified-Since"]).toBeUndefined();

    // Second call within TTL: If-Modified-Since sent; 304 returned; dims NOT re-fetched.
    await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/product/lm-withinttl-product", ETAG_OPTS);
    expect(entityFetchCount).toBe(2);
    expect(capturedHeaders[1]?.["If-Modified-Since"]).toBe(lastModifiedValue);
    expect(dimsFetchCount).toBe(1); // 304 → no dims eviction
  });
});

// ---------------------------------------------------------------------------
// Image dims L2 cache — initImageDimsDb adapter tests
//
// These tests inject a mock L2 adapter and verify that:
//   1. An L2 hit is returned on L1 miss (no network image fetch).
//   2. A fresh fetch is stored in L2 via adapter.set().
//   3. An L2 null entry (no parseable dims) is returned without a network fetch.
//   4. evictImageDims (triggered by entity cache miss) does NOT call adapter.del()
//      because L2 staleness is handled by its 24 h TTL.
//   5. L2 errors are non-fatal — the fetch still proceeds normally.
//
// Each test uses a URL unique to its scenario to avoid L1 cache cross-talk.
// initImageDimsDb(null) is called in afterEach to restore the default (L1-only)
// mode for all other tests in this file.
// ---------------------------------------------------------------------------

function makePngBufferSimple(w: number, h: number): ArrayBuffer {
  const b = new Uint8Array(24);
  b[0] = 0x89; b[1] = 0x50; b[2] = 0x4e; b[3] = 0x47; // PNG sig
  b[16] = (w >> 24) & 0xff; b[17] = (w >> 16) & 0xff;
  b[18] = (w >> 8) & 0xff; b[19] = w & 0xff;
  b[20] = (h >> 24) & 0xff; b[21] = (h >> 16) & 0xff;
  b[22] = (h >> 8) & 0xff; b[23] = h & 0xff;
  return b.buffer;
}

const L2_HTML = `<!doctype html><html lang="en"><head><title>Old</title></head><body></body></html>`;
const L2_OPTS = {
  apiBaseUrl: "https://api.l2-test",
  origin: "https://presentail.l2-test",
  basePath: "",
};

describe("image dims L2 cache — initImageDimsDb adapter", () => {
  afterEach(() => {
    initImageDimsDb(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("serves dims from L2 on L1 miss without a network image fetch", async () => {
    const imageUrl = "https://cdn.l2-test/l2-hit-unique.png";
    const l2Store: Map<string, { width: number; height: number } | null> = new Map();
    l2Store.set(imageUrl, { width: 1200, height: 630 });

    initImageDimsDb({
      async get(url: string) { return l2Store.get(url); },
      async set(_url: string, _dims: unknown) {},
      async del(_url: string) {},
    });

    let imageFetchCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/woo/product")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "L2 Hit Product",
              description: "Dims from L2.",
              image: { uri: imageUrl },
              priceValue: 70,
            },
          }),
        };
      }
      // Any fetch to the image CDN should NOT happen (L2 hit).
      imageFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => makePngBufferSimple(999, 999) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await injectSeoTagsAsync(
      L2_HTML,
      "/en-ae/dubai/product/l2-hit-product",
      L2_OPTS,
    );

    expect(imageFetchCount).toBe(0);
    expect(out).toContain('<meta property="og:image:width" content="1200"');
    expect(out).toContain('<meta property="og:image:height" content="630"');
  });

  it("writes freshly fetched dims to L2 via adapter.set()", async () => {
    const imageUrl = "https://cdn.l2-test/l2-write-unique.png";
    const l2Writes: Array<{ url: string; dims: unknown }> = [];

    initImageDimsDb({
      async get(_url: string) { return undefined; }, // always miss
      async set(url: string, dims: unknown) { l2Writes.push({ url, dims }); },
      async del(_url: string) {},
    });

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/woo/product")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "L2 Write Product",
              description: "Dims written to L2.",
              image: { uri: imageUrl },
              priceValue: 55,
            },
          }),
        };
      }
      return { ok: true, status: 206, arrayBuffer: async () => makePngBufferSimple(800, 600) };
    });
    vi.stubGlobal("fetch", fetchMock);

    await injectSeoTagsAsync(
      L2_HTML,
      "/en-ae/dubai/product/l2-write-product",
      L2_OPTS,
    );

    expect(l2Writes).toHaveLength(1);
    expect(l2Writes[0].url).toBe(imageUrl);
    expect(l2Writes[0].dims).toEqual({ width: 800, height: 600 });
  });

  it("serves a null entry from L2 (cached no-dims) without a network image fetch", async () => {
    const imageUrl = "https://cdn.l2-test/l2-null-unique.png";
    const l2Store: Map<string, null> = new Map();
    l2Store.set(imageUrl, null);

    initImageDimsDb({
      async get(url: string) { return l2Store.get(url) === undefined ? undefined : l2Store.get(url); },
      async set(_url: string, _dims: unknown) {},
      async del(_url: string) {},
    });

    let imageFetchCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/woo/product")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "L2 Null Product",
              description: "No dims in L2.",
              image: { uri: imageUrl },
              priceValue: 40,
            },
          }),
        };
      }
      imageFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => makePngBufferSimple(700, 500) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await injectSeoTagsAsync(
      L2_HTML,
      "/en-ae/dubai/product/l2-null-product",
      L2_OPTS,
    );

    // L2 returned null (no parseable dims) → no image fetch, no width/height tags.
    expect(imageFetchCount).toBe(0);
    expect(out).not.toContain('property="og:image:width"');
    expect(out).not.toContain('property="og:image:height"');
  });

  it("evictImageDims (entity cache miss) does NOT call adapter.del() — L2 preserves dims", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const imageUrl = "https://cdn.l2-test/l2-preservation-unique.png";
    const l2Dels: string[] = [];

    initImageDimsDb({
      async get(_url: string) { return undefined; },
      async set(_url: string, _dims: unknown) {},
      async del(url: string) { l2Dels.push(url); },
    });

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/woo/product")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "L2 Preservation Product",
              description: "Eviction test.",
              image: { uri: imageUrl },
              priceValue: 60,
            },
          }),
        };
      }
      return { ok: true, status: 206, arrayBuffer: async () => makePngBufferSimple(1200, 628) };
    });
    vi.stubGlobal("fetch", fetchMock);

    // First call: entity freshly fetched → evictImageDims called (only clears L1).
    await injectSeoTagsAsync(L2_HTML, "/en-ae/dubai/product/l2-preservation-product", L2_OPTS);
    expect(l2Dels).not.toContain(imageUrl);

    // Advance past entity TTL so the entity cache expires.
    vi.setSystemTime(new Date(Date.now() + 61_000));

    // Second call: entity cache miss → fresh entity fetch → evictImageDims called again.
    await injectSeoTagsAsync(L2_HTML, "/en-ae/dubai/product/l2-preservation-product", L2_OPTS);
    expect(l2Dels).toHaveLength(0);

    vi.useRealTimers();
  });

  it("Restart simulation: L1 cold + L2 warm → no CDN fetch", async () => {
    const imageUrl = "https://cdn.l2-test/l2-restart-unique.png";
    const l2Store = new Map();
    l2Store.set(imageUrl, { width: 500, height: 500 });

    initImageDimsDb({
      async get(url: string) { return l2Store.get(url); },
      async set(_url: string, _dims: unknown) {},
      async del(_url: string) {},
    });

    let imageFetchCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/woo/product")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "Restart Product",
              description: "Cold start test.",
              image: { uri: imageUrl },
              priceValue: 50,
            },
          }),
        };
      }
      imageFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => makePngBufferSimple(1, 1) };
    });
    vi.stubGlobal("fetch", fetchMock);

    // Requesting a product with a known image URL after a "restart" (L1 empty).
    const out = await injectSeoTagsAsync(L2_HTML, "/en-ae/dubai/product/l2-restart", L2_OPTS);
    expect(imageFetchCount).toBe(0);
    expect(out).toContain('content="500"');
  });

  it("continues normally when the L2 adapter throws on get()", async () => {
    const imageUrl = "https://cdn.l2-test/l2-error-unique.png";

    initImageDimsDb({
      async get(_url: string) { throw new Error("DB connection refused"); },
      async set(_url: string, _dims: unknown) {},
      async del(_url: string) {},
    });

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/woo/product")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "L2 Error Product",
              description: "L2 throws but fetch continues.",
              image: { uri: imageUrl },
              priceValue: 50,
            },
          }),
        };
      }
      return { ok: true, status: 206, arrayBuffer: async () => makePngBufferSimple(640, 480) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await injectSeoTagsAsync(
      L2_HTML,
      "/en-ae/dubai/product/l2-error-product",
      L2_OPTS,
    );

    // Despite L2 throwing, the network fetch still ran and dims are present.
    expect(out).toContain('<meta property="og:image:width" content="640"');
    expect(out).toContain('<meta property="og:image:height" content="480"');
  });

  it("populates L1 from L2 hit so a second call is served without L2 round-trip", async () => {
    const imageUrl = "https://cdn.l2-test/l2-warm-l1-unique.png";
    let l2GetCount = 0;

    initImageDimsDb({
      async get(_url: string) {
        l2GetCount++;
        return { width: 400, height: 300 };
      },
      async set(_url: string, _dims: unknown) {},
      async del(_url: string) {},
    });

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/woo/product")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "L2 Warm L1 Product",
              description: "L1 warmed from L2.",
              image: { uri: imageUrl },
              priceValue: 65,
            },
          }),
        };
      }
      return { ok: true, status: 206, arrayBuffer: async () => makePngBufferSimple(400, 300) };
    });
    vi.stubGlobal("fetch", fetchMock);

    // First call: L1 miss → L2 hit → L1 warmed.
    await injectSeoTagsAsync(L2_HTML, "/en-ae/dubai/product/l2-warm-l1-product", L2_OPTS);
    expect(l2GetCount).toBe(1);

    // Second call: L1 is now warm → L2 not consulted.
    await injectSeoTagsAsync(L2_HTML, "/en-ae/dubai/product/l2-warm-l1-product", L2_OPTS);
    expect(l2GetCount).toBe(1); // still 1 — L1 served the second request
  });
});
