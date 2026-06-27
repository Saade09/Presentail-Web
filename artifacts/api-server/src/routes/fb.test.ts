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

  it("accepts a valid Purchase event with all fields", () => {
    const result = FbMobileEventBodySchema.safeParse({
      event: "Purchase",
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
});

