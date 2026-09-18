#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const componentFiles = [
  "src/components/homepage/EditorialSection.tsx",
  "src/components/homepage/HomepageLowerHalf.tsx",
];
const expected = [
  { width: 828, maxBytes: 90_000 },
  { width: 1408, maxBytes: 190_000 },
];

for (const { width, maxBytes } of expected) {
  const file = path.join(rootDir, `src/assets/generated/homepage-editorial-${width}.webp`);
  assert.ok(fs.existsSync(file), `Missing responsive homepage image: ${file}`);
  const metadata = await sharp(file).metadata();
  assert.equal(metadata.format, "webp", `${file} must be WebP`);
  assert.equal(metadata.width, width, `${file} must be ${width}px wide`);
  assert.ok(fs.statSync(file).size <= maxBytes, `${file} exceeds ${maxBytes} bytes`);
}

for (const relativeFile of componentFiles) {
  const source = fs.readFileSync(path.join(rootDir, relativeFile), "utf8");
  assert.match(source, /srcSet=/, `${relativeFile} must provide srcSet`);
  assert.match(source, /sizes=/, `${relativeFile} must provide sizes`);
  assert.doesNotMatch(source, /hero\.png/, `${relativeFile} must not import the PNG`);
}

const distAssets = path.join(rootDir, "dist/public/assets");
if (fs.existsSync(distAssets)) {
  const files = fs.readdirSync(distAssets);
  assert.ok(files.some((file) => /^homepage-editorial-828-.*\.webp$/.test(file)), "828w WebP was not emitted");
  assert.ok(files.some((file) => /^homepage-editorial-1408-.*\.webp$/.test(file)), "1408w WebP was not emitted");
  assert.ok(!files.some((file) => /^hero-.*\.png$/.test(file)), "Original homepage PNG was emitted");
}

console.log("[homepage-editorial] Responsive WebP checks passed.");