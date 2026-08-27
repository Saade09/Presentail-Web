import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { mockRateLimitFactory, mockValues, mockFetch } = vi.hoisted(() => ({
  mockRateLimitFactory: vi.fn(),
  mockValues: vi.fn((_values: unknown) => ({ catch: () => {} })),
  mockFetch: vi.fn(() => Promise.resolve({ ok: true })),
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

describe("POST /web-events sampling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubGlobal("fetch", mockFetch);
    mockRateLimitFactory.mockReturnValue(
      (_req: unknown, _res: unknown, next: () => void) => next(),
    );
    process.env.ANALYTICS_SAMPLING_MODE = "enforce";
    process.env.ANALYTICS_VIEW_SAMPLE_RATE = "0";
    process.env.PRESENTAIL_OS_API_URL = "https://os.test";
    process.env.PRESENTAIL_OS_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ANALYTICS_SAMPLING_MODE;
    delete process.env.ANALYTICS_VIEW_SAMPLE_RATE;
    delete process.env.PRESENTAIL_OS_API_URL;
    delete process.env.PRESENTAIL_OS_API_KEY;
  });

  it("samples a local page view while forwarding the complete OS stream", async () => {
    const app = await buildApp();
    const res = await request(app).post("/web-events").send({
      type: "page_view",
      sessionId: "session-123",
      path: "/en-ae/dubai",
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, accepted: 1, dropped: 0 });
    expect(mockValues).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("persists payment events regardless of the view sample rate", async () => {
    const app = await buildApp();
    await request(app).post("/web-events").send({
      type: "payment_completed",
      sessionId: "session-123",
      value: 120,
      currency: "USD",
    });

    expect(mockValues).toHaveBeenCalledOnce();
    const rows = mockValues.mock.calls[0][0] as Array<{ name: string }>;
    expect(rows[0].name).toBe("payment_completed");
  });
});