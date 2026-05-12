import * as AppleAuthentication from "expo-apple-authentication";
import { Platform } from "react-native";

import { API_BASE } from "@/lib/stripe";
import type { AuthUser } from "@/contexts/AuthContext";
import { getStoredStoreHeaders } from "@/lib/storeHeaders";

export type AuthErrorCode =
  | "email_required"
  | "network"
  | "apple_unavailable"
  | "google_unavailable"
  | "apple_failed"
  | "google_failed"
  | "canceled"
  | "expired_link"
  | "weak_password"
  | "missing_link"
  | "unknown_email"
  | "lookup_failed"
  | "lookup_unavailable"
  | "server";

export type AuthError = {
  ok: false;
  code: AuthErrorCode;
  serverMessage?: string;
};

export type AuthResult<T = {}> = ({ ok: true } & T) | AuthError;

export async function checkEmailExists(
  email: string,
): Promise<AuthResult<{ exists: boolean }>> {
  const trimmed = email.trim();
  if (!trimmed) return { ok: false, code: "email_required" };
  try {
    const url = `${API_BASE}/api/auth/exists?email=${encodeURIComponent(trimmed)}`;
    // Tagging the platform lets the server-side auth-exists lookup
    // monitor (lib/authExistsLookupMonitor.ts) bucket inconclusive-rate
    // alerts per-platform instead of lumping everything as "unknown".
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Cache-Control": "no-cache",
        "X-App-Platform": Platform.OS,
        ...getStoredStoreHeaders(),
      },
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      exists?: boolean;
      code?: string;
      message?: string;
    };
    if (!res.ok || !data?.ok) {
      return { ok: false, code: "server", serverMessage: data?.message };
    }
    // The server returns `code: "lookup_failed"` / `"lookup_unavailable"` when
    // it couldn't actually confirm whether the account exists (missing WC
    // creds, WC upstream 5xx, JWT plugin missing, network failure). Treat
    // those as errors so the UI can show "couldn't check, try again" rather
    // than silently routing the shopper to sign-up.
    if (data?.code === "lookup_failed") {
      return { ok: false, code: "lookup_failed" };
    }
    if (data?.code === "lookup_unavailable") {
      return { ok: false, code: "lookup_unavailable" };
    }
    return { ok: true, exists: Boolean(data.exists) };
  } catch {
    return { ok: false, code: "network" };
  }
}

export type LoginFn = (
  email: string,
  password: string,
) => Promise<{ ok: true } | { ok: false; message: string }>;

export type RegisterFn = (input: {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}) => Promise<{ ok: true } | { ok: false; message: string }>;

export type ApplySessionFn = (input: {
  token: string;
  user: AuthUser;
}) => Promise<void>;

export async function signInWithEmail(
  login: LoginFn,
  email: string,
  password: string,
): Promise<AuthResult> {
  const r = await login(email.trim(), password);
  if (r.ok) return { ok: true };
  return { ok: false, code: "server", serverMessage: r.message };
}

export async function createAccountWithEmail(
  register: RegisterFn,
  input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  },
): Promise<AuthResult> {
  const r = await register({
    email: input.email.trim(),
    password: input.password,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
  });
  if (r.ok) return { ok: true };
  return { ok: false, code: "server", serverMessage: r.message };
}

export async function requestPasswordReset(
  email: string,
): Promise<AuthResult> {
  const trimmed = email.trim();
  if (!trimmed) return { ok: false, code: "email_required" };
  try {
    const res = await fetch(`${API_BASE}/api/auth/reset/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getStoredStoreHeaders() },
      body: JSON.stringify({ email: trimmed }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      code?: string;
      message?: string;
    };
    if (!res.ok || !data?.ok) {
      if (data?.code === "unknown_email") return { ok: false, code: "unknown_email" };
      return { ok: false, code: "server", serverMessage: data?.message };
    }
    return { ok: true };
  } catch {
    return { ok: false, code: "network" };
  }
}

export async function completePasswordReset(input: {
  key: string;
  login: string;
  password: string;
}): Promise<AuthResult> {
  if (!input.key || !input.login) {
    return { ok: false, code: "missing_link" };
  }
  try {
    const res = await fetch(`${API_BASE}/api/auth/reset/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getStoredStoreHeaders() },
      body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      code?: string;
      message?: string;
    };
    if (!res.ok || !data?.ok) {
      if (data?.code === "expired_link") return { ok: false, code: "expired_link" };
      if (data?.code === "weak_password") return { ok: false, code: "weak_password" };
      if (data?.code === "missing_link") return { ok: false, code: "missing_link" };
      return { ok: false, code: "server", serverMessage: data?.message };
    }
    return { ok: true };
  } catch {
    return { ok: false, code: "network" };
  }
}

// ── Social sign-in ──────────────────────────────────────────────────────────
// Both providers fetch a verified identity token from the native sheet, then
// hand it to the API which verifies it (JWKS) and returns our session token.

// The native Google sign-in module is loaded lazily so that binaries that were
// built without it (or where the native module fails to link) do not crash the
// auth screen on mount. Any failure here is converted into a
// `google_unavailable` result downstream.
type GoogleSignInModule = typeof import("@react-native-google-signin/google-signin");
let googleModule: GoogleSignInModule | null = null;
let googleModuleLoadFailed = false;

function loadGoogleModule(): GoogleSignInModule | null {
  if (googleModule) return googleModule;
  if (googleModuleLoadFailed) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    googleModule = require("@react-native-google-signin/google-signin") as GoogleSignInModule;
    return googleModule;
  } catch (e) {
    googleModuleLoadFailed = true;
    if (__DEV__) {
      console.warn("[auth] Failed to load @react-native-google-signin/google-signin", e);
    }
    return null;
  }
}

