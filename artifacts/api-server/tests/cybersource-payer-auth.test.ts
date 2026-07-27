// Tests for CyberSource Payer Authentication endpoints:
//   POST /api/payment/cybersource/payer-auth/setup
//   POST /api/payment/cybersource/payer-auth/check-enrollment
//   POST /api/payment/cybersource/payer-auth/validate
// And extensions to:
//   POST /api/payment/cybersource/charge  (payerAuthData field + pa_required guard)
//   authorizeAndCapture  (consumerAuthenticationInformation when 3DS data provided)
//
// Uses the clerkShim-style mock pattern: pino-http is mocked at the outer
// level (see api-server-test-patterns.md), app.ts is NOT imported, and the
// specific lib modules are mocked via vi.mock.

import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// pino-http mock (must come before any app/route imports)
// ---------------------------------------------------------------------------
vi.mock("pino-http", () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockResolveCartItems = vi.fn();

vi.mock("../src/lib/catalog", () => ({
  resolveCartItems: (...args: any[]) => mockResolveCartItems(...args),
  computeDistrictFeeUsd: vi.fn().mockReturnValue(0),
  computeSlotFeeUsd: vi.fn().mockReturnValue(0),
  expressSurchargeUsd: vi.fn().mockReturnValue(0),
  countryForDistrict: vi.fn().mockReturnValue("LB"),
  DISTRICT_FEES: {},
}));

vi.mock("../src/lib/fx", () => ({
  convertFromUsd: async (usd: number) => usd,
  normalizeCurrency: (v: unknown) =>
    typeof v === "string" && v.length === 3 ? v.toUpperCase() : "USD",
  toStripeMinorUnits: (amount: number) => Math.round(amount * 100),
  roundForCurrency: (amount: number) => amount,
  paypalCurrencyFor: (v: string) => v,
}));

vi.mock("../src/lib/wooStore", () => ({
  resolveStoreFromRequest: vi.fn().mockReturnValue({ baseUrl: "https://store.example.com", storeKey: "lebanon" }),
}));

vi.mock("../src/lib/checkoutIntents", () => ({
  storePaymentIntent: vi.fn(),
  consumePaymentIntent: vi.fn(),
}));

vi.mock("../src/lib/validateRedirectUrl", () => ({
  validateRedirectUrl: vi.fn().mockReturnValue(null),
}));

// Mock cybersource-payer-auth module — each test controls these fns.
const mockSetupPayerAuth = vi.fn();
const mockCheckEnrollment = vi.fn();
const mockValidateAuthentication = vi.fn();
const mockIsPayerAuthEnabled = vi.fn();

vi.mock("../src/lib/cybersource-payer-auth", () => ({
  isPaConfigured: vi.fn().mockReturnValue(true),
  isPayerAuthEnabled: () => mockIsPayerAuthEnabled(),
  setupPayerAuth: (...args: any[]) => mockSetupPayerAuth(...args),
  checkEnrollment: (...args: any[]) => mockCheckEnrollment(...args),
  validateAuthentication: (...args: any[]) => mockValidateAuthentication(...args),
}));

// Mock cybersource core module.
const mockAuthorizeAndCapture = vi.fn();

vi.mock("../src/lib/cybersource", () => ({
  isCybersourceConfigured: vi.fn().mockReturnValue(true),
  getCybersourceMerchantId: vi.fn().mockReturnValue("test_merchant"),
  getCybersourceGooglePayMerchantId: vi.fn().mockReturnValue(""),
  getCybersourceEnvironment: vi.fn().mockReturnValue("test"),
  getCybersourceBase: vi.fn().mockReturnValue("https://apitest.cybersource.com"),
  generateCaptureContext: vi.fn().mockResolvedValue({ ok: false, message: "not needed" }),
  authorizeAndCapture: (...args: any[]) => mockAuthorizeAndCapture(...args),
  authorizeAndCaptureGooglePay: vi.fn(),
  validateApplePayMerchant: vi.fn(),
  authorizeAndCaptureApplePay: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import paymentRouter from "../src/routes/payment";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let app: Express;

function makeApp(): Express {
  const a = express();
  a.use(express.json());
  // Attach a minimal pino-compatible logger so req.log calls in routes don't throw.
  a.use((req, _res, next) => {
    (req as any).log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    next();
  });
  a.use("/api", paymentRouter);
  return a;
}

// Minimal charge body that passes all validations.
const VALID_CHARGE_BODY = {
  orderId: "order-3ds-001",
  transientTokenJwt: "header.payload.signature",
  items: [{ wcId: 42, quantity: 1 }],
};

const VALID_PAYER_AUTH_DATA = {
  cavv: "AAABCIEjZgAAAAAAAAAAAAAAAAA=",
  eciRaw: "05",
  eci: "05",
  xid: "xid-abc123",
  specificationVersion: "2.2.0",
  directoryServerTransactionId: "dsn-txn-001",
  paSpecificationVersion: "2.2.0",
  authenticationTransactionId: "auth-txn-001",
  commerceIndicator: "vbv",
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Default: payer auth disabled (safe default so charge tests work without payerAuthData).
  mockIsPayerAuthEnabled.mockReturnValue(false);

  // Default catalog mock.
  mockResolveCartItems.mockResolvedValue({
    ok: true,
    items: [{ wcId: 42, osSlug: "rose-bouquet", quantity: 1, priceUsd: 50, name: "Rose Bouquet", description: "", image: null }],
    subtotalUsd: 50,
  });

  // Default authorizeAndCapture success.
  mockAuthorizeAndCapture.mockResolvedValue({
    ok: true,
    paymentId: "cs-pay-001",
    status: "AUTHORIZED",
  });

  app = makeApp();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// POST /api/payment/cybersource/payer-auth/setup
// ===========================================================================

describe("POST /api/payment/cybersource/payer-auth/setup", () => {
  it("returns 503 pa_disabled when feature flag is off", async () => {
    mockIsPayerAuthEnabled.mockReturnValue(false);

    const res = await request(app)
      .post("/api/payment/cybersource/payer-auth/setup")
      .send({ transientTokenJwt: "a.b.c", orderId: "order-001" });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("pa_disabled");
    expect(mockSetupPayerAuth).not.toHaveBeenCalled();
  });

  it("returns 400 when transientTokenJwt is missing", async () => {
    mockIsPayerAuthEnabled.mockReturnValue(true);

    const res = await request(app)
      .post("/api/payment/cybersource/payer-auth/setup")
      .send({ orderId: "order-001" });

    expect(res.status).toBe(400);
    expect(mockSetupPayerAuth).not.toHaveBeenCalled();
  });

  it("returns 400 when orderId is missing", async () => {
    mockIsPayerAuthEnabled.mockReturnValue(true);

    const res = await request(app)
      .post("/api/payment/cybersource/payer-auth/setup")
      .send({ transientTokenJwt: "a.b.c" });

    expect(res.status).toBe(400);
    expect(mockSetupPayerAuth).not.toHaveBeenCalled();
  });

  it("returns 200 with setup data on success", async () => {
    mockIsPayerAuthEnabled.mockReturnValue(true);
    mockSetupPayerAuth.mockResolvedValue({
      ok: true,
      accessToken: "access-token-abc",
      deviceDataCollectionUrl: "https://centinelapistag.cardinalcommerce.com/V2/Cruise/StepUp",
      referenceId: "ref-id-123",
    });

    const res = await request(app)
      .post("/api/payment/cybersource/payer-auth/setup")
      .send({ transientTokenJwt: "a.b.c", orderId: "order-001" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.accessToken).toBe("access-token-abc");
    expect(res.body.deviceDataCollectionUrl).toContain("cardinalcommerce.com");
    expect(res.body.referenceId).toBe("ref-id-123");
  });

  it("returns 502 pa_setup_error when setupPayerAuth fails", async () => {
    mockIsPayerAuthEnabled.mockReturnValue(true);
    mockSetupPayerAuth.mockResolvedValue({
      ok: false,
      code: "pa_setup_error",
      message: "CS returned 500",
    });

    const res = await request(app)
      .post("/api/payment/cybersource/payer-auth/setup")
      .send({ transientTokenJwt: "a.b.c", orderId: "order-001" });

    expect(res.status).toBe(502);
    expect(res.body.code).toBe("pa_setup_error");
  });
});

// ===========================================================================
// POST /api/payment/cybersource/payer-auth/check-enrollment
// ===========================================================================

describe("POST /api/payment/cybersource/payer-auth/check-enrollment", () => {
  const ENROLLMENT_BODY = {
    transientTokenJwt: "a.b.c",
    referenceId: "ref-123",
    orderId: "order-002",
    amount: "50.00",
    currency: "USD",
    returnUrl: "https://presentail.com/cs-callback",
  };

  it("returns 503 pa_disabled when feature flag is off", async () => {
    mockIsPayerAuthEnabled.mockReturnValue(false);

    const res = await request(app)
      .post("/api/payment/cybersource/payer-auth/check-enrollment")
      .send(ENROLLMENT_BODY);

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("pa_disabled");
    expect(mockCheckEnrollment).not.toHaveBeenCalled();
  });

  it("returns frictionless result (enrolled: false) when CS returns non-challenge status", async () => {
    mockIsPayerAuthEnabled.mockReturnValue(true);
    mockCheckEnrollment.mockResolvedValue({
      ok: true,
      enrolled: false,
      authenticationTransactionId: "auth-txn-frictionless",
      eci: "05",
      cavv: "AAAB==",
    });

    const res = await request(app)
      .post("/api/payment/cybersource/payer-auth/check-enrollment")
      .send(ENROLLMENT_BODY);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.enrolled).toBe(false);
    expect(res.body.authenticationTransactionId).toBe("auth-txn-frictionless");
    expect(res.body.eci).toBe("05");
    expect(res.body.cavv).toBe("AAAB==");
  });

  it("returns challenge result (enrolled: true) with stepUpUrl", async () => {
    mockIsPayerAuthEnabled.mockReturnValue(true);
    mockCheckEnrollment.mockResolvedValue({
      ok: true,
      enrolled: true,
      stepUpUrl: "https://centinelapistag.cardinalcommerce.com/V2/Cruise/StepUp",
      accessToken: "step-up-token",
      authenticationTransactionId: "auth-txn-challenge",
    });

    const res = await request(app)
      .post("/api/payment/cybersource/payer-auth/check-enrollment")
      .send(ENROLLMENT_BODY);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.enrolled).toBe(true);
    expect(res.body.stepUpUrl).toContain("cardinalcommerce.com");
    expect(res.body.accessToken).toBe("step-up-token");
  });

  it("returns 502 pa_enrollment_error when checkEnrollment fails", async () => {
    mockIsPayerAuthEnabled.mockReturnValue(true);
    mockCheckEnrollment.mockResolvedValue({
      ok: false,
      code: "pa_enrollment_error",
      message: "CS enrollment service returned 503",
    });

    const res = await request(app)
      .post("/api/payment/cybersource/payer-auth/check-enrollment")
      .send(ENROLLMENT_BODY);

    expect(res.status).toBe(502);
    expect(res.body.code).toBe("pa_enrollment_error");
  });

  it("returns 502 pa_enrollment_error for AUTHENTICATION_FAILED status (not treated as frictionless)", async () => {
    mockIsPayerAuthEnabled.mockReturnValue(true);
    mockCheckEnrollment.mockResolvedValue({
      ok: false,
      code: "pa_enrollment_error",
      message: "CyberSource PA enrollment returned authentication failure status: AUTHENTICATION_FAILED",
    });

    const res = await request(app)
      .post("/api/payment/cybersource/payer-auth/check-enrollment")
      .send(ENROLLMENT_BODY);

    expect(res.status).toBe(502);
    expect(res.body.code).toBe("pa_enrollment_error");
  });

  it("returns 400 when required fields are missing", async () => {
    mockIsPayerAuthEnabled.mockReturnValue(true);

    // Missing referenceId
    const res = await request(app)
      .post("/api/payment/cybersource/payer-auth/check-enrollment")
      .send({
        transientTokenJwt: "a.b.c",
        orderId: "order-002",
        amount: "50.00",
        currency: "USD",
        returnUrl: "https://presentail.com/cb",
      });

    expect(res.status).toBe(400);
    expect(mockCheckEnrollment).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// POST /api/payment/cybersource/payer-auth/validate
// ===========================================================================

describe("POST /api/payment/cybersource/payer-auth/validate", () => {
  it("returns 503 pa_disabled when feature flag is off", async () => {
    mockIsPayerAuthEnabled.mockReturnValue(false);

    const res = await request(app)
      .post("/api/payment/cybersource/payer-auth/validate")
      .send({ authenticationTransactionId: "auth-txn-001" });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("pa_disabled");
    expect(mockValidateAuthentication).not.toHaveBeenCalled();
  });

  it("returns 400 when authenticationTransactionId is missing", async () => {
    mockIsPayerAuthEnabled.mockReturnValue(true);

    const res = await request(app)
      .post("/api/payment/cybersource/payer-auth/validate")
      .send({});

    expect(res.status).toBe(400);
    expect(mockValidateAuthentication).not.toHaveBeenCalled();
  });

  it("returns 200 with 3DS fields on success", async () => {
    mockIsPayerAuthEnabled.mockReturnValue(true);
    mockValidateAuthentication.mockResolvedValue({
      ok: true,
      cavv: "AAABCAAA=",
      eci: "05",
      eciRaw: "05",
      xid: "xid-validated",
      specificationVersion: "2.2.0",
      directoryServerTransactionId: "dsn-txn-001",
      paSpecificationVersion: "2.2.0",
      authenticationTransactionId: "auth-txn-001",
      commerceIndicator: "vbv",
    });

    const res = await request(app)
      .post("/api/payment/cybersource/payer-auth/validate")
      .send({ authenticationTransactionId: "auth-txn-001" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.cavv).toBe("AAABCAAA=");
    expect(res.body.eci).toBe("05");
    expect(res.body.commerceIndicator).toBe("vbv");
    expect(res.body.authenticationTransactionId).toBe("auth-txn-001");
  });

  it("returns 502 pa_validation_error when validation fails", async () => {
    mockIsPayerAuthEnabled.mockReturnValue(true);
    mockValidateAuthentication.mockResolvedValue({
      ok: false,
      code: "pa_validation_error",
      message: "Authentication result not found",
    });

    const res = await request(app)
      .post("/api/payment/cybersource/payer-auth/validate")
      .send({ authenticationTransactionId: "auth-txn-bad" });

    expect(res.status).toBe(502);
    expect(res.body.code).toBe("pa_validation_error");
  });
});

// ===========================================================================
// POST /api/payment/cybersource/charge — payerAuthData extensions
// ===========================================================================

describe("POST /api/payment/cybersource/charge — payer auth extensions", () => {
  it("rejects with 400 pa_required when flag is on but payerAuthData is absent", async () => {
    mockIsPayerAuthEnabled.mockReturnValue(true);

    const res = await request(app)
      .post("/api/payment/cybersource/charge")
      .send(VALID_CHARGE_BODY);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("pa_required");
    expect(mockAuthorizeAndCapture).not.toHaveBeenCalled();
  });

  it("rejects with 400 pa_required when flag is on and payerAuthData is an empty object", async () => {
    mockIsPayerAuthEnabled.mockReturnValue(true);

    const res = await request(app)
      .post("/api/payment/cybersource/charge")
      .send({ ...VALID_CHARGE_BODY, payerAuthData: {} });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("pa_required");
    expect(mockAuthorizeAndCapture).not.toHaveBeenCalled();
  });

  it("rejects with 400 pa_required when flag is on and payerAuthData has neither cavv nor eci fields", async () => {
    mockIsPayerAuthEnabled.mockReturnValue(true);

    const res = await request(app)
      .post("/api/payment/cybersource/charge")
      .send({
        ...VALID_CHARGE_BODY,
        payerAuthData: { authenticationTransactionId: "auth-txn-only" }, // no cavv or eci
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("pa_required");
    expect(mockAuthorizeAndCapture).not.toHaveBeenCalled();
  });

  it("accepts charge when eci alone is present (frictionless NOT_ENROLLED path)", async () => {
    mockIsPayerAuthEnabled.mockReturnValue(true);

    const res = await request(app)
      .post("/api/payment/cybersource/charge")
      .send({
        ...VALID_CHARGE_BODY,
        payerAuthData: { eci: "06", authenticationTransactionId: "auth-txn-frictionless" },
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // eci should be forwarded as eciRaw fallback
    const callArgs = mockAuthorizeAndCapture.mock.calls[0][0];
    expect(callArgs.payerAuthenticationData.eci).toBe("06");
  });

  it("accepts charge when flag is on and payerAuthData is provided", async () => {
    mockIsPayerAuthEnabled.mockReturnValue(true);

    const res = await request(app)
      .post("/api/payment/cybersource/charge")
      .send({ ...VALID_CHARGE_BODY, payerAuthData: VALID_PAYER_AUTH_DATA });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // authorizeAndCapture must have been called with payerAuthenticationData
    expect(mockAuthorizeAndCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        payerAuthenticationData: expect.objectContaining({ cavv: VALID_PAYER_AUTH_DATA.cavv }),
      }),
    );
  });

  it("accepts charge when flag is off and no payerAuthData supplied (existing behaviour)", async () => {
    mockIsPayerAuthEnabled.mockReturnValue(false);

    const res = await request(app)
      .post("/api/payment/cybersource/charge")
      .send(VALID_CHARGE_BODY);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockAuthorizeAndCapture).toHaveBeenCalled();
    // payerAuthenticationData must be undefined in the call args (not forwarded)
    const callArgs = mockAuthorizeAndCapture.mock.calls[0][0];
    expect(callArgs.payerAuthenticationData).toBeUndefined();
  });
});

// ===========================================================================
// authorizeAndCapture — consumerAuthenticationInformation merging
// ===========================================================================
// These tests verify via the charge route that payerAuthData is correctly
// forwarded as payerAuthenticationData to authorizeAndCapture.
// The mock tracks call args so we can assert the full payload shape.

describe("authorizeAndCapture — consumerAuthenticationInformation forwarding via charge route", () => {
  it("does NOT include payerAuthenticationData in authorizeAndCapture call when payerAuthData is absent", async () => {
    mockIsPayerAuthEnabled.mockReturnValue(false);

    await request(app)
      .post("/api/payment/cybersource/charge")
      .send(VALID_CHARGE_BODY);

    expect(mockAuthorizeAndCapture).toHaveBeenCalledOnce();
    const callArgs = mockAuthorizeAndCapture.mock.calls[0][0];
    expect(callArgs.payerAuthenticationData).toBeUndefined();
  });

  it("includes all 3DS fields in payerAuthenticationData when payerAuthData is supplied", async () => {
    mockIsPayerAuthEnabled.mockReturnValue(true);

    await request(app)
      .post("/api/payment/cybersource/charge")
      .send({ ...VALID_CHARGE_BODY, payerAuthData: VALID_PAYER_AUTH_DATA });

    expect(mockAuthorizeAndCapture).toHaveBeenCalledOnce();
    const callArgs = mockAuthorizeAndCapture.mock.calls[0][0];
    expect(callArgs.payerAuthenticationData).toMatchObject({
      cavv: VALID_PAYER_AUTH_DATA.cavv,
      eciRaw: VALID_PAYER_AUTH_DATA.eciRaw,
      xid: VALID_PAYER_AUTH_DATA.xid,
      specificationVersion: VALID_PAYER_AUTH_DATA.specificationVersion,
      directoryServerTransactionId: VALID_PAYER_AUTH_DATA.directoryServerTransactionId,
      paSpecificationVersion: VALID_PAYER_AUTH_DATA.paSpecificationVersion,
      authenticationTransactionId: VALID_PAYER_AUTH_DATA.authenticationTransactionId,
      commerceIndicator: VALID_PAYER_AUTH_DATA.commerceIndicator,
    });
  });
});
