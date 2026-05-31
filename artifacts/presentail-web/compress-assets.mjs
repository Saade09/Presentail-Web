/**
 * Post-build pre-compression script.
 *
 * Compresses every .js and .css file in dist/public/assets/ with both Brotli
 * (max quality) and gzip (max level), writing <file>.br and <file>.gz sidecars
 * alongside the originals.  serve.mjs then serves the pre-built sidecar
 * directly instead of compressing on every request.
 *
 * Run automatically via the "build" script in package.json:
 *   vite build && node compress-assets.mjs
 *
 * Exports `compressAssets(assetsDir)` so tests can invoke the core logic
 * against a synthetic fixture without running the full build.
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const brotliCompress = promisify(zlib.brotliCompress);
const gzipCompress = promisify(zlib.gzip);

const BROTLI_OPTS = {
  params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
};
const GZIP_OPTS = { level: 9 };

async function compressFile(filePath) {
  const data = fs.readFileSync(filePath);
  const [brData, gzData] = await Promise.all([
    brotliCompress(data, BROTLI_OPTS),
    gzipCompress(data, GZIP_OPTS),
  ]);
  fs.writeFileSync(filePath + ".br", brData);
  fs.writeFileSync(filePath + ".gz", gzData);
  const origKb = (data.length / 1024).toFixed(1);
  const brKb = (brData.length / 1024).toFixed(1);
  const gzKb = (gzData.length / 1024).toFixed(1);
  console.log(
    `  ${path.basename(filePath).padEnd(50)} ${origKb.padStart(7)}KB → br:${brKb.padStart(7)}KB  gz:${gzKb.padStart(7)}KB`
  );
  return { filePath, brSize: brData.length, gzSize: gzData.length };
}

/**
 * Compress all JS/CSS files in `assetsDir`.
 *
 * Returns an array of `{ filePath, brSize, gzSize }` objects — one per file.
 *
 * Throws when `assetsDir` does not exist or contains no JS/CSS files so
 * callers (and CI) get a loud failure instead of a silent no-op.
 */
export async function compressAssets(assetsDir) {
  if (!fs.existsSync(assetsDir)) {
    throw new Error(
      `compress-assets: assets directory not found: ${assetsDir}`
    );
  }

  const files = fs
    .readdirSync(assetsDir)
    .filter((f) => f.endsWith(".js") || f.endsWith(".css"))
    .map((f) => path.join(assetsDir, f));

  if (files.length === 0) {
    throw new Error(
      `compress-assets: no JS/CSS assets found in ${assetsDir} — check vite build output`
    );
  }

  console.log(`compress-assets: pre-compressing ${files.length} JS/CSS files…`);
  const results = await Promise.all(files.map(compressFile));
  console.log("compress-assets: done.");
  return results;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const assetsDir = path.join(__dirname, "dist/public/assets");

  compressAssets(assetsDir).catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
