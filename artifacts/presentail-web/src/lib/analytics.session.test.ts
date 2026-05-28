import { describe, it, expect, beforeEach, vi } from "vitest";

const SESSION_STORAGE_KEY = "@presentail/analytics-session-id";

function makeSessionStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get store() { return store; },
  };
}

describe("analytics session ID persistence across page navigations", () => {
  let storage: ReturnType<typeof makeSessionStorageMock>;

  beforeEach(() => {
    storage = makeSessionStorageMock();
    vi.stubGlobal("window", {});
    vi.stubGlobal("sessionStorage", storage);
    vi.resetModules();
  });

  it("writes a new session ID to sessionStorage on first load", async () => {
    await import("./analytics");
    const stored = storage.getItem(SESSION_STORAGE_KEY);
    expect(stored).toBeTruthy();
    expect(typeof stored).toBe("string");
    expect(stored!.length).toBeGreaterThan(0);
  });

  it("reuses the same session ID after a simulated page navigation", async () => {
    await import("./analytics");
    const idAfterFirstLoad = storage.getItem(SESSION_STORAGE_KEY);
    expect(idAfterFirstLoad).toBeTruthy();

    vi.resetModules();

    await import("./analytics");
    const idAfterSecondLoad = storage.getItem(SESSION_STORAGE_KEY);

    expect(idAfterSecondLoad).toBe(idAfterFirstLoad);
  });

  it("generates a fresh session ID when sessionStorage is cleared (new tab session)", async () => {
    await import("./analytics");
    const firstId = storage.getItem(SESSION_STORAGE_KEY);

    storage.clear();
    vi.resetModules();

    await import("./analytics");
    const secondId = storage.getItem(SESSION_STORAGE_KEY);

    expect(secondId).toBeTruthy();
    expect(secondId).not.toBe(firstId);
  });
});
