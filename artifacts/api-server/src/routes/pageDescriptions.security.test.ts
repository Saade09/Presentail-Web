import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const {
  dbSelect,
  enqueueDescriptionGeneration,
  buildFallbackDescription,
  getOsCategories,
  getOsOccasions,
  getOsProductEmbeddedCategories,
  getOsProductOccasions,
} = vi.hoisted(() => ({
  dbSelect: vi.fn(),
  enqueueDescriptionGeneration: vi.fn(),
  buildFallbackDescription: vi.fn(() => "Safe fallback"),
  getOsCategories: vi.fn(),
  getOsOccasions: vi.fn(),
  getOsProductEmbeddedCategories: vi.fn(),
  getOsProductOccasions: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: { select: dbSelect },
  pageContextualDescriptionsTable: {
    pageType: "page_type",
    pageSlug: "page_slug",
    deliveryAreaId: "delivery_area_id",
    language: "language",
  },
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
}));
vi.mock("../lib/pageDescriptionGenerator", () => ({ buildFallbackDescription }));
vi.mock("../lib/pageDescriptionQueue", () => ({
  enqueueDescriptionGeneration,
  enqueueBulkSeed: vi.fn(),
}));
vi.mock("../lib/osProductsCache", () => ({
  getOsCategories,
  getOsOccasions,
  getOsProductEmbeddedCategories,
  getOsProductOccasions,
}));
vi.mock("../lib/admin-auth", () => ({ checkAdminToken: vi.fn(() => false) }));

import pageDescriptionsRouter from "./pageDescriptions";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { log: { error: (...args: unknown[]) => void } }).log = {
      error: vi.fn(),
    };
    next();
  });
  app.use(pageDescriptionsRouter);
  return app;
}

describe("GET /page-descriptions security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOsCategories.mockReturnValue([{ slug: "flowers" }]);
    getOsOccasions.mockReturnValue([{ slug: "birthday" }]);
    getOsProductEmbeddedCategories.mockReturnValue(new Map());
    getOsProductOccasions.mockReturnValue(new Map());
    dbSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    });
  });

  it("rejects unknown catalog slugs without touching the database or queue", async () => {
    const res = await request(buildApp()).get("/page-descriptions").query({
      page_type: "category",
      slug: "attacker-slug",
      delivery_area_id: "lb-beirut",
      language: "en",
    });

    expect(res.status).toBe(404);
    expect(dbSelect).not.toHaveBeenCalled();
    expect(enqueueDescriptionGeneration).not.toHaveBeenCalled();
  });

  it("rejects unknown delivery areas without touching the database or queue", async () => {
    const res = await request(buildApp()).get("/page-descriptions").query({
      page_type: "category",
      slug: "flowers",
      delivery_area_id: "attacker-area",
      language: "en",
    });

    expect(res.status).toBe(404);
    expect(dbSelect).not.toHaveBeenCalled();
    expect(enqueueDescriptionGeneration).not.toHaveBeenCalled();
  });

  it("returns a fallback for a real page without enqueueing paid work", async () => {
    const res = await request(buildApp()).get("/page-descriptions").query({
      page_type: "category",
      slug: "flowers",
      delivery_area_id: "lb-beirut",
      language: "en",
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      description: "Safe fallback",
      is_fallback: true,
    });
    expect(enqueueDescriptionGeneration).not.toHaveBeenCalled();
  });

  it("accepts an occasion found only in product tags without enqueueing paid work", async () => {
    getOsOccasions.mockReturnValue([]);
    getOsProductOccasions.mockReturnValue(
      new Map([["product-only-occasion", { slug: "product-only-occasion" }]]),
    );

    const res = await request(buildApp()).get("/page-descriptions").query({
      page_type: "occasion",
      slug: "product-only-occasion",
      delivery_area_id: "lb-beirut",
      language: "en",
    });

    expect(res.status).toBe(200);
    expect(res.body.description).toBe("Safe fallback");
    expect(enqueueDescriptionGeneration).not.toHaveBeenCalled();
  });

  it("bounds query fields before catalog or database work", async () => {
    const res = await request(buildApp()).get("/page-descriptions").query({
      page_type: "category",
      slug: "x".repeat(161),
      delivery_area_id: "lb-beirut",
      language: "en",
    });

    expect(res.status).toBe(400);
    expect(getOsCategories).not.toHaveBeenCalled();
    expect(dbSelect).not.toHaveBeenCalled();
  });
});