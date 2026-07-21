import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We test the pure functions that don't need env vars first.
// The credential-dependent functions are tested with mocked fetch.

// ── Minimal type surface we need for tests ────────────────────────────────────
// Re-export happens at module level — call vi.mock before importing.
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return actual; // use real crypto — we want deterministic HMAC tests
});

// ── Module under test ─────────────────────────────────────────────────────────
import {
  isCybersourceConfigured,
  generateCaptureContext,
  authorizeAndCapture,
} from "./cybersource";

// ── Helpers ───────────────────────────────────────────────────────────────────
function setEnv(overrides: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

describe("isCybersourceConfigured", () => {
  afterEach(() => {
    setEnv({
      CYBERSOURCE_MERCHANT_ID: undefined,
      CYBERSOURCE_API_KEY_ID: undefined,
      CYBERSOURCE_SHARED_SECRET_KEY: undefined,
    });
  });

  it("returns false when no env vars are set", () => {
    setEnv({
      CYBERSOURCE_MERCHANT_ID: undefined,
      CYBERSOURCE_API_KEY_ID: undefined,
      CYBERSOURCE_SHARED_SECRET_KEY: undefined,
    });
    expect(isCybersourceConfigured()).toBe(false);
  });

  it("returns false when only some env vars are set", () => {
    setEnv({
      CYBERSOURCE_MERCHANT_ID: "testmerchant",
      CYBERSOURCE_API_KEY_ID: undefined,
      CYBERSOURCE_SHARED_SECRET_KEY: undefined,
    });
    expect(isCybersourceConfigured()).toBe(false);
  });

  it("returns true when all three env vars are set", () => {
    setEnv({
      CYBERSOURCE_MERCHANT_ID: "testmerchant",
      CYBERSOURCE_API_KEY_ID: "keyid123",
      CYBERSOURCE_SHARED_SECRET_KEY: Buffer.from("secret").toString("base64"),
    });
    expect(isCybersourceConfigured()).toBe(true);
  });
});

describe("generateCaptureContext", () => {
  const credentials = {
    CYBERSOURCE_MERCHANT_ID: "testmerchant",
    CYBERSOURCE_API_KEY_ID: "keyid123",
    CYBERSOURCE_SHARED_SECRET_KEY: Buffer.from("supersecretkey").toString("base64"),
    CYBERSOURCE_ENVIRONMENT: "test",
  };

  beforeEach(() => setEnv(credentials));
  afterEach(() => {
    setEnv(Object.fromEntries(Object.keys(credentials).map((k) => [k, undefined])));
    vi.restoreAllMocks();
  });

  it("returns the JWT string on a 200 success", async () => {
    const fakeCaptureContext = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.fake";
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(fakeCaptureContext, { status: 200 }),
    );

    const result = await generateCaptureContext({
      targetOrigins: ["https://presentail.com"],
      totalAmount: "25.00",
      currency: "USD",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.captureContext).toBe(fakeCaptureContext);
    }
  });

  it("returns ok:false when the HTTP response is not OK", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Invalid merchant ID" }), {
        status: 400,
      }),
    );

    const result = await generateCaptureContext({
      targetOrigins: ["https://presentail.com"],
      totalAmount: "25.00",
      currency: "USD",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Invalid merchant ID");
    }
  });

  it("returns ok:false when fetch throws (network error)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const result = await generateCaptureContext({
      targetOrigins: ["https://presentail.com"],
      totalAmount: "25.00",
      currency: "USD",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Failed to fetch");
    }
  });

  it("returns ok:false when response body is empty", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("", { status: 200 }),
    );

    const result = await generateCaptureContext({
      targetOrigins: ["https://presentail.com"],
      totalAmount: "25.00",
      currency: "USD",
    });

    expect(result.ok).toBe(false);
  });

  it("uses test base URL when CYBERSOURCE_ENVIRONMENT=test", async () => {
    let capturedUrl = "";
    vi.spyOn(global, "fetch").mockImplementationOnce(async (input) => {
      capturedUrl = input.toString();
      return new Response("fake.jwt.token", { status: 200 });
    });

    await generateCaptureContext({
      targetOrigins: ["https://presentail.com"],
      totalAmount: "10.00",
      currency: "USD",
    });

    expect(capturedUrl).toContain("apitest.cybersource.com");
  });

  it("uses live base URL when CYBERSOURCE_ENVIRONMENT=live", async () => {
    setEnv({ ...credentials, CYBERSOURCE_ENVIRONMENT: "live" });
    let capturedUrl = "";
    vi.spyOn(global, "fetch").mockImplementationOnce(async (input) => {
      capturedUrl = input.toString();
      return new Response("fake.jwt.token", { status: 200 });
    });

    await generateCaptureContext({
      targetOrigins: ["https://presentail.com"],
      totalAmount: "10.00",
      currency: "USD",
    });

    expect(capturedUrl).toContain("api.cybersource.com");
    expect(capturedUrl).not.toContain("apitest");
  });
});

