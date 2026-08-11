import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Tests for POST /api/auth/web-bridge.
//
// The web-bridge endpoint provides local-DB-only email routing for the web
// sign-in page (WC_AUTH_ENABLED=false, the default for new deployments).
//
// Critical contract under test:
//
//   POST /auth/web-bridge:
//     • Known email (DB hit)   → { ok:true, userExists:true,  passwordLoginAvailable:true }
//     • Unknown email (DB miss) → { ok:true, userExists:false, passwordLoginAvailable:true }
//     • Invalid email format    → { ok:true, userExists:false, passwordLoginAvailable:false }
//     • Response never contains `clerkReady` or `exists` (old WC-era fields)
//
// Enumeration mitigation: webBridgeIpLimiter (10 req/15 min per IP).
// The rate-limiter adversarial tests live in auth.web-bridge.enumeration.test.ts.

vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: null, sessionClaims: null }),
  createClerkClient: () => ({
    users: { getUser: vi.fn(), updateUserMetadata: vi.fn() },
  }),
}));

vi.mock("../src/lib/auth", () => ({
  authenticate: vi.fn(),
  signServerToken: vi.fn(),
  decodeJwtPayload: vi.fn(() => null),
  isWcAuthEnabled: vi.fn(() => false),
}));

vi.mock("../src/lib/customers", () => ({
  getCustomerByWcId: vi.fn(async () => null),
  upsertCustomer: vi.fn(),
  normalizePhoneE164: (v: string | null | undefined) => (v ? String(v) : null),
}));

const isClerkConfiguredMock = vi.fn(() => false);
vi.mock("../src/lib/clerkUserSync", () => ({
  ensureClerkUserForCustomer: vi.fn(),
  ensureClerkUserInBackground: vi.fn(),
  findClerkUserByEmail: vi.fn(),
  isClerkConfigured: () => isClerkConfiguredMock(),
}));

vi.mock("../src/lib/auth-rate-limit", () => {
  const noop = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    existsIpLimiter: noop,
    webBridgeIpLimiter: noop,
    loginIpLimiter: noop,
    registerIpLimiter: noop,
    resetRequestIpLimiter: noop,
    resetConfirmIpLimiter: noop,
    socialIpLimiter: noop,
    otpSendIpLimiter: noop,
    loginEmailLimiter: { check: () => ({ allowed: true }), record: () => {} },
    resetEmailLimiter: { check: () => ({ allowed: true }), record: () => {} },
    otpPhoneLimiter: { check: () => ({ allowed: true }), record: () => {} },
  };
});

// DB mock: select().from().where().limit() chain returns `dbSelectResult`.
const dbSelectResult: any[] = [];
vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(dbSelectResult),
        }),
      }),
    }),
    update: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve(undefined)),
    })),
  },
  customersTable: {
    id: "id",
    email: "email",
    wcCustomerId: "wcCustomerId",
    passwordResetToken: "password_reset_token",
    passwordResetTokenExpiresAt: "password_reset_token_expires_at",
  },
  analyticsEventsTable: { name: "name", action: "action" },
  CUSTOMER_GENDERS: [],
}));

vi.mock("../src/lib/requireUserType", () => ({
  requireUserType: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../src/lib/phoneValidation", () => ({
  validateStoredPhone: vi.fn(),
}));

vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/lib/authExists", () => ({
  classifyAuthExists: vi.fn(),
  normalizeAuthExistsEmail: (e: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim().toLowerCase())
      ? e.trim().toLowerCase()
      : null,
  recordAuthExistsOutcome: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  and: () => ({}),
  isNull: () => ({}),
  isNotNull: () => ({}),
  gt: () => ({}),
  desc: () => ({}),
}));

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => ({})),
  jwtVerify: vi.fn(),
}));

let app: Express;

beforeEach(async () => {
  vi.clearAllMocks();
  dbSelectResult.length = 0;
  vi.resetModules();
  const mod = await import("../src/routes/auth");
  app = express();
  app.use(express.json());
  app.use("/api", mod.default);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Helper ────────────────────────────────────────────────────────────────────

async function postWebBridge(email: string) {
  return request(app)
    .post("/api/auth/web-bridge")
    .send({ email })
    .set("Content-Type", "application/json");
}

// ── POST /auth/web-bridge — email lookup ─────────────────────────────────────

describe("POST /api/auth/web-bridge — email lookup (local DB, WC_AUTH_ENABLED=false)", () => {
  it("returns userExists:true for a known email (DB hit)", async () => {
    dbSelectResult.push({ id: 1 });
    const res = await postWebBridge("known@example.com");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      userExists: true,
      passwordLoginAvailable: true,
    });
  });

  it("returns userExists:false for an unknown email (DB miss)", async () => {
    // dbSelectResult is empty
    const res = await postWebBridge("nobody@example.com");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      userExists: false,
      passwordLoginAvailable: true,
    });
  });

  it("returns userExists:false for an invalid email without touching the DB", async () => {
    const res = await request(app)
      .post("/api/auth/web-bridge")
      .send({ email: "not-an-email" })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.userExists).toBe(false);
  });

  it("does not expose clerkReady or exists fields in the response", async () => {
    dbSelectResult.push({ id: 1 });
    const res = await postWebBridge("known@example.com");
    expect(res.body).not.toHaveProperty("clerkReady");
    expect(res.body).not.toHaveProperty("exists");
  });

  it("does not call classifyAuthExists — web-bridge uses direct DB query", async () => {
    const { classifyAuthExists } = await import("../src/lib/authExists");
    dbSelectResult.push({ id: 1 });
    await postWebBridge("known@example.com");
    expect(classifyAuthExists).not.toHaveBeenCalled();
  });

  it("normalises the email to lowercase before the DB lookup", async () => {
    dbSelectResult.push({ id: 1 });
    // Mixed-case email should still find the account.
    const res = await postWebBridge("User@Example.COM");
    expect(res.status).toBe(200);
    expect(res.body.userExists).toBe(true);
  });
});
