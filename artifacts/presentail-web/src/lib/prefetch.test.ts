// Tests for the intent-based prefetch helpers in prefetch.ts.
//
// The module-level `prefetched` Set means tests share state if they run in
// the same module instance.  We use `vi.resetModules()` + a dynamic import
// inside each test to get a fresh module (and therefore a fresh Set) every
// time, ensuring the de-duplication behaviour under test doesn't leak between
// cases.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function freshPrefetch() {
  vi.resetModules();
  return import("@/lib/prefetch");
}

// ---------------------------------------------------------------------------
// prefetchProps — Brands nav link (loadBrands + loadBrandDetail)
// ---------------------------------------------------------------------------

describe("prefetchProps — nav-link-brands hover/focus", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("fires loadBrands and loadBrandDetail on onMouseEnter", async () => {
    const { prefetchProps } = await freshPrefetch();
    const loadBrands = vi.fn().mockResolvedValue({});
    const loadBrandDetail = vi.fn().mockResolvedValue({});

    const props = prefetchProps(loadBrands, loadBrandDetail);
    props.onMouseEnter();

    expect(loadBrands).toHaveBeenCalledOnce();
    expect(loadBrandDetail).toHaveBeenCalledOnce();
  });

  it("fires loadBrands and loadBrandDetail on onFocus (keyboard nav)", async () => {
    const { prefetchProps } = await freshPrefetch();
    const loadBrands = vi.fn().mockResolvedValue({});
    const loadBrandDetail = vi.fn().mockResolvedValue({});

    const props = prefetchProps(loadBrands, loadBrandDetail);
    props.onFocus();

    expect(loadBrands).toHaveBeenCalledOnce();
    expect(loadBrandDetail).toHaveBeenCalledOnce();
  });

  it("does not call loaders again on a second hover (de-duplication)", async () => {
    const { prefetchProps } = await freshPrefetch();
    const loadBrands = vi.fn().mockResolvedValue({});
    const loadBrandDetail = vi.fn().mockResolvedValue({});

    const props = prefetchProps(loadBrands, loadBrandDetail);
    props.onMouseEnter();
    props.onMouseEnter(); // second hover — must be a no-op
    props.onFocus();      // focus after hover — still a no-op

    expect(loadBrands).toHaveBeenCalledOnce();
    expect(loadBrandDetail).toHaveBeenCalledOnce();
  });

  it("does not call loaders again on a second focus (de-duplication)", async () => {
    const { prefetchProps } = await freshPrefetch();
    const loadBrands = vi.fn().mockResolvedValue({});
    const loadBrandDetail = vi.fn().mockResolvedValue({});

    const props = prefetchProps(loadBrands, loadBrandDetail);
    props.onFocus();
    props.onFocus(); // second focus — must be a no-op

    expect(loadBrands).toHaveBeenCalledOnce();
    expect(loadBrandDetail).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// prefetchProps — account icon (loadSignIn + loadSignUp)
// ---------------------------------------------------------------------------

describe("prefetchProps — account icon hover/focus", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("fires loadSignIn and loadSignUp on onMouseEnter", async () => {
    const { prefetchProps } = await freshPrefetch();
    const loadSignIn = vi.fn().mockResolvedValue({});
    const loadSignUp = vi.fn().mockResolvedValue({});

    const props = prefetchProps(loadSignIn, loadSignUp);
    props.onMouseEnter();

    expect(loadSignIn).toHaveBeenCalledOnce();
    expect(loadSignUp).toHaveBeenCalledOnce();
  });

  it("fires loadSignIn and loadSignUp on onFocus", async () => {
    const { prefetchProps } = await freshPrefetch();
    const loadSignIn = vi.fn().mockResolvedValue({});
    const loadSignUp = vi.fn().mockResolvedValue({});

    const props = prefetchProps(loadSignIn, loadSignUp);
    props.onFocus();

    expect(loadSignIn).toHaveBeenCalledOnce();
    expect(loadSignUp).toHaveBeenCalledOnce();
  });

  it("does not call loaders again on repeated interaction (de-duplication)", async () => {
    const { prefetchProps } = await freshPrefetch();
    const loadSignIn = vi.fn().mockResolvedValue({});
    const loadSignUp = vi.fn().mockResolvedValue({});

    const props = prefetchProps(loadSignIn, loadSignUp);
    props.onMouseEnter();
    props.onMouseEnter();
    props.onFocus();

    expect(loadSignIn).toHaveBeenCalledOnce();
    expect(loadSignUp).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// prefetchProps — cross-instance de-duplication
//
// Two separate prefetchProps calls that share the same loader function
// reference must only invoke the loader once total, because the `prefetched`
// Set is keyed by function reference.
// ---------------------------------------------------------------------------

describe("prefetchProps — cross-instance de-duplication (shared loader reference)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("invokes a shared loader only once even across two prefetchProps instances", async () => {
    const { prefetchProps } = await freshPrefetch();
    const shared = vi.fn().mockResolvedValue({});
    const other = vi.fn().mockResolvedValue({});

    const propsA = prefetchProps(shared, other);
    const propsB = prefetchProps(shared); // same `shared` reference

    propsA.onMouseEnter();
    propsB.onMouseEnter(); // `shared` is already in the Set — must skip

    expect(shared).toHaveBeenCalledOnce();
    expect(other).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// prefetchOnIdle — basic behaviour
//
// Idle callbacks are async/deferred, so we need to advance fake timers.
// ---------------------------------------------------------------------------

describe("prefetchOnIdle — basic behaviour", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls each loader once after idle (setTimeout fallback)", async () => {
    // In the test environment requestIdleCallback is not defined, so the
    // module falls back to setTimeout(cb, 300).
    const { prefetchOnIdle } = await freshPrefetch();
    const loader1 = vi.fn().mockResolvedValue({});
    const loader2 = vi.fn().mockResolvedValue({});

    prefetchOnIdle([loader1, loader2]);

    expect(loader1).not.toHaveBeenCalled(); // not yet — still pending
    expect(loader2).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();

    expect(loader1).toHaveBeenCalledOnce();
    expect(loader2).toHaveBeenCalledOnce();
  });

  it("does not call a loader again if already prefetched", async () => {
    const { prefetchOnIdle } = await freshPrefetch();
    const loader = vi.fn().mockResolvedValue({});

    prefetchOnIdle([loader]);
    prefetchOnIdle([loader]); // second call with same loader — must be a no-op

    await vi.runAllTimersAsync();

    expect(loader).toHaveBeenCalledOnce();
  });

  it("cancel() prevents a pending loader from firing", async () => {
    const { prefetchOnIdle } = await freshPrefetch();
    const loader = vi.fn().mockResolvedValue({});

    const cancel = prefetchOnIdle([loader]);
    cancel(); // cancel before the idle callback fires

    await vi.runAllTimersAsync();

    expect(loader).not.toHaveBeenCalled();
  });
});
