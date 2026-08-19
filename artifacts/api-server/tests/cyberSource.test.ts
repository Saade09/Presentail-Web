/**
 * Unit tests for the CyberSource UC backend integration.
 *
 * Coverage:
 *   - Routing gate (USD+LB passes; non-USD fails; non-LB fails; private-IP fails;
 *     both wrong returns wrong-currency-and-country)
 *   - HTTP Signature header generation (structure, digest, GET vs POST, key change)
 *   - POST /payment/cybersource/capture-context
 *       · gate block (non-LB, non-USD)
 *       · raw JWT forwarded verbatim (not JSON-wrapped)
 *       · country:LB included in request body
 *       · 502 on CyberSource API error
 *   - POST /payment/cybersource/authorize
 *       · gate block
 *       · 400 on missing transientToken / orderId / items
 *       · server-side cart resolution (catalog mock, total forwarded to CS)
 *       · intent stored with full snapshot on AUTHORIZED
 *       · AUTHORIZED_PENDING_REVIEW accepted
 *       · DECLINED → 402 (no intent stored)
 *       · PENDING_AUTHENTICATION → 200 { pending3DS:true, stepUpUrl } (no intent stored; snapshot stored for validation)
 *       · non-2xx CS response → 502
 *   - GET /admin/cybersource/config-check
 *       · 401 without / with wrong token
 *       · env-var masking, resolvedBaseUrl, environment
 */

import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — declared before any route imports
// ---------------------------------------------------------------------------

vi.mock("../src/lib/geoCurrency", () => ({
  pickClientIp: vi.fn((_xff: unknown, fallback: string) => fallback),
  resolveGeoCurrency: vi.fn(),
  isPrivateOrLoopback: vi.fn(() => false),
}));

vi.mock("../src/lib/checkoutIntents", () => ({
  storePaymentIntent: vi.fn(),
}));

// Catalog mock — resolveCartItems returns a controlled subtotal.
vi.mock("../src/lib/catalog", () => ({
  resolveCartItems: vi.fn(),
  checkSubmittedSlotBookable: vi.fn(() => ({ bookable: true })),
  computeDistrictFeeUsd: vi.fn(() => 5),
  computeSlotFeeUsd: vi.fn(() => 0),
  countryForDistrict: vi.fn(() => "LB"),
  expressSurchargeUsd: vi.fn(() => 3),
  DISTRICT_FEES: {},
}));

vi.mock("../src/lib/osLocationsCache", () => ({
  resolveOsDeliveryConfig: vi.fn(() => null),
}));

vi.mock("../src/lib/wooStore", () => ({
  resolveStoreFromRequest: vi.fn(() => ({
    storeKey: "lebanon",
    baseUrl: "https://store.example.com",
  })),
}));

vi.mock("../src/lib/couponValidation", () => ({
  validateCoupon: vi.fn().mockResolvedValue({ valid: false, error: "not_found" }),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import {
  pickClientIp,
  resolveGeoCurrency,
} from "../src/lib/geoCurrency";
import { storePaymentIntent } from "../src/lib/checkoutIntents";
import {
  checkSubmittedSlotBookable,
  resolveCartItems,
} from "../src/lib/catalog";
import { validateCoupon } from "../src/lib/couponValidation";
import {
  signCyberSourceRequest,
  isCyberSourceRoute,
  CS_AUTHORIZED_STATUSES,
} from "../src/lib/cyberSource";

const mockResolveGeoCurrency = resolveGeoCurrency as ReturnType<typeof vi.fn>;
const mockPickClientIp = pickClientIp as ReturnType<typeof vi.fn>;
const mockResolveCartItems = resolveCartItems as ReturnType<typeof vi.fn>;
const mockCheckSubmittedSlotBookable =
  checkSubmittedSlotBookable as ReturnType<typeof vi.fn>;
const mockValidateCoupon = validateCoupon as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function buildApp(): Promise<Express> {
  const { default: cyberSourceRouter } = await import("../src/routes/cyberSource");
  const app = express();
  // Mirror the production middleware order from app.ts: urlencoded BEFORE json,
  // both BEFORE the router. This exercises the same body-parsing path that the
  // deployed API server uses and catches any double-parse issues.
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as Record<string, unknown>).log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    next();
  });
  app.use(cyberSourceRouter);
  return app;
}

function mockLebanonGeo() {
  mockResolveGeoCurrency.mockResolvedValue({
    countryCode: "LB",
    currencyCode: "USD",
    source: "lookup",
  });
}

function mockUaeGeo() {
  mockResolveGeoCurrency.mockResolvedValue({
    countryCode: "AE",
    currencyCode: "AED",
    source: "lookup",
  });
}

function mockPrivateIpGeo() {
  mockResolveGeoCurrency.mockResolvedValue({
    countryCode: null,
    currencyCode: "USD",
    source: "private-ip",
  });
  mockPickClientIp.mockReturnValue("127.0.0.1");
}

