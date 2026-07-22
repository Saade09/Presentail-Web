// @vitest-environment node
/**
 * Unit tests for serve-tracking.mjs — tracking-parameter stripping helpers
 * used by serve.mjs before emitting any server-side 301/302 Location header.
 *
 * Extended to also cover Section 8 of serve.mjs:
 *   Legacy WordPress country-prefix redirect chains (/lebanon/*, /cyprus/*,
 *   /uae/*, /dubai/*) — including single-hop guarantee and tracking-param
 *   stripping in Location headers.
 *
 * Regression target: any change to TRACKING_EXACT, TRACKING_PREFIXES, or the
 * stripping logic that would allow utm_*, srsltid, or other tracking params to
 * survive into a redirect Location header.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isTrackingParam,
  stripTrackingParams,
  stripTrackingParamsFromReqUrl,
} from "./serve-tracking.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVE_MJS = path.resolve(__dirname, "serve.mjs");

// ---------------------------------------------------------------------------
// Shared server helpers (same pattern as serve-legacy-wp-redirect.test.ts)
// ---------------------------------------------------------------------------

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      srv.close(() => resolve(addr.port));
    });
    srv.on("error", reject);
  });
}

function waitForReady(port, maxMs = 12_000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + maxMs;
    function attempt() {
      const req = http.request(
        { host: "127.0.0.1", port, path: "/favicon-16x16.png" },
        (res) => { res.resume(); resolve(); },
      );
      req.on("error", () => {
        if (Date.now() >= deadline) {
          reject(new Error(`serve.mjs on :${port} did not become ready within ${maxMs}ms`));
        } else {
          setTimeout(attempt, 150);
        }
      });
      req.end();
    }
    setTimeout(attempt, 150);
  });
}

/**
 * Make a single HTTP GET without following redirects.
 * Returns { status, location, body }.
 */
function get(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: urlPath },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, location: res.headers["location"], body }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

let serverPort;
let serverProc;

