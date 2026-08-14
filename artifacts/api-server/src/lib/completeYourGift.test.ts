import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ProductRankingMetricsRow } from "@workspace/db";
import type { OSProduct } from "@workspace/presentail-os";
import {
  CYG_SLOTS,
  CYG_RANKING_CONFIG,
  CYG_SECTION_KEY,
  getCygRolloutMode,
  getCygAssignment,
  cygCohortBucket,
  filterCygCandidates,
  rankCygCandidates,
  applyExploration,
  slotForProduct,
  buildCygToken,
  isDateDeliverableForCity,
} from "./completeYourGift";

function makeProduct(overrides: Partial<OSProduct> & { id: string }): OSProduct {
  return {
    name: overrides.id,
    price: 20,
    images: [{ url: `https://img/${overrides.id}.jpg`, alt: overrides.id }],
    inStock: true,
    categories: [],
    occasions: [],
    brands: [],
    ...overrides,
  } as OSProduct;
}

function cat(slug: string) {
  return { id: slug, slug, name: slug };
}

function metricsRow(overrides: Partial<ProductRankingMetricsRow> & { osProductId: string }): ProductRankingMetricsRow {
  return {
    id: 1,
    osNumericId: null,
    productName: null,
    sales7d: 0,
    sales30d: 0,
    sales90d: 0,
    orderCount30d: 0,
    revenue30dUsdCents: 0,
    grossProfit30dUsdCents: 0,
    grossMarginPct: null,
    uniqueCustomers30d: 0,
    repeatCustomers90d: 0,
    refundRate: null,
    cancellationRate: null,
    impressions7d: 0,
    impressions30d: 0,
    clicks7d: 0,
    clicks30d: 0,
    productViews30d: 0,
    addToCarts30d: 0,
    purchases30d: 0,
    clickThroughRate: null,
    conversionRate: null,
    addToCartRate: null,
    normSales30d: 0,
    normSales7d: 0,
    normImpressions30d: 0,
    normClicks30d: 0,
    normAddToCarts30d: 0,
    freshnessScore: 0,
    stockScore: 1,
    pinnedPosition: null,
    rankingBoost: 0,
    rankingPenalty: 1,
    excludedFromSectionJson: null,
    rankingStartAt: null,
    rankingEndAt: null,
    lastOsSyncAt: null,
    lastWebsiteCalculationAt: null,
    updatedAt: new Date(),
    ...overrides,
  } as ProductRankingMetricsRow;
}

const savedEnv: Record<string, string | undefined> = {};
function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (!(k in savedEnv)) savedEnv[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}
beforeEach(() => {
  setEnv({ CYG_ROLLOUT: undefined, CYG_ROLLOUT_PCT: undefined });
});
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("slot definitions", () => {
  it("has exactly four slots in the fixed order", () => {
    expect(CYG_SLOTS.map((s) => s.key)).toEqual([
      "chocolate",
      "cake",
      "balloon",
      "stuffed-animal",
    ]);
  });

  it("maps a product to its slot by category slug", () => {
    expect(slotForProduct(makeProduct({ id: "a", categories: [cat("chocolate")] }))).toBe("chocolate");
    expect(slotForProduct(makeProduct({ id: "b", categories: [cat("cakes")] }))).toBe("cake");
    expect(slotForProduct(makeProduct({ id: "c", categories: [cat("balloons")] }))).toBe("balloon");
    expect(slotForProduct(makeProduct({ id: "d", categories: [cat("stuffed-animals")] }))).toBe("stuffed-animal");
    expect(slotForProduct(makeProduct({ id: "e", categories: [cat("flowers")] }))).toBeNull();
  });
});