/** Default cart mock: one item worth $50, resolves successfully. */
function mockCatalogOk(subtotalUsd = 50) {
  mockResolveCartItems.mockResolvedValue({
    ok: true,
    subtotalUsd,
    items: [{ wcId: 123, osSlug: "bear-123", quantity: 1, priceUsd: subtotalUsd }],
  });
}

const TEST_SECRET_B64 = Buffer.from("test_secret_key_32bytes_padding_!").toString("base64");

function setCsEnv() {
  process.env.CYBERSOURCE_MERCHANT_ID = "test_merchant";
  process.env.CYBERSOURCE_API_KEY_ID = "test_key_id";
  process.env.CYBERSOURCE_SHARED_SECRET_KEY = TEST_SECRET_B64;
  process.env.CYBERSOURCE_BASE_URL_TEST = "https://apitest.cybersource.com";
  process.env.CYBERSOURCE_ENV = "test";
  process.env.CYBERSOURCE_ALLOWED_ORIGINS = "https://presentail.com";
}

function clearCsEnv() {
  delete process.env.CYBERSOURCE_MERCHANT_ID;
  delete process.env.CYBERSOURCE_API_KEY_ID;
  delete process.env.CYBERSOURCE_SHARED_SECRET_KEY;
  delete process.env.CYBERSOURCE_BASE_URL_TEST;
  delete process.env.CYBERSOURCE_BASE_URL_PROD;
  delete process.env.CYBERSOURCE_ENV;
  delete process.env.CYBERSOURCE_ALLOWED_ORIGINS;
  delete process.env.PUSH_ADMIN_TOKEN;
}

const SAMPLE_ITEMS = [{ wcId: 123, quantity: 1 }];

// ---------------------------------------------------------------------------
// CS_AUTHORIZED_STATUSES
// ---------------------------------------------------------------------------

