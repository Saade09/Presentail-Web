// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import BeirutLateNightLanding from "../BeirutLateNightLanding";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { LocationProvider } from "@/contexts/LocationContext";
import { DeliverySelectionProvider } from "@/contexts/DeliverySelectionContext";
import * as apiClient from "@workspace/api-client-react";

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/api-client-react")>();
  return {
    ...actual,
    useGetBeirutLateNightCampaign: vi.fn(),
  };
});

// Mock analytics
vi.mock("@/lib/analytics", async (importOriginal) => {
  const { mockAnalyticsModule } = await import("@/test/analytics-mock");
  return mockAnalyticsModule(importOriginal, {
    trackWebEvent: vi.fn(),
    trackEvent: vi.fn(),
  });
});

vi.mock("@/lib/gtag", () => ({
  fireGtagEvent: vi.fn(),
}));

vi.mock("@/lib/campaign", () => ({
  markCampaignIdentity: vi.fn(),
  LATE_NIGHT_CAMPAIGN_SECTION_KEY: "campaign-beirut-late-night",
}));

// Mock Trustpilot so we don't try to load the real script
vi.mock("@/components/product/TrustpilotMicroWidget", () => ({
  TrustpilotMicroWidget: () => <div data-testid="mock-trustpilot" />,
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <LocationProvider>
          <DeliverySelectionProvider>
            {ui}
          </DeliverySelectionProvider>
        </LocationProvider>
      </LocaleProvider>
    </QueryClientProvider>
  );
}

describe("BeirutLateNightLanding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("renders tonight state with exact copy and one hero button", () => {
    vi.mocked(apiClient.useGetBeirutLateNightCampaign).mockReturnValue({
      data: {
        campaignKey: "campaign-beirut-late-night",
        status: "tonight",
        reason: "eligible",
        quoteExpiresAt: new Date(Date.now() + 60000).toISOString(),
        cutoffLabel: "11:30 PM",
        deliveryWindow: {
          date: "2026-08-19",
          label: "11:00 PM – 1:00 AM",
          slotId: "beirut-late",
        },
        availableTonight: {
          title: "Available Tonight",
          subtitle: "Fresh flowers ready for late-night delivery in Beirut",
          viewAllHref: "/collections/tonight",
          products: [],
        },
        luxury: {
          title: "Late-Night Luxury",
          subtitle: "Statement flowers",
          viewAllHref: "/collections/luxury",
          products: [],
        },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    } as any);

    renderWithProviders(<BeirutLateNightLanding />);

    // Status pill
    expect(screen.getByTestId("late-night-status-pill").textContent).toContain("Delivering late tonight \u00B7 Order by 11:30 PM Beirut time");
    
    // Headline
    expect(screen.getByTestId("late-night-headline").textContent).toContain("Late-night flower delivery in Beirut");

    // Support copy (subtitle)
    expect(screen.getByTestId("late-night-support-copy").textContent).toContain("Last-minute doesn’t have to feel last-minute. Choose from fresh arrangements available now for delivery tonight in Beirut.");

    // Hero CTA
    expect(screen.getByTestId("late-night-hero-cta").textContent).toContain("Shop flowers available tonight");

    // Exact one hero button inside the hero text block (the CTA itself)
    // plus the sticky mobile one. Let's check test IDs.
    expect(screen.getAllByRole("button", { name: /Shop flowers available tonight/i }).length).toBe(2); // One is sticky, one is hero.

    // Support text link
    const supportLink = screen.getByTestId("late-night-support-link");
    expect(supportLink.textContent).toContain("Need help choosing? Chat with a support agent");
    expect(supportLink.tagName).toBe("A");
    
    // Live Trustpilot
    expect(screen.getByTestId("mock-trustpilot")).toBeDefined();

    fireEvent.click(
      screen.getAllByRole("button", {
        name: /Shop flowers available tonight/i,
      })[0]!,
    );
    expect(
      JSON.parse(
        localStorage.getItem("presentail_delivery_selection_v1") ?? "{}",
      ),
    ).toEqual(
      expect.objectContaining({
        mode: "today_slot",
        date: "2026-08-19",
        slotLabel: "11:00 PM – 1:00 AM",
        slotId: "beirut-late",
        source: "user_selected",
      }),
    );
  });

  it("renders next-available state for after-cutoff behavior", () => {
    vi.mocked(apiClient.useGetBeirutLateNightCampaign).mockReturnValue({
      data: {
        campaignKey: "campaign-beirut-late-night",
        status: "next-available",
        reason: "after-cutoff",
        timeZone: "Asia/Beirut",
        quoteExpiresAt: new Date(Date.now() + 60000).toISOString(),
        nextAvailableWindow: {
          date: "2026-08-20",
          label: "8 AM - 12 PM",
        },
        availableTonight: { products: [] },
        luxury: { products: [] },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    } as any);

    renderWithProviders(<BeirutLateNightLanding />);

    // Should NOT say tonight
    expect(screen.queryByText(/tonight/i)).toBeNull();
    
    expect(screen.getByTestId("late-night-status-pill").textContent).toContain("Next delivery:");
    expect(screen.getByTestId("late-night-status-pill").textContent).toContain("8 AM - 12 PM");
    expect(screen.getByTestId("late-night-headline").textContent).toContain("Flower delivery in Beirut");
    expect(screen.getByTestId("late-night-hero-cta").textContent).toContain("Shop flowers for the next window");
  });

  it("keeps the dedicated landing page truthful when late-night delivery is unavailable", () => {
    vi.mocked(apiClient.useGetBeirutLateNightCampaign).mockReturnValue({
      data: {
        campaignKey: "campaign-beirut-late-night",
        status: "unavailable",
        reason: "inventory-unavailable",
        quoteExpiresAt: new Date(Date.now() + 60000).toISOString(),
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    } as any);

    renderWithProviders(<BeirutLateNightLanding />);

    expect(screen.getByTestId("late-night-headline").textContent).toContain("Late-night flower delivery in Beirut");
    expect(screen.getByTestId("late-night-status-pill").textContent).toContain("Late-night delivery is unavailable right now");
    expect(screen.getByTestId("late-night-empty-state")).toBeDefined();
    expect(screen.getByTestId("late-night-empty-headline").textContent).toContain("Late-night delivery is unavailable right now");
    expect(screen.queryByTestId("late-night-hero-cta")).toBeNull();
    expect(screen.queryByTestId("late-night-sticky-cta")).toBeNull();
  });

  it("triggers refetch on visibility change", () => {
    const refetch = vi.fn();
    vi.mocked(apiClient.useGetBeirutLateNightCampaign).mockReturnValue({
      data: { status: "unavailable", quoteExpiresAt: new Date(Date.now() + 60000).toISOString() },
      isLoading: false,
      isError: false,
      refetch,
      isFetching: false,
    } as any);

    renderWithProviders(<BeirutLateNightLanding />);
    
    // Simulate visibility change
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    
    expect(refetch).toHaveBeenCalled();
  });
});
