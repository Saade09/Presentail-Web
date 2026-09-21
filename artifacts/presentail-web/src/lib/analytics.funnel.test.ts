import { describe, expect, it, beforeEach, vi } from "vitest";

describe("privacy-safe web funnel analytics", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("window", {
      umami: { track: vi.fn() },
    });
    vi.stubGlobal("sessionStorage", {
      values: new Map<string, string>(),
      getItem(key: string) { return this.values.get(key) ?? null; },
      setItem(key: string, value: string) { this.values.set(key, value); },
    });
  });

  it("keeps only the typed safe dimensions and coarse values", async () => {
    const { trackFunnelEvent } = await import("./analytics");
    trackFunnelEvent("payment_failed", {
      method: "card",
      reason: "declined",
      value_bucket: "250_plus",
      currency: "USD",
      // @ts-expect-error intentional privacy regression guard
      email: "shopper@example.com",
    });
    const track = (window as any).umami.track as ReturnType<typeof vi.fn>;
    expect(track).toHaveBeenCalledWith("funnel_payment_failed", {
      method: "card",
      reason: "declined",
      value_bucket: "250_plus",
      currency: "USD",
    });
  });

  it("deduplicates a milestone by semantic key within a browser session", async () => {
    const { trackFunnelEventOnce } = await import("./analytics");
    trackFunnelEventOnce("order_confirmed", "opaque-order-key", { method: "card" });
    trackFunnelEventOnce("order_confirmed", "opaque-order-key", { method: "card" });
    const track = (window as any).umami.track as ReturnType<typeof vi.fn>;
    expect(track).toHaveBeenCalledTimes(1);
  });

  it("maps non-enumerated failure reasons to unknown", async () => {
    const { trackFunnelEvent } = await import("./analytics");
    trackFunnelEvent("payment_failed", { method: "card", reason: "raw provider error" });
    const track = (window as any).umami.track as ReturnType<typeof vi.fn>;
    expect(track).toHaveBeenCalledWith("funnel_payment_failed", {
      method: "card",
      reason: "unknown",
    });
  });

  it("waits for delayed Umami initialization before marking a once event delivered", async () => {
    const track = vi.fn();
    const win = window as any;
    delete win.umami;
    vi.useFakeTimers();
    const { trackFunnelEventOnce } = await import("./analytics");
    trackFunnelEventOnce("order_confirmed", "delayed-order", { method: "card" });
    trackFunnelEventOnce("order_confirmed", "delayed-order", { method: "card" });
    expect(track).not.toHaveBeenCalled();
    win.umami = { track };
    await vi.advanceTimersByTimeAsync(150);
    expect(track).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("presentail_funnel_once:order_confirmed:delayed-order")).toBe("1");
    vi.useRealTimers();
  });

  it("collapses delayed calls with the same semantic key and keeps only safe enums", async () => {
    const track = vi.fn();
    const win = window as any;
    delete win.umami;
    vi.useFakeTimers();
    const { trackFunnelEventOnce } = await import("./analytics");
    trackFunnelEventOnce("landing_viewed", "session_entry", {
      source: "home",
      step: "landing",
    });
    trackFunnelEventOnce("landing_viewed", "session_entry", {
      source: "/shop?q=private search text",
      step: "landing",
    });
    win.umami = { track };
    await vi.advanceTimersByTimeAsync(150);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("funnel_landing_viewed", {
      source: "home",
      step: "landing",
    });
    vi.useRealTimers();
  });
});