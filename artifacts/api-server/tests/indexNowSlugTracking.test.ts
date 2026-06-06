import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetIndexNowSlugTrackingForTest,
  __detectAndSubmitNewTaxonomySlugsForTest,
} from "../src/lib/osProductsCache";

// ── Mocks ────────────────────────────────────────────────────────────────────

const submitIndexNowUrlsMock = vi.fn();

vi.mock("../src/lib/indexNow", async (importActual) => {
  const actual = await importActual<typeof import("../src/lib/indexNow")>();
  return {
    ...actual,
    submitIndexNowUrls: (...args: unknown[]) => submitIndexNowUrlsMock(...args),
  };
});

vi.mock("../src/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../src/lib/alerts", () => ({
  sendAlert: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: {},
  osPriceSnapshotsTable: {},
  osPriceAlertsTable: {},
  gt: vi.fn(),
  lt: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@workspace/presentail-os", () => ({
  fetchOsProducts: vi.fn(),
  fetchOsCategories: vi.fn(),
  fetchOsBrands: vi.fn(),
  fetchOsOccasions: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCategory(id: string) {
  return { id, slug: id, name: id };
}

function makeBrand(id: string) {
  return { id, slug: id, name: id };
}

function makeOccasion(id: string) {
  return { id, slug: id, name: id };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("detectAndSubmitNewTaxonomySlugs", () => {
  beforeEach(() => {
    __resetIndexNowSlugTrackingForTest();
    submitIndexNowUrlsMock.mockReset();
    submitIndexNowUrlsMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    __resetIndexNowSlugTrackingForTest();
  });

  it("first fetch seeds the baseline without calling submitIndexNowUrls", () => {
    __detectAndSubmitNewTaxonomySlugsForTest(
      [makeCategory("flowers"), makeCategory("plants")],
      [makeBrand("roses-co")],
      [makeOccasion("birthday"), makeOccasion("anniversary")],
      ["red-roses", "white-tulips"],
    );

    expect(submitIndexNowUrlsMock).not.toHaveBeenCalled();
  });

  it("second fetch with the same slugs does not submit anything", () => {
    const categories = [makeCategory("flowers"), makeCategory("plants")];
    const brands = [makeBrand("roses-co")];
    const occasions = [makeOccasion("birthday")];
    const products = ["red-roses"];

    __detectAndSubmitNewTaxonomySlugsForTest(categories, brands, occasions, products);
    submitIndexNowUrlsMock.mockClear();

    __detectAndSubmitNewTaxonomySlugsForTest(categories, brands, occasions, products);

    expect(submitIndexNowUrlsMock).not.toHaveBeenCalled();
  });

  it("second fetch with new product slugs submits canonical URLs for en/ar/fr × lb/ae/cy", async () => {
    __detectAndSubmitNewTaxonomySlugsForTest(
      [makeCategory("flowers")],
      [],
      [makeOccasion("birthday")],
      ["red-roses"],
    );

    __detectAndSubmitNewTaxonomySlugsForTest(
      [makeCategory("flowers")],
      [],
      [makeOccasion("birthday")],
      ["red-roses", "white-lilies"],
    );

    // submitIndexNowUrls is called fire-and-forget; give microtasks a cycle
    await vi.waitFor(() => expect(submitIndexNowUrlsMock).toHaveBeenCalledOnce());

    const [submittedUrls] = submitIndexNowUrlsMock.mock.calls[0] as [string[]];

    // 1 new product slug × 3 langs × 3 countries = 9 URLs
    expect(submittedUrls).toHaveLength(9);

    const langs = ["en", "ar", "fr"];
    const countryCity = [
      ["lb", "beirut"],
      ["ae", "dubai"],
      ["cy", "nicosia"],
    ];

    for (const lang of langs) {
      for (const [country, city] of countryCity) {
        expect(submittedUrls).toContain(
          `https://new.presentail.com/${lang}-${country}/${city}/product/white-lilies`,
        );
      }
    }
  });

  it("second fetch with new category and occasion slugs submits their canonical URLs", async () => {
    __detectAndSubmitNewTaxonomySlugsForTest(
      [makeCategory("flowers")],
      [],
      [makeOccasion("birthday")],
      [],
    );

    __detectAndSubmitNewTaxonomySlugsForTest(
      [makeCategory("flowers"), makeCategory("plants")],
      [],
      [makeOccasion("birthday"), makeOccasion("wedding")],
      [],
    );

    await vi.waitFor(() => expect(submitIndexNowUrlsMock).toHaveBeenCalledOnce());

    const [submittedUrls] = submitIndexNowUrlsMock.mock.calls[0] as [string[]];

    // 1 new category + 1 new occasion × 3 langs × 3 countries = 18 URLs
    expect(submittedUrls).toHaveLength(18);
    expect(submittedUrls).toContain(
      "https://new.presentail.com/en-lb/beirut/category/plants",
    );
    expect(submittedUrls).toContain(
      "https://new.presentail.com/ar-ae/dubai/occasion/wedding",
    );
  });

  it("second fetch with new brand slugs submits canonical brand URLs for en/ar/fr × lb/ae/cy", async () => {
    __detectAndSubmitNewTaxonomySlugsForTest(
      [],
      [makeBrand("roses-co")],
      [],
      [],
    );

    __detectAndSubmitNewTaxonomySlugsForTest(
      [],
      [makeBrand("roses-co"), makeBrand("lily-garden")],
      [],
      [],
    );

    await vi.waitFor(() => expect(submitIndexNowUrlsMock).toHaveBeenCalledOnce());

    const [submittedUrls] = submitIndexNowUrlsMock.mock.calls[0] as [string[]];

    // 1 new brand slug × 3 langs × 3 countries = 9 URLs
    expect(submittedUrls).toHaveLength(9);

    const langs = ["en", "ar", "fr"];
    const countryCity = [
      ["lb", "beirut"],
      ["ae", "dubai"],
      ["cy", "nicosia"],
    ];

    for (const lang of langs) {
      for (const [country, city] of countryCity) {
        expect(submittedUrls).toContain(
          `https://new.presentail.com/${lang}-${country}/${city}/brand/lily-garden`,
        );
      }
    }

    // The already-known brand must not appear
    expect(submittedUrls.some((u) => u.includes("/brand/roses-co"))).toBe(false);
  });

  it("does not re-submit slugs that were already seen in a previous fetch", async () => {
    __detectAndSubmitNewTaxonomySlugsForTest(
      [makeCategory("flowers")],
      [],
      [],
      ["red-roses"],
    );

    __detectAndSubmitNewTaxonomySlugsForTest(
      [makeCategory("flowers"), makeCategory("plants")],
      [],
      [],
      ["red-roses", "white-lilies"],
    );

    await vi.waitFor(() => expect(submitIndexNowUrlsMock).toHaveBeenCalledOnce());

    const [submittedUrls] = submitIndexNowUrlsMock.mock.calls[0] as [string[]];

    // Only the NEW slugs (plants + white-lilies) should appear
    const hasOld = submittedUrls.some(
      (u) => u.includes("/category/flowers") || u.includes("/product/red-roses"),
    );
    expect(hasOld).toBe(false);

    expect(submittedUrls.some((u) => u.includes("/category/plants"))).toBe(true);
    expect(submittedUrls.some((u) => u.includes("/product/white-lilies"))).toBe(
      true,
    );
  });

  it("reset helper properly resets state so subsequent first-fetch behaves as baseline", () => {
    __detectAndSubmitNewTaxonomySlugsForTest(
      [makeCategory("flowers")],
      [],
      [],
      ["red-roses"],
    );

    __resetIndexNowSlugTrackingForTest();
    submitIndexNowUrlsMock.mockClear();

    // This is now the "first" fetch again after reset
    __detectAndSubmitNewTaxonomySlugsForTest(
      [makeCategory("flowers")],
      [],
      [],
      ["red-roses"],
    );

    expect(submitIndexNowUrlsMock).not.toHaveBeenCalled();

    submitIndexNowUrlsMock.mockClear();

    // A second fetch after reset should detect "flowers" / "red-roses" as known,
    // but a genuinely new slug should be submitted
    __detectAndSubmitNewTaxonomySlugsForTest(
      [makeCategory("flowers"), makeCategory("cacti")],
      [],
      [],
      ["red-roses"],
    );

    expect(submitIndexNowUrlsMock).toHaveBeenCalledOnce();
  });
});
