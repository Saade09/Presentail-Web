// @vitest-environment jsdom
//
// SSR product adoption test (Tripoli city home): when the server embedded a
// product grid (data-ssr-products="true") in the initial HTML, Home must
// (a) revalidate best sellers on first hydration while retaining the SSR cards
//     as immediate content, and
// (b) adopt the embedded products WITH their sale-pricing fields so
// ProductCard/SalePrice keeps showing discounted prices after hydration.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithProviders } from "@/test-utils";
import Home from "./Home";
import type { Product } from "@/lib/queries";

vi.mock("@/contexts/LocationContext", () => ({
  useLocationSelection: vi.fn(() => ({
    country: { code: "LB" },
    city: "Tripoli",
    cityId: "lb-tripoli",
  })),
}));

vi.mock("wouter", () => ({
  Link: ({ children, href }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href}>{children}</a>
  ),
  useLocation: vi.fn(() => ["/", vi.fn()]),
  useRouter: vi.fn(() => ({ base: "" })),
}));

vi.mock("@/components/homepage/HeroBannerCarousel", () => ({ HeroBannerCarousel: () => null }));
vi.mock("@/components/homepage/HomepageCollections", () => ({ HomepageCollections: () => null }));
vi.mock("@/components/homepage/TrustpilotCarousel", () => ({ TrustpilotCarousel: () => null }));
vi.mock("@/components/homepage/TrustpilotBrandsRow", () => ({ TrustpilotBrandsRow: () => null }));
vi.mock("@/components/ProductCard", () => ({ ProductCard: () => null }));
vi.mock("@/lib/banners", () => ({ useHomepageBanners: vi.fn(() => ({ data: undefined, isLoading: false })) }));
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn(async () => ({ countryCode: null })) }));
vi.mock("@/lib/queries", () => ({
  useProducts: vi.fn(() => ({ data: undefined, isLoading: false })),
  useCatalogMetadata: vi.fn(() => ({ data: undefined })),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: vi.fn(() => false) }));

// Capture the products passed to the Best Sellers rail so we can assert the
// adopted SSR data (including sale pricing) reaches the card layer intact.
const capturedRailProps: Array<{
  railKey?: string;
  products?: Product[];
  limit?: number;
  isLoadingExternal?: boolean;
}> = [];
vi.mock("@/components/homepage/BestSellersPreview", () => ({
  BestSellersPreview: (props: {
    railKey?: string;
    products?: Product[];
    limit?: number;
    isLoadingExternal?: boolean;
  }) => {
    capturedRailProps.push(props);
    return null;
  },
}));

type BestSellersResponseForTest = {
  products: Array<{
    id: string;
    name: string;
    price: string;
    priceValue: number;
    image: { uri: string } | null;
    images: { uri: string }[];
    inStock: boolean;
    popularity: number;
  }>;
};
const useGetHomepageBestSellersMock = vi.fn(() => ({
  data: undefined as BestSellersResponseForTest | undefined,
  isLoading: false,
  isFetching: false,
  isError: false,
}));
vi.mock("@workspace/api-client-react", () => ({
  useGetHomepageBestSellers: (
    ...args: Parameters<typeof useGetHomepageBestSellersMock>
  ) => useGetHomepageBestSellersMock(...args),
  getGetHomepageBestSellersQueryKey: vi.fn(() => ["homepage-best-sellers"]),
}));

const EN_LOCALE = {
  language: "en" as const,
  dir: "ltr" as const,
  cityName: (() => "Tripoli") as unknown as (id: string) => string,
  t: (key: string) => key,
};

// Mirrors the payload emitted by buildProductGridHtml in seo-inject.mjs —
// one full-price product and one sale product with discount fields set.
const SSR_PAYLOAD = [
  {
    name: "Roses Bouquet",
    price: "$45",
    priceValue: 45,
    discountPriceValue: null,
    discountPriceAed: null,
    slug: "roses-bouquet",
    imageUrl: "https://cdn.test/roses.jpg",
  },
  {
    name: "Sale Tulips",
    price: "$60",
    priceValue: 60,
    discountPriceValue: 39,
    discountPriceAed: 143,
    slug: "sale-tulips",
    imageUrl: "https://cdn.test/tulips.jpg",
  },
];

