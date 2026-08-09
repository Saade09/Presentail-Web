// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test-utils";
import React from "react";

// ---------------------------------------------------------------------------
// Module mocks — must be declared before component import (vi.mock is hoisted)
// ---------------------------------------------------------------------------

vi.mock("@/components/product/useDeliveryConfig", () => ({
  useDeliveryConfig: vi.fn(() => ({
    freeDeliveryThreshold: "$100",
    expressDeliveryTimeLabel: "Arrives in 90 minutes",
    freeDeliveryEnabled: true,
    currency: "USD",
    cityFeeUsd: null,
    expressSurchargeUsd: 0,
  })),
}));

// Render a plain text price so tests don't depend on FX rate queries
vi.mock("@/components/FormattedPrice", () => ({
  FormattedPrice: ({ usdValue }: { usdValue: number }) => (
    <span data-testid="formatted-price">${usdValue}</span>
  ),
}));

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import { FreeDeliveryBanner } from "./FreeDeliveryBanner";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const THRESHOLD_USD = 100; // must match freeDeliveryThreshold "$100" above

const translations: Record<string, string> = {
  "cart.banner.remaining": "Add {amount} more for free standard delivery",
  "cart.banner.expressStillApplies": "Express delivery fees still apply.",
  "cart.banner.unlocked": "Free standard delivery unlocked",
  "cart.banner.expressUnlockedHelper":
    "Express delivery remains available for an additional fee.",
  "cart.banner.goal": "goal",
  "cart.banner.goalReached": "Goal reached",
  "cart.banner.truckAria": "Delivery progress",
  "cart.banner.unlockedAria": "Free delivery unlocked",
  "cart.banner.staticAbove": "Free delivery on orders above",
  "cart.banner.withExpress": "with express delivery.",
};

const t = (key: string) => translations[key] ?? key;

function renderBanner(subtotal?: number, overrideThresholdUsd?: number) {
  return renderWithProviders(
    <FreeDeliveryBanner subtotal={subtotal} overrideThresholdUsd={overrideThresholdUsd} />,
    { locale: { t } },
  );
}

function getProgressBar() {
  return screen.getByRole("progressbar");
}

function getFilledBar() {
  // The coloured fill is the only child of the progressbar div
  return getProgressBar().firstElementChild as HTMLElement;
}

// ---------------------------------------------------------------------------
// Static fallback (no subtotal prop)
// ---------------------------------------------------------------------------

