// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, act } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Suppress React's own error-boundary console.error noise in test output
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

vi.mock("wouter", () => ({
  Link: ({
    children,
    href,
    ...rest
  }: React.PropsWithChildren<{ href: string; [key: string]: unknown }>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useLocation: vi.fn(() => ["/", vi.fn()]),
}));

vi.mock("@/lib/chunkReload", () => ({
  isChunkLoadError: vi.fn(() => false),
  reloadForStaleChunk: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { RouteErrorBoundary, CheckoutErrorBoundary } from "./ErrorBoundary";
import { useLocation } from "wouter";

const mockUseLocation = vi.mocked(useLocation);

/** A component that throws on render when `shouldThrow` is true. */
function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("Test render error");
  return <div data-testid="content">Page content</div>;
}

// ---------------------------------------------------------------------------
// RouteErrorBoundary — resets on navigation
// ---------------------------------------------------------------------------

describe("RouteErrorBoundary", () => {
  it("shows children normally when there is no error", () => {
    mockUseLocation.mockReturnValue(["/shop", vi.fn()]);
    const { getByTestId } = render(
      <RouteErrorBoundary>
        <Bomb shouldThrow={false} />
      </RouteErrorBoundary>,
    );
    expect(getByTestId("content")).toBeTruthy();
  });

  it("shows the error fallback when a child throws", () => {
    mockUseLocation.mockReturnValue(["/shop", vi.fn()]);
    const { getByTestId } = render(
      <RouteErrorBoundary>
        <Bomb shouldThrow={true} />
      </RouteErrorBoundary>,
    );
    expect(getByTestId("route-error-boundary")).toBeTruthy();
  });

  it("clears the error and renders new content after navigating to a different route", () => {
    // Start on /shop — child throws immediately.
    mockUseLocation.mockReturnValue(["/shop", vi.fn()]);
    const { getByTestId, queryByTestId, rerender } = render(
      <RouteErrorBoundary>
        <Bomb shouldThrow={true} />
      </RouteErrorBoundary>,
    );
    expect(getByTestId("route-error-boundary")).toBeTruthy();

    // Simulate navigation to /cart — error boundary must reset.
    mockUseLocation.mockReturnValue(["/cart", vi.fn()]);
    act(() => {
      rerender(
        <RouteErrorBoundary>
          <Bomb shouldThrow={false} />
        </RouteErrorBoundary>,
      );
    });

    expect(queryByTestId("route-error-boundary")).toBeNull();
    expect(getByTestId("content")).toBeTruthy();
  });

  it("keeps the error fallback on the same route that errored", () => {
    mockUseLocation.mockReturnValue(["/shop", vi.fn()]);
    const { getByTestId, queryByTestId, rerender } = render(
      <RouteErrorBoundary>
        <Bomb shouldThrow={true} />
      </RouteErrorBoundary>,
    );
    expect(getByTestId("route-error-boundary")).toBeTruthy();

    // Re-render with the same path — boundary must NOT reset.
    mockUseLocation.mockReturnValue(["/shop", vi.fn()]);
    act(() => {
      rerender(
        <RouteErrorBoundary>
          <Bomb shouldThrow={false} />
        </RouteErrorBoundary>,
      );
    });

    expect(queryByTestId("content")).toBeNull();
    expect(getByTestId("route-error-boundary")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// CheckoutErrorBoundary — does NOT reset on navigation
// ---------------------------------------------------------------------------

describe("CheckoutErrorBoundary", () => {
  it("shows the checkout error fallback when a child throws", () => {
    const { getByTestId } = render(
      <CheckoutErrorBoundary>
        <Bomb shouldThrow={true} />
      </CheckoutErrorBoundary>,
    );
    expect(getByTestId("checkout-error-boundary")).toBeTruthy();
  });

  it("does not reset its error state on re-render (no resetKey)", () => {
    const { getByTestId, queryByTestId, rerender } = render(
      <CheckoutErrorBoundary>
        <Bomb shouldThrow={true} />
      </CheckoutErrorBoundary>,
    );
    expect(getByTestId("checkout-error-boundary")).toBeTruthy();

    act(() => {
      rerender(
        <CheckoutErrorBoundary>
          <Bomb shouldThrow={false} />
        </CheckoutErrorBoundary>,
      );
    });

    // Still in error state — user must navigate away manually.
    expect(queryByTestId("content")).toBeNull();
    expect(getByTestId("checkout-error-boundary")).toBeTruthy();
  });
});
