/**
 * Generates a short contextual description sentence for category and occasion
 * pages. Descriptions are generated once by AI, stored in the database, and
 * rendered server-side so no AI call happens during a customer page load.
 *
 * Fallback strings are returned deterministically when generation fails or
 * the OpenAI response is invalid.
 */

import OpenAI from "openai";
import { getOsProducts, getOsCategories, getOsOccasions } from "./osProductsCache";
import { getExpressConfig } from "./osLocationsCache";
import { DELIVERY_COUNTRIES } from "@workspace/catalog-data";
import { logger } from "./logger";
import type { OSProduct, OSProductCategory, OSProductOccasion } from "@workspace/presentail-os";

const REPLIT_PROXY_BASE_URL = "https://openai-proxy.replit.com/v1";
const MAX_DESCRIPTION_LENGTH = 300;

function buildOpenAiClient(): OpenAI | null {
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

/**
 * Occasion-specific context hints that describe the emotional intent behind
 * each page — used to guide the AI toward copy that feels personal and
 * specific, not generic.
 *
 * Keys are OS occasion slugs. Missing slugs fall back to undefined (the prompt
 * then relies on the page name and product types alone).
 */
const OCCASION_CONTEXT_HINTS: Record<string, string> = {
  "birthday": "a celebratory surprise to make someone feel special on their birthday", // i18n-ignore
  "anniversary": "a romantic gesture to mark a couple's milestone and the love they share", // i18n-ignore
  "wedding": "elegant flowers and gifts for weddings, engagements, and bridal celebrations", // i18n-ignore
  "new-born": "gentle, heartfelt gifts to welcome a new baby and celebrate proud new parents", // i18n-ignore
  "sympathy": "comforting, dignified arrangements to offer support and express condolences", // i18n-ignore
  "get-well": "cheerful, uplifting flowers and treats to brighten someone's recovery", // i18n-ignore
  "graduation": "proud celebration gifts to honour an academic achievement", // i18n-ignore
  "mother-s-day": "heartfelt flowers and gifts to show appreciation for mothers everywhere", // i18n-ignore
  "mothers-day": "heartfelt flowers and gifts to show appreciation for mothers everywhere", // i18n-ignore
  "father-s-day": "thoughtful gifts to celebrate dads on their special day", // i18n-ignore
  "fathers-day": "thoughtful gifts to celebrate dads on their special day", // i18n-ignore
  "valentine-s-day": "romantic flowers and gifts that say I love you", // i18n-ignore
  "valentines-day": "romantic flowers and gifts that say I love you", // i18n-ignore
  "eid": "festive, generous gifts to celebrate Eid with family and loved ones", // i18n-ignore
  "thank-you": "warm appreciation gifts to say thank you from the heart", // i18n-ignore
  "congratulations": "joyful, celebratory gifts to mark great news and achievements", // i18n-ignore
  "just-because": "spontaneous surprise flowers and gifts to brighten anyone's day — no reason needed", // i18n-ignore
  "corporate": "professional gift solutions for client appreciation, team milestones, and business occasions", // i18n-ignore
  "housewarming": "thoughtful gifts to welcome someone into their new home", // i18n-ignore
  "farewell": "memorable send-off gifts to wish someone well on their next chapter", // i18n-ignore
  "ramadan": "generous, festive gifts to share the spirit of Ramadan", // i18n-ignore
  "christmas": "festive flowers and gifts to celebrate the holiday season", // i18n-ignore
};

/**
 * Category-specific context hints that describe what the page offers and
 * why shoppers come to it.
 */
const CATEGORY_CONTEXT_HINTS: Record<string, string> = {
  "hand-bouquets": "fresh, handcrafted bouquets — the classic gift for any occasion", // i18n-ignore
  "hand-bouquet": "fresh, handcrafted bouquets — the classic gift for any occasion", // i18n-ignore
  "flower-boxes": "blooms elegantly presented in luxury boxes for a refined gifting experience", // i18n-ignore
  "flower-baskets": "flowers arranged in charming baskets, perfect for home or office", // i18n-ignore
  "flower-vases": "flowers delivered in a vase — ready to display the moment they arrive", // i18n-ignore
  "roses-bouquets": "classic and premium rose arrangements that never go out of style", // i18n-ignore
  "lux-arrangements": "bespoke, high-impact floral compositions for grand occasions and statement gifts", // i18n-ignore
  "dried-flowers": "long-lasting dried flower arrangements for a bohemian, timeless look", // i18n-ignore
  "preserved-flowers": "preserved blooms that retain their beauty for months without water", // i18n-ignore
  "cakes": "celebration cakes baked to order — a sweet centrepiece for any party", // i18n-ignore
  "chocolate": "premium chocolates and artisan confectionery — a universally adored gift", // i18n-ignore
  "arabic-sweets": "traditional Arabic sweets and pastries, ideal for sharing and celebrations", // i18n-ignore
  "balloons": "festive balloon arrangements and bouquets that add joy to any celebration", // i18n-ignore
  "stuffed-animals": "soft, cuddly plush toys loved by kids and adults alike", // i18n-ignore
  "plants": "lush indoor plants — a living gift that keeps growing long after the occasion", // i18n-ignore
  "baskets": "curated gift hampers filled with a thoughtful mix of treats and luxuries", // i18n-ignore
  "gift-baskets": "curated gift hampers filled with a thoughtful mix of treats and luxuries", // i18n-ignore
  "bundles": "carefully curated gift bundles combining flowers, sweets, and more", // i18n-ignore
  "beauty": "premium beauty and wellness gifts — a treat for the senses", // i18n-ignore
};

/**
 * Resolve the human-readable city name for a delivery_area_id.
 * Uses localizedNames from the static delivery locations when available.
 */
function resolveDeliveryAreaName(
  deliveryAreaId: string,
  language: "en" | "ar" | "fr",
): { areaName: string; countryName: string } {
  for (const country of DELIVERY_COUNTRIES) {
    for (const city of country.cities) {
      if (city.id === deliveryAreaId) {
        const localizedNames = (city as { localizedNames?: { ar?: string; fr?: string } }).localizedNames;
        let areaName = city.name;
        if (language === "ar" && localizedNames?.ar) areaName = localizedNames.ar;
        if (language === "fr" && localizedNames?.fr) areaName = localizedNames.fr;

        const countryLocalizedNames = (country as { localizedNames?: { ar?: string; fr?: string } }).localizedNames;
        let countryNameStr = country.name;
        if (language === "ar" && countryLocalizedNames?.ar) countryNameStr = countryLocalizedNames.ar;
        if (language === "fr" && countryLocalizedNames?.fr) countryNameStr = countryLocalizedNames.fr;

        return { areaName, countryName: countryNameStr };
      }
    }
  }
  // Fallback: derive from the ID itself (e.g. "lb-beirut" → "Beirut")
  const parts = deliveryAreaId.split("-");
  const areaName = parts.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return { areaName, countryName: "" };
}

/**
 * Check whether same-day delivery is available for a delivery area using the
 * live OS locations cache (expressAvailable flag), falling back to a heuristic
 * based on country when the cache hasn't populated yet.
 */
function hasSameDayDelivery(deliveryAreaId: string): boolean {
  try {
    const config = getExpressConfig(deliveryAreaId);
    return config.expressAvailable ?? true;
  } catch {
    // Cache not yet populated — fall back to country heuristic
    for (const country of DELIVERY_COUNTRIES) {
      for (const city of country.cities) {
        if (city.id === deliveryAreaId) {
          return country.code === "LB" || country.code === "AE";
        }
      }
    }
    return false;
  }
}

/**
 * Derive unique product type labels for a given category/occasion slug.
 * Uses the OS product cache to find products matching the slug, then maps
 * their categories to human-readable type labels.
 *
 * Products store categories and occasions as OSProductCategory[] /
 * OSProductOccasion[] objects — each with a `.slug` field.
 */
function deriveProductTypes(
  pageType: "category" | "occasion",
  pageSlug: string,
  deliveryAreaId: string,
): string[] {
  const storeKey = deliveryAreaToStoreKey(deliveryAreaId);
  const products = getOsProducts(storeKey) ?? [];

  const matching: OSProduct[] = pageType === "category"
    ? products.filter((p) => p.categories.some((c) => c.slug === pageSlug))
    : products.filter((p) => p.occasions.some((o) => o.slug === pageSlug));

  const TYPE_LABELS: Record<string, string> = {
    "hand-bouquets": "flowers", // i18n-ignore
    "hand-bouquet": "flowers", // i18n-ignore
    "flower-boxes": "flowers", // i18n-ignore
    "flower-baskets": "flowers", // i18n-ignore
    "flower-vases": "flowers", // i18n-ignore
    "lux-arrangements": "flowers", // i18n-ignore
    "roses-bouquets": "flowers", // i18n-ignore
    "flowers": "flowers", // i18n-ignore
    "dried-flowers": "flowers", // i18n-ignore
    "preserved-flowers": "flowers", // i18n-ignore
    "cakes": "cakes", // i18n-ignore
    "chocolate": "chocolates", // i18n-ignore
    "arabic-sweets": "Arabic sweets", // i18n-ignore
    "balloons": "balloons", // i18n-ignore
    "stuffed-animals": "stuffed animals", // i18n-ignore
    "plants": "plants", // i18n-ignore
    "baskets": "gift baskets", // i18n-ignore
    "gift-baskets": "gift baskets", // i18n-ignore
    "bundles": "gift bundles", // i18n-ignore
    "beauty": "beauty products", // i18n-ignore
    "electronics": "electronics", // i18n-ignore
  };

  const seen = new Set<string>();
  const types: string[] = [];

  for (const p of matching) {
    for (const cat of p.categories) {
      const label = TYPE_LABELS[cat.slug];
      if (label && !seen.has(label)) {
        seen.add(label);
        types.push(label);
      }
    }
  }

  return types.slice(0, 5);
}

/** Map delivery_area_id prefix to store key. */
function deliveryAreaToStoreKey(deliveryAreaId: string): string {
  if (deliveryAreaId.startsWith("ae-dubai")) return "dubai";
  if (deliveryAreaId.startsWith("ae-abu-dhabi")) return "abudhabi";
  if (deliveryAreaId.startsWith("ae-")) return "dubai";
  if (deliveryAreaId.startsWith("cy-")) return "cyprus";
  return "lebanon";
}

/**
 * Resolve the page name (category or occasion name) from the OS catalog.
 */
function resolvePageName(
  pageType: "category" | "occasion",
  pageSlug: string,
): string {
  if (pageType === "category") {
    const categories = getOsCategories() ?? [];
    const cat = categories.find((c: OSProductCategory) => c.slug === pageSlug || c.id === pageSlug);
    if (cat) return cat.name;
  } else {
    const occasions = getOsOccasions() ?? [];
    const occ = occasions.find((o: OSProductOccasion) => o.slug === pageSlug || o.id === pageSlug);
    if (occ) return occ.name;
  }
  // Fallback: derive from slug
  return pageSlug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ---------------------------------------------------------------------------
// Localized fallback templates (used when AI is unavailable)
// ---------------------------------------------------------------------------

const FALLBACK_TEMPLATES: Record<"en" | "ar" | "fr", Record<"category" | "occasion", { sameDay: string; standard: string }>> = {
  en: {
    occasion: {
      sameDay: "{pageName} flowers and gifts available for same-day delivery in {areaName}.", // i18n-ignore
      standard: "{pageName} flowers and gifts available for delivery in {areaName}.", // i18n-ignore
    },
    category: {
      sameDay: "Shop {pageName} with same-day delivery to {areaName}.", // i18n-ignore
      standard: "Shop {pageName} with delivery to {areaName}.", // i18n-ignore
    },
  },
  ar: {
    occasion: {
      sameDay: "زهور وهدايا {pageName} متاحة للتوصيل في نفس اليوم إلى {areaName}.", // i18n-ignore
      standard: "زهور وهدايا {pageName} متاحة للتوصيل إلى {areaName}.", // i18n-ignore
    },
    category: {
      sameDay: "تسوق {pageName} مع التوصيل في نفس اليوم إلى {areaName}.", // i18n-ignore
      standard: "تسوق {pageName} مع التوصيل إلى {areaName}.", // i18n-ignore
    },
  },
  fr: {
    occasion: {
      sameDay: "Fleurs et cadeaux {pageName} disponibles avec livraison le jour même à {areaName}.", // i18n-ignore
      standard: "Fleurs et cadeaux {pageName} disponibles avec livraison à {areaName}.", // i18n-ignore
    },
    category: {
      sameDay: "Découvrez {pageName} avec livraison le jour même à {areaName}.", // i18n-ignore
      standard: "Découvrez {pageName} avec livraison à {areaName}.", // i18n-ignore
    },
  },
};

/**
 * Build the deterministic fallback description string.
 * Supports EN, AR, FR templates; respects same-day delivery config.
 */
export function buildFallbackDescription(
  pageType: "category" | "occasion",
  pageSlug: string,
  deliveryAreaId: string,
  language: "en" | "ar" | "fr",
): string {
  const pageName = resolvePageName(pageType, pageSlug);
  const { areaName } = resolveDeliveryAreaName(deliveryAreaId, language);
  const sameDayAvailable = hasSameDayDelivery(deliveryAreaId);

  const templates = FALLBACK_TEMPLATES[language] ?? FALLBACK_TEMPLATES.en;
  const template = sameDayAvailable ? templates[pageType].sameDay : templates[pageType].standard;

  return template
    .replace("{pageName}", pageName)
    .replace("{areaName}", areaName);
}

/**
 * Generate a contextual description sentence via AI.
 * Returns the generated text on success, or null on failure (caller should use the fallback).
 */
export async function generateDescription(
  pageType: "category" | "occasion",
  pageSlug: string,
  deliveryAreaId: string,
  language: "en" | "ar" | "fr",
): Promise<string | null> {
  const client = buildOpenAiClient();
  if (!client) {
    logger.warn("pageDescriptionGenerator: no OpenAI client available — using fallback");
    return null;
  }

  const pageName = resolvePageName(pageType, pageSlug);
  const { areaName, countryName } = resolveDeliveryAreaName(deliveryAreaId, language);
  const sameDayAvailable = hasSameDayDelivery(deliveryAreaId);
  const productTypes = deriveProductTypes(pageType, pageSlug, deliveryAreaId);

  // Look up an intent-specific context hint so the AI understands what
  // shoppers are actually looking for on this page, not just its name.
  const contextHints = pageType === "occasion" ? OCCASION_CONTEXT_HINTS : CATEGORY_CONTEXT_HINTS;
  const contextHint = contextHints[pageSlug];

  const langLabel: Record<string, string> = { en: "English", ar: "Arabic", fr: "French" };
  const langName = langLabel[language] ?? "English";

  const areaLine = countryName ? `${areaName}, ${countryName}` : areaName; // i18n-ignore
  const deliveryLine = sameDayAvailable
    ? `Same-day delivery available in ${areaLine}.` // i18n-ignore
    : `Next-day delivery available in ${areaLine}.`; // i18n-ignore

  // Build the AI system prompt. Key design decisions:
  //   1. We provide an intent-specific context hint so the AI knows what
  //      the page is *for*, not just what it's called — this is what prevents
  //      every description from being "X flowers and gifts, delivered to Y".
  //   2. We explicitly forbid that formula so the AI can't fall back to it.
  //   3. We keep the hard constraints (one sentence, max 200 chars, target lang)
  //      to avoid malformed responses.
  const promptLines = [
    "You write short, punchy marketing descriptions for Presentail, a luxury flower and gift delivery service.", // i18n-ignore
    "",
    `Write ONE sentence in ${langName} for this page:`, // i18n-ignore
    `- Page type: ${pageType}`, // i18n-ignore
    `- Page name: "${pageName}"`, // i18n-ignore
    contextHint ? `- What shoppers are looking for here: ${contextHint}` : "", // i18n-ignore
    productTypes.length > 0 ? `- Products they will find: ${productTypes.join(", ")}` : "", // i18n-ignore
    `- ${deliveryLine}`,
    "",
    "The sentence must:", // i18n-ignore
    "- Be specific to THIS page's intent — not a generic store description", // i18n-ignore
    "- Feel natural and warm, like a luxury brand speaking to a caring shopper", // i18n-ignore
    "- Mention the city or delivery area naturally", // i18n-ignore
    "- Be at most 200 characters", // i18n-ignore
    `- Be written entirely in ${langName}`, // i18n-ignore
    "",
    // The following line is the key anti-pattern guard:
    `Do NOT write the formula "[Name] flowers and gifts available for [delivery] in [City]" — that is too generic. Write something that feels personal to the occasion or category.`, // i18n-ignore
    "",
    "Output only the sentence. No quotes, no explanation.", // i18n-ignore
  ].filter((line) => line !== "");

  const prompt = promptLines.join("\n");

  try {
    const response = await client.chat.completions.create({
      model: "gpt-5.4-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.6,
      max_tokens: 200,
    });

    const text = response.choices[0]?.message?.content?.trim() ?? "";

    // Validation: reject markdown, headings, or overlong responses
    if (!text) return null;
    if (text.length > MAX_DESCRIPTION_LENGTH) return null;
    if (/^#+\s/.test(text)) return null; // headings
    if (/\*\*|__|\[.*\]|\n/.test(text)) return null; // markdown
    if ((text.match(/\./g) ?? []).length > 3) return null; // more than one sentence

    return text;
  } catch (err: unknown) {
    logger.warn({ err: (err as Error)?.message }, "pageDescriptionGenerator: OpenAI call failed");
    return null;
  }
}
