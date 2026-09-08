// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils";

const { mockSetLocation, mockUseLocationSelection } = vi.hoisted(() => ({
  mockSetLocation: vi.fn(),
  mockUseLocationSelection: vi.fn(),
}));

vi.mock("wouter", () => ({
  useLocation: vi.fn(() => ["/cart", mockSetLocation]),
}));

vi.mock("@/contexts/LocationContext", () => ({
  useLocationSelection: mockUseLocationSelection,
  countryCodeToSlug: (code: string) => code.toLowerCase(),
}));

vi.mock("@/components/Logo", () => ({
  Logo: (props: { height?: number; className?: string }) => (
    <img
      alt="Presentail"
      data-testid="compact-cart-logo"
      data-height={props.height}
      className={props.className}
    />
  ),
}));

vi.mock("lucide-react", () => ({
  ChevronLeft: (props: Record<string, unknown>) => <svg data-testid="chevron-left" {...props} />,
  ChevronRight: (props: Record<string, unknown>) => <svg data-testid="chevron-right" {...props} />,
  LockKeyhole: (props: Record<string, unknown>) => <svg data-testid="lock-icon" {...props} />,
}));

import {
  CART_RETURN_HISTORY_KEY,
  cartShopFallbackPath,
  CompactMobileCartHeader,
  hasUsefulCartHistory,
} from "./CompactMobileCartHeader";

type LocaleOverride = {
  language?: "en" | "ar" | "fr" | "el";
  dir?: "ltr" | "rtl";
  t?: (key: string) => string;
};

const translations: Record<string, string> = {
  "cart.compactHeaderAria": "Cart navigation",
  "cart.secure": "Secure",
  "nav.backAria": "Back",
};

function renderHeader(locale: LocaleOverride = {}) {
  mockUseLocationSelection.mockReturnValue({
    countryCode: "LB",
    cityId: "lb-beirut",
  });
  return renderWithProviders(<CompactMobileCartHeader />, {
    locale: {
      t: (key: string) => translations[key] ?? key,
      ...locale,
    },
  });
}

describe("CompactMobileCartHeader", () => {
  beforeEach(() => {
    mockSetLocation.mockReset();
    mockUseLocationSelection.mockReset();
    sessionStorage.clear();
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: "",
    });
  });

  it("keeps the logo centered independently from the 44px back target and secure label", () => {
    renderHeader();

    const header = screen.getByTestId("compact-mobile-cart-header");
    expect(header.getAttribute("aria-label")).toBe("Cart navigation");
    expect(header.classList).toContain("pt-[env(safe-area-inset-top)]");
    expect(screen.getByTestId("compact-cart-logo").getAttribute("data-height")).toBe("60");
    expect(screen.getByTestId("compact-cart-logo").parentElement?.classList).toContain(
      "absolute",
    );
    expect(screen.getByTestId("compact-cart-logo").parentElement?.classList).toContain(
      "inset-x-0",
    );
    expect(screen.getByTestId("compact-cart-logo").parentElement?.classList).toContain(
      "justify-center",
    );
    expect(screen.getByTestId("compact-mobile-cart-back").classList).toContain("h-11");
    expect(screen.getByTestId("compact-mobile-cart-back").classList).toContain("w-11");
    expect(screen.getByTestId("compact-mobile-cart-secure").textContent).toContain("Secure");
    expect(screen.getByTestId("lock-icon")).toBeTruthy();
  });

  it("uses the RTL back direction and Arabic security copy", () => {
    renderHeader({
      language: "ar",
      dir: "rtl",
      t: (key: string) =>
        ({
          "cart.compactHeaderAria": "التنقل في السلة",
          "cart.secure": "آمن",
          "nav.backAria": "رجوع",
        })[key] ?? key,
    });

    expect(screen.getByTestId("compact-mobile-cart-header").getAttribute("dir")).toBe("rtl");
    expect(screen.getByTestId("chevron-right")).toBeTruthy();
    expect(screen.queryByTestId("chevron-left")).toBeNull();
    expect(screen.getByRole("button", { name: "رجوع" })).toBeTruthy();
    expect(screen.getByTestId("compact-mobile-cart-secure").textContent).toContain("آمن");
  });

  it("renders the French security label without language-specific component copy", () => {
    renderHeader({
      language: "fr",
      t: (key: string) =>
        ({
          "cart.compactHeaderAria": "Navigation du panier",
          "cart.secure": "Sécurisé",
          "nav.backAria": "Retour",
        })[key] ?? key,
    });

    expect(screen.getByRole("button", { name: "Retour" })).toBeTruthy();
    expect(screen.getByTestId("compact-mobile-cart-secure").textContent).toContain("Sécurisé");
  });

  it("falls back to the current locale and city shop when there is no useful history", async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByTestId("compact-mobile-cart-back"));

    // "~" prefix escapes the nested city-scoped Wouter router base so the
    // navigation lands at the root-absolute path, not a doubled path like
    // /en-lb/beirut/en-lb/beirut/shop.
    expect(mockSetLocation).toHaveBeenCalledWith("~/en-lb/beirut/shop");
  });

  it("uses browser Back after an in-session storefront-to-cart navigation", async () => {
    const user = userEvent.setup();
    const originalHistoryLength = window.history.length;
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    Object.defineProperty(window.history, "length", {
      configurable: true,
      value: 2,
    });
    sessionStorage.setItem(CART_RETURN_HISTORY_KEY, "1");

    try {
      renderHeader();
      await user.click(screen.getByTestId("compact-mobile-cart-back"));
      expect(back).toHaveBeenCalledOnce();
      expect(mockSetLocation).not.toHaveBeenCalled();
    } finally {
      back.mockRestore();
      Object.defineProperty(window.history, "length", {
        configurable: true,
        value: originalHistoryLength,
      });
    }
  });
});

describe("compact cart navigation helpers", () => {
  it("recognizes same-site shopping history but rejects external and non-shopping pages", () => {
    const current = "https://presentail.com/en-lb/beirut/cart";

    expect(
      hasUsefulCartHistory(
        "https://presentail.com/en-lb/beirut/product/red-roses",
        current,
        2,
      ),
    ).toBe(true);
    expect(
      hasUsefulCartHistory("https://example.com/shop", current, 2),
    ).toBe(false);
    expect(
      hasUsefulCartHistory(
        "https://presentail.com/en-lb/beirut/checkout",
        current,
        2,
      ),
    ).toBe(false);
    expect(hasUsefulCartHistory("", current, 2)).toBe(false);
  });

  it("builds a city-aware fallback and uses /shop when location is unavailable", () => {
    expect(
      cartShopFallbackPath({
        language: "fr",
        countryCode: "AE",
        cityId: "ae-dubai",
      }),
    ).toBe("/fr-ae/dubai/shop");
    expect(
      cartShopFallbackPath({
        language: "ar",
        countryCode: null,
        cityId: null,
      }),
    ).toBe("/shop");
  });
});