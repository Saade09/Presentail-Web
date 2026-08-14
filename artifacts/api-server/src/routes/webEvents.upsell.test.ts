import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Ingestion tests for the Complete Your Gift upsell funnel event set.
// Every event name must pass Zod validation (accepted: 1) and be persisted
// with its spec payload fields (tracking token, model version, experiment,
// category + slot, prices, delivery context, failure reason).
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

const UPSELL_EVENTS = [
  "upsell_module_view",
  "upsell_item_impression",
  "upsell_add_click",
  "upsell_option_open",
  "upsell_option_selected",
  "upsell_remove_click",
  "upsell_quantity_change",
  "upsell_bundle_add_attempt",
  "upsell_bundle_add_success",
  "upsell_bundle_add_failure",
  "upsell_item_purchased",
  "upsell_item_cancelled",
  "upsell_item_refunded",
  "upsell_item_substituted",
];

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimitFactory.mockReturnValue((_req: unknown, _res: unknown, next: () => void) => next());
});

describe("POST /web-events — upsell funnel events", () => {
  it.each(UPSELL_EVENTS)("accepts %s with the spec payload fields", async (type) => {
    const app = await buildApp();
    const res = await request(app)
      .post("/web-events")
      .send({
        type,
        sessionId: "sess-123",
        properties: {
          token: "abc123token",
          rulesVersion: "cyg-rules-v1",
          experimentId: "complete-your-gift-v1",
          experimentVariant: "treatment",
          category: "chocolate",
          slotIndex: 0,
          productSlug: "choc-2",
          incrementalPriceUsd: 15,
          currency: "USD",
          deliveryCity: "ae-dubai",
          deliveryDate: "2026-08-20",
          failureReason: type === "upsell_bundle_add_failure" ? "out_of_stock" : undefined,
        },
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, accepted: 1, dropped: 0 });
  });

  it("persists upsell properties into propertiesJson", async () => {
    const app = await buildApp();
    await request(app).post("/web-events").send({
      type: "upsell_add_click",
      sessionId: "sess-123",
      properties: { token: "tok", category: "cake", slotIndex: 1 },
    });
    expect(mockValues).toHaveBeenCalledTimes(1);
    const rows = (mockValues.mock.calls as unknown as unknown[][])[0]![0] as Array<{
      name: string;
      propertiesJson: string;
    }>;
    expect(rows[0].name).toBe("upsell_add_click");
    const props = JSON.parse(rows[0].propertiesJson);
    expect(props).toMatchObject({ token: "tok", category: "cake", slotIndex: 1 });
  });

  it("still rejects unknown event names", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/web-events")
      .send({ type: "upsell_totally_made_up", sessionId: "s" });
    expect(res.status).toBe(422);
  });
});
