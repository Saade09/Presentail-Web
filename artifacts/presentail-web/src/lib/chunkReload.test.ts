// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isChunkLoadError, reloadForStaleChunk } from "./chunkReload";

describe("isChunkLoadError", () => {
  it("matches Chromium/Firefox/WebKit dynamic-import messages", () => {
    expect(
      isChunkLoadError(
        new Error("Failed to fetch dynamically imported module: /assets/x.js"),
      ),
    ).toBe(true);
    expect(
      isChunkLoadError(new Error("error loading dynamically imported module")),
    ).toBe(true);
    expect(
      isChunkLoadError(new Error("Importing a module script failed.")),
    ).toBe(true);
    expect(isChunkLoadError("ChunkLoadError: something")).toBe(true);
  });

  it("ignores unrelated errors, plain 'Load failed', and non-error values", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of null"))).toBe(
      false,
    );
    // Plain "Load failed" is WebKit's generic fetch failure — must NOT trigger a
    // reload, or unrelated API/network errors would force page reloads.
    expect(isChunkLoadError(new Error("Load failed"))).toBe(false);
    expect(isChunkLoadError(new TypeError("Load failed"))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError({})).toBe(false);
    expect(isChunkLoadError("")).toBe(false);
  });
});

describe("reloadForStaleChunk loop guard (sessionStorage path)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("navigates (replace) up to twice per incident then stops", () => {
    const replace = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, replace, href: "https://x.test/en-lb/beirut" },
    });

    reloadForStaleChunk();
    reloadForStaleChunk();
    reloadForStaleChunk();

    expect(replace).toHaveBeenCalledTimes(2);
    // replace() should be called with the current URL (full navigation, not reload()).
    expect(replace.mock.calls[0][0]).toBe("https://x.test/en-lb/beirut");
  });

  it("allows navigating again for a fresh incident after the window elapses", () => {
    const replace = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, replace, href: "https://x.test/en-lb/beirut" },
    });

    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(0);
    reloadForStaleChunk();
    reloadForStaleChunk();
    expect(replace).toHaveBeenCalledTimes(2);

    // More than the incident window later — counter resets.
    nowSpy.mockReturnValue(120_000);
    reloadForStaleChunk();
    expect(replace).toHaveBeenCalledTimes(3);
  });
});

describe("reloadForStaleChunk loop guard (storage-unavailable fallback)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubStorageThrows() {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError: sessionStorage is not available");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError: sessionStorage is not available");
    });
  }

  it("malformed sessionStorage JSON fails closed via the URL-marker fallback", () => {
    vi.spyOn(Storage.prototype, "getItem").mockReturnValue("{not-json");
    const replace = vi.fn();
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload, replace, href: "https://x.test/en-lb/beirut" },
    });

    reloadForStaleChunk();

    // JSON.parse throws → caught → bounded URL-marker path taken instead of loop.
    expect(reload).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0][0]).toContain("_cr=1");
  });

  it("falls back to a bounded URL-marker guard and never loops", () => {
    stubStorageThrows();
    const replace = vi.fn();
    const reload = vi.fn();

    // First failure: no marker yet → replace with _cr=1.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload, replace, href: "https://x.test/en-lb/beirut" },
    });
    reloadForStaleChunk();
    expect(reload).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0][0]).toContain("_cr=1");

    // Simulate the reloaded page already carrying _cr=2 (at the cap) → stop.
    replace.mockClear();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...window.location,
        reload,
        replace,
        href: "https://x.test/en-lb/beirut?_cr=2",
      },
    });
    reloadForStaleChunk();
    expect(replace).not.toHaveBeenCalled();
  });
});
