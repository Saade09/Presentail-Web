import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const generatorScript = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "scripts",
  "generate-blog-hero-variants.mjs",
);

let tmpRoot: string;
let blogDir: string;

/** Create a solid-colour WebP original `<slug>.webp` of the given pixel width. */
async function writeOriginal(slug: string, width: number, height = Math.round(width * 0.5)) {
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 120, b: 80 },
    },
  })
    .webp({ quality: 80 })
    .toFile(path.join(blogDir, `${slug}.webp`));
}

/** Run the generator against the temp public dir. */
function runGenerator() {
  execFileSync("node", [generatorScript, tmpRoot], { stdio: "pipe" });
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "blog-hero-gen-"));
  blogDir = path.join(tmpRoot, "blog");
  fs.mkdirSync(blogDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("generate-blog-hero-variants.mjs", () => {
  it("emits 480w and 768w WebP variants at exactly the right widths", async () => {
    await writeOriginal("spring", 1200);

    runGenerator();

    for (const width of [480, 768]) {
      const variant = path.join(blogDir, `spring-${width}.webp`);
      expect(fs.existsSync(variant), `${width}w variant should exist`).toBe(true);

      const meta = await sharp(variant).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.width).toBe(width);
    }
  });

  it("is idempotent — a second run regenerates nothing", async () => {
    await writeOriginal("spring", 1200);

    runGenerator();

    const variants = [
      path.join(blogDir, "spring-480.webp"),
      path.join(blogDir, "spring-768.webp"),
    ];
    const firstMtimes = variants.map((v) => fs.statSync(v).mtimeMs);

    // Ensure any regeneration would produce a strictly newer mtime.
    await new Promise((resolve) => setTimeout(resolve, 20));

    runGenerator();

    const secondMtimes = variants.map((v) => fs.statSync(v).mtimeMs);
    expect(secondMtimes).toEqual(firstMtimes);
  });

  it("never upscales — widths >= the original's intrinsic width are skipped", async () => {
    // 600px original: 480 is smaller (generated), 768 is larger (skipped).
    await writeOriginal("small-hero", 600);

    runGenerator();

    const v480 = path.join(blogDir, "small-hero-480.webp");
    const v768 = path.join(blogDir, "small-hero-768.webp");

    expect(fs.existsSync(v480), "480w variant should be generated").toBe(true);
    expect(fs.existsSync(v768), "768w variant should be skipped (no upscaling)").toBe(false);

    const meta = await sharp(v480).metadata();
    expect(meta.width).toBe(480);
  });
});
