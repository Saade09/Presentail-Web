import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// @ts-expect-error - mjs module without type declarations.
import { compressAssets } from "../../compress-assets.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "compress-assets-test-"));
}

function rmTmpDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Write a realistic-sized text file so brotli/gzip produce non-trivial output.
 * A single-byte file would compress to something, but we want to be sure the
 * compression actually ran and the output is non-empty.
 */
function writeAsset(dir: string, name: string): string {
  const filePath = path.join(dir, name);
  const content = `/* synthetic asset: ${name} */\n${"x".repeat(512)}\n`;
  fs.writeFileSync(filePath, content);
  return filePath;
}

// ---------------------------------------------------------------------------
// compressAssets — happy path
// ---------------------------------------------------------------------------

describe("compressAssets — happy path", () => {
  let tmpDir: string;
  let assetsDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    assetsDir = path.join(tmpDir, "dist", "public", "assets");
    fs.mkdirSync(assetsDir, { recursive: true });
  });

  afterEach(() => {
    rmTmpDir(tmpDir);
  });

  it("produces .br and .gz sidecars for every .js file", async () => {
    const filePath = writeAsset(assetsDir, "index-abc123.js");

    await compressAssets(assetsDir);

    expect(fs.existsSync(filePath + ".br")).toBe(true);
    expect(fs.existsSync(filePath + ".gz")).toBe(true);
  });

  it("produces .br and .gz sidecars for every .css file", async () => {
    const filePath = writeAsset(assetsDir, "vendor-xyz.css");

    await compressAssets(assetsDir);

    expect(fs.existsSync(filePath + ".br")).toBe(true);
    expect(fs.existsSync(filePath + ".gz")).toBe(true);
  });

  it("sidecar files have non-zero sizes", async () => {
    const filePath = writeAsset(assetsDir, "app-deadbeef.js");

    await compressAssets(assetsDir);

    const brStat = fs.statSync(filePath + ".br");
    const gzStat = fs.statSync(filePath + ".gz");
    expect(brStat.size).toBeGreaterThan(0);
    expect(gzStat.size).toBeGreaterThan(0);
  });

  it("returns result objects with positive brSize and gzSize", async () => {
    writeAsset(assetsDir, "chunk-aabbcc.js");
    writeAsset(assetsDir, "styles-ddeeff.css");

    const results = await compressAssets(assetsDir);

    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.brSize).toBeGreaterThan(0);
      expect(r.gzSize).toBeGreaterThan(0);
    }
  });

  it("handles multiple JS and CSS files in one pass", async () => {
    writeAsset(assetsDir, "main-001.js");
    writeAsset(assetsDir, "vendor-002.js");
    writeAsset(assetsDir, "theme-003.css");

    const results = await compressAssets(assetsDir);

    expect(results).toHaveLength(3);
    for (const { filePath } of results) {
      expect(fs.existsSync(filePath + ".br")).toBe(true);
      expect(fs.existsSync(filePath + ".gz")).toBe(true);
    }
  });

  it("does not produce sidecars for non-JS/CSS files", async () => {
    writeAsset(assetsDir, "app-aaa.js");
    const htmlPath = path.join(assetsDir, "index.html");
    fs.writeFileSync(htmlPath, "<html></html>");
    const mapPath = path.join(assetsDir, "app-aaa.js.map");
    fs.writeFileSync(mapPath, "{}");

    await compressAssets(assetsDir);

    expect(fs.existsSync(htmlPath + ".br")).toBe(false);
    expect(fs.existsSync(htmlPath + ".gz")).toBe(false);
    expect(fs.existsSync(mapPath + ".br")).toBe(false);
    expect(fs.existsSync(mapPath + ".gz")).toBe(false);
  });

  it("sidecar size is smaller than the original (compression is effective)", async () => {
    const filePath = writeAsset(assetsDir, "large-bundle.js");
    const origSize = fs.statSync(filePath).size;

    await compressAssets(assetsDir);

    const brSize = fs.statSync(filePath + ".br").size;
    const gzSize = fs.statSync(filePath + ".gz").size;
    expect(brSize).toBeLessThan(origSize);
    expect(gzSize).toBeLessThan(origSize);
  });
});

// ---------------------------------------------------------------------------
// compressAssets — failure cases (loud failures)
// ---------------------------------------------------------------------------

describe("compressAssets — failure cases", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmTmpDir(tmpDir);
  });

  it("throws when the assets directory does not exist", async () => {
    const missingDir = path.join(tmpDir, "does-not-exist", "assets");

    await expect(compressAssets(missingDir)).rejects.toThrow(
      /assets directory not found/
    );
  });

  it("throws when the assets directory exists but contains no JS or CSS files", async () => {
    const emptyDir = path.join(tmpDir, "empty-assets");
    fs.mkdirSync(emptyDir, { recursive: true });

    await expect(compressAssets(emptyDir)).rejects.toThrow(
      /no JS\/CSS assets found/
    );
  });

  it("throws when the assets directory contains only non-JS/CSS files", async () => {
    const assetsDir = path.join(tmpDir, "assets");
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(path.join(assetsDir, "index.html"), "<html></html>");
    fs.writeFileSync(path.join(assetsDir, "logo.svg"), "<svg></svg>");

    await expect(compressAssets(assetsDir)).rejects.toThrow(
      /no JS\/CSS assets found/
    );
  });
});
