import crypto from "node:crypto";
import OpenAI from "openai";
import { logger } from "./logger";

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

const REPLIT_PROXY_BASE_URL = "https://openai-proxy.replit.com/v1";

function buildClient(): OpenAI | null {
  const replitApiKey = process.env.REPLIT_AI_API_KEY;
  if (replitApiKey) {
    return new OpenAI({ apiKey: replitApiKey, baseURL: REPLIT_PROXY_BASE_URL });
  }
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (baseURL && apiKey) {
    return new OpenAI({ apiKey, baseURL });
  }
  return null;
}

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
  const results: BannerTextFields[] = banners.map((b) => ({ ...b }));
  const toTranslateIndices: number[] = [];
  const translationInputs: Record<string, string>[] = [];

  for (let i = 0; i < banners.length; i++) {
    const b = banners[i];
    if (!hasText(b)) continue;

    const key = contentHash(lang, b);
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      Object.assign(results[i], cached.fields);
      continue;
    }
    toTranslateIndices.push(i);
    translationInputs.push(onlyTextFields(b));
  }

  if (toTranslateIndices.length === 0) return results;

  const client = buildClient();
  if (!client) {
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
    const resp = await client.chat.completions.create({
      model: "gpt-5-nano",
      max_completion_tokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(translationInputs) },
      ],
    });

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
    logger.warn({ err: (err as Error)?.message }, "bannerTranslation: translation failed; returning English");
  }

  return results;
}
