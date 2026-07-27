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

  it("sends allowedPaymentTypes as exactly [CARD] — wallet types must never reach /microform/v2/sessions", async () => {
    // Regression guard (2026-07-27): merging GOOGLEPAY/APPLEPAY into the
    // Microform session request made live CyberSource reject every capture
    // context (UNIFIEDPAYMENTS_VALIDATION_FIELDS: possible types [CARD, CHECK]),
    // silently pushing all Lebanon card shoppers to the Stripe fallback.
    let capturedBody = "";
    vi.spyOn(global, "fetch").mockImplementationOnce(async (_url, init) => {
      capturedBody = (init?.body as string) ?? "";
      return new Response("fake.jwt.token", { status: 200 });
    });

    await generateCaptureContext({
      targetOrigins: ["https://presentail.com"],
      totalAmount: "10.00",
      currency: "USD",
    });

    const body = JSON.parse(capturedBody);
    expect(body.allowedPaymentTypes).toEqual(["CARD"]);
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

    // The official SDK sends the auth as a bare "signature:" header
    // (not "Authorization: Signature ..."), and our signing mirrors it.
    expect(capturedHeaders["signature"]).toBeDefined();
    expect(capturedHeaders["signature"]).toMatch(/^keyid="/);
    expect(capturedHeaders["signature"]).toContain('algorithm="HmacSHA256"');
    expect(capturedHeaders["digest"]).toMatch(/^SHA-256=/);
    // Accept must be HAL+JSON for /pts/v2/payments — sending application/jwt
    // there makes CyberSource return HTTP 404 "Resource not found".
    expect(capturedHeaders["Accept"]).toContain("application/hal+json");
  });

  it("classifies HTTP 201 with status DECLINED as a real card decline (kind=decline)", async () => {
    const fakeDecline = {
      id: "decline-id",
      status: "DECLINED",
      errorInformation: { reason: "INSUFFICIENT_FUND", message: "Insufficient funds in the account" },
    };
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(fakeDecline), { status: 201 }),
    );

    const result = await authorizeAndCapture({
      transientTokenJwt: "fake.transient.token",
      totalAmount: "25.00",
      currency: "USD",
      orderId: "order-201-declined",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("decline");
      expect(result.declineCode).toBe("INSUFFICIENT_FUND");
      expect(result.httpStatus).toBe(201);
    }
  });

  it("never treats HTTP 201 with a missing status as paid (kind=gateway, not decline)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "some-request-id" }), { status: 201 }),
    );

    const result = await authorizeAndCapture({
      transientTokenJwt: "fake.transient.token",
      totalAmount: "25.00",
      currency: "USD",
      orderId: "order-201-nostatus",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("gateway");
    }
  });

  it("never treats HTTP 201 with an approved status but missing requestId as paid", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "AUTHORIZED" }), { status: 201 }),
    );

    const result = await authorizeAndCapture({
      transientTokenJwt: "fake.transient.token",
      totalAmount: "25.00",
      currency: "USD",
      orderId: "order-201-noid",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("gateway");
    }
  });

  it("classifies AUTHORIZED_RISK_DECLINED as a decline — the authorisation is reversed, no funds move", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ id: "risk-id", status: "AUTHORIZED_RISK_DECLINED" }),
        { status: 201 },
      ),
    );

    const result = await authorizeAndCapture({
      transientTokenJwt: "fake.transient.token",
      totalAmount: "25.00",
      currency: "USD",
      orderId: "order-201-risk",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("decline");
    }
  });

  it("classifies HTTP 201 with INVALID_REQUEST as validation (our request problem), not a card decline", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ id: "inv-id", status: "INVALID_REQUEST" }),
        { status: 201 },
      ),
    );

    const result = await authorizeAndCapture({
      transientTokenJwt: "fake.transient.token",
      totalAmount: "25.00",
      currency: "USD",
      orderId: "order-201-invalid",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("validation");
    }
  });

  it("classifies HTTP 404 as endpoint error (kind=endpoint), never a decline, and never invents an entitlement claim", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("Resource not found", {
        status: 404,
        headers: { "v-c-correlation-id": "corr-abc-123" },
      }),
    );

    const result = await authorizeAndCapture({
      transientTokenJwt: "fake.transient.token",
      totalAmount: "25.00",
      currency: "USD",
      orderId: "order-404",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("endpoint");
      expect(result.httpStatus).toBe(404);
      expect(result.rawBody).toContain("Resource not found");
      // The message must NOT claim the card was declined.
      expect(result.message.toLowerCase()).not.toContain("declined");
      // The message must NOT claim the merchant account is not enabled —
      // a 404 alone does not prove entitlement failure. It must report the
      // facts: the exact URL and CyberSource's correlation ID.
      expect(result.message.toLowerCase()).not.toContain("not enabled");
      expect(result.message).toContain("/pts/v2/payments");
      expect(result.message).toContain("corr-abc-123");
      // Diagnostics for structured logging.
      expect(result.requestUrl).toMatch(/https:\/\/api(test)?\.cybersource\.com\/pts\/v2\/payments$/);
      expect(result.correlationId).toBe("corr-abc-123");
    }
  });

  it("relays CyberSource's own message on 404 when the response body provides one", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ errorInformation: { message: "Merchant account is not enabled for this service" } }),
        { status: 404, headers: { "v-c-correlation-id": "corr-def-456" } },
      ),
    );

    const result = await authorizeAndCapture({
      transientTokenJwt: "fake.transient.token",
      totalAmount: "25.00",
      currency: "USD",
      orderId: "order-404-upstream-msg",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("endpoint");
      // Upstream stated it — relaying the claim verbatim is allowed here.
      expect(result.message).toBe("Merchant account is not enabled for this service");
    }
  });

  it("classifies HTTP 401 as an authentication failure (kind=auth)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ response: { rmsg: "Authentication Failed" } }), { status: 401 }),
    );

    const result = await authorizeAndCapture({
      transientTokenJwt: "fake.transient.token",
      totalAmount: "25.00",
      currency: "USD",
      orderId: "order-401",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("auth");
      expect(result.httpStatus).toBe(401);
      expect(result.message.toLowerCase()).not.toContain("declined");
    }
  });

  it("classifies HTTP 400 INVALID_DATA as validation (kind=validation)", async () => {
    const fakeError = {
      status: "DECLINED",
      errorInformation: { reason: "INVALID_DATA", message: "Invalid Json Request" },
    };
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(fakeError), { status: 400 }),
    );

    const result = await authorizeAndCapture({
      transientTokenJwt: "fake.transient.token",
      totalAmount: "25.00",
      currency: "USD",
      orderId: "order-400",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("validation");
      expect(result.declineCode).toBe("INVALID_DATA");
    }
  });

  it("classifies a thrown fetch error as kind=network", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("Network failure"));

    const result = await authorizeAndCapture({
      transientTokenJwt: "fake.transient.token",
      totalAmount: "25.00",
      currency: "USD",
      orderId: "order-net",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("network");
    }
  });
});
