#!/usr/bin/env node
// Regression check: verify the web server returns a compressed HTML response.
// Usage: node artifacts/presentail-web/scripts/check-compression.mjs [url]
// Defaults to http://localhost:80/
// Exits 0 on PASS, 1 on FAIL.

const target = process.argv[2] ?? "http://localhost:80/";

async function check() {
  let res;
  try {
    res = await fetch(target, {
      headers: { "accept-encoding": "gzip, br" },
      redirect: "follow",
    });
  } catch (err) {
    console.error(`FAIL  Could not reach ${target}: ${err.message}`);
    process.exit(1);
  }

  const encoding = res.headers.get("content-encoding") ?? "";
  const vary = res.headers.get("vary") ?? "";
  const status = res.status;

  const encodingOk = encoding === "br" || encoding === "gzip";
  const varyOk = vary.toLowerCase().includes("accept-encoding");

  if (encodingOk && varyOk) {
    console.log(`PASS  ${target}`);
    console.log(`      HTTP ${status} | content-encoding: ${encoding} | vary: ${vary}`);
    process.exit(0);
  }

  console.error(`FAIL  ${target}`);
  console.error(`      HTTP ${status} | content-encoding: "${encoding}" (expected "br" or "gzip")`);
  console.error(`      vary: "${vary}" (expected to include "Accept-Encoding")`);
  if (!encodingOk) {
    console.error("      The server did not compress the HTML response.");
    console.error("      Check that serve.mjs is running and Accept-Encoding was forwarded.");
  }
  process.exit(1);
}

check();
