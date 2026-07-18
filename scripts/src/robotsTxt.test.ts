/**
 * robots.txt validation tests — faceted-navigation crawl-budget controls.
 *
 * Verifies that:
 *  1. Every filter/utility parameter has a Disallow: /*?<param>= rule.
 *  2. occasion=, category=, and recipient= are NOT in the Disallow list
 *     (they produce dedicated canonical paths and must remain crawlable).
 */

import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROBOTS_TXT_PATH = path.resolve(
  __dirname,
  "../../artifacts/presentail-web/public/robots.txt",
);

let robotsTxt: string;

beforeAll(() => {
  robotsTxt = fs.readFileSync(ROBOTS_TXT_PATH, "utf8");
});

const REQUIRED_FILTER_DISALLOWS = [
  "sort",
  "currency",
  "delivery",
  "availability",
  "price_min",
  "price_max",
  "page",
  "ref",
  "from",
  "scroll",
];

describe("robots.txt — filter parameter Disallow rules", () => {
  for (const param of REQUIRED_FILTER_DISALLOWS) {
    it(`has Disallow: /*?${param}= rule`, () => {
      expect(robotsTxt).toContain(`Disallow: /*?${param}=`);
    });
  }
});

describe("robots.txt — navigation params must NOT be disallowed", () => {
  it("does not disallow ?occasion= (has dedicated path /occasion/<slug>)", () => {
    const lines = robotsTxt.split("\n");
    const found = lines.some(
      (l) =>
        l.trim().startsWith("Disallow:") && l.includes("?occasion="),
    );
    expect(found).toBe(false);
  });

  it("does not disallow ?category= (has dedicated path /category/<slug>)", () => {
    const lines = robotsTxt.split("\n");
    const found = lines.some(
      (l) =>
        l.trim().startsWith("Disallow:") && l.includes("?category="),
    );
    expect(found).toBe(false);
  });

  it("does not disallow ?recipient= (has dedicated path /recipient/<slug>)", () => {
    const lines = robotsTxt.split("\n");
    const found = lines.some(
      (l) =>
        l.trim().startsWith("Disallow:") && l.includes("?recipient="),
    );
    expect(found).toBe(false);
  });
});
