/**
 * Route test for GET /api/campaign/beirut-late-night.
 * Mocks the campaign builder so this test only exercises HTTP concerns:
 * - Cache-Control and Pragma headers
 * - JSON structure from builder
 * - Fail-closed error handling
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mock the campaign builder ─────────────────────────────────────────────────

const { mockBuild } = vi.hoisted(() => ({
  mockBuild: vi.fn(),
}));

vi.mock("../lib/beirutLateNightCampaign", () => ({
  buildBeirutLateNightCampaign: mockBuild,
  CAMPAIGN_KEY: "campaign-beirut-late-night",
  BEIRUT_TZ: "Asia/Beirut",
}));

vi.mock("../lib/osLocationsCache", () => ({
  getLocations: vi.fn().mockReturnValue([
    {
      code: "LB",
      isActive: true,
      cities: [
        {
          id: "lb-beirut",
          name: "Beirut",
          isActive: true,
          operationsConfigVerified: true,
          expressAvailable: true,
          sameDayCutoffHour: 23,
          timeSlots: [],
          slotsByDay: undefined,
        },
      ],
    },
  ]),
  getLocationsDataStatus: vi.fn().mockReturnValue("live"),
}));

vi.mock("../lib/osProductsCache", () => ({
  getOsProducts: vi.fn().mockReturnValue([]),
  getOsProductPricingMap: vi.fn().mockReturnValue(new Map()),
  getStoreLastRefreshedAt: vi.fn().mockReturnValue(new Date()),
}));

// ── Setup ─────────────────────────────────────────────────────────────────────

let app: express.Application;

beforeEach(async () => {
  vi.clearAllMocks();

  // Import router fresh after mocks are set
  const { default: campaignRouter } = await import("./campaign");
  app = express();
  app.use(express.json());
  // Add a minimal req.log shim for route handlers that call req.log.error
  app.use((req, _res, next) => {
    (req as unknown as { log: { error: () => void } }).log = {
      error: vi.fn(),
    };
    next();
  });
  app.use("/api", campaignRouter);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

const STUB_RESULT = {
  campaignKey: "campaign-beirut-late-night",
  status: "tonight",
  reason: "eligible",
  timeZone: "Asia/Beirut",
  evaluatedAt: new Date().toISOString(),
  quoteExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  nominalCutoffAt: new Date().toISOString(),
  effectiveCutoffAt: new Date().toISOString(),
  cutoffLabel: "11:30 PM",
  sourceFreshness: { locationsStatus: "live", productRefreshedAt: null },
  deliveryWindow: null,
  nextAvailableWindow: null,
  availableTonight: {
    title: "Available Tonight",
    subtitle: "",
    viewAllHref: "/flowers",
    products: [],
  },
  luxury: {
    title: "Luxury Arrangements",
    subtitle: "",
    viewAllHref: "/flowers/lux-arrangements",
    products: [],
  },
};

describe("GET /api/campaign/beirut-late-night", () => {
  it("returns 200 with campaign result", async () => {
    mockBuild.mockReturnValue(STUB_RESULT);
    const res = await request(app).get("/api/campaign/beirut-late-night");
    expect(res.status).toBe(200);
    expect(res.body.campaignKey).toBe("campaign-beirut-late-night");
    expect(res.body.status).toBe("tonight");
  });

  it("sets Cache-Control: private, no-store, max-age=0", async () => {
    mockBuild.mockReturnValue(STUB_RESULT);
    const res = await request(app).get("/api/campaign/beirut-late-night");
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    expect(res.headers["cache-control"]).toMatch(/private/);
    expect(res.headers["cache-control"]).toMatch(/max-age=0/);
  });

  it("sets Pragma: no-cache", async () => {
    mockBuild.mockReturnValue(STUB_RESULT);
    const res = await request(app).get("/api/campaign/beirut-late-night");
    expect(res.headers["pragma"]).toBe("no-cache");
  });

  it("returns fail-closed unavailable response on unexpected error", async () => {
    mockBuild.mockImplementation(() => {
      throw new Error("unexpected");
    });
    const res = await request(app).get("/api/campaign/beirut-late-night");
    expect(res.status).toBe(200);
    expect(res.body.campaignKey).toBe("campaign-beirut-late-night");
    expect(res.body.status).toBe("unavailable");
    expect(res.body.reason).toBe("source-stale");
  });

  it("still sets cache headers on error path", async () => {
    mockBuild.mockImplementation(() => {
      throw new Error("unexpected");
    });
    const res = await request(app).get("/api/campaign/beirut-late-night");
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    expect(res.headers["pragma"]).toBe("no-cache");
  });
});
