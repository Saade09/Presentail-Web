import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE } from "@/lib/stripe";

type FavoritesContextType = {
  favorites: Set<string>;
  isFavorited: (slug: string) => boolean;
  toggleFavorite: (slug: string, countryCode?: string | null) => Promise<void>;
  refreshFavorites: () => Promise<void>;
  isLoaded: boolean;
};

const FavoritesContext = createContext<FavoritesContextType | null>(null);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuth();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);

  const fetchFavorites = useCallback(async (authToken: string | null) => {
    if (!authToken) {
      setFavorites(new Set());
      setIsLoaded(true);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/me/favorites`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        const slugs = (data.favorites ?? []).map(
          (f: { productSlug: string }) => f.productSlug,
        );
        setFavorites(new Set(slugs));
      }
    } catch {
      // best-effort
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchFavorites(token);
  }, [fetchFavorites, token]);

  // Reset when user logs out
  useEffect(() => {
    if (!user) {
      setFavorites(new Set());
      setIsLoaded(true);
    }
  }, [user]);

  const refreshFavorites = useCallback(async () => {
    await fetchFavorites(token);
  }, [fetchFavorites, token]);

  const toggleFavorite = useCallback(
    async (slug: string, countryCode?: string | null) => {
      if (!token) return;
      // Read current state inside the functional updater to avoid stale closure.
      // This lets toggleFavorite remain stable (only depends on token) while still
      // seeing the latest favorites value at call time.
      let wasFavorited = false;
      setFavorites((prev) => {
        wasFavorited = prev.has(slug);
        const next = new Set(prev);
        if (wasFavorited) {
          next.delete(slug);
        } else {
          next.add(slug);
        }
        return next;
      });
      try {
        const headers: HeadersInit = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        };
        if (wasFavorited) {
          await fetch(
            `${API_BASE}/api/me/favorites/${encodeURIComponent(slug)}`,
            { method: "DELETE", headers },
          );
        } else {
          await fetch(`${API_BASE}/api/me/favorites`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              productSlug: slug,
              countryCode: countryCode ?? null,
            }),
          });
        }
      } catch {
        // Revert optimistic update on failure
        setFavorites((prev) => {
          const next = new Set(prev);
          if (wasFavorited) {
            next.add(slug);
          } else {
            next.delete(slug);
          }
          return next;
        });
      }
    },
    [token],
  );

  const isFavorited = useCallback(
    (slug: string) => favorites.has(slug),
    [favorites],
  );

  const value = useMemo(
    () => ({ favorites, isFavorited, toggleFavorite, refreshFavorites, isLoaded }),
    [favorites, isFavorited, toggleFavorite, refreshFavorites, isLoaded],
  );

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesContextType {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    throw new Error("useFavorites must be used within FavoritesProvider");
  }
  return ctx;
}
