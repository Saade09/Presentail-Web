import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  runOnce,
  loadWebVitalSummaries,
  __resetForTest,
  type WebVitalSummary,
} from "../src/lib/webVitalsMonitor";

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

// Controlled DB rows — mutated via setMockRows() between tests.
// The type intentionally allows `metric: string | null` to exercise the
// null-filtering logic in loadWebVitalSummaries.
type DbRow = WebVitalSummary & { metric: string | null };
let mockDbRows: DbRow[] = [];

const groupByMock = vi.fn(() => Promise.resolve(mockDbRows));

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          groupBy: groupByMock,
        }),
      }),
    }),
  },
  analyticsEventsTable: {
    action: "action",
    metricValue: "metricValue",
    name: "name",
    createdAt: "createdAt",
  },
}));

// drizzle-orm operators used by loadWebVitalSummaries
vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  gte: (_col: unknown, val: unknown) => val,
  lt: (_col: unknown, val: unknown) => val,
  sql: (strings: TemplateStringsArray, ..._vals: unknown[]) => strings.join(""),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_LCP_WARN_MS = 4000;
const DEFAULT_MIN_SAMPLES = 20;

function makeLcpRow(overrides: Partial<WebVitalSummary> = {}): WebVitalSummary {
  return {
    metric: "LCP",
    count: DEFAULT_MIN_SAMPLES,
    p50: DEFAULT_LCP_WARN_MS - 1,
    p75: DEFAULT_LCP_WARN_MS + 500,
    p95: DEFAULT_LCP_WARN_MS + 2000,
    ...overrides,
  };
}

function setMockRows(rows: DbRow[]): void {
  mockDbRows = rows;
}

// A fixed "now" whose previous UTC day is deterministic.
const NOW = new Date("2026-05-31T06:00:00Z");
const PREV_DAY_ISO = "2026-05-30";

// ── loadWebVitalSummaries — query aggregation & transformation ────────────────

describe("webVitalsMonitor — loadWebVitalSummaries", () => {
  beforeEach(() => {
    groupByMock.mockClear();
    setMockRows([]);
  });

  it("calls the DB query and returns typed summaries", async () => {
    setMockRows([
      { metric: "LCP", count: 50, p50: 2000, p75: 3000, p95: 5000 },
    ]);
    const results = await loadWebVitalSummaries(
      new Date("2026-05-30T00:00:00Z"),
      new Date("2026-05-31T00:00:00Z"),
    );
    expect(groupByMock).toHaveBeenCalledOnce();
    expect(results).toHaveLength(1);
    expect(results[0].metric).toBe("LCP");
    expect(results[0].count).toBe(50);
    expect(results[0].p50).toBe(2000);
    expect(results[0].p75).toBe(3000);
    expect(results[0].p95).toBe(5000);
  });

  it("filters out rows where metric is null", async () => {
    setMockRows([
      { metric: "LCP", count: 10, p50: 1000, p75: 1500, p95: 2000 },
      { metric: null, count: 5, p50: 500, p75: 800, p95: 1200 },
      { metric: "CLS", count: 20, p50: 0.05, p75: 0.1, p95: 0.2 },
    ]);
    const results = await loadWebVitalSummaries(
      new Date("2026-05-30T00:00:00Z"),
      new Date("2026-05-31T00:00:00Z"),
    );
    expect(results).toHaveLength(2);
    expect(results.every((r) => typeof r.metric === "string")).toBe(true);
    expect(results.map((r) => r.metric)).not.toContain(null);
  });

  it("sorts results alphabetically by metric name", async () => {
    setMockRows([
      { metric: "LCP", count: 50, p50: 2000, p75: 3000, p95: 5000 },
      { metric: "CLS", count: 30, p50: 0.05, p75: 0.1, p95: 0.2 },
      { metric: "FID", count: 40, p50: 80, p75: 120, p95: 300 },
    ]);
    const results = await loadWebVitalSummaries(
      new Date("2026-05-30T00:00:00Z"),
      new Date("2026-05-31T00:00:00Z"),
    );
    expect(results.map((r) => r.metric)).toEqual(["CLS", "FID", "LCP"]);
  });

  it("returns an empty array when the DB returns no rows", async () => {
    setMockRows([]);
    const results = await loadWebVitalSummaries(
      new Date("2026-05-30T00:00:00Z"),
      new Date("2026-05-31T00:00:00Z"),
    );
    expect(results).toEqual([]);
  });

  it("returns an empty array when all DB rows have a null metric", async () => {
    setMockRows([
      { metric: null, count: 10, p50: 1000, p75: 1500, p95: 2000 },
      { metric: null, count: 5, p50: 500, p75: 800, p95: 1200 },
    ]);
    const results = await loadWebVitalSummaries(
      new Date("2026-05-30T00:00:00Z"),
      new Date("2026-05-31T00:00:00Z"),
    );
    expect(results).toEqual([]);
  });

  it("preserves exact numeric values including fractional percentiles (CLS)", async () => {
    setMockRows([
      { metric: "CLS", count: 25, p50: 0.123, p75: 0.456, p95: 0.789 },
    ]);
    const results = await loadWebVitalSummaries(
      new Date("2026-05-30T00:00:00Z"),
      new Date("2026-05-31T00:00:00Z"),
    );
    expect(results[0].p50).toBeCloseTo(0.123);
    expect(results[0].p75).toBeCloseTo(0.456);
    expect(results[0].p95).toBeCloseTo(0.789);
  });
});

