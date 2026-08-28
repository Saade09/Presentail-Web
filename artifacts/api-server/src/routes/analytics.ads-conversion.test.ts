import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Route-level tests for POST /api/analytics/ads-conversion
//
// The legacy mobile endpoint is an explicit tombstone. Google Ads purchase
// conversions are emitted only from verified order state in the OS webhook.
// ---------------------------------------------------------------------------

// Capture fetch calls before any module is imported.
const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

const { mockRateLimitFactory } = vi.hoisted(() => ({
  mockRateLimitFactory: vi.fn(),
}));

vi.mock("express-rate-limit", () => ({
  rateLimit: mockRateLimitFactory,
}));

// The analytics route inserts events into the DB — mock the entire module so
// tests never need a real Postgres connection.
vi.mock("@workspace/db", () => ({
  db: {
    insert: () => ({ values: () => ({ catch: () => {} }) }),
  },
  analyticsEventsTable: {},
}));

// The /analytics/events handler calls getAuth — stub it out.
vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: null }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal Express app that wraps the analytics router.
 * Provides a pino-compatible `req.log` so the route handler doesn't throw.
 */
async function buildApp() {
  const analyticsRouter = (await import("./analytics")).default;
  const app = express();
  app.use(express.json());
  app.use((_req, _res, next) => {
    (_req as any).log = {
      info: vi.fn(),
      warn: vi.fn(),
    };
    next();
  });
  app.use(analyticsRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /analytics/ads-conversion", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    mockRateLimitFactory.mockImplementation(
      () => (_req: any, _res: any, next: any) => next(),
    );

    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    vi.resetModules();
    app = await buildApp();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  it("returns 410 for a caller-supplied conversion", async () => {
    const res = await request(app)
      .post("/analytics/ads-conversion")
      .send({ transactionId: "order-123", value: 49.99, currency: "USD" });

    expect(res.status).toBe(410);
    expect(res.body).toEqual({
      ok: false,
      message: "Purchase conversions are recorded from verified orders only",
    });
  });

  it("never forwards caller-controlled purchase data to Google", async () => {
    await request(app)
      .post("/analytics/ads-conversion")
      .send({
        transactionId: "attacker-chosen-id",
        value: 999999,
        currency: "USD",
        gclid: "attacker-click-id",
      });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not accept malformed bodies as an alternate forwarding path", async () => {
    const res = await request(app)
      .post("/analytics/ads-conversion")
      .send({});

    expect(res.status).toBe(410);
    expect(res.body.ok).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
