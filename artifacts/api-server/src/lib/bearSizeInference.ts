import crypto from "node:crypto";
import {
  getOpenAIClient,
  type ManagedOpenAIClient,
} from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";
import {
  dedupeCatalogAiRequest,
  recordCatalogAiCacheStatus,
  recordCatalogAiFallback,
  recordCatalogAiInvocation,
  runCatalogAiRequest,
} from "./aiRequest";

export type BearSize = "small" | "medium" | "life-size";

const BEAR_SIZES: BearSize[] = ["small", "medium", "life-size"];

const SMALL_KEYWORDS = [
  "mini",
  "small",
  "tiny",
  "little",
  "baby",
  "petite",
  "xs",
  "pocket",
  "micro",
];

// Strong, unambiguous life-size terms — safe to match anywhere (name or description).
const LIFE_SIZE_STRONG_KEYWORDS = [
  "life-size",
  "life size",
  "lifesize",
  "giant",
  "jumbo",
  "oversized",
  "human-size",
  "human size",
];

// Ambiguous size words that only indicate a large bear when they appear in the
// curated product NAME. In marketing descriptions ("a big hug", "large heart")
// they are unreliable, so they are never matched against the description.
const LIFE_SIZE_NAME_KEYWORDS = ["large", "big", "huge", "xxl", "extra large"];

// Height thresholds (cm) for numeric classification from an explicit measurement.
const SMALL_MAX_CM = 45;
const LIFE_SIZE_MIN_CM = 120;

const BATCH_SIZE = 50;
const MAX_DESC_CHARS = 300;

function nameHash(name: string, description?: string | null): string {
  return crypto
    .createHash("sha256")
    .update(`${name}|||${description ?? ""}`)
    .digest("hex")
    .slice(0, 16);
}

/** Strip HTML tags and truncate description for the prompt. */
function cleanDescription(description?: string | null): string {
  if (!description) return "";
  const stripped = description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return stripped.slice(0, MAX_DESC_CHARS);
}

/**
 * Parse an explicit height from text. Supports cm, m/metres, and ft/feet and
 * returns the height in centimetres, or null when no measurement is present.
 */
function parseHeightCm(text: string): number | null {
  const cm = text.match(/(\d+(?:\.\d+)?)\s*cm\b/i);
  if (cm) return parseFloat(cm[1]);
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:m|meters?|metres?)\b/i);
  if (m) return parseFloat(m[1]) * 100;
  const ft = text.match(/(\d+(?:\.\d+)?)\s*(?:ft|feet|foot)\b/i);
  if (ft) return parseFloat(ft[1]) * 30.48;
  return null;
}

function sizeFromHeightCm(cm: number): BearSize {
  if (cm < SMALL_MAX_CM) return "small";
  if (cm >= LIFE_SIZE_MIN_CM) return "life-size";
  return "medium";
}

/**
 * Deterministic heuristic: returns the inferred size, or null if nothing matched.
 *
 * Priority:
 * 1. An explicit height (cm / m / ft) in the name or description — the most
 *    reliable signal, so it wins over every keyword. This is what keeps a
 *    "70 cm" bear out of the life-size bucket and a "200 cm" bear in it.
 * 2. Strong, unambiguous life-size terms anywhere (name or description).
 * 3. Small-size keywords anywhere (word-boundary matched).
 * 4. Ambiguous "large/big/huge" terms, but only in the curated product name —
 *    matching them against marketing descriptions produces false positives.
 */
function inferFromKeywords(name: string, description?: string | null): BearSize | null {
  const nameLower = name.toLowerCase();
  const combined = `${nameLower} ${cleanDescription(description).toLowerCase()}`;

  const heightCm = parseHeightCm(combined);
  if (heightCm !== null) return sizeFromHeightCm(heightCm);

  for (const kw of LIFE_SIZE_STRONG_KEYWORDS) {
    if (combined.includes(kw)) return "life-size";
  }
  for (const kw of SMALL_KEYWORDS) {
    if (new RegExp(`\\b${kw}\\b`).test(combined)) return "small";
  }
  for (const kw of LIFE_SIZE_NAME_KEYWORDS) {
    if (new RegExp(`\\b${kw}\\b`).test(nameLower)) return "life-size";
  }
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
  return `You are a product size classifier for a luxury gift shop selling stuffed animal bears.

For each bear product below, classify its size into exactly one of: "small", "medium", "life-size".

Size guidance:
- "small": mini, tiny, pocket-sized, baby bears — typically fits in one hand (roughly < 30 cm).
- "medium": standard teddy bear size — typical gift size, roughly 30–60 cm.
- "life-size": giant, oversized, very large bears — as tall as a person or designed to stand on the floor.

Use the name first, then the description if more context is needed. When in doubt, default to "medium".

Products:
${list}

Respond with a JSON object mapping each id to one of "small", "medium", or "life-size". Example:
{"id-1": "medium", "id-2": "small"}

Output only valid JSON. No markdown, no explanation.`;
}

