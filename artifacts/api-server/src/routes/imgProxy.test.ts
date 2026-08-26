import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { transformImageMock, fetchMock } = vi.hoisted(() => ({
  transformImageMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("../lib/imageTransform", () => ({
  transformImage: transformImageMock,
  resolveWidth: (raw?: string) => {
    const n = Number.parseInt(raw ?? "", 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 1600) : 800;
  },
  resolveFormat: (raw?: string) => raw === "jpeg" ? "jpeg" : "webp",
}));

vi.mock("../lib/alerts", () => ({
  sendAlert: vi.fn().mockResolvedValue(undefined),
}));

const SOURCE = "https://os.presentail.com/api/storage/public-objects/products/318/main.png";

function imageResponse(body = "source-image", init: ResponseInit = {}): Response {
  return new Response(Buffer.from(body), {
    status: 200,
    headers: { "content-type": "image/png", ...(init.headers ?? {}) },
    ...init,
  });
}

async function buildApp() {
  const { default: router } = await import("./imgProxy");
  const app = express();
  app.use((req: any, _res, next) => {
    req.log = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
    next();
  });
  app.use("/api", router);
  return app;
}

describe("GET /api/img/proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubGlobal("fetch", fetchMock);
    transformImageMock.mockResolvedValue({
      data: Buffer.from("transformed"),
      contentType: "image/webp",
    });
    fetchMock.mockResolvedValue(imageResponse());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects missing, non-HTTPS, credentialed, and non-OS URLs before fetch", async () => {
    const app = await buildApp();
    const responses = await Promise.all([
      request(app).get("/api/img/proxy"),
      request(app).get("/api/img/proxy").query({ url: "http://os.presentail.com/api/storage/a.png" }),
      request(app).get("/api/img/proxy").query({ url: "https://user:pass@os.presentail.com/api/storage/a.png" }),
      request(app).get("/api/img/proxy").query({ url: "https://example.com/a.png" }),
      request(app).get("/api/img/proxy").query({ url: "https://os.presentail.com/api/storage/private/a.png" }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([400, 400, 400, 400, 400]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves spaces, Unicode, percent, plus, ampersand, and nested query parameters", async () => {
    const app = await buildApp();
    const source = "https://os.presentail.com/api/storage/public-objects/products/ورد + 50% & more.png?label=a+b&next=x%26y";
    const response = await request(app).get("/api/img/proxy").query({ url: source, w: "400", f: "webp" });
    expect(response.status).toBe(200);
    const fetched = new URL(String(fetchMock.mock.calls[0][0]));
    expect(fetched.hostname).toBe("os.presentail.com");
    expect(decodeURIComponent(fetched.pathname)).toContain("ورد + 50% & more.png");
    expect(fetched.searchParams.get("label")).toBe("a b");
    expect(fetched.searchParams.get("next")).toBe("x&y");
  });

  it("returns 404 without retrying a permanently missing source", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    const app = await buildApp();
    const response = await request(app).get("/api/img/proxy").query({ url: SOURCE });
    expect(response.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries one transient 503 and succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(imageResponse());
    const app = await buildApp();
    const response = await request(app).get("/api/img/proxy").query({ url: SOURCE });
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(transformImageMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry rate limits or permanent non-missing upstream failures", async () => {
    for (const [upstream, expected] of [[429, 503], [403, 502]] as const) {
      vi.resetModules();
      fetchMock.mockReset().mockResolvedValue(new Response(null, { status: upstream }));
      const app = await buildApp();
      const response = await request(app).get("/api/img/proxy").query({ url: `${SOURCE}?status=${upstream}` });
      expect(response.status).toBe(expected);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("returns 504 after one timeout retry", async () => {
    const timeout = new Error("request timed out");
    timeout.name = "AbortError";
    fetchMock.mockRejectedValue(timeout);
    const app = await buildApp();
    const response = await request(app).get("/api/img/proxy").query({ url: SOURCE });
    expect(response.status).toBe(504);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("distinguishes non-image, zero-byte, oversized, and corrupt sources", async () => {
    const cases: Array<{ response: Response; expected: number; corrupt?: boolean }> = [
      {
        response: new Response("html", { status: 200, headers: { "content-type": "text/html" } }),
        expected: 415,
      },
      {
        response: new Response(null, { status: 200, headers: { "content-type": "image/png" } }),
        expected: 422,
      },
      {
        response: imageResponse("tiny", { headers: { "content-type": "image/png", "content-length": String(13 * 1024 * 1024) } }),
        expected: 413,
      },
      {
        response: imageResponse(),
        expected: 422,
        corrupt: true,
      },
    ];

    for (const item of cases) {
      vi.resetModules();
      fetchMock.mockReset().mockResolvedValue(item.response);
      transformImageMock.mockReset();
      if (item.corrupt) transformImageMock.mockRejectedValue(new Error("Input buffer contains unsupported image format"));
      else transformImageMock.mockResolvedValue({ data: Buffer.from("transformed"), contentType: "image/webp" });
      const app = await buildApp();
      const response = await request(app).get("/api/img/proxy").query({ url: `${SOURCE}?case=${item.expected}` });
      expect(response.status).toBe(item.expected);
    }
  });

  it("coalesces a concurrent cold burst into one fetch and transform", async () => {
    let release: ((response: Response) => void) | undefined;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => {
      release = resolve;
    }));
    const app = await buildApp();
    const requests = Array.from({ length: 12 }, () =>
      request(app).get("/api/img/proxy").query({ url: SOURCE, w: "800", f: "webp" }),
    );
    const responsesPromise = Promise.all(requests);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    release?.(imageResponse());
    const responses = await responsesPromise;
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(transformImageMock).toHaveBeenCalledTimes(1);
    expect(responses.filter((response) => response.headers["x-cache"] === "COALESCED")).toHaveLength(11);
  });

  it("serves cache hits with finite public edge caching and ETag revalidation", async () => {
    const app = await buildApp();
    const first = await request(app).get("/api/img/proxy").query({ url: SOURCE });
    expect(first.status).toBe(200);
    expect(first.headers["x-cache"]).toBe("MISS");
    expect(first.headers["cache-control"]).toBe(
      "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
    );
    expect(first.headers.etag).toBeTruthy();

    const hit = await request(app).get("/api/img/proxy").query({ url: SOURCE });
    expect(hit.status).toBe(200);
    expect(hit.headers["x-cache"]).toBe("HIT");

    const notModified = await request(app)
      .get("/api/img/proxy")
      .query({ url: SOURCE })
      .set("If-None-Match", first.headers.etag);
    expect(notModified.status).toBe(304);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("expires process-cache entries so replaceable OS paths are refreshed", async () => {
    const { CACHE_TTL_MS } = await import("./imgProxy");
    const now = Date.now();
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now);
    fetchMock.mockImplementation(() => Promise.resolve(imageResponse()));
    const app = await buildApp();

    expect((await request(app).get("/api/img/proxy").query({ url: SOURCE })).headers["x-cache"]).toBe("MISS");
    expect((await request(app).get("/api/img/proxy").query({ url: SOURCE })).headers["x-cache"]).toBe("HIT");
    nowSpy.mockReturnValue(Number.MAX_SAFE_INTEGER);
    expect((await request(app).get("/api/img/proxy").query({ url: SOURCE })).headers["x-cache"]).toBe("MISS");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    nowSpy.mockRestore();
  });

  it("bounds distinct cold misses before upstream fetch and fails excess work fast", async () => {
    const { MAX_ACTIVE_LOADS, MAX_LOAD_WAITERS } = await import("./imgProxy");
    let releaseTransform: ((value: { data: Buffer; contentType: string }) => void) | undefined;
    const heldTransform = new Promise<{ data: Buffer; contentType: string }>((resolve) => {
      releaseTransform = resolve;
    });
    fetchMock.mockImplementation(() => Promise.resolve(imageResponse()));
    transformImageMock.mockReturnValue(heldTransform);
    const app = await buildApp();
    const total = MAX_ACTIVE_LOADS + MAX_LOAD_WAITERS + 1;
    const responsesPromise = Promise.all(
      Array.from({ length: total }, (_, index) =>
        request(app).get("/api/img/proxy").query({ url: `${SOURCE}?variant=${index}` }),
      ),
    );

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(MAX_ACTIVE_LOADS));
    releaseTransform?.({ data: Buffer.from("transformed"), contentType: "image/webp" });
    const responses = await responsesPromise;
    expect(responses.filter((response) => response.status === 503)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 200)).toHaveLength(total - 1);
    expect(fetchMock).toHaveBeenCalledTimes(total - 1);
  });
});