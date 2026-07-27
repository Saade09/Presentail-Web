// @vitest-environment node
//
// Unit tests for CyberSource Microform eligibility logic.
//
// Acceptance criteria:
//   1. Italy + EUR  → not eligible (wrong country, wrong currency)
//   2. Italy + USD  → not eligible (wrong country, right currency)
//   3. Lebanon + USD → eligible (LB + USD → CyberSource)
//   4. Lebanon + EUR → not eligible (right country, wrong currency)
//   5. null/undefined country → not eligible (no LB default fallback)
//   6. Lower-case country code is handled correctly

import { describe, it, expect } from "vitest";
import { isCyberSourceEligible } from "./cybersource-eligibility";

describe("isCyberSourceEligible", () => {
  it("Italy + EUR → not eligible", () => {
    expect(isCyberSourceEligible("IT", "EUR")).toBe(false);
  });

  it("Italy + USD → not eligible (correct currency but wrong country)", () => {
    expect(isCyberSourceEligible("IT", "USD")).toBe(false);
  });

  it("Lebanon + USD → eligible", () => {
    expect(isCyberSourceEligible("LB", "USD")).toBe(true);
  });

  it("Lebanon + EUR → not eligible (correct country but wrong currency)", () => {
    expect(isCyberSourceEligible("LB", "EUR")).toBe(false);
  });

  it("null country + USD → not eligible (no LB default fallback)", () => {
    expect(isCyberSourceEligible(null, "USD")).toBe(false);
  });

  it("undefined country + USD → not eligible (no LB default fallback)", () => {
    expect(isCyberSourceEligible(undefined, "USD")).toBe(false);
  });

  it("lower-case 'lb' + USD → eligible (case-insensitive)", () => {
    expect(isCyberSourceEligible("lb", "USD")).toBe(true);
  });

  it("UAE + USD → not eligible", () => {
    expect(isCyberSourceEligible("AE", "USD")).toBe(false);
  });

  it("Cyprus + USD → not eligible", () => {
    expect(isCyberSourceEligible("CY", "USD")).toBe(false);
  });
});
