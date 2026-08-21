import { loadAuthScripts } from "@/lib/authScripts";
import type { ShimUser } from "@/contexts/AuthContext";
import { TimeoutError, withTimeout } from "@/lib/withTimeout";

/**
 * Inline OAuth popup sign-in used by the checkout optional sign-in card.
 *
 * Mirrors the Google/Apple popup flows on the standalone sign-in page
 * (src/pages/SignIn.tsx) but performs NO navigation and NO toasts — it
 * resolves to a structured result so the caller can stay on checkout and
 * render a non-blocking inline message on cancel/failure.
 */

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as
  | string
  | undefined;
const APPLE_SERVICE_ID = import.meta.env.VITE_APPLE_SERVICE_ID as
  | string
  | undefined;

// Google reports popup closure/blocking instantly via GSI's `error_callback`
// (registered below), so no aggressive deadline is needed — and an aggressive
// one is actively harmful: it would discard a slow-but-successful sign-in.
// Keep only a long last-resort safety net for the pathological case where GSI
// fires neither `callback` nor `error_callback`.
export const GOOGLE_POPUP_SAFETY_TIMEOUT_MS = 300_000;
// Apple's SDK rejects its signIn() promise on popup closure, but has been
// observed leaving it pending in some dismissal paths — keep its deadline.
export const APPLE_POPUP_TIMEOUT_MS = 15_000;

type ApiAuthResponse = {
  ok: boolean;
  token?: string;
  user?: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
  };
  message?: string;
};

export type OAuthErrorCategory =
  | "not_configured"
  | "script_load_failed"
  | "popup_blocked"
  | "provider_error"
  | "server_rejected"
  | "network";

export type OAuthSignInResult =
  | { ok: true; token: string; user: ShimUser; provider: "google" | "apple" }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; errorCategory: OAuthErrorCategory; message?: string };

function mapApiUser(u: NonNullable<ApiAuthResponse["user"]>): ShimUser {
  return {
    id: String(u.id),
    email: u.email ?? "",
    firstName: u.firstName ?? "",
    lastName: u.lastName ?? "",
    phone: u.phone || undefined,
  };
}

async function exchangeWithServer(
  path: string,
  body: unknown,
  provider: "google" | "apple",
): Promise<OAuthSignInResult> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as ApiAuthResponse;
    if (!res.ok || !data.ok || !data.token || !data.user) {
      return {
        ok: false,
        cancelled: false,
        errorCategory: "server_rejected",
        message: data.message,
      };
    }
    return { ok: true, token: data.token, user: mapApiUser(data.user), provider };
  } catch {
    return { ok: false, cancelled: false, errorCategory: "network" };
  }
}

export async function signInWithGooglePopup(): Promise<OAuthSignInResult> {
  if (!GOOGLE_CLIENT_ID) {
    return { ok: false, cancelled: false, errorCategory: "not_configured" };
  }
  try {
    await loadAuthScripts();
  } catch {
    return { ok: false, cancelled: false, errorCategory: "script_load_failed" };
  }
  if (!window.google?.accounts?.oauth2) {
    return { ok: false, cancelled: false, errorCategory: "script_load_failed" };
  }
  // GSI reports popup closure/blocking via `error_callback`, never via
  // `callback` (which simply doesn't fire in those cases). Registering it lets
  // us settle immediately on cancel instead of waiting on a deadline.
  const callbackPromise = new Promise<OAuthSignInResult>((resolve) => {
    try {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID!,
        scope: "openid email profile",
        ux_mode: "popup",
        callback: (response) => {
          if (response.error || !response.access_token) {
            if (response.error === "access_denied") {
              resolve({ ok: false, cancelled: true });
              return;
            }
            resolve({
              ok: false,
              cancelled: false,
              errorCategory: "provider_error",
              message: response.error_description ?? response.error,
            });
            return;
          }
          void exchangeWithServer(
            "/api/auth/oauth/google",
            { accessToken: response.access_token },
            "google",
          ).then(resolve);
        },
        error_callback: (error) => {
          if (error?.type === "popup_closed") {
            // Shopper closed the popup without finishing — silent cancel.
            resolve({ ok: false, cancelled: true });
            return;
          }
          if (error?.type === "popup_failed_to_open") {
            resolve({ ok: false, cancelled: false, errorCategory: "popup_blocked" });
            return;
          }
          resolve({
            ok: false,
            cancelled: false,
            errorCategory: "provider_error",
            message: error?.message,
          });
        },
      });
      client.requestAccessToken();
    } catch {
      resolve({ ok: false, cancelled: false, errorCategory: "popup_blocked" });
    }
  });

  try {
    return await withTimeout(callbackPromise, GOOGLE_POPUP_SAFETY_TIMEOUT_MS);
  } catch (err) {
    if (err instanceof TimeoutError) {
      return { ok: false, cancelled: true };
    }
    throw err;
  }
}

export async function signInWithApplePopup(): Promise<OAuthSignInResult> {
  if (!APPLE_SERVICE_ID) {
    return { ok: false, cancelled: false, errorCategory: "not_configured" };
  }
  try {
    await loadAuthScripts();
  } catch {
    return { ok: false, cancelled: false, errorCategory: "script_load_failed" };
  }
  if (!window.AppleID?.auth) {
    return { ok: false, cancelled: false, errorCategory: "script_load_failed" };
  }
  try {
    window.AppleID.auth.init({
      clientId: APPLE_SERVICE_ID,
      scope: "name email",
      // Popup mode: the page never navigates. The registered redirect URI on
      // the Apple Service ID is the sign-in page — kept identical to the
      // standalone flow so no new Apple configuration is required.
      redirectURI: `${window.location.origin}/sign-in`,
      usePopup: true,
    });
    const appleRes = await withTimeout(
      window.AppleID.auth.signIn(),
      APPLE_POPUP_TIMEOUT_MS,
    );
    const idToken = appleRes?.authorization?.id_token;
    if (!idToken) {
      return { ok: false, cancelled: false, errorCategory: "provider_error" };
    }
    return exchangeWithServer(
      "/api/auth/oauth/apple",
      { id_token: idToken, user: appleRes.user ?? null },
      "apple",
    );
  } catch (err: any) {
    // Apple's SDK throws structured { error: string } objects (not Errors)
    // for user cancellations and configuration problems.
    const appleErrorCode: string | undefined =
      err && typeof err === "object" && typeof err.error === "string"
        ? err.error
        : undefined;
    if (
      appleErrorCode === "popup_closed_by_user" ||
      appleErrorCode === "user_cancelled_authorize"
    ) {
      return { ok: false, cancelled: true };
    }
    if (err instanceof TimeoutError) {
      return { ok: false, cancelled: true };
    }
    return {
      ok: false,
      cancelled: false,
      errorCategory: "provider_error",
      message: appleErrorCode ?? (err instanceof Error ? err.message : undefined),
    };
  }
}
