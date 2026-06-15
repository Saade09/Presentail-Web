import { describe, it, expect, vi, afterEach } from "vitest";
import { classifyAuthExists, normalizeAuthExistsEmail } from "./authExists";

// ---------------------------------------------------------------------------
// normalizeAuthExistsEmail
// ---------------------------------------------------------------------------

describe("normalizeAuthExistsEmail", () => {
  it("returns a lowercased, trimmed email for a valid address", () => {
    expect(normalizeAuthExistsEmail("  User@Example.COM  ")).toBe("user@example.com");
  });

  it("returns null for an empty string", () => {
    expect(normalizeAuthExistsEmail("")).toBeNull();
  });

  it("returns null for a string that is not an email address", () => {
    expect(normalizeAuthExistsEmail("not-an-email")).toBeNull();
  });

  it("returns null for non-string inputs coerced to invalid emails", () => {
    expect(normalizeAuthExistsEmail(null)).toBeNull();
    expect(normalizeAuthExistsEmail(undefined)).toBeNull();
    expect(normalizeAuthExistsEmail(42)).toBeNull();
  });

  it("returns null for an email exceeding 254 chars", () => {
    const long = "a".repeat(250) + "@b.com";
    expect(normalizeAuthExistsEmail(long)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// classifyAuthExists – localOnly mode (WC_AUTH_ENABLED=false)
// ---------------------------------------------------------------------------

describe("classifyAuthExists – localOnly mode", () => {
  const neverCalledFetch: any = vi.fn().mockRejectedValue(new Error("should not be called"));

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns exists_true_local when local lookup finds the email", async () => {
    const result = await classifyAuthExists({
      email: "user@example.com",
      localLookup: async () => true,
      wcConfigured: false,
      wcFetch: neverCalledFetch,
      wpFetch: neverCalledFetch,
      localOnly: true,
    });

    expect(result.outcome).toBe("exists_true_local");
    expect(result.exists).toBe(true);
    expect(neverCalledFetch).not.toHaveBeenCalled();
  });

  it("returns exists_false when local lookup misses and localOnly=true", async () => {
    const result = await classifyAuthExists({
      email: "unknown@example.com",
      localLookup: async () => false,
      wcConfigured: true,
      wcFetch: neverCalledFetch,
      wpFetch: neverCalledFetch,
      localOnly: true,
    });

    expect(result.outcome).toBe("exists_false");
    expect(result.exists).toBe(false);
    expect(neverCalledFetch).not.toHaveBeenCalled();
  });

  it("returns exists_false and skips upstream even when wcConfigured=true and localOnly=true", async () => {
    const result = await classifyAuthExists({
      email: "shadow@example.com",
      localLookup: async () => false,
      wcConfigured: true,
      wcFetch: neverCalledFetch,
      wpFetch: neverCalledFetch,
      localOnly: true,
    });

    expect(result.outcome).toBe("exists_false");
    expect(neverCalledFetch).not.toHaveBeenCalled();
  });

  it("local lookup exception is swallowed and still returns exists_false in localOnly mode", async () => {
    const result = await classifyAuthExists({
      email: "error@example.com",
      localLookup: async () => { throw new Error("DB timeout"); },
      wcConfigured: false,
      wcFetch: neverCalledFetch,
      wpFetch: neverCalledFetch,
      localOnly: true,
    });

    expect(result.outcome).toBe("exists_false");
    expect(result.exists).toBe(false);
  });

  it("skips upstream and returns exists_false when no localLookup is provided but localOnly=true", async () => {
    const result = await classifyAuthExists({
      email: "no-local@example.com",
      wcConfigured: true,
      wcFetch: neverCalledFetch,
      wpFetch: neverCalledFetch,
      localOnly: true,
    });

    expect(result.outcome).toBe("exists_false");
    expect(neverCalledFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// classifyAuthExists – WC-enabled mode (legacy, localOnly=false/undefined)
// ---------------------------------------------------------------------------

describe("classifyAuthExists – WC-enabled mode", () => {
  afterEach(() => vi.clearAllMocks());

  function makeJsonFetch(status: number, body: unknown) {
    return vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Partial<Response>);
  }

  it("returns exists_true_local when local lookup hits, skipping upstream", async () => {
    const wcFetch = makeJsonFetch(200, []);
    const wpFetch = makeJsonFetch(200, {});

    const result = await classifyAuthExists({
      email: "local@example.com",
      localLookup: async () => true,
      wcConfigured: true,
      wcFetch,
      wpFetch,
    });

    expect(result.outcome).toBe("exists_true_local");
    expect(wcFetch).not.toHaveBeenCalled();
  });

  it("returns exists_true_wc when WC returns a customer row", async () => {
    const wcFetch = makeJsonFetch(200, [{ id: 42, email: "found@example.com" }]);
    const wpFetch = makeJsonFetch(200, {});

    const result = await classifyAuthExists({
      email: "found@example.com",
      localLookup: async () => false,
      wcConfigured: true,
      wcFetch,
      wpFetch,
    });

    expect(result.outcome).toBe("exists_true_wc");
    expect(result.exists).toBe(true);
  });

  it("returns exists_true_wp_probe when WC empty but JWT reports incorrect_password", async () => {
    const wcFetch = makeJsonFetch(200, []);
    const wpFetch = makeJsonFetch(403, { code: "incorrect_password" });

    const result = await classifyAuthExists({
      email: "wp-only@example.com",
      localLookup: async () => false,
      wcConfigured: true,
      wcFetch,
      wpFetch,
    });

    expect(result.outcome).toBe("exists_true_wp_probe");
    expect(result.exists).toBe(true);
  });

  it("returns exists_false when WC empty and JWT reports invalid_username", async () => {
    const wcFetch = makeJsonFetch(200, []);
    const wpFetch = makeJsonFetch(403, { code: "[jwt_auth] invalid_username" });

    const result = await classifyAuthExists({
      email: "new@example.com",
      localLookup: async () => false,
      wcConfigured: true,
      wcFetch,
      wpFetch,
    });

    expect(result.outcome).toBe("exists_false");
    expect(result.exists).toBe(false);
  });

  it("returns wc_not_configured when wcConfigured=false and localOnly=false", async () => {
    const wcFetch = vi.fn();
    const wpFetch = vi.fn();

    const result = await classifyAuthExists({
      email: "test@example.com",
      localLookup: async () => false,
      wcConfigured: false,
      wcFetch,
      wpFetch,
      localOnly: false,
    });

    expect(result.outcome).toBe("wc_not_configured");
    expect(result.code).toBe("lookup_unavailable");
    expect(wcFetch).not.toHaveBeenCalled();
  });

  it("returns lookup_unavailable when JWT plugin returns 404", async () => {
    const wcFetch = makeJsonFetch(200, []);
    const wpFetch = makeJsonFetch(404, { code: "rest_no_route" });

    const result = await classifyAuthExists({
      email: "no-plugin@example.com",
      localLookup: async () => false,
      wcConfigured: true,
      wcFetch,
      wpFetch,
    });

    expect(result.outcome).toBe("lookup_unavailable");
    expect(result.code).toBe("lookup_unavailable");
  });

  it("returns lookup_failed when WC fetch throws a network error", async () => {
    const wcFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const wpFetch = vi.fn();

    const result = await classifyAuthExists({
      email: "timeout@example.com",
      localLookup: async () => false,
      wcConfigured: true,
      wcFetch,
      wpFetch,
    });

    expect(result.outcome).toBe("lookup_failed");
    expect(result.code).toBe("lookup_failed");
    expect(wpFetch).not.toHaveBeenCalled();
  });
});
