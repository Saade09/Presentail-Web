/**
 * Vitest globalSetup — makes a built `dist/public` a declared prerequisite of
 * the test run.
 *
 * The serve.mjs suites (src/lib/serve-*.test.ts, sitemap/llms/seo-inject
 * tests, *.test.mjs at the package root) spawn `node serve.mjs`, which exits
 * with code 1 at startup when `dist/public/index.html` is missing. On a clean
 * checkout every one of those suites then times out in `beforeAll`. This
 * module runs once per `vitest run` (not per suite): if a build is already
 * present it is reused as-is, otherwise the package's normal production build
 * script (`pnpm --filter @workspace/presentail-web run build`, the same command
 * CI and scripts/run-serve-e2e.sh use) is run with its output streamed. A
 * failing build fails the test run with the build's own error.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PKG_DIR = path.resolve(import.meta.dirname, "..");
const INDEX_HTML = path.join(PKG_DIR, "dist", "public", "index.html");
// Written by scripts/build-artifact-provenance.mjs, the last step of `run
// build`. A build that failed part-way (e.g. at envPlaceholderGuardPlugin)
// still leaves index.html behind, so index.html alone does not mean "built".
const PROVENANCE = path.join(PKG_DIR, "dist", "public", ".build-provenance.json");

// Tracking-ID placeholders in index.html (%VITE_…%). See buildEnv() below.
const TRACKING_PLACEHOLDER_VARS = [
  "VITE_FB_PIXEL_ID_LB",
  "VITE_FB_PIXEL_ID_AE",
  "VITE_GTAG_ADS_ID",
  "VITE_GTAG_GA4_ID",
  "VITE_GTAG_ADS_ID_UAE",
] as const;

/**
 * Environment for the test-only build.
 *
 * This build exists solely to give serve.mjs static assets to serve during
 * unit tests. The production build path (`run build` invoked by deploys and
 * CI) is unaffected: envPlaceholderGuardPlugin in vite.config.ts is untouched
 * and still fails any build where a %VITE_*% placeholder is left unset.
 *
 * Any VITE_* already present in process.env is passed through unchanged. Only
 * the tracking-ID variables that are *unset* are defined as an explicit empty
 * string, so Vite substitutes "" for the placeholder and no fake tracking ID is
 * baked in. CI not providing these VITE_* values to the build is a separate
 * workflow defect (issue #8).
 */
function buildEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  // Vitest sets NODE_ENV=test; build the way CI does (NODE_ENV unset) so Vite
  // produces its normal production bundle.
  delete env.NODE_ENV;
  for (const key of Object.keys(env)) {
    if (key.startsWith("VITEST")) delete env[key];
  }
  for (const key of TRACKING_PLACEHOLDER_VARS) {
    if (env[key] === undefined) env[key] = "";
  }
  return env;
}

export default function setup(): void {
  const hasIndex = fs.existsSync(INDEX_HTML);
  if (hasIndex && fs.existsSync(PROVENANCE)) {
    console.log(
      `[test-global-setup] Reusing existing build at ${path.relative(PKG_DIR, INDEX_HTML)} (not rebuilding).`,
    );
    return;
  }

  console.log(
    hasIndex
      ? `[test-global-setup] ${path.relative(PKG_DIR, INDEX_HTML)} exists but ${path.basename(PROVENANCE)} is missing (incomplete build) — rebuilding once…`
      : `[test-global-setup] ${path.relative(PKG_DIR, INDEX_HTML)} missing — running the production build once so serve.mjs suites have static assets…`,
  );
  const started = Date.now();
  const result = spawnSync(
    "pnpm",
    ["--filter", "@workspace/presentail-web", "run", "build"],
    { cwd: PKG_DIR, env: buildEnv(), stdio: "inherit" },
  );
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  if (result.error) {
    throw new Error(
      `[test-global-setup] Could not start the web build: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `[test-global-setup] Web build failed (exit ${result.status ?? result.signal}) after ${seconds}s — see the build output above.`,
    );
  }
  if (!fs.existsSync(INDEX_HTML) || !fs.existsSync(PROVENANCE)) {
    throw new Error(
      `[test-global-setup] Web build exited 0 but ${INDEX_HTML} / ${path.basename(PROVENANCE)} was not produced.`,
    );
  }
  console.log(`[test-global-setup] Web build finished in ${seconds}s.`);
}
