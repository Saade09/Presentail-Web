import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Hoisted mock state — must be declared before vi.mock() factories
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  dbSelectResult: [] as any[],
  // Per-call sequence: if set, each limit() call shifts from this array.
  // Existing tests that don't set this get the flat dbSelectResult as before.
  dbSelectResultByCall: [] as any[][],
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
          limit: () => {
            if (mocks.dbSelectResultByCall.length > 0) {
              return Promise.resolve(mocks.dbSelectResultByCall.shift()!);
            }
            return Promise.resolve(mocks.dbSelectResult);
          },
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
  mocks.dbSelectResultByCall = [];
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
// POST /auth/register — duplicate-email response (enumeration-hardened)
// HTTP 400 (not 409) so the status code itself is not an existence oracle.
// ===========================================================================

describe("POST /auth/register — duplicate email: social account (Google)", () => {
  it("returns 400 with generic code registration_failed (no social provider revealed)", async () => {
    mocks.dbSelectResult = [{ id: 7, authProvider: "google" }];

    const app = buildApp();
    const res = await request(app)
      .post("/auth/register")
      .send(VALID_BODY);

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("registration_failed");
    expect(res.body.provider).toBeUndefined();
  });

  it("does not create a new customer when duplicate-email 400 is returned", async () => {
    mocks.dbSelectResult = [{ id: 7, authProvider: "google" }];

    const app = buildApp();
    await request(app)
      .post("/auth/register")
      .send(VALID_BODY);

    expect(mocks.upsertCustomer).not.toHaveBeenCalled();
  });

  it("includes a human-readable message in the 400 body that does NOT reveal account existence", async () => {
    mocks.dbSelectResult = [{ id: 7, authProvider: "google" }];

    const app = buildApp();
    const res = await request(app)
      .post("/auth/register")
      .send(VALID_BODY);

    expect(typeof res.body.message).toBe("string");
    expect(res.body.message.length).toBeGreaterThan(0);
    // Message must not reveal that the email is already taken.
    expect(res.body.message).not.toMatch(/already exists/i);
    expect(res.body.message).not.toMatch(/in use/i);
    expect(res.body.message).not.toMatch(/taken/i);
  });
});

describe("POST /auth/register — duplicate email: social account (Apple)", () => {
  it("returns 400 with generic code registration_failed (no social provider revealed)", async () => {
    mocks.dbSelectResult = [{ id: 8, authProvider: "apple" }];

    const app = buildApp();
    const res = await request(app)
      .post("/auth/register")
      .send(VALID_BODY);

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("registration_failed");
    expect(res.body.provider).toBeUndefined();
  });
});

describe("POST /auth/register — duplicate email: password account", () => {
  it("returns 400 with code registration_failed (no provider field) when authProvider is null", async () => {
    mocks.dbSelectResult = [{ id: 9, authProvider: null }];

    const app = buildApp();
    const res = await request(app)
      .post("/auth/register")
      .send(VALID_BODY);

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("registration_failed");
    expect(res.body.provider).toBeUndefined();
  });

  it("returns 400 with code registration_failed when authProvider is 'password'", async () => {
    mocks.dbSelectResult = [{ id: 10, authProvider: "password" }];

    const app = buildApp();
    const res = await request(app)
      .post("/auth/register")
      .send(VALID_BODY);

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("registration_failed");
    expect(res.body.provider).toBeUndefined();
  });
});

