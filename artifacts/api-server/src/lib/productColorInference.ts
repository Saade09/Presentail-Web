import crypto from "node:crypto";
import {
  getOpenAIClient,
  type ManagedOpenAIClient,
} from "@workspace/integrations-openai-ai-server";
import { db } from "@workspace/db";
import { productColorCacheTable } from "@workspace/db/schema";
import { inArray } from "drizzle-orm";
import { logger } from "./logger";
import {
  dedupeCatalogAiRequest,
  recordCatalogAiCacheStatus,
  recordCatalogAiFallback,
  recordCatalogAiInvocation,
  runCatalogAiRequest,
} from "./aiRequest";

const KNOWN_COLORS = [
  "red",
  "white",
  "pink",
  "yellow",
  "purple",
  "blue",
  "orange",
  "green",
  "black",
  "beige",
  "peach",
  "gold",
  "silver",
  "coral",
  "lilac",
] as const;

type KnownColor = (typeof KNOWN_COLORS)[number];

const BATCH_SIZE = 50;

function nameHash(name: string): string {
  return crypto.createHash("sha256").update(name).digest("hex").slice(0, 16);
}

function buildPrompt(products: { slug: string; name: string }[]): string {
  const list = products.map((p, i) => `${i + 1}. slug="${p.slug}" name="${p.name}"`).join("\n");
  const colors = KNOWN_COLORS.join(", ");
  return `You are a product color classifier for a luxury flower and gift shop.

For each product below, identify its dominant color from this exact list:
${colors}

Output null ONLY if the name gives absolutely no floral or color context whatsoever. Otherwise make your best guess — a reasonable inference is better than null.

Rules:
- Only output colors from the list above. Never invent new colors.
- Focus on the dominant flower or ribbon color, not packaging.
- Flower name cues: "rose" → red or pink, "lavender" → lilac, "sunflower" → yellow, "orchid" → white or pink, "tulip" → pink or red, "carnation" → pink or red, "lily" → white, "dahlia" → pink or purple, "peony" → pink, "hydrangea" → blue or pink, "ranunculus" → pink or white, "anemone" → white or pink.
- Color-word cues: "sunset" → coral or orange, "blush" → pink, "ivory/pearl/cream/snow/alabaster" → white, "champagne/gold/amber" → gold, "midnight/noir/shadow/obsidian" → blue or black, "ocean/aqua/sky/azure" → blue, "sage/mint/forest/emerald" → green.
- Mood/feeling cues: "passionate/passion/desire/romance/sensual" → red, "ethereal/heavenly/angelic/celestial/divine" → white or lilac, "grace/graceful/elegant/gentle/soft/tender" → white or pink, "fresh/spring/morning/dew/breezy/breeze" → white or green, "vibrant/zest/citrus/burst/energy" → yellow or orange, "mysterious/dark/night" → blue or black, "sunny/bright/joyful/cheerful" → yellow, "dreamy/whimsical/fantasy" → pink or lilac.
- "petal/petals" alone → pink; "roses of [X]" → color of X (e.g. "roses of pearl" → white).
- For abstract names with no color cue at all (e.g. pure brand names, numbers) → null.

Products:
${list}

Respond with a JSON object mapping each slug to a color string or null. Example:
{"slug-1": "pink", "slug-2": null}

Output only valid JSON. No markdown, no explanation.`;
}

/**
 * Calls the LLM to classify a batch of products.
 * Throws on network/API errors or malformed JSON so the caller can decide
 * whether to skip upsert (preserving the ability to retry later).
 */
