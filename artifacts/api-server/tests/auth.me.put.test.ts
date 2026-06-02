import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// PUT /auth/me contract under test:
//   1. authenticate() must succeed; 401 otherwise.
//   2. body.gender must be one of CUSTOMER_GENDERS (or null/""), unknown
//      values are silently ignored — they never reject the whole request.
//   3. body.birthday goes through parseBirthday: must be a real past
//      calendar date in YYYY-MM-DD form, no future dates, not older than
//      130 years, non-string types are rejected. Malformed → 400.
//   4. The local customers row is patched with whatever fields were
//      provided, then a best-effort WC mirror PUT is attempted. The final
//      response overlays gender/birthday from the local row.

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
const normalizePhoneE164Mock = vi.fn(
  (raw: string | null | undefined) => (raw ? String(raw) : null),
);
vi.mock("../src/lib/customers", () => ({
  getCustomerByWcId: (...args: unknown[]) => getCustomerByWcIdMock(...args),
  upsertCustomer: (...args: unknown[]) => upsertCustomerMock(...args),
  normalizePhoneE164: (...args: [string | null | undefined]) =>
    normalizePhoneE164Mock(...args),
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
  };
});

const dbUpdateSet = vi.fn();
const dbUpdateWhere = vi.fn().mockResolvedValue(undefined);
vi.mock("@workspace/db", () => ({
  db: {
    update: vi.fn(() => ({
      set: (...args: unknown[]) => {
        dbUpdateSet(...args);
        return { where: dbUpdateWhere };
      },
    })),
  },
  customersTable: {
    id: "id",
    wcCustomerId: "wcCustomerId",
    $inferInsert: {} as Record<string, unknown>,
  },
  CUSTOMER_GENDERS: ["female", "male", "unspecified"] as const,
}));

let app: Express;
let fetchSpy: ReturnType<typeof vi.spyOn>;
const wcCalls: { url: string; init: RequestInit | undefined }[] = [];

beforeEach(async () => {
  vi.clearAllMocks();
  wcCalls.length = 0;
  dbUpdateWhere.mockResolvedValue(undefined);

  fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url, init) => {
      wcCalls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          id: 555,
          email: "wc@example.com",
          first_name: "WCFirst",
          last_name: "WCLast",
          username: "wcuser",
          billing: { phone: "+96170000000" },
          meta_data: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

  const mod = await import("../src/routes/auth");
  app = express();
  app.use(express.json());
  app.use("/api", mod.default);
});

afterEach(() => {
  fetchSpy.mockRestore();
  vi.resetModules();
});

function authedOk(customerId = 555) {
  authenticateMock.mockResolvedValueOnce({
    ok: true,
    customerId,
    token: "tkn",
  });
}

const baseLocal = {
  id: 1,
  email: "local@example.com",
  firstName: "Local",
  lastName: "User",
  phoneE164: "+96170111111",
  wcCustomerId: 555,
  gender: null as string | null,
  birthday: null as string | null,
};

