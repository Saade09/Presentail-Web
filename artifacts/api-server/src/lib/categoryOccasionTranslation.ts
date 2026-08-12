/**
 * categoryOccasionTranslation — machine-translates category and occasion
 * English names into Arabic or French using the OpenAI API.
 *
 * Design decisions:
 * - Per-name cache: each individual (lang, name) pair is cached independently
 *   so cache hits are not sensitive to the order or composition of the caller's
 *   array. A different ordering of the same name set always maps each name to
 *   its own cached translation with no index-shift risk.
 * - Batched API call: uncached names are sent in one request (array in → array
 *   out, sorted for stable deduplication) to minimise API round-trips.
 * - In-flight deduplication: concurrent requests for the same uncached set
 *   share one Promise rather than issuing duplicate API calls.
 * - TTL: 24 hours. Category/occasion names rarely change.
 * - Fails open: any error returns the original English names so the carousel
 *   is never blank.
 * - max_completion_tokens ≥ 4096 — Arabic output can be verbose; lower limits
 *   cause the JSON to be truncated mid-stream and fail to parse.
 */

import crypto from "node:crypto";
import OpenAI from "openai";
import { logger } from "./logger";

export type CategoryOccasionLang = "ar" | "fr";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const LANG_NAMES: Record<CategoryOccasionLang, string> = {
  ar: "Modern Standard Arabic",
  fr: "French",
};

// Per-name cache: key = `${lang}:${name}` → translated name + expiry.
// This ensures a different ordering of the same names never produces
// mismatched translations.
type NameCacheEntry = { translated: string; expiresAt: number };
const nameCache = new Map<string, NameCacheEntry>();

// In-flight deduplication keyed on the sorted unique set of names being
// translated. Value is a map of englishName → translatedName.
const inFlight = new Map<string, Promise<Map<string, string>>>();

function buildClient(): OpenAI | null {
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

function inFlightKey(lang: CategoryOccasionLang, sortedUniqueNames: string[]): string {
  const payload = lang + "|" + sortedUniqueNames.join("|");
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

/**
 * Translate an array of English category/occasion name strings into `lang`.
 *
 * Returns the original English names unchanged on any error so callers never
 * need to handle a failure path.
 *
 * The returned array is always the same length as `englishNames` and preserves
 * the original order. Duplicate names in the input receive the same translation
 * from the per-name cache — only one API call is made per unique name.
 */
export async function translateCategoryOccasionNames(
  englishNames: string[],
  lang: CategoryOccasionLang,
): Promise<string[]> {
  if (englishNames.length === 0) return [];

  const now = Date.now();
  const result: string[] = new Array(englishNames.length);

  // Partition into cached (fills result immediately) and uncached.
  const uncachedIndices: number[] = [];
  const uncachedNames: string[] = [];
  for (let i = 0; i < englishNames.length; i++) {
    const name = englishNames[i];
    const hit = nameCache.get(`${lang}:${name}`);
    if (hit && hit.expiresAt > now) {
      result[i] = hit.translated;
    } else {
      uncachedIndices.push(i);
      uncachedNames.push(name);
    }
  }

  if (uncachedIndices.length === 0) return result;

  // Deduplicate and sort uncached names for a stable in-flight key.
  const uniqueUncached = [...new Set(uncachedNames)].sort();
  const key = inFlightKey(lang, uniqueUncached);

  let translationPromise = inFlight.get(key);
  if (!translationPromise) {
    translationPromise = (async (): Promise<Map<string, string>> => {
      const identityMap = new Map(uniqueUncached.map((n) => [n, n]));
      try {
        const client = buildClient();
        if (!client) {
          logger.warn(
            "categoryOccasionTranslation: OpenAI client not configured; returning English", // i18n-ignore
          );
          return identityMap;
        }

        const langName = LANG_NAMES[lang];
        const systemPrompt =
          `You are a professional translator for a luxury flower and gift delivery brand. ` + // i18n-ignore
          `Translate the JSON array of English category/occasion name strings into ${langName}. ` + // i18n-ignore
          `Rules:\n` +
          `- Keep the warm, elegant tone of a premium gifting brand.\n` + // i18n-ignore
          `- Do NOT translate brand names (e.g. Presentail).\n` + // i18n-ignore
          `- Return ONLY a valid JSON array of strings with the same length and order. No extra text.`; // i18n-ignore

        const resp = await client.chat.completions.create({
          model: "gpt-4o-mini",
          max_completion_tokens: 4096,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: JSON.stringify(uniqueUncached) },
          ],
        });

        const raw = (resp.choices[0]?.message?.content ?? "")
          .trim()
          .replace(/^```(?:json)?\n?/, "")
          .replace(/\n?```$/, "");

        const parsed = JSON.parse(raw) as unknown[];
        if (!Array.isArray(parsed) || parsed.length !== uniqueUncached.length) {
          throw new Error(
            `unexpected response length ${parsed.length} vs expected ${uniqueUncached.length}`,
          );
        }

        // Build name → translation map and populate the per-name cache.
        const translationMap = new Map<string, string>();
        const expiresAt = Date.now() + CACHE_TTL_MS;
        for (let j = 0; j < uniqueUncached.length; j++) {
          const englishName = uniqueUncached[j];
          const translated =
            typeof parsed[j] === "string" && (parsed[j] as string).trim()
              ? (parsed[j] as string).trim()
              : englishName;
          translationMap.set(englishName, translated);
          nameCache.set(`${lang}:${englishName}`, { translated, expiresAt });
        }

        logger.info(
          { lang, count: uniqueUncached.length },
          "categoryOccasionTranslation: cached translations", // i18n-ignore
        );
        return translationMap;
      } catch (err) {
        logger.warn(
          { err: (err as Error)?.message, lang },
          "categoryOccasionTranslation: translation failed; returning English", // i18n-ignore
        );
        return identityMap;
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, translationPromise);
  }

  const translationMap = await translationPromise;

  // Fill in uncached positions using the name → translation map.
  for (let j = 0; j < uncachedIndices.length; j++) {
    const i = uncachedIndices[j];
    const name = uncachedNames[j];
    result[i] = translationMap.get(name) ?? name;
  }

  return result;
}

/** Expose cache size for health/metrics endpoints. */
export function getCategoryOccasionTranslationCacheSize(): number {
  return nameCache.size;
}
