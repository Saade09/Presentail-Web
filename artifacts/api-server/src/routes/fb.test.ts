import { createHash } from "crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FbMobileEventBodySchema } from "./fb";
import { sendCapiEvent, sendCapiEventByPixelId } from "../lib/fbConversions";

describe("FbMobileEventBodySchema validation", () => {
  it("accepts a valid ViewContent event", () => {
    const result = FbMobileEventBodySchema.safeParse({
      event: "ViewContent",
      countryCode: "LB",
      contentIds: ["product-abc"],
      contentName: "Beautiful Rose Bouquet",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid AddToCart event with all fields", () => {
    const result = FbMobileEventBodySchema.safeParse({
      event: "AddToCart",
      countryCode: "LB",
      value: 45.0,
      currency: "USD",
      contentIds: ["bouquet-1", "balloon-2"],
      email: "shopper@example.com",
      phone: "+961701234567",
    });
    expect(result.success).toBe(true);
  });

  it("accepts AddToCart and InitiateCheckout event names", () => {
    expect(FbMobileEventBodySchema.safeParse({ event: "AddToCart", countryCode: "AE" }).success).toBe(true);
    expect(FbMobileEventBodySchema.safeParse({ event: "InitiateCheckout", countryCode: "LB" }).success).toBe(true);
  });

  it("rejects unknown event names (returns 400 equivalent)", () => {
    const result = FbMobileEventBodySchema.safeParse({
      event: "UnknownEvent",
      countryCode: "LB",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing event field", () => {
    expect(FbMobileEventBodySchema.safeParse({ countryCode: "LB" }).success).toBe(false);
  });

  it("rejects missing countryCode field", () => {
    expect(FbMobileEventBodySchema.safeParse({ event: "Purchase" }).success).toBe(false);
  });
});

describe("sendCapiEvent", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue({ ok: true } as Response);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete process.env.VITE_FB_PIXEL_ID_LB;
    delete process.env.FB_CONVERSIONS_TOKEN_LB;
    delete process.env.VITE_FB_PIXEL_ID_AE;
    delete process.env.FB_CONVERSIONS_TOKEN_AE;
  });

  it("calls the Facebook CAPI endpoint for a valid LB Purchase event", async () => {
    process.env.VITE_FB_PIXEL_ID_LB = "1234567890";
    process.env.FB_CONVERSIONS_TOKEN_LB = "test-token-lb";

    await sendCapiEvent({
      eventName: "Purchase",
      countryCode: "LB",
      value: 45.0,
      currency: "USD",
      contentIds: ["bouquet-1"],
      userData: { email: "test@example.com" },
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("1234567890");
    expect(url).toContain("graph.facebook.com");
    const body = JSON.parse(options.body as string) as {
      data: Array<{
        event_name: string;
        action_source: string;
        custom_data: Record<string, unknown>;
        user_data: Record<string, string>;
      }>;
    };
    expect(body.data[0].event_name).toBe("Purchase");
    expect(body.data[0].action_source).toBe("website");
    expect(body.data[0].custom_data.value).toBe(45.0);
    expect(body.data[0].custom_data.currency).toBe("USD");
    expect(body.data[0].custom_data.content_ids).toEqual(["bouquet-1"]);
    expect(typeof body.data[0].user_data.em).toBe("string");
    expect(body.data[0].user_data.em).not.toBe("test@example.com");
    expect(body.data[0].user_data.em.length).toBe(64);
  });

  it("is a silent no-op for CY country code (no pixel configured)", async () => {
    await sendCapiEvent({
      eventName: "Purchase",
      countryCode: "CY",
      value: 50.0,
      currency: "EUR",
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("is a silent no-op for CY even when LB env vars are set", async () => {
    process.env.VITE_FB_PIXEL_ID_LB = "1234567890";
    process.env.FB_CONVERSIONS_TOKEN_LB = "test-token-lb";

    await sendCapiEvent({
      eventName: "ViewContent",
      countryCode: "CY",
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("is a silent no-op when pixel env vars are missing for LB", async () => {
    await sendCapiEvent({
      eventName: "Purchase",
      countryCode: "LB",
      value: 30.0,
      currency: "USD",
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("is a silent no-op when only pixel ID is set but token is missing", async () => {
    process.env.VITE_FB_PIXEL_ID_LB = "1234567890";
    // No FB_CONVERSIONS_TOKEN_LB

    await sendCapiEvent({ eventName: "InitiateCheckout", countryCode: "LB" });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("calls CAPI for AE country code with AE pixel", async () => {
    process.env.VITE_FB_PIXEL_ID_AE = "9876543210";
    process.env.FB_CONVERSIONS_TOKEN_AE = "test-token-ae";

    await sendCapiEvent({
      eventName: "AddToCart",
      countryCode: "AE",
      contentIds: ["product-x"],
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("9876543210");
  });

  it("hashes phone by stripping non-digit characters before hashing", async () => {
    process.env.VITE_FB_PIXEL_ID_LB = "1234567890";
    process.env.FB_CONVERSIONS_TOKEN_LB = "test-token-lb";

    await sendCapiEvent({
      eventName: "Purchase",
      countryCode: "LB",
      value: 20,
      currency: "USD",
      userData: { phone: "+961 71 123 456" },
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      data: Array<{ user_data: Record<string, string> }>;
    };
    expect(typeof body.data[0].user_data.ph).toBe("string");
    expect(body.data[0].user_data.ph.length).toBe(64);
  });

  it("is a silent no-op for unknown/null country codes", async () => {
    process.env.VITE_FB_PIXEL_ID_LB = "1234567890";
    process.env.FB_CONVERSIONS_TOKEN_LB = "test-token-lb";

    await sendCapiEvent({ eventName: "ViewContent", countryCode: null });
    await sendCapiEvent({ eventName: "ViewContent", countryCode: "" });
    await sendCapiEvent({ eventName: "ViewContent", countryCode: "US" });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("defaults action_source to 'website' to preserve web purchase dedup semantics", async () => {
    process.env.VITE_FB_PIXEL_ID_LB = "1234567890";
    process.env.FB_CONVERSIONS_TOKEN_LB = "test-token-lb";

    await sendCapiEvent({ eventName: "Purchase", countryCode: "LB", value: 50, currency: "USD" });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      data: Array<{ action_source: string }>;
    };
    expect(body.data[0].action_source).toBe("website");
  });

  it("uses 'app' action_source when explicitly passed (mobile route path)", async () => {
    process.env.VITE_FB_PIXEL_ID_LB = "1234567890";
    process.env.FB_CONVERSIONS_TOKEN_LB = "test-token-lb";

    await sendCapiEvent({
      eventName: "Purchase",
      countryCode: "LB",
      value: 50,
      currency: "USD",
      actionSource: "app",
    });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      data: Array<{ action_source: string }>;
    };
    expect(body.data[0].action_source).toBe("app");
  });

  it("sends the exact SHA-256 hash of the trimmed, lowercased email in user_data.em", async () => {
    process.env.VITE_FB_PIXEL_ID_LB = "1234567890";
    process.env.FB_CONVERSIONS_TOKEN_LB = "test-token-lb";

    await sendCapiEvent({
      eventName: "Purchase",
      countryCode: "LB",
      value: 45.0,
      currency: "USD",
      userData: { email: "  Test@Example.COM  " },
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      data: Array<{ user_data: Record<string, string> }>;
    };
    const expectedHash = createHash("sha256").update("test@example.com").digest("hex");
    expect(body.data[0].user_data.em).toBe(expectedHash);
    expect(body.data[0].user_data.em).not.toContain("@");
  });

  it("fires successfully for a guest Purchase with no email or phone (guest path)", async () => {
    process.env.VITE_FB_PIXEL_ID_LB = "1234567890";
    process.env.FB_CONVERSIONS_TOKEN_LB = "test-token-lb";

    await sendCapiEvent({
      eventName: "Purchase",
      countryCode: "LB",
      value: 75.0,
      currency: "USD",
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      data: Array<{ user_data: Record<string, string>; event_name: string }>;
    };
    expect(body.data[0].event_name).toBe("Purchase");
    expect(body.data[0].user_data.em).toBeUndefined();
    expect(body.data[0].user_data.ph).toBeUndefined();
  });
});

describe("Deduplication: concurrent mobile + web Purchase events with shared eventId", () => {
  const mockFetch = vi.fn();
  const PIXEL_ID = "1234567890";
  const TOKEN = "test-token-lb";

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue({ ok: true } as Response);
    process.env.VITE_FB_PIXEL_ID_LB = PIXEL_ID;
    process.env.FB_CONVERSIONS_TOKEN_LB = TOKEN;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete process.env.VITE_FB_PIXEL_ID_LB;
    delete process.env.FB_CONVERSIONS_TOKEN_LB;
  });

  it("sends the same event_id to Meta when both routes fire concurrently with the same eventId", async () => {
    const sharedEventId = "dedup-purchase-abc123";

    // Fire both routes concurrently, as they would be in a real dual-signal purchase.
    // Mobile route uses sendCapiEvent (countryCode-keyed, action_source=app).
    // Web route uses sendCapiEventByPixelId (pixelId-keyed, action_source=website).
    await Promise.all([
      sendCapiEvent({
        eventName: "Purchase",
        countryCode: "LB",
        value: 50,
        currency: "USD",
        eventId: sharedEventId,
        actionSource: "app",
      }),
      sendCapiEventByPixelId({
        eventName: "Purchase",
        pixelId: PIXEL_ID,
        value: 50,
        currency: "USD",
        eventId: sharedEventId,
      }),
    ]);

    // Both routes must reach Meta (two separate fetch calls, one per route).
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Extract the event_id from each CAPI payload and confirm they are identical.
    const payloads = mockFetch.mock.calls.map(([, options]: [string, RequestInit]) => {
      const body = JSON.parse(options.body as string) as {
        data: Array<{ event_id: string; action_source: string }>;
      };
      return body.data[0];
    });

    expect(payloads[0].event_id).toBe(sharedEventId);
    expect(payloads[1].event_id).toBe(sharedEventId);
    expect(payloads[0].event_id).toBe(payloads[1].event_id);
  });

  it("each route independently reaches Meta (two calls) — no event is silently dropped", async () => {
    const sharedEventId = "dedup-view-xyz";

    await Promise.all([
      sendCapiEvent({
        eventName: "InitiateCheckout",
        countryCode: "LB",
        eventId: sharedEventId,
        actionSource: "app",
      }),
      sendCapiEventByPixelId({
        eventName: "InitiateCheckout",
        pixelId: PIXEL_ID,
        eventId: sharedEventId,
      }),
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const eventIds = mockFetch.mock.calls.map(([, options]: [string, RequestInit]) => {
      const body = JSON.parse(options.body as string) as {
        data: Array<{ event_id: string }>;
      };
      return body.data[0].event_id;
    });
    expect(new Set(eventIds).size).toBe(1);
    expect(eventIds[0]).toBe(sharedEventId);
  });

  it("action_source distinguishes app vs website events while event_id stays the same", async () => {
    const sharedEventId = "dedup-source-check";

    await Promise.all([
      sendCapiEvent({
        eventName: "Purchase",
        countryCode: "LB",
        value: 75,
        currency: "USD",
        eventId: sharedEventId,
        actionSource: "app",
      }),
      sendCapiEventByPixelId({
        eventName: "Purchase",
        pixelId: PIXEL_ID,
        value: 75,
        currency: "USD",
        eventId: sharedEventId,
      }),
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(2);

    const payloads = mockFetch.mock.calls.map(([, options]: [string, RequestInit]) => {
      const body = JSON.parse(options.body as string) as {
        data: Array<{ event_id: string; action_source: string }>;
      };
      return body.data[0];
    });

    // Both events carry the same event_id so Meta can deduplicate them.
    expect(payloads[0].event_id).toBe(sharedEventId);
    expect(payloads[1].event_id).toBe(sharedEventId);

    // The two events differ only in action_source, allowing Meta to identify the origin.
    const sources = new Set(payloads.map((p) => p.action_source));
    expect(sources).toContain("app");
    expect(sources).toContain("website");
  });
});

describe("sendCapiEvent — client_ip_address and client_user_agent", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue({ ok: true } as Response);
    process.env.VITE_FB_PIXEL_ID_LB = "1234567890";
    process.env.FB_CONVERSIONS_TOKEN_LB = "test-token-lb";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete process.env.VITE_FB_PIXEL_ID_LB;
    delete process.env.FB_CONVERSIONS_TOKEN_LB;
  });

  it("includes client_ip_address raw (not hashed) in user_data when provided", async () => {
    await sendCapiEvent({
      eventName: "PageView",
      countryCode: "LB",
      userData: { clientIpAddress: "203.0.113.5" },
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      data: Array<{ user_data: Record<string, string> }>;
    };
    expect(body.data[0].user_data.client_ip_address).toBe("203.0.113.5");
  });

  it("includes client_user_agent raw (not hashed) in user_data when provided", async () => {
    await sendCapiEvent({
      eventName: "PageView",
      countryCode: "LB",
      userData: { clientUserAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" },
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      data: Array<{ user_data: Record<string, string> }>;
    };
    expect(body.data[0].user_data.client_user_agent).toBe(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)",
    );
  });

  it("includes both client_ip_address and client_user_agent when both are provided", async () => {
    await sendCapiEvent({
      eventName: "PageView",
      countryCode: "LB",
      userData: {
        clientIpAddress: "198.51.100.7",
        clientUserAgent: "TestAgent/2.0",
      },
    });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      data: Array<{ user_data: Record<string, string> }>;
    };
    expect(body.data[0].user_data.client_ip_address).toBe("198.51.100.7");
    expect(body.data[0].user_data.client_user_agent).toBe("TestAgent/2.0");
  });

  it("omits client_ip_address when not provided (no empty-string sentinel)", async () => {
    await sendCapiEvent({
      eventName: "PageView",
      countryCode: "LB",
      userData: { email: "test@example.com" },
    });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      data: Array<{ user_data: Record<string, string> }>;
    };
    expect(body.data[0].user_data.client_ip_address).toBeUndefined();
  });

  it("omits client_user_agent when not provided — no empty-string sentinel in payload", async () => {
    await sendCapiEvent({
      eventName: "PageView",
      countryCode: "LB",
    });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      data: Array<{ user_data: Record<string, string> }>;
    };
    expect(body.data[0].user_data.client_user_agent).toBeUndefined();
  });

  it("includes client_ip_address alongside hashed email in the same payload", async () => {
    await sendCapiEvent({
      eventName: "Purchase",
      countryCode: "LB",
      value: 50,
      currency: "USD",
      userData: {
        email: "buyer@example.com",
        clientIpAddress: "203.0.113.99",
        clientUserAgent: "Safari/17.0",
      },
    });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      data: Array<{ user_data: Record<string, string> }>;
    };
    // Hashed fields must not contain the raw value.
    expect(body.data[0].user_data.em).not.toContain("@");
    expect(body.data[0].user_data.em.length).toBe(64);
    // Raw fields must contain the exact value.
    expect(body.data[0].user_data.client_ip_address).toBe("203.0.113.99");
    expect(body.data[0].user_data.client_user_agent).toBe("Safari/17.0");
  });

  it("supports IPv6 client_ip_address without modification", async () => {
    await sendCapiEvent({
      eventName: "PageView",
      countryCode: "LB",
      userData: { clientIpAddress: "2001:db8::1" },
    });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      data: Array<{ user_data: Record<string, string> }>;
    };
    expect(body.data[0].user_data.client_ip_address).toBe("2001:db8::1");
  });
});

describe("sendCapiEvent — phone normalisation with country dial code (E.164)", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue({ ok: true } as Response);
    process.env.VITE_FB_PIXEL_ID_LB = "1234567890";
    process.env.FB_CONVERSIONS_TOKEN_LB = "test-token-lb";
    process.env.VITE_FB_PIXEL_ID_AE = "9876543210";
    process.env.FB_CONVERSIONS_TOKEN_AE = "test-token-ae";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete process.env.VITE_FB_PIXEL_ID_LB;
    delete process.env.FB_CONVERSIONS_TOKEN_LB;
    delete process.env.VITE_FB_PIXEL_ID_AE;
    delete process.env.FB_CONVERSIONS_TOKEN_AE;
  });

  it("normalises a Lebanese local number (70xxxxxx) to 96170xxxxxx before hashing", async () => {
    await sendCapiEvent({
      eventName: "Purchase",
      countryCode: "LB",
      value: 20,
      currency: "USD",
      userData: { phone: "70123456" },
    });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      data: Array<{ user_data: Record<string, string> }>;
    };
    const expectedHash = createHash("sha256").update("96170123456").digest("hex");
    expect(body.data[0].user_data.ph).toBe(expectedHash);
  });

  it("normalises a Lebanese number with national prefix 0 (03xxxxxx) by stripping the 0 and prepending 961", async () => {
    await sendCapiEvent({
      eventName: "Purchase",
      countryCode: "LB",
      value: 20,
      currency: "USD",
      userData: { phone: "03123456" },
    });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      data: Array<{ user_data: Record<string, string> }>;
    };
    const expectedHash = createHash("sha256").update("9613123456").digest("hex");
    expect(body.data[0].user_data.ph).toBe(expectedHash);
  });

  it("normalises a UAE local number (050xxxxxxx) to 97150xxxxxxx", async () => {
    await sendCapiEvent({
      eventName: "Purchase",
      countryCode: "AE",
      value: 200,
      currency: "AED",
      userData: { phone: "0501234567" },
    });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      data: Array<{ user_data: Record<string, string> }>;
    };
    const expectedHash = createHash("sha256").update("971501234567").digest("hex");
    expect(body.data[0].user_data.ph).toBe(expectedHash);
  });

  it("preserves an already-international phone (+961 71 123 456 → 96171123456) — existing behaviour", async () => {
    await sendCapiEvent({
      eventName: "Purchase",
      countryCode: "LB",
      value: 20,
      currency: "USD",
      userData: { phone: "+961 71 123 456" },
    });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      data: Array<{ user_data: Record<string, string> }>;
    };
    const expectedHash = createHash("sha256").update("96171123456").digest("hex");
    expect(body.data[0].user_data.ph).toBe(expectedHash);
  });
});

describe("sendCapiEvent — additional matching fields (fn, ln, city, country, external_id)", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue({ ok: true } as Response);
    process.env.VITE_FB_PIXEL_ID_LB = "1234567890";
    process.env.FB_CONVERSIONS_TOKEN_LB = "test-token-lb";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete process.env.VITE_FB_PIXEL_ID_LB;
    delete process.env.FB_CONVERSIONS_TOKEN_LB;
  });

  it("hashes firstName as fn and lastName as ln", async () => {
    await sendCapiEvent({
      eventName: "Purchase",
      countryCode: "LB",
      value: 50,
      currency: "USD",
      userData: { firstName: "Ali", lastName: "Hassan" },
    });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      data: Array<{ user_data: Record<string, string> }>;
    };
    const fnHash = createHash("sha256").update("ali").digest("hex");
    const lnHash = createHash("sha256").update("hassan").digest("hex");
    expect(body.data[0].user_data.fn).toBe(fnHash);
    expect(body.data[0].user_data.ln).toBe(lnHash);
  });

  it("hashes externalId as external_id", async () => {
    await sendCapiEvent({
      eventName: "Purchase",
      countryCode: "LB",
      value: 50,
      currency: "USD",
      userData: { externalId: "customer-42" },
    });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      data: Array<{ user_data: Record<string, string> }>;
    };
    const expectedHash = createHash("sha256").update("customer-42").digest("hex");
    expect(body.data[0].user_data.external_id).toBe(expectedHash);
  });

  it("hashes city as ct and country as country", async () => {
    await sendCapiEvent({
      eventName: "Purchase",
      countryCode: "LB",
      value: 50,
      currency: "USD",
      userData: { city: "Beirut", country: "lb" },
    });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      data: Array<{ user_data: Record<string, string> }>;
    };
    const ctHash = createHash("sha256").update("beirut").digest("hex");
    const countryHash = createHash("sha256").update("lb").digest("hex");
    expect(body.data[0].user_data.ct).toBe(ctHash);
    expect(body.data[0].user_data.country).toBe(countryHash);
  });
});

describe("sendCapiEventByPixelId (POST /api/pixel/event path)", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue({ ok: true } as Response);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete process.env.VITE_FB_PIXEL_ID_LB;
    delete process.env.FB_CONVERSIONS_TOKEN_LB;
    delete process.env.VITE_FB_PIXEL_ID_AE;
    delete process.env.FB_CONVERSIONS_TOKEN_AE;
  });

  it("sends the exact SHA-256 hash of the normalised email in user_data.em for a Purchase event", async () => {
    process.env.VITE_FB_PIXEL_ID_LB = "1234567890";
    process.env.FB_CONVERSIONS_TOKEN_LB = "test-token-lb";

    await sendCapiEventByPixelId({
      eventName: "Purchase",
      pixelId: "1234567890",
      value: 99.0,
      currency: "USD",
      userData: { email: "  Shopper@Example.COM  " },
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("1234567890");
    const body = JSON.parse(options.body as string) as {
      data: Array<{ user_data: Record<string, string>; event_name: string }>;
    };
    const expectedHash = createHash("sha256").update("shopper@example.com").digest("hex");
    expect(body.data[0].event_name).toBe("Purchase");
    expect(body.data[0].user_data.em).toBe(expectedHash);
    expect(body.data[0].user_data.em).not.toContain("@");
    expect(body.data[0].user_data.em.length).toBe(64);
  });

  it("fires successfully for a guest Purchase with no email (guest path, web/pixel route)", async () => {
    process.env.VITE_FB_PIXEL_ID_LB = "1234567890";
    process.env.FB_CONVERSIONS_TOKEN_LB = "test-token-lb";

    await sendCapiEventByPixelId({
      eventName: "Purchase",
      pixelId: "1234567890",
      value: 55.0,
      currency: "USD",
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      data: Array<{ user_data: Record<string, string>; event_name: string }>;
    };
    expect(body.data[0].event_name).toBe("Purchase");
    expect(body.data[0].user_data.em).toBeUndefined();
  });

  it("is a silent no-op when the pixelId is unrecognised", async () => {
    process.env.VITE_FB_PIXEL_ID_LB = "1234567890";
    process.env.FB_CONVERSIONS_TOKEN_LB = "test-token-lb";

    await sendCapiEventByPixelId({
      eventName: "Purchase",
      pixelId: "unknown-pixel",
      value: 50.0,
      currency: "USD",
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("forwards the caller-supplied eventId to the Meta API payload (deduplication key)", async () => {
    process.env.VITE_FB_PIXEL_ID_LB = "1234567890";
    process.env.FB_CONVERSIONS_TOKEN_LB = "test-token-lb";

    await sendCapiEventByPixelId({
      eventName: "Purchase",
      pixelId: "1234567890",
      value: 80.0,
      currency: "USD",
      eventId: "dedup-id-xyz",
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      data: Array<{ event_id: string }>;
    };
    expect(body.data[0].event_id).toBe("dedup-id-xyz");
  });
});

