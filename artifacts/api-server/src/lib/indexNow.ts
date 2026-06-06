/**
 * IndexNow integration — notifies search engines (Google, Bing) instantly
 * when new or updated URLs become available, without waiting for the next
 * scheduled crawl.
 *
 * Protocol: https://www.indexnow.org/documentation
 *
 * Key setup:
 *   The IndexNow key is stored in the INDEXNOW_KEY environment variable and
 *   defaults to the committed value "5b84c9d17f3e4a8a9b6c2d1e5f7a3b2c".
 *   The matching verification file is served by the web artifact at:
 *     https://new.presentail.com/<key>.txt
 *
 *   To rotate the key:
 *     1. Generate a new alphanumeric key (8–128 chars).
 *     2. Create the new key file in artifacts/presentail-web/public/<key>.txt
 *        with the key as the sole file content.
 *     3. Set INDEXNOW_KEY=<new-key> as a Replit secret.
 *     4. Deploy both changes together.
 */

import { logger } from "./logger";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const WEB_HOST = "new.presentail.com";
const DEFAULT_KEY = "5b84c9d17f3e4a8a9b6c2d1e5f7a3b2c";

/** The IndexNow key to use. Falls back to the committed default. */
function getKey(): string {
  return (process.env.INDEXNOW_KEY ?? DEFAULT_KEY).trim();
}

/** IndexNow API batch limit. */
const BATCH_SIZE = 10_000;

/**
 * Submit a list of absolute URLs to the IndexNow endpoint.
 *
 * - Silently no-ops when INDEXNOW_ENABLED=0 (or when the URL list is empty).
 * - Batches requests at BATCH_SIZE to stay within the IndexNow limit.
 * - Failures are logged as warnings; they do not throw to callers.
 *
 * @param urls  Fully-qualified `https://new.presentail.com/…` URLs to submit.
 */
export async function submitIndexNowUrls(urls: string[]): Promise<void> {
  if (process.env.INDEXNOW_ENABLED === "0") return;
  if (urls.length === 0) return;

  const key = getKey();
  const keyLocation = `https://${WEB_HOST}/${key}.txt`;

  const batches: string[][] = [];
  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    batches.push(urls.slice(i, i + BATCH_SIZE));
  }

  for (const batch of batches) {
    const body = JSON.stringify({
      host: WEB_HOST,
      key,
      keyLocation,
      urlList: batch,
    });

    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 10_000);
      const res = await fetch(INDEXNOW_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body,
        signal: ac.signal,
      });
      clearTimeout(t);

      if (res.ok || res.status === 202) {
        logger.info(
          { count: batch.length, status: res.status },
          "indexNow: submitted URLs",
        );
      } else {
        const text = await res.text().catch(() => "");
        logger.warn(
          { status: res.status, body: text.slice(0, 200), count: batch.length },
          "indexNow: submission returned non-OK status",
        );
      }
    } catch (err: unknown) {
      logger.warn(
        {
          err: err instanceof Error ? err.message : String(err),
          count: batch.length,
        },
        "indexNow: submission failed",
      );
    }
  }
}

/**
 * Build canonical IndexNow URLs for a set of taxonomy slugs.
 *
 * Each slug is expanded across all three languages (en/ar/fr) and each
 * country's representative city, mirroring the sitemap's canonical-city
 * pattern from serve.mjs.
 *
 * @param kind   "category" | "occasion" | "brand" | "product"
 * @param slugs  Set of slug strings to expand.
 */
export function buildCanonicalUrls(
  kind: "category" | "occasion" | "brand" | "product",
  slugs: Iterable<string>,
): string[] {
  const LANGS = ["en", "ar", "fr"] as const;
  const CANONICAL_CITIES: Record<string, string> = {
    lb: "beirut",
    ae: "dubai",
    cy: "nicosia",
  };
  const BASE = `https://${WEB_HOST}`;

  const urls: string[] = [];
  for (const slug of slugs) {
    const encoded = encodeURIComponent(slug);
    for (const [country, city] of Object.entries(CANONICAL_CITIES)) {
      for (const lang of LANGS) {
        urls.push(`${BASE}/${lang}-${country}/${city}/${kind}/${encoded}`);
      }
    }
  }
  return urls;
}