beforeAll(async () => {
  serverPort = await getFreePort();
  serverProc = spawn("node", [SERVE_MJS], {
    env: {
      ...process.env,
      PORT: String(serverPort),
      BASE_PATH: "",
      INTERNAL_API_BASE_URL: "http://127.0.0.1:0",
      ALERTS_SLACK_WEBHOOK_URL: "",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForReady(serverPort);
}, 20_000);

afterAll(() => {
  serverProc?.kill("SIGTERM");
});

// ---------------------------------------------------------------------------
// isTrackingParam
// ---------------------------------------------------------------------------
describe("isTrackingParam", () => {
  it("identifies utm_source as a tracking param", () => {
    expect(isTrackingParam("utm_source")).toBe(true);
  });

  it("identifies all utm_ prefixed params as tracking", () => {
    const utmKeys = [
      "utm_source", "utm_medium", "utm_campaign",
      "utm_content", "utm_term", "utm_id",
    ];
    for (const key of utmKeys) {
      expect(isTrackingParam(key), `expected ${key} to be a tracking param`).toBe(true);
    }
  });

  it("identifies exact-match tracking params", () => {
    const exact = [
      "srsltid", "fbclid", "gclid", "gad_source", "ttclid",
      "msclkid", "twclid", "igshid", "mc_cid", "mc_eid",
      "dclid", "wbraid", "gbraid",
    ];
    for (const key of exact) {
      expect(isTrackingParam(key), `expected ${key} to be a tracking param`).toBe(true);
    }
  });

  it("does not flag ordinary query params as tracking", () => {
    const safe = ["page", "category", "ref", "q", "sort", "color", "size", "lang"];
    for (const key of safe) {
      expect(isTrackingParam(key), `expected ${key} NOT to be a tracking param`).toBe(false);
    }
  });

  it("does not flag params that merely contain 'utm' without the prefix", () => {
    expect(isTrackingParam("utm")).toBe(false);
    expect(isTrackingParam("autm_source")).toBe(false);
    expect(isTrackingParam("notutm_campaign")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stripTrackingParams — search-string inputs
// ---------------------------------------------------------------------------
describe("stripTrackingParams", () => {
  it("returns empty string for empty / missing input", () => {
    expect(stripTrackingParams("")).toBe("");
    expect(stripTrackingParams(null)).toBe("");
    expect(stripTrackingParams(undefined)).toBe("");
  });

  it("strips a standalone utm_source param", () => {
    expect(stripTrackingParams("?utm_source=google")).toBe("");
  });

  it("strips srsltid (Google Shopping click id)", () => {
    expect(stripTrackingParams("?srsltid=AItRSTMVXvH2cJkD")).toBe("");
  });

  it("strips all utm_* params", () => {
    expect(
      stripTrackingParams("?utm_source=google&utm_medium=cpc&utm_campaign=spring"),
    ).toBe("");
  });

  it("preserves non-tracking params when tracking params are present", () => {
    expect(stripTrackingParams("?utm_source=google&page=2")).toBe("?page=2");
    expect(stripTrackingParams("?page=2&utm_source=google")).toBe("?page=2");
    expect(stripTrackingParams("?category=roses&utm_medium=cpc&sort=asc")).toBe(
      "?category=roses&sort=asc",
    );
  });

  it("preserves all params when none are tracking params", () => {
    expect(stripTrackingParams("?page=2&sort=asc&category=roses")).toBe(
      "?page=2&sort=asc&category=roses",
    );
  });

  it("strips mixed tracking and non-tracking params (utm_ + srsltid)", () => {
    expect(
      stripTrackingParams("?utm_source=google&srsltid=abc&ref=newsletter"),
    ).toBe("?ref=newsletter");
  });

  it("strips fbclid and gclid", () => {
    expect(stripTrackingParams("?fbclid=IwAR123&gclid=Cj0KCQ")).toBe("");
    expect(stripTrackingParams("?q=roses&fbclid=IwAR123")).toBe("?q=roses");
  });

  it("accepts input without a leading '?' (bare query string)", () => {
    expect(stripTrackingParams("utm_source=google")).toBe("");
    expect(stripTrackingParams("page=2&utm_source=google")).toBe("?page=2");
  });

  it("returns empty string when only a '?' is given", () => {
    expect(stripTrackingParams("?")).toBe("");
  });

  it("preserves URL-encoded param values unchanged", () => {
    expect(stripTrackingParams("?q=red+roses&utm_source=email")).toBe("?q=red+roses");
  });

  it("strips gad_source, msclkid, ttclid, twclid", () => {
    const allTracking =
      "?gad_source=1&msclkid=abc&ttclid=123&twclid=xyz&wbraid=wb&gbraid=gb&dclid=dc";
    expect(stripTrackingParams(allTracking)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// stripTrackingParamsFromReqUrl — Node req.url inputs
// ---------------------------------------------------------------------------
describe("stripTrackingParamsFromReqUrl", () => {
  it("returns '/' for null/undefined input", () => {
    expect(stripTrackingParamsFromReqUrl(null)).toBe("/");
    expect(stripTrackingParamsFromReqUrl(undefined)).toBe("/");
  });

  it("returns path unchanged when there is no query string", () => {
    expect(stripTrackingParamsFromReqUrl("/en-lb/beirut/shop")).toBe(
      "/en-lb/beirut/shop",
    );
    expect(stripTrackingParamsFromReqUrl("/")).toBe("/");
  });

  it("strips utm_* from a locale path — trailing-slash redirect scenario", () => {
    expect(
      stripTrackingParamsFromReqUrl("/en-lb/beirut/shop/?utm_source=google&utm_medium=cpc"),
    ).toBe("/en-lb/beirut/shop/");
  });

  it("strips srsltid from a product path — www/new-subdomain redirect scenario", () => {
    expect(
      stripTrackingParamsFromReqUrl("/en-lb/beirut/product/red-roses?srsltid=AItRSTMVXvH2cJkD"),
    ).toBe("/en-lb/beirut/product/red-roses");
  });

  it("preserves non-tracking params while stripping tracking ones", () => {
    expect(
      stripTrackingParamsFromReqUrl("/shop?category=roses&utm_source=email&sort=asc"),
    ).toBe("/shop?category=roses&sort=asc");
  });

  it("removes query string entirely when all params are tracking params", () => {
    expect(
      stripTrackingParamsFromReqUrl("/about?utm_source=google&utm_campaign=summer&srsltid=abc"),
    ).toBe("/about");
  });

  it("handles root path with only tracking params", () => {
    expect(
      stripTrackingParamsFromReqUrl("/?utm_source=google&fbclid=IwAR123"),
    ).toBe("/");
  });

  it("keeps the path intact including the trailing slash", () => {
    expect(
      stripTrackingParamsFromReqUrl("/en-ae/dubai/?gclid=Cj0K&page=2"),
    ).toBe("/en-ae/dubai/?page=2");
  });
});

// ---------------------------------------------------------------------------
// End-to-end scenario: simulate the three redirect locations in serve.mjs
// ---------------------------------------------------------------------------
describe("redirect Location header scenarios (serve.mjs)", () => {
  const apexOrigin = "https://presentail.com";

  it("www-redirect: srsltid does not appear in Location header", () => {
    const reqUrl = "/en-lb/beirut/product/bouquet?srsltid=AItRSTM&utm_source=google";
    const location = `${apexOrigin}${stripTrackingParamsFromReqUrl(reqUrl)}`;
    expect(location).toBe("https://presentail.com/en-lb/beirut/product/bouquet");
    expect(location).not.toContain("srsltid");
    expect(location).not.toContain("utm_");
  });

  it("www-redirect: non-tracking params survive in Location header", () => {
    const reqUrl = "/en-lb/beirut/shop?category=roses&utm_source=google&page=2";
    const location = `${apexOrigin}${stripTrackingParamsFromReqUrl(reqUrl)}`;
    expect(location).toBe("https://presentail.com/en-lb/beirut/shop?category=roses&page=2");
    expect(location).not.toContain("utm_");
  });

  it("www-redirect: path-only URL (no query) is unchanged", () => {
    const reqUrl = "/en-ae/dubai/shop";
    const location = `${apexOrigin}${stripTrackingParamsFromReqUrl(reqUrl)}`;
    expect(location).toBe("https://presentail.com/en-ae/dubai/shop");
  });

  it("trailing-slash redirect: utm_* removed from Location header", () => {
    const cleanPath = "/en-lb/beirut/shop";
    const urlSearch = "?utm_source=google&utm_campaign=spring";
    const location = cleanPath + stripTrackingParams(urlSearch);
    expect(location).toBe("/en-lb/beirut/shop");
    expect(location).not.toContain("utm_");
  });

  it("trailing-slash redirect: srsltid removed from Location header", () => {
    const cleanPath = "/en-lb/beirut/faqs";
    const urlSearch = "?srsltid=AItRSTMVXvH2&ref=home";
    const location = cleanPath + stripTrackingParams(urlSearch);
    expect(location).toBe("/en-lb/beirut/faqs?ref=home");
    expect(location).not.toContain("srsltid");
  });

  it("trailing-slash redirect: no query string produces no '?' in Location", () => {
    const cleanPath = "/en-lb/beirut/brands";
    const urlSearch = "";
    const location = cleanPath + stripTrackingParams(urlSearch);
    expect(location).toBe("/en-lb/beirut/brands");
  });
});

// ===========================================================================
// Section 8 integration tests — serve.mjs legacy country-prefix redirects
//
// Every test below exercises a real serve.mjs process (spawned in beforeAll).
// Node's http.request does NOT follow redirects, so the raw 301 status and the
// Location header are directly observable.
//
// "Single-hop" contract: a redirect Location header must be a URL that
// itself returns 200 from the server — it must NOT match another redirect
// pattern and trigger a second 3xx response.  This is the key regression guard
// this file adds: a future reordering of redirect blocks could silently
// introduce two-hop chains that waste crawl budget and dilute link equity.
// ===========================================================================

// ---------------------------------------------------------------------------
// Section 8 — bare country paths → locale city root
// ---------------------------------------------------------------------------

describe("serve.mjs Section 8 — /lebanon bare path redirects", () => {
  it("redirects /lebanon (no trailing slash) to /en-lb/beirut with 301", async () => {
    const { status, location } = await get(serverPort, "/lebanon");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut");
  });

  it("redirects /lebanon/ (trailing slash) to /en-lb/beirut with 301", async () => {
    const { status, location } = await get(serverPort, "/lebanon/");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut");
  });

  it("redirects /lebanon/unknown-sub-path to /en-lb/beirut with 301", async () => {
    const { status, location } = await get(serverPort, "/lebanon/some-unknown-page");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut");
  });
});

describe("serve.mjs Section 8 — /cyprus bare path redirects", () => {
  it("redirects /cyprus (no trailing slash) to /en-cy/nicosia with 301", async () => {
    const { status, location } = await get(serverPort, "/cyprus");
    expect(status).toBe(301);
    expect(location).toBe("/en-cy/nicosia");
  });

  it("redirects /cyprus/ (trailing slash) to /en-cy/nicosia with 301", async () => {
    const { status, location } = await get(serverPort, "/cyprus/");
    expect(status).toBe(301);
    expect(location).toBe("/en-cy/nicosia");
  });
});

describe("serve.mjs Section 8 — /uae and /dubai bare path redirects", () => {
  it("redirects /uae to /en-ae/dubai with 301", async () => {
    const { status, location } = await get(serverPort, "/uae");
    expect(status).toBe(301);
    expect(location).toBe("/en-ae/dubai");
  });

  it("redirects /uae/ to /en-ae/dubai with 301", async () => {
    const { status, location } = await get(serverPort, "/uae/");
    expect(status).toBe(301);
    expect(location).toBe("/en-ae/dubai");
  });

  it("redirects /dubai to /en-ae/dubai with 301", async () => {
    const { status, location } = await get(serverPort, "/dubai");
    expect(status).toBe(301);
    expect(location).toBe("/en-ae/dubai");
  });

  it("redirects /dubai/ to /en-ae/dubai with 301", async () => {
    const { status, location } = await get(serverPort, "/dubai/");
    expect(status).toBe(301);
    expect(location).toBe("/en-ae/dubai");
  });
});

// ---------------------------------------------------------------------------
// Section 8 — /country/product/:slug → /locale/city/product/:slug
// ---------------------------------------------------------------------------

describe("serve.mjs Section 8 — /country/product/:slug redirects", () => {
  it("redirects /lebanon/product/rose-bouquet → /en-lb/beirut/product/rose-bouquet", async () => {
    const { status, location } = await get(serverPort, "/lebanon/product/rose-bouquet");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/product/rose-bouquet");
  });

  it("redirects /cyprus/product/luxury-candle → /en-cy/nicosia/product/luxury-candle", async () => {
    const { status, location } = await get(serverPort, "/cyprus/product/luxury-candle");
    expect(status).toBe(301);
    expect(location).toBe("/en-cy/nicosia/product/luxury-candle");
  });

  it("redirects /uae/product/hamper-box → /en-ae/dubai/product/hamper-box", async () => {
    const { status, location } = await get(serverPort, "/uae/product/hamper-box");
    expect(status).toBe(301);
    expect(location).toBe("/en-ae/dubai/product/hamper-box");
  });

  it("redirects /dubai/product/orchid-plant → /en-ae/dubai/product/orchid-plant", async () => {
    const { status, location } = await get(serverPort, "/dubai/product/orchid-plant");
    expect(status).toBe(301);
    expect(location).toBe("/en-ae/dubai/product/orchid-plant");
  });

  it("passes through a slug with hyphens and numbers unchanged", async () => {
    const { status, location } = await get(serverPort, "/lebanon/product/luxury-bouquet-75");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/product/luxury-bouquet-75");
  });
});

// ---------------------------------------------------------------------------
// Section 8 — /country/product-category/:slug → /locale/city/category/:slug
// ---------------------------------------------------------------------------

describe("serve.mjs Section 8 — /country/product-category/:slug redirects", () => {
  it("maps /lebanon/product-category/flowers → /en-lb/beirut/category/hand-bouquets", async () => {
    const { status, location } = await get(serverPort, "/lebanon/product-category/flowers");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/category/hand-bouquets");
  });

  it("maps /lebanon/product-category/chocolates → /en-lb/beirut/category/chocolate", async () => {
    const { status, location } = await get(serverPort, "/lebanon/product-category/chocolates");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/category/chocolate");
  });

  it("maps /lebanon/product-category/luxury-arrangements → /en-lb/beirut/category/lux-arrangements", async () => {
    const { status, location } = await get(serverPort, "/lebanon/product-category/luxury-arrangements");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/category/lux-arrangements");
  });

  it("falls back to /en-lb/beirut/shop for an unknown category slug", async () => {
    const { status, location } = await get(serverPort, "/lebanon/product-category/misc-unknown");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/shop");
  });

  it("maps /uae/product-category/flowers → /en-ae/dubai/category/hand-bouquets", async () => {
    const { status, location } = await get(serverPort, "/uae/product-category/flowers");
    expect(status).toBe(301);
    expect(location).toBe("/en-ae/dubai/category/hand-bouquets");
  });

  it("maps /cyprus/product-category/cakes → /en-cy/nicosia/category/cakes", async () => {
    const { status, location } = await get(serverPort, "/cyprus/product-category/cakes");
    expect(status).toBe(301);
    expect(location).toBe("/en-cy/nicosia/category/cakes");
  });

  it("strips /page/:n/ pagination from /country/product-category/:slug/page/:n/", async () => {
    const { status, location } = await get(serverPort, "/lebanon/product-category/flowers/page/2/");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/category/hand-bouquets");
  });
});

// ---------------------------------------------------------------------------
// Section 8 — /country/product-tag/:slug → /locale/city/occasion/:slug
// ---------------------------------------------------------------------------

describe("serve.mjs Section 8 — /country/product-tag/:slug redirects", () => {
  it("maps /lebanon/product-tag/birthday → /en-lb/beirut/occasion/birthday", async () => {
    const { status, location } = await get(serverPort, "/lebanon/product-tag/birthday");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/occasion/birthday");
  });

  it("maps /lebanon/product-tag/newborn → /en-lb/beirut/occasion/new-born", async () => {
    const { status, location } = await get(serverPort, "/lebanon/product-tag/newborn");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/occasion/new-born");
  });

  it("maps /lebanon/product-tag/valentine → /en-lb/beirut/occasion/valentines-day", async () => {
    const { status, location } = await get(serverPort, "/lebanon/product-tag/valentine");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/occasion/valentines-day");
  });

  it("maps /lebanon/product-tag/love → /en-lb/beirut/occasion/love-romance", async () => {
    const { status, location } = await get(serverPort, "/lebanon/product-tag/love");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/occasion/love-romance");
  });

  it("falls back to /en-lb/beirut/occasions for an unknown tag slug", async () => {
    const { status, location } = await get(serverPort, "/lebanon/product-tag/unknown-tag");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/occasions");
  });

  it("maps /uae/product-tag/anniversary → /en-ae/dubai/occasion/anniversary", async () => {
    const { status, location } = await get(serverPort, "/uae/product-tag/anniversary");
    expect(status).toBe(301);
    expect(location).toBe("/en-ae/dubai/occasion/anniversary");
  });

  it("maps /cyprus/product-tag/graduation → /en-cy/nicosia/occasion/graduation", async () => {
    const { status, location } = await get(serverPort, "/cyprus/product-tag/graduation");
    expect(status).toBe(301);
    expect(location).toBe("/en-cy/nicosia/occasion/graduation");
  });

  it("strips /page/:n/ pagination from /country/product-tag/:slug/page/:n/", async () => {
    const { status, location } = await get(serverPort, "/lebanon/product-tag/birthday/page/3/");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/occasion/birthday");
  });
});

// ---------------------------------------------------------------------------
// Section 7 — /flowers vanity redirect (task-required explicit check)
// ---------------------------------------------------------------------------

describe("serve.mjs Section 7 — /flowers vanity redirect", () => {
  it("redirects /flowers → /en-lb/beirut/category/hand-bouquets with 301", async () => {
    const { status, location } = await get(serverPort, "/flowers");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/category/hand-bouquets");
  });

  it("redirects /flowers/ (trailing slash) → /en-lb/beirut/category/hand-bouquets with 301", async () => {
    const { status, location } = await get(serverPort, "/flowers/");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/category/hand-bouquets");
  });
});

// ---------------------------------------------------------------------------
// Tracking-param stripping in Section 8 Location headers
//
// The redirect handler appends stripTrackingParams(url.search) to every
// Section 8 Location.  These tests verify utm_* and other tracking params
// never appear in the outbound Location header.
// ---------------------------------------------------------------------------

describe("serve.mjs Section 8 — tracking params stripped from Location headers", () => {
  it("strips utm_source from /lebanon redirect Location", async () => {
    const { status, location } = await get(serverPort, "/lebanon?utm_source=google");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut");
    expect(location).not.toContain("utm_");
  });

  it("strips utm_* from /lebanon/product/:slug redirect Location", async () => {
    const { status, location } = await get(
      serverPort,
      "/lebanon/product/rose-bouquet?utm_source=instagram&utm_medium=social",
    );
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/product/rose-bouquet");
    expect(location).not.toContain("utm_");
  });

  it("strips srsltid from /uae/product-category/:slug redirect Location", async () => {
    const { status, location } = await get(
      serverPort,
      "/uae/product-category/flowers?srsltid=AItRSTMVXvH2cJkD",
    );
    expect(status).toBe(301);
    expect(location).toBe("/en-ae/dubai/category/hand-bouquets");
    expect(location).not.toContain("srsltid");
  });

  it("strips fbclid from /cyprus/product-tag/:slug redirect Location", async () => {
    const { status, location } = await get(
      serverPort,
      "/cyprus/product-tag/birthday?fbclid=IwAR123",
    );
    expect(status).toBe(301);
    expect(location).toBe("/en-cy/nicosia/occasion/birthday");
    expect(location).not.toContain("fbclid");
  });

  it("preserves non-tracking query params in the Section 8 Location header", async () => {
    const { status, location } = await get(
      serverPort,
      "/lebanon?utm_source=google&ref=newsletter",
    );
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut?ref=newsletter");
    expect(location).not.toContain("utm_");
  });

  it("strips gclid from /dubai redirect Location", async () => {
    const { status, location } = await get(serverPort, "/dubai?gclid=Cj0KCQ123");
    expect(status).toBe(301);
    expect(location).toBe("/en-ae/dubai");
    expect(location).not.toContain("gclid");
  });
});

// ---------------------------------------------------------------------------
// Single-hop guarantee
//
// Every Section 8 redirect Location must be a valid final destination that
// does NOT itself trigger another redirect (no two-hop chains).  We make a
// second request to each Location and assert the response is 200.
//
// A two-hop chain would waste crawl budget: Google follows the first 301,
// but must make an additional round-trip for every further 3xx it encounters.
// If a future serve.mjs change reorders redirect blocks (e.g. moves the
// trailing-slash redirect before the country-prefix block), a Location like
// "/en-lb/beirut/" would fire the trailing-slash redirect as a second hop.
// These tests catch that regression immediately.
// ---------------------------------------------------------------------------

describe("serve.mjs Section 8 — single-hop guarantee (redirect Location returns 200)", () => {
  async function assertSingleHop(inputPath, expectedLocation) {
    const first = await get(serverPort, inputPath);
    expect(first.status, `expected 301 for ${inputPath}`).toBe(301);
    expect(first.location, `expected Location for ${inputPath}`).toBe(expectedLocation);

    const second = await get(serverPort, first.location);
    expect(second.status, `Location ${first.location} must return 200, not ${second.status}`).toBe(200);
  }

  it("bare /lebanon redirects to a URL that is not further redirected", async () => {
    await assertSingleHop("/lebanon", "/en-lb/beirut");
  });

  it("bare /cyprus redirects to a URL that is not further redirected", async () => {
    await assertSingleHop("/cyprus", "/en-cy/nicosia");
  });

  it("bare /uae redirects to a URL that is not further redirected", async () => {
    await assertSingleHop("/uae", "/en-ae/dubai");
  });

  it("bare /dubai redirects to a URL that is not further redirected", async () => {
    await assertSingleHop("/dubai", "/en-ae/dubai");
  });

  it("/lebanon/product/:slug redirects to a URL that is not further redirected", async () => {
    await assertSingleHop("/lebanon/product/rose-bouquet", "/en-lb/beirut/product/rose-bouquet");
  });

  it("/lebanon/product-category/flowers redirects to a URL that is not further redirected", async () => {
    await assertSingleHop("/lebanon/product-category/flowers", "/en-lb/beirut/category/hand-bouquets");
  });

  it("/lebanon/product-category/unknown-slug fallback redirects to a URL that is not further redirected", async () => {
    await assertSingleHop("/lebanon/product-category/misc-unknown", "/en-lb/beirut/shop");
  });

  it("/lebanon/product-tag/birthday redirects to a URL that is not further redirected", async () => {
    await assertSingleHop("/lebanon/product-tag/birthday", "/en-lb/beirut/occasion/birthday");
  });

  it("/lebanon/product-tag/unknown fallback redirects to a URL that is not further redirected", async () => {
    await assertSingleHop("/lebanon/product-tag/unknown-tag", "/en-lb/beirut/occasions");
  });

  it("/uae/product-category/flowers redirects to a URL that is not further redirected", async () => {
    await assertSingleHop("/uae/product-category/flowers", "/en-ae/dubai/category/hand-bouquets");
  });

  it("/cyprus/product-tag/graduation redirects to a URL that is not further redirected", async () => {
    await assertSingleHop("/cyprus/product-tag/graduation", "/en-cy/nicosia/occasion/graduation");
  });

  it("/flowers (Section 7 vanity) redirects to a URL that is not further redirected", async () => {
    await assertSingleHop("/flowers", "/en-lb/beirut/category/hand-bouquets");
  });
});
