import type { Server } from "node:http";
import { logger } from "./logger";
import {
  runDistributedJob,
  isDistributedJobRuntimeShuttingDown,
  startDistributedJobSchedule,
  shutdownDistributedJobs,
  type DistributedSchedule,
} from "./distributedJob";
import { validateOsEnv, startOsLocationSync, stopOsLocationSync } from "./osLocationsCache";
import { startOsProductsSync, stopOsProductsSync, registerOnFirstPopulatedCallback } from "./osProductsCache";
import { startReconcileWorker, stopReconcileWorker } from "./wooOrders";
import { startWooSyncWorker, stopWooSyncWorker } from "./wooSync";
import { startCheckoutLoginFunnelMonitor, stopCheckoutLoginFunnelMonitor } from "./checkoutLoginFunnelMonitor";
import { startCheckoutPurchaseFunnelMonitor, stopCheckoutPurchaseFunnelMonitor } from "./checkoutPurchaseFunnelMonitor";
import { startClerkCatchupSync, stopClerkCatchupSync } from "./clerkCatchupSync";
import { startAuthExistsLookupMonitor, stopAuthExistsLookupMonitor } from "./authExistsLookupMonitor";
import { startSocialAuthFailureMonitor, stopSocialAuthFailureMonitor } from "./socialAuthFailureMonitor";
import { startUpsellConversionMonitor, stopUpsellConversionMonitor } from "./upsellConversionMonitor";
import { startUpsellFunnelMonitor, stopUpsellFunnelMonitor } from "./upsellFunnelMonitor";
import { startSessionCoverageMonitor, stopSessionCoverageMonitor } from "./sessionCoverageMonitor";
import { startClerkSessionFallbackMonitor, stopClerkSessionFallbackMonitor } from "./clerkSessionFallbackMonitor";
import { startSmsFailureMonitor, stopSmsFailureMonitor } from "./smsFailureMonitor";
import { startFxRatesFallbackMonitor, stopFxRatesFallbackMonitor } from "./fxRatesFallbackMonitor";
import { startPendingCheckoutSweeper, stopPendingCheckoutSweeper } from "./pendingCheckoutSweeper";
import { startSeoAuditMonitor, stopSeoAuditMonitor } from "./seoAuditMonitor";
import { startWebVitalsMonitor, stopWebVitalsMonitor } from "./webVitalsMonitor";
import { startGeoCurrencyFallbackMonitor, stopGeoCurrencyFallbackMonitor } from "./geoCurrencyFallbackMonitor";
import { startGoogleAdsConversionMonitor, stopGoogleAdsConversionMonitor } from "./googleAdsConversionMonitor";
import { startProductAffinityMonitor, stopProductAffinityMonitor } from "./productAffinityMonitor";
import { hydrateProductMetricsCache, startProductMetricsSyncJob, stopProductMetricsSyncJob } from "./productMetricsSyncJob";
import { startProductLifecycle410Monitor, stopProductLifecycle410Monitor } from "./productLifecycle410Monitor";
import { startPlantClassificationJob, stopPlantClassificationJob } from "./plantClassificationJob";
import { startProductTranslationWarmJob, stopProductTranslationWarmJob } from "./productTranslationWarmJob";
import { startMerchantListingSuggestionsMonitor, stopMerchantListingSuggestionsMonitor } from "./merchantListingSuggestionsMonitor";
import { startCatalogImageHealthMonitor, stopCatalogImageHealthMonitor } from "./catalogImageHealth";
import { registerStripeApplePayDomains } from "./stripeApplePayDomains";
import { enqueueBulkSeed } from "./pageDescriptionQueue";
import { seedRankingConfigDefaults } from "../routes/adminCollectionRanking";
import { warmActiveProductSocialCards } from "./productSocialBackfillJob";
import { validateFbPixelEnv } from "./fbConversions";
import { waitForInFlightWorkerExecutions } from "./inFlightWorkerExecutions";

/**
 * Inventory and ownership contract for boot-time work. The values are kept
 * next to the lifecycle coordinator so adding a worker requires declaring its
 * owner, cadence, deadline, retry policy, and independent rollback flag.
 */
