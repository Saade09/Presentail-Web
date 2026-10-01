#!/usr/bin/env node
/**
 * Create and verify content-addressed build metadata.
 *
 * The manifest is deliberately written inside the output directory so a
 * downloaded/cache-restored artifact carries its own provenance. Verification
 * re-hashes both the source inputs and emitted files; a cache hit therefore
 * cannot silently reuse an output from another source revision.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_NAME = ".build-provenance.json";
const ROOT_INPUTS = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "tsconfig.base.json",
  "scripts/build-artifact-provenance.mjs",
];
const WEB_ARTIFACT_INPUTS = [
  "artifacts/presentail-web/src/",
  "artifacts/presentail-web/public/",
  "artifacts/presentail-web/index.html",
  "artifacts/presentail-web/package.json",
  "artifacts/presentail-web/tsconfig.json",
  "artifacts/presentail-web/vite.config.ts",
  "artifacts/presentail-web/blog-hero-variants.config.mjs",
  "artifacts/presentail-web/blog-hero-variants.mjs",
  "artifacts/presentail-web/check-build-integrity.mjs",
  "artifacts/presentail-web/compress-assets.mjs",
  "artifacts/presentail-web/logo-assets.mjs",
  "artifacts/presentail-web/markdown.mjs",
  "artifacts/presentail-web/seo-inject.mjs",
  "artifacts/presentail-web/server-analytics-policy.mjs",
  "artifacts/presentail-web/scripts/check-homepage-editorial-variants.mjs",
  "artifacts/presentail-web/scripts/generate-blog-hero-variants.mjs",
  "artifacts/presentail-web/scripts/generate-blog-index.mjs",
  "artifacts/presentail-web/scripts/generate-homepage-editorial-variants.mjs",
  "artifacts/presentail-web/scripts/pageEligibility.mjs",
  "attached_assets/Elegant-dark-teal-stationery-design_1778742277420.avif",
  "attached_assets/Presentail-Arabic-Logo-white.png",
  "attached_assets/Presentail-Arabic-Logo-white.webp",
  "attached_assets/Presentail-Arabic-Logo.png",
  "attached_assets/Presentail-Arabic-Logo.webp",
  "attached_assets/Presentail_PNG-01_1777795626872.png",
  "attached_assets/Presentail_PNG-01_1777795626872.webp",
  "attached_assets/Presentail_PNG-01_white.png",
  "attached_assets/Presentail_PNG-01_white.webp",
];
const WEB_LIBRARY_INPUTS = [
  "lib/api-client-react/",
  "lib/blog-content/",
  "lib/catalog-data/",
  "lib/clerk-types/",
  "lib/delivery/",
  "lib/display-currency/",
  "lib/homepage-icons/",
  "lib/pay-methods/",
  "lib/presentail-os/",
  "lib/suggested-messages/",
];
const API_LIBRARY_INPUTS = [
  "lib/api-zod/",
  "lib/catalog-data/",
  "lib/clerk-types/",
  "lib/db/",
  "lib/delivery/",
  "lib/display-currency/",
  "lib/integrations-openai-ai-server/",
  "lib/presentail-os/",
];
const MOBILE_LIBRARY_INPUTS = [
  "lib/api-client-react/",
  "lib/blog-content/",
  "lib/catalog-data/",
  "lib/delivery/",
  "lib/display-currency/",
  "lib/homepage-icons/",
  "lib/pay-methods/",
  "lib/suggested-messages/",
];

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const hasFlag = (name) => argv.includes(`--${name}`);

export function artifactDefaults(name) {
  if (name === "web") {
    return [...WEB_ARTIFACT_INPUTS, ...WEB_LIBRARY_INPUTS, ...ROOT_INPUTS];
  }
  const artifactPrefix = `artifacts/${name === "api" ? "api-server" : "presentail"}/`;
  const libraryInputs = name === "api" ? API_LIBRARY_INPUTS : MOBILE_LIBRARY_INPUTS;
  return [artifactPrefix, ...libraryInputs, ...ROOT_INPUTS];
}

function relative(value) {
  return path.relative(ROOT, value).replaceAll(path.sep, "/");
}

function isGenerated(relativePath) {
  return (
    relativePath.includes("/node_modules/") ||
    relativePath.includes("/dist/") ||
    relativePath.includes("/static-build/") ||
    relativePath.includes("/.expo/") ||
    relativePath.includes("/coverage/") ||
    relativePath.includes("/__tests__/") ||
    /(?:^|\/)[^/]+\.test\.[cm]?[jt]sx?$/.test(relativePath) ||
    /^artifacts\/presentail-web\/src\/test-(setup|utils)\.tsx?$/.test(
      relativePath,
    ) ||
    /^artifacts\/presentail-web\/public\/blog\/.+-(480|768)\.webp$/.test(
      relativePath,
    ) ||
    relativePath.startsWith(".git/") ||
    relativePath === MANIFEST_NAME
  );
}

async function walk(directory, files = []) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(fullPath, files);
    else files.push(fullPath);
  }
  return files;
}

function gitFiles() {
  try {
    return execFileSync("git", ["ls-files", "-co", "--exclude-standard"], {
      cwd: ROOT,
      encoding: "utf8",
    })
      .split(/\r?\n/)
      .filter(Boolean)
      .map((file) => path.resolve(ROOT, file));
  } catch {
    return [];
  }
}

async function inputFiles(prefixes) {
  const tracked = gitFiles();
  const candidates =
    tracked.length > 0
      ? tracked
      : (
          await Promise.all(
            prefixes
              .filter((prefix) => prefix.endsWith("/"))
              .map((prefix) => walk(path.join(ROOT, prefix))),
          )
        ).flat();
  const exactInputs = new Set(
    prefixes
      .filter((prefix) => !prefix.endsWith("/"))
      .map((prefix) => path.resolve(ROOT, prefix)),
  );
  const selected = [...new Set(candidates.concat([...exactInputs]))]
    .filter((file) => {
      const rel = relative(file);
      return (
        !isGenerated(rel) &&
        (exactInputs.has(file) ||
          prefixes.some(
            (prefix) => prefix.endsWith("/") && rel.startsWith(prefix),
          ))
      );
    })
    .sort();
  const existing = await Promise.all(
    selected.map(async (file) => {
      try {
        return (await stat(file)).isFile() ? file : null;
      } catch (error) {
        if (error?.code === "ENOENT") return null;
        throw error;
      }
    }),
  );
  return existing.filter(Boolean);
}

async function hashFiles(files) {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(relative(file));
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function getArtifactSourceHash(name) {
  return hashFiles(await inputFiles(artifactDefaults(name)));
}

export function buildCacheKey({
  name,
  sourceHash,
  environment = process.env,
  buildConfiguration = {},
}) {
  const commonKeys = new Set(["NODE_ENV"]);
  const webKeys = new Set(["BASE_PATH"]);
  const mobileKeys = new Set([
    "BASE_PATH",
    "STATIC_ASSET_BASE_PATH",
    "STATIC_ASSET_BASE_URL",
    "REPLIT_INTERNAL_APP_DOMAIN",
    "REPLIT_DEV_DOMAIN",
    "REPL_ID",
  ]);
  const relevantEnvironment = Object.fromEntries(
    Object.entries(environment)
      .filter(
        ([key]) =>
          commonKeys.has(key) ||
          (name === "web" && (webKeys.has(key) || key.startsWith("VITE_"))) ||
          (name === "mobile" &&
            (mobileKeys.has(key) || key.startsWith("EXPO_PUBLIC_"))),
      )
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  return createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion: 1,
        name,
        sourceHash,
        node: process.version,
        nodeMajor: Number(process.versions.node.split(".")[0]),
        platform: process.platform,
        arch: process.arch,
        environment: relevantEnvironment,
        buildConfiguration,
      }),
    )
    .digest("hex");
}

async function outputInventory(directory) {
  const files = (await walk(directory))
    .filter((file) => path.basename(file) !== MANIFEST_NAME)
    .sort();
  const hash = createHash("sha256");
  let bytes = 0;
  for (const file of files) {
    const contents = await readFile(file);
    bytes += contents.byteLength;
    hash.update(path.relative(directory, file).replaceAll(path.sep, "/"));
    hash.update("\0");
    hash.update(contents);
    hash.update("\0");
  }
  return { files: files.length, bytes, sha256: hash.digest("hex") };
}

function normalizeOutputPolicy(policy = {}) {
  return {
    forbiddenExtensions: [
      ...new Set(
        (policy.forbiddenExtensions ?? [])
          .map((value) => String(value).trim())
          .filter(Boolean)
          .map((value) => (value.startsWith(".") ? value : `.${value}`)),
      ),
    ].sort(),
  };
}

async function verifyOutputPolicy(directory, policy, name) {
  const normalized = normalizeOutputPolicy(policy);
  if (normalized.forbiddenExtensions.length === 0) return normalized;
  const violations = (await walk(directory))
    .map((file) => path.relative(directory, file).replaceAll(path.sep, "/"))
    .filter((file) =>
      normalized.forbiddenExtensions.some((extension) =>
        file.endsWith(extension),
      ),
    )
    .sort();
  if (violations.length > 0) {
    throw new Error(
      `[${name}] Runtime output policy violation: forbidden files ${violations.join(", ")}.`,
    );
  }
  return normalized;
}

function revision() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

export async function createManifest({
  name,
  artifactDir,
  prefixes,
  outputPolicy,
}) {
  const files = await inputFiles(prefixes);
  const normalizedOutputPolicy = await verifyOutputPolicy(
    artifactDir,
    outputPolicy,
    name,
  );
  const output = await outputInventory(artifactDir);
  const manifest = {
    schemaVersion: 2,
    kind: "verified-build-artifact",
    name,
    source: {
      revision: revision(),
      hash: await hashFiles(files),
      files: files.map(relative),
    },
    environment: {
      node: process.version,
      nodeMajor: Number(process.versions.node.split(".")[0]),
      platform: process.platform,
      arch: process.arch,
    },
    output,
    outputPolicy: normalizedOutputPolicy,
    cacheKey: buildCacheKey({
      name,
      sourceHash: await hashFiles(files),
    }),
    cacheHit: process.env.BUILD_CACHE_HIT === "true",
    generatedAt: new Date().toISOString(),
  };
  await writeFile(
    path.join(artifactDir, MANIFEST_NAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}

async function verifyManifest({
  name,
  artifactDir,
  prefixes,
  maxBytes,
  outputPolicy,
}) {
  const manifestPath = path.join(artifactDir, MANIFEST_NAME);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    throw new Error(
      `[${name}] Missing ${manifestPath}. Build the artifact or restore a complete cache entry before serving it.`,
    );
  }
  if (manifest.kind !== "verified-build-artifact" || manifest.name !== name) {
    throw new Error(
      `[${name}] Invalid build provenance manifest: expected verified ${name} artifact.`,
    );
  }

  const files = await inputFiles(prefixes);
  const currentSourceHash = await hashFiles(files);
  if (currentSourceHash !== manifest.source?.hash) {
    throw new Error(
      `[${name}] Build provenance mismatch: cached source hash ${manifest.source?.hash ?? "missing"} does not match ${currentSourceHash}. Rebuild instead of serving stale output.`,
    );
  }
  if (
    manifest.cacheKey &&
    manifest.cacheKey !==
      buildCacheKey({
        name,
        sourceHash: currentSourceHash,
      })
  ) {
    throw new Error(
      `[${name}] Build cache key mismatch: cached environment or build configuration does not match the current publish.`,
    );
  }
  const expectedMajor = Number(process.versions.node.split(".")[0]);
  if (
    manifest.environment?.nodeMajor !== expectedMajor ||
    manifest.environment?.platform !== process.platform ||
    manifest.environment?.arch !== process.arch
  ) {
    throw new Error(
      `[${name}] Incompatible build environment: artifact Node ${manifest.environment?.node} ${manifest.environment?.platform}/${manifest.environment?.arch}, current ${process.version} ${process.platform}/${process.arch}.`,
    );
  }

  const output = await outputInventory(artifactDir);
  const requiredPolicy = normalizeOutputPolicy(outputPolicy);
  const recordedPolicy = normalizeOutputPolicy(manifest.outputPolicy);
  for (const extension of requiredPolicy.forbiddenExtensions) {
    if (!recordedPolicy.forbiddenExtensions.includes(extension)) {
      throw new Error(
        `[${name}] Build provenance policy mismatch: manifest does not forbid ${extension}. Rebuild with the current output policy.`,
      );
    }
  }
  await verifyOutputPolicy(
    artifactDir,
    {
      forbiddenExtensions: [
        ...recordedPolicy.forbiddenExtensions,
        ...requiredPolicy.forbiddenExtensions,
      ],
    },
    name,
  );
  if (
    output.files !== manifest.output?.files ||
    output.bytes !== manifest.output?.bytes ||
    output.sha256 !== manifest.output?.sha256
  ) {
    throw new Error(
      `[${name}] Artifact integrity mismatch. Expected ${manifest.output?.files} files/${manifest.output?.bytes} bytes/${manifest.output?.sha256}, found ${output.files} files/${output.bytes} bytes/${output.sha256}.`,
    );
  }
  if (maxBytes !== null && output.bytes > Number(maxBytes)) {
    throw new Error(
      `[${name}] Artifact size budget exceeded: ${output.bytes} bytes > ${maxBytes}. Inspect the largest emitted files before raising the budget.`,
    );
  }
  const cacheHit =
    process.env.BUILD_CACHE_HIT === "true" || manifest.cacheHit === true;
  console.log(
    `[${name}] verified provenance revision=${manifest.source.revision ?? "unknown"} source=${manifest.source.hash} output=${output.sha256} files=${output.files} bytes=${output.bytes} cache_hit=${cacheHit}`,
  );
  return manifest;
}

async function main() {
  const name = arg("name");
  const artifactValue = arg("artifact-dir");
  if (!name || !artifactValue)
    throw new Error(
      "Usage: --name <api|web|mobile> --artifact-dir <path> [--verify] [--max-bytes <n>]",
    );
  const artifactDir = path.isAbsolute(artifactValue)
    ? artifactValue
    : path.resolve(process.cwd(), artifactValue);
  const prefixes = artifactDefaults(name);
  await stat(artifactDir);
  if (hasFlag("verify")) {
    await verifyManifest({
      name,
      artifactDir,
      prefixes,
      maxBytes: arg("max-bytes"),
      outputPolicy: {
        forbiddenExtensions: (arg("forbidden-extensions", "") || "")
          .split(",")
          .filter(Boolean),
      },
    });
  } else {
    const manifest = await createManifest({
      name,
      artifactDir,
      prefixes,
      outputPolicy: {
        forbiddenExtensions: (arg("forbidden-extensions", "") || "")
          .split(",")
          .filter(Boolean),
      },
    });
    console.log(
      `[${name}] wrote provenance revision=${manifest.source.revision ?? "unknown"} source=${manifest.source.hash} output=${manifest.output.sha256} files=${manifest.output.files} bytes=${manifest.output.bytes} cache_hit=${manifest.cacheHit}`,
    );
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
