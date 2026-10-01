import { vi } from "vitest";
import type * as Analytics from "@/lib/analytics";

type AnalyticsModule = typeof Analytics;

/**
 * Exports that are pure / local-only and safe to keep real in tests. Every
 * other function export is treated as an event emitter and stubbed.
 */
const REAL_HELPERS = new Set<string>(["funnelValueBucket", "getOrCreateSessionId"]);

/**
 * Builds the module for `vi.mock("@/lib/analytics", …)` from the real module
 * instead of a hand-listed export set. Every emitter (trackEvent,
 * trackWebEvent, trackFunnelEvent, umamiTrack, …) becomes a silent `vi.fn()`,
 * pure helpers stay real, and `overrides` replaces only what a suite asserts
 * on. Because the surface is derived, a new export in analytics.ts cannot
 * trip vitest's `No "<name>" export is defined on the mock` error again.
 *
 * vi.mock factories are hoisted, so import this helper dynamically:
 *
 *   vi.mock("@/lib/analytics", async (importOriginal) => {
 *     const { mockAnalyticsModule } = await import("@/test/analytics-mock");
 *     return mockAnalyticsModule(importOriginal, { trackEvent: mockTrackEvent });
 *   });
 */
export async function mockAnalyticsModule(
  importOriginal: () => Promise<unknown>,
  overrides: Partial<Record<keyof AnalyticsModule, unknown>> = {},
): Promise<Record<string, unknown>> {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const mocked: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(actual)) {
    mocked[name] = typeof value === "function" && !REAL_HELPERS.has(name) ? vi.fn() : value;
  }
  return { ...mocked, ...overrides };
}
