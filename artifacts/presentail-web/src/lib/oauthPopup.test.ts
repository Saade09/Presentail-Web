// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./authScripts", () => ({
  loadAuthScripts: vi.fn().mockResolvedValue(undefined),
}));

describe("signInWithGooglePopup", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_GOOGLE_WEB_CLIENT_ID", "client-id.apps.googleusercontent.com");
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    delete (window as any).google;
  });

  it("registers an error_callback and resolves as cancelled immediately when the popup is closed", async () => {
    let storedErrorCallback: ((e: any) => void) | undefined;
    const requestAccessToken = vi.fn();
    (window as any).google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn().mockImplementation(({ error_callback }: any) => {
            storedErrorCallback = error_callback;
            return { requestAccessToken };
          }),
        },
      },
    };

    const { signInWithGooglePopup } = await import("./oauthPopup");
    const resultPromise = signInWithGooglePopup();

    // The function is async and awaits loadAuthScripts() before reaching
    // initTokenClient. Flush that microtask so storedErrorCallback is set.
    await Promise.resolve();
    expect(storedErrorCallback).toBeDefined();

    // GSI reports popup closure via error_callback — no timers needed; the
    // result must settle immediately as a silent cancel.
    storedErrorCallback!({ type: "popup_closed" });
    await expect(resultPromise).resolves.toEqual({ ok: false, cancelled: true });
    expect(requestAccessToken).toHaveBeenCalledOnce();
  });

  it("maps popup_failed_to_open to the popup_blocked category", async () => {
    let storedErrorCallback: ((e: any) => void) | undefined;
    (window as any).google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn().mockImplementation(({ error_callback }: any) => {
            storedErrorCallback = error_callback;
            return { requestAccessToken: vi.fn() };
          }),
        },
      },
    };

    const { signInWithGooglePopup } = await import("./oauthPopup");
    const resultPromise = signInWithGooglePopup();

    await Promise.resolve();
    storedErrorCallback!({ type: "popup_failed_to_open" });
    await expect(resultPromise).resolves.toEqual({
      ok: false,
      cancelled: false,
      errorCategory: "popup_blocked",
    });
  });

  it("still signs the shopper in when success arrives after the old 15s deadline", async () => {
    vi.useFakeTimers();
    let storedCallback: ((r: any) => void) | undefined;
    (window as any).google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn().mockImplementation(({ callback }: any) => {
            storedCallback = callback;
            return { requestAccessToken: vi.fn() };
          }),
        },
      },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        token: "jwt-token",
        user: { id: 7, email: "slow@example.com", firstName: "Slow", lastName: "Shopper" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const { signInWithGooglePopup } = await import("./oauthPopup");
      const resultPromise = signInWithGooglePopup();

      await vi.advanceTimersByTimeAsync(0); // flush loadAuthScripts microtask
      // A shopper taking their time in the popup — well past the old 15s cap.
      await vi.advanceTimersByTimeAsync(60_000);
      storedCallback!({ access_token: "google-access-token" });
      await vi.advanceTimersByTimeAsync(0); // flush the server exchange

      await expect(resultPromise).resolves.toEqual({
        ok: true,
        token: "jwt-token",
        user: {
          id: "7",
          email: "slow@example.com",
          firstName: "Slow",
          lastName: "Shopper",
          phone: undefined,
        },
        provider: "google",
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/oauth/google",
        expect.objectContaining({ method: "POST" }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("settles as a cancellation via the last-resort safety net when GSI never fires either callback", async () => {
    vi.useFakeTimers();

    const requestAccessToken = vi.fn();
    (window as any).google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn().mockReturnValue({ requestAccessToken }),
        },
      },
    };

    const { GOOGLE_POPUP_SAFETY_TIMEOUT_MS, signInWithGooglePopup } = await import("./oauthPopup");
    const resultPromise = signInWithGooglePopup();

    await vi.advanceTimersByTimeAsync(GOOGLE_POPUP_SAFETY_TIMEOUT_MS);

    await expect(resultPromise).resolves.toEqual({ ok: false, cancelled: true });
    expect(requestAccessToken).toHaveBeenCalledOnce();
  });

  it("treats access_denied from the main callback as a silent cancel", async () => {
    let storedCallback: ((r: any) => void) | undefined;
    (window as any).google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn().mockImplementation(({ callback }: any) => {
            storedCallback = callback;
            return { requestAccessToken: vi.fn() };
          }),
        },
      },
    };

    const { signInWithGooglePopup } = await import("./oauthPopup");
    const resultPromise = signInWithGooglePopup();

    await Promise.resolve();
    storedCallback!({ error: "access_denied" });
    await expect(resultPromise).resolves.toEqual({ ok: false, cancelled: true });
  });

  it("preserves genuine GSI provider errors", async () => {
    let storedCallback: ((r: any) => void) | undefined;
    (window as any).google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn().mockImplementation(({ callback }: any) => {
            storedCallback = callback;
            return { requestAccessToken: vi.fn() };
          }),
        },
      },
    };

    const { signInWithGooglePopup } = await import("./oauthPopup");
    const resultPromise = signInWithGooglePopup();

    // Flush the loadAuthScripts() microtask so the function reaches initTokenClient.
    await Promise.resolve();
    storedCallback!({ error: "invalid_client", error_description: "bad config" });
    await expect(resultPromise).resolves.toEqual({
      ok: false,
      cancelled: false,
      errorCategory: "provider_error",
      message: "bad config",
    });
  });
});

