import { db } from "@workspace/db";
import { plantEnvironmentCacheTable } from "@workspace/db/schema";
import { inArray } from "drizzle-orm";
import { logger } from "./logger";
import { getOsProducts } from "./osProductsCache";
import { classifyPlantProducts, computeContentHash } from "./plantEnvironmentInference";
import { trackWorkerExecution } from "./inFlightWorkerExecutions";

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

const PLANTS_CATEGORY_SLUG = "plants";

let jobTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = true;

/**
 * Fetches plant products from the OS cache, computes content hashes,
 * and classifies only new or changed products.
 */
async function runClassificationCycle(): Promise<void> {
  const allProducts = getOsProducts();
  if (!allProducts || allProducts.length === 0) {
    logger.info("plantClassificationJob: OS product cache is empty — skipping cycle");
    return;
  }

  // Filter to plants category only
  const plantProducts = allProducts.filter((p) => {
    const cats = p.categories ?? [];
    return cats.some(
      (c) =>
        c.slug === PLANTS_CATEGORY_SLUG ||
        c.name?.toLowerCase() === "plants",
    );
  });

  if (plantProducts.length === 0) {
    logger.info("plantClassificationJob: no plant products found in OS cache — skipping cycle");
    return;
  }

  // Compute current content hashes
  const productInputs = plantProducts.map((p) => ({
    id: String(p.osNumericId ?? p.id),
    name: p.name,
    imageUrl: p.images[0]?.url ?? null,
    description: p.description ?? null,
  }));

  // Read existing cache rows to detect which products need classification
  const ids = productInputs.map((p) => p.id);
  const existingRows = await db
    .select()
    .from(plantEnvironmentCacheTable)
    .where(inArray(plantEnvironmentCacheTable.osProductId, ids));

  const existingByid = new Map(existingRows.map((r) => [r.osProductId, r]));

  const toClassify = productInputs.filter((p) => {
    const hash = computeContentHash(p.name, p.imageUrl, p.description);
    const row = existingByid.get(p.id);
    if (!row) return true; // new product
    if (row.contentHash !== hash) return true; // content changed
    if (row.source === "fallback" || row.needsReview) return true; // needs retry
    return false;
  });

  const skipCount = productInputs.length - toClassify.length;

  if (toClassify.length === 0) {
    logger.info(
      { total: productInputs.length, skipped: skipCount },
      "plantClassificationJob: all plant products are up to date — nothing to classify",
    );
    return;
  }

  logger.info(
    { total: productInputs.length, toClassify: toClassify.length, skipped: skipCount },
    "plantClassificationJob: starting classification cycle",
  );

  let classifiedCount = 0;
  let failureCount = 0;

  try {
    const results = await classifyPlantProducts(toClassify, { forceReclassify: true });
    for (const [, result] of results) {
      if (result.source === "fallback") {
        failureCount++;
      } else {
        classifiedCount++;
      }
    }
  } catch (err) {
    logger.error({ err }, "plantClassificationJob: classification cycle threw unexpectedly");
    failureCount = toClassify.length;
  }

  logger.info(
    { classified: classifiedCount, skipped: skipCount, aiFailures: failureCount },
    "plantClassificationJob: cycle complete",
  );
}

/**
 * Starts the recurring plant classification background job.
 *
 * Interval is controlled by the PLANT_CLASSIFICATION_INTERVAL_MS env var
 * (default: 10 minutes).
 */
export function startPlantClassificationJob(): void {
  if (jobTimer !== null) return;
  stopped = false;

  const rawInterval = process.env.PLANT_CLASSIFICATION_INTERVAL_MS;
  const interval = rawInterval ? parseInt(rawInterval, 10) : DEFAULT_INTERVAL_MS;
  const safeInterval = Number.isFinite(interval) && interval > 0 ? interval : DEFAULT_INTERVAL_MS;

  logger.info(
    { intervalMs: safeInterval },
    "plantClassificationJob: starting background classification job",
  );

  function scheduleNext(): void {
    jobTimer = setTimeout(() => {
      jobTimer = null;
      void trackWorkerExecution("plant-classification", runClassificationCycle()).finally(() => {
        if (!stopped) scheduleNext();
      });
    }, safeInterval);
  }

  // Run an initial cycle shortly after startup to populate classifications fast
  jobTimer = setTimeout(() => {
    jobTimer = null;
    void trackWorkerExecution("plant-classification", runClassificationCycle()).finally(() => {
      if (!stopped) scheduleNext();
    });
  }, 30_000); // 30 seconds after startup
}

export function stopPlantClassificationJob(): void {
  stopped = true;
  if (jobTimer !== null) {
    clearTimeout(jobTimer);
    jobTimer = null;
  }
}