describe("POST /auth/register — enumeration resistance: response must be indistinguishable for known vs unknown emails", () => {
  it("duplicate-email response (400) does not use the 409 status that directly signals existence", async () => {
    mocks.dbSelectResult = [{ id: 11, authProvider: "google" }];

    const app = buildApp();
    const res = await request(app)
      .post("/auth/register")
      .send(VALID_BODY);

    // 409 is the RFC-defined "Conflict" status — using it directly reveals the email exists.
    expect(res.status).not.toBe(409);
    // Must still be an error response.
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("registration_failed");
  });

  it("duplicate-email body does not contain an existence-revealing message", async () => {
    mocks.dbSelectResult = [{ id: 12, authProvider: null }];

    const app = buildApp();
    const res = await request(app)
      .post("/auth/register")
      .send(VALID_BODY);

    expect(res.body.message).not.toMatch(/already exists/i);
    expect(res.body.message).not.toMatch(/in use/i);
    expect(res.body).not.toHaveProperty("exists");
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

// ===========================================================================
// POST /auth/register — WC-path enumeration hardening
// When WC_AUTH_ENABLED=true the legacy path proxies the registration to
// WooCommerce. WC returns 409 + "already registered with your email" for
// duplicate emails — we must NOT forward that status or message.
// ===========================================================================

describe("POST /auth/register — WC path: duplicate-email response is enumeration-hardened", () => {
  beforeEach(() => {
    mocks.isWcAuthEnabled.mockReturnValue(true);
    process.env.WC_CONSUMER_KEY = "ck_test";
  });

  afterEach(() => {
    delete process.env.WC_CONSUMER_KEY;
  });

  it("returns 400 (not 409) when WC rejects with a duplicate-email conflict", async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        code: "registration-error-email-exists",
        message: "An account is already registered with your email address.",
      }),
    });

    const app = buildApp();
    const res = await request(app)
      .post("/auth/register")
      .send(VALID_BODY);

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("registration_failed");
  });

  it("does not forward WC duplicate-email message text to the caller", async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        code: "registration-error-email-exists",
        message: "An account is already registered with your email address.",
      }),
    });

    const app = buildApp();
    const res = await request(app)
      .post("/auth/register")
      .send(VALID_BODY);

    expect(res.body.message).not.toMatch(/already registered/i);
    expect(res.body.message).not.toMatch(/already exists/i);
    expect(res.body).not.toHaveProperty("exists");
  });

  it("uses the same 400 status for non-duplicate WC registration failures (indistinguishable)", async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        code: "registration-error-invalid-email",
        message: "Please provide a valid email address.",
      }),
    });

    const app = buildApp();
    const res = await request(app)
      .post("/auth/register")
      .send(VALID_BODY);

    // Both duplicate-email (WC 409) and other failures (WC 400) now return 400
    // so callers cannot distinguish them.
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("registration_failed");
  });
});

// ===========================================================================
// POST /auth/register — phone-fallback account-takeover prevention
// upsertCustomer() has a phone-fallback (step 3): if the submitted phone
// already belongs to a DIFFERENT customer, the upsert would silently bind
// the attacker's email to the victim's row.  The register route must reject
// this before calling upsertCustomer() and verify the result afterward.
// ===========================================================================

describe("POST /auth/register — phone-fallback ATO prevention (local path)", () => {
  it("returns 400 when the submitted phone already belongs to a different account", async () => {
    // First db call (email check): no duplicate email.
    // Second db call (phone conflict check): phone owned by a different user.
    mocks.dbSelectResultByCall = [
      [],
      [{ id: 99, email: "victim@example.com" }],
    ];

    const app = buildApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ ...VALID_BODY, phone: "+96170000001" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("registration_failed");
  });

  it("does NOT call upsertCustomer when phone conflict is detected", async () => {
    mocks.dbSelectResultByCall = [
      [],
      [{ id: 99, email: "victim@example.com" }],
    ];

    const app = buildApp();
    await request(app)
      .post("/auth/register")
      .send({ ...VALID_BODY, phone: "+96170000001" });

    expect(mocks.upsertCustomer).not.toHaveBeenCalled();
  });

  it("does not reveal account existence in the phone-conflict 400 response", async () => {
    mocks.dbSelectResultByCall = [
      [],
      [{ id: 99, email: "victim@example.com" }],
    ];

    const app = buildApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ ...VALID_BODY, phone: "+96170000001" });

    expect(res.body.message).not.toMatch(/already/i);
    expect(res.body.message).not.toMatch(/taken/i);
    expect(res.body).not.toHaveProperty("exists");
  });

  it("allows registration when the submitted phone does NOT conflict (both checks pass)", async () => {
    // First db call (email check): no duplicate email.
    // Second db call (phone check): no conflict (empty).
    mocks.dbSelectResultByCall = [[], []];

    const app = buildApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ ...VALID_BODY, phone: "+96170000001" });

    expect(mocks.upsertCustomer).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("allows registration when no phone is submitted (phone pre-check is skipped)", async () => {
    // Only one db call: email check returns no duplicate.
    mocks.dbSelectResult = [];

    const app = buildApp();
    const res = await request(app)
      .post("/auth/register")
      .send(VALID_BODY); // no phone field

    expect(mocks.upsertCustomer).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("returns 500 when upsertCustomer resolves to a different email (post-upsert guard)", async () => {
    // db checks both pass
    mocks.dbSelectResultByCall = [[], []];
    // upsertCustomer unexpectedly returns a row with a different email
    mocks.upsertCustomer.mockResolvedValue({
      customer: {
        id: 99,
        email: "victim@example.com", // NOT the submitted email
        firstName: "Victim",
        lastName: "User",
        phoneE164: "+96170000001",
      },
    });

    const app = buildApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ ...VALID_BODY, phone: "+96170000001" });

    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
    // Must NOT issue a session token for the wrong account.
    expect(mocks.signServerToken).not.toHaveBeenCalled();
  });
});
