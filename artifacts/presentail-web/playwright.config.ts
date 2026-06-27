import { defineConfig, devices } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

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
  testDir: "./e2e",
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
  // Both projects share `testDir: "./e2e"`, so every spec runs at both a
  // desktop (1280×720) and a mobile (390×844) viewport. The mobile project is
  // important for the checkout flow specifically: on small screens the layout
  // shifts (accordions collapse, fields reorder), so Tab/Return focus chains in
  // `keyboard-nav.spec.ts` can break differently than on desktop. Running that
  // suite under "Mobile Chrome" guards the mobile keyboard flow. All keyboard-nav
  // focus-chain assertions currently hold at 390×844 — if a future layout change
  // breaks one only on mobile, skip it with `test.skip(isMobile, "<reason>")`
  // rather than weakening the desktop assertion.
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "Mobile Chrome",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
