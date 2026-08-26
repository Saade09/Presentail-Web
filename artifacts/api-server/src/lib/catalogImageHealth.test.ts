import { beforeEach, describe, expect, it, vi } from "vitest";

const { getOsProductsMock, transformImageMock, fetchMock } = vi.hoisted(() => ({
  getOsProductsMock: vi.fn(),
  transformImageMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("./osProductsCache", () => ({
  getOsProducts: getOsProductsMock,
}));

vi.mock("./imageTransform", () => ({
  transformImage: transformImageMock,
}));

vi.mock("./alerts", () => ({
  sendAlert: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));

function product(id: string, url?: string) {
  return {
    id,
    images: url ? [{ url }] : [],
  };
}

function imageUrl(name: string): string {
  return `https://os.presentail.com/api/storage/public-objects/products/${name}.png`;
}

describe("runCatalogImageHealthCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    getOsProductsMock.mockReturnValue([
      product("missing-reference"),
      product("private-url", "https://os.presentail.com/api/storage/private/customer.png"),
      product("healthy", imageUrl("healthy")),
      product("missing", imageUrl("missing")),
      product("html", imageUrl("html")),
      product("empty", imageUrl("empty")),
      product("large", imageUrl("large")),
      product("corrupt", imageUrl("corrupt")),
    ]);
    fetchMock.mockImplementation(async (raw: string) => {
      const pathname = new URL(raw).pathname;
      if (pathname.endsWith("/missing.png")) return new Response(null, { status: 404 });
      if (pathname.endsWith("/html.png")) {
        return new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } });
      }
      if (pathname.endsWith("/empty.png")) {
        return new Response(null, { status: 200, headers: { "content-type": "image/png" } });
      }
      if (pathname.endsWith("/large.png")) {
        return new Response("small", {
          status: 200,
          headers: { "content-type": "image/png", "content-length": String(13 * 1024 * 1024) },
        });
      }
      return new Response(Buffer.from(pathname.endsWith("/corrupt.png") ? "corrupt" : "valid"), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    });
    transformImageMock.mockImplementation(async (body: Buffer) => {
      if (body.toString() === "corrupt") throw new Error("unsupported image");
      return { data: Buffer.from("webp"), contentType: "image/webp" };
    });
  });

  it("detects bad references, source failures, body violations, and transform corruption", async () => {
    const { runCatalogImageHealthCheck } = await import("./catalogImageHealth");
    const summary = await runCatalogImageHealthCheck(20);
    expect(summary.productsConsidered).toBe(8);
    expect(summary.uniqueImagesChecked).toBe(7);
    expect(summary.healthy).toBe(1);
    expect(summary.failing).toBe(7);
    expect(Object.fromEntries(summary.findings.map((finding) => [finding.productId, finding.kind]))).toEqual({
      "missing-reference": "missing-reference",
      "private-url": "invalid-url",
      missing: "missing",
      html: "non-image",
      empty: "empty",
      large: "oversized",
      corrupt: "corrupt",
    });
    expect(transformImageMock).toHaveBeenCalledTimes(2);
  });
});