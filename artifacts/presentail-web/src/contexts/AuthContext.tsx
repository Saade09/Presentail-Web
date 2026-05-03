import { createContext, useContext, useState, ReactNode } from "react";
import { useCurrentUser } from "@/lib/queries";
import { useQueryClient } from "@tanstack/react-query";

type User = {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
};

type AuthContextType = {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(
    typeof window !== "undefined" ? localStorage.getItem("presentail_token") : null,
  );

  const { data, isLoading } = useCurrentUser(token);

  const login = (newToken: string, user: User) => {
    if (!newToken) return;
    localStorage.setItem("presentail_token", newToken);
    setToken(newToken);
    queryClient.setQueryData(["auth-me"], { ok: true, user });
  };

  const logout = () => {
    localStorage.removeItem("presentail_token");
    setToken(null);
    queryClient.setQueryData(["auth-me"], null);
  };

  return (
    <AuthContext.Provider value={{
      user: data?.user || null,
      token,
      isLoading: !!token && isLoading,
      login,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
