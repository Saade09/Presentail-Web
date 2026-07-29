// Unit tests for sendOrderEventEmail (artifacts/api-server/src/lib/emailNotify.ts)
//
// Coverage:
//   - Skip: state not in EMAIL_NOTIFY_STATES
//   - Skip: no customer email on file
//   - Skip: SMTP not configured (no SMTP_HOST)
//   - Send: nodemailer called with correct from/to/subject/text for
//           EN × confirmed, EN × delivered,
//           AR × confirmed, AR × delivered,
//           FR × confirmed, FR × delivered
//   - Send: includes line items and order total in confirmed body
//   - Send: uses EMAIL_FROM env when set, falls back to SMTP_USER
//   - Failure: nodemailer throws → emailSent: false, emailSkipped: false

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoist mock internals so we can inspect / reset them in tests
// ---------------------------------------------------------------------------

const { sendMailMock, createTransportMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn().mockResolvedValue({ messageId: "test-msg-id" });
  const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));
  return { sendMailMock, createTransportMock };
});

vi.mock("nodemailer", () => ({
  createTransport: createTransportMock,
}));

// Analytics DB insert is fire-and-forget; mock the full chain so it never
// hits a real DB but is still inspectable.
const { insertValuesMock, dbMock } = vi.hoisted(() => {
  const insertValuesMock = vi.fn().mockResolvedValue(undefined);
  const insertChain = { values: insertValuesMock };
  const dbMock = { insert: vi.fn().mockReturnValue(insertChain) };
  return { insertValuesMock, dbMock };
});

vi.mock("@workspace/db", () => ({
  db: dbMock,
  analyticsEventsTable: {},
}));

vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Subject under test — imported *after* vi.mock calls so mocks are in place
// ---------------------------------------------------------------------------

import { sendOrderEventEmail } from "./emailNotify";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Minimal SMTP config that enables the email path. */
function setSmtpEnv(overrides: Record<string, string> = {}) {
  process.env.SMTP_HOST = "smtp.example.com";
  process.env.SMTP_PORT = "587";
  process.env.SMTP_USER = "user@example.com";
  process.env.SMTP_PASS = "secret";
  process.env.EMAIL_FROM = "orders@presentail.com";
  Object.assign(process.env, overrides);
}

function clearSmtpEnv() {
  for (const key of [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_USER",
    "SMTP_PASS",
    "EMAIL_FROM",
    "EMAIL_NOTIFY_STATES",
    "SMS_TRACKING_URL_BASE",
  ]) {
    delete process.env[key];
  }
}

const ORDER_ID = "PR-TEST-001";
const CUSTOMER_EMAIL = "customer@example.com";

beforeEach(() => {
  vi.clearAllMocks();
  clearSmtpEnv();
});

afterEach(() => {
  clearSmtpEnv();
});

// ---------------------------------------------------------------------------
// Skip: state not in notify list
// ---------------------------------------------------------------------------

