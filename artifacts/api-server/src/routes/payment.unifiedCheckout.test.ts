// Contract tests for the CyberSource Unified Checkout (v1) routes.
//
// The request fixtures below MIRROR EXACTLY what the web checkout sends
// (artifacts/presentail-web/src/pages/Checkout.tsx +
//  src/pages/CyberSourceUnifiedCheckout.tsx + src/lib/queries.ts).
// If a route rejects one of these fixtures with a 400, the frontend and
// backend contracts have drifted — fix the drift, not the test.
//
// Focus areas (task acceptance criteria):
//   * session route only works for Lebanon + flag on, and returns the
//     clientLibrary/integrity extracted from the session JWT
//   * the strict paid gate: approved === true + non-empty requestId + an
//     explicitly approved status — anything else (declined, cancelled or
//     failed challenge, AUTHORIZED_RISK_DECLINED) must NOT store an intent
//   * amount re-verification between session and complete

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const {
  ucEnabledMock,
  ucSessionMock,
  approvedStatusMock,
  storeIntentMock,
  resolveCartMock,
  resolveStoreMock,
  verifyUcMock,
} = vi.hoisted(() => ({
  ucEnabledMock: vi.fn(),
  ucSessionMock: vi.fn(),
  approvedStatusMock: vi.fn(),
  storeIntentMock: vi.fn(),
  resolveCartMock: vi.fn(),
  resolveStoreMock: vi.fn(),
  verifyUcMock: vi.fn(),
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
  isUnifiedCheckoutEnabled: ucEnabledMock,
  generateUnifiedCheckoutSession: ucSessionMock,
  isApprovedPaymentStatus: approvedStatusMock,
  verifyUnifiedCheckoutPayment: verifyUcMock,
}));

vi.mock("../lib/cybersource-payer-auth", () => ({
  isPayerAuthEnabled: vi.fn().mockReturnValue(false),
  setupPayerAuth: vi.fn(),
  checkEnrollment: vi.fn(),
  validateAuthentication: vi.fn(),
}));

vi.mock("../lib/fx", () => ({
  convertFromUsd: vi.fn(),
  normalizeCurrency: (c: string) => (c ?? "USD").toUpperCase(),
  paypalCurrencyFor: vi.fn(),
  roundForCurrency: vi.fn(),
}));

vi.mock("../lib/catalog", () => ({
  resolveCartItems: resolveCartMock,
  computeDistrictFeeUsd: vi.fn().mockReturnValue(5),
  computeSlotFeeUsd: vi.fn().mockReturnValue(0),
  countryForDistrict: vi.fn().mockReturnValue("LB"),
  expressSurchargeUsd: vi.fn().mockReturnValue(0),
}));

vi.mock("../lib/checkoutIntents", () => ({ storePaymentIntent: storeIntentMock }));
vi.mock("../lib/wooStore", () => ({ resolveStoreFromRequest: resolveStoreMock }));
vi.mock("../lib/validateRedirectUrl", () => ({ validateRedirectUrl: vi.fn() }));
vi.mock("../lib/osLocationsCache", () => ({ resolveOsDeliveryConfig: vi.fn().mockReturnValue(null) }));
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

// base64url-encoded JWT with the given payload (header/signature are dummies —
// the routes only decode the payload segment).
function makeJwt(payload: Record<string, unknown>): string {
  return ["e30", Buffer.from(JSON.stringify(payload)).toString("base64url"), "sig"].join(".");
}

const SESSION_JWT = makeJwt({
  ctx: [
    {
      data: {
        clientLibrary: "https://apitest.cybersource.com/up/v1/assets/0.30.0/SecureAcceptance.js",
        clientLibraryIntegrity: "sha256-testintegrity",
      },
    },
  ],
});

// ── Frontend contract fixtures (keep in sync with the web checkout) ──────────

const FRONTEND_ITEMS = [{ wcId: 123, osSlug: "teddy-bear-100cm", quantity: 1 }];

const FRONTEND_SESSION_BODY = {
  items: FRONTEND_ITEMS,
  orderId: "PW-UC-1",
  district: "Beirut",
  expressDelivery: false,
  noAddress: false,
  deliverySlot: "",
  cityId: "42",
  targetOrigin: "https://presentail.com",
  billingDetails: {
    firstName: "Test",
    lastName: "Shopper",
    email: "shopper@example.com",
    phone: "+96170123456",
  },
  paymentAttemptId: "uc-attempt-1",
};

