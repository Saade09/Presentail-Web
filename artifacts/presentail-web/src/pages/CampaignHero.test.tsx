// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CampaignTrustpilotStrip, getCampaignTrustpilotLocale } from "./CampaignHero";

const mocks = vi.hoisted(() => ({
  language: "en" as "en" | "ar" | "fr",
  dir: "ltr" as "ltr" | "rtl",
  countryCode: "AE",
  cityId: "ae-dubai",
  inject: vi.fn(),
  poll: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock("@/contexts/LocaleContext", () => ({
  useLocale: () => ({
    language: mocks.language,
    dir: mocks.dir,
    t: (key: string) =>
      key === "campaign.redesign.trustpilot.fallback"
        ? "See our reviews on Trustpilot."
        : key,
  }),
}));

vi.mock("@/contexts/LocationContext", () => ({
  useLocationSelection: () => ({
    countryCode: mocks.countryCode,
    cityId: mocks.cityId,
  }),
}));

vi.mock("@/lib/trustpilot", () => ({
  injectTrustpilotScript: mocks.inject,
  pollAndLoadTrustpilotWidget: mocks.poll,
  TRUSTPILOT_PROFILE_URL: "https://www.trustpilot.com/review/presentail.com",
}));

vi.mock("@/lib/analytics", async (importOriginal) => {
  const { mockAnalyticsModule } = await import("@/test/analytics-mock");
  return mockAnalyticsModule(importOriginal, {
    trackEvent: mocks.trackEvent,
  });
});

describe("CampaignTrustpilotStrip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.language = "en";
    mocks.dir = "ltr";
    mocks.inject.mockImplementation(() => {});
    mocks.poll.mockReturnValue({
      onScriptLoad: vi.fn(),
      cleanup: vi.fn(),
    });
  });

  it("renders the supplied official Mini TrustBox configuration", () => {
    render(<CampaignTrustpilotStrip />);

    const widget = screen.getByTestId("campaign-trustpilot-widget");
    expect(widget.getAttribute("data-locale")).toBe("en-US");
    expect(widget.getAttribute("data-template-id")).toBe("53aa8807dec7e10d38f59f32");
    expect(widget.getAttribute("data-businessunit-id")).toBe("5d1782b3588afe00012431d9");
    expect(widget.getAttribute("data-style-height")).toBe("150px");
    expect(widget.getAttribute("data-style-width")).toBe("100%");
    expect(widget.getAttribute("data-token")).toBe("67c8c2d2-17c0-4add-bcda-ed2e5ce5eb5e");
    expect(widget.parentElement).not.toBeInstanceOf(HTMLAnchorElement);
  });

  it("reinitializes the widget only when its locale changes", () => {
    const { rerender } = render(<CampaignTrustpilotStrip />);
    expect(mocks.inject).toHaveBeenCalledOnce();

    rerender(<CampaignTrustpilotStrip />);
    expect(mocks.inject).toHaveBeenCalledOnce();

    mocks.language = "ar";
    mocks.dir = "rtl";
    rerender(<CampaignTrustpilotStrip />);

    expect(screen.getByTestId("campaign-trustpilot-widget").getAttribute("data-locale")).toBe(
      "ar-AE",
    );
    expect(screen.getByTestId("campaign-trustpilot-card").getAttribute("dir")).toBe("rtl");
    expect(mocks.inject).toHaveBeenCalledTimes(2);
  });

  it("replaces a failed widget with the neutral profile link and tracks the fallback", async () => {
    let onError: (() => void) | undefined;
    mocks.inject.mockImplementation((_onLoad: () => void, error?: () => void) => {
      onError = error;
    });

    render(<CampaignTrustpilotStrip />);
    onError?.();

    const fallback = await screen.findByTestId("link-campaign-trustpilot-fallback");
    expect(fallback.getAttribute("href")).toBe(
      "https://www.trustpilot.com/review/presentail.com",
    );
    expect(fallback.textContent).toContain("See our reviews on Trustpilot.");

    fireEvent.click(fallback);
    await waitFor(() => {
      expect(mocks.trackEvent).toHaveBeenCalledWith({
        name: "trustpilot_reviews_click",
        page_path: window.location.pathname,
        selected_country: "AE",
        selected_city: "ae-dubai",
        active_language: "en",
        link_type: "fallback",
      });
    });
  });

  it("maps campaign languages to the approved Trustpilot locales", () => {
    expect(getCampaignTrustpilotLocale("en", "LB")).toBe("en-US");
    expect(getCampaignTrustpilotLocale("ar", "AE")).toBe("ar-AE");
    expect(getCampaignTrustpilotLocale("ar", "LB")).toBe("ar-LB");
    expect(getCampaignTrustpilotLocale("fr", "AE")).toBe("fr-FR");
  });
});