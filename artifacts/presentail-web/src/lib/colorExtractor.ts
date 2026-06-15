import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";

const COLOR_KEYWORDS = [
  "red",
  "white",
  "pink",
  "yellow",
  "purple",
  "blue",
  "orange",
  "green",
  "black",
  "beige",
  "peach",
  "gold",
  "silver",
  "coral",
  "lilac",
] as const;

export type ColorKeyword = (typeof COLOR_KEYWORDS)[number];

export const COLOR_SWATCHES: Record<ColorKeyword, string> = {
  red: "#ef4444",
  white: "#f1f5f9",
  pink: "#f9a8d4",
  yellow: "#fde047",
  purple: "#a855f7",
  blue: "#3b82f6",
  orange: "#f97316",
  green: "#22c55e",
  black: "#1e293b",
  beige: "#e8d5b7",
  peach: "#ffcba4",
  gold: "#fbbf24",
  silver: "#94a3b8",
  coral: "#f87171",
  lilac: "#c4b5fd",
};

export function extractColor(productName: string): ColorKeyword | null {
  const lower = productName.toLowerCase();
  for (const color of COLOR_KEYWORDS) {
    if (new RegExp(`\\b${color}\\b`).test(lower)) {
      return color;
    }
  }
  return null;
}

/**
 * React Query hook that fetches AI-inferred colors for products that did not
 * match any keyword. Returns a map of slug → color keyword or null.
 *
 * The query is disabled when there are no unmatched products, uses a 1-hour
 * stale time, and is persisted to sessionStorage so it survives page refreshes
 * within the same session.
 */
export function useProductColorHints(
  unmatchedProducts: { slug: string; name: string }[],
): Record<string, ColorKeyword | null> {
  // Include a fingerprint of slugs+names so that if a product is renamed
  // the query key changes and a fresh inference is triggered immediately
  // rather than serving the stale cached color for up to staleTime.
  const key = unmatchedProducts.map((p) => `${p.slug}:${p.name}`).join("|");

  const query = useQuery<Record<string, ColorKeyword | null>>({
    queryKey: ["product-color-hints-v3", key],
    queryFn: async () => {
      const response = await apiFetch<{ colors: Record<string, string | null> }>(
        "/products/color-hints",
        {
          method: "POST",
          body: JSON.stringify({ products: unmatchedProducts }),
        },
      );
      const result: Record<string, ColorKeyword | null> = {};
      for (const [slug, color] of Object.entries(response.colors)) {
        if (color !== null && (COLOR_KEYWORDS as readonly string[]).includes(color)) {
          result[slug] = color as ColorKeyword;
        } else {
          result[slug] = null;
        }
      }
      return result;
    },
    enabled: unmatchedProducts.length > 0,
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
  });

  return query.data ?? {};
}
