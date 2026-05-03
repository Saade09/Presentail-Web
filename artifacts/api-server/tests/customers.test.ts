import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── DB mock with chainable, queueable returns ──────────────────────────────
//
// `customers.ts` uses Drizzle's fluent API:
//   await db.select().from(t).where(c).limit(1)         → row[]
//   await db.update(t).set(v).where(c).returning()      → row[]
//   await db.insert(t).values(v).returning()            → row[]   (or throws)
//
// We expose queues per terminator so each test can stage exactly the rows
// it wants returned in call order, without entangling the mock with the
// query shape.

// vi.mock factories are hoisted above top-level statements, so anything
// they reference must also be hoisted. `vi.hoisted` is the supported way
// to share state between the factory and the test body.
const h = vi.hoisted(() => {
  const limitQueue: Array<unknown[]> = [];
  const updateReturningQueue: Array<unknown[]> = [];
  const insertReturningQueue: Array<{ rows?: unknown[]; error?: unknown }> = [];
  const updateSetCalls: unknown[] = [];
  const insertValuesCalls: unknown[] = [];

  const selectChain: any = {};
  selectChain.from = (..._args: unknown[]) => selectChain;
  selectChain.where = (..._args: unknown[]) => selectChain;
  selectChain.limit = (..._args: unknown[]) =>
    Promise.resolve(limitQueue.shift() ?? []);

  const updateChain: any = {};
  updateChain.set = (v: unknown) => {
    updateSetCalls.push(v);
    return updateChain;
  };
  updateChain.where = (..._args: unknown[]) => updateChain;
  updateChain.returning = () =>
    Promise.resolve(updateReturningQueue.shift() ?? []);

  const insertChain: any = {};
  insertChain.values = (v: unknown) => {
    insertValuesCalls.push(v);
    return insertChain;
  };
  insertChain.returning = () => {
    const next = insertReturningQueue.shift();
    if (!next) return Promise.resolve([]);
    if (next.error) return Promise.reject(next.error);
    return Promise.resolve(next.rows ?? []);
  };
  insertChain.onConflictDoUpdate = () => Promise.resolve(undefined);

  const selectSpy = (...args: unknown[]) => {
    selectSpy.calls.push(args);
    return selectChain;
  };
  selectSpy.calls = [] as unknown[][];
  const updateSpy = (...args: unknown[]) => {
    updateSpy.calls.push(args);
    return updateChain;
  };
  updateSpy.calls = [] as unknown[][];
  const insertSpy = (...args: unknown[]) => {
    insertSpy.calls.push(args);
    return insertChain;
  };
  insertSpy.calls = [] as unknown[][];

  const dbMock = { select: selectSpy, update: updateSpy, insert: insertSpy };
  return {
    limitQueue,
    updateReturningQueue,
    insertReturningQueue,
    updateSetCalls,
    insertValuesCalls,
    dbMock,
  };
});

const {
  limitQueue,
  updateReturningQueue,
  insertReturningQueue,
  updateSetCalls,
  insertValuesCalls,
  dbMock,
} = h;

vi.mock("@workspace/db", () => ({
  db: h.dbMock,
  customersTable: {
    id: "id",
    email: "email",
    phoneE164: "phoneE164",
    wcCustomerId: "wcCustomerId",
  },
}));

// Import after the mock so the lib binds to our stub `db`.
import {
  normalizeEmail,
  normalizePhoneE164,
  upsertCustomer,
} from "../src/lib/customers";

beforeEach(() => {
  limitQueue.length = 0;
  updateReturningQueue.length = 0;
  insertReturningQueue.length = 0;
  updateSetCalls.length = 0;
  insertValuesCalls.length = 0;
  // The hoisted spy callables track calls in plain arrays (vi.fn() can't be
  // referenced inside vi.hoisted before vitest itself is wired up), so we
  // reset them by hand.
  (dbMock.select as any).calls.length = 0;
  (dbMock.update as any).calls.length = 0;
  (dbMock.insert as any).calls.length = 0;
  vi.clearAllMocks();
});

afterEach(() => {
  // Each test fully drains its queues — assert that to catch ordering bugs
  // in the fixture itself rather than letting them silently leak.
  expect(limitQueue.length).toBe(0);
  expect(updateReturningQueue.length).toBe(0);
  expect(insertReturningQueue.length).toBe(0);
});

// A minimal stand-in for a persisted customer row. Tests override only the
// fields they care about so each scenario stays tightly focused.
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    email: "jane@example.com",
    phoneE164: null,
    firstName: "",
    lastName: "",
    country: null,
    city: null,
    wcCustomerId: null,
    authProvider: null,
    authUserId: null,
    source: "presentail.com",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── normalization helpers ──────────────────────────────────────────────────

describe("normalizeEmail", () => {
  it("trims whitespace and lowercases", () => {
    expect(normalizeEmail("  Jane@Example.COM  ")).toBe("jane@example.com");
  });

  it("returns null for empty / nullish / malformed input", () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("two@@at.com")).toBeNull();
  });
});

describe("normalizePhoneE164", () => {
  it("preserves a leading + and strips formatting", () => {
    expect(normalizePhoneE164("+961 70 123 456")).toBe("+96170123456");
  });

  it("prepends + when missing", () => {
    expect(normalizePhoneE164("961-70-123-456")).toBe("+96170123456");
  });

  it("rejects too-short numbers", () => {
    expect(normalizePhoneE164("123")).toBeNull();
    expect(normalizePhoneE164("+123")).toBeNull();
  });

  it("returns null for blank / nullish input", () => {
    expect(normalizePhoneE164(null)).toBeNull();
    expect(normalizePhoneE164(undefined)).toBeNull();
    expect(normalizePhoneE164("   ")).toBeNull();
  });
});

