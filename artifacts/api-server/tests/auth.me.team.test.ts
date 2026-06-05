import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Configurable Clerk auth stubs ───────────────────────────────────────────
//
// `getAuthMock` drives what getAuth(req) returns per test.  Tests call
// `.mockReturnValue(...)` to simulate different session states before
// firing each request.
//
// `getUserMock` drives what createClerkClient().users.getUser() resolves
// to — the DELETE /auth/me handler re-checks the live Clerk user to
// prevent stale JWTs from bypassing the team-user block.
const getAuthMock = vi.fn().mockReturnValue({ userId: null, sessionClaims: null });
const getUserMock = vi.fn();

vi.mock("@clerk/express", () => ({
  getAuth: (req: any) => getAuthMock(req),
  createClerkClient: () => ({
    users: {
      getUser: (...args: any[]) => getUserMock(...args),
      updateUserMetadata: vi.fn(),
    },
  }),
}));

// ─── Auth / customers / rate-limit mocks ─────────────────────────────────────

const authenticateMock = vi.fn();
vi.mock("../src/lib/auth", () => ({
  authenticate: (...args: unknown[]) => authenticateMock(...args),
  signServerToken: vi.fn(),
  decodeJwtPayload: vi.fn(() => null),
}));

const upsertCustomerMock = vi.fn();
vi.mock("../src/lib/customers", () => ({
  getCustomerByWcId: vi.fn().mockResolvedValue(null),
  upsertCustomer: (...args: unknown[]) => upsertCustomerMock(...args),
  normalizePhoneE164: vi.fn((raw: string | null | undefined) => raw ?? null),
}));

vi.mock("../src/lib/auth-rate-limit", () => {
  const noop = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    existsIpLimiter: noop,
    loginIpLimiter: noop,
    registerIpLimiter: noop,
    resetRequestIpLimiter: noop,
    resetConfirmIpLimiter: noop,
    socialIpLimiter: noop,
    loginEmailLimiter: { check: () => ({ allowed: true }), record: () => {} },
    resetEmailLimiter: { check: () => ({ allowed: true }), record: () => {} },
    otpSendIpLimiter: noop,
    otpPhoneLimiter: { check: () => ({ allowed: true }), record: () => {} },
  };
});

// DB mock: supports the update().set().where().returning() chain used by the
// team PUT path and the update().set().where() chain used by the customer
// mirroring path.  `dbReturningMock` is configured per-test to supply the
// row that the handler assigns to `local`.
const dbReturningMock = vi.fn().mockResolvedValue([]);
const dbWhereMock = vi.fn(() => ({ returning: dbReturningMock }));
const dbSetMock = vi.fn(() => ({ where: dbWhereMock }));

vi.mock("@workspace/db", () => ({
  db: {
    update: vi.fn(() => ({ set: dbSetMock })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([]),
        limit: vi.fn().mockResolvedValue([]),
      })),
    })),
  },
  customersTable: {
    id: "id",
    wcCustomerId: "wcCustomerId",
    email: "email",
    $inferInsert: {} as Record<string, unknown>,
  },
  CUSTOMER_GENDERS: ["female", "male", "unspecified"] as const,
}));

// ─── Session fixtures ─────────────────────────────────────────────────────────

const TEAM_SESSION = {
  userId: "clerk-team-user-id",
  sessionClaims: {
    email: "team@presentail.com",
    first_name: "Team",
    last_name: "Member",
    publicMetadata: { userType: "team" },
  },
};

const CUSTOMER_SESSION = {
  userId: "clerk-customer-user-id",
  sessionClaims: {
    email: "customer@example.com",
    first_name: "Customer",
    last_name: "User",
    publicMetadata: { userType: "customer" },
  },
};

const DRIVER_SESSION = {
  userId: "clerk-driver-user-id",
  sessionClaims: {
    email: "driver@example.com",
    publicMetadata: { userType: "driver" },
  },
};

// ─── Route test harness ───────────────────────────────────────────────────────

const ORIGINAL_CLERK_SECRET = process.env.CLERK_SECRET_KEY;

let app: Express;
let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  vi.clearAllMocks();
  // Default: no Clerk session (overridden per test).
  getAuthMock.mockReturnValue({ userId: null, sessionClaims: null });
  // Default: returning() yields an empty array (overridden where needed).
  dbReturningMock.mockResolvedValue([]);

  // Ensure a valid-looking CLERK_SECRET_KEY so the DELETE handler performs
  // the live Clerk role check rather than skipping it.
  process.env.CLERK_SECRET_KEY = "sk_test_fake_key_for_team_tests";

  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

  const mod = await import("../src/routes/auth");
  app = express();
  app.use(express.json());
  app.use("/api", mod.default);
});

