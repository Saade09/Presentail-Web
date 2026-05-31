#!/usr/bin/env node
// Verify the Vite build output exists and is fresh enough to have been
// produced by the current CI build step (not a stale cached artifact).
//
// Usage: node artifacts/presentail-web/scripts/check-dist-fresh.mjs [distDir] [maxAgeSeconds]
//   distDir       — path to the built public dir  (default: dist/public)
//   maxAgeSeconds — reject files older than this  (default: 600 = 10 min)
//
// Exits 0 on PASS, 1 on FAIL.

import { statSync } from "node:fs";
import { resolve } from "node:path";

const distDir = process.argv[2] ?? "dist/public";
const maxAgeSeconds = Number(process.argv[3] ?? 600);
const sentinel = resolve(distDir, "index.html");

let stat;
try {
  stat = statSync(sentinel);
} catch {
  console.error(`FAIL  ${sentinel} not found.`);
  console.error("      Run 'pnpm --filter @workspace/presentail-web run build' first.");
  process.exit(1);
}

const ageSeconds = (Date.now() - stat.mtimeMs) / 1000;

if (ageSeconds > maxAgeSeconds) {
  const age = Math.round(ageSeconds);
  console.error(`FAIL  ${sentinel} is ${age}s old (limit: ${maxAgeSeconds}s).`);
  console.error("      The file looks like a stale cached artifact from a previous run.");
  console.error("      Run the build step again to produce a fresh dist.");
  process.exit(1);
}

const age = ageSeconds.toFixed(1);
console.log(`PASS  ${sentinel}`);
console.log(`      Age: ${age}s (limit: ${maxAgeSeconds}s) — build output is fresh.`);
