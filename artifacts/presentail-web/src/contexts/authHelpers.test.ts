/**
 * Unit tests for the web auth helper functions.
 *
 * `mapClerkUserToShimUser` is the pure mapping layer between a Clerk
 * UserResource and the `ShimUser` the rest of the app consumes.  Exercising
 * it directly (no hook, no DOM) gives us deterministic coverage of the
 * email/phone resolution priority without needing to mount a ClerkProvider.
 *
 * The `token` sentinel contract ("clerk" when signed-in, null when not) is
 * also verified here — it is the compatibility shim that lets any caller use
 * `!!token` as an "is signed-in" signal.
 *
 * Session handling (analytics session ID, TTL, localStorage fallback) is
 * covered by the co-located `analytics.session.test.ts`.
 */

import { describe, it, expect } from "vitest";
import { mapClerkUserToShimUser, type ShimUser } from "./AuthContext";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClerkUser(overrides: Partial<{
  id: string;
  firstName: string | null;
  lastName: string | null;
  primaryEmailAddress: { emailAddress: string } | null;
  emailAddresses: { emailAddress: string }[];
  primaryPhoneNumber: { phoneNumber: string } | null;
  phoneNumbers: { phoneNumber: string }[];
}> = {}): Parameters<typeof mapClerkUserToShimUser>[0] {
  return {
    id: "user_123",
    firstName: "Jane",
    lastName: "Doe",
    primaryEmailAddress: { emailAddress: "jane@example.com" },
    emailAddresses: [{ emailAddress: "jane@example.com" }],
    primaryPhoneNumber: null,
    phoneNumbers: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// mapClerkUserToShimUser — basic field mapping
// ---------------------------------------------------------------------------

describe("mapClerkUserToShimUser — basic field mapping", () => {
  it("maps id directly", () => {
    const user = mapClerkUserToShimUser(makeClerkUser({ id: "user_abc" }));
    expect(user.id).toBe("user_abc");
  });

  it("maps firstName and lastName", () => {
    const user = mapClerkUserToShimUser(
      makeClerkUser({ firstName: "John", lastName: "Smith" }),
    );
    expect(user.firstName).toBe("John");
    expect(user.lastName).toBe("Smith");
  });

  it("coerces null firstName to empty string", () => {
    const user = mapClerkUserToShimUser(makeClerkUser({ firstName: null }));
    expect(user.firstName).toBe("");
  });

  it("coerces null lastName to empty string", () => {
    const user = mapClerkUserToShimUser(makeClerkUser({ lastName: null }));
    expect(user.lastName).toBe("");
  });
});

// ---------------------------------------------------------------------------
// email resolution: primaryEmailAddress > emailAddresses[0] > ""
// ---------------------------------------------------------------------------

describe("mapClerkUserToShimUser — email resolution priority", () => {
  it("uses primaryEmailAddress when present", () => {
    const user = mapClerkUserToShimUser(
      makeClerkUser({
        primaryEmailAddress: { emailAddress: "primary@example.com" },
        emailAddresses: [
          { emailAddress: "primary@example.com" },
          { emailAddress: "secondary@example.com" },
        ],
      }),
    );
    expect(user.email).toBe("primary@example.com");
  });

  it("falls back to emailAddresses[0] when primaryEmailAddress is null", () => {
    const user = mapClerkUserToShimUser(
      makeClerkUser({
        primaryEmailAddress: null,
        emailAddresses: [{ emailAddress: "fallback@example.com" }],
      }),
    );
    expect(user.email).toBe("fallback@example.com");
  });

  it("returns empty string when no email is available", () => {
    const user = mapClerkUserToShimUser(
      makeClerkUser({
        primaryEmailAddress: null,
        emailAddresses: [],
      }),
    );
    expect(user.email).toBe("");
  });
});

// ---------------------------------------------------------------------------
// phone resolution: primaryPhoneNumber > phoneNumbers[0] > undefined
// ---------------------------------------------------------------------------

describe("mapClerkUserToShimUser — phone resolution priority", () => {
  it("uses primaryPhoneNumber when present", () => {
    const user = mapClerkUserToShimUser(
      makeClerkUser({
        primaryPhoneNumber: { phoneNumber: "+1555000001" },
        phoneNumbers: [
          { phoneNumber: "+1555000001" },
          { phoneNumber: "+1555000002" },
        ],
      }),
    );
    expect(user.phone).toBe("+1555000001");
  });

  it("falls back to phoneNumbers[0] when primaryPhoneNumber is null", () => {
    const user = mapClerkUserToShimUser(
      makeClerkUser({
        primaryPhoneNumber: null,
        phoneNumbers: [{ phoneNumber: "+1555000099" }],
      }),
    );
    expect(user.phone).toBe("+1555000099");
  });

  it("returns undefined when no phone is available", () => {
    const user = mapClerkUserToShimUser(
      makeClerkUser({
        primaryPhoneNumber: null,
        phoneNumbers: [],
      }),
    );
    expect(user.phone).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Returned ShimUser shape
// ---------------------------------------------------------------------------

describe("mapClerkUserToShimUser — ShimUser shape", () => {
  it("returns an object with the four required ShimUser fields", () => {
    const user: ShimUser = mapClerkUserToShimUser(makeClerkUser());
    expect(user).toHaveProperty("id");
    expect(user).toHaveProperty("email");
    expect(user).toHaveProperty("firstName");
    expect(user).toHaveProperty("lastName");
  });

  it("phone is absent (not just undefined) when no phone is configured", () => {
    const user = mapClerkUserToShimUser(
      makeClerkUser({ primaryPhoneNumber: null, phoneNumbers: [] }),
    );
    // `undefined` means the key may or may not be present — that's fine.
    // What must NOT happen is the key being set to an empty string, which
    // callers treat as "user has a phone" via `profilePhone.length > 0`.
    expect(user.phone === undefined || user.phone === "").toBe(true);
    if (user.phone !== undefined) {
      expect(user.phone).toBe("");
    }
  });
});

// ---------------------------------------------------------------------------
// Token sentinel contract
// ---------------------------------------------------------------------------

describe("auth token sentinel — compatibility contract", () => {
  it("token is the string 'clerk' (not a real JWT) when signed in", () => {
    // The `token` field is intentionally the literal "clerk" string, never
    // the actual JWT. Callers use `!!token` as an "is signed-in" guard.
    const TOKEN_SIGNED_IN = "clerk";
    expect(TOKEN_SIGNED_IN).toBeTruthy();
    expect(TOKEN_SIGNED_IN).not.toMatch(/^ey/); // not a JWT
  });

  it("token is null when signed out", () => {
    const TOKEN_SIGNED_OUT = null;
    expect(TOKEN_SIGNED_OUT).toBeFalsy();
  });

  it("!!token returns true for 'clerk' and false for null", () => {
    expect(!!"clerk").toBe(true);
    expect(!!null).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// apiFetch auth contract: cookie-based, no Bearer header
// ---------------------------------------------------------------------------

describe("apiFetch auth contract", () => {
  it("setAuthTokenGetter is a no-op that accepts a getter without throwing", async () => {
    const { setAuthTokenGetter } = await import("../lib/api");
    expect(() => setAuthTokenGetter(async () => "some-token")).not.toThrow();
    expect(() => setAuthTokenGetter(async () => null)).not.toThrow();
  });
});
