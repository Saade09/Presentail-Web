import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildKeyPages, classifyResult, __resetForTest } from "./seoAuditMonitor";

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  },
  monitorStateTable: {},
  seoAuditLogTable: {},
}));

vi.mock("./logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("./alerts", () => ({
  sendAlert: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./osProductsCache", () => ({
  hasOsProducts: vi.fn(),
  getOsProducts: vi.fn(),
  getOsBrands: vi.fn(),
  getOsCategories: vi.fn(),
  getOsOccasions: vi.fn(),
  registerOnFirstPopulatedCallback: vi.fn(),
}));

import {
  hasOsProducts,
  getOsProducts,
  getOsBrands,
  getOsCategories,
  getOsOccasions,
} from "./osProductsCache";

const mockHasOsProducts = vi.mocked(hasOsProducts);
const mockGetOsProducts = vi.mocked(getOsProducts);
const mockGetOsBrands = vi.mocked(getOsBrands);
const mockGetOsCategories = vi.mocked(getOsCategories);
const mockGetOsOccasions = vi.mocked(getOsOccasions);

function seedFullCatalog() {
  mockHasOsProducts.mockReturnValue(true);
  mockGetOsProducts.mockReturnValue([
    { id: "rose-bouquet-12", name: "Rose Bouquet" } as any,
    { id: "tulip-box-6", name: "Tulip Box" } as any,
    { id: "orchid-vase", name: "Orchid Vase" } as any,
  ]);
  mockGetOsBrands.mockReturnValue([
    { slug: "brand-alpha", name: "Brand Alpha" } as any,
    { slug: "brand-beta", name: "Brand Beta" } as any,
  ]);
  mockGetOsCategories.mockReturnValue([
    { slug: "flowers", name: "Flowers" } as any,
    { slug: "chocolates", name: "Chocolates" } as any,
    { slug: "plants", name: "Plants" } as any,
  ]);
  mockGetOsOccasions.mockReturnValue([
    { slug: "birthday", name: "Birthday" } as any,
    { slug: "anniversary", name: "Anniversary" } as any,
    { slug: "valentines", name: "Valentines" } as any,
  ]);
}

beforeEach(() => {
  __resetForTest();
  vi.clearAllMocks();
});

// ── buildKeyPages ─────────────────────────────────────────────────────────────

