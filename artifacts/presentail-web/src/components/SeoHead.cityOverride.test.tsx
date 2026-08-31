// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SeoHead } from "./SeoHead";

const state = vi.hoisted(() => ({
  path: "/en-lb/tripoli",
  language: "en" as "en" | "ar" | "fr",
  cityLabel: "Tripoli",
}));

vi.mock("wouter", () => ({
  useLocation: () => [state.path, vi.fn()],
}));

vi.mock("@/contexts/LocationContext", () => ({
  useLocationSelection: () => ({
    country: { code: "LB", name: "Lebanon" },
    city: { id: `lb-${state.cityLabel.toLowerCase()}`, name: state.cityLabel },
  }),
}));

vi.mock("@/contexts/LocaleContext", () => ({
  useLocale: () => ({
    language: state.language,
    cityName: () => state.cityLabel,
    countryName: () => state.language === "fr" ? "Liban" : "Lebanon",
    t: (key: string, params?: Record<string, string>) => {
      const city = params?.city ?? state.cityLabel;
      const copy: Record<string, string> = state.language === "fr"
        ? {
            "seo.siteName": "Presentail",
            "seo.home.title": `Livraison de fleurs et cadeaux à ${city} | Presentail`,
            "seo.home.description": `Description ${city}`,
            "seo.home.ogTitle": `Fleurs et cadeaux à ${city} | Presentail`,
            "seo.home.ogDescription": `OG ${city}`,
            "seo.home.twitterTitle": `Fleurs et cadeaux à ${city} | Presentail`,
            "seo.home.twitterDescription": `Twitter ${city}`,
          }
        : {
            "seo.siteName": "Presentail",
            "seo.home.title": `Flower & Gift Delivery in ${city} | Presentail`,
            "seo.home.description": `Description ${city}`,
            "seo.home.ogTitle": `Flowers & Gifts in ${city} | Presentail`,
            "seo.home.ogDescription": `OG ${city}`,
            "seo.home.twitterTitle": `Flowers & Gifts in ${city} | Presentail`,
            "seo.home.twitterDescription": `Twitter ${city}`,
          };
      return copy[key] ?? key;
    },
  }),
}));

function meta(selector: string) {
  return document.head.querySelector<HTMLMetaElement>(selector)?.content;
}

async function renderHead(path: string, language: "en" | "ar" | "fr", cityLabel: string) {
  state.path = path;
  state.language = language;
  state.cityLabel = cityLabel;
  render(<SeoHead />);
  await waitFor(() => expect(document.title).not.toBe(""));
}

afterEach(() => {
  cleanup();
  document.head.innerHTML = "";
  document.title = "";
});

describe("SeoHead — city override social metadata parity", () => {
  it.each([
    ["/en-lb/tripoli", "Tripoli", "Flower & Gift Delivery in Tripoli | Presentail"],
    ["/en-lb/batroun", "Batroun", "Flower & Gift Delivery in Batroun | Presentail"],
  ])("keeps override social metadata after hydration on %s", async (path, cityLabel, expected) => {
    await renderHead(path, "en", cityLabel);
    expect(meta('meta[property="og:title"]')).toBe(expected);
    expect(meta('meta[name="twitter:title"]')).toBe(expected);
  });

  it.each([
    ["/en-lb/beirut", "en", "Beirut", "Flowers & Gifts in Beirut | Presentail"],
    ["/fr-lb/beirut", "fr", "Beyrouth", "Fleurs et cadeaux à Beyrouth | Presentail"],
  ] as const)("keeps generic Beirut social metadata after hydration on %s", async (path, language, cityLabel, expected) => {
    await renderHead(path, language, cityLabel);
    expect(meta('meta[property="og:title"]')).toBe(expected);
    expect(meta('meta[name="twitter:title"]')).toBe(expected);
  });
});