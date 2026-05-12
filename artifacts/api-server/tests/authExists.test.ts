import { describe, expect, it } from "vitest";

import {
  classifyAuthExists,
  normalizeAuthExistsEmail,
  type FetchLike,
} from "../src/lib/authExists";
import {
  aggregateBuckets,
  evaluateBuckets,
} from "../src/lib/authExistsLookupMonitor";

// ── Helpers ────────────────────────────────────────────────────────────────
// We don't touch real `fetch` — every test injects a stub that asserts on
// the request and returns the upstream shape we want to classify.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function rawResponse(status: number, body: string): Response {
  return new Response(body, { status });
}

function noop(): never {
  throw new Error("upstream should not be called in this branch");
}

describe("normalizeAuthExistsEmail", () => {
  it("lowercases and trims a syntactically-valid address", () => {
    expect(normalizeAuthExistsEmail("  User@Example.COM  ")).toBe(
      "user@example.com",
    );
  });

  it("rejects strings that don't look like emails", () => {
    for (const v of ["", "not-an-email", "missing@tld", "@noLocal.com", null, undefined, 5]) {
      expect(normalizeAuthExistsEmail(v as unknown)).toBeNull();
    }
  });

  it("rejects unbounded input", () => {
    expect(normalizeAuthExistsEmail("a".repeat(255) + "@x.com")).toBeNull();
  });
});

describe("classifyAuthExists", () => {
  const email = "user@example.com";

  it("returns wc_not_configured when WC creds are missing", async () => {
    const r = await classifyAuthExists({
      email,
      wcConfigured: false,
      wcFetch: noop as unknown as FetchLike,
      wpFetch: noop as unknown as FetchLike,
    });
    expect(r).toEqual({
      outcome: "wc_not_configured",
      exists: false,
      code: "lookup_unavailable",
    });
  });

  it("returns exists_true_wc when WC has a customer row", async () => {
    let calls = 0;
    const wcFetch: FetchLike = async (path) => {
      calls += 1;
      expect(path).toContain(`email=${encodeURIComponent(email)}`);
      return jsonResponse(200, [{ id: 42, email }]);
    };
    const r = await classifyAuthExists({
      email,
      wcConfigured: true,
      wcFetch,
      wpFetch: noop as unknown as FetchLike,
    });
    expect(r.outcome).toBe("exists_true_wc");
    expect(r.exists).toBe(true);
    expect(r.code).toBeUndefined();
    expect(calls).toBe(1);
  });

  it("falls back to the WP probe and recognises an existing WP-only user", async () => {
    const wcFetch: FetchLike = async () => jsonResponse(200, []);
    const wpFetch: FetchLike = async (path, init) => {
      expect(path).toBe("/jwt-auth/v1/token");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body ?? "{}"));
      expect(body.username).toBe(email);
      expect(typeof body.password).toBe("string");
      expect(body.password.length).toBeGreaterThan(8);
      return jsonResponse(403, {
        code: "[jwt_auth] incorrect_password",
        message: "wrong password",
      });
    };
    const r = await classifyAuthExists({ email, wcConfigured: true, wcFetch, wpFetch });
    expect(r).toEqual({ outcome: "exists_true_wp_probe", exists: true });
  });

  it("classifies invalid_email/invalid_username/invalid_user as exists_false", async () => {
    const wcFetch: FetchLike = async () => jsonResponse(200, []);
    for (const code of ["[jwt_auth] invalid_email", "invalid_username", "[jwt_auth] invalid_user"]) {
      const wpFetch: FetchLike = async () => jsonResponse(403, { code });
      const r = await classifyAuthExists({ email, wcConfigured: true, wcFetch, wpFetch });
      expect(r).toEqual({ outcome: "exists_false", exists: false });
    }
  });

  it("returns lookup_unavailable when the JWT plugin is missing (404)", async () => {
    const wcFetch: FetchLike = async () => jsonResponse(200, []);
    const wpFetch: FetchLike = async () => rawResponse(404, "<html>404</html>");
    const r = await classifyAuthExists({ email, wcConfigured: true, wcFetch, wpFetch });
    expect(r).toEqual({
      outcome: "lookup_unavailable",
      exists: false,
      code: "lookup_unavailable",
    });
  });

  it("returns lookup_failed when WC throws (transport error)", async () => {
    const wcFetch: FetchLike = async () => {
      throw new Error("ECONNRESET");
    };
    const r = await classifyAuthExists({
      email,
      wcConfigured: true,
      wcFetch,
      wpFetch: noop as unknown as FetchLike,
    });
    expect(r.outcome).toBe("lookup_failed");
    expect(r.exists).toBe(false);
    expect(r.code).toBe("lookup_failed");
  });

  it("returns lookup_failed when WC responds non-2xx (5xx)", async () => {
    const wcFetch: FetchLike = async () => rawResponse(503, "upstream down");
    const r = await classifyAuthExists({
      email,
      wcConfigured: true,
      wcFetch,
      wpFetch: noop as unknown as FetchLike,
    });
    expect(r.code).toBe("lookup_failed");
    expect(r.exists).toBe(false);
  });

  it("returns lookup_failed when WP probe yields an unrecognised code", async () => {
    const wcFetch: FetchLike = async () => jsonResponse(200, []);
    const wpFetch: FetchLike = async () =>
      jsonResponse(500, { code: "internal_server_error" });
    const r = await classifyAuthExists({ email, wcConfigured: true, wcFetch, wpFetch });
    // Critical: must NOT flip to exists=true OR exists=false silently.
    expect(r.outcome).toBe("lookup_failed");
    expect(r.exists).toBe(false);
    expect(r.code).toBe("lookup_failed");
  });

  it("returns lookup_failed when WP probe body isn't JSON", async () => {
    const wcFetch: FetchLike = async () => jsonResponse(200, []);
    const wpFetch: FetchLike = async () => rawResponse(403, "not json");
    const r = await classifyAuthExists({ email, wcConfigured: true, wcFetch, wpFetch });
    expect(r.outcome).toBe("lookup_failed");
    expect(r.code).toBe("lookup_failed");
  });
});

