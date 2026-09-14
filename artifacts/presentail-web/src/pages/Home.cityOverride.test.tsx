// @vitest-environment jsdom
//
// Hydration parity test for hand-written city landing overrides (Tripoli):
// the hydrated Home page must render the SAME visible content the server
// injects into the initial HTML — H1, intro, delivery-coverage paragraph,
// "Why Presentail" points and all FAQ answers — so no crawlable content
// disappears once JavaScript loads (anti-cloaking requirement).

import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test-utils";
import Home from "./Home";
import { getCityHomeSeoOverride } from "@/lib/seo";
import { CITY_SEO } from "@/data/city-seo.mjs";

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

// Heavy, data-driven homepage sections are irrelevant to the parity check.
vi.mock("@/components/homepage/HeroBannerCarousel", () => ({
  HeroBannerCarousel: ({ cityHeading }: { cityHeading?: string }) => (
    <div data-testid="hero-banner-carousel">
      {cityHeading && <h1 data-testid="hero-city-heading">{cityHeading}</h1>}
    </div>
  ),
}));
vi.mock("@/components/homepage/HomepageCollections", () => ({ HomepageCollections: () => null }));
vi.mock("@/components/homepage/BestSellersPreview", () => ({ BestSellersPreview: () => null }));
vi.mock("@/components/homepage/TrustpilotCarousel", () => ({ TrustpilotCarousel: () => null }));
vi.mock("@/components/homepage/TrustpilotBrandsRow", () => ({ TrustpilotBrandsRow: () => null }));
vi.mock("@/components/ProductCard", () => ({ ProductCard: () => null }));
vi.mock("@/lib/banners", () => ({ useHomepageBanners: vi.fn(() => ({ data: undefined, isLoading: false })) }));
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn(async () => ({ countryCode: null })) }));
vi.mock("@workspace/api-client-react", () => ({
  useGetHomepageBestSellers: vi.fn(() => ({ data: undefined, isLoading: false })),
  getGetHomepageBestSellersQueryKey: vi.fn(() => ["homepage-best-sellers"]),
}));
vi.mock("@/lib/queries", () => ({
  useProducts: vi.fn(() => ({ data: undefined, isLoading: false })),
  useCatalogMetadata: vi.fn(() => ({ data: undefined })),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: vi.fn(() => false) }));

const EN_LOCALE = {
  language: "en" as const,
  dir: "ltr" as const,
  cityName: (() => "Tripoli") as unknown as (id: string) => string,
  t: (key: string) => key,
};

describe("Home — Tripoli city override hydration parity", () => {
  it("renders the override H1, intro, coverage paragraph, why points and all FAQ answers visibly", () => {
    const override = getCityHomeSeoOverride("lb-tripoli", "en");
    expect(override).toBeTruthy();
    const coverage = CITY_SEO["lb-tripoli"].en;
    expect(coverage).toBeTruthy();

    renderWithProviders(<Home />, { locale: EN_LOCALE });

    // H1 matches the server-injected H1 exactly.
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe(override!.h1);

    // Intro + delivery-coverage paragraph (same CITY_SEO copy the server injects).
    expect(screen.getAllByText(coverage)).toHaveLength(1);

    // "Why Presentail" heading + every point.
    expect(screen.getByText(override!.whyHeading!)).toBeTruthy();
    for (const point of override!.whyPoints!) {
      expect(screen.getByText(point)).toBeTruthy();
    }

    // Every FAQ question AND answer is visible (no closed accordion / hidden attr).
    for (const { question, answer } of override!.faqs!) {
      expect(screen.getByText(question)).toBeTruthy();
      const answerEl = screen.getByText(answer);
      expect(answerEl.closest("[hidden]")).toBeNull();
    }
  });
});
