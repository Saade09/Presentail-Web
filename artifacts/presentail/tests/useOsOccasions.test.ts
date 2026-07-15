/**
 * Unit tests for useOsOccasions() in hooks/useOsOccasions.ts.
 *
 * useOsOccasions starts with the full static occasion list so the UI is
 * never blank, then swaps to the OS-filtered list once fetchOsOccasions()
 * resolves. When the fetch resolves with an empty array (length === 0) the
 * hook deliberately keeps the static list to avoid a blank screen.
 *
 * Scenarios covered:
 *   - Initial render returns the static list synchronously before fetch resolves.
 *   - After a successful fetch the hook transitions to the OS-filtered list,
 *     and inactive occasions (absent from the OS response) are no longer present.
 *   - When fetchOsOccasions resolves with an empty array (length === 0) the
 *     static list is preserved (guard in useOsOccasions: result.length > 0).
 *   - When the component unmounts before the fetch resolves the cancelled flag
 *     prevents a state update (no error thrown, last-captured state is static).
 *
 * Implementation note
 * -------------------
 * Uses react-test-renderer + React.act() — the same approach used across this
 * test suite — rather than @testing-library/react-native, which cannot run in
 * a Node.js / Vitest environment without native-module shims.
 */

import React, { act } from "react";
import * as ReactTestRenderer from "react-test-renderer";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useOsOccasions } from "@/hooks/useOsOccasions";

// ---------------------------------------------------------------------------
// Static catalog stub
// ---------------------------------------------------------------------------

vi.mock("@/data/catalog", () => ({
  occasions: [
    { id: "birthday", name: "Birthday", icon: "cake", image: null },
    { id: "anniversary", name: "Anniversary", icon: "heart", image: null },
    { id: "colleague", name: "Colleague", icon: "briefcase", image: null },
  ],
  categories: [],
}));

// ---------------------------------------------------------------------------
// Mock fetchOsOccasions so tests control what the hook receives
// ---------------------------------------------------------------------------

const mockFetchOsOccasions = vi.fn<() => Promise<{ id: string; name: string; icon: string; image: unknown }[]>>();

vi.mock("@/lib/woo", () => ({
  fetchOsOccasions: () => mockFetchOsOccasions(),
}));

// ---------------------------------------------------------------------------
// Minimal harness: renders the hook and captures its latest return value
// ---------------------------------------------------------------------------

function HookCapture({
  onResult,
}: {
  onResult: (occasions: { id: string; name: string; icon: string; image: unknown }[]) => void;
}): null {
  const occasions = useOsOccasions();
  onResult(occasions as { id: string; name: string; icon: string; image: unknown }[]);
  return null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useOsOccasions — initial state", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns the full static list synchronously before the fetch resolves", () => {
    // fetch is in-flight and will never resolve during this test
    mockFetchOsOccasions.mockReturnValue(new Promise(() => {}));

    let captured: { id: string }[] = [];

    act(() => {
      ReactTestRenderer.create(
        React.createElement(HookCapture, {
          onResult: (v) => { captured = v; },
        }),
      );
    });

    const ids = captured.map((o) => o.id);
    expect(ids).toContain("birthday");
    expect(ids).toContain("anniversary");
    expect(ids).toContain("colleague");
  });
});

describe("useOsOccasions — successful OS fetch", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("transitions to the OS-filtered list after a successful fetch", async () => {
    mockFetchOsOccasions.mockResolvedValue([
      { id: "birthday", name: "Birthday", icon: "cake", image: null },
      { id: "anniversary", name: "Anniversary", icon: "heart", image: null },
      // colleague is absent — inactive in OS
    ]);

    let captured: { id: string }[] = [];

    await act(async () => {
      ReactTestRenderer.create(
        React.createElement(HookCapture, {
          onResult: (v) => { captured = v; },
        }),
      );
    });

    const ids = captured.map((o) => o.id);
    expect(ids).toContain("birthday");
    expect(ids).toContain("anniversary");
    expect(ids).not.toContain("colleague");
  });

  it("replaces the static list with exactly the occasions returned by the OS", async () => {
    mockFetchOsOccasions.mockResolvedValue([
      { id: "birthday", name: "Birthday", icon: "cake", image: null },
    ]);

    let captured: { id: string }[] = [];

    await act(async () => {
      ReactTestRenderer.create(
        React.createElement(HookCapture, {
          onResult: (v) => { captured = v; },
        }),
      );
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].id).toBe("birthday");
  });
});

describe("useOsOccasions — empty OS response preserves static list", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("keeps the static list when fetchOsOccasions resolves with an empty array", async () => {
    mockFetchOsOccasions.mockResolvedValue([]);

    let captured: { id: string }[] = [];

    await act(async () => {
      ReactTestRenderer.create(
        React.createElement(HookCapture, {
          onResult: (v) => { captured = v; },
        }),
      );
    });

    // The guard `if (!cancelled && result.length > 0)` prevents an empty
    // result from replacing the static list.
    const ids = captured.map((o) => o.id);
    expect(ids).toContain("birthday");
    expect(ids).toContain("anniversary");
    expect(ids).toContain("colleague");
  });
});

describe("useOsOccasions — unmount before fetch resolves", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("does not update state after the component unmounts (no error thrown)", async () => {
    let resolveFetch!: (v: { id: string; name: string; icon: string; image: unknown }[]) => void;
    const pendingFetch = new Promise<{ id: string; name: string; icon: string; image: unknown }[]>(
      (res) => { resolveFetch = res; },
    );
    mockFetchOsOccasions.mockReturnValue(pendingFetch);

    let captured: { id: string }[] = [];
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(
        React.createElement(HookCapture, {
          onResult: (v) => { captured = v; },
        }),
      );
    });

    const staticIds = captured.map((o) => o.id);
    expect(staticIds).toContain("colleague");

    // Unmount before the fetch resolves
    act(() => { renderer.unmount(); });

    // Resolve the fetch — the cancelled flag should block setOccs
    await act(async () => {
      resolveFetch([{ id: "birthday", name: "Birthday", icon: "cake", image: null }]);
    });

    // State was last captured from the static list; no update occurred post-unmount
    const finalIds = captured.map((o) => o.id);
    expect(finalIds).toContain("colleague");
  });
});
