#!/usr/bin/env node

import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, stat } from "node:fs/promises";

const artifactDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourceMapDir = path.resolve(
  process.env.API_SOURCE_MAP_DIR ||
    path.resolve(artifactDir, "debug-source-maps"),
);

async function verify() {
  const manifestPath = path.join(sourceMapDir, ".source-map-manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    throw new Error(
      `Missing protected API source-map manifest at ${manifestPath}. Rebuild before publishing.`,
    );
  }

  if (
    manifest.kind !== "protected-source-map-artifact" ||
    manifest.name !== "api" ||
    !Array.isArray(manifest.files) ||
    manifest.files.length === 0
  ) {
    throw new Error("Invalid or empty protected API source-map artifact.");
  }

  let bytes = 0;
  for (const entry of manifest.files) {
    if (
      typeof entry.path !== "string" ||
      path.isAbsolute(entry.path) ||
      entry.path.includes("..") ||
      !entry.path.endsWith(".map")
    ) {
      throw new Error(`Invalid source-map artifact path: ${entry.path}`);
    }
    const file = path.join(sourceMapDir, entry.path);
    const contents = await readFile(file);
    const digest = createHash("sha256").update(contents).digest("hex");
    if (contents.byteLength !== entry.bytes || digest !== entry.sha256) {
      throw new Error(`Source-map artifact integrity mismatch: ${entry.path}`);
    }
    let parsed;
    try {
      parsed = JSON.parse(contents.toString("utf8"));
    } catch {
      throw new Error(`Unreadable source map JSON: ${entry.path}`);
    }
    if (
      parsed.version !== 3 ||
      !Array.isArray(parsed.sources) ||
      parsed.sources.length === 0 ||
      typeof parsed.mappings !== "string" ||
      parsed.mappings.length === 0
    ) {
      throw new Error(`Incomplete source map diagnostics: ${entry.path}`);
    }
    const runtimeContents = await readFile(
      path.join(artifactDir, "dist", entry.runtimePath),
    );
    const runtimeDigest = createHash("sha256")
      .update(runtimeContents)
      .digest("hex");
    if (runtimeDigest !== entry.runtimeSha256) {
      throw new Error(
        `Source map does not match runtime file: ${entry.runtimePath}`,
      );
    }
    bytes += contents.byteLength;
  }

  await stat(path.join(artifactDir, "dist", "index.mjs"));
  console.log(
    `[api-source-maps] verified files=${manifest.files.length} bytes=${bytes} directory=${sourceMapDir}`,
  );
}

verify().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
