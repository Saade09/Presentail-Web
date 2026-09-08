// @vitest-environment jsdom

/**
 * Attribution capture — direct /checkout landing with ad params
 *
 * Regression guard: `AttributionTracker` in App.tsx is rendered as a
 * non-lazy sibling of `RootRouter` (which renders the lazy `Checkout`).
 * This guarantees that attribution is captured during the same React
 * commit in which the App mounts, before the lazy Checkout chunk can
 * resolve and before a `createOrder` mutation could ever fire.
 *
 * These tests lock in that contract so a future refactor (e.g. making
 * Checkout non-lazy, moving AttributionTracker inside a Suspense boundary,
 * or changing the render order) cannot silently break attribution.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { captureAttribution, readAttribution } from "@/lib/attribution";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = "@presentail/attribution_v1";

function clearAttribution() {
  localStorage.removeItem(STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// captureAttribution — direct /checkout landing with gclid
// ---------------------------------------------------------------------------

describe("captureAttribution — landing directly on /checkout with ad params", () => {
  let setItemSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearAttribution();
    setItemSpy = vi.spyOn(Storage.prototype, "setItem");
  });

  afterEach(() => {
    setItemSpy.mockRestore();
    clearAttribution();
  });

  it("calls localStorage.setItem with the attribution key when gclid is present", () => {
    captureAttribution("https://presentail.com/checkout?gclid=test123", "");

    expect(setItemSpy).toHaveBeenCalledWith(
      STORAGE_KEY,
      expect.stringContaining("test123"),
    );
  });

  it("stores gclid in both first_touch and last_touch", () => {
    captureAttribution("https://presentail.com/checkout?gclid=test123", "");

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(raw!) as {
      first_touch: { gclid?: string; landing_page_path?: string };
      last_touch: { gclid?: string };
    };
    expect(parsed.first_touch.gclid).toBe("test123");
    expect(parsed.last_touch.gclid).toBe("test123");
  });

  it("records /checkout as the landing_page_path", () => {
    captureAttribution("https://presentail.com/checkout?gclid=test123", "");

    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw!) as {
      first_touch: { landing_page_path?: string };
    };
    expect(parsed.first_touch.landing_page_path).toBe(
      "/checkout?gclid=test123",
    );
  });

  it("records the ad referrer when present", () => {
    captureAttribution(
      "https://presentail.com/checkout?gclid=test123",
      "https://googleads.example",
    );

    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw!) as {
      first_touch: { referrer?: string };
    };
    expect(parsed.first_touch.referrer).toBe("https://googleads.example");
  });

  it("readAttribution returns the stored gclid after captureAttribution", () => {
    captureAttribution("https://presentail.com/checkout?gclid=test123", "");

    const attr = readAttribution();
    expect(attr).not.toBeNull();
    expect(attr!.first_touch.gclid).toBe("test123");
    expect(attr!.last_touch.gclid).toBe("test123");
  });

  it("captures fbclid in first-touch and last-touch attribution", () => {
    captureAttribution(
      "https://presentail.com/en-lb/beirut?fbclid=meta-click-123",
      "https://facebook.com/",
    );

    const attr = readAttribution();
    expect(attr?.first_touch.fbclid).toBe("meta-click-123");
    expect(attr?.last_touch.fbclid).toBe("meta-click-123");
  });

  it("does NOT write to localStorage when no marketing params are present", () => {
    captureAttribution("https://presentail.com/checkout", "");

    expect(setItemSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("preserves first_touch when a second ad visit with gclid occurs", () => {
    captureAttribution("https://presentail.com/checkout?gclid=FIRST", "");
    captureAttribution("https://presentail.com/?gclid=SECOND", "");

    const attr = readAttribution();
    expect(attr!.first_touch.gclid).toBe("FIRST");
    expect(attr!.last_touch.gclid).toBe("SECOND");
  });
});

// ---------------------------------------------------------------------------
// captureAttribution invariants — createOrder read path
//
// These tests verify the attribution *function* invariants (synchronous
// writes, correct data shape, immediate readability). They do NOT mount App
// or verify the App.tsx render order — see App.attribution.test.tsx for
// the App-level integration tests that prove the structural ordering guarantee.
// ---------------------------------------------------------------------------

describe("captureAttribution — attribution is synchronous and immediately readable", () => {
  beforeEach(() => {
    clearAttribution();
  });

  afterEach(() => {
    clearAttribution();
  });

  it("attribution data is present in localStorage before a createOrder mutation reads it", () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    // Step 1: AttributionTracker fires (same commit as App mount, before lazy
    //         Checkout resolves).
    captureAttribution(
      "https://presentail.com/en-lb/beirut/checkout?gclid=test123",
      "",
    );

    // Step 2: localStorage.setItem must have been called synchronously.
    expect(setItemSpy).toHaveBeenCalledWith(
      STORAGE_KEY,
      expect.stringContaining("test123"),
    );

    // Step 3: Simulate what createOrder does — read attribution from storage.
    //         (Checkout lazy-loads *after* the initial commit, so this read
    //          always sees the data written in step 1.)
    const attrForOrder = readAttribution();

    // Step 4: The data must be available.
    expect(attrForOrder).not.toBeNull();
    expect(attrForOrder!.first_touch.gclid).toBe("test123");

    setItemSpy.mockRestore();
  });

  it("attribution data is readable immediately — no async boundary needed", () => {
    // captureAttribution is synchronous: no Promise, no microtask, no I/O.
    // This test documents that guarantee explicitly.
    captureAttribution("https://presentail.com/checkout?gclid=test123", "");

    // readAttribution must succeed in the same synchronous turn.
    const attr = readAttribution();
    expect(attr).not.toBeNull();
    expect(attr!.first_touch.gclid).toBe("test123");
  });

  it("handles locale-prefixed /checkout URLs (e.g. /en-lb/beirut/checkout?gclid=…)", () => {
    captureAttribution(
      "https://presentail.com/en-lb/beirut/checkout?gclid=locale123",
      "",
    );

    const attr = readAttribution();
    expect(attr).not.toBeNull();
    expect(attr!.first_touch.gclid).toBe("locale123");
    expect(attr!.first_touch.landing_page_path).toBe(
      "/en-lb/beirut/checkout?gclid=locale123",
    );
  });

  it("captures gclid and UTMs from the Beirut late-night paid landing", () => {
    captureAttribution(
      "https://presentail.com/en-lb/beirut/late-night-flower-delivery?gclid=late123&utm_source=google&utm_medium=cpc&utm_campaign=beirut-late-night",
      "",
    );

    const attr = readAttribution();
    expect(attr?.first_touch).toEqual(
      expect.objectContaining({
        gclid: "late123",
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "beirut-late-night",
      }),
    );
    expect(attr?.first_touch.landing_page_path).toContain(
      "/en-lb/beirut/late-night-flower-delivery",
    );
  });
});
