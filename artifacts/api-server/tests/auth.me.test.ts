import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────
//
// /auth/me's contract under test:
//   1. authenticate() yields a WC customer id.
//   2. Read the local `customers` row first (via getCustomerByWcId).
//   3. If found → return the local fields and DO NOT call WooCommerce.
//   4. If not found → fall back to a WC GET, then mirror locally in the bg.

// /auth/me is now wrapped in `requireUserType(["customer"])`, which calls
// `getAuth(req)` from @clerk/express. Without the real clerkMiddleware
// mounted in the test harness, getAuth throws — yielding 500s for all
// three cases. Stub it to report an unauthenticated request so the
// middleware passes through to the legacy WP/JWT auth path the tests
// actually exercise.
vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: null, sessionClaims: null }),
  createClerkClient: () => ({
    users: {
      getUser: vi.fn(),
      updateUserMetadata: vi.fn(),
    },
  }),
}));

const authenticateMock = vi.fn();
vi.mock("../src/lib/auth", () => ({
  authenticate: (...args: unknown[]) => authenticateMock(...args),
  signServerToken: vi.fn(),
  decodeJwtPayload: vi.fn(() => null),
}));

const getCustomerByWcIdMock = vi.fn();
const upsertCustomerMock = vi.fn();
vi.mock("../src/lib/customers", () => ({
  getCustomerByWcId: (...args: unknown[]) => getCustomerByWcIdMock(...args),
  upsertCustomer: (...args: unknown[]) => upsertCustomerMock(...args),
}));

// The auth router pulls in the rate-limit factory; replace each limiter with
// a no-op middleware so we don't need to reason about IP buckets here.
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
  };
});

// /auth/me's update path also writes the local customers row when a fallback
// happens; stub the db so the import doesn't try to talk to Postgres.
vi.mock("@workspace/db", () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    })),
  },
  customersTable: { id: "id", wcCustomerId: "wcCustomerId" },
}));

// ─── Harness ────────────────────────────────────────────────────────────────

let app: Express;
let fetchSpy: ReturnType<typeof vi.spyOn>;
const wcCalls: string[] = [];

beforeEach(async () => {
  vi.clearAllMocks();
  wcCalls.length = 0;

  fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url) => {
      wcCalls.push(String(url));
      // Default: pretend WC has the customer. Individual tests override.
      return new Response(
        JSON.stringify({
          id: 999,
          email: "wc@example.com",
          first_name: "WCFirst",
          last_name: "WCLast",
          username: "wcuser",
          billing: { phone: "+96170WC0000" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

  // Re-import so the router picks up our mocks fresh.
  const mod = await import("../src/routes/auth");
  app = express();
  app.use(express.json());
  app.use("/api", mod.default);
});

afterEach(() => {
  fetchSpy.mockRestore();
  vi.resetModules();
});

describe("GET /api/auth/me — local-first read with WooCommerce fallback", () => {
  it("returns the local customer row and does NOT hit WooCommerce", async () => {
    authenticateMock.mockResolvedValueOnce({
      ok: true,
      customerId: 555,
      token: "tkn",
    });
    getCustomerByWcIdMock.mockResolvedValueOnce({
      id: 1,
      email: "local@example.com",
      firstName: "Local",
      lastName: "User",
      phoneE164: "+96170111111",
      wcCustomerId: 555,
    });

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer good-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      user: {
        id: 555,
        email: "local@example.com",
        firstName: "Local",
        lastName: "User",
        username: "",
        phone: "+96170111111",
      },
    });
    // The whole point of the local-first path: no WC roundtrip when we
    // already have the canonical row locally.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to WooCommerce when no local row exists", async () => {
    authenticateMock.mockResolvedValueOnce({
      ok: true,
      customerId: 999,
      token: "tkn",
    });
    getCustomerByWcIdMock.mockResolvedValueOnce(null);

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer good-token");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user).toMatchObject({
      id: 999,
      email: "wc@example.com",
      firstName: "WCFirst",
      lastName: "WCLast",
    });
    // Fallback path: exactly one WC GET to /customers/<id>.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(wcCalls[0]).toContain("/customers/999");
  });

  it("propagates a 401 when authentication fails", async () => {
    authenticateMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      message: "bad",
    });

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer bad-token");

    expect(res.status).toBe(401);
    expect(getCustomerByWcIdMock).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
