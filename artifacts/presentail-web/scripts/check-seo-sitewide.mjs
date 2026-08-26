#!/usr/bin/env node
import {
  findCrossDocumentDuplicates,
  findHreflangConsistencyIssues,
  validateSeoDocument,
} from "./seo-checks/metadata-validator.mjs";

function argValue(name, fallback) {
  const equals = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const BASE = String(
  argValue("--base-url", process.argv.find((arg) => /^https?:\/\//.test(arg)) ?? "https://presentail.com"),
).replace(/\/+$/, "");
const CONCURRENCY = Math.max(1, Math.min(32, Number(argValue("--concurrency", "8")) || 8));
const LIMIT = Math.max(0, Number(argValue("--limit", "0")) || 0);
const DRY_RUN = process.argv.includes("--dry-run");

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "Presentail-SEO-Validator/1.0" },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

function xmlLocations(xml) {
  return [...String(xml).matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map((match) => match[1].replace(/&amp;/g, "&").trim())
    .filter(Boolean);
}

function onScanOrigin(value, scanBase = BASE) {
  const parsed = new URL(value, scanBase);
  const baseUrl = new URL(scanBase);
  parsed.protocol = baseUrl.protocol;
  parsed.host = baseUrl.host;
  return parsed.href;
}

export async function enumerateIndexableRoutes(base = BASE) {
  const sitemapUrl = `${String(base).replace(/\/+$/, "")}/sitemap.xml`;
  const rootXml = await fetchText(sitemapUrl);
  const rootLocations = xmlLocations(rootXml);
  const childSitemaps = /<sitemapindex\b/i.test(rootXml)
    ? rootLocations
    : [];
  const pageUrls = /<urlset\b/i.test(rootXml)
    ? rootLocations
    : [];
  for (const child of childSitemaps) {
    pageUrls.push(...xmlLocations(await fetchText(onScanOrigin(child, base))));
  }
  return [...new Set(pageUrls.map((url) => onScanOrigin(url, base)))];
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

export async function scanSeoRoutes({ base = BASE, concurrency = CONCURRENCY, limit = LIMIT } = {}) {
  const allUrls = await enumerateIndexableRoutes(base);
  const urls = limit > 0 ? allUrls.slice(0, limit) : allUrls;
  const results = await mapConcurrent(urls, concurrency, async (url) => {
    try {
      const html = await fetchText(url);
      return validateSeoDocument(html, url);
    } catch (error) {
      return {
        url,
        title: "",
        h1: "",
        description: "",
        issues: [{ code: "fetch-failed", detail: error instanceof Error ? error.message : String(error) }],
      };
    }
  });
  return {
    discovered: allUrls.length,
    scanned: urls.length,
    results,
    duplicates: findCrossDocumentDuplicates(results),
    hreflangIssues: findHreflangConsistencyIssues(results),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`SEO site-wide audit — ${BASE}`);
  console.log(`Concurrency: ${CONCURRENCY}${LIMIT ? `, limit: ${LIMIT}` : ""}`);
  const report = await scanSeoRoutes();
  let issueCount = 0;
  for (const result of report.results) {
    for (const issue of result.issues) {
      issueCount++;
      console.error(`FAIL  ${issue.code}  ${result.url}\n      ${issue.detail}`);
    }
  }
  for (const duplicate of report.duplicates) {
    issueCount++;
    console.error(`FAIL  ${duplicate.code}\n      ${duplicate.urls.join("\n      ")}`);
  }
  for (const issue of report.hreflangIssues) {
    issueCount++;
    console.error(`FAIL  ${issue.code}  ${issue.url}\n      ${issue.detail}`);
  }
  console.log(`Coverage: discovered ${report.discovered}, scanned ${report.scanned}`);
  console.log(`Findings: ${issueCount}`);
  if (issueCount > 0 && !DRY_RUN) process.exitCode = 1;
}