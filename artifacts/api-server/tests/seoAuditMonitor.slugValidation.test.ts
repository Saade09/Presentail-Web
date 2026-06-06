import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  validateKeyPageSlugs,
  buildKeyPages,
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
const getOsProductsMock = vi.fn<[], Array<{ id: string }> | null>();
const getOsBrandsMock = vi.fn<[], Array<{ slug: string }>>();
const getOsCategoriesMock = vi.fn<[], Array<{ slug: string }>>();
const getOsOccasionsMock = vi.fn<[], Array<{ slug: string }>>();

vi.mock("../src/lib/osProductsCache", () => ({
  hasOsProducts: () => hasOsProductsMock(),
  getOsProducts: () => getOsProductsMock(),
  getOsBrands: () => getOsBrandsMock(),
  getOsCategories: () => getOsCategoriesMock(),
  getOsOccasions: () => getOsOccasionsMock(),
  // seoAuditMonitor imports this but tests exercise validateKeyPageSlugs
  // directly; the callback mechanism is covered by the integration test suite.
  registerOnFirstPopulatedCallback: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Catalog where all entity types have at least one entry. */
function setupHealthyCatalog(): void {
  hasOsProductsMock.mockReturnValue(true);
  getOsProductsMock.mockReturnValue([{ id: "red-roses" }]);
  getOsBrandsMock.mockReturnValue([{ slug: "bloom-studio" }]);
  getOsCategoriesMock.mockReturnValue([{ slug: "flowers" }]);
  getOsOccasionsMock.mockReturnValue([{ slug: "birthday" }]);
}

/** Catalog where every entity type is empty. */
function setupEmptyCatalog(): void {
  hasOsProductsMock.mockReturnValue(true);
  getOsProductsMock.mockReturnValue([]);
  getOsBrandsMock.mockReturnValue([]);
  getOsCategoriesMock.mockReturnValue([]);
  getOsOccasionsMock.mockReturnValue([]);
}

/** Minimal fetch stubs for runOnce tests. */
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

// ── Suite: validateKeyPageSlugs (catalog coverage check) ─────────────────────

describe("validateKeyPageSlugs", () => {
  beforeEach(() => {
    sendAlertMock.mockReset();
    loggerWarnMock.mockReset();
    loggerInfoMock.mockReset();
    hasOsProductsMock.mockReset();
    getOsProductsMock.mockReset();
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
    expect(loggerInfoMock).toHaveBeenCalledOnce();
    expect(loggerInfoMock.mock.calls[0]).toEqual(
      expect.arrayContaining([
        expect.stringContaining("OS catalog not yet populated"),
      ]),
    );
  });

  it("is a no-op when all entity types have entries", async () => {
    setupHealthyCatalog();

    await validateKeyPageSlugs();

    expect(sendAlertMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });

  it("logs a WARN and sends a Slack alert when all entity types are empty", async () => {
    setupEmptyCatalog();

    await validateKeyPageSlugs();

    expect(loggerWarnMock).toHaveBeenCalledOnce();
    const [, msg] = loggerWarnMock.mock.calls[0];
    expect(msg).toMatch(/no entries for some entity types/);

    expect(sendAlertMock).toHaveBeenCalledOnce();
    const alert = sendAlertMock.mock.calls[0][0];
    expect(alert.severity).toBe("warn");
    expect(alert.title).toMatch(/OS catalog missing entries/);
    expect(alert.body).toMatch(/products/);
    expect(alert.body).toMatch(/brands/);
    expect(alert.body).toMatch(/categories/);
    expect(alert.body).toMatch(/occasions/);
    expect(alert.source).toBe("seoAuditMonitor.validateKeyPageSlugs");
  });

  it("alerts when only one entity type is empty (e.g. brands)", async () => {
    hasOsProductsMock.mockReturnValue(true);
    getOsProductsMock.mockReturnValue([{ id: "red-roses" }]);
    getOsBrandsMock.mockReturnValue([]); // empty
    getOsCategoriesMock.mockReturnValue([{ slug: "flowers" }]);
    getOsOccasionsMock.mockReturnValue([{ slug: "birthday" }]);

    await validateKeyPageSlugs();

    expect(sendAlertMock).toHaveBeenCalledOnce();
    const alert = sendAlertMock.mock.calls[0][0];
    expect(alert.body).toMatch(/brands/);
    expect(alert.body).not.toMatch(/products,/);
  });

  it("does not send a duplicate alert on a second call with the same empty catalog", async () => {
    setupEmptyCatalog();

    await validateKeyPageSlugs();
    expect(sendAlertMock).toHaveBeenCalledOnce();

    sendAlertMock.mockReset();
    loggerWarnMock.mockReset();

    await validateKeyPageSlugs();

    expect(loggerWarnMock).not.toHaveBeenCalled();
    expect(sendAlertMock).not.toHaveBeenCalled();
  });

  it("logs recovery when a previously-empty catalog becomes fully populated", async () => {
    setupEmptyCatalog();
    await validateKeyPageSlugs();
    expect(sendAlertMock).toHaveBeenCalledOnce();

    sendAlertMock.mockReset();
    loggerInfoMock.mockReset();

    setupHealthyCatalog();
    await validateKeyPageSlugs();

    expect(sendAlertMock).not.toHaveBeenCalled();
    const infoCalls = loggerInfoMock.mock.calls.map((c) => c[0] as string);
    expect(infoCalls.some((m) => m.includes("catalog coverage restored"))).toBe(true);
  });

  it("fires a fresh alert after a catalog recovers then goes empty again", async () => {
    setupEmptyCatalog();
    await validateKeyPageSlugs();
    expect(sendAlertMock).toHaveBeenCalledOnce();

    sendAlertMock.mockReset();
    setupHealthyCatalog();
    await validateKeyPageSlugs();
    expect(sendAlertMock).not.toHaveBeenCalled();

    setupEmptyCatalog();
    await validateKeyPageSlugs();
    expect(sendAlertMock).toHaveBeenCalledOnce();
  });
});

// ── Suite: buildKeyPages ──────────────────────────────────────────────────────

describe("buildKeyPages", () => {
  beforeEach(() => {
    hasOsProductsMock.mockReset();
    getOsProductsMock.mockReset();
    getOsBrandsMock.mockReset();
    getOsCategoriesMock.mockReset();
    getOsOccasionsMock.mockReset();
  });

  it("returns null when the OS cache is not populated", () => {
    hasOsProductsMock.mockReturnValue(false);

    expect(buildKeyPages()).toBeNull();
  });

  it("returns null when a required entity type has no entries", () => {
    hasOsProductsMock.mockReturnValue(true);
    getOsProductsMock.mockReturnValue([]); // no products
    getOsBrandsMock.mockReturnValue([{ slug: "bloom-studio" }]);
    getOsCategoriesMock.mockReturnValue([{ slug: "flowers" }]);
    getOsOccasionsMock.mockReturnValue([{ slug: "birthday" }]);

    expect(buildKeyPages()).toBeNull();
  });

  it("returns null when brands are empty", () => {
    hasOsProductsMock.mockReturnValue(true);
    getOsProductsMock.mockReturnValue([{ id: "red-roses" }]);
    getOsBrandsMock.mockReturnValue([]);
    getOsCategoriesMock.mockReturnValue([{ slug: "flowers" }]);
    getOsOccasionsMock.mockReturnValue([{ slug: "birthday" }]);

    expect(buildKeyPages()).toBeNull();
  });

  it("builds pages using up to 3 slugs per entity type", () => {
    hasOsProductsMock.mockReturnValue(true);
    getOsProductsMock.mockReturnValue([{ id: "red-roses" }, { id: "white-tulips" }]);
    getOsBrandsMock.mockReturnValue([{ slug: "bloom-studio" }, { slug: "other-brand" }]);
    getOsCategoriesMock.mockReturnValue([{ slug: "flowers" }, { slug: "plants" }]);
    getOsOccasionsMock.mockReturnValue([{ slug: "birthday" }, { slug: "anniversary" }]);

    const pages = buildKeyPages();

    expect(pages).not.toBeNull();
    // 3 countries × (3 homepages + 3 products + 3 brands
    //   + 4 category pages [slug[0]×3 locales + slug[1]×EN only]
    //   + 4 occasion pages [slug[0]×3 locales + slug[1]×EN only])
    // = 3 × 17 = 51
    expect(pages!.length).toBe(51);

    // Product slug is the id of the first product only (brands keep 1 slug)
    const productPages = pages!.filter((p) => p.url.includes("/product/"));
    expect(productPages.every((p) => p.url.includes("/product/red-roses"))).toBe(true);

    // Brand slug — only the first brand slug is used
    const brandPages = pages!.filter((p) => p.url.includes("/brand/"));
    expect(brandPages.every((p) => p.url.includes("/brand/bloom-studio"))).toBe(true);

    // Category slugs — clean path URLs (not query params); slug[0] + slug[1] both present
    const categoryPages = pages!.filter((p) => p.url.includes("/category/"));
    expect(categoryPages.some((p) => p.url.includes("/category/flowers"))).toBe(true);
    expect(categoryPages.some((p) => p.url.includes("/category/plants"))).toBe(true);
    // slug[0] has all 3 locales × 3 countries = 9; slug[1] has EN only × 3 countries = 3
    expect(categoryPages.filter((p) => p.url.includes("/category/flowers")).length).toBe(9);
    expect(categoryPages.filter((p) => p.url.includes("/category/plants")).length).toBe(3);

    // Occasion slugs — clean path URLs; slug[0] + slug[1] both present
    const occasionPages = pages!.filter((p) => p.url.includes("/occasion/"));
    expect(occasionPages.some((p) => p.url.includes("/occasion/birthday"))).toBe(true);
    expect(occasionPages.some((p) => p.url.includes("/occasion/anniversary"))).toBe(true);
    expect(occasionPages.filter((p) => p.url.includes("/occasion/birthday")).length).toBe(9);
    expect(occasionPages.filter((p) => p.url.includes("/occasion/anniversary")).length).toBe(3);
  });

  it("covers all three countries (LB, AE, CY) with all three language variants", () => {
    setupHealthyCatalog();

    const pages = buildKeyPages()!;
    const locales = [...new Set(pages.map((p) => p.locale))];
    expect(locales.sort()).toEqual(["AE", "CY", "LB"]);

    const lbPages = pages.filter((p) => p.locale === "LB");
    const labels = lbPages.map((p) => p.label);
    expect(labels).toContain("Homepage (EN)");
    expect(labels).toContain("Homepage (AR)");
    expect(labels).toContain("Homepage (FR)");
    expect(labels).toContain("Product (EN)");
    expect(labels).toContain("Brand (AR)");
    expect(labels).toContain("Category (FR)");
    expect(labels).toContain("Occasion (EN)");
  });

  it("uses the new slugs immediately when the catalog changes between calls", () => {
    hasOsProductsMock.mockReturnValue(true);
    getOsProductsMock.mockReturnValue([{ id: "red-roses" }]);
    getOsBrandsMock.mockReturnValue([{ slug: "bloom-studio" }]);
    getOsCategoriesMock.mockReturnValue([{ slug: "flowers" }]);
    getOsOccasionsMock.mockReturnValue([{ slug: "birthday" }]);

    const first = buildKeyPages()!;
    expect(first.some((p) => p.url.includes("red-roses"))).toBe(true);

    // Catalog changes — new first product
    getOsProductsMock.mockReturnValue([{ id: "white-tulips" }]);

    const second = buildKeyPages()!;
    expect(second.some((p) => p.url.includes("white-tulips"))).toBe(true);
    expect(second.some((p) => p.url.includes("red-roses"))).toBe(false);
  });
});

// ── Suite: startup-time validation ───────────────────────────────────────────
//
// Verifies that `validateKeyPageSlugs` behaves correctly when called eagerly
// at startup (as `startSeoAuditMonitor` now does in the 90-second baseline
// timer), rather than only on the hourly interval tick.

describe("startup-time validation", () => {
  beforeEach(() => {
    sendAlertMock.mockReset();
    loggerWarnMock.mockReset();
    loggerInfoMock.mockReset();
    hasOsProductsMock.mockReset();
    getOsProductsMock.mockReset();
    getOsBrandsMock.mockReset();
    getOsCategoriesMock.mockReset();
    getOsOccasionsMock.mockReset();
    __resetForTest();
  });

  it("fires the Slack alert exactly once when an empty catalog is detected at startup", async () => {
    // Simulate the OS cache having just populated with missing entity types
    // (e.g. a deploy that shipped with a broken catalog endpoint).
    setupEmptyCatalog();

    // Startup-time eager call (mirrors what startSeoAuditMonitor now does in
    // the 90-second baseline timer instead of only in the hourly setInterval).
    await validateKeyPageSlugs();

    expect(sendAlertMock).toHaveBeenCalledOnce();
    const alert = sendAlertMock.mock.calls[0][0];
    expect(alert.severity).toBe("warn");
    expect(alert.title).toMatch(/OS catalog missing entries/);
    expect(alert.source).toBe("seoAuditMonitor.validateKeyPageSlugs");
  });

  it("deduplicates on all subsequent hourly ticks after the startup alert", async () => {
    setupEmptyCatalog();

    // Startup eager call fires the alert.
    await validateKeyPageSlugs();
    expect(sendAlertMock).toHaveBeenCalledOnce();

    // Hourly ticks with the same empty catalog must NOT re-fire.
    for (let tick = 1; tick <= 3; tick++) {
      sendAlertMock.mockReset();
      loggerWarnMock.mockReset();
      await validateKeyPageSlugs();
      expect(sendAlertMock).not.toHaveBeenCalled();
      expect(loggerWarnMock).not.toHaveBeenCalled();
    }
  });

  it("is a no-op at startup when the OS cache is not yet populated and does not fire an alert", async () => {
    // The OS cache may not have responded yet by the time the 90-second timer
    // fires if OS is slow. validateKeyPageSlugs must skip gracefully so the
    // hourly tick can catch it later once the cache is warm.
    hasOsProductsMock.mockReturnValue(false);

    await validateKeyPageSlugs();

    expect(sendAlertMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });

  it("fires a fresh alert after catalog recovers and then empties again (across restarts)", async () => {
    // First boot: empty catalog → alert fires.
    setupEmptyCatalog();
    await validateKeyPageSlugs();
    expect(sendAlertMock).toHaveBeenCalledOnce();

    // Catalog recovers (next polling tick populates data).
    sendAlertMock.mockReset();
    setupHealthyCatalog();
    await validateKeyPageSlugs();
    expect(sendAlertMock).not.toHaveBeenCalled();

    // Second startup (process restart clears module state via __resetForTest,
    // which mirrors what NODE_ENV=test cleanup does). Catalog is empty again.
    sendAlertMock.mockReset();
    __resetForTest();
    setupEmptyCatalog();
    await validateKeyPageSlugs();
    expect(sendAlertMock).toHaveBeenCalledOnce();
  });
});

// ── Suite: runOnce skips gracefully when catalog is empty ─────────────────────

describe("runOnce — catalog not ready", () => {
  beforeEach(() => {
    sendAlertMock.mockReset();
    loggerWarnMock.mockReset();
    loggerInfoMock.mockReset();
    hasOsProductsMock.mockReset();
    getOsProductsMock.mockReset();
    getOsBrandsMock.mockReset();
    getOsCategoriesMock.mockReset();
    getOsOccasionsMock.mockReset();
    __resetForTest();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips the audit and does not fire a Slack alert when buildKeyPages returns null", async () => {
    hasOsProductsMock.mockReturnValue(false); // catalog not ready

    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(makeResponse(true, HEALTHY_HTML))));

    await runOnce();

    expect(sendAlertMock).not.toHaveBeenCalled();

    // logger.info({...}, "message") — the message is the second argument (index 1)
    const infoMessages = loggerInfoMock.mock.calls.map((c) => c[1] as string ?? c[0] as string);
    expect(infoMessages.some((m) => typeof m === "string" && m.includes("catalog not ready"))).toBe(true);
  });

  it("runs the audit when the catalog becomes ready on a subsequent tick", async () => {
    // First tick: catalog not ready → skip
    hasOsProductsMock.mockReturnValue(false);
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(makeResponse(true, HEALTHY_HTML))));

    await runOnce();
    expect(sendAlertMock).not.toHaveBeenCalled();

    // Second tick: catalog ready → audit runs (all pages healthy → no alert)
    __resetForTest();
    setupHealthyCatalog();
    await runOnce();

    // No failing/warned pages → no alert expected
    expect(sendAlertMock).not.toHaveBeenCalled();
  });
});
