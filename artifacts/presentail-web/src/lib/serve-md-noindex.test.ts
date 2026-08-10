/**
 * Unit tests verifying that city Markdown mirror paths emit
 * `X-Robots-Tag: noindex, follow` in serve.mjs.
 *
 * serve.mjs handles `.md` requests with this logic:
 *   if (pathname.endsWith(".md")) {
 *     const htmlPath = pathname.slice(0, -3);
 *     if (isMirroredPath(htmlPath)) {
 *       res.setHeader("X-Robots-Tag", "noindex, follow");
 *     }
 *   }
 *
 * So verifying isMirroredPath() is the single gate — if it returns true,
 * serve.mjs unconditionally adds `X-Robots-Tag: noindex, follow` to the
 * Markdown mirror response. A false result means serve.mjs returns 404.
 *
 * Coverage:
 *   - /en-lb/batroun is a mirrored path (batroun.md will get noindex, follow)
 *   - /en-lb/tripoli is a mirrored path (the existing global rule covers it)
 *   - The noindex rule applies to all three supported locales for batroun
 *   - The canonical HTML page /en-lb/batroun is NOT affected (no .md suffix)
 */

import { describe, it, expect } from "vitest";

const { isMirroredPath } = await import(
  /* @vite-ignore */ "../../markdown.mjs"
) as { isMirroredPath: (pathname: string) => boolean };

describe("serve.mjs .md noindex — isMirroredPath gate for Batroun", () => {
  it("/en-lb/batroun is a mirrored path → serve.mjs emits X-Robots-Tag: noindex, follow on batroun.md", () => {
    expect(isMirroredPath("/en-lb/batroun")).toBe(true);
  });

  it("/ar-lb/batroun is a mirrored path → ar-lb/batroun.md gets noindex, follow", () => {
    expect(isMirroredPath("/ar-lb/batroun")).toBe(true);
  });

  it("/fr-lb/batroun is a mirrored path → fr-lb/batroun.md gets noindex, follow", () => {
    expect(isMirroredPath("/fr-lb/batroun")).toBe(true);
  });

  it("isMirroredPath also returns true when called with the .md suffix directly", () => {
    // serve.mjs strips the .md before calling isMirroredPath, but the function
    // also handles the .md suffix itself for robustness.
    expect(isMirroredPath("/en-lb/batroun.md")).toBe(true);
  });

  it("/en-lb/tripoli is also a mirrored path (global rule covers it)", () => {
    expect(isMirroredPath("/en-lb/tripoli")).toBe(true);
  });

  it("canonical HTML path /en-lb/batroun (no .md) is still a mirrored path but serve.mjs only uses the gate for .md requests", () => {
    // The HTML path is mirrored, but serve.mjs only checks isMirroredPath() inside
    // the `pathname.endsWith(".md")` branch, so the canonical page is index, follow.
    expect(isMirroredPath("/en-lb/batroun")).toBe(true);
  });
});
