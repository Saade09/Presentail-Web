import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runOnce, __resetForTest } from "../src/lib/fxRatesFallbackMonitor";
import type { FxStatus } from "../src/lib/fx";

// ── Mocks ────────────────────────────────────────────────────────────────────

const sendAlertMock = vi.fn();
const getFxStatusMock = vi.fn<[], FxStatus>();

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

vi.mock("../src/lib/fx", () => ({
  getFxStatus: () => getFxStatusMock(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLiveStatus(overrides: Partial<FxStatus> = {}): FxStatus {
  return {
    source: "live",
    fetchedAt: Date.now(),
    consecutiveFailures: 0,
    lastLiveAt: Date.now(),
    ...overrides,
  };
}

function makeFallbackStatus(
  consecutiveFailures: number,
  lastLiveAt = 0,
): FxStatus {
  return {
    source: "fallback",
    fetchedAt: Date.now(),
    consecutiveFailures,
    lastLiveAt,
  };
}

// Default threshold is 12 consecutive failures (FX_FALLBACK_CONSECUTIVE_FAILURES_MAX).
const THRESHOLD = 12;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("fxRatesFallbackMonitor — runOnce", () => {
  beforeEach(() => {
    sendAlertMock.mockReset();
    getFxStatusMock.mockReset();
    __resetForTest();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── No alert when live rates are healthy ──────────────────────────────────

  it("does not fire an alert when the FX source is 'live'", async () => {
    getFxStatusMock.mockReturnValue(makeLiveStatus());
    await runOnce();
    expect(sendAlertMock).not.toHaveBeenCalled();
  });

  // ── Below threshold — no alert ────────────────────────────────────────────

  it("does not fire an alert when consecutiveFailures is below the threshold", async () => {
    getFxStatusMock.mockReturnValue(makeFallbackStatus(THRESHOLD - 1));
    await runOnce();
    expect(sendAlertMock).not.toHaveBeenCalled();
  });

  it("does not fire an alert when consecutiveFailures is 0", async () => {
    getFxStatusMock.mockReturnValue(makeFallbackStatus(0));
    await runOnce();
    expect(sendAlertMock).not.toHaveBeenCalled();
  });

  it("does not fire an alert when consecutiveFailures is 1 below the threshold", async () => {
    getFxStatusMock.mockReturnValue(makeFallbackStatus(THRESHOLD - 1));
    await runOnce();
    expect(sendAlertMock).not.toHaveBeenCalled();
  });

  // ── At and above threshold — alert fires ─────────────────────────────────

  it("fires an alert when consecutiveFailures reaches the threshold", async () => {
    getFxStatusMock.mockReturnValue(makeFallbackStatus(THRESHOLD));
    await runOnce();
    expect(sendAlertMock).toHaveBeenCalledOnce();
  });

  it("fires an alert when consecutiveFailures exceeds the threshold", async () => {
    getFxStatusMock.mockReturnValue(makeFallbackStatus(THRESHOLD + 5));
    await runOnce();
    expect(sendAlertMock).toHaveBeenCalledOnce();
  });

  it("alert has the correct source, severity, and title", async () => {
    getFxStatusMock.mockReturnValue(makeFallbackStatus(THRESHOLD));
    await runOnce();
    const alert = sendAlertMock.mock.calls[0][0];
    expect(alert.source).toBe("fxRatesFallbackMonitor");
    expect(alert.severity).toBe("warn");
    expect(alert.title).toMatch(/FX rates stuck on fallback/i);
  });

  it("alert body mentions the consecutive failure count", async () => {
    getFxStatusMock.mockReturnValue(makeFallbackStatus(THRESHOLD));
    await runOnce();
    const alert = sendAlertMock.mock.calls[0][0];
    expect(alert.body).toMatch(new RegExp(`${THRESHOLD} consecutive`));
  });

  it("alert fields include the consecutive failure count and threshold", async () => {
    getFxStatusMock.mockReturnValue(makeFallbackStatus(THRESHOLD));
    await runOnce();
    const alert = sendAlertMock.mock.calls[0][0];
    const failureField = alert.fields.find((f: { title: string }) =>
      f.title.toLowerCase().includes("consecutive"),
    );
    const thresholdField = alert.fields.find((f: { title: string }) =>
      f.title.toLowerCase().includes("threshold"),
    );
    expect(failureField?.value).toBe(String(THRESHOLD));
    expect(thresholdField?.value).toMatch(String(THRESHOLD));
  });

  // ── lastLiveAt encoding in the alert ──────────────────────────────────────

  it("reports 'never in this process' when lastLiveAt is 0", async () => {
    getFxStatusMock.mockReturnValue(makeFallbackStatus(THRESHOLD, 0));
    await runOnce();
    const alert = sendAlertMock.mock.calls[0][0];
    const liveField = alert.fields.find((f: { title: string }) =>
      f.title.toLowerCase().includes("last live"),
    );
    expect(liveField?.value).toBe("never in this process");
  });

  it("reports an ISO timestamp in the 'last live fetch' field when lastLiveAt is set", async () => {
    const knownTime = new Date("2026-05-30T08:00:00Z").getTime();
    getFxStatusMock.mockReturnValue(makeFallbackStatus(THRESHOLD, knownTime));
    await runOnce();
    const alert = sendAlertMock.mock.calls[0][0];
    const liveField = alert.fields.find((f: { title: string }) =>
      f.title.toLowerCase().includes("last live"),
    );
    expect(liveField?.value).toBe("2026-05-30T08:00:00.000Z");
  });

  // ── Deduplication — only one alert per failure run / per UTC day ─────────

  it("does not fire a second alert when called again while still in fallback", async () => {
    getFxStatusMock.mockReturnValue(makeFallbackStatus(THRESHOLD));

    await runOnce(); // first call — alert fires
    await runOnce(); // second call — same failure run, no second alert

    expect(sendAlertMock).toHaveBeenCalledOnce();
  });

  it("does not fire a third alert on a third consecutive call in the same failure run", async () => {
    getFxStatusMock.mockReturnValue(makeFallbackStatus(THRESHOLD + 10));

    await runOnce();
    await runOnce();
    await runOnce();

    expect(sendAlertMock).toHaveBeenCalledOnce();
  });

  it("does not double-alert within the same UTC day — alert fires once and stays silent on repeat hourly ticks", async () => {
    // Pin the clock to a known moment early in the day.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-30T06:00:00Z"));

    getFxStatusMock.mockReturnValue(makeFallbackStatus(THRESHOLD));

    // First hourly tick — alert fires.
    await runOnce();
    expect(sendAlertMock).toHaveBeenCalledOnce();

    // Advance 1 hour (still the same UTC day — 07:00 Z).
    vi.setSystemTime(new Date("2026-05-30T07:00:00Z"));
    await runOnce();
    expect(sendAlertMock).toHaveBeenCalledOnce(); // still just one

    // Advance another hour (08:00 Z — still the same UTC day).
    vi.setSystemTime(new Date("2026-05-30T08:00:00Z"));
    await runOnce();
    expect(sendAlertMock).toHaveBeenCalledOnce(); // still just one
  });

  it("fires a fresh alert on the next UTC day if a new failure run starts after overnight recovery", async () => {
    vi.useFakeTimers();

    // 2026-05-30 morning: failure run begins, alert fires.
    vi.setSystemTime(new Date("2026-05-30T06:00:00Z"));
    getFxStatusMock.mockReturnValue(makeFallbackStatus(THRESHOLD));
    await runOnce();
    expect(sendAlertMock).toHaveBeenCalledTimes(1);

    // Same day, later: live rates recover — recovery alert fires.
    vi.setSystemTime(new Date("2026-05-30T12:00:00Z"));
    getFxStatusMock.mockReturnValue(makeLiveStatus());
    await runOnce();
    expect(sendAlertMock).toHaveBeenCalledTimes(2); // failure + recovery

    // Next day: a new failure run crosses the threshold → fresh failure alert.
    vi.setSystemTime(new Date("2026-05-31T06:00:00Z"));
    getFxStatusMock.mockReturnValue(makeFallbackStatus(THRESHOLD));
    await runOnce();
    expect(sendAlertMock).toHaveBeenCalledTimes(3);
  });

  // ── Recovery resets the deduplication guard ───────────────────────────────

  it("resets the alert guard when live rates recover, allowing a fresh alert on the next failure run", async () => {
    // First failure run — alert fires.
    getFxStatusMock.mockReturnValue(makeFallbackStatus(THRESHOLD));
    await runOnce();
    expect(sendAlertMock).toHaveBeenCalledTimes(1);

    // Recovery — source returns to "live" → recovery alert fires, guard resets.
    getFxStatusMock.mockReturnValue(makeLiveStatus());
    await runOnce();
    expect(sendAlertMock).toHaveBeenCalledTimes(2); // failure + recovery

    // Second failure run — guard was reset, so a new failure alert fires.
    getFxStatusMock.mockReturnValue(makeFallbackStatus(THRESHOLD));
    await runOnce();
    expect(sendAlertMock).toHaveBeenCalledTimes(3);
  });

  it("does not alert on recovery when no prior failure alert was sent", async () => {
    getFxStatusMock.mockReturnValue(makeLiveStatus());
    await runOnce();
    await runOnce();
    expect(sendAlertMock).not.toHaveBeenCalled();
  });

  // ── Recovery alert content ────────────────────────────────────────────────

  it("sends a recovery alert with severity 'info' and correct title", async () => {
    getFxStatusMock.mockReturnValue(makeFallbackStatus(THRESHOLD));
    await runOnce();
    expect(sendAlertMock).toHaveBeenCalledTimes(1);

    getFxStatusMock.mockReturnValue(makeLiveStatus());
    await runOnce();
    expect(sendAlertMock).toHaveBeenCalledTimes(2);

    const recoveryAlert = sendAlertMock.mock.calls[1][0];
    expect(recoveryAlert.severity).toBe("info");
    expect(recoveryAlert.title).toMatch(/FX rates recovered/i);
    expect(recoveryAlert.source).toBe("fxRatesFallbackMonitor");
  });

  it("recovery alert body mentions how long the outage lasted", async () => {
    vi.useFakeTimers();

    // Failure alert fires at T=0.
    vi.setSystemTime(new Date("2026-05-30T08:00:00Z"));
    getFxStatusMock.mockReturnValue(makeFallbackStatus(THRESHOLD));
    await runOnce();

    // Recovery observed 2 hours later.
    vi.setSystemTime(new Date("2026-05-30T10:00:00Z"));
    getFxStatusMock.mockReturnValue(makeLiveStatus());
    await runOnce();

    const recoveryAlert = sendAlertMock.mock.calls[1][0];
    expect(recoveryAlert.body).toMatch(/2\.0 h/);
  });

  it("recovery alert includes an outage-duration field", async () => {
    vi.useFakeTimers();

    vi.setSystemTime(new Date("2026-05-30T08:00:00Z"));
    getFxStatusMock.mockReturnValue(makeFallbackStatus(THRESHOLD));
    await runOnce();

    vi.setSystemTime(new Date("2026-05-30T09:30:00Z")); // 1.5 h later
    getFxStatusMock.mockReturnValue(makeLiveStatus());
    await runOnce();

    const recoveryAlert = sendAlertMock.mock.calls[1][0];
    const durationField = recoveryAlert.fields.find((f: { title: string }) =>
      f.title.toLowerCase().includes("outage duration"),
    );
    expect(durationField).toBeDefined();
    expect(durationField.value).toBe("1.5 h");
  });

  it("recovery alert fires exactly once — subsequent live ticks are silent", async () => {
    getFxStatusMock.mockReturnValue(makeFallbackStatus(THRESHOLD));
    await runOnce(); // failure alert

    getFxStatusMock.mockReturnValue(makeLiveStatus());
    await runOnce(); // recovery alert
    await runOnce(); // still live — no extra alert
    await runOnce(); // still live — no extra alert

    expect(sendAlertMock).toHaveBeenCalledTimes(2); // exactly one failure + one recovery
  });

  // ── Concurrent run protection ─────────────────────────────────────────────

  it("does not fire duplicate alerts when two calls run concurrently", async () => {
    getFxStatusMock.mockReturnValue(makeFallbackStatus(THRESHOLD));

    // Launch both calls without awaiting the first — the running flag should
    // cause the second to bail out immediately.
    const [, second] = await Promise.all([runOnce(), runOnce()]);
    void second;

    expect(sendAlertMock).toHaveBeenCalledOnce();
  });
});
