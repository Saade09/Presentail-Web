import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import {
  artifactDefaults,
  createManifest,
} from "../../scripts/build-artifact-provenance.mjs";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSourceMapDir = path.resolve(artifactDir, "debug-source-maps");

function revision() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: path.resolve(artifactDir, "../.."),
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

async function walk(directory, files = []) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(fullPath, files);
    else files.push(fullPath);
  }
  return files;
}

async function splitSourceMapsFromRuntime(distDir, sourceMapDir) {
  if (path.resolve(sourceMapDir) === path.resolve(distDir)) {
    throw new Error(
      "API_SOURCE_MAP_DIR must be outside dist so source maps cannot enter the runtime artifact.",
    );
  }

  await rm(sourceMapDir, { recursive: true, force: true });
  await mkdir(sourceMapDir, { recursive: true });

  const emittedFiles = await walk(distDir);
  const sourceMaps = emittedFiles.filter((file) => file.endsWith(".map"));
  if (sourceMaps.length === 0) {
    throw new Error(
      "API build emitted no source maps; refusing to create an undebuggable release.",
    );
  }

  const manifestFiles = [];
  for (const sourceMap of sourceMaps) {
    const relativePath = path.relative(distDir, sourceMap);
    const target = path.join(sourceMapDir, relativePath);
    const contents = await readFile(sourceMap);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
    await rm(sourceMap);
    manifestFiles.push({
      path: relativePath.replaceAll(path.sep, "/"),
      bytes: contents.byteLength,
      sha256: createHash("sha256").update(contents).digest("hex"),
    });
  }

  for (const runtimeFile of emittedFiles.filter((file) =>
    file.endsWith(".mjs"),
  )) {
    const contents = await readFile(runtimeFile, "utf8");
    const withoutMapReference = contents.replace(
      /\n?\/\/# sourceMappingURL=.*$/gm,
      "",
    );
    if (withoutMapReference !== contents) {
      await writeFile(runtimeFile, withoutMapReference, "utf8");
    }
  }

  for (const entry of manifestFiles) {
    const runtimeRelativePath = entry.path.slice(0, -".map".length);
    const runtimeContents = await readFile(
      path.join(distDir, runtimeRelativePath),
    );
    entry.runtimePath = runtimeRelativePath;
    entry.runtimeSha256 = createHash("sha256")
      .update(runtimeContents)
      .digest("hex");
  }

  await writeFile(
    path.join(sourceMapDir, ".source-map-manifest.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        kind: "protected-source-map-artifact",
        name: "api",
        sourceRevision: revision(),
        files: manifestFiles.sort((left, right) =>
          left.path.localeCompare(right.path),
        ),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  const sourceMapDir = path.resolve(
    process.env.API_SOURCE_MAP_DIR || defaultSourceMapDir,
  );
  await rm(distDir, { recursive: true, force: true });

  // Copy static asset directory (served at /api/assets) into dist so the
  // bundled server can resolve files relative to its own __dirname.
  const publicDir = path.resolve(artifactDir, "public");
  try {
    await stat(publicDir);
    await cp(publicDir, path.resolve(distDir, "public"), { recursive: true });
  } catch {
    // No public/ directory — nothing to copy.
  }

  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    // Some packages may not be bundleable, so we externalize them, we can add more here as needed.
    // Some of the packages below may not be imported or installed, but we're adding them in case they are in the future.
    // Examples of unbundleable packages:
    // - uses native modules and loads them dynamically (e.g. sharp)
    // - use path traversal to read files (e.g. @google-cloud/secret-manager loads sibling .proto files)
    external: [
      // Project runtime dependencies that are present in node_modules at
      // runtime (declared in package.json `dependencies`). Externalising
      // them keeps the bundle small and lets each be loaded directly,
      // which also avoids accidentally double-bundling the Clerk SDK or
      // Stripe SDK and breaking their internal singletons.
      "@clerk/express",
      "@clerk/shared",
      "drizzle-orm",
      "drizzle-orm/*",
      "stripe",
      "svix",
      "jose",
      "express",
      "express-rate-limit",
      "cors",
      "cookie-parser",
      "http-proxy-middleware",
      // NOTE: workspace packages (@workspace/*) MUST stay bundled — their
      // package.json `main` points at TS source (`src/index.ts`) and Node's
      // ESM resolver cannot follow that at runtime, nor the extensionless
      // bare imports inside the generated code.
      // Native / dynamic-load packages that must never be bundled.
      "*.node",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      "@opentelemetry/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],
    sourcemap: "linked",
    plugins: [
      // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it
      esbuildPluginPino({ transports: ["pino-pretty"] }),
    ],
    // Make sure packages that are cjs only (e.g. express) but are bundled continue to work in our esm output file
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });
  await splitSourceMapsFromRuntime(distDir, sourceMapDir);
  await createManifest({
    name: "api",
    artifactDir: distDir,
    prefixes: artifactDefaults("api"),
    outputPolicy: {
      forbiddenExtensions: [".map"],
    },
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