const APPROVED_RESULT = {
  approved: true,
  requestId: "7743812345676857203010",
  status: "AUTHORIZED",
  authenticationStatus: "AUTHENTICATION_SUCCESSFUL",
  ecommerceIndicator: "vbv",
  cavvPresent: true,
  directoryServerTransactionId: "ds-txn-1",
  specificationVersion: "2.2.0",
  challengeRequired: false,
  paymentResultJwt: makeJwt({ id: "7743812345676857203010", status: "AUTHORIZED" }),
};

const FRONTEND_COMPLETE_BODY = {
  orderId: "PW-UC-1",
  paymentAttemptId: "uc-attempt-1",
  items: FRONTEND_ITEMS,
  district: "Beirut",
  expressDelivery: false,
  noAddress: false,
  deliverySlot: "",
  cityId: "42",
  result: APPROVED_RESULT,
};

beforeEach(() => {
  ucEnabledMock.mockReturnValue(true);
  approvedStatusMock.mockImplementation((s: string) =>
    ["AUTHORIZED", "PARTIAL_AUTHORIZED", "AUTHORIZED_PENDING_REVIEW", "PENDING_REVIEW"].includes(s),
  );
  resolveStoreMock.mockReturnValue({ storeKey: "lebanon" });
  resolveCartMock.mockResolvedValue({
    ok: true,
    subtotalUsd: 42,
    items: [{ wcId: 123, osSlug: "teddy-bear-100cm", quantity: 1, priceUsd: 42 }],
  });
  ucSessionMock.mockResolvedValue({ ok: true, sessionJwt: SESSION_JWT });
  // Default: CyberSource confirms the transaction (Transaction Details API).
  verifyUcMock.mockResolvedValue({ ok: true, status: "AUTHORIZED", totalAmount: 47, currency: "USD" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /payment/cybersource/available", () => {
  it("advertises unifiedCheckoutEnabled=true when the flag is on", async () => {
    const res = await request(makeApp()).get("/payment/cybersource/available");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ available: true, unifiedCheckoutEnabled: true });
  });

  it("advertises unifiedCheckoutEnabled=false when the flag is off", async () => {
    ucEnabledMock.mockReturnValue(false);
    const res = await request(makeApp()).get("/payment/cybersource/available");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ available: true, unifiedCheckoutEnabled: false });
  });
});

describe("POST /payment/cybersource/unified-checkout/session", () => {
  it("accepts the exact frontend payload and returns the session + clientLibrary", async () => {
    const res = await request(makeApp())
      .post("/payment/cybersource/unified-checkout/session")
      .send(FRONTEND_SESSION_BODY);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      captureContext: SESSION_JWT,
      clientLibrary: expect.stringContaining("cybersource.com"),
      clientLibraryIntegrity: "sha256-testintegrity",
      totalUsd: 47, // 42 subtotal + 5 mocked district fee
      environment: "test",
      merchantId: "test_merchant",
    });
    // Server-side totals + Lebanon origin allowlist reach the session builder.
    expect(ucSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "PW-UC-1",
        currency: "USD",
        totalAmount: "47.00",
        targetOrigins: expect.arrayContaining(["https://presentail.com"]),
        billingDetails: FRONTEND_SESSION_BODY.billingDetails,
      }),
    );
  });

  it("returns 503 unified_checkout_disabled when the flag is off", async () => {
    ucEnabledMock.mockReturnValue(false);
    const res = await request(makeApp())
      .post("/payment/cybersource/unified-checkout/session")
      .send(FRONTEND_SESSION_BODY);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("unified_checkout_disabled");
    expect(ucSessionMock).not.toHaveBeenCalled();
  });

  it("rejects non-Lebanon storefronts", async () => {
    resolveStoreMock.mockReturnValue({ storeKey: "uae" });
    const res = await request(makeApp())
      .post("/payment/cybersource/unified-checkout/session")
      .send(FRONTEND_SESSION_BODY);
    expect(res.status).toBe(400);
    expect(ucSessionMock).not.toHaveBeenCalled();
  });

  it("rejects a payload without orderId (contract guard)", async () => {
    const { orderId: _omitted, ...withoutOrderId } = FRONTEND_SESSION_BODY;
    const res = await request(makeApp())
      .post("/payment/cybersource/unified-checkout/session")
      .send(withoutOrderId);
    expect(res.status).toBe(400);
    expect(ucSessionMock).not.toHaveBeenCalled();
  });

  it("propagates a CyberSource session failure as 502", async () => {
    ucSessionMock.mockResolvedValue({ ok: false, message: "CyberSource 400: bad targetOrigins" });
    const res = await request(makeApp())
      .post("/payment/cybersource/unified-checkout/session")
      .send({ ...FRONTEND_SESSION_BODY, orderId: "PW-UC-FAIL" });
    expect(res.status).toBe(502);
    expect(res.body.code).toBe("cybersource_error");
  });
});

