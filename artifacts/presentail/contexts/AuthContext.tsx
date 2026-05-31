import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

const secureStorage = {
  getItemAsync: (key: string): Promise<string | null> =>
    Platform.OS === "web" ? AsyncStorage.getItem(key) : SecureStore.getItemAsync(key),
  setItemAsync: (key: string, value: string): Promise<void> =>
    Platform.OS === "web" ? AsyncStorage.setItem(key, value) : SecureStore.setItemAsync(key, value),
  deleteItemAsync: (key: string): Promise<void> =>
    Platform.OS === "web" ? AsyncStorage.removeItem(key) : SecureStore.deleteItemAsync(key),
};

import { API_BASE } from "@/lib/stripe";
import {
  registerPushToken,
  unregisterPushToken,
} from "@/services/notifications";
import { getStoredStoreHeaders } from "@/lib/storeHeaders";

export type AuthGender = "female" | "male" | "unspecified";

export type AuthUser = {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  username?: string;
  phone?: string;
  gender?: AuthGender | null;
  /** ISO calendar date `YYYY-MM-DD`, or null when unset. */
  birthday?: string | null;
  birthdayShareMonthDay?: boolean;
};

export type AuthState = {
  ready: boolean;
  user: AuthUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  register: (input: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  }) => Promise<{ ok: true } | { ok: false; message: string }>;
  applySession: (input: { token: string; user: AuthUser }) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<{ ok: true } | { ok: false; message: string }>;
  updateProfile: (input: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    gender?: AuthGender | null;
    birthday?: string | null;
    birthdayShareMonthDay?: boolean;
  }) => Promise<{ ok: true } | { ok: false; message: string }>;
};

const TOKEN_KEY = "presentail.auth.token";
const USER_KEY = "presentail.auth.user";

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [t, u] = await Promise.all([
          secureStorage.getItemAsync(TOKEN_KEY),
          secureStorage.getItemAsync(USER_KEY),
        ]);
        if (t) setToken(t);
        if (u) {
          try {
            setUser(JSON.parse(u));
          } catch {
            // Corrupted stored user — clear both keys so the next launch
            // starts fresh instead of hitting the same parse error forever.
            await secureStorage.deleteItemAsync(USER_KEY);
            await secureStorage.deleteItemAsync(TOKEN_KEY);
          }
        }
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const persist = useCallback(async (newToken: string | null, newUser: AuthUser | null) => {
    if (newToken) await secureStorage.setItemAsync(TOKEN_KEY, newToken);
    else await secureStorage.deleteItemAsync(TOKEN_KEY);
    if (newUser) await secureStorage.setItemAsync(USER_KEY, JSON.stringify(newUser));
    else await secureStorage.deleteItemAsync(USER_KEY);
  }, []);

  const login: AuthState["login"] = useCallback(async (email, password) => {
    const url = `${API_BASE}/api/auth/login?_=${Date.now()}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store",
          Pragma: "no-cache",
          ...getStoredStoreHeaders(),
        },
        cache: "no-store" as RequestCache,
        body: JSON.stringify({ email, password }),
      });
      const text = await res.text();
      let data: any = {};
      try { data = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
      if (!res.ok || !data?.ok) {
        const fallback = `HTTP ${res.status} from ${url.split("?")[0]}${text ? ` — ${text.slice(0, 100)}` : ""}`;
        return { ok: false, message: data?.message ?? fallback };
      }
      setToken(data.token ?? null);
      setUser(data.user ?? null);
      await persist(data.token ?? null, data.user ?? null);
      // Re-register the push token under the now-signed-in user so future
      // order pushes route to this user across devices.
      registerPushToken({
        authToken: data.token ?? null,
        userId: data.user?.id ?? null,
      }).catch(() => {});
      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: `${e?.message ?? "Network error"} (URL: ${url.split("?")[0]})` }; // i18n-ignore
    }
  }, [persist]);

  const register: AuthState["register"] = useCallback(async (input) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getStoredStoreHeaders() },
        body: JSON.stringify(input),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        return { ok: false, message: data?.message ?? "Registration failed" }; // i18n-ignore
      }
      if (data.token && data.user) {
        setToken(data.token);
        setUser(data.user);
        await persist(data.token, data.user);
      } else if (data.user) {
        setUser(data.user);
        await persist(null, data.user);
      }
      // Associate the push token with the new account.
      registerPushToken({
        authToken: data.token ?? null,
        userId: data.user?.id ?? null,
      }).catch(() => {});
      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: e?.message ?? "Network error" }; // i18n-ignore
    }
  }, [persist]);

  const applySession = useCallback(async (input: { token: string; user: AuthUser }) => {
    setToken(input.token);
    setUser(input.user);
    await persist(input.token, input.user);
    registerPushToken({
      authToken: input.token,
      userId: input.user.id,
    }).catch(() => {});
  }, [persist]);

  const logout = useCallback(async () => {
    // Capture the current token before clearing state so the unregister
    // request is authenticated (so the server will actually remove the
    // user-scoped rows, not only guest rows).
    const currentToken = token;
    unregisterPushToken({ authToken: currentToken }).catch(() => {});
    setUser(null);
    setToken(null);
    await persist(null, null);
  }, [persist, token]);

  const deleteAccount: AuthState["deleteAccount"] = useCallback(async () => {
    if (!user || !token) return { ok: false, message: "Not signed in" }; // i18n-ignore
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, ...getStoredStoreHeaders() },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        return { ok: false, message: data?.message ?? "Delete failed" }; // i18n-ignore
      }
      // Token cleanup happens inside logout(), but we also call it here
      // explicitly with the still-valid token so the server can remove
      // the user-scoped rows immediately, even if logout() races ahead.
      unregisterPushToken({ authToken: token }).catch(() => {});
      await logout();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: e?.message ?? "Network error" }; // i18n-ignore
    }
  }, [user, token, logout]);

  const updateProfile: AuthState["updateProfile"] = useCallback(async (input) => {
    if (!user || !token) return { ok: false, message: "Not signed in" }; // i18n-ignore
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...getStoredStoreHeaders(),
        },
        body: JSON.stringify(input),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        return { ok: false, message: data?.message ?? "Update failed" }; // i18n-ignore
      }
      setUser(data.user ?? user);
      await persist(token, data.user ?? user);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: e?.message ?? "Network error" }; // i18n-ignore
    }
  }, [user, token, persist]);

  const value = useMemo<AuthState>(() => ({
    ready,
    user,
    token,
    login,
    register,
    applySession,
    logout,
    deleteAccount,
    updateProfile,
  }), [ready, user, token, login, register, applySession, logout, deleteAccount, updateProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