export const WORKER_RUNTIME_CATALOG = [
  { name: "environment-validation", owner: "per-replica", cadence: "startup", timeoutMs: 0, retries: "none", rollback: "environment configuration" },
  { name: "product-metrics-cache-hydration", owner: "per-replica", cadence: "startup", timeoutMs: 0, retries: "none", rollback: "worker runtime" },
  { name: "os-products", owner: "per-replica cache + distributed refresh", cadence: "WOO_SYNC_INTERVAL_MS", timeoutMs: 600_000, retries: "next due window", rollback: "DISTRIBUTED_JOB_OS_PRODUCTS_LEASE_ENABLED" },
  { name: "os-locations", owner: "per-replica cache + distributed refresh", cadence: "WOO_SYNC_INTERVAL_MS", timeoutMs: 600_000, retries: "next due window", rollback: "DISTRIBUTED_JOB_OS_LOCATIONS_LEASE_ENABLED" },
  { name: "order-reconciliation", owner: "distributed", cadence: "RECONCILE_TICK_MS", timeoutMs: 180_000, retries: "row backoff", rollback: "WOO_RECONCILE_DISABLED" },
  { name: "pending-checkout-sweeper", owner: "distributed", cadence: "2m", timeoutMs: 300_000, retries: "next sweep", rollback: "worker runtime" },
  { name: "product-translation-warm", owner: "distributed", cadence: "6h", timeoutMs: 7_200_000, retries: "10 consecutive failures", rollback: "worker runtime" },
  { name: "seo-audit", owner: "distributed", cadence: "1h / daily guard", timeoutMs: 1_800_000, retries: "next tick", rollback: "SEO_AUDIT_MONITOR_ENABLED" },
  { name: "catalog-image-health", owner: "distributed", cadence: "24h", timeoutMs: 1_800_000, retries: "next day", rollback: "IMAGE_HEALTH_MONITOR_ENABLED" },
  { name: "woo-sync", owner: "shared-worker-runtime", cadence: "WOO_SYNC_INTERVAL_MS", timeoutMs: 0, retries: "next interval", rollback: "WOO_SYNC_DISABLED" },
  { name: "checkout-login-funnel", owner: "shared-worker-runtime", cadence: "monitor-defined", timeoutMs: 0, retries: "next interval", rollback: "monitor flag" },
  { name: "checkout-purchase-funnel", owner: "shared-worker-runtime", cadence: "monitor-defined", timeoutMs: 0, retries: "next interval", rollback: "monitor flag" },
  { name: "clerk-catchup", owner: "shared-worker-runtime", cadence: "monitor-defined", timeoutMs: 0, retries: "next interval", rollback: "monitor flag" },
  { name: "auth-exists-lookup", owner: "shared-worker-runtime", cadence: "monitor-defined", timeoutMs: 0, retries: "next interval", rollback: "monitor flag" },
  { name: "social-auth-failure", owner: "shared-worker-runtime", cadence: "monitor-defined", timeoutMs: 0, retries: "next interval", rollback: "monitor flag" },
  { name: "upsell-conversion", owner: "shared-worker-runtime", cadence: "monitor-defined", timeoutMs: 0, retries: "next interval", rollback: "monitor flag" },
  { name: "upsell-funnel", owner: "shared-worker-runtime", cadence: "monitor-defined", timeoutMs: 0, retries: "next interval", rollback: "monitor flag" },
  { name: "session-coverage", owner: "shared-worker-runtime", cadence: "monitor-defined", timeoutMs: 0, retries: "next interval", rollback: "monitor flag" },
  { name: "clerk-session-fallback", owner: "shared-worker-runtime", cadence: "monitor-defined", timeoutMs: 0, retries: "next interval", rollback: "monitor flag" },
  { name: "sms-failure", owner: "shared-worker-runtime", cadence: "monitor-defined", timeoutMs: 0, retries: "next interval", rollback: "monitor flag" },
  { name: "fx-rates-fallback", owner: "shared-worker-runtime", cadence: "monitor-defined", timeoutMs: 0, retries: "next interval", rollback: "monitor flag" },
  { name: "web-vitals", owner: "shared-worker-runtime", cadence: "monitor-defined", timeoutMs: 0, retries: "next interval", rollback: "monitor flag" },
  { name: "geo-currency-fallback", owner: "shared-worker-runtime", cadence: "monitor-defined", timeoutMs: 0, retries: "next interval", rollback: "monitor flag" },
  { name: "google-ads-conversion", owner: "shared-worker-runtime", cadence: "monitor-defined", timeoutMs: 0, retries: "next interval", rollback: "monitor flag" },
  { name: "product-affinity", owner: "shared-worker-runtime", cadence: "monitor-defined", timeoutMs: 0, retries: "next interval", rollback: "monitor flag" },
  { name: "product-metrics-sync", owner: "shared-worker-runtime", cadence: "ENGAGEMENT_INTERVAL_MS", timeoutMs: 0, retries: "next interval", rollback: "worker runtime" },
  { name: "product-lifecycle-410", owner: "shared-worker-runtime", cadence: "monitor-defined", timeoutMs: 0, retries: "next interval", rollback: "monitor flag" },
  { name: "plant-classification", owner: "shared-worker-runtime", cadence: "PLANT_CLASSIFICATION_INTERVAL_MS", timeoutMs: 0, retries: "next interval", rollback: "worker runtime" },
  { name: "merchant-listing-suggestions", owner: "shared-worker-runtime", cadence: "monitor-defined", timeoutMs: 0, retries: "next interval", rollback: "monitor flag" },
  { name: "ranking-config-defaults", owner: "distributed event", cadence: "startup", timeoutMs: 120_000, retries: "next process startup", rollback: "worker runtime" },
  { name: "stripe-apple-pay-domain-registration", owner: "distributed event", cadence: "startup", timeoutMs: 120_000, retries: "next process startup", rollback: "worker runtime" },
  { name: "page-description-bulk-seed", owner: "distributed event", cadence: "first catalog population", timeoutMs: 120_000, retries: "next process startup", rollback: "worker runtime" },
  { name: "product-social-backfill", owner: "distributed event", cadence: "first catalog population", timeoutMs: 120_000, retries: "next process startup", rollback: "worker runtime" },
] as const;

