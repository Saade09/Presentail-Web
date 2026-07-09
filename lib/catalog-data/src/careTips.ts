export type CareTipGroup =
  | "flowers"
  | "balloons"
  | "cakes"
  | "plants"
  | "chocolate"
  | "stuffed"
  | "bundles"
  | "electronics";

export const CATEGORY_CARE_GROUP: Record<string, CareTipGroup> = {
  "lux-arrangements": "flowers",
  "hand-bouquets": "flowers",
  "flower-boxes": "flowers",
  "flower-baskets": "flowers",
  "flower-vases": "flowers",
  baskets: "flowers",
  "preserved-flowers": "flowers",
  balloons: "balloons",
  cakes: "cakes",
  plants: "plants",
  chocolate: "chocolate",
  "arabic-sweets": "chocolate",
  "stuffed-animals": "stuffed",
  bundles: "bundles",
  electronics: "electronics",
};

export const CATEGORY_CARE_ICON: Record<string, string> = {
  "lux-arrangements": "flower-tulip",
  "hand-bouquets": "flower",
  "flower-boxes": "flower-tulip",
  "flower-baskets": "flower-tulip",
  "flower-vases": "flower-tulip",
  baskets: "gift",
  "preserved-flowers": "flower-poppy",
  balloons: "balloon",
  cakes: "cake-variant",
  plants: "leaf",
  chocolate: "candy",
  "arabic-sweets": "candy-outline",
  "stuffed-animals": "teddy-bear",
  bundles: "gift",
  electronics: "devices",
};

export function getCareTipWebKeys(categorySlug: string): string[] {
  const group: CareTipGroup = CATEGORY_CARE_GROUP[categorySlug] ?? "flowers";
  return [
    `product.care.${group}.tip1`,
    `product.care.${group}.tip2`,
    `product.care.${group}.tip3`,
    `product.care.${group}.tip4`,
  ];
}
