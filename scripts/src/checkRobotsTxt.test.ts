import { describe, it, expect } from "vitest";
import {
  parseRobotsTxt,
  checkRobotsTxtContent,
  REQUIRED_DISALLOW_PATTERNS,
} from "./checkRobotsTxt.js";

const VALID_ROBOTS_TXT = `
User-agent: *
Disallow: /sign-in
Disallow: /order-confirmed
Disallow: /favorites
Disallow: /cart
Disallow: /checkout
Disallow: /*?utm_source=
Disallow: /*?utm_medium=

Sitemap: https://presentail.com/sitemap.xml
`.trim();

describe("parseRobotsTxt — block structure", () => {
  it("parses a single User-agent block", () => {
    const { blocks, orphanedLines } = parseRobotsTxt(VALID_ROBOTS_TXT);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].agents).toEqual(["*"]);
    expect(orphanedLines).toHaveLength(0);
  });

  it("collects Disallow values into the block", () => {
    const { blocks } = parseRobotsTxt(VALID_ROBOTS_TXT);
    expect(blocks[0].disallows).toContain("/sign-in");
    expect(blocks[0].disallows).toContain("/checkout");
  });

  it("ignores Sitemap lines (they are not block-scoped)", () => {
    const content = `Sitemap: https://presentail.com/sitemap.xml\n\nUser-agent: *\nDisallow: /cart`;
    const { orphanedLines } = parseRobotsTxt(content);
    expect(orphanedLines).toHaveLength(0);
  });

  it("parses multiple User-agent blocks", () => {
    const content = [
      "User-agent: Googlebot",
      "Disallow: /admin",
      "",
      "User-agent: *",
      "Disallow: /sign-in",
    ].join("\n");
    const { blocks } = parseRobotsTxt(content);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].agents).toEqual(["Googlebot"]);
    expect(blocks[1].agents).toEqual(["*"]);
  });

  it("groups consecutive User-agent lines into one block", () => {
    const content = [
      "User-agent: Googlebot",
      "User-agent: Bingbot",
      "Disallow: /private",
    ].join("\n");
    const { blocks } = parseRobotsTxt(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].agents).toEqual(["Googlebot", "Bingbot"]);
  });

  it("strips inline comments from lines before processing", () => {
    const content = "User-agent: * # all bots\nDisallow: /cart # private";
    const { blocks } = parseRobotsTxt(content);
    expect(blocks[0].disallows).toEqual(["/cart"]);
  });

  it("ignores blank lines", () => {
    const content = "\n\nUser-agent: *\n\nDisallow: /sign-in\n\n";
    const { blocks } = parseRobotsTxt(content);
    expect(blocks).toHaveLength(1);
  });
});

describe("parseRobotsTxt — orphaned directives", () => {
  it("flags a Disallow that appears before any User-agent", () => {
    const content = "Disallow: /secret\n\nUser-agent: *\nDisallow: /sign-in";
    const { orphanedLines } = parseRobotsTxt(content);
    expect(orphanedLines).toHaveLength(1);
    expect(orphanedLines[0].line).toBe("Disallow: /secret");
    expect(orphanedLines[0].lineNo).toBe(1);
  });

  it("flags an Allow that appears before any User-agent", () => {
    const content = "Allow: /\n\nUser-agent: *\nDisallow: /cart";
    const { orphanedLines } = parseRobotsTxt(content);
    expect(orphanedLines).toHaveLength(1);
    expect(orphanedLines[0].line).toBe("Allow: /");
  });

  it("reports the correct 1-indexed line number for orphaned directives", () => {
    const content = [
      "# comment line 1",
      "",
      "Disallow: /oops",
    ].join("\n");
    const { orphanedLines } = parseRobotsTxt(content);
    expect(orphanedLines).toHaveLength(1);
    expect(orphanedLines[0].lineNo).toBe(3);
  });

  it("does not flag a directive that follows a User-agent line", () => {
    const content = "User-agent: *\nDisallow: /sign-in";
    const { orphanedLines } = parseRobotsTxt(content);
    expect(orphanedLines).toHaveLength(0);
  });
});

describe("checkRobotsTxtContent — orphaned directive errors", () => {
  it("returns an error for a directive outside any User-agent block", () => {
    const content = [
      "Disallow: /secret",
      "",
      "User-agent: *",
      "Disallow: /sign-in",
      "Disallow: /order-confirmed",
      "Disallow: /favorites",
      "Disallow: /cart",
      "Disallow: /checkout",
      "Disallow: /*?utm_source=",
    ].join("\n");
    const errors = checkRobotsTxtContent(content);
    expect(errors.some((e) => e.includes("directive outside any User-agent block"))).toBe(true);
  });
});

