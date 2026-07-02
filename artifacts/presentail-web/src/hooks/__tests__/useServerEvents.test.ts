// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ---------------------------------------------------------------------------
// Mock EventSource
//
// Extends EventTarget so addEventListener / dispatchEvent work natively.
// The constructor captures the single instance so tests can fire events.
// ---------------------------------------------------------------------------

class MockEventSource extends EventTarget {
  static instance: MockEventSource | null = null;

  readonly url: string;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    super();
    this.url = url;
    MockEventSource.instance = this;
  }

  close() {
    // no-op in tests
  }
}

// ---------------------------------------------------------------------------
// Import hook AFTER mocks are established so the module sees the stub.
// ---------------------------------------------------------------------------

import { useServerEvents } from "../useServerEvents";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useServerEvents", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.useFakeTimers();
    MockEventSource.instance = null;
    vi.stubGlobal("EventSource", MockEventSource);

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    vi.spyOn(queryClient, "invalidateQueries");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // Core behaviour: locations-updated event invalidates the cache
  // -------------------------------------------------------------------------

  it("invalidates the delivery-locations cache when a locations-updated SSE event fires", async () => {
    renderHook(() => useServerEvents(), { wrapper: makeWrapper(queryClient) });

    // document.readyState is "complete" in jsdom — the hook schedules a
    // 3-second delay immediately without waiting for a load event.
    expect(MockEventSource.instance).toBeNull();

    // Advance past the 3-second connection delay.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    // EventSource should be open now.
    expect(MockEventSource.instance).not.toBeNull();

    // Dispatch the SSE event the server emits when delivery config changes.
    act(() => {
      MockEventSource.instance!.dispatchEvent(new Event("locations-updated"));
    });

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["delivery-locations"],
    });
  });

  // -------------------------------------------------------------------------
  // Load-delay guard: EventSource must NOT open before 3 seconds elapse
  // -------------------------------------------------------------------------

  it("does not open the EventSource before the 3-second delay elapses", async () => {
    renderHook(() => useServerEvents(), { wrapper: makeWrapper(queryClient) });

    // One millisecond short of the delay — should still be unconnected.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_999);
    });

    expect(MockEventSource.instance).toBeNull();
  });

  // -------------------------------------------------------------------------
  // readyState "loading": hook must wait for the load event, then wait 3 s
  // -------------------------------------------------------------------------

  it("waits for the load event then applies the 3-second delay when readyState is loading", async () => {
    Object.defineProperty(document, "readyState", {
      value: "loading",
      configurable: true,
    });

    renderHook(() => useServerEvents(), { wrapper: makeWrapper(queryClient) });

    // Timer advances while readyState is "loading" — nothing should connect.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(MockEventSource.instance).toBeNull();

    // Fire the load event — schedules the 3-second connect timer.
    act(() => {
      window.dispatchEvent(new Event("load"));
    });

    // Still not connected — the 3-second post-load delay hasn't elapsed.
    expect(MockEventSource.instance).toBeNull();

    // Advance the remaining 3 seconds.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(MockEventSource.instance).not.toBeNull();

    // Restore to the jsdom default so other tests are not affected.
    Object.defineProperty(document, "readyState", {
      value: "complete",
      configurable: true,
    });
  });

  // -------------------------------------------------------------------------
  // Cleanup: timers and EventSource are torn down on unmount
  // -------------------------------------------------------------------------

  it("closes the EventSource and clears timers on unmount", async () => {
    const { unmount } = renderHook(() => useServerEvents(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(MockEventSource.instance).not.toBeNull();
    const closeSpy = vi.spyOn(MockEventSource.instance!, "close");

    unmount();

    expect(closeSpy).toHaveBeenCalled();
  });
});
