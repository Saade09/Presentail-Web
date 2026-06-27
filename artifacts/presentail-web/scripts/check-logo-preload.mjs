#!/usr/bin/env node
/**
 * check-logo-preload.mjs
 *
 * Verifies that the built dist/public/index.html contains a
 *
 *   <link rel="preload" as="image" type="image/webp" href="…<logo>…">
 *
 * tag referencing the primary English WebP logo after the full Vite build
 * pipeline (logoPreloadPlugin + criticalCssPlugin) has run.
 *
 * The check catches the silent regression where critters (criticalCssPlugin)
 * rewrites index.html and inadvertently strips the preload tag injected by
 * logoPreloadPlugin in the preceding closeBundle hook.
 *
 * Usage:
 *   node artifacts/presentail-web/scripts/check-logo-preload.mjs [distDir]
 *
 * distDir defaults to <script-dir>/../dist/public
 * Exits 0 on PASS, 1 on FAIL.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Single source of truth — defined in logo-assets.mjs and shared with vite.config.ts.
import { LOGO_EN_WEBP_BASENAME } from "../logo-assets.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, "../dist/public");

const htmlPath = path.join(distDir, "index.html");
const manifestPath = path.join(distDir, ".vite/manifest.json");

// ---------------------------------------------------------------------------
// Sanity: dist must exist.
// ---------------------------------------------------------------------------

if (!fs.existsSync(htmlPath)) {
  console.error(
    `check-logo-preload: index.html not found at ${htmlPath}\n` +
      `  Make sure the Vite build has run before executing this check.`
  );
  process.exit(1);
}

if (!fs.existsSync(manifestPath)) {
  console.error(
    `check-logo-preload: manifest not found at ${manifestPath}\n` +
      `  Make sure "build.manifest: true" is set in vite.config.ts and the build has run.`
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Resolve the content-hashed output filename from the Vite manifest.
// ---------------------------------------------------------------------------

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const logoEntry =
  Object.entries(manifest).find(([key]) =>
    key.endsWith(LOGO_EN_WEBP_BASENAME)
  )?.[1] ??
  Object.values(manifest).find(
    (entry) =>
      entry.file.includes(LOGO_EN_WEBP_BASENAME.replace(".webp", "")) &&
      entry.file.endsWith(".webp")
  );

if (!logoEntry) {
  console.error(
    `check-logo-preload: FAIL — logo asset "${LOGO_EN_WEBP_BASENAME}" was not found in the Vite manifest.\n` +
      `  This means the asset was not processed by the build pipeline.\n` +
      `  Fix: update LOGO_EN_WEBP_BASENAME in artifacts/presentail-web/logo-assets.mjs to match the actual source filename.`
  );
  process.exit(1);
}

const logoFile = logoEntry.file; // e.g. "assets/Presentail_PNG-01_1777795626872-<hash>.webp"

// ---------------------------------------------------------------------------
// Check that index.html contains the preload tag.
// ---------------------------------------------------------------------------

const html = fs.readFileSync(htmlPath, "utf8");

// Match a <link> with rel="preload", as="image", type="image/webp", and an
// href that references the hashed logo file. Attribute order is not guaranteed
// so we check each attribute independently rather than matching a fixed string.
const preloadTagRegex = /<link\b[^>]*>/gi;
let foundTag = null;

for (const match of html.matchAll(preloadTagRegex)) {
  const tag = match[0];
  if (
    /\brel=["']preload["']/.test(tag) &&
    /\bas=["']image["']/.test(tag) &&
    /\btype=["']image\/webp["']/.test(tag) &&
    tag.includes(logoFile)
  ) {
    foundTag = tag;
    break;
  }
}

if (!foundTag) {
  // Provide a richer diagnostic: tell the developer what the manifest says the
  // logo file should be called so they can grep the HTML themselves.
  const preloadTags = [...html.matchAll(/<link\b[^>]*rel=["']preload["'][^>]*>/gi)]
    .map((m) => m[0])
    .join("\n    ");

  console.error(
    `check-logo-preload: FAIL\n` +
      `  Expected a <link rel="preload" as="image" type="image/webp"> tag\n` +
      `  with href referencing: ${logoFile}\n` +
      `\n` +
      `  This means logoPreloadPlugin's tag was stripped or not injected —\n` +
      `  most likely criticalCssPlugin (critters) overwrote index.html without\n` +
      `  preserving the preload tag. Check the plugin order in vite.config.ts:\n` +
      `  logoPreloadPlugin must run its closeBundle hook BEFORE criticalCssPlugin.\n` +
      `\n` +
      `  Existing preload tags in index.html:\n` +
      `    ${preloadTags || "(none found)"}`
  );
  process.exit(1);
}

console.log(`check-logo-preload: PASS`);
console.log(`  Found: ${foundTag.slice(0, 120)}${foundTag.length > 120 ? "…" : ""}`);
process.exit(0);
