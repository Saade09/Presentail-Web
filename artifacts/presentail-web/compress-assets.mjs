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
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const brotliCompress = promisify(zlib.brotliCompress);
const gzipCompress = promisify(zlib.gzip);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, "dist/public/assets");

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
}

async function main() {
  if (!fs.existsSync(ASSETS_DIR)) {
    console.log(
      "compress-assets: dist/public/assets not found — skipping (run vite build first)."
    );
    return;
  }

  const files = fs
    .readdirSync(ASSETS_DIR)
    .filter((f) => f.endsWith(".js") || f.endsWith(".css"))
    .map((f) => path.join(ASSETS_DIR, f));

  if (files.length === 0) {
    console.log("compress-assets: no JS/CSS assets found.");
    return;
  }

  console.log(`compress-assets: pre-compressing ${files.length} JS/CSS files…`);
  await Promise.all(files.map(compressFile));
  console.log("compress-assets: done.");
}

main().catch((err) => {
  console.error("compress-assets failed:", err);
  process.exit(1);
});
