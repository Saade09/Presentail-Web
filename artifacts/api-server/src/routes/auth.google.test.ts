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
  // global fetch used by the accessToken two-step flow
  fetch: vi.fn(),
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

const FAKE_TOKEN = "fake.google.jwt.token";
const FAKE_SESSION_TOKEN = "server-session-jwt";
const FAKE_EMAIL = "shopper@example.com";
const FAKE_CUSTOMER = {
  id: 42,
  email: FAKE_EMAIL,
  firstName: "Jane",
  lastName: "Smith",
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

  // Default: jwtVerify resolves with a verified email payload
  mocks.jwtVerify.mockResolvedValue({
    payload: {
      email: FAKE_EMAIL,
      email_verified: true,
      sub: "google.user.001",
      given_name: "Jane",
      family_name: "Smith",
    },
  });

  // Replace the global fetch used by the accessToken two-step flow
  vi.stubGlobal("fetch", mocks.fetch);
});

afterEach(() => {
  delete process.env.GOOGLE_CLIENT_IDS;
  delete process.env.GOOGLE_WEB_CLIENT_IDS;
  vi.unstubAllGlobals();
});

// ===========================================================================
// POST /auth/social/google — mobile ID token flow
// ===========================================================================

describe("POST /auth/social/google — 503 guard when GOOGLE_CLIENT_IDS is not configured", () => {
  it("returns 503 when GOOGLE_CLIENT_IDS env var is absent", async () => {
    delete process.env.GOOGLE_CLIENT_IDS;

    const app = buildApp();
    const res = await request(app)
      .post("/auth/social/google")
      .send({ idToken: FAKE_TOKEN });

    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(mocks.jwtVerify).not.toHaveBeenCalled();
  });

  it("returns 503 when GOOGLE_CLIENT_IDS is an empty string", async () => {
    process.env.GOOGLE_CLIENT_IDS = "";

    const app = buildApp();
    const res = await request(app)
      .post("/auth/social/google")
      .send({ idToken: FAKE_TOKEN });

    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
  });
});

describe("POST /auth/social/google — request validation", () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_IDS = "123456.apps.googleusercontent.com";
  });

  it("returns 400 when idToken is missing", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/auth/social/google")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(mocks.jwtVerify).not.toHaveBeenCalled();
  });

  it("returns 401 when jwtVerify throws (invalid or expired token)", async () => {
    mocks.jwtVerify.mockRejectedValue(new Error("JWTExpired"));

    const app = buildApp();
    const res = await request(app)
      .post("/auth/social/google")
      .send({ idToken: "bad.token.here" });

    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it("returns 401 when email_verified is explicitly false", async () => {
    mocks.jwtVerify.mockResolvedValue({
      payload: {
        email: FAKE_EMAIL,
        email_verified: false,
        sub: "google.user.002",
      },
    });

    const app = buildApp();
    const res = await request(app)
      .post("/auth/social/google")
      .send({ idToken: FAKE_TOKEN });

    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
    expect(res.body.message).toMatch(/not verified/i);
  });

  it("returns 400 when the verified token has no email", async () => {
    mocks.jwtVerify.mockResolvedValue({
      payload: { sub: "google.user.003", email_verified: true },
    });

    const app = buildApp();
    const res = await request(app)
      .post("/auth/social/google")
      .send({ idToken: FAKE_TOKEN });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});

describe("POST /auth/social/google — valid first-time sign-in", () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_IDS = "123456.apps.googleusercontent.com";
  });

  it("returns 200 with a session token for a valid ID token", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/auth/social/google")
      .send({ idToken: FAKE_TOKEN });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.token).toBe(FAKE_SESSION_TOKEN);
  });

  it("extracts given_name and family_name from the token payload", async () => {
    mocks.jwtVerify.mockResolvedValue({
      payload: {
        email: FAKE_EMAIL,
        email_verified: true,
        sub: "google.user.001",
        given_name: "Layla",
        family_name: "Hassan",
      },
    });

    const app = buildApp();
    const res = await request(app)
      .post("/auth/social/google")
      .send({ idToken: FAKE_TOKEN });

    expect(res.status).toBe(200);
    const profile = mocks.upsertCustomer.mock.calls[0][0];
    expect(profile.firstName).toBe("Layla");
    expect(profile.lastName).toBe("Hassan");
    expect(profile.email).toBe(FAKE_EMAIL);
  });

  it("returns a user object in the response body on success", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/auth/social/google")
      .send({ idToken: FAKE_TOKEN });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: FAKE_CUSTOMER.id,
      email: FAKE_EMAIL,
    });
  });

  it("handles returning user with no name fields in payload", async () => {
    mocks.jwtVerify.mockResolvedValue({
      payload: {
        email: FAKE_EMAIL,
        email_verified: true,
        sub: "google.user.001",
      },
    });
    mocks.upsertCustomer.mockResolvedValue({
      customer: { ...FAKE_CUSTOMER, firstName: "", lastName: "" },
    });

    const app = buildApp();
    const res = await request(app)
      .post("/auth/social/google")
      .send({ idToken: FAKE_TOKEN });

    expect(res.status).toBe(200);
    const profile = mocks.upsertCustomer.mock.calls[0][0];
    expect(profile.firstName).toBe("");
    expect(profile.lastName).toBe("");
  });
});

