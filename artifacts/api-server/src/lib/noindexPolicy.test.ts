// Tests for the host-scoped noindex exemption (src/lib/noindexPolicy.ts),
// mounted as the first middleware in app.ts.
//
// Contract: public product-image endpoints on the canonical apex are
// indexable; every other host/path combination keeps
// `X-Robots-Tag: noindex, nofollow` (fail closed).

import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import {
  shouldExemptFromNoindex,
  universalNoindexMiddleware,
} from "./noindexPolicy";

const IMAGE_PATHS = [
  "/api/catalog/product-image/897/0",
  "/api/og-image/product/ferrero-rocher-chocolate-box-24-pieces",
  "/api/img/proxy",
];

function buildApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(universalNoindexMiddleware);
  app.use((_req, res) => {
    res.status(200).send("ok");
  });
  return app;
}

describe("shouldExemptFromNoindex", () => {
  it.each(IMAGE_PATHS)("exempts apex + %s", (path) => {
    expect(shouldExemptFromNoindex("presentail.com", path)).toBe(true);
    expect(shouldExemptFromNoindex("www.presentail.com", path)).toBe(true);
  });

  it("is case-insensitive and strips the port", () => {
    expect(shouldExemptFromNoindex("PresenTail.COM:443", "/api/img/proxy")).toBe(true);
  });

  it.each(IMAGE_PATHS)("does not exempt ops.presentail.com + %s", (path) => {
    expect(shouldExemptFromNoindex("ops.presentail.com", path)).toBe(false);
  });

  it.each([undefined, null, ""])("does not exempt missing host %s", (host) => {
    expect(shouldExemptFromNoindex(host, "/api/img/proxy")).toBe(false);
  });

  it("does not exempt look-alike hosts", () => {
    expect(shouldExemptFromNoindex("presentail.com.evil.test", "/api/img/proxy")).toBe(false);
    expect(shouldExemptFromNoindex("evilpresentail.com", "/api/img/proxy")).toBe(false);
  });

  it("does not exempt non-image paths on the apex", () => {
    expect(shouldExemptFromNoindex("presentail.com", "/api/woo/products")).toBe(false);
    expect(shouldExemptFromNoindex("presentail.com", "/api/img/proxy/extra")).toBe(false);
    expect(shouldExemptFromNoindex("presentail.com", "/api/catalog/product-image")).toBe(false);
  });

  it("does not exempt paths that only contain an exempt prefix", () => {
    expect(shouldExemptFromNoindex("presentail.com", "/api/evil/api/img/proxy")).toBe(false);
    expect(
      shouldExemptFromNoindex("presentail.com", "/x/api/catalog/product-image/1/0"),
    ).toBe(false);
  });
});

describe("universalNoindexMiddleware", () => {
  const app = buildApp();

  it.each(IMAGE_PATHS)("apex + %s → header not set", async (path) => {
    const res = await request(app).get(path).set("Host", "presentail.com");
    expect(res.headers["x-robots-tag"]).toBeUndefined();
  });

  it("apex + /api/img/proxy with a query string → header not set", async () => {
    const res = await request(app)
      .get("/api/img/proxy?url=https%3A%2F%2Fexample.com%2Fa.jpg&w=600")
      .set("Host", "presentail.com");
    expect(res.headers["x-robots-tag"]).toBeUndefined();
  });

  it("honours the trusted forwarded host", async () => {
    const res = await request(app)
      .get("/api/catalog/product-image/897/0")
      .set("Host", "internal:8080")
      .set("X-Forwarded-Host", "presentail.com");
    expect(res.headers["x-robots-tag"]).toBeUndefined();
  });

  it("apex + non-image API path → noindex, nofollow", async () => {
    const res = await request(app).get("/api/woo/products").set("Host", "presentail.com");
    expect(res.headers["x-robots-tag"]).toBe("noindex, nofollow");
  });

  it.each(IMAGE_PATHS)("ops.presentail.com + %s → noindex, nofollow", async (path) => {
    const res = await request(app).get(path).set("Host", "ops.presentail.com");
    expect(res.headers["x-robots-tag"]).toBe("noindex, nofollow");
  });

  it("forwarded ops host overrides an apex Host header → noindex, nofollow", async () => {
    const res = await request(app)
      .get("/api/img/proxy")
      .set("Host", "presentail.com")
      .set("X-Forwarded-Host", "ops.presentail.com");
    expect(res.headers["x-robots-tag"]).toBe("noindex, nofollow");
  });

  it.each(["", "unknown.example"])("host %j + image path → noindex, nofollow", async (host) => {
    const res = await request(app).get("/api/catalog/product-image/897/0").set("Host", host);
    expect(res.headers["x-robots-tag"]).toBe("noindex, nofollow");
  });

  it("path merely containing an exempt prefix → noindex, nofollow", async () => {
    const res = await request(app).get("/api/evil/api/img/proxy").set("Host", "presentail.com");
    expect(res.headers["x-robots-tag"]).toBe("noindex, nofollow");
  });
});
