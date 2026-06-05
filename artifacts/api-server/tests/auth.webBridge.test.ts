import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Tests for POST /api/auth/web-bridge — the JIT Clerk-creation endpoint
// the web sign-in page calls before kicking off Clerk's email-code
// first-factor flow.
//
// Critical contract under test:
//
//   * Existing WP/WC shopper → ensureClerkUserForCustomer is called and
//     the response is `{ exists: true, clerkReady: true }`.
//   * Unknown email (not in WC, JWT plugin says invalid_email) →
//     `{ exists: false }` with NO `code` so the UI may route to sign-up.
//   * Upstream WC error → `{ exists: false, code: "lookup_failed" }`,
//     with NO Clerk call. The frontend treats this as a hard error and
//     keeps the shopper on the email step (never silently sign-up).
//   * Missing WC creds → `{ exists: false, code: "lookup_unavailable" }`.
//   * Clerk not configured but shopper exists in WP →
//     `{ exists: true, clerkReady: false, code: "lookup_unavailable" }`.
//   * ensureClerkUserForCustomer rejects → `{ exists: true,
//     clerkReady: false, code: "lookup_failed" }`.

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
}));

vi.mock("../src/lib/customers", () => ({
  getCustomerByWcId: vi.fn(async () => null),
  upsertCustomer: vi.fn(async () => ({
    customer: {
      id: 7,
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Doe",
      phone: null,
      wcCustomerId: 555,
    },
    created: false,
  })),
  normalizePhoneE164: (v: string | null | undefined) => (v ? String(v) : null),
}));

const ensureClerkUserForCustomerMock = vi.fn();
const isClerkConfiguredMock = vi.fn(() => true);
vi.mock("../src/lib/clerkUserSync", () => ({
  ensureClerkUserForCustomer: (...args: any[]) =>
    ensureClerkUserForCustomerMock(...args),
  ensureClerkUserInBackground: vi.fn(),
  findClerkUserByEmail: vi.fn(),
  isClerkConfigured: () => isClerkConfiguredMock(),
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

vi.mock("@workspace/db", () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    })),
    // `recordAuthExistsOutcome` writes a best-effort analytics row on
    // every /auth/web-bridge call. Without an `insert(...).values(...)`
    // chain that resolves, the route blows up at the very first await
    // and every assertion in this file fails with `body = {}`.
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve(undefined)),
    })),
  },
  customersTable: { id: "id", wcCustomerId: "wcCustomerId" },
  analyticsEventsTable: { name: "name", action: "action" },
  CUSTOMER_GENDERS: [],
}));

let app: Express;
let fetchSpy: ReturnType<typeof vi.spyOn>;
const fetchCalls: string[] = [];

// Default fetch handler used by each test unless overridden via
// `setFetchResponses`. Maps a URL substring to a Response factory so
// individual tests can stage the WC and (optionally) WP probe outcomes
// independently.
type Responder = () => Response;
let wcResponder: Responder = () =>
  new Response(JSON.stringify([{ id: 555, email: "jane@example.com", first_name: "Jane", last_name: "Doe", billing: { phone: "+96170000000" } }]), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
let wpResponder: Responder = () =>
  new Response(JSON.stringify({ code: "[jwt_auth] invalid_email" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });

beforeEach(async () => {
  vi.clearAllMocks();
  fetchCalls.length = 0;
  isClerkConfiguredMock.mockReturnValue(true);
  ensureClerkUserForCustomerMock.mockResolvedValue({
    ok: true,
    created: true,
    alreadyExisted: false,
    clerkUserId: "user_new",
  });

  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    fetchCalls.push(u);
    if (u.includes("/jwt-auth/v1/token")) return wpResponder();
    return wcResponder();
  });

  vi.resetModules();
  const mod = await import("../src/routes/auth");
  app = express();
  app.use(express.json());
  app.use("/api", mod.default);
});

