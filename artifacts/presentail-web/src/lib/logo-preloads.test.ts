import { describe, expect, it } from "vitest";
// @ts-expect-error - mjs import without types; the module is plain JS.
import {
  buildLocaleLogoPreloadTags,
  hasHighPriorityImagePreload,
  injectLocaleLogoPreloads,
} from "../../logo-preloads.mjs";

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

const HIGH_IMAGE_PRELOAD_RE = /<link\b(?=[^>]*\brel=["']?preload)(?=[^>]*\bas=["']?image)(?=[^>]*\bfetchpriority=["']?high)[^>]*>/gi;
const shell = (head = "") =>
  `<!doctype html>\n<html>\n  <head>\n    <title>x</title>${head}\n  </head>\n  <body><div id="root"></div></body>\n</html>`;

// Exactly what serve.mjs produced before this change.
const legacyInject = (html: string, pathname: string) =>
  html.replace(
    "</head>",
    `    ${buildLocaleLogoPreloadTags(manifest, "", pathname)}\n  </head>`,
  );

describe("injectLocaleLogoPreloads", () => {
  const productPreload =
    '<link rel="preload" as="image" fetchpriority="high" href="/api/catalog/product-image/899/0">';

  it("drops fetchpriority from the logo when a high-priority image preload already exists", () => {
    const html = shell(`\n    ${productPreload}`);
    const out = injectLocaleLogoPreloads(html, manifest, "", "/en-lb/beirut/product/x--899");
    expect(out).toContain(
      '<link rel="preload" as="image" type="image/webp" href="/assets/logo-en-123.webp">',
    );
    const high = out.match(HIGH_IMAGE_PRELOAD_RE) ?? [];
    expect(high).toEqual([productPreload]);
  });

  it("is byte-identical to the previous output when there is no image preload", () => {
    for (const pathname of ["/en-lb/beirut", "/ar-ae/dubai/checkout"]) {
      const html = shell();
      const out = injectLocaleLogoPreloads(html, manifest, "", pathname);
      expect(out).toBe(legacyInject(html, pathname));
    }
    const out = injectLocaleLogoPreloads(shell(), manifest, "", "/en-lb/beirut");
    expect(out).toContain('href="/assets/logo-en-123.webp" fetchpriority="high">');
  });

  it("keeps the logo high-priority when only font/style preloads or <img> are high-priority", () => {
    const head = [
      '<link rel="preload" as="font" type="font/woff2" href="/f.woff2" crossorigin fetchpriority="high">',
      '<link rel="preload" as="style" href="/s.css" fetchpriority="high">',
      '<link rel="stylesheet" href="/s.css">',
      "<!-- <link rel=\"preload\" as=\"image\" href=\"/c.webp\" fetchpriority=\"high\"> -->",
    ]
      .map((t) => `\n    ${t}`)
      .join("");
    const html = `${shell(head)}<img src="/p.webp" fetchpriority="high">`;
    expect(hasHighPriorityImagePreload(html)).toBe(false);
    const out = injectLocaleLogoPreloads(html, manifest, "", "/en-lb/beirut");
    expect(out).toBe(legacyInject(html, "/en-lb/beirut"));
  });

  it("detects attribute-order, quoting and casing variants", () => {
    const variants = [
      "<link fetchpriority='high' href='/p.webp' as='image' rel='preload'>",
      '<LINK HREF="/p.webp" FetchPriority="HIGH" AS="Image" REL="Preload" />',
      "<link as=image rel=preload fetchpriority=high href=/p.webp>",
      '<link\n  rel="preload"\n  href="/p.webp"\n  imagesrcset="/p.webp 1x, /p@2x.webp 2x"\n  as="image"\n  fetchpriority = "high"\n>',
    ];
    for (const tag of variants) {
      const html = shell(`\n    ${tag}`);
      expect(hasHighPriorityImagePreload(html), tag).toBe(true);
      const out = injectLocaleLogoPreloads(html, manifest, "", "/en-lb/beirut");
      expect(out).toContain('href="/assets/logo-en-123.webp">');
      expect(out).not.toContain('logo-en-123.webp" fetchpriority');
    }
    expect(
      hasHighPriorityImagePreload('<link rel="preload" as="image" fetchpriority="low" href="/p.webp">'),
    ).toBe(false);
    expect(
      hasHighPriorityImagePreload('<link rel="prefetch" as="image" fetchpriority="high" href="/p.webp">'),
    ).toBe(false);
  });
});