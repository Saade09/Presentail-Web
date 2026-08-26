// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Module mocks — hoisted before component import
// ---------------------------------------------------------------------------

vi.mock("@/lib/imageAlt", () => ({
  buildProductImageAlt: () => "product alt text",
}));

// Control proxy vs raw URL behaviour per test via the mock implementation.
// Default: treat the src as an OS storage URL so buildOsImageSrcset returns a
// proxy src that differs from the raw src.
const mockBuildOsImageSrcset = vi.fn();
const mockBuildCatalogImageSrcset = vi.fn();

vi.mock("@/lib/imageUtils", () => ({
  buildOsImageSrcset: (...args: unknown[]) => mockBuildOsImageSrcset(...args),
  buildCatalogImageSrcset: (...args: unknown[]) => mockBuildCatalogImageSrcset(...args),
}));

// ---------------------------------------------------------------------------
// Component under test (imported after mocks)
// ---------------------------------------------------------------------------

import { ProductImage } from "../ProductImage";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RAW_SRC = "https://os.presentail.com/api/storage/public-objects/img/flower.jpg";
const PROXY_SRC = "/api/img/proxy?url=...&w=800&f=webp";
const PROXY_SRCSET = "/api/img/proxy?url=...&w=400&f=webp 400w, /api/img/proxy?url=...&w=800&f=webp 800w";

const PRODUCT = { name: "Test Product" };

function renderImage(props: Partial<React.ComponentProps<typeof ProductImage>> = {}) {
  return render(
    <ProductImage
      src={RAW_SRC}
      product={PRODUCT}
      {...props}
    />,
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Default: OS proxy URL differs from raw src
  mockBuildOsImageSrcset.mockReturnValue({
    src: PROXY_SRC,
    srcset: PROXY_SRCSET,
    sizes: "(max-width: 768px) 100vw, 800px",
  });
  mockBuildCatalogImageSrcset.mockReturnValue(null);
});

// ---------------------------------------------------------------------------
// Retry behaviour
// ---------------------------------------------------------------------------

