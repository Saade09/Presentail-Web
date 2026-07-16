import crypto from "node:crypto";
import OpenAI from "openai";
import { db } from "@workspace/db";
import { plantEnvironmentCacheTable } from "@workspace/db/schema";
import { inArray } from "drizzle-orm";
import { logger } from "./logger";

export type PlantEnvironment = "indoor" | "outdoor";

const BATCH_SIZE = 50;
const MAX_DESC_CHARS = 300;

const REPLIT_PROXY_BASE_URL = "https://openai-proxy.replit.com/v1";

// Plants that are strongly associated with indoor environments
const INDOOR_KEYWORDS = [
  "orchid",
  "bonsai",
  "snake plant",
  "peace lily",
  "pothos",
  "philodendron",
  "monstera",
  "ficus",
  "succulent",
  "cactus",
  "aloe vera",
  "aloe",
  "spider plant",
  "rubber plant",
  "dracaena",
  "areca palm",
  "money plant",
  "lucky bamboo",
  "jade plant",
  "zamioculcas",
  "zz plant",
  "calathea",
  "croton",
  "ivy",
  "anthurium",
  "dieffenbachia",
  "aglaonema",
  "chinese evergreen",
  "table plant",
  "desk plant",
  "office plant",
  "indoor",
  "house plant",
  "houseplant",
  "apartment plant",
  "pot plant",
  "potted plant",
];

// Plants that are strongly associated with outdoor environments
const OUTDOOR_KEYWORDS = [
  "palm tree",
  "palm",
  "shrub",
  "bush",
  "balcony plant",
  "balcony",
  "garden",
  "outdoor",
  "exterior",
  "landscape",
  "hedge",
  "cypress",
  "olive tree",
  "fruit tree",
  "citrus",
  "lavender field",
  "rose bush",
  "climbing plant",
  "ground cover",
  "lawn",
  "topiary",
];

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

export function computeContentHash(
  name: string,
  imageUrl?: string | null,
  description?: string | null,
): string {
  return crypto
    .createHash("sha256")
    .update(`${name}|||${imageUrl ?? ""}|||${description ?? ""}`)
    .digest("hex");
}

function inferFromKeywords(name: string, description?: string | null): PlantEnvironment | null {
  const combined = `${name.toLowerCase()} ${cleanDescription(description).toLowerCase()}`;

  for (const kw of OUTDOOR_KEYWORDS) {
    if (combined.includes(kw)) return "outdoor";
  }
  for (const kw of INDOOR_KEYWORDS) {
    if (combined.includes(kw)) return "indoor";
  }
  return null;
}

function buildPrompt(
  products: { id: string; name: string; imageUrl?: string | null; description?: string | null }[],
): string {
  const list = products
    .map((p, i) => {
      const desc = cleanDescription(p.description);
      const img = p.imageUrl ? ` imageUrl="${p.imageUrl}"` : "";
      return `${i + 1}. id="${p.id}" name="${p.name}"${img}${desc ? ` description="${desc}"` : ""}`;
    })
    .join("\n");

  return `You are a plant environment classifier for a luxury flower and gift shop.

For each plant product below, classify it as either "indoor" or "outdoor".

Classification guidance:
- "indoor": Plants typically kept inside homes, offices, or enclosed spaces. Examples: orchids, succulents, snake plants, pothos, philodendrons, monsteras, peace lilies, bonsai, rubber plants, ZZ plants, cacti (potted), dracaenas, calatheas.
- "outdoor": Plants designed for gardens, balconies, patios, or open-air environments. Examples: palm trees, olive trees, rose bushes, shrubs, hedges, garden flowers, climbing plants, ground covers, citrus trees, cypresses.

When in doubt, prefer "indoor" as most gift plants are sold as houseplants.

Products:
${list}

Respond with a JSON object mapping each id to "indoor" or "outdoor". Example:
{"id-1": "indoor", "id-2": "outdoor"}

Output only valid JSON. No markdown, no explanation.`;
}

async function callLlm(
  client: OpenAI,
  batch: { id: string; name: string; imageUrl?: string | null; description?: string | null }[],
): Promise<Record<string, PlantEnvironment>> {
  const response = await client.chat.completions.create({
    model: "gpt-5-nano",
    max_completion_tokens: 4096,
    messages: [{ role: "user", content: buildPrompt(batch) }],
  });

  const raw = response.choices[0]?.message?.content ?? "";

  if (raw.length === 0) {
    logger.warn(
      { choicesLen: response.choices.length },
      "plantEnvironmentInference: LLM returned empty content",
    );
    throw new Error("LLM returned empty content");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    logger.warn({ raw }, "plantEnvironmentInference: LLM returned unparseable JSON");
    throw new Error("LLM returned unparseable JSON");
  }

  const VALID_ENVS: ReadonlySet<string> = new Set(["indoor", "outdoor"]);
  const result: Record<string, PlantEnvironment> = {};
  for (const item of batch) {
    const val = parsed[item.id];
    if (typeof val === "string" && VALID_ENVS.has(val)) {
      result[item.id] = val as PlantEnvironment;
    } else {
      // Default to indoor with needs_review when LLM returns unexpected value
      result[item.id] = "indoor";
    }
  }
  return result;
}

