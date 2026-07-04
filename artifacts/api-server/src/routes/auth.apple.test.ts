import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Hoisted mock state — must be declared before vi.mock() factories
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  jwtVerify: vi.fn(),
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
}));

// ---------------------------------------------------------------------------
// Module mocks (hoisted before imports)
// ---------------------------------------------------------------------------

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => ({})),
  jwtVerify: (...args: any[]) => mocks.jwtVerify(...args),
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
  gt: (_col: unknown, _val: unknown) => ({}),
  desc: (_col: unknown) => ({}),
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    insert: () => ({ values: () => ({ returning: () => Promise.resolve([]) }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }) }),
    delete: () => ({ where: () => Promise.resolve() }),
  },
  customersTable: { id: "id", email: "email", wcId: "wc_id" },
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

const FAKE_TOKEN = "fake.jwt.token";
const FAKE_SESSION_TOKEN = "server-session-jwt";
const FAKE_EMAIL = "shopper@example.com";
const FAKE_CUSTOMER = {
  id: 7,
  email: FAKE_EMAIL,
  firstName: "John",
  lastName: "Doe",
  phoneE164: null,
  gender: null,
  birthday: null,
};

// ---------------------------------------------------------------------------
// Per-test reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();

  mocks.isWcAuthEnabled.mockReturnValue(false);
  mocks.isClerkConfigured.mockReturnValue(false);
  mocks.signServerToken.mockResolvedValue(FAKE_SESSION_TOKEN);
  mocks.upsertCustomer.mockResolvedValue({ customer: FAKE_CUSTOMER });
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
    consumerKey: "",
    consumerSecret: "",
    currency: "USD",
    countryCode: "LB",
  });

  // Default: jwtVerify succeeds with a valid email payload
  mocks.jwtVerify.mockResolvedValue({
    payload: { email: FAKE_EMAIL, sub: "apple.user.001" },
  });
});

afterEach(() => {
  delete process.env.APPLE_SERVICE_IDS;
  delete process.env.APPLE_CLIENT_IDS;
});

// ===========================================================================
// POST /auth/oauth/apple — web OAuth flow
// ===========================================================================

describe("POST /auth/oauth/apple — 503 guard when APPLE_SERVICE_IDS is not configured", () => {
  it("returns 503 when APPLE_SERVICE_IDS env var is absent", async () => {
    delete process.env.APPLE_SERVICE_IDS;

    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/apple")
      .send({ idToken: FAKE_TOKEN });

    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(mocks.jwtVerify).not.toHaveBeenCalled();
  });

  it("returns 503 when APPLE_SERVICE_IDS is an empty string", async () => {
    process.env.APPLE_SERVICE_IDS = "";

    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/apple")
      .send({ idToken: FAKE_TOKEN });

    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
  });
});