describe("buildKeyPages", () => {
  it("returns null when the OS catalog is not ready", () => {
    mockHasOsProducts.mockReturnValue(false);
    expect(buildKeyPages()).toBeNull();
  });

  it("returns null when there are no products in the catalog", () => {
    mockHasOsProducts.mockReturnValue(true);
    mockGetOsProducts.mockReturnValue([]);
    mockGetOsBrands.mockReturnValue([{ slug: "brand-alpha", name: "Brand Alpha" } as any]);
    mockGetOsCategories.mockReturnValue([{ slug: "flowers", name: "Flowers" } as any]);
    mockGetOsOccasions.mockReturnValue([{ slug: "birthday", name: "Birthday" } as any]);
    expect(buildKeyPages()).toBeNull();
  });

  it("returns null when there are no brands in the catalog", () => {
    mockHasOsProducts.mockReturnValue(true);
    mockGetOsProducts.mockReturnValue([{ id: "rose-bouquet", name: "Rose" } as any]);
    mockGetOsBrands.mockReturnValue([]);
    mockGetOsCategories.mockReturnValue([{ slug: "flowers", name: "Flowers" } as any]);
    mockGetOsOccasions.mockReturnValue([{ slug: "birthday", name: "Birthday" } as any]);
    expect(buildKeyPages()).toBeNull();
  });

  it("returns null when there are no categories in the catalog", () => {
    mockHasOsProducts.mockReturnValue(true);
    mockGetOsProducts.mockReturnValue([{ id: "rose-bouquet", name: "Rose" } as any]);
    mockGetOsBrands.mockReturnValue([{ slug: "brand-alpha", name: "Brand Alpha" } as any]);
    mockGetOsCategories.mockReturnValue([]);
    mockGetOsOccasions.mockReturnValue([{ slug: "birthday", name: "Birthday" } as any]);
    expect(buildKeyPages()).toBeNull();
  });

  it("returns null when there are no occasions in the catalog", () => {
    mockHasOsProducts.mockReturnValue(true);
    mockGetOsProducts.mockReturnValue([{ id: "rose-bouquet", name: "Rose" } as any]);
    mockGetOsBrands.mockReturnValue([{ slug: "brand-alpha", name: "Brand Alpha" } as any]);
    mockGetOsCategories.mockReturnValue([{ slug: "flowers", name: "Flowers" } as any]);
    mockGetOsOccasions.mockReturnValue([]);
    expect(buildKeyPages()).toBeNull();
  });

  it("returns a non-empty array when the catalog is fully populated", () => {
    seedFullCatalog();
    const pages = buildKeyPages();
    expect(pages).not.toBeNull();
    expect(pages!.length).toBeGreaterThan(0);
  });

  it("emits EN, AR, and FR homepage variants for each country", () => {
    seedFullCatalog();
    const pages = buildKeyPages()!;
    const homepages = pages.filter((p) => p.label === "Homepage (EN)" || p.label === "Homepage (AR)" || p.label === "Homepage (FR)");

    const countries = ["lb", "ae", "cy"];
    const langs = ["en", "ar", "fr"];
    for (const country of countries) {
      for (const lang of langs) {
        const found = homepages.some((p) => p.url.includes(`/${lang}-${country}/`));
        expect(found, `Expected a Homepage URL with /${lang}-${country}/`).toBe(true);
      }
    }
  });

  it("emits EN, AR, and FR product page variants for each country", () => {
    seedFullCatalog();
    const pages = buildKeyPages()!;
    const productSlug = "rose-bouquet-12";
    const countries = ["lb", "ae", "cy"];
    const langs = ["en", "ar", "fr"];
    for (const country of countries) {
      for (const lang of langs) {
        const found = pages.some((p) => p.url.includes(`/${lang}-${country}/`) && p.url.includes(`/product/${productSlug}`));
        expect(found, `Expected a Product URL with /${lang}-${country}/…/product/${productSlug}`).toBe(true);
      }
    }
  });

  it("uses brand slug from the OS cache (slug[0])", () => {
    seedFullCatalog();
    const pages = buildKeyPages()!;
    const brandPages = pages.filter((p) => p.label.startsWith("Brand"));
    expect(brandPages.every((p) => p.url.includes("/brand/brand-alpha"))).toBe(true);
  });

  it("emits EN, AR, and FR brand page variants for each country", () => {
    seedFullCatalog();
    const pages = buildKeyPages()!;
    const countries = ["lb", "ae", "cy"];
    const langs = ["en", "ar", "fr"];
    for (const country of countries) {
      for (const lang of langs) {
        const found = pages.some((p) => p.url.includes(`/${lang}-${country}/`) && p.url.includes("/brand/"));
        expect(found, `Expected a Brand URL with /${lang}-${country}/…/brand/`).toBe(true);
      }
    }
  });

  it("emits all three blog slugs as BLOG-locale pages", () => {
    seedFullCatalog();
    const pages = buildKeyPages()!;
    const blogPages = pages.filter((p) => p.locale === "BLOG");
    const expectedSlugs = [
      "chocolatiers-behind-our-gift-boxes",
      "inside-spring-sourcing-trip",
      "what-to-send-when-there-are-no-words",
    ];
    for (const slug of expectedSlugs) {
      const found = blogPages.some((p) => p.url.includes(`/blog/${slug}`));
      expect(found, `Expected blog page for slug: ${slug}`).toBe(true);
    }
    expect(blogPages).toHaveLength(3);
  });

  it("emits EN, AR, and FR for first category slug; EN only for slug[1] and slug[2]", () => {
    seedFullCatalog();
    const pages = buildKeyPages()!;

    const catEn0 = pages.filter((p) => p.url.includes("/category/flowers") && p.url.includes("/en-"));
    const catAr0 = pages.filter((p) => p.url.includes("/category/flowers") && p.url.includes("/ar-"));
    const catFr0 = pages.filter((p) => p.url.includes("/category/flowers") && p.url.includes("/fr-"));
    expect(catEn0.length).toBeGreaterThan(0);
    expect(catAr0.length).toBeGreaterThan(0);
    expect(catFr0.length).toBeGreaterThan(0);

    const catAr1 = pages.filter((p) => p.url.includes("/category/chocolates") && p.url.includes("/ar-"));
    const catFr1 = pages.filter((p) => p.url.includes("/category/chocolates") && p.url.includes("/fr-"));
    expect(catAr1).toHaveLength(0);
    expect(catFr1).toHaveLength(0);
  });

  it("emits EN, AR, and FR for first occasion slug; EN only for slug[1] and slug[2]", () => {
    seedFullCatalog();
    const pages = buildKeyPages()!;

    const occAr0 = pages.filter((p) => p.url.includes("/occasion/birthday") && p.url.includes("/ar-"));
    const occFr0 = pages.filter((p) => p.url.includes("/occasion/birthday") && p.url.includes("/fr-"));
    expect(occAr0.length).toBeGreaterThan(0);
    expect(occFr0.length).toBeGreaterThan(0);

    const occAr1 = pages.filter((p) => p.url.includes("/occasion/anniversary") && p.url.includes("/ar-"));
    const occFr1 = pages.filter((p) => p.url.includes("/occasion/anniversary") && p.url.includes("/fr-"));
    expect(occAr1).toHaveLength(0);
    expect(occFr1).toHaveLength(0);
  });

  it("covers all three countries (LB, AE, CY) in locale field", () => {
    seedFullCatalog();
    const pages = buildKeyPages()!;
    const locales = new Set(pages.map((p) => p.locale));
    expect(locales.has("LB")).toBe(true);
    expect(locales.has("AE")).toBe(true);
    expect(locales.has("CY")).toBe(true);
  });

  it("uses up to 3 category slugs and up to 3 occasion slugs", () => {
    seedFullCatalog();
    const pages = buildKeyPages()!;

    const categorySlugsUsed = new Set(
      pages
        .filter((p) => p.url.includes("/category/"))
        .map((p) => p.url.replace(/.*\/category\//, "")),
    );
    expect(categorySlugsUsed.size).toBe(3);

    const occasionSlugsUsed = new Set(
      pages
        .filter((p) => p.url.includes("/occasion/"))
        .map((p) => p.url.replace(/.*\/occasion\//, "")),
    );
    expect(occasionSlugsUsed.size).toBe(3);
  });

  it("uses only 1 category slug when the catalog has only 1 category", () => {
    mockHasOsProducts.mockReturnValue(true);
    mockGetOsProducts.mockReturnValue([{ id: "rose-bouquet", name: "Rose" } as any]);
    mockGetOsBrands.mockReturnValue([{ slug: "brand-alpha", name: "Brand Alpha" } as any]);
    mockGetOsCategories.mockReturnValue([{ slug: "flowers", name: "Flowers" } as any]);
    mockGetOsOccasions.mockReturnValue([{ slug: "birthday", name: "Birthday" } as any]);
    const pages = buildKeyPages()!;
    const categoryUrls = pages.filter((p) => p.url.includes("/category/"));
    expect(categoryUrls.every((p) => p.url.includes("/category/flowers"))).toBe(true);
  });

  it("all returned pages have label, url, and locale", () => {
    seedFullCatalog();
    const pages = buildKeyPages()!;
    for (const page of pages) {
      expect(typeof page.label).toBe("string");
      expect(typeof page.url).toBe("string");
      expect(typeof page.locale).toBe("string");
      expect(page.url.startsWith("https://presentail.com")).toBe(true);
    }
  });
});

// ── classifyResult ────────────────────────────────────────────────────────────

function makeResult(overrides: Partial<{
  fetchFailed: boolean;
  ogImage: string | null;
  ogImageReachable: boolean | null;
  ogImageSizeOk: boolean | null;
  fallbackUsed: boolean;
}> = {}): Parameters<typeof classifyResult>[0] {
  return {
    locale: "LB",
    label: "Homepage (EN)",
    url: "https://presentail.com/en-lb/beirut",
    ok: true,
    fetchFailed: false,
    ogImage: "https://presentail.com/og/homepage.jpg",
    ogImageReachable: true,
    ogImageSizeOk: true,
    fallbackUsed: false,
    ...overrides,
  } as any;
}

describe("classifyResult", () => {
  it('returns "error" when fetchFailed is true', () => {
    expect(classifyResult(makeResult({ fetchFailed: true, ogImage: null, ogImageReachable: null }))).toBe("error");
  });

  it('returns "error" when ogImage is null (no og:image tag)', () => {
    expect(classifyResult(makeResult({ ogImage: null, ogImageReachable: null }))).toBe("error");
  });

  it('returns "error" when ogImage is an empty string', () => {
    expect(classifyResult(makeResult({ ogImage: "", ogImageReachable: null }))).toBe("error");
  });

  it('returns "error" when ogImageReachable is false', () => {
    expect(classifyResult(makeResult({ ogImageReachable: false }))).toBe("error");
  });

  it('returns "warn" when ogImageSizeOk is false', () => {
    expect(classifyResult(makeResult({ ogImageSizeOk: false }))).toBe("warn");
  });

  it('returns "warn" when fallbackUsed is true', () => {
    expect(classifyResult(makeResult({ fallbackUsed: true }))).toBe("warn");
  });

  it('returns "warn" when both fallbackUsed and ogImageSizeOk are false', () => {
    expect(classifyResult(makeResult({ fallbackUsed: true, ogImageSizeOk: false }))).toBe("warn");
  });

  it('returns "ok" for a fully healthy page', () => {
    expect(classifyResult(makeResult())).toBe("ok");
  });

  it('returns "ok" when ogImageSizeOk is null (size tags absent) and everything else is fine', () => {
    expect(classifyResult(makeResult({ ogImageSizeOk: null }))).toBe("ok");
  });

  it('returns "ok" when ogImageReachable is true and ogImageSizeOk is null', () => {
    expect(classifyResult(makeResult({ ogImageReachable: true, ogImageSizeOk: null, fallbackUsed: false }))).toBe("ok");
  });

  it('prioritises "error" over "warn": fetchFailed overrides fallbackUsed', () => {
    expect(classifyResult(makeResult({ fetchFailed: true, fallbackUsed: true, ogImage: null, ogImageReachable: null }))).toBe("error");
  });

  it('prioritises "error" over "warn": missing ogImage overrides bad dimensions', () => {
    expect(classifyResult(makeResult({ ogImage: null, ogImageReachable: null, ogImageSizeOk: false }))).toBe("error");
  });
});
