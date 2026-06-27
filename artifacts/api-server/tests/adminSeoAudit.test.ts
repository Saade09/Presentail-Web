import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { AuditSummary } from "../src/lib/seoAuditMonitor";

vi.mock("../src/lib/seoAuditMonitor", async () => {
  const actual = await vi.importActual<
    typeof import("../src/lib/seoAuditMonitor")
  >("../src/lib/seoAuditMonitor");
  return {
    ...actual,
    runAuditNow: vi.fn(),
  };
});

vi.mock("../src/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const { runAuditNow } = await import("../src/lib/seoAuditMonitor");
const adminSeoAuditRouter = (await import("../src/routes/adminSeoAudit"))
  .default;

function makeApp() {
  const app = express();
  // Attach a no-op req.log so the route's req.log.warn() doesn't throw in tests
  // (pino-http is not mounted here).
  app.use((_req: any, _res, next) => {
    _req.log = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
    next();
  });
  app.use("/api", adminSeoAuditRouter);
  return app;
}

const SAMPLE_SUMMARY: AuditSummary = {
  ranAt: "2026-05-31T10:00:00.000Z",
  total: 21,
  failing: 2,
  warned: 3,
  passing: 16,
  pages: [
    {
      label: "Homepage (EN)",
      url: "https://presentail.com/en-lb/beirut",
      status: "ok",
      ogImage: "https://presentail.com/img/product-specific.jpg",
      ogImageReachable: true,
      ogImageSizeOk: true,
      fallbackUsed: false,
      fetchFailed: false,
    },
    {
      label: "Product (EN)",
      url: "https://presentail.com/en-lb/beirut/product/pink-roses",
      status: "error",
      ogImage: null,
      ogImageReachable: null,
      ogImageSizeOk: null,
      fallbackUsed: false,
      fetchFailed: true,
      error: "Could not fetch page HTML",
    },
  ],
};

describe("POST /api/admin/seo-audit/run — auth", () => {
  beforeEach(() => {
    process.env.PUSH_ADMIN_TOKEN = "secret-test-token";
    vi.mocked(runAuditNow).mockResolvedValue(SAMPLE_SUMMARY);
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.PUSH_ADMIN_TOKEN;
  });

  it("returns 401 when no token is supplied", async () => {
    const res = await request(makeApp()).post("/api/admin/seo-audit/run");
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
    expect(runAuditNow).not.toHaveBeenCalled();
  });

  it("returns 401 when the wrong token is supplied", async () => {
    const res = await request(makeApp())
      .post("/api/admin/seo-audit/run")
      .set("x-push-admin-token", "wrong-token");
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
    expect(runAuditNow).not.toHaveBeenCalled();
  });

  it("returns 401 when PUSH_ADMIN_TOKEN is unset (fail-closed)", async () => {
    delete process.env.PUSH_ADMIN_TOKEN;
    const res = await request(makeApp())
      .post("/api/admin/seo-audit/run")
      .set("x-push-admin-token", "anything");
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
    expect(runAuditNow).not.toHaveBeenCalled();
  });

  it("accepts the x-admin-token header alias", async () => {
    const res = await request(makeApp())
      .post("/api/admin/seo-audit/run")
      .set("x-admin-token", "secret-test-token");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe("POST /api/admin/seo-audit/run — concurrent run guard (409)", () => {
  beforeEach(() => {
    process.env.PUSH_ADMIN_TOKEN = "secret-test-token";
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.PUSH_ADMIN_TOKEN;
  });

  it("returns 409 when runAuditNow throws 'Audit already in progress'", async () => {
    vi.mocked(runAuditNow).mockRejectedValueOnce(
      new Error("Audit already in progress"),
    );
    const res = await request(makeApp())
      .post("/api/admin/seo-audit/run")
      .set("x-push-admin-token", "secret-test-token");
    expect(res.status).toBe(409);
    expect(res.body.ok).toBe(false);
    expect(res.body.message).toBe("Audit already in progress");
  });
});

describe("POST /api/admin/seo-audit/run — success (200)", () => {
  beforeEach(() => {
    process.env.PUSH_ADMIN_TOKEN = "secret-test-token";
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.PUSH_ADMIN_TOKEN;
  });

  it("returns 200 with ok:true and the AuditSummary shape", async () => {
    vi.mocked(runAuditNow).mockResolvedValueOnce(SAMPLE_SUMMARY);
    const res = await request(makeApp())
      .post("/api/admin/seo-audit/run")
      .set("x-push-admin-token", "secret-test-token");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.ranAt).toBe(SAMPLE_SUMMARY.ranAt);
    expect(res.body.total).toBe(SAMPLE_SUMMARY.total);
    expect(res.body.failing).toBe(SAMPLE_SUMMARY.failing);
    expect(res.body.warned).toBe(SAMPLE_SUMMARY.warned);
    expect(res.body.passing).toBe(SAMPLE_SUMMARY.passing);
    expect(Array.isArray(res.body.pages)).toBe(true);
    expect(res.body.pages).toHaveLength(SAMPLE_SUMMARY.pages.length);
  });

  it("per-page entries include status, ogImage, and fetchFailed fields", async () => {
    vi.mocked(runAuditNow).mockResolvedValueOnce(SAMPLE_SUMMARY);
    const res = await request(makeApp())
      .post("/api/admin/seo-audit/run")
      .set("x-push-admin-token", "secret-test-token");
    const failedPage = res.body.pages.find((p: any) => p.fetchFailed === true);
    expect(failedPage).toBeDefined();
    expect(failedPage.status).toBe("error");
    expect(failedPage.ogImage).toBeNull();
    expect(failedPage.error).toBe("Could not fetch page HTML");

    const okPage = res.body.pages.find((p: any) => p.status === "ok");
    expect(okPage).toBeDefined();
    expect(okPage.fetchFailed).toBe(false);
    expect(okPage.fallbackUsed).toBe(false);
  });

  it("total equals failing + warned + passing", async () => {
    vi.mocked(runAuditNow).mockResolvedValueOnce(SAMPLE_SUMMARY);
    const res = await request(makeApp())
      .post("/api/admin/seo-audit/run")
      .set("x-push-admin-token", "secret-test-token");
    expect(res.body.failing + res.body.warned + res.body.passing).toBe(
      res.body.total,
    );
  });

  it("returns 500 for unexpected errors from runAuditNow", async () => {
    vi.mocked(runAuditNow).mockRejectedValueOnce(new Error("DB timeout"));
    const res = await request(makeApp())
      .post("/api/admin/seo-audit/run")
      .set("x-push-admin-token", "secret-test-token");
    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
  });
});
