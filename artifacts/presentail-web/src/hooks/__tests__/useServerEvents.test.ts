// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ---------------------------------------------------------------------------
// Mock EventSource
//
// Extends EventTarget so addEventListener / dispatchEvent work natively.
// `instance` holds the *latest* created source (original tests).
// `instances` holds every source ever created (reconnect tests).
// ---------------------------------------------------------------------------

class MockEventSource extends EventTarget {
  static instance: MockEventSource | null = null;
  static instances: MockEventSource[] = [];

  readonly url: string;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    super();
    this.url = url;
    MockEventSource.instance = this;
    MockEventSource.instances.push(this);
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

/**
 * Advance past the 3-second deferred-connect guard so the first EventSource
 * is opened, then return it.
 */
async function advancePastInitialDelay(): Promise<MockEventSource> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3_000);
  });
  const src = MockEventSource.instances[0];
  expect(src).toBeDefined();
  return src;
}

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

describe("useServerEvents", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.useFakeTimers();
    MockEventSource.instance = null;
    MockEventSource.instances = [];
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

  // -------------------------------------------------------------------------
  // Backoff reconnect — new EventSource is created after onerror + 5 s wait
  // -------------------------------------------------------------------------

  it("creates a new EventSource after onerror once the 5-second backoff elapses", async () => {
    renderHook(() => useServerEvents(), { wrapper: makeWrapper(queryClient) });

    const first = await advancePastInitialDelay();
    expect(MockEventSource.instances).toHaveLength(1);

    // Trigger an error on the first connection.
    act(() => {
      first.onerror?.(new Event("error"));
    });

    // One millisecond short of the backoff — still no new connection.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_999);
    });
    expect(MockEventSource.instances).toHaveLength(1);

    // At exactly 5 seconds the reconnect fires.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(MockEventSource.instances).toHaveLength(2);
    expect(MockEventSource.instances[1].url).toBe("/api/events");
  });

  // -------------------------------------------------------------------------
  // Backoff doubles on consecutive errors and is capped at 60 s
  // -------------------------------------------------------------------------

  it("doubles the backoff on each consecutive error and caps at 60 s", async () => {
    renderHook(() => useServerEvents(), { wrapper: makeWrapper(queryClient) });

    const first = await advancePastInitialDelay();

    // Error 1 — backoff is 5 s → next connection fires after 5 s.
    act(() => {
      first.onerror?.(new Event("error"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(MockEventSource.instances).toHaveLength(2);

    // Error 2 — backoff should now be 10 s.
    const second = MockEventSource.instances[1];
    act(() => {
      second.onerror?.(new Event("error"));
    });
    // 9 999 ms — should NOT have reconnected yet.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_999);
    });
    expect(MockEventSource.instances).toHaveLength(2);
    // 1 ms more — fires at exactly 10 s.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(MockEventSource.instances).toHaveLength(3);

    // Errors 3, 4, 5 → expected delays: 20 s, 40 s, 60 s (cap applied at 80→60).
    const expectedDelays = [20_000, 40_000, 60_000];
    for (const delay of expectedDelays) {
      const prev = MockEventSource.instances.at(-1)!;
      const countBefore = MockEventSource.instances.length;
      act(() => {
        prev.onerror?.(new Event("error"));
      });
      // One ms short — must not have fired yet.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(delay - 1);
      });
      expect(MockEventSource.instances.length).toBe(countBefore);
      // Exact ms — fires.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(MockEventSource.instances.length).toBe(countBefore + 1);
    }

    // After the cap-enforcing error the next backoff must still be 60 s
    // (not 120 s), confirming Math.min(80_000, 60_000) === 60_000.
    const capped = MockEventSource.instances.at(-1)!;
    const countBeforeCapped = MockEventSource.instances.length;
    act(() => {
      capped.onerror?.(new Event("error"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_999);
    });
    expect(MockEventSource.instances.length).toBe(countBeforeCapped);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(MockEventSource.instances.length).toBe(countBeforeCapped + 1);
  });

  // -------------------------------------------------------------------------
  // Backoff resets to 5 s after a successful open on the reconnected source
  // -------------------------------------------------------------------------

  it("resets the backoff to 5 s after an open event fires on the reconnected EventSource", async () => {
    renderHook(() => useServerEvents(), { wrapper: makeWrapper(queryClient) });

    const first = await advancePastInitialDelay();

    // Error 1 — backoff is 5 s consumed, next backoff is now 10 s.
    act(() => {
      first.onerror?.(new Event("error"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(MockEventSource.instances).toHaveLength(2);

    const second = MockEventSource.instances[1];

    // Error 2 on the second connection — backoff (10 s) would be consumed and
    // next would be 20 s, but first fire an open event to reset it to 5 s.
    act(() => {
      second.onerror?.(new Event("error"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(MockEventSource.instances).toHaveLength(3);

    const third = MockEventSource.instances[2];

    // Fire open on the third connection — this must reset the backoff to 5 s.
    act(() => {
      third.dispatchEvent(new Event("open"));
    });

    // Trigger an error on the third connection.  Because open reset the
    // backoff, the reconnect should fire after exactly 5 s, not 20 s.
    act(() => {
      third.onerror?.(new Event("error"));
    });

    // 4 999 ms — must NOT have reconnected yet.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_999);
    });
    expect(MockEventSource.instances).toHaveLength(3);

    // 1 ms more — fires at exactly 5 s, confirming the reset worked.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(MockEventSource.instances).toHaveLength(4);
  });

  // -------------------------------------------------------------------------
  // Mid-backoff unmount: pending reconnect timer must be cancelled on cleanup
  // -------------------------------------------------------------------------

  it("cancels the backoff timer and opens no new EventSource when the hook unmounts mid-backoff", async () => {
    const { unmount } = renderHook(() => useServerEvents(), {
      wrapper: makeWrapper(queryClient),
    });

    const first = await advancePastInitialDelay();
    expect(MockEventSource.instances).toHaveLength(1);

    // Trigger an error — this closes the current source and queues a 5 s
    // backoff timer before opening the next EventSource.
    act(() => {
      first.onerror?.(new Event("error"));
    });

    // Unmount immediately, while the 5-second backoff timer is still pending.
    unmount();

    // Advance well past the backoff delay.  The cleanup should have cancelled
    // the timer, so no second EventSource should ever be created.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(MockEventSource.instances).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Reconnected EventSource has its own locations-updated listener
  // -------------------------------------------------------------------------

  it("invalidates delivery-locations when locations-updated fires on the reconnected EventSource", async () => {
    renderHook(() => useServerEvents(), { wrapper: makeWrapper(queryClient) });

    const first = await advancePastInitialDelay();

    // Drop the first connection and wait for the backoff reconnect.
    act(() => {
      first.onerror?.(new Event("error"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(MockEventSource.instances).toHaveLength(2);

    // Confirm the original connection does NOT trigger the spy.
    (queryClient.invalidateQueries as ReturnType<typeof vi.spyOn>).mockClear();

    const reconnected = MockEventSource.instances[1];

    // Fire the SSE event on the NEW connection.
    act(() => {
      reconnected.dispatchEvent(new Event("locations-updated"));
    });

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["delivery-locations"],
    });
  });
});
