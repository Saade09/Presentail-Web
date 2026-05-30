import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: null, sessionClaims: null }),
  createClerkClient: () => ({
    users: { getUser: vi.fn(), updateUserMetadata: vi.fn() },
  }),
}));

const authenticateMock = vi.fn();
vi.mock("../src/lib/auth", () => ({
  authenticate: (...args: unknown[]) => authenticateMock(...args),
  signServerToken: vi.fn(),
  decodeJwtPayload: vi.fn(() => null),
}));

const getCustomerByWcIdMock = vi.fn();
vi.mock("../src/lib/customers", () => ({
  getCustomerByWcId: (...args: unknown[]) => getCustomerByWcIdMock(...args),
  upsertCustomer: vi.fn(),
}));

// ─── DB mock with chainable, queueable returns ──────────────────────────────
//
// The routes use Drizzle's fluent API with three distinct select terminators:
//
//   select...limit()              → selectLimitQueue (no prior orderBy)
//   select...orderBy().limit()    → selectOrderByLimitQueue (DELETE promote)
//   select...orderBy() [no limit] → selectOrderByOnlyQueue (GET list)
//
// Update terminators:
//   update...where()              → resolves undefined (return value ignored)
//   update...where().returning()  → updateReturningQueue
//
// insert...values().returning()   → insertReturningQueue
// delete...where()                → resolves undefined

const h = vi.hoisted(() => {
  const queues = {
    selectLimit: [] as unknown[][],
    selectOrderByOnly: [] as unknown[][],
    selectOrderByLimit: [] as unknown[][],
    updateReturning: [] as unknown[][],
    insertReturning: [] as Array<{ rows?: unknown[]; error?: unknown }>,
  };

  const calls = {
    updateSet: [] as unknown[],
    insertValues: [] as unknown[],
  };

  function makeSelectChain() {
    let ordered = false;
    const chain: any = {
      from: () => chain,
      where: () => chain,
      orderBy: () => {
        ordered = true;
        return chain;
      },
      limit: () =>
        ordered
          ? Promise.resolve(queues.selectOrderByLimit.shift() ?? [])
          : Promise.resolve(queues.selectLimit.shift() ?? []),
      // Makes the chain itself awaitable: covers select...orderBy() with no limit.
      then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
        Promise.resolve(queues.selectOrderByOnly.shift() ?? []).then(res, rej),
    };
    return chain;
  }

  function makeUpdateChain() {
    const chain: any = {
      set: (v: unknown) => {
        calls.updateSet.push(v);
        return chain;
      },
      where: () => {
        const afterWhere: any = {
          // .where().returning() path
          returning: () => Promise.resolve(queues.updateReturning.shift() ?? []),
          // await db.update().set().where() path (return value ignored by route)
          then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
            Promise.resolve(undefined).then(res, rej),
        };
        return afterWhere;
      },
    };
    return chain;
  }

  function makeInsertChain() {
    const chain: any = {
      values: (v: unknown) => {
        calls.insertValues.push(v);
        return chain;
      },
      returning: () => {
        const next = queues.insertReturning.shift();
        if (!next) return Promise.resolve([]);
        if (next.error) return Promise.reject(next.error);
        return Promise.resolve(next.rows ?? []);
      },
    };
    return chain;
  }

  const dbMock = {
    select: vi.fn(makeSelectChain),
    update: vi.fn(makeUpdateChain),
    insert: vi.fn(makeInsertChain),
    delete: vi.fn(() => ({ where: () => Promise.resolve(undefined) })),
  };

  return { queues, calls, dbMock };
});

vi.mock("@workspace/db", () => ({
  db: h.dbMock,
  customerAddressesTable: {
    id: "id",
    customerId: "customerId",
    isDefault: "isDefault",
    updatedAt: "updatedAt",
    label: "label",
    nickname: "nickname",
    countryCode: "countryCode",
    district: "district",
    addressLine: "addressLine",
    apartment: "apartment",
    building: "building",
    directions: "directions",
    recipientFirstName: "recipientFirstName",
    recipientLastName: "recipientLastName",
    recipientPhoneCountryCode: "recipientPhoneCountryCode",
    recipientPhone: "recipientPhone",
  },
}));

// ─── Harness ─────────────────────────────────────────────────────────────────

const { queues, calls, dbMock } = h;

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    customerId: 42,
    label: "home",
    nickname: null,
    countryCode: "LB",
    district: "Beirut",
    addressLine: "123 Main St",
    apartment: null,
    building: null,
    directions: null,
    recipientFirstName: null,
    recipientLastName: null,
    recipientPhoneCountryCode: null,
    recipientPhone: null,
    isDefault: false,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

