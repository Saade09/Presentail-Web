import { describe, it, expect } from "vitest";
import { isOsStorageUrl, buildOsProxyUrl, buildOsImageSrcset } from "./imageUtils";

// ---------------------------------------------------------------------------
// isOsStorageUrl
// ---------------------------------------------------------------------------

describe("isOsStorageUrl", () => {
  it("returns true for an os.presentail.com public-object URL", () => {
    expect(isOsStorageUrl("https://os.presentail.com/api/storage/public-objects/img.jpg")).toBe(true);
  });

  it("returns true for a URL with a deep /api/storage/ path", () => {
    expect(isOsStorageUrl("https://os.presentail.com/api/storage/public-objects/products/bouquet.webp")).toBe(true);
  });

  it("returns false for a different host with /api/storage/ path", () => {
    expect(isOsStorageUrl("https://example.com/api/storage/img.jpg")).toBe(false);
  });

  it("returns false for os.presentail.com without /api/storage/ prefix", () => {
    expect(isOsStorageUrl("https://os.presentail.com/api/products/1")).toBe(false);
  });

  it("returns false for a relative catalog proxy URL", () => {
    expect(isOsStorageUrl("/api/catalog/occasion-image/birthday")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isOsStorageUrl("")).toBe(false);
  });

  it("returns false for a malformed non-URL string", () => {
    expect(isOsStorageUrl("not-a-url")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildOsProxyUrl
// ---------------------------------------------------------------------------

describe("buildOsProxyUrl", () => {
  it("returns a /api/img/proxy URL for a valid OS storage URL", () => {
    const result = buildOsProxyUrl("https://os.presentail.com/api/storage/public-objects/img.jpg", 800);
    expect(result).toBe(
      "/api/img/proxy?url=https%3A%2F%2Fos.presentail.com%2Fapi%2Fstorage%2Fpublic-objects%2Fimg.jpg&w=800&f=webp",
    );
  });

  it("uses the jpeg format when specified", () => {
    const result = buildOsProxyUrl("https://os.presentail.com/api/storage/public-objects/img.jpg", 400, "jpeg");
    expect(result).toContain("f=jpeg");
  });

  it("passes the url through unchanged for a non-OS URL", () => {
    const url = "https://example.com/img.jpg";
    expect(buildOsProxyUrl(url, 800)).toBe(url);
  });

  it("canonicalizes and nests special characters exactly once", () => {
    const raw = "https://os.presentail.com/api/storage/public-objects/products/ورد + 50% & more.png?label=a+b&next=x%26y";
    const proxied = buildOsProxyUrl(raw, 800);
    const nested = new URL(proxied, "https://presentail.com").searchParams.get("url");
    expect(nested).toBe(new URL(raw.replace("% ", "%25 ")).toString());
    expect(new URL(nested!).searchParams.get("label")).toBe("a b");
    expect(new URL(nested!).searchParams.get("next")).toBe("x&y");
  });

  it("rejects HTTP and credentialed OS URLs", () => {
    const http = "http://os.presentail.com/api/storage/public-objects/a.png";
    const credentialed = "https://user:pass@os.presentail.com/api/storage/public-objects/a.png";
    expect(buildOsProxyUrl(http, 800)).toBe(http);
    expect(buildOsProxyUrl(credentialed, 800)).toBe(credentialed);
  });

  it("does not proxy non-public OS storage paths", () => {
    const privatePath = "https://os.presentail.com/api/storage/private/customer-file.png";
    expect(buildOsProxyUrl(privatePath, 800)).toBe(privatePath);
  });
});

// ---------------------------------------------------------------------------
// buildOsImageSrcset
// ---------------------------------------------------------------------------

const OS_URL = "https://os.presentail.com/api/storage/public-objects/products/bouquet.webp";

describe("buildOsImageSrcset", () => {
  it("returns null for a non-OS-storage URL", () => {
    expect(buildOsImageSrcset("https://example.com/img.jpg")).toBeNull();
  });

  it("returns null for a relative catalog proxy URL", () => {
    expect(buildOsImageSrcset("/api/catalog/occasion-image/birthday")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(buildOsImageSrcset("")).toBeNull();
  });

  it("returns a non-null result for a valid OS storage URL", () => {
    expect(buildOsImageSrcset(OS_URL)).not.toBeNull();
  });

  it("srcset contains entries for 400w, 800w, and 1200w", () => {
    const result = buildOsImageSrcset(OS_URL)!;
    expect(result.srcset).toContain("400w");
    expect(result.srcset).toContain("800w");
    expect(result.srcset).toContain("1200w");
  });

  it("srcset has exactly three entries", () => {
    const result = buildOsImageSrcset(OS_URL)!;
    expect(result.srcset.split(", ")).toHaveLength(3);
  });

  it("each srcset entry points to /api/img/proxy with the correct width", () => {
    const result = buildOsImageSrcset(OS_URL)!;
    const entries = result.srcset.split(", ");
    expect(entries[0]).toContain("/api/img/proxy");
    expect(entries[0]).toContain("w=400");
    expect(entries[0]).toMatch(/\s400w$/);
    expect(entries[1]).toContain("w=800");
    expect(entries[1]).toMatch(/\s800w$/);
    expect(entries[2]).toContain("w=1200");
    expect(entries[2]).toMatch(/\s1200w$/);
  });

  it("all srcset entries encode the original URL as a query parameter", () => {
    const result = buildOsImageSrcset(OS_URL)!;
    for (const entry of result.srcset.split(", ")) {
      expect(entry).toContain(encodeURIComponent(OS_URL));
    }
  });

  it("src is the 800w proxy URL", () => {
    const result = buildOsImageSrcset(OS_URL)!;
    expect(result.src).toContain("/api/img/proxy");
    expect(result.src).toContain("w=800");
    expect(result.src).toContain(encodeURIComponent(OS_URL));
  });

  it("uses the default sizes hint when no argument is provided", () => {
    const result = buildOsImageSrcset(OS_URL)!;
    expect(result.sizes).toBe("(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 800px");
  });

  it("uses the caller-supplied sizes override", () => {
    const customSizes = "(max-width: 768px) 25vw, 600px";
    const result = buildOsImageSrcset(OS_URL, customSizes)!;
    expect(result.sizes).toBe(customSizes);
  });

  it("produces the exact srcset string for a known URL", () => {
    const url = "https://os.presentail.com/api/storage/public-objects/test.jpg";
    const encoded = encodeURIComponent(url);
    const result = buildOsImageSrcset(url)!;
    expect(result.srcset).toBe(
      `/api/img/proxy?url=${encoded}&w=400&f=webp 400w, ` +
        `/api/img/proxy?url=${encoded}&w=800&f=webp 800w, ` +
        `/api/img/proxy?url=${encoded}&w=1200&f=webp 1200w`,
    );
  });
});