describe("rollout flag / kill switch", () => {
  it("defaults to off", () => {
    expect(getCygRolloutMode()).toBe("off");
    expect(getCygAssignment("sess")).toEqual({ enabled: false, variant: "control", mode: "off" });
  });

  it("treats invalid values as off", () => {
    setEnv({ CYG_ROLLOUT: "banana" });
    expect(getCygRolloutMode()).toBe("off");
  });

  it("on mode enables everyone as treatment", () => {
    setEnv({ CYG_ROLLOUT: "on" });
    expect(getCygAssignment(undefined)).toEqual({ enabled: true, variant: "treatment", mode: "on" });
  });

  it("percentage mode is deterministic per session and gates by bucket", () => {
    setEnv({ CYG_ROLLOUT: "percentage", CYG_ROLLOUT_PCT: "50" });
    const a1 = getCygAssignment("session-abc");
    const a2 = getCygAssignment("session-abc");
    expect(a1).toEqual(a2);
    expect(a1.enabled).toBe(cygCohortBucket("session-abc") < 50);
  });

  it("percentage mode with no session id is control", () => {
    setEnv({ CYG_ROLLOUT: "percentage", CYG_ROLLOUT_PCT: "100" });
    expect(getCygAssignment(undefined).enabled).toBe(false);
  });

  it("percentage 0 disables everyone", () => {
    setEnv({ CYG_ROLLOUT: "percentage", CYG_ROLLOUT_PCT: "0" });
    expect(getCygAssignment("x").enabled).toBe(false);
  });
});

describe("filterCygCandidates", () => {
  const metricsMap = new Map<string, ProductRankingMetricsRow>();

  it("excludes out-of-stock, invalid price, cart items, and the anchor", () => {
    const catalog = [
      makeProduct({ id: "choc-good", categories: [cat("chocolate")] }),
      makeProduct({ id: "choc-oos", categories: [cat("chocolate")], inStock: false }),
      makeProduct({ id: "choc-free", categories: [cat("chocolate")], price: 0 }),
      makeProduct({ id: "cake-in-cart", categories: [cat("cakes")] }),
      makeProduct({ id: "anchor", categories: [cat("balloons")] }),
    ];
    const { bySlot, exclusionReasonBySlot } = filterCygCandidates({
      catalog,
      anchorSlug: "anchor",
      cartSlugs: new Set(["cake-in-cart"]),
      metricsMap,
    });
    expect((bySlot.get("chocolate") ?? []).map((p) => p.id)).toEqual(["choc-good"]);
    expect(bySlot.get("cake")).toBeUndefined();
    expect(bySlot.get("balloon")).toBeUndefined();
    expect(exclusionReasonBySlot.get("cake")).toBe("in_cart");
    expect(exclusionReasonBySlot.get("balloon")).toBe("is_anchor");
  });

  it("excludes products not deliverable to the selected city", () => {
    const catalog = [
      makeProduct({ id: "b1", categories: [cat("balloons")], deliverableCities: ["dubai"] }),
      makeProduct({ id: "b2", categories: [cat("balloons")], deliverableCities: ["beirut"] }),
    ];
    const { bySlot, exclusionReasonBySlot } = filterCygCandidates({
      catalog,
      anchorSlug: "x",
      cartSlugs: new Set(),
      cityId: "ae-dubai",
      metricsMap,
    });
    expect((bySlot.get("balloon") ?? []).map((p) => p.id)).toEqual(["b1"]);
    expect(exclusionReasonBySlot.get("balloon")).toBe("not_deliverable_to_city");
  });

  it("excludes merchandising-suppressed products (penalty 0 or section exclusion)", () => {
    const m = new Map<string, ProductRankingMetricsRow>([
      ["s1", metricsRow({ osProductId: "s1", rankingPenalty: 0 })],
      ["s2", metricsRow({ osProductId: "s2", excludedFromSectionJson: JSON.stringify([CYG_SECTION_KEY]) })],
    ]);
    const catalog = [
      makeProduct({ id: "s1", categories: [cat("chocolate")] }),
      makeProduct({ id: "s2", categories: [cat("chocolate")] }),
      makeProduct({ id: "s3", categories: [cat("chocolate")] }),
    ];
    const { bySlot } = filterCygCandidates({
      catalog,
      anchorSlug: "x",
      cartSlugs: new Set(),
      metricsMap: m,
    });
    expect((bySlot.get("chocolate") ?? []).map((p) => p.id)).toEqual(["s3"]);
  });
});

