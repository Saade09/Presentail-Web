import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { mockRateLimitFactory, mockValues } = vi.hoisted(() => ({
  mockRateLimitFactory: vi.fn(),
  mockValues: vi.fn((_values: unknown) => ({ catch: () => {} })),
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

vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: null }),
}));

async function buildApp() {
  const analyticsRouter = (await import("./analytics")).default;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).log = { info: vi.fn(), warn: vi.fn() };
    next();
  });
  app.use(analyticsRouter);
  return app;
}

describe("POST /analytics/events sampling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockRateLimitFactory.mockReturnValue(
      (_req: unknown, _res: unknown, next: () => void) => next(),
    );
    process.env.ANALYTICS_SAMPLING_MODE = "enforce";
    process.env.ANALYTICS_WEB_VITAL_SAMPLE_RATE = "0";
  });

  afterEach(() => {
    delete process.env.ANALYTICS_SAMPLING_MODE;
    delete process.env.ANALYTICS_WEB_VITAL_SAMPLE_RATE;
  });

  it("accepts but does not persist an ordinary vital outside the cohort", async () => {
    const app = await buildApp();
    const res = await request(app).post("/analytics/events").send({
      name: "web_vital",
      action: "LCP",
      metricValue: 1_500,
      platform: "desktop_web",
      sessionId: "11111111-1111-4111-8111-111111111111",
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockValues).not.toHaveBeenCalled();
  });

  it("persists a poor vital as a separate outlier signal", async () => {
    const app = await buildApp();
    await request(app).post("/analytics/events").send({
      name: "web_vital",
      action: "LCP",
      metricValue: 5_000,
      platform: "desktop_web",
      sessionId: "11111111-1111-4111-8111-111111111111",
    });

    expect(mockValues).toHaveBeenCalledOnce();
    expect(mockValues.mock.calls[0][0]).toMatchObject({
      name: "web_vital_outlier",
      metricValue: 5_000,
    });
  });

  it("keeps sessionless vitals outside the percentile cohort", async () => {
    const app = await buildApp();
    await request(app).post("/analytics/events").send({
      name: "web_vital",
      action: "LCP",
      metricValue: 1_500,
      platform: "desktop_web",
    });

    expect(mockValues).toHaveBeenCalledOnce();
    const row = mockValues.mock.calls[0][0] as {
      name: string;
      propertiesJson: string;
    };
    expect(row.name).toBe("web_vital_unattributed");
    expect(JSON.parse(row.propertiesJson).analyticsSampling).toMatchObject({
      selected: false,
      retainedByException: true,
      reason: "missing_stable_id",
    });
  });

  it("marks a sessionless shadow row as excluded from the cohort", async () => {
    process.env.ANALYTICS_SAMPLING_MODE = "shadow";
    const app = await buildApp();
    await request(app).post("/analytics/events").send({
      name: "web_vital",
      action: "LCP",
      metricValue: 1_500,
      platform: "desktop_web",
    });

    const row = mockValues.mock.calls[0][0] as {
      name: string;
      propertiesJson: string;
    };
    expect(row.name).toBe("web_vital");
    expect(JSON.parse(row.propertiesJson).analyticsSampling).toMatchObject({
      mode: "shadow",
      selected: false,
      retainedByException: true,
    });
  });

  it("keeps revenue and payment events at full fidelity", async () => {
    const app = await buildApp();
    await request(app).post("/analytics/events").send({
      name: "order_placed",
      action: "card",
      platform: "web",
      sessionId: "11111111-1111-4111-8111-111111111111",
    });

    expect(mockValues).toHaveBeenCalledOnce();
    expect(mockValues.mock.calls[0][0]).toMatchObject({
      name: "order_placed",
    });
  });

  it("accepts the server lifecycle contract without the invalid surface value", async () => {
    const app = await buildApp();
    const res = await request(app).post("/analytics/events").send({
      name: "product_lifecycle_410",
      productId: "retired-product",
      platform: "web",
    });

    expect(res.status).toBe(200);
    expect(mockValues.mock.calls[0][0]).toMatchObject({
      name: "product_lifecycle_410",
      productId: "retired-product",
    });
  });
});