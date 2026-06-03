import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type ShimUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
};

export type AuthContextValue = {
  user: ShimUser | null;
  token: string | null;
  isLoading: boolean;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<{ ok: true } | { ok: false; message: string }>;
  getToken: () => Promise<string | null>;
  userType: string | null;
  provider: string | null;
  login: (token: string, user: ShimUser, provider?: string) => void;
};

const TOKEN_KEY = "presentail_web_token";
const PROVIDER_KEY = "presentail_web_provider";

const GUEST_AUTH_VALUE: AuthContextValue = {
  user: null,
  token: null,
  isLoading: false,
  logout: async () => {},
  deleteAccount: async () => ({ ok: false, message: "Not signed in" }),
  getToken: async () => null,
  userType: null,
  provider: null,
  login: () => {},
};

export const AuthOverrideContext =
  createContext<AuthContextValue>(GUEST_AUTH_VALUE);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ShimUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [provider, setProvider] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    const storedProvider = localStorage.getItem(PROVIDER_KEY);
    if (!stored) {
      setIsLoading(false);
      return;
    }
    setToken(stored);
    setProvider(storedProvider);
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", {
          headers: {
            Authorization: `Bearer ${stored}`,
            "Content-Type": "application/json",
          },
          credentials: "include",
        });
        if (res.ok) {
          const data = (await res.json()) as {
            ok: boolean;
            user: {
              id: number;
              email: string;
              firstName: string;
              lastName: string;
              phone?: string;
            } | null;
          };
          if (data.ok && data.user) {
            setUser({
              id: String(data.user.id),
              email: data.user.email ?? "",
              firstName: data.user.firstName ?? "",
              lastName: data.user.lastName ?? "",
              phone: data.user.phone || undefined,
            });
          } else {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(PROVIDER_KEY);
            setToken(null);
            setProvider(null);
          }
        } else if (res.status === 401 || res.status === 403) {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(PROVIDER_KEY);
          setToken(null);
          setProvider(null);
        }
        // On network error we leave the token intact and just render as guest.
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = (newToken: string, newUser: ShimUser, newProvider?: string) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    if (newProvider) {
      localStorage.setItem(PROVIDER_KEY, newProvider);
    } else {
      localStorage.removeItem(PROVIDER_KEY);
    }
    setToken(newToken);
    setUser(newUser);
    setProvider(newProvider ?? null);
  };

  const logout = async () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PROVIDER_KEY);
    setToken(null);
    setUser(null);
    setProvider(null);
  };

  const deleteAccount = async (): Promise<{ ok: true } | { ok: false; message: string }> => {
    const currentToken = localStorage.getItem(TOKEN_KEY);
    if (!currentToken) return { ok: false, message: "Not signed in" };
    try {
      const res = await fetch("/api/auth/me", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${currentToken}`,
          "Content-Type": "application/json",
        },
        credentials: "include",
      });
      const data = await res.json().catch(() => ({})) as { ok?: boolean; message?: string };
      if (!res.ok || !data?.ok) {
        return { ok: false, message: data?.message ?? `Error ${res.status}` };
      }
      await logout();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: e?.message ?? "Network error" }; // i18n-ignore
    }
  };

  const getToken = async (): Promise<string | null> => {
    return localStorage.getItem(TOKEN_KEY);
  };

  const value: AuthContextValue = {
    user,
    token,
    isLoading,
    logout,
    deleteAccount,
    getToken,
    userType: user ? "customer" : null,
    provider,
    login,
  };

  return (
    <AuthOverrideContext.Provider value={value}>
      {children}
    </AuthOverrideContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthOverrideContext);
}
