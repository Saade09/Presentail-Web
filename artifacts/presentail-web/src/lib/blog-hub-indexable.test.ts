/**
 * The canonical blog hubs (/en/blog, /ar/blog, /fr/blog) are indexable and
 * listed in their per-language sitemaps. Both robots signals — the
 * X-Robots-Tag header (serve-robots.mjs) and the injected <meta name="robots">
 * (seo-inject.mjs) — must agree, otherwise the sitemap entry becomes a
 * "Submitted URL marked 'noindex'" error in Search Console.
 *
 * /el/blog 301s to /en/blog and must never be a sitemap URL or an hreflang
 * alternate. Private / Group B routes keep their exact robots output.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { BLOG_POSTS, getBlogPostLanguages } from "@workspace/blog-content";

// Dynamic imports: the .mjs server modules ship no TypeScript declarations.
const { resolveXRobotsTag } = (await import(
  // @ts-expect-error - mjs module without type declarations.
  /* @vite-ignore */ "../../serve-robots.mjs"
)) as {
  resolveXRobotsTag: (
    host: string,
    pathname: string,
    search?: string,
  ) => string | null;
};
const { injectSeoTagsAsync } = (await import(
  // @ts-expect-error - mjs module without type declarations.
  /* @vite-ignore */ "../../seo-inject.mjs"
)) as {
  injectSeoTagsAsync: (
    html: string,
    pathname: string,
    opts?: Record<string, unknown>,
  ) => Promise<string>;
};
const { buildSitemapXml } = (await import(
  // @ts-expect-error - mjs module without type declarations.
  /* @vite-ignore */ "../../sitemap.mjs"
)) as {
  buildSitemapXml: (opts: Record<string, unknown>) => string;
};

const ORIGIN = "https://presentail.com";
const HOST = "presentail.com";
const HTML = `<!doctype html><html lang="en"><head><title>Old</title></head><body></body></html>`;
const OPTS = { apiBaseUrl: "https://api.test", origin: ORIGIN, basePath: "" };
const HUB_LANGS = ["en", "ar", "fr"] as const;

const robotsMetas = (html: string) =>
  html.match(/<meta name="robots"[^>]*>/g) ?? [];

async function inject(pathname: string) {
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("offline");
  }));
  return injectSeoTagsAsync(HTML, pathname, OPTS);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("blog hubs — robots header and meta agree on index, follow", () => {
  for (const lang of HUB_LANGS) {
    const path = `/${lang}/blog`;

    it(`${path}: X-Robots-Tag is "index, follow" on the canonical host`, () => {
      expect(resolveXRobotsTag(HOST, path, "")).toBe("index, follow");
      expect(resolveXRobotsTag(HOST, `${path}/`, "")).toBe("index, follow");
    });

    it(`${path}: preview hosts fall back to the platform default like other public pages`, () => {
      expect(resolveXRobotsTag("presentail-web.replit.app", path, "")).toBeNull();
    });

    it(`${path}: tracking / filter params keep their existing noindex guards`, () => {
      expect(resolveXRobotsTag(HOST, path, "?utm_source=x")).toBe("noindex");
      expect(resolveXRobotsTag(HOST, path, "?sort=price-asc")).toBe("noindex, follow");
    });

    it(`${path}: injected HTML carries exactly one "index, follow" robots meta and a self-canonical`, async () => {
      const out = await inject(path);
      expect(robotsMetas(out)).toEqual(['<meta name="robots" content="index, follow" />']);
      expect(out).not.toContain("noindex");
      expect(out).toContain(`<link rel="canonical" href="${ORIGIN}/${lang}/blog" />`);
      // hreflang cluster: en/ar/fr + x-default → en, no Greek alternate.
      for (const alt of HUB_LANGS) {
        expect(out).toContain(`<link rel="alternate" hreflang="${alt}" href="${ORIGIN}/${alt}/blog" />`);
      }
      expect(out).toContain(`<link rel="alternate" hreflang="x-default" href="${ORIGIN}/en/blog" />`);
      expect(out).not.toContain('hreflang="el"');
      expect(out).not.toContain("/el/blog");
    });
  }
});

describe("/el/blog is unchanged", () => {
  it("keeps its previous header and noindex meta (served as a 301 in serve.mjs)", async () => {
    expect(resolveXRobotsTag(HOST, "/el/blog", "")).toBe("index, follow");
    const out = await inject("/el/blog");
    expect(robotsMetas(out)).toEqual(['<meta name="robots" content="noindex, follow" />']);
  });
});

