#!/usr/bin/env node
// Regression check: verify the web server returns a compressed HTML response.
// Usage: node artifacts/presentail-web/scripts/check-compression.mjs [url...]
// Defaults to http://localhost:80/.

import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";

const targets = process.argv.slice(2);
if (targets.length === 0) targets.push("http://localhost:80/");

function request(target, acceptEncoding) {
  return new Promise((resolve, reject) => {
    const url = new URL(target);
    const transport = url.protocol === "https:" ? https : http;
    const req = transport.request(
      {
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        headers: { "accept-encoding": acceptEncoding },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => resolve({
          status: res.statusCode ?? 0,
          encoding: res.headers["content-encoding"] ?? "",
          vary: res.headers.vary ?? "",
          body: Buffer.concat(chunks),
        }));
      },
    );
    req.setTimeout(15_000, () => req.destroy(new Error("request timed out")));
    req.on("error", reject);
    req.end();
  });
}

function decode(response) {
  if (response.encoding === "br") return zlib.brotliDecompressSync(response.body);
  if (response.encoding === "gzip") return zlib.gunzipSync(response.body);
  return response.body;
}

function assertExpectedHtml(target, body) {
  const html = body.toString("utf8");
  if (!/<(?:!doctype html|html\b)/i.test(html)) {
    throw new Error(`${target} response does not look like HTML`);
  }
  const pathname = new URL(target).pathname;
  if (
    /^\/(?:product|brand|occasion|category)\/[^/]+\/?$/.test(pathname) &&
    (!html.includes('http-equiv="refresh"') || !html.includes("window.location.replace"))
  ) {
    throw new Error(`${target} share response is missing preview redirect markup`);
  }
}

async function checkTarget(target) {
  let identity;
  try {
    identity = await request(target, "identity");
  } catch (err) {
    throw new Error(`Could not reach ${target}: ${err.message}`);
  }

  if (identity.status !== 200 || identity.encoding) {
    throw new Error(
      `${target} identity response was HTTP ${identity.status} with content-encoding "${identity.encoding}"`,
    );
  }

  const identityBody = decode(identity);
  assertExpectedHtml(target, identityBody);

  for (const [acceptEncoding, expectedEncoding] of [["br", "br"], ["gzip", "gzip"]]) {
    const response = await request(target, acceptEncoding);
    const vary = String(response.vary);
    if (
      response.status !== 200 ||
      response.encoding !== expectedEncoding ||
      !vary.toLowerCase().includes("accept-encoding")
    ) {
      throw new Error(
        `${target} ${acceptEncoding} response was HTTP ${response.status} with ` +
        `content-encoding "${response.encoding}" and vary "${vary}"`,
      );
    }
    const decoded = decode(response);
    assertExpectedHtml(target, decoded);
    if (response.body.length >= identity.body.length) {
      throw new Error(
        `${target} ${expectedEncoding} body is not smaller than identity ` +
        `(${response.body.length} >= ${identity.body.length} bytes)`,
      );
    }
    console.log(
      `PASS  ${target} — ${expectedEncoding} ${response.body.length} bytes ` +
      `(identity ${identity.body.length} bytes)`,
    );
  }
}

try {
  for (const target of targets) await checkTarget(target);
} catch (err) {
  console.error(`FAIL  ${err.message}`);
  process.exitCode = 1;
}
