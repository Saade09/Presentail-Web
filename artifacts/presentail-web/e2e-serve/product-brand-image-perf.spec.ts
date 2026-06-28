/**
 * Product & brand image performance regression tests (LCP / responsive image guard)
 *
 * The highest-traffic storefront pages (product detail, brand) render their
 * hero/card imagery through `buildOsImageSrcset` / `buildOsProxyUrl`
 * (artifacts/presentail-web/src/lib/imageUtils.ts), which turn an OS storage
 * original (`os.presentail.com/api/storage/...`) into a responsive set of
 * sized `/api/img/proxy` variants. The web-vitals monitor tracks LCP globally,
 * but nothing asserts the product/brand markup, so a regression — dropping the
 * srcset/sizes, removing fetchpriority on the hero, or painting the
 * full-resolution OS original instead of a sized proxy variant — would silently
 * degrade LCP on the pages that matter most for conversion. blog-image-perf.spec.ts
 * guards the editorial pages; this is the equivalent guard for the catalog pages.
 *
 * These specs run against the production serve.mjs build (the "Web serve
 * checks" workflow) and use a real browser so the React-rendered <img>
 * attributes and the browser's actual srcset candidate selection are exercised
 * — exactly what a shopper's browser sees.
 *
 * Product / brand catalog data is fetched client-side at runtime (from the OS
 * API directly, or via the API server's /api/woo/* fallback). Neither upstream
 * is reachable in this web-only CI workflow, so the spec intercepts the handful
 * of catalog + image-proxy calls the pages make via page.route and serves
 * deterministic fixtures whose image URLs are real OS storage paths. That keeps
 * the test hermetic (identical in CI and locally) while still exercising the
 * real React components, the real imageUtils helpers, and the browser's actual
 * candidate selection against the production bundle.
 *
 *   product detail   — the main gallery <img> carries the responsive srcset
 *                      (400w/800w/1200w /api/img/proxy variants) + sizes, loads
 *                      eager at high priority, and the LCP element the browser
 *                      actually paints (currentSrc) resolves to a sized
 *                      /api/img/proxy variant, never the full-resolution OS
 *                      storage original.
 *   brand            — the above-the-fold product-card <img> carries the same
 *                      responsive proxy srcset + sizes, loads eager at high
 *                      priority, paints a sized /api/img/proxy variant, while a
 *                      below-the-fold card image is lazily loaded.
 */

import { test, expect, type Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// Deterministic fixtures. Image URLs are real OS storage paths so the
// production imageUtils helpers (isOsStorageUrl / buildOsProxyUrl) recognise
// them and emit /api/img/proxy variants — exactly the production behaviour.
// ---------------------------------------------------------------------------

const OS_STORAGE = "https://os.presentail.com/api/storage";

const PRODUCT_SLUG = "e2e-roses";
const BRAND_SLUG = "e2e-blooms";

function osImage(name: string): { uri: string } {
  return { uri: `${OS_STORAGE}/e2e/${name}.jpg` };
}

type FixtureProduct = {
  id: string;
  wcId: number;
  name: string;
  price: string;
  priceValue: number;
  image: { uri: string } | null;
  images: { uri: string }[];
  category: string;
  categories: string[];
  inStock: boolean;
  description: string;
  occasions: string[];
  brandNames: string[];
};

function makeProduct(slug: string, name: string, imageName: string): FixtureProduct {
  return {
    id: slug,
    wcId: 0,
    name,
    price: "$89",
    priceValue: 89,
    image: osImage(imageName),
    images: [osImage(imageName)],
    category: "flowers",
    categories: ["flowers"],
    inStock: true,
    description: "A luxurious bouquet of fresh roses.",
    occasions: ["birthday"],
    brandNames: ["E2E Blooms"],
  };
}

const PRODUCT = makeProduct(PRODUCT_SLUG, "E2E Roses", "rose-main");

// Eight brand products so the md:grid-cols-4 layout puts indexes 4–7 on the
// second row (below the fold): the first four are priority/eager, the rest lazy.
const BRAND_PRODUCTS: FixtureProduct[] = Array.from({ length: 8 }, (_, i) =>
  makeProduct(`e2e-brand-product-${i}`, `E2E Brand Product ${i}`, `brand-${i}`),
);

const BRANDS = [
  { id: "b1", name: "E2E Blooms", slug: BRAND_SLUG, image: `${OS_STORAGE}/e2e/brand-logo.jpg` },
];

// A tiny but valid 2×2 PNG. The /api/img/proxy fixture returns it for every
// requested variant so the painted LCP element actually decodes
// (naturalWidth > 0) — the format query param is irrelevant to the <img>.
const PNG_2x2 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGNkYGD4z4AGGNEFAB0aAQ2I2gAxAAAAAElFTkSuQmCC",
  "base64",
);