describe("FreeDeliveryBanner — static fallback", () => {
  it("renders the banner wrapper", () => {
    renderBanner();
    expect(screen.getByTestId("free-delivery-banner")).toBeTruthy();
  });

  it("shows the static 'Free delivery on orders above' headline", () => {
    renderBanner();
    // The <p> contains both the translation string and the threshold label
    // (either a string or a FormattedPrice span), so we match on the paragraph's
    // full textContent rather than an exact string.
    expect(
      screen.getByText(/Free delivery on orders above/, { selector: "p" }),
    ).toBeTruthy();
  });

  it("shows the express delivery helper text", () => {
    renderBanner();
    // The helper <p> also contains the expressDeliveryTimeLabel prefix,
    // so we match the portion that comes from the translation key.
    expect(
      screen.getByText(/with express delivery\./, { selector: "p" }),
    ).toBeTruthy();
  });

  it("does not render a progress bar", () => {
    renderBanner();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("shows the truck icon aria-label", () => {
    renderBanner();
    expect(screen.getByRole("img", { name: "Delivery progress" })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// In-progress state (subtotal < threshold)
// ---------------------------------------------------------------------------

describe("FreeDeliveryBanner — in-progress state", () => {
  const subtotal = 40; // below $100 threshold → remaining = $60, pct = 40%

  it("renders the remaining-amount headline text", () => {
    renderBanner(subtotal);
    // The headline <p> contains "Add <FormattedPrice/> more for free standard delivery".
    // Because the price lives in a child span, we match the full textContent of the <p>.
    expect(
      screen.getByText(/Add.*more for free standard delivery/, { selector: "p" }),
    ).toBeTruthy();
  });

  it("shows FormattedPrice with the remaining USD amount in the headline", () => {
    renderBanner(subtotal);
    const prices = screen.getAllByTestId("formatted-price");
    const remaining = THRESHOLD_USD - subtotal;
    const remainingPriceEl = prices.find((el) => el.textContent === `$${remaining}`);
    expect(remainingPriceEl).toBeTruthy();
  });

  it("shows the express-still-applies helper text", () => {
    renderBanner(subtotal);
    expect(
      screen.getByText("Express delivery fees still apply."),
    ).toBeTruthy();
  });

  it("renders a progress bar", () => {
    renderBanner(subtotal);
    expect(getProgressBar()).toBeTruthy();
  });

  it("sets aria-valuenow to the rounded progress percentage", () => {
    renderBanner(subtotal);
    const expectedPct = Math.round((subtotal / THRESHOLD_USD) * 100);
    expect(getProgressBar().getAttribute("aria-valuenow")).toBe(
      String(expectedPct),
    );
  });

  it("sets aria-valuemax to 100", () => {
    renderBanner(subtotal);
    expect(getProgressBar().getAttribute("aria-valuemax")).toBe("100");
  });

  it("sets the progress bar aria-label to the truck label", () => {
    renderBanner(subtotal);
    expect(getProgressBar().getAttribute("aria-label")).toBe(
      "Delivery progress",
    );
  });

  it("fills the bar to the correct percentage width", () => {
    renderBanner(subtotal);
    const expectedWidth = `${(subtotal / THRESHOLD_USD) * 100}%`;
    expect(getFilledBar().style.width).toBe(expectedWidth);
  });

  it("colours the bar orange (in-progress colour)", () => {
    renderBanner(subtotal);
    expect(getFilledBar().className).toContain("bg-[#d97706]");
  });

  it("shows the threshold FormattedPrice with 'goal' label on the right", () => {
    renderBanner(subtotal);
    const prices = screen.getAllByTestId("formatted-price");
    const thresholdEl = prices.find(
      (el) => el.textContent === `$${THRESHOLD_USD}`,
    );
    expect(thresholdEl).toBeTruthy();
    expect(screen.getByText("goal")).toBeTruthy();
  });

  it("shows the current subtotal FormattedPrice on the left", () => {
    renderBanner(subtotal);
    const prices = screen.getAllByTestId("formatted-price");
    const subtotalEl = prices.find((el) => el.textContent === `$${subtotal}`);
    expect(subtotalEl).toBeTruthy();
  });

  it("shows the truck icon (not a checkmark)", () => {
    renderBanner(subtotal);
    expect(screen.getByRole("img", { name: "Delivery progress" })).toBeTruthy();
    expect(screen.queryByRole("img", { name: "Free delivery unlocked" })).toBeNull();
  });

  it("renders the Truck SVG glyph and not the Check glyph", () => {
    const { container } = renderBanner(subtotal);
    expect(container.querySelector(".lucide-truck")).toBeTruthy();
    expect(container.querySelector(".lucide-check")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Unlocked state (subtotal >= threshold)
// ---------------------------------------------------------------------------

describe("FreeDeliveryBanner — unlocked state", () => {
  const subtotal = 120; // above $100 threshold

  it("shows the 'Free standard delivery unlocked' headline", () => {
    renderBanner(subtotal);
    expect(
      screen.getByText("Free standard delivery unlocked"),
    ).toBeTruthy();
  });

  it("shows the express-available helper text", () => {
    renderBanner(subtotal);
    expect(
      screen.getByText(
        "Express delivery remains available for an additional fee.",
      ),
    ).toBeTruthy();
  });

  it("fills the bar to 100%", () => {
    renderBanner(subtotal);
    expect(getFilledBar().style.width).toBe("100%");
  });

  it("colours the bar with the primary (teal) colour", () => {
    renderBanner(subtotal);
    expect(getFilledBar().className).toContain("bg-primary");
    expect(getFilledBar().className).not.toContain("bg-[#d97706]");
  });

  it("shows 'Goal reached' on the right label", () => {
    renderBanner(subtotal);
    expect(screen.getByText("Goal reached")).toBeTruthy();
  });

  it("sets aria-valuenow to 100", () => {
    renderBanner(subtotal);
    expect(getProgressBar().getAttribute("aria-valuenow")).toBe("100");
  });

  it("sets the progress bar aria-label to the unlocked label", () => {
    renderBanner(subtotal);
    expect(getProgressBar().getAttribute("aria-label")).toBe(
      "Free delivery unlocked",
    );
  });

  it("shows the checkmark icon aria-label", () => {
    renderBanner(subtotal);
    expect(
      screen.getByRole("img", { name: "Free delivery unlocked" }),
    ).toBeTruthy();
  });

  it("does not show the truck icon aria-label", () => {
    renderBanner(subtotal);
    expect(
      screen.queryByRole("img", { name: "Delivery progress" }),
    ).toBeNull();
  });

  it("renders the Check SVG glyph and not the Truck glyph", () => {
    const { container } = renderBanner(subtotal);
    expect(container.querySelector(".lucide-check")).toBeTruthy();
    expect(container.querySelector(".lucide-truck")).toBeNull();
  });

  it("renders the Check icon container for the unlocked state", () => {
    renderBanner(subtotal);
    const iconSpan = screen.getByRole("img", { name: "Free delivery unlocked" });
    expect(iconSpan).not.toBeNull();
  });

  it("renders the Check icon with primary text colour", () => {
    const { container } = renderBanner(subtotal);
    const checkIcon = container.querySelector(".lucide-check");
    expect(checkIcon).toBeTruthy();
    // SVG className is an SVGAnimatedString — use getAttribute for plain string comparison
    expect(checkIcon!.getAttribute("class")).toContain("text-primary");
  });
});

// ---------------------------------------------------------------------------
// Edge case: subtotal === threshold (exactly at the boundary)
// ---------------------------------------------------------------------------

describe("FreeDeliveryBanner — edge case: subtotal exactly equals threshold", () => {
  const subtotal = THRESHOLD_USD; // 100 === 100

  it("treats exactly-at-threshold as unlocked", () => {
    renderBanner(subtotal);
    expect(
      screen.getByText("Free standard delivery unlocked"),
    ).toBeTruthy();
  });

  it("fills the bar to 100%", () => {
    renderBanner(subtotal);
    expect(getFilledBar().style.width).toBe("100%");
  });

  it("shows 'Goal reached' on the right label", () => {
    renderBanner(subtotal);
    expect(screen.getByText("Goal reached")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Edge case: subtotal === 0 (empty bar)
// ---------------------------------------------------------------------------

describe("FreeDeliveryBanner — edge case: subtotal is 0", () => {
  it("renders the in-progress state", () => {
    renderBanner(0);
    // Same split-element structure as the general in-progress state
    expect(
      screen.getByText(/Add.*more for free standard delivery/, { selector: "p" }),
    ).toBeTruthy();
  });

  it("sets the bar width to 0%", () => {
    renderBanner(0);
    expect(getFilledBar().style.width).toBe("0%");
  });

  it("sets aria-valuenow to 0", () => {
    renderBanner(0);
    expect(getProgressBar().getAttribute("aria-valuenow")).toBe("0");
  });

  it("shows the full threshold as the remaining amount", () => {
    renderBanner(0);
    const prices = screen.getAllByTestId("formatted-price");
    const remainingEl = prices.find(
      (el) => el.textContent === `$${THRESHOLD_USD}`,
    );
    expect(remainingEl).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// overrideThresholdUsd — city-level threshold override
// ---------------------------------------------------------------------------

describe("FreeDeliveryBanner — overrideThresholdUsd prop", () => {
  it("uses the override threshold for progress math", () => {
    const override = 50;
    renderBanner(25, override); // 50% progress against $50 threshold
    const expectedPct = Math.round((25 / override) * 100);
    expect(getProgressBar().getAttribute("aria-valuenow")).toBe(
      String(expectedPct),
    );
  });

  it("treats subtotal >= overrideThreshold as unlocked", () => {
    renderBanner(50, 50);
    expect(
      screen.getByText("Free standard delivery unlocked"),
    ).toBeTruthy();
  });
});
