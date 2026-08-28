import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { startWorkerRuntime, stopWorkerRuntime } from "./lib/workerRuntime";
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

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  if (process.env.BASELINE_DISABLE_WORKERS === "1") {
    logger.info(
      "Baseline isolation enabled; background workers and startup integrations are disabled",
    );
    return;
  }
  startWorkerRuntime();
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutdown: stopping API worker runtime");
  try {
    await stopWorkerRuntime(server);
  } finally {
    await pool.end();
  }
}

process.once("SIGTERM", () => {
  void shutdown("SIGTERM").then(() => process.exit(0));
});
process.once("SIGINT", () => {
  void shutdown("SIGINT").then(() => process.exit(0));
});