// ---------------------------------------------------------------------------
// Route interception. Only the catalog + image-proxy endpoints the product /
// brand pages depend on are stubbed; every other /api/* call falls through to
// serve.mjs exactly as it does for the other serve-backed specs (and degrades
// gracefully via the app's react-query error handling).
// ---------------------------------------------------------------------------

function jsonRoute(route: Route, body: unknown): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(body),
  });
}

async function installCatalogRoutes(page: import("@playwright/test").Page): Promise<void> {
  // Seed a delivery location so no location-picker gate blocks the catalog
  // queries (mirrors the web checkout e2e seeding convention).
  await page.addInitScript(() => {
    localStorage.setItem(
      "presentail_delivery_location_v1",
      JSON.stringify({ countryCode: "LB", cityId: "beirut" }),
    );
  });

  await page.route("**/api/woo/products", (route) =>
    jsonRoute(route, { ok: true, products: [PRODUCT, ...BRAND_PRODUCTS] }),
  );
  await page.route("**/api/woo/brands", (route) =>
    jsonRoute(route, { ok: true, brands: BRANDS }),
  );
  await page.route("**/api/woo/brand-products*", (route) =>
    jsonRoute(route, {
      ok: true,
      products: BRAND_PRODUCTS,
      count: BRAND_PRODUCTS.length,
      brandName: "E2E Blooms",
    }),
  );
  // The image proxy returns a real, decodable image for every variant width so
  // the browser's painted LCP candidate has a non-zero natural size.
  await page.route("**/api/img/proxy*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: PNG_2x2,
    }),
  );
}

const PRODUCT_PATH = `/en-lb/beirut/product/${PRODUCT_SLUG}`;
const BRAND_PATH = `/en-lb/beirut/brand/${BRAND_SLUG}`;

// The proxy variant URL the responsive srcset/src point at. currentSrc must
// resolve to one of these, never the raw OS storage original.
const PROXY_VARIANT_RE = /\/api\/img\/proxy\?/;

test.describe("Product image performance — detail page main image", () => {
  test.beforeEach(async ({ page }) => {
    await installCatalogRoutes(page);
  });

  test("main gallery image is responsive (srcset + sizes), eager + high priority", async ({ page }) => {
    await page.goto(PRODUCT_PATH, { waitUntil: "domcontentloaded" });

    const main = page.getByTestId("product-gallery-main-image");
    await expect(main).toBeVisible();

    // Responsive srcset built from /api/img/proxy variants.
    const srcset = await main.getAttribute("srcset");
    expect(srcset, "main image must declare a responsive srcset").toBeTruthy();
    expect(srcset).toContain("/api/img/proxy");
    expect(srcset).toContain("400w");
    expect(srcset).toContain("800w");
    expect(srcset).toContain("1200w");

    // A sizes hint so the browser can pick the right candidate.
    const sizes = await main.getAttribute("sizes");
    expect(sizes, "main image must declare a sizes hint").toBeTruthy();

    // The gallery hero is the LCP element: eager + high priority.
    expect(await main.getAttribute("loading")).toBe("eager");
    expect((await main.getAttribute("fetchpriority"))?.toLowerCase()).toBe("high");

    // The plain src must also be a sized proxy variant (non-srcset consumers).
    expect(await main.getAttribute("src")).toMatch(PROXY_VARIANT_RE);
  });

  test("the painted LCP image resolves to a sized /api/img/proxy variant", async ({ page }) => {
    await page.goto(PRODUCT_PATH, { waitUntil: "load" });

    const main = page.getByTestId("product-gallery-main-image");
    await expect(main).toBeVisible();

    await expect
      .poll(async () => main.evaluate((el: HTMLImageElement) => el.currentSrc), {
        message: "main image currentSrc never resolved",
      })
      .toMatch(PROXY_VARIANT_RE);

    // The painted candidate must NOT be the full-resolution OS storage original.
    const currentSrc = await main.evaluate((el: HTMLImageElement) => el.currentSrc);
    expect(currentSrc.includes("/api/storage/")).toBe(false);

    // It really decoded (non-zero natural size).
    const naturalWidth = await main.evaluate((el: HTMLImageElement) => el.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);
  });
});

