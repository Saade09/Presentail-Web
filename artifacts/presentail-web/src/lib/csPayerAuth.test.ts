import { describe, expect, it } from "vitest";
import { extractCsPayerAuthData, hasCsPayerAuthProof } from "./csPayerAuth";

describe("extractCsPayerAuthData", () => {
  it("picks the 3DS fields from a flat frictionless enrollment response", () => {
    // Shape mirrors the backend check-enrollment frictionless response
    // (artifacts/api-server/src/routes/payment.ts).
    const res = {
      ok: true,
      enrolled: false,
      authenticationTransactionId: "txn-123",
      eci: "05",
      cavv: "AAABCZIhcQAAAABZlyFxAAAAAAA=",
      xid: "xid-1",
      specificationVersion: "2.2.0",
      directoryServerTransactionId: "ds-txn-1",
      paSpecificationVersion: "2.2.0",
    };
    expect(extractCsPayerAuthData(res)).toEqual({
      authenticationTransactionId: "txn-123",
      eci: "05",
      cavv: "AAABCZIhcQAAAABZlyFxAAAAAAA=",
      xid: "xid-1",
      specificationVersion: "2.2.0",
      directoryServerTransactionId: "ds-txn-1",
      paSpecificationVersion: "2.2.0",
    });
  });

  it("picks all charge fields from a validate response and drops ok/unknown keys", () => {
    // Shape mirrors the backend validate response.
    const res = {
      ok: true,
      cavv: "cavv-value",
      eci: "05",
      eciRaw: "05",
      xid: "xid-2",
      specificationVersion: "2.2.0",
      directoryServerTransactionId: "ds-txn-2",
      paSpecificationVersion: "2.2.0",
      authenticationTransactionId: "txn-456",
      commerceIndicator: "vbv",
      somethingUnexpected: "must-not-pass-through",
    };
    const out = extractCsPayerAuthData(res);
    expect(out).toEqual({
      cavv: "cavv-value",
      eci: "05",
      eciRaw: "05",
      xid: "xid-2",
      specificationVersion: "2.2.0",
      directoryServerTransactionId: "ds-txn-2",
      paSpecificationVersion: "2.2.0",
      authenticationTransactionId: "txn-456",
      commerceIndicator: "vbv",
    });
    expect("ok" in out).toBe(false);
    expect("somethingUnexpected" in out).toBe(false);
  });

  it("drops empty strings and non-string values", () => {
    const out = extractCsPayerAuthData({
      cavv: "",
      eci: 5,
      xid: null,
      authenticationTransactionId: "txn-789",
    });
    expect(out).toEqual({ authenticationTransactionId: "txn-789" });
  });
});

describe("hasCsPayerAuthProof", () => {
  it("accepts cavv alone", () => {
    expect(hasCsPayerAuthProof({ cavv: "cavv-value" })).toBe(true);
  });

  it("accepts eciRaw alone", () => {
    expect(hasCsPayerAuthProof({ eciRaw: "06" })).toBe(true);
  });

  it("accepts eci alone", () => {
    expect(hasCsPayerAuthProof({ eci: "07" })).toBe(true);
  });

  it("rejects empty metadata (mirrors the backend pa_required gate)", () => {
    expect(hasCsPayerAuthProof({})).toBe(false);
    expect(hasCsPayerAuthProof({ cavv: "  ", eci: "" })).toBe(false);
    expect(
      hasCsPayerAuthProof({ authenticationTransactionId: "txn-only" }),
    ).toBe(false);
  });
});
