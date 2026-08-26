#!/usr/bin/env node
/**
 * Repeatable public-storefront benchmark.
 *
 * Records DNS, TCP, TLS, TTFB, full response time, transfer size, status,
 * redirects, compression, effective cache headers, and Server-Timing for a
 * fixed 17-page Semrush matrix plus 10 representative comparison pages.
 * Pass --browser to additionally collect browser navigation timing, LCP, INP,
 * and CLS with Playwright.
 *
 * Usage:
 *   pnpm --filter @workspace/presentail-web benchmark:storefront -- \
 *     --base-url https://presentail.com --repeats 2 --output /tmp/perf.json
 *   pnpm --filter @workspace/presentail-web benchmark:storefront -- \
 *     --base-url http://localhost:19234 --browser
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const SEMRUSH_ROUTES = [
  "/ar-ae/dubai/product/air-filled-happy-birthday-balloon---258",
  "/ar-ae/ras-al-khaimah/faqs",
  "/ar-lb/beirut/product/pink-town-funk",
  "/ar-lb/beirut/product/red-carpet",
  "/en-ae/dubai/product/blue-serenity",
  "/fr-ae/ajman/contact",
  "/fr-ae/fujairah/faqs",
  "/fr-ae/ras-al-khaimah/occasions",
  "/fr-ae/sharjah",
  "/fr-ae/umm-al-quwain/corporate",
  "/en-lb/beirut/product/pink-town-funk",
  "/en-ae/dubai/faqs",
  "/en-ae/dubai/contact",
  "/ar-ae/dubai/corporate",
  "/fr-lb/beirut/category/balloons",
  "/en-lb/beirut/brand/hallab-1881",
  "/fr-lb/beirut/occasion/birthday",
];

const COMPARISON_ROUTES = [
  "/",
  "/en-lb/beirut",
  "/ar-lb/beirut",
  "/fr-lb/beirut",
  "/en-ae/dubai",
  "/en-lb/beirut/faqs",
  "/en-ae/dubai/corporate",
  "/en-lb/beirut/category/balloons",
  "/en-ae/dubai/occasion/birthday",
  "/en-ae/dubai/brand/apple",
];

function readArg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const baseUrl = readArg("base-url", "https://presentail.com").replace(/\/$/, "");
const repeats = Math.max(1, Number(readArg("repeats", "2")) || 2);
const outputPath = path.resolve(readArg("output", "/tmp/storefront-performance.json"));
const includeBrowser = process.argv.includes("--browser");
const enforceBudgets = process.argv.includes("--enforce-budgets");
if (enforceBudgets && !includeBrowser) {
  throw new Error("--enforce-budgets requires --browser so LCP, INP, and CLS cannot be skipped");
}
const tempDir = await mkdtemp(path.join(tmpdir(), "presentail-perf-"));
const BUDGETS = {
  ttfbMs: 800,
  htmlCompleteMs: 1_500,
  lcp: 2_500,
  inp: 200,
  cls: 0.1,
};

function parseLastHeaders(raw) {
  const blocks = raw
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter((block) => /^HTTP\//i.test(block));
  const lines = (blocks.at(-1) ?? "").split(/\r?\n/);
  const headers = {};
  for (const line of lines.slice(1)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }
  return headers;
}

async function measureNetwork(url, mode, run) {
  const slug = Buffer.from(`${mode}-${run}-${url}`).toString("hex").slice(0, 40);
  const headersPath = path.join(tempDir, `${slug}.headers`);
  const bodyPath = path.join(tempDir, `${slug}.body`);
  const format = JSON.stringify({
    status: "%{http_code}",
    redirects: "%{num_redirects}",
    dnsMs: "%{time_namelookup}",
    connectMs: "%{time_connect}",
    tlsMs: "%{time_appconnect}",
    ttfbMs: "%{time_starttransfer}",
    totalMs: "%{time_total}",
    downloadedBytes: "%{size_download}",
    finalUrl: "%{url_effective}",
  });
  const args = [
    "--silent",
    "--show-error",
    "--location",
    "--compressed",
    "--max-time",
    "20",
    "--user-agent",
    "Presentail-Storefront-Performance/1.0",
    "--header",
    "Accept-Encoding: br, gzip",
    "--dump-header",
    headersPath,
    "--output",
    bodyPath,
    "--write-out",
    format,
  ];
  if (mode === "cold") args.push("--header", "Cache-Control: no-cache");
  args.push(url);

  const { stdout } = await execFileAsync("curl", args, { maxBuffer: 2 * 1024 * 1024 });
  const measured = JSON.parse(stdout);
  const headers = parseLastHeaders(await readFile(headersPath, "utf8"));
  return {
    mode,
    run,
    status: Number(measured.status),
    redirects: Number(measured.redirects),
    dnsMs: Number(measured.dnsMs) * 1000,
    connectMs: Number(measured.connectMs) * 1000,
    tlsMs: Number(measured.tlsMs) * 1000,
    ttfbMs: Number(measured.ttfbMs) * 1000,
    totalMs: Number(measured.totalMs) * 1000,
    downloadedBytes: Number(measured.downloadedBytes),
    finalUrl: measured.finalUrl,
    cacheControl: headers["cache-control"] ?? null,
    cdnCacheControl: headers["cdn-cache-control"] ?? null,
    surrogateControl: headers["surrogate-control"] ?? null,
    contentEncoding: headers["content-encoding"] ?? null,
    age: headers.age ? Number(headers.age) : null,
    vary: headers.vary ?? null,
    serverTiming: headers["server-timing"] ?? null,
  };
}

async function measureBrowser(url, browser) {
  const page = await browser.newPage({
    viewport: { width: 1365, height: 768 },
    userAgent: "Presentail-Storefront-Performance-Browser/1.0",
  });
  await page.addInitScript(() => {
    window.__storefrontVitals = { lcp: null, inp: null, cls: 0 };
    window.__storefrontObservers = [];
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      window.__storefrontVitals.lcp = entries.at(-1)?.startTime ?? null;
    });
    lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    window.__storefrontObservers.push(lcpObserver);
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__storefrontVitals.cls += entry.value;
      }
    });
    clsObserver.observe({ type: "layout-shift", buffered: true });
    window.__storefrontObservers.push(clsObserver);
    try {
      const inpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.interactionId && entry.duration > (window.__storefrontVitals.inp ?? 0)) {
            window.__storefrontVitals.inp = entry.duration;
          }
        }
      });
      inpObserver.observe({ type: "event", buffered: true, durationThreshold: 16 });
      window.__storefrontObservers.push(inpObserver);
    } catch {
      // Event Timing is not available in every Chromium build.
    }
  });
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.mouse.wheel(0, 500);
  // Use a deterministic no-navigation interaction so Event Timing emits an
  // INP candidate without mutating storefront state.
  await page.evaluate(() => {
    const probe = document.createElement("button");
    probe.id = "__storefront_perf_probe";
    probe.textContent = "Performance probe";
    probe.style.cssText =
      "position:fixed;left:1px;top:1px;width:12px;height:12px;opacity:.01;z-index:2147483647";
    probe.addEventListener("click", () => {
      // Guarantee one Event Timing candidate while preserving enough idle time
      // to reveal main-thread scheduling delay from the real page.
      const stopAt = performance.now() + 20;
      while (performance.now() < stopAt) {
        // Intentional deterministic benchmark work.
      }
    });
    document.body.append(probe);
  });
  await page.click("#__storefront_perf_probe");
  await page.waitForTimeout(2_500);
  const result = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    return {
      ttfbMs: nav ? nav.responseStart : null,
      htmlCompleteMs: nav ? nav.responseEnd : null,
      domContentLoadedMs: nav ? nav.domContentLoadedEventEnd : null,
      loadMs: nav ? nav.loadEventEnd : null,
      ...window.__storefrontVitals,
    };
  });
  await page.close();
  return { status: response?.status() ?? null, ...result };
}

const browser = includeBrowser
  ? await (async () => {
      const { chromium } = await import("@playwright/test");
      return chromium.launch({
        headless: true,
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      });
    })()
  : null;

const routes = [
  ...SEMRUSH_ROUTES.map((route) => ({ group: "semrush", route })),
  ...COMPARISON_ROUTES.map((route) => ({ group: "comparison", route })),
];
const results = [];
try {
  for (const item of routes) {
    const url = `${baseUrl}${item.route}`;
    const network = [];
    network.push(await measureNetwork(url, "cold", 1));
    for (let run = 1; run <= repeats; run += 1) {
      network.push(await measureNetwork(url, "warm", run));
    }
    const browserResult = browser ? await measureBrowser(url, browser) : null;
    results.push({ ...item, url, network, browser: browserResult });
    const warm = network.at(-1);
    console.log(
      `${item.group.padEnd(10)} ${String(warm.status).padEnd(3)} ` +
        `TTFB ${warm.ttfbMs.toFixed(0).padStart(5)} ms  total ${warm.totalMs.toFixed(0).padStart(5)} ms  ${item.route}`,
    );
  }
} finally {
  await browser?.close();
  await rm(tempDir, { recursive: true, force: true });
}

const report = {
  generatedAt: new Date().toISOString(),
  profile: {
    baseUrl,
    repeats,
    browser: includeBrowser,
    enforceBudgets,
    routeCount: routes.length,
    semrushCount: SEMRUSH_ROUTES.length,
    comparisonCount: COMPARISON_ROUTES.length,
  },
  budgets: BUDGETS,
  results,
};
const budgetResults = [];
for (const result of results) {
  const warm = result.network.at(-1);
  if (warm.status !== 200) continue;
  const values = {
    ttfbMs: warm.ttfbMs,
    htmlCompleteMs: warm.totalMs,
    lcp: result.browser?.lcp ?? null,
    inp: result.browser?.inp ?? null,
    cls: result.browser?.cls ?? null,
  };
  for (const [metric, budget] of Object.entries(BUDGETS)) {
    const value = values[metric];
    budgetResults.push({
      route: result.route,
      metric,
      value,
      budget,
      status: Number.isFinite(value) ? (value <= budget ? "pass" : "fail") : "unavailable",
    });
  }
}
report.budgetSummary = {
  pass: budgetResults.filter((item) => item.status === "pass").length,
  fail: budgetResults.filter((item) => item.status === "fail").length,
  unavailable: budgetResults.filter((item) => item.status === "unavailable").length,
};
report.budgetResults = budgetResults;
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote ${results.length}-route benchmark to ${outputPath}`);
console.log(`Budgets: ${JSON.stringify(report.budgetSummary)}`);
if (
  enforceBudgets &&
  (report.budgetSummary.fail > 0 || report.budgetSummary.unavailable > 0)
) {
  process.exitCode = 1;
}