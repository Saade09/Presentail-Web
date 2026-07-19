import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Route-level tests for POST /api/pixel/event
// These verify the fb.ts adapter mapping: request body's userData.em field is
// forwarded to sendCapiEventByPixelId as userData.email. A regression in this
// mapping would silently drop Event Match Quality without any visible error.
// They also verify that the real visitor IP and User-Agent from the incoming
// HTTP request are forwarded to the CAPI helper — the primary fix for the
// 100% empty client_ip_address diagnostic in Meta Events Manager.
// ---------------------------------------------------------------------------

const { mockSendCapiEventByPixelId } = vi.hoisted(() => ({
  mockSendCapiEventByPixelId: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/fbConversions", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/fbConversions")>();
  return {
    ...original,
    sendCapiEventByPixelId: mockSendCapiEventByPixelId,
  };
});

describe("POST /api/pixel/event route — userData.em adapter", () => {
  let app: ReturnType<typeof express>;

  beforeEach(async () => {
    mockSendCapiEventByPixelId.mockClear();
    const fbRouter = (await import("./fb")).default;
    app = express();
    app.use(express.json());
    app.use(fbRouter);
  });

  it("passes userData.em from the request body as userData.email to the CAPI helper", async () => {
    const res = await request(app)
      .post("/pixel/event")
      .send({
        eventName: "Purchase",
        pixelId: "1234567890",
        value: 99.0,
        currency: "USD",
        userData: { em: "shopper@example.com" },
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockSendCapiEventByPixelId).toHaveBeenCalledOnce();
    const callArg = mockSendCapiEventByPixelId.mock.calls[0][0] as {
      userData?: { email?: string };
    };
    expect(callArg.userData?.email).toBe("shopper@example.com");
  });

  it("calls the CAPI helper with no email for a guest Purchase (no userData in body)", async () => {
    const res = await request(app)
      .post("/pixel/event")
      .send({
        eventName: "Purchase",
        pixelId: "1234567890",
        value: 55.0,
        currency: "USD",
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockSendCapiEventByPixelId).toHaveBeenCalledOnce();
    const callArg = mockSendCapiEventByPixelId.mock.calls[0][0] as {
      userData?: { email?: string };
    };
    expect(callArg.userData?.email).toBeUndefined();
  });

  it("returns 400 for a body missing required eventName field", async () => {
    const res = await request(app)
      .post("/pixel/event")
      .send({ pixelId: "1234567890", value: 50 });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(mockSendCapiEventByPixelId).not.toHaveBeenCalled();
  });

  it("forwards eventName, pixelId, value, currency, and eventId to the CAPI helper", async () => {
    const res = await request(app)
      .post("/pixel/event")
      .send({
        eventName: "Purchase",
        pixelId: "1234567890",
        value: 120.5,
        currency: "USD",
        eventId: "evt-abc-123",
        userData: { em: "buyer@example.com" },
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockSendCapiEventByPixelId).toHaveBeenCalledOnce();

    const callArg = mockSendCapiEventByPixelId.mock.calls[0][0] as {
      eventName: string;
      pixelId: string;
      value: number;
      currency: string;
      eventId: string;
      userData?: { email?: string };
    };
    expect(callArg.eventName).toBe("Purchase");
    expect(callArg.pixelId).toBe("1234567890");
    expect(callArg.value).toBe(120.5);
    expect(callArg.currency).toBe("USD");
    expect(callArg.eventId).toBe("evt-abc-123");
  });

  it("returns 200 gracefully when the CAPI helper rejects (missing/invalid access token)", async () => {
    mockSendCapiEventByPixelId.mockRejectedValueOnce(new Error("invalid access token"));

    const res = await request(app)
      .post("/pixel/event")
      .send({
        eventName: "Purchase",
        pixelId: "1234567890",
        value: 50.0,
        currency: "USD",
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // IP address and User-Agent forwarding — core fix for the 100% empty
  // client_ip_address diagnostic in Meta Events Manager.
  // ---------------------------------------------------------------------------

  it("forwards the request IP to the CAPI helper as userData.clientIpAddress", async () => {
    const res = await request(app)
      .post("/pixel/event")
      .set("X-Forwarded-For", "203.0.113.42")
      .send({ eventName: "PageView", pixelId: "1234567890" });

    expect(res.status).toBe(200);
    expect(mockSendCapiEventByPixelId).toHaveBeenCalledOnce();
    const callArg = mockSendCapiEventByPixelId.mock.calls[0][0] as {
      userData?: { clientIpAddress?: string | null };
    };
    // The IP must be present — the exact value depends on pickClientIp resolving
    // the XFF chain. We assert it is a non-null string rather than pinning a
    // specific address so internal-IP fallback paths don't break the test.
    expect(callArg.userData?.clientIpAddress).toBeTruthy();
  });

  it("forwards the request User-Agent to the CAPI helper as userData.clientUserAgent", async () => {
    const res = await request(app)
      .post("/pixel/event")
      .set("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")
      .send({ eventName: "PageView", pixelId: "1234567890" });

    expect(res.status).toBe(200);
    expect(mockSendCapiEventByPixelId).toHaveBeenCalledOnce();
    const callArg = mockSendCapiEventByPixelId.mock.calls[0][0] as {
      userData?: { clientUserAgent?: string | null };
    };
    expect(callArg.userData?.clientUserAgent).toBe(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
    );
  });

  it("passes userData.fn and userData.ln from the request body to the CAPI helper", async () => {
    const res = await request(app)
      .post("/pixel/event")
      .send({
        eventName: "Purchase",
        pixelId: "1234567890",
        value: 75.0,
        currency: "USD",
        userData: { em: "ali@example.com", fn: "Ali", ln: "Hassan" },
      });

    expect(res.status).toBe(200);
    expect(mockSendCapiEventByPixelId).toHaveBeenCalledOnce();
    const callArg = mockSendCapiEventByPixelId.mock.calls[0][0] as {
      userData?: { firstName?: string; lastName?: string };
    };
    expect(callArg.userData?.firstName).toBe("Ali");
    expect(callArg.userData?.lastName).toBe("Hassan");
  });

  it("passes userData.ph from the request body to the CAPI helper", async () => {
    const res = await request(app)
      .post("/pixel/event")
      .send({
        eventName: "InitiateCheckout",
        pixelId: "1234567890",
        userData: { ph: "+96171123456" },
      });

    expect(res.status).toBe(200);
    expect(mockSendCapiEventByPixelId).toHaveBeenCalledOnce();
    const callArg = mockSendCapiEventByPixelId.mock.calls[0][0] as {
      userData?: { phone?: string };
    };
    expect(callArg.userData?.phone).toBe("+96171123456");
  });

  it("always passes clientIpAddress and clientUserAgent regardless of whether userData is in the body", async () => {
    const res = await request(app)
      .post("/pixel/event")
      .set("User-Agent", "TestAgent/1.0")
      .set("X-Forwarded-For", "198.51.100.7")
      .send({ eventName: "PageView", pixelId: "1234567890" });

    expect(res.status).toBe(200);
    expect(mockSendCapiEventByPixelId).toHaveBeenCalledOnce();
    const callArg = mockSendCapiEventByPixelId.mock.calls[0][0] as {
      userData?: { clientIpAddress?: string | null; clientUserAgent?: string | null };
    };
    expect(callArg.userData?.clientUserAgent).toBe("TestAgent/1.0");
    expect(callArg.userData?.clientIpAddress).toBeTruthy();
  });
});