describe("ProductImage — proxy retry on error", () => {
  it("initially renders a <picture> element with the proxy src", () => {
    const { container } = renderImage();
    expect(container.querySelector("picture")).toBeTruthy();
    const img = container.querySelector("img")!;
    expect(img.src).toContain(PROXY_SRC);
  });

  it("renders the raw URL <img> (no <picture>) after proxy onError", () => {
    const { container } = renderImage();
    const proxyImg = container.querySelector("img")!;

    // Trigger proxy failure
    fireEvent.error(proxyImg);

    // Should now render the raw URL without a <picture> wrapper
    expect(container.querySelector("picture")).toBeNull();
    const retryImg = container.querySelector("img")!;
    expect(retryImg.src).toBe(RAW_SRC);
  });

  it("keeps the shimmer visible during retry (not loaded yet)", () => {
    const { container } = renderImage();
    fireEvent.error(container.querySelector("img")!);

    // Shimmer div should still be present (loaded is still false)
    expect(container.querySelector(".animate-shimmer")).toBeTruthy();
  });

  it("shows the fallback after a second onError on the raw URL", () => {
    const fallback = <div data-testid="fallback-el">fallback</div>;
    const { container, getByTestId } = renderImage({ fallback });

    // First error: proxy fails → retry with raw URL
    fireEvent.error(container.querySelector("img")!);
    // Second error: raw URL also fails → show fallback
    fireEvent.error(container.querySelector("img")!);

    expect(getByTestId("fallback-el")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("reveals the image and hides the shimmer after a successful raw-URL load", () => {
    const { container } = renderImage();

    // Trigger proxy failure → retry
    fireEvent.error(container.querySelector("img")!);

    const retryImg = container.querySelector("img")!;
    expect(retryImg.className).toContain("opacity-0");

    // Trigger successful load on the raw URL
    fireEvent.load(retryImg);

    expect(retryImg.className).toContain("opacity-100");
    expect(container.querySelector(".animate-shimmer")).toBeNull();
  });

  it("does NOT retry when resolvedSrc === src (no proxy involved)", () => {
    // Simulate a non-OS URL: both buildOsImageSrcset and buildCatalogImageSrcset return null
    mockBuildOsImageSrcset.mockReturnValue(null);
    mockBuildCatalogImageSrcset.mockReturnValue(null);

    const fallback = <div data-testid="fallback-el">fallback</div>;
    const { container, getByTestId } = renderImage({ src: RAW_SRC, fallback });

    // Single error on raw img should go straight to failed (no retry path)
    fireEvent.error(container.querySelector("img")!);

    expect(getByTestId("fallback-el")).toBeTruthy();
    // No second img should exist
    expect(container.querySelector("img")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadedUrls cache — retry path records a successful load
// ---------------------------------------------------------------------------

describe("ProductImage — stuck-load failsafe", () => {
  it("reveals the image via the bounded timeout when onLoad never fires", () => {
    vi.useFakeTimers();
    try {
      const { container } = renderImage({ src: "https://os.presentail.com/api/storage/public-objects/img/never-onload.jpg" });
      const img = container.querySelector("img")!;
      expect(img.className).toContain("opacity-0");

      act(() => { vi.advanceTimersByTime(5000); });

      expect(container.querySelector("img")!.className).toContain("opacity-100");
      expect(container.querySelector(".animate-shimmer")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls through to retry then fallback when the image completed with no data", () => {
    vi.useFakeTimers();
    try {
      const fallback = <div data-testid="fallback-el">fallback</div>;
      const { container, getByTestId } = renderImage({
        src: "https://os.presentail.com/api/storage/public-objects/img/broken.jpg",
        fallback,
      });
      // Simulate an image that finished loading with no data (failure the
      // error handler missed): complete=true, naturalWidth=0.
      const defineBroken = () => {
        const img = container.querySelector("img")!;
        Object.defineProperty(img, "complete", { value: true, configurable: true });
        Object.defineProperty(img, "naturalWidth", { value: 0, configurable: true });
      };
      defineBroken();

      // First failsafe tick: proxy src ≠ raw src → retry path
      act(() => { vi.advanceTimersByTime(5000); });
      expect(container.querySelector("picture")).toBeNull();
      expect(container.querySelector("img")).toBeTruthy();

      // Retry img is also broken → second failsafe tick shows fallback
      defineBroken();
      act(() => { vi.advanceTimersByTime(5000); });
      expect(getByTestId("fallback-el")).toBeTruthy();
      expect(container.querySelector("img")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reveals immediately on the retry path when the raw image is already complete (cached)", () => {
    const { container } = renderImage({ src: "https://os.presentail.com/api/storage/public-objects/img/cached-raw.jpg" });
    const proxyImg = container.querySelector("img")!;

    // Simulate the retry img mounting already-complete with real data.
    // Patch the prototype so the freshly-mounted retry <img> reports complete.
    const proto = HTMLImageElement.prototype;
    const origComplete = Object.getOwnPropertyDescriptor(proto, "complete");
    const origNatural = Object.getOwnPropertyDescriptor(proto, "naturalWidth");
    Object.defineProperty(proto, "complete", { get: () => true, configurable: true });
    Object.defineProperty(proto, "naturalWidth", { get: () => 400, configurable: true });
    try {
      fireEvent.error(proxyImg); // proxy fails → retry renders; layout effect re-runs
      const retryImg = container.querySelector("img")!;
      expect(retryImg.className).toContain("opacity-100");
      expect(container.querySelector(".animate-shimmer")).toBeNull();
    } finally {
      if (origComplete) Object.defineProperty(proto, "complete", origComplete);
      else delete (proto as unknown as Record<string, unknown>)["complete"];
      if (origNatural) Object.defineProperty(proto, "naturalWidth", origNatural);
      else delete (proto as unknown as Record<string, unknown>)["naturalWidth"];
    }
  });
});

describe("ProductImage — loadedUrls cache on retry success", () => {
  it("adds src to loadedUrls after a successful raw-URL load so repeat views are instant", () => {
    // We cannot directly inspect the module-level Set, but we can verify the
    // side-effect: a second render with priority=false but for the same src
    // starts already loaded (opacity-100) once the cache is warm.
    //
    // Step 1: first render — load via retry path to warm the cache.
    const { container: c1, unmount } = renderImage();
    fireEvent.error(c1.querySelector("img")!); // proxy fails → retry
    fireEvent.load(c1.querySelector("img")!);  // raw URL succeeds → cache warmed
    unmount();

    // Step 2: second render — should start loaded because loadedUrls.has(src)
    // initialises loaded=true.
    const { container: c2 } = renderImage();
    const img2 = c2.querySelector("img")!;
    expect(img2.className).toContain("opacity-100");
    expect(c2.querySelector(".animate-shimmer")).toBeNull();
  });
});
