#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

const baseUrl = (process.env.BASE_URL ?? "https://presentail.com").replace(/\/$/, "");
const sourceUrl =
  process.env.SOURCE_URL ??
  "https://os.presentail.com/api/storage/public-objects/products/318/main.png";
const outputPath = process.env.OUTPUT_PATH || "";
const runId = process.env.RUN_ID || new Date().toISOString().replace(/[:.]/g, "-");
const concurrencyLevels = (process.env.CONCURRENCY_LEVELS ?? "1,5,10,25")
  .split(",")
  .map(Number)
  .filter((value) => Number.isInteger(value) && value > 0 && value <= 50);

const clients = {
  browser: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/127 Safari/537.36",
  curl: "curl/8.9.1",
  semrush: "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)",
  googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
};

function proxyUrl(target, width = 800) {
  return `${baseUrl}/api/img/proxy?url=${encodeURIComponent(target)}&w=${width}&f=webp`;
}

function withAuditQuery(raw, suffix) {
  const target = new URL(raw);
  target.searchParams.set("delivery-audit", `${runId}-${suffix}`);
  return target.toString();
}

async function measuredFetch(url, userAgent) {
  const started = performance.now();
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": userAgent,
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    const bytes = (await response.arrayBuffer()).byteLength;
    return {
      status: response.status,
      durationMs: Math.round(performance.now() - started),
      bytes,
      contentType: response.headers.get("content-type"),
      cacheControl: response.headers.get("cache-control"),
      etag: response.headers.get("etag"),
      age: response.headers.get("age"),
      xCache: response.headers.get("x-cache"),
    };
  } catch (error) {
    return {
      status: 0,
      durationMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const source = await measuredFetch(sourceUrl, clients.curl);
const userAgents = {};
for (const [name, userAgent] of Object.entries(clients)) {
  const target = withAuditQuery(sourceUrl, `ua-${name}`);
  userAgents[name] = await measuredFetch(proxyUrl(target), userAgent);
}

const warmTarget = withAuditQuery(sourceUrl, "warm");
const warm = [];
for (let i = 0; i < 3; i += 1) {
  warm.push(await measuredFetch(proxyUrl(warmTarget), clients.browser));
}

const concurrency = {};
for (const level of concurrencyLevels) {
  const target = withAuditQuery(sourceUrl, `c${level}`);
  const results = await Promise.all(
    Array.from({ length: level }, () => measuredFetch(proxyUrl(target), clients.semrush)),
  );
  concurrency[level] = {
    total: results.length,
    statuses: results.reduce((counts, result) => {
      counts[result.status] = (counts[result.status] ?? 0) + 1;
      return counts;
    }, {}),
    minMs: Math.min(...results.map((result) => result.durationMs)),
    maxMs: Math.max(...results.map((result) => result.durationMs)),
    averageMs: Math.round(results.reduce((sum, result) => sum + result.durationMs, 0) / results.length),
    cacheStates: results.reduce((counts, result) => {
      const key = result.xCache ?? "none";
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {}),
  };
}

const report = {
  ranAt: new Date().toISOString(),
  baseUrl,
  sourceAsset: new URL(sourceUrl).pathname,
  source,
  userAgents,
  warm,
  concurrency,
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized);
}
process.stdout.write(serialized);