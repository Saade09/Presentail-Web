import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  jwtVerify: vi.fn(),
  clerkAuth: { userId: null, sessionClaims: null } as {
    userId: string | null;
    sessionClaims: Record<string, unknown> | null;
  },
  upsertCustomer: vi.fn(),
  getCustomerById: vi.fn(),
  customerRow: {
    deletedAt: null as Date | null,
    sessionVersion: 0,
    sessionRevokedAt: null as Date | null,
  },
}));

vi.mock("jose", () => ({
  jwtVerify: (...args: any[]) => mocks.jwtVerify(...args),
}));

vi.mock("@clerk/express", () => ({
  getAuth: () => mocks.clerkAuth,
  createClerkClient: () => ({}),
}));

vi.mock("@workspace/clerk-types", () => ({
  isUserType: () => true,
}));

vi.mock("../lib/wooStore", () => ({
  resolveStore: () => ({}),
  resolveStoreFromRequest: () => ({}),
}));

vi.mock("../lib/customers", () => ({
  upsertCustomer: (...args: any[]) => mocks.upsertCustomer(...args),
  getCustomerById: (...args: any[]) => mocks.getCustomerById(...args),
  getCustomerByWcId: vi.fn(),
  syncCustomerToWoo: vi.fn(),
}));

vi.mock("../lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([mocks.customerRow]),
        }),
      }),
    }),
  },
  analyticsEventsTable: {},
  customersTable: {
    id: "id",
    wcCustomerId: "wc_customer_id",
    deletedAt: "deleted_at",
    sessionVersion: "session_version",
    sessionRevokedAt: "session_revoked_at",
  },
}));

import { authenticate } from "./auth";

function tokenWithPayload(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${encoded}.signature`;
}

describe("server JWT session revocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SOCIAL_JWT_SECRET = "a".repeat(32);
    mocks.customerRow.deletedAt = null;
    mocks.customerRow.sessionVersion = 1;
    mocks.customerRow.sessionRevokedAt = null;
    mocks.clerkAuth = { userId: null, sessionClaims: null };
    mocks.upsertCustomer.mockResolvedValue({
      customer: { id: 42 },
      created: false,
    });
    mocks.getCustomerById.mockResolvedValue({
      id: 42,
      deletedAt: null,
      sessionRevokedAt: null,
      wcCustomerId: null,
    });
    mocks.jwtVerify.mockResolvedValue({
      payload: {
        customer_id: 42,
        local_customer_id: 42,
      },
    });
  });

  it("rejects a server token issued before the password reset", async () => {
    const token = tokenWithPayload({
      iss: "presentail-api",
      session_version: 0,
    });

    const result = await authenticate(`Bearer ${token}`);

    expect(result).toMatchObject({
      ok: false,
      status: 401,
      message: "Invalid or expired session",
    });
  });

  it("accepts a server token issued after the password reset", async () => {
    const token = tokenWithPayload({
      iss: "presentail-api",
      session_version: 1,
    });

    const result = await authenticate(`Bearer ${token}`);

    expect(result).toMatchObject({ ok: true, customerId: 42 });
  });

  it("treats a pre-versioning token as version zero and rejects it after reset", async () => {
    const token = tokenWithPayload({ iss: "presentail-api" });

    const result = await authenticate(`Bearer ${token}`);

    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it("rejects a WordPress bearer token issued before the reset boundary", async () => {
    mocks.customerRow.sessionRevokedAt = new Date(2_000);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const token = tokenWithPayload({
      data: { user: { id: 42 } },
      iat: 1,
    });

    const result = await authenticate(`Bearer ${token}`);

    expect(result).toMatchObject({ ok: false, status: 401 });
    vi.unstubAllGlobals();
  });

  it("accepts a WordPress bearer token issued after the reset boundary", async () => {
    mocks.customerRow.sessionRevokedAt = new Date(2_000);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const token = tokenWithPayload({
      data: { user: { id: 42 } },
      iat: 3,
    });

    const result = await authenticate(`Bearer ${token}`);

    expect(result).toMatchObject({ ok: true, customerId: 42 });
    vi.unstubAllGlobals();
  });

  it("rejects a Clerk bearer session issued before the reset boundary", async () => {
    process.env.CLERK_SECRET_KEY = "sk_test_session_revocation";
    mocks.clerkAuth = {
      userId: "clerk-user-42",
      sessionClaims: {
        email: "user@example.com",
        iat: 1,
        public_metadata: { userType: "customer" },
      },
    };
    mocks.getCustomerById.mockResolvedValue({
      id: 42,
      deletedAt: null,
      sessionRevokedAt: new Date(2_000),
      wcCustomerId: null,
    });

    const result = await authenticate(undefined, {
      header: () => undefined,
      headers: {},
      query: {},
      log: { warn: vi.fn(), error: vi.fn() },
    } as any);

    expect(result).toMatchObject({ ok: false, status: 401 });
    delete process.env.CLERK_SECRET_KEY;
  });

  it("accepts a Clerk bearer session issued after the reset boundary", async () => {
    process.env.CLERK_SECRET_KEY = "sk_test_session_revocation";
    mocks.clerkAuth = {
      userId: "clerk-user-42",
      sessionClaims: {
        email: "user@example.com",
        iat: 3,
        public_metadata: { userType: "customer" },
      },
    };
    mocks.getCustomerById.mockResolvedValue({
      id: 42,
      deletedAt: null,
      sessionRevokedAt: new Date(2_000),
      wcCustomerId: null,
    });

    const result = await authenticate(undefined, {
      header: () => undefined,
      headers: {},
      query: {},
      log: { warn: vi.fn(), error: vi.fn() },
    } as any);

    expect(result).toMatchObject({ ok: true, localCustomerId: 42 });
    delete process.env.CLERK_SECRET_KEY;
  });
});