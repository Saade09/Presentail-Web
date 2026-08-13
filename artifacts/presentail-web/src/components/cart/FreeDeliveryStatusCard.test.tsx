// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test-utils";

import {
  FreeDeliveryStatusCard,
  resolveFreeDeliveryState,
  FREE_DELIVERY_CLOSE_RANGE_PCT,
} from "./FreeDeliveryStatusCard";

// ---------------------------------------------------------------------------
// resolveFreeDeliveryState — the three-state decision logic
// ---------------------------------------------------------------------------

const BASE = {
  thresholdUsd: 100,
  enabled: true,
  configLoaded: true,
  deliveryMode: null as string | null,
};

describe("resolveFreeDeliveryState", () => {
  it("uses 25% as the default close range", () => {
    expect(FREE_DELIVERY_CLOSE_RANGE_PCT).toBe(0.25);
  });

  it("hidden when far below threshold (remaining > 25%)", () => {
    expect(resolveFreeDeliveryState({ ...BASE, subtotalUsd: 20 })).toBe("hidden");
  });

  it("hidden when exactly one cent outside the close range", () => {
    // threshold 100 → close range boundary at remaining = 25.00
    expect(resolveFreeDeliveryState({ ...BASE, subtotalUsd: 74.99 })).toBe("hidden");
  });

  it("close at the exact close-range boundary (remaining == 25%)", () => {
    expect(resolveFreeDeliveryState({ ...BASE, subtotalUsd: 75 })).toBe("close");
  });

  it("close one cent below the threshold", () => {
    expect(resolveFreeDeliveryState({ ...BASE, subtotalUsd: 99.99 })).toBe("close");
  });

  it("unlocked when subtotal equals the threshold exactly", () => {
    expect(resolveFreeDeliveryState({ ...BASE, subtotalUsd: 100 })).toBe("unlocked");
  });

  it("unlocked when subtotal exceeds the threshold", () => {
    expect(resolveFreeDeliveryState({ ...BASE, subtotalUsd: 250 })).toBe("unlocked");
  });

  it("hidden while express delivery is selected, even when unlocked", () => {
    expect(
      resolveFreeDeliveryState({ ...BASE, subtotalUsd: 150, deliveryMode: "express" }),
    ).toBe("hidden");
    expect(
      resolveFreeDeliveryState({ ...BASE, subtotalUsd: 90, deliveryMode: "express" }),
    ).toBe("hidden");
  });

  it("hidden when free delivery is disabled for the market", () => {
    expect(resolveFreeDeliveryState({ ...BASE, subtotalUsd: 150, enabled: false })).toBe("hidden");
  });

  it("fails safe to hidden while the config has not loaded", () => {
    expect(
      resolveFreeDeliveryState({ ...BASE, subtotalUsd: 150, configLoaded: false }),
    ).toBe("hidden");
  });

  it("fails safe to hidden when the threshold is unknown or invalid", () => {
    expect(
      resolveFreeDeliveryState({ ...BASE, subtotalUsd: 150, thresholdUsd: undefined }),
    ).toBe("hidden");
    expect(resolveFreeDeliveryState({ ...BASE, subtotalUsd: 150, thresholdUsd: 0 })).toBe("hidden");
    expect(resolveFreeDeliveryState({ ...BASE, subtotalUsd: 150, thresholdUsd: NaN })).toBe("hidden");
  });

  it("supports a configurable close-range percentage", () => {
    // 10% range: remaining 15 of 100 → hidden at 10%, close at 25%
    expect(
      resolveFreeDeliveryState({ ...BASE, subtotalUsd: 85, closeRangePct: 0.1 }),
    ).toBe("hidden");
    expect(
      resolveFreeDeliveryState({ ...BASE, subtotalUsd: 91, closeRangePct: 0.1 }),
    ).toBe("close");
  });
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const translations: Record<string, string> = {
  "cart.banner.addMore": "Add {amount} more to unlock free standard delivery",
  "cart.banner.shopAddons": "Shop add-ons",
  "cart.banner.unlockedTitle": "You’ve unlocked free standard delivery",
  "cart.banner.chargeRemoved": "{amount} delivery charge removed",
  "cart.banner.nowFree": "Standard delivery is now free",
  "cart.banner.progressAria": "Progress towards free standard delivery",
  "cart.banner.goal": "goal",
};
const t = (key: string) => translations[key] ?? key;

describe("FreeDeliveryStatusCard — hidden state", () => {
  it("renders nothing (no reserved space)", () => {
    const { container } = renderWithProviders(
      <FreeDeliveryStatusCard state="hidden" subtotalUsd={20} thresholdUsd={100} />,
      { locale: { t } },
    );
    expect(container.innerHTML).toBe("");
    expect(screen.queryByTestId("free-delivery-banner")).toBeNull();
  });
});

describe("FreeDeliveryStatusCard — close state", () => {
  it("shows the dynamic remaining amount headline and goal labels", () => {
    renderWithProviders(
      <FreeDeliveryStatusCard state="close" subtotalUsd={80} thresholdUsd={100} onShopAddons={() => {}} />,
      { locale: { t } },
    );
    const headline = screen.getByTestId("text-free-delivery-headline");
    expect(headline.textContent).toContain("Add");
    expect(headline.textContent).toContain("$20");
    expect(headline.textContent).toContain("more to unlock free standard delivery");
    expect(screen.getByTestId("text-free-delivery-current").textContent).toContain("$80");
    expect(screen.getByTestId("text-free-delivery-goal").textContent).toContain("$100");
    expect(screen.getByTestId("text-free-delivery-goal").textContent).toContain("goal");
  });

  it("exposes an accessible progress bar with name and min/current/max", () => {
    renderWithProviders(
      <FreeDeliveryStatusCard state="close" subtotalUsd={80} thresholdUsd={100} />,
      { locale: { t } },
    );
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-label")).toBe("Progress towards free standard delivery");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuenow")).toBe("80");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("80%");
  });

  it("renders the Shop add-ons action as a focusable button when a handler exists", async () => {
    let clicked = 0;
    renderWithProviders(
      <FreeDeliveryStatusCard
        state="close"
        subtotalUsd={80}
        thresholdUsd={100}
        onShopAddons={() => { clicked += 1; }}
      />,
      { locale: { t } },
    );
    const btn = screen.getByTestId("button-shop-addons");
    expect(btn.tagName).toBe("BUTTON");
    btn.click();
    expect(clicked).toBe(1);
  });

  it("omits the Shop add-ons action when no destination exists", () => {
    renderWithProviders(
      <FreeDeliveryStatusCard state="close" subtotalUsd={80} thresholdUsd={100} />,
      { locale: { t } },
    );
    expect(screen.queryByTestId("button-shop-addons")).toBeNull();
  });

  it("does not render the express-delivery secondary sentence", () => {
    renderWithProviders(
      <FreeDeliveryStatusCard state="close" subtotalUsd={80} thresholdUsd={100} />,
      { locale: { t } },
    );
    expect(screen.queryByText(/express/i)).toBeNull();
  });
});

