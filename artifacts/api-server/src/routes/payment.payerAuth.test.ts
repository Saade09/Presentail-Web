// Contract tests for the CyberSource Payer Authentication (3DS) routes.
//
// The request fixtures below MIRROR EXACTLY what the web checkout sends
// (artifacts/presentail-web/src/pages/Checkout.tsx + src/lib/queries.ts).
// If a route rejects one of these fixtures with a 400, the frontend and
// backend contracts have drifted — fix the drift, not the test.
//
// Also covers the challenge return relay page (the URL the Cardinal step-up
// iframe navigates to when the issuer challenge finishes).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { setupMock, enrollMock, validateMock, enabledMock } = vi.hoisted(() => ({
  setupMock: vi.fn(),
  enrollMock: vi.fn(),
  validateMock: vi.fn(),
  enabledMock: vi.fn(),
}));

vi.mock("../lib/cybersource-payer-auth", () => ({
  isPayerAuthEnabled: enabledMock,
  setupPayerAuth: setupMock,
  checkEnrollment: enrollMock,
  validateAuthentication: validateMock,
}));

vi.mock("../lib/cybersource", () => ({
  getCybersourceMerchantId: () => "test_merchant",
  getCybersourceGooglePayMerchantId: () => "",
  getCybersourceEnvironment: () => "test",
  isCybersourceConfigured: () => true,
  generateCaptureContext: vi.fn(),
  authorizeAndCapture: vi.fn(),
  authorizeAndCaptureGooglePay: vi.fn(),
  authorizeAndCaptureApplePay: vi.fn(),
  validateApplePayMerchant: vi.fn(),
}));

vi.mock("../lib/fx", () => ({
  convertFromUsd: vi.fn(),
  normalizeCurrency: (c: string) => (c ?? "USD").toUpperCase(),
  paypalCurrencyFor: vi.fn(),
  roundForCurrency: vi.fn(),
}));

vi.mock("../lib/catalog", () => ({
  resolveCartItems: vi.fn(),
  computeDistrictFeeUsd: vi.fn().mockReturnValue(0),
  computeSlotFeeUsd: vi.fn().mockReturnValue(0),
  countryForDistrict: vi.fn().mockReturnValue("LB"),
  expressSurchargeUsd: vi.fn().mockReturnValue(0),
}));

vi.mock("../lib/checkoutIntents", () => ({ storePaymentIntent: vi.fn() }));
vi.mock("../lib/wooStore", () => ({ resolveStoreFromRequest: vi.fn() }));
vi.mock("../lib/validateRedirectUrl", () => ({ validateRedirectUrl: vi.fn() }));
vi.mock("../lib/geoCurrency", () => ({
  pickClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  lookupCountryFromIp: vi.fn().mockResolvedValue("LB"),
}));

import paymentRouter from "./payment";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use((req, _res, next) => {
    (req as unknown as { log: Record<string, unknown> }).log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    next();
  });
  app.use(paymentRouter);
  return app;
}

// ── Frontend contract fixtures (keep in sync with the web checkout) ──────────

const FRONTEND_SETUP_BODY = {
  transientTokenJwt: "tok.jwt.value",
  orderId: "PW-TEST-1",
  paymentAttemptId: "attempt-uuid-1",
};

const FRONTEND_BROWSER_INFO = {
  javaEnabled: false,
  javaScriptEnabled: true,
  acceptHeaders: "application/json, text/plain, */*",
  colorDepth: "24",
  screenHeight: "1080",
  screenWidth: "1920",
  timeZone: "-120",
  userAgentBrowserValue: "vitest-agent",
};

const FRONTEND_ENROLLMENT_BODY = {
  paymentAttemptId: "attempt-uuid-1",
  transientTokenJwt: "tok.jwt.value",
  referenceId: "ref-123",
  orderId: "PW-TEST-1",
  amount: "47.00",
  currency: "USD",
  returnUrl: "https://presentail.com/api/payment/cybersource/payer-auth/return",
  browserInfo: FRONTEND_BROWSER_INFO,
  billTo: { firstName: "Test", lastName: "Shopper", email: "shopper@example.com" },
};

