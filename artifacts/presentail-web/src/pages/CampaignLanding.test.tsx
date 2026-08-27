// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CampaignLanding from "./CampaignLanding";

const mocks = vi.hoisted(() => ({
  cityId: "ae-dubai",
  cityName: "Dubai",
  getCollectionOptions: vi.fn((input: unknown) => input),
  useQueries: vi.fn(() => []),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueries: mocks.useQueries,
}));

vi.mock("@workspace/api-client-react", () => ({
  getGetHomepageCollectionBestSellersQueryOptions: mocks.getCollectionOptions,
}));

vi.mock("@/contexts/LocationContext", () => ({
  useLocationSelection: () => ({
    countryCode: mocks.cityId.startsWith("ae-") ? "AE" : "LB",
    cityId: mocks.cityId,
    city: {
      id: mocks.cityId,
      name: mocks.cityName,
      isActive: true,
      operationsConfigVerified: false,
    },
    deliveryDataStatus: "fallback",
  }),
}));

const copy: Record<string, string> = {
  "campaign.redesign.hero.titleSameDay": "Same-day flower delivery in {city}",
  "campaign.redesign.hero.titleNeutral": "Flower delivery in {city}",
  "campaign.redesign.hero.subtitle":
    "Browse fresh arrangements available for {city}. Delivery dates and times are confirmed at checkout.",
  "campaign.redesign.hero.imageAlt":
    "Premium fresh flower arrangement ready for delivery",
  "campaign.redesign.hero.cta": "Shop flowers available today",
  "campaign.redesign.hero.support":
    "Need help choosing? Chat with a support agent",
  "campaign.redesign.hero.supportPrefill":
    "Hi! I need help choosing flowers for delivery in {city}.",
  "campaign.redesign.status.neutral":
    "Delivery availability confirmed at checkout",
  "campaign.redesign.status.speedNeutral":
    "Delivery timing confirmed at checkout",
  "campaign.redesign.status.currency": "Prices shown in {currency}",
  "campaign.redesign.flowers.title": "Flowers",
  "campaign.redesign.flowers.subtitle":
    "Fresh arrangements ready to deliver today",
  "campaign.redesign.luxury.title": "Luxury Arrangements",
  "campaign.redesign.luxury.subtitle":
    "Statement designs for unforgettable moments",
  "campaign.redesign.viewAll": "View all",
  "campaign.stickyCta": "Shop Flowers Available Today",
};

vi.mock("@/contexts/LocaleContext", () => ({
  useLocale: () => ({
    dir: "ltr",
    language: "en",
    cityName: (_id: string, name: string) => name,
    t: (key: string, params: Record<string, string> = {}) =>
      (copy[key] ?? key).replace(
        /\{(\w+)\}/g,
        (_match, name) => params[name] ?? `{${name}}`,
      ),
  }),
}));

vi.mock("@/lib/useDisplayCurrency", () => ({
  useDisplayCurrency: () => ({ currencyCode: "AED" }),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn().mockResolvedValue({
    ok: true,
    eligible: false,
    known: true,
  }),
}));

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
  trackWebEvent: vi.fn(),
}));

vi.mock("@/lib/gtag", () => ({
  fireGtagEvent: vi.fn(),
}));

vi.mock("@/lib/campaign", () => ({
  CAMPAIGN_SECTION_KEY: "campaign-flower-delivery",
  hasOrderedLocally: () => false,
  markFirstOrderPromoShown: vi.fn(),
}));

vi.mock("@/pages/CampaignSections", () => ({
  CampaignGrid: ({ section, title }: { section: string; title: string }) => (
    <section data-testid={`campaign-grid-${section}`}>
      <h2>{title}</h2>
    </section>
  ),
  CampaignOccasions: () => null,
  CampaignBenefitBand: () => null,
  CampaignLuxuryBanner: () => null,
  CampaignWhyChoose: () => null,
  CampaignMoreFlowers: () => null,
  CampaignFaq: () => null,
  CampaignSeoEditorial: () => null,
}));

vi.mock("@/components/homepage/TrustpilotCarousel", () => ({
  TrustpilotCarousel: () => null,
}));

vi.mock("./CampaignLandingLegacy", () => ({
  CampaignLandingLegacy: () => (
    <div data-testid="campaign-landing-legacy">Legacy campaign</div>
  ),
}));

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("CampaignLanding UAE route parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useQueries.mockReturnValue([]);
    vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
  });

  it.each([
    ["ae-dubai", "Dubai"],
    ["ae-abu-dhabi", "Abu Dhabi"],
  ])("renders the redesigned campaign structure for %s", (cityId, cityName) => {
    mocks.cityId = cityId;
    mocks.cityName = cityName;

    render(<CampaignLanding />);

    expect(screen.queryByTestId("campaign-landing-legacy")).toBeNull();
    expect(screen.getByTestId("text-campaign-headline").textContent).toBe(
      `Flower delivery in ${cityName}`,
    );
    expect(screen.getByTestId("button-campaign-hero-cta").textContent).toBe(
      "Shop flowers available today",
    );
    expect(
      decodeURIComponent(
        screen.getByTestId("link-campaign-support").getAttribute("href") ?? "",
      ),
    ).toContain(`delivery in ${cityName}`);
    expect(screen.getByTestId("trust-cell-currency").textContent).toContain(
      "AED",
    );
    expect(screen.getByTestId("bar-campaign-sticky")).toBeDefined();

    const sections = screen
      .getAllByTestId(/^campaign-grid-/)
      .map((node) => node.getAttribute("data-testid"));
    expect(sections).toEqual(["campaign-grid-flowers", "campaign-grid-luxury"]);

    expect(mocks.getCollectionOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        countryCode: "AE",
        cityId,
        lang: "en",
      }),
    );
  });

  it("keeps a non-target city on the legacy campaign", () => {
    mocks.cityId = "ae-sharjah";
    mocks.cityName = "Sharjah";

    render(<CampaignLanding />);

    expect(screen.getByTestId("campaign-landing-legacy")).toBeDefined();
    expect(screen.queryByTestId("text-campaign-headline")).toBeNull();
  });
});