describe("FreeDeliveryStatusCard — unlocked state", () => {
  it("shows the success headline and the actual saving amount", () => {
    renderWithProviders(
      <FreeDeliveryStatusCard state="unlocked" subtotalUsd={120} thresholdUsd={100} standardFeeUsd={7} />,
      { locale: { t } },
    );
    expect(screen.getByTestId("text-free-delivery-headline").textContent).toBe(
      "You’ve unlocked free standard delivery",
    );
    const saving = screen.getByTestId("text-free-delivery-saving");
    expect(saving.textContent).toContain("$7");
    expect(saving.textContent).toContain("delivery charge removed");
  });

  it("falls back to 'Standard delivery is now free' when the saving is unknown", () => {
    renderWithProviders(
      <FreeDeliveryStatusCard state="unlocked" subtotalUsd={120} thresholdUsd={100} standardFeeUsd={null} />,
      { locale: { t } },
    );
    expect(screen.getByTestId("text-free-delivery-saving").textContent).toBe(
      "Standard delivery is now free",
    );
  });

  it("has no progress bar, goal label, or Shop add-ons action", () => {
    renderWithProviders(
      <FreeDeliveryStatusCard
        state="unlocked"
        subtotalUsd={120}
        thresholdUsd={100}
        standardFeeUsd={7}
        onShopAddons={() => {}}
      />,
      { locale: { t } },
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByTestId("text-free-delivery-goal")).toBeNull();
    expect(screen.queryByTestId("button-shop-addons")).toBeNull();
  });
});
