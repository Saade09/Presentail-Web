import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const mockInsertReturning = vi.fn().mockResolvedValue([{ id: 42 }]);
  const mockInsertValues = vi.fn().mockReturnValue({ returning: mockInsertReturning });
  const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

  const mockUpdateSet = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

  const mockSelectWhere = vi.fn().mockReturnValue({
    limit: vi.fn().mockResolvedValue([]),
  });
  const mockSelectOrderBy = vi.fn().mockReturnValue({
    limit: vi.fn().mockResolvedValue([]),
  });
  const mockSelectFrom = vi.fn().mockReturnValue({
    where: mockSelectWhere,
    orderBy: mockSelectOrderBy,
  });
  const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });

  return {
    db: { insert: mockInsert, update: mockUpdate, select: mockSelect },
    seoAuditRunsTable: {
      id: "id",
      runAt: "run_at",
      triggeredBy: "triggered_by",
      durationMs: "duration_ms",
      totalChecks: "total_checks",
      criticalCount: "critical_count",
      warnCount: "warn_count",
      passCount: "pass_count",
      summaryJson: "summary_json",
    },
  };
});

vi.mock("drizzle-orm", () => ({
  desc: vi.fn((col) => ({ __desc: col })),
  eq: vi.fn((col, val) => ({ __eq: { col, val } })),
}));

vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("./osProductsCache", () => ({
  hasOsProducts: vi.fn(),
  getOsProducts: vi.fn(),
  getOsBrands: vi.fn(),
  getOsCategories: vi.fn(),
  getOsOccasions: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: vi.fn((cmd, args, opts, cb) => {
    if (typeof opts === "function") { opts(null, "", ""); return; }
    if (typeof cb === "function") { cb(null, "", ""); return; }
  }),
}));

vi.mock("node:util", () => ({
  promisify: vi.fn((fn) => (...args: unknown[]) => new Promise((res, rej) => {
    fn(...args, (err: unknown, stdout: string, stderr: string) => {
      if (err) rej(Object.assign(err as object, { stdout, stderr }));
      else res({ stdout, stderr });
    });
  })),
}));

import {
  hasOsProducts,
  getOsProducts,
  getOsBrands,
  getOsCategories,
  getOsOccasions,
} from "./osProductsCache";

const mockHasOsProducts = vi.mocked(hasOsProducts);
const mockGetOsProducts = vi.mocked(getOsProducts);
const mockGetOsBrands = vi.mocked(getOsBrands);
const mockGetOsCategories = vi.mocked(getOsCategories);
const mockGetOsOccasions = vi.mocked(getOsOccasions);

function seedCatalog() {
  mockHasOsProducts.mockReturnValue(true);
  mockGetOsProducts.mockReturnValue([
    { id: "rose-bouquet-12", name: "Rose Bouquet" } as any,
    { id: "tulip-box-6", name: "Tulip Box" } as any,
  ]);
  mockGetOsBrands.mockReturnValue([
    { slug: "brand-alpha", name: "Brand Alpha" } as any,
  ]);
  mockGetOsCategories.mockReturnValue([
    { slug: "flowers", name: "Flowers" } as any,
    { slug: "chocolates", name: "Chocolates" } as any,
  ]);
  mockGetOsOccasions.mockReturnValue([
    { slug: "birthday", name: "Birthday" } as any,
    { slug: "anniversary", name: "Anniversary" } as any,
  ]);
}

// ── HTML page builder ────────────────────────────────────────────────────────

