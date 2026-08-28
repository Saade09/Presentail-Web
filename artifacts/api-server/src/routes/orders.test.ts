import { describe, it, expect, vi } from "vitest";
import { countryToPrefix } from "./orders";

// ---------------------------------------------------------------------------
// countryToPrefix unit tests — no DB needed
// ---------------------------------------------------------------------------

describe("countryToPrefix", () => {
  it("maps LB to LB", () => expect(countryToPrefix("LB")).toBe("LB"));
  it("maps AE to AE", () => expect(countryToPrefix("AE")).toBe("AE"));
  it("maps CY to CY", () => expect(countryToPrefix("CY")).toBe("CY"));
  it("maps lowercase lb to LB (case-insensitive)", () => expect(countryToPrefix("lb")).toBe("LB"));
  it("maps lowercase ae to AE (case-insensitive)", () => expect(countryToPrefix("ae")).toBe("AE"));
  it("falls back unknown code to LB", () => expect(countryToPrefix("FR")).toBe("LB"));
  it("falls back US to LB", () => expect(countryToPrefix("US")).toBe("LB"));
  it("falls back empty string to LB", () => expect(countryToPrefix("")).toBe("LB"));
});

// ---------------------------------------------------------------------------
// POST /orders/next-id request validation — DB mocked so no real connection
// ---------------------------------------------------------------------------

vi.mock("@workspace/db", () => ({
  db: {
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([{ claimedVal: 1001 }]),
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => Promise.resolve(),
      }),
    }),
  },
  orderIdSequencesTable: { prefix: "prefix", nextVal: "next_val" },
  checkoutAttemptsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: (_col: unknown, _val: unknown) => ({}),
  sql: (strings: TemplateStringsArray, ..._vals: unknown[]) => strings.join(""),
}));

import express from "express";
import request from "supertest";
import ordersRouter from "./orders";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(ordersRouter);
  return app;
}

describe("POST /orders/next-id — request validation", () => {
  it("returns 400 when body is empty", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/orders/next-id")
      .set("Content-Type", "application/json")
      .send("{}");
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("returns 400 when countryCode is missing", async () => {
    const app = buildApp();
    const res = await request(app).post("/orders/next-id").send({});
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("returns 200 with LB- orderId for LB country", async () => {
    const app = buildApp();
    const res = await request(app).post("/orders/next-id").send({ countryCode: "LB" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.orderId).toBe("string");
    expect(res.body.orderId).toMatch(/^LB-\d+$/);
  });

  it("returns 200 with AE- orderId for AE country", async () => {
    const app = buildApp();
    const res = await request(app).post("/orders/next-id").send({ countryCode: "AE" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.orderId).toMatch(/^AE-\d+$/);
  });

  it("returns 200 with CY- orderId for CY country", async () => {
    const app = buildApp();
    const res = await request(app).post("/orders/next-id").send({ countryCode: "CY" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.orderId).toMatch(/^CY-\d+$/);
  });

  it("falls back to LB- for an unknown country code", async () => {
    const app = buildApp();
    const res = await request(app).post("/orders/next-id").send({ countryCode: "FR" });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});
