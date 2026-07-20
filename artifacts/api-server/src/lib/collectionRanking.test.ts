import { describe, it, expect, vi, afterEach } from "vitest";
import { scoreCollections } from "./collectionRanking";
import type { CollectionRankingConfigRow } from "@workspace/db";
import type { OSProduct } from "@workspace/presentail-os";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeItem(slug: string, id?: string) {
  return { id: id ?? slug, slug, name: slug, imageUrl: "", sortOrder: 0, isActive: true };
}

function makeOsProduct(
  slug: string,
  opts: { totalSales?: number; inStock?: boolean; occasionSlugs?: string[]; categorySlugs?: string[] } = {},
): OSProduct {
  return {
    id: slug,
    slug,
    name: slug,
    price: 10,
    inStock: opts.inStock ?? true,
    totalSales: opts.totalSales ?? 0,
    occasions: (opts.occasionSlugs ?? []).map((s) => ({ slug: s, name: s })),
    categories: (opts.categorySlugs ?? []).map((s) => ({ id: s, name: s, slug: s, is_featured: true })),
    brands: [],
    images: [],
    featured: false,
    deliverableCountries: [],
    osNumericId: 1,
  } as unknown as OSProduct;
}

function makeConfigRow(
  kind: "category" | "occasion",
  slug: string,
  overrides: Partial<Omit<CollectionRankingConfigRow, "id" | "kind" | "slug">> = {},
): CollectionRankingConfigRow {
  return {
    id: Math.floor(Math.random() * 10000),
    kind,
    slug,
    countryCode: null,
    citySlug: null,
    manualBoost: 0,
    pinnedPosition: null,
    hiddenOverride: false,
    seasonalBoosts: [],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("scoreCollections — fallback to default order", () => {
  it("preserves defaultOrder when no config and no sales data", () => {
    const items = ["birthday", "anniversary", "thank-you"].map((s) => makeItem(s));
    const defaultOrder = ["thank-you", "anniversary", "birthday"];

    const { items: result } = scoreCollections(items, {
      kind: "occasion",
      configRows: [],
      osProducts: [],
      defaultOrder,
    });

    expect(result.map((i) => i.slug)).toEqual(["thank-you", "anniversary", "birthday"]);
  });

  it("appends unknown slugs after known defaultOrder slugs", () => {
    const items = ["newborn", "birthday", "extra-slug"].map((s) => makeItem(s));
    const defaultOrder = ["birthday", "newborn"];

    const { items: result } = scoreCollections(items, {
      kind: "occasion",
      configRows: [],
      osProducts: [],
      defaultOrder,
    });

    expect(result[0].slug).toBe("birthday");
    expect(result[1].slug).toBe("newborn");
    expect(result[2].slug).toBe("extra-slug");
  });
});

describe("scoreCollections — availability penalty", () => {
  it("pushes items with 0 in-stock products to the end", () => {
    const items = ["flowers", "chocolate", "plants"].map((s) => makeItem(s));
    const osProducts = [
      makeOsProduct("p1", { totalSales: 50, inStock: true, occasionSlugs: ["flowers"] }),
      makeOsProduct("p2", { totalSales: 50, inStock: true, occasionSlugs: ["chocolate"] }),
      // "plants" has no in-stock products
    ];

    const { items: result } = scoreCollections(items, {
      kind: "occasion",
      configRows: [
        makeConfigRow("occasion", "plants"),
        makeConfigRow("occasion", "flowers"),
        makeConfigRow("occasion", "chocolate"),
      ],
      osProducts,
      defaultOrder: [],
      availabilityFloor: 3,
    });

    const slugs = result.map((i) => i.slug);
    expect(slugs.indexOf("plants")).toBeGreaterThan(slugs.indexOf("flowers"));
    expect(slugs.indexOf("plants")).toBeGreaterThan(slugs.indexOf("chocolate"));
  });
});

describe("scoreCollections — seasonal boost", () => {
  it("fires within the window and not outside it", () => {
    const items = ["love-romance", "birthday"].map((s) => makeItem(s));

    const today = new Date();
    const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(today.getUTCDate()).padStart(2, "0");
    const todayStr = `${mm}-${dd}`;

    // Use a window that definitely includes today
    const startMmDd = todayStr;
    const endMmDd = todayStr;

    const configRows = [
      makeConfigRow("occasion", "love-romance", {
        seasonalBoosts: [
          { label: "Test boost", startMmDd, endMmDd, boost: 0.8 },
        ],
      }),
      makeConfigRow("occasion", "birthday"),
    ];

    const { items: result, debugMap } = scoreCollections(items, {
      kind: "occasion",
      configRows,
      osProducts: [],
      defaultOrder: [],
    });

    expect(result[0].slug).toBe("love-romance");
    expect(debugMap.get("love-romance")!.seasonalBoost).toBe(0.8);
  });

  it("does not fire outside the window", () => {
    const items = ["love-romance", "birthday"].map((s) => makeItem(s));

    // Window from yesterday to yesterday (i.e. a one-day window that is now in the past)
    const yesterday = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const mm = String(yesterday.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(yesterday.getUTCDate()).padStart(2, "0");
    const yestStr = `${mm}-${dd}`;

    const configRows = [
      makeConfigRow("occasion", "love-romance", {
        seasonalBoosts: [
          { label: "Past boost", startMmDd: yestStr, endMmDd: yestStr, boost: 0.8 },
        ],
      }),
      makeConfigRow("occasion", "birthday"),
    ];

    const { debugMap } = scoreCollections(items, {
      kind: "occasion",
      configRows,
      osProducts: [],
      defaultOrder: [],
    });

    expect(debugMap.get("love-romance")!.seasonalBoost).toBe(0);
  });
});

describe("scoreCollections — manual boost", () => {
  it("manual boost overrides natural performance order", () => {
    const items = ["birthday", "love-romance", "thank-you"].map((s) => makeItem(s));
    const osProducts = [
      makeOsProduct("p1", { totalSales: 100, inStock: true, occasionSlugs: ["birthday"] }),
      makeOsProduct("p2", { totalSales: 5, inStock: true, occasionSlugs: ["love-romance"] }),
      makeOsProduct("p3", { totalSales: 1, inStock: true, occasionSlugs: ["thank-you"] }),
    ];

    // Give "thank-you" a massive manual boost to override birthday's high sales
    const configRows = [
      makeConfigRow("occasion", "birthday"),
      makeConfigRow("occasion", "love-romance"),
      makeConfigRow("occasion", "thank-you", { manualBoost: 2.0 }),
    ];

    const { items: result, debugMap } = scoreCollections(items, {
      kind: "occasion",
      configRows,
      osProducts,
      defaultOrder: [],
    });

    expect(result[0].slug).toBe("thank-you");
    expect(debugMap.get("thank-you")!.manualBoost).toBe(2.0);
  });
});

describe("scoreCollections — pinned positions", () => {
  it("pinned position is respected after scoring", () => {
    const items = ["birthday", "love-romance", "thank-you", "graduation"].map((s) => makeItem(s));
    const osProducts = [
      makeOsProduct("p1", { totalSales: 100, inStock: true, occasionSlugs: ["birthday"] }),
      makeOsProduct("p2", { totalSales: 80, inStock: true, occasionSlugs: ["love-romance"] }),
      makeOsProduct("p3", { totalSales: 50, inStock: true, occasionSlugs: ["thank-you"] }),
      makeOsProduct("p4", { totalSales: 10, inStock: true, occasionSlugs: ["graduation"] }),
    ];

    // Pin "graduation" (lowest score) to position 1
    const configRows = [
      makeConfigRow("occasion", "birthday"),
      makeConfigRow("occasion", "love-romance"),
      makeConfigRow("occasion", "thank-you"),
      makeConfigRow("occasion", "graduation", { pinnedPosition: 1 }),
    ];

    const { items: result } = scoreCollections(items, {
      kind: "occasion",
      configRows,
      osProducts,
      defaultOrder: [],
    });

    expect(result[0].slug).toBe("graduation");
  });

  it("hiddenOverride removes the item entirely", () => {
    const items = ["birthday", "love-romance"].map((s) => makeItem(s));
    const configRows = [
      makeConfigRow("occasion", "birthday", { hiddenOverride: true }),
      makeConfigRow("occasion", "love-romance"),
    ];

    const { items: result } = scoreCollections(items, {
      kind: "occasion",
      configRows,
      osProducts: [],
      defaultOrder: [],
    });

    expect(result.map((i) => i.slug)).not.toContain("birthday");
    expect(result.map((i) => i.slug)).toContain("love-romance");
  });
});

describe("scoreCollections — year-wrap seasonal window", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("handles wrap-around window (Dec 25 – Jan 7)", () => {
    // Pin the clock to Dec 26 UTC
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-12-26T12:00:00Z"));

    const items = ["christmas", "birthday"].map((s) => makeItem(s));
    const configRows = [
      makeConfigRow("occasion", "christmas", {
        seasonalBoosts: [
          { label: "Christmas", startMmDd: "12-25", endMmDd: "01-07", boost: 0.5 },
        ],
      }),
      makeConfigRow("occasion", "birthday"),
    ];

    const { items: result, debugMap } = scoreCollections(items, {
      kind: "occasion",
      configRows,
      osProducts: [],
      defaultOrder: [],
    });

    expect(result[0].slug).toBe("christmas");
    expect(debugMap.get("christmas")!.seasonalBoost).toBe(0.5);
  });
});
