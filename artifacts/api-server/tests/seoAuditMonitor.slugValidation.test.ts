import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  validateKeyPageSlugs,
  runOnce,
  __resetForTest,
} from "../src/lib/seoAuditMonitor";

// ── Mocks ────────────────────────────────────────────────────────────────────

const sendAlertMock = vi.fn();

vi.mock("../src/lib/alerts", () => ({
  sendAlert: (...args: any[]) => sendAlertMock(...args),
}));

const loggerWarnMock = vi.fn();
const loggerInfoMock = vi.fn();

vi.mock("../src/lib/logger", () => ({
  logger: {
    info: (...args: any[]) => loggerInfoMock(...args),
    warn: (...args: any[]) => loggerWarnMock(...args),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const hasOsProductsMock = vi.fn<[], boolean>();
const getOsProductBySlugMock = vi.fn<[string], unknown>();
const getOsBrandsMock = vi.fn<[], Array<{ slug: string }>>();
const getOsCategoriesMock = vi.fn<[], Array<{ slug: string }>>();
const getOsOccasionsMock = vi.fn<[], Array<{ slug: string }>>();

vi.mock("../src/lib/osProductsCache", () => ({
  hasOsProducts: () => hasOsProductsMock(),
  getOsProductBySlug: (slug: string) => getOsProductBySlugMock(slug),
  getOsBrands: () => getOsBrandsMock(),
  getOsCategories: () => getOsCategoriesMock(),
  getOsOccasions: () => getOsOccasionsMock(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return catalog mocks where every KEY_PAGE slug is present — all healthy. */
function setupHealthyCatalog(): void {
  hasOsProductsMock.mockReturnValue(true);
  getOsProductBySlugMock.mockReturnValue({ slug: "pink-roses" });
  getOsBrandsMock.mockReturnValue([{ slug: "roses-only" }]);
  getOsCategoriesMock.mockReturnValue([{ slug: "flowers" }]);
  getOsOccasionsMock.mockReturnValue([{ slug: "birthday" }]);
}

/** Return catalog mocks where every KEY_PAGE slug is absent — all stale. */
function setupEmptyCatalog(): void {
  hasOsProductsMock.mockReturnValue(true);
  getOsProductBySlugMock.mockReturnValue(null);
  getOsBrandsMock.mockReturnValue([]);
  getOsCategoriesMock.mockReturnValue([]);
  getOsOccasionsMock.mockReturnValue([]);
}

// ── Minimal fetch stubs for runOnce ──────────────────────────────────────────

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
</head><body></body></html>
`.trim();

// ── Suite: validateKeyPageSlugs ───────────────────────────────────────────────

describe("validateKeyPageSlugs", () => {
  beforeEach(() => {
    sendAlertMock.mockReset();
    loggerWarnMock.mockReset();
    loggerInfoMock.mockReset();
    hasOsProductsMock.mockReset();
    getOsProductBySlugMock.mockReset();
    getOsBrandsMock.mockReset();
    getOsCategoriesMock.mockReset();
    getOsOccasionsMock.mockReset();
    __resetForTest();
  });

  it("is a no-op when the OS cache is not yet populated", async () => {
    hasOsProductsMock.mockReturnValue(false);

    await validateKeyPageSlugs();

    expect(sendAlertMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).not.toHaveBeenCalled();
    // One info log explaining the skip
    expect(loggerInfoMock).toHaveBeenCalledOnce();
    expect(loggerInfoMock.mock.calls[0]).toEqual(
      expect.arrayContaining([
        expect.stringContaining("OS catalog not yet populated"),
      ]),
    );
  });

  it("logs a WARN and sends a Slack alert on first stale detection", async () => {
    setupEmptyCatalog();

    await validateKeyPageSlugs();

    // One WARN per stale slug (product, brand, category, occasion)
    expect(loggerWarnMock).toHaveBeenCalledTimes(4);
    const warnMessages = loggerWarnMock.mock.calls.map((c) => c[1] as string);
    expect(warnMessages.some((m) => m.includes("product slug not found"))).toBe(true);
    expect(warnMessages.some((m) => m.includes("brand slug not found"))).toBe(true);
    expect(warnMessages.some((m) => m.includes("category slug not found"))).toBe(true);
    expect(warnMessages.some((m) => m.includes("occasion slug not found"))).toBe(true);

    // Exactly one Slack alert bundling all stale slugs
    expect(sendAlertMock).toHaveBeenCalledOnce();
    const alert = sendAlertMock.mock.calls[0][0];
    expect(alert.severity).toBe("warn");
    expect(alert.title).toMatch(/KEY_PAGES slug\(s\) missing/);
    expect(alert.body).toMatch(/pink-roses/);
    expect(alert.body).toMatch(/roses-only/);
    expect(alert.body).toMatch(/flowers/);
    expect(alert.body).toMatch(/birthday/);
  });

  it("does not send a duplicate Slack alert on a second call with the same stale slugs", async () => {
    setupEmptyCatalog();

    await validateKeyPageSlugs();
    expect(sendAlertMock).toHaveBeenCalledOnce();

    // Reset call counters but keep module state (staleSlugs remain set)
    sendAlertMock.mockReset();
    loggerWarnMock.mockReset();

    await validateKeyPageSlugs();

    // Slugs were already marked stale — no new WARN logs, no new Slack alert
    expect(loggerWarnMock).not.toHaveBeenCalled();
    expect(sendAlertMock).not.toHaveBeenCalled();
  });

  it("clears staleSlugs and logs info recovery when a slug reappears in the catalog", async () => {
    // First pass: mark all slugs as stale
    setupEmptyCatalog();
    await validateKeyPageSlugs();
    expect(sendAlertMock).toHaveBeenCalledOnce();

    sendAlertMock.mockReset();
    loggerWarnMock.mockReset();
    loggerInfoMock.mockReset();

    // Second pass: catalog is now healthy — slugs should be recovered
    setupHealthyCatalog();
    await validateKeyPageSlugs();

    // No new stale alert
    expect(sendAlertMock).not.toHaveBeenCalled();
    // Recovery info log for each previously-stale slug
    const infoCalls = loggerInfoMock.mock.calls.map((c) => c[1] as string);
    expect(infoCalls.some((m) => m.includes("now live in OS catalog"))).toBe(true);
    expect(infoCalls.filter((m) => m.includes("now live in OS catalog")).length).toBe(4);
  });

  it("sends a fresh Slack alert if a recovered slug later goes stale again", async () => {
    // 1. Mark all stale
    setupEmptyCatalog();
    await validateKeyPageSlugs();
    expect(sendAlertMock).toHaveBeenCalledOnce();

    sendAlertMock.mockReset();

    // 2. Recover
    setupHealthyCatalog();
    await validateKeyPageSlugs();
    expect(sendAlertMock).not.toHaveBeenCalled();

    // 3. Go stale again — should fire a new alert
    setupEmptyCatalog();
    await validateKeyPageSlugs();
    expect(sendAlertMock).toHaveBeenCalledOnce();
  });
});

// ── Suite: audit detail annotation ───────────────────────────────────────────
//
// When a page's slug is in staleSlugs, a fetch-fail for that page is annotated
// with "slug not found in catalog — update KEY_PAGES" instead of the generic
// "could not fetch page" message, both in the scheduled `runOnce` digest and in
// the on-demand `runAuditNow` path.

describe("runOnce — stale-slug annotation in Slack alert", () => {
  beforeEach(() => {
    sendAlertMock.mockReset();
    loggerWarnMock.mockReset();
    loggerInfoMock.mockReset();
    hasOsProductsMock.mockReset();
    getOsProductBySlugMock.mockReset();
    getOsBrandsMock.mockReset();
    getOsCategoriesMock.mockReset();
    getOsOccasionsMock.mockReset();
    __resetForTest();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("annotates fetch-failed pages whose slug is stale with 'slug not found in catalog'", async () => {
    // Catalog: product slug is stale; everything else is healthy
    hasOsProductsMock.mockReturnValue(true);
    getOsProductBySlugMock.mockReturnValue(null); // "pink-roses" not found
    getOsBrandsMock.mockReturnValue([{ slug: "roses-only" }]);
    getOsCategoriesMock.mockReturnValue([{ slug: "flowers" }]);
    getOsOccasionsMock.mockReturnValue([{ slug: "birthday" }]);

    // Pages: product pages return 404 (fetchFailed), all others return healthy HTML
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (init?.method === "HEAD") return Promise.resolve(makeResponse(true));
        if (url.includes("/product/")) return Promise.resolve(makeResponse(false));
        return Promise.resolve(makeResponse(true, HEALTHY_HTML));
      }),
    );

    await runOnce();

    // At least one alert should have been sent (product pages are failing)
    expect(sendAlertMock).toHaveBeenCalled();

    // The SEO health digest is the alert sourced from "seoAuditMonitor" (not the slug alert)
    const digestAlert = sendAlertMock.mock.calls.find(
      (c) => c[0].source === "seoAuditMonitor",
    )?.[0];
    expect(digestAlert).toBeDefined();
    expect(digestAlert.body).toMatch(/slug not found in catalog — update KEY_PAGES/);
  });

  it("does NOT annotate a generic fetch-fail whose slug is healthy in the catalog", async () => {
    // All slugs are healthy — fetch failures are real errors, not stale slugs
    setupHealthyCatalog();

    // All page fetches fail (genuine network error simulation)
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        if (init?.method === "HEAD") return Promise.resolve(makeResponse(true));
        return Promise.resolve(makeResponse(false));
      }),
    );

    await runOnce();

    const digestAlert = sendAlertMock.mock.calls.find(
      (c) => c[0].source === "seoAuditMonitor",
    )?.[0];
    expect(digestAlert).toBeDefined();
    expect(digestAlert.body).not.toMatch(/slug not found in catalog/);
    expect(digestAlert.body).toMatch(/could not fetch page/);
  });
});
