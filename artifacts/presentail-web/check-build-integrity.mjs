#!/usr/bin/env node
/**
 * Post-build integrity check for the presentail-web Vite output.
 *
 * Asserts that the following are present in dist/public after `vite build`:
 *   1. dist/public/index.html        — the SPA shell (fatal if missing)
 *   2. dist/public/site.webmanifest  — the PWA manifest (fatal if missing)
 *   3. At least one hashed JS chunk  — proves the asset pipeline ran (fatal if absent)
 *   4. At least one hashed CSS chunk — proves CSS was emitted (fatal if absent)
 *
 * Exits with code 1 and a clear diagnostic if any check fails so that the
 * deploy build step aborts before a partial or empty build reaches production.
 *
 * Usage (automatically called by the `build` npm script):
 *   node check-build-integrity.mjs [dist-dir]
 *
 * The optional positional argument overrides the default dist directory
 * (useful for tests that write to a temp location).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, process.argv[2] ?? "dist/public"); // i18n-ignore

let failed = false;

/**
 * Check that a specific file exists.
 * @param {string} rel  Path relative to DIST.
 * @param {string} desc Human-readable description used in the error line.
 */
function requireFile(rel, desc) {
  const abs = path.join(DIST, rel);
  try {
    fs.statSync(abs);
  } catch {
    console.error(
      `BUILD INTEGRITY ERROR: ${desc} is missing.\n` +
        `  Expected: ${abs}\n` +
        "  This indicates a partial or failed Vite build.\n" +
        "  Fix: re-run `vite build` and check for build errors above.",
    );
    failed = true;
  }
}

/**
 * Check that at least one file matching the given glob-like pattern exists
 * inside a subdirectory of DIST.
 *
 * @param {string} subdir    Subdirectory of DIST to scan (e.g. "assets").
 * @param {RegExp} pattern   Pattern that a file name must match.
 * @param {string} desc      Human-readable description for the error line.
 */
function requireAtLeastOne(subdir, pattern, desc) {
  const dir = path.join(DIST, subdir);
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    console.error(
      `BUILD INTEGRITY ERROR: ${desc} — assets directory missing.\n` +
        `  Expected directory: ${dir}\n` +
        "  This indicates a partial or failed Vite build.\n" +
        "  Fix: re-run `vite build` and check for build errors above.",
    );
    failed = true;
    return;
  }

  const match = entries.find((name) => pattern.test(name));
  if (!match) {
    console.error(
      `BUILD INTEGRITY ERROR: ${desc} — no matching file found in ${dir}.\n` +
        `  Pattern: ${pattern}\n` +
        "  This indicates a partial or failed Vite build.\n" +
        "  Fix: re-run `vite build` and check for build errors above.",
    );
    failed = true;
  }
}

function rejectProductionWaste() {
  const forbidden = [];
  const stack = [DIST];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
        continue;
      }
      const rel = path.relative(DIST, abs).replaceAll(path.sep, "/");
      if (
        rel.endsWith(".map") ||
        /(?:^|\/)(?:__tests__|tests?|specs?)(?:\/|$)/i.test(rel) ||
        /\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(rel)
      ) {
        forbidden.push(rel);
      }
    }
  }

  const browserJs = path.join(DIST, "assets");
  if (fs.existsSync(browserJs)) {
    const forbiddenModulePatterns = [
      ["Node builtin", /\bnode:(?:fs|path|url|child_process|zlib|util|perf_hooks)\b/],
      ["development plugin", /@replit\/vite-plugin-(?:runtime-error-modal|cartographer|dev-banner)/],
      ["Node-only pg package", /node_modules\/pg(?:\/|["'])/],
    ];
    for (const name of fs.readdirSync(browserJs).filter((file) => file.endsWith(".js"))) {
      const source = fs.readFileSync(path.join(browserJs, name), "utf8");
      for (const [label, pattern] of forbiddenModulePatterns) {
        if (pattern.test(source)) forbidden.push(`${name} (${label})`);
      }
    }
  }

  if (forbidden.length > 0) {
    console.error(
      "BUILD INTEGRITY ERROR: production-only waste was emitted:\n" +
        forbidden.map((entry) => `  ${entry}`).join("\n"),
    );
    failed = true;
  }
}

// ---------------------------------------------------------------------------
// Required outputs
// ---------------------------------------------------------------------------

// 1. SPA shell — without this every page request fails.
requireFile("index.html", "dist/public/index.html (SPA shell)");

// 2. PWA manifest — expected in every complete Vite build.
requireFile("site.webmanifest", "dist/public/site.webmanifest (PWA manifest)");

// 3. At least one hashed JS chunk — Vite emits these as assets/<name>-<hash>.js
//    A missing JS chunk means the bundler did not complete successfully.
requireAtLeastOne(
  "assets",
  /\.js$/,
  "dist/public/assets/*.js (at least one hashed JS chunk)",
);

// 5. Production output must not contain source maps, tests, development
// plugins, or Node-only modules.
rejectProductionWaste();

// 4. At least one hashed CSS chunk — Vite emits these as assets/<name>-<hash>.css.
requireAtLeastOne(
  "assets",
  /\.css$/,
  "dist/public/assets/*.css (at least one hashed CSS chunk)",
);

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

if (failed) {
  console.error(
    "\nBuild integrity check FAILED — aborting deploy to prevent a partial build from reaching production.",
  );
  process.exit(1);
} else {
  console.log("Build integrity check passed ✓");
}
