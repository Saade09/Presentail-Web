import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock fbConversions so no real CAPI calls are made ───────────────────────

const sendCapiEventMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../src/lib/fbConversions", () => ({
  sendCapiEvent: (...args: unknown[]) => sendCapiEventMock(...args),
}));

// ─── Route setup helper ──────────────────────────────────────────────────────

async function buildApp(): Promise<Express> {
  const mod = await import("../src/routes/fb");
  const app = express();
  app.use(express.json());
  app.use("/api", mod.default);
  return app;
}

// ─── POST /api/fb/events — route contract tests ──────────────────────────────

describe("POST /api/fb/events", () => {
  let app: Express;

  beforeEach(async () => {
    sendCapiEventMock.mockClear();
    app = await buildApp();
  });

  it("returns 200 and fires sendCapiEvent with action_source='app' for a valid LB AddToCart event", async () => {
    const res = await request(app)
      .post("/api/fb/events")
      .send({
        event: "AddToCart",
        countryCode: "LB",
        value: 45.0,
        currency: "USD",
        contentIds: ["bouquet-1"],
        email: "shopper@example.com",
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    await vi.waitFor(() => expect(sendCapiEventMock).toHaveBeenCalledOnce());
    const call = sendCapiEventMock.mock.calls[0][0] as Record<string, unknown>;
    expect(call.eventName).toBe("AddToCart");
    expect(call.countryCode).toBe("LB");
    expect(call.value).toBe(45.0);
    expect(call.currency).toBe("USD");
    expect(call.contentIds).toEqual(["bouquet-1"]);
    expect((call.userData as { email: string }).email).toBe("shopper@example.com");
    // Mobile route must always pass actionSource: "app" so CAPI deduplication
    // distinguishes mobile events from website events for the same pixel.
    expect(call.actionSource).toBe("app");
  });

  it("returns 200 for CY country code (CAPI fires but server no-ops silently)", async () => {
    const res = await request(app)
      .post("/api/fb/events")
      .send({ event: "ViewContent", countryCode: "CY" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    // Route always fires sendCapiEvent; the no-op is inside fbConversions for CY
    await vi.waitFor(() => expect(sendCapiEventMock).toHaveBeenCalledOnce());
    const call = sendCapiEventMock.mock.calls[0][0] as Record<string, unknown>;
    expect(call.countryCode).toBe("CY");
  });

  it("returns 200 for AE InitiateCheckout event", async () => {
    const res = await request(app)
      .post("/api/fb/events")
      .send({ event: "InitiateCheckout", countryCode: "AE" });

    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(sendCapiEventMock).toHaveBeenCalledOnce());
  });

  it("returns 400 for an unknown event name", async () => {
    const res = await request(app)
      .post("/api/fb/events")
      .send({ event: "UnknownEvent", countryCode: "LB" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(sendCapiEventMock).not.toHaveBeenCalled();
  });

  it("returns 400 when event field is missing", async () => {
    const res = await request(app)
      .post("/api/fb/events")
      .send({ countryCode: "LB" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(sendCapiEventMock).not.toHaveBeenCalled();
  });

  it("rejects Purchase events without forwarding them to Meta", async () => {
    const res = await request(app)
      .post("/api/fb/events")
      .send({
        event: "Purchase",
        countryCode: "LB",
        eventId: "forged-order",
        value: 999999,
        currency: "USD",
      });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(sendCapiEventMock).not.toHaveBeenCalled();
  });

  it("rejects web Purchase events without forwarding them to Meta", async () => {
    const res = await request(app)
      .post("/api/pixel/event")
      .send({
        eventName: "Purchase",
        pixelId: "1234567890",
        eventId: "forged-order",
        value: 999999,
        currency: "USD",
      });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(sendCapiEventMock).not.toHaveBeenCalled();
  });

  it("returns 400 when countryCode is missing", async () => {
    const res = await request(app)
      .post("/api/fb/events")
      .send({ event: "Purchase", value: 50 });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(sendCapiEventMock).not.toHaveBeenCalled();
  });

  it("returns 400 when event is not a string (wrong type)", async () => {
    const res = await request(app)
      .post("/api/fb/events")
      .send({ event: 42, countryCode: "LB" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(sendCapiEventMock).not.toHaveBeenCalled();
  });

  it("passes optional fields through to sendCapiEvent", async () => {
    const res = await request(app)
      .post("/api/fb/events")
      .send({
        event: "AddToCart",
        countryCode: "LB",
        contentIds: ["p1", "p2"],
        contentName: "Red Roses Bouquet",
        phone: "+96171123456",
      });

    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(sendCapiEventMock).toHaveBeenCalledOnce());
    const call = sendCapiEventMock.mock.calls[0][0] as Record<string, unknown>;
    expect(call.contentIds).toEqual(["p1", "p2"]);
    expect(call.contentName).toBe("Red Roses Bouquet");
    expect((call.userData as { phone: string }).phone).toBe("+96171123456");
  });

  it("returns 400 when the Content-Length header exceeds the 4KB body cap", async () => {
    // Build a payload that is genuinely > 4 KB so the Content-Length header
    // set by supertest matches the actual body and the check fires.
    const largeContentName = "x".repeat(5000);
    const res = await request(app)
      .post("/api/fb/events")
      .send({ event: "AddToCart", countryCode: "LB", contentName: largeContentName });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(sendCapiEventMock).not.toHaveBeenCalled();
  });
});
