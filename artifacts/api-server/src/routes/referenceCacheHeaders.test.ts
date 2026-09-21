import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { getRatesMock, getLocationsMock, getLocationsDataStatusMock } = vi.hoisted(() => ({
  getRatesMock: vi.fn(),
  getLocationsMock: vi.fn(),
  getLocationsDataStatusMock: vi.fn(),
}));

vi.mock("../lib/fx", () => ({
  getRates: getRatesMock,
  SUPPORTED_CURRENCIES: ["USD", "AED"],
}));

vi.mock("@workspace/db", () => ({
  db: { insert: vi.fn() },
  analyticsEventsTable: {},
}));

vi.mock("../lib/osLocationsCache", () => ({
  getLocations: getLocationsMock,
  getLocationsDataStatus: getLocationsDataStatusMock,
}));

vi.mock("../data/deliveryConfig", () => ({
  resolveDeliveryConfig: vi.fn().mockReturnValue({
    freeDeliveryThresholdUsd: null,
    freeDeliveryEnabled: false,
  }),
}));

vi.mock("@workspace/api-zod", () => ({
  GetDeliveryLocationsResponse: { parse: (value: unknown) => value },
}));

async function buildApp() {
  const [{ default: fxRouter }, { default: deliveryLocationsRouter }] = await Promise.all([
    import("./fx"),
    import("./delivery-locations"),
  ]);
  const app = express();
  app.use((req, _res, next) => {
    (req as any).log = { warn: vi.fn() };
    next();
  });
  app.use("/api", fxRouter, deliveryLocationsRouter);
  return app;
}

describe("public reference cache headers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRatesMock.mockResolvedValue({
      base: "USD",
      rates: { AED: 3.67 },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      source: "live",
    });
    getLocationsMock.mockReturnValue([]);
    getLocationsDataStatusMock.mockReturnValue("live");
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("caches FX rates briefly in browsers and longer at shared caches", async () => {
    const app = await buildApp();
    const res = await request(app).get("/api/fx/rates");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, base: "USD", rates: { AED: 3.67 } });
    expect(res.headers["cache-control"]).toBe(
      "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
    );
  });

  it("caches public delivery locations without altering the response body", async () => {
    const app = await buildApp();
    const res = await request(app).get("/api/delivery-locations");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ countries: [], dataStatus: "live" });
    expect(res.headers["cache-control"]).toBe(
      "public, max-age=300, s-maxage=900, stale-while-revalidate=3600",
    );
    expect(res.headers["x-delivery-locations-profile"]).toBe("full");
  });

  it("omits schedules for unselected cities in the summary profile", async () => {
    getLocationsMock.mockReturnValue([
      {
        id: "lb",
        name: "Lebanon",
        code: "LB",
        flag: "LB",
        currency: "USD",
        isActive: true,
        cities: [
          {
            id: "lb-beirut",
            name: "Beirut",
            isActive: true,
            expressAvailable: true,
            expressDeliveryLabel: "",
            sameDayCutoffHour: 22,
            operationsConfigVerified: true,
            timeSlots: [{ label: "Morning", cutoffHour: 10 }],
            slotsByDay: { monday: [{ label: "Morning", cutoffHour: 10 }] },
          },
          {
            id: "lb-metn",
            name: "Metn",
            isActive: true,
            expressAvailable: true,
            expressDeliveryLabel: "",
            sameDayCutoffHour: 22,
            operationsConfigVerified: true,
            timeSlots: [{ label: "Evening", cutoffHour: 18 }],
          },
        ],
      },
    ]);
    const app = await buildApp();
    const res = await request(app).get(
      "/api/delivery-locations?profile=summary&cityId=lb-beirut",
    );

    expect(res.status).toBe(200);
    expect(res.headers["x-delivery-locations-profile"]).toBe("summary");
    expect(res.body.countries[0].cities[0].timeSlots).toHaveLength(1);
    expect(res.body.countries[0].cities[0].slotsByDay.monday).toHaveLength(1);
    expect(res.body.countries[0].cities[1].timeSlots).toBeUndefined();
    expect(res.body.countries[0].cities[1].slotsByDay).toBeUndefined();
  });
});