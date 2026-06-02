import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";

type FavoritesContextType = {
  favorites: Set<string>;
  isFavorited: (slug: string) => boolean;
  toggleFavorite: (slug: string, countryCode?: string | null) => Promise<void>;
  isLoaded: boolean;
};

const FavoritesContext = createContext<FavoritesContextType | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user, getToken } = useAuth();
  const isSignedIn = !!user;
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);

  const fetchFavorites = useCallback(async () => {
    if (!isSignedIn) {
      setFavorites(new Set());
      setIsLoaded(true);
      return;
    }
    try {
      const token = await getToken();
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch("/api/me/favorites", {
        headers,
        credentials: "include",
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
  }, [isSignedIn, getToken]);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const toggleFavorite = useCallback(
    async (slug: string, countryCode?: string | null) => {
      if (!isSignedIn) return;
      // Read current state inside the functional updater to avoid stale closure.
      // This lets toggleFavorite remain stable (only depends on isSignedIn/getToken)
      // while still seeing the latest favorites value at call time.
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
        const token = await getToken();
        const headers: HeadersInit = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        if (wasFavorited) {
          await fetch(`/api/me/favorites/${encodeURIComponent(slug)}`, {
            method: "DELETE",
            headers,
            credentials: "include",
          });
        } else {
          await fetch("/api/me/favorites", {
            method: "POST",
            headers,
            credentials: "include",
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
    [isSignedIn, getToken],
  );

  const isFavorited = useCallback(
    (slug: string) => favorites.has(slug),
    [favorites],
  );

  const value = useMemo(
    () => ({ favorites, isFavorited, toggleFavorite, isLoaded }),
    [favorites, isFavorited, toggleFavorite, isLoaded],
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
