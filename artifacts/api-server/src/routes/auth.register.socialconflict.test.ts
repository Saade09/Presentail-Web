import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Hoisted mock state — must be declared before vi.mock() factories
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  dbSelectResult: [] as any[],
  upsertCustomer: vi.fn(),
  signServerToken: vi.fn(),
  isWcAuthEnabled: vi.fn(),
  isClerkConfigured: vi.fn(),
  ensureClerkUserInBackground: vi.fn(),
  ensureClerkUserForCustomer: vi.fn(),
  resolveStoreFromRequest: vi.fn(),
  resolveStore: vi.fn(),
  wooAuthHeader: vi.fn(),
  authenticate: vi.fn(),
  decodeJwtPayload: vi.fn(),
  classifyAuthExists: vi.fn(),
  normalizeAuthExistsEmail: vi.fn(),
  recordAuthExistsOutcome: vi.fn(),
  fetch: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks (hoisted before imports)
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
}));

vi.mock("../lib/clerkUserSync", () => ({
  ensureClerkUserInBackground: (...args: any[]) => mocks.ensureClerkUserInBackground(...args),
  ensureClerkUserForCustomer: (...args: any[]) => mocks.ensureClerkUserForCustomer(...args),
  isClerkConfigured: () => mocks.isClerkConfigured(),
}));

vi.mock("../lib/auth-rate-limit", () => {
  const passThrough = (_req: any, _res: any, next: any) => next();
  return {
    existsIpLimiter: passThrough,
    loginIpLimiter: passThrough,
    registerIpLimiter: passThrough,
    resetRequestIpLimiter: passThrough,
    resetConfirmIpLimiter: passThrough,
    socialIpLimiter: passThrough,
    loginEmailLimiter: passThrough,
    resetEmailLimiter: passThrough,
    otpPhoneLimiter: passThrough,
    otpSendIpLimiter: passThrough,
  };
});

vi.mock("../lib/wooStore", () => ({
  resolveStoreFromRequest: (...args: any[]) => mocks.resolveStoreFromRequest(...args),
  resolveStore: (...args: any[]) => mocks.resolveStore(...args),
  wooAuthHeader: (...args: any[]) => mocks.wooAuthHeader(...args),
}));

vi.mock("../lib/authExists", () => ({
  classifyAuthExists: (...args: any[]) => mocks.classifyAuthExists(...args),
  normalizeAuthExistsEmail: (...args: any[]) => mocks.normalizeAuthExistsEmail(...args),
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

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(mocks.dbSelectResult),
        }),
      }),
    }),
    insert: () => ({ values: () => ({ returning: () => Promise.resolve([]) }) }),
    update: () => ({
      set: () => ({ where: () => Promise.resolve([]) }),
    }),
    delete: () => ({ where: () => Promise.resolve() }),
  },
  customersTable: {
    id: "id",
    email: "email",
    authProvider: "auth_provider",
    wcCustomerId: "wc_customer_id",
    emailVerificationToken: "email_verification_token",
    emailVerificationTokenExpiresAt: "email_verification_token_expires_at",
    updatedAt: "updated_at",
  },
  phoneOtpsTable: {
    phoneE164: "phone_e164",
    code: "code",
    expiresAt: "expires_at",
    used: "used",
  },
  CUSTOMER_GENDERS: ["male", "female", "other"],
}));

// ---------------------------------------------------------------------------
// Import router under test (after mocks are registered)
// ---------------------------------------------------------------------------

import authRouter from "./auth";

// ---------------------------------------------------------------------------
// Helpers
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

const VALID_BODY = {
  email: "shopper@example.com",
  password: "password123",
  firstName: "Ada",
  lastName: "Lovelace",
};

// ---------------------------------------------------------------------------
// Per-test reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();

  mocks.dbSelectResult = [];
  mocks.isWcAuthEnabled.mockReturnValue(false);
  mocks.isClerkConfigured.mockReturnValue(false);
  mocks.signServerToken.mockResolvedValue("server-session-jwt");
  mocks.upsertCustomer.mockResolvedValue({
    customer: {
      id: 42,
      email: VALID_BODY.email,
      firstName: "Ada",
      lastName: "Lovelace",
      phoneE164: null,
    },
  });
  mocks.resolveStoreFromRequest.mockReturnValue({
    baseUrl: "https://woo.example.com",
    consumerKey: "",
    consumerSecret: "",
    wpBaseUrl: "https://woo.example.com",
    currency: "USD",
    countryCode: "LB",
  });
  mocks.resolveStore.mockReturnValue({
    baseUrl: "https://woo.example.com",
    currency: "USD",
    countryCode: "LB",
  });

  vi.stubGlobal("fetch", mocks.fetch);
});

