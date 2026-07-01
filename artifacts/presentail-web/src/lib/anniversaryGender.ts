import type { Product } from "./queries";

export type AnniversaryGender = {
  key: string;
  labelKey: string;
  preferredCategories: string[];
  excludeColorKeywords: string[];
};

export const ANNIVERSARY_GENDERS: AnniversaryGender[] = [
  {
    key: "her",
    labelKey: "shop.anniversaryFor.her",
    preferredCategories: ["hand-bouquets", "flower-boxes", "flower-baskets", "chocolate", "bundles"],
    excludeColorKeywords: [],
  },
  {
    key: "him",
    labelKey: "shop.anniversaryFor.him",
    preferredCategories: ["plants", "chocolate", "gift-baskets", "bundles", "hand-bouquets"],
    excludeColorKeywords: ["pink", "rose gold", "blush", "lilac", "lavender", "fuchsia", "magenta"],
  },
];

export function applyAnniversaryGenderFilter(products: Product[], genderKey: string): Product[] {
  if (!genderKey || genderKey === "all") return products;

  const gender = ANNIVERSARY_GENDERS.find((g) => g.key === genderKey);
  if (!gender) return products;

  const { preferredCategories, excludeColorKeywords } = gender;
  const preferredSet = new Set(preferredCategories);

  const filtered = products.filter((p) => {
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
