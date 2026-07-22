#!/usr/bin/env node
/**
 * check-clarity-snippet.mjs
 *
 * Asserts that the Microsoft Clarity analytics snippet is present in the built
 * dist/public/index.html with the correct project ID.
 *
 * The snippet is injected at build time by clarityInjectPlugin() in
 * vite.config.ts (production mode only). This check runs against the built
 * output so it catches any regression where:
 *
 *   - clarityInjectPlugin was accidentally disabled or removed.
 *   - The build ran in a non-production mode and the snippet was silently skipped.
 *   - The project ID was changed to an unexpected value.
 *   - The snippet structure drifted from the canonical Clarity tag.
 *
 * What is verified:
 *   1. index.html exists (build ran).
 *   2. The canonical Clarity CDN URL (www.clarity.ms/tag/) appears in the HTML.
 *   3. The expected project ID (mik1damp04) appears immediately after the CDN URL.
 *   4. The snippet uses the official obfuscated loader variable name ("clarity").
 *   5. The snippet is inside a <script> block (not a dangling string literal).
 *
 * Usage:
 *   node artifacts/presentail-web/scripts/check-clarity-snippet.mjs [distDir]
 *
 * distDir defaults to <script-dir>/../dist/public
 * Exits 0 on PASS, 1 on FAIL.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, "../dist/public");

const htmlPath = path.join(distDir, "index.html");

console.log(`\ncheck-clarity-snippet  (distDir: ${distDir})`);

if (!fs.existsSync(htmlPath)) {
  console.error(
    `  FAIL  index.html not found at ${htmlPath}\n` +
      `        Make sure the Vite production build has run before executing this check.\n` +
      `        Run: pnpm --filter @workspace/presentail-web run build`
  );
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, "utf8");

const CLARITY_PROJECT_ID = "mik1damp04";
const CDN_URL = "www.clarity.ms/tag/";
const LOADER_VAR = `"clarity"`;

const failures = [];

// 1. CDN URL must be present — confirms the snippet was injected.
if (!html.includes(CDN_URL)) {
  failures.push(
    `  ❌  Clarity CDN URL ("${CDN_URL}") not found in index.html.\n` +
      `      The clarityInjectPlugin in vite.config.ts may have been disabled\n` +
      `      or the build did not run in production mode (mode=production).`
  );
} else {
  console.log(`  ✓  Clarity CDN URL present (${CDN_URL})`);
}

// 2. Project ID must appear immediately after the CDN URL.
const expectedCdnRef = `${CDN_URL}${CLARITY_PROJECT_ID}`;
if (!html.includes(expectedCdnRef)) {
  failures.push(
    `  ❌  Project ID "${CLARITY_PROJECT_ID}" not found after CDN URL.\n` +
      `      Expected: "${expectedCdnRef}"\n` +
      `      Check that CLARITY_PROJECT_ID in clarityInjectPlugin() (vite.config.ts)\n` +
      `      still equals "${CLARITY_PROJECT_ID}".`
  );
} else {
  console.log(`  ✓  Clarity project ID correct (${CLARITY_PROJECT_ID})`);
}

// 3. The loader variable name must be "clarity" — confirms the canonical snippet
//    shape, not an ad-hoc inline reference.
if (!html.includes(LOADER_VAR)) {
  failures.push(
    `  ❌  Clarity loader variable name (${LOADER_VAR}) not found in index.html.\n` +
      `      The snippet structure may have diverged from the canonical Clarity tag.\n` +
      `      Verify clarityInjectPlugin() in vite.config.ts matches the official snippet.`
  );
} else {
  console.log(`  ✓  Clarity loader variable name present (${LOADER_VAR})`);
}

// 4. The snippet must be inside a <script> block — catches the edge case where
//    the injection target (</head>) was not found and the snippet landed outside
//    a valid script context.
const scriptBlockRe = /<script>[^<]*clarity[^<]*<\/script>/;
if (!scriptBlockRe.test(html)) {
  failures.push(
    `  ❌  Clarity snippet does not appear inside a <script> block.\n` +
      `      The injection target ("</head>") may have been missing from index.html.\n` +
      `      Check that clarityInjectPlugin.transformIndexHtml found the closing </head> tag.`
  );
} else {
  console.log(`  ✓  Clarity snippet is inside a <script> block`);
}

console.log("");

if (failures.length > 0) {
  for (const msg of failures) {
    console.error(msg);
  }
  console.error(
    `FAIL  ${failures.length} check(s) failed.\n\n` +
      `      Clarity session recordings will NOT be captured until this is fixed.\n` +
      `      The snippet is injected by clarityInjectPlugin() in:\n` +
      `        artifacts/presentail-web/vite.config.ts\n\n` +
      `      Common causes:\n` +
      `        • Build ran without mode=production (clarityInjectPlugin uses apply:"build"\n` +
      `          and is guarded by mode==="production" in the plugin array).\n` +
      `        • The clarityInjectPlugin entry was removed from the plugins array.\n` +
      `        • CLARITY_PROJECT_ID was changed from "mik1damp04".`
  );
  process.exit(1);
}

console.log(
  `PASS  Clarity snippet is present and correctly formed in index.html.\n` +
    `      Project ID : ${CLARITY_PROJECT_ID}\n` +
    `      CDN ref    : ${CDN_URL}${CLARITY_PROJECT_ID}`
);
process.exit(0);