afterEach(() => {
  fetchSpy.mockRestore();
  // Reset shared responders so a test that customised them can't leak
  // into the next describe block.
  wcResponder = () =>
    new Response(JSON.stringify([{ id: 555, email: "jane@example.com" }]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  wpResponder = () =>
    new Response(JSON.stringify({ code: "[jwt_auth] invalid_email" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
});

describe("POST /api/auth/web-bridge", () => {
  it("returns { exists: true, clerkReady: true } and provisions Clerk for an existing WC shopper", async () => {
    const res = await request(app)
      .post("/api/auth/web-bridge")
      .send({ email: "Jane@Example.com" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, exists: true, clerkReady: true });
    expect(ensureClerkUserForCustomerMock).toHaveBeenCalledTimes(1);
    const callArg = ensureClerkUserForCustomerMock.mock.calls[0]![0];
    expect(callArg).toMatchObject({
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Doe",
      // Mocked upsertCustomer returns id 7 → that's what gets correlated.
      localCustomerId: 7,
    });
  });

  it("returns { exists: false } with NO code for unknown emails so the UI can route to sign-up", async () => {
    // WC: empty list; WP probe: invalid_email (default).
    wcResponder = () =>
      new Response("[]", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    const res = await request(app)
      .post("/api/auth/web-bridge")
      .send({ email: "nobody@example.com" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, exists: false });
    expect(ensureClerkUserForCustomerMock).not.toHaveBeenCalled();
  });

  it("returns code: lookup_failed when the WC lookup itself errors and never touches Clerk", async () => {
    wcResponder = () => new Response("upstream broken", { status: 503 });
    const res = await request(app)
      .post("/api/auth/web-bridge")
      .send({ email: "jane@example.com" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      exists: false,
      code: "lookup_failed",
    });
    expect(ensureClerkUserForCustomerMock).not.toHaveBeenCalled();
  });

  it("returns code: lookup_unavailable when WC creds are missing", async () => {
    const original = process.env.WC_CONSUMER_KEY;
    delete process.env.WC_CONSUMER_KEY;
    try {
      const res = await request(app)
        .post("/api/auth/web-bridge")
        .send({ email: "jane@example.com" });
      expect(res.body).toEqual({
        ok: true,
        exists: false,
        code: "lookup_unavailable",
      });
      expect(ensureClerkUserForCustomerMock).not.toHaveBeenCalled();
    } finally {
      if (original !== undefined) process.env.WC_CONSUMER_KEY = original;
    }
  });

  it("returns clerkReady: false with code: lookup_unavailable when Clerk isn't configured", async () => {
    isClerkConfiguredMock.mockReturnValue(false);
    const res = await request(app)
      .post("/api/auth/web-bridge")
      .send({ email: "jane@example.com" });

    expect(res.body).toEqual({
      ok: true,
      exists: true,
      clerkReady: false,
      code: "lookup_unavailable",
    });
    expect(ensureClerkUserForCustomerMock).not.toHaveBeenCalled();
  });

  it("returns clerkReady: false with code: lookup_failed when ensureClerkUserForCustomer rejects", async () => {
    ensureClerkUserForCustomerMock.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app)
      .post("/api/auth/web-bridge")
      .send({ email: "jane@example.com" });
    expect(res.body).toEqual({
      ok: true,
      exists: true,
      clerkReady: false,
      code: "lookup_failed",
    });
  });

  // The helper is intentionally non-throwing — it returns structured
  // `{ok:false,reason}`. The route MUST inspect that and propagate as
  // a hard error; otherwise the web SignIn page would advance the
  // shopper to a Clerk email-code step against a user that doesn't
  // exist.
  it("returns clerkReady: false with code: lookup_failed when ensureClerkUserForCustomer resolves with {ok:false,reason:'error'}", async () => {
    ensureClerkUserForCustomerMock.mockResolvedValueOnce({
      ok: false,
      reason: "error",
      message: "clerk 5xx",
    });
    const res = await request(app)
      .post("/api/auth/web-bridge")
      .send({ email: "jane@example.com" });
    expect(res.body).toEqual({
      ok: true,
      exists: true,
      clerkReady: false,
      code: "lookup_failed",
    });
  });

  it("returns clerkReady: false with code: lookup_unavailable when ensureClerkUserForCustomer resolves with reason:'not_configured'", async () => {
    ensureClerkUserForCustomerMock.mockResolvedValueOnce({
      ok: false,
      reason: "not_configured",
    });
    const res = await request(app)
      .post("/api/auth/web-bridge")
      .send({ email: "jane@example.com" });
    expect(res.body).toEqual({
      ok: true,
      exists: true,
      clerkReady: false,
      code: "lookup_unavailable",
    });
  });

  it("rejects malformed emails the same way /auth/exists does (no upstream calls)", async () => {
    const res = await request(app)
      .post("/api/auth/web-bridge")
      .send({ email: "not-an-email" });
    expect(res.body).toEqual({ ok: true, exists: false });
    expect(fetchCalls.length).toBe(0);
    expect(ensureClerkUserForCustomerMock).not.toHaveBeenCalled();
  });
});
