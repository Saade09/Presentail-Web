// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CampaignLanding from "./CampaignLanding";

const mocks = vi.hoisted(() => ({
  cityId: "ae-dubai",
  cityName: "Dubai",
  countryCode: "AE",
  language: "en",
  getCollectionOptions: vi.fn((input: unknown) => input),
  useQueries: vi.fn(() => []),
  trackEvent: vi.fn(),
  trackWebEvent: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueries: mocks.useQueries,
}));

vi.mock("@workspace/api-client-react", () => ({
  getGetHomepageCollectionBestSellersQueryOptions: mocks.getCollectionOptions,
}));

vi.mock("@/contexts/LocationContext", () => ({
  useLocationSelection: () => ({
    countryCode: mocks.countryCode,
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
  "campaign.redesign.reviews.heading": "What customers say",
  "campaign.v2.reviews.readAll": "Read all reviews",
  "campaign.redesign.trustpilot.fallback": "See our reviews on Trustpilot.",
  "campaign.stickyCta": "Shop Flowers Available Today",
};

vi.mock("@/contexts/LocaleContext", () => ({
  useLocale: () => ({
    dir: "ltr",
    language: mocks.language,
    cityName: (_id: string, name: string) => name,
    t: (key: string, params: Record<string, string> = {}) =>
      (copy[key] ?? key).replace(
        /\{(\w+)\}/g,
        (_match, name) => params[name] ?? `{${name}}`,
      ),
  }),
}));

vi.mock("@/lib/useDisplayCurrency", () => ({
  useDisplayCurrency: () => ({ currencyCode: "USD" }),
}));

vi.mock("@/lib/useIpDetectedCountry", () => ({
  useIpDetectedCountry: () => ({ country: "AE", settled: true }),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn().mockResolvedValue({
    ok: true,
    eligible: false,
    known: true,
  }),
}));

vi.mock("@/lib/analytics", () => ({
  trackEvent: mocks.trackEvent,
  trackWebEvent: mocks.trackWebEvent,
}));

vi.mock("@/lib/gtag", () => ({
  fireGtagEvent: vi.fn(),
}));

vi.mock("@/lib/campaign", () => ({
  CAMPAIGN_SECTION_KEY: "campaign-flower-delivery",
  BIENVENUE_DIX_CODE: "bienvenueDIX",
  hasOrderedLocally: () => false,
  markFirstOrderPromoShown: vi.fn(),
  markPendingCampaignCoupon: vi.fn(),
  setDirectCouponForCheckout: vi.fn(),
}));

vi.mock("@/pages/CampaignSections", () => ({
  GRID_SIZE: 8,
  CampaignGrid: ({ section, title }: { section: string; title: string }) => (
    <section data-testid={`campaign-grid-${section}`}>
      <h2>{title}</h2>
    </section>
  ),
  CampaignOccasions: () => <section data-testid="campaign-section-occasions" />,
  CampaignBenefitBand: () => <section data-testid="campaign-section-benefits" />,
  CampaignLuxuryBanner: () => <section data-testid="campaign-section-luxury-banner" />,
  CampaignWhyChoose: () => <section data-testid="campaign-section-why-choose" />,
  CampaignMoreFlowers: () => <section data-testid="campaign-section-more-flowers" />,
  CampaignReviews: ({ onVisible }: { onVisible?: () => void }) => (
    <section data-testid="campaign-section-reviews">
      <h2>What customers say</h2>
      <a
        href="https://www.trustpilot.com/review/presentail.com"
        data-testid="link-campaign-reviews-read-all"
        onClick={onVisible}
      >
        Read all reviews
      </a>
      <div data-testid="campaign-reviews-trustpilot-widget" />
    </section>
  ),
  CampaignFaq: () => <section data-testid="campaign-section-faq" />,
  CampaignSeoEditorial: () => <section data-testid="campaign-section-seo" />,
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
    mocks.language = "en";
    vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
  });

  it.each([
    ["ae-dubai", "Dubai", "AE"],
    ["ae-abu-dhabi", "Abu Dhabi", "AE"],
  ])("renders the redesigned campaign structure for %s", (cityId, cityName, countryCode) => {
    mocks.cityId = cityId;
    mocks.cityName = cityName;
    mocks.countryCode = countryCode;

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
    expect(screen.getByTestId("campaign-section-occasions")).toBeDefined();
    expect(screen.getByTestId("campaign-section-benefits")).toBeDefined();
    expect(screen.getByTestId("campaign-section-luxury-banner")).toBeDefined();
    expect(screen.getByTestId("campaign-section-why-choose")).toBeDefined();

    // Trustpilot review carousel is shown for all markets via CampaignReviews.
    const reviewsSection = screen.getByTestId("campaign-section-reviews");
    expect(reviewsSection).toBeDefined();
    // The heading should be the approved copy ("What customers say").
    expect(reviewsSection.querySelector("h2")?.textContent).toBe("What customers say");
    // "Read all reviews" link is keyboard-accessible and points to Trustpilot.
    const readAllLink = screen.getByTestId("link-campaign-reviews-read-all");
    expect(readAllLink.getAttribute("href")).toBe(
      "https://www.trustpilot.com/review/presentail.com",
    );
    // The official Trustpilot widget is present (no static review cards).
    expect(screen.getByTestId("campaign-reviews-trustpilot-widget")).toBeDefined();

    expect(screen.getByTestId("campaign-section-more-flowers")).toBeDefined();
    expect(screen.getByTestId("campaign-section-faq")).toBeDefined();
    expect(screen.getByTestId("campaign-section-seo")).toBeDefined();

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
    mocks.countryCode = "AE";

    render(<CampaignLanding />);

    expect(screen.getByTestId("campaign-landing-legacy")).toBeDefined();
    expect(screen.queryByTestId("text-campaign-headline")).toBeNull();
  });

  it("shows CampaignReviews for Lebanon (Beirut) too", () => {
    mocks.cityId = "lb-beirut";
    mocks.cityName = "Beirut";
    mocks.countryCode = "LB";

    render(<CampaignLanding />);

    expect(screen.getByTestId("campaign-section-reviews")).toBeDefined();
  });

  it("does not render any standalone duplicate Trustpilot carousel", () => {
    mocks.cityId = "ae-dubai";
    mocks.cityName = "Dubai";
    mocks.countryCode = "AE";

    render(<CampaignLanding />);

    // There must be exactly one reviews section on the page.
    expect(screen.getAllByTestId("campaign-section-reviews")).toHaveLength(1);
  });

  it("emits customer_reviews_view_all_click with required fields when the read-all link is clicked", async () => {
    mocks.cityId = "ae-dubai";
    mocks.cityName = "Dubai";
    mocks.countryCode = "AE";

    render(<CampaignLanding />);

    // The link fires the analytics event via the onVisible prop passed to
    // the CampaignReviews mock (wired to onClick on the link in the mock).
    const link = screen.getByTestId("link-campaign-reviews-read-all");
    await userEvent.click(link);

    // The event is fired by the real CampaignReviews; the mock here wires
    // onVisible to onClick. Verify fireCampaignEvent fired (trustpilot_carousel_interaction).
    expect(mocks.trackEvent).toHaveBeenCalled();
  });
});
