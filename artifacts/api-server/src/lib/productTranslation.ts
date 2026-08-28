/**
 * productTranslation — machine-translates OS product name + description into
 * Arabic or French using the OpenAI API (same credentials as bannerTranslation).
 *
 * Design decisions:
 * - Cache key: `${osNumericId}:${lang}` — stable across restarts because the
 *   OS numeric ID never changes for a given product.
 * - TTL: 7 days. Product names/descriptions rarely change; this avoids both
 *   cost creep and unnecessary re-translation after restarts.
 * - In-flight deduplication: a second concurrent request for the same key
 *   waits on the first Promise rather than issuing a parallel API call.
 * - Fails open: any error returns the English originals so product pages
 *   never break or go blank.
 * - max_completion_tokens ≥ 4096 — Arabic output can be verbose; lower limits
 *   cause the JSON to be truncated mid-stream and fail to parse.
 */

import crypto from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@workspace/db";
import { productTranslationCacheTable } from "@workspace/db/schema";
import { logger } from "./logger";
import { getOpenAIClient } from "@workspace/integrations-openai-ai-server";
import {
  dedupeCatalogAiRequest,
  runCatalogAiRequest,
  recordCatalogAiCacheStatus,
  recordCatalogAiFallback,
  recordCatalogAiInvocation,
} from "./aiRequest";

export type TranslationLang = "ar" | "fr" | "el";

export interface ProductTranslation {
  name: string;
  description: string;
  /**
   * True when the content is actually in the requested language (translation
   * succeeded or was cached). False when the values are the English fallback,
   * so callers (e.g. the SEO injector) can avoid claiming a language the
   * response does not actually contain.
   */
  translated: boolean;
}

// 7-day TTL — product copy rarely changes
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const cache = new Map<string, { data: ProductTranslation; expiresAt: number }>();

const LANG_NAMES: Record<TranslationLang, string> = {
  ar: "Modern Standard Arabic",
  fr: "French",
  el: "Modern Greek",
};

const SYSTEM_PROMPT =
  `You are a professional translator for a luxury flower and gift delivery brand. ` + // i18n-ignore
  `Translate the product "name" and "description" JSON fields from English into the requested language. ` + // i18n-ignore
  `Rules:\n` +
  `- Keep the warm, elegant tone of a premium gifting brand.\n` + // i18n-ignore
  `- Do NOT translate brand names (e.g. Presentail) or units (e.g. cm).\n` + // i18n-ignore
  `- Return ONLY a valid JSON object with exactly two string keys: "name" and "description". No extra text.`; // i18n-ignore

function cacheKey(osNumericId: number | string, lang: TranslationLang): string {
  return `${osNumericId}:${lang}`;
}

// ── Persistent (Postgres) cache layer ─────────────────────────────────────
//
// The in-memory Map is per-process: every restart/replica used to re-translate
// the whole catalog. The DB layer makes translations survive restarts and be
// shared across autoscale replicas; the Map remains a fast L1 in front of it.

async function persistTranslation(
  osNumericId: number | string,
  lang: TranslationLang,
  data: ProductTranslation,
  expiresAtMs: number,
): Promise<void> {
  try {
    await db
      .insert(productTranslationCacheTable)
      .values({
        osProductId: String(osNumericId),
        lang,
        name: data.name,
        description: data.description,
        expiresAt: new Date(expiresAtMs),
        translatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          productTranslationCacheTable.osProductId,
          productTranslationCacheTable.lang,
        ],
        set: {
          name: data.name,
          description: data.description,
          expiresAt: new Date(expiresAtMs),
          translatedAt: new Date(),
        },
      });
  } catch (err) {
    logger.warn(
      { err: (err as Error)?.message, osNumericId, lang },
      "productTranslation: failed to persist translation", // i18n-ignore
    );
  }
}

