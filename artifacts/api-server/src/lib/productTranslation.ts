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

import OpenAI from "openai";
import { logger } from "./logger";

export type TranslationLang = "ar" | "fr";

export interface ProductTranslation {
  name: string;
  description: string;
}

// 7-day TTL — product copy rarely changes
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const cache = new Map<string, { data: ProductTranslation; expiresAt: number }>();

// In-flight deduplication — prevents thundering herd when many SSR requests
// arrive simultaneously for the same cold-cache product+language pair.
const inFlight = new Map<string, Promise<ProductTranslation>>();

const LANG_NAMES: Record<TranslationLang, string> = {
  ar: "Modern Standard Arabic",
  fr: "French",
};

const SYSTEM_PROMPT =
  `You are a professional translator for a luxury flower and gift delivery brand. ` + // i18n-ignore
  `Translate the product "name" and "description" JSON fields from English into the requested language. ` + // i18n-ignore
  `Rules:\n` +
  `- Keep the warm, elegant tone of a premium gifting brand.\n` + // i18n-ignore
  `- Do NOT translate brand names (e.g. Presentail) or units (e.g. cm).\n` + // i18n-ignore
  `- Return ONLY a valid JSON object with exactly two string keys: "name" and "description". No extra text.`; // i18n-ignore

function buildClient(): OpenAI | null {
  // Support both the Replit AI proxy and the standard AI Integrations key.
  const replitKey = process.env.REPLIT_AI_API_KEY;
  if (replitKey) {
    return new OpenAI({
      apiKey: replitKey,
      baseURL: "https://openai-proxy.replit.com/v1",
    });
  }
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (baseURL && apiKey) {
    return new OpenAI({ apiKey, baseURL });
  }
  return null;
}

function cacheKey(osNumericId: number | string, lang: TranslationLang): string {
  return `${osNumericId}:${lang}`;
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
  const fallback: ProductTranslation = {
    name: englishName,
    description: englishDescription,
  };

  // Nothing to translate if both fields are empty.
  if (!englishName.trim() && !englishDescription.trim()) return fallback;

  const key = cacheKey(osNumericId, lang);

  // Cache hit
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.data;
  }

  // In-flight deduplication
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<ProductTranslation> => {
    try {
      const client = buildClient();
      if (!client) {
        logger.warn("productTranslation: OpenAI client not configured; returning English"); // i18n-ignore
        return fallback;
      }

      const langName = LANG_NAMES[lang];
      const payload = {
        name: englishName.trim(),
        description: englishDescription.trim(),
      };

      const resp = await client.chat.completions.create({
        model: "gpt-4o-mini",
        max_completion_tokens: 4096,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Translate into ${langName}:\n${JSON.stringify(payload)}`, // i18n-ignore
          },
        ],
      });

      const raw = (resp.choices[0]?.message?.content ?? "")
        .trim()
        .replace(/^```(?:json)?\n?/, "")
        .replace(/\n?```$/, "");

      const parsed = JSON.parse(raw) as { name?: string; description?: string };

      const result: ProductTranslation = {
        name:
          typeof parsed.name === "string" && parsed.name.trim()
            ? parsed.name.trim()
            : englishName,
        description:
          typeof parsed.description === "string" && parsed.description.trim()
            ? parsed.description.trim()
            : englishDescription,
      };

      cache.set(key, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
      logger.info(
        { osNumericId, lang, nameLen: result.name.length },
        "productTranslation: cached translation", // i18n-ignore
      );
      return result;
    } catch (err) {
      logger.warn(
        { err: (err as Error)?.message, osNumericId, lang },
        "productTranslation: translation failed; returning English", // i18n-ignore
      );
      return fallback;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
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
  } else {
    for (const k of cache.keys()) {
      if (k.startsWith(`${osNumericId}:`)) cache.delete(k);
    }
  }
}

/** Expose cache size for health/metrics endpoints. */
export function getProductTranslationCacheSize(): number {
  return cache.size;
}
