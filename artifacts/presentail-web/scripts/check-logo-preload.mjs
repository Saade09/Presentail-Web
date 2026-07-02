#!/usr/bin/env node
/**
 * check-logo-preload.mjs
 *
 * Verifies that the built dist/public/index.html contains ALL FOUR
 * <link rel="preload" as="image" type="image/webp"> tags injected by
 * logoPreloadPlugin:
 *
 *   id="preload-logo-en"
 *   id="preload-logo-ar"
 *   id="preload-logo-en-white"
 *   id="preload-logo-ar-white"
 *
 * and that the inline pruning <script> references every one of those four IDs
 * so the runtime can remove the two unused-locale tags.
 *
 * This catches:
 *  - criticalCssPlugin (critters) stripping preload tags it did not inject.
 *  - A logo WebP being silently inlined as a base64 data URL (Vite assetsInlineLimit)
 *    which prevents the manifest lookup and omits the preload tag entirely.
 *  - A rename in logo-assets.mjs that makes the Vite manifest lookup fail and
 *    omits the tag.
 *  - A copy-paste bug where an ID in the inline script drifts from the actual
 *    tag ID, leaving a preload tag permanently in the DOM for all locales.
 *
 * All four tags are required. A missing tag is always a FAIL — there is no
 * SKIP path. Use the diagnostics printed on failure to identify the root cause.
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

import {
  LOGO_EN_WEBP_BASENAME,
  LOGO_AR_WEBP_BASENAME,
  LOGO_EN_WHITE_WEBP_BASENAME,
  LOGO_AR_WHITE_WEBP_BASENAME,
} from "../logo-assets.mjs";

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
// Resolve content-hashed output filenames from the Vite manifest.
// ---------------------------------------------------------------------------

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

/**
 * Find a logo entry in the manifest by its source basename.
 * Mirrors the lookup logic in logoPreloadPlugin (vite.config.ts).
 */
function findLogoEntry(basename) {
  return (
    Object.entries(manifest).find(([key]) => key.endsWith(basename))?.[1] ??
    Object.values(manifest).find(
      (entry) =>
        entry.file.includes(basename.replace(".webp", "")) &&
        entry.file.endsWith(".webp")
    )
  );
}

// All four logo variants — all are required. No SKIP path.
const LOGOS = [
  { id: "preload-logo-en",       basename: LOGO_EN_WEBP_BASENAME       },
  { id: "preload-logo-ar",       basename: LOGO_AR_WEBP_BASENAME       },
  { id: "preload-logo-en-white", basename: LOGO_EN_WHITE_WEBP_BASENAME },
  { id: "preload-logo-ar-white", basename: LOGO_AR_WHITE_WEBP_BASENAME },
];

const EXPECTED_IDS = LOGOS.map((l) => l.id);

const failures = [];
const passes = [];

// ---------------------------------------------------------------------------
// Read the built HTML.
// ---------------------------------------------------------------------------

const html = fs.readFileSync(htmlPath, "utf8");

// ---------------------------------------------------------------------------
// Check 1: all four id="preload-logo-*" tags must be present in index.html.
// ---------------------------------------------------------------------------

for (const { id, basename } of LOGOS) {
  const entry = findLogoEntry(basename);

  if (!entry) {
    // The logo is missing from the Vite manifest entirely. This means Vite
    // inlined it as a base64 data URL or the source file is missing.
    // Either way the plugin could not inject a preload tag — this is a FAIL.
    failures.push(
      `  FAIL  id="${id}" — logo asset "${basename}" not found in Vite manifest.\n` +
        `        Likely cause: Vite inlined the file as a base64 data URL because it is\n` +
        `        below the assetsInlineLimit threshold. Fix: add the basename to the\n` +
        `        assetsInlineLimit guard in vite.config.ts, or verify the asset exists\n` +
        `        in attached_assets/ and is imported by Logo.tsx.`
    );
    continue;
  }

  // The logo is in the manifest — the plugin would have injected a preload tag.
  // Verify the tag survived the full pipeline (logoPreloadPlugin + critters).
  const idPattern = new RegExp(`<link\\b[^>]*\\bid=["']${id}["'][^>]*>`, "i");
  const match = html.match(idPattern);

  if (!match) {
    const preloadTags = [...html.matchAll(/<link\b[^>]*rel=["']preload["'][^>]*>/gi)]
      .map((m) => m[0])
      .join("\n        ");

    failures.push(
      `  FAIL  id="${id}" — tag missing from index.html (manifest file: ${entry.file})\n` +
        `        Most likely cause: criticalCssPlugin (critters) overwrote index.html\n` +
        `        without preserving the preload tag. Check plugin order in vite.config.ts:\n` +
        `        logoPreloadPlugin must run its closeBundle BEFORE criticalCssPlugin.\n` +
        `        Existing preload tags in index.html:\n` +
        `        ${preloadTags || "(none found)"}`
    );
  } else {
    const tag = match[0];
    const needsFetchPriority = id === "preload-logo-en" || id === "preload-logo-ar";
    if (needsFetchPriority && !/fetchpriority=["']high["']/i.test(tag)) {
      failures.push(
        `  FAIL  id="${id}" — tag is present but missing fetchpriority="high".\n` +
          `        Lighthouse will flag this as a low-priority LCP preload request.\n` +
          `        Fix: add fetchpriority="high" to the enTag/arTag strings in\n` +
          `        artifacts/presentail-web/vite.config.ts (logoPreloadPlugin).`
      );
    } else {
      passes.push(
        `  PASS  id="${id}" — ${tag.slice(0, 120)}${tag.length > 120 ? "…" : ""}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Check 2: the inline pruning script must reference all four IDs.
// ---------------------------------------------------------------------------

const inlineScriptMatch = html.match(/<script>([\s\S]*?preload-logo[\s\S]*?)<\/script>/);

if (!inlineScriptMatch) {
  failures.push(
    `  FAIL  Inline pruning script not found in index.html.\n` +
      `        Expected a <script> block containing "preload-logo" IDs injected by\n` +
      `        logoPreloadPlugin. Re-run the Vite build to regenerate index.html.`
  );
} else {
  const scriptBody = inlineScriptMatch[1];

  for (const id of EXPECTED_IDS) {
    if (scriptBody.includes(id)) {
      passes.push(`  PASS  Inline script references "${id}"`);
    } else {
      failures.push(
        `  FAIL  Inline script does NOT reference "${id}".\n` +
          `        The pruning script in vite.config.ts must include all four IDs so the\n` +
          `        runtime can remove whichever tags are not needed for the current locale.\n` +
          `        Check the localeScript template in logoPreloadPlugin (vite.config.ts).`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Report results.
// ---------------------------------------------------------------------------

console.log("check-logo-preload results:");
for (const msg of passes) console.log(msg);

if (failures.length > 0) {
  console.error("\ncheck-logo-preload: FAIL");
  for (const msg of failures) console.error(msg);
  process.exit(1);
}

console.log("\ncheck-logo-preload: PASS");
process.exit(0);