// ── runOnce — alert dispatch ──────────────────────────────────────────────────

describe("webVitalsMonitor — runOnce", () => {
  beforeEach(() => {
    sendAlertMock.mockReset();
    groupByMock.mockClear();
    __resetForTest();
    setMockRows([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── LCP above threshold — warn alert ─────────────────────────────────────

  it("fires a warn-severity alert when median LCP exceeds the threshold", async () => {
    setMockRows([makeLcpRow({ p50: DEFAULT_LCP_WARN_MS + 1 })]);
    await runOnce(NOW);
    expect(sendAlertMock).toHaveBeenCalledOnce();
    const alert = sendAlertMock.mock.calls[0][0];
    expect(alert.severity).toBe("warn");
  });

  it("alert source is 'webVitalsMonitor'", async () => {
    setMockRows([makeLcpRow({ p50: DEFAULT_LCP_WARN_MS + 1 })]);
    await runOnce(NOW);
    expect(sendAlertMock.mock.calls[0][0].source).toBe("webVitalsMonitor");
  });

  it("alert title mentions the evaluated day", async () => {
    setMockRows([makeLcpRow({ p50: DEFAULT_LCP_WARN_MS + 1 })]);
    await runOnce(NOW);
    expect(sendAlertMock.mock.calls[0][0].title).toMatch(PREV_DAY_ISO);
  });

  it("alert body mentions the median LCP value and threshold", async () => {
    const p50 = DEFAULT_LCP_WARN_MS + 250;
    setMockRows([makeLcpRow({ p50 })]);
    await runOnce(NOW);
    const body: string = sendAlertMock.mock.calls[0][0].body;
    expect(body).toMatch(String(Math.round(p50)));
    expect(body).toMatch(String(DEFAULT_LCP_WARN_MS));
  });

  it("alert body includes the sample count", async () => {
    const count = 42;
    setMockRows([makeLcpRow({ p50: DEFAULT_LCP_WARN_MS + 1, count })]);
    await runOnce(NOW);
    const body: string = sendAlertMock.mock.calls[0][0].body;
    expect(body).toMatch(String(count));
  });

  it("alert fields include an LCP entry with p50/p75/p95 values", async () => {
    setMockRows([makeLcpRow({ p50: DEFAULT_LCP_WARN_MS + 1, p75: 5000, p95: 8000 })]);
    await runOnce(NOW);
    const fields: Array<{ title: string; value: string }> =
      sendAlertMock.mock.calls[0][0].fields;
    const lcpField = fields.find((f) => f.title === "web · LCP");
    expect(lcpField).toBeDefined();
    expect(lcpField?.value).toMatch("p50=");
    expect(lcpField?.value).toMatch("p75=");
    expect(lcpField?.value).toMatch("p95=");
  });

  // ── LCP within threshold — info digest ───────────────────────────────────

  it("fires an info-severity alert when median LCP is within the threshold", async () => {
    setMockRows([makeLcpRow({ p50: DEFAULT_LCP_WARN_MS - 1 })]);
    await runOnce(NOW);
    expect(sendAlertMock).toHaveBeenCalledOnce();
    expect(sendAlertMock.mock.calls[0][0].severity).toBe("info");
  });

  it("info digest body mentions 'within the threshold'", async () => {
    setMockRows([makeLcpRow({ p50: DEFAULT_LCP_WARN_MS - 1 })]);
    await runOnce(NOW);
    const body: string = sendAlertMock.mock.calls[0][0].body;
    expect(body).toMatch(/within/i);
  });

  it("sends info digest even when LCP is exactly at the threshold", async () => {
    setMockRows([makeLcpRow({ p50: DEFAULT_LCP_WARN_MS })]);
    await runOnce(NOW);
    expect(sendAlertMock.mock.calls[0][0].severity).toBe("info");
  });

  // ── Insufficient LCP samples — warn alert is skipped ─────────────────────
  //
  // When the LCP sample count is below MIN_SAMPLES the threshold check is
  // skipped — a warn-severity alert MUST NOT fire regardless of the p50 value.
  // runOnce sends an info digest instead (with an "insufficient samples" body)
  // so operators still receive the daily summary.

  it("does NOT fire a warn alert when LCP count is below MIN_SAMPLES (even with p50 far above threshold)", async () => {
    setMockRows([makeLcpRow({ p50: DEFAULT_LCP_WARN_MS + 9999, count: DEFAULT_MIN_SAMPLES - 1 })]);
    await runOnce(NOW);
    expect(sendAlertMock).toHaveBeenCalledOnce();
    expect(sendAlertMock.mock.calls[0][0].severity).toBe("info");
  });

  it("does NOT fire a warn alert when LCP count is exactly 1 below MIN_SAMPLES", async () => {
    setMockRows([makeLcpRow({ p50: DEFAULT_LCP_WARN_MS + 1, count: DEFAULT_MIN_SAMPLES - 1 })]);
    await runOnce(NOW);
    expect(sendAlertMock.mock.calls[0][0].severity).not.toBe("warn");
  });

  it("info digest body mentions insufficient samples when skipping the LCP threshold check", async () => {
    setMockRows([makeLcpRow({ p50: DEFAULT_LCP_WARN_MS + 500, count: DEFAULT_MIN_SAMPLES - 1 })]);
    await runOnce(NOW);
    const body: string = sendAlertMock.mock.calls[0][0].body;
    expect(body).toMatch(/insufficient/i);
  });

  it("fires a warn alert when LCP count is exactly at MIN_SAMPLES and p50 exceeds threshold", async () => {
    setMockRows([makeLcpRow({ p50: DEFAULT_LCP_WARN_MS + 1, count: DEFAULT_MIN_SAMPLES })]);
    await runOnce(NOW);
    expect(sendAlertMock.mock.calls[0][0].severity).toBe("warn");
  });

  // ── No events for the day — skip silently ────────────────────────────────

  it("does not send an alert when there are no web_vital events", async () => {
    setMockRows([]);
    await runOnce(NOW);
    expect(sendAlertMock).not.toHaveBeenCalled();
  });

  it("marks the day as evaluated and skips the second call when there are no events", async () => {
    setMockRows([]);
    await runOnce(NOW);
    await runOnce(NOW);
    expect(sendAlertMock).not.toHaveBeenCalled();
    // Two DB queries from the first call (web vitals + mobile TTID); the
    // dedup guard prevents the second runOnce from issuing any further queries.
    expect(groupByMock).toHaveBeenCalledTimes(2);
  });

  // ── Same-day deduplication ────────────────────────────────────────────────

  it("does not evaluate the same day twice", async () => {
    setMockRows([makeLcpRow({ p50: DEFAULT_LCP_WARN_MS + 1 })]);
    await runOnce(NOW);
    await runOnce(NOW);
    expect(sendAlertMock).toHaveBeenCalledOnce();
  });

  it("evaluates the next UTC day after skipping a repeated same-day call", async () => {
    setMockRows([makeLcpRow({ p50: DEFAULT_LCP_WARN_MS + 1 })]);

    await runOnce(NOW);
    expect(sendAlertMock).toHaveBeenCalledOnce();

    // Move to the next UTC day.
    const nextDay = new Date("2026-06-01T06:00:00Z");
    await runOnce(nextDay);
    expect(sendAlertMock).toHaveBeenCalledTimes(2);
  });

  // ── Concurrent run protection ─────────────────────────────────────────────

  it("does not fire duplicate alerts when two calls run concurrently", async () => {
    setMockRows([makeLcpRow({ p50: DEFAULT_LCP_WARN_MS + 1 })]);
    await Promise.all([runOnce(NOW), runOnce(NOW)]);
    expect(sendAlertMock).toHaveBeenCalledOnce();
  });

  // ── Non-LCP metrics present — digest still fires ─────────────────────────

  it("fires an info digest when only non-LCP metrics are present", async () => {
    setMockRows([
      { metric: "CLS", count: 50, p50: 0.05, p75: 0.1, p95: 0.25 },
      { metric: "FID", count: 50, p50: 80, p75: 120, p95: 300 },
    ]);
    await runOnce(NOW);
    expect(sendAlertMock).toHaveBeenCalledOnce();
    expect(sendAlertMock.mock.calls[0][0].severity).toBe("info");
  });

  it("includes all metric rows in the alert fields", async () => {
    setMockRows([
      { metric: "CLS", count: 50, p50: 0.05, p75: 0.1, p95: 0.25 },
      makeLcpRow({ p50: DEFAULT_LCP_WARN_MS + 1 }),
    ]);
    await runOnce(NOW);
    const fields: Array<{ title: string }> = sendAlertMock.mock.calls[0][0].fields;
    expect(fields.some((f) => f.title === "web · CLS")).toBe(true);
    expect(fields.some((f) => f.title === "web · LCP")).toBe(true);
  });

  // ── CLS formatting (unitless, not "ms") ──────────────────────────────────

  it("formats CLS values without a 'ms' suffix", async () => {
    setMockRows([{ metric: "CLS", count: 50, p50: 0.123, p75: 0.2, p95: 0.35 }]);
    await runOnce(NOW);
    const fields: Array<{ title: string; value: string }> =
      sendAlertMock.mock.calls[0][0].fields;
    const clsField = fields.find((f) => f.title === "web · CLS");
    expect(clsField?.value).not.toMatch("ms");
    expect(clsField?.value).toMatch("0.123");
  });
});