describe("POST /auth/oauth/apple — request validation", () => {
  beforeEach(() => {
    process.env.APPLE_SERVICE_IDS = "com.new.presentail";
  });

  it("returns 400 when idToken is missing", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/apple")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(mocks.jwtVerify).not.toHaveBeenCalled();
  });

  it("returns 401 when jwtVerify throws (invalid token)", async () => {
    mocks.jwtVerify.mockRejectedValue(new Error("signature verification failed"));

    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/apple")
      .send({ idToken: "bad.token.here" });

    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it("returns 400 when the verified token has no email", async () => {
    mocks.jwtVerify.mockResolvedValue({ payload: { sub: "apple.001" } });

    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/apple")
      .send({ idToken: FAKE_TOKEN });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});

describe("POST /auth/oauth/apple — first-time sign-in with user object (web shape)", () => {
  beforeEach(() => {
    process.env.APPLE_SERVICE_IDS = "com.new.presentail";
  });

  it("extracts firstName and lastName from user.name on the initial sign-in", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/apple")
      .send({
        idToken: FAKE_TOKEN,
        user: { name: { firstName: "Alice", lastName: "Wonderland" } },
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.token).toBe(FAKE_SESSION_TOKEN);

    expect(mocks.upsertCustomer).toHaveBeenCalledOnce();
    const profile = mocks.upsertCustomer.mock.calls[0][0];
    expect(profile.firstName).toBe("Alice");
    expect(profile.lastName).toBe("Wonderland");
    expect(profile.email).toBe(FAKE_EMAIL);
  });

  it("also accepts the mobile fullName shape on first sign-in", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/apple")
      .send({
        idToken: FAKE_TOKEN,
        fullName: { givenName: "Bob", familyName: "Builder" },
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const profile = mocks.upsertCustomer.mock.calls[0][0];
    expect(profile.firstName).toBe("Bob");
    expect(profile.lastName).toBe("Builder");
  });

  it("prefers user.name over fullName when both are present", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/apple")
      .send({
        idToken: FAKE_TOKEN,
        user: { name: { firstName: "Primary", lastName: "Name" } },
        fullName: { givenName: "Fallback", familyName: "Name" },
      });

    expect(res.status).toBe(200);
    const profile = mocks.upsertCustomer.mock.calls[0][0];
    expect(profile.firstName).toBe("Primary");
  });

  it("accepts id_token as an alias for idToken", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/apple")
      .send({
        id_token: FAKE_TOKEN,
        user: { name: { firstName: "Carol", lastName: "Danvers" } },
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe("POST /auth/oauth/apple — returning sign-in with no user object", () => {
  beforeEach(() => {
    process.env.APPLE_SERVICE_IDS = "com.new.presentail";
  });

  it("succeeds and passes empty name strings when user object is absent", async () => {
    mocks.upsertCustomer.mockResolvedValue({
      customer: { ...FAKE_CUSTOMER, firstName: "", lastName: "" },
    });

    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/apple")
      .send({ idToken: FAKE_TOKEN });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.token).toBe(FAKE_SESSION_TOKEN);

    expect(mocks.upsertCustomer).toHaveBeenCalledOnce();
    const profile = mocks.upsertCustomer.mock.calls[0][0];
    expect(profile.firstName).toBe("");
    expect(profile.lastName).toBe("");
    expect(profile.email).toBe(FAKE_EMAIL);
  });

  it("succeeds when user object is explicitly null (Apple sends null after first sign-in)", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/apple")
      .send({ idToken: FAKE_TOKEN, user: null });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const profile = mocks.upsertCustomer.mock.calls[0][0];
    expect(profile.firstName).toBe("");
    expect(profile.lastName).toBe("");
  });

  it("returns a user object in the response body on successful sign-in", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/apple")
      .send({ idToken: FAKE_TOKEN });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: FAKE_CUSTOMER.id,
      email: FAKE_EMAIL,
    });
  });

  it("uses APPLE_SERVICE_IDS as the jwtVerify audience", async () => {
    process.env.APPLE_SERVICE_IDS = "com.new.presentail";

    const app = buildApp();
    await request(app)
      .post("/auth/oauth/apple")
      .send({ idToken: FAKE_TOKEN });

    expect(mocks.jwtVerify).toHaveBeenCalledOnce();
    const [_token, _jwks, options] = mocks.jwtVerify.mock.calls[0];
    expect(options.audience).toContain("com.new.presentail");
    expect(options.issuer).toBe("https://appleid.apple.com");
  });
});

// ===========================================================================
// POST /auth/social/apple — mobile iOS flow
// ===========================================================================

describe("POST /auth/social/apple — request validation", () => {
  it("returns 400 when identityToken is missing", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/auth/social/apple")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(mocks.jwtVerify).not.toHaveBeenCalled();
  });

  it("returns 401 when jwtVerify throws (invalid or expired token)", async () => {
    mocks.jwtVerify.mockRejectedValue(new Error("JWTExpired"));

    const app = buildApp();
    const res = await request(app)
      .post("/auth/social/apple")
      .send({ identityToken: "expired.ios.token" });

    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it("returns 400 when the token payload has no email", async () => {
    mocks.jwtVerify.mockResolvedValue({ payload: { sub: "apple.ios.001" } });

    const app = buildApp();
    const res = await request(app)
      .post("/auth/social/apple")
      .send({ identityToken: FAKE_TOKEN });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});

describe("POST /auth/social/apple — valid iOS token", () => {
  it("returns 200 with a session token for a valid identityToken", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/auth/social/apple")
      .send({ identityToken: FAKE_TOKEN });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.token).toBe(FAKE_SESSION_TOKEN);
    expect(res.body.user).toMatchObject({ email: FAKE_EMAIL });
  });

  it("extracts givenName and familyName from fullName on first sign-in", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/auth/social/apple")
      .send({
        identityToken: FAKE_TOKEN,
        fullName: { givenName: "Fatima", familyName: "Hassan" },
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const profile = mocks.upsertCustomer.mock.calls[0][0];
    expect(profile.firstName).toBe("Fatima");
    expect(profile.lastName).toBe("Hassan");
  });

  it("succeeds with empty name strings when fullName is absent (returning user)", async () => {
    mocks.upsertCustomer.mockResolvedValue({
      customer: { ...FAKE_CUSTOMER, firstName: "", lastName: "" },
    });

    const app = buildApp();
    const res = await request(app)
      .post("/auth/social/apple")
      .send({ identityToken: FAKE_TOKEN });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const profile = mocks.upsertCustomer.mock.calls[0][0];
    expect(profile.firstName).toBe("");
    expect(profile.lastName).toBe("");
  });

  it("succeeds when fullName is explicitly null (Apple omits it for returning users)", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/auth/social/apple")
      .send({ identityToken: FAKE_TOKEN, fullName: null });

    expect(res.status).toBe(200);
    const profile = mocks.upsertCustomer.mock.calls[0][0];
    expect(profile.firstName).toBe("");
    expect(profile.lastName).toBe("");
  });
});

describe("POST /auth/social/apple — APPLE_CLIENT_IDS audience", () => {
  afterEach(() => {
    delete process.env.APPLE_CLIENT_IDS;
  });

  it("uses APPLE_CLIENT_IDS env var as the jwtVerify audience when set", async () => {
    process.env.APPLE_CLIENT_IDS = "com.presentail.lb";

    const app = buildApp();
    await request(app)
      .post("/auth/social/apple")
      .send({ identityToken: FAKE_TOKEN });

    expect(mocks.jwtVerify).toHaveBeenCalledOnce();
    const [_token, _jwks, options] = mocks.jwtVerify.mock.calls[0];
    expect(options.audience).toContain("com.presentail.lb");
  });

  it("falls back to the hardcoded default audiences when APPLE_CLIENT_IDS is not set", async () => {
    delete process.env.APPLE_CLIENT_IDS;

    const app = buildApp();
    await request(app)
      .post("/auth/social/apple")
      .send({ identityToken: FAKE_TOKEN });

    expect(mocks.jwtVerify).toHaveBeenCalledOnce();
    const [_token, _jwks, options] = mocks.jwtVerify.mock.calls[0];
    // Hardcoded fallback contains both default audiences
    expect(options.audience).toContain("presentail");
    expect(options.audience).toContain("com.presentail.lb");
  });

  it("accepts a comma-separated list in APPLE_CLIENT_IDS (multiple bundle IDs)", async () => {
    process.env.APPLE_CLIENT_IDS = "com.presentail.lb,com.presentail.ae";

    const app = buildApp();
    await request(app)
      .post("/auth/social/apple")
      .send({ identityToken: FAKE_TOKEN });

    const [_token, _jwks, options] = mocks.jwtVerify.mock.calls[0];
    expect(options.audience).toContain("com.presentail.lb");
    expect(options.audience).toContain("com.presentail.ae");
  });
});
