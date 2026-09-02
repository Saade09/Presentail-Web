import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOsProducts: vi.fn(),
  getOsProductPricingMap: vi.fn(() => new Map()),
  isOsProductsReady: vi.fn(() => true),
  resolveStoreFromRequest: vi.fn(),
  isVisibleProduct: vi.fn(() => true),
  isDeliverable: vi.fn(() => true),
  mapOsProductToWcShape: vi.fn((product) => product),
  transformProduct: vi.fn((product) => ({
    id: product.id,
    osNumericId: product.osNumericId,
    wcId: product.wcId ?? 0,
    name: product.name,
    price: "$10",
    priceValue: product.price,
    image: null,
    images: [],
    category: "flowers",
    categories: ["flowers"],
    inStock: product.inStock,
    occasions: [],
    personalisationRequired: product.personalisationRequired ?? false,
  })),
}));

vi.mock("../lib/productColorInference", () => ({ inferProductColors: vi.fn() }));
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../lib/osProductsCache", () => ({
  getOsProductBySlug: vi.fn(),
  getOsProducts: mocks.getOsProducts,
  getOsProductPricingMap: mocks.getOsProductPricingMap,
  isOsProductsReady: mocks.isOsProductsReady,
}));
vi.mock("../lib/wooStore", () => ({
  resolveStoreFromRequest: mocks.resolveStoreFromRequest,
}));
vi.mock("./woo", () => ({
  isVisibleProduct: mocks.isVisibleProduct,
  isDeliverable: mocks.isDeliverable,
  mapOsProductToWcShape: mocks.mapOsProductToWcShape,
  transformProduct: mocks.transformProduct,
}));

import productsRouter from "./products";

const PRODUCT = {
  id: "gold-heart",
  osNumericId: 313,
  wcId: 0,
  name: "Gold Heart",
  price: 10,
  inStock: true,
  images: [],
  categories: [],
  occasions: [],
  brands: [],
};

function makeApp() {
  const app = express();
  app.use("/api", productsRouter);
  return app;
}

describe("GET /api/products/gmc-checkout-link", () => {
  beforeEach(() => {
    delete process.env.GMC_CHECKOUT_DEEP_LINKS_ENABLED;
    vi.clearAllMocks();
    mocks.getOsProductPricingMap.mockReturnValue(new Map());
    mocks.isOsProductsReady.mockReturnValue(true);
    mocks.isVisibleProduct.mockReturnValue(true);
    mocks.isDeliverable.mockReturnValue(true);
    mocks.resolveStoreFromRequest.mockReturnValue({
      storeKey: "dubai",
      country: "AE",
      currencyCode: "AED",
      currencySymbol: "AED",
    });
    mocks.getOsProducts.mockImplementation((storeKey: string) =>
      storeKey === "dubai" ? [PRODUCT] : [],
    );
  });

  it("resolves both the feed slug and numeric OS id in the selected market", async () => {
    for (const itemId of ["gold-heart", "313"]) {
      const response = await request(makeApp())
        .get("/api/products/gmc-checkout-link")
        .query({ item_id: itemId, countryCode: "AE", cityId: "ae-dubai" });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        ok: true,
        outcome: "resolved",
        currencyCode: "AED",
        product: { id: "gold-heart", osNumericId: 313 },
      });
    }
  });

  it("accepts a case-insensitive parameter name", async () => {
    const response = await request(makeApp())
      .get("/api/products/gmc-checkout-link?ITEM_ID=gold-heart");
    expect(response.body.outcome).toBe("resolved");
  });

  it("rejects injection-shaped input without searching the catalog", async () => {
    const response = await request(makeApp())
      .get("/api/products/gmc-checkout-link")
      .query({ item_id: "gold-heart' OR 1=1" });
    expect(response.body.outcome).toBe("invalid_identifier");
    expect(mocks.getOsProducts).not.toHaveBeenCalled();
  });

  it("distinguishes unavailable outcomes without exposing product data", async () => {
    mocks.getOsProducts.mockImplementation((storeKey: string) =>
      storeKey === "lebanon" ? [PRODUCT] : [],
    );
    const outOfMarket = await request(makeApp())
      .get("/api/products/gmc-checkout-link?item_id=gold-heart");
    expect(outOfMarket.body).toEqual({ ok: false, outcome: "out_of_market" });

    mocks.getOsProducts.mockReturnValue([]);
    const notFound = await request(makeApp())
      .get("/api/products/gmc-checkout-link?item_id=missing");
    expect(notFound.body).toEqual({ ok: false, outcome: "not_found" });
  });

  it("fails closed for stock, deliverability, and required personalization", async () => {
    mocks.isVisibleProduct.mockReturnValueOnce(false);
    mocks.getOsProducts.mockReturnValueOnce([{ ...PRODUCT, inStock: false }]);
    const stock = await request(makeApp())
      .get("/api/products/gmc-checkout-link?item_id=gold-heart");
    expect(stock.body.outcome).toBe("out_of_stock");

    mocks.isDeliverable.mockReturnValueOnce(false);
    const delivery = await request(makeApp())
      .get("/api/products/gmc-checkout-link?item_id=gold-heart");
    expect(delivery.body.outcome).toBe("out_of_market");

    mocks.getOsProducts.mockReturnValueOnce([
      { ...PRODUCT, personalisationRequired: true },
    ]);
    const personalized = await request(makeApp())
      .get("/api/products/gmc-checkout-link?item_id=gold-heart");
    expect(personalized.body.outcome).toBe("personalization_required");
  });

  it("reports a cold catalog and obeys the default-on kill switch", async () => {
    mocks.getOsProducts.mockReturnValue(null);
    mocks.isOsProductsReady.mockReturnValue(false);
    const cold = await request(makeApp())
      .get("/api/products/gmc-checkout-link?item_id=gold-heart");
    expect(cold.body).toEqual({ ok: false, outcome: "catalog_unavailable" });

    process.env.GMC_CHECKOUT_DEEP_LINKS_ENABLED = "0";
    const disabled = await request(makeApp())
      .get("/api/products/gmc-checkout-link?item_id=gold-heart");
    expect(disabled.body).toEqual({ ok: false, outcome: "disabled" });
  });
});