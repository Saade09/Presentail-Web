import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// @ts-expect-error - mjs module without type declarations.
import { collectSidecars } from "../../sidecar-cache.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTree(root: string, files: string[]): void {
  for (const rel of files) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, "");
  }
}

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sidecar-test-"));
}

function rmTmpDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// collectSidecars — discovery
// ---------------------------------------------------------------------------

describe("collectSidecars — discovery", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { rmTmpDir(tmpDir); });

  it("collects .br and .gz files and nothing else", () => {
    createTree(tmpDir, [
      "assets/index-abc.js",
      "assets/index-abc.js.br",
      "assets/index-abc.js.gz",
      "assets/vendor-xyz.css",
      "assets/vendor-xyz.css.br",
      "assets/vendor-xyz.css.gz",
      "index.html",
    ]);

    const out = new Set<string>();
    collectSidecars(tmpDir, [".br", ".gz"], out);

    expect(out.size).toBe(4);

    expect(out.has(path.join(tmpDir, "assets/index-abc.js.br"))).toBe(true);
    expect(out.has(path.join(tmpDir, "assets/index-abc.js.gz"))).toBe(true);
    expect(out.has(path.join(tmpDir, "assets/vendor-xyz.css.br"))).toBe(true);
    expect(out.has(path.join(tmpDir, "assets/vendor-xyz.css.gz"))).toBe(true);

    expect(out.has(path.join(tmpDir, "assets/index-abc.js"))).toBe(false);
    expect(out.has(path.join(tmpDir, "assets/vendor-xyz.css"))).toBe(false);
    expect(out.has(path.join(tmpDir, "index.html"))).toBe(false);
  });

  it("recurses into nested sub-directories", () => {
    createTree(tmpDir, [
      "a/b/c/deep.js.br",
      "a/b/c/deep.js",
      "top.js.gz",
    ]);

    const out = new Set<string>();
    collectSidecars(tmpDir, [".br", ".gz"], out);

    expect(out.size).toBe(2);
    expect(out.has(path.join(tmpDir, "a/b/c/deep.js.br"))).toBe(true);
    expect(out.has(path.join(tmpDir, "top.js.gz"))).toBe(true);
    expect(out.has(path.join(tmpDir, "a/b/c/deep.js"))).toBe(false);
  });

  it("collects nothing when no sidecars exist", () => {
    createTree(tmpDir, ["assets/app.js", "assets/app.css", "index.html"]);

    const out = new Set<string>();
    collectSidecars(tmpDir, [".br", ".gz"], out);

    expect(out.size).toBe(0);
  });

  it("only collects the requested suffixes when others are present", () => {
    createTree(tmpDir, [
      "app.js.br",
      "app.js.zst",
      "app.js",
    ]);

    const out = new Set<string>();
    collectSidecars(tmpDir, [".br"], out);

    expect(out.size).toBe(1);
    expect(out.has(path.join(tmpDir, "app.js.br"))).toBe(true);
    expect(out.has(path.join(tmpDir, "app.js.zst"))).toBe(false);
  });

  it("returns silently when the directory does not exist", () => {
    const nonExistent = path.join(tmpDir, "no-such-dir");
    const out = new Set<string>();
    expect(() => collectSidecars(nonExistent, [".br", ".gz"], out)).not.toThrow();
    expect(out.size).toBe(0);
  });

  it("accumulates into a pre-populated Set without clearing existing entries", () => {
    createTree(tmpDir, ["new.js.br"]);

    const out = new Set<string>(["pre-existing-value"]);
    collectSidecars(tmpDir, [".br", ".gz"], out);

    expect(out.has("pre-existing-value")).toBe(true);
    expect(out.has(path.join(tmpDir, "new.js.br"))).toBe(true);
    expect(out.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// SIDECAR_PATHS.has() — sidecar lookup simulation
// ---------------------------------------------------------------------------
// These tests replicate the exact lookup pattern used in serve.mjs so a
// refactor that breaks the has() call is immediately caught.

describe("SIDECAR_PATHS lookup simulation", () => {
  let tmpDir: string;
  let sidecars: Set<string>;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    createTree(tmpDir, [
      "assets/index-abc.js",
      "assets/index-abc.js.br",
      "assets/index-abc.js.gz",
      "assets/no-sidecar.js",
    ]);
    sidecars = new Set<string>();
    collectSidecars(tmpDir, [".br", ".gz"], sidecars);
  });

  afterEach(() => { rmTmpDir(tmpDir); });

  it("returns true for br sidecar when the file exists", () => {
    const filePath = path.join(tmpDir, "assets/index-abc.js");
    expect(sidecars.has(filePath + ".br")).toBe(true);
  });

  it("returns true for gz sidecar when the file exists", () => {
    const filePath = path.join(tmpDir, "assets/index-abc.js");
    expect(sidecars.has(filePath + ".gz")).toBe(true);
  });

  it("returns false for br sidecar when the file does not exist", () => {
    const filePath = path.join(tmpDir, "assets/no-sidecar.js");
    expect(sidecars.has(filePath + ".br")).toBe(false);
  });

  it("returns false for gz sidecar when the file does not exist", () => {
    const filePath = path.join(tmpDir, "assets/no-sidecar.js");
    expect(sidecars.has(filePath + ".gz")).toBe(false);
  });

  it("prefer-br logic: picks br sidecar when both br and gz exist and br is accepted", () => {
    const filePath = path.join(tmpDir, "assets/index-abc.js");
    const acceptHeader = "br, gzip, deflate";

    let sidecarPath: string | null = null;
    let sidecarEncoding: string | null = null;
    if (acceptHeader.includes("br") && sidecars.has(filePath + ".br")) {
      sidecarPath = filePath + ".br";
      sidecarEncoding = "br";
    } else if (acceptHeader.includes("gzip") && sidecars.has(filePath + ".gz")) {
      sidecarPath = filePath + ".gz";
      sidecarEncoding = "gzip";
    }

    expect(sidecarPath).toBe(filePath + ".br");
    expect(sidecarEncoding).toBe("br");
  });

  it("prefer-br logic: falls back to gz when only gzip is accepted", () => {
    const filePath = path.join(tmpDir, "assets/index-abc.js");
    const acceptHeader = "gzip, deflate";

    let sidecarPath: string | null = null;
    let sidecarEncoding: string | null = null;
    if (acceptHeader.includes("br") && sidecars.has(filePath + ".br")) {
      sidecarPath = filePath + ".br";
      sidecarEncoding = "br";
    } else if (acceptHeader.includes("gzip") && sidecars.has(filePath + ".gz")) {
      sidecarPath = filePath + ".gz";
      sidecarEncoding = "gzip";
    }

    expect(sidecarPath).toBe(filePath + ".gz");
    expect(sidecarEncoding).toBe("gzip");
  });

  it("prefer-br logic: returns null when no accepted encoding has a sidecar", () => {
    const filePath = path.join(tmpDir, "assets/no-sidecar.js");
    const acceptHeader = "br, gzip, deflate";

    let sidecarPath: string | null = null;
    let sidecarEncoding: string | null = null;
    if (acceptHeader.includes("br") && sidecars.has(filePath + ".br")) {
      sidecarPath = filePath + ".br";
      sidecarEncoding = "br";
    } else if (acceptHeader.includes("gzip") && sidecars.has(filePath + ".gz")) {
      sidecarPath = filePath + ".gz";
      sidecarEncoding = "gzip";
    }

    expect(sidecarPath).toBeNull();
    expect(sidecarEncoding).toBeNull();
  });
});