describe("POST /auth/social/google — GOOGLE_CLIENT_IDS audience", () => {
  it("uses GOOGLE_CLIENT_IDS as the jwtVerify audience", async () => {
    process.env.GOOGLE_CLIENT_IDS = "my-ios-client.apps.googleusercontent.com";

    const app = buildApp();
    await request(app)
      .post("/auth/social/google")
      .send({ idToken: FAKE_TOKEN });

    expect(mocks.jwtVerify).toHaveBeenCalledOnce();
    const [_token, _jwks, options] = mocks.jwtVerify.mock.calls[0];
    expect(options.audience).toContain("my-ios-client.apps.googleusercontent.com");
  });

  it("accepts a comma-separated list in GOOGLE_CLIENT_IDS (multiple client IDs)", async () => {
    process.env.GOOGLE_CLIENT_IDS =
      "ios-client.apps.googleusercontent.com,android-client.apps.googleusercontent.com";

    const app = buildApp();
    await request(app)
      .post("/auth/social/google")
      .send({ idToken: FAKE_TOKEN });

    const [_token, _jwks, options] = mocks.jwtVerify.mock.calls[0];
    expect(options.audience).toContain("ios-client.apps.googleusercontent.com");
    expect(options.audience).toContain("android-client.apps.googleusercontent.com");
  });

  it("passes both Google issuer forms to jwtVerify", async () => {
    process.env.GOOGLE_CLIENT_IDS = "123456.apps.googleusercontent.com";

    const app = buildApp();
    await request(app)
      .post("/auth/social/google")
      .send({ idToken: FAKE_TOKEN });

    const [_token, _jwks, options] = mocks.jwtVerify.mock.calls[0];
    expect(options.issuer).toContain("https://accounts.google.com");
    expect(options.issuer).toContain("accounts.google.com");
  });
});

// ===========================================================================
// POST /auth/oauth/google — web OAuth flow
// ===========================================================================

// ---------------------------------------------------------------------------
// id_token path (Google Identity Services One Tap / credential field)
// ---------------------------------------------------------------------------