function seedSsrBlock() {
  const section = document.createElement("section");
  section.setAttribute("data-ssr-products", "true");
  const script = document.createElement("script");
  script.type = "application/json";
  script.setAttribute("data-ssr-products-data", "");
  script.textContent = JSON.stringify(SSR_PAYLOAD);
  section.appendChild(script);
  document.body.appendChild(section);
  return section;
}

describe("Home — SSR product adoption on hydration", () => {
  beforeEach(() => {
    capturedRailProps.length = 0;
    useGetHomepageBestSellersMock.mockClear();
  });
  afterEach(() => {
    document
      .querySelectorAll('[data-ssr-products="true"]')
      .forEach((el) => el.remove());
  });

  it("keeps SSR products for first paint and revalidates the best-sellers fetch", () => {
    seedSsrBlock();
    renderWithProviders(<Home />, { locale: EN_LOCALE });

    // SSR is provisional: always issue a fresh market-specific request.
    const callArgs = useGetHomepageBestSellersMock.mock.calls[0] as unknown[];
    const options = callArgs?.[1] as {
      query?: { enabled?: boolean; staleTime?: number; refetchOnMount?: string };
    };
    expect(options?.query?.enabled).toBe(true);
    expect(options?.query?.staleTime).toBe(0);
    expect(options?.query?.refetchOnMount).toBe("always");

    // The best-sellers rail received the adopted SSR products.
    const rail = capturedRailProps.find((p) => p.railKey === "best-sellers");
    expect(rail?.products).toHaveLength(2);
    expect(rail?.limit).toBe(30);
    const [full, sale] = rail!.products!;
    expect(full.id).toBe("roses-bouquet");
    expect(full.discountPriceValue).toBeNull();

    // Sale product keeps its discount fields so SalePrice shows the sale
    // price and badge after hydration — no silent price regression.
    expect(sale.id).toBe("sale-tulips");
    expect(sale.priceValue).toBe(60);
    expect(sale.discountPriceValue).toBe(39);
    expect(sale.discountPriceAed).toBe(143);
    expect(sale.image?.uri).toBe("https://cdn.test/tulips.jpg");
  });

  it("fetches best sellers normally when no SSR block is present", () => {
    renderWithProviders(<Home />, { locale: EN_LOCALE });
    const callArgs = useGetHomepageBestSellersMock.mock.calls[0] as unknown[];
    const options = callArgs?.[1] as { query?: { enabled?: boolean } };
    expect(options?.query?.enabled).toBe(true);
    const rail = capturedRailProps.find((p) => p.railKey === "best-sellers");
    // Do not let the undefined-props path switch the main rail to a separate,
    // potentially shorter hand-bouquets collection while its request loads.
    expect(rail?.products).toEqual([]);
    expect(rail?.limit).toBe(30);
  });

  it("shows a loading state instead of a short cached list during revalidation", () => {
    useGetHomepageBestSellersMock.mockReturnValue({
      data: {
        products: Array.from({ length: 3 }, (_, index) => ({
          id: `cached-${index}`,
          name: `Cached product ${index}`,
          price: "$10",
          priceValue: 10,
          image: { uri: `https://cdn.test/cached-${index}.jpg` },
          images: [],
          inStock: true,
          popularity: 3 - index,
        })),
      },
      isLoading: false,
      isFetching: true,
      isError: false,
    });

    renderWithProviders(<Home />, { locale: EN_LOCALE });

    const rail = capturedRailProps.find((p) => p.railKey === "best-sellers");
    expect(rail?.products).toEqual([]);
    expect(rail?.isLoadingExternal).toBe(true);
  });

  it("passes all 30 products from the API into the homepage rail", () => {
    useGetHomepageBestSellersMock.mockReturnValue({
      data: {
        products: Array.from({ length: 30 }, (_, index) => ({
          id: `product-${index}`,
          name: `Product ${index}`,
          price: "$10",
          priceValue: 10,
          image: { uri: `https://cdn.test/${index}.jpg` },
          images: [],
          inStock: true,
          popularity: 30 - index,
        })),
      },
      isLoading: false,
      isFetching: false,
      isError: false,
    });

    renderWithProviders(<Home />, { locale: EN_LOCALE });

    const rail = capturedRailProps.find((p) => p.railKey === "best-sellers");
    expect(rail?.products).toHaveLength(30);
    expect(rail?.limit).toBe(30);
  });
});
