/**
 * Host-based redirect guard smoke tests (serve.mjs)
 *
 * serve.mjs has three unconditional host-based redirect guards that run before
 * any SPA fallback or legacy-WP redirect:
 *
 *   1. www.presentail.com  → https://presentail.com/<path>  (301, path-preserving)
 *   2. new.presentail.com  → https://presentail.com/<path>  (301, path-preserving) // allow-legacy-domain
 *   3. lb/ae/cy.presentail.com → fixed city-root on apex    (301, fixed target)
 *
 * These guards are triggered by the incoming Host header (or X-Forwarded-Host,
 * which the Replit / CDN proxy sets).  Normal integration tests cannot reach
 * them because the test runner connects on localhost, which never matches any
 * of the guarded host values.
 *
 * Each guard is exercised twice: once via a spoofed `host` header and once via
 * a spoofed `x-forwarded-host` header, matching the two code paths in serve.mjs:
 *   const normalizedHost    = normalizeHostHeader(req.headers.host);
 *   const normalizedFwdHost = normalizeHostHeader(req.headers["x-forwarded-host"]);
 *
 * Source of truth:
 *   artifacts/presentail-web/serve.mjs — isWwwHost, isNewSubdomain,
 *   countrySubdomainTarget blocks (~lines 1059–1106)
 *
 * Must run against a built serve.mjs instance — the "Web serve checks"
 * workflow starts the server and sets PLAYWRIGHT_BASE_URL before executing
 * this suite via `pnpm --filter @workspace/presentail-web run test:e2e:serve`.
 *
 * Run locally:
 *   pnpm --filter @workspace/presentail-web run build
 *   PORT=19234 node artifacts/presentail-web/serve.mjs &
 *   PLAYWRIGHT_BASE_URL=http://localhost:19234 \
 *     pnpm --filter @workspace/presentail-web run test:e2e:serve \
 *     --grep "host-redirect-guards"
 */

import { test, expect, type APIRequestContext } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * GET `path` without following redirects, spoofing the given Host header so
 * serve.mjs host guards see a non-localhost hostname.
 */
async function getWithHost(
  request: APIRequestContext,
  path: string,
  host: string,
) {
  return request.get(path, {
    maxRedirects: 0,
    headers: { host },
  });
}

/**
 * Same as getWithHost but spoofs X-Forwarded-Host instead, exercising the
 * `normalizedFwdHost` code path in serve.mjs.
 */
async function getWithXForwardedHost(
  request: APIRequestContext,
  path: string,
  xForwardedHost: string,
) {
  return request.get(path, {
    maxRedirects: 0,
    headers: { "x-forwarded-host": xForwardedHost },
  });
}

// ---------------------------------------------------------------------------
// Guard 1: www.presentail.com → https://presentail.com/<path>  (path-preserving)
// ---------------------------------------------------------------------------

test.describe("301 redirect — www.presentail.com guard (via host header)", () => {
  const cases: Array<{ path: string; expectedLocation: string }> = [
    { path: "/", expectedLocation: "https://presentail.com/" },
    {
      path: "/en-lb/beirut/shop",
      expectedLocation: "https://presentail.com/en-lb/beirut/shop",
    },
    {
      path: "/en-ae/dubai/",
      expectedLocation: "https://presentail.com/en-ae/dubai/",
    },
    {
      path: "/product/red-roses",
      expectedLocation: "https://presentail.com/product/red-roses",
    },
  ];

  for (const { path, expectedLocation } of cases) {
    test(`www.presentail.com${path} → 301 ${expectedLocation}`, async ({
      request,
    }) => {
      const response = await getWithHost(request, path, "www.presentail.com");
      expect(
        response.status(),
        `www.presentail.com${path} must return 301 (www→apex guard)`,
      ).toBe(301);
      const location = response.headers()["location"];
      expect(
        location,
        `www.presentail.com${path} must redirect to ${expectedLocation}`,
      ).toBe(expectedLocation);
    });
  }
});

test.describe("301 redirect — www.presentail.com guard (via x-forwarded-host header)", () => {
  const cases: Array<{ path: string; expectedLocation: string }> = [
    { path: "/", expectedLocation: "https://presentail.com/" },
    {
      path: "/en-lb/beirut/brands",
      expectedLocation: "https://presentail.com/en-lb/beirut/brands",
    },
  ];

  for (const { path, expectedLocation } of cases) {
    test(`x-forwarded-host: www.presentail.com, path ${path} → 301 ${expectedLocation}`, async ({
      request,
    }) => {
      const response = await getWithXForwardedHost(
        request,
        path,
        "www.presentail.com",
      );
      expect(
        response.status(),
        `x-forwarded-host: www.presentail.com${path} must return 301`,
      ).toBe(301);
      const location = response.headers()["location"];
      expect(
        location,
        `x-forwarded-host: www.presentail.com${path} must redirect to ${expectedLocation}`,
      ).toBe(expectedLocation);
    });
  }
});

// ---------------------------------------------------------------------------
// Guard 2: new.presentail.com → https://presentail.com/<path>  (path-preserving) // allow-legacy-domain
// ---------------------------------------------------------------------------

test.describe("301 redirect — new.presentail.com guard (via host header)", () => { // allow-legacy-domain
  const cases: Array<{ path: string; expectedLocation: string }> = [
    { path: "/", expectedLocation: "https://presentail.com/" },
    {
      path: "/en-lb/beirut/shop",
      expectedLocation: "https://presentail.com/en-lb/beirut/shop",
    },
    {
      path: "/product/tulips-bouquet",
      expectedLocation: "https://presentail.com/product/tulips-bouquet",
    },
  ];

  for (const { path, expectedLocation } of cases) {
    test(`new.presentail.com${path} → 301 ${expectedLocation}`, async ({ // allow-legacy-domain
      request,
    }) => {
      const response = await getWithHost(request, path, "new.presentail.com"); // allow-legacy-domain
      expect(
        response.status(),
        `new.presentail.com${path} must return 301 (retired-subdomain guard)`, // allow-legacy-domain
      ).toBe(301);
      const location = response.headers()["location"];
      expect(
        location,
        `new.presentail.com${path} must redirect to ${expectedLocation}`, // allow-legacy-domain
      ).toBe(expectedLocation);
    });
  }
});

test.describe("301 redirect — new.presentail.com guard (via x-forwarded-host header)", () => { // allow-legacy-domain
  test(`x-forwarded-host: new.presentail.com, path / → 301 https://presentail.com/`, async ({ // allow-legacy-domain
    request,
  }) => {
    const response = await getWithXForwardedHost(
      request,
      "/",
      "new.presentail.com", // allow-legacy-domain
    );
    expect(
      response.status(),
      "x-forwarded-host: new.presentail.com must return 301", // allow-legacy-domain
    ).toBe(301);
    const location = response.headers()["location"];
    expect(
      location,
      "x-forwarded-host: new.presentail.com must redirect to apex", // allow-legacy-domain
    ).toBe("https://presentail.com/");
  });
});

// ---------------------------------------------------------------------------
// Guard 3: country subdomains → fixed city-root (301, not path-preserving)
// ---------------------------------------------------------------------------

const COUNTRY_SUBDOMAIN_CASES: Array<{
  subdomain: string;
  expectedLocation: string;
}> = [
  {
    subdomain: "lb.presentail.com",
    expectedLocation: "https://presentail.com/en-lb/beirut/",
  },
  {
    subdomain: "ae.presentail.com",
    expectedLocation: "https://presentail.com/en-ae/dubai/",
  },
  {
    subdomain: "cy.presentail.com",
    expectedLocation: "https://presentail.com/en-cy/nicosia/",
  },
];

test.describe("301 redirect — country subdomain guards (via host header)", () => {
  for (const { subdomain, expectedLocation } of COUNTRY_SUBDOMAIN_CASES) {
    test(`host: ${subdomain} → 301 ${expectedLocation}`, async ({
      request,
    }) => {
      const response = await getWithHost(request, "/", subdomain);
      expect(
        response.status(),
        `host: ${subdomain} must return 301 (country-subdomain guard)`,
      ).toBe(301);
      const location = response.headers()["location"];
      expect(
        location,
        `host: ${subdomain} must redirect to ${expectedLocation}`,
      ).toBe(expectedLocation);
    });
  }
});

test.describe("301 redirect — country subdomain guards (via x-forwarded-host header)", () => {
  for (const { subdomain, expectedLocation } of COUNTRY_SUBDOMAIN_CASES) {
    test(`x-forwarded-host: ${subdomain} → 301 ${expectedLocation}`, async ({
      request,
    }) => {
      const response = await getWithXForwardedHost(request, "/", subdomain);
      expect(
        response.status(),
        `x-forwarded-host: ${subdomain} must return 301 (country-subdomain guard)`,
      ).toBe(301);
      const location = response.headers()["location"];
      expect(
        location,
        `x-forwarded-host: ${subdomain} must redirect to ${expectedLocation}`,
      ).toBe(expectedLocation);
    });
  }
});

// ---------------------------------------------------------------------------
// Sanity: non-guarded hosts are not redirected by the host guards
// ---------------------------------------------------------------------------

test.describe("no host-guard redirect for normal apex requests", () => {
  test("host: presentail.com does not trigger any host guard", async ({
    request,
  }) => {
    const response = await getWithHost(request, "/", "presentail.com");
    expect(
      response.status(),
      "apex host must not trigger a host guard 301",
    ).not.toBe(301);
  });

  test("no host header override — request passes through host guards untouched", async ({
    request,
  }) => {
    const response = await request.get("/", { maxRedirects: 0 });
    expect(
      response.status(),
      "plain localhost request must not trigger a host guard 301",
    ).not.toBe(301);
  });
});
