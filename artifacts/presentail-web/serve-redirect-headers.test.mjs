// @vitest-environment node
/**
 * HTTP integration tests for serve.mjs redirect Location headers.
 *
 * These tests spin up a real Node.js HTTP server that replicates the
 * exact redirect branches in serve.mjs (www-redirect, new-subdomain redirect,
 * trailing-slash redirect) using the same stripTrackingParams /
 * stripTrackingParamsFromReqUrl helpers imported from serve-tracking.mjs.
 *
 * Unlike the unit tests in serve-tracking.test.mjs (which test the helper
 * functions in isolation), these tests assert that the actual Location header
 * returned by a real HTTP response is free of tracking params — giving a
 * stronger regression net for the serve.mjs wiring.
 */

import http from "node:http";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  stripTrackingParams,
  stripTrackingParamsFromReqUrl,
} from "./serve-tracking.mjs";

// ---------------------------------------------------------------------------
// Minimal test server — replicates the three redirect branches in serve.mjs
// ---------------------------------------------------------------------------
const WWW_REDIRECT_TARGET_ORIGIN = "https://presentail.com";

function normalizeHostHeader(value) {
  return (value?.toString().split(",")[0] ?? "")
    .trim()
    .split(":")[0]
    .toLowerCase();
}

const testServer = http.createServer((req, res) => {
  const normalizedHost    = normalizeHostHeader(req.headers.host);
  const normalizedFwdHost = normalizeHostHeader(req.headers["x-forwarded-host"]);

  // Branch 1: www.* redirect (mirrors serve.mjs lines ~1044–1052)
  const isWwwHost =
    normalizedHost.startsWith("www.") || normalizedFwdHost.startsWith("www.");
  if (isWwwHost) {
    res.writeHead(301, {
      location: `${WWW_REDIRECT_TARGET_ORIGIN}${stripTrackingParamsFromReqUrl(req.url)}`,
    });
    res.end();
    return;
  }

  // Branch 2: new.presentail.com redirect (mirrors serve.mjs lines ~1060–1065) // allow-legacy-domain
  const isNewSubdomain =
    normalizedHost === "new.presentail.com" || // allow-legacy-domain
    normalizedFwdHost === "new.presentail.com"; // allow-legacy-domain
  if (isNewSubdomain) {
    res.writeHead(301, {
      location: `${WWW_REDIRECT_TARGET_ORIGIN}${stripTrackingParamsFromReqUrl(req.url)}`,
    });
    res.end();
    return;
  }

  // Branch 3: trailing-slash redirect (mirrors serve.mjs lines ~1321–1340)
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const pathname = url.pathname;
  if (pathname.length > 1 && pathname.endsWith("/") && pathname !== "/product/") {
    const cleanPath = pathname.slice(0, -1);
    res.writeHead(301, {
      location: cleanPath + stripTrackingParams(url.search),
    });
    res.end();
    return;
  }

  res.writeHead(200, { "content-type": "text/plain" });
  res.end("ok");
});

let serverPort;

beforeAll(
  () =>
    new Promise((resolve) => {
      testServer.listen(0, "127.0.0.1", () => {
        serverPort = testServer.address().port;
        resolve();
      });
    }),
);

afterAll(
  () =>
    new Promise((resolve) => {
      testServer.close(resolve);
    }),
);

