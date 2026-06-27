import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for specs that assert behaviour only implemented in the
 * production Node server (serve.mjs) — e.g. the `Link: <…/llms.txt>;
 * rel="describedby"` header and the `/llms.txt` / `/llms-full.txt` routes.
 *
 * The Vite dev server (used by `playwright.config.ts` / the "Web e2e tests"
 * workflow) has no middleware for these, so running them there would silently
 * pass or fail for the wrong reason. These specs live in ./e2e-serve and must
 * be pointed at a built `serve.mjs` instance via PLAYWRIGHT_BASE_URL — the
 * "Web serve checks" workflow builds + starts serve.mjs and runs them there.
 *
 * Most specs use only Playwright's APIRequestContext (the `request` fixture),
 * but some (e.g. blog-image-perf.spec.ts) launch a real browser via the `page`
 * fixture to assert React-rendered markup and the browser's srcset candidate
 * selection against the production build — so the chromium project is a real
 * browser, not just parity. The "Web serve checks" workflow installs the
 * chromium browser before running this config.
 */

const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;

export default defineConfig({
  testDir: "./e2e-serve",
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:80",
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(executablePath ? { executablePath } : {}),
      },
    },
  ],
});
