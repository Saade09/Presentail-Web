import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Unit tests for trackFbMobileEvent in lib/fbPixel.ts
//
// Covered scenarios:
//   1. Sends POST to /api/fb/events with the correct JSON body for a
//      signed-in shopper (value, currency, contentIds, email present).
//   2. Sends POST without email for a guest shopper (guest path).
//   3. Does not send any request when countryCode is null or undefined.
//   4. Does not send any request when EXPO_PUBLIC_FB_PIXEL_ENABLED is "false".
//   5. Does not send any request when EXPO_PUBLIC_FB_PIXEL_ENABLED is "0".
//   6. Sends the event name and countryCode in every request body.
//   7. Omits optional fields (value, currency, contentIds, email, phone)
//      when they are not provided.
//   8. Forwards eventId in the request body when provided (CAPI deduplication).
//   9. Omits eventId from the body when not provided.
//
// EXPO_PUBLIC_FB_PIXEL_ENABLED is captured as a module-level constant, so
// vi.resetModules() is used per suite to re-evaluate it per test group.
// ---------------------------------------------------------------------------

/** Short delay to let the fire-and-forget fetch() promise settle. */
const settle = () => new Promise<void>((r) => setTimeout(r, 30));

/**
 * Parse the body of the first fetch() call that targets /api/fb/events.
 * Returns null when no such call was made.
 */
