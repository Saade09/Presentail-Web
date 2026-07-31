// @vitest-environment jsdom
//
// PayPal-return tests for the OrderConfirmed page (iOS Safari stash loss).
//
// PayPal appends ?token=<PAYPAL_TOKEN>&PayerID=<ID> to the return URL. On iOS
// Safari the cross-origin redirect can wipe sessionStorage, losing the pending
// order stash. OrderConfirmed must then enter the processing/polling state
// (using the PayPal token as the reference) instead of instantly hard-failing,
// and — once polling exhausts — show the token as the payment reference so the
// shopper can quote it to support. These tests lock down that contract:
//
//   1. token present + empty sessionStorage → "processing" spinner, no
//      createOrder call.
//   2. after MAX_POLL_RETRIES the failure screen shows the PayPal token as the
//      payment reference (retries exhausted → no Retry CTA).
//   3. normal path: stash present + token present → finalizes via createOrder
//      with the token forwarded as paymentRef.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, act } from "@testing-library/react";
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
const PAYPAL_TOKEN = "5AB12345CD678901E";

// Must match the constants in OrderConfirmed.tsx.
const MAX_POLL_RETRIES = 30;
const FIRST_POLL_DELAY_MS = 2000;
const POLL_INTERVAL_MS = 4000;

const PENDING_PAYLOAD = {
  totalUsd: 120,
  currencyCode: "USD",
  items: [{ name: "White Orchids", quantity: 1, price: 120 }],
  paymentMethod: "paypal",
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

// The processing poll hits /api/stripe/payment-status via global fetch. For a
// PayPal token the endpoint never reports payment_succeeded — simulate the
// realistic "unknown reference" response so the loop keeps retrying.
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, status: "pending" }),
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  sessionStorage.clear();
});

// ---------------------------------------------------------------------------
// 1. PayPal return with the stash lost → processing spinner
// ---------------------------------------------------------------------------

describe("OrderConfirmed — PayPal return with lost sessionStorage (iOS Safari)", () => {
  beforeEach(() => {
    // PayPal return shape: success + token + PayerID, sessionStorage empty.
    mockUseSearch.mockReturnValue(
      `?status=success&token=${PAYPAL_TOKEN}&PayerID=XYZ789`,
    );
  });

  it("renders the processing spinner instead of hard-failing, without calling createOrder", async () => {
    renderWithProviders(<OrderConfirmed />, {
      cart: { clearCart: mockClearCart },
    });

    // The polling/recovery state is shown — not the failure screen.
    await screen.findByTestId("icon-processing");
    expect(screen.getByTestId("text-confirmation-title").textContent).toContain(
      "order.processing.title",
    );
    expect(screen.queryByTestId("icon-failed")).toBeNull();

    // No stash → createOrder must never run.
    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockClearCart).not.toHaveBeenCalled();
  });

  it("polls payment-status with the PayPal token as the reference id", async () => {
    vi.useFakeTimers();

    renderWithProviders(<OrderConfirmed />, {
      cart: { clearCart: mockClearCart },
    });
    expect(screen.getByTestId("icon-processing")).toBeTruthy();

    // Advance to the first poll tick.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FIRST_POLL_DELAY_MS);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      `pi=${encodeURIComponent(PAYPAL_TOKEN)}`,
    );
  });

  it("shows the failure screen with the PayPal token as the payment reference after MAX_POLL_RETRIES", async () => {
    vi.useFakeTimers();

    renderWithProviders(<OrderConfirmed />, {
      cart: { clearCart: mockClearCart },
    });
    expect(screen.getByTestId("icon-processing")).toBeTruthy();

    // Drive the poll loop to exhaustion: first tick at 2 s, then one retry
    // every 4 s. The (MAX_POLL_RETRIES + 1)-th tick trips the cap.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FIRST_POLL_DELAY_MS);
      for (let i = 0; i < MAX_POLL_RETRIES; i++) {
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      }
    });

    // Polls ran the full MAX_POLL_RETRIES times before giving up.
    expect(fetchMock).toHaveBeenCalledTimes(MAX_POLL_RETRIES);

    // The failure screen is shown in the escalated (retries-exhausted) form…
    expect(screen.getByTestId("icon-failed")).toBeTruthy();
    expect(
      screen.getByTestId("text-confirmation-message").textContent,
    ).toContain("order.fail.exhausted");

    // …with the PayPal token surfaced as the payment reference for support.
    expect(screen.getByTestId("text-payment-ref").textContent).toContain(
      PAYPAL_TOKEN,
    );

    // No stash remains, so no Retry CTA — only the return-to-checkout CTA.
    expect(screen.queryByTestId("button-retry-order")).toBeNull();
    expect(screen.getByTestId("button-confirmation-cta")).toBeTruthy();

    // createOrder was never invoked with a missing payload.
    expect(mockMutate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2. Normal PayPal return — stash intact → finalizes via createOrder
// ---------------------------------------------------------------------------

describe("OrderConfirmed — PayPal return with the stash present", () => {
  beforeEach(() => {
    mockUseSearch.mockReturnValue(
      `?status=success&token=${PAYPAL_TOKEN}&PayerID=XYZ789`,
    );
    seedSessionStorage();
  });

  it("finalizes the order with the stashed payload and forwards the token as paymentRef", async () => {
    mockMutate.mockImplementation(
      (
        _payload: unknown,
        { onSuccess }: { onSuccess: (res: unknown) => void },
      ) => {
        onSuccess({ ok: true, wcOrderId: 24680 });
      },
    );

    renderWithProviders(<OrderConfirmed />, {
      cart: { clearCart: mockClearCart },
    });

    // The stash short-circuits the processing state — createOrder runs directly.
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledTimes(1);
    });
    const submittedPayload = mockMutate.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(submittedPayload).toMatchObject({
      totalUsd: 120,
      currencyCode: "USD",
      paymentMethod: "paypal",
      paymentRef: PAYPAL_TOKEN,
    });

    // Success screen with the created order ref; stash cleared, cart cleared.
    await screen.findByTestId("icon-success");
    expect(screen.getByTestId("text-order-ref").textContent).toContain("24680");
    expect(sessionStorage.getItem(PENDING_ORDER_KEY)).toBeNull();
    expect(mockClearCart).toHaveBeenCalledTimes(1);

    // The payment-status poll never ran — the stash path won.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
