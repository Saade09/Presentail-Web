// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Corporate from "./Corporate";
import Weddings from "./Weddings";
import { getCommercialServiceCopy } from "@/data/commercialServiceCopy.mjs";

let language = "en";
let location = { countryCode: "AE", cityId: "ae-dubai" };

vi.mock("@/contexts/LocaleContext", () => ({
  useLocale: () => ({ language, t: (key: string) => key }),
}));

vi.mock("@/contexts/LocationContext", () => ({
  useLocationSelection: () => location,
}));

vi.mock("@/lib/seo", () => ({
  CITY_NAMES: {
    en: { "ae-dubai": "Dubai", "cy-nicosia": "Nicosia" },
    ar: { "ae-dubai": "دبي", "cy-nicosia": "نيقوسيا" },
    fr: { "ae-dubai": "Dubaï", "cy-nicosia": "Nicosie" },
    el: { "cy-nicosia": "Λευκωσία" },
  },
  buildStaticSeo: () => ({ h1: "Corporate gifts in Dubai" }),
  TITLES: { en: { weddings: "Weddings in {city}" } },
  formatTemplate: (template: string, values: { city: string }) =>
    template.replace("{city}", values.city),
}));

vi.mock("@/components/SEOContentSection", () => ({
  SEOContentSection: () => null,
}));

vi.mock("@/components/PageBreadcrumb", () => ({
  PageBreadcrumb: () => null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe("commercial local service sections", () => {
  it("uses UAE-specific corporate delivery context and city-scoped links", () => {
    render(<Corporate />);

    const section = screen.getByTestId("corporate-local-service");
    expect(section.textContent).toContain("hotel concierge teams");
    expect(section.textContent).toContain("Dubai");
    expect(screen.getByTestId("corporate-local-occasions").getAttribute("href")).toBe(
      "~/en-ae/dubai/occasions",
    );
    const shared = getCommercialServiceCopy("corporate", "en", "AE", "Dubai")!;
    expect(section.textContent).toContain(shared.heading);
    expect(section.textContent).toContain(shared.body);
    shared.details.forEach((detail) => expect(section.textContent).toContain(detail));
  });

  it("renders original French Cyprus event planning context, not a token-swapped UAE block", () => {
    language = "fr";
    location = { countryCode: "CY", cityId: "cy-nicosia" };
    render(<Weddings />);

    const section = screen.getByTestId("weddings-local-service");
    expect(section.textContent).toContain("parcours invité");
    expect(section.textContent).toContain("Nicosie");
    expect(section.textContent).toContain("remise nominative");
  });

  it("uses the English Cyprus market fallback for Greek rather than Lebanon copy", () => {
    language = "el";
    location = { countryCode: "CY", cityId: "cy-nicosia" };
    render(<Corporate />);

    const section = screen.getByTestId("corporate-local-service");
    const shared = getCommercialServiceCopy("corporate", "el", "CY", "Λευκωσία")!;
    expect(shared.market).toBe("cy");
    expect(section.textContent).toContain(shared.heading);
    expect(section.textContent).toContain("Cyprus teams and guests");
    expect(section.textContent).not.toContain("Lebanon delivery");
  });
});