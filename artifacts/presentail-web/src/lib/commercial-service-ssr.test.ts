import { describe, expect, it } from "vitest";
// @ts-expect-error seo-inject is intentionally plain server-side ESM.
import { buildSeoHead } from "../../seo-inject.mjs";
import { getCommercialServiceCopy } from "../data/commercialServiceCopy.mjs";

describe("commercial service SSR fallback", () => {
  it("serves UAE-specific corporate delivery context and canonical Dubai links", () => {
    const result = buildSeoHead("/en-ae/dubai/corporate", {
      origin: "https://presentail.com",
      basePath: "",
    });

    expect(result.bodyHtml).toContain('data-server-commercial-service="corporate-ae"');
    expect(result.bodyHtml).toContain("hotel concierge teams");
    expect(result.bodyHtml).toContain("Dubai");
    expect(result.bodyHtml).toContain(
      'href="https://presentail.com/en-ae/dubai/occasions"',
    );
    expect(result.bodyHtml).toContain(
      'href="https://presentail.com/en-ae/dubai/contact"',
    );
  });

  it("serves French Cyprus wedding context and canonical Nicosia links", () => {
    const result = buildSeoHead("/fr-cy/nicosia/weddings", {
      origin: "https://presentail.com",
      basePath: "",
    });

    expect(result.bodyHtml).toContain('data-server-commercial-service="weddings-cy"');
    expect(result.bodyHtml).toContain("parcours invité");
    expect(result.bodyHtml).toContain("remise nominative");
    expect(result.bodyHtml).toContain("Nicosie");
    expect(result.bodyHtml).toContain(
      'href="https://presentail.com/fr-cy/nicosia/occasions"',
    );
    expect(result.bodyHtml).toContain(
      'href="https://presentail.com/fr-cy/nicosia/contact"',
    );
  });

  it.each([
    ["en", "ae", "dubai", "corporate", "Dubai"],
    ["ar", "ae", "dubai", "weddings", "دبي"],
    ["fr", "cy", "nicosia", "weddings", "Nicosie"],
    ["el", "cy", "nicosia", "corporate", "Λευκωσία"],
  ] as const)(
    "uses the shared %s/%s %s copy in served HTML",
    (lang, country, city, page, cityLabel) => {
      const copy = getCommercialServiceCopy(page, lang, country, cityLabel)!;
      const result = buildSeoHead(`/${lang}-${country}/${city}/${page}`, {
        origin: "https://presentail.com",
        basePath: "",
      });

      expect(result.bodyHtml).toContain(copy.heading);
      expect(result.bodyHtml).toContain(copy.body);
      for (const detail of copy.details) expect(result.bodyHtml).toContain(detail);
      expect(result.bodyHtml).toContain(copy.occasionsLabel);
      expect(result.bodyHtml).toContain(copy.contactLabel);
    },
  );
});