describe("POST /payment/cybersource/unified-checkout/complete — strict paid gate", () => {
  it("accepts an approved result and stores the intent with auth metadata", async () => {
    const res = await request(makeApp())
      .post("/payment/cybersource/unified-checkout/complete")
      .send(FRONTEND_COMPLETE_BODY);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, paymentRef: "cybs:7743812345676857203010" });
    expect(storeIntentMock).toHaveBeenCalledTimes(1);
    expect(storeIntentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "PW-UC-1",
        paymentRef: "cybs:7743812345676857203010",
        provider: "cybersource",
        currency: "USD",
        totalUsd: 47,
        snapshot: expect.objectContaining({
          district: "Beirut",
          expressDelivery: false,
          noAddress: false,
          districtFeeUsd: 5,
        }),
        paymentMeta: expect.objectContaining({
          unifiedCheckoutUsed: true,
          consumerAuthenticationRequested: "3DS",
          paymentAttemptId: "uc-attempt-1",
          authenticationStatus: "AUTHENTICATION_SUCCESSFUL",
          ecommerceIndicator: "vbv",
          cavvPresent: true,
          directoryServerTransactionId: "ds-txn-1",
          specificationVersion: "2.2.0",
          challengeRequired: false,
          cybersourceRequestId: "7743812345676857203010",
          paymentStatus: "AUTHORIZED",
          serverVerified: true,
          verifiedPaymentStatus: "AUTHORIZED",
          verifiedAmountUsd: 47,
        }),
      }),
    );
    // The paid gate must have consulted CyberSource with the recomputed total.
    expect(verifyUcMock).toHaveBeenCalledWith({
      requestId: "7743812345676857203010",
      expectedTotalUsd: 47,
    });
  });

  it("rejects approved=false (cancelled/failed challenge) with 402 and stores nothing", async () => {
    const res = await request(makeApp())
      .post("/payment/cybersource/unified-checkout/complete")
      .send({
        ...FRONTEND_COMPLETE_BODY,
        result: { ...APPROVED_RESULT, approved: false, status: "AUTHENTICATION_FAILED" },
      });
    expect(res.status).toBe(402);
    expect(res.body.code).toBe("payment_not_approved");
    expect(storeIntentMock).not.toHaveBeenCalled();
  });

  it("rejects a missing requestId with 402 and stores nothing", async () => {
    const res = await request(makeApp())
      .post("/payment/cybersource/unified-checkout/complete")
      .send({
        ...FRONTEND_COMPLETE_BODY,
        result: { ...APPROVED_RESULT, requestId: "", paymentResultJwt: undefined },
      });
    expect(res.status).toBe(402);
    expect(res.body.code).toBe("payment_not_approved");
    expect(storeIntentMock).not.toHaveBeenCalled();
  });

  it("rejects DECLINED with 402 and stores nothing", async () => {
    const res = await request(makeApp())
      .post("/payment/cybersource/unified-checkout/complete")
      .send({
        ...FRONTEND_COMPLETE_BODY,
        result: { ...APPROVED_RESULT, status: "DECLINED", paymentResultJwt: undefined },
      });
    expect(res.status).toBe(402);
    expect(res.body.code).toBe("payment_not_approved");
    expect(storeIntentMock).not.toHaveBeenCalled();
  });

  it("rejects AUTHORIZED_RISK_DECLINED with 402 (never paid)", async () => {
    const res = await request(makeApp())
      .post("/payment/cybersource/unified-checkout/complete")
      .send({
        ...FRONTEND_COMPLETE_BODY,
        result: { ...APPROVED_RESULT, status: "AUTHORIZED_RISK_DECLINED", paymentResultJwt: undefined },
      });
    expect(res.status).toBe(402);
    expect(res.body.code).toBe("payment_not_approved");
    expect(storeIntentMock).not.toHaveBeenCalled();
  });

  it("rejects a result JWT that contradicts the posted requestId (402 result_mismatch)", async () => {
    const res = await request(makeApp())
      .post("/payment/cybersource/unified-checkout/complete")
      .send({
        ...FRONTEND_COMPLETE_BODY,
        result: {
          ...APPROVED_RESULT,
          paymentResultJwt: makeJwt({ id: "DIFFERENT-ID", status: "AUTHORIZED" }),
        },
      });
    expect(res.status).toBe(402);
    expect(res.body.code).toBe("result_mismatch");
    expect(storeIntentMock).not.toHaveBeenCalled();
  });

  it("returns 503 unified_checkout_disabled when the flag is off", async () => {
    ucEnabledMock.mockReturnValue(false);
    const res = await request(makeApp())
      .post("/payment/cybersource/unified-checkout/complete")
      .send(FRONTEND_COMPLETE_BODY);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("unified_checkout_disabled");
    expect(storeIntentMock).not.toHaveBeenCalled();
  });

  it("rejects with 409 amount_changed when the cart total drifts from the session total", async () => {
    const app = makeApp();
    // 1) Create the session at subtotal 42 → total 47 (pending record).
    const sessionRes = await request(app)
      .post("/payment/cybersource/unified-checkout/session")
      .send({ ...FRONTEND_SESSION_BODY, orderId: "PW-UC-AMT" });
    expect(sessionRes.status).toBe(200);

    // 2) Complete with a recomputed total of 105 (subtotal now 100).
    resolveCartMock.mockResolvedValue({
      ok: true,
      subtotalUsd: 100,
      items: [{ wcId: 123, osSlug: "teddy-bear-100cm", quantity: 1, priceUsd: 100 }],
    });
    const res = await request(app)
      .post("/payment/cybersource/unified-checkout/complete")
      .send({ ...FRONTEND_COMPLETE_BODY, orderId: "PW-UC-AMT" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("amount_changed");
    expect(storeIntentMock).not.toHaveBeenCalled();
  });

  it("accepts a valid result even when no pending session record exists (restart tolerance)", async () => {
    const res = await request(makeApp())
      .post("/payment/cybersource/unified-checkout/complete")
      .send({ ...FRONTEND_COMPLETE_BODY, orderId: "PW-UC-FRESH" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(storeIntentMock).toHaveBeenCalledTimes(1);
    // Restart tolerance never bypasses provider verification.
    expect(verifyUcMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /payment/cybersource/unified-checkout/complete — server-side provider verification", () => {
  it("rejects a forged approved result when CyberSource does not confirm it (402, nothing stored)", async () => {
    verifyUcMock.mockResolvedValue({
      ok: false,
      code: "not_approved",
      message: "CyberSource does not report this transaction as approved (status: DECLINED)",
    });
    const res = await request(makeApp())
      .post("/payment/cybersource/unified-checkout/complete")
      .send({ ...FRONTEND_COMPLETE_BODY, orderId: "PW-UC-FORGED" });
    expect(res.status).toBe(402);
    expect(res.body.code).toBe("verification_failed");
    expect(storeIntentMock).not.toHaveBeenCalled();
  });

  it("rejects a requestId CyberSource has never seen (402, nothing stored)", async () => {
    verifyUcMock.mockResolvedValue({ ok: false, code: "not_found", message: "not found" });
    const res = await request(makeApp())
      .post("/payment/cybersource/unified-checkout/complete")
      .send({ ...FRONTEND_COMPLETE_BODY, orderId: "PW-UC-NOTFOUND" });
    expect(res.status).toBe(402);
    expect(res.body.code).toBe("verification_failed");
    expect(storeIntentMock).not.toHaveBeenCalled();
  });

  it("fails closed with 502 when CyberSource cannot be reached (nothing stored)", async () => {
    verifyUcMock.mockResolvedValue({ ok: false, code: "unavailable", message: "network failure" });
    const res = await request(makeApp())
      .post("/payment/cybersource/unified-checkout/complete")
      .send({ ...FRONTEND_COMPLETE_BODY, orderId: "PW-UC-DOWN" });
    expect(res.status).toBe(502);
    expect(res.body.code).toBe("verification_unavailable");
    expect(storeIntentMock).not.toHaveBeenCalled();
  });

  it("rejects with 409 when CyberSource captured a different amount", async () => {
    verifyUcMock.mockResolvedValue({
      ok: false,
      code: "amount_mismatch",
      message: "CyberSource captured 20 USD, expected 47.00 USD",
    });
    const res = await request(makeApp())
      .post("/payment/cybersource/unified-checkout/complete")
      .send({ ...FRONTEND_COMPLETE_BODY, orderId: "PW-UC-CSAMT" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("amount_changed");
    expect(storeIntentMock).not.toHaveBeenCalled();
  });

  it("does not consult CyberSource when the client-posted result already fails the gate", async () => {
    const res = await request(makeApp())
      .post("/payment/cybersource/unified-checkout/complete")
      .send({
        ...FRONTEND_COMPLETE_BODY,
        orderId: "PW-UC-PREGATE",
        result: { ...APPROVED_RESULT, approved: false, paymentResultJwt: undefined },
      });
    expect(res.status).toBe(402);
    expect(verifyUcMock).not.toHaveBeenCalled();
    expect(storeIntentMock).not.toHaveBeenCalled();
  });
});