const VALID_INPUT = {
  label: "home",
  countryCode: "LB",
  district: "Beirut",
  addressLine: "123 Main St",
};

let app: Express;

beforeEach(async () => {
  vi.clearAllMocks();
  queues.selectLimit.length = 0;
  queues.selectOrderByOnly.length = 0;
  queues.selectOrderByLimit.length = 0;
  queues.updateReturning.length = 0;
  queues.insertReturning.length = 0;
  calls.updateSet.length = 0;
  calls.insertValues.length = 0;

  authenticateMock.mockResolvedValue({ ok: true, customerId: 1001, token: "tkn" });
  getCustomerByWcIdMock.mockResolvedValue({ id: 42 });

  const mod = await import("../src/routes/meAddresses");
  app = express();
  app.use(express.json());
  // The PATCH route calls req.log.info(); provide a stub so tests don't throw.
  app.use((req, _res, next) => {
    (req as any).log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    next();
  });
  app.use("/api", mod.default);
});

afterEach(() => {
  vi.resetModules();
});

// ─── POST /api/me/addresses ───────────────────────────────────────────────────

describe("POST /api/me/addresses", () => {
  it("automatically sets the first saved address as default", async () => {
    queues.selectLimit.push([]); // no existing addresses → isFirst = true
    const row = makeRow({ isDefault: true });
    queues.insertReturning.push({ rows: [row] });

    const res = await request(app)
      .post("/api/me/addresses")
      .set("Authorization", "Bearer token")
      .send(VALID_INPUT);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.address.isDefault).toBe(true);
    // The route issues a safe "clear any existing default" update even on first
    // insert (no rows match, but the call is made). Verify isDefault=true was inserted.
    const inserted = calls.insertValues[0] as Record<string, unknown>;
    expect(inserted.isDefault).toBe(true);
    // The clear-default update patch should have isDefault: false.
    const clearPatch = calls.updateSet[0] as Record<string, unknown> | undefined;
    if (clearPatch) expect(clearPatch.isDefault).toBe(false);
  });

  it("clears the previous default when a second address is saved with isDefault: true", async () => {
    queues.selectLimit.push([makeRow({ id: 99 })]); // existing addresses present
    const row = makeRow({ id: 2, isDefault: true });
    queues.insertReturning.push({ rows: [row] });

    const res = await request(app)
      .post("/api/me/addresses")
      .set("Authorization", "Bearer token")
      .send({ ...VALID_INPUT, isDefault: true });

    expect(res.status).toBe(200);
    expect(res.body.address.isDefault).toBe(true);
    // One update to clear the old default, then the insert.
    expect(dbMock.update).toHaveBeenCalledTimes(1);
    const clearPatch = calls.updateSet[0] as Record<string, unknown>;
    expect(clearPatch.isDefault).toBe(false);
    const inserted = calls.insertValues[0] as Record<string, unknown>;
    expect(inserted.isDefault).toBe(true);
  });

  it("saves a non-default address when isDefault is omitted for a subsequent address", async () => {
    queues.selectLimit.push([makeRow({ id: 99 })]); // existing addresses present
    const row = makeRow({ id: 2, isDefault: false });
    queues.insertReturning.push({ rows: [row] });

    const res = await request(app)
      .post("/api/me/addresses")
      .set("Authorization", "Bearer token")
      .send(VALID_INPUT); // no isDefault

    expect(res.status).toBe(200);
    expect(res.body.address.isDefault).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
    const inserted = calls.insertValues[0] as Record<string, unknown>;
    expect(inserted.isDefault).toBe(false);
  });

  it("returns 400 when a required field (district) is missing", async () => {
    const { district: _d, ...body } = VALID_INPUT as any;
    const res = await request(app)
      .post("/api/me/addresses")
      .set("Authorization", "Bearer token")
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("returns 400 for an unrecognised label value", async () => {
    const res = await request(app)
      .post("/api/me/addresses")
      .set("Authorization", "Bearer token")
      .send({ ...VALID_INPUT, label: "castle" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("returns 400 when countryCode is not an ISO 3166-1 alpha-2 code", async () => {
    const res = await request(app)
      .post("/api/me/addresses")
      .set("Authorization", "Bearer token")
      .send({ ...VALID_INPUT, countryCode: "LBNN" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("returns 401 when authentication fails", async () => {
    authenticateMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      message: "Unauthorized",
    });

    const res = await request(app)
      .post("/api/me/addresses")
      .set("Authorization", "Bearer bad")
      .send(VALID_INPUT);

    expect(res.status).toBe(401);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("returns 404 when the authenticated user has no local customer profile", async () => {
    getCustomerByWcIdMock.mockResolvedValueOnce(null);

    const res = await request(app)
      .post("/api/me/addresses")
      .set("Authorization", "Bearer token")
      .send(VALID_INPUT);

    expect(res.status).toBe(404);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("coerces countryCode to upper-case", async () => {
    queues.selectLimit.push([]);
    const row = makeRow({ countryCode: "LB" });
    queues.insertReturning.push({ rows: [row] });

    const res = await request(app)
      .post("/api/me/addresses")
      .set("Authorization", "Bearer token")
      .send({ ...VALID_INPUT, countryCode: "lb" });

    expect(res.status).toBe(200);
    const inserted = calls.insertValues[0] as Record<string, unknown>;
    expect(inserted.countryCode).toBe("LB");
  });

  it("stores null for blank-string optional fields", async () => {
    queues.selectLimit.push([]);
    const row = makeRow({ nickname: null, apartment: null });
    queues.insertReturning.push({ rows: [row] });

    await request(app)
      .post("/api/me/addresses")
      .set("Authorization", "Bearer token")
      .send({ ...VALID_INPUT, nickname: "  ", apartment: "" });

    const inserted = calls.insertValues[0] as Record<string, unknown>;
    expect(inserted.nickname).toBeNull();
    expect(inserted.apartment).toBeNull();
  });
});

// ─── PATCH /api/me/addresses/:id ─────────────────────────────────────────────

describe("PATCH /api/me/addresses/:id", () => {
  it("applies a partial update and returns the updated row", async () => {
    const existing = makeRow({ id: 5, customerId: 42, isDefault: false });
    queues.selectLimit.push([existing]);
    const updated = makeRow({ id: 5, label: "work" });
    queues.updateReturning.push([updated]);

    const res = await request(app)
      .patch("/api/me/addresses/5")
      .set("Authorization", "Bearer token")
      .send({ label: "work" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.address.label).toBe("work");
    // Only one update (the patch itself); no default-clearing needed.
    expect(dbMock.update).toHaveBeenCalledTimes(1);
    const patch = calls.updateSet[0] as Record<string, unknown>;
    expect(patch.label).toBe("work");
  });

  it("clears the old default and promotes this address when isDefault: true is patched", async () => {
    const existing = makeRow({ id: 5, customerId: 42, isDefault: false });
    queues.selectLimit.push([existing]);
    const updated = makeRow({ id: 5, isDefault: true });
    queues.updateReturning.push([updated]);

    const res = await request(app)
      .patch("/api/me/addresses/5")
      .set("Authorization", "Bearer token")
      .send({ isDefault: true });

    expect(res.status).toBe(200);
    expect(res.body.address.isDefault).toBe(true);
    // Two updates: clear the old default first, then apply the patch.
    expect(dbMock.update).toHaveBeenCalledTimes(2);
    const clearPatch = calls.updateSet[0] as Record<string, unknown>;
    expect(clearPatch.isDefault).toBe(false);
    const applyPatch = calls.updateSet[1] as Record<string, unknown>;
    expect(applyPatch.isDefault).toBe(true);
  });

  it("does not issue a default-clearing update when the address is already default", async () => {
    const existing = makeRow({ id: 5, customerId: 42, isDefault: true });
    queues.selectLimit.push([existing]);
    const updated = makeRow({ id: 5, isDefault: true, label: "work" });
    queues.updateReturning.push([updated]);

    const res = await request(app)
      .patch("/api/me/addresses/5")
      .set("Authorization", "Bearer token")
      .send({ label: "work", isDefault: true });

    expect(res.status).toBe(200);
    // Only the patch update — no redundant default-clearing since already default.
    expect(dbMock.update).toHaveBeenCalledTimes(1);
  });

  it("returns 404 when the address does not belong to this customer", async () => {
    queues.selectLimit.push([]); // ownership check misses
    const res = await request(app)
      .patch("/api/me/addresses/5")
      .set("Authorization", "Bearer token")
      .send({ label: "work" });

    expect(res.status).toBe(404);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-numeric address id", async () => {
    const res = await request(app)
      .patch("/api/me/addresses/abc")
      .set("Authorization", "Bearer token")
      .send({ label: "work" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid address id/i);
  });

  it("returns 400 for an invalid patch field (unrecognised label)", async () => {
    const res = await request(app)
      .patch("/api/me/addresses/5")
      .set("Authorization", "Bearer token")
      .send({ label: "castle" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("stores null when a previously-set optional field is cleared with a blank string", async () => {
    const existing = makeRow({ id: 5, customerId: 42, nickname: "Home" });
    queues.selectLimit.push([existing]);
    const updated = makeRow({ id: 5, nickname: null });
    queues.updateReturning.push([updated]);

    await request(app)
      .patch("/api/me/addresses/5")
      .set("Authorization", "Bearer token")
      .send({ nickname: "  " });

    const patch = calls.updateSet[0] as Record<string, unknown>;
    expect(patch.nickname).toBeNull();
  });
});

// ─── DELETE /api/me/addresses/:id ────────────────────────────────────────────

describe("DELETE /api/me/addresses/:id", () => {
  it("deletes a non-default address and does not promote another", async () => {
    const existing = makeRow({ id: 3, customerId: 42, isDefault: false });
    queues.selectLimit.push([existing]);

    const res = await request(app)
      .delete("/api/me/addresses/3")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(dbMock.delete).toHaveBeenCalledTimes(1);
    // Non-default deletion: no promotion query or update.
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("promotes the most-recently-updated remaining address when the default is deleted", async () => {
    const existing = makeRow({ id: 3, customerId: 42, isDefault: true });
    queues.selectLimit.push([existing]); // ownership check
    const nextRow = makeRow({ id: 7, customerId: 42, isDefault: false });
    queues.selectOrderByLimit.push([nextRow]); // find-next query

    const res = await request(app)
      .delete("/api/me/addresses/3")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(dbMock.delete).toHaveBeenCalledTimes(1);
    // Promotion update must be issued.
    expect(dbMock.update).toHaveBeenCalledTimes(1);
    const promotePatch = calls.updateSet[0] as Record<string, unknown>;
    expect(promotePatch.isDefault).toBe(true);
  });

  it("skips promotion when there are no remaining addresses after deleting the default", async () => {
    const existing = makeRow({ id: 3, customerId: 42, isDefault: true });
    queues.selectLimit.push([existing]);
    queues.selectOrderByLimit.push([]); // no remaining addresses

    const res = await request(app)
      .delete("/api/me/addresses/3")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(dbMock.delete).toHaveBeenCalledTimes(1);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the address does not belong to this customer", async () => {
    queues.selectLimit.push([]); // ownership check misses

    const res = await request(app)
      .delete("/api/me/addresses/3")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(404);
    expect(dbMock.delete).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid address id (zero)", async () => {
    const res = await request(app)
      .delete("/api/me/addresses/0")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid address id/i);
  });

  it("returns 400 for a non-numeric address id", async () => {
    const res = await request(app)
      .delete("/api/me/addresses/not-a-number")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(400);
  });
});

// ─── POST /api/me/addresses/:id/default ──────────────────────────────────────

describe("POST /api/me/addresses/:id/default", () => {
  it("clears the existing default then marks the requested address as default", async () => {
    const existing = makeRow({ id: 5, customerId: 42, isDefault: false });
    queues.selectLimit.push([existing]);
    const updated = makeRow({ id: 5, isDefault: true });
    queues.updateReturning.push([updated]);

    const res = await request(app)
      .post("/api/me/addresses/5/default")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.address.isDefault).toBe(true);
    // Two updates: clear old default first, then set new.
    expect(dbMock.update).toHaveBeenCalledTimes(2);
    const clearPatch = calls.updateSet[0] as Record<string, unknown>;
    expect(clearPatch.isDefault).toBe(false);
    const setPatch = calls.updateSet[1] as Record<string, unknown>;
    expect(setPatch.isDefault).toBe(true);
  });

  it("works correctly when the address is already the default", async () => {
    const existing = makeRow({ id: 5, customerId: 42, isDefault: true });
    queues.selectLimit.push([existing]);
    const updated = makeRow({ id: 5, isDefault: true });
    queues.updateReturning.push([updated]);

    const res = await request(app)
      .post("/api/me/addresses/5/default")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body.address.isDefault).toBe(true);
  });

  it("returns 404 when the address does not belong to this customer", async () => {
    queues.selectLimit.push([]); // ownership check misses

    const res = await request(app)
      .post("/api/me/addresses/5/default")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(404);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("returns 400 for a negative address id", async () => {
    const res = await request(app)
      .post("/api/me/addresses/-1/default")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(400);
  });

  it("returns 401 when authentication fails", async () => {
    authenticateMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      message: "Unauthorized",
    });

    const res = await request(app)
      .post("/api/me/addresses/5/default")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(401);
    expect(dbMock.update).not.toHaveBeenCalled();
  });
});
