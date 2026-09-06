import { describe, expect, it } from "vitest";
import { transformProduct } from "./woo";

const RAW =
  "https://os.presentail.com/api/storage/public-objects/products/318/main.png";

function wcProduct() {
  return {
    id: 318,
    slug: "rose-bouquet",
    name: "Rose Bouquet",
    price: "49",
    short_description: "",
    stock_status: "instock" as const,
    featured: false,
    total_sales: 0,
    images: [{ src: RAW }, { src: `${RAW}?gallery=2` }],
    categories: [{ id: 1, name: "Flowers", slug: "hand-bouquets" }],
    meta_data: [],
  };
}

describe("catalog endpoint product image payload policy", () => {
  it("uses a 400px card default and 1200px gallery defaults without raw display URLs", () => {
    const product = transformProduct(wcProduct());
    const payload = JSON.stringify(product);

    expect(product.image?.uri).toContain("w=400");
    expect(product.images).toHaveLength(2);
    expect(product.images.every((image) => image.uri.includes("w=1200"))).toBe(true);
    expect(product.images.every((image) => image.uri.includes("f=webp"))).toBe(true);
    expect(payload).not.toContain(`"uri":"${RAW}`);
  });

  it("keeps the product response comfortably inside its JSON payload budget", () => {
    const product = transformProduct(wcProduct());
    expect(Buffer.byteLength(JSON.stringify(product), "utf8")).toBeLessThan(8_000);
  });

  it("does not rewrite static image fallbacks", () => {
    const product = transformProduct({
      ...wcProduct(),
      images: [{ src: "/products/rose-bouquet.webp" }],
    });
    expect(product.image?.uri).toBe("/products/rose-bouquet.webp");
    expect(product.images[0]?.uri).toBe("/products/rose-bouquet.webp");
  });
});