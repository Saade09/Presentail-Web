import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Route-level deduplication tests: POST /api/fb/events (mobile) + POST /api/pixel/event (web)
//
// Meta's Conversions API deduplication relies on both signals carrying the
// same event_id. These tests verify the full stack: HTTP request body →
// route handler → fbConversions lib → fetch payload that reaches Meta.
// No mocking of fbConversions — the real lib runs; only global fetch is
// stubbed to capture the outbound CAPI payloads without hitting the network.
// ---------------------------------------------------------------------------

describe("Deduplication end-to-end: /api/fb/events (mobile) + /api/pixel/event (web)", () => {
  const mockFetch = vi.fn();
  const PIXEL_ID = "1234567890";

  let app: ReturnType<typeof express>;

  beforeEach(async () => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue({ ok: true } as Response);

    process.env.VITE_FB_PIXEL_ID_LB = PIXEL_ID;
    process.env.FB_CONVERSIONS_TOKEN_LB = "test-token-lb";

    // Import the router after env vars are set so the lib picks them up.
    // vi.resetModules() is not called here intentionally — the env vars are
    // read at call-time (inside sendCapiEvent/sendCapiEventByPixelId), not at
    // module load time, so a fresh import is not required.
    const fbRouter = (await import("./fb")).default;
    app = express();
    app.use(express.json());
    app.use(fbRouter);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete process.env.VITE_FB_PIXEL_ID_LB;
    delete process.env.FB_CONVERSIONS_TOKEN_LB;
  });

  it("sends the same event_id to Meta when both routes fire concurrently with the same eventId", async () => {
    const sharedEventId = "dedup-route-purchase-abc123";

    // Fire both routes concurrently, mirroring a real dual-signal checkout where
    // the mobile app fires /fb/events and the web client fires /pixel/event.
    const [mobileRes, webRes] = await Promise.all([
      request(app).post("/fb/events").send({
        event: "Purchase",
        countryCode: "LB",
        eventId: sharedEventId,
        value: 50,
        currency: "USD",
        contentIds: ["bouquet-1"],
      }),
      request(app).post("/pixel/event").send({
        eventName: "Purchase",
        pixelId: PIXEL_ID,
        eventId: sharedEventId,
        value: 50,
        currency: "USD",
        contentIds: ["bouquet-1"],
      }),
    ]);

    // Both routes must respond 200 (fire-and-forget pattern — errors are logged, not propagated).
    expect(mobileRes.status).toBe(200);
    expect(webRes.status).toBe(200);

    // Wait briefly for the async void CAPI calls in both handlers to settle.
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Both routes must have forwarded their event to Meta (two fetch calls).
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Extract the event_id from each outbound CAPI payload.
    const payloads = mockFetch.mock.calls.map(([, options]: [string, RequestInit]) => {
      const body = JSON.parse(options.body as string) as {
        data: Array<{ event_id: string; action_source: string; event_name: string }>;
      };
      return body.data[0];
    });

    // The core deduplication guarantee: both payloads carry the same event_id.
    expect(payloads[0].event_id).toBe(sharedEventId);
    expect(payloads[1].event_id).toBe(sharedEventId);
    expect(payloads[0].event_id).toBe(payloads[1].event_id);
  });

  it("mobile route sends action_source=app and web route sends action_source=website with the same event_id", async () => {
    const sharedEventId = "dedup-route-source-check";

    await Promise.all([
      request(app).post("/fb/events").send({
        event: "Purchase",
        countryCode: "LB",
        eventId: sharedEventId,
        value: 75,
        currency: "USD",
      }),
      request(app).post("/pixel/event").send({
        eventName: "Purchase",
        pixelId: PIXEL_ID,
        eventId: sharedEventId,
        value: 75,
        currency: "USD",
      }),
    ]);

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockFetch).toHaveBeenCalledTimes(2);

    const payloads = mockFetch.mock.calls.map(([, options]: [string, RequestInit]) => {
      const body = JSON.parse(options.body as string) as {
        data: Array<{ event_id: string; action_source: string }>;
      };
      return body.data[0];
    });

    // Both events share the same event_id so Meta can deduplicate them.
    expect(payloads[0].event_id).toBe(sharedEventId);
    expect(payloads[1].event_id).toBe(sharedEventId);

    // The two signals differ only in action_source, allowing Meta to identify origin.
    const sources = new Set(payloads.map((p) => p.action_source));
    expect(sources).toContain("app");
    expect(sources).toContain("website");
  });

  it("mobile route without an eventId still reaches Meta (event_id is auto-generated, not empty)", async () => {
    const [mobileRes] = await Promise.all([
      request(app).post("/fb/events").send({
        event: "Purchase",
        countryCode: "LB",
        value: 30,
        currency: "USD",
      }),
    ]);

    expect(mobileRes.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      data: Array<{ event_id: string }>;
    };
    expect(typeof body.data[0].event_id).toBe("string");
    expect(body.data[0].event_id.length).toBeGreaterThan(0);
  });

  it("web route forwards eventId from request body to the Meta CAPI payload (route → lib → fetch chain)", async () => {
    const explicitEventId = "route-level-dedup-xyz";

    const res = await request(app).post("/pixel/event").send({
      eventName: "Purchase",
      pixelId: PIXEL_ID,
      eventId: explicitEventId,
      value: 99,
      currency: "USD",
    });

    expect(res.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      data: Array<{ event_id: string }>;
    };
    expect(body.data[0].event_id).toBe(explicitEventId);
  });

  it("mobile route forwards eventId from request body to the Meta CAPI payload (route → lib → fetch chain)", async () => {
    const explicitEventId = "mobile-route-level-dedup-xyz";

    const res = await request(app).post("/fb/events").send({
      event: "Purchase",
      countryCode: "LB",
      eventId: explicitEventId,
      value: 45,
      currency: "USD",
    });

    expect(res.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      data: Array<{ event_id: string; action_source: string }>;
    };
    expect(body.data[0].event_id).toBe(explicitEventId);
    expect(body.data[0].action_source).toBe("app");
  });
});