let googleConfigured = false;
let googleConfigWarned = false;
function ensureGoogleConfigured(mod: GoogleSignInModule): boolean {
  if (googleConfigured) return true;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  // On Android, the native module only needs `webClientId` — Google's Android
  // SDK matches the app's package name + signing SHA-1 against an Android
  // OAuth client in Google Cloud (no client id is passed at runtime), and uses
  // the Web client id solely to request an `idToken`. iOS additionally needs
  // `iosClientId` (and the reversed iOS URL scheme wired up via app.config.js).
  if (__DEV__ && !googleConfigWarned) {
    googleConfigWarned = true;
    const needsIos = Platform.OS === "ios";
    if (!webClientId || (needsIos && !iosClientId)) {
      console.warn(
        "[auth] Google sign-in is missing client IDs at runtime. " +
          "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is required on every platform, and " +
          "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is additionally required on iOS. " +
          "Both must be set as EAS build-time secrets so they get inlined into the binary. " +
          `platform: ${Platform.OS}, iosClientId set: ${Boolean(iosClientId)}, webClientId set: ${Boolean(webClientId)}.`,
      );
    }
  }
  try {
    mod.GoogleSignin.configure({
      iosClientId,
      webClientId,
      offlineAccess: false,
    });
    googleConfigured = true;
    return true;
  } catch (e) {
    if (__DEV__) {
      console.warn("[auth] GoogleSignin.configure threw", e);
    }
    return false;
  }
}

async function exchangeSocialToken(
  provider: "apple" | "google",
  body: Record<string, unknown>,
  applySession: ApplySessionFn,
): Promise<AuthResult> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/social/${provider}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getStoredStoreHeaders() },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      token?: string;
      user?: AuthUser;
      message?: string;
    };
    if (!res.ok || !data?.ok || !data.token || !data.user) {
      return { ok: false, code: "server", serverMessage: data?.message };
    }
    await applySession({ token: data.token, user: data.user });
    return { ok: true };
  } catch {
    return { ok: false, code: "network" };
  }
}

export async function signInWithApple(
  applySession: ApplySessionFn,
): Promise<AuthResult> {
  if (Platform.OS !== "ios") {
    return { ok: false, code: "apple_unavailable" };
  }
  try {
    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) return { ok: false, code: "apple_unavailable" };
  } catch {
    return { ok: false, code: "apple_unavailable" };
  }
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      ],
    });
  } catch (e: any) {
    if (e?.code === "ERR_REQUEST_CANCELED") {
      return { ok: false, code: "canceled" };
    }
    return { ok: false, code: "apple_failed" };
  }
  if (!credential.identityToken) {
    return { ok: false, code: "apple_failed" };
  }
  return exchangeSocialToken(
    "apple",
    {
      identityToken: credential.identityToken,
      fullName: credential.fullName
        ? {
            givenName: credential.fullName.givenName,
            familyName: credential.fullName.familyName,
          }
        : null,
    },
    applySession,
  );
}

export async function signInWithGoogle(
  applySession: ApplySessionFn,
): Promise<AuthResult> {
  // Wrap the entire body so any synchronous throw from the native module
  // (missing native binding, unconfigured client IDs, missing reversed iOS URL
  // scheme, etc.) is surfaced as a structured result instead of propagating
  // up through the React render tree and crashing the app.
  try {
    const mod = loadGoogleModule();
    if (!mod) {
      return { ok: false, code: "google_unavailable" };
    }
    if (!ensureGoogleConfigured(mod)) {
      return { ok: false, code: "google_unavailable" };
    }
    const { GoogleSignin, statusCodes, isErrorWithCode, isSuccessResponse } = mod;
    try {
      if (Platform.OS === "android") {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      }
    } catch {
      return { ok: false, code: "google_unavailable" };
    }
    let response;
    try {
      response = await GoogleSignin.signIn();
    } catch (e: any) {
      if (
        isErrorWithCode(e) &&
        (e.code === statusCodes.SIGN_IN_CANCELLED ||
          e.code === statusCodes.IN_PROGRESS)
      ) {
        return { ok: false, code: "canceled" };
      }
      const nativeCode =
        (isErrorWithCode(e) && typeof e.code === "string" ? e.code : null) ||
        (typeof e?.code === "number" ? String(e.code) : null) ||
        e?.name ||
        null;
      const nativeMessage = typeof e?.message === "string" ? e.message : null;
      if (__DEV__) {
        console.warn("[auth] Google sign-in native error", {
          code: nativeCode,
          message: nativeMessage,
        });
      }
      const tag = nativeCode || nativeMessage || "unknown";
      return { ok: false, code: "google_failed", serverMessage: String(tag) };
    }
    if (!isSuccessResponse(response)) {
      return { ok: false, code: "canceled" };
    }
    const idToken = response.data?.idToken;
    if (!idToken) {
      return {
        ok: false,
        code: "google_failed",
        serverMessage: "no_id_token",
      };
    }
    return exchangeSocialToken("google", { idToken }, applySession);
  } catch (e: any) {
    if (__DEV__) {
      console.warn("[auth] signInWithGoogle threw", e);
    }
    const tag =
      (typeof e?.code === "string" && e.code) ||
      (typeof e?.message === "string" && e.message) ||
      "unknown";
    return { ok: false, code: "google_failed", serverMessage: String(tag) };
  }
}
