import * as AppleAuthentication from "expo-apple-authentication";
import { Platform } from "react-native";
import {
  GoogleSignin,
  statusCodes,
  isErrorWithCode,
  isSuccessResponse,
} from "@react-native-google-signin/google-signin";

import { API_BASE } from "@/lib/stripe";
import type { AuthUser } from "@/contexts/AuthContext";

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
    const res = await fetch(url, {
      method: "GET",
      headers: { "Cache-Control": "no-cache" },
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      exists?: boolean;
      message?: string;
    };
    if (!res.ok || !data?.ok) {
      return { ok: false, code: "server", serverMessage: data?.message };
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
  input: { email: string; password: string; fullName: string },
): Promise<AuthResult> {
  const fullName = input.fullName.trim();
  const [first = "", ...rest] = fullName ? fullName.split(/\s+/) : [];
  const r = await register({
    email: input.email.trim(),
    password: input.password,
    firstName: first,
    lastName: rest.join(" "),
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
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
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

let googleConfigured = false;
function ensureGoogleConfigured() {
  if (googleConfigured) return;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  GoogleSignin.configure({
    iosClientId,
    webClientId,
    offlineAccess: false,
  });
  googleConfigured = true;
}

async function exchangeSocialToken(
  provider: "apple" | "google",
  body: Record<string, unknown>,
  applySession: ApplySessionFn,
): Promise<AuthResult> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/social/${provider}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
  ensureGoogleConfigured();
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
    return { ok: false, code: "google_failed" };
  }
  if (!isSuccessResponse(response)) {
    return { ok: false, code: "canceled" };
  }
  const idToken = response.data?.idToken;
  if (!idToken) {
    return { ok: false, code: "google_failed" };
  }
  return exchangeSocialToken("google", { idToken }, applySession);
}
