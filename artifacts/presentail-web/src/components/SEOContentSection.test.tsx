// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test-utils";
import { SEOContentSection } from "./SEOContentSection";

vi.mock("wouter", () => ({
  Link: ({
    children,
    href,
    ...rest
  }: React.PropsWithChildren<{ href: string; className?: string }>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useLocation: vi.fn(() => ["/", vi.fn()]),
  useRouter: vi.fn(() => ({ base: "" })),
}));

const SHARED_PROPS = {
  entityName: "Hand Bouquets",
  entitySlug: "hand-bouquets",
  cityLabel: "Beirut",
  lang: "en",
  countryCode: "LB",
  availableCategoryIds: [] as string[],
  availableOccasionIds: ["birthday"] as string[],
};

const AR_LOCALE = {
  language: "ar" as const,
  dir: "rtl" as const,
  t: (key: string) => key,
};

const EN_LOCALE = {
  language: "en" as const,
  dir: "ltr" as const,
  t: (key: string) => key,
};

describe("SEOContentSection – RTL layout (Arabic)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the section with dir=rtl when locale is Arabic", () => {
    renderWithProviders(
      <SEOContentSection {...SHARED_PROPS} pageType="category" />,
      { locale: AR_LOCALE },
    );
    const section = screen.getByTestId("seo-content-section");
    expect(section.getAttribute("dir")).toBe("rtl");
  });

  it("renders the section with dir=ltr when locale is English", () => {
    renderWithProviders(
      <SEOContentSection {...SHARED_PROPS} pageType="category" />,
      { locale: EN_LOCALE },
    );
    const section = screen.getByTestId("seo-content-section");
    expect(section.getAttribute("dir")).toBe("ltr");
  });

  it("FAQ button does not force text-left (must use text-start for RTL compat)", () => {
    renderWithProviders(
      <SEOContentSection {...SHARED_PROPS} pageType="category" />,
      { locale: AR_LOCALE },
    );
    const faqButtons = document.querySelectorAll("button[aria-expanded]");
    expect(faqButtons.length).toBeGreaterThan(0);
    faqButtons.forEach((btn) => {
      expect(btn.className).not.toContain("text-left");
      expect(btn.className).toContain("text-start");
    });
  });

  it("FAQ answer becomes visible when the question is clicked (Arabic, category)", () => {
    renderWithProviders(
      <SEOContentSection {...SHARED_PROPS} pageType="category" />,
      { locale: AR_LOCALE },
    );
    const [firstBtn] = Array.from(document.querySelectorAll("button[aria-expanded]"));
    expect(firstBtn).toBeDefined();
    expect(firstBtn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(firstBtn);
    expect(firstBtn.getAttribute("aria-expanded")).toBe("true");
  });

  it("FAQ answer becomes visible when the question is clicked (Arabic, occasion)", () => {
    renderWithProviders(
      <SEOContentSection
        {...SHARED_PROPS}
        entitySlug="birthday"
        entityName="Birthday"
        pageType="occasion"
      />,
      { locale: AR_LOCALE },
    );
    const [firstBtn] = Array.from(document.querySelectorAll("button[aria-expanded]"));
    expect(firstBtn).toBeDefined();
    fireEvent.click(firstBtn);
    expect(firstBtn.getAttribute("aria-expanded")).toBe("true");
  });

  it("interpolated {name} and {city} tokens appear in heading and intro (Arabic)", () => {
    const entityName = "باقات الزهور";
    const cityLabel = "بيروت";
    renderWithProviders(
      <SEOContentSection
        {...SHARED_PROPS}
        entityName={entityName}
        cityLabel={cityLabel}
        pageType="category"
        overrides={{
          heading: `توصيل ${entityName} في ${cityLabel}`,
          intro_text: `اكتشف أجمل ${entityName} مع التوصيل السريع في ${cityLabel}.`,
        }}
      />,
      { locale: AR_LOCALE },
    );
    const section = screen.getByTestId("seo-content-section");
    expect(section.textContent).toContain(entityName);
    expect(section.textContent).toContain(cityLabel);
  });

  it("FAQ answer container uses leading-relaxed text style inside RTL section", () => {
    renderWithProviders(
      <SEOContentSection {...SHARED_PROPS} pageType="category" />,
      { locale: AR_LOCALE },
    );
    const [firstBtn] = Array.from(document.querySelectorAll("button[aria-expanded]"));
    fireEvent.click(firstBtn);
    const answerPanels = document.querySelectorAll("dd[role='region']");
    const openPanel = Array.from(answerPanels).find(
      (el) => !el.hasAttribute("hidden"),
    );
    expect(openPanel).toBeDefined();
    expect(openPanel!.className).toContain("leading-relaxed");
    expect(openPanel!.className).not.toContain("text-left");
  });
});
