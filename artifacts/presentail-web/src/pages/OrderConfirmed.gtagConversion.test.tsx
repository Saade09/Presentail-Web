// @vitest-environment jsdom
//
// Integration tests for the Google Ads purchase conversion in OrderConfirmed.
//
// Verifies that fireAdsPurchaseConversion (i.e. window.gtag "conversion") fires
// with the correct send_to label, transaction_id, value, and currency on every
// successful purchase, and fires exactly once per mount, even under React Strict
// Mode's double-invocation of effects.
//
// Two code paths are exercised:
//
//   1. Inline-payment path: Checkout.tsx appends ?ref=<orderRef> to the URL,
//      so OrderConfirmed initialises directly to { kind: "success" }. The
//      conversion fires inside a useEffect after auth hydration.
//
//   2. Redirect-based payment path: state starts as { kind: "finalizing" },
//      createOrder.mutate resolves successfully, and the conversion fires inside
//      the onSuccess callback (purchaseFiredRef guards against a second fire
//      from the effect that re-runs when state transitions to "success").

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test-utils";

// ---------------------------------------------------------------------------
// Hoisted stubs — vi.hoisted() ensures these exist when vi.mock() factories run
// ---------------------------------------------------------------------------

const { mockUseSearch, mockSetLocation, mockMutate } = vi.hoisted(() => ({
  mockUseSearch: vi.fn().mockReturnValue(""),
  mockSetLocation: vi.fn(),
  mockMutate: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks — all vi.mock() calls must precede the component import
// ---------------------------------------------------------------------------

vi.mock("@/lib/fbPixel", () => ({
  trackFbEvent: vi.fn(),
  trackFbPageView: vi.fn(),
  initPixel: vi.fn(),
}));

const mockTrackFunnelEvent = vi.hoisted(() => vi.fn());
const mockTrackFunnelEventOnce = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics", async (importOriginal) => {
  const { mockAnalyticsModule } = await import("@/test/analytics-mock");
  return mockAnalyticsModule(importOriginal, {
    trackEvent: vi.fn(),
    trackWebEvent: vi.fn(),
    trackFunnelEvent: (...args: unknown[]) => mockTrackFunnelEvent(...args),
    trackFunnelEventOnce: (...args: unknown[]) => mockTrackFunnelEventOnce(...args),
    funnelValueBucket: () => "under_50",
  });
});

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
// Import component AFTER all vi.mock() declarations
// ---------------------------------------------------------------------------

import OrderConfirmed from "./OrderConfirmed";

// ---------------------------------------------------------------------------
// Constants matching gtag.ts module-level values
// ---------------------------------------------------------------------------

const EXPECTED_SEND_TO = "AW-18281774261/XYi_CNabpMccELX5to1E";
const PENDING_ORDER_KEY = "presentail_pending_order_v1";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const SIGNED_IN_USER = {
  id: "101",
  email: "jane@example.com",
  firstName: "Jane",
  lastName: "Doe",
  phone: "+12125551234",
};

const STASHED_PAYLOAD = {
  payload: {
    totalUsd: 80,
    currencyCode: "EUR",
    items: [{ name: "Red Roses", quantity: 1, price: 80 }],
    paymentMethod: "card",
  },
  createdAt: Date.now(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedSessionStorage(override?: object) {
  sessionStorage.setItem(
    PENDING_ORDER_KEY,
    JSON.stringify(override ?? STASHED_PAYLOAD),
  );
}

function clearSessionStorage() {
  sessionStorage.removeItem(PENDING_ORDER_KEY);
}

/** Return all window.gtag calls whose second argument is "conversion". */
function conversionCalls(gtag: ReturnType<typeof vi.fn>) {
  return gtag.mock.calls.filter(
    ([, eventName]: unknown[]) => eventName === "conversion",
  );
}

// ---------------------------------------------------------------------------
// Test environment setup
// ---------------------------------------------------------------------------

let mockGtag: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockTrackFunnelEvent.mockClear();
  mockTrackFunnelEventOnce.mockClear();
  mockGtag = vi.fn();
  (window as unknown as Record<string, unknown>).gtag = mockGtag;
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).gtag;
  // Clear ALL sessionStorage keys — the conversion deduplication guard writes
  // a `presentail_ads_conversion_fired_<ref>` key that must not persist across
  // test cases (it would cause the guard to suppress subsequent test mounts).
  sessionStorage.clear();
});

