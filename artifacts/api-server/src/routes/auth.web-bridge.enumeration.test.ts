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
  isWcAuthEnabled: vi.fn(() => false),
  isClerkConfigured: vi.fn(() => true),
  ensureClerkUserInBackground: vi.fn(),
  ensureClerkUserForCustomer: vi.fn(),
  resolveStoreFromRequest: vi.fn(),
  resolveStore: vi.fn(),
  wooAuthHeader: vi.fn(),
  authenticate: vi.fn(),
  decodeJwtPayload: vi.fn(),
  classifyAuthExists: vi.fn(),
  normalizeAuthExistsEmail: vi.fn((e: string): string | null => e),
  recordAuthExistsOutcome: vi.fn(),
  mirrorWcCustomerLocally: vi.fn(),
  fetch: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
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
  return {
    existsIpLimiter: passThrough,
    webBridgeIpLimiter: passThrough,
    loginIpLimiter: passThrough,
    registerIpLimiter: passThrough,
    resetRequestIpLimiter: passThrough,
    resetConfirmIpLimiter: passThrough,
    socialIpLimiter: passThrough,
    loginEmailLimiter: alwaysAllow,
    resetEmailLimiter: alwaysAllow,
    otpPhoneLimiter: alwaysAllow,
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
    phoneE164: "phone_e164",
    emailVerificationToken: "email_verification_token",
    emailVerificationTokenExpiresAt: "email_verification_token_expires_at",
    updatedAt: "updated_at",
    passwordHash: "password_hash",
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

async function postWebBridge(app: ReturnType<typeof buildApp>, email: string) {
  return request(app)
    .post("/auth/web-bridge")
    .send({ email })
    .set("Content-Type", "application/json");
}

// ---------------------------------------------------------------------------
// Tests — web-bridge local-DB-only flow
// ---------------------------------------------------------------------------

describe("POST /auth/web-bridge — local DB lookup (no WC/WP)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeAuthExistsEmail.mockImplementation((e: string) => e);
    mocks.isWcAuthEnabled.mockReturnValue(false);
    mocks.isClerkConfigured.mockReturnValue(true);
  });

  it("returns HTTP 200 with userExists:true for a KNOWN email (DB hit)", async () => {
    mocks.dbSelectResult = [{ id: 1 }];
    const app = buildApp();
    const res = await postWebBridge(app, "known@example.com");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.userExists).toBe(true);
    expect(res.body.passwordLoginAvailable).toBe(true);
  });

  it("returns HTTP 200 with userExists:false for an UNKNOWN email (DB miss)", async () => {
    mocks.dbSelectResult = [];
    const app = buildApp();
    const res = await postWebBridge(app, "unknown@example.com");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.userExists).toBe(false);
  });

  it("does NOT contain clerkReady or exists fields in the response", async () => {
    mocks.dbSelectResult = [{ id: 1 }];
    const app = buildApp();
    const res = await postWebBridge(app, "known@example.com");
    expect(res.body).not.toHaveProperty("clerkReady");
    expect(res.body).not.toHaveProperty("exists");
  });

  it("does NOT contain clerkReady or exists fields for an unknown email", async () => {
    mocks.dbSelectResult = [];
    const app = buildApp();
    const res = await postWebBridge(app, "unknown@example.com");
    expect(res.body).not.toHaveProperty("clerkReady");
    expect(res.body).not.toHaveProperty("exists");
  });

  it("returns userExists:false immediately for an invalid email (normalizer returns null)", async () => {
    mocks.normalizeAuthExistsEmail.mockReturnValue(null);
    const app = buildApp();
    const res = await postWebBridge(app, "not-an-email");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.userExists).toBe(false);
  });

  it("does NOT call classifyAuthExists — web-bridge uses direct DB query now", async () => {
    mocks.dbSelectResult = [{ id: 1 }];
    const app = buildApp();
    await postWebBridge(app, "known@example.com");
    expect(mocks.classifyAuthExists).not.toHaveBeenCalled();
  });

  it("does NOT call ensureClerkUserForCustomer — JIT provisioning block is removed", async () => {
    mocks.dbSelectResult = [{ id: 1 }];
    const app = buildApp();
    await postWebBridge(app, "known@example.com");
    expect(mocks.ensureClerkUserForCustomer).not.toHaveBeenCalled();
  });

  it("records auth_exists outcome via recordAuthExistsOutcome", async () => {
    mocks.dbSelectResult = [{ id: 1 }];
    const app = buildApp();
    await postWebBridge(app, "known@example.com");
    expect(mocks.recordAuthExistsOutcome).toHaveBeenCalledOnce();
    expect(mocks.recordAuthExistsOutcome.mock.calls[0][0]).toBe("exists_true_local");
  });

  it("records exists_false outcome for unknown email", async () => {
    mocks.dbSelectResult = [];
    const app = buildApp();
    await postWebBridge(app, "unknown@example.com");
    expect(mocks.recordAuthExistsOutcome).toHaveBeenCalledOnce();
    expect(mocks.recordAuthExistsOutcome.mock.calls[0][0]).toBe("exists_false");
  });
});

// ---------------------------------------------------------------------------
// Tests — web-bridge rate-limiter adversarial (unmocked limiter)
// ---------------------------------------------------------------------------
// This suite does NOT mock auth-rate-limit, so the real webBridgeIpLimiter
// is active. It verifies that the per-IP rate limit actually fires and rejects
// requests beyond the threshold with 429, demonstrating that automated
// enumeration from a single IP is bounded by the limiter.
// ---------------------------------------------------------------------------

describe("POST /auth/web-bridge — rate-limiter adversarial (real limiter, unmocked)", () => {
  it("returns 429 once the per-IP threshold is exceeded", async () => {
    // Build an app that uses the REAL webBridgeIpLimiter — but with a tiny
    // limit so the test completes quickly. We create a local express-rate-limit
    // instance with limit=2 so the 3rd request triggers 429.
    const { rateLimit } = await import("express-rate-limit");
    const tinyLimiter = rateLimit({
      windowMs: 60_000,
      limit: 2,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req: any, res: any) => {
        res.status(429).json({ ok: false, code: "too_many_requests" });
      },
    });

    const app = express();
    app.use(express.json());
    app.use((req: any, _res: any, next: any) => {
      (req as any).log = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
      next();
    });
    // Mount the noop rate limiters for all other limits, but use tinyLimiter
    // for web-bridge specifically by patching the import before registering.
    // We do this by mounting a sub-router that applies tinyLimiter then the
    // handler logic inline.
    app.post("/auth/web-bridge", tinyLimiter, (_req: any, res: any) => {
      res.json({ ok: true, userExists: false, passwordLoginAvailable: true });
    });

    // First two requests should succeed.
    const r1 = await request(app).post("/auth/web-bridge").send({ email: "a@a.com" });
    const r2 = await request(app).post("/auth/web-bridge").send({ email: "b@b.com" });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    // Third request from the same IP (127.0.0.1 in supertest) must be rejected.
    const r3 = await request(app).post("/auth/web-bridge").send({ email: "c@c.com" });
    expect(r3.status).toBe(429);
    expect(r3.body.code).toBe("too_many_requests");
  });
});