describe("POST /auth/oauth/google — id_token path", () => {
  beforeEach(() => {
    process.env.GOOGLE_WEB_CLIENT_IDS = "web-client.apps.googleusercontent.com";
  });

  it("returns 200 with a session token when credential is a valid ID token", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/google")
      .send({ credential: FAKE_TOKEN });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.token).toBe(FAKE_SESSION_TOKEN);
  });

  it("accepts idToken as an alias for credential", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/google")
      .send({ idToken: FAKE_TOKEN });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("accepts id_token as an alias for credential", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/google")
      .send({ id_token: FAKE_TOKEN });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns 401 when jwtVerify throws on the credential path", async () => {
    mocks.jwtVerify.mockRejectedValue(new Error("signature mismatch"));

    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/google")
      .send({ credential: FAKE_TOKEN });

    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it("returns 503 when GOOGLE_WEB_CLIENT_IDS and GOOGLE_CLIENT_IDS are both absent (id_token path)", async () => {
    delete process.env.GOOGLE_WEB_CLIENT_IDS;
    delete process.env.GOOGLE_CLIENT_IDS;

    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/google")
      .send({ credential: FAKE_TOKEN });

    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(mocks.jwtVerify).not.toHaveBeenCalled();
  });

  it("uses GOOGLE_WEB_CLIENT_IDS as the jwtVerify audience when set", async () => {
    process.env.GOOGLE_WEB_CLIENT_IDS = "web-client.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_IDS = "ios-client.apps.googleusercontent.com";

    const app = buildApp();
    await request(app)
      .post("/auth/oauth/google")
      .send({ credential: FAKE_TOKEN });

    const [_token, _jwks, options] = mocks.jwtVerify.mock.calls[0];
    expect(options.audience).toContain("web-client.apps.googleusercontent.com");
    expect(options.audience).not.toContain("ios-client.apps.googleusercontent.com");
  });

  it("falls back to GOOGLE_CLIENT_IDS when GOOGLE_WEB_CLIENT_IDS is absent (id_token path)", async () => {
    delete process.env.GOOGLE_WEB_CLIENT_IDS;
    process.env.GOOGLE_CLIENT_IDS = "ios-client.apps.googleusercontent.com";

    const app = buildApp();
    await request(app)
      .post("/auth/oauth/google")
      .send({ credential: FAKE_TOKEN });

    const [_token, _jwks, options] = mocks.jwtVerify.mock.calls[0];
    expect(options.audience).toContain("ios-client.apps.googleusercontent.com");
  });
});

// ---------------------------------------------------------------------------
// accessToken two-step path (OAuth2 popup flow)
// ---------------------------------------------------------------------------

function makeTokenInfoResponse(overrides: Record<string, string> = {}) {
  return {
    ok: true,
    json: async () => ({
      aud: "web-client.apps.googleusercontent.com",
      azp: "",
      ...overrides,
    }),
  } as unknown as Response;
}

function makeUserInfoResponse(overrides: Record<string, any> = {}) {
  return {
    ok: true,
    json: async () => ({
      email: FAKE_EMAIL,
      email_verified: true,
      given_name: "Jane",
      family_name: "Smith",
      ...overrides,
    }),
  } as unknown as Response;
}

