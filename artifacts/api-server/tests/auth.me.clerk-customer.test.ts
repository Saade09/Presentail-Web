import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Clerk auth stubs ─────────────────────────────────────────────────────────
//
// `getAuthMock` drives what getAuth(req) returns per test.
// `getUserMock` drives the live Clerk API fallback used when email is absent
// from session claims.

const getAuthMock = vi.fn().mockReturnValue({ userId: null, sessionClaims: null });
const getUserMock = vi.fn();

vi.mock("@clerk/express", () => ({
  getAuth: (req: any) => getAuthMock(req),
  createClerkClient: () => ({
    users: {
      getUser: (...args: any[]) => getUserMock(...args),
      updateUser: vi.fn().mockResolvedValue({}),
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
    otpSendIpLimiter: noop,
    loginEmailLimiter: { check: () => ({ allowed: true }), record: () => {} },
    resetEmailLimiter: { check: () => ({ allowed: true }), record: () => {} },
    otpPhoneLimiter: { check: () => ({ allowed: true }), record: () => {} },
  };
});

// ─── DB mock ──────────────────────────────────────────────────────────────────
//
// Supports the update().set().where().returning() chain used by both the
// Clerk customer PUT path and the team PUT path.

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

const CUSTOMER_SESSION = {
  userId: "clerk-customer-user-id",
  sessionClaims: {
    email: "customer@example.com",
    publicMetadata: { userType: "customer" },
  },
};

const CUSTOMER_SESSION_NO_EMAIL = {
  userId: "clerk-customer-user-id",
  sessionClaims: {
    publicMetadata: { userType: "customer" },
  },
};

// ─── Shared local-row fixture ─────────────────────────────────────────────────

const baseLocalCustomer = {
  id: 7,
  email: "customer@example.com",
  firstName: "Alice",
  lastName: "Smith",
  phoneE164: null as string | null,
  wcCustomerId: null as number | null,
  gender: null as string | null,
  birthday: null as string | null,
};

// ─── Test harness ─────────────────────────────────────────────────────────────

const ORIGINAL_CLERK_SECRET = process.env.CLERK_SECRET_KEY;

let app: Express;
let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  vi.clearAllMocks();
  getAuthMock.mockReturnValue({ userId: null, sessionClaims: null });
  dbReturningMock.mockResolvedValue([]);
  process.env.CLERK_SECRET_KEY = "sk_test_fake_key_for_customer_tests";

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
// PUT /auth/me — Clerk customer path
// ─────────────────────────────────────────────────────────────────────────────

describe("PUT /api/auth/me — Clerk customer path: valid phone update", () => {
  it("accepts a valid E.164 phone, persists it, and returns the updated profile", async () => {
    getAuthMock.mockReturnValue(CUSTOMER_SESSION);
    upsertCustomerMock.mockResolvedValue({ customer: baseLocalCustomer });
    dbReturningMock.mockResolvedValueOnce([
      { ...baseLocalCustomer, phoneE164: "+96170999999" },
    ]);

    const res = await request(app)
      .put("/api/auth/me")
      .send({ phone: "+96170999999" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user).toMatchObject({
      id: 7,
      email: "customer@example.com",
      phone: "+96170999999",
    });

    // db.update must have been called with the normalised phone.
    expect(dbSetMock).toHaveBeenCalledOnce();
    const patch = (dbSetMock.mock.calls[0]! as unknown as [unknown])[0] as unknown as Record<string, unknown>;
    expect(patch).toMatchObject({ phoneE164: "+96170999999" });
  });

  it("upserts the local customer row with clerk auth provider before patching", async () => {
    getAuthMock.mockReturnValue(CUSTOMER_SESSION);
    upsertCustomerMock.mockResolvedValue({ customer: baseLocalCustomer });
    dbReturningMock.mockResolvedValueOnce([baseLocalCustomer]);

    await request(app).put("/api/auth/me").send({ firstName: "Bob" });

    expect(upsertCustomerMock).toHaveBeenCalledOnce();
    expect(upsertCustomerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "customer@example.com",
        authProvider: "clerk",
        authUserId: "clerk-customer-user-id",
      }),
    );
  });
});

describe("PUT /api/auth/me — Clerk customer path: invalid phone returns 400", () => {
  it("returns 400 for a phone number that is too short", async () => {
    getAuthMock.mockReturnValue(CUSTOMER_SESSION);

    const res = await request(app)
      .put("/api/auth/me")
      .send({ phone: "+1" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.message).toMatch(/phone/i);
    // Nothing must be persisted.
    expect(dbSetMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a phone string that is not E.164 at all", async () => {
    getAuthMock.mockReturnValue(CUSTOMER_SESSION);

    const res = await request(app)
      .put("/api/auth/me")
      .send({ phone: "not-a-phone" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(dbSetMock).not.toHaveBeenCalled();
  });
});

describe("PUT /api/auth/me — Clerk customer path: missing email returns 401", () => {
  it("returns 401 when claims have no email and the live Clerk user has no email addresses", async () => {
    getAuthMock.mockReturnValue(CUSTOMER_SESSION_NO_EMAIL);
    // Live Clerk API returns a user object with an empty email list.
    getUserMock.mockResolvedValueOnce({
      primaryEmailAddressId: null,
      emailAddresses: [],
    });

    const res = await request(app)
      .put("/api/auth/me")
      .send({ firstName: "Ghost" });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ ok: false });
    expect(dbSetMock).not.toHaveBeenCalled();
  });

  it("returns 503 when CLERK_SECRET_KEY is absent and claims have no email", async () => {
    delete process.env.CLERK_SECRET_KEY;
    getAuthMock.mockReturnValue(CUSTOMER_SESSION_NO_EMAIL);

    const res = await request(app)
      .put("/api/auth/me")
      .send({ firstName: "Ghost" });

    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(dbSetMock).not.toHaveBeenCalled();
  });
});

describe("PUT /api/auth/me — Clerk customer path: no-op (empty body)", () => {
  it("returns 200 with the current profile when no fields are provided", async () => {
    getAuthMock.mockReturnValue(CUSTOMER_SESSION);
    upsertCustomerMock.mockResolvedValue({ customer: baseLocalCustomer });

    const res = await request(app)
      .put("/api/auth/me")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user).toMatchObject({
      id: 7,
      email: "customer@example.com",
      firstName: "Alice",
      lastName: "Smith",
    });
    // No fields were provided → db.update must NOT have been called.
    expect(dbSetMock).not.toHaveBeenCalled();
  });

  it("skips the WC mirror when the local row has no wcCustomerId", async () => {
    getAuthMock.mockReturnValue(CUSTOMER_SESSION);
    upsertCustomerMock.mockResolvedValue({
      customer: { ...baseLocalCustomer, wcCustomerId: null },
    });
    dbReturningMock.mockResolvedValueOnce([
      { ...baseLocalCustomer, firstName: "Bob" },
    ]);

    await request(app).put("/api/auth/me").send({ firstName: "Bob" });

    // fetchSpy should not have been called with a WC PUT.
    const wcPut = fetchSpy.mock.calls.find(
      ([, init]: Parameters<typeof fetch>) => (init as RequestInit)?.method === "PUT",
    );
    expect(wcPut).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /auth/me — Clerk customer path: db.update throws → 500
// ─────────────────────────────────────────────────────────────────────────────

describe("PUT /api/auth/me — Clerk customer path: db.update throws → 500", () => {
  it("returns 500 and {ok:false} when the db.update call rejects", async () => {
    getAuthMock.mockReturnValue(CUSTOMER_SESSION);
    upsertCustomerMock.mockResolvedValue({ customer: baseLocalCustomer });
    dbReturningMock.mockRejectedValueOnce(new Error("DB write failed"));

    const res = await request(app)
      .put("/api/auth/me")
      .send({ firstName: "Crash" });

    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /auth/me — Clerk customer path: WC mirror non-2xx → local save still 200
// ─────────────────────────────────────────────────────────────────────────────

describe("PUT /api/auth/me — Clerk customer path: WC mirror non-2xx → still 200", () => {
  it("returns 200 even when the WooCommerce mirror responds with a non-2xx status", async () => {
    const customerWithWc = { ...baseLocalCustomer, wcCustomerId: 999 };
    getAuthMock.mockReturnValue(CUSTOMER_SESSION);
    upsertCustomerMock.mockResolvedValue({ customer: customerWithWc });
    dbReturningMock.mockResolvedValueOnce([
      { ...customerWithWc, firstName: "Updated" },
    ]);

    // Make the WC mirror PUT return a server error.
    fetchSpy.mockImplementation(async (_url: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1]) => {
      if ((init as RequestInit)?.method === "PUT") {
        return new Response(JSON.stringify({ code: "wc_error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const res = await request(app)
      .put("/api/auth/me")
      .send({ firstName: "Updated" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user).toMatchObject({ firstName: "Updated" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /auth/me — team path: smoke test (ensures team path still works)
// ─────────────────────────────────────────────────────────────────────────────

describe("PUT /api/auth/me — team path: smoke test", () => {
  const TEAM_SESSION = {
    userId: "clerk-team-user-id",
    sessionClaims: {
      email: "team@presentail.com",
      publicMetadata: { userType: "team" },
    },
  };

  const teamLocalRow = {
    id: 42,
    email: "team@presentail.com",
    firstName: "Team",
    lastName: "Member",
    phoneE164: null as string | null,
    gender: null as string | null,
    birthday: null as string | null,
  };

  it("updates firstName for a team user and never calls WooCommerce", async () => {
    getAuthMock.mockReturnValue(TEAM_SESSION);
    upsertCustomerMock.mockResolvedValue({ customer: teamLocalRow });
    dbReturningMock.mockResolvedValueOnce([
      { ...teamLocalRow, firstName: "Updated" },
    ]);

    const res = await request(app)
      .put("/api/auth/me")
      .send({ firstName: "Updated" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user).toMatchObject({ firstName: "Updated" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid birthday on the team path", async () => {
    getAuthMock.mockReturnValue(TEAM_SESSION);
    upsertCustomerMock.mockResolvedValue({ customer: teamLocalRow });

    const res = await request(app)
      .put("/api/auth/me")
      .send({ birthday: "not-a-date" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ ok: false, message: "Invalid birthday" });
    expect(dbSetMock).not.toHaveBeenCalled();
  });
});