function findMobilePixelCall(
  mockFetch: ReturnType<typeof vi.fn>,
): Record<string, unknown> | null {
  const call = mockFetch.mock.calls.find(
    (args: unknown[]) =>
      typeof args[0] === "string" && (args[0] as string).endsWith("/api/fb/events"),
  );
  if (!call) return null;
  try {
    return JSON.parse(
      String((call[1] as { body?: unknown })?.body ?? "null"),
    ) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Suite: pixel enabled (default — EXPO_PUBLIC_FB_PIXEL_ENABLED not set to false)
// ---------------------------------------------------------------------------

describe("trackFbMobileEvent — pixel enabled", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let trackFbMobileEvent: (typeof import("./fbPixel"))["trackFbMobileEvent"];

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("EXPO_PUBLIC_FB_PIXEL_ENABLED", "true");

    // Mock @/lib/stripe so API_BASE is deterministic in tests.
    vi.doMock("@/lib/stripe", () => ({
      API_BASE: "https://api.test",
    }));

    mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", mockFetch);

    const mod = await import("./fbPixel");
    trackFbMobileEvent = mod.trackFbMobileEvent;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/stripe");
  });

  // -------------------------------------------------------------------------
  // Request target and headers
  // -------------------------------------------------------------------------

  it("sends a POST request to /api/fb/events", async () => {
    trackFbMobileEvent("Purchase", { countryCode: "lb", value: 50, currency: "USD" });
    await settle();

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.test/api/fb/events",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Signed-in path — email present
  // -------------------------------------------------------------------------

  it("sends value, currency, contentIds, and email for a signed-in shopper (Purchase)", async () => {
    trackFbMobileEvent("Purchase", {
      countryCode: "lb",
      value: 85.5,
      currency: "USD",
      contentIds: ["prod-001", "prod-002"],
      email: "jane@example.com",
    });
    await settle();

    const body = findMobilePixelCall(mockFetch);
    expect(body).not.toBeNull();
    expect(body).toMatchObject({
      event: "Purchase",
      countryCode: "lb",
      value: 85.5,
      currency: "USD",
      contentIds: ["prod-001", "prod-002"],
      email: "jane@example.com",
    });
  });

  it("sends the correct event name for a signed-in shopper", async () => {
    trackFbMobileEvent("Purchase", {
      countryCode: "ae",
      value: 200,
      currency: "AED",
      email: "ali@example.com",
    });
    await settle();

    const body = findMobilePixelCall(mockFetch);
    expect(body?.event).toBe("Purchase");
    expect(body?.email).toBe("ali@example.com");
    expect(body?.countryCode).toBe("ae");
  });

  // -------------------------------------------------------------------------
  // Guest path — no email field
  // -------------------------------------------------------------------------

  it("omits email for a guest shopper (no email provided)", async () => {
    trackFbMobileEvent("Purchase", {
      countryCode: "lb",
      value: 60,
      currency: "USD",
    });
    await settle();

    const body = findMobilePixelCall(mockFetch);
    expect(body).not.toBeNull();
    expect(body?.event).toBe("Purchase");
    expect(body?.value).toBe(60);
    expect(body?.currency).toBe("USD");
    expect(body).not.toHaveProperty("email");
  });

  it("omits email when it is explicitly undefined", async () => {
    trackFbMobileEvent("Purchase", {
      countryCode: "lb",
      value: 45,
      currency: "USD",
      email: undefined,
    });
    await settle();

    const body = findMobilePixelCall(mockFetch);
    expect(body).not.toBeNull();
    expect(body).not.toHaveProperty("email");
  });

  // -------------------------------------------------------------------------
  // countryCode guard
  // -------------------------------------------------------------------------

  it("does not send any request when countryCode is null", async () => {
    trackFbMobileEvent("Purchase", { countryCode: null, value: 50, currency: "USD" });
    await settle();

    expect(findMobilePixelCall(mockFetch)).toBeNull();
  });

  it("does not send any request when countryCode is undefined", async () => {
    trackFbMobileEvent("Purchase", { countryCode: undefined, value: 50, currency: "USD" });
    await settle();

    expect(findMobilePixelCall(mockFetch)).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Optional field handling
  // -------------------------------------------------------------------------

  it("omits value and currency when not provided", async () => {
    trackFbMobileEvent("InitiateCheckout", { countryCode: "lb" });
    await settle();

    const body = findMobilePixelCall(mockFetch);
    expect(body).not.toBeNull();
    expect(body).not.toHaveProperty("value");
    expect(body).not.toHaveProperty("currency");
  });

  it("omits contentIds when not provided", async () => {
    trackFbMobileEvent("Purchase", { countryCode: "lb", value: 50, currency: "USD" });
    await settle();

    const body = findMobilePixelCall(mockFetch);
    expect(body).not.toBeNull();
    expect(body).not.toHaveProperty("contentIds");
  });

  it("omits contentIds when given an empty array", async () => {
    trackFbMobileEvent("Purchase", {
      countryCode: "lb",
      value: 50,
      currency: "USD",
      contentIds: [],
    });
    await settle();

    const body = findMobilePixelCall(mockFetch);
    expect(body).not.toBeNull();
    expect(body).not.toHaveProperty("contentIds");
  });

  it("includes phone when provided", async () => {
    trackFbMobileEvent("Purchase", {
      countryCode: "lb",
      value: 70,
      currency: "USD",
      phone: "+9611234567",
    });
    await settle();

    const body = findMobilePixelCall(mockFetch);
    expect(body?.phone).toBe("+9611234567");
  });

  it("omits phone when not provided", async () => {
    trackFbMobileEvent("Purchase", { countryCode: "lb", value: 50, currency: "USD" });
    await settle();

    const body = findMobilePixelCall(mockFetch);
    expect(body).not.toHaveProperty("phone");
  });

  // -------------------------------------------------------------------------
  // eventId forwarding for Facebook CAPI deduplication
  // -------------------------------------------------------------------------

  it("forwards eventId in the request body when provided", async () => {
    trackFbMobileEvent("Purchase", {
      countryCode: "lb",
      value: 50,
      currency: "USD",
      eventId: "fbpurchase-pi_3Abc123",
    });
    await settle();

    const body = findMobilePixelCall(mockFetch);
    expect(body).not.toBeNull();
    expect(body?.eventId).toBe("fbpurchase-pi_3Abc123");
  });

  it("omits eventId from the body when not provided", async () => {
    trackFbMobileEvent("Purchase", { countryCode: "lb", value: 50, currency: "USD" });
    await settle();

    const body = findMobilePixelCall(mockFetch);
    expect(body).not.toBeNull();
    // When no eventId is supplied the server generates its own random ID.
    // The client sends nothing rather than a random one that cannot be matched
    // against any web pixel event.
    expect(body).not.toHaveProperty("eventId");
    expect(body).not.toHaveProperty("event_id");
  });
});

// ---------------------------------------------------------------------------
// Suite: pixel disabled via EXPO_PUBLIC_FB_PIXEL_ENABLED=false
// ---------------------------------------------------------------------------

describe("trackFbMobileEvent — pixel disabled (EXPO_PUBLIC_FB_PIXEL_ENABLED=false)", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let trackFbMobileEvent: (typeof import("./fbPixel"))["trackFbMobileEvent"];

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("EXPO_PUBLIC_FB_PIXEL_ENABLED", "false");

    vi.doMock("@/lib/stripe", () => ({
      API_BASE: "https://api.test",
    }));

    mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", mockFetch);

    const mod = await import("./fbPixel");
    trackFbMobileEvent = mod.trackFbMobileEvent;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/stripe");
  });

  it("does not send any request when EXPO_PUBLIC_FB_PIXEL_ENABLED is 'false'", async () => {
    trackFbMobileEvent("Purchase", { countryCode: "lb", value: 50, currency: "USD" });
    await settle();

    expect(findMobilePixelCall(mockFetch)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite: pixel disabled via EXPO_PUBLIC_FB_PIXEL_ENABLED=0
// ---------------------------------------------------------------------------

describe("trackFbMobileEvent — pixel disabled (EXPO_PUBLIC_FB_PIXEL_ENABLED=0)", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let trackFbMobileEvent: (typeof import("./fbPixel"))["trackFbMobileEvent"];

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("EXPO_PUBLIC_FB_PIXEL_ENABLED", "0");

    vi.doMock("@/lib/stripe", () => ({
      API_BASE: "https://api.test",
    }));

    mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", mockFetch);

    const mod = await import("./fbPixel");
    trackFbMobileEvent = mod.trackFbMobileEvent;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/stripe");
  });

  it("does not send any request when EXPO_PUBLIC_FB_PIXEL_ENABLED is '0'", async () => {
    trackFbMobileEvent("Purchase", { countryCode: "lb", value: 50, currency: "USD" });
    await settle();

    expect(findMobilePixelCall(mockFetch)).toBeNull();
  });
});
