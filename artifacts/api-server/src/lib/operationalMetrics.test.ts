import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getOperationalMetrics,
  recordHttpRequest,
  recordOutboundCall,
  recordWorkerRun,
  recordWorkerSkip,
  resetOperationalMetricsForTest,
  operationalMetricsMiddleware,
} from "./operationalMetrics";
import healthRouter from "../routes/health";

describe("operational metrics", () => {
  beforeEach(() => {
    resetOperationalMetricsForTest();
  });

  afterEach(() => {
    delete process.env.BASELINE_DISABLE_WORKERS;
    delete process.env.PUSH_ADMIN_TOKEN;
  });

  it("aggregates request data without retaining query strings or identifiers", () => {
    recordHttpRequest({
      method: "get",
      route: "/api/orders/8ad7bb7e-28fa-4e41-8d7f-c7f31cb97267?email=private@example.com",
      statusCode: 200,
      durationMs: 12,
      responseBytes: 48,
      cache: "bypass",
    });

    const metrics = getOperationalMetrics();
    expect(Object.keys(metrics.requests)).toEqual(["GET /api/orders/:id"]);
    expect(JSON.stringify(metrics)).not.toContain("private@example.com");
    expect(metrics.requests["GET /api/orders/:id"]).toMatchObject({
      count: 1,
      responseBytes: 48,
      averageDurationMs: 12,
    });
  });

  it("uses route templates and collapses unmatched paths", async () => {
    const app = express();
    app.use(operationalMetricsMiddleware);
    app.get("/orders/:id", (_req, res) => res.json({ ok: true }));
    app.use((_req, res) => res.status(404).end());

    await request(app).get("/orders/private-customer-name");
    await request(app).get("/private@example.com/token-value");

    const metrics = getOperationalMetrics();
    expect(Object.keys(metrics.requests)).toEqual([
      "GET /orders/:id",
      "GET /:unmatched",
    ]);
    expect(JSON.stringify(metrics)).not.toContain("private@example.com");
    expect(JSON.stringify(metrics)).not.toContain("private-customer-name");
  });

  it("bounds route, worker, reason, and outbound dimensions", () => {
    for (let index = 0; index < 40; index += 1) {
      recordWorkerSkip("reason-worker", `reason-${index}`);
    }
    for (let index = 0; index < 400; index += 1) {
      recordHttpRequest({
        method: "GET",
        route: `/route-${index}`,
        statusCode: 200,
        durationMs: 1,
        responseBytes: 1,
        cache: "unknown",
      });
      recordWorkerSkip(`worker-${index}`, `reason-${index}`);
      recordOutboundCall({
        service: `provider-${index}`,
        outcome: "success",
        durationMs: 1,
      });
    }

    const metrics = getOperationalMetrics();
    expect(Object.keys(metrics.requests).length).toBeLessThanOrEqual(250);
    expect(Object.keys(metrics.workers).length).toBeLessThanOrEqual(100);
    expect(Object.keys(metrics.outbound).length).toBeLessThanOrEqual(50);
    expect(metrics.requests["OTHER /:route"].count).toBeGreaterThan(0);
    expect(metrics.workers.other.skips).toBeGreaterThan(0);
    expect(Object.keys(metrics.workers["reason-worker"].skipReasons).length)
      .toBeLessThanOrEqual(20);
    expect(metrics.outbound.other.calls).toBeGreaterThan(0);
  });

  it("records worker ownership outcomes and bounded outbound status data", () => {
    recordWorkerSkip("catalog-refresh", "claimed");
    recordWorkerRun("catalog-refresh", "success", 25);
    recordWorkerRun("catalog-refresh", "failure", 75);
    recordOutboundCall({
      service: "google rich results /?key=secret",
      outcome: "failure",
      statusCode: 429,
      retries: 2,
      durationMs: 40,
    });

    const metrics = getOperationalMetrics();
    expect(metrics.workers["catalog-refresh"]).toMatchObject({
      runs: 2,
      skips: 1,
      failures: 1,
      unownedCompletions: 0,
      totalDurationMs: 100,
      averageDurationMs: 50,
      skipReasons: { claimed: 1 },
    });
    expect(Object.keys(metrics.outbound)).toEqual(["googlerichresults"]);
    expect(metrics.outbound.googlerichresults).toMatchObject({
      calls: 1,
      failures: 1,
      retries: 2,
      status: { "429": 1 },
    });
  });

  it("protects detailed metrics outside isolated baseline mode", async () => {
    process.env.PUSH_ADMIN_TOKEN = "expected-admin-token";
    const app = express();
    app.use(healthRouter);

    await request(app).get("/healthz/metrics").expect(401);
    await request(app)
      .get("/healthz/metrics")
      .set("x-push-admin-token", "expected-admin-token")
      .expect(200);

    process.env.BASELINE_DISABLE_WORKERS = "1";
    delete process.env.PUSH_ADMIN_TOKEN;
    await request(app).get("/healthz/metrics").expect(200);
  });
});