// @vitest-environment jsdom
//
// Recovery-path tests for the OrderConfirmed page.
//
// After the Stripe-deferral refactor, Checkout stores the pending order payload
// in sessionStorage and redirects to /order-confirmed, which is responsible for
// calling createOrder and clearing the queue. These tests lock down that
// recovery contract so a shopper who was charged can never be left without an
// order being created:
//
//   1. Happy path: pending payload in sessionStorage → createOrder called with
//      that payload → success screen shown → sessionStorage cleared.
//   2. Missing payload: arriving at ?status=success with no sessionStorage entry
//      → graceful failure screen, createOrder NOT called.
//   3. createOrder failure (onError + ok:false): failure screen shown and the
//      pending payload is KEPT in sessionStorage so a reload can retry.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test-utils";

// ---------------------------------------------------------------------------
// Hoisted stubs — vi.hoisted() ensures these exist when vi.mock() factories run
// ---------------------------------------------------------------------------

const { mockUseSearch, mockSetLocation, mockMutate, mockClearCart } =
  vi.hoisted(() => ({
    mockUseSearch: vi.fn().mockReturnValue(""),
    mockSetLocation: vi.fn(),
    mockMutate: vi.fn(),
    mockClearCart: vi.fn(),
  }));

// ---------------------------------------------------------------------------
// Module mocks — all vi.mock() calls must precede the component import
// ---------------------------------------------------------------------------

vi.mock("@/lib/fbPixel", () => ({
  trackFbEvent: vi.fn(),
  trackFbPageView: vi.fn(),
  initPixel: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("wouter", () => ({
  useSearch: () => mockUseSearch(),
  useLocation: () => ["/order-confirmed", mockSetLocation],
  Link: ({
    children,
    href,
    ...rest
  }: React.PropsWithChildren<{ href: string; [k: string]: unknown }>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/queries", () => ({
  useCreateOrder: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
  useCurrenciesData: () => ({ data: undefined, isLoading: false }),
  useFxRates: () => ({ data: undefined, isLoading: false }),
}));

vi.mock("@/components/FormattedPrice", () => ({
  FormattedPrice: ({ usdValue }: { usdValue: number }) => <span>${usdValue}</span>,
}));

// ---------------------------------------------------------------------------
// Import the component AFTER all vi.mock() declarations
// ---------------------------------------------------------------------------

import OrderConfirmed from "./OrderConfirmed";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const PENDING_ORDER_KEY = "presentail_pending_order_v1";

const PENDING_PAYLOAD = {
  totalUsd: 80,
  currencyCode: "USD",
  items: [{ name: "Red Roses", quantity: 1, price: 80 }],
  paymentMethod: "card",
};

function seedSessionStorage(payload: Record<string, unknown> = PENDING_PAYLOAD) {
  sessionStorage.setItem(
    PENDING_ORDER_KEY,
    JSON.stringify({ payload, createdAt: Date.now() }),
  );
}

// ---------------------------------------------------------------------------
// Test environment setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

afterEach(() => {
  sessionStorage.clear();
});

// ---------------------------------------------------------------------------
// 1. Happy path
// ---------------------------------------------------------------------------

describe("OrderConfirmed — happy path (pending payload finalizes)", () => {
  beforeEach(() => {
    // No ?ref= → state enters { kind: "finalizing" } and calls createOrder.mutate
    mockUseSearch.mockReturnValue("?status=success");
    seedSessionStorage();
  });

  it("calls createOrder with the stashed payload, shows success, and clears sessionStorage", async () => {
    mockMutate.mockImplementation(
      (
        _payload: unknown,
        { onSuccess }: { onSuccess: (res: unknown) => void },
      ) => {
        onSuccess({ ok: true, wcOrderId: 12345 });
      },
    );

    renderWithProviders(<OrderConfirmed />, {
      cart: { clearCart: mockClearCart },
    });

    // createOrder was called with the stashed payload.
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledTimes(1);
    });
    const submittedPayload = mockMutate.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(submittedPayload).toMatchObject({
      totalUsd: 80,
      currencyCode: "USD",
      paymentMethod: "card",
    });

    // Success screen is shown with the returned order reference.
    await screen.findByTestId("icon-success");
    expect(screen.getByTestId("text-confirmation-title").textContent).toContain("order.confirmed");
    expect(screen.getByTestId("text-order-ref").textContent).toContain("12345");

    // The pending queue is cleared so it cannot be replayed.
    expect(sessionStorage.getItem(PENDING_ORDER_KEY)).toBeNull();
    expect(mockClearCart).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Missing payload
// ---------------------------------------------------------------------------

describe("OrderConfirmed — missing payload", () => {
  it("shows a graceful failure screen and never calls createOrder", async () => {
    mockUseSearch.mockReturnValue("?status=success");
    // No sessionStorage entry seeded.

    renderWithProviders(<OrderConfirmed />);

    // Failure UI is rendered immediately (initial state resolves to failed).
    await screen.findByTestId("icon-failed");
    expect(screen.getByTestId("text-confirmation-title").textContent).toContain("order.failed");

    // The retry CTA routes the shopper back to checkout.
    screen.getByTestId("button-confirmation-cta").click();
    expect(mockSetLocation).toHaveBeenCalledWith("/checkout");

    // createOrder must not run when there is no payload to submit.
    expect(mockMutate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. createOrder failure — payload retained for retry
// ---------------------------------------------------------------------------

describe("OrderConfirmed — createOrder failure keeps the payload", () => {
  beforeEach(() => {
    mockUseSearch.mockReturnValue("?status=success");
    seedSessionStorage();
  });

  it("shows the failure screen and KEEPS sessionStorage when the API errors", async () => {
    mockMutate.mockImplementation(
      (_payload: unknown, { onError }: { onError: (err: unknown) => void }) => {
        onError(new Error("Network failure"));
      },
    );

    renderWithProviders(<OrderConfirmed />, {
      cart: { clearCart: mockClearCart },
    });

    await screen.findByTestId("icon-failed");
    expect(screen.getByTestId("text-confirmation-title").textContent).toContain("order.failed");

    // The pending payload must survive so a reload can retry the order.
    expect(sessionStorage.getItem(PENDING_ORDER_KEY)).not.toBeNull();
    expect(mockClearCart).not.toHaveBeenCalled();
  });

  it("shows the failure screen and KEEPS sessionStorage when the API returns ok:false", async () => {
    mockMutate.mockImplementation(
      (
        _payload: unknown,
        { onSuccess }: { onSuccess: (res: unknown) => void },
      ) => {
        onSuccess({ ok: false, message: "Something went wrong" });
      },
    );

    renderWithProviders(<OrderConfirmed />, {
      cart: { clearCart: mockClearCart },
    });

    await screen.findByTestId("icon-failed");

    // The pending payload must survive so a reload can retry the order.
    expect(sessionStorage.getItem(PENDING_ORDER_KEY)).not.toBeNull();
    expect(mockClearCart).not.toHaveBeenCalled();
  });
});