describe("CS_AUTHORIZED_STATUSES", () => {
  it("accepts AUTHORIZED and AUTHORIZED_PENDING_REVIEW only", () => {
    expect(CS_AUTHORIZED_STATUSES.has("AUTHORIZED")).toBe(true);
    expect(CS_AUTHORIZED_STATUSES.has("AUTHORIZED_PENDING_REVIEW")).toBe(true);
    expect(CS_AUTHORIZED_STATUSES.has("DECLINED")).toBe(false);
    expect(CS_AUTHORIZED_STATUSES.has("PENDING_AUTHENTICATION")).toBe(false);
    expect(CS_AUTHORIZED_STATUSES.has("INVALID_REQUEST")).toBe(false);
    expect(CS_AUTHORIZED_STATUSES.has("UNKNOWN")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Routing gate — isCyberSourceRoute
// ---------------------------------------------------------------------------

describe("isCyberSourceRoute", () => {
  beforeEach(() => {
    mockPickClientIp.mockReturnValue("1.2.3.4");
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("eligible=true for LB IP + USD", async () => {
    mockLebanonGeo();
    const fakeReq = { headers: {}, ip: "1.2.3.4" } as unknown as import("express").Request;
    const result = await isCyberSourceRoute(fakeReq, "USD");
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe("eligible");
    expect(result.countryCode).toBe("LB");
  });

  it("eligible=false when currency is not USD (LB IP)", async () => {
    mockResolveGeoCurrency.mockResolvedValue({ countryCode: "LB", currencyCode: "USD", source: "lookup" });
    const fakeReq = { headers: {}, ip: "1.2.3.4" } as unknown as import("express").Request;
    const result = await isCyberSourceRoute(fakeReq, "EUR");
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("wrong-currency");
  });

  it("eligible=false when IP is not LB (USD currency)", async () => {
    mockUaeGeo();
    const fakeReq = { headers: {}, ip: "1.2.3.4" } as unknown as import("express").Request;
    const result = await isCyberSourceRoute(fakeReq, "USD");
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("wrong-country");
  });

  it("eligible=false for private IP regardless of currency", async () => {
    mockPrivateIpGeo();
    const fakeReq = { headers: {}, ip: "127.0.0.1" } as unknown as import("express").Request;
    const result = await isCyberSourceRoute(fakeReq, "USD");
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("private-ip");
    expect(result.countryCode).toBeNull();
  });

  it("eligible=false with reason wrong-currency-and-country when both fail", async () => {
    mockUaeGeo();
    const fakeReq = { headers: {}, ip: "1.2.3.4" } as unknown as import("express").Request;
    const result = await isCyberSourceRoute(fakeReq, "EUR");
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("wrong-currency-and-country");
  });
});

// ---------------------------------------------------------------------------
// HTTP Signature header generation
// ---------------------------------------------------------------------------

describe("signCyberSourceRequest", () => {
  const baseConfig = {
    merchantId: "test_merchant",
    apiKeyId: "test_key",
    sharedSecretKey: Buffer.from("secret").toString("base64"),
    baseUrl: "https://apitest.cybersource.com",
    environment: "test" as const,
  };

  it("returns Host, Date, Signature, Digest and v-c-merchant-id for POST", () => {
    const headers = signCyberSourceRequest("POST", "/pts/v2/payments", JSON.stringify({ foo: "bar" }), baseConfig);
    expect(headers).toHaveProperty("Host");
    expect(headers).toHaveProperty("Date");
    expect(headers).toHaveProperty("Signature");
    expect(headers).toHaveProperty("Digest");
    expect(headers).toHaveProperty("v-c-merchant-id", "test_merchant");
  });

  it("omits Digest for GET and Signature does not include 'digest'", () => {
    const headers = signCyberSourceRequest("GET", "/pts/v2/payments", null, baseConfig);
    expect(headers).not.toHaveProperty("Digest");
    expect(headers.Signature).not.toContain("digest");
  });

  it("Signature contains keyid, algorithm, headers, signature fields", () => {
    const config = { ...baseConfig, apiKeyId: "key_id_xyz" };
    const headers = signCyberSourceRequest("POST", "/up/v1/capture-contexts", "{}", config);
    expect(headers.Signature).toContain('keyid="key_id_xyz"');
    expect(headers.Signature).toContain('algorithm="HmacSHA256"');
    expect(headers.Signature).toContain("headers=");
    expect(headers.Signature).toContain("signature=");
  });

  it("Digest is SHA-256= + base64(body)", () => {
    const { createHash } = require("node:crypto");
    const body = JSON.stringify({ amount: "50.00" });
    const expected = "SHA-256=" + createHash("sha256").update(body).digest("base64");
    const headers = signCyberSourceRequest("POST", "/some/path", body, baseConfig);
    expect(headers.Digest).toBe(expected);
  });

  it("Signature changes when body changes", () => {
    const h1 = signCyberSourceRequest("POST", "/path", '{"amount":"10"}', baseConfig);
    const h2 = signCyberSourceRequest("POST", "/path", '{"amount":"99"}', baseConfig);
    expect(h1.Signature).not.toBe(h2.Signature);
    expect(h1.Digest).not.toBe(h2.Digest);
  });
});

// ---------------------------------------------------------------------------
// POST /payment/cybersource/capture-context
// ---------------------------------------------------------------------------

describe("POST /payment/cybersource/capture-context", () => {
  let app: Express;

  beforeEach(async () => {
    setCsEnv();
    mockPickClientIp.mockReturnValue("1.2.3.4");
    app = await buildApp();
  });

  afterEach(() => {
    clearCsEnv();
    vi.resetAllMocks();
  });

  it("returns 403 when the routing gate blocks (non-LB IP)", async () => {
    mockUaeGeo();
    const res = await request(app).post("/payment/cybersource/capture-context").send({ currency: "USD", amount: 50 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("cybersource_not_available");
  });

  it("returns 403 when currency is not USD", async () => {
    mockLebanonGeo();
    const res = await request(app).post("/payment/cybersource/capture-context").send({ currency: "EUR", amount: 50 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("cybersource_not_available");
  });

  it("returns the raw JWT string as captureContext (plain-text JWT, not JSON-wrapped)", async () => {
    mockLebanonGeo();
    const rawJwt =
      "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InoyeHN6b2VkIn0." +
      "eyJmbHgiOnsicGF0aCI6Ii9mbGV4L3YyL3Rva2VucyJ9fQ." +
      "SIGNATURE";

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      status: 200,
      text: async () => rawJwt,
    } as unknown as Response);

    const res = await request(app).post("/payment/cybersource/capture-context").send({ currency: "USD", amount: 50 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // Must be the raw JWT string, not wrapped or parsed.
    expect(res.body.captureContext).toBe(rawJwt);
  });

  it("includes country:LB in the body sent to CyberSource", async () => {
    mockLebanonGeo();
    let capturedBody: Record<string, unknown> = {};
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (_url, init) => {
      capturedBody = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
      return { status: 200, text: async () => "fake-jwt" } as unknown as Response;
    });

    await request(app).post("/payment/cybersource/capture-context").send({ currency: "USD", amount: 30 });

    // country is required at the ROOT of the capture-contexts body ($.country),
    // not inside orderInformation.amountDetails. CyberSource 400s if it is absent.
    expect(capturedBody.country).toBe("LB");
    const details = capturedBody.orderInformation as Record<string, unknown> | undefined;
    const amountDetails = details?.amountDetails as Record<string, unknown> | undefined;
    expect(amountDetails?.currency).toBe("USD");
  });

  it("returns 502 when the CyberSource API returns a non-2xx status", async () => {
    mockLebanonGeo();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      status: 400,
      text: async () => JSON.stringify({ reason: "INVALID_DATA", message: "Bad request" }),
    } as unknown as Response);

    const res = await request(app).post("/payment/cybersource/capture-context").send({ currency: "USD", amount: 50 });
    expect(res.status).toBe(502);
    expect(res.body.code).toBe("cybersource_error");
  });
});

// ---------------------------------------------------------------------------
// POST /payment/cybersource/authorize
// ---------------------------------------------------------------------------

describe("POST /payment/cybersource/authorize", () => {
  let app: Express;

  beforeEach(async () => {
    setCsEnv();
    mockPickClientIp.mockReturnValue("1.2.3.4");
    mockCatalogOk();
    mockCheckSubmittedSlotBookable.mockReturnValue({ bookable: true });
    app = await buildApp();
  });

  afterEach(() => {
    clearCsEnv();
    vi.resetAllMocks();
  });

  it("returns 403 when the routing gate blocks", async () => {
    mockUaeGeo();
    const res = await request(app)
      .post("/payment/cybersource/authorize")
      .send({ transientToken: "tok_test", orderId: "order-123", currency: "USD", items: SAMPLE_ITEMS });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("cybersource_not_available");
  });

  it("returns 400 when transientToken is missing", async () => {
    mockLebanonGeo();
    const res = await request(app)
      .post("/payment/cybersource/authorize")
      .send({ orderId: "order-123", currency: "USD", items: SAMPLE_ITEMS });
    expect(res.status).toBe(400);
  });

  it("returns 400 when orderId is missing", async () => {
    mockLebanonGeo();
    const res = await request(app)
      .post("/payment/cybersource/authorize")
      .send({ transientToken: "tok_test", currency: "USD", items: SAMPLE_ITEMS });
    expect(res.status).toBe(400);
  });

  it("returns 400 when items is missing", async () => {
    mockLebanonGeo();
    const res = await request(app)
      .post("/payment/cybersource/authorize")
      .send({ transientToken: "tok_test", orderId: "order-123", currency: "USD" });
    expect(res.status).toBe(400);
  });

  it("rejects an unavailable exact slot before contacting CyberSource", async () => {
    mockLebanonGeo();
    mockCheckSubmittedSlotBookable.mockReturnValue({
      bookable: false,
      reason: "slot_unavailable",
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await request(app)
      .post("/payment/cybersource/authorize")
      .send({
        transientToken: "tok_test",
        orderId: "order-midnight-stale",
        currency: "USD",
        items: SAMPLE_ITEMS,
        district: "Beirut",
        cityId: "lb-beirut",
        deliveryDate: "2026-08-20",
        deliverySlot: "11 PM – 1 AM",
        deliverySlotId: "missing-midnight-slot",
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("expired_delivery_slot");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("resolves the amount server-side and forwards it to CyberSource (not client-supplied)", async () => {
    mockLebanonGeo();
    // Catalog: subtotal $100
    mockResolveCartItems.mockResolvedValue({
      ok: true,
      subtotalUsd: 100,
      items: [{ wcId: 1, osSlug: "bear-1", quantity: 1, priceUsd: 100 }],
    });

    let capturedBody: Record<string, unknown> = {};
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (_url, init) => {
      capturedBody = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
      return {
        status: 201,
        text: async () => JSON.stringify({ id: "cs_amt_test", status: "AUTHORIZED" }),
      } as unknown as Response;
    });

    await request(app).post("/payment/cybersource/authorize").send({
      transientToken: "tok_xyz",
      orderId: "order-amt",
      currency: "USD",
      items: [{ wcId: 1, quantity: 1 }],
      // Client sends wrong amount — server must ignore it.
      amount: 999,
    });

    // computeDistrictFeeUsd returns 5 (mocked above) + expressSurchargeUsd=3 is not called
    // since expressDelivery is false. So totalUsd = 100 + 5 + 0 + 0 = 105.
    const amountSent = capturedBody.orderInformation as Record<string, unknown> | undefined;
    const details = amountSent?.amountDetails as Record<string, unknown> | undefined;
    expect(details?.totalAmount).toBe("105.00");
    // Must NOT be the client-supplied 999.
    expect(details?.totalAmount).not.toBe("999.00");
  });

  it("requests capture:true for immediate settlement", async () => {
    mockLebanonGeo();
    let capturedBody: Record<string, unknown> = {};
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (_url, init) => {
      capturedBody = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
      return {
        status: 201,
        text: async () => JSON.stringify({ id: "cs_cap", status: "AUTHORIZED" }),
      } as unknown as Response;
    });

    await request(app).post("/payment/cybersource/authorize").send({
      transientToken: "tok",
      orderId: "order-cap",
      currency: "USD",
      items: SAMPLE_ITEMS,
    });

    const procInfo = capturedBody.processingInformation as Record<string, unknown> | undefined;
    expect(procInfo?.capture).toBe(true);
  });

  it("stores a payment intent with full cart snapshot on AUTHORIZED", async () => {
    mockLebanonGeo();
    (storePaymentIntent as ReturnType<typeof vi.fn>).mockClear();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      status: 201,
      text: async () => JSON.stringify({ id: "cs_payment_id_abc", status: "AUTHORIZED" }),
    } as unknown as Response);

    const res = await request(app).post("/payment/cybersource/authorize").send({
      transientToken: "tok_transient_xyz",
      orderId: "order-999",
      currency: "USD",
      items: SAMPLE_ITEMS,
      district: "Beirut",
      threeDSAuthData: { cavv: "AAABCSIIAAAAAAACcwgAEMCoNh==", eci: "05" },
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.paymentRef).toBe("cs_payment_id_abc");
    expect(res.body.status).toBe("AUTHORIZED");

    const mockStore = storePaymentIntent as ReturnType<typeof vi.fn>;
    expect(mockStore).toHaveBeenCalledOnce();
    const stored = mockStore.mock.calls[0][0] as {
      orderId: string;
      paymentRef: string;
      provider: string;
      currency: string;
      snapshot: { items: unknown[]; district: string };
      paymentMeta: Record<string, unknown>;
    };
    expect(stored.orderId).toBe("order-999");
    expect(stored.paymentRef).toBe("cs_payment_id_abc");
    expect(stored.provider).toBe("cybersource");
    expect(stored.currency).toBe("USD");
    // Snapshot must contain the catalog-resolved items (not empty).
    expect(stored.snapshot.items.length).toBeGreaterThan(0);
    expect(stored.snapshot.district).toBe("Beirut");
    expect(stored.paymentMeta.csStatus).toBe("AUTHORIZED");
  });

  it("accepts AUTHORIZED_PENDING_REVIEW as a successful authorization", async () => {
    mockLebanonGeo();
    (storePaymentIntent as ReturnType<typeof vi.fn>).mockClear();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      status: 201,
      text: async () =>
        JSON.stringify({ id: "cs_pending_review", status: "AUTHORIZED_PENDING_REVIEW" }),
    } as unknown as Response);

    const res = await request(app).post("/payment/cybersource/authorize").send({
      transientToken: "tok_test",
      orderId: "order-review",
      currency: "USD",
      items: SAMPLE_ITEMS,
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("AUTHORIZED_PENDING_REVIEW");
    expect(storePaymentIntent).toHaveBeenCalledOnce();
  });

  it("returns 402 and does NOT store intent when CyberSource returns DECLINED (even on 2xx)", async () => {
    mockLebanonGeo();
    (storePaymentIntent as ReturnType<typeof vi.fn>).mockClear();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      status: 201,
      text: async () => JSON.stringify({ id: "cs_declined", status: "DECLINED" }),
    } as unknown as Response);

    const res = await request(app).post("/payment/cybersource/authorize").send({
      transientToken: "tok_declined",
      orderId: "order-declined",
      currency: "USD",
      items: SAMPLE_ITEMS,
    });

    expect(res.status).toBe(402);
    expect(res.body.code).toBe("cybersource_not_authorized");
    expect(res.body.csStatus).toBe("DECLINED");
    expect(storePaymentIntent).not.toHaveBeenCalled();
  });

  it("returns pending3DS=true with stepUpUrl when CyberSource returns PENDING_AUTHENTICATION (3DS challenge required)", async () => {
    mockLebanonGeo();
    (storePaymentIntent as ReturnType<typeof vi.fn>).mockClear();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      status: 201,
      text: async () =>
        JSON.stringify({
          id: "cs_3ds_required",
          status: "PENDING_AUTHENTICATION",
          consumerAuthenticationInformation: {
            stepUpUrl: "https://acs.example.com/challenge",
            accessToken: "eyJstepup.jwt.token",
          },
        }),
    } as unknown as Response);

    const res = await request(app).post("/payment/cybersource/authorize").send({
      transientToken: "tok_3ds",
      orderId: "order-3ds",
      currency: "USD",
      items: SAMPLE_ITEMS,
    });

    // Must NOT be 402 — PENDING_AUTHENTICATION is a challenge signal, not a rejection.
    expect(res.status).toBe(200);
    expect(res.body.pending3DS).toBe(true);
    expect(res.body.csStatus).toBe("PENDING_AUTHENTICATION");
    expect(res.body.stepUpUrl).toBe("https://acs.example.com/challenge");
    expect(res.body.accessToken).toBe("eyJstepup.jwt.token");
    // No intent stored — money has not moved yet.
    expect(storePaymentIntent).not.toHaveBeenCalled();
  });

  it("validation call (with authenticationTransactionId) sends payerAuthValidateService.run=true", async () => {
    mockLebanonGeo();
    let capturedBody: Record<string, unknown> = {};

    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (_url, init) => {
      capturedBody = init?.body
        ? (JSON.parse(init.body as string) as Record<string, unknown>)
        : {};
      return {
        status: 201,
        text: async () => JSON.stringify({ id: "cs_validated", status: "AUTHORIZED" }),
      } as unknown as Response;
    });

    const res = await request(app).post("/payment/cybersource/authorize").send({
      transientToken: "tok_validate",
      orderId: "order-validate",
      currency: "USD",
      items: SAMPLE_ITEMS,
      threeDSAuthData: {
        authenticationTransactionId: "tid_from_acs_challenge_123",
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Server must have sent payerAuthValidateService.run="true"
    const validateService = capturedBody.payerAuthValidateService as
      | Record<string, unknown>
      | undefined;
    expect(validateService?.run).toBe("true");

    // authenticationTransactionId must be in consumerAuthenticationInformation
    const csAuthInfo = capturedBody.consumerAuthenticationInformation as
      | Record<string, unknown>
      | undefined;
    expect(csAuthInfo?.authenticationTransactionId).toBe(
      "tid_from_acs_challenge_123",
    );

    // payerAuthEnrollService must NOT be present on the validation call
    expect(capturedBody.payerAuthEnrollService).toBeUndefined();
  });

  it("enrollment call (first call, no authTransactionId) sends payerAuthEnrollService.run=true", async () => {
    mockLebanonGeo();
    let capturedBody: Record<string, unknown> = {};

    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (_url, init) => {
      capturedBody = init?.body
        ? (JSON.parse(init.body as string) as Record<string, unknown>)
        : {};
      return {
        status: 201,
        text: async () => JSON.stringify({ id: "cs_auth", status: "AUTHORIZED" }),
      } as unknown as Response;
    });

    await request(app).post("/payment/cybersource/authorize").send({
      transientToken: "tok_enroll",
      orderId: "order-enroll",
      currency: "USD",
      items: SAMPLE_ITEMS,
    });

    const enrollService = capturedBody.payerAuthEnrollService as
      | Record<string, unknown>
      | undefined;
    expect(enrollService?.run).toBe("true");
    expect(capturedBody.payerAuthValidateService).toBeUndefined();

    // paReturnUrl must be constructed server-side from CYBERSOURCE_ALLOWED_ORIGINS
    // (never from the client). Verify it points to our own 3ds-return endpoint.
    const csAuthInfo = capturedBody.consumerAuthenticationInformation as
      | Record<string, unknown>
      | undefined;
    expect(typeof csAuthInfo?.returnUrl).toBe("string");
    expect((csAuthInfo?.returnUrl as string)).toContain("/api/payment/cybersource/3ds-return");
  });

  it("coupon validation uses full cart total (subtotal + fees) not just subtotal", async () => {
    mockLebanonGeo();
    // subtotal = 50, districtFee = 5 (mocked), so preTaxUsd = 55
    // A 10%-off coupon on 55 = $5.50 discount; charged total should be $49.50
    mockCatalogOk(50);
    mockValidateCoupon.mockResolvedValueOnce({
      valid: true,
      couponId: "SAVE10",
      discountType: "percent",
      discountValue: 10,
      discountAmountUsd: 5.5, // 10% of preTaxUsd (55), not subtotalUsd (50)
      finalTotalUsd: 49.5,
    });

    let capturedBody: Record<string, unknown> = {};
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (_url, init) => {
      capturedBody = init?.body
        ? (JSON.parse(init.body as string) as Record<string, unknown>)
        : {};
      return {
        status: 201,
        text: async () => JSON.stringify({ id: "cs_coupon", status: "AUTHORIZED" }),
      } as unknown as Response;
    });

    await request(app).post("/payment/cybersource/authorize").send({
      transientToken: "tok_coupon",
      orderId: "order-coupon",
      currency: "USD",
      items: SAMPLE_ITEMS,
      couponCode: "SAVE10",
      customerEmail: "buyer@example.com",
    });

    // Check the cartTotalUsd passed to validateCoupon includes delivery fees (= 55, not 50).
    // districtFee = 5 (mocked via computeDistrictFeeUsd), so preTaxUsd = 50 + 5 = 55.
    const callArgs = mockValidateCoupon.mock.calls[0] as [
      string,
      { cartTotalUsd: number },
    ];
    expect(callArgs[1].cartTotalUsd).toBe(55);

    // The charged amount must reflect the coupon discount: 55 - 5.50 = 49.50
    const amountDetails = (
      capturedBody.orderInformation as Record<string, unknown> | undefined
    )?.amountDetails as Record<string, unknown> | undefined;
    expect(amountDetails?.totalAmount).toBe("49.50");
  });

  it("stores an enrollment snapshot when PENDING_AUTHENTICATION and reuses it on validation call (no catalog re-resolution)", async () => {
    // Enrollment call: PENDING_AUTHENTICATION
    mockLebanonGeo();

    let enrollCapturedBody: Record<string, unknown> = {};
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (_url, init) => {
      enrollCapturedBody = init?.body
        ? (JSON.parse(init.body as string) as Record<string, unknown>)
        : {};
      return {
        status: 201,
        text: async () =>
          JSON.stringify({
            id: "cs_pend",
            status: "PENDING_AUTHENTICATION",
            consumerAuthenticationInformation: {
              stepUpUrl: "https://acs.issuer.com/step-up",
              accessToken: "acs.access.token",
            },
          }),
      } as unknown as Response;
    });

    const enrollRes = await request(app).post("/payment/cybersource/authorize").send({
      transientToken: "tok_snap_enroll",
      orderId: "order-snap-test",
      currency: "USD",
      items: SAMPLE_ITEMS,
    });
    expect(enrollRes.status).toBe(200);
    expect(enrollRes.body.pending3DS).toBe(true);

    const enrollAmount = (
      (enrollCapturedBody.orderInformation as Record<string, unknown> | undefined)
        ?.amountDetails as Record<string, unknown> | undefined
    )?.totalAmount as string;

    // Validation call: use authenticationTransactionId.
    // mockResolveCartItems should NOT be called again — snapshot reuse skips catalog.
    mockResolveCartItems.mockClear();

    let validationCapturedBody: Record<string, unknown> = {};
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (_url, init) => {
      validationCapturedBody = init?.body
        ? (JSON.parse(init.body as string) as Record<string, unknown>)
        : {};
      return {
        status: 201,
        text: async () => JSON.stringify({ id: "cs_validated_snap", status: "AUTHORIZED" }),
      } as unknown as Response;
    });

    const validRes = await request(app).post("/payment/cybersource/authorize").send({
      transientToken: "tok_snap_validate",
      orderId: "order-snap-test", // same orderId — snapshot lookup key
      currency: "USD",
      items: SAMPLE_ITEMS,
      threeDSAuthData: { authenticationTransactionId: "acs_tid_snap_99" },
    });
    expect(validRes.status).toBe(200);
    expect(validRes.body.ok).toBe(true);

    // Catalog resolution must NOT have been called on the validation leg.
    expect(mockResolveCartItems).not.toHaveBeenCalled();

    // The amount sent to CS on the validation call must exactly match enrollment.
    const validAmount = (
      (validationCapturedBody.orderInformation as Record<string, unknown> | undefined)
        ?.amountDetails as Record<string, unknown> | undefined
    )?.totalAmount as string;
    expect(validAmount).toBe(enrollAmount);
  });

  it("uses CYBERSOURCE_3DS_RETURN_URL env var as paReturnUrl when set", async () => {
    process.env.CYBERSOURCE_3DS_RETURN_URL =
      "https://api.presentail.com/api/payment/cybersource/3ds-return";

    mockLebanonGeo();
    let capturedBody: Record<string, unknown> = {};
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (_url, init) => {
      capturedBody = init?.body
        ? (JSON.parse(init.body as string) as Record<string, unknown>)
        : {};
      return {
        status: 201,
        text: async () => JSON.stringify({ id: "cs_ret_url", status: "AUTHORIZED" }),
      } as unknown as Response;
    });

    await request(app).post("/payment/cybersource/authorize").send({
      transientToken: "tok_ret_url",
      orderId: "order-ret-url",
      currency: "USD",
      items: SAMPLE_ITEMS,
    });

    const csAuthInfo = capturedBody.consumerAuthenticationInformation as
      | Record<string, unknown>
      | undefined;
    // Must use CYBERSOURCE_3DS_RETURN_URL exactly, not a derived URL.
    expect(csAuthInfo?.returnUrl).toBe(
      "https://api.presentail.com/api/payment/cybersource/3ds-return",
    );

    delete process.env.CYBERSOURCE_3DS_RETURN_URL;
  });

  it("returns 502 when CyberSource returns a non-2xx HTTP error", async () => {
    mockLebanonGeo();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      status: 400,
      text: async () => JSON.stringify({ reason: "INVALID_REQUEST", message: "Bad token" }),
    } as unknown as Response);

    const res = await request(app).post("/payment/cybersource/authorize").send({
      transientToken: "tok_bad",
      orderId: "order-bad",
      currency: "USD",
      items: SAMPLE_ITEMS,
    });

    expect(res.status).toBe(502);
    expect(res.body.code).toBe("cybersource_error");
  });

  it("returns 422 when catalog resolution fails", async () => {
    mockLebanonGeo();
    mockResolveCartItems.mockResolvedValue({ ok: false, message: "Product not found" });

    const res = await request(app).post("/payment/cybersource/authorize").send({
      transientToken: "tok_catalog_fail",
      orderId: "order-catalog-fail",
      currency: "USD",
      items: SAMPLE_ITEMS,
    });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("catalog_error");
  });
});

// ---------------------------------------------------------------------------
// POST /payment/cybersource/3ds-return — ACS challenge return endpoint
// ---------------------------------------------------------------------------
//
// These tests use the full app stack (urlencoded + json middleware) to verify
// that req.body is correctly parsed by the global urlencoded parser installed
// in app.ts, not by a second parser inside the route handler.

describe("POST /payment/cybersource/3ds-return", () => {
  let app: Express;

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(() => {
    delete process.env.CYBERSOURCE_ALLOWED_ORIGINS;
    vi.resetAllMocks();
  });

  it("renders an HTML page that postMessages the transactionId to configured origin(s)", async () => {
    process.env.CYBERSOURCE_ALLOWED_ORIGINS = "https://presentail.com";

    const res = await request(app)
      .post("/payment/cybersource/3ds-return")
      .type("form")
      .send({ TransactionId: "ACS_TXN_12345" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);

    const html = res.text;
    // Must contain the transactionId.
    expect(html).toContain("ACS_TXN_12345");
    // Must postMessage to the configured origin — not to '*'.
    expect(html).toContain('"https://presentail.com"');
    expect(html).not.toContain("'*'");
    expect(html).not.toContain('"*"');
    // Must include the cs3dsReturn message type.
    expect(html).toContain("cs3dsReturn");
    // frame-ancestors CSP must be set.
    const csp = res.headers["content-security-policy"] ?? "";
    expect(csp).toContain("frame-ancestors");
    expect(csp).toContain("https://presentail.com");
  });

  it("accepts lowercase transactionId field as a fallback", async () => {
    process.env.CYBERSOURCE_ALLOWED_ORIGINS = "https://presentail.com";

    const res = await request(app)
      .post("/payment/cybersource/3ds-return")
      .type("form")
      .send({ transactionId: "txn_lower_case" });

    expect(res.status).toBe(200);
    expect(res.text).toContain("txn_lower_case");
  });

  it("returns 503 when CYBERSOURCE_ALLOWED_ORIGINS is not configured", async () => {
    // CYBERSOURCE_ALLOWED_ORIGINS not set.
    const res = await request(app)
      .post("/payment/cybersource/3ds-return")
      .type("form")
      .send({ TransactionId: "any_txn" });

    expect(res.status).toBe(503);
  });

  it("emits one postMessage call per allowed origin when multiple are configured", async () => {
    process.env.CYBERSOURCE_ALLOWED_ORIGINS =
      "https://presentail.com,https://www.presentail.com";

    const res = await request(app)
      .post("/payment/cybersource/3ds-return")
      .type("form")
      .send({ TransactionId: "multi_origin_txn" });

    expect(res.status).toBe(200);
    const html = res.text;
    expect(html).toContain('"https://presentail.com"');
    expect(html).toContain('"https://www.presentail.com"');
    expect(html).not.toContain("'*'");
    expect(html).not.toContain('"*"');
  });
});

// ---------------------------------------------------------------------------
// GET /admin/cybersource/config-check
// ---------------------------------------------------------------------------

describe("GET /admin/cybersource/config-check", () => {
  let app: Express;

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(() => {
    clearCsEnv();
    vi.resetAllMocks();
  });

  it("returns 401 when no admin token is provided", async () => {
    process.env.PUSH_ADMIN_TOKEN = "secret_admin_token";
    const res = await request(app).get("/admin/cybersource/config-check");
    expect(res.status).toBe(401);
  });

  it("returns 401 when a wrong admin token is supplied", async () => {
    process.env.PUSH_ADMIN_TOKEN = "secret_admin_token";
    const res = await request(app)
      .get("/admin/cybersource/config-check")
      .set("x-admin-token", "wrong_token");
    expect(res.status).toBe(401);
  });

  it("returns the env-var presence map when authenticated", async () => {
    process.env.PUSH_ADMIN_TOKEN = "secret_admin_token";
    setCsEnv();

    const res = await request(app)
      .get("/admin/cybersource/config-check")
      .set("x-admin-token", "secret_admin_token");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.vars)).toBe(true);

    const vars = res.body.vars as { key: string; present: boolean; value: string }[];

    const merchantId = vars.find((v) => v.key === "CYBERSOURCE_MERCHANT_ID");
    expect(merchantId?.present).toBe(true);
    // Value must be masked — never the actual secret.
    expect(merchantId?.value).toBe("***set***");

    const prodUrl = vars.find((v) => v.key === "CYBERSOURCE_BASE_URL_PROD");
    expect(prodUrl?.present).toBe(false);
    expect(prodUrl?.value).toBe("(missing)");

    expect(res.body.environment).toBe("test");
    expect(res.body.resolvedBaseUrl).toBe("https://apitest.cybersource.com");
  });
});