export type ProductInput = {
  id: string;
  name: string;
  imageUrl?: string | null;
  description?: string | null;
};

export type ClassificationResult = {
  classification: PlantEnvironment;
  source: "ai" | "admin" | "fallback";
  needsReview: boolean;
  contentHash: string;
};

/**
 * Classifies a list of plant products as indoor or outdoor.
 *
 * Flow:
 * 1. Read existing DB cache rows for all product IDs.
 * 2. For products with a matching content hash and non-fallback source, use cached result.
 * 3. For products needing classification: try keyword heuristic first.
 * 4. Remaining products sent to LLM in batches of up to 50.
 * 5. On AI failure: classify as "indoor" with needsReview=true (fallback).
 * 6. Upsert all new classifications to DB.
 *
 * Returns a map of product ID → ClassificationResult.
 */
export async function classifyPlantProducts(
  products: ProductInput[],
  options: { forceReclassify?: boolean } = {},
): Promise<Map<string, ClassificationResult>> {
  if (products.length === 0) return new Map();

  const results = new Map<string, ClassificationResult>();
  let toClassify: ProductInput[] = [];

  if (!options.forceReclassify) {
    const ids = products.map((p) => p.id);
    const cachedRows = await db
      .select()
      .from(plantEnvironmentCacheTable)
      .where(inArray(plantEnvironmentCacheTable.osProductId, ids));

    const cacheByid = new Map(cachedRows.map((r) => [r.osProductId, r]));

    for (const p of products) {
      const hash = computeContentHash(p.name, p.imageUrl, p.description);
      const row = cacheByid.get(p.id);

      if (
        row &&
        row.contentHash === hash &&
        row.source !== "fallback" &&
        !row.needsReview
      ) {
        results.set(p.id, {
          classification: row.classification as PlantEnvironment,
          source: row.source as "ai" | "admin" | "fallback",
          needsReview: row.needsReview,
          contentHash: row.contentHash,
        });
      } else {
        toClassify.push(p);
      }
    }
  } else {
    toClassify = products;
  }

  if (toClassify.length === 0) return results;

  const heuristicResolved: ProductInput[] = [];
  const needsLlm: ProductInput[] = [];

  for (const p of toClassify) {
    const heuristic = inferFromKeywords(p.name, p.description);
    if (heuristic !== null) {
      const hash = computeContentHash(p.name, p.imageUrl, p.description);
      results.set(p.id, {
        classification: heuristic,
        source: "ai",
        needsReview: false,
        contentHash: hash,
      });
      heuristicResolved.push(p);
    } else {
      needsLlm.push(p);
    }
  }

  const client = buildClient();

  if (needsLlm.length > 0 && !client) {
    logger.warn(
      "plantEnvironmentInference: AI client not configured; defaulting unclassified plants to indoor with needs_review",
    );
    for (const p of needsLlm) {
      const hash = computeContentHash(p.name, p.imageUrl, p.description);
      results.set(p.id, {
        classification: "indoor",
        source: "fallback",
        needsReview: true,
        contentHash: hash,
      });
    }
  } else if (needsLlm.length > 0 && client) {
    for (let i = 0; i < needsLlm.length; i += BATCH_SIZE) {
      const batch = needsLlm.slice(i, i + BATCH_SIZE);
      try {
        const batchResult = await callLlm(client, batch);
        for (const p of batch) {
          const hash = computeContentHash(p.name, p.imageUrl, p.description);
          const env = batchResult[p.id] ?? "indoor";
          results.set(p.id, {
            classification: env,
            source: "ai",
            needsReview: false,
            contentHash: hash,
          });
        }
      } catch (err) {
        logger.error(
          { err },
          "plantEnvironmentInference: LLM call failed; defaulting batch to indoor with needs_review",
        );
        for (const p of batch) {
          const hash = computeContentHash(p.name, p.imageUrl, p.description);
          results.set(p.id, {
            classification: "indoor",
            source: "fallback",
            needsReview: true,
            contentHash: hash,
          });
        }
      }
    }
  }

  // Upsert all newly classified products (heuristic + LLM + fallback) to DB
  const toUpsert = [...heuristicResolved, ...needsLlm];
  for (const p of toUpsert) {
    const result = results.get(p.id);
    if (!result) continue;
    await db
      .insert(plantEnvironmentCacheTable)
      .values({
        osProductId: p.id,
        classification: result.classification,
        source: result.source,
        needsReview: result.needsReview,
        contentHash: result.contentHash,
        classifiedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: plantEnvironmentCacheTable.osProductId,
        set: {
          classification: result.classification,
          source: result.source,
          needsReview: result.needsReview,
          contentHash: result.contentHash,
          classifiedAt: new Date(),
        },
      })
      .catch((err: unknown) => {
        logger.error(
          { err, osProductId: p.id },
          "plantEnvironmentInference: failed to upsert cache row",
        );
      });
  }

  return results;
}
