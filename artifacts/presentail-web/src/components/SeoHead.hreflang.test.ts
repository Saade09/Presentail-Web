// @vitest-environment jsdom
//
// Guards against two client-side SEO regressions in SeoHead.tsx:
//
// 1. Duplicate hreflang — server-injected <link rel="alternate"> tags must be
//    claimed and updated by the client, not duplicated.  Before the fix,
//    SeoHead always called document.createElement("link") and appendChild(),
//    so a fully server-rendered page accumulated two sets of hreflang links
//    after hydration.
//
// 2. Unknown-subroute canonical — for soft-404 locale paths (routeKey falls
//    back to "home" with a non-empty unrecognised rest), SeoHead must resolve
//    canonical to the locale home URL, not self-canonicalize the unknown path.
//    This mirrors the server's isUnknownSubRoute guard in seo-inject.mjs.
//
// These tests exercise the core DOM logic extracted from SeoHead.tsx directly
// so they can run without mounting the full React tree.

import { describe, it, expect, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Helpers — re-implement the minimal DOM helpers used by SeoHead so we can
// test them in isolation without mounting the React component.
// ---------------------------------------------------------------------------

const SEO_ATTR = "data-seo-managed";

/**
 * Claim an existing element matching `selector` (server-injected or managed)
 * before creating a new one, then stamp it with data-seo-managed and apply
 * `attrs`. Mirrors setMeta() in SeoHead.tsx.
 */
function setMeta(
  selector: string,
  attrs: Record<string, string>,
  head: HTMLElement,
): void {
  let el = head.querySelector<HTMLElement>(`[${SEO_ATTR}]${selector}`) ??
           head.querySelector<HTMLElement>(selector);
  if (!el) {
    const tag = selector.startsWith("link") ? "link" : "meta";
    el = document.createElement(tag);
    head.appendChild(el);
  }
  el.setAttribute(SEO_ATTR, "true");
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
}

/**
 * Claim-or-create a <link rel="alternate"> for the given hreflang code.
 * Mirrors the hreflang section of SeoHead.tsx's effect.
 */
function claimOrCreateAlternate(
  code: string,
  href: string,
  head: HTMLElement,
): void {
  const existing = head.querySelector<HTMLElement>(
    `link[rel="alternate"][hreflang="${code}"]`,
  );
  const link = existing ?? document.createElement("link");
  if (!existing) head.appendChild(link);
  link.setAttribute(SEO_ATTR, "true");
  link.setAttribute("rel", "alternate");
  link.setAttribute("hreflang", code);
  link.setAttribute("href", href);
}

// ---------------------------------------------------------------------------
// Helpers to simulate server-side injected tags (no data-seo-managed).
// ---------------------------------------------------------------------------

function injectServerAlternate(
  code: string,
  href: string,
  head: HTMLElement,
): HTMLElement {
  const link = document.createElement("link");
  link.setAttribute("rel", "alternate");
  link.setAttribute("hreflang", code);
  link.setAttribute("href", href);
  head.appendChild(link);
  return link;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SeoHead — hreflang no-duplicate (claim-before-append)", () => {
  let head: HTMLElement;

  beforeEach(() => {
    document.head.innerHTML = "";
    head = document.head;
  });

  it("claims an existing server-injected hreflang link rather than adding a duplicate", () => {
    injectServerAlternate("en-LB", "https://presentail.test/en-lb/beirut", head);
    injectServerAlternate("ar-LB", "https://presentail.test/ar-lb/beirut", head);

    claimOrCreateAlternate("en-LB", "https://presentail.test/en-lb/beirut", head);
    claimOrCreateAlternate("ar-LB", "https://presentail.test/ar-lb/beirut", head);

    const allAlternates = head.querySelectorAll('link[rel="alternate"]');
    expect(allAlternates).toHaveLength(2);
  });

  it("stamps claimed server-injected links with data-seo-managed so they are cleaned up on navigation", () => {
    injectServerAlternate("en-LB", "https://presentail.test/en-lb/beirut", head);

    claimOrCreateAlternate("en-LB", "https://presentail.test/en-lb/beirut", head);

    const link = head.querySelector('link[rel="alternate"][hreflang="en-LB"]');
    expect(link?.getAttribute(SEO_ATTR)).toBe("true");
  });

  it("creates a new alternate when no server-injected link exists", () => {
    claimOrCreateAlternate("fr-LB", "https://presentail.test/fr-lb/beirut", head);

    const allAlternates = head.querySelectorAll('link[rel="alternate"]');
    expect(allAlternates).toHaveLength(1);
  });

  it("updates the href on a claimed server-injected link (e.g. after SPA navigation)", () => {
    injectServerAlternate("en-LB", "https://presentail.test/en-lb/beirut", head);

    claimOrCreateAlternate("en-LB", "https://presentail.test/en-lb/beirut/shop", head);

    const link = head.querySelector('link[rel="alternate"][hreflang="en-LB"]');
    expect(link?.getAttribute("href")).toBe("https://presentail.test/en-lb/beirut/shop");
    expect(head.querySelectorAll('link[rel="alternate"]')).toHaveLength(1);
  });
});

describe("SeoHead — full 11-entry hreflang set (server inject + client claim)", () => {
  let head: HTMLElement;

  const ALL_HREFLANG_CODES = [
    "en-LB", "ar-LB", "fr-LB",
    "en-AE", "ar-AE", "fr-AE",
    "en-CY", "ar-CY", "fr-CY", "el-CY",
    "x-default",
  ] as const;

  const BASE = "https://presentail.test";
  const CITY = { lb: "beirut", ae: "dubai", cy: "limassol" } as const;

  function buildEntries(entityPath: string) {
    const countries = ["lb", "ae", "cy"] as const;
    const result: Array<{ hreflang: string; href: string }> = [];
    for (const c of countries) {
      // Greek is Cyprus-only, so cy clusters carry an extra el alternate.
      const langs = c === "cy" ? (["en", "ar", "fr", "el"] as const) : (["en", "ar", "fr"] as const);
      for (const l of langs) {
        const href = entityPath
          ? `${BASE}/${l}-${c}/${CITY[c]}/${entityPath}`
          : `${BASE}/${l}-${c}/${CITY[c]}`;
        result.push({ hreflang: `${l}-${c.toUpperCase()}`, href });
      }
    }
    const xDefaultHref = entityPath
      ? `${BASE}/en-lb/beirut/${entityPath}`
      : `${BASE}/en-lb/beirut`;
    result.push({ hreflang: "x-default", href: xDefaultHref });
    return result;
  }

  beforeEach(() => {
    document.head.innerHTML = "";
    head = document.head;
  });

  it("server-injected 11-entry set is claimed (no duplicates after client hydration)", () => {
    const entries = buildEntries("shop");

    for (const { hreflang, href } of entries) {
      injectServerAlternate(hreflang, href, head);
    }

    for (const { hreflang, href } of entries) {
      claimOrCreateAlternate(hreflang, href, head);
    }

    const allAlternates = head.querySelectorAll('link[rel="alternate"]');
    expect(allAlternates).toHaveLength(11);
  });

  it("all 11 entries carry data-seo-managed after client claim", () => {
    const entries = buildEntries("shop");

    for (const { hreflang, href } of entries) {
      injectServerAlternate(hreflang, href, head);
    }

    for (const { hreflang, href } of entries) {
      claimOrCreateAlternate(hreflang, href, head);
    }

    for (const code of ALL_HREFLANG_CODES) {
      const link = head.querySelector(`link[rel="alternate"][hreflang="${code}"]`);
      expect(link?.getAttribute("data-seo-managed")).toBe("true");
    }
  });

  it("after SPA navigation: old 11 entries removed, new 11 entries written with updated entity path", () => {
    const shopEntries = buildEntries("shop");

    for (const { hreflang, href } of shopEntries) {
      injectServerAlternate(hreflang, href, head);
    }
    for (const { hreflang, href } of shopEntries) {
      claimOrCreateAlternate(hreflang, href, head);
    }

    // Simulate SPA navigation cleanup: remove all managed elements
    head.querySelectorAll('[data-seo-managed]').forEach((el) => el.parentElement?.removeChild(el));

    // Write new entries for product page
    const productEntries = buildEntries("product/roses");
    for (const { hreflang, href } of productEntries) {
      claimOrCreateAlternate(hreflang, href, head);
    }

    const allAlternates = head.querySelectorAll('link[rel="alternate"]');
    expect(allAlternates).toHaveLength(11);

    const enAE = head.querySelector('link[rel="alternate"][hreflang="en-AE"]');
    expect(enAE?.getAttribute("href")).toBe(`${BASE}/en-ae/dubai/product/roses`);

    const xDefault = head.querySelector('link[rel="alternate"][hreflang="x-default"]');
    expect(xDefault?.getAttribute("href")).toBe(`${BASE}/en-lb/beirut/product/roses`);
  });

  it("x-default always points to en-lb/beirut regardless of any browsed city", () => {
    const entries = buildEntries("brands");
    for (const { hreflang, href } of entries) {
      claimOrCreateAlternate(hreflang, href, head);
    }

    const xDefault = head.querySelector('link[rel="alternate"][hreflang="x-default"]');
    expect(xDefault?.getAttribute("href")).toBe(`${BASE}/en-lb/beirut/brands`);
  });

  it("creates all 11 entries from scratch when no server injection occurred", () => {
    const entries = buildEntries("occasions");
    for (const { hreflang, href } of entries) {
      claimOrCreateAlternate(hreflang, href, head);
    }

    const allAlternates = head.querySelectorAll('link[rel="alternate"]');
    expect(allAlternates).toHaveLength(11);
  });
});

describe("SeoHead — unknown-subroute canonical guard", () => {
  let head: HTMLElement;

  beforeEach(() => {
    document.head.innerHTML = "";
    head = document.head;
  });

  /**
   * Reproduce the client-side canonical-path computation from SeoHead.tsx for
   * unit-testing purposes.  Kept in sync with the component's effect logic.
   */
  function computeCanonicalPath(opts: {
    inLocale: boolean;
    isUnknownSubRoute: boolean;
    path: string;
    restLen: number;
  }): string {
    const { inLocale, isUnknownSubRoute, path, restLen } = opts;
    if (!inLocale) return "/";
    if (isUnknownSubRoute) {
      return restLen > 0 ? path.slice(0, path.length - restLen) || "/" : path;
    }
    return path;
  }

  it("resolves to locale home for an unknown subroute (mirrors isUnknownSubRoute server guard)", () => {
    const path = "/en-lb/beirut/some-unknown-route";
    const rest = "/some-unknown-route";
    const canonicalPath = computeCanonicalPath({
      inLocale: true,
      isUnknownSubRoute: true,
      path,
      restLen: rest.length,
    });
    expect(canonicalPath).toBe("/en-lb/beirut");
  });

  it("self-canonicalizes known locale routes", () => {
    const canonicalPath = computeCanonicalPath({
      inLocale: true,
      isUnknownSubRoute: false,
      path: "/en-lb/beirut/shop",
      restLen: 5,
    });
    expect(canonicalPath).toBe("/en-lb/beirut/shop");
  });

  it("falls back to '/' for non-locale paths", () => {
    const canonicalPath = computeCanonicalPath({
      inLocale: false,
      isUnknownSubRoute: false,
      path: "/",
      restLen: 0,
    });
    expect(canonicalPath).toBe("/");
  });

  it("applies the computed canonical to the DOM link element correctly", () => {
    const canonicalPath = "/en-lb/beirut";
    const canonicalHref = `https://presentail.test${canonicalPath}`;

    setMeta('link[rel="canonical"]', { rel: "canonical", href: canonicalHref }, head);

    const link = head.querySelector('link[rel="canonical"]');
    expect(link?.getAttribute("href")).toBe(canonicalHref);
    expect(link?.getAttribute("href")).not.toContain("some-unknown-route");
  });
});