function makeHtmlPage({
  title = "My Page",
  description = "A description",
  h1Count = 1,
  canonical,
  hreflangCount = 9,
  hasProductJsonLd = false,
  imgsWithoutAlt = 0,
  productCardCount = 5,
}: {
  title?: string;
  description?: string;
  h1Count?: number;
  canonical?: string;
  hreflangCount?: number;
  hasProductJsonLd?: boolean;
  imgsWithoutAlt?: number;
  productCardCount?: number;
}): string {
  const h1Tags = Array.from({ length: h1Count }, () => "<h1>Heading</h1>").join("");
  const canonicalTag = canonical ? `<link rel="canonical" href="${canonical}">` : "";
  const hreflangTags = Array.from(
    { length: hreflangCount },
    (_, i) => `<link rel="alternate" hreflang="en-lb${i}" href="https://presentail.com/">`,
  ).join("");
  const jsonLd = hasProductJsonLd
    ? `<script type="application/ld+json">{"@type":"Product","name":"Test"}</script>`
    : "";
  const imgs = Array.from({ length: imgsWithoutAlt }, () => `<img src="test.jpg">`).join("");
  const productCards = Array.from(
    { length: productCardCount },
    (_, i) => `<div data-product-id="${i}">Product ${i}</div>`,
  ).join("");
  const descTag = description ? `<meta name="description" content="${description}">` : "";
  return `<html><head><title>${title}</title>${descTag}${canonicalTag}${hreflangTags}${jsonLd}</head><body>${h1Tags}${imgs}${productCards}</body></html>`;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("seoAuditEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedCatalog();
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "HEAD") {
        return Promise.resolve({ ok: true, status: 200, headers: new Headers() });
      }
      const pageUrl = String(url);
      const canonical = pageUrl.replace(/\/$/, "");
      const html = makeHtmlPage({ canonical, hasProductJsonLd: true });
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(html),
      });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runSeoAudit('manual') returns object with checks array and criticalCount >= 0", async () => {
    const { runSeoAudit } = await import("./seoAuditEngine");
    const result = await runSeoAudit("manual");
    expect(result).toMatchObject({
      triggeredBy: "manual",
      checks: expect.any(Array),
      criticalCount: expect.any(Number),
      warnCount: expect.any(Number),
      passCount: expect.any(Number),
    });
    expect(result.criticalCount).toBeGreaterThanOrEqual(0);
    expect(result.checks.length).toBeGreaterThan(0);
  });

  it("throws when OS catalog is not ready", async () => {
    mockHasOsProducts.mockReturnValue(false);
    const { runSeoAudit } = await import("./seoAuditEngine");
    await expect(runSeoAudit("manual")).rejects.toThrow("OS catalog not ready");
  });

  it("duplicate-titles check: two pages with same title produce warn severity with affectedUrls length >= 2", async () => {
    const sharedTitle = "Shared Page Title — Presentail";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "HEAD") {
        return Promise.resolve({ ok: true, status: 200, headers: new Headers() });
      }
      const canonical = String(url).replace(/\/$/, "");
      const html = makeHtmlPage({ title: sharedTitle, canonical, hasProductJsonLd: true });
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(html) });
    }));

    const { runSeoAudit } = await import("./seoAuditEngine");
    const result = await runSeoAudit("manual");
    const check = result.checks.find((c) => c.checkId === "duplicate-titles");
    expect(check).toBeDefined();
    expect(check!.severity).toBe("warn");
    expect(check!.affectedUrls.length).toBeGreaterThanOrEqual(2);
  });

  it("thin-pages check: page with no product cards produces critical severity with requiresHumanApproval", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "HEAD") {
        return Promise.resolve({ ok: true, status: 200, headers: new Headers() });
      }
      const canonical = String(url).replace(/\/$/, "");
      // productCardCount = 0 → below MIN_PRODUCTS_BY_TYPE["city-category"] = 4
      const html = makeHtmlPage({ canonical, productCardCount: 0, hasProductJsonLd: false });
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(html) });
    }));

    const { runSeoAudit } = await import("./seoAuditEngine");
    const result = await runSeoAudit("manual");
    const check = result.checks.find((c) => c.checkId === "thin-pages");
    expect(check).toBeDefined();
    expect(check!.severity).toBe("critical");
    expect(check!.requiresHumanApproval).toBe(true);
    expect(check!.affectedUrls.length).toBeGreaterThan(0);
  });

  it("canonical-conflicts check: page with mismatched canonical produces critical severity", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "HEAD") {
        return Promise.resolve({ ok: true, status: 200, headers: new Headers() });
      }
      const html = makeHtmlPage({
        canonical: "https://presentail.com/en-lb/beirut/completely-different-page",
        hasProductJsonLd: true,
        productCardCount: 5,
      });
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(html) });
    }));

    const { runSeoAudit } = await import("./seoAuditEngine");
    const result = await runSeoAudit("manual");
    const check = result.checks.find((c) => c.checkId === "canonical-conflicts");
    expect(check).toBeDefined();
    expect(check!.severity).toBe("critical");
    expect(check!.affectedUrls.length).toBeGreaterThan(0);
  });

  it("redirect-chains check: A→B where B is also in the map produces warn with affected URLs", async () => {
    const { runSeoAudit, __setProductRedirectsForTest } = await import("./seoAuditEngine");
    // Set up: old-slug → mid-slug → new-slug (chain: old-slug is a problem)
    __setProductRedirectsForTest({
      "old-slug": "mid-slug",
      "mid-slug": "new-slug",
    });
    const result = await runSeoAudit("manual");
    const check = result.checks.find((c) => c.checkId === "redirect-chains");
    expect(check).toBeDefined();
    expect(check!.severity).toBe("warn");
    expect(check!.affectedUrls.length).toBeGreaterThanOrEqual(1);
    // Cleanup
    __setProductRedirectsForTest({});
  });

  it("redirect-chains check: empty redirect map produces pass", async () => {
    const { runSeoAudit, __setProductRedirectsForTest } = await import("./seoAuditEngine");
    __setProductRedirectsForTest({});
    const result = await runSeoAudit("manual");
    const check = result.checks.find((c) => c.checkId === "redirect-chains");
    expect(check).toBeDefined();
    expect(check!.severity).toBe("pass");
    expect(check!.affectedUrls.length).toBe(0);
  });

  it("perf-budget check returns pass or warn or info (not critical)", async () => {
    const { runSeoAudit } = await import("./seoAuditEngine");
    const result = await runSeoAudit("manual");
    const check = result.checks.find((c) => c.checkId === "perf-budget");
    expect(check).toBeDefined();
    expect(["pass", "warn", "info"]).toContain(check!.severity);
  });
});