const FRONTEND_VALIDATE_BODY = {
  authenticationTransactionId: "pa-txn-1",
  paymentAttemptId: "attempt-uuid-1",
};

beforeEach(() => {
  enabledMock.mockReturnValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /payment/cybersource/payer-auth/setup", () => {
  it("accepts the exact frontend payload and returns device-data params", async () => {
    setupMock.mockResolvedValueOnce({
      ok: true,
      accessToken: "access-token-jwt",
      deviceDataCollectionUrl: "https://centinelapistag.cardinalcommerce.com/V1/Cruise/Collect",
      referenceId: "ref-123",
    });

    const res = await request(makeApp())
      .post("/payment/cybersource/payer-auth/setup")
      .send(FRONTEND_SETUP_BODY);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      accessToken: "access-token-jwt",
      deviceDataCollectionUrl: expect.stringContaining("cardinalcommerce.com"),
      referenceId: "ref-123",
    });
    expect(setupMock).toHaveBeenCalledWith({
      transientTokenJwt: FRONTEND_SETUP_BODY.transientTokenJwt,
      orderId: FRONTEND_SETUP_BODY.orderId,
    });
  });

  it("rejects a payload without orderId (contract guard)", async () => {
    const { orderId: _omitted, ...withoutOrderId } = FRONTEND_SETUP_BODY;
    const res = await request(makeApp())
      .post("/payment/cybersource/payer-auth/setup")
      .send(withoutOrderId);
    expect(res.status).toBe(400);
    expect(setupMock).not.toHaveBeenCalled();
  });

  it("returns 503 pa_disabled when the feature flag is off", async () => {
    enabledMock.mockReturnValue(false);
    const res = await request(makeApp())
      .post("/payment/cybersource/payer-auth/setup")
      .send(FRONTEND_SETUP_BODY);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("pa_disabled");
  });
});

describe("POST /payment/cybersource/payer-auth/check-enrollment", () => {
  it("accepts the exact frontend payload and returns the challenge shape", async () => {
    enrollMock.mockResolvedValueOnce({
      ok: true,
      enrolled: true,
      stepUpUrl: "https://centinelapistag.cardinalcommerce.com/V2/Cruise/StepUp",
      accessToken: "stepup-token-jwt",
      authenticationTransactionId: "pa-txn-1",
    });

    const res = await request(makeApp())
      .post("/payment/cybersource/payer-auth/check-enrollment")
      .send(FRONTEND_ENROLLMENT_BODY);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      enrolled: true,
      stepUpUrl: expect.stringContaining("StepUp"),
      accessToken: "stepup-token-jwt",
      authenticationTransactionId: "pa-txn-1",
    });
    // The route must forward the full frontend contract to the lib.
    expect(enrollMock).toHaveBeenCalledWith({
      transientTokenJwt: FRONTEND_ENROLLMENT_BODY.transientTokenJwt,
      referenceId: FRONTEND_ENROLLMENT_BODY.referenceId,
      orderId: FRONTEND_ENROLLMENT_BODY.orderId,
      amount: FRONTEND_ENROLLMENT_BODY.amount,
      currency: FRONTEND_ENROLLMENT_BODY.currency,
      billTo: FRONTEND_ENROLLMENT_BODY.billTo,
      browserInfo: FRONTEND_ENROLLMENT_BODY.browserInfo,
      returnUrl: FRONTEND_ENROLLMENT_BODY.returnUrl,
    });
  });

  it("returns the frictionless 3DS metadata as FLAT fields (not nested)", async () => {
    enrollMock.mockResolvedValueOnce({
      ok: true,
      enrolled: false,
      authenticationTransactionId: "pa-txn-2",
      eci: "05",
      cavv: "cavv-value",
      xid: "xid-1",
      specificationVersion: "2.2.0",
      directoryServerTransactionId: "ds-txn-1",
      paSpecificationVersion: "2.2.0",
    });

    const res = await request(makeApp())
      .post("/payment/cybersource/payer-auth/check-enrollment")
      .send(FRONTEND_ENROLLMENT_BODY);

    expect(res.status).toBe(200);
    // Flatness is part of the contract: the web checkout maps these fields
    // with extractCsPayerAuthData(), which reads them from the body root.
    expect(res.body.enrolled).toBe(false);
    expect(res.body.cavv).toBe("cavv-value");
    expect(res.body.eci).toBe("05");
    expect(res.body.authenticationTransactionId).toBe("pa-txn-2");
    expect(res.body.payerAuthData).toBeUndefined();
  });

  it("rejects a payload without returnUrl (contract guard)", async () => {
    const { returnUrl: _omitted, ...withoutReturnUrl } = FRONTEND_ENROLLMENT_BODY;
    const res = await request(makeApp())
      .post("/payment/cybersource/payer-auth/check-enrollment")
      .send(withoutReturnUrl);
    expect(res.status).toBe(400);
    expect(enrollMock).not.toHaveBeenCalled();
  });

  it("rejects a payload without amount (contract guard)", async () => {
    const { amount: _omitted, ...withoutAmount } = FRONTEND_ENROLLMENT_BODY;
    const res = await request(makeApp())
      .post("/payment/cybersource/payer-auth/check-enrollment")
      .send(withoutAmount);
    expect(res.status).toBe(400);
    expect(enrollMock).not.toHaveBeenCalled();
  });
});

