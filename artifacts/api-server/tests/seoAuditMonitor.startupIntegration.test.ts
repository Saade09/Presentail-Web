/**
 * Integration tests for the startup-time catalog validation path in
 * `seoAuditMonitor`.
 *
 * These tests use the REAL `registerOnFirstPopulatedCallback`,
 * `__triggerFirstPopulatedForTest`, and `__resetFirstPopulatedForTest`
 * exports from `osProductsCache` so that the callback mechanism itself is
 * exercised end-to-end: `startSeoAuditMonitor` registers `validateKeyPageSlugs`
 * as the first-population callback; when the OS cache transitions to populated
 * the callback fires, `validateKeyPageSlugs` runs, and (if the catalog has
 * empty entity types) a Slack alert is sent exactly once.
 *
 * The individual cache-query functions (hasOsProducts, getOsProducts, etc.)
 * are controlled via spies so we can simulate healthy vs. empty catalogs
 * without a real OS fetch.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  registerOnFirstPopulatedCallback,
  __resetFirstPopulatedForTest,
  __triggerFirstPopulatedForTest,
} from "../src/lib/osProductsCache";
import {
  validateKeyPageSlugs,
  __resetForTest,
} from "../src/lib/seoAuditMonitor";

// ── Mocks ────────────────────────────────────────────────────────────────────

const sendAlertMock = vi.fn();

vi.mock("../src/lib/alerts", () => ({
  sendAlert: (...args: any[]) => sendAlertMock(...args),
}));

vi.mock("../src/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Partial mock for osProductsCache ─────────────────────────────────────────
//
// We keep the REAL callback mechanism (registerOnFirstPopulatedCallback,
// __triggerFirstPopulatedForTest, __resetFirstPopulatedForTest) and stub only
// the catalog-query functions used by validateKeyPageSlugs so tests can control
// which entity types appear populated.

const hasOsProductsMock = vi.fn<() => boolean>();
const getOsProductsMock = vi.fn<() => Array<{ id: string }> | null>();
const getOsBrandsMock = vi.fn<() => Array<{ slug: string }> | null>();
const getOsCategoriesMock = vi.fn<() => Array<{ slug: string }> | null>();
const getOsOccasionsMock = vi.fn<() => Array<{ slug: string }> | null>();

vi.mock("../src/lib/osProductsCache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/osProductsCache")>();
  return {
    ...actual,
    hasOsProducts: () => hasOsProductsMock(),
    getOsProducts: () => getOsProductsMock(),
    getOsBrands: () => getOsBrandsMock(),
    getOsCategories: () => getOsCategoriesMock(),
    getOsOccasions: () => getOsOccasionsMock(),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function setupEmptyCatalog(): void {
  hasOsProductsMock.mockReturnValue(true);
  getOsProductsMock.mockReturnValue([]);
  getOsBrandsMock.mockReturnValue([]);
  getOsCategoriesMock.mockReturnValue([]);
  getOsOccasionsMock.mockReturnValue([]);
}

function setupHealthyCatalog(): void {
  hasOsProductsMock.mockReturnValue(true);
  getOsProductsMock.mockReturnValue([{ id: "red-roses" }]);
  getOsBrandsMock.mockReturnValue([{ slug: "bloom-studio" }]);
  getOsCategoriesMock.mockReturnValue([{ slug: "flowers" }]);
  getOsOccasionsMock.mockReturnValue([{ slug: "birthday" }]);
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("startup-time integration: first-population callback + validateKeyPageSlugs", () => {
  beforeEach(() => {
    sendAlertMock.mockReset();
    hasOsProductsMock.mockReset();
    getOsProductsMock.mockReset();
    getOsBrandsMock.mockReset();
    getOsCategoriesMock.mockReset();
    getOsOccasionsMock.mockReset();
    // Reset both the seoAuditMonitor dedup state and the osProductsCache
    // first-populated state so each test starts from a clean server-boot.
    __resetForTest();
    __resetFirstPopulatedForTest();
  });

  afterEach(() => {
    __resetFirstPopulatedForTest();
  });

  it("fires a Slack alert exactly once when the catalog is empty at first OS cache population", async () => {
    // Simulate what startSeoAuditMonitor does: register validateKeyPageSlugs
    // as the first-population callback.
    registerOnFirstPopulatedCallback(() =>
      validateKeyPageSlugs().catch(() => undefined),
    );

    // Catalog has empty entity types (e.g. brands endpoint returned nothing).
    setupEmptyCatalog();

    // Simulate the OS cache first populating (mirrors fetchAndStore firing the
    // callback after its first successful product fetch).
    __triggerFirstPopulatedForTest();

    // Allow the microtask / promise chain to settle.
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(sendAlertMock).toHaveBeenCalledOnce();
    const alert = sendAlertMock.mock.calls[0][0];
    expect(alert.severity).toBe("warn");
    expect(alert.title).toMatch(/OS catalog missing entries/);
    expect(alert.source).toBe("seoAuditMonitor.validateKeyPageSlugs");
  });

  it("does NOT fire a second alert when the callback triggers again on a subsequent OS fetch (dedup)", async () => {
    registerOnFirstPopulatedCallback(() =>
      validateKeyPageSlugs().catch(() => undefined),
    );
    setupEmptyCatalog();

    // First population → alert fires.
    __triggerFirstPopulatedForTest();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(sendAlertMock).toHaveBeenCalledOnce();

    // Subsequent calls to validateKeyPageSlugs (hourly ticks, manual calls)
    // must NOT re-fire the alert while the catalog remains empty.
    sendAlertMock.mockReset();
    await validateKeyPageSlugs();
    expect(sendAlertMock).not.toHaveBeenCalled();

    await validateKeyPageSlugs();
    expect(sendAlertMock).not.toHaveBeenCalled();
  });

  it("does NOT fire an alert when the catalog is healthy at first OS cache population", async () => {
    registerOnFirstPopulatedCallback(() =>
      validateKeyPageSlugs().catch(() => undefined),
    );
    setupHealthyCatalog();

    __triggerFirstPopulatedForTest();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(sendAlertMock).not.toHaveBeenCalled();
  });

  it("fires an alert on the very first trigger even if the callback was registered before the catalog state was set", async () => {
    // Register the callback before setting up the catalog — simulates the
    // real ordering where startSeoAuditMonitor runs before fetchAndStore
    // has completed.
    registerOnFirstPopulatedCallback(() =>
      validateKeyPageSlugs().catch(() => undefined),
    );

    // Catalog is set up right before the trigger (mirroring fetchAndStore
    // updating the cache before firing the callback).
    setupEmptyCatalog();
    __triggerFirstPopulatedForTest();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(sendAlertMock).toHaveBeenCalledOnce();
  });

  it("fires the callback immediately (via microtask) when the cache is already warm at registration time", async () => {
    // Simulate the edge case where the cache populated before
    // startSeoAuditMonitor ran (e.g. monitor started late).
    setupEmptyCatalog();
    __triggerFirstPopulatedForTest(); // marks cache as first-populated

    // Reset seo alert state but not the first-populated flag.
    __resetForTest();
    sendAlertMock.mockReset();

    // Now register — should fire asynchronously because firstPopulatedFired=true.
    registerOnFirstPopulatedCallback(() =>
      validateKeyPageSlugs().catch(() => undefined),
    );

    // Not yet fired (async scheduling).
    expect(sendAlertMock).not.toHaveBeenCalled();

    // After microtask queue drains the callback runs.
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(sendAlertMock).toHaveBeenCalledOnce();
  });

  it("callback fires exactly once even if __triggerFirstPopulatedForTest is called multiple times", async () => {
    registerOnFirstPopulatedCallback(() =>
      validateKeyPageSlugs().catch(() => undefined),
    );
    setupEmptyCatalog();

    __triggerFirstPopulatedForTest();
    __triggerFirstPopulatedForTest();
    __triggerFirstPopulatedForTest();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(sendAlertMock).toHaveBeenCalledOnce();
  });
});
