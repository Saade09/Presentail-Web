/**
 * Crawl links that are actually present in the HTML delivered for sitemap
 * pages. This deliberately does not inspect source strings: an injected,
 * prerendered, or server-rendered anchor is what a crawler can follow.
 */

export function sameOriginAnchorTargets(html, pageUrl, baseUrl) {
  const origin = new URL(baseUrl).origin;
  const targets = new Set();
  const hrefPattern = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi;

  for (const match of String(html).matchAll(hrefPattern)) {
    const rawHref = match[2].trim();
    if (!rawHref || rawHref.startsWith("#")) continue;
    try {
      const target = new URL(rawHref, pageUrl);
      if (!/^https?:$/.test(target.protocol) || target.origin !== origin) continue;
      target.hash = "";
      targets.add(target.href);
    } catch {
      // A malformed href is not a fetchable same-origin HTTP target.
    }
  }
  return [...targets];
}

/**
 * Fetch a bounded, de-duplicated set of emitted anchors. A redirect is
 * followed, then the final response must be successful; a link that lands on
 * a retired 404/410 is consequently reported rather than hidden by a 3xx.
 */
export async function crawlEmittedLinks({
  pages,
  baseUrl,
  concurrency = 8,
  limit = 500,
  fetchImpl = fetch,
}) {
  const sourcesByTarget = new Map();
  for (const { url, html } of pages) {
    for (const target of sameOriginAnchorTargets(html, url, baseUrl)) {
      if (!sourcesByTarget.has(target)) sourcesByTarget.set(target, url);
    }
  }

  // Product anchors are the most brittle authored destinations (a catalog
  // product can retire between deploys), so always validate them before the
  // generic navigation links when the bounded budget is reached.
  const targets = [...sourcesByTarget.keys()]
    .sort((a, b) => Number(b.includes("/product/")) - Number(a.includes("/product/")))
    .slice(0, Math.max(0, limit));
  const results = new Array(targets.length);
  let next = 0;
  const workers = Math.min(Math.max(1, concurrency), targets.length);
  await Promise.all(Array.from({ length: workers }, async () => {
    while (next < targets.length) {
      const index = next++;
      const url = targets[index];
      try {
        const response = await fetchImpl(url, {
          headers: { "user-agent": "Presentail-SEO-Validator/1.0" },
          redirect: "follow",
        });
        results[index] = {
          url,
          source: sourcesByTarget.get(url),
          status: response.status,
          finalUrl: response.url || url,
          ok: response.ok,
        };
      } catch (error) {
        results[index] = {
          url,
          source: sourcesByTarget.get(url),
          status: 0,
          finalUrl: url,
          ok: false,
          detail: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }));

  return {
    discovered: sourcesByTarget.size,
    checked: targets.length,
    truncated: sourcesByTarget.size > targets.length,
    results,
    issues: results
      .filter((result) => !result.ok)
      .map((result) => ({
        code: "emitted-link-failed",
        url: result.url,
        detail: `${result.status || "fetch failed"} from ${result.source}${result.detail ? `: ${result.detail}` : ""}`,
      })),
  };
}