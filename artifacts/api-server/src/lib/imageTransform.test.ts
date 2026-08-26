import { describe, expect, it } from "vitest";
import { MAX_INPUT_PIXELS, transformImage } from "./imageTransform";

describe("transformImage resource limits", () => {
  it("rejects a valid image whose decoded dimensions exceed the pixel budget", async () => {
    const width = 4_001;
    const height = 3_000;
    expect(width * height).toBeGreaterThan(MAX_INPUT_PIXELS);
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="red"/></svg>`,
    );
    await expect(
      transformImage(svg, { width: 800, format: "webp", quality: 82 }),
    ).rejects.toThrow(/pixel|limit|unsupported/i);
  });
});