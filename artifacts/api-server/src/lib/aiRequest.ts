import {
  executeAiRequest,
  getOpenAIClient,
  AiRequestFailure,
  type AiRequestPolicy,
  type ManagedOpenAIClient,
} from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

export type CatalogAiWorkflow =
  | "product_translation"
  | "product_name_translation"
  | "banner_translation"
  | "category_occasion_translation"
  | "product_color_inference"
  | "bear_size_inference"
  | "newborn_gender_inference"
  | "personalisation_requirement_inference"
  | "plant_environment_inference"
  | "page_description";

const MAX_CONCURRENT_REQUESTS = 4;
const MAX_QUEUED_REQUESTS = 256;
let activeRequests = 0;
const waiters: Array<() => void> = [];
const inFlight = new Map<string, Promise<unknown>>();
const MAX_IN_FLIGHT_ENTRIES = 512;

async function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests++;
    return;
  }
  if (waiters.length >= MAX_QUEUED_REQUESTS) {
    throw new Error("Catalog AI request queue is full");
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
}

function releaseSlot(): void {
  const next = waiters.shift();
  if (next) next();
  else activeRequests--;
}

function reasonOf(error: unknown): string {
  if (error instanceof Error) return error.name === "AiRequestError" ? error.message : error.name;
  return "unknown_error";
}

/**
 * Shared catalog request boundary. It owns concurrency, timeout/retry policy,
 * and privacy-safe request telemetry; callers own response parsing and their
 * existing fallback semantics.
 */
export async function runCatalogAiRequest<T>(options: {
  workflow: CatalogAiWorkflow;
  model: string;
  client?: ManagedOpenAIClient | null;
  request: (client: ManagedOpenAIClient, signal: AbortSignal) => Promise<T>;
  policy?: AiRequestPolicy;
}): Promise<T> {
  const client = options.client ?? getOpenAIClient();
  if (!client) {
    throw new Error("OpenAI client is not configured");
  }

  await acquireSlot();
  try {
    const { value, telemetry } = await executeAiRequest(
      (signal) => options.request(client, signal),
      options.policy,
    );
    logger.info(
      {
        event: "catalog_ai_provider_request",
        workflow: options.workflow,
        model: options.model,
        callCount: telemetry.attempts,
        retries: telemetry.retries,
        timedOut: telemetry.timedOut,
        latencyMs: telemetry.latencyMs,
        tokenUsage: telemetry.usage,
        outcome: "success",
      },
      "catalog AI request completed",
    );
    return value;
  } catch (error) {
    const telemetry = error instanceof AiRequestFailure ? error.telemetry : undefined;
    logger.warn(
      {
        event: "catalog_ai_provider_request",
        workflow: options.workflow,
        model: options.model,
        callCount: telemetry?.attempts ?? 1,
        retries: telemetry?.retries ?? 0,
        timedOut: telemetry?.timedOut ?? reasonOf(error).toLowerCase().includes("timeout"),
        latencyMs: telemetry?.latencyMs,
        outcome: "error",
        errorReason: reasonOf(error),
      },
      "catalog AI request failed",
    );
    throw error;
  } finally {
    releaseSlot();
  }
}

export function recordCatalogAiCacheStatus(
  workflow: CatalogAiWorkflow,
  hits: number,
  misses: number,
): void {
  logger.info(
    {
      event: "catalog_ai_cache_status",
      workflow,
      cacheHitCount: hits,
      cacheMissCount: misses,
      outcome: hits > 0 && misses === 0 ? "cache_hit" : "cache_status",
    },
    "catalog AI cache status",
  );
}

export function recordCatalogAiInvocation(workflow: CatalogAiWorkflow): void {
  logger.info(
    { event: "catalog_ai_workflow_invocation", workflow },
    "catalog AI workflow invoked",
  );
}

export function recordCatalogAiFallback(
  workflow: CatalogAiWorkflow,
  reason: string,
): void {
  logger.warn(
    {
      event: "catalog_ai_workflow_fallback",
      workflow,
      cacheHit: false,
      outcome: "fallback",
      fallbackReason: reason.slice(0, 80),
    },
    "catalog AI fallback used",
  );
}

/**
 * Share concurrent work for the same content key. Keys are supplied by
 * callers as hashes or catalog IDs; they are never logged.
 */
export function dedupeCatalogAiRequest<T>(
  key: string,
  operation: () => Promise<T>,
  onCapacity?: () => T | Promise<T>,
): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  if (inFlight.size >= MAX_IN_FLIGHT_ENTRIES) {
    return onCapacity
      ? Promise.resolve(onCapacity())
      : Promise.reject(new Error("Catalog AI in-flight capacity is full"));
  }

  let promise: Promise<T>;
  promise = operation().finally(() => {
    if (inFlight.get(key) === promise) inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}
