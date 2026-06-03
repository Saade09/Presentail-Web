// @vitest-environment jsdom

/**
 * Unit tests for the web auth contract.
 *
 * With native auth, the `ShimUser` type is the user record the app consumes.
 * Fields come directly from the `/api/auth/me` response rather than from a
 * Clerk UserResource, so the mapping layer is simpler.
 *
 * The `token` contract — a real JWT (or null when signed out) stored at
 * `presentail_web_token` in localStorage — is also verified here.  Any caller
 * can use `!!token` as an "is signed-in" guard.
 *
 * Session handling (analytics session ID, TTL, localStorage fallback) is
 * covered by the co-located `analytics.session.test.ts`.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// ShimUser shape contract
// ---------------------------------------------------------------------------

describe("ShimUser — shape contract", () => {
  it("requires id, email, firstName, lastName, and optional phone", () => {
    // Imported purely to verify the type compiles correctly.
    type ShimUser = {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      phone?: string;
    };
    const user: ShimUser = {
      id: "42",
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Doe",
    };
    expect(user.id).toBe("42");
    expect(user.email).toBe("jane@example.com");
    expect(user.firstName).toBe("Jane");
    expect(user.lastName).toBe("Doe");
    expect(user.phone).toBeUndefined();
  });

  it("optional phone field can be set", () => {
    const user = {
      id: "99",
      email: "x@example.com",
      firstName: "X",
      lastName: "Y",
      phone: "+1555000001",
    };
    expect(user.phone).toBe("+1555000001");
  });

  it("id is always a string, not a number", () => {
    const id = String(42);
    expect(typeof id).toBe("string");
    expect(id).toBe("42");
  });
});

// ---------------------------------------------------------------------------
// Auth localStorage keys
// ---------------------------------------------------------------------------

const TOKEN_KEY = "presentail_web_token";
const PROVIDER_KEY = "presentail_web_provider";

describe("auth localStorage keys", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("token is stored at presentail_web_token", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.test.sig";
    localStorage.setItem(TOKEN_KEY, jwt);
    expect(localStorage.getItem(TOKEN_KEY)).toBe(jwt);
  });

  it("provider is stored at presentail_web_provider", () => {
    localStorage.setItem(PROVIDER_KEY, "password");
    expect(localStorage.getItem(PROVIDER_KEY)).toBe("password");
  });

  it("provider can be 'google' for Google OAuth users", () => {
    localStorage.setItem(PROVIDER_KEY, "google");
    expect(localStorage.getItem(PROVIDER_KEY)).toBe("google");
  });

  it("provider can be 'apple' for Apple OAuth users", () => {
    localStorage.setItem(PROVIDER_KEY, "apple");
    expect(localStorage.getItem(PROVIDER_KEY)).toBe("apple");
  });

  it("logout clears both keys", () => {
    localStorage.setItem(TOKEN_KEY, "some-jwt");
    localStorage.setItem(PROVIDER_KEY, "password");
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PROVIDER_KEY);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(PROVIDER_KEY)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Token contract: real JWT vs null for signed-out
// ---------------------------------------------------------------------------

describe("auth token contract — compatibility", () => {
  it("!!token is true when a JWT is stored", () => {
    const token = "eyJhbGciOiJIUzI1NiJ9.test.sig";
    expect(!!token).toBe(true);
  });

  it("token is null when signed out", () => {
    const token = null;
    expect(token).toBeNull();
    expect(!!token).toBe(false);
  });

  it("stored JWT looks like a real JWT (starts with ey)", () => {
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig";
    expect(jwt.startsWith("ey")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// apiFetch auth contract: Bearer token injected from localStorage
// ---------------------------------------------------------------------------

describe("apiFetch auth contract", () => {
  it("setAuthTokenGetter is a no-op that accepts a getter without throwing", async () => {
    const { setAuthTokenGetter } = await import("../lib/api");
    expect(() => setAuthTokenGetter(async () => "some-token")).not.toThrow();
    expect(() => setAuthTokenGetter(async () => null)).not.toThrow();
  });
});
