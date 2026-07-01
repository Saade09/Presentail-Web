/**
 * compressAppTileImages.ts
 *
 * Re-encodes every image in `assets/occasions/` and `assets/categories/`
 * of the mobile app to WebP at 300×300 px, quality 80.
 *
 * - AVIF files are converted to WebP (deleting the original .avif).
 * - WebP files are re-encoded in-place at the new size/quality.
 * - Images that are already ≤300 px in both dimensions are NOT upscaled;
 *   they are re-encoded at their intrinsic size.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run compress-app-tile-images
 */

import { createRequire } from "module";
import { readdir, unlink } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require("sharp") as typeof import("sharp").default;

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../");

const TARGET_DIRS = [
  join(REPO_ROOT, "artifacts/presentail/assets/occasions"),
  join(REPO_ROOT, "artifacts/presentail/assets/categories"),
];

const MAX_PX = 300;
const QUALITY = 80;
const SUPPORTED = new Set([".webp", ".avif", ".jpg", ".jpeg", ".png"]);

async function processDir(dir: string): Promise<void> {
  const entries = await readdir(dir);
  for (const entry of entries) {
    const ext = extname(entry).toLowerCase();
    if (!SUPPORTED.has(ext)) continue;

    const src = join(dir, entry);
    const stem = basename(entry, ext);
    const dest = join(dir, `${stem}.webp`);

    const meta = await sharp(src).metadata();
    const w = meta.width ?? MAX_PX;
    const h = meta.height ?? MAX_PX;

    const needsResize = w > MAX_PX || h > MAX_PX;

    const pipeline = sharp(src);
    if (needsResize) {
      pipeline.resize(MAX_PX, MAX_PX, { fit: "inside", withoutEnlargement: true });
    }
    pipeline.webp({ quality: QUALITY });

    if (ext === ".avif") {
      await pipeline.toFile(dest);
      await unlink(src);
      console.log(`  converted ${entry} → ${stem}.webp`);
    } else {
      await pipeline.toFile(dest + ".tmp");
      await unlink(src);
      const { rename } = await import("node:fs/promises");
      await rename(dest + ".tmp", dest);
      console.log(`  re-encoded ${entry} (${w}×${h}) → ${stem}.webp`);
    }
  }
}

async function main(): Promise<void> {
  let totalBefore = 0;
  let totalAfter = 0;

  const { stat } = await import("node:fs/promises");

  for (const dir of TARGET_DIRS) {
    console.log(`\nProcessing ${dir}`);

    const before = await readdir(dir);
    for (const f of before) {
      if (!SUPPORTED.has(extname(f).toLowerCase())) continue;
      const s = await stat(join(dir, f));
      totalBefore += s.size;
    }

    await processDir(dir);

    const after = await readdir(dir);
    for (const f of after) {
      if (extname(f).toLowerCase() !== ".webp") continue;
      const s = await stat(join(dir, f));
      totalAfter += s.size;
    }
  }

  const pct = totalBefore > 0 ? (((totalBefore - totalAfter) / totalBefore) * 100).toFixed(1) : "0";
  console.log(`\nDone. ${(totalBefore / 1024).toFixed(0)} KB → ${(totalAfter / 1024).toFixed(0)} KB  (${pct}% smaller)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