describe("rankCygCandidates", () => {
  it("is deterministic for identical input", () => {
    const candidates = [
      makeProduct({ id: "a", osNumericId: 10, totalSales: 3 }),
      makeProduct({ id: "b", osNumericId: 20, totalSales: 3 }),
      makeProduct({ id: "c", osNumericId: 30, totalSales: 100 }),
    ];
    const m = new Map<string, ProductRankingMetricsRow>();
    const r1 = rankCygCandidates(candidates, m).map((c) => c.product.id);
    const r2 = rankCygCandidates([...candidates], m).map((c) => c.product.id);
    expect(r1).toEqual(r2);
    expect(r1[0]).toBe("c"); // highest smoothed sales
  });

  it("uses precomputed metrics when available and marks low-data rows", () => {
    const candidates = [
      makeProduct({ id: "hi", osNumericId: 1 }),
      makeProduct({ id: "lo", osNumericId: 2 }),
    ];
    const m = new Map<string, ProductRankingMetricsRow>([
      ["hi", metricsRow({ osProductId: "hi", normSales30d: 0.9, impressions30d: 500 })],
      ["lo", metricsRow({ osProductId: "lo", normSales30d: 0.1, impressions30d: 5 })],
    ]);
    const ranked = rankCygCandidates(candidates, m);
    expect(ranked[0].product.id).toBe("hi");
    expect(ranked[0].lowData).toBe(false);
    expect(ranked[1].lowData).toBe(true);
    expect(ranked[0].metricsSource).toBe("precomputed");
  });

  it("smooths raw sales instead of using them directly (Bayesian fallback)", () => {
    const one = rankCygCandidates([makeProduct({ id: "p", totalSales: 1 })], new Map());
    const huge = rankCygCandidates([makeProduct({ id: "q", totalSales: 100000 })], new Map());
    expect(one[0].score).toBeGreaterThan(0);
    expect(huge[0].score).toBeLessThanOrEqual(0.7 + 0.3); // capped, not proportional to raw sales
  });
});

describe("applyExploration", () => {
  const rankedFixture = () => {
    const top = { product: makeProduct({ id: "top" }), score: 0.9, lowData: false, metricsSource: "precomputed" as const };
    const low = { product: makeProduct({ id: "low" }), score: 0.2, lowData: true, metricsSource: "fallback" as const };
    return [top, low];
  };

  it("returns null for empty candidate lists", () => {
    expect(
      applyExploration({ ranked: [], slot: "chocolate", sessionId: "s", anchorSlug: "a" }),
    ).toBeNull();
  });

  it("never explores without a session id", () => {
    const res = applyExploration({ ranked: rankedFixture(), slot: "chocolate", sessionId: undefined, anchorSlug: "a" });
    expect(res).toEqual(expect.objectContaining({ explored: false }));
    expect(res!.chosen.product.id).toBe("top");
  });

  it("is deterministic per (session, slot) and explores ~explorationRate of sessions", () => {
    let explored = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const res = applyExploration({
        ranked: rankedFixture(),
        slot: "chocolate",
        sessionId: `sess-${i}`,
        anchorSlug: "a",
      })!;
      const again = applyExploration({
        ranked: rankedFixture(),
        slot: "chocolate",
        sessionId: `sess-${i}`,
        anchorSlug: "a",
      })!;
      expect(again.explored).toBe(res.explored);
      if (res.explored) {
        explored++;
        expect(res.chosen.product.id).toBe("low");
      }
    }
    const rate = explored / N;
    expect(rate).toBeGreaterThan(CYG_RANKING_CONFIG.explorationRate * 0.4);
    expect(rate).toBeLessThan(CYG_RANKING_CONFIG.explorationRate * 2.0);
  });

  it("falls back to the top pick when no low-data candidate exists", () => {
    const ranked = [
      { product: makeProduct({ id: "top" }), score: 0.9, lowData: false, metricsSource: "precomputed" as const },
      { product: makeProduct({ id: "second" }), score: 0.5, lowData: false, metricsSource: "precomputed" as const },
    ];
    // Find a session that IS in the exploration slice for this slot.
    for (let i = 0; i < 5000; i++) {
      const withLow = applyExploration({
        ranked: [ranked[0], { ...ranked[1], lowData: true }],
        slot: "cake",
        sessionId: `s-${i}`,
        anchorSlug: "a",
      })!;
      if (withLow.explored) {
        const noLow = applyExploration({ ranked, slot: "cake", sessionId: `s-${i}`, anchorSlug: "a" })!;
        expect(noLow.explored).toBe(false);
        expect(noLow.chosen.product.id).toBe("top");
        return;
      }
    }
    throw new Error("no exploration session found in 5000 tries");
  });
});

