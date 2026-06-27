// @vitest-environment jsdom
//
// Integration tests for the OrderConfirmed Purchase pixel event.
//
// Verifies that POST /api/pixel/event is called with a non-empty userData.em
// field when a signed-in user reaches the confirmation page, and that no
// userData field is sent for guest shoppers.
//
// The fbPixel module is partially mocked so that trackFbEvent calls through to
// the real fetch logic (bypassing the activePixelId gate, which is a pixel-ID
// configuration concern irrelevant to the signed-in/guest branching we are
// testing). global.fetch is spied on so we can assert the exact request body
// that reaches the /api/pixel/event route.
//
// Two code paths are exercised:
//
//   1. Inline-payment path: Checkout.tsx appends ?ref=<orderRef> to the URL,
//      so state initialises directly to { kind: "success" }. The Purchase
//      event fires in a useEffect after auth hydration.
//
//   2. Redirect-based payment path: state starts as { kind: "finalizing" },
//      createOrder.mutate resolves successfully, and the Purchase event fires
//      inside the onSuccess callback before transitioning to "success".

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test-utils";
import type { FbPixelParams } from "@/lib/fbPixel";

// ---------------------------------------------------------------------------
// Hoisted stubs — vi.hoisted() ensures these exist when vi.mock() factories run
// ---------------------------------------------------------------------------

const { mockFetch, mockUseSearch, mockSetLocation, mockMutate } = vi.hoisted(
  () => ({
    mockFetch: vi.fn(),
    mockUseSearch: vi.fn().mockReturnValue(""),
    mockSetLocation: vi.fn(),
    mockMutate: vi.fn(),
  }),
);

// ---------------------------------------------------------------------------
// Module mocks — all vi.mock() calls must precede the component import
// ---------------------------------------------------------------------------

