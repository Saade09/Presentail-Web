import { describe, it, expect } from "vitest";
import { buildSrcSet } from "./imageUtils";

describe("buildSrcSet", () => {
  it("emits variant widths first, then the original at its intrinsic width", () => {
    const result = buildSrcSet("/blog/post.webp", [480, 768], 1408);
    expect(result).toBe(
      "/blog/post-480.webp 480w, /blog/post-768.webp 768w, /blog/post.webp 1408w",
    );
  });

  it("keeps the original url unchanged as the largest descriptor", () => {
    const result = buildSrcSet("/blog/spring.webp", [768], 1408);
    expect(result).toBe("/blog/spring-768.webp 768w, /blog/spring.webp 1408w");
  });

  it("skips variant widths that are >= the intrinsic width (no upscaling)", () => {
    const result = buildSrcSet("/blog/post.webp", [480, 768, 1408, 2000], 1408);
    expect(result).toBe(
      "/blog/post-480.webp 480w, /blog/post-768.webp 768w, /blog/post.webp 1408w",
    );
  });

  it("returns only the original when no variant width is smaller", () => {
    const result = buildSrcSet("/blog/post.webp", [1600], 1408);
    expect(result).toBe("/blog/post.webp 1408w");
  });

  it("handles uppercase .WEBP extensions when deriving the base name", () => {
    const result = buildSrcSet("/blog/post.WEBP", [480], 1408);
    expect(result).toBe("/blog/post-480.webp 480w, /blog/post.WEBP 1408w");
  });
});
