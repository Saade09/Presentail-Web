/**
 * submitSitemap.ts
 *
 * Notifies search engines that the sitemap has been updated so they
 * re-crawl and index the new occasion, category, and product image URLs faster.
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
 *   3. Submits the sitemap URL to Google Search Console via the Sitemaps API
 *      so the <image:image> extensions are processed and surfaced in Google
 *      Images promptly.  Requires GSC_CREDENTIALS (base64-encoded service
 *      account JSON with the site verified in GSC).  Skipped gracefully when
 *      the env var is absent.
 *      Pass --skip-gsc to disable GSC submission.
 *
 * Environment variables:
 *   SITEMAP_URL      — override the sitemap URL (default: https://presentail.com/sitemap.xml)
 *   INDEXNOW_KEY     — IndexNow API key (default: 5b84c9d17f3e4a8a9b6c2d1e5f7a3b2c)
 *   GSC_CREDENTIALS  — base64-encoded Google service account JSON with
 *                      "https://www.googleapis.com/auth/webmasters" scope.
 *                      The service account must be added as an owner or full user
 *                      of the https://presentail.com/ property in GSC.
 *                      Encode with: base64 -w 0 service-account.json
 *                      Store as a GitHub Actions secret named GSC_CREDENTIALS.
 */

import { createSign } from "node:crypto";

const SITEMAP_URL =
  process.env.SITEMAP_URL ?? "https://presentail.com/sitemap.xml";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const DEFAULT_INDEXNOW_KEY = "5b84c9d17f3e4a8a9b6c2d1e5f7a3b2c";
const WEB_HOST = "presentail.com";
const INDEXNOW_BATCH_SIZE = 10_000;

// The GSC property URL must match exactly what's verified in Search Console.
// For a URL-prefix property this is the full HTTPS origin with trailing slash.
const GSC_SITE_URL = `https://${WEB_HOST}/`;
const GSC_SITEMAPS_BASE =
  "https://searchconsole.googleapis.com/webmasters/v3/sites";

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

// ── Google Search Console sitemap submission ────────────────────────────────
//
// Uses the Search Console Sitemaps API v3:
//   PUT /webmasters/v3/sites/{siteUrl}/sitemaps/{feedpath}
//
// Authentication: service account JWT (RS256) exchanged for an OAuth2
// access token.  No external npm packages — only Node.js built-in crypto.
//
// Setup (one-time, done by the site owner):
//   1. Create a Google Cloud service account.
//   2. In Google Search Console → Settings → Users and permissions, add the
//      service account email as an Owner or Full User of the
//      https://presentail.com/ property.
//   3. Download the service account JSON key file.
//   4. Base64-encode it: base64 -w 0 service-account.json
//   5. Save the result as a GitHub Actions secret named GSC_CREDENTIALS.
//      (Replit Secrets: set GSC_CREDENTIALS for local runs.)

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getGscAccessToken(sa: ServiceAccount): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = base64url(Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/webmasters",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })));

  const signingInput = `${header}.${payload}`;
  let signature: string;
  try {
    const sign = createSign("RSA-SHA256");
    sign.update(signingInput);
    sign.end();
    signature = base64url(sign.sign(sa.private_key));
  } catch (err: unknown) {
    console.error(
      `[GSC] ✗ Failed to sign JWT: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }

  const jwt = `${signingInput}.${signature}`;

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15_000);
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
      signal: ac.signal,
    });
    clearTimeout(t);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[GSC] ✗ Token exchange failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
      return null;
    }

    const data = (await res.json()) as { access_token?: string };
    if (!data.access_token) {
      console.error("[GSC] ✗ Token response missing access_token.");
      return null;
    }
    return data.access_token;
  } catch (err: unknown) {
    clearTimeout(t);
    console.error(
      `[GSC] ✗ Token request error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Submit (or re-submit) a sitemap URL to Google Search Console so Google
 * processes the <image:image> extensions promptly.
 *
 * Skipped when GSC_CREDENTIALS is not set — allows the script to run without
 * credentials in local dev and contributor CI without breaking anything.
 */
async function submitGoogleSearchConsole(sitemapUrl: string): Promise<void> {
  const credentialsRaw = process.env.GSC_CREDENTIALS;
  if (!credentialsRaw) {
    console.log(
      "\n[GSC] GSC_CREDENTIALS not set — skipping Google Search Console submission.",
    );
    console.log(
      "[GSC] To enable: set GSC_CREDENTIALS to a base64-encoded service account JSON.",
    );
    return;
  }

  console.log("\n[GSC] Submitting sitemap to Google Search Console…");

  let sa: ServiceAccount;
  try {
    const json = Buffer.from(credentialsRaw.trim(), "base64").toString("utf8");
    sa = JSON.parse(json) as ServiceAccount;
    if (!sa.client_email || !sa.private_key) {
      throw new Error("Missing client_email or private_key in credentials JSON.");
    }
  } catch (err: unknown) {
    console.error(
      `[GSC] ✗ Failed to parse GSC_CREDENTIALS: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(`[GSC] Service account: ${sa.client_email}`);
  console.log(`[GSC] GSC property: ${GSC_SITE_URL}`);
  console.log(`[GSC] Sitemap: ${sitemapUrl}`);

  const accessToken = await getGscAccessToken(sa);
  if (!accessToken) {
    process.exitCode = 1;
    return;
  }

  const endpoint =
    `${GSC_SITEMAPS_BASE}/${encodeURIComponent(GSC_SITE_URL)}/sitemaps/${encodeURIComponent(sitemapUrl)}`;

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15_000);
  try {
    const res = await fetch(endpoint, {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: ac.signal,
    });
    clearTimeout(t);

    if (res.ok || res.status === 204) {
      console.log(`[GSC] ✓ Sitemap submitted (HTTP ${res.status})`);
    } else {
      const text = await res.text().catch(() => "");
      console.error(
        `[GSC] ✗ Submission failed (HTTP ${res.status}): ${text.slice(0, 300)}`,
      );
      process.exitCode = 1;
    }
  } catch (err: unknown) {
    clearTimeout(t);
    console.error(
      `[GSC] ✗ Submission error: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const skipIndexNow = process.argv.includes("--skip-indexnow");
  const skipGsc = process.argv.includes("--skip-gsc");
  const indexNowKey = (process.env.INDEXNOW_KEY ?? DEFAULT_INDEXNOW_KEY).trim();

  console.log(`Submitting sitemap: ${SITEMAP_URL}`);

  await pingBing(SITEMAP_URL);

  if (skipIndexNow) {
    console.log("\n[IndexNow] Skipped (--skip-indexnow flag set).");
  } else {
    await submitIndexNow(SITEMAP_URL, indexNowKey);
  }

  if (skipGsc) {
    console.log("\n[GSC] Skipped (--skip-gsc flag set).");
  } else {
    await submitGoogleSearchConsole(SITEMAP_URL);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
