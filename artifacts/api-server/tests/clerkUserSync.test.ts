import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Tests for `lib/clerkUserSync` — the shared helper used by the web
// sign-in JIT bridge, the mobile register/social mirror, and the daily
// catch-up worker. The contract under test:
//
//   * `isClerkConfigured()` is gated on `CLERK_SECRET_KEY` matching the
//     `^sk_(test|live)_` shape (mirrors the same guard in src/app.ts).
//   * `ensureClerkUserForCustomer` returns `alreadyExisted: true` when a
//     prior `getUserList` finds the email — no createUser call is made.
//   * It treats Clerk's `form_identifier_exists` race response as a
//     successful no-op so that JIT, on-register, and catch-up paths can
//     run concurrently without surfacing fake errors.
//   * `ensureClerkUserInBackground` never throws even if the underlying
//     ensure fails — the auth handlers fire-and-forget it.

const ORIGINAL_SECRET = process.env.CLERK_SECRET_KEY;

// Track the exact arguments passed to Clerk so we can assert the field
// mapping that existing data depends on (externalId, publicMetadata, etc).
const h = vi.hoisted(() => {
  return {
    getUserListMock: vi.fn(),
    createUserMock: vi.fn(),
  };
});

vi.mock("@clerk/express", () => ({
  createClerkClient: () => ({
    users: {
      getUserList: h.getUserListMock,
      createUser: h.createUserMock,
    },
  }),
}));

vi.mock("../src/lib/alerts", () => ({
  sendAlert: vi.fn(async () => {}),
}));

beforeEach(() => {
  process.env.CLERK_SECRET_KEY = "sk_test_aaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  h.getUserListMock.mockReset();
  h.createUserMock.mockReset();
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.CLERK_SECRET_KEY;
  } else {
    process.env.CLERK_SECRET_KEY = ORIGINAL_SECRET;
  }
});

describe("isClerkConfigured", () => {
  it("returns false for missing or malformed secret", async () => {
    delete process.env.CLERK_SECRET_KEY;
    const { isClerkConfigured } = await import("../src/lib/clerkUserSync");
    expect(isClerkConfigured()).toBe(false);

    process.env.CLERK_SECRET_KEY = "garbage";
    vi.resetModules();
    const fresh = await import("../src/lib/clerkUserSync");
    expect(fresh.isClerkConfigured()).toBe(false);
  });

  it("returns true for sk_test_ / sk_live_ shaped secrets", async () => {
    process.env.CLERK_SECRET_KEY = "sk_test_xyz";
    vi.resetModules();
    const a = await import("../src/lib/clerkUserSync");
    expect(a.isClerkConfigured()).toBe(true);

    process.env.CLERK_SECRET_KEY = "sk_live_xyz";
    vi.resetModules();
    const b = await import("../src/lib/clerkUserSync");
    expect(b.isClerkConfigured()).toBe(true);
  });
});

describe("ensureClerkUserForCustomer", () => {
  it("returns alreadyExisted=true and skips createUser when the email is found", async () => {
    h.getUserListMock.mockResolvedValueOnce({ data: [{ id: "user_existing" }] });
    const { ensureClerkUserForCustomer } = await import("../src/lib/clerkUserSync");
    const res = await ensureClerkUserForCustomer({
      email: "Jane@Example.com",
      firstName: "Jane",
      lastName: "Doe",
      localCustomerId: 42,
    });
    expect(res).toEqual({
      ok: true,
      created: false,
      alreadyExisted: true,
      clerkUserId: "user_existing",
    });
    expect(h.createUserMock).not.toHaveBeenCalled();
    // Lookup must lowercase the email so dedupe is case-insensitive.
    expect(h.getUserListMock).toHaveBeenCalledWith({
      emailAddress: ["jane@example.com"],
      limit: 1,
    });
  });

  it("creates the user with the same field mapping the import script uses", async () => {
    h.getUserListMock.mockResolvedValueOnce({ data: [] });
    h.createUserMock.mockResolvedValueOnce({ id: "user_new_123" });
    const { ensureClerkUserForCustomer } = await import("../src/lib/clerkUserSync");
    const res = await ensureClerkUserForCustomer({
      email: "  NEW@Example.com  ",
      firstName: "New",
      lastName: "User",
      localCustomerId: 99,
    });
    expect(res).toMatchObject({ ok: true, created: true, alreadyExisted: false, clerkUserId: "user_new_123" });
    expect(h.createUserMock).toHaveBeenCalledWith({
      emailAddress: ["new@example.com"],
      firstName: "New",
      lastName: "User",
      externalId: "99",
      publicMetadata: { userType: "customer" },
      skipPasswordRequirement: true,
    });
  });

  it("treats form_identifier_exists as a successful no-op (race recovery)", async () => {
    h.getUserListMock.mockResolvedValueOnce({ data: [] });
    h.createUserMock.mockRejectedValueOnce({
      errors: [{ code: "form_identifier_exists" }],
    });
    const { ensureClerkUserForCustomer } = await import("../src/lib/clerkUserSync");
    const res = await ensureClerkUserForCustomer({
      email: "race@example.com",
      localCustomerId: 1,
    });
    expect(res).toEqual({
      ok: true,
      created: false,
      alreadyExisted: true,
      clerkUserId: null,
    });
  });

  it("returns ok:false with reason 'not_configured' when the secret is missing", async () => {
    delete process.env.CLERK_SECRET_KEY;
    vi.resetModules();
    const { ensureClerkUserForCustomer } = await import("../src/lib/clerkUserSync");
    const res = await ensureClerkUserForCustomer({ email: "x@y.com" });
    expect(res).toMatchObject({ ok: false, reason: "not_configured" });
    expect(h.createUserMock).not.toHaveBeenCalled();
  });

  it("rejects malformed emails before talking to Clerk", async () => {
    const { ensureClerkUserForCustomer } = await import("../src/lib/clerkUserSync");
    const res = await ensureClerkUserForCustomer({ email: "not-an-email" });
    expect(res).toMatchObject({ ok: false, reason: "invalid_email" });
    expect(h.getUserListMock).not.toHaveBeenCalled();
    expect(h.createUserMock).not.toHaveBeenCalled();
  });

  it("returns ok:false reason 'error' on non-race Clerk failures", async () => {
    h.getUserListMock.mockResolvedValueOnce({ data: [] });
    h.createUserMock.mockRejectedValueOnce({
      errors: [{ code: "form_password_too_short", longMessage: "nope" }],
      status: 422,
    });
    const { ensureClerkUserForCustomer } = await import("../src/lib/clerkUserSync");
    const res = await ensureClerkUserForCustomer({ email: "x@y.com" });
    expect(res).toMatchObject({ ok: false, reason: "error", message: "nope" });
  });
});

describe("ensureClerkUserInBackground", () => {
  it("never throws even when the underlying ensure rejects unexpectedly", async () => {
    // Force the inner getUserList to throw synchronously after the call;
    // the background helper must swallow it.
    h.getUserListMock.mockImplementation(() => {
      throw new Error("boom");
    });
    const { ensureClerkUserInBackground } = await import("../src/lib/clerkUserSync");
    expect(() =>
      ensureClerkUserInBackground({ email: "x@y.com" }),
    ).not.toThrow();
    // Allow the microtask queue to drain so the rejection (if any) lands.
    await new Promise((r) => setImmediate(r));
  });
});
