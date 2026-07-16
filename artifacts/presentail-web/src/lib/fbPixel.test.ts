// @vitest-environment jsdom
//
// Unit tests for trackFbEvent in fbPixel.ts.
//
// These tests exercise the real trackFbEvent → POST /api/pixel/event pipeline
// end-to-end without mocking the fbPixel module.
//
// PIXEL_ID_LB / PIXEL_ID_AE are module-level constants captured from
// import.meta.env.* at load time, so we use vi.resetModules() + a dynamic
// import per test group to control whether the pixel is initialised.
//
// Covered scenarios:
//   1. No request is sent when the pixel is not initialised (no env var set).
//   2. Exact POST body for a signed-in shopper (userData.em present).
//   3. Exact POST body for a guest shopper (no userData field).
//   4. eventId, value, and currency are forwarded correctly.
//   5. POST goes to /api/pixel/event with method:POST and JSON content-type.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse the body of the first fetch() call to /api/pixel/event.
 * Returns null when no such call was made.
 */
function findPixelEventCall(
  mockFetch: ReturnType<typeof vi.fn>,
): Record<string, unknown> | null {
  const call = mockFetch.mock.calls.find(
    ([url]: [unknown]) =>
      typeof url === "string" && url.endsWith("/api/pixel/event"),
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

/** Short delay to let the fire-and-forget fetch() promise settle. */
const settle = () => new Promise<void>((r) => setTimeout(r, 30));

// ---------------------------------------------------------------------------
// Suite: pixel NOT initialised (no env var → PIXEL_ID_LB is undefined)
// ---------------------------------------------------------------------------

describe("trackFbEvent — pixel not initialised", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    // Actively override any real env vars so the module loads with no pixel IDs.
    // The real VITE_FB_PIXEL_ID_LB / VITE_FB_PIXEL_ID_AE Replit secrets may be
    // set in the container, so we can't rely on simply "not stubbing" them.
    vi.stubEnv("VITE_FB_PIXEL_ID_LB", "");
    vi.stubEnv("VITE_FB_PIXEL_ID_AE", "");
    mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("does not send any request when initPixel was never called", async () => {
    const { trackFbEvent } = await import("@/lib/fbPixel");

    trackFbEvent("Purchase", { value: 50, currency: "USD", event_id: "e1" });
    await settle();

    expect(findPixelEventCall(mockFetch)).toBeNull();
  });

  it("does not send any request when initPixel is called but the env var is absent", async () => {
    const { trackFbEvent, initPixel } = await import("@/lib/fbPixel");
    // PIXEL_ID_LB is "" (empty string) → falsy → activePixelId fails the
    // !activePixelId guard in postPixelEvent and no fetch is issued.
    initPixel("lb");

    trackFbEvent("Purchase", { value: 50, currency: "USD", event_id: "e2" });
    await settle();

    expect(findPixelEventCall(mockFetch)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite: pixel initialised via Lebanon env var
// ---------------------------------------------------------------------------

describe("trackFbEvent — pixel initialised (lb)", () => {
  const PIXEL_ID = "pixel-lb-test-999";
  let mockFetch: ReturnType<typeof vi.fn>;
  let trackFbEvent: (typeof import("@/lib/fbPixel"))["trackFbEvent"];
  let initPixel: (typeof import("@/lib/fbPixel"))["initPixel"];

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("VITE_FB_PIXEL_ID_LB", PIXEL_ID);
    mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", mockFetch);

    const mod = await import("@/lib/fbPixel");
    trackFbEvent = mod.trackFbEvent;
    initPixel = mod.initPixel;
    initPixel("lb");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  // -------------------------------------------------------------------------
  // POST target and headers
  // -------------------------------------------------------------------------

  it("sends the request to /api/pixel/event with POST method and JSON content-type", async () => {
    trackFbEvent("Purchase", { value: 50, currency: "USD" });
    await settle();

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/pixel/event",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Core payload fields
  // -------------------------------------------------------------------------

  it("includes eventName, pixelId, value, currency, and eventId in the POST body", async () => {
    trackFbEvent("Purchase", {
      value: 99.5,
      currency: "USD",
      event_id: "evt-core-001",
    });
    await settle();

    const body = findPixelEventCall(mockFetch);
    expect(body).not.toBeNull();
    expect(body).toMatchObject({
      eventName: "Purchase",
      pixelId: PIXEL_ID,
      value: 99.5,
      currency: "USD",
      eventId: "evt-core-001",
    });
  });

  it("includes fbp in every request body", async () => {
    trackFbEvent("Purchase", { value: 40, currency: "USD" });
    await settle();

    const body = findPixelEventCall(mockFetch);
    expect(body).not.toBeNull();
    expect(typeof body?.fbp).toBe("string");
    expect((body?.fbp as string).length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Signed-in path — userData.em present
  // -------------------------------------------------------------------------

  it("sends userData.em for a signed-in shopper", async () => {
    trackFbEvent("Purchase", {
      value: 80,
      currency: "USD",
      event_id: "evt-signedin-456",
      userData: { em: "jane@example.com" },
    });
    await settle();

    const body = findPixelEventCall(mockFetch);
    expect(body).not.toBeNull();
    expect(body?.userData).toEqual({ em: "jane@example.com" });
  });

  it("sends the correct event name alongside userData.em", async () => {
    trackFbEvent("Purchase", {
      value: 80,
      currency: "LBP",
      event_id: "evt-signedin-789",
      userData: { em: "ali@example.com" },
    });
    await settle();

    const body = findPixelEventCall(mockFetch);
    expect(body?.eventName).toBe("Purchase");
    expect((body?.userData as Record<string, unknown>)?.em).toBe(
      "ali@example.com",
    );
  });

  // -------------------------------------------------------------------------
  // Guest path — no userData field
  // -------------------------------------------------------------------------

  it("omits userData entirely for a guest shopper (no em provided)", async () => {
    trackFbEvent("Purchase", {
      value: 60,
      currency: "USD",
      event_id: "evt-guest-789",
    });
    await settle();

    const body = findPixelEventCall(mockFetch);
    expect(body).not.toBeNull();
    expect(body).not.toHaveProperty("userData");
  });

  it("omits userData when userData object is provided but em is absent", async () => {
    trackFbEvent("Purchase", {
      value: 60,
      currency: "USD",
      event_id: "evt-guest-no-em",
      userData: {},
    });
    await settle();

    const body = findPixelEventCall(mockFetch);
    expect(body).not.toBeNull();
    expect(body).not.toHaveProperty("userData");
  });

  // -------------------------------------------------------------------------
  // Optional fields — only present when provided
  // -------------------------------------------------------------------------

  it("omits value and currency when not provided", async () => {
    trackFbEvent("PageView");
    await settle();

    const body = findPixelEventCall(mockFetch);
    expect(body).not.toBeNull();
    expect(body).not.toHaveProperty("value");
    expect(body).not.toHaveProperty("currency");
  });

  it("omits eventId when event_id is not provided", async () => {
    trackFbEvent("Purchase", { value: 50, currency: "USD" });
    await settle();

    const body = findPixelEventCall(mockFetch);
    expect(body).not.toBeNull();
    expect(body).not.toHaveProperty("eventId");
  });

  it("includes contentIds when content_ids are provided", async () => {
    trackFbEvent("Purchase", {
      value: 120,
      currency: "USD",
      content_ids: ["sku-001", "sku-002"],
    });
    await settle();

    const body = findPixelEventCall(mockFetch);
    expect(body?.contentIds).toEqual(["sku-001", "sku-002"]);
  });

  it("includes numItems when num_items is provided", async () => {
    trackFbEvent("Purchase", {
      value: 120,
      currency: "USD",
      num_items: 3,
    });
    await settle();

    const body = findPixelEventCall(mockFetch);
    expect(body?.numItems).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Suite: pixel initialised via UAE env var
// ---------------------------------------------------------------------------

describe("trackFbEvent — pixel initialised (ae)", () => {
  const PIXEL_ID_AE = "pixel-ae-test-777";
  let mockFetch: ReturnType<typeof vi.fn>;
  let trackFbEvent: (typeof import("@/lib/fbPixel"))["trackFbEvent"];
  let initPixel: (typeof import("@/lib/fbPixel"))["initPixel"];

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("VITE_FB_PIXEL_ID_AE", PIXEL_ID_AE);
    mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", mockFetch);

    const mod = await import("@/lib/fbPixel");
    trackFbEvent = mod.trackFbEvent;
    initPixel = mod.initPixel;
    initPixel("ae");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("uses the UAE pixel ID when initialised for ae", async () => {
    trackFbEvent("Purchase", { value: 200, currency: "AED", event_id: "ae-evt-1" });
    await settle();

    const body = findPixelEventCall(mockFetch);
    expect(body?.pixelId).toBe(PIXEL_ID_AE);
  });

  it("does not send a request when initPixel is called with a country that has no pixel", async () => {
    // Cyprus ("cy") has no pixel ID by design — pixelIdForCountry returns null
    // regardless of env vars, so this is always safe to use as the "no pixel"
    // slug even in an environment where the real LB/AE env vars are present.
    initPixel("cy");

    trackFbEvent("Purchase", { value: 50, currency: "USD" });
    await settle();

    expect(findPixelEventCall(mockFetch)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite: getFbclid() priority, format, and persistence
// ---------------------------------------------------------------------------

describe("getFbclid — URL param wins, formatted correctly, and persisted", () => {
  const PIXEL_ID = "pixel-lb-fbc-test";
  let mockFetch: ReturnType<typeof vi.fn>;
  let trackFbEvent: (typeof import("@/lib/fbPixel"))["trackFbEvent"];
  let initPixel: (typeof import("@/lib/fbPixel"))["initPixel"];

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("VITE_FB_PIXEL_ID_LB", PIXEL_ID);
    mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", mockFetch);
    // Clear localStorage between tests
    localStorage.clear();
    // Reset cookies
    document.cookie = "_fbc=; max-age=0; path=/";

    const mod = await import("@/lib/fbPixel");
    trackFbEvent = mod.trackFbEvent;
    initPixel = mod.initPixel;
    initPixel("lb");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    localStorage.clear();
    document.cookie = "_fbc=; max-age=0; path=/";
  });

  it("formats fbclid from URL as fb.1.<timestamp_ms>.<fbclid>", async () => {
    const fbclid = "AbCdEfG1234567";
    const before = Date.now();
    vi.stubGlobal("window", {
      ...window,
      location: { search: `?fbclid=${fbclid}`, href: `https://presentail.com/?fbclid=${fbclid}` },
    });

    trackFbEvent("PageView");
    await settle();

    const body = findPixelEventCall(mockFetch);
    expect(body).not.toBeNull();
    const fbc = body?.fbclid as string;
    expect(typeof fbc).toBe("string");
    // Must match fb.1.<number>.<fbclid>
    const parts = fbc.split(".");
    expect(parts[0]).toBe("fb");
    expect(parts[1]).toBe("1");
    const ts = Number(parts[2]);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(Date.now() + 100);
    expect(parts[3]).toBe(fbclid);
  });

  it("URL fbclid wins over a stale _fbc cookie", async () => {
    const staleCookie = "fb.1.1000000000000.stale_click_id";
    document.cookie = `_fbc=${staleCookie}; path=/`;

    const freshFbclid = "FreshClickId999";
    vi.stubGlobal("window", {
      ...window,
      location: { search: `?fbclid=${freshFbclid}`, href: `https://presentail.com/?fbclid=${freshFbclid}` },
    });

    trackFbEvent("PageView");
    await settle();

    const body = findPixelEventCall(mockFetch);
    expect(body).not.toBeNull();
    const fbc = body?.fbclid as string;
    expect(fbc).not.toBe(staleCookie);
    expect(fbc).toMatch(/^fb\.1\.\d+\.FreshClickId999$/);
  });

  it("URL fbclid overwrites a stale localStorage value", async () => {
    localStorage.setItem("_fbc_from_url", "fb.1.1000000000000.old_click_id");

    const freshFbclid = "NewClickId777";
    vi.stubGlobal("window", {
      ...window,
      location: { search: `?fbclid=${freshFbclid}`, href: `https://presentail.com/?fbclid=${freshFbclid}` },
    });

    trackFbEvent("PageView");
    await settle();

    const body = findPixelEventCall(mockFetch);
    const fbc = body?.fbclid as string;
    expect(fbc).toMatch(/^fb\.1\.\d+\.NewClickId777$/);
    // localStorage should now have the new value
    expect(localStorage.getItem("_fbc_from_url")).toMatch(/^fb\.1\.\d+\.NewClickId777$/);
  });

  it("persists fbclid to localStorage so subsequent events carry it", async () => {
    const fbclid = "PersistMe123";
    vi.stubGlobal("window", {
      ...window,
      location: { search: `?fbclid=${fbclid}`, href: `https://presentail.com/?fbclid=${fbclid}` },
    });

    // First event (URL has fbclid)
    trackFbEvent("PageView");
    await settle();
    const firstBody = findPixelEventCall(mockFetch);
    expect(firstBody?.fbclid).toMatch(/^fb\.1\.\d+\.PersistMe123$/);

    mockFetch.mockClear();

    // Simulate navigation to a new page with no fbclid in the URL
    vi.stubGlobal("window", {
      ...window,
      location: { search: "", href: "https://presentail.com/product/flowers" },
    });

    // Second event — should use the persisted localStorage value
    trackFbEvent("ViewContent");
    await settle();
    const secondBody = findPixelEventCall(mockFetch);
    expect(secondBody).not.toBeNull();
    expect(secondBody?.fbclid).toMatch(/^fb\.1\.\d+\.PersistMe123$/);
  });

  it("falls back to _fbc cookie when no URL fbclid and no localStorage entry", async () => {
    const cookieFbc = "fb.1.1700000000000.cookie_click_id";
    document.cookie = `_fbc=${cookieFbc}; path=/`;

    vi.stubGlobal("window", {
      ...window,
      location: { search: "", href: "https://presentail.com/" },
    });

    trackFbEvent("PageView");
    await settle();

    const body = findPixelEventCall(mockFetch);
    expect(body?.fbclid).toBe(cookieFbc);
  });

  it("falls back to persisted localStorage when no URL fbclid and no cookie", async () => {
    const storedFbc = "fb.1.1700000000000.stored_click_id";
    localStorage.setItem("_fbc_from_url", storedFbc);

    vi.stubGlobal("window", {
      ...window,
      location: { search: "", href: "https://presentail.com/" },
    });

    trackFbEvent("PageView");
    await settle();

    const body = findPixelEventCall(mockFetch);
    expect(body?.fbclid).toBe(storedFbc);
  });

  it("omits fbclid when no URL param, no cookie, and no localStorage entry", async () => {
    vi.stubGlobal("window", {
      ...window,
      location: { search: "", href: "https://presentail.com/" },
    });

    trackFbEvent("PageView");
    await settle();

    const body = findPixelEventCall(mockFetch);
    expect(body).not.toBeNull();
    expect(body).not.toHaveProperty("fbclid");
  });
});
