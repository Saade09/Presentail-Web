#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const source = path.join(rootDir, "src/assets/hero.png");
const outputDir = path.join(rootDir, "src/assets/generated");
const variants = [
  { width: 828, quality: 92 },
  { width: 1408, quality: 90 },
];

await fs.mkdir(outputDir, { recursive: true });

for (const { width, quality } of variants) {
  const output = path.join(outputDir, `homepage-editorial-${width}.webp`);
  await sharp(source)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality })
    .toFile(output);
  console.log(`[homepage-editorial] Generated ${path.relative(rootDir, output)} (${width}w)`);
}