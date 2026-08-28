import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getInFlightWorkerExecutions,
} from "./inFlightWorkerExecutions";

const gates = vi.hoisted(() => ({
  resolveFxAlert: null as (() => void) | null,
  resolveWooSync: null as (() => void) | null,
  wooSyncCalls: 0,
}));

vi.mock("./alerts", () => ({
  sendAlert: vi.fn(() => new Promise<void>((resolve) => {
    gates.resolveFxAlert = resolve;
  })),
}));

vi.mock("./fx", () => ({
  getFxStatus: () => ({
    source: "fallback",
    consecutiveFailures: 12,
    lastLiveAt: 0,
  }),
}));

vi.mock("./wooStore", () => ({
  resolveStore: () => ({ consumerKey: "test-key" }),
}));

vi.mock("./customerSync", () => ({
  reconcileCustomersForStore: vi.fn(() => {
    gates.wooSyncCalls += 1;
    if (gates.wooSyncCalls > 1) return Promise.resolve(0);
    return new Promise<number>((resolve) => {
      gates.resolveWooSync = () => resolve(0);
    });
  }),
}));

vi.mock("./osProductsCache", () => ({
  getOsProductHash: () => "",
  invalidateOsProductsCache: vi.fn(),
  persistDailySnapshotIfNeeded: vi.fn(async () => {}),
}));

vi.mock("./osLocationsCache", () => ({
  consumeLocationsChanged: () => false,
}));

vi.mock("./expoPush", () => ({
  sendExpoPush: vi.fn(async () => ({ sent: 0, invalidTokens: [] })),
}));

describe("scheduled worker execution instrumentation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("WOO_SYNC_ENABLED", "true");
    gates.wooSyncCalls = 0;
    gates.resolveWooSync = null;
    gates.resolveFxAlert = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("tracks an admitted representative legacy monitor until it settles", async () => {
    const { startFxRatesFallbackMonitor, stopFxRatesFallbackMonitor, __resetForTest } =
      await import("./fxRatesFallbackMonitor");
    __resetForTest();
    startFxRatesFallbackMonitor();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(getInFlightWorkerExecutions().map(({ name }) => name)).toContain(
      "fx-rates-fallback",
    );

    gates.resolveFxAlert?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(getInFlightWorkerExecutions()).toEqual([]);
    stopFxRatesFallbackMonitor();
  });

  it("tracks an admitted Woo sync until it settles", async () => {
    const { startWooSyncWorker, stopWooSyncWorker } = await import("./wooSync");
    startWooSyncWorker();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(getInFlightWorkerExecutions().map(({ name }) => name)).toContain(
      "woo-sync",
    );

    gates.resolveWooSync?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(getInFlightWorkerExecutions()).toEqual([]);
    stopWooSyncWorker();
  });
});