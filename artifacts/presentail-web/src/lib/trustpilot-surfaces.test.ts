import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceDir = dirname(fileURLToPath(import.meta.url));

function source(relativePath: string): string {
  return readFileSync(resolve(sourceDir, "..", relativePath), "utf8");
}

describe("Trustpilot script-backed surface inventory", () => {
  const directEmbeds = [
    "components/homepage/TrustpilotCarousel.tsx",
    "components/product/TrustpilotMicroWidget.tsx",
    "pages/CampaignHero.tsx",
    "pages/CampaignHeroBeirut.tsx",
  ];

  it.each(directEmbeds)(
    "%s uses the shared loader and cleans up its pending work",
    (relativePath) => {
      const contents = source(relativePath);
      expect(contents).toContain("injectTrustpilotScript");
      expect(contents).toContain("pollAndLoadTrustpilotWidget");
      expect(contents).toContain("cleanup");
      expect(contents).toMatch(/onScriptLoad[\s\S]*handleFailure|handleFailure[\s\S]*onScriptLoad/);
    },
  );

  const routeConsumers = [
    ["pages/ProductDetail.tsx", "TrustpilotMicroWidget"],
    ["pages/CampaignLanding.tsx", "CampaignTrustpilotStrip"],
    ["pages/CampaignLanding.tsx", "CampaignReviews"],
    ["pages/CampaignLandingLegacy.tsx", "CampaignTrustBarBeirut"],
    ["pages/CampaignLandingLegacy.tsx", "CampaignReviews"],
    ["pages/BeirutLateNightLanding.tsx", "TrustpilotMicroWidget"],
  ] as const;

  it.each(routeConsumers)(
    "%s keeps the %s Trustpilot surface on the shared component path",
    (relativePath, symbol) => {
      expect(source(relativePath)).toContain(symbol);
    },
  );

  it("does not count the secure-payments profile link as a script embed", () => {
    const contents = source("components/product/SecurePaymentsTrustpilotCard.tsx");
    expect(contents).not.toContain("trustpilot-widget");
    expect(contents).not.toContain("injectTrustpilotScript");
  });

  it("keeps Trustpilot loading free of template probes and country branches", () => {
    const loader = source("lib/trustpilot.ts");
    expect(loader).not.toMatch(/index\.html|fetch\(|XMLHttpRequest|\bcountry\b|\bgeo\b|\bVPN\b/);
    expect(loader).not.toContain("setTimeout");
    expect(loader).toContain("WeakSet");
  });
});