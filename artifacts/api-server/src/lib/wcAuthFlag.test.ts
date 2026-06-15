import { describe, it, expect, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// isWcAuthEnabled – env var driven feature flag
// ---------------------------------------------------------------------------
// We re-import the module fresh after each env mutation by resetting module
// state via a dynamic import inside each test.  Vitest does NOT automatically
// share module state across dynamic imports in the same test process, but the
// approach below is sufficient for testing the simple boolean helper.

async function getIsWcAuthEnabled(): Promise<() => boolean> {
  // Force fresh module evaluation each time by including a cache-buster that
  // is evaluated at import time.  Since vitest uses native ESM, the module
  // cache is shared; we directly reset the env and re-import.
  const mod = await import("./auth");
  return mod.isWcAuthEnabled;
}

describe("isWcAuthEnabled", () => {
  const originalEnv = process.env.WC_AUTH_ENABLED;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.WC_AUTH_ENABLED;
    } else {
      process.env.WC_AUTH_ENABLED = originalEnv;
    }
  });

  it("returns false when WC_AUTH_ENABLED is not set (default: disabled)", async () => {
    delete process.env.WC_AUTH_ENABLED;
    const fn = await getIsWcAuthEnabled();
    expect(fn()).toBe(false);
  });

  it("returns false when WC_AUTH_ENABLED is empty string", async () => {
    process.env.WC_AUTH_ENABLED = "";
    const fn = await getIsWcAuthEnabled();
    expect(fn()).toBe(false);
  });

  it("returns false when WC_AUTH_ENABLED is '0'", async () => {
    process.env.WC_AUTH_ENABLED = "0";
    const fn = await getIsWcAuthEnabled();
    expect(fn()).toBe(false);
  });

  it("returns false when WC_AUTH_ENABLED is 'false'", async () => {
    process.env.WC_AUTH_ENABLED = "false";
    const fn = await getIsWcAuthEnabled();
    expect(fn()).toBe(false);
  });

  it("returns true when WC_AUTH_ENABLED is '1'", async () => {
    process.env.WC_AUTH_ENABLED = "1";
    const fn = await getIsWcAuthEnabled();
    expect(fn()).toBe(true);
  });

  it("returns true when WC_AUTH_ENABLED is 'true'", async () => {
    process.env.WC_AUTH_ENABLED = "true";
    const fn = await getIsWcAuthEnabled();
    expect(fn()).toBe(true);
  });

  it("returns true when WC_AUTH_ENABLED is 'yes'", async () => {
    process.env.WC_AUTH_ENABLED = "yes";
    const fn = await getIsWcAuthEnabled();
    expect(fn()).toBe(true);
  });
});
