#!/usr/bin/env node

/**
 * Expo mobile delivery smoke check.
 *
 * Usage:
 *   node scripts/check-static-delivery.mjs \
 *     <manifest-base-url> [manifest-path] [node|static] [asset-base-url]
 *
 * asset-base-url is only needed for local two-port checks. Published traffic
 * uses one origin for both /app/ and /app-static/.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [baseUrlArg, manifestPathArg, deliveryArg, assetBaseUrlArg] =
  process.argv.slice(2);
const baseUrl = baseUrlArg || "http://localhost:20808";
const manifestPath = manifestPathArg || "/app/";
const expectedDelivery = deliveryArg || "node";
const assetBaseUrl = assetBaseUrlArg || baseUrl;
const artifactRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const staticRoot = path.join(artifactRoot, "static-build");

if (!["node", "static"].includes(expectedDelivery)) {
  console.error("Expected delivery must be node or static");
  process.exit(2);
}

function urlFor(pathname, origin = baseUrl) {
  return new URL(pathname, new URL(origin).origin);
}

async function get(url, headers = {}) {
  const started = performance.now();
  const response = await fetch(url, { headers });
  const body = Buffer.from(await response.arrayBuffer());
  return {
    response,
    body,
    latencyMs: Math.round((performance.now() - started) * 100) / 100,
  };
}

function hasVary(response, name) {
  return String(response.headers.get("vary") || "")
    .toLowerCase()
    .split(",")
    .map((value) => value.trim())
    .includes(name.toLowerCase());
}

function expectedManifestPath(platform) {
  const filename =
    expectedDelivery === "static" ? "manifest-static.json" : "manifest.json";
  return path.join(staticRoot, platform, filename);
}

function localPathForAsset(assetUrl) {
  const pathname = new URL(assetUrl).pathname;
  const prefix = expectedDelivery === "static" ? "/app-static/" : "/app/";
  if (!pathname.startsWith(prefix)) {
    throw new Error(`Asset URL ${pathname} does not start with ${prefix}`);
  }
  return path.join(staticRoot, pathname.slice(prefix.length));
}

const checks = [];
const manifests = new Map();

for (const platform of ["ios", "android"]) {
  const result = await get(urlFor(manifestPath), {
    "accept-encoding": "gzip",
    "expo-platform": platform,
  });
  const text = result.body.toString("utf8");
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    manifest = null;
  }
  manifests.set(platform, { ...result, manifest });

  const expectedBytes = fs.readFileSync(expectedManifestPath(platform));
  const expectedPrefix =
    expectedDelivery === "static" ? "/app-static/" : "/app/";
  const launchPath = manifest?.launchAsset?.url
    ? new URL(manifest.launchAsset.url).pathname
    : "";

  checks.push({
    name: `${platform} manifest contract`,
    ok:
      result.response.status === 200 &&
      result.response.headers.get("content-type") === "application/json" &&
      result.response.headers.get("expo-protocol-version") === "1" &&
      result.response.headers.get("expo-sfv-version") === "0" &&
      result.response.headers.get("cache-control") === "no-store" &&
      result.response.headers.get("x-presentail-asset-delivery") ===
        expectedDelivery &&
      hasVary(result.response, "expo-platform") &&
      hasVary(result.response, "accept-encoding") &&
      result.body.equals(expectedBytes) &&
      launchPath.startsWith(expectedPrefix) &&
      launchPath.includes(`/${platform}/bundle.js`),
    status: result.response.status,
    latencyMs: result.latencyMs,
    encoding: result.response.headers.get("content-encoding") || "identity",
  });
}

checks.push({
  name: "platform manifests are distinct",
  ok: !manifests.get("ios").body.equals(manifests.get("android").body),
  status: 200,
  latencyMs: 0,
  encoding: "n/a",
});

const launchUrl = manifests.get("ios").manifest?.launchAsset?.url;
if (!launchUrl) {
  throw new Error("iOS manifest has no launch asset URL");
}
const localBundlePath = localPathForAsset(launchUrl);
const expectedBundleBytes = fs.readFileSync(localBundlePath);
const assetUrl = urlFor(new URL(launchUrl).pathname, assetBaseUrl);

for (const encoding of ["br", "gzip"]) {
  const result = await get(assetUrl, { "accept-encoding": encoding });
  const cacheControl = result.response.headers.get("cache-control") || "";
  checks.push({
    name: `immutable bundle (${encoding})`,
    ok:
      result.response.status === 200 &&
      result.response.headers.get("content-encoding") === encoding &&
      String(result.response.headers.get("content-type")).includes(
        "javascript",
      ) &&
      hasVary(result.response, "accept-encoding") &&
      cacheControl.includes("max-age=31536000") &&
      cacheControl.includes("immutable") &&
      result.body.equals(expectedBundleBytes),
    status: result.response.status,
    latencyMs: result.latencyMs,
    encoding: result.response.headers.get("content-encoding") || "identity",
  });
}

const landing = await get(urlFor(manifestPath), {
  "accept-encoding": "br",
});
checks.push({
  name: "landing page",
  ok:
    landing.response.status === 200 &&
    String(landing.response.headers.get("content-type")).startsWith("text/html") &&
    landing.response.headers.get("content-encoding") === "br" &&
    String(landing.response.headers.get("cache-control")).includes("max-age=300") &&
    landing.body.toString("utf8").includes("Preview this app on your phone"),
  status: landing.response.status,
  latencyMs: landing.latencyMs,
  encoding: landing.response.headers.get("content-encoding") || "identity",
});

for (const check of checks) {
  console.log(
    `${check.ok ? "PASS" : "FAIL"} ${check.name} — ${check.status} ${check.latencyMs}ms ${check.encoding}`,
  );
}

if (checks.some((check) => !check.ok)) {
  process.exit(1);
}