// ---------------------------------------------------------------------------
// Path 1: inline-payment — ?ref= already on URL, state starts as "success"
// ---------------------------------------------------------------------------

describe("OrderConfirmed — inline-payment path (?ref= on URL)", () => {
  beforeEach(() => {
    mockUseSearch.mockReturnValue("?ref=order-abc-123");
    seedSessionStorage();
  });

  it("fires window.gtag('event','conversion') with the correct send_to label", async () => {
    renderWithProviders(<OrderConfirmed />, {
      auth: { user: SIGNED_IN_USER, token: "fake-token", isLoading: false },
    });

    await waitFor(() => {
      expect(conversionCalls(mockGtag).length).toBeGreaterThan(0);
    });
    expect(mockTrackFunnelEventOnce.mock.calls.filter(([name]) => name === "payment_completed")).toHaveLength(1);
    expect(mockTrackFunnelEventOnce.mock.calls.filter(([name]) => name === "order_confirmed")).toHaveLength(1);

    const [, , params] = conversionCalls(mockGtag)[0] as [unknown, unknown, Record<string, unknown>];
    expect(params.send_to).toBe(EXPECTED_SEND_TO);
  });

  it("passes the order ref as transaction_id", async () => {
    renderWithProviders(<OrderConfirmed />, {
      auth: { user: SIGNED_IN_USER, token: "fake-token", isLoading: false },
    });

    await waitFor(() => {
      expect(conversionCalls(mockGtag).length).toBeGreaterThan(0);
    });
    expect(mockTrackFunnelEventOnce.mock.calls.filter(([name]) => name === "payment_completed")).toHaveLength(1);
    expect(mockTrackFunnelEventOnce.mock.calls.filter(([name]) => name === "order_confirmed")).toHaveLength(1);

    const [, , params] = conversionCalls(mockGtag)[0] as [unknown, unknown, Record<string, unknown>];
    expect(params.transaction_id).toBe("order-abc-123");
  });

  it("passes value from the stashed totalUsd", async () => {
    renderWithProviders(<OrderConfirmed />, {
      auth: { user: SIGNED_IN_USER, token: "fake-token", isLoading: false },
    });

    await waitFor(() => {
      expect(conversionCalls(mockGtag).length).toBeGreaterThan(0);
    });

    const [, , params] = conversionCalls(mockGtag)[0] as [unknown, unknown, Record<string, unknown>];
    expect(params.value).toBe(80);
  });

  it("passes currency from the stashed currencyCode", async () => {
    renderWithProviders(<OrderConfirmed />, {
      auth: { user: SIGNED_IN_USER, token: "fake-token", isLoading: false },
    });

    await waitFor(() => {
      expect(conversionCalls(mockGtag).length).toBeGreaterThan(0);
    });

    const [, , params] = conversionCalls(mockGtag)[0] as [unknown, unknown, Record<string, unknown>];
    expect(params.currency).toBe("EUR");
  });

  it("falls back to value=0 and currency='USD' when stash is absent", async () => {
    clearSessionStorage();
    // When ?ref= is present, initial state is "success" regardless of the stash.
    // The conversion fires but reads value=0/currency="USD" as fallback because
    // there is no stashed payload to pull totalUsd/currencyCode from.
    mockUseSearch.mockReturnValue("?ref=order-no-stash");

    renderWithProviders(<OrderConfirmed />, {
      auth: { user: null, token: null, isLoading: false },
    });

    await waitFor(() => {
      expect(conversionCalls(mockGtag).length).toBeGreaterThan(0);
    });

    const [, , params] = conversionCalls(mockGtag)[0] as [unknown, unknown, Record<string, unknown>];
    expect(params.value).toBe(0);
    expect(params.currency).toBe("USD");
  });

  it("does NOT fire the conversion while auth is still loading", async () => {
    renderWithProviders(<OrderConfirmed />, {
      auth: { user: SIGNED_IN_USER, token: "fake-token", isLoading: true },
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 60));
    expect(conversionCalls(mockGtag).length).toBe(0);
    expect(mockTrackFunnelEventOnce).not.toHaveBeenCalled();
  });

  it("fires exactly once even if the component re-renders", async () => {
    const { rerender } = renderWithProviders(<OrderConfirmed />, {
      auth: { user: SIGNED_IN_USER, token: "fake-token", isLoading: false },
    });

    await waitFor(() => {
      expect(conversionCalls(mockGtag).length).toBeGreaterThan(0);
    });

    const countBefore = conversionCalls(mockGtag).length;
    rerender(<OrderConfirmed />);
    await new Promise<void>((resolve) => setTimeout(resolve, 40));

    expect(conversionCalls(mockGtag).length).toBe(countBefore);
  });
});

