// Unit tests for verifyUnifiedCheckoutPayment — the server-authoritative,
// fail-closed provider verification behind /payment/cybersource/unified-checkout/complete.
//
// Security contract under test: the function must return ok:true ONLY when
// CyberSource's Transaction Details API positively confirms an approved
// transaction whose captured amount + currency match the server-side total.
// Every ambiguous, missing, declined, or unreachable outcome must fail closed.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { verifyUnifiedCheckoutPayment } from "./cybersource";

function setEnv(overrides: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

const CREDENTIALS = {
  CYBERSOURCE_MERCHANT_ID: "testmerchant",
  CYBERSOURCE_API_KEY_ID: "keyid123",
  CYBERSOURCE_SHARED_SECRET_KEY: Buffer.from("supersecretkey").toString("base64"),
  CYBERSOURCE_ENVIRONMENT: "test",
};

const REQUEST_ID = "7743812345676857203010";

const APPROVED_TX = {
  id: REQUEST_ID,
  reconciliationId: "recon-1",
  applicationInformation: {
    status: "AUTHORIZED",
    rFlag: "SOK",
    applications: [
      { name: "ics_auth", rFlag: "SOK", reasonCode: "100", rMessage: "Request was processed successfully." },
      { name: "ics_bill", rFlag: "SOK", reasonCode: "100" },
    ],
  },
  orderInformation: { amountDetails: { totalAmount: "47.00", currency: "USD" } },
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => setEnv(CREDENTIALS));
afterEach(() => {
  setEnv(Object.fromEntries(Object.keys(CREDENTIALS).map((k) => [k, undefined])));
  vi.restoreAllMocks();
});

describe("verifyUnifiedCheckoutPayment — approval path", () => {
  it("confirms an approved transaction with matching amount", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(jsonResponse(200, APPROVED_TX));

    const result = await verifyUnifiedCheckoutPayment({ requestId: REQUEST_ID, expectedTotalUsd: 47 });

    expect(result).toEqual({
      ok: true,
      status: "AUTHORIZED",
      totalAmount: 47,
      currency: "USD",
      reconciliationId: "recon-1",
    });

    // Signed GET against the Transaction Details API — no digest on GET.
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://apitest.cybersource.com/tss/v2/transactions/${REQUEST_ID}`);
    expect(init.method).toBe("GET");
    const headers = init.headers as Record<string, string>;
    expect(headers.signature).toContain('headers="host date request-target v-c-merchant-id"');
    expect(headers.digest).toBeUndefined();
    expect(headers["v-c-merchant-id"]).toBe("testmerchant");
  });

  it("accepts approval evidence from ics_auth even when the top-level status is a settlement state", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      jsonResponse(200, {
        ...APPROVED_TX,
        applicationInformation: {
          status: "TRANSMITTED",
          applications: [{ name: "ics_auth", rFlag: "SOK", reasonCode: "100" }],
        },
      }),
    );
    const result = await verifyUnifiedCheckoutPayment({ requestId: REQUEST_ID, expectedTotalUsd: 47 });
    expect(result.ok).toBe(true);
  });
});

