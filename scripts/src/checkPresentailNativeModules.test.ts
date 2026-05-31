/**
 * Unit tests for checkPresentailNativeModules.ts.
 *
 * Covers the three exported helpers that are exercised on every CI run:
 *
 *   rootSpecifier        — pure function; resolves a module specifier to its
 *                          root package name (handles scoped packages, deep
 *                          sub-paths, and bare specifiers).
 *
 *   isNativeDir          — filesystem heuristic; returns true when a package
 *                          directory contains native iOS/Android code (detected
 *                          via expo-module.config.json, *.podspec, ios/, or
 *                          android/ sub-directories).
 *
 *   findOffendingImports — reads a source file and returns any top-level static
 *                          imports / requires of packages in the watched set.
 *                          Lazy imports (await import, indented require) must
 *                          NOT be flagged.
 *
 * All filesystem tests use temporary directories that are created fresh per
 * test suite and deleted in afterEach, so they never touch the real
 * artifacts/presentail/node_modules tree.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  rootSpecifier,
  isNativeDir,
  findOffendingImports,
} from "./checkPresentailNativeModules.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "native-modules-test-"));
}

function rmTmpDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Write a file, creating parent directories as needed. */
function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

// ---------------------------------------------------------------------------
// rootSpecifier — pure function
// ---------------------------------------------------------------------------

describe("rootSpecifier", () => {
  it("returns a plain package name unchanged", () => {
    expect(rootSpecifier("react-native")).toBe("react-native");
  });

  it("strips a deep sub-path from a plain package", () => {
    expect(rootSpecifier("react-native/Libraries/Components/Button")).toBe(
      "react-native",
    );
  });

  it("returns a scoped package as scope/name", () => {
    expect(rootSpecifier("@expo/vector-icons")).toBe("@expo/vector-icons");
  });

  it("strips a deep sub-path from a scoped package", () => {
    expect(rootSpecifier("@expo/vector-icons/MaterialIcons")).toBe(
      "@expo/vector-icons",
    );
  });

  it("returns a bare scope when there is no package name segment", () => {
    // Unusual but must not crash — the split produces an empty second element.
    expect(rootSpecifier("@scope")).toBe("@scope");
  });

  it("handles a single-segment specifier with no slash", () => {
    expect(rootSpecifier("lodash")).toBe("lodash");
  });
});

// ---------------------------------------------------------------------------
// isNativeDir — filesystem heuristics
// ---------------------------------------------------------------------------

describe("isNativeDir — happy path (native indicators present)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmTmpDir(tmpDir);
  });

  it("returns true when expo-module.config.json is present", () => {
    writeFile(path.join(tmpDir, "expo-module.config.json"), "{}");
    expect(isNativeDir(tmpDir)).toBe(true);
  });

  it("returns true when a *.podspec file is present at the package root", () => {
    writeFile(path.join(tmpDir, "MyLib.podspec"), "");
    expect(isNativeDir(tmpDir)).toBe(true);
  });

  it("returns true when a non-empty ios/ sub-directory exists", () => {
    writeFile(path.join(tmpDir, "ios", "MyLib.h"), "");
    expect(isNativeDir(tmpDir)).toBe(true);
  });

  it("returns true when android/build.gradle exists", () => {
    writeFile(path.join(tmpDir, "android", "build.gradle"), "");
    expect(isNativeDir(tmpDir)).toBe(true);
  });

  it("returns true when android/src/ exists", () => {
    fs.mkdirSync(path.join(tmpDir, "android", "src"), { recursive: true });
    expect(isNativeDir(tmpDir)).toBe(true);
  });
});