describe("authExistsLookupMonitor", () => {
  it("aggregateBuckets groups outcomes per platform", () => {
    const rows = [
      { platform: "ios", action: "exists_true_wc", count: 30 },
      { platform: "ios", action: "exists_true_wp_probe", count: 5 },
      { platform: "ios", action: "exists_false", count: 10 },
      { platform: "ios", action: "lookup_failed", count: 2 },
      { platform: "ios", action: "invalid_email", count: 4 },
      { platform: "android", action: "exists_true_wc", count: 7 },
      { platform: "android", action: "lookup_unavailable", count: 3 },
    ];
    const buckets = aggregateBuckets(rows);
    expect(buckets).toEqual([
      {
        platform: "android",
        total: 10,
        existsTrue: 7,
        existsFalse: 0,
        invalidEmail: 0,
        inconclusive: 3,
      },
      {
        platform: "ios",
        total: 51,
        existsTrue: 35,
        existsFalse: 10,
        invalidEmail: 4,
        inconclusive: 2,
      },
    ]);
  });

  it("evaluateBuckets ignores small samples and flags only above-threshold platforms", () => {
    const buckets = [
      // Below MIN_LOOKUPS=50 (default) → ignored regardless of rate.
      {
        platform: "tiny",
        total: 30,
        existsTrue: 0,
        existsFalse: 0,
        invalidEmail: 0,
        inconclusive: 30,
      },
      // 5 / 100 = 5 % == threshold → not strictly greater, no breach.
      {
        platform: "ios",
        total: 100,
        existsTrue: 80,
        existsFalse: 15,
        invalidEmail: 0,
        inconclusive: 5,
      },
      // 12 / 100 = 12 % > 5 % → breach.
      {
        platform: "android",
        total: 100,
        existsTrue: 70,
        existsFalse: 18,
        invalidEmail: 0,
        inconclusive: 12,
      },
      // invalid_email rows are excluded from the denominator: 6 / (66-6)
      // = 10 % > 5 % → breach even though raw 6/66 ≈ 9 %.
      {
        platform: "web",
        total: 66,
        existsTrue: 40,
        existsFalse: 14,
        invalidEmail: 6,
        inconclusive: 6,
      },
    ];
    const breaches = evaluateBuckets(buckets);
    const platforms = breaches.map((b) => b.bucket.platform).sort();
    expect(platforms).toEqual(["android", "web"]);
  });
});