describe("sendOrderEventEmail — skip: state not in notify list", () => {
  it("skips when state is 'out_for_delivery' (not in default list)", async () => {
    setSmtpEnv();
    const result = await sendOrderEventEmail({
      state: "out_for_delivery",
      appOrderId: ORDER_ID,
      customerEmail: CUSTOMER_EMAIL,
    });
    expect(result).toEqual({ emailSent: false, emailSkipped: true });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("skips when EMAIL_NOTIFY_STATES is set and state is excluded", async () => {
    setSmtpEnv();
    process.env.EMAIL_NOTIFY_STATES = "delivered";
    const result = await sendOrderEventEmail({
      state: "confirmed",
      appOrderId: ORDER_ID,
      customerEmail: CUSTOMER_EMAIL,
    });
    expect(result).toEqual({ emailSent: false, emailSkipped: true });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("sends when EMAIL_NOTIFY_STATES is overridden to include a custom state", async () => {
    setSmtpEnv();
    process.env.EMAIL_NOTIFY_STATES = "out_for_delivery";
    const result = await sendOrderEventEmail({
      state: "out_for_delivery",
      appOrderId: ORDER_ID,
      customerEmail: CUSTOMER_EMAIL,
    });
    expect(result.emailSent).toBe(true);
    expect(sendMailMock).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Skip: no customer email
// ---------------------------------------------------------------------------

describe("sendOrderEventEmail — skip: no customer email", () => {
  it("skips when customerEmail is null", async () => {
    setSmtpEnv();
    const result = await sendOrderEventEmail({
      state: "confirmed",
      appOrderId: ORDER_ID,
      customerEmail: null,
    });
    expect(result).toEqual({ emailSent: false, emailSkipped: true });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("skips when customerEmail is undefined", async () => {
    setSmtpEnv();
    const result = await sendOrderEventEmail({
      state: "confirmed",
      appOrderId: ORDER_ID,
      customerEmail: undefined,
    });
    expect(result).toEqual({ emailSent: false, emailSkipped: true });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("skips when customerEmail is an empty string", async () => {
    setSmtpEnv();
    const result = await sendOrderEventEmail({
      state: "confirmed",
      appOrderId: ORDER_ID,
      customerEmail: "",
    });
    expect(result).toEqual({ emailSent: false, emailSkipped: true });
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Skip: SMTP not configured
// ---------------------------------------------------------------------------

describe("sendOrderEventEmail — skip: SMTP not configured", () => {
  it("skips when SMTP_HOST is unset", async () => {
    // No setSmtpEnv() — SMTP_HOST remains unset
    const result = await sendOrderEventEmail({
      state: "confirmed",
      appOrderId: ORDER_ID,
      customerEmail: CUSTOMER_EMAIL,
    });
    expect(result).toEqual({ emailSent: false, emailSkipped: true });
    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Send: correct subject and body for EN × confirmed / delivered
// ---------------------------------------------------------------------------

describe("sendOrderEventEmail — send: EN locale", () => {
  beforeEach(() => setSmtpEnv());

  it("confirmed (EN) — sends with correct subject", async () => {
    const result = await sendOrderEventEmail({
      state: "confirmed",
      appOrderId: ORDER_ID,
      customerEmail: CUSTOMER_EMAIL,
      lang: "en",
      recipientName: "Alice",
    });
    expect(result).toEqual({ emailSent: true, emailSkipped: false });
    expect(sendMailMock).toHaveBeenCalledOnce();
    const call = sendMailMock.mock.calls[0][0] as Record<string, string>;
    expect(call.subject).toBe(`Order confirmed — ${ORDER_ID}`);
    expect(call.to).toBe(CUSTOMER_EMAIL);
    expect(call.text).toContain("Thank you for your Presentail order!");
    expect(call.text).toContain(ORDER_ID);
    expect(call.text).toContain("Track your order here:");
  });

  it("confirmed (EN) — includes recipient name and delivery details in body", async () => {
    const result = await sendOrderEventEmail({
      state: "confirmed",
      appOrderId: ORDER_ID,
      customerEmail: CUSTOMER_EMAIL,
      lang: "en",
      recipientName: "Bob",
      deliveryDate: "2026-07-01",
      deliverySlot: "Morning (9am–1pm)",
      totalUsdCents: 15000,
      lineItems: [{ name: "Rose Bouquet", quantity: 2, priceUsdCents: 7500 }],
    });
    expect(result.emailSent).toBe(true);
    const body = (sendMailMock.mock.calls[0][0] as Record<string, string>).text;
    expect(body).toContain("Bob");
    expect(body).toContain("2026-07-01");
    expect(body).toContain("Morning (9am–1pm)");
    expect(body).toContain("$150.00");
    expect(body).toContain("Rose Bouquet");
    expect(body).toContain("× 2");
    expect(body).toContain("$75.00");
  });

  it("delivered (EN) — sends with correct subject", async () => {
    const result = await sendOrderEventEmail({
      state: "delivered",
      appOrderId: ORDER_ID,
      customerEmail: CUSTOMER_EMAIL,
      lang: "en",
      recipientName: "Carol",
    });
    expect(result).toEqual({ emailSent: true, emailSkipped: false });
    const call = sendMailMock.mock.calls[0][0] as Record<string, string>;
    expect(call.subject).toBe(`Delivered — ${ORDER_ID}`);
    expect(call.text).toContain("has been delivered!");
    expect(call.text).toContain("Carol");
    expect(call.text).toContain("Thank you for choosing Presentail");
  });
});

// ---------------------------------------------------------------------------
// Send: correct subject and body for AR × confirmed / delivered
// ---------------------------------------------------------------------------

describe("sendOrderEventEmail — send: AR locale", () => {
  beforeEach(() => setSmtpEnv());

  it("confirmed (AR) — sends with Arabic subject", async () => {
    const result = await sendOrderEventEmail({
      state: "confirmed",
      appOrderId: ORDER_ID,
      customerEmail: CUSTOMER_EMAIL,
      lang: "ar",
    });
    expect(result).toEqual({ emailSent: true, emailSkipped: false });
    const call = sendMailMock.mock.calls[0][0] as Record<string, string>;
    expect(call.subject).toBe(`تم تأكيد طلبك ${ORDER_ID}`);
    expect(call.text).toContain("Presentail");
    expect(call.text).toContain(ORDER_ID);
  });

  it("confirmed (AR) — includes Arabic order summary fields in body", async () => {
    await sendOrderEventEmail({
      state: "confirmed",
      appOrderId: ORDER_ID,
      customerEmail: CUSTOMER_EMAIL,
      lang: "ar",
      recipientName: "ليلى",
      deliveryDate: "2026-07-01",
      deliverySlot: "صباح",
      totalUsdCents: 5000,
      lineItems: [{ name: "باقة ورود", quantity: 1, priceUsdCents: 5000 }],
    });
    const body = (sendMailMock.mock.calls[0][0] as Record<string, string>).text;
    expect(body).toContain("رقم الطلب");
    expect(body).toContain("ليلى");
    expect(body).toContain("2026-07-01");
    expect(body).toContain("$50.00");
  });

  it("delivered (AR) — sends with Arabic subject", async () => {
    const result = await sendOrderEventEmail({
      state: "delivered",
      appOrderId: ORDER_ID,
      customerEmail: CUSTOMER_EMAIL,
      lang: "ar",
      recipientName: "كريم",
    });
    expect(result).toEqual({ emailSent: true, emailSkipped: false });
    const call = sendMailMock.mock.calls[0][0] as Record<string, string>;
    expect(call.subject).toBe(`تم تسليم طلبك ${ORDER_ID}`);
    expect(call.text).toContain("تم توصيل");
    expect(call.text).toContain("كريم");
  });
});

// ---------------------------------------------------------------------------
// Send: correct subject and body for FR × confirmed / delivered
// ---------------------------------------------------------------------------

describe("sendOrderEventEmail — send: FR locale", () => {
  beforeEach(() => setSmtpEnv());

  it("confirmed (FR) — sends with French subject", async () => {
    const result = await sendOrderEventEmail({
      state: "confirmed",
      appOrderId: ORDER_ID,
      customerEmail: CUSTOMER_EMAIL,
      lang: "fr",
    });
    expect(result).toEqual({ emailSent: true, emailSkipped: false });
    const call = sendMailMock.mock.calls[0][0] as Record<string, string>;
    expect(call.subject).toBe(`Commande confirmée ${ORDER_ID}`);
    expect(call.text).toContain("Presentail");
    expect(call.text).toContain(ORDER_ID);
  });

  it("confirmed (FR) — includes French order summary fields in body", async () => {
    await sendOrderEventEmail({
      state: "confirmed",
      appOrderId: ORDER_ID,
      customerEmail: CUSTOMER_EMAIL,
      lang: "fr",
      recipientName: "Marie",
      deliveryDate: "2026-07-01",
      deliverySlot: "Matinée",
      totalUsdCents: 8000,
      lineItems: [{ name: "Bouquet de roses", quantity: 1, priceUsdCents: 8000 }],
    });
    const body = (sendMailMock.mock.calls[0][0] as Record<string, string>).text;
    expect(body).toContain("Référence de commande");
    expect(body).toContain("Marie");
    expect(body).toContain("2026-07-01");
    expect(body).toContain("$80.00");
  });

  it("delivered (FR) — sends with French subject", async () => {
    const result = await sendOrderEventEmail({
      state: "delivered",
      appOrderId: ORDER_ID,
      customerEmail: CUSTOMER_EMAIL,
      lang: "fr",
      recipientName: "Émilie",
    });
    expect(result).toEqual({ emailSent: true, emailSkipped: false });
    const call = sendMailMock.mock.calls[0][0] as Record<string, string>;
    expect(call.subject).toBe(`Livraison effectuée — ${ORDER_ID}`);
    expect(call.text).toContain("livré");
    expect(call.text).toContain("Émilie");
  });
});

// ---------------------------------------------------------------------------
// Send: FROM address resolution
// ---------------------------------------------------------------------------

describe("sendOrderEventEmail — sender address", () => {
  it("uses EMAIL_FROM when set", async () => {
    setSmtpEnv({ EMAIL_FROM: "orders@presentail.com" });
    await sendOrderEventEmail({
      state: "confirmed",
      appOrderId: ORDER_ID,
      customerEmail: CUSTOMER_EMAIL,
    });
    const call = sendMailMock.mock.calls[0][0] as Record<string, string>;
    expect(call.from).toBe("orders@presentail.com");
  });

  it("falls back to SMTP_USER when EMAIL_FROM is unset", async () => {
    setSmtpEnv();
    delete process.env.EMAIL_FROM;
    await sendOrderEventEmail({
      state: "confirmed",
      appOrderId: ORDER_ID,
      customerEmail: CUSTOMER_EMAIL,
    });
    const call = sendMailMock.mock.calls[0][0] as Record<string, string>;
    expect(call.from).toBe("user@example.com");
  });
});

// ---------------------------------------------------------------------------
// Send: analytics events
// ---------------------------------------------------------------------------

describe("sendOrderEventEmail — analytics events", () => {
  beforeEach(() => setSmtpEnv());

  it("records email_notify_sent event on success", async () => {
    await sendOrderEventEmail({
      state: "confirmed",
      appOrderId: ORDER_ID,
      customerEmail: CUSTOMER_EMAIL,
    });
    // Give the fire-and-forget insert a microtask tick to resolve
    await Promise.resolve();
    expect(dbMock.insert).toHaveBeenCalledOnce();
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "email_notify_sent", productId: ORDER_ID }),
    );
  });

  it("records email_notify_failed event on send failure", async () => {
    sendMailMock.mockRejectedValueOnce(new Error("SMTP connection refused"));
    const result = await sendOrderEventEmail({
      state: "confirmed",
      appOrderId: ORDER_ID,
      customerEmail: CUSTOMER_EMAIL,
    });
    expect(result).toEqual({ emailSent: false, emailSkipped: false });
    await Promise.resolve();
    expect(dbMock.insert).toHaveBeenCalledOnce();
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "email_notify_failed",
        errorCode: expect.stringContaining("SMTP connection refused"),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Failure: nodemailer throws
// ---------------------------------------------------------------------------

describe("sendOrderEventEmail — send failure", () => {
  beforeEach(() => setSmtpEnv());

  it("returns emailSent: false, emailSkipped: false on SMTP failure", async () => {
    sendMailMock.mockRejectedValueOnce(new Error("Network timeout"));
    const result = await sendOrderEventEmail({
      state: "delivered",
      appOrderId: ORDER_ID,
      customerEmail: CUSTOMER_EMAIL,
    });
    expect(result).toEqual({ emailSent: false, emailSkipped: false });
  });

  it("never throws — error is caught internally", async () => {
    sendMailMock.mockRejectedValueOnce(new Error("Unexpected SMTP error"));
    await expect(
      sendOrderEventEmail({
        state: "confirmed",
        appOrderId: ORDER_ID,
        customerEmail: CUSTOMER_EMAIL,
      }),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Lang normalisation
// ---------------------------------------------------------------------------

describe("sendOrderEventEmail — lang normalisation", () => {
  beforeEach(() => setSmtpEnv());

  it("treats an unknown lang as 'en'", async () => {
    await sendOrderEventEmail({
      state: "confirmed",
      appOrderId: ORDER_ID,
      customerEmail: CUSTOMER_EMAIL,
      lang: "es",
    });
    const call = sendMailMock.mock.calls[0][0] as Record<string, string>;
    expect(call.subject).toBe(`Order confirmed — ${ORDER_ID}`);
  });

  it("treats null lang as 'en'", async () => {
    await sendOrderEventEmail({
      state: "confirmed",
      appOrderId: ORDER_ID,
      customerEmail: CUSTOMER_EMAIL,
      lang: null,
    });
    const call = sendMailMock.mock.calls[0][0] as Record<string, string>;
    expect(call.subject).toBe(`Order confirmed — ${ORDER_ID}`);
  });
});

// ---------------------------------------------------------------------------
// Currency-aware total formatting
// ---------------------------------------------------------------------------

describe("sendOrderEventEmail — currency-aware total", () => {
  beforeEach(() => setSmtpEnv());

  it("renders total as 'AUD 510.00' when currencyCode is AUD", async () => {
    await sendOrderEventEmail({
      state: "confirmed",
      appOrderId: ORDER_ID,
      customerEmail: CUSTOMER_EMAIL,
      lang: "en",
      totalUsdCents: 51000,
      currencyCode: "AUD",
    });
    const body = (sendMailMock.mock.calls[0][0] as Record<string, string>).text;
    expect(body).toContain("AUD 510.00");
    expect(body).not.toContain("$510.00");
  });

  it("renders total as '$150.00' when currencyCode is USD", async () => {
    await sendOrderEventEmail({
      state: "confirmed",
      appOrderId: ORDER_ID,
      customerEmail: CUSTOMER_EMAIL,
      lang: "en",
      totalUsdCents: 15000,
      currencyCode: "USD",
    });
    const body = (sendMailMock.mock.calls[0][0] as Record<string, string>).text;
    expect(body).toContain("$150.00");
    expect(body).not.toContain("USD 150.00");
  });

  it("falls back to '$' format when currencyCode is absent (legacy behaviour)", async () => {
    await sendOrderEventEmail({
      state: "confirmed",
      appOrderId: ORDER_ID,
      customerEmail: CUSTOMER_EMAIL,
      lang: "en",
      totalUsdCents: 10000,
      // No currencyCode
    });
    const body = (sendMailMock.mock.calls[0][0] as Record<string, string>).text;
    expect(body).toContain("$100.00");
  });

  it("omits line-item prices when currencyCode is non-USD (item prices are in USD, would be misleading)", async () => {
    await sendOrderEventEmail({
      state: "confirmed",
      appOrderId: ORDER_ID,
      customerEmail: CUSTOMER_EMAIL,
      lang: "en",
      totalUsdCents: 51000,
      currencyCode: "AUD",
      lineItems: [
        { name: "Rose Bouquet", quantity: 1, priceUsdCents: 15000 },
        { name: "Balloon", quantity: 2, priceUsdCents: 5000 },
      ],
    });
    const body = (sendMailMock.mock.calls[0][0] as Record<string, string>).text;
    // Item names still appear
    expect(body).toContain("Rose Bouquet");
    expect(body).toContain("Balloon");
    // But USD line-item prices are NOT shown
    expect(body).not.toContain("$150.00");
    expect(body).not.toContain("$50.00");
    // Order total IS shown in AUD
    expect(body).toContain("AUD 510.00");
  });

  it("includes line-item prices for USD orders", async () => {
    await sendOrderEventEmail({
      state: "confirmed",
      appOrderId: ORDER_ID,
      customerEmail: CUSTOMER_EMAIL,
      lang: "en",
      totalUsdCents: 15000,
      currencyCode: "USD",
      lineItems: [
        { name: "Rose Bouquet", quantity: 1, priceUsdCents: 15000 },
      ],
    });
    const body = (sendMailMock.mock.calls[0][0] as Record<string, string>).text;
    expect(body).toContain("Rose Bouquet");
    expect(body).toContain("$150.00");
  });

  it("renders AED total correctly for UAE customers", async () => {
    await sendOrderEventEmail({
      state: "confirmed",
      appOrderId: ORDER_ID,
      customerEmail: CUSTOMER_EMAIL,
      lang: "en",
      totalUsdCents: 50000,
      currencyCode: "AED",
    });
    const body = (sendMailMock.mock.calls[0][0] as Record<string, string>).text;
    expect(body).toContain("AED 500.00");
  });
});

// ---------------------------------------------------------------------------
// Tracking URL base
// ---------------------------------------------------------------------------

describe("sendOrderEventEmail — tracking URL", () => {
  it("uses SMS_TRACKING_URL_BASE when set", async () => {
    setSmtpEnv();
    process.env.SMS_TRACKING_URL_BASE = "https://track.example.com/orders";
    const result = await sendOrderEventEmail({
      state: "confirmed",
      appOrderId: ORDER_ID,
      customerEmail: CUSTOMER_EMAIL,
    });
    expect(result.emailSent).toBe(true);
    const body = (sendMailMock.mock.calls[0][0] as Record<string, string>).text;
    expect(body).toContain(`https://track.example.com/orders/${ORDER_ID}`);
  });

  it("defaults to https://presentail.com/orders when SMS_TRACKING_URL_BASE is unset", async () => {
    setSmtpEnv();
    const result = await sendOrderEventEmail({
      state: "delivered",
      appOrderId: ORDER_ID,
      customerEmail: CUSTOMER_EMAIL,
    });
    expect(result.emailSent).toBe(true);
    const body = (sendMailMock.mock.calls[0][0] as Record<string, string>).text;
    expect(body).toContain(`https://presentail.com/orders/${ORDER_ID}`);
  });
});
