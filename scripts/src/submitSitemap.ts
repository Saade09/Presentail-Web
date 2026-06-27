/**
 * submitSitemap.ts
 *
 * Notifies search engines that the sitemap has been updated so they
 * re-crawl and index the new occasion and category URLs faster.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run submit-sitemap
 *   SITEMAP_URL=https://presentail.com/sitemap.xml pnpm --filter @workspace/scripts run submit-sitemap
 *
 * What it does:
 *   1. Pings Bing Webmaster Tools via their sitemap-ping endpoint.
 *   2. Submits all URLs in the sitemap to the IndexNow endpoint so Google
 *      and Bing index new pages without waiting for the next scheduled crawl.
 *      Requires INDEXNOW_KEY (defaults to the committed key
 *      "5b84c9d17f3e4a8a9b6c2d1e5f7a3b2c" if unset).
 *      Pass --skip-indexnow to disable IndexNow submission.
 *
 * Environment variables:
 *   SITEMAP_URL     — override the sitemap URL (default: https://presentail.com/sitemap.xml)
 *   INDEXNOW_KEY    — IndexNow API key (default: 5b84c9d17f3e4a8a9b6c2d1e5f7a3b2c)
 */

const SITEMAP_URL =
  process.env.SITEMAP_URL ?? "https://presentail.com/sitemap.xml";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const DEFAULT_INDEXNOW_KEY = "5b84c9d17f3e4a8a9b6c2d1e5f7a3b2c";
const WEB_HOST = "presentail.com";
const INDEXNOW_BATCH_SIZE = 10_000;

// ── Bing sitemap ping ───────────────────────────────────────────────────────

async function pingBing(sitemapUrl: string): Promise<void> {
  const pingUrl = `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
  console.log(`\n[Bing] Pinging: ${pingUrl}`);
  const res = await fetch(pingUrl, { method: "GET" });
  if (res.ok) {
    console.log(`[Bing] ✓ Accepted (HTTP ${res.status})`);
  } else {
    const body = await res.text().catch(() => "");
    console.error(`[Bing] ✗ Failed (HTTP ${res.status}): ${body.slice(0, 200)}`);
    process.exitCode = 1;
  }
}

// ── Sitemap XML fetching and parsing ────────────────────────────────────────

async function fetchSitemapXml(sitemapUrl: string): Promise<string | null> {
  console.log(`\n[IndexNow] Fetching sitemap: ${sitemapUrl}`);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 30_000);
  try {
    const res = await fetch(sitemapUrl, { signal: ac.signal });
    if (!res.ok) {
      console.error(
        `[IndexNow] ✗ Failed to fetch sitemap (HTTP ${res.status})`,
      );
      return null;
    }
    return await res.text();
  } catch (err: unknown) {
    console.error(
      `[IndexNow] ✗ Failed to fetch sitemap: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Parse all <loc> values from a sitemap XML string.
 * Handles both standard sitemaps and sitemap index files.
 */
function parseSitemapUrls(xml: string): string[] {
  const urls: string[] = [];
  const locRegex = /<loc>\s*([^<]+)\s*<\/loc>/g;
  let match: RegExpExecArray | null;
  while ((match = locRegex.exec(xml)) !== null) {
    const url = match[1].trim()
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
    if (url.startsWith("http")) {
      urls.push(url);
    }
  }
  return urls;
}

// ── IndexNow submission ─────────────────────────────────────────────────────

async function submitBatch(
  key: string,
  keyLocation: string,
  batch: string[],
  batchNum: number,
  totalBatches: number,
): Promise<boolean> {
  const batchLabel = totalBatches > 1 ? ` (batch ${batchNum}/${totalBatches})` : "";
  const body = JSON.stringify({
    host: WEB_HOST,
    key,
    keyLocation,
    urlList: batch,
  });

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15_000);
  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body,
      signal: ac.signal,
    });
    clearTimeout(t);

    if (res.ok || res.status === 202) {
      console.log(
        `[IndexNow] ✓ Submitted ${batch.length} URLs${batchLabel} (HTTP ${res.status})`,
      );
      return true;
    } else {
      const text = await res.text().catch(() => "");
      console.error(
        `[IndexNow] ✗ Submission failed${batchLabel} (HTTP ${res.status}): ${text.slice(0, 200)}`,
      );
      return false;
    }
  } catch (err: unknown) {
    clearTimeout(t);
    console.error(
      `[IndexNow] ✗ Submission error${batchLabel}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

async function submitIndexNow(
  sitemapUrl: string,
  key: string,
): Promise<void> {
  const keyLocation = `https://${WEB_HOST}/${key}.txt`;
  console.log(`\n[IndexNow] Key: ${key}`);
  console.log(`[IndexNow] Key location: ${keyLocation}`);

  const xml = await fetchSitemapXml(sitemapUrl);
  if (!xml) {
    console.error("[IndexNow] ✗ Skipping submission — could not fetch sitemap.");
    process.exitCode = 1;
    return;
  }

  const urls = parseSitemapUrls(xml);
  if (urls.length === 0) {
    console.error("[IndexNow] ✗ No URLs found in sitemap — nothing to submit.");
    process.exitCode = 1;
    return;
  }

  console.log(`[IndexNow] Found ${urls.length} URLs in sitemap.`);

  const batches: string[][] = [];
  for (let i = 0; i < urls.length; i += INDEXNOW_BATCH_SIZE) {
    batches.push(urls.slice(i, i + INDEXNOW_BATCH_SIZE));
  }

  let allOk = true;
  for (let i = 0; i < batches.length; i++) {
    const ok = await submitBatch(key, keyLocation, batches[i], i + 1, batches.length);
    if (!ok) allOk = false;
  }

  if (!allOk) process.exitCode = 1;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const skipIndexNow = process.argv.includes("--skip-indexnow");
  const indexNowKey = (process.env.INDEXNOW_KEY ?? DEFAULT_INDEXNOW_KEY).trim();

  console.log(`Submitting sitemap: ${SITEMAP_URL}`);

  await pingBing(SITEMAP_URL);

  if (skipIndexNow) {
    console.log("\n[IndexNow] Skipped (--skip-indexnow flag set).");
  } else {
    await submitIndexNow(SITEMAP_URL, indexNowKey);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