async function callLlm(
  client: ManagedOpenAIClient,
  batch: { slug: string; name: string }[],
): Promise<Record<string, KnownColor | null>> {
  const key = `product-color:${crypto.createHash("sha256").update(JSON.stringify(batch)).digest("hex")}`;
  const response = await dedupeCatalogAiRequest(key, () =>
    runCatalogAiRequest({
      workflow: "product_color_inference",
      model: "gpt-5-nano",
      client,
      policy: { timeoutMs: 15_000, maxRetries: 2 },
      request: (requestClient, signal) =>
        requestClient.chat.completions.create(
          {
            model: "gpt-5-nano",
            max_completion_tokens: 8192,
            messages: [{ role: "user", content: buildPrompt(batch) }],
          },
          { signal },
        ),
    }),
  );

  const finishReason = response.choices[0]?.finish_reason;
  const raw = response.choices[0]?.message?.content ?? "";

  if (raw.length === 0) {
    logger.warn(
      { choicesLen: response.choices.length, finishReason },
      "productColorInference: LLM returned empty content",
    );
  }

  // Throw on empty/unparseable response so the caller skips the upsert.
  // Poisoning the cache with null for a transient failure would permanently
  // hide products from the color filter until their name changes.
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    logger.warn("productColorInference: LLM returned unparseable JSON; skipping upsert");
    throw new Error("LLM returned unparseable JSON");
  }

  const result: Record<string, KnownColor | null> = {};
  for (const item of batch) {
    const val = parsed[item.slug];
    if (val === null || val === undefined) {
      result[item.slug] = null;
    } else if (typeof val === "string" && (KNOWN_COLORS as readonly string[]).includes(val)) {
      result[item.slug] = val as KnownColor;
    } else {
      // Unknown color string returned — treat as null (valid "no color" for this product)
      result[item.slug] = null;
    }
  }
  return result;
}

/**
 * Infers colors for a list of products using the LLM as a fallback.
 *
 * Always reads the cache first — cache hits are returned even if the AI
 * client is unavailable. Only uncached/stale slugs are sent to the LLM.
 * Parse failures or LLM errors skip the upsert so products can retry later.
 *
 * Returns a map of slug → color keyword or null for all input slugs.
 */
export async function inferProductColors(
  products: { slug: string; name: string }[],
): Promise<Record<string, KnownColor | null>> {
  recordCatalogAiInvocation("product_color_inference");
  if (products.length === 0) return {};

  // 1. Always read the cache first regardless of AI availability
  const slugs = products.map((p) => p.slug);
  const cached = await db
    .select()
    .from(productColorCacheTable)
    .where(inArray(productColorCacheTable.productSlug, slugs));

  const cacheBySlug = new Map(cached.map((row) => [row.productSlug, row]));

  // 2. Partition into cache hits and slugs that need inference
  const result: Record<string, KnownColor | null> = {};
  const toInfer: { slug: string; name: string }[] = [];
  let cacheHits = 0;

  for (const p of products) {
    const row = cacheBySlug.get(p.slug);
    if (row && row.productNameHash === nameHash(p.name)) {
      result[p.slug] = row.inferredColor as KnownColor | null;
      cacheHits++;
    } else {
      toInfer.push(p);
    }
  }

  recordCatalogAiCacheStatus("product_color_inference", cacheHits, toInfer.length);
  if (toInfer.length === 0) return result;

  // 3. Build OpenAI client — if unavailable return null for unresolved slugs
  const client = getOpenAIClient();
  if (!client) {
    recordCatalogAiFallback("product_color_inference", "client_unavailable");
    logger.warn(
      "productColorInference: AI client not configured; returning null for unresolved slugs",
    );
    for (const p of toInfer) {
      result[p.slug] = null;
    }
    return result;
  }

  // 4. Batch LLM calls (max BATCH_SIZE per call)
  for (let i = 0; i < toInfer.length; i += BATCH_SIZE) {
    const batch = toInfer.slice(i, i + BATCH_SIZE);
    try {
      const batchResult = await callLlm(client, batch);

      // Persist only on successful parse — skip upsert on error (handled in catch)
      for (const item of batch) {
        const color = batchResult[item.slug] ?? null;
        result[item.slug] = color;

        await db
          .insert(productColorCacheTable)
          .values({
            productSlug: item.slug,
            productNameHash: nameHash(item.name),
            inferredColor: color,
            inferredAt: new Date(),
          })
          .onConflictDoUpdate({
            target: productColorCacheTable.productSlug,
            set: {
              productNameHash: nameHash(item.name),
              inferredColor: color,
              inferredAt: new Date(),
            },
          })
          .catch((err: unknown) => {
            logger.error(
              { err, slug: item.slug },
              "productColorInference: failed to upsert cache row",
            );
          });
      }
    } catch (err) {
      recordCatalogAiFallback("product_color_inference", "request_or_parse_failed");
      // LLM call or JSON parse failed — do NOT upsert null so the products
      // can be retried on the next request. Return null in the response only.
      logger.error({ err }, "productColorInference: LLM call failed for batch; skipping upsert");
      for (const item of batch) {
        result[item.slug] = null;
      }
    }
  }

  return result;
}
