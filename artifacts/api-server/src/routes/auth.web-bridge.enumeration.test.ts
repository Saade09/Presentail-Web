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
  normalizeAuthExistsEmail: vi.fn((e: string) => e),
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
// Tests — enumeration resistance
// ---------------------------------------------------------------------------

describe("POST /auth/web-bridge — enumeration resistance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeAuthExistsEmail.mockImplementation((e: string) => e);
    mocks.isWcAuthEnabled.mockReturnValue(false);
    mocks.isClerkConfigured.mockReturnValue(true);
    mocks.ensureClerkUserForCustomer.mockResolvedValue({ ok: true });
  });

  it("returns { ok: true } with HTTP 200 for a KNOWN email", async () => {
    mocks.classifyAuthExists.mockResolvedValue({
      exists: true,
      outcome: "exists_true_local",
      code: null,
    });
    const app = buildApp();
    const res = await postWebBridge(app, "known@example.com");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns { ok: true } with HTTP 200 for an UNKNOWN email", async () => {
    mocks.classifyAuthExists.mockResolvedValue({
      exists: false,
      outcome: "exists_false",
      code: null,
    });
    const app = buildApp();
    const res = await postWebBridge(app, "unknown@example.com");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("response body shape is identical for known vs unknown emails — no clerkReady, no exists field", async () => {
    const app = buildApp();

    mocks.classifyAuthExists.mockResolvedValue({
      exists: true,
      outcome: "exists_true_local",
      code: null,
    });
    const knownRes = await postWebBridge(app, "known@example.com");

    vi.clearAllMocks();
    mocks.normalizeAuthExistsEmail.mockImplementation((e: string) => e);
    mocks.isWcAuthEnabled.mockReturnValue(false);
    mocks.isClerkConfigured.mockReturnValue(true);
    mocks.ensureClerkUserForCustomer.mockResolvedValue({ ok: true });
    mocks.classifyAuthExists.mockResolvedValue({
      exists: false,
      outcome: "exists_false",
      code: null,
    });
    const unknownRes = await postWebBridge(app, "unknown@example.com");

    // Both responses must carry the same top-level keys.
    expect(Object.keys(knownRes.body).sort()).toEqual(
      Object.keys(unknownRes.body).sort(),
    );

    // Neither response may contain `clerkReady` (enumeration oracle).
    expect(knownRes.body).not.toHaveProperty("clerkReady");
    expect(unknownRes.body).not.toHaveProperty("clerkReady");

    // Neither response may contain `exists` (enumeration oracle).
    expect(knownRes.body).not.toHaveProperty("exists");
    expect(unknownRes.body).not.toHaveProperty("exists");
  });

  it("does not set clerkReady on a known email even when Clerk provisioning succeeds", async () => {
    mocks.classifyAuthExists.mockResolvedValue({
      exists: true,
      outcome: "exists_true_local",
      code: null,
    });
    mocks.ensureClerkUserForCustomer.mockResolvedValue({ ok: true });
    const app = buildApp();
    const res = await postWebBridge(app, "known@example.com");
    expect(res.body).not.toHaveProperty("clerkReady");
  });

  it("does not set clerkReady on an unknown email", async () => {
    mocks.classifyAuthExists.mockResolvedValue({
      exists: false,
      outcome: "exists_false",
      code: null,
    });
    const app = buildApp();
    const res = await postWebBridge(app, "unknown@example.com");
    expect(res.body).not.toHaveProperty("clerkReady");
  });

  it("service errors carry a code field but still do not reveal account existence", async () => {
    mocks.classifyAuthExists.mockResolvedValue({
      exists: true,
      outcome: "exists_inconclusive",
      code: "lookup_failed",
    });
    const app = buildApp();
    const res = await postWebBridge(app, "any@example.com");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.code).toBe("lookup_failed");
    expect(res.body).not.toHaveProperty("clerkReady");
    expect(res.body).not.toHaveProperty("exists");
  });

  it("Clerk-not-configured returns lookup_unavailable for a KNOWN email", async () => {
    mocks.classifyAuthExists.mockResolvedValue({
      exists: true,
      outcome: "exists_true_local",
      code: null,
    });
    mocks.isClerkConfigured.mockReturnValue(false);
    const app = buildApp();
    const res = await postWebBridge(app, "known@example.com");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.code).toBe("lookup_unavailable");
    expect(res.body).not.toHaveProperty("clerkReady");
    expect(res.body).not.toHaveProperty("exists");
  });

  it("Clerk-not-configured returns lookup_unavailable for an UNKNOWN email (same shape — not an oracle)", async () => {
    mocks.classifyAuthExists.mockResolvedValue({
      exists: false,
      outcome: "exists_false",
      code: null,
    });
    mocks.isClerkConfigured.mockReturnValue(false);
    const app = buildApp();
    const res = await postWebBridge(app, "unknown@example.com");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.code).toBe("lookup_unavailable");
    expect(res.body).not.toHaveProperty("clerkReady");
    expect(res.body).not.toHaveProperty("exists");
  });

  it("Clerk provisioning failure does NOT return a code field (provisioning only runs for known emails, so code would be an oracle)", async () => {
    mocks.classifyAuthExists.mockResolvedValue({
      exists: true,
      outcome: "exists_true_local",
      code: null,
    });
    mocks.ensureClerkUserForCustomer.mockResolvedValue({ ok: false, reason: "provisioning_error" });
    const app = buildApp();
    const res = await postWebBridge(app, "known@example.com");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body).not.toHaveProperty("code");
    expect(res.body).not.toHaveProperty("clerkReady");
  });
});