async function loadPersistedTranslation(
  osNumericId: number | string,
  lang: TranslationLang,
): Promise<{ data: ProductTranslation; expiresAtMs: number } | null> {
  try {
    const rows = await db
      .select()
      .from(productTranslationCacheTable)
      .where(
        and(
          eq(productTranslationCacheTable.osProductId, String(osNumericId)),
          eq(productTranslationCacheTable.lang, lang),
          gt(productTranslationCacheTable.expiresAt, new Date()),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      data: { name: row.name, description: row.description, translated: true },
      expiresAtMs: row.expiresAt.getTime(),
    };
  } catch (err) {
    logger.warn(
      { err: (err as Error)?.message, osNumericId, lang },
      "productTranslation: failed to read persisted translation", // i18n-ignore
    );
    return null;
  }
}

/**
 * Translate a product's name and description into `lang`.
 *
 * Returns the English originals unchanged on any error so callers never need
 * to handle a failure path — the page will always have some text.
 */
export async function translateProductContent(
  osNumericId: number | string,
  lang: TranslationLang,
  englishName: string,
  englishDescription: string,
): Promise<ProductTranslation> {
  recordCatalogAiInvocation("product_translation");
  const fallback: ProductTranslation = {
    name: englishName,
    description: englishDescription,
    translated: false,
  };

  // Nothing to translate if both fields are empty.
  if (!englishName.trim() && !englishDescription.trim()) return fallback;

  const key = cacheKey(osNumericId, lang);

  // L1 (in-memory) cache hit
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    recordCatalogAiCacheStatus("product_translation", 1, 0);
    return hit.data;
  }

  return dedupeCatalogAiRequest(
    `product-translation:${key}`,
    async () => {
      try {
      // L2 (Postgres) cache hit — survives restarts, shared across replicas.
      const persisted = await loadPersistedTranslation(osNumericId, lang);
      if (persisted) {
        cache.set(key, { data: persisted.data, expiresAt: persisted.expiresAtMs });
        recordCatalogAiCacheStatus("product_translation", 1, 0);
        return persisted.data;
      }
      recordCatalogAiCacheStatus("product_translation", 0, 1);
      const client = getOpenAIClient();
      if (!client) {
        recordCatalogAiFallback("product_translation", "client_unavailable");
        logger.warn("productTranslation: OpenAI client not configured; returning English"); // i18n-ignore
        return fallback;
      }

      const langName = LANG_NAMES[lang];
      const payload = {
        name: englishName.trim(),
        description: englishDescription.trim(),
      };

      try {
        const resp = await runCatalogAiRequest({
          workflow: "product_translation",
          model: "gpt-4o-mini",
          client,
          policy: { timeoutMs: 15_000, maxRetries: 2 },
          request: (requestClient, signal) =>
            requestClient.chat.completions.create(
              {
                model: "gpt-4o-mini",
                max_completion_tokens: 4096,
                messages: [
                  { role: "system", content: SYSTEM_PROMPT },
                  {
                    role: "user",
                    content: `Translate into ${langName}:\n${JSON.stringify(payload)}`, // i18n-ignore
                  },
                ],
              },
              { signal },
            ),
        });

        const raw = (resp.choices[0]?.message?.content ?? "")
            .trim()
            .replace(/^```(?:json)?\n?/, "")
            .replace(/\n?```$/, "");

        const parsed = JSON.parse(raw) as { name?: string; description?: string };

        const gotName =
            typeof parsed.name === "string" && parsed.name.trim().length > 0;
        const gotDescription =
            typeof parsed.description === "string" &&
            parsed.description.trim().length > 0;

          // Only claim success when the model translated every nonempty
          // source field. A partial response (e.g. missing description) would
          // otherwise be cached and reported as localized while half the page
          // is still English — the exact hreflang/content mismatch we guard
          // against downstream.
          const nameOk = !englishName.trim() || gotName;
          const descriptionOk = !englishDescription.trim() || gotDescription;
        if (!nameOk || !descriptionOk) {
          throw new Error(
            `incomplete translation (name: ${gotName}, description: ${gotDescription})`,
          );
        }

        const result: ProductTranslation = {
            name: gotName ? parsed.name!.trim() : englishName,
            description: gotDescription
              ? parsed.description!.trim()
              : englishDescription,
            translated: true,
          };

        const expiresAt = Date.now() + CACHE_TTL_MS;
        cache.set(key, { data: result, expiresAt });
        void persistTranslation(osNumericId, lang, result, expiresAt);
        logger.info(
          { osNumericId, lang, nameLen: result.name.length },
          "productTranslation: cached translation", // i18n-ignore
        );
        return result;
      } catch (err) {
        recordCatalogAiFallback("product_translation", "request_or_parse_failed");
        logger.warn(
          { err: (err as Error)?.message, osNumericId, lang },
          "productTranslation: translation failed; returning English", // i18n-ignore
        );
        return fallback;
      }
    } catch (err) {
      logger.warn(
        { err: (err as Error)?.message, osNumericId, lang },
        "productTranslation: translation failed; returning English", // i18n-ignore
      );
      return fallback;
      }
    },
    () => {
      recordCatalogAiFallback("product_translation", "in_flight_capacity");
      return fallback;
    },
  );
}