// ---------------------------------------------------------------------------
// Path 2: redirect/finalizing — createOrder.mutate resolves
// ---------------------------------------------------------------------------

describe("OrderConfirmed — redirect/finalizing path (createOrder.mutate)", () => {
  beforeEach(() => {
    mockUseSearch.mockReturnValue("?status=success");
    seedSessionStorage();
  });

  it("fires window.gtag('event','conversion') after mutate succeeds", async () => {
    mockMutate.mockImplementation(
      (_payload: unknown, { onSuccess }: { onSuccess: (res: unknown) => void }) => {
        onSuccess({ ok: true, wcOrderId: 999 });
      },
    );

    renderWithProviders(<OrderConfirmed />, {
      auth: { user: SIGNED_IN_USER, token: "fake-token", isLoading: false },
      cart: { clearCart: vi.fn(), items: [], subtotal: 0, itemCount: 0, isHydrated: true },
    });

    await waitFor(() => {
      expect(conversionCalls(mockGtag).length).toBeGreaterThan(0);
    });

    const [, , params] = conversionCalls(mockGtag)[0] as [unknown, unknown, Record<string, unknown>];
    expect(params.send_to).toBe(EXPECTED_SEND_TO);
  });

  it("passes the correct transaction_id (wcOrderId) after mutate succeeds", async () => {
    mockMutate.mockImplementation(
      (_payload: unknown, { onSuccess }: { onSuccess: (res: unknown) => void }) => {
        onSuccess({ ok: true, wcOrderId: 999 });
      },
    );

    renderWithProviders(<OrderConfirmed />, {
      auth: { user: SIGNED_IN_USER, token: "fake-token", isLoading: false },
      cart: { clearCart: vi.fn(), items: [], subtotal: 0, itemCount: 0, isHydrated: true },
    });

    await waitFor(() => {
      expect(conversionCalls(mockGtag).length).toBeGreaterThan(0);
    });

    const [, , params] = conversionCalls(mockGtag)[0] as [unknown, unknown, Record<string, unknown>];
    expect(params.transaction_id).toBe("999");
  });

  it("passes value and currency from the stashed payload", async () => {
    mockMutate.mockImplementation(
      (_payload: unknown, { onSuccess }: { onSuccess: (res: unknown) => void }) => {
        onSuccess({ ok: true, wcOrderId: 1001 });
      },
    );

    renderWithProviders(<OrderConfirmed />, {
      auth: { user: null, token: null, isLoading: false },
      cart: { clearCart: vi.fn(), items: [], subtotal: 0, itemCount: 0, isHydrated: true },
    });

    await waitFor(() => {
      expect(conversionCalls(mockGtag).length).toBeGreaterThan(0);
    });

    const [, , params] = conversionCalls(mockGtag)[0] as [unknown, unknown, Record<string, unknown>];
    expect(params.value).toBe(80);
    expect(params.currency).toBe("EUR");
  });

  it("fires the conversion exactly once (not again when state transitions to 'success')", async () => {
    mockMutate.mockImplementation(
      (_payload: unknown, { onSuccess }: { onSuccess: (res: unknown) => void }) => {
        onSuccess({ ok: true, wcOrderId: 1002 });
      },
    );

    renderWithProviders(<OrderConfirmed />, {
      auth: { user: SIGNED_IN_USER, token: "fake-token", isLoading: false },
      cart: { clearCart: vi.fn(), items: [], subtotal: 0, itemCount: 0, isHydrated: true },
    });

    await waitFor(() => {
      expect(conversionCalls(mockGtag).length).toBeGreaterThan(0);
    });

    // Allow any subsequent effects to settle
    await new Promise<void>((resolve) => setTimeout(resolve, 80));
    expect(conversionCalls(mockGtag).length).toBe(1);
  });

  it("does NOT fire the conversion when mutate returns ok:false", async () => {
    mockMutate.mockImplementation(
      (_payload: unknown, { onSuccess }: { onSuccess: (res: unknown) => void }) => {
        onSuccess({ ok: false, message: "Something went wrong" });
      },
    );

    renderWithProviders(<OrderConfirmed />, {
      auth: { user: SIGNED_IN_USER, token: "fake-token", isLoading: false },
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 60));
    expect(conversionCalls(mockGtag).length).toBe(0);
    expect(mockTrackFunnelEventOnce).not.toHaveBeenCalled();
  });

  it("does NOT fire the conversion when mutate calls onError", async () => {
    mockMutate.mockImplementation(
      (_payload: unknown, { onError }: { onError: (err: unknown) => void }) => {
        onError(new Error("Network failure"));
      },
    );

    renderWithProviders(<OrderConfirmed />, {
      auth: { user: SIGNED_IN_USER, token: "fake-token", isLoading: false },
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 60));
    expect(conversionCalls(mockGtag).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sessionStorage deduplication — page reload guard
//
// `purchaseFiredRef` is a React ref that resets to false on every full page
// reload. A sessionStorage key keyed by the order ref (`presentail_ads_
// conversion_fired_<ref>`) persists across reloads within the same session and
// prevents the conversion from firing a second time when the shopper reloads
// /order-confirmed?ref=<ref> (e.g. after a slow connection).
// ---------------------------------------------------------------------------

describe("OrderConfirmed — sessionStorage deduplication (page-reload guard)", () => {
  describe("inline-payment path (?ref= on URL)", () => {
    const ORDER_REF = "order-reload-guard";
    const CONVERSION_KEY = `presentail_ads_conversion_fired_${ORDER_REF}`;

    beforeEach(() => {
      // Clear ALL sessionStorage keys (including any conversion keys left by
      // prior tests) so each test starts from a known-clean state.
      sessionStorage.clear();
      mockUseSearch.mockReturnValue(`?ref=${ORDER_REF}`);
      seedSessionStorage();
    });

    it("fires the conversion on the first mount and writes the deduplication key", async () => {
      renderWithProviders(<OrderConfirmed />, {
        auth: { user: null, token: null, isLoading: false },
      });

      await waitFor(() => {
        expect(conversionCalls(mockGtag).length).toBeGreaterThan(0);
      });

      expect(sessionStorage.getItem(CONVERSION_KEY)).toBe("1");
    });

    it("does NOT re-fire when the deduplication key is already present (simulates a page reload)", async () => {
      // Simulate the state left by a prior page load.
      sessionStorage.setItem(CONVERSION_KEY, "1");

      renderWithProviders(<OrderConfirmed />, {
        auth: { user: null, token: null, isLoading: false },
      });

      await new Promise<void>((resolve) => setTimeout(resolve, 60));
      expect(conversionCalls(mockGtag).length).toBe(0);
    });

    it("fires normally for a different order ref whose key is absent", async () => {
      // Only an unrelated ref's key is in storage; ORDER_REF has not fired yet.
      sessionStorage.setItem("presentail_ads_conversion_fired_order-other-999", "1");

      renderWithProviders(<OrderConfirmed />, {
        auth: { user: null, token: null, isLoading: false },
      });

      await waitFor(() => {
        expect(conversionCalls(mockGtag).length).toBeGreaterThan(0);
      });

      const [, , params] = conversionCalls(mockGtag)[0] as [
        unknown,
        unknown,
        Record<string, unknown>,
      ];
      expect(params.transaction_id).toBe(ORDER_REF);
    });
  });

  describe("redirect/finalizing path (createOrder.mutate)", () => {
    const WC_ORDER_ID = 77777;
    const CONVERSION_KEY = `presentail_ads_conversion_fired_${WC_ORDER_ID}`;

    beforeEach(() => {
      sessionStorage.clear();
      mockUseSearch.mockReturnValue("?status=success");
      seedSessionStorage();
    });

    it("fires the conversion after mutate succeeds and writes the deduplication key", async () => {
      mockMutate.mockImplementation(
        (_payload: unknown, { onSuccess }: { onSuccess: (res: unknown) => void }) => {
          onSuccess({ ok: true, wcOrderId: WC_ORDER_ID });
        },
      );

      renderWithProviders(<OrderConfirmed />, {
        auth: { user: null, token: null, isLoading: false },
        cart: { clearCart: vi.fn(), items: [], subtotal: 0, itemCount: 0, isHydrated: true },
      });

      await waitFor(() => {
        expect(conversionCalls(mockGtag).length).toBeGreaterThan(0);
      });

      expect(sessionStorage.getItem(CONVERSION_KEY)).toBe("1");
    });

    it("does NOT re-fire when the deduplication key is already present for the finalized order ref", async () => {
      // Simulate a prior page load having already fired for this order ref.
      sessionStorage.setItem(CONVERSION_KEY, "1");

      mockMutate.mockImplementation(
        (_payload: unknown, { onSuccess }: { onSuccess: (res: unknown) => void }) => {
          onSuccess({ ok: true, wcOrderId: WC_ORDER_ID });
        },
      );

      renderWithProviders(<OrderConfirmed />, {
        auth: { user: null, token: null, isLoading: false },
        cart: { clearCart: vi.fn(), items: [], subtotal: 0, itemCount: 0, isHydrated: true },
      });

      await new Promise<void>((resolve) => setTimeout(resolve, 60));
      expect(conversionCalls(mockGtag).length).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// React Strict Mode — double-invocation guard
//
// React Strict Mode intentionally runs effects twice on the same component
// instance (mount → cleanup → re-run) in development. The `purchaseFiredRef`
// guard must survive this double-invocation and prevent the conversion from
// firing more than once. These tests mount OrderConfirmed inside
// <React.StrictMode> to verify the guard holds on both code paths.
// ---------------------------------------------------------------------------

describe("OrderConfirmed — React Strict Mode double-invocation guard", () => {
  describe("inline-payment path (?ref= on URL)", () => {
    beforeEach(() => {
      mockUseSearch.mockReturnValue("?ref=order-strict-inline");
      seedSessionStorage();
    });

    it("fires exactly once even when React Strict Mode invokes the effect twice", async () => {
      renderWithProviders(
        <React.StrictMode>
          <OrderConfirmed />
        </React.StrictMode>,
        { auth: { user: SIGNED_IN_USER, token: "fake-token", isLoading: false } },
      );

      await waitFor(() => {
        expect(conversionCalls(mockGtag).length).toBeGreaterThan(0);
      });

      // Allow all Strict Mode effect re-runs to settle before asserting count.
      await new Promise<void>((resolve) => setTimeout(resolve, 80));
      expect(conversionCalls(mockGtag).length).toBe(1);
    });
  });

  describe("redirect/finalizing path (createOrder.mutate)", () => {
    beforeEach(() => {
      mockUseSearch.mockReturnValue("?status=success");
      seedSessionStorage();
    });

    it("fires exactly once even when React Strict Mode invokes the effect twice", async () => {
      mockMutate.mockImplementation(
        (_payload: unknown, { onSuccess }: { onSuccess: (res: unknown) => void }) => {
          onSuccess({ ok: true, wcOrderId: 5001 });
        },
      );

      renderWithProviders(
        <React.StrictMode>
          <OrderConfirmed />
        </React.StrictMode>,
        {
          auth: { user: SIGNED_IN_USER, token: "fake-token", isLoading: false },
          cart: { clearCart: vi.fn(), items: [], subtotal: 0, itemCount: 0, isHydrated: true },
        },
      );

      await waitFor(() => {
        expect(conversionCalls(mockGtag).length).toBeGreaterThan(0);
      });

      // Allow all Strict Mode effect re-runs to settle before asserting count.
      await new Promise<void>((resolve) => setTimeout(resolve, 80));
      expect(conversionCalls(mockGtag).length).toBe(1);
    });
  });
});