// Partial mock-through of fbPixel: trackFbEvent calls fetch directly with
// the expected /api/pixel/event body shape, bypassing the activePixelId gate
// (the gate is a pixel-configuration concern, not the signed-in/guest concern
// we are testing). This lets us assert on what the API route would receive.
vi.mock("@/lib/fbPixel", () => ({
  trackFbEvent: (event: string, params?: FbPixelParams) => {
    const body: Record<string, unknown> = {
      eventName: event,
      pixelId: "test-pixel-lb",
      fbp: "fb.1.0.0",
      sourceUrl: typeof window !== "undefined" ? window.location.href : "",
    };
    if (params?.event_id) body.eventId = params.event_id;
    if (params?.value != null) body.value = params.value;
    if (params?.currency) body.currency = params.currency;
    if (params?.content_ids) body.contentIds = params.content_ids;
    if (params?.content_name) body.contentName = params.content_name;
    if (params?.num_items != null) body.numItems = params.num_items;
    if (params?.userData?.em) body.userData = { em: params.userData.em };
    fetch("/api/pixel/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  },
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

const SIGNED_IN_USER = {
  id: "101",
  email: "jane@example.com",
  firstName: "Jane",
  lastName: "Doe",
  phone: "+12125551234",
};

const PENDING_ORDER_KEY = "presentail_pending_order_v1";

const STASHED_PAYLOAD = {
  payload: {
    totalUsd: 80,
    currencyCode: "USD",
    items: [{ name: "Red Roses", quantity: 1, price: 80 }],
    paymentMethod: "card",
  },
  createdAt: Date.now(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedSessionStorage() {
  sessionStorage.setItem(PENDING_ORDER_KEY, JSON.stringify(STASHED_PAYLOAD));
}

function clearSessionStorage() {
  sessionStorage.removeItem(PENDING_ORDER_KEY);
}

/**
 * Find the POST /api/pixel/event call among all fetch() invocations and parse
 * its request body. Returns null when no such call was recorded.
 */
function findPixelEventCall(): Record<string, unknown> | null {
  const call = mockFetch.mock.calls.find(
    ([url]: [unknown]) =>
      typeof url === "string" && url.endsWith("/api/pixel/event"),
  );
  if (!call) return null;
  try {
    return JSON.parse(String(call[1]?.body ?? "null")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Test environment setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Replace global.fetch with a spy that captures all outgoing requests,
  // including the fire-and-forget POST /api/pixel/event from fbPixel.
  mockFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true })));
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearSessionStorage();
});

// ---------------------------------------------------------------------------
// Path 1: inline-payment — ?ref= already on URL, state starts as "success"
// ---------------------------------------------------------------------------

describe("OrderConfirmed — inline-payment path (?ref= on URL)", () => {
  beforeEach(() => {
    mockUseSearch.mockReturnValue("?ref=order-abc-123");
    seedSessionStorage();
  });

  it("sends POST /api/pixel/event with userData.em for a signed-in shopper", async () => {
    renderWithProviders(<OrderConfirmed />, {
      auth: { user: SIGNED_IN_USER, token: "fake-token", isLoading: false },
    });

    await waitFor(() => {
      const body = findPixelEventCall();
      expect(body).not.toBeNull();
      expect((body as Record<string, unknown>).eventName).toBe("Purchase");
      expect(
        ((body as Record<string, unknown>).userData as Record<string, unknown>)
          ?.em,
      ).toBe(SIGNED_IN_USER.email);
    });
  });

  it("sends POST /api/pixel/event without userData for a guest shopper", async () => {
    renderWithProviders(<OrderConfirmed />, {
      auth: { user: null, token: null, isLoading: false },
    });

    await waitFor(() => {
      const body = findPixelEventCall();
      expect(body).not.toBeNull();
      expect((body as Record<string, unknown>).eventName).toBe("Purchase");
    });

    const body = findPixelEventCall()!;
    expect(body).not.toHaveProperty("userData");
  });

  it("does not send the pixel event while auth is still loading", async () => {
    renderWithProviders(<OrderConfirmed />, {
      auth: { user: SIGNED_IN_USER, token: "fake-token", isLoading: true },
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 60));
    expect(findPixelEventCall()).toBeNull();
  });

  it("sends the pixel event only once even if the component re-renders", async () => {
    const { rerender } = renderWithProviders(<OrderConfirmed />, {
      auth: { user: SIGNED_IN_USER, token: "fake-token", isLoading: false },
    });

    await waitFor(() => {
      expect(findPixelEventCall()).not.toBeNull();
    });

    const callCountBefore = mockFetch.mock.calls.filter(
      ([url]: [unknown]) =>
        typeof url === "string" && url.endsWith("/api/pixel/event"),
    ).length;

    rerender(<OrderConfirmed />);
    await new Promise<void>((resolve) => setTimeout(resolve, 40));

    const callCountAfter = mockFetch.mock.calls.filter(
      ([url]: [unknown]) =>
        typeof url === "string" && url.endsWith("/api/pixel/event"),
    ).length;

    expect(callCountAfter).toBe(callCountBefore);
  });
});

// ---------------------------------------------------------------------------
// Path 2: redirect/finalizing — createOrder.mutate resolves
// ---------------------------------------------------------------------------

describe("OrderConfirmed — redirect/finalizing path (createOrder.mutate)", () => {
  beforeEach(() => {
    // No ?ref= → component enters { kind: "finalizing" } and calls createOrder.mutate
    mockUseSearch.mockReturnValue("?status=success");
    seedSessionStorage();
  });

  it("sends POST /api/pixel/event with userData.em after mutate succeeds for a signed-in shopper", async () => {
    mockMutate.mockImplementation(
      (
        _payload: unknown,
        { onSuccess }: { onSuccess: (res: unknown) => void },
      ) => {
        onSuccess({ ok: true, wcOrderId: 999 });
      },
    );

    renderWithProviders(<OrderConfirmed />, {
      auth: { user: SIGNED_IN_USER, token: "fake-token", isLoading: false },
      cart: {
        clearCart: vi.fn(),
        items: [],
        subtotal: 0,
        itemCount: 0,
        isHydrated: true,
      },
    });

    await waitFor(() => {
      const body = findPixelEventCall();
      expect(body).not.toBeNull();
      expect((body as Record<string, unknown>).eventName).toBe("Purchase");
      expect(
        ((body as Record<string, unknown>).userData as Record<string, unknown>)
          ?.em,
      ).toBe(SIGNED_IN_USER.email);
    });
  });

  it("sends POST /api/pixel/event without userData after mutate succeeds for a guest shopper", async () => {
    mockMutate.mockImplementation(
      (
        _payload: unknown,
        { onSuccess }: { onSuccess: (res: unknown) => void },
      ) => {
        onSuccess({ ok: true, wcOrderId: 1000 });
      },
    );

    renderWithProviders(<OrderConfirmed />, {
      auth: { user: null, token: null, isLoading: false },
      cart: {
        clearCart: vi.fn(),
        items: [],
        subtotal: 0,
        itemCount: 0,
        isHydrated: true,
      },
    });

    await waitFor(() => {
      const body = findPixelEventCall();
      expect(body).not.toBeNull();
      expect((body as Record<string, unknown>).eventName).toBe("Purchase");
    });

    const body = findPixelEventCall()!;
    expect(body).not.toHaveProperty("userData");
  });

  it("does NOT send the pixel event when mutate returns ok:false", async () => {
    mockMutate.mockImplementation(
      (
        _payload: unknown,
        { onSuccess }: { onSuccess: (res: unknown) => void },
      ) => {
        onSuccess({ ok: false, message: "Something went wrong" });
      },
    );

    renderWithProviders(<OrderConfirmed />, {
      auth: { user: SIGNED_IN_USER, token: "fake-token", isLoading: false },
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 60));
    expect(findPixelEventCall()).toBeNull();
  });

  it("does NOT send the pixel event when mutate calls onError", async () => {
    mockMutate.mockImplementation(
      (
        _payload: unknown,
        { onError }: { onError: (err: unknown) => void },
      ) => {
        onError(new Error("Network failure"));
      },
    );

    renderWithProviders(<OrderConfirmed />, {
      auth: { user: SIGNED_IN_USER, token: "fake-token", isLoading: false },
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 60));
    expect(findPixelEventCall()).toBeNull();
  });
});