// ── Route-level auth tests ───────────────────────────────────────────────────

describe("GET /api/seo/audit/latest auth", () => {
  it("returns 401 without token", async () => {
    const original = process.env.PUSH_ADMIN_TOKEN;
    process.env.PUSH_ADMIN_TOKEN = "expected-secret-xyz";
    const express = (await import("express")).default;
    const { default: seoAuditRouter } = await import("../routes/seoAuditRoutes");
    const testApp = express();
    testApp.use(express.json());
    testApp.use(seoAuditRouter);
    const { default: request } = await import("supertest");
    const res = await request(testApp).get("/seo/audit/latest");
    expect(res.status).toBe(401);
    process.env.PUSH_ADMIN_TOKEN = original;
  });

  it("returns 200 or 404 with valid token", async () => {
    process.env.PUSH_ADMIN_TOKEN = "test-admin-token-seo-444";
    const express = (await import("express")).default;
    const { default: seoAuditRouter } = await import("../routes/seoAuditRoutes");
    const testApp = express();
    testApp.use(express.json());
    testApp.use(seoAuditRouter);
    const { default: request } = await import("supertest");
    const res = await request(testApp)
      .get("/seo/audit/latest")
      .set("x-push-admin-token", "test-admin-token-seo-444");
    expect([200, 404]).toContain(res.status);
    expect(res.body).toHaveProperty("ok");
    delete process.env.PUSH_ADMIN_TOKEN;
  });
});
