export type CategoryGroup = "flowers" | "gifts";

/**
 * Maps category slugs to their display group on the homepage.
 * Slugs not present in this map default to "gifts".
 * This is the single authoritative place to update when new featured categories are added.
 */
export const CATEGORY_GROUPS: Record<string, CategoryGroup> = {
  "hand-bouquets": "flowers",
  "flower-boxes": "flowers",
  "flower-vases": "flowers",
  "flower-baskets": "flowers",
  "flowers": "flowers",
  "plants": "flowers",
  "preserved-flowers": "flowers",
  "dried-flowers": "flowers",
  "lux-arrangements": "flowers",
  "orchids": "flowers",
  "roses": "flowers",
  "roses-lebanon": "flowers",
  "balloons": "gifts",
  "cakes": "gifts",
  "chocolate": "gifts",
  "bundles": "gifts",
  "stuffed-animals": "gifts",
  "arabic-sweets": "gifts",
  "personal-gifts": "gifts",
  "beauty": "gifts",
  "gift-bundles": "gifts",
  "baskets": "gifts",
  "spirits": "gifts",
  "gaming": "gifts",
  "summer-collection": "gifts",
};
