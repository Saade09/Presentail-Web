import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { startReconcileWorker } from "./lib/wooOrders";
import { startWooSyncWorker } from "./lib/wooSync";
import { validateOsEnv, startOsLocationSync } from "./lib/osLocationsCache";
import { startOsProductsSync } from "./lib/osProductsCache";
import { startCheckoutLoginFunnelMonitor } from "./lib/checkoutLoginFunnelMonitor";
import { startCheckoutPurchaseFunnelMonitor } from "./lib/checkoutPurchaseFunnelMonitor";
import { startClerkCatchupSync } from "./lib/clerkCatchupSync";
import { startAuthExistsLookupMonitor } from "./lib/authExistsLookupMonitor";
import { startSocialAuthFailureMonitor } from "./lib/socialAuthFailureMonitor";
import { startUpsellConversionMonitor } from "./lib/upsellConversionMonitor";
import { startUpsellFunnelMonitor } from "./lib/upsellFunnelMonitor";
import { startSessionCoverageMonitor } from "./lib/sessionCoverageMonitor";
import { startClerkSessionFallbackMonitor } from "./lib/clerkSessionFallbackMonitor";
import { startSmsFailureMonitor } from "./lib/smsFailureMonitor";
import { startFxRatesFallbackMonitor } from "./lib/fxRatesFallbackMonitor";
import { startSeoAuditMonitor } from "./lib/seoAuditMonitor";
import { startWebVitalsMonitor } from "./lib/webVitalsMonitor";
import { startGeoCurrencyFallbackMonitor } from "./lib/geoCurrencyFallbackMonitor";
import { startGoogleAdsConversionMonitor } from "./lib/googleAdsConversionMonitor";
import { startProductAffinityMonitor } from "./lib/productAffinityMonitor";
import { startProductMetricsSyncJob } from "./lib/productMetricsSyncJob";
import { registerStripeApplePayDomains } from "./lib/stripeApplePayDomains";
import { registerOnFirstPopulatedCallback } from "./lib/osProductsCache";
import { enqueueBulkSeed } from "./lib/pageDescriptionQueue";
import { validateFbPixelEnv } from "./lib/fbConversions";
// Prevent unhandled 'error' events on idle pg pool clients from crashing the
// process. pg emits these when a connection is terminated unexpectedly (e.g. a
// database restart or transient network drop). The pool will automatically
// remove the dead client and create a fresh one on the next query, so the
// correct recovery is to log and continue rather than exit.
pool.on("error", (err) => {
  logger.warn({ err }, "pg pool idle client error — connection will be replaced automatically");
});

// Belt-and-suspenders: log any other uncaught exception that slips through so
// we get a structured record before the process exits.
process.on("uncaughtException", (err) => {
  logger.error({ err }, "uncaughtException — process will exit");
  process.exit(1);
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  void registerStripeApplePayDomains();
  validateOsEnv();
  validateFbPixelEnv();
  startOsLocationSync();
  startOsProductsSync();
  startReconcileWorker();
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
  startSeoAuditMonitor();
  startWebVitalsMonitor();
  startGeoCurrencyFallbackMonitor();
  startGoogleAdsConversionMonitor();
  startProductAffinityMonitor();
  startProductMetricsSyncJob();

  // Seed contextual descriptions for all category/occasion × area × language
  // combinations once the OS product catalog is first populated. Runs in the
  // background — never blocks startup. Skips already-done and manual rows.
  registerOnFirstPopulatedCallback(() => {
    void enqueueBulkSeed().catch((err: unknown) => {
      logger.warn({ err: (err as Error)?.message }, "startup: pageDescription bulk seed failed (non-fatal)");
    });
  });
});
