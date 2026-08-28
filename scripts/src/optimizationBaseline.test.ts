import { describe, expect, it } from "vitest";
import { parseSafeTargetUrl } from "./optimizationBaseline";

describe("optimization baseline target URLs", () => {
  it("normalizes safe HTTP(S) origins", () => {
    expect(parseSafeTargetUrl("https://presentail.com/", "web-url")).toBe(
      "https://presentail.com",
    );
    expect(parseSafeTargetUrl("http://127.0.0.1:8080", "api-url")).toBe(
      "http://127.0.0.1:8080",
    );
  });

  it.each([
    "https://user:private-password@example.com",
    "https://example.com?signature=private-token",
    "https://example.com/#private-token",
    "https://example.com/private-token",
    "file:///tmp/private-token",
  ])("rejects secret-bearing or non-origin target %s", (value) => {
    let message = "";
    try {
      parseSafeTargetUrl(value, "api-url");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("--api-url must be");
    expect(message).not.toContain("private-password");
    expect(message).not.toContain("private-token");
  });
});