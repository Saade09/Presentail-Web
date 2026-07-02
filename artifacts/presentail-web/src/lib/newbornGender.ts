import { useGetNewbornGender, getGetNewbornGenderQueryKey } from "@workspace/api-client-react";
import type { Product } from "./queries";

export type NewbornGender = "boy" | "girl" | "neutral";

export type NewbornGenderTab = {
  key: string;
  labelKey: string;
};

export const NEWBORN_GENDERS = [
  {
    key: "boy",
    labelKey: "shop.newbornFor.babyBoy",
    preferredCategories: ["hand-bouquets", "gift-baskets", "plants", "bundles"],
    excludeColorKeywords: ["pink", "rose gold", "blush", "lilac", "lavender", "fuchsia", "magenta", "mauve"],
  },
  {
    key: "girl",
    labelKey: "shop.newbornFor.babyGirl",
    preferredCategories: ["hand-bouquets", "flower-boxes", "chocolate", "bundles"],
    excludeColorKeywords: ["blue", "navy", "teal", "cyan", "turquoise", "denim"],
  },
];

export const VALID_NEWBORN_GENDER_KEYS = new Set(["all", "boy", "girl"]);

/**
 * Filters newborn products by baby gender. Uses the server-supplied genderMap
 * (product ID → "boy" | "girl" | "neutral") as primary signal, falling back to
 * category/color keyword logic when a product is missing from the map.
 *
 * Falls back to returning all products unchanged when the filtered list is empty
 * (same safety net used by every other filter in Shop.tsx).
 */
export function applyNewbornGenderFilter(
  products: Product[],
  genderKey: string,
  genderMap: Record<string, NewbornGender>,
): Product[] {
  if (!genderKey || genderKey === "all") return products;

  const genderDef = NEWBORN_GENDERS.find((g) => g.key === genderKey);
  if (!genderDef) return products;

  const { preferredCategories, excludeColorKeywords } = genderDef;
  const preferredSet = new Set(preferredCategories);
  const targetGender = genderKey as "boy" | "girl";

  const filtered = products.filter((p) => {
    const mapped = genderMap[p.id];

    if (mapped) {
      if (mapped === "neutral") {
        const productCategories = p.categories ?? [p.category];
        if (!productCategories.some((c) => preferredSet.has(c))) return false;
        if (excludeColorKeywords.length > 0) {
          const lower = p.name.toLowerCase();
          if (excludeColorKeywords.some((kw) => lower.includes(kw))) return false;
        }
        return true;
      }
      return mapped === targetGender;
    }

    const productCategories = p.categories ?? [p.category];
    if (!productCategories.some((c) => preferredSet.has(c))) return false;
    if (excludeColorKeywords.length > 0) {
      const lower = p.name.toLowerCase();
      if (excludeColorKeywords.some((kw) => lower.includes(kw))) return false;
    }
    return true;
  });

  return filtered.length > 0 ? filtered : products;
}

/**
 * React Query hook that fetches AI-inferred newborn gender classifications.
 * Returns an empty map while loading or when disabled.
 * Pass `enabled: false` on non-newborn pages to skip the fetch.
 *
 * Stale time: 30 minutes (classifications change rarely).
 */
export function useNewbornGenderMap(enabled = true): Record<string, NewbornGender> {
  const query = useGetNewbornGender({
    query: {
      queryKey: getGetNewbornGenderQueryKey(),
      enabled,
      staleTime: 30 * 60 * 1000,
      gcTime: 60 * 60 * 1000,
    },
  });

  if (!query.data) return {};

  const valid = new Set<string>(["boy", "girl", "neutral"]);
  const result: Record<string, NewbornGender> = {};
  for (const [id, gender] of Object.entries(query.data.genders)) {
    if (valid.has(gender)) {
      result[id] = gender as NewbornGender;
    }
  }
  return result;
}