async function callLlm(
  client: ManagedOpenAIClient,
  batch: { id: string; name: string; description?: string | null }[],
): Promise<Record<string, BearSize>> {
  const key = `bear-size:${crypto.createHash("sha256").update(JSON.stringify(batch)).digest("hex")}`;
  const response = await dedupeCatalogAiRequest(key, () =>
    runCatalogAiRequest({
      workflow: "bear_size_inference",
      model: "gpt-5-nano",
      client,
      policy: { timeoutMs: 15_000, maxRetries: 2 },
      request: (requestClient, signal) =>
        requestClient.chat.completions.create(
          {
            model: "gpt-5-nano",
            max_completion_tokens: 4096,
            messages: [{ role: "user", content: buildPrompt(batch) }],
          },
          { signal },
        ),
    }),
  );

  const raw = response.choices[0]?.message?.content ?? "";

  if (raw.length === 0) {
    logger.warn(
      { choicesLen: response.choices.length },
      "bearSizeInference: LLM returned empty content",
    );
    throw new Error("LLM returned empty content");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    logger.warn("bearSizeInference: LLM returned unparseable JSON");
    throw new Error("LLM returned unparseable JSON");
  }

  const result: Record<string, BearSize> = {};
  for (const item of batch) {
    const val = parsed[item.id];
    if (typeof val === "string" && (BEAR_SIZES as readonly string[]).includes(val)) {
      result[item.id] = val as BearSize;
    } else {
      result[item.id] = "medium";
    }
  }
  return result;
}

// In-process cache: productId → { size, contentHash, cachedAt }
type CacheEntry = { size: BearSize; contentHash: string; cachedAt: number };
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const sizeCache = new Map<string, CacheEntry>();

function pruneCache(): void {
  const now = Date.now();
  for (const [key, entry] of sizeCache) {
    if (now - entry.cachedAt > CACHE_TTL_MS) {
      sizeCache.delete(key);
    }
  }
}

/**
 * Returns a map of productId → BearSize for the given bear products.
 *
 * Flow:
 * 1. Keyword heuristic: checked against name+description; no AI call needed.
 * 2. In-process cache: if a product was previously classified and its
 *    name+description hasn't changed, the cached result is used.
 * 3. LLM inference: only for products that cleared neither of the above.
 *
 * Returns "medium" as fallback when the AI client is unavailable or the
 * LLM call fails.
 */
export async function getBearSizeMap(
  products: { id: string; name: string; description?: string | null }[],
): Promise<Record<string, BearSize>> {
  recordCatalogAiInvocation("bear_size_inference");
  if (products.length === 0) return {};
  pruneCache();

  const result: Record<string, BearSize> = {};
  const toInfer: { id: string; name: string; description?: string | null }[] = [];
  const now = Date.now();
  let cacheHits = 0;

  for (const p of products) {
    // 1. Keyword heuristic (name + description)
    const kw = inferFromKeywords(p.name, p.description);
    if (kw !== null) {
      result[p.id] = kw;
      continue;
    }

    // 2. In-process cache
    const hash = nameHash(p.name, p.description);
    const cached = sizeCache.get(p.id);
    if (cached && cached.contentHash === hash && now - cached.cachedAt < CACHE_TTL_MS) {
      result[p.id] = cached.size;
      cacheHits++;
      continue;
    }

    toInfer.push(p);
  }

  recordCatalogAiCacheStatus("bear_size_inference", cacheHits, toInfer.length);
  if (toInfer.length === 0) return result;

  const client = getOpenAIClient();
  if (!client) {
    recordCatalogAiFallback("bear_size_inference", "client_unavailable");
    logger.warn(
      "bearSizeInference: AI client not configured; defaulting unclassified bears to medium",
    );
    for (const p of toInfer) {
      result[p.id] = "medium";
    }
    return result;
  }

  for (let i = 0; i < toInfer.length; i += BATCH_SIZE) {
    const batch = toInfer.slice(i, i + BATCH_SIZE);
    try {
      const batchResult = await callLlm(client, batch);
      for (const item of batch) {
        const size = batchResult[item.id] ?? "medium";
        result[item.id] = size;
        sizeCache.set(item.id, {
          size,
          contentHash: nameHash(item.name, item.description),
          cachedAt: now,
        });
      }
    } catch (err) {
      recordCatalogAiFallback("bear_size_inference", "request_or_parse_failed");
      logger.error({ err }, "bearSizeInference: LLM call failed; defaulting batch to medium");
      for (const item of batch) {
        result[item.id] = "medium";
      }
    }
  }

  return result;
}