// ===========================================================================
// POST /auth/register — social-conflict error (registration_failed_social_account)
// ===========================================================================

describe("POST /auth/register — social conflict: email linked to Google", () => {
  it("returns 409 with code registration_failed_social_account and provider google", async () => {
    mocks.dbSelectResult = [{ id: 7, authProvider: "google" }];

    const app = buildApp();
    const res = await request(app)
      .post("/auth/register")
      .send(VALID_BODY);

    expect(res.status).toBe(409);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("registration_failed_social_account");
    expect(res.body.provider).toBe("google");
  });

  it("does not create a new customer when the social-conflict 409 is returned", async () => {
    mocks.dbSelectResult = [{ id: 7, authProvider: "google" }];

    const app = buildApp();
    await request(app)
      .post("/auth/register")
      .send(VALID_BODY);

    expect(mocks.upsertCustomer).not.toHaveBeenCalled();
  });

  it("includes a human-readable message in the 409 body", async () => {
    mocks.dbSelectResult = [{ id: 7, authProvider: "google" }];

    const app = buildApp();
    const res = await request(app)
      .post("/auth/register")
      .send(VALID_BODY);

    expect(typeof res.body.message).toBe("string");
    expect(res.body.message.length).toBeGreaterThan(0);
  });
});

describe("POST /auth/register — social conflict: email linked to Apple", () => {
  it("returns 409 with code registration_failed_social_account and provider apple", async () => {
    mocks.dbSelectResult = [{ id: 8, authProvider: "apple" }];

    const app = buildApp();
    const res = await request(app)
      .post("/auth/register")
      .send(VALID_BODY);

    expect(res.status).toBe(409);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("registration_failed_social_account");
    expect(res.body.provider).toBe("apple");
  });
});

describe("POST /auth/register — plain conflict: email already exists with password auth", () => {
  it("returns 409 with code registration_failed (no provider field) when authProvider is null", async () => {
    mocks.dbSelectResult = [{ id: 9, authProvider: null }];

    const app = buildApp();
    const res = await request(app)
      .post("/auth/register")
      .send(VALID_BODY);

    expect(res.status).toBe(409);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("registration_failed");
    expect(res.body.provider).toBeUndefined();
  });

  it("returns 409 with code registration_failed when authProvider is 'password'", async () => {
    mocks.dbSelectResult = [{ id: 10, authProvider: "password" }];

    const app = buildApp();
    const res = await request(app)
      .post("/auth/register")
      .send(VALID_BODY);

    expect(res.status).toBe(409);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("registration_failed");
    expect(res.body.provider).toBeUndefined();
  });
});

describe("POST /auth/register — successful registration (no existing email)", () => {
  it("returns 200 with a token when the email is new", async () => {
    mocks.dbSelectResult = [];

    const app = buildApp();
    const res = await request(app)
      .post("/auth/register")
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.token).toBe("server-session-jwt");
  });

  it("calls upsertCustomer with the submitted email, firstName, and lastName", async () => {
    mocks.dbSelectResult = [];

    const app = buildApp();
    await request(app)
      .post("/auth/register")
      .send(VALID_BODY);

    expect(mocks.upsertCustomer).toHaveBeenCalledOnce();
    const profile = mocks.upsertCustomer.mock.calls[0][0];
    expect(profile.email).toBe("shopper@example.com");
    expect(profile.firstName).toBe("Ada");
    expect(profile.lastName).toBe("Lovelace");
  });
});

describe("POST /auth/register — input validation", () => {
  it("returns 400 when email is missing", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ password: "password123", firstName: "Ada" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("returns 400 when password is missing", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ email: "shopper@example.com", firstName: "Ada" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("returns 400 when password is shorter than 8 characters", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ ...VALID_BODY, password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("password_too_short");
  });
});
