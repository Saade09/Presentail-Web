/**
 * submitSitemap.ts
 *
 * Notifies search engines that the sitemap has been updated so they
 * re-crawl and index the new occasion and category URLs faster.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run submit-sitemap
 *   SITEMAP_URL=https://new.presentail.com/sitemap.xml pnpm --filter @workspace/scripts run submit-sitemap
 *
 * What it does:
 *   1. Pings Bing Webmaster Tools via their sitemap-ping endpoint.
 *   2. Prints manual steps for Google Search Console (Google deprecated
 *      their ping URL in June 2023; submission must be done through the
 *      Search Console UI or via the Indexing API).
 *
 * Environment variables:
 *   SITEMAP_URL — override the sitemap URL (default: https://new.presentail.com/sitemap.xml)
 */

const SITEMAP_URL =
  process.env.SITEMAP_URL ?? "https://new.presentail.com/sitemap.xml";

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

function printGoogleInstructions(sitemapUrl: string): void {
  console.log(`
[Google Search Console] Manual submission required
  Google deprecated the /ping sitemap URL in June 2023.
  To resubmit the sitemap:
    1. Open https://search.google.com/search-console
    2. Select the "new.presentail.com" property.
    3. Go to Sitemaps (left sidebar).
    4. Enter the sitemap URL below and click Submit:
         ${sitemapUrl}
    5. Google will re-crawl the sitemap within hours to days.

  Tip: If the sitemap is already listed, click the three-dot menu
  next to it and choose "Resubmit" to trigger an immediate re-fetch.
`);
}

async function main(): Promise<void> {
  console.log(`Submitting sitemap: ${SITEMAP_URL}`);
  await pingBing(SITEMAP_URL);
  printGoogleInstructions(SITEMAP_URL);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
