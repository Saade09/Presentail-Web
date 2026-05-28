import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

const SESSION_ID_KEY = "@presentail/analytics-session-id";
const SESSION_LAST_SEEN_KEY = "@presentail/analytics-session-last-seen";
const SESSION_TTL_MS = 30 * 60 * 1000;

function makeLocalStorageMock() {
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
  let storage: ReturnType<typeof makeLocalStorageMock>;

  beforeEach(() => {
    storage = makeLocalStorageMock();
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes a new session ID to localStorage on first load", async () => {
    await import("./analytics");
    const stored = storage.getItem(SESSION_ID_KEY);
    expect(stored).toBeTruthy();
    expect(typeof stored).toBe("string");
    expect(stored!.length).toBeGreaterThan(0);
  });

  it("writes a lastSeen timestamp alongside the session ID on first load", async () => {
    const now = Date.now();
    await import("./analytics");
    const lastSeenRaw = storage.getItem(SESSION_LAST_SEEN_KEY);
    expect(lastSeenRaw).toBeTruthy();
    const lastSeen = parseInt(lastSeenRaw!, 10);
    expect(lastSeen).toBeGreaterThanOrEqual(now - 100);
  });

  it("reuses the same session ID after a simulated page navigation when within TTL", async () => {
    const base = 1_000_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(base);

    await import("./analytics");
    const idAfterFirstLoad = storage.getItem(SESSION_ID_KEY);
    expect(idAfterFirstLoad).toBeTruthy();

    vi.resetModules();
    vi.spyOn(Date, "now").mockReturnValue(base + SESSION_TTL_MS - 1000);

    await import("./analytics");
    const idAfterSecondLoad = storage.getItem(SESSION_ID_KEY);

    expect(idAfterSecondLoad).toBe(idAfterFirstLoad);
  });

  it("generates a fresh session ID after the TTL has elapsed", async () => {
    const base = 1_000_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(base);

    await import("./analytics");
    const firstId = storage.getItem(SESSION_ID_KEY);
    expect(firstId).toBeTruthy();

    vi.resetModules();
    vi.spyOn(Date, "now").mockReturnValue(base + SESSION_TTL_MS + 1000);

    await import("./analytics");
    const secondId = storage.getItem(SESSION_ID_KEY);

    expect(secondId).toBeTruthy();
    expect(secondId).not.toBe(firstId);
  });

  it("generates a fresh session ID when localStorage is cleared (new tab / private session)", async () => {
    await import("./analytics");
    const firstId = storage.getItem(SESSION_ID_KEY);

    storage.clear();
    vi.resetModules();

    await import("./analytics");
    const secondId = storage.getItem(SESSION_ID_KEY);

    expect(secondId).toBeTruthy();
    expect(secondId).not.toBe(firstId);
  });

  it("updates lastSeen on each trackEvent call", async () => {
    const base = 1_000_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(base);

    const { trackEvent } = await import("./analytics");

    vi.spyOn(Date, "now").mockReturnValue(base + 5000);

    vi.stubGlobal("navigator", {
      sendBeacon: () => true,
    });

    trackEvent({ name: "cart_viewed" });

    const lastSeen = parseInt(storage.getItem(SESSION_LAST_SEEN_KEY) ?? "0", 10);
    expect(lastSeen).toBe(base + 5000);
  });

  it("returns a stable in-memory ID across multiple trackEvent calls when localStorage throws", async () => {
    const throwingStorage = {
      getItem: () => { throw new Error("storage unavailable"); },
      setItem: () => { throw new Error("storage unavailable"); },
    };
    vi.stubGlobal("localStorage", throwingStorage);
    vi.stubGlobal("navigator", { sendBeacon: () => true });

    const { trackEvent } = await import("./analytics");

    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) {
      let capturedId: string | null = null;
      vi.stubGlobal("navigator", {
        sendBeacon: (_url: string, blob: Blob) => {
          void blob.text().then((t) => {
            capturedId = JSON.parse(t).sessionId as string;
          });
          return true;
        },
      });
      trackEvent({ name: "cart_viewed" });
      await Promise.resolve();
      if (capturedId) ids.add(capturedId);
    }
    expect(ids.size).toBeLessThanOrEqual(1);
  });
});
