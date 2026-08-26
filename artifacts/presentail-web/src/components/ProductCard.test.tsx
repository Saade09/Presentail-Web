// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks — declared before component imports so Vitest's hoisting applies them.
// ---------------------------------------------------------------------------

vi.mock("wouter", () => ({
  Link: ({
    children,
    href,
    ...rest
  }: React.PropsWithChildren<{ href: string; [key: string]: unknown }>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/useDisplayCurrency", () => ({
  useDisplayCurrency: vi.fn(() => ({
    currencyCode: "USD",
    formatPrice: (v: number) => `$${v}`,
  })),
}));

// useFxRates and useCurrenciesData are consumed by SalePrice (rendered inside
// ProductCard). Stub them out so the component tree renders without network.
vi.mock("@/lib/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries")>();
  return {
    ...actual,
    useFxRates: vi.fn(() => ({ data: { rates: { AED: 3.67 } } })),
    useCurrenciesData: vi.fn(() => ({ data: null })),
  };
});

vi.mock("@/contexts/LocaleContext", () => ({
  useLocale: vi.fn(() => ({
    language: "en",
    dir: "ltr",
    t: (k: string) => k,
    setLanguage: vi.fn(),
    countryName: (_: string, fb: string) => fb,
    cityName: (_: string, fb: string) => fb,
  })),
}));

vi.mock("@/contexts/LocationContext", () => ({
  useLocationSelection: vi.fn(() => ({
    countryCode: "LB",
    cityId: "lb-beirut",
    country: { code: "LB", name: "Lebanon", cities: [] },
    city: { id: "lb-beirut", name: "Beirut" },
    countries: [],
    isLoadingCountries: false,
    setLocation: vi.fn(),
    clearLocation: vi.fn(),
    isPickerOpen: false,
    pickerForceCountryStep: false,
    openPicker: vi.fn(),
    closePicker: vi.fn(),
  })),
}));

vi.mock("@/lib/prefetch", () => ({
  prefetchProps: vi.fn(() => ({})),
}));

vi.mock("@/lib/pageLoaders", () => ({
  loadProductDetail: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Component under test — imported after mocks.
// ---------------------------------------------------------------------------

import { ProductCard } from "./ProductCard";
import type { Product } from "@/lib/queries";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const osStorageProduct: Product = {
  id: "red-roses",
  wcId: 0,
  name: "Red Roses",
  price: "$65",
  priceValue: 65,
  // Must be a valid OS storage URL so buildOsImageSrcset returns a srcset
  // and ProductImage renders the <source> element with the sizes hint.
  image: { uri: "https://os.presentail.com/api/storage/public-objects/products/red-roses.webp" },
  category: "flowers",
  categories: ["flowers"],
  inStock: true,
  occasions: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ProductCard — image sizes attribute", () => {
  it("renders a <source> with the correct responsive sizes hint", () => {
    const { container } = render(
      <ProductCard product={osStorageProduct} index={0} />,
    );
    // sizes is set on the <source> inside the <picture>, not on <img>
    const source = container.querySelector("source");
    expect(source).toBeTruthy();
    expect(source!.getAttribute("sizes")).toBe(
      "(max-width: 640px) 45vw, (max-width: 768px) 33vw, 25vw",
    );
  });

  it("preserves the sizes hint regardless of card position (index > 0)", () => {
    const { container } = render(
      <ProductCard product={osStorageProduct} index={5} />,
    );
    const source = container.querySelector("source");
    expect(source).toBeTruthy();
    expect(source!.getAttribute("sizes")).toBe(
      "(max-width: 640px) 45vw, (max-width: 768px) 33vw, 25vw",
    );
  });
});

describe("ProductCard — image alt text (WCAG 1.1.1)", () => {
  it("renders an <img> whose alt matches the product name", () => {
    const { container } = render(
      <ProductCard product={osStorageProduct} index={0} />,
    );
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    // alt now includes city context ("Red Roses – delivered in Beirut")
    expect(img!.alt).toContain(osStorageProduct.name);
  });

  it("renders no <img> element when the product has no image URL", () => {
    const noImageProduct: Product = {
      ...osStorageProduct,
      id: "mystery-box",
      name: "Mystery Box",
      image: null,
    };
    const { container } = render(
      <ProductCard product={noImageProduct} index={0} />,
    );
    expect(container.querySelector("img")).toBeNull();
  });
});