test.describe("Brand image performance — product grid cards", () => {
  test.beforeEach(async ({ page }) => {
    await installCatalogRoutes(page);
  });

  test("above-the-fold card image is responsive, eager + high priority", async ({ page }) => {
    await page.goto(BRAND_PATH, { waitUntil: "domcontentloaded" });

    const firstCardImg = page
      .getByTestId(`card-product-${BRAND_PRODUCTS[0].id}`)
      .locator("img");
    await expect(firstCardImg).toBeVisible();

    const srcset = await firstCardImg.getAttribute("srcset");
    expect(srcset, "card image must declare a responsive srcset").toBeTruthy();
    expect(srcset).toContain("/api/img/proxy");
    expect(srcset).toContain("400w");
    expect(srcset).toContain("800w");
    expect(srcset).toContain("1200w");

    const sizes = await firstCardImg.getAttribute("sizes");
    expect(sizes, "card image must declare a sizes hint").toBeTruthy();

    // The first row of cards is above the fold (ProductCard priority index < 4).
    expect(await firstCardImg.getAttribute("loading")).toBe("eager");
    expect((await firstCardImg.getAttribute("fetchpriority"))?.toLowerCase()).toBe("high");
  });

  test("the painted above-the-fold card resolves to a sized /api/img/proxy variant", async ({ page }) => {
    await page.goto(BRAND_PATH, { waitUntil: "load" });

    const firstCardImg = page
      .getByTestId(`card-product-${BRAND_PRODUCTS[0].id}`)
      .locator("img");
    await expect(firstCardImg).toBeVisible();

    await expect
      .poll(async () => firstCardImg.evaluate((el: HTMLImageElement) => el.currentSrc), {
        message: "card image currentSrc never resolved",
      })
      .toMatch(PROXY_VARIANT_RE);

    const currentSrc = await firstCardImg.evaluate((el: HTMLImageElement) => el.currentSrc);
    expect(currentSrc.includes("/api/storage/")).toBe(false);

    const naturalWidth = await firstCardImg.evaluate((el: HTMLImageElement) => el.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);
  });

  test("below-the-fold card image is lazily loaded", async ({ page }) => {
    await page.goto(BRAND_PATH, { waitUntil: "domcontentloaded" });

    // Index 4+ are on the second grid row (below the fold) and must be lazy so
    // they never compete with the LCP element for bandwidth.
    const lazyCardImg = page
      .getByTestId(`card-product-${BRAND_PRODUCTS[BRAND_PRODUCTS.length - 1].id}`)
      .locator("img");
    await expect(lazyCardImg).toBeVisible();

    expect(await lazyCardImg.getAttribute("loading")).toBe("lazy");

    // It still carries the responsive proxy srcset — lazy, not unoptimised.
    const srcset = await lazyCardImg.getAttribute("srcset");
    expect(srcset, "below-the-fold card must still declare a responsive srcset").toBeTruthy();
    expect(srcset).toContain("/api/img/proxy");
  });
});
