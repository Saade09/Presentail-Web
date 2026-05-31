#!/usr/bin/env node
/**
 * Regression check: verify that serve.mjs blocks direct requests for
 * pre-compressed sidecar files (.br / .gz).
 *
 * If a client could fetch /assets/index-abc123.js.br directly, the browser
 * would receive raw Brotli bytes with no Content-Encoding header, producing a
 * corrupted download. serve.mjs must return 404 for any path ending in .br or
 * .gz, regardless of whether the underlying file exists on disk.
 *
 * Usage: node artifacts/presentail-web/scripts/check-sidecar-blocking.mjs [base-url]
 * Defaults to http://localhost:19234
 * Exits 0 on PASS, 1 on FAIL.
 */

const baseUrl = (process.argv[2] ?? "http://localhost:19234").replace(/\/$/, "");

const SIDECAR_PATHS = [
  "/assets/index.js.br",
  "/assets/index.js.gz",
  "/assets/index.css.br",
  "/assets/index.css.gz",
];

async function checkPath(url) {
  let res;
  try {
    res = await fetch(url, { redirect: "manual" });
  } catch (err) {
    return { url, ok: false, reason: `fetch error: ${err.message}` };
  }
  if (res.status === 404) {
    return { url, ok: true, status: res.status };
  }
  return {
    url,
    ok: false,
    reason: `expected HTTP 404 but got ${res.status}`,
    status: res.status,
  };
}

async function main() {
  const results = await Promise.all(
    SIDECAR_PATHS.map((p) => checkPath(`${baseUrl}${p}`))
  );

  let allPassed = true;
  for (const r of results) {
    if (r.ok) {
      console.log(`PASS  ${r.url}  → HTTP ${r.status} (sidecar correctly blocked)`);
    } else {
      console.error(`FAIL  ${r.url}  → ${r.reason}`);
      allPassed = false;
    }
  }

  if (allPassed) {
    console.log("check-sidecar-blocking: all sidecar paths correctly return 404.");
    process.exit(0);
  } else {
    console.error(
      "check-sidecar-blocking: serve.mjs is NOT blocking direct sidecar requests."
    );
    console.error(
      "  Browsers receiving raw .br/.gz bytes without Content-Encoding will render garbage."
    );
    console.error(
      "  Ensure the sidecar-blocking guard in serve.mjs is present and deployed."
    );
    process.exit(1);
  }
}

main();
