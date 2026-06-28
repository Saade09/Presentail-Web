import { defineConfig, devices } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

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

// ---------------------------------------------------------------------------
// NixOS: Playwright 1.47+ uses a separate "headless shell" binary when
// headless:true, ignoring executablePath.  The downloaded headless shell
// crashes on NixOS because its ABI requirements don't match the system
// libraries.  Instead we find the NixOS-native Chromium binary (which has
// the correct RPATH baked in) and run it with the --headless flag ourselves.
// On non-NixOS systems this detection returns nothing and we fall back to
// Playwright's own headless shell.
// ---------------------------------------------------------------------------
function findNixChromium(): string | undefined {
  try {
    const wrapper = execFileSync("sh", ["-c", "command -v chromium 2>/dev/null"], {
      encoding: "utf8",
    }).trim();
    if (!wrapper || !existsSync(wrapper)) return undefined;

    const wrapperContent = execFileSync("cat", [wrapper], { encoding: "utf8" });
    const m = wrapperContent.match(/exec\s+"([^"]+\/chromium)"/);
    const unwrapped = m?.[1];
    if (unwrapped && existsSync(unwrapped)) return unwrapped;
  } catch {
    // not NixOS / chromium not on PATH
  }
  return undefined;
}

const nixChromium = findNixChromium();

// If we found the NixOS Chromium:
//   - headless: false  → Playwright uses executablePath instead of the headless shell
//   - args: ['--headless']  → Chrome still runs headlessly (no display needed)
// Otherwise keep Playwright's default headless shell behaviour.
const headlessConfig = nixChromium
  ? {
      headless: false as const,
      executablePath: nixChromium,
      args: ["--headless", "--no-sandbox", "--disable-dev-shm-usage"],
    }
  : { headless: true as const };

// PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH can still override both paths.
const overridePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;

export default defineConfig({
  testDir: "./e2e-serve",
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:80",
    viewport: { width: 1280, height: 720 },
    headless: headlessConfig.headless,
    launchOptions: {
      args: "args" in headlessConfig ? headlessConfig.args : [],
      ...(overridePath || ("executablePath" in headlessConfig && headlessConfig.executablePath)
        ? { executablePath: overridePath ?? headlessConfig.executablePath }
        : {}),
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