describe("POST /payment/cybersource/payer-auth/validate", () => {
  it("accepts the exact frontend payload and returns flat 3DS metadata", async () => {
    validateMock.mockResolvedValueOnce({
      ok: true,
      cavv: "cavv-value",
      eci: "05",
      eciRaw: "05",
      xid: "xid-2",
      specificationVersion: "2.2.0",
      directoryServerTransactionId: "ds-txn-2",
      paSpecificationVersion: "2.2.0",
      authenticationTransactionId: "pa-txn-1",
      commerceIndicator: "vbv",
    });

    const res = await request(makeApp())
      .post("/payment/cybersource/payer-auth/validate")
      .send(FRONTEND_VALIDATE_BODY);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      cavv: "cavv-value",
      eci: "05",
      eciRaw: "05",
      authenticationTransactionId: "pa-txn-1",
      commerceIndicator: "vbv",
    });
    expect(res.body.payerAuthData).toBeUndefined();
    expect(validateMock).toHaveBeenCalledWith({
      authenticationTransactionId: FRONTEND_VALIDATE_BODY.authenticationTransactionId,
    });
  });

  it("rejects a payload without authenticationTransactionId (contract guard)", async () => {
    const res = await request(makeApp())
      .post("/payment/cybersource/payer-auth/validate")
      .send({ paymentAttemptId: "attempt-uuid-1" });
    expect(res.status).toBe(400);
    expect(validateMock).not.toHaveBeenCalled();
  });
});

describe("payer-auth challenge return relay", () => {
  it("serves an HTML page that posts the completion message to the parent", async () => {
    const res = await request(makeApp())
      .post("/payment/cybersource/payer-auth/return")
      .type("form")
      .send({ TransactionId: "abc_123-XY" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("cybersource.stepUpComplete");
    expect(res.text).toContain('"abc_123-XY"');
  });

  it("also answers GET with a query TransactionId", async () => {
    const res = await request(makeApp())
      .get("/payment/cybersource/payer-auth/return")
      .query({ TransactionId: "qs-txn-1" });

    expect(res.status).toBe(200);
    expect(res.text).toContain("cybersource.stepUpComplete");
    expect(res.text).toContain('"qs-txn-1"');
  });

  it("never reflects a hostile TransactionId into the page (XSS guard)", async () => {
    const hostile = "</script><script>alert(1)</script>";
    const res = await request(makeApp())
      .post("/payment/cybersource/payer-auth/return")
      .type("form")
      .send({ TransactionId: hostile });

    expect(res.status).toBe(200);
    expect(res.text).not.toContain("alert(1)");
    // Sanitization empties anything outside [A-Za-z0-9_-]{1,80}.
    expect(res.text).toContain('TransactionId: ""');
  });
});
