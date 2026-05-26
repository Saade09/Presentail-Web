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
import { fetchAllProducts } from "./routes/woo";
import { resolveStore } from "./lib/wooStore";

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
  validateOsEnv();
  startOsLocationSync();
  startOsProductsSync();
  startReconcileWorker();
  startWooSyncWorker();

  // Pre-warm the WooCommerce product cache for the default Lebanon store so
  // the first mobile request hits the in-memory cache instead of paying the
  // ~10 s cold-start cost of fetching all products from the WC API live.
  // Fire-and-forget; errors are logged but never crash the server.
  const lbStore = resolveStore("LB", null);
  fetchAllProducts("en", lbStore).then(
    (products) => logger.info({ count: products.length }, "startup: WC product cache warmed for Lebanon"),
    (err: unknown) => logger.warn({ err: (err as Error)?.message }, "startup: WC product cache warm failed"),
  );
  startCheckoutLoginFunnelMonitor();
  startCheckoutPurchaseFunnelMonitor();
  startClerkCatchupSync();
  startAuthExistsLookupMonitor();
  startSocialAuthFailureMonitor();
});