describe("isNativeDir — negative cases (JS-only package)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmTmpDir(tmpDir);
  });

  it("returns false for an empty directory", () => {
    expect(isNativeDir(tmpDir)).toBe(false);
  });

  it("returns false when only JS files are present", () => {
    writeFile(path.join(tmpDir, "index.js"), "module.exports = {};");
    writeFile(path.join(tmpDir, "package.json"), "{}");
    expect(isNativeDir(tmpDir)).toBe(false);
  });

  it("returns false when an ios/ directory is present but empty", () => {
    fs.mkdirSync(path.join(tmpDir, "ios"), { recursive: true });
    expect(isNativeDir(tmpDir)).toBe(false);
  });

  it("returns false when an android/ directory has no build.gradle or src/", () => {
    // e.g. just a README inside android/
    writeFile(path.join(tmpDir, "android", "README.md"), "");
    expect(isNativeDir(tmpDir)).toBe(false);
  });

  it("returns false when the directory does not exist", () => {
    const missing = path.join(tmpDir, "does-not-exist");
    expect(isNativeDir(missing)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findOffendingImports — top-level static import / require detection
// ---------------------------------------------------------------------------

describe("findOffendingImports — offending patterns (must be flagged)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmTmpDir(tmpDir);
  });

  it("flags a top-level named import", () => {
    const file = path.join(tmpDir, "screen.tsx");
    writeFile(file, 'import { Camera } from "expo-camera";\n');
    expect(findOffendingImports(file, new Set(["expo-camera"]))).toEqual([
      "expo-camera",
    ]);
  });

  it("flags a top-level default import", () => {
    const file = path.join(tmpDir, "screen.tsx");
    writeFile(file, 'import Camera from "expo-camera";\n');
    expect(findOffendingImports(file, new Set(["expo-camera"]))).toEqual([
      "expo-camera",
    ]);
  });

  it("flags a top-level side-effect import", () => {
    const file = path.join(tmpDir, "screen.tsx");
    writeFile(file, 'import "react-native-reanimated";\n');
    expect(
      findOffendingImports(file, new Set(["react-native-reanimated"])),
    ).toEqual(["react-native-reanimated"]);
  });

  it("flags a top-level const require", () => {
    const file = path.join(tmpDir, "screen.tsx");
    writeFile(
      file,
      'const RNCamera = require("react-native-camera");\n',
    );
    expect(
      findOffendingImports(file, new Set(["react-native-camera"])),
    ).toEqual(["react-native-camera"]);
  });

  it("flags a scoped package import and resolves it to scope/name", () => {
    const file = path.join(tmpDir, "screen.tsx");
    writeFile(file, 'import { foo } from "@react-native-community/blur";\n');
    expect(
      findOffendingImports(
        file,
        new Set(["@react-native-community/blur"]),
      ),
    ).toEqual(["@react-native-community/blur"]);
  });

  it("flags a deep sub-path import by resolving to root package", () => {
    const file = path.join(tmpDir, "screen.tsx");
    writeFile(
      file,
      'import something from "react-native/Libraries/Components/Button";\n',
    );
    expect(
      findOffendingImports(file, new Set(["react-native"])),
    ).toEqual(["react-native"]);
  });

  it("returns multiple offenders sorted alphabetically", () => {
    const file = path.join(tmpDir, "screen.tsx");
    writeFile(
      file,
      [
        'import { useCamera } from "expo-camera";',
        'import { Haptics } from "expo-haptics";',
      ].join("\n") + "\n",
    );
    expect(
      findOffendingImports(
        file,
        new Set(["expo-camera", "expo-haptics"]),
      ),
    ).toEqual(["expo-camera", "expo-haptics"]);
  });
});

describe("findOffendingImports — safe patterns (must NOT be flagged)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmTmpDir(tmpDir);
  });

  it("does not flag a type-only import", () => {
    const file = path.join(tmpDir, "screen.tsx");
    writeFile(file, 'import type { CameraProps } from "expo-camera";\n');
    expect(findOffendingImports(file, new Set(["expo-camera"]))).toEqual([]);
  });

  it("does not flag an indented await import (lazy load)", () => {
    const file = path.join(tmpDir, "screen.tsx");
    writeFile(
      file,
      [
        "async function openCamera() {",
        '  const { Camera } = await import("expo-camera");',
        "}",
      ].join("\n") + "\n",
    );
    expect(findOffendingImports(file, new Set(["expo-camera"]))).toEqual([]);
  });

  it("does not flag an indented require inside a try/catch", () => {
    const file = path.join(tmpDir, "screen.tsx");
    writeFile(
      file,
      [
        "try {",
        '  const mod = require("expo-camera");',
        "} catch {}",
      ].join("\n") + "\n",
    );
    expect(findOffendingImports(file, new Set(["expo-camera"]))).toEqual([]);
  });

  it("does not flag packages that are not in the watched set", () => {
    const file = path.join(tmpDir, "screen.tsx");
    writeFile(file, 'import { View } from "react-native";\n');
    // react-native is NOT in the watched set (it's already shipped)
    expect(findOffendingImports(file, new Set(["expo-camera"]))).toEqual([]);
  });

  it("returns empty array for a file with no imports", () => {
    const file = path.join(tmpDir, "utils.ts");
    writeFile(file, 'export function add(a: number, b: number) { return a + b; }\n');
    expect(findOffendingImports(file, new Set(["expo-camera"]))).toEqual([]);
  });

  it("does not flag an indented top-level require with extra whitespace", () => {
    const file = path.join(tmpDir, "screen.tsx");
    // Leading space keeps the anchor from matching.
    writeFile(
      file,
      '  const mod = require("expo-camera");\n',
    );
    expect(findOffendingImports(file, new Set(["expo-camera"]))).toEqual([]);
  });
});