describe("PUT /api/auth/me — authentication", () => {
  it("returns 401 when no Authorization header is provided", async () => {
    authenticateMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      message: "Missing token",
    });

    const res = await request(app).put("/api/auth/me").send({ firstName: "X" });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ ok: false, message: "Missing token" });
    expect(dbUpdateSet).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 401 when the token is invalid", async () => {
    authenticateMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      message: "bad",
    });

    const res = await request(app)
      .put("/api/auth/me")
      .set("Authorization", "Bearer bad")
      .send({ firstName: "X" });

    expect(res.status).toBe(401);
    expect(dbUpdateSet).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("PUT /api/auth/me — valid updates", () => {
  it("accepts a complete valid update and persists every field locally", async () => {
    authedOk();
    getCustomerByWcIdMock.mockResolvedValue({
      ...baseLocal,
      firstName: "New",
      lastName: "Name",
      phoneE164: "+96170999999",
      gender: "female",
      birthday: "1990-05-15",
    });

    const res = await request(app)
      .put("/api/auth/me")
      .set("Authorization", "Bearer good")
      .send({
        firstName: "New",
        lastName: "Name",
        phone: "+96170999999",
        gender: "female",
        birthday: "1990-05-15",
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user).toMatchObject({
      id: 555,
      gender: "female",
      birthday: "1990-05-15",
    });

    expect(dbUpdateSet).toHaveBeenCalledTimes(1);
    const patch = dbUpdateSet.mock.calls[0]![0] as Record<string, unknown>;
    expect(patch).toMatchObject({
      firstName: "New",
      lastName: "Name",
      phoneE164: "+96170999999",
      gender: "female",
      birthday: "1990-05-15",
    });

    const wcPut = wcCalls.find((c) => c.init?.method === "PUT");
    expect(wcPut).toBeDefined();
    const body = JSON.parse(String(wcPut!.init!.body));
    expect(body.first_name).toBe("New");
    expect(body.meta_data).toEqual(
      expect.arrayContaining([
        { key: "presentail_gender", value: "female" },
        { key: "presentail_birthday", value: "1990-05-15" },
      ]),
    );
  });

  it("supports a partial update touching only firstName", async () => {
    authedOk();
    getCustomerByWcIdMock.mockResolvedValue({
      ...baseLocal,
      firstName: "Just-First",
    });

    const res = await request(app)
      .put("/api/auth/me")
      .set("Authorization", "Bearer good")
      .send({ firstName: "Just-First" });

    expect(res.status).toBe(200);
    const patch = dbUpdateSet.mock.calls[0]![0] as Record<string, unknown>;
    expect(patch).toEqual({
      firstName: "Just-First",
      updatedAt: expect.any(Date),
    });

    const wcPut = wcCalls.find((c) => c.init?.method === "PUT");
    const body = JSON.parse(String(wcPut!.init!.body));
    expect(body).toEqual({ first_name: "Just-First" });
  });

  it("clears the birthday when null is sent", async () => {
    authedOk();
    getCustomerByWcIdMock.mockResolvedValue({
      ...baseLocal,
      birthday: null,
    });

    const res = await request(app)
      .put("/api/auth/me")
      .set("Authorization", "Bearer good")
      .send({ birthday: null });

    expect(res.status).toBe(200);
    expect(res.body.user.birthday).toBeNull();
    const patch = dbUpdateSet.mock.calls[0]![0] as Record<string, unknown>;
    expect(patch).toMatchObject({ birthday: null });

    const wcPut = wcCalls.find((c) => c.init?.method === "PUT");
    const body = JSON.parse(String(wcPut!.init!.body));
    expect(body.meta_data).toEqual([
      { key: "presentail_birthday", value: "" },
    ]);
  });

});

describe("PUT /api/auth/me — gender handling", () => {
  it("silently ignores an unknown gender value (does not reject the request)", async () => {
    authedOk();
    getCustomerByWcIdMock.mockResolvedValue({ ...baseLocal });

    const res = await request(app)
      .put("/api/auth/me")
      .set("Authorization", "Bearer good")
      .send({ firstName: "Keep", gender: "robot" });

    expect(res.status).toBe(200);
    const patch = dbUpdateSet.mock.calls[0]![0] as Record<string, unknown>;
    expect(patch.firstName).toBe("Keep");
    expect("gender" in patch).toBe(false);

    const wcPut = wcCalls.find((c) => c.init?.method === "PUT");
    const body = JSON.parse(String(wcPut!.init!.body));
    expect(body.meta_data).toBeUndefined();
  });

  it("clears gender when null is sent", async () => {
    authedOk();
    getCustomerByWcIdMock.mockResolvedValue({ ...baseLocal, gender: null });

    const res = await request(app)
      .put("/api/auth/me")
      .set("Authorization", "Bearer good")
      .send({ gender: null });

    expect(res.status).toBe(200);
    const patch = dbUpdateSet.mock.calls[0]![0] as Record<string, unknown>;
    expect(patch).toMatchObject({ gender: null });
    const wcPut = wcCalls.find((c) => c.init?.method === "PUT");
    const body = JSON.parse(String(wcPut!.init!.body));
    expect(body.meta_data).toEqual([
      { key: "presentail_gender", value: "" },
    ]);
  });

  it.each(["female", "male", "unspecified"])(
    "accepts the canonical gender value %s",
    async (gender) => {
      authedOk();
      getCustomerByWcIdMock.mockResolvedValue({ ...baseLocal, gender });

      const res = await request(app)
        .put("/api/auth/me")
        .set("Authorization", "Bearer good")
        .send({ gender });

      expect(res.status).toBe(200);
      const patch = dbUpdateSet.mock.calls[0]![0] as Record<string, unknown>;
      expect(patch).toMatchObject({ gender });
    },
  );
});

describe("PUT /api/auth/me — birthday rejection", () => {
  const cases: Array<[string, unknown]> = [
    ["bad format (slashes)", "1990/05/15"],
    ["bad format (short)", "90-5-1"],
    ["non-string number", 19900515],
    ["non-string boolean", true],
    ["future date", "2999-01-01"],
    ["non-existent calendar day (Feb 31)", "2024-02-31"],
    ["non-existent calendar day (Apr 31)", "2024-04-31"],
    ["older than 130 years", "1800-01-01"],
    ["garbage string", "not-a-date"],
  ];

  for (const [label, value] of cases) {
    it(`rejects ${label} with 400`, async () => {
      authedOk();

      const res = await request(app)
        .put("/api/auth/me")
        .set("Authorization", "Bearer good")
        .send({ birthday: value });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ ok: false, message: "Invalid birthday" });
      // Nothing should be persisted when the validator rejects.
      expect(dbUpdateSet).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  }

  it("treats a WooCommerce mirror failure as non-fatal (local save still succeeds)", async () => {
    authedOk();
    getCustomerByWcIdMock.mockResolvedValue({
      ...baseLocal,
      gender: "male",
    });
    // Make the WC mirror PUT explicitly fail. The route must still
    // return 200 with the locally-saved profile — losing the WC
    // round-trip should never lose the user's profile edit.
    fetchSpy.mockReset();
    fetchSpy.mockImplementation(async (url, init) => {
      wcCalls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({ message: "WC down" }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    });

    const res = await request(app)
      .put("/api/auth/me")
      .set("Authorization", "Bearer good")
      .send({ gender: "male" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user.gender).toBe("male");
    // Local row was still patched.
    const patch = dbUpdateSet.mock.calls[0]![0] as Record<string, unknown>;
    expect(patch).toMatchObject({ gender: "male" });
  });

  it("accepts today's UTC date as a valid birthday", async () => {
    authedOk();
    const today = new Date();
    const yyyy = today.getUTCFullYear();
    const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(today.getUTCDate()).padStart(2, "0");
    const todayStr = `${yyyy}-${mm}-${dd}`;
    getCustomerByWcIdMock.mockResolvedValue({
      ...baseLocal,
      birthday: todayStr,
    });

    const res = await request(app)
      .put("/api/auth/me")
      .set("Authorization", "Bearer good")
      .send({ birthday: todayStr });

    expect(res.status).toBe(200);
    expect(res.body.user.birthday).toBe(todayStr);
  });
});
