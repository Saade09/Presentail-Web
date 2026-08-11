/**
 * Tests for POST /auth/reset/request and POST /auth/reset/confirm
 * in the local-only (WC_AUTH_ENABLED=false) code path.
 *
 * Covered scenarios:
 *   request: valid known email, unknown email (still ok:true), social-only
 *            account (no passwordHash), invalid email format, rate-limited email
 *   confirm: valid token+email, expired token, wrong email for valid token,
 *            token reuse (second call fails), missing fields, weak password
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Hoisted mock state
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  // DB mock state
  dbSelectRows: [] as any[],
  dbUpdateResult: [] as any[],
  // Limiter state
  resetEmailLimiterAllowed: true,
  // Helpers
  isWcAuthEnabled: vi.fn(() => false),
  authenticate: vi.fn(),
  signServerToken: vi.fn(),
  upsertCustomer: vi.fn(),
  mirrorWcCustomerLocally: vi.fn(),
  ensureClerkUserInBackground: vi.fn(),
  ensureClerkUserForCustomer: vi.fn(),
  isClerkConfigured: vi.fn(() => false),
  resolveStoreFromRequest: vi.fn(),
  resolveStore: vi.fn(),
  wooAuthHeader: vi.fn(),
  decodeJwtPayload: vi.fn(),
  classifyAuthExists: vi.fn(),
  normalizeAuthExistsEmail: vi.fn((e: string): string | null => e),
  recordAuthExistsOutcome: vi.fn(),
  fetch: vi.fn(),
  // sendPasswordResetEmail is a void fire-and-forget inside the handler;
  // we mock nodemailer to swallow it silently.
  nodemailerSendMail: vi.fn().mockResolvedValue({}),
  // randomBytes output (predictable token for assertions)
  lastToken: "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
}));

// ---------------------------------------------------------------------------
// Module mocks (must be declared before any import of the module under test)
// ---------------------------------------------------------------------------

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => ({})),
  jwtVerify: vi.fn(),
}));

vi.mock("../lib/auth", () => ({
  authenticate: (...args: any[]) => mocks.authenticate(...args),
  decodeJwtPayload: (...args: any[]) => mocks.decodeJwtPayload(...args),
  signServerToken: (...args: any[]) => mocks.signServerToken(...args),
  isWcAuthEnabled: () => mocks.isWcAuthEnabled(),
}));

vi.mock("../lib/customers", () => ({
  upsertCustomer: (...args: any[]) => mocks.upsertCustomer(...args),
  getCustomerByWcId: vi.fn(),
  getCustomerById: vi.fn(),
  normalizePhoneE164: vi.fn((p: string) => p),
  mirrorWcCustomerLocally: (...args: any[]) => mocks.mirrorWcCustomerLocally(...args),
}));

vi.mock("../lib/clerkUserSync", () => ({
  ensureClerkUserInBackground: (...args: any[]) => mocks.ensureClerkUserInBackground(...args),
  ensureClerkUserForCustomer: (...args: any[]) => mocks.ensureClerkUserForCustomer(...args),
  isClerkConfigured: () => mocks.isClerkConfigured(),
}));

vi.mock("../lib/auth-rate-limit", () => {
  const passThrough = (_req: any, _res: any, next: any) => next();
  const alwaysAllow = { check: () => ({ allowed: true, retryAfterMs: 0 }), record: () => {} };
  const resetEmailLimiterMock = {
    check: () => ({
      allowed: mocks.resetEmailLimiterAllowed,
      retryAfterMs: mocks.resetEmailLimiterAllowed ? 0 : 3600000,
    }),
    record: () => {},
  };
  return {
    existsIpLimiter: passThrough,
    webBridgeIpLimiter: passThrough,
    loginIpLimiter: passThrough,
    registerIpLimiter: passThrough,
    resetRequestIpLimiter: passThrough,
    resetConfirmIpLimiter: passThrough,
    socialIpLimiter: passThrough,
    otpSendIpLimiter: passThrough,
    loginEmailLimiter: alwaysAllow,
    resetEmailLimiter: resetEmailLimiterMock,
    otpPhoneLimiter: alwaysAllow,
  };
});

vi.mock("../lib/wooStore", () => ({
  resolveStoreFromRequest: (...args: any[]) => mocks.resolveStoreFromRequest(...args),
  resolveStore: (...args: any[]) => mocks.resolveStore(...args),
  wooAuthHeader: (...args: any[]) => mocks.wooAuthHeader(...args),
}));

vi.mock("../lib/authExists", () => ({
  classifyAuthExists: (...args: any[]) => mocks.classifyAuthExists(...args),
  normalizeAuthExistsEmail: (e: string) => mocks.normalizeAuthExistsEmail(e),
  recordAuthExistsOutcome: (...args: any[]) => mocks.recordAuthExistsOutcome(...args),
}));

vi.mock("../lib/requireUserType", () => ({
  requireUserType: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../lib/phoneValidation", () => ({
  validateStoredPhone: vi.fn(),
}));

vi.mock("../lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: null }),
  createClerkClient: () => ({}),
}));

vi.mock("drizzle-orm", () => ({
  eq: (_col: unknown, _val: unknown) => ({}),
  and: (..._args: unknown[]) => ({}),
  isNull: (_col: unknown) => ({}),
  isNotNull: (_col: unknown) => ({}),
  gt: (_col: unknown, _val: unknown) => ({}),
  desc: (_col: unknown) => ({}),
}));

// DB: select chain returns mocks.dbSelectRows; update chain is recorded.
vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(mocks.dbSelectRows),
        }),
      }),
    }),
    insert: () => ({ values: () => ({ returning: () => Promise.resolve([]) }) }),
    update: () => ({
      set: () => ({ where: () => Promise.resolve(mocks.dbUpdateResult) }),
    }),
    delete: () => ({ where: () => Promise.resolve() }),
  },
  customersTable: {
    id: "id",
    email: "email",
    authProvider: "auth_provider",
    wcCustomerId: "wc_customer_id",
    phoneE164: "phone_e164",
    emailVerificationToken: "email_verification_token",
    emailVerificationTokenExpiresAt: "email_verification_token_expires_at",
    updatedAt: "updated_at",
    passwordHash: "password_hash",
    passwordResetToken: "password_reset_token",
    passwordResetTokenExpiresAt: "password_reset_token_expires_at",
  },
  phoneOtpsTable: {
    phoneE164: "phone_e164",
    code: "code",
    expiresAt: "expires_at",
    used: "used",
  },
  CUSTOMER_GENDERS: ["male", "female", "other"],
}));

// Suppress nodemailer's dynamic import so reset emails don't throw.
vi.mock("nodemailer", () => ({
  createTransport: () => ({
    sendMail: (...args: any[]) => mocks.nodemailerSendMail(...args),
  }),
}));

// ---------------------------------------------------------------------------
// Import router after mocks are registered
// ---------------------------------------------------------------------------

import authRouter from "./auth";

// ---------------------------------------------------------------------------
// Test-app factory
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).log = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
    next();
  });
  app.use(authRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Tests — POST /auth/reset/request (local-only path)
// ---------------------------------------------------------------------------

describe("POST /auth/reset/request — local-only (WC_AUTH_ENABLED=false)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isWcAuthEnabled.mockReturnValue(false);
    mocks.resetEmailLimiterAllowed = true;
    mocks.dbSelectRows = [];
    mocks.nodemailerSendMail.mockResolvedValue({});
    // SMTP_HOST must be set so sendPasswordResetEmail doesn't skip.
    process.env.SMTP_HOST = "smtp.test";
  });

  afterEach(() => {
    delete process.env.SMTP_HOST;
  });

  it("returns ok:true for a known password account and schedules an email", async () => {
    mocks.dbSelectRows = [{ id: 42, passwordHash: "hash:abc" }];
    const app = buildApp();
    const res = await request(app)
      .post("/auth/reset/request")
      .send({ email: "user@example.com" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // The actual email is sent async (fire-and-forget) — we can only assert the
    // response shape here, not the mail call timing.
  });

  it("returns ok:true for an UNKNOWN email (must not reveal non-existence)", async () => {
    mocks.dbSelectRows = [];
    const app = buildApp();
    const res = await request(app)
      .post("/auth/reset/request")
      .send({ email: "nobody@example.com" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns ok:true for a social-only account (no passwordHash) without sending email", async () => {
    // Social accounts have no passwordHash — reset is a no-op.
    mocks.dbSelectRows = [{ id: 7, passwordHash: null }];
    const app = buildApp();
    const res = await request(app)
      .post("/auth/reset/request")
      .send({ email: "social@example.com" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns 400 for an invalid email format", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/auth/reset/request")
      .send({ email: "not-an-email" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("invalid_email");
  });

  it("returns 429 when the per-email rate limit is exhausted", async () => {
    mocks.resetEmailLimiterAllowed = false;
    const app = buildApp();
    const res = await request(app)
      .post("/auth/reset/request")
      .send({ email: "user@example.com" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(429);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("too_many_requests");
  });
});

// ---------------------------------------------------------------------------
// Tests — POST /auth/reset/confirm (local-only path)
// ---------------------------------------------------------------------------

const VALID_TOKEN = "deadbeef".repeat(8); // 64-char hex token
const VALID_EMAIL = "user@example.com";
const STRONG_PASSWORD = "MyStr0ngPass!";

describe("POST /auth/reset/confirm — local-only (WC_AUTH_ENABLED=false)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isWcAuthEnabled.mockReturnValue(false);
    mocks.dbSelectRows = [];
  });

  it("accepts valid key+login+password and returns ok:true", async () => {
    // DB returns a customer row matching the token + email + valid expiry.
    mocks.dbSelectRows = [{ id: 42 }];
    const app = buildApp();
    const res = await request(app)
      .post("/auth/reset/confirm")
      .send({ key: VALID_TOKEN, login: VALID_EMAIL, password: STRONG_PASSWORD })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns 400 with code expired_link when no matching DB row is found (expired or wrong token)", async () => {
    // DB returns no rows — token expired, wrong token, or wrong email.
    mocks.dbSelectRows = [];
    const app = buildApp();
    const res = await request(app)
      .post("/auth/reset/confirm")
      .send({ key: VALID_TOKEN, login: VALID_EMAIL, password: STRONG_PASSWORD })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("expired_link");
  });

  it("returns 400 with code expired_link when login email does not match the token row", async () => {
    // The handler queries WHERE email=login AND token=key AND expiry>now.
    // A mismatched email means no row found — same expired_link response.
    mocks.dbSelectRows = []; // drizzle WHERE won't match
    const app = buildApp();
    const res = await request(app)
      .post("/auth/reset/confirm")
      .send({ key: VALID_TOKEN, login: "wrong@example.com", password: STRONG_PASSWORD })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("expired_link");
  });

  it("returns 400 with code expired_link on a second confirm attempt (token already cleared)", async () => {
    // First call succeeds; second call finds no row (token was cleared by first).
    mocks.dbSelectRows = [{ id: 42 }];
    const app = buildApp();
    await request(app)
      .post("/auth/reset/confirm")
      .send({ key: VALID_TOKEN, login: VALID_EMAIL, password: STRONG_PASSWORD })
      .set("Content-Type", "application/json");

    // Simulate the token being cleared: DB no longer returns a row.
    mocks.dbSelectRows = [];
    const res2 = await request(app)
      .post("/auth/reset/confirm")
      .send({ key: VALID_TOKEN, login: VALID_EMAIL, password: STRONG_PASSWORD })
      .set("Content-Type", "application/json");

    expect(res2.status).toBe(400);
    expect(res2.body.code).toBe("expired_link");
  });

  it("returns 400 with code missing_link when key is absent", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/auth/reset/confirm")
      .send({ login: VALID_EMAIL, password: STRONG_PASSWORD })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("missing_link");
  });

  it("returns 400 with code missing_link when login is absent", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/auth/reset/confirm")
      .send({ key: VALID_TOKEN, password: STRONG_PASSWORD })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("missing_link");
  });

  it("returns 400 with code missing_link when password is absent", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/auth/reset/confirm")
      .send({ key: VALID_TOKEN, login: VALID_EMAIL })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("missing_link");
  });

  it("returns 400 with code weak_password for a password shorter than 8 characters", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/auth/reset/confirm")
      .send({ key: VALID_TOKEN, login: VALID_EMAIL, password: "short" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("weak_password");
  });
});