describe("private / Group B robots output is byte-identical to before", () => {
  // Captured from main before the blog-hub change.
  const EXPECTED: Array<[string, string]> = [
    ["/en-lb/beirut/privacy", "noindex"],
    ["/en-lb/beirut/terms", "noindex"],
    ["/en-lb/beirut/account", "noindex"],
    ["/en-lb/beirut/cart", "noindex"],
    ["/en-lb/beirut/checkout", "noindex"],
    ["/en-lb/beirut/auth", "noindex"],
    ["/privacy", "noindex"],
    ["/terms", "noindex"],
    ["/account", "noindex"],
  ];

  for (const [path, header] of EXPECTED) {
    it(`${path}: header "${header}", meta "noindex, follow"`, async () => {
      expect(resolveXRobotsTag(HOST, path, "")).toBe(header);
      expect(resolveXRobotsTag("presentail-web.replit.app", path, "")).toBe(header);
      const out = await inject(path);
      expect(robotsMetas(out)).toEqual(['<meta name="robots" content="noindex, follow" />']);
    });
  }
});

describe("blog hubs in the per-language sitemaps", () => {
  const xmlByLocale: Record<string, string> = Object.fromEntries(
    ["en", "ar", "fr", "el"].map((locale) => [
      locale,
      buildSitemapXml({ origin: ORIGIN, basePath: "/", locale, generatedAt: "2026-10-03" }),
    ]),
  );
  const urlNodes = (xml: string) => xml.match(/<url>[\s\S]*?<\/url>/g) ?? [];
  const locOf = (node: string) => node.match(/<loc>([^<]*)<\/loc>/)?.[1] ?? "";

  for (const lang of HUB_LANGS) {
    it(`sitemap-${lang}.xml lists /${lang}/blog once with the en/ar/fr/x-default cluster`, () => {
      const hubs = urlNodes(xmlByLocale[lang]).filter((u) => locOf(u) === `${ORIGIN}/${lang}/blog`);
      expect(hubs).toHaveLength(1);
      const hub = hubs[0];
      const alternates = Array.from(
        hub.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g),
        (m) => [m[1], m[2]],
      );
      expect(alternates).toEqual([
        ["en", `${ORIGIN}/en/blog`],
        ["ar", `${ORIGIN}/ar/blog`],
        ["fr", `${ORIGIN}/fr/blog`],
        ["x-default", `${ORIGIN}/en/blog`],
      ]);
      expect(hub).toContain("<changefreq>weekly</changefreq>");
      expect(hub).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
    });

    it(`sitemap-${lang}.xml does not list another language's hub`, () => {
      for (const other of ["en", "ar", "fr", "el"]) {
        if (other === lang) continue;
        expect(xmlByLocale[lang]).not.toContain(`<loc>${ORIGIN}/${other}/blog</loc>`);
      }
    });
  }

  it("no sitemap references /el/blog or an el alternate in the blog cluster", () => {
    for (const xml of Object.values(xmlByLocale)) {
      expect(xml).not.toContain("/el/blog");
    }
    for (const lang of HUB_LANGS) {
      const blogNodes = urlNodes(xmlByLocale[lang]).filter((u) => locOf(u).includes("/blog"));
      for (const node of blogNodes) expect(node).not.toContain('hreflang="el"');
    }
  });

  it("only the bare hub is listed — no paginated or city-prefixed hub URLs", () => {
    for (const xml of Object.values(xmlByLocale)) {
      expect(xml).not.toMatch(/\/blog\/page\/|\/blog\?|[?&]page=/);
      expect(xml).not.toMatch(/<loc>[^<]*-(?:lb|ae|cy)\/[^/<]+\/blog<\/loc>/);
    }
  });

  it("blog post entries are unchanged: one per dedicated translation, monthly", () => {
    let total = 0;
    for (const lang of HUB_LANGS) {
      const posts = urlNodes(xmlByLocale[lang]).filter((u) => /\/blog\/[^/<]+$/.test(locOf(u)));
      const expected = Object.entries(BLOG_POSTS).filter(([slug, langs]) =>
        slug && getBlogPostLanguages(langs).includes(lang),
      );
      expect(posts).toHaveLength(expected.length);
      for (const p of posts) expect(p).toContain("<changefreq>monthly</changefreq>");
      total += posts.length;
    }
    expect(total).toBeGreaterThan(0);
  });

  it("every loc is still unique and absolute", () => {
    for (const xml of Object.values(xmlByLocale)) {
      const locs = urlNodes(xml).map(locOf);
      expect(new Set(locs).size).toBe(locs.length);
      for (const loc of locs) expect(loc.startsWith(`${ORIGIN}/`)).toBe(true);
    }
  });

  it("every sitemap URL in the blog section resolves to an indexable header", () => {
    for (const lang of HUB_LANGS) {
      for (const node of urlNodes(xmlByLocale[lang])) {
        const loc = locOf(node);
        if (!loc.includes("/blog")) continue;
        expect(resolveXRobotsTag(HOST, new URL(loc).pathname, ""), loc).toBe("index, follow");
      }
    }
  });
});