/**
 * Invalidate all cached translations for a given product (e.g. after a name
 * change is detected in the OS catalog refresh). Pass only osNumericId to
 * clear all languages; also pass lang to clear a specific pair.
 */
export function invalidateProductTranslation(
  osNumericId: number | string,
  lang?: TranslationLang,
): void {
  if (lang) {
    cache.delete(cacheKey(osNumericId, lang));
    nameCache.delete(cacheKey(osNumericId, lang));
  } else {
    for (const k of cache.keys()) {
      if (k.startsWith(`${osNumericId}:`)) cache.delete(k);
    }
    for (const k of nameCache.keys()) {
      if (k.startsWith(`${osNumericId}:`)) nameCache.delete(k);
    }
  }
}

/** Expose cache size for health/metrics endpoints. */
export function getProductTranslationCacheSize(): number {
  return cache.size;
}

/** True when a fresh full translation is cached for this product+lang. */
export function hasCachedProductTranslation(
  osNumericId: number | string,
  lang: TranslationLang,
): boolean {
  const hit = cache.get(cacheKey(osNumericId, lang));
  return !!hit && hit.expiresAt > Date.now();
}

// ── Batch name-only cache ─────────────────────────────────────────────────
//
// Separate from the full-translation cache so that a batch name-only call
// does not pollute the per-product description cache used by the PDP.
// Cache key: `${osNumericId}:${lang}` — same format as the full cache.

const nameCache = new Map<string, { data: string; expiresAt: number }>();

/**
 * Translate product names in bulk for listing pages (shop grid, category,
 * occasion, brand, homepage rails).
 *
 * Checks the existing per-product full-translation cache first (populated by
 * `translateProductContent`), then the name-only cache. Uncached items are
 * translated in a single OpenAI call. The cache is populated for every
 * translated item so a second request is O(1).
 *
 * Fails open: any error returns the English name for that product.
 *
 * @param items   Array of { osNumericId, name } in English.
 * @param lang    Target language — "ar" or "fr".
 * @returns Map from String(osNumericId) → translated name.
 */
