// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleContext, type Language } from "@/contexts/LocaleContext";
import { campaignStrings } from "@/locales/campaign";
import {
  CampaignGrid,
  CampaignFaq,
  CampaignQuickFilters,
  CampaignSeoEditorial,
} from "./CampaignSections";
import { getPriceBandConfig, type CampaignQuickFilterKey } from "@/lib/campaignLanding";

const mocks = vi.hoisted(() => ({
  cityId: "ae-dubai",
  cityName: "Dubai",
}));

vi.mock("@/contexts/LocationContext", () => ({
  useLocationSelection: () => ({
    countryCode: "AE",
    cityId: mocks.cityId,
    city: {
      id: mocks.cityId,
      name: mocks.cityName,
    },
  }),
}));

vi.mock("@/components/SalePrice", () => ({
  SalePrice: (props: {
    priceAed?: number | null;
    priceAedExact?: string | null;
    discountPriceAed?: number | null;
    discountPriceAedExact?: string | null;
  }) => (
    <div
      data-testid="campaign-sale-price-props"
      data-price-aed={String(props.priceAed)}
      data-price-aed-exact={String(props.priceAedExact)}
      data-discount-price-aed={String(props.discountPriceAed)}
      data-discount-price-aed-exact={String(props.discountPriceAedExact)}
    />
  ),
}));

function renderUaeSections(language: Extract<Language, "en" | "ar">) {
  const t = (key: string, params: Record<string, string | number> = {}) => {
    const template = campaignStrings[key]?.[language] ?? key;
    return template.replace(
      /\{(\w+)\}/g,
      (_match, name) => String(params[name] ?? `{${name}}`),
    );
  };

  return render(
    <LocaleContext.Provider
      value={{
        language,
        setLanguage: vi.fn(),
        dir: language === "ar" ? "rtl" : "ltr",
        t,
        countryName: (_code, fallback) => fallback,
        cityName: (_id, fallback) => fallback,
      }}
    >
      <CampaignFaq />
      <CampaignSeoEditorial />
    </LocaleContext.Provider>,
  );
}

describe("UAE campaign FAQ and editorial copy", () => {
  afterEach(() => {
    mocks.cityId = "ae-dubai";
    mocks.cityName = "Dubai";
  });

  it("renders Dubai-specific English copy with UAE time, districts, fees, and AED pricing", () => {
    renderUaeSections("en");

    expect(
      screen.getByRole("heading", {
        name: "Questions about flower delivery in Dubai",
      }),
    ).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", {
        name: "When is same-day flower delivery available in Dubai?",
      }),
    );
    expect(screen.getByText(/UAE cut-off times use UAE time/)).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Which districts in the UAE do you deliver to?",
      }),
    );
    expect(screen.getByText(/Downtown Dubai/)).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", {
        name: "How much does flower delivery cost in Dubai and Abu Dhabi?",
      }),
    );
    expect(screen.getByText(/shown in AED at checkout/)).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "Flower delivery in Dubai" }),
    ).toBeDefined();
    expect(screen.getByText(/selected for delivery in Dubai/)).toBeDefined();
  });

  it("renders Abu Dhabi-specific Arabic copy with localized UAE rules and currency", () => {
    mocks.cityId = "ae-abu-dhabi";
    mocks.cityName = "أبوظبي";

    renderUaeSections("ar");

    expect(
      screen.getByRole("heading", {
        name: "أسئلة حول توصيل الزهور في أبوظبي",
      }),
    ).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", {
        name: "متى يتوفر توصيل الزهور في اليوم نفسه في أبوظبي؟",
      }),
    );
    expect(
      screen.getByText(/تستخدم مواعيد الإغلاق توقيت الإمارات/),
    ).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", {
        name: "إلى أي مناطق في الإمارات تقومون بالتوصيل؟",
      }),
    );
    expect(screen.getByText(/جزيرة الريم/)).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", {
        name: "كم تبلغ تكلفة توصيل الزهور في دبي وأبوظبي؟",
      }),
    );
    expect(
      screen.getByText(/يتم احتساب الرسوم الدقيقة وعرضها بالدرهم الإماراتي/),
    ).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "توصيل الزهور في أبوظبي" }),
    ).toBeDefined();
  });

  it("renders the quick filters as one semantic, keyboard-operable group", () => {
    const onSelect = vi.fn();
    const t = (key: string) => campaignStrings[key]?.en ?? key;

    render(
      <LocaleContext.Provider
        value={{
          language: "en",
          setLanguage: vi.fn(),
          dir: "ltr",
          t,
          countryName: (_code, fallback) => fallback,
          cityName: (_id, fallback) => fallback,
        }}
      >
        <CampaignQuickFilters
          activeFilter="available-today"
          onSelect={onSelect as (filter: CampaignQuickFilterKey) => void}
          bandConfig={getPriceBandConfig("USD")}
        />
      </LocaleContext.Provider>,
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Available today",
      "Under $60",
      "$60–$100",
      "Roses",
      "Luxury",
      "Best sellers",
    ]);
    expect(buttons[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(buttons[1]?.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(buttons[3]!);
    expect(onSelect).toHaveBeenCalledWith("roses");
  });

  it("passes native AED regular, sale, and exact values to campaign cards", () => {
    render(
      <LocaleContext.Provider
        value={{
          language: "en",
          setLanguage: vi.fn(),
          dir: "ltr",
          t: (key) => campaignStrings[key]?.en ?? key,
          countryName: (_code, fallback) => fallback,
          cityName: (_id, fallback) => fallback,
        }}
      >
        <CampaignGrid
          section="flowers"
          title="Flowers"
          products={[
            {
              id: "native-aed-flower",
              name: "Native AED Flower",
              price: "$82",
              priceValue: 82,
              priceAed: 300,
              priceAedExact: "300.000",
              discountPriceValue: 57,
              discountPriceAed: 210,
              discountPriceAedExact: "210.000",
              image: null,
              images: [],
              categories: ["flowers"],
              inStock: true,
              popularity: 1,
            },
          ]}
          isLoading={false}
          currencyCodeOverride="AED"
        />
      </LocaleContext.Provider>,
    );

    const price = screen.getByTestId("campaign-sale-price-props");
    expect(price.dataset.priceAed).toBe("300");
    expect(price.dataset.priceAedExact).toBe("300.000");
    expect(price.dataset.discountPriceAed).toBe("210");
    expect(price.dataset.discountPriceAedExact).toBe("210.000");
  });
});