// ─── upsertCustomer: race-on-insert (Postgres unique violation) ─────────────

describe("upsertCustomer — race on insert (23505)", () => {
  it("falls back to lookup-and-patch when the insert loses the unique race", async () => {
    // 1) Email lookup → empty (no existing row at first read).
    limitQueue.push([]);
    // 2) Insert throws Postgres unique violation.
    insertReturningQueue.push({ error: Object.assign(new Error("dup"), { code: "23505" }) });
    // 3) Re-read by email → finds the row another writer just inserted.
    const winner = row({ id: 42, email: "jane@example.com", firstName: "Jane" });
    limitQueue.push([winner]);
    // No patch is needed (existing has firstName), so no update returning.

    const result = await upsertCustomer({ email: "Jane@Example.com" });

    expect(result.created).toBe(false);
    expect(result.customer.id).toBe(42);
    // The race-recovery path must NOT issue an update when there's nothing
    // to patch — that would be a needless write under contention.
    expect(h.dbMock.update.calls.length).toBe(0);
  });

  it("re-reads after 23505 and patches blanks on the winner row", async () => {
    limitQueue.push([]); // email lookup: miss
    insertReturningQueue.push({
      error: Object.assign(new Error("dup"), { code: "23505" }),
    });
    const winner = row({ id: 7, email: "jane@example.com" /* firstName "" */ });
    limitQueue.push([winner]);
    const updated = { ...winner, firstName: "Jane" };
    updateReturningQueue.push([updated]);

    const result = await upsertCustomer({
      email: "jane@example.com",
      firstName: "Jane",
    });

    expect(result.created).toBe(false);
    expect(result.customer.firstName).toBe("Jane");
    expect(updateSetCalls).toHaveLength(1);
    const patch = updateSetCalls[0] as Record<string, unknown>;
    expect(patch.firstName).toBe("Jane");
  });

  it("rethrows non-23505 insert errors", async () => {
    limitQueue.push([]); // email lookup: miss
    insertReturningQueue.push({
      error: Object.assign(new Error("boom"), { code: "08006" }),
    });

    await expect(
      upsertCustomer({ email: "jane@example.com" }),
    ).rejects.toThrow("boom");
  });
});

// ─── upsertCustomer: "patch blanks only" semantics ──────────────────────────

describe("upsertCustomer — patch blanks only", () => {
  it("does not overwrite an existing non-empty field", async () => {
    const existing = row({
      id: 9,
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Doe",
      country: "LB",
    });
    // Email lookup hits the existing row.
    limitQueue.push([existing]);
    // No update should be issued because nothing is patchable.

    const result = await upsertCustomer({
      email: "jane@example.com",
      firstName: "OVERWRITE",
      lastName: "OVERWRITE",
      country: "AE",
    });

    expect(result.created).toBe(false);
    expect(result.customer.firstName).toBe("Jane");
    expect(result.customer.lastName).toBe("Doe");
    expect(result.customer.country).toBe("LB");
    expect(h.dbMock.update.calls.length).toBe(0);
  });

  it("fills only the blank fields on the existing row", async () => {
    const existing = row({
      id: 9,
      email: "jane@example.com",
      firstName: "Jane", // present → keep
      lastName: "", // blank → fill
      country: null, // blank → fill
      phoneE164: null, // blank → fill
    });
    limitQueue.push([existing]);
    const patched = {
      ...existing,
      lastName: "Doe",
      country: "LB",
      phoneE164: "+96170000000",
    };
    updateReturningQueue.push([patched]);

    const result = await upsertCustomer({
      email: "jane@example.com",
      firstName: "OTHER", // ignored — not blank
      lastName: "Doe",
      country: "LB",
      phone: "+961 70 000 000",
    });

    const patch = updateSetCalls[0] as Record<string, unknown>;
    expect(patch.firstName).toBeUndefined();
    expect(patch.lastName).toBe("Doe");
    expect(patch.country).toBe("LB");
    expect(patch.phoneE164).toBe("+96170000000");
    expect(result.customer.lastName).toBe("Doe");
  });

  it("backfills email when found by phone but no email is saved yet", async () => {
    const existing = row({
      id: 11,
      email: "", // blank email
      phoneE164: "+96170000000",
    });
    // Email lookup miss → phone lookup hit.
    limitQueue.push([]);
    limitQueue.push([existing]);
    const patched = { ...existing, email: "jane@example.com" };
    updateReturningQueue.push([patched]);

    const result = await upsertCustomer({
      email: "Jane@Example.com",
      phone: "+961 70 000 000",
    });

    const patch = updateSetCalls[0] as Record<string, unknown>;
    expect(patch.email).toBe("jane@example.com");
    expect(result.customer.email).toBe("jane@example.com");
  });

  it("does not overwrite an existing auth binding", async () => {
    const existing = row({
      id: 12,
      email: "jane@example.com",
      firstName: "Jane",
      authProvider: "password",
      authUserId: "777",
    });
    limitQueue.push([existing]);

    const result = await upsertCustomer({
      email: "jane@example.com",
      authProvider: "google",
      authUserId: "google-sub-123",
    });

    expect(result.created).toBe(false);
    expect(h.dbMock.update.calls.length).toBe(0);
  });
});