export async function translateProductNamesBatch(
  items: Array<{ osNumericId: number | string; name: string }>,
  lang: TranslationLang,
): Promise<Map<string, string>> {
  recordCatalogAiInvocation("product_name_translation");
  const result = new Map<string, string>();
  const uncached: Array<{ osNumericId: number | string; name: string }> = [];
  let cacheHits = 0;

  for (const item of items) {
    const key = cacheKey(item.osNumericId, lang);
    // Full-translation cache hit (populated by translateProductContent).
    const fullHit = cache.get(key);
    if (fullHit && fullHit.expiresAt > Date.now()) {
      result.set(String(item.osNumericId), fullHit.data.name);
      cacheHits++;
      continue;
    }
    // Name-only cache hit.
    const nameHit = nameCache.get(key);
    if (nameHit && nameHit.expiresAt > Date.now()) {
      result.set(String(item.osNumericId), nameHit.data);
      cacheHits++;
      continue;
    }
    uncached.push(item);
  }

  recordCatalogAiCacheStatus("product_name_translation", cacheHits, uncached.length);
  if (uncached.length === 0) return result;

  const client = getOpenAIClient();
  if (!client) {
    recordCatalogAiFallback("product_name_translation", "client_unavailable");
    logger.warn("productTranslation: OpenAI client not configured; returning English names"); // i18n-ignore
    for (const item of uncached) result.set(String(item.osNumericId), item.name);
    return result;
  }

  const BATCH_SYSTEM_PROMPT =
    `You are a professional translator for a luxury flower and gift delivery brand. ` + // i18n-ignore
    `Translate each product name from English into the requested language. ` + // i18n-ignore
    `Rules:\n` +
    `- Keep the warm, elegant tone of a premium gifting brand.\n` + // i18n-ignore
    `- Do NOT translate brand names (e.g. Presentail) or units (e.g. cm).\n` + // i18n-ignore
    `- Return ONLY a valid JSON object mapping each numeric string key to its translated name. No extra text.`; // i18n-ignore

  // Chunk uncached items to keep each OpenAI response well within the 4096-token
  // output budget. 50 product names → ~300–500 output tokens (safe margin).
  const CHUNK_SIZE = 50;
  const langName = LANG_NAMES[lang];

  for (let start = 0; start < uncached.length; start += CHUNK_SIZE) {
    const chunk = uncached.slice(start, start + CHUNK_SIZE);
    try {
      const payload: Record<string, string> = {};
      for (const item of chunk) {
        if (item.name.trim()) payload[String(item.osNumericId)] = item.name.trim();
      }

      const batchKey = `product-names:${crypto
        .createHash("sha256")
        .update(JSON.stringify([lang, chunk]))
        .digest("hex")}`;
      const resp = await dedupeCatalogAiRequest(batchKey, () =>
        runCatalogAiRequest({
          workflow: "product_name_translation",
          model: "gpt-4o-mini",
          client,
          policy: { timeoutMs: 15_000, maxRetries: 2 },
          request: (requestClient, signal) =>
            requestClient.chat.completions.create(
              {
                model: "gpt-4o-mini",
                max_completion_tokens: 4096,
                messages: [
                  { role: "system", content: BATCH_SYSTEM_PROMPT },
                  {
                    role: "user",
                    content: `Translate into ${langName}:\n${JSON.stringify(payload)}`, // i18n-ignore
                  },
                ],
              },
              { signal },
            ),
        }),
      );

      const raw = (resp.choices[0]?.message?.content ?? "")
        .trim()
        .replace(/^```(?:json)?\n?/, "")
        .replace(/\n?```$/, "");

      const parsed = JSON.parse(raw) as Record<string, string>;
      const expiresAt = Date.now() + CACHE_TTL_MS;

      for (const item of chunk) {
        const idStr = String(item.osNumericId);
        const translated = parsed[idStr];
        const name =
          typeof translated === "string" && translated.trim()
            ? translated.trim()
            : item.name;
        nameCache.set(cacheKey(item.osNumericId, lang), { data: name, expiresAt });
        result.set(idStr, name);
      }

      logger.info(
        { lang, translated: chunk.length, chunk: Math.floor(start / CHUNK_SIZE) + 1 },
        "productTranslation: batch names cached", // i18n-ignore
      );
    } catch (err) {
      recordCatalogAiFallback("product_name_translation", "request_or_parse_failed");
      logger.warn(
        { err: (err as Error)?.message, lang, count: chunk.length },
        "productTranslation: batch translation chunk failed; returning English names", // i18n-ignore
      );
      for (const item of chunk) result.set(String(item.osNumericId), item.name);
    }
  }

  return result;
}
