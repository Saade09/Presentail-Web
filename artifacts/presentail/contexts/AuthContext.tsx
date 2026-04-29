import * as SecureStore from "expo-secure-store";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { API_BASE } from "@/lib/stripe";

export type AuthUser = {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  username?: string;
  phone?: string;
};

type AuthState = {
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
  logout: () => Promise<void>;
  deleteAccount: () => Promise<{ ok: true } | { ok: false; message: string }>;
  updateProfile: (input: {
    firstName?: string;
    lastName?: string;
    phone?: string;
  }) => Promise<{ ok: true } | { ok: false; message: string }>;
};

const TOKEN_KEY = "presentail.auth.token";
const USER_KEY = "presentail.auth.user";

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [t, u] = await Promise.all([
          SecureStore.getItemAsync(TOKEN_KEY),
          SecureStore.getItemAsync(USER_KEY),
        ]);
        if (t) setToken(t);
        if (u) {
          try {
            setUser(JSON.parse(u));
          } catch {
            // ignore parse errors
          }
        }
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const persist = useCallback(async (newToken: string | null, newUser: AuthUser | null) => {
    if (newToken) await SecureStore.setItemAsync(TOKEN_KEY, newToken);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
    if (newUser) await SecureStore.setItemAsync(USER_KEY, JSON.stringify(newUser));
    else await SecureStore.deleteItemAsync(USER_KEY);
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
      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: `${e?.message ?? "Network error"} (URL: ${url.split("?")[0]})` };
    }
  }, [persist]);

  const register: AuthState["register"] = useCallback(async (input) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        return { ok: false, message: data?.message ?? "Registration failed" };
      }
      if (data.token && data.user) {
        setToken(data.token);
        setUser(data.user);
        await persist(data.token, data.user);
      } else if (data.user) {
        setUser(data.user);
        await persist(null, data.user);
      }
      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: e?.message ?? "Network error" };
    }
  }, [persist]);

  const logout = useCallback(async () => {
    setUser(null);
    setToken(null);
    await persist(null, null);
  }, [persist]);

  const deleteAccount: AuthState["deleteAccount"] = useCallback(async () => {
    if (!user || !token) return { ok: false, message: "Not signed in" };
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        return { ok: false, message: data?.message ?? "Delete failed" };
      }
      await logout();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: e?.message ?? "Network error" };
    }
  }, [user, token, logout]);

  const updateProfile: AuthState["updateProfile"] = useCallback(async (input) => {
    if (!user || !token) return { ok: false, message: "Not signed in" };
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(input),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        return { ok: false, message: data?.message ?? "Update failed" };
      }
      setUser(data.user ?? user);
      await persist(token, data.user ?? user);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: e?.message ?? "Network error" };
    }
  }, [user, token, persist]);

  const value = useMemo<AuthState>(() => ({
    ready,
    user,
    token,
    login,
    register,
    logout,
    deleteAccount,
    updateProfile,
  }), [ready, user, token, login, register, logout, deleteAccount, updateProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
