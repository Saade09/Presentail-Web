import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { getOsProductBySlug, inferProductColors } = vi.hoisted(() => ({
  getOsProductBySlug: vi.fn(),
  inferProductColors: vi.fn(),
}));

vi.mock("../lib/osProductsCache", () => ({ getOsProductBySlug }));
vi.mock("../lib/productColorInference", () => ({ inferProductColors }));

import productsRouter from "./products";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(productsRouter);
  return app;
}

describe("POST /products/color-hints security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inferProductColors.mockResolvedValue({ "real-product": "pink" });
  });

  it("rejects caller-defined products before invoking AI", async () => {
    getOsProductBySlug.mockReturnValue(null);

    const res = await request(buildApp())
      .post("/products/color-hints")
      .send({ products: [{ slug: "attacker-slug", name: "Attacker name" }] });

    expect(res.status).toBe(400);
    expect(inferProductColors).not.toHaveBeenCalled();
  });

  it("rejects a forged name for a real catalog slug", async () => {
    getOsProductBySlug.mockReturnValue({ name: "Real Product" });

    const res = await request(buildApp())
      .post("/products/color-hints")
      .send({ products: [{ slug: "real-product", name: "Poisoned name" }] });

    expect(res.status).toBe(400);
    expect(inferProductColors).not.toHaveBeenCalled();
  });

  it("passes only the canonical catalog identity to inference", async () => {
    getOsProductBySlug.mockReturnValue({ name: "Roses &amp; More" });

    const res = await request(buildApp())
      .post("/products/color-hints")
      .send({ products: [{ slug: "real-product", name: "Roses & More" }] });

    expect(res.status).toBe(200);
    expect(inferProductColors).toHaveBeenCalledWith([
      { slug: "real-product", name: "Roses & More" },
    ]);
  });
});