describe("isDateDeliverableForCity", () => {
  // Fixed reference: 2026-08-14T09:00:00Z → 13:00 in Asia/Dubai (UTC+4).
  const now = new Date("2026-08-14T09:00:00Z");
  const todayDubai = "2026-08-14";

  it("fails open when the city has no slot config", () => {
    expect(isDateDeliverableForCity({ slots: null, date: "2026-08-20", storeKey: "dubai", now })).toBe(true);
    expect(isDateDeliverableForCity({ slots: [], date: "2026-08-20", storeKey: "dubai", now })).toBe(true);
  });

  it("rejects past dates", () => {
    expect(
      isDateDeliverableForCity({
        slots: [{ label: "Evening", enabled: true, cutoffHour: 20 }],
        date: "2026-08-13",
        storeKey: "dubai",
        now,
      }),
    ).toBe(false);
  });

  it("allows today only before the same-day cutoff in the store timezone", () => {
    const slots = [{ label: "Evening", enabled: true, sameDayEnabled: true, cutoffHour: 14 }];
    // 13:00 Dubai < 14 cutoff → deliverable
    expect(isDateDeliverableForCity({ slots, date: todayDubai, storeKey: "dubai", now })).toBe(true);
    // 18:00 Dubai (14:00Z) > 14 cutoff → not deliverable
    const late = new Date("2026-08-14T14:00:00Z");
    expect(isDateDeliverableForCity({ slots, date: todayDubai, storeKey: "dubai", now: late })).toBe(false);
  });

  it("rejects today when the only slots forbid same-day", () => {
    const slots = [{ label: "Standard", enabled: true, sameDayEnabled: false, cutoffHour: 20 }];
    expect(isDateDeliverableForCity({ slots, date: todayDubai, storeKey: "dubai", now })).toBe(false);
    // but a future date is fine
    expect(isDateDeliverableForCity({ slots, date: "2026-08-20", storeKey: "dubai", now })).toBe(true);
  });

  it("rejects future dates when only same-day-only slots exist", () => {
    const slots = [{ label: "Express", enabled: true, sameDayEnabled: true, nextDayEnabled: false, cutoffHour: 20 }];
    expect(isDateDeliverableForCity({ slots, date: "2026-08-20", storeKey: "dubai", now })).toBe(false);
  });

  it("ignores disabled slots entirely", () => {
    const slots = [{ label: "Off", enabled: false, cutoffHour: 20 }];
    expect(isDateDeliverableForCity({ slots, date: "2026-08-20", storeKey: "dubai", now })).toBe(false);
  });
});

describe("buildCygToken", () => {
  it("produces an opaque base64url token carrying the recommendation context", () => {
    const token = buildCygToken({ anchor: "rose-bouquet", slot: "cake", productSlug: "choco-cake", explored: true });
    const decoded = JSON.parse(Buffer.from(token, "base64url").toString());
    expect(decoded).toMatchObject({ a: "rose-bouquet", s: "cake", p: "choco-cake", x: 1 });
    expect(typeof decoded.t).toBe("number");
  });
});
