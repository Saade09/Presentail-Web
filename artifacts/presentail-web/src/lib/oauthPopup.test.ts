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

  it("settles as a cancellation when the GSI callback never fires after popup is dismissed", async () => {
    vi.useFakeTimers();

    // Simulate a GSI client whose callback is never called (popup silently dismissed).
    const requestAccessToken = vi.fn();
    (window as any).google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn().mockReturnValue({ requestAccessToken }),
        },
      },
    };

    const { GOOGLE_POPUP_TIMEOUT_MS, signInWithGooglePopup } = await import("./oauthPopup");
    const resultPromise = signInWithGooglePopup();

    await vi.advanceTimersByTimeAsync(GOOGLE_POPUP_TIMEOUT_MS);

    await expect(resultPromise).resolves.toEqual({ ok: false, cancelled: true });
    expect(requestAccessToken).toHaveBeenCalledOnce();
  });

  it("resolves as cancelled when GSI fires popup_closed_by_user before the deadline", async () => {
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

    // The function is async and awaits loadAuthScripts() before reaching
    // initTokenClient. Flush that microtask so storedCallback is set.
    await Promise.resolve();
    storedCallback!({ error: "popup_closed_by_user" });
    await expect(resultPromise).resolves.toEqual({ ok: false, cancelled: true });
  });

  it("preserves genuine GSI provider errors before the deadline", async () => {
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