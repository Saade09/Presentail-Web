import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for Presentail e2e tests.
 *
 * The Expo app ships a web build via expo-router that serves the same
 * `/checkout` and `/order-confirmed` screens — we use it as the e2e
 * target so the tests can drive the real checkout reducer (cart, step
 * advancement, payment routing) without a native simulator.
 *
 * The dev server is started automatically by `pnpm test:e2e` via the
 * `webServer` block below, so CI doesn't need a separately-running
 * workflow. `E2E_BASE_URL` overrides the default and disables the
 * managed server (useful when pointing at an already-running preview).
 */

// Explicit port so the managed dev server doesn't depend on a `$PORT`
// inherited from a Replit workflow — `pnpm test:e2e` must work in any
// environment (CI, a fresh shell, etc.). Keep this in sync with the
// artifact's localPort in `.replit-artifact/artifact.toml`.
const E2E_PORT = process.env.E2E_PORT ?? "20808";
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${E2E_PORT}`;
const useManagedServer = !process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    viewport: { width: 414, height: 896 },
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "mobile-web",
      use: { ...devices["iPhone 13"] },
    },
  ],
  ...(useManagedServer
    ? {
        webServer: {
          // Set PORT inline so the dev script's `--port $PORT` flag is
          // always populated, regardless of the parent shell's env.
          command: `PORT=${E2E_PORT} pnpm --filter @workspace/presentail run dev`,
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
          // Expo dev server logs to stdout — leave it visible so failures
          // are diagnosable.
          stdout: "pipe" as const,
          stderr: "pipe" as const,
        },
      }
    : {}),
});