describe("verifyUnifiedCheckoutPayment — fail-closed rejections", () => {
  it("rejects a declined transaction (ics_auth rFlag not SOK)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      jsonResponse(200, {
        ...APPROVED_TX,
        applicationInformation: {
          status: "DECLINED",
          applications: [{ name: "ics_auth", rFlag: "SNK", reasonCode: "481" }],
        },
      }),
    );
    const result = await verifyUnifiedCheckoutPayment({ requestId: REQUEST_ID, expectedTotalUsd: 47 });
    expect(result).toMatchObject({ ok: false, code: "not_approved" });
  });

  it("rejects AUTHORIZED_RISK_DECLINED even when ics_auth succeeded (decision decline wins)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      jsonResponse(200, {
        ...APPROVED_TX,
        applicationInformation: {
          status: "AUTHORIZED_RISK_DECLINED",
          applications: [
            { name: "ics_auth", rFlag: "SOK", reasonCode: "100" },
            { name: "ics_decision", rFlag: "SNK", reasonCode: "481" },
          ],
        },
      }),
    );
    const result = await verifyUnifiedCheckoutPayment({ requestId: REQUEST_ID, expectedTotalUsd: 47 });
    expect(result).toMatchObject({ ok: false, code: "not_approved" });
  });

  it("rejects when there is no positive approval evidence at all", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      jsonResponse(200, { id: REQUEST_ID, orderInformation: APPROVED_TX.orderInformation }),
    );
    const result = await verifyUnifiedCheckoutPayment({ requestId: REQUEST_ID, expectedTotalUsd: 47 });
    expect(result).toMatchObject({ ok: false, code: "not_approved" });
  });

  it("rejects an amount mismatch", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      jsonResponse(200, {
        ...APPROVED_TX,
        orderInformation: { amountDetails: { totalAmount: "20.00", currency: "USD" } },
      }),
    );
    const result = await verifyUnifiedCheckoutPayment({ requestId: REQUEST_ID, expectedTotalUsd: 47 });
    expect(result).toMatchObject({ ok: false, code: "amount_mismatch" });
  });

  it("rejects a currency mismatch", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      jsonResponse(200, {
        ...APPROVED_TX,
        orderInformation: { amountDetails: { totalAmount: "47.00", currency: "EUR" } },
      }),
    );
    const result = await verifyUnifiedCheckoutPayment({ requestId: REQUEST_ID, expectedTotalUsd: 47 });
    expect(result).toMatchObject({ ok: false, code: "amount_mismatch" });
  });

  it("fails closed when amount details are missing (cannot verify)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      jsonResponse(200, { id: REQUEST_ID, applicationInformation: APPROVED_TX.applicationInformation }),
    );
    const result = await verifyUnifiedCheckoutPayment({ requestId: REQUEST_ID, expectedTotalUsd: 47 });
    expect(result).toMatchObject({ ok: false, code: "unavailable" });
  });

  it("fails closed when CyberSource returns a different transaction id", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      jsonResponse(200, { ...APPROVED_TX, id: "SOMETHING-ELSE" }),
    );
    const result = await verifyUnifiedCheckoutPayment({ requestId: REQUEST_ID, expectedTotalUsd: 47 });
    expect(result).toMatchObject({ ok: false, code: "unavailable" });
  });
});

describe("verifyUnifiedCheckoutPayment — lookup failures & retries", () => {
  it("retries 404 (indexing lag) then fails closed as not_found", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse(404, ""));
    const result = await verifyUnifiedCheckoutPayment({
      requestId: REQUEST_ID,
      expectedTotalUsd: 47,
      attempts: 2,
      retryDelayMs: 0,
    });
    expect(result).toMatchObject({ ok: false, code: "not_found" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("recovers when a retry succeeds after an initial 404", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(jsonResponse(404, ""))
      .mockResolvedValueOnce(jsonResponse(200, APPROVED_TX));
    const result = await verifyUnifiedCheckoutPayment({
      requestId: REQUEST_ID,
      expectedTotalUsd: 47,
      attempts: 3,
      retryDelayMs: 0,
    });
    expect(result.ok).toBe(true);
  });

  it("fails closed as unavailable on repeated network failures", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    const result = await verifyUnifiedCheckoutPayment({
      requestId: REQUEST_ID,
      expectedTotalUsd: 47,
      attempts: 2,
      retryDelayMs: 0,
    });
    expect(result).toMatchObject({ ok: false, code: "unavailable" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does not retry auth failures (401) — fails closed immediately", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse(401, "unauthorized"));
    const result = await verifyUnifiedCheckoutPayment({
      requestId: REQUEST_ID,
      expectedTotalUsd: 47,
      attempts: 3,
      retryDelayMs: 0,
    });
    expect(result).toMatchObject({ ok: false, code: "unavailable" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects a malformed requestId without calling CyberSource", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const result = await verifyUnifiedCheckoutPayment({
      requestId: "../../pts/v2/payments",
      expectedTotalUsd: 47,
    });
    expect(result).toMatchObject({ ok: false, code: "not_found" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails closed when CyberSource is not configured", async () => {
    setEnv({ CYBERSOURCE_MERCHANT_ID: undefined });
    const result = await verifyUnifiedCheckoutPayment({ requestId: REQUEST_ID, expectedTotalUsd: 47 });
    expect(result).toMatchObject({ ok: false, code: "unavailable" });
  });
});
