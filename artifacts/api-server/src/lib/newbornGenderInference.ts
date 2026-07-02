import crypto from "node:crypto";
import OpenAI from "openai";
import { logger } from "./logger";

export type NewbornGender = "boy" | "girl" | "neutral";

const NEWBORN_GENDERS: NewbornGender[] = ["boy", "girl", "neutral"];

const BOY_KEYWORDS = [
  "boy",
  "blue",
  "navy",
  "teal",
  "cyan",
  "turquoise",
  "denim",
];

const GIRL_KEYWORDS = [
  "girl",
  "pink",
  "rose",
  "fuchsia",
  "lavender",
  "blush",
  "magenta",
  "lilac",
  "mauve",
];

const BATCH_SIZE = 50;
const MAX_DESC_CHARS = 300;

const REPLIT_PROXY_BASE_URL = "https://openai-proxy.replit.com/v1";

function nameHash(name: string, description?: string | null): string {
  return crypto
    .createHash("sha256")
    .update(`${name}|||${description ?? ""}`)
    .digest("hex")
    .slice(0, 16);
}

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

function cleanDescription(description?: string | null): string {
  if (!description) return "";
  const stripped = description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return stripped.slice(0, MAX_DESC_CHARS);
}

/**
 * Keyword heuristic: checks name + description for gender signals.
 * Returns "boy", "girl", or null (neutral / ambiguous).
 *
 * Exported for unit testing only.
 */
export function inferFromKeywords(name: string, description?: string | null): NewbornGender | null {
  const nameLower = name.toLowerCase();
  const combined = `${nameLower} ${cleanDescription(description).toLowerCase()}`;

  const hasBoy = BOY_KEYWORDS.some((kw) => new RegExp(`\\b${kw}\\b`).test(combined));
  const hasGirl = GIRL_KEYWORDS.some((kw) => new RegExp(`\\b${kw}\\b`).test(combined));

  if (hasBoy && !hasGirl) return "boy";
  if (hasGirl && !hasBoy) return "girl";
  return null;
}

function buildPrompt(
  products: { id: string; name: string; description?: string | null }[],
): string {
  const list = products
    .map((p, i) => {
      const desc = cleanDescription(p.description);
      return `${i + 1}. id="${p.id}" name="${p.name}"${desc ? ` description="${desc}"` : ""}`;
    })
    .join("\n");
  return `You are a product classifier for a luxury gift shop specialising in newborn baby gifts.

For each product below, classify it as a gift suited for a baby boy, baby girl, or gender-neutral.

Classification rules:
- "boy": product uses blue, navy, teal, or other traditionally boy-coded colours; or explicitly references a baby boy.
- "girl": product uses pink, rose, fuchsia, lavender, blush, or other traditionally girl-coded colours; or explicitly references a baby girl.
- "neutral": product uses white, yellow, mint, beige, or multicolour; no clear gender signal in name or description.

Use the name first, then the description for more context. When genuinely uncertain, return "neutral".

Products:
${list}

Respond with a JSON object mapping each id to one of "boy", "girl", or "neutral". Example:
{"id-1": "girl", "id-2": "boy", "id-3": "neutral"}

Output only valid JSON. No markdown, no explanation.`;
}

async function callLlm(
  client: OpenAI,
  batch: { id: string; name: string; description?: string | null }[],
): Promise<Record<string, NewbornGender>> {
  const response = await client.chat.completions.create({
    model: "gpt-5-nano",
    max_completion_tokens: 4096,
    messages: [{ role: "user", content: buildPrompt(batch) }],
  });

  const raw = response.choices[0]?.message?.content ?? "";

  if (raw.length === 0) {
    logger.warn(
      { choicesLen: response.choices.length },
      "newbornGenderInference: LLM returned empty content",
    );
    throw new Error("LLM returned empty content");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    logger.warn({ raw }, "newbornGenderInference: LLM returned unparseable JSON");
    throw new Error("LLM returned unparseable JSON");
  }

  const result: Record<string, NewbornGender> = {};
  for (const item of batch) {
    const val = parsed[item.id];
    if (typeof val === "string" && (NEWBORN_GENDERS as readonly string[]).includes(val)) {
      result[item.id] = val as NewbornGender;
    } else {
      result[item.id] = "neutral";
    }
  }
  return result;
}

type CacheEntry = { gender: NewbornGender; contentHash: string; cachedAt: number };
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const genderCache = new Map<string, CacheEntry>();

function pruneCache(): void {
  const now = Date.now();
  for (const [key, entry] of genderCache) {
    if (now - entry.cachedAt > CACHE_TTL_MS) {
      genderCache.delete(key);
    }
  }
}

/**
 * Returns a map of productId → NewbornGender for the given newborn products.
 *
 * Flow:
 * 1. Keyword heuristic on name + description.
 * 2. In-process cache (24-hour TTL, keyed by content hash).
 * 3. LLM inference for products that pass neither of the above.
 *
 * Falls back to "neutral" when the AI client is unavailable or the LLM call fails.
 */
export async function getNewbornGenderMap(
  products: { id: string; name: string; description?: string | null }[],
): Promise<Record<string, NewbornGender>> {
  if (products.length === 0) return {};
  pruneCache();

  const result: Record<string, NewbornGender> = {};
  const toInfer: { id: string; name: string; description?: string | null }[] = [];
  const now = Date.now();

  for (const p of products) {
    const kw = inferFromKeywords(p.name, p.description);
    if (kw !== null) {
      result[p.id] = kw;
      continue;
    }

    const hash = nameHash(p.name, p.description);
    const cached = genderCache.get(p.id);
    if (cached && cached.contentHash === hash && now - cached.cachedAt < CACHE_TTL_MS) {
      result[p.id] = cached.gender;
      continue;
    }

    toInfer.push(p);
  }

  if (toInfer.length === 0) return result;

  const client = buildClient();
  if (!client) {
    logger.warn(
      "newbornGenderInference: AI client not configured; defaulting unclassified products to neutral",
    );
    for (const p of toInfer) {
      result[p.id] = "neutral";
    }
    return result;
  }

  for (let i = 0; i < toInfer.length; i += BATCH_SIZE) {
    const batch = toInfer.slice(i, i + BATCH_SIZE);
    try {
      const batchResult = await callLlm(client, batch);
      for (const item of batch) {
        const gender = batchResult[item.id] ?? "neutral";
        result[item.id] = gender;
        genderCache.set(item.id, {
          gender,
          contentHash: nameHash(item.name, item.description),
          cachedAt: now,
        });
      }
    } catch (err) {
      logger.error({ err }, "newbornGenderInference: LLM call failed; defaulting batch to neutral");
      for (const item of batch) {
        result[item.id] = "neutral";
      }
    }
  }

  return result;
}
