import { describe, expect, it } from "vitest";
// @ts-expect-error - mjs import without types; the module is plain JS.
import { buildLocaleLogoPreloadTags } from "../../logo-preloads.mjs";

const manifest = {
  "src/assets/Presentail_PNG-01_1777795626872.webp": { file: "assets/logo-en-123.webp" },
  "src/assets/Presentail-Arabic-Logo.webp": { file: "assets/logo-ar-123.webp" },
  "src/assets/Presentail_PNG-01_white.webp": { file: "assets/logo-en-white-123.webp" },
  "src/assets/Presentail-Arabic-Logo-white.webp": { file: "assets/logo-ar-white-123.webp" },
};

describe("buildLocaleLogoPreloadTags", () => {
  it("emits only the English logo for an English storefront route", () => {
    const output = buildLocaleLogoPreloadTags(manifest, "/app", "/en-lb/beirut");
    expect(output).toContain("/app/assets/logo-en-123.webp");
    expect(output).not.toContain("logo-ar");
    expect(output).not.toContain("logo-en-white");
  });

  it("emits only Arabic logo variants for an Arabic checkout route", () => {
    const output = buildLocaleLogoPreloadTags(manifest, "", "/ar-ae/dubai/checkout");
    expect(output).toContain("logo-ar-123.webp");
    expect(output).toContain("logo-ar-white-123.webp");
    expect(output).not.toContain("logo-en");
  });
});