/**
 * Unit tests for isPrivatePath() and resolveXRobotsTag() in serve-robots.mjs.
 *
 * These are pure-function unit tests — no HTTP server is spawned.
 * The functions are extracted from serve.mjs into serve-robots.mjs so they
 * can be tested in isolation; serve.mjs delegates to them unchanged.
 *
 * Coverage:
 *   isPrivatePath():
 *     - Bare private paths (/cart, /checkout, /account, /privacy, etc.)
 *     - Locale-prefixed private paths (/en-lb/beirut/checkout)
 *     - Blog listing vs. post distinction (/blog vs. /blog/<slug>)
 *     - False-positive safety (product slug containing a reserved word)
 *
 *   resolveXRobotsTag():
 *     - Private path → "noindex" on any host (canonical and non-canonical)
 *     - Public path + canonical host → "index, follow"
 *     - Public path + non-canonical host → null
 *     - UTM / click-ID params → "noindex"
 *     - Filter params → "noindex, follow"
 *     - Filter params on a curated page → "index, follow"
 */

import { describe, it, expect } from "vitest";

// Dynamic import because serve-robots.mjs is an ES module with no TypeScript
// declarations.  Vitest handles .mjs via its native ESM support.
const { isPrivatePath, resolveXRobotsTag } = await import(
  /* @vite-ignore */ "../../serve-robots.mjs"
) as {
  isPrivatePath: (pathname: string) => boolean;
  resolveXRobotsTag: (
    host: string,
    pathname: string,
    search?: string,
    curatedFilterPages?: Array<{ path: string; params?: Record<string, string | number> }>,
  ) => string | null;
};

// ---------------------------------------------------------------------------
// isPrivatePath — bare paths
// ---------------------------------------------------------------------------

describe("isPrivatePath — bare private paths", () => {
  const PRIVATE_PATHS = [
    "/cart",
    "/checkout",
    "/order-confirmed",
    "/account",
    "/personal-information",
    "/favorites",
    "/privacy",
    "/terms",
    "/careers",
    "/partner",
    "/auth",
    "/sign-in",
    "/sign-up",
    "/reset-password",
  ];

  for (const p of PRIVATE_PATHS) {
    it(`returns true for ${p}`, () => {
      expect(isPrivatePath(p)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// isPrivatePath — locale-prefixed paths
// ---------------------------------------------------------------------------

describe("isPrivatePath — locale-prefixed private paths", () => {
  it("returns true for /en-lb/beirut/checkout", () => {
    expect(isPrivatePath("/en-lb/beirut/checkout")).toBe(true);
  });

  it("returns true for /en-ae/dubai/cart", () => {
    expect(isPrivatePath("/en-ae/dubai/cart")).toBe(true);
  });

  it("returns true for /en-cy/nicosia/account", () => {
    expect(isPrivatePath("/en-cy/nicosia/account")).toBe(true);
  });

  it("returns true for /en-lb/beirut/privacy", () => {
    expect(isPrivatePath("/en-lb/beirut/privacy")).toBe(true);
  });

  it("returns true for /en-lb/beirut/order-confirmed", () => {
    expect(isPrivatePath("/en-lb/beirut/order-confirmed")).toBe(true);
  });

  it("returns true for /en-lb/beirut/sign-in", () => {
    expect(isPrivatePath("/en-lb/beirut/sign-in")).toBe(true);
  });

  it("returns true for /en-lb/beirut/sign-up", () => {
    expect(isPrivatePath("/en-lb/beirut/sign-up")).toBe(true);
  });

  it("returns true for /en-lb/beirut/reset-password", () => {
    expect(isPrivatePath("/en-lb/beirut/reset-password")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isPrivatePath — blog listing vs. blog post
// ---------------------------------------------------------------------------

describe("isPrivatePath — blog listing vs. blog post", () => {
  it("returns false for bare /blog (Journal hub is indexable)", () => {
    expect(isPrivatePath("/blog")).toBe(false);
  });

  it("returns false for /blog/ (trailing slash)", () => {
    expect(isPrivatePath("/blog/")).toBe(false);
  });

  it("returns false for /en-lb/beirut/blog (locale-prefixed listing)", () => {
    expect(isPrivatePath("/en-lb/beirut/blog")).toBe(false);
  });

  it("returns false for /en-lb/beirut/blog/ (locale-prefixed listing with trailing slash)", () => {
    expect(isPrivatePath("/en-lb/beirut/blog/")).toBe(false);
  });

  it("returns false for /blog/valentines-day-gift-guide (individual post is public)", () => {
    expect(isPrivatePath("/blog/valentines-day-gift-guide")).toBe(false);
  });

  it("returns false for /en-lb/beirut/blog/mothers-day-flowers (locale-prefixed post)", () => {
    expect(isPrivatePath("/en-lb/beirut/blog/mothers-day-flowers")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isPrivatePath — false-positive safety (public pages)
// ---------------------------------------------------------------------------

describe("isPrivatePath — false-positive safety for public pages", () => {
  it("returns false for /product/favorites-bundle (slug contains reserved word)", () => {
    expect(isPrivatePath("/product/favorites-bundle")).toBe(false);
  });

  it("returns false for /en-lb/beirut/product/checkout-experience (slug starts with reserved word)", () => {
    expect(isPrivatePath("/en-lb/beirut/product/checkout-experience")).toBe(false);
  });

  it("returns false for / (homepage)", () => {
    expect(isPrivatePath("/")).toBe(false);
  });

  it("returns false for /en-lb/beirut (city root)", () => {
    expect(isPrivatePath("/en-lb/beirut")).toBe(false);
  });

  it("returns false for /en-lb/beirut/shop", () => {
    expect(isPrivatePath("/en-lb/beirut/shop")).toBe(false);
  });

  it("returns false for /en-lb/beirut/brands", () => {
    expect(isPrivatePath("/en-lb/beirut/brands")).toBe(false);
  });

  it("returns false for /en-lb/beirut/occasions", () => {
    expect(isPrivatePath("/en-lb/beirut/occasions")).toBe(false);
  });

  it("returns false for /en-lb/beirut/product/red-roses-bouquet", () => {
    expect(isPrivatePath("/en-lb/beirut/product/red-roses-bouquet")).toBe(false);
  });

  it("returns false for /en-lb/beirut/category/flowers", () => {
    expect(isPrivatePath("/en-lb/beirut/category/flowers")).toBe(false);
  });

  it("returns false for /en-lb/beirut/occasion/birthday", () => {
    expect(isPrivatePath("/en-lb/beirut/occasion/birthday")).toBe(false);
  });

  it("returns false for /en-lb/beirut/brand/bloomingdale (brand page)", () => {
    expect(isPrivatePath("/en-lb/beirut/brand/bloomingdale")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveXRobotsTag — private path → "noindex" on any host
// ---------------------------------------------------------------------------

describe("resolveXRobotsTag — private path yields noindex on any host", () => {
  const PRIVATE_PATHS = [
    "/cart",
    "/checkout",
    "/account",
    "/en-lb/beirut/checkout",
    "/en-lb/beirut/cart",
    "/en-lb/beirut/account",
    "/en-lb/beirut/sign-in",
  ] as const;

  for (const pathname of PRIVATE_PATHS) {
    it(`returns "noindex" for ${pathname} on canonical host`, () => {
      expect(resolveXRobotsTag("presentail.com", pathname, "")).toBe("noindex");
    });

    it(`returns "noindex" for ${pathname} on non-canonical host`, () => {
      expect(resolveXRobotsTag("abc123.replit.app", pathname, "")).toBe("noindex");
    });
  }
});

// ---------------------------------------------------------------------------
// resolveXRobotsTag — public path + canonical host → "index, follow"
// ---------------------------------------------------------------------------

describe("resolveXRobotsTag — public path + canonical host yields index, follow", () => {
  const PUBLIC_PATHS = [
    "/",
    "/en-lb/beirut",
    "/en-lb/beirut/shop",
    "/en-lb/beirut/brands",
    "/en-lb/beirut/occasions",
    "/en-lb/beirut/product/red-roses-bouquet",
    "/en-lb/beirut/category/flowers",
    "/en-lb/beirut/brand/bloomingdale",
    "/en-lb/beirut/blog/valentines-day-gift-guide",
    "/en-lb/beirut/blog",
    "/product/favorites-bundle",
  ] as const;

  for (const pathname of PUBLIC_PATHS) {
    it(`returns "index, follow" for ${pathname} on presentail.com`, () => {
      expect(resolveXRobotsTag("presentail.com", pathname, "")).toBe("index, follow");
    });
  }
});

// ---------------------------------------------------------------------------
// resolveXRobotsTag — public path + non-canonical host → null
// ---------------------------------------------------------------------------

describe("resolveXRobotsTag — public path + non-canonical host yields null", () => {
  const NON_CANONICAL_HOSTS = [
    "abc123.replit.app",
    "staging.presentail.com",
    "127.0.0.1",
    "localhost",
  ] as const;

  for (const host of NON_CANONICAL_HOSTS) {
    it(`returns null for /en-lb/beirut/shop on ${host}`, () => {
      expect(resolveXRobotsTag(host, "/en-lb/beirut/shop", "")).toBeNull();
    });
  }
});

// ---------------------------------------------------------------------------
// resolveXRobotsTag — UTM / click-ID params → "noindex"
// ---------------------------------------------------------------------------

describe("resolveXRobotsTag — UTM / click-ID params yield noindex", () => {
  it('returns "noindex" for ?utm_source=email on canonical host', () => {
    expect(resolveXRobotsTag("presentail.com", "/en-lb/beirut/shop", "?utm_source=email")).toBe("noindex");
  });

  it('returns "noindex" for ?utm_medium=social on non-canonical host', () => {
    expect(resolveXRobotsTag("abc123.replit.app", "/en-lb/beirut/shop", "?utm_medium=social")).toBe("noindex");
  });

  it('returns "noindex" for ?gclid=abc123 (Google click-ID)', () => {
    expect(resolveXRobotsTag("presentail.com", "/en-lb/beirut/shop", "?gclid=abc123")).toBe("noindex");
  });

  it('returns "noindex" for ?utm_campaign=spring&sort=price (UTM takes precedence over filter)', () => {
    expect(resolveXRobotsTag("presentail.com", "/en-lb/beirut/shop", "?utm_campaign=spring&sort=price")).toBe("noindex");
  });
});

// ---------------------------------------------------------------------------
// resolveXRobotsTag — filter params → "noindex, follow"
// ---------------------------------------------------------------------------

describe("resolveXRobotsTag — filter params yield noindex, follow", () => {
  it('returns "noindex, follow" for ?sort=price-asc on canonical host', () => {
    expect(resolveXRobotsTag("presentail.com", "/en-lb/beirut/shop", "?sort=price-asc")).toBe("noindex, follow");
  });

  it('returns "noindex, follow" for ?currency=USD', () => {
    expect(resolveXRobotsTag("presentail.com", "/en-lb/beirut/shop", "?currency=USD")).toBe("noindex, follow");
  });

  it('returns "noindex, follow" for ?delivery=today on non-canonical host', () => {
    expect(resolveXRobotsTag("abc123.replit.app", "/en-lb/beirut/shop", "?delivery=today")).toBe("noindex, follow");
  });

  it('returns "noindex, follow" for ?page=2', () => {
    expect(resolveXRobotsTag("presentail.com", "/en-lb/beirut/shop", "?page=2")).toBe("noindex, follow");
  });
});

// ---------------------------------------------------------------------------
// resolveXRobotsTag — curated filter page → "index, follow"
// ---------------------------------------------------------------------------

describe("resolveXRobotsTag — curated filter page is exempt from filter noindex", () => {
  const curatedPages = [
    { path: "/en-lb/beirut/shop", params: { delivery: "today" } },
    { path: "/en-ae/dubai/shop", params: { delivery: "today" } },
  ];

  it('returns "index, follow" when the path+params match a curated entry on canonical host', () => {
    expect(
      resolveXRobotsTag("presentail.com", "/en-lb/beirut/shop", "?delivery=today", curatedPages),
    ).toBe("index, follow");
  });

  it('still returns "noindex, follow" for a filter param NOT on a curated path', () => {
    expect(
      resolveXRobotsTag("presentail.com", "/en-lb/beirut/brands", "?delivery=today", curatedPages),
    ).toBe("noindex, follow");
  });

  it('still returns "noindex, follow" for a curated path with non-matching params', () => {
    expect(
      resolveXRobotsTag("presentail.com", "/en-lb/beirut/shop", "?delivery=tomorrow", curatedPages),
    ).toBe("noindex, follow");
  });
});