describe("POST /auth/oauth/google — accessToken two-step path", () => {
  beforeEach(() => {
    process.env.GOOGLE_WEB_CLIENT_IDS = "web-client.apps.googleusercontent.com";

    // Default: both tokeninfo and userinfo succeed
    mocks.fetch
      .mockResolvedValueOnce(makeTokenInfoResponse())
      .mockResolvedValueOnce(makeUserInfoResponse());
  });

  it("returns 200 with a session token when tokeninfo and userinfo both succeed", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/google")
      .send({ accessToken: "valid-access-token" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.token).toBe(FAKE_SESSION_TOKEN);
    expect(mocks.jwtVerify).not.toHaveBeenCalled();
  });

  it("calls tokeninfo with the access token URL-encoded", async () => {
    const app = buildApp();
    await request(app)
      .post("/auth/oauth/google")
      .send({ accessToken: "my-access-token" });

    const tokenInfoCall = mocks.fetch.mock.calls[0];
    expect(tokenInfoCall[0]).toMatch(/tokeninfo\?access_token=my-access-token/);
  });

  it("calls userinfo with a Bearer Authorization header", async () => {
    const app = buildApp();
    await request(app)
      .post("/auth/oauth/google")
      .send({ accessToken: "my-access-token" });

    const userInfoCall = mocks.fetch.mock.calls[1];
    expect(userInfoCall[0]).toMatch(/oauth2.*userinfo/);
    expect(userInfoCall[1].headers.Authorization).toBe("Bearer my-access-token");
  });

  it("returns 503 when GOOGLE_WEB_CLIENT_IDS and GOOGLE_CLIENT_IDS are both absent (accessToken path)", async () => {
    delete process.env.GOOGLE_WEB_CLIENT_IDS;
    delete process.env.GOOGLE_CLIENT_IDS;

    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/google")
      .send({ accessToken: "any-token" });

    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("returns 401 when tokeninfo returns a non-OK HTTP status", async () => {
    mocks.fetch.mockReset();
    mocks.fetch.mockResolvedValueOnce({ ok: false, status: 400 } as unknown as Response);

    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/google")
      .send({ accessToken: "expired-token" });

    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it("returns 401 when tokeninfo fetch throws a network error", async () => {
    mocks.fetch.mockReset();
    mocks.fetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/google")
      .send({ accessToken: "any-token" });

    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it("returns 401 when token audience does not match any configured client ID (cross-client replay)", async () => {
    mocks.fetch.mockReset();
    // tokeninfo returns a different client ID — replay token from another app
    mocks.fetch.mockResolvedValueOnce(
      makeTokenInfoResponse({ aud: "other-app.apps.googleusercontent.com", azp: "" })
    );

    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/google")
      .send({ accessToken: "replayed-token" });

    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it("accepts a token whose azp matches even when aud does not", async () => {
    mocks.fetch.mockReset();
    mocks.fetch
      .mockResolvedValueOnce(
        makeTokenInfoResponse({
          aud: "other-app.apps.googleusercontent.com",
          azp: "web-client.apps.googleusercontent.com",
        })
      )
      .mockResolvedValueOnce(makeUserInfoResponse());

    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/google")
      .send({ accessToken: "azp-token" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns 401 when userinfo returns a non-OK HTTP status", async () => {
    mocks.fetch.mockReset();
    mocks.fetch
      .mockResolvedValueOnce(makeTokenInfoResponse())
      .mockResolvedValueOnce({ ok: false, status: 401 } as unknown as Response);

    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/google")
      .send({ accessToken: "valid-token" });

    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it("returns 401 when userinfo email_verified is false", async () => {
    mocks.fetch.mockReset();
    mocks.fetch
      .mockResolvedValueOnce(makeTokenInfoResponse())
      .mockResolvedValueOnce(makeUserInfoResponse({ email_verified: false }));

    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/google")
      .send({ accessToken: "valid-token" });

    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
    expect(res.body.message).toMatch(/not verified/i);
  });

  it("returns 400 when userinfo has no email", async () => {
    mocks.fetch.mockReset();
    mocks.fetch
      .mockResolvedValueOnce(makeTokenInfoResponse())
      .mockResolvedValueOnce(makeUserInfoResponse({ email: undefined }));

    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/google")
      .send({ accessToken: "valid-token" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("extracts given_name and family_name from userinfo", async () => {
    mocks.fetch.mockReset();
    mocks.fetch
      .mockResolvedValueOnce(makeTokenInfoResponse())
      .mockResolvedValueOnce(
        makeUserInfoResponse({ given_name: "Omar", family_name: "Faruk" })
      );

    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/google")
      .send({ accessToken: "valid-token" });

    expect(res.status).toBe(200);
    const profile = mocks.upsertCustomer.mock.calls[0][0];
    expect(profile.firstName).toBe("Omar");
    expect(profile.lastName).toBe("Faruk");
    expect(profile.email).toBe(FAKE_EMAIL);
  });

  it("returns a user object in the response on success", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/google")
      .send({ accessToken: "valid-token" });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: FAKE_CUSTOMER.id,
      email: FAKE_EMAIL,
    });
  });

  it("falls back to GOOGLE_CLIENT_IDS for audience when GOOGLE_WEB_CLIENT_IDS is absent (accessToken path)", async () => {
    delete process.env.GOOGLE_WEB_CLIENT_IDS;
    process.env.GOOGLE_CLIENT_IDS = "ios-client.apps.googleusercontent.com";

    mocks.fetch.mockReset();
    mocks.fetch
      .mockResolvedValueOnce(
        makeTokenInfoResponse({ aud: "ios-client.apps.googleusercontent.com" })
      )
      .mockResolvedValueOnce(makeUserInfoResponse());

    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/google")
      .send({ accessToken: "valid-token" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe("POST /auth/oauth/google — missing body (no accessToken, no idToken)", () => {
  beforeEach(() => {
    process.env.GOOGLE_WEB_CLIENT_IDS = "web-client.apps.googleusercontent.com";
  });

  it("returns 400 when neither accessToken nor idToken is present", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/auth/oauth/google")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(mocks.jwtVerify).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
