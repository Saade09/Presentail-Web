import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Route-level ingestion tests for POST /web-events covering the cart Order
// Summary redesign event families:
//   order_summary_viewed, promo_code_expanded, promo_code_submitted,
//   promo_code_removed, checkout_clicked
// Each must pass Zod validation (accepted: 1) and be persisted via db.insert.
// ---------------------------------------------------------------------------

const { mockRateLimitFactory, mockValues } = vi.hoisted(() => ({
  mockRateLimitFactory: vi.fn(),
  mockValues: vi.fn(() => ({ catch: () => {} })),
}));

vi.mock("express-rate-limit", () => ({
  rateLimit: mockRateLimitFactory,
}));

vi.mock("@workspace/db", () => ({
  db: {
    insert: () => ({ values: mockValues }),
  },
  analyticsEventsTable: {},
}));

async function buildApp() {
  const webEventsRouter = (await import("./webEvents")).default;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).log = { info: vi.fn(), warn: vi.fn() };
    next();
  });
  app.use(webEventsRouter);
  return app;
}

const NEW_EVENTS: Array<{ type: string; body: Record<string, unknown> }> = [
  {
    type: "order_summary_viewed",
    body: {
      currency: "USD",
      properties: {
        selectedDeliveryType: "standard",
        standardDeliveryFree: false,
        expressUpgradePresent: false,
        promoApplied: false,
      },
    },
  },
  { type: "promo_code_expanded", body: {} },
  { type: "promo_code_submitted", body: { properties: { outcome: "success" } } },
  { type: "promo_code_removed", body: {} },
  {
    type: "checkout_clicked",
    body: {
      value: 120,
      currency: "USD",
      properties: { selectedDeliveryType: "express", standardDeliveryFree: true },
    },
  },
];

describe("POST /web-events — cart Order Summary redesign events", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    mockRateLimitFactory.mockImplementation(
      () => (_req: any, _res: any, next: any) => next(),
    );
    mockValues.mockClear();
    vi.resetModules();
    app = await buildApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  for (const { type, body } of NEW_EVENTS) {
    it(`accepts and persists a ${type} event`, async () => {
      const res = await request(app)
        .post("/web-events")
        .send({ type, sessionId: "11111111-2222-3333-4444-555555555555", ...body });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, accepted: 1, dropped: 0 });
      expect(mockValues).toHaveBeenCalledOnce();
      const rows = (mockValues.mock.calls[0] as unknown[])[0] as Array<{ name: string; propertiesJson: string | null }>;
      expect(rows[0].name).toBe(type);
    });
  }

  it("still rejects an unknown event type with 422", async () => {
    const res = await request(app)
      .post("/web-events")
      .send({ type: "totally_unknown_event", sessionId: "11111111-2222-3333-4444-555555555555" });

    expect(res.status).toBe(422);
    expect(res.body.ok).toBe(false);
    expect(mockValues).not.toHaveBeenCalled();
  });

  it("keeps saved-address analytics privacy-safe before persisting", async () => {
    const res = await request(app)
      .post("/web-events")
      .send({
        type: "saved_address_confirmed",
        sessionId: "11111111-2222-3333-4444-555555555555",
        properties: {
          addressId: 42,
          previousAddressId: 7,
          countryCode: "LB",
          district: "Beirut",
          addressLine: "Private street and building",
          phone: "+961123456",
          recipientName: "Private name",
        },
      });

    expect(res.status).toBe(200);
    const rows = (mockValues.mock.calls[0] as unknown[])[0] as Array<{ propertiesJson: string }>;
    const properties = JSON.parse(rows[0].propertiesJson);
    expect(properties).toMatchObject({
      addressId: 42,
      previousAddressId: 7,
      countryCode: "LB",
      district: "Beirut",
    });
    expect(properties).not.toHaveProperty("addressLine");
    expect(properties).not.toHaveProperty("phone");
    expect(properties).not.toHaveProperty("recipientName");
  });
});
