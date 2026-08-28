import crypto from "node:crypto";
import {
  getOpenAIClient,
  type ManagedOpenAIClient,
} from "@workspace/integrations-openai-ai-server";
import { db } from "@workspace/db";
import { personalisationRequirementCacheTable } from "@workspace/db/schema";
import { inArray } from "drizzle-orm";
import { logger } from "./logger";
import {
  dedupeCatalogAiRequest,
  recordCatalogAiCacheStatus,
  recordCatalogAiFallback,
  recordCatalogAiInvocation,
  runCatalogAiRequest,
} from "./aiRequest";

const BATCH_SIZE = 50;
const MAX_DESC_CHARS = 300;

function cleanDescription(description?: string | null): string {
  if (!description) return "";
  const stripped = description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return stripped.slice(0, MAX_DESC_CHARS);
}

function buildPrompt(
  products: { osNumericId: string; name: string; description?: string | null; categories?: string[] }[],
): string {
  const list = products
    .map((p, i) => {
      const desc = cleanDescription(p.description);
      const cats = (p.categories ?? []).join(", ");
      const parts = [`${i + 1}. id="${p.osNumericId}" name="${p.name}"`];
      if (cats) parts.push(`categories="${cats}"`);
      if (desc) parts.push(`description="${desc}"`);
      return parts.join(" ");
    })
    .join("\n");

  return `You are a product classifier for a luxury flower and gift shop.

For each product below, determine whether personalisation input is REQUIRED for fulfillment, or optional.

Classification rules:
- "required": The product cannot be made or fulfilled without the customer's personalisation input. Examples: printing boxes (customer text printed on the box), engraved items (name/initials engraved), letter-arrangement gifts (customer chooses which letter), monogrammed or initial-based products.
- "optional": The product is complete without personalisation — a note can be added but the product works fine without it. Examples: bouquets, cakes (a message is optional), chocolate boxes, gift baskets.

Focus on the product name and category first. Use the description only for additional context.

Products:
${list}

Respond with a JSON object mapping each id to true (required) or false (optional). Example:
{"id-1": true, "id-2": false}

Output only valid JSON. No markdown, no explanation.`;
}

async function callLlm(
  client: ManagedOpenAIClient,
  batch: { osNumericId: string; name: string; description?: string | null; categories?: string[] }[],
): Promise<Record<string, boolean>> {
  const key = `personalisation:${crypto.createHash("sha256").update(JSON.stringify(batch)).digest("hex")}`;
  const response = await dedupeCatalogAiRequest(key, () =>
    runCatalogAiRequest({
      workflow: "personalisation_requirement_inference",
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
      "personalisationRequirementInference: LLM returned empty content",
    );
    throw new Error("LLM returned empty content");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    logger.warn(
      {},
      "personalisationRequirementInference: LLM returned unparseable JSON; skipping upsert",
    );
    throw new Error("LLM returned unparseable JSON");
  }

  const result: Record<string, boolean> = {};
  for (const item of batch) {
    const val = parsed[item.osNumericId];
    result[item.osNumericId] = val === true;
  }
  return result;
}

export type PersonalisationProduct = {
  osNumericId: string;
  name: string;
  description?: string | null;
  categories?: string[];
  hasLetterField?: boolean;
};

/**
 * Infers whether personalisation is required or optional for a list of products.
 *
 * Flow:
 * 1. `hasLetterField=true` products are always "required" — no LLM call needed.
 * 2. Read the DB cache — cache hits are returned even if the AI client is unavailable.
 * 3. Call the LLM in batches for uncached products.
 * 4. Persist results to DB so the LLM is called at most once per product.
 *
 * Defaults to `false` (optional) when the LLM call fails or is unavailable —
 * this is the safe direction (never blocks a shopper with a false mandatory gate).
 *
 * Returns a map of osNumericId → required boolean.
 */
export async function inferPersonalisationRequirements(
  products: PersonalisationProduct[],
): Promise<Record<string, boolean>> {
  recordCatalogAiInvocation("personalisation_requirement_inference");
  if (products.length === 0) return {};

  const result: Record<string, boolean> = {};

  // 1. Heuristic: hasLetterField=true → always required (letter boxes, initials, etc.)
  const nonHeuristic: PersonalisationProduct[] = [];
  for (const p of products) {
    if (p.hasLetterField) {
      result[p.osNumericId] = true;
    } else {
      nonHeuristic.push(p);
    }
  }

  if (nonHeuristic.length === 0) return result;

  // 2. Read DB cache for remaining products
  const ids = nonHeuristic.map((p) => p.osNumericId);
  const cached = await db
    .select()
    .from(personalisationRequirementCacheTable)
    .where(inArray(personalisationRequirementCacheTable.osNumericId, ids))
    .catch((err: unknown) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "personalisationRequirementInference: failed to read DB cache",
      );
      return [] as typeof personalisationRequirementCacheTable.$inferSelect[];
    });

  const cacheById = new Map(cached.map((row) => [row.osNumericId, row]));

  const toInfer: PersonalisationProduct[] = [];
  let cacheHits = 0;
  for (const p of nonHeuristic) {
    const row = cacheById.get(p.osNumericId);
    if (row) {
      result[p.osNumericId] = row.required;
      cacheHits++;
    } else {
      toInfer.push(p);
    }
  }

  recordCatalogAiCacheStatus(
    "personalisation_requirement_inference",
    cacheHits,
    toInfer.length,
  );
  if (toInfer.length === 0) return result;

  // 3. Build OpenAI client — if unavailable return false (optional) for uncached
  const client = getOpenAIClient();
  if (!client) {
    recordCatalogAiFallback("personalisation_requirement_inference", "client_unavailable");
    logger.warn(
      "personalisationRequirementInference: AI client not configured; defaulting uncached products to optional",
    );
    for (const p of toInfer) {
      result[p.osNumericId] = false;
    }
    return result;
  }

  // 4. Batch LLM calls
  for (let i = 0; i < toInfer.length; i += BATCH_SIZE) {
    const batch = toInfer.slice(i, i + BATCH_SIZE);
    try {
      const batchResult = await callLlm(client, batch);

      for (const item of batch) {
        const required = batchResult[item.osNumericId] ?? false;
        result[item.osNumericId] = required;

        await db
          .insert(personalisationRequirementCacheTable)
          .values({
            osNumericId: item.osNumericId,
            required,
            classifiedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: personalisationRequirementCacheTable.osNumericId,
            set: {
              required,
              classifiedAt: new Date(),
            },
          })
          .catch((err: unknown) => {
            logger.error(
              { err, osNumericId: item.osNumericId },
              "personalisationRequirementInference: failed to upsert cache row",
            );
          });
      }
    } catch (err) {
      recordCatalogAiFallback("personalisation_requirement_inference", "request_or_parse_failed");
      logger.error(
        { err },
        "personalisationRequirementInference: LLM call failed for batch; defaulting to optional",
      );
      for (const item of batch) {
        result[item.osNumericId] = false;
      }
    }
  }

  return result;
}
