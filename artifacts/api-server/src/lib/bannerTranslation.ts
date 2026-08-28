import crypto from "node:crypto";
import { getOpenAIClient } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";
import {
  dedupeCatalogAiRequest,
  recordCatalogAiCacheStatus,
  recordCatalogAiFallback,
  recordCatalogAiInvocation,
  runCatalogAiRequest,
} from "./aiRequest";

export type BannerLang = "ar" | "fr" | "el";

export type BannerTextFields = {
  title?: string;
  headline?: string;
  subtitle?: string;
  ctaText?: string;
};

const LANG_NAMES: Record<BannerLang, string> = {
  ar: "Modern Standard Arabic",
  fr: "French",
  el: "Modern Greek",
};

// In-process translation cache — keyed by sha256(lang + sorted-field-values).
// Survives as long as the API server process runs (~hours on Replit).
// TTL of 1 hour avoids staleness after banner copy is edited in the OS admin.
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { fields: BannerTextFields; expiresAt: number }>();

function contentHash(lang: BannerLang, fields: BannerTextFields): string {
  const payload = lang + JSON.stringify([fields.title, fields.headline, fields.subtitle, fields.ctaText]);
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 20);
}

function hasText(f: BannerTextFields): boolean {
  return !!(f.title?.trim() || f.headline?.trim() || f.subtitle?.trim() || f.ctaText?.trim());
}

function onlyTextFields(f: BannerTextFields): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.title?.trim()) out.title = f.title;
  if (f.headline?.trim()) out.headline = f.headline;
  if (f.subtitle?.trim()) out.subtitle = f.subtitle;
  if (f.ctaText?.trim()) out.ctaText = f.ctaText;
  return out;
}

// Translate all banner text fields for a set of banners in a single LLM call.
// Banners with no text fields are passed through unchanged.
// On any LLM error the English originals are returned (never throws).
export async function translateBanners(
  lang: BannerLang,
  banners: BannerTextFields[],
): Promise<BannerTextFields[]> {
  recordCatalogAiInvocation("banner_translation");
  const results: BannerTextFields[] = banners.map((b) => ({ ...b }));
  const toTranslateIndices: number[] = [];
  const translationInputs: Record<string, string>[] = [];
  let cacheHits = 0;

  for (let i = 0; i < banners.length; i++) {
    const b = banners[i];
    if (!hasText(b)) continue;

    const key = contentHash(lang, b);
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      Object.assign(results[i], cached.fields);
      cacheHits++;
      continue;
    }
    toTranslateIndices.push(i);
    translationInputs.push(onlyTextFields(b));
  }

  recordCatalogAiCacheStatus("banner_translation", cacheHits, toTranslateIndices.length);
  if (toTranslateIndices.length === 0) return results;

  const client = getOpenAIClient();
  if (!client) {
    recordCatalogAiFallback("banner_translation", "client_unavailable");
    logger.warn("bannerTranslation: OpenAI client not configured; returning English text");
    return results;
  }

  const langName = LANG_NAMES[lang];
  const systemPrompt =
    `You are a professional translator for a luxury flower and gift delivery brand. ` + // i18n-ignore
    `Translate the string values in the provided JSON array into ${langName}. ` + // i18n-ignore
    `Each element is an object with some of these keys: title, headline, subtitle, ctaText. ` + // i18n-ignore
    `Rules:\n` +
    `- Keep the elegant, warm tone of a luxury brand.\n` +
    `- Do NOT translate brand names (e.g. Presentail) or product category names.\n` +
    `- Return ONLY a valid JSON array with the same length and same keys — no extra text.`;

  try {
    const requestKey = `banner:${contentHash(lang, { title: JSON.stringify(translationInputs) })}`;
    const resp = await dedupeCatalogAiRequest(requestKey, () =>
      runCatalogAiRequest({
        workflow: "banner_translation",
        model: "gpt-5-nano",
        client,
        policy: { timeoutMs: 15_000, maxRetries: 2 },
        request: (requestClient, signal) =>
          requestClient.chat.completions.create(
            {
              model: "gpt-5-nano",
              max_completion_tokens: 4096,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: JSON.stringify(translationInputs) },
              ],
            },
            { signal },
          ),
      }),
    );

    const raw = (resp.choices[0]?.message?.content ?? "").trim()
      .replace(/^```(?:json)?\n?/, "")
      .replace(/\n?```$/, "");

    const parsed = JSON.parse(raw) as Record<string, string>[];
    if (!Array.isArray(parsed) || parsed.length !== toTranslateIndices.length) {
      throw new Error(`unexpected response length ${parsed.length} vs expected ${toTranslateIndices.length}`);
    }

    for (let j = 0; j < toTranslateIndices.length; j++) {
      const idx = toTranslateIndices[j];
      const translated = parsed[j];
      const merged: BannerTextFields = { ...banners[idx] };
      if (typeof translated.title === "string" && translated.title.trim()) merged.title = translated.title;
      if (typeof translated.headline === "string" && translated.headline.trim()) merged.headline = translated.headline;
      if (typeof translated.subtitle === "string" && translated.subtitle.trim()) merged.subtitle = translated.subtitle;
      if (typeof translated.ctaText === "string" && translated.ctaText.trim()) merged.ctaText = translated.ctaText;
      results[idx] = merged;
      cache.set(contentHash(lang, banners[idx]), { fields: merged, expiresAt: Date.now() + CACHE_TTL_MS });
    }
  } catch (err) {
    recordCatalogAiFallback("banner_translation", "request_or_parse_failed");
    logger.warn({ err: (err as Error)?.message }, "bannerTranslation: translation failed; returning English");
  }

  return results;
}