describe("signInWithApplePopup", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_APPLE_SERVICE_ID", "com.test.app");
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    delete (window as any).AppleID;
  });

  it("settles as a cancellation when Apple never settles after the popup is dismissed", async () => {
    vi.useFakeTimers();
    const signIn = vi.fn().mockImplementation(() => new Promise(() => {}));
    (window as any).AppleID = {
      auth: { init: vi.fn(), signIn },
    };

    const { APPLE_POPUP_TIMEOUT_MS, signInWithApplePopup } = await import("./oauthPopup");
    const resultPromise = signInWithApplePopup();

    await vi.advanceTimersByTimeAsync(APPLE_POPUP_TIMEOUT_MS);

    await expect(resultPromise).resolves.toEqual({ ok: false, cancelled: true });
    expect(signIn).toHaveBeenCalledOnce();
  });

  it("still signs the shopper in when success arrives after the old 15s deadline", async () => {
    vi.useFakeTimers();
    let resolveSignIn: ((value: any) => void) | undefined;
    const signIn = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSignIn = resolve;
        }),
    );
    (window as any).AppleID = {
      auth: { init: vi.fn(), signIn },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        token: "jwt-token",
        user: { id: 8, email: "slow-apple@example.com", firstName: "Slow", lastName: "Apple" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const { signInWithApplePopup } = await import("./oauthPopup");
      const resultPromise = signInWithApplePopup();

      await vi.advanceTimersByTimeAsync(60_000);
      resolveSignIn!({
        authorization: { id_token: "apple-id-token" },
        user: { name: { firstName: "Slow", lastName: "Apple" } },
      });
      await vi.advanceTimersByTimeAsync(0);

      await expect(resultPromise).resolves.toEqual({
        ok: true,
        token: "jwt-token",
        user: {
          id: "8",
          email: "slow-apple@example.com",
          firstName: "Slow",
          lastName: "Apple",
          phone: undefined,
        },
        provider: "apple",
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/oauth/apple",
        expect.objectContaining({ method: "POST" }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps explicit Apple cancellation responses silent", async () => {
    (window as any).AppleID = {
      auth: {
        init: vi.fn(),
        signIn: vi.fn().mockRejectedValue({ error: "user_cancelled_authorize" }),
      },
    };

    const { signInWithApplePopup } = await import("./oauthPopup");
    await expect(signInWithApplePopup()).resolves.toEqual({ ok: false, cancelled: true });
  });

  it("preserves genuine Apple provider failures", async () => {
    (window as any).AppleID = {
      auth: {
        init: vi.fn(),
        signIn: vi.fn().mockRejectedValue({ error: "invalid_client" }),
      },
    };

    const { signInWithApplePopup } = await import("./oauthPopup");
    await expect(signInWithApplePopup()).resolves.toEqual({
      ok: false,
      cancelled: false,
      errorCategory: "provider_error",
      message: "invalid_client",
    });
  });
});