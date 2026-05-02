import { API_BASE } from "@/lib/stripe";

export type AuthErrorCode =
  | "email_required"
  | "network"
  | "apple_unavailable"
  | "google_unavailable"
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

// Apple/Google placeholders. Real provider integration (expo-apple-authentication,
// @react-native-google-signin/google-signin / Firebase / Supabase) is intentionally
// out of scope for this task. The shape is the same as the email helpers so the
// callsites can swap in real implementations without UI changes.
export async function signInWithApple(): Promise<AuthResult> {
  return { ok: false, code: "apple_unavailable" };
}

export async function signInWithGoogle(): Promise<AuthResult> {
  return { ok: false, code: "google_unavailable" };
}