describe("checkRobotsTxtContent — duplicate Disallow detection", () => {
  it("returns an error when the same Disallow appears twice in one block", () => {
    const content = [
      "User-agent: *",
      "Disallow: /sign-in",
      "Disallow: /sign-in",
      "Disallow: /order-confirmed",
      "Disallow: /favorites",
      "Disallow: /cart",
      "Disallow: /checkout",
      "Disallow: /*?utm_source=",
    ].join("\n");
    const errors = checkRobotsTxtContent(content);
    expect(errors.some((e) => e.includes("duplicate Disallow"))).toBe(true);
    expect(errors.some((e) => e.includes("/sign-in"))).toBe(true);
  });

  it("includes the agent label in the duplicate error message", () => {
    const content = [
      "User-agent: Googlebot",
      "Disallow: /admin",
      "Disallow: /admin",
    ].join("\n");
    const errors = checkRobotsTxtContent(content);
    expect(errors.some((e) => e.includes("Googlebot") && e.includes("duplicate Disallow"))).toBe(true);
  });

  it("does not flag identical Disallow values across different blocks", () => {
    const content = [
      "User-agent: Googlebot",
      "Disallow: /sign-in",
      "",
      "User-agent: *",
      "Disallow: /sign-in",
      "Disallow: /order-confirmed",
      "Disallow: /favorites",
      "Disallow: /cart",
      "Disallow: /checkout",
      "Disallow: /*?utm_source=",
    ].join("\n");
    const errors = checkRobotsTxtContent(content);
    expect(errors.some((e) => e.includes("duplicate Disallow"))).toBe(false);
  });
});

describe("checkRobotsTxtContent — required Disallow paths", () => {
  it("returns an error when User-agent: * block is missing entirely", () => {
    const content = "User-agent: Googlebot\nDisallow: /admin";
    const errors = checkRobotsTxtContent(content);
    expect(errors.some((e) => e.includes('No "User-agent: *" block'))).toBe(true);
  });

  const REQUIRED_PATHS = [
    "/sign-in",
    "/order-confirmed",
    "/favorites",
    "/cart",
    "/checkout",
  ];

  for (const missing of REQUIRED_PATHS) {
    it(`returns an error when ${missing} is absent from User-agent: *`, () => {
      const allDisallows = [
        "/sign-in",
        "/order-confirmed",
        "/favorites",
        "/cart",
        "/checkout",
        "/*?utm_source=",
      ].filter((p) => p !== missing);

      const content = [
        "User-agent: *",
        ...allDisallows.map((p) => `Disallow: ${p}`),
      ].join("\n");

      const errors = checkRobotsTxtContent(content);
      expect(errors.some((e) => e.includes(missing))).toBe(true);
    });
  }

  it("returns an error when no utm_ Disallow variant is present", () => {
    const content = [
      "User-agent: *",
      "Disallow: /sign-in",
      "Disallow: /order-confirmed",
      "Disallow: /favorites",
      "Disallow: /cart",
      "Disallow: /checkout",
    ].join("\n");
    const errors = checkRobotsTxtContent(content);
    expect(errors.some((e) => e.includes("utm_"))).toBe(true);
  });

  it("accepts any /*?utm_<anything> variant as satisfying the utm_ requirement", () => {
    const content = [
      "User-agent: *",
      "Disallow: /sign-in",
      "Disallow: /order-confirmed",
      "Disallow: /favorites",
      "Disallow: /cart",
      "Disallow: /checkout",
      "Disallow: /*?utm_campaign=",
    ].join("\n");
    const errors = checkRobotsTxtContent(content);
    expect(errors.some((e) => e.includes("utm_"))).toBe(false);
  });
});

describe("checkRobotsTxtContent — valid robots.txt passes cleanly", () => {
  it("returns no errors for a fully valid robots.txt", () => {
    const errors = checkRobotsTxtContent(VALID_ROBOTS_TXT);
    expect(errors).toEqual([]);
  });

  it("returns no errors when extra Disallow rules are present beyond the required set", () => {
    const content = VALID_ROBOTS_TXT + "\nDisallow: /*?sort=\nDisallow: /*?page=";
    const errors = checkRobotsTxtContent(content);
    expect(errors).toEqual([]);
  });

  it("returns no errors when a Sitemap line precedes the first User-agent block", () => {
    const content = `Sitemap: https://presentail.com/sitemap.xml\n\n${VALID_ROBOTS_TXT}`;
    const errors = checkRobotsTxtContent(content);
    expect(errors).toEqual([]);
  });

  it("returns no errors for a file using CRLF line endings", () => {
    const content = VALID_ROBOTS_TXT.replace(/\n/g, "\r\n");
    const errors = checkRobotsTxtContent(content);
    expect(errors).toEqual([]);
  });
});

describe("REQUIRED_DISALLOW_PATTERNS — match functions", () => {
  it("has an entry for each of the six required paths/patterns", () => {
    expect(REQUIRED_DISALLOW_PATTERNS).toHaveLength(6);
  });

  it("the /sign-in matcher accepts exactly /sign-in", () => {
    const entry = REQUIRED_DISALLOW_PATTERNS.find((e) => e.label === "/sign-in")!;
    expect(entry.match("/sign-in")).toBe(true);
    expect(entry.match("/sign-in/extra")).toBe(false);
  });

  it("the utm_ matcher accepts /*?utm_source= but not /*?ref=", () => {
    const entry = REQUIRED_DISALLOW_PATTERNS.find((e) =>
      e.label.includes("utm_"),
    )!;
    expect(entry.match("/*?utm_source=")).toBe(true);
    expect(entry.match("/*?utm_medium=")).toBe(true);
    expect(entry.match("/*?ref=")).toBe(false);
    expect(entry.match("/*?page=")).toBe(false);
  });
});
