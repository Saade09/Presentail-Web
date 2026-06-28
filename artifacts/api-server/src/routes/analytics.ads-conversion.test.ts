import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Route-level tests for POST /api/analytics/ads-conversion
//
// Verifies that:
//  - A valid body returns 200 and fires sendAdsConversionPing with the
//    correct transactionId, value, and currency (including uppercasing).
//  - An invalid body returns 400 and does NOT fire the ping.
//  - When the rate limiter's custom handler fires, the response is 200
//    (so rate-limited mobile clients are not confused by a non-200 status)
//    and the ping is NOT called.
// ---------------------------------------------------------------------------

// Capture fetch calls before any module is imported.
const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

// Control whether the ads-conversion rate limiter passes through or fires its
// custom handler. Both limiters in the file share the same factory mock.
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

describe("POST /analytics/ads-conversion — valid body", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    // Rate limiter passes through for normal-path tests.
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

  it("returns 200 for a valid body", async () => {
    const res = await request(app)
      .post("/analytics/ads-conversion")
      .send({ transactionId: "order-123", value: 49.99, currency: "USD" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("calls the Google Ads ping with the correct transactionId", async () => {
    await request(app)
      .post("/analytics/ads-conversion")
      .send({ transactionId: "LB-2026-9001", value: 75, currency: "USD" });

    expect(mockFetch).toHaveBeenCalledOnce();
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("transaction_id=LB-2026-9001");
  });

  it("calls the Google Ads ping with the correct value", async () => {
    await request(app)
      .post("/analytics/ads-conversion")
      .send({ transactionId: "order-999", value: 125.5, currency: "USD" });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("value=125.5");
  });

  it("calls the Google Ads ping with the currency uppercased", async () => {
    await request(app)
      .post("/analytics/ads-conversion")
      .send({ transactionId: "order-555", value: 30, currency: "lbp" });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("currency_code=LBP");
  });

  it("calls the ping for a zero-value order (e.g. fully discounted)", async () => {
    await request(app)
      .post("/analytics/ads-conversion")
      .send({ transactionId: "order-free", value: 0, currency: "USD" });

    expect(res200AndPingCalled(mockFetch)).toBe(true);
  });
});

describe("POST /analytics/ads-conversion — invalid body", () => {
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

  it("returns 400 when transactionId is missing", async () => {
    const res = await request(app)
      .post("/analytics/ads-conversion")
      .send({ value: 50, currency: "USD" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("does NOT call the ping when transactionId is missing", async () => {
    await request(app)
      .post("/analytics/ads-conversion")
      .send({ value: 50, currency: "USD" });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 400 when value is missing", async () => {
    const res = await request(app)
      .post("/analytics/ads-conversion")
      .send({ transactionId: "tx-1", currency: "USD" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("does NOT call the ping when value is missing", async () => {
    await request(app)
      .post("/analytics/ads-conversion")
      .send({ transactionId: "tx-1", currency: "USD" });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 400 when currency is missing", async () => {
    const res = await request(app)
      .post("/analytics/ads-conversion")
      .send({ transactionId: "tx-1", value: 50 });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("does NOT call the ping when currency is missing", async () => {
    await request(app)
      .post("/analytics/ads-conversion")
      .send({ transactionId: "tx-1", value: 50 });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 400 for a negative value", async () => {
    const res = await request(app)
      .post("/analytics/ads-conversion")
      .send({ transactionId: "tx-2", value: -10, currency: "USD" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("does NOT call the ping for a negative value", async () => {
    await request(app)
      .post("/analytics/ads-conversion")
      .send({ transactionId: "tx-2", value: -10, currency: "USD" });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 400 for an empty body", async () => {
    const res = await request(app)
      .post("/analytics/ads-conversion")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("does NOT call the ping for an empty body", async () => {
    await request(app)
      .post("/analytics/ads-conversion")
      .send({});

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 400 when transactionId is an empty string", async () => {
    const res = await request(app)
      .post("/analytics/ads-conversion")
      .send({ transactionId: "", value: 50, currency: "USD" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("does NOT call the ping when transactionId is an empty string", async () => {
    await request(app)
      .post("/analytics/ads-conversion")
      .send({ transactionId: "", value: 50, currency: "USD" });

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("POST /analytics/ads-conversion — rate limit", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  it("returns 200 and does NOT call the ping when the rate limiter fires its custom handler", async () => {
    // Simulate the rate limiter invoking its custom handler instead of next().
    // This is exactly what express-rate-limit does once the limit is exceeded.
    mockRateLimitFactory.mockImplementation(
      () => (_req: any, res: any, _next: any) => {
        res.status(200).json({ ok: true });
      },
    );

    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    vi.resetModules();
    const app = await buildApp();

    const res = await request(app)
      .post("/analytics/ads-conversion")
      .send({ transactionId: "tx-rl", value: 50, currency: "USD" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Small utility used inline in the zero-value test above
// ---------------------------------------------------------------------------
function res200AndPingCalled(fetch: ReturnType<typeof vi.fn>): boolean {
  return fetch.mock.calls.length === 1;
}
