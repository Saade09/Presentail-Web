/**
 * In-process queue for contextual page description generation.
 *
 * Jobs are enqueued and processed asynchronously off the request path.
 * The worker retries up to 3 times with exponential backoff on failure.
 * Manual overrides are never overwritten unless `force = true`.
 *
 * On API server startup, `enqueueBulkSeed()` iterates over all active
 * delivery areas, category/occasion slugs, and languages to ensure every
 * page combination has a stored description.
 */

import { db } from "@workspace/db";
import { pageContextualDescriptionsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { DELIVERY_COUNTRIES } from "@workspace/catalog-data";
import { getOsCategories, getOsOccasions } from "./osProductsCache";
import { generateDescription } from "./pageDescriptionGenerator";
import { logger } from "./logger";

const LANGUAGES = ["en", "ar", "fr"] as const;
type Language = (typeof LANGUAGES)[number];

export type DescriptionJob = {
  pageType: "category" | "occasion";
  pageSlug: string;
  deliveryAreaId: string;
  language: Language;
  force?: boolean;
};

const MAX_QUEUED_JOBS = 5_000;

// Bounded in-memory FIFO queue. The key set includes the actively processing
// job, preventing duplicate work from being admitted while it is in flight.
const queue: DescriptionJob[] = [];
const queuedJobKeys = new Set<string>();
let isProcessing = false;

function descriptionJobKey(job: DescriptionJob): string {
  return `${job.pageType}::${job.pageSlug}::${job.deliveryAreaId}::${job.language}`;
}

function reserveQueueSlot(job: DescriptionJob): string | null {
  const key = descriptionJobKey(job);
  if (queuedJobKeys.has(key)) return null;
  if (queuedJobKeys.size >= MAX_QUEUED_JOBS) {
    logger.warn(
      { queueSize: queuedJobKeys.size },
      "pageDescriptionQueue: queue capacity reached; rejecting new job",
    );
    return null;
  }
  queuedJobKeys.add(key);
  return key;
}

function pushReservedJob(job: DescriptionJob, key: string): void {
  queue.push(job);
  if (!queuedJobKeys.has(key)) queuedJobKeys.add(key);
}

async function processNext(): Promise<void> {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;

  const job = queue.shift()!;
  const key = descriptionJobKey(job);
  try {
    await processJob(job);
  } catch (err: unknown) {
    logger.warn(
      { err: (err as Error)?.message, job },
      "pageDescriptionQueue: unexpected error processing job",
    );
  } finally {
    queuedJobKeys.delete(key);
    isProcessing = false;
    if (queue.length > 0) {
      setImmediate(processNext);
    }
  }
}

async function processJobWithRetry(job: DescriptionJob, attempt: number): Promise<void> {
  const { pageType, pageSlug, deliveryAreaId, language, force } = job;

  // Check if there's a manual override that should block generation
  const existingRows = await db
    .select()
    .from(pageContextualDescriptionsTable)
    .where(
      and(
        eq(pageContextualDescriptionsTable.pageType, pageType),
        eq(pageContextualDescriptionsTable.pageSlug, pageSlug),
        eq(pageContextualDescriptionsTable.deliveryAreaId, deliveryAreaId),
        eq(pageContextualDescriptionsTable.language, language),
      ),
    )
    .limit(1);

  const existing = existingRows[0];

  if (existing?.isManualOverride && !force) {
    logger.info(
      { pageType, pageSlug, deliveryAreaId, language },
      "pageDescriptionQueue: skipping manual override",
    );
    return;
  }

  // Mark as generating
  if (existing) {
    await db
      .update(pageContextualDescriptionsTable)
      .set({
        generationStatus: "generating",
        updatedAt: new Date(),
      })
      .where(eq(pageContextualDescriptionsTable.id, existing.id));
  } else {
    await db
      .insert(pageContextualDescriptionsTable)
      .values({
        pageType,
        pageSlug,
        deliveryAreaId,
        language,
        generationStatus: "generating",
        isManualOverride: false,
      })
      .onConflictDoUpdate({
        target: [
          pageContextualDescriptionsTable.pageType,
          pageContextualDescriptionsTable.pageSlug,
          pageContextualDescriptionsTable.deliveryAreaId,
          pageContextualDescriptionsTable.language,
        ],
        set: { generationStatus: "generating", updatedAt: new Date() },
      });
  }

  // Generate the description
  const generated = await generateDescription(pageType, pageSlug, deliveryAreaId, language);

  if (generated) {
    await db
      .update(pageContextualDescriptionsTable)
      .set({
        description: generated,
        generationStatus: "done",
        generatedAt: new Date(),
        failureReason: null,
        updatedAt: new Date(),
        // Only clear manual override if forced
        ...(force ? { isManualOverride: false } : {}),
      })
      .where(
        and(
          eq(pageContextualDescriptionsTable.pageType, pageType),
          eq(pageContextualDescriptionsTable.pageSlug, pageSlug),
          eq(pageContextualDescriptionsTable.deliveryAreaId, deliveryAreaId),
          eq(pageContextualDescriptionsTable.language, language),
        ),
      );

    logger.info(
      { pageType, pageSlug, deliveryAreaId, language },
      "pageDescriptionQueue: description generated successfully",
    );
  } else {
    // AI unavailable — retry with backoff; the GET endpoint returns a dynamic
    // fallback for any row that isn't "done", so we must NOT mark the row as
    // "done" here. After all retries, mark it "failed" so admin dashboards can
    // see it and the GET endpoint continues serving the deterministic fallback.
    if (attempt < 3) {
      const delay = 1000 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return processJobWithRetry(job, attempt + 1);
    }

    await db
      .update(pageContextualDescriptionsTable)
      .set({
        generationStatus: "failed",
        failureReason: "ai_unavailable",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(pageContextualDescriptionsTable.pageType, pageType),
          eq(pageContextualDescriptionsTable.pageSlug, pageSlug),
          eq(pageContextualDescriptionsTable.deliveryAreaId, deliveryAreaId),
          eq(pageContextualDescriptionsTable.language, language),
        ),
      );

    logger.warn(
      { pageType, pageSlug, deliveryAreaId, language },
      "pageDescriptionQueue: all retries exhausted, AI unavailable — marked failed; GET will serve fallback",
    );
  }
}

async function processJob(job: DescriptionJob): Promise<void> {
  try {
    await processJobWithRetry(job, 1);
  } catch (err: unknown) {
    const { pageType, pageSlug, deliveryAreaId, language } = job;
    logger.warn(
      { err: (err as Error)?.message, pageType, pageSlug, deliveryAreaId, language },
      "pageDescriptionQueue: job failed",
    );
    await db
      .update(pageContextualDescriptionsTable)
      .set({
        generationStatus: "failed",
        failureReason: (err as Error)?.message ?? "unknown",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(pageContextualDescriptionsTable.pageType, pageType),
          eq(pageContextualDescriptionsTable.pageSlug, pageSlug),
          eq(pageContextualDescriptionsTable.deliveryAreaId, deliveryAreaId),
          eq(pageContextualDescriptionsTable.language, language),
        ),
      );
  }
}

/**
 * Enqueue a single description generation job.
 *
 * Before upserting we check the existing row:
 *   - If is_manual_override = true and force = false → skip entirely (manual
 *     rows remain serveable at all times; no status downgrade occurs).
 *   - If the row already has status "done" and force = false → skip (already
 *     generated; the public GET will serve the stored text).
 *   - Otherwise insert/update the row to "pending" and push to the queue.
 */
export async function enqueueDescriptionGeneration(job: DescriptionJob): Promise<void> {
  const { pageType, pageSlug, deliveryAreaId, language, force } = job;
  const key = reserveQueueSlot(job);
  if (!key) return;
  let queued = false;

  try {
    // Check existing row before any upsert to avoid clobbering manual overrides
    // or unnecessarily re-queuing already-done rows.
    const existingRows = await db
      .select({
        id: pageContextualDescriptionsTable.id,
        isManualOverride: pageContextualDescriptionsTable.isManualOverride,
        generationStatus: pageContextualDescriptionsTable.generationStatus,
      })
      .from(pageContextualDescriptionsTable)
      .where(
        and(
          eq(pageContextualDescriptionsTable.pageType, pageType),
          eq(pageContextualDescriptionsTable.pageSlug, pageSlug),
          eq(pageContextualDescriptionsTable.deliveryAreaId, deliveryAreaId),
          eq(pageContextualDescriptionsTable.language, language),
        ),
      )
      .limit(1);

    const existing = existingRows[0];

    if (existing) {
      // Never downgrade a manual override row unless explicitly forced
      if (existing.isManualOverride && !force) {
        return;
      }
      // Skip if already done and not forced
      if (existing.generationStatus === "done" && !force) {
        return;
      }
      // Update status to pending for this row (manual override flag stays unchanged
      // until the actual job runs — force=true will clear it there)
      await db
        .update(pageContextualDescriptionsTable)
        .set({ generationStatus: "pending", updatedAt: new Date() })
        .where(eq(pageContextualDescriptionsTable.id, existing.id));
    } else {
      // First time seeing this combination — insert
      await db
        .insert(pageContextualDescriptionsTable)
        .values({
          pageType,
          pageSlug,
          deliveryAreaId,
          language,
          generationStatus: "pending",
          isManualOverride: false,
        })
        .onConflictDoNothing();
    }

    pushReservedJob(job, key);
    queued = true;
    setImmediate(processNext);
  } finally {
    if (!queued) queuedJobKeys.delete(key);
  }
}

/**
 * Enumerate all active delivery area IDs from DELIVERY_COUNTRIES.
 */
function getActiveDeliveryAreaIds(): string[] {
  const ids: string[] = [];
  for (const country of DELIVERY_COUNTRIES) {
    if (country.isActive === false) continue;
    for (const city of country.cities) {
      if (city.isActive === false) continue;
      ids.push(city.id);
    }
  }
  return ids;
}

/**
 * Seed descriptions for all combinations of:
 *   - active delivery areas
 *   - all category slugs
 *   - all occasion slugs
 *   - all languages
 *
 * Skips combinations that already have a "done" or "generating" row.
 * Called once on API server startup (non-blocking) after the OS product
 * cache warms up.
 *
 * Optional filters: restrict to a specific page_type and/or slug.
 */
export async function enqueueBulkSeed(options: {
  pageType?: "category" | "occasion";
  slug?: string;
  /** When set, only enqueue jobs for this single delivery area. */
  deliveryAreaId?: string;
} = {}): Promise<number> {
  const deliveryAreaIds = options.deliveryAreaId
    ? [options.deliveryAreaId]
    : getActiveDeliveryAreaIds();

  const categories = getOsCategories() ?? [];
  const occasions = getOsOccasions() ?? [];

  const categorySlugs = options.slug
    ? [options.slug]
    : categories.map((c) => (c as unknown as { slug?: string }).slug ?? "").filter(Boolean);

  const occasionSlugs = options.slug
    ? [options.slug]
    : occasions.map((o) => (o as unknown as { slug?: string }).slug ?? "").filter(Boolean);

  // Fetch existing rows to skip already-done/generating
  const existingRows = await db
    .select({
      pageType: pageContextualDescriptionsTable.pageType,
      pageSlug: pageContextualDescriptionsTable.pageSlug,
      deliveryAreaId: pageContextualDescriptionsTable.deliveryAreaId,
      language: pageContextualDescriptionsTable.language,
      generationStatus: pageContextualDescriptionsTable.generationStatus,
      isManualOverride: pageContextualDescriptionsTable.isManualOverride,
    })
    .from(pageContextualDescriptionsTable)
    .where(
      inArray(pageContextualDescriptionsTable.generationStatus, ["done", "generating"]),
    );

  const doneKey = new Set(
    existingRows.map(
      (r) => `${r.pageType}::${r.pageSlug}::${r.deliveryAreaId}::${r.language}`,
    ),
  );

  let count = 0;

  const enqueue = async (
    pageType: "category" | "occasion",
    pageSlug: string,
    deliveryAreaId: string,
    language: Language,
  ) => {
    if (!options.pageType || options.pageType === pageType) {
      const key = `${pageType}::${pageSlug}::${deliveryAreaId}::${language}`;
      if (!doneKey.has(key)) {
        const job = { pageType, pageSlug, deliveryAreaId, language };
        const key = reserveQueueSlot(job);
        if (key) {
          pushReservedJob(job, key);
          count++;
        }
      }
    }
  };

  for (const deliveryAreaId of deliveryAreaIds) {
    for (const lang of LANGUAGES) {
      if (!options.pageType || options.pageType === "category") {
        for (const slug of categorySlugs) {
          await enqueue("category", slug, deliveryAreaId, lang);
        }
      }
      if (!options.pageType || options.pageType === "occasion") {
        for (const slug of occasionSlugs) {
          await enqueue("occasion", slug, deliveryAreaId, lang);
        }
      }
    }
  }

  if (count > 0) {
    logger.info({ count }, "pageDescriptionQueue: bulk seed enqueued jobs");
    setImmediate(processNext);
  }

  return count;
}