afterEach(() => {
  fetchSpy.mockRestore();
  vi.resetModules();
  if (ORIGINAL_CLERK_SECRET === undefined) {
    delete process.env.CLERK_SECRET_KEY;
  } else {
    process.env.CLERK_SECRET_KEY = ORIGINAL_CLERK_SECRET;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// requireUserType(["customer", "team"]) — role filtering
// ─────────────────────────────────────────────────────────────────────────────

describe("requireUserType(['customer','team']) — role filtering", () => {
  let middlewareApp: Express;

  beforeEach(async () => {
    const { requireUserType } = await import("../src/lib/requireUserType");
    middlewareApp = express();
    middlewareApp.use(express.json());
    middlewareApp.get(
      "/probe",
      requireUserType(["customer", "team"]),
      (_req, res) => res.json({ ok: true }),
    );
  });

  it("passes through when there is no Clerk session (userId null)", async () => {
    getAuthMock.mockReturnValue({ userId: null, sessionClaims: null });
    const res = await request(middlewareApp).get("/probe");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("passes through for a customer session", async () => {
    getAuthMock.mockReturnValue(CUSTOMER_SESSION);
    const res = await request(middlewareApp).get("/probe");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("passes through for a team session", async () => {
    getAuthMock.mockReturnValue(TEAM_SESSION);
    const res = await request(middlewareApp).get("/probe");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns 403 for a driver session", async () => {
    getAuthMock.mockReturnValue(DRIVER_SESSION);
    const res = await request(middlewareApp).get("/probe");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      ok: false,
      code: "wrong_user_type",
      message: "You do not have access to this resource.",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /auth/me — team user branch
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/auth/me — team user session", () => {
  const teamLocalRow = {
    id: 42,
    email: "team@presentail.com",
    firstName: "Team",
    lastName: "Member",
    phoneE164: null,
    gender: null,
    birthday: null,
    birthdayShareMonthDay: true,
  };

  it("returns a valid profile built from session claims without hitting WooCommerce", async () => {
    getAuthMock.mockReturnValue(TEAM_SESSION);
    upsertCustomerMock.mockResolvedValueOnce({ customer: teamLocalRow });

    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      user: {
        id: 42,
        email: "team@presentail.com",
        firstName: "Team",
        lastName: "Member",
        username: "",
        phone: "",
        gender: null,
        birthday: null,
        birthdayShareMonthDay: true,
      },
    });
    // Team path must never touch WooCommerce.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("upserts the local customer row with the Clerk user id and email from claims", async () => {
    getAuthMock.mockReturnValue(TEAM_SESSION);
    upsertCustomerMock.mockResolvedValueOnce({ customer: teamLocalRow });

    await request(app).get("/api/auth/me");

    expect(upsertCustomerMock).toHaveBeenCalledOnce();
    expect(upsertCustomerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "team@presentail.com",
        authProvider: "clerk",
        authUserId: "clerk-team-user-id",
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /auth/me — team user branch
// ─────────────────────────────────────────────────────────────────────────────

describe("PUT /api/auth/me — team user session", () => {
  const teamLocalRow = {
    id: 42,
    email: "team@presentail.com",
    firstName: "Team",
    lastName: "Member",
    phoneE164: null,
    gender: null,
    birthday: null,
    birthdayShareMonthDay: true,
  };

  it("updates firstName and returns the patched profile without hitting WooCommerce", async () => {
    getAuthMock.mockReturnValue(TEAM_SESSION);
    upsertCustomerMock.mockResolvedValue({ customer: teamLocalRow });
    dbReturningMock.mockResolvedValueOnce([{ ...teamLocalRow, firstName: "Updated" }]);

    const res = await request(app)
      .put("/api/auth/me")
      .send({ firstName: "Updated" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user).toMatchObject({
      id: 42,
      email: "team@presentail.com",
      firstName: "Updated",
    });
    // Team path must never touch WooCommerce.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid birthday and does not persist anything", async () => {
    getAuthMock.mockReturnValue(TEAM_SESSION);
    upsertCustomerMock.mockResolvedValue({ customer: teamLocalRow });

    const res = await request(app)
      .put("/api/auth/me")
      .send({ birthday: "not-a-date" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ ok: false, message: "Invalid birthday" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(dbSetMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /auth/me — team user blocked
// ─────────────────────────────────────────────────────────────────────────────

describe("DELETE /api/auth/me — team user protection", () => {
  it("returns 403 when the live Clerk user has userType='team'", async () => {
    getAuthMock.mockReturnValue(TEAM_SESSION);
    getUserMock.mockResolvedValueOnce({
      publicMetadata: { userType: "team" },
    });

    const res = await request(app).delete("/api/auth/me");

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      ok: false,
      message: "Team accounts cannot be deleted through the storefront.",
    });
    // The live Clerk role check must have fired for the correct user.
    expect(getUserMock).toHaveBeenCalledWith("clerk-team-user-id");
    // WooCommerce anonymisation must never be attempted for team accounts.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 502 and blocks deletion when the live Clerk lookup throws", async () => {
    getAuthMock.mockReturnValue(TEAM_SESSION);
    getUserMock.mockRejectedValueOnce(new Error("Clerk API unreachable"));

    const res = await request(app).delete("/api/auth/me");

    // Must fail closed — cannot confirm user type, so block the deletion.
    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({
      ok: false,
      message: expect.stringContaining("Could not verify"),
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("proceeds with deletion when the live Clerk user has userType='customer'", async () => {
    getAuthMock.mockReturnValue(CUSTOMER_SESSION);
    getUserMock.mockResolvedValueOnce({
      publicMetadata: { userType: "customer" },
    });
    authenticateMock.mockResolvedValueOnce({ ok: true, customerId: 123, token: "tkn" });
    fetchSpy.mockImplementation(async () =>
      new Response(JSON.stringify({ id: 123 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await request(app).delete("/api/auth/me");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    // WC anonymise (PUT) + WC hard-delete (DELETE) must both have fired.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does not perform the live Clerk check when CLERK_SECRET_KEY is unset", async () => {
    delete process.env.CLERK_SECRET_KEY;
    getAuthMock.mockReturnValue(TEAM_SESSION);
    authenticateMock.mockResolvedValueOnce({ ok: true, customerId: 99, token: "tkn" });
    fetchSpy.mockImplementation(async () =>
      new Response(JSON.stringify({ id: 99 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    // Without a secret key the handler skips the live role check and falls
    // through to authenticate(). This edge case is intentional: the Clerk
    // middleware itself is also disabled when the key is absent, so the
    // clerkUserId on the request will never be set in practice.
    const res = await request(app).delete("/api/auth/me");

    // getUserMock must not have been called — there was nothing to check.
    expect(getUserMock).not.toHaveBeenCalled();
    // The request falls through to authenticate() and succeeds.
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
