import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetForTest,
  runAuditNow,
  runOnce,
} from "../src/lib/seoAuditMonitor";

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("../src/lib/alerts", () => ({
  sendAlert: vi.fn(),
}));

vi.mock("../src/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeResponse(ok: boolean, body = ""): Response {
  return {
    ok,
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

const HEALTHY_HTML = `
<html><head>
<meta property="og:image" content="https://new.presentail.com/img/product-specific.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="628" />
</head><body>hello</body></html>
`.trim();

function stubHealthyFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "HEAD") return Promise.resolve(makeResponse(true));
      return Promise.resolve(makeResponse(true, HEALTHY_HTML));
    }),
  );
}

const ADMIN_TOKEN = "test-admin-token-seo-last";

async function makeSeoRouter() {
  const mod = await import("../src/routes/seo");
  return mod.default;
}

function makeApp(seoRouter: ReturnType<typeof express.Router>) {
  const app = express();
  app.use(express.json());
  app.use("/api", seoRouter);
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/admin/seo-audit/last", () => {
  let app: ReturnType<typeof express>;

  beforeEach(async () => {
    __resetForTest();
    process.env.PUSH_ADMIN_TOKEN = ADMIN_TOKEN;
    stubHealthyFetch();
    const seoRouter = await makeSeoRouter();
    app = makeApp(seoRouter);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.PUSH_ADMIN_TOKEN;
  });

  it("returns 401 when no admin token is supplied", async () => {
    const res = await request(app).get("/api/admin/seo-audit/last");
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it("returns 401 when the wrong admin token is supplied", async () => {
    const res = await request(app)
      .get("/api/admin/seo-audit/last")
      .set("x-push-admin-token", "wrong-token");
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it("returns 401 when PUSH_ADMIN_TOKEN env var is not set (fail-closed)", async () => {
    delete process.env.PUSH_ADMIN_TOKEN;
    const res = await request(app)
      .get("/api/admin/seo-audit/last")
      .set("x-push-admin-token", ADMIN_TOKEN);
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it("returns 404 before any audit has run", async () => {
    const res = await request(app)
      .get("/api/admin/seo-audit/last")
      .set("x-push-admin-token", ADMIN_TOKEN);
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
    expect(res.body.message).toMatch(/no audit has completed/i);
  });

  it("returns the cached AuditSummary after runAuditNow() completes", async () => {
    await runAuditNow();

    const res = await request(app)
      .get("/api/admin/seo-audit/last")
      .set("x-push-admin-token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.ranAt).toBe("string");
    expect(typeof res.body.total).toBe("number");
    expect(res.body.total).toBeGreaterThan(0);
    expect(typeof res.body.failing).toBe("number");
    expect(typeof res.body.warned).toBe("number");
    expect(typeof res.body.passing).toBe("number");
    expect(Array.isArray(res.body.pages)).toBe(true);
    expect(res.body.pages.length).toBe(res.body.total);
  });

  it("returned summary after runAuditNow() reflects page-level results", async () => {
    await runAuditNow();

    const res = await request(app)
      .get("/api/admin/seo-audit/last")
      .set("x-push-admin-token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    const { failing, warned, passing, total, pages } = res.body as {
      failing: number;
      warned: number;
      passing: number;
      total: number;
      pages: { status: string; label: string; url: string }[];
    };
    expect(failing + warned + passing).toBe(total);
    expect(pages.every((p) => ["ok", "warn", "error"].includes(p.status))).toBe(true);
    expect(pages.every((p) => typeof p.label === "string")).toBe(true);
    expect(pages.every((p) => typeof p.url === "string")).toBe(true);
  });

  it("returns the cached AuditSummary after runOnce() completes (scheduled path)", async () => {
    await runOnce();

    const res = await request(app)
      .get("/api/admin/seo-audit/last")
      .set("x-push-admin-token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.ranAt).toBe("string");
    expect(res.body.total).toBeGreaterThan(0);
    expect(Array.isArray(res.body.pages)).toBe(true);
  });

  it("returns 404 again after __resetForTest() clears the cache", async () => {
    await runAuditNow();

    const before = await request(app)
      .get("/api/admin/seo-audit/last")
      .set("x-push-admin-token", ADMIN_TOKEN);
    expect(before.status).toBe(200);

    __resetForTest();

    const after = await request(app)
      .get("/api/admin/seo-audit/last")
      .set("x-push-admin-token", ADMIN_TOKEN);
    expect(after.status).toBe(404);
    expect(after.body.ok).toBe(false);
  });

  it("reflects the most recent audit when runAuditNow() is called twice", async () => {
    await runAuditNow();

    const first = await request(app)
      .get("/api/admin/seo-audit/last")
      .set("x-push-admin-token", ADMIN_TOKEN);
    const firstRanAt = first.body.ranAt as string;

    // Small delay so the ISO timestamp differs.
    await new Promise((r) => setTimeout(r, 2));
    await runAuditNow();

    const second = await request(app)
      .get("/api/admin/seo-audit/last")
      .set("x-push-admin-token", ADMIN_TOKEN);
    expect(second.status).toBe(200);
    expect(second.body.ranAt).not.toBe(firstRanAt);
  });
});