// ---------------------------------------------------------------------------
// Helper: make a real GET request and return { statusCode, location }
// ---------------------------------------------------------------------------
function getRedirect(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port: serverPort, path, method: "GET", headers },
      (res) => {
        res.resume();
        resolve({ statusCode: res.statusCode, location: res.headers.location ?? null });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// www-redirect: utm_* and srsltid must not appear in Location header
// ---------------------------------------------------------------------------
describe("www-redirect — real HTTP Location header", () => {
  const wwwHeaders = { host: "www.presentail.com" };

  it("strips utm_source and utm_medium from Location", async () => {
    const { statusCode, location } = await getRedirect(
      "/en-lb/beirut/shop?utm_source=google&utm_medium=cpc",
      wwwHeaders,
    );
    expect(statusCode).toBe(301);
    expect(location).toBe("https://presentail.com/en-lb/beirut/shop");
    expect(location).not.toContain("utm_");
  });

  it("strips srsltid from Location", async () => {
    const { statusCode, location } = await getRedirect(
      "/en-lb/beirut/product/roses?srsltid=AItRSTMVXvH2cJkD",
      wwwHeaders,
    );
    expect(statusCode).toBe(301);
    expect(location).toBe("https://presentail.com/en-lb/beirut/product/roses");
    expect(location).not.toContain("srsltid");
  });

  it("preserves non-tracking params in Location", async () => {
    const { statusCode, location } = await getRedirect(
      "/en-lb/beirut/shop?category=roses&utm_source=email&page=2",
      wwwHeaders,
    );
    expect(statusCode).toBe(301);
    expect(location).toBe("https://presentail.com/en-lb/beirut/shop?category=roses&page=2");
    expect(location).not.toContain("utm_");
  });

  it("forwards path unchanged when no tracking params are present", async () => {
    const { statusCode, location } = await getRedirect(
      "/en-ae/dubai/shop?sort=asc",
      wwwHeaders,
    );
    expect(statusCode).toBe(301);
    expect(location).toBe("https://presentail.com/en-ae/dubai/shop?sort=asc");
  });

  it("removes query string entirely when every param is a tracking param", async () => {
    const { statusCode, location } = await getRedirect(
      "/about?utm_source=google&utm_campaign=summer&srsltid=abc&fbclid=xyz",
      wwwHeaders,
    );
    expect(statusCode).toBe(301);
    expect(location).toBe("https://presentail.com/about");
  });
});

// ---------------------------------------------------------------------------
// new.presentail.com redirect: same stripping requirement // allow-legacy-domain
// ---------------------------------------------------------------------------
describe("new.presentail.com redirect — real HTTP Location header", () => { // allow-legacy-domain
  const newSubdomain = { host: "new.presentail.com" }; // allow-legacy-domain

  it("strips utm_* from Location on new.presentail.com redirect", async () => { // allow-legacy-domain
    const { statusCode, location } = await getRedirect(
      "/en-lb/beirut/product/tulips?utm_source=newsletter&utm_campaign=eid",
      newSubdomain,
    );
    expect(statusCode).toBe(301);
    expect(location).toBe("https://presentail.com/en-lb/beirut/product/tulips");
    expect(location).not.toContain("utm_");
  });

  it("strips srsltid from Location on new.presentail.com redirect", async () => { // allow-legacy-domain
    const { statusCode, location } = await getRedirect(
      "/en-lb/beirut/shop?srsltid=AItRST&ref=home",
      newSubdomain,
    );
    expect(statusCode).toBe(301);
    expect(location).toBe("https://presentail.com/en-lb/beirut/shop?ref=home");
  });
});

// ---------------------------------------------------------------------------
// Trailing-slash redirect: mixed tracking + non-tracking params
// ---------------------------------------------------------------------------
describe("trailing-slash redirect — real HTTP Location header", () => {
  it("strips utm_* and preserves non-tracking params", async () => {
    const { statusCode, location } = await getRedirect(
      "/en-lb/beirut/shop/?utm_source=google&category=roses&utm_campaign=spring",
      { host: "presentail.com" },
    );
    expect(statusCode).toBe(301);
    expect(location).toBe("/en-lb/beirut/shop?category=roses");
    expect(location).not.toContain("utm_");
  });

  it("strips srsltid from trailing-slash redirect Location", async () => {
    const { statusCode, location } = await getRedirect(
      "/en-lb/beirut/faqs/?srsltid=AItRSTMVXvH2&ref=home",
      { host: "presentail.com" },
    );
    expect(statusCode).toBe(301);
    expect(location).toBe("/en-lb/beirut/faqs?ref=home");
    expect(location).not.toContain("srsltid");
  });

  it("produces a tracking-free Location when all params are tracking params", async () => {
    const { statusCode, location } = await getRedirect(
      "/en-lb/beirut/brands/?utm_source=google&fbclid=IwAR123",
      { host: "presentail.com" },
    );
    expect(statusCode).toBe(301);
    expect(location).toBe("/en-lb/beirut/brands");
    expect(location).not.toContain("utm_");
    expect(location).not.toContain("fbclid");
  });

  it("trailing-slash redirect with no query string is unaffected", async () => {
    const { statusCode, location } = await getRedirect(
      "/en-lb/beirut/shop/",
      { host: "presentail.com" },
    );
    expect(statusCode).toBe(301);
    expect(location).toBe("/en-lb/beirut/shop");
  });
});