let started = false;
let stopping: Promise<void> | null = null;
let sharedOwnerSchedule: DistributedSchedule | null = null;
let unregisterFirstPopulation: (() => void) | null = null;

const startSingleOwnerComponents = () => {
  startWooSyncWorker();
  startCheckoutLoginFunnelMonitor();
  startCheckoutPurchaseFunnelMonitor();
  startClerkCatchupSync();
  startAuthExistsLookupMonitor();
  startSocialAuthFailureMonitor();
  startUpsellConversionMonitor();
  startUpsellFunnelMonitor();
  startSessionCoverageMonitor();
  startClerkSessionFallbackMonitor();
  startSmsFailureMonitor();
  startFxRatesFallbackMonitor();
  startWebVitalsMonitor();
  startGeoCurrencyFallbackMonitor();
  startGoogleAdsConversionMonitor();
  startProductAffinityMonitor();
  startProductMetricsSyncJob();
  startProductLifecycle410Monitor();
  startPlantClassificationJob();
  startMerchantListingSuggestionsMonitor();
};

const stopSingleOwnerComponents = () => {
  stopWooSyncWorker();
  stopCheckoutLoginFunnelMonitor();
  stopCheckoutPurchaseFunnelMonitor();
  stopClerkCatchupSync();
  stopAuthExistsLookupMonitor();
  stopSocialAuthFailureMonitor();
  stopUpsellConversionMonitor();
  stopUpsellFunnelMonitor();
  stopSessionCoverageMonitor();
  stopClerkSessionFallbackMonitor();
  stopSmsFailureMonitor();
  stopFxRatesFallbackMonitor();
  stopWebVitalsMonitor();
  stopGeoCurrencyFallbackMonitor();
  stopGoogleAdsConversionMonitor();
  stopProductAffinityMonitor();
  stopProductMetricsSyncJob();
  stopProductLifecycle410Monitor();
  stopPlantClassificationJob();
  stopMerchantListingSuggestionsMonitor();
};