describe("authorizeAndCapture", () => {
  const credentials = {
    CYBERSOURCE_MERCHANT_ID: "testmerchant",
    CYBERSOURCE_API_KEY_ID: "keyid123",
    CYBERSOURCE_SHARED_SECRET_KEY: Buffer.from("supersecretkey").toString("base64"),
    CYBERSOURCE_ENVIRONMENT: "test",
  };

  beforeEach(() => setEnv(credentials));
  afterEach(() => {
    setEnv(Object.fromEntries(Object.keys(credentials).map((k) => [k, undefined])));
    vi.restoreAllMocks();
  });

  it("returns ok:true with paymentId on HTTP 201", async () => {
    const fakeResponse = {
      id: "7123456789012345678901",
      status: "AUTHORIZED",
    };
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(fakeResponse), { status: 201 }),
    );

    const result = await authorizeAndCapture({
      transientTokenJwt: "fake.transient.token",
      totalAmount: "25.00",
      currency: "USD",
      orderId: "order-123",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.paymentId).toBe("7123456789012345678901");
      expect(result.status).toBe("AUTHORIZED");
    }
  });

  it("returns ok:false when card is declined (HTTP 402)", async () => {
    const fakeDecline = {
      id: "decline-id",
      status: "DECLINED",
      errorInformation: {
        reason: "INSUFFICIENT_FUND",
        message: "Insufficient funds in the account",
      },
    };
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(fakeDecline), { status: 402 }),
    );

    const result = await authorizeAndCapture({
      transientTokenJwt: "fake.transient.token",
      totalAmount: "25.00",
      currency: "USD",
      orderId: "order-123",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Insufficient funds");
      expect(result.declineCode).toBe("INSUFFICIENT_FUND");
    }
  });

  it("returns ok:false on network error", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("Network failure"));

    const result = await authorizeAndCapture({
      transientTokenJwt: "fake.transient.token",
      totalAmount: "25.00",
      currency: "USD",
      orderId: "order-123",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Network failure");
    }
  });

  it("sends billing details in the payload", async () => {
    let capturedBody = "";
    vi.spyOn(global, "fetch").mockImplementationOnce(async (_url, init) => {
      capturedBody = (init?.body as string) ?? "";
      return new Response(JSON.stringify({ id: "pay-id", status: "AUTHORIZED" }), { status: 201 });
    });

    await authorizeAndCapture({
      transientTokenJwt: "token",
      totalAmount: "30.00",
      currency: "USD",
      orderId: "ord-456",
      billingDetails: {
        firstName: "Alice",
        lastName: "Smith",
        email: "alice@example.com",
      },
    });

    const body = JSON.parse(capturedBody);
    expect(body.orderInformation.billTo.firstName).toBe("Alice");
    expect(body.orderInformation.billTo.email).toBe("alice@example.com");
    expect(body.processingInformation.capture).toBe(true);
    expect(body.clientReferenceInformation.code).toBe("ord-456");
  });

  it("falls back to defaults when billingDetails is omitted", async () => {
    let capturedBody = "";
    vi.spyOn(global, "fetch").mockImplementationOnce(async (_url, init) => {
      capturedBody = (init?.body as string) ?? "";
      return new Response(JSON.stringify({ id: "pay-id", status: "AUTHORIZED" }), { status: 201 });
    });

    await authorizeAndCapture({
      transientTokenJwt: "token",
      totalAmount: "30.00",
      currency: "USD",
      orderId: "ord-789",
    });

    const body = JSON.parse(capturedBody);
    expect(body.orderInformation.billTo.country).toBe("LB");
  });

  it("includes the Signature header in the request", async () => {
    const capturedHeaders: Record<string, string> = {};
    vi.spyOn(global, "fetch").mockImplementationOnce(async (_url, init) => {
      const h = init?.headers as Record<string, string>;
      Object.assign(capturedHeaders, h);
      return new Response(JSON.stringify({ id: "pay-id", status: "AUTHORIZED" }), { status: 201 });
    });

    await authorizeAndCapture({
      transientTokenJwt: "token",
      totalAmount: "10.00",
      currency: "USD",
      orderId: "ord-sig",
    });

    expect(capturedHeaders["Authorization"]).toBeDefined();
    expect(capturedHeaders["Authorization"]).toMatch(/^Signature /);
    expect(capturedHeaders["Authorization"]).toContain('algorithm="HmacSHA256"');
    expect(capturedHeaders["Digest"]).toMatch(/^SHA-256=/);
  });
});
