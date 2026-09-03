import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/osProductsCache", () => ({
  getOsProducts: vi.fn(() => {
    throw new Error("retired UAE feed must not read the product cache");
  }),
}));

import { feedsRouter } from "./merchantFeed";

function createApp() {
  const app = express();
  app.use("/feeds", feedsRouter);
  return app;
}

describe("retired UAE Google Merchant XML feed", () => {
  it.each(["ae.xml", "AE.XML", "ae"])(
    "returns 410 for %s without generating a feed",
    async (marketFile) => {
      const response = await request(createApp()).get(
        `/feeds/google-merchant/${marketFile}`,
      );

      expect(response.status).toBe(410);
      expect(response.type).toMatch(/^text\/plain/);
      expect(response.headers["x-feed-retired"]).toBe("true");
      expect(response.headers["cache-control"]).toBe("public, max-age=86400");
      expect(response.text).toContain("managed by Presentail OS API data sources");
    },
  );
});