export function startWorkerRuntime(): void {
  if (started) return;
  started = true;

  validateOsEnv();
  validateFbPixelEnv();
  void hydrateProductMetricsCache();
  startOsLocationSync();
  startOsProductsSync();
  startReconcileWorker();
  void runDistributedJob({
    jobName: "ranking-config-defaults",
    intervalMs: 24 * 60 * 60 * 1000,
    timeoutMs: 120_000,
    task: async () => seedRankingConfigDefaults(),
  }).catch((error: unknown) => logger.warn({ err: String(error) }, "startup: ranking defaults failed"));
  void runDistributedJob({
    jobName: "stripe-apple-pay-domain-registration",
    intervalMs: 24 * 60 * 60 * 1000,
    timeoutMs: 120_000,
    task: async () => registerStripeApplePayDomains(),
  }).catch((error: unknown) => {
    logger.warn({ err: error instanceof Error ? error.message : String(error) }, "startup: Apple Pay domain registration failed");
  });
  startPendingCheckoutSweeper();
  startSeoAuditMonitor();
  startProductTranslationWarmJob();
  startCatalogImageHealthMonitor();

  // These legacy monitors have their own unchanged timers and rollback flags.
  // A session advisory lock makes the whole timer set single-owner; loss of the
  // PostgreSQL session aborts the context and stops every timer before takeover.
  sharedOwnerSchedule = startDistributedJobSchedule({
    jobName: "shared-worker-runtime",
    intervalMs: 60_000,
    startupDelayMs: 0,
    timeoutMs: 7 * 24 * 60 * 60 * 1000,
    task: async (context) => {
      startSingleOwnerComponents();
      try {
        await new Promise<void>((resolve) => {
          if (context.signal.aborted) return resolve();
          context.signal.addEventListener("abort", () => resolve(), { once: true });
        });
      } finally {
        stopSingleOwnerComponents();
        if (
          context.signal.aborted &&
          !isDistributedJobRuntimeShuttingDown()
        ) {
          logger.fatal(
            { reason: String(context.signal.reason) },
            "shared worker ownership lost; exiting to fence untracked legacy calls",
          );
          process.exit(1);
        }
      }
    },
  });

  unregisterFirstPopulation = registerOnFirstPopulatedCallback(() => {
    void runDistributedJob({
      jobName: "page-description-bulk-seed",
      intervalMs: 24 * 60 * 60 * 1000,
      timeoutMs: 120_000,
      task: async () => enqueueBulkSeed(),
    }).catch((error: unknown) => logger.warn({ err: String(error) }, "startup: pageDescription bulk seed failed"));
    void runDistributedJob({
      jobName: "product-social-backfill",
      intervalMs: 24 * 60 * 60 * 1000,
      timeoutMs: 120_000,
      task: async () => warmActiveProductSocialCards(),
    }).catch((error: unknown) => logger.warn({ err: String(error) }, "startup: product social backfill failed"));
  });
}

export async function stopWorkerRuntime(server: Server, graceMs = 20_000): Promise<void> {
  if (stopping) return stopping;
  stopping = (async () => {
    const deadline = Date.now() + graceMs;
    const remainingGraceMs = () => Math.max(0, deadline - Date.now());

    // Stop new HTTP work first, then prevent future timer callbacks.
    const httpClosed = new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    server.closeIdleConnections?.();
    stopOsLocationSync();
    stopOsProductsSync();
    unregisterFirstPopulation?.();
    unregisterFirstPopulation = null;
    stopReconcileWorker();
    sharedOwnerSchedule?.stop();
    sharedOwnerSchedule = null;
    stopSingleOwnerComponents();
    stopPendingCheckoutSweeper();
    stopSeoAuditMonitor();
    stopProductTranslationWarmJob();
    stopCatalogImageHealthMonitor();
    const workerDrain = await waitForInFlightWorkerExecutions(remainingGraceMs());
    if (!workerDrain.drained) {
      logger.warn(
        { remaining: workerDrain.remaining.map(({ name }) => name) },
        "worker runtime: timed out waiting for legacy worker executions",
      );
    }
    await shutdownDistributedJobs(remainingGraceMs());
    const closedGracefully = await Promise.race([
      httpClosed.then(() => true),
      new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), remainingGraceMs());
        timer.unref?.();
      }),
    ]);
    if (!closedGracefully) server.closeAllConnections?.();
  })();
  return stopping;
}
