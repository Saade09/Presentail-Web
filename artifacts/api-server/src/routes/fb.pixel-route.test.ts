import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Route-level tests for POST /api/pixel/event
// These verify the fb.ts adapter mapping: request body's userData.em field is
// forwarded to sendCapiEventByPixelId as userData.email. A regression in this
// mapping would silently drop Event Match Quality without any visible error.
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
});
