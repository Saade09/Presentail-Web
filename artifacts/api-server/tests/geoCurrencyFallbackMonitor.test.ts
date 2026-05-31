import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runOnce, __resetForTest, type CountFallbacksFn } from "../src/lib/geoCurrencyFallbackMonitor";

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

// ── Helpers ───────────────────────────────────────────────────────────────────

const THRESHOLD = 50; // matches GEO_CURRENCY_FALLBACK_COUNT_MAX default

/**
 * Pin the clock to a known moment and return both the ms timestamp
 * and a CountFallbacksFn that always returns `count`.
 */
function makeCounter(count: number): CountFallbacksFn {
  return (_startMs: number, _endMs: number) => Promise.resolve(count);
}

// A fixed "now" timestamp at the start of a UTC hour so the prior-hour
// window is deterministic across all tests.
const NOW_MS = new Date("2026-05-31T15:00:00Z").getTime();
const PRIOR_HOUR_KEY = "2026-05-31T14"; // the hour evaluated at NOW_MS

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("geoCurrencyFallbackMonitor — runOnce", () => {
  beforeEach(() => {
    sendAlertMock.mockReset();
    __resetForTest();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Below threshold — no alert ────────────────────────────────────────────

  it("does not fire an alert when fallback count is 0", async () => {
    await runOnce(makeCounter(0), NOW_MS);
    expect(sendAlertMock).not.toHaveBeenCalled();
  });

  it("does not fire an alert when fallback count is below the threshold", async () => {
    await runOnce(makeCounter(THRESHOLD - 1), NOW_MS);
    expect(sendAlertMock).not.toHaveBeenCalled();
  });

  it("does not fire an alert when fallback count is 1 below the threshold", async () => {
    await runOnce(makeCounter(THRESHOLD - 1), NOW_MS);
    expect(sendAlertMock).not.toHaveBeenCalled();
  });

  // ── At and above threshold — alert fires ─────────────────────────────────

  it("fires an alert when fallback count reaches the threshold", async () => {
    await runOnce(makeCounter(THRESHOLD), NOW_MS);
    expect(sendAlertMock).toHaveBeenCalledOnce();
  });

  it("fires an alert when fallback count exceeds the threshold", async () => {
    await runOnce(makeCounter(THRESHOLD + 100), NOW_MS);
    expect(sendAlertMock).toHaveBeenCalledOnce();
  });

  // ── Alert shape ───────────────────────────────────────────────────────────

  it("alert has the correct source, severity, and title", async () => {
    await runOnce(makeCounter(THRESHOLD), NOW_MS);
    const alert = sendAlertMock.mock.calls[0][0];
    expect(alert.source).toBe("geoCurrencyFallbackMonitor");
    expect(alert.severity).toBe("warn");
    expect(alert.title).toMatch(/geolocation fallback/i);
  });

  it("alert body mentions the fallback count", async () => {
    await runOnce(makeCounter(THRESHOLD), NOW_MS);
    const alert = sendAlertMock.mock.calls[0][0];
    expect(alert.body).toMatch(new RegExp(`${THRESHOLD}`));
  });

  it("alert fields include the fallback count, threshold, and evaluated hour", async () => {
    await runOnce(makeCounter(THRESHOLD), NOW_MS);
    const alert = sendAlertMock.mock.calls[0][0];

    const countField = alert.fields.find((f: { title: string }) =>
      f.title.toLowerCase().includes("count"),
    );
    const thresholdField = alert.fields.find((f: { title: string }) =>
      f.title.toLowerCase().includes("threshold"),
    );
    const hourField = alert.fields.find((f: { title: string }) =>
      f.title.toLowerCase().includes("hour"),
    );

    expect(countField?.value).toBe(String(THRESHOLD));
    expect(thresholdField?.value).toMatch(String(THRESHOLD));
    expect(hourField?.value).toContain(PRIOR_HOUR_KEY);
  });

  // ── Deduplication — only one alert per UTC hour ───────────────────────────

  it("does not fire a second alert when called again for the same UTC hour", async () => {
    await runOnce(makeCounter(THRESHOLD), NOW_MS);
    await runOnce(makeCounter(THRESHOLD), NOW_MS);
    expect(sendAlertMock).toHaveBeenCalledOnce();
  });

  it("does not fire a third alert on a third call in the same UTC hour", async () => {
    await runOnce(makeCounter(THRESHOLD + 20), NOW_MS);
    await runOnce(makeCounter(THRESHOLD + 20), NOW_MS);
    await runOnce(makeCounter(THRESHOLD + 20), NOW_MS);
    expect(sendAlertMock).toHaveBeenCalledOnce();
  });

  it("fires a fresh alert on a new UTC hour when threshold is exceeded again", async () => {
    // First hour — alert fires.
    const firstNow = new Date("2026-05-31T15:00:00Z").getTime();
    await runOnce(makeCounter(THRESHOLD), firstNow);
    expect(sendAlertMock).toHaveBeenCalledOnce();

    // Next hour — a new hour key, so a new alert should fire.
    const secondNow = new Date("2026-05-31T16:00:00Z").getTime();
    await runOnce(makeCounter(THRESHOLD), secondNow);
    expect(sendAlertMock).toHaveBeenCalledTimes(2);
  });

  it("does not fire on the next hour if count is below threshold", async () => {
    // First hour — alert fires.
    const firstNow = new Date("2026-05-31T15:00:00Z").getTime();
    await runOnce(makeCounter(THRESHOLD), firstNow);
    expect(sendAlertMock).toHaveBeenCalledOnce();

    // Next hour — count is fine, no alert.
    const secondNow = new Date("2026-05-31T16:00:00Z").getTime();
    await runOnce(makeCounter(THRESHOLD - 1), secondNow);
    expect(sendAlertMock).toHaveBeenCalledOnce();
  });

  // ── Concurrent run protection ─────────────────────────────────────────────

  it("does not fire duplicate alerts when two calls run concurrently", async () => {
    const [, second] = await Promise.all([
      runOnce(makeCounter(THRESHOLD), NOW_MS),
      runOnce(makeCounter(THRESHOLD), NOW_MS),
    ]);
    void second;
    expect(sendAlertMock).toHaveBeenCalledOnce();
  });

  // ── UTC hour window boundary ──────────────────────────────────────────────

  it("evaluates the prior full UTC hour, not the current partial hour", async () => {
    // Capture the window passed to the counter so we can assert it spans exactly 1 h.
    let capturedStart = 0;
    let capturedEnd = 0;
    const capturingCounter: CountFallbacksFn = (startMs, endMs) => {
      capturedStart = startMs;
      capturedEnd = endMs;
      return Promise.resolve(0);
    };

    // nowMs is at the top of 15:00 UTC → prior hour is 14:00–15:00 UTC.
    await runOnce(capturingCounter, NOW_MS);

    expect(capturedEnd).toBe(NOW_MS);
    expect(capturedEnd - capturedStart).toBe(60 * 60 * 1000);
    expect(new Date(capturedStart).toISOString()).toBe("2026-05-31T14:00:00.000Z");
    expect(new Date(capturedEnd).toISOString()).toBe("2026-05-31T15:00:00.000Z");
  });
});
