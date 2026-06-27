import { describe, it, expect } from "vitest";
import {
  findLegacyDomainHits,
  LEGACY_DOMAIN,
  LEGACY_DOMAIN_RE,
  SKIP_DIRS,
  SCAN_EXTENSIONS,
} from "./checkLegacyDomain.js";

// Build the legacy domain dynamically so this test file never contains a
// contiguous literal of the forbidden domain (which the guard would flag when
// it scans the repo, including this file).
const LEGACY = ["new", "presentail", "com"].join(".");

describe("checkLegacyDomain", () => {
  it("resolves the legacy domain constant correctly", () => {
    expect(LEGACY_DOMAIN).toBe(LEGACY);
  });

  it("the legacy regex source never contains a contiguous literal of the domain", () => {
    // The regex source uses escaped dots, so the constant is reconstructed at
    // runtime and the source code stays free of a self-flagging literal.
    expect(LEGACY_DOMAIN_RE.source.includes(LEGACY)).toBe(false);
  });

  it("flags a line that references the legacy domain", () => {
    const content = `const x = "https://${LEGACY}/sitemap.xml";`;
    const hits = findLegacyDomainHits(content, "some/file.ts");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ file: "some/file.ts", line: 1 });
  });

  it("reports the correct 1-indexed line number", () => {
    const content = ["line one", "line two", `bad https://${LEGACY}`].join("\n");
    const hits = findLegacyDomainHits(content, "f.ts");
    expect(hits).toHaveLength(1);
    expect(hits[0].line).toBe(3);
  });

  it("flags every occurrence across multiple lines", () => {
    const content = [`a ${LEGACY}`, "ok", `b ${LEGACY}`].join("\n");
    const hits = findLegacyDomainHits(content, "f.ts");
    expect(hits).toHaveLength(2);
  });

  it("does not flag the canonical presentail.com domain", () => {
    const content = `const x = "https://presentail.com/sitemap.xml";`;
    const hits = findLegacyDomainHits(content, "f.ts");
    expect(hits).toHaveLength(0);
  });

  it("matches case-insensitively", () => {
    const content = `https://NEW.Presentail.COM/x`;
    const hits = findLegacyDomainHits(content, "f.ts");
    expect(hits).toHaveLength(1);
  });

  it("respects the allow-legacy-domain annotation", () => {
    const content = `expect(url).not.toContain("://${LEGACY}"); // allow-legacy-domain`;
    const hits = findLegacyDomainHits(content, "f.test.ts");
    expect(hits).toHaveLength(0);
  });

  it("excludes dependency, build, and historical-doc directories", () => {
    expect(SKIP_DIRS.has("node_modules")).toBe(true);
    expect(SKIP_DIRS.has("dist")).toBe(true);
    expect(SKIP_DIRS.has("attached_assets")).toBe(true);
    expect(SKIP_DIRS.has(".agents")).toBe(true);
  });

  it("scans code and config extensions but not markdown", () => {
    expect(SCAN_EXTENSIONS.has(".ts")).toBe(true);
    expect(SCAN_EXTENSIONS.has(".tsx")).toBe(true);
    expect(SCAN_EXTENSIONS.has(".mjs")).toBe(true);
    expect(SCAN_EXTENSIONS.has(".yml")).toBe(true);
    expect(SCAN_EXTENSIONS.has(".md")).toBe(false);
  });
});
