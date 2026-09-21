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
  trackWebEvent: vi.fn(),
  trackFunnelEvent: vi.fn(),
  trackFunnelEventOnce: vi.fn(),
  funnelValueBucket: () => "under_50",
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

// Must match PENDING_ORDER_MAX_AGE_MS in OrderConfirmed.tsx.
const PENDING_ORDER_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const PENDING_PAYLOAD = {
  totalUsd: 80,
  currencyCode: "USD",
  items: [{ name: "Red Roses", quantity: 1, price: 80 }],
  paymentMethod: "card",
};

function seedSessionStorage(
  payload: Record<string, unknown> = PENDING_PAYLOAD,
  createdAt: number = Date.now(),
) {
  sessionStorage.setItem(
    PENDING_ORDER_KEY,
    JSON.stringify({ payload, createdAt }),
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

  it("shows Express Delivery when the stashed order explicitly selected express", async () => {
    mockUseSearch.mockReturnValue("?status=success&ref=LB-EXPRESS");
    seedSessionStorage({
      ...PENDING_PAYLOAD,
      deliveryDate: "2026-09-07",
      deliverySlot: "",
      expressFee: 0,
      expressDelivery: true,
    });

    renderWithProviders(<OrderConfirmed />, {
      cart: { clearCart: mockClearCart },
    });

    expect(await screen.findByText(/checkout\.expressDelivery/)).toBeTruthy();
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
// 2b. Stale payload — expired stash is treated as missing
// ---------------------------------------------------------------------------

describe("OrderConfirmed — stale (expired) payload", () => {
  beforeEach(() => {
    mockUseSearch.mockReturnValue("?status=success");
  });

  it("ignores a payload older than the max age and never calls createOrder", async () => {
    // One millisecond past the expiry window → must be treated as missing.
    seedSessionStorage(PENDING_PAYLOAD, Date.now() - PENDING_ORDER_MAX_AGE_MS - 1);

    renderWithProviders(<OrderConfirmed />, {
      cart: { clearCart: mockClearCart },
    });

    // Graceful failure screen, no createOrder call.
    await screen.findByTestId("icon-failed");
    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockClearCart).not.toHaveBeenCalled();
  });

  it("still finalizes a payload just inside the expiry window", async () => {
    mockMutate.mockImplementation(
      (
        _payload: unknown,
        { onSuccess }: { onSuccess: (res: unknown) => void },
      ) => {
        onSuccess({ ok: true, wcOrderId: 12345 });
      },
    );

    // One minute inside the window → still considered fresh.
    seedSessionStorage(PENDING_PAYLOAD, Date.now() - PENDING_ORDER_MAX_AGE_MS + 60_000);

    renderWithProviders(<OrderConfirmed />, {
      cart: { clearCart: mockClearCart },
    });

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledTimes(1);
    });
    await screen.findByTestId("icon-success");
  });
});

// ---------------------------------------------------------------------------
// 2c. Stale redirect payment — hosted return (Mamo / PayPal / Stripe) with a
//     payment reference on the URL but no inline ?ref=. A shopper who paid via
//     a redirect, backgrounded the tab, and returned hours later must not have
//     the expired payload silently replayed into a real (abandoned) order.
// ---------------------------------------------------------------------------

describe("OrderConfirmed — stale redirect payment (hosted return)", () => {
  it("skips order creation and shows the failure state when the redirect returns with a stale payload", async () => {
    // Hosted redirect shape: success + a payment reference (session_id), but no
    // inline ?ref=, so the page would normally finalize from the stash.
    mockUseSearch.mockReturnValue("?status=success&session_id=cs_test_stalehosted");
    // Stash is one millisecond past the expiry window → treated as missing.
    seedSessionStorage(PENDING_PAYLOAD, Date.now() - PENDING_ORDER_MAX_AGE_MS - 1);

    renderWithProviders(<OrderConfirmed />, {
      cart: { clearCart: mockClearCart },
    });

    // The shopper lands on the graceful failure screen.
    await screen.findByTestId("icon-failed");

    // The WC order is never (re)created and the cart is left intact.
    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockClearCart).not.toHaveBeenCalled();
  });

  it("finalizes the order when the same redirect returns with a fresh payload and forwards the payment reference", async () => {
    mockUseSearch.mockReturnValue("?status=success&session_id=cs_test_freshhosted");
    mockMutate.mockImplementation(
      (
        _payload: unknown,
        { onSuccess }: { onSuccess: (res: unknown) => void },
      ) => {
        onSuccess({ ok: true, wcOrderId: 55555 });
      },
    );
    // One minute inside the expiry window → still considered fresh.
    seedSessionStorage(PENDING_PAYLOAD, Date.now() - PENDING_ORDER_MAX_AGE_MS + 60_000);

    renderWithProviders(<OrderConfirmed />, {
      cart: { clearCart: mockClearCart },
    });

    // createOrder runs with the stashed payload, enriched with the URL payment ref.
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
      paymentRef: "cs_test_freshhosted",
    });

    // Success screen is shown and the queue is cleared.
    await screen.findByTestId("icon-success");
    expect(screen.getByTestId("text-order-ref").textContent).toContain("55555");
    expect(sessionStorage.getItem(PENDING_ORDER_KEY)).toBeNull();
    expect(mockClearCart).toHaveBeenCalledTimes(1);
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

// ---------------------------------------------------------------------------
// 4. Retry action — replay the stashed payload from the failure screen
// ---------------------------------------------------------------------------

describe("OrderConfirmed — retry from the failure screen", () => {
  beforeEach(() => {
    mockUseSearch.mockReturnValue("?status=success");
    seedSessionStorage();
  });

  it("shows a Retry CTA (not return-to-checkout) when a pending payload remains", async () => {
    mockMutate.mockImplementation(
      (_payload: unknown, { onError }: { onError: (err: unknown) => void }) => {
        onError(new Error("Network failure"));
      },
    );

    renderWithProviders(<OrderConfirmed />, {
      cart: { clearCart: mockClearCart },
    });

    await screen.findByTestId("icon-failed");

    // The retry CTA is surfaced and the default return-to-checkout primary CTA
    // is replaced by it.
    expect(screen.getByTestId("button-retry-order")).toBeTruthy();
    expect(screen.queryByTestId("button-confirmation-cta")).toBeNull();
  });

  it("re-attempts createOrder, shows success, and clears sessionStorage on a successful retry", async () => {
    // First attempt fails, second (retry) succeeds.
    mockMutate
      .mockImplementationOnce(
        (
          _payload: unknown,
          { onError }: { onError: (err: unknown) => void },
        ) => {
          onError(new Error("Network failure"));
        },
      )
      .mockImplementationOnce(
        (
          _payload: unknown,
          { onSuccess }: { onSuccess: (res: unknown) => void },
        ) => {
          onSuccess({ ok: true, wcOrderId: 67890 });
        },
      );

    renderWithProviders(<OrderConfirmed />, {
      cart: { clearCart: mockClearCart },
    });

    // First finalize attempt fails.
    await screen.findByTestId("icon-failed");
    expect(mockMutate).toHaveBeenCalledTimes(1);

    // Trigger the retry.
    screen.getByTestId("button-retry-order").click();

    // The stashed payload is replayed through createOrder a second time.
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledTimes(2);
    });
    const retryPayload = mockMutate.mock.calls[1][0] as Record<string, unknown>;
    expect(retryPayload).toMatchObject({
      totalUsd: 80,
      currencyCode: "USD",
      paymentMethod: "card",
    });

    // Success screen replaces the failure screen.
    await screen.findByTestId("icon-success");
    expect(screen.getByTestId("text-order-ref").textContent).toContain("67890");

    // The pending queue is cleared so it cannot be replayed again.
    expect(sessionStorage.getItem(PENDING_ORDER_KEY)).toBeNull();
    expect(mockClearCart).toHaveBeenCalledTimes(1);
  });

  it("caps Retry after repeated failures and escalates to contact-us", async () => {
    // Every attempt fails — the shopper would otherwise loop on Retry forever.
    mockMutate.mockImplementation(
      (_payload: unknown, { onError }: { onError: (err: unknown) => void }) => {
        onError(new Error("Permanently rejected payload"));
      },
    );

    renderWithProviders(<OrderConfirmed />, {
      cart: { clearCart: mockClearCart },
    });

    // Attempt 1 (initial finalize) fails — Retry is still offered.
    await screen.findByTestId("icon-failed");
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("button-retry-order")).toBeTruthy();

    // Attempt 2 fails — Retry still offered.
    screen.getByTestId("button-retry-order").click();
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("button-retry-order")).toBeTruthy();

    // Attempt 3 fails — cap reached, Retry must be withdrawn.
    screen.getByTestId("button-retry-order").click();
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(3));

    await waitFor(() => {
      expect(screen.queryByTestId("button-retry-order")).toBeNull();
    });

    // The escalation message is shown instead of just re-offering Retry.
    expect(
      screen.getByTestId("text-confirmation-message").textContent,
    ).toContain("order.fail.exhausted");

    // The standard return-to-checkout CTA is offered as the way forward.
    const cta = screen.getByTestId("button-confirmation-cta");
    cta.click();
    expect(mockSetLocation).toHaveBeenCalledWith("/checkout");
  });

  it("shows the payment reference in the escalation when one is on the URL", async () => {
    mockUseSearch.mockReturnValue("?status=success&session_id=cs_test_abc123");
    mockMutate.mockImplementation(
      (_payload: unknown, { onError }: { onError: (err: unknown) => void }) => {
        onError(new Error("Permanently rejected payload"));
      },
    );

    renderWithProviders(<OrderConfirmed />, {
      cart: { clearCart: mockClearCart },
    });

    await screen.findByTestId("icon-failed");
    // Drive past the cap.
    screen.getByTestId("button-retry-order").click();
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(2));
    screen.getByTestId("button-retry-order").click();
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(3));

    await waitFor(() => {
      expect(screen.getByTestId("text-payment-ref").textContent).toContain(
        "cs_test_abc123",
      );
    });
  });

  it("resets the failure counter after a successful retry so Retry stays available", async () => {
    // Fail twice, then succeed — the counter must reset so a later failure does
    // not inherit the prior count and prematurely cap Retry.
    mockMutate
      .mockImplementationOnce(
        (_p: unknown, { onError }: { onError: (e: unknown) => void }) =>
          onError(new Error("fail 1")),
      )
      .mockImplementationOnce(
        (_p: unknown, { onError }: { onError: (e: unknown) => void }) =>
          onError(new Error("fail 2")),
      )
      .mockImplementationOnce(
        (_p: unknown, { onSuccess }: { onSuccess: (r: unknown) => void }) =>
          onSuccess({ ok: true, wcOrderId: 999 }),
      );

    renderWithProviders(<OrderConfirmed />, {
      cart: { clearCart: mockClearCart },
    });

    // Attempt 1 fails.
    await screen.findByTestId("icon-failed");
    expect(mockMutate).toHaveBeenCalledTimes(1);

    // Attempt 2 fails — Retry still available (under the cap).
    screen.getByTestId("button-retry-order").click();
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("button-retry-order")).toBeTruthy();

    // Attempt 3 succeeds — success screen and the counter resets.
    screen.getByTestId("button-retry-order").click();
    await screen.findByTestId("icon-success");
    expect(screen.getByTestId("text-order-ref").textContent).toContain("999");
  });

  it("falls back to the return-to-checkout CTA when no pending payload remains", async () => {
    // ok:false with the payload manually cleared mimics a state where nothing
    // is left to retry — the screen must offer the standard checkout CTA.
    mockMutate.mockImplementation(
      (
        _payload: unknown,
        { onSuccess }: { onSuccess: (res: unknown) => void },
      ) => {
        sessionStorage.removeItem(PENDING_ORDER_KEY);
        onSuccess({ ok: false, message: "Gone" });
      },
    );

    renderWithProviders(<OrderConfirmed />, {
      cart: { clearCart: mockClearCart },
    });

    await screen.findByTestId("icon-failed");

    // No payload → no retry CTA, the standard return-to-checkout CTA is shown.
    expect(screen.queryByTestId("button-retry-order")).toBeNull();
    const cta = screen.getByTestId("button-confirmation-cta");
    cta.click();
    expect(mockSetLocation).toHaveBeenCalledWith("/checkout");
  });
});
