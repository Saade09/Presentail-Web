export type CategoryGroup = "flowers" | "gifts";

/**
 * Maps catalog-metadata category slugs to the actual product-level slugs used
 * in OS product.categories[]. Apply this wherever a category slug from the
 * catalog API is used to build a /category/<slug> URL, so the browse page
 * filter (p.categories.includes(slug)) finds the right products.
 *
 * Example: OS catalog exposes id="baskets" but products are tagged "gift-baskets".
 */
export const CATEGORY_SLUG_REMAP: Record<string, string> = {
  baskets: "gift-baskets",
  "summer-collection": "summer",
};

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
  "flowers-plants": "flowers",
  "luxury": "flowers",
  "balloons": "gifts",
  "balloon-arrangements": "gifts",
  "religious-gifts": "gifts",
  "cakes": "gifts",
  "chocolate": "gifts",
  "bundles": "gifts",
  "stuffed-animals": "gifts",
  "arabic-sweets": "gifts",
  "personal-gifts": "gifts",
  "beauty": "gifts",
  "gift-bundles": "gifts",
  "baskets": "gifts",
  "gift-baskets": "gifts",
  "spirits": "gifts",
  "gaming": "gifts",
  "summer": "gifts",
  "electronics": "gifts",
};

/**
 * Maps category slugs to their bundled static image path (served from /catalog/categories/).
 * Used as a fallback when the OS catalog has no image configured for a category — both the
 * mega menu and the homepage circles use this so they always show a real photo instead of
 * a generic icon placeholder.
 */
export const CATEGORY_STATIC_IMAGES: Record<string, string> = {
  "lux-arrangements":   "/catalog/categories/lux-arrangements.avif",
  "hand-bouquets":      "/catalog/categories/hand-bouquets.webp",
  "flower-boxes":       "/catalog/categories/flower-boxes.avif",
  "flower-vases":       "/catalog/categories/flower-vases.avif",
  "preserved-flowers":  "/catalog/categories/preserved-flowers.avif",
  "plants":             "/catalog/categories/plants.webp",
  "bundles":            "/catalog/categories/bundles.webp",
  "cakes":              "/catalog/categories/cakes.webp",
  "chocolate":          "/catalog/categories/chocolate.webp",
  "arabic-sweets":      "/catalog/categories/arabic-sweets.webp",
  "stuffed-animals":    "/catalog/categories/stuffed-animals.webp",
  "balloons":           "/catalog/categories/balloons.webp",
  "balloon-arrangements": "/catalog/categories/balloons.webp",
  "single-balloons":    "/catalog/categories/balloons.webp",
  "balloon-bundles":    "/catalog/categories/balloons.webp",
  "balloon-deco":       "/catalog/categories/balloons.webp",
  "baskets":            "/catalog/categories/gift-baskets.webp",
  "gift-baskets":       "/catalog/categories/gift-baskets.webp",
  "flower-baskets":     "/catalog/categories/flower-baskets.webp",
  "electronics":        "/catalog/categories/electronics.webp",
};

/**
 * Category slugs that must never appear in the mega menu or hamburger menu,
 * regardless of whether the OS catalog returns them. Add slugs here to
 * permanently suppress a category from navigation.
 */
export const CATEGORY_NAV_BLOCKLIST = new Set<string>([
  "gift-cards",
  // OS taxonomy tags/occasion labels are useful for catalog organization but
  // should not become top-level navigation links in the Gifts mega menu.
  "red",
  "valentines-specials",
  "pink",
  "birthday-bundles",
  "im-sorry",
  "fathers-day",
  "friend",
  "colleague",
  "yellow",
  "sunflower",
  "sweets",
  "children",
  "candles",
  "luxury",
  "roses",
]);

/**
 * Maps occasion slugs to their bundled static image path (served from /catalog/occasions/).
 * Used as a fallback in the homepage occasions carousel when the OS catalog has no image
 * configured for an occasion, so circles show a real photo instead of a generic icon.
 */
export const OCCASION_STATIC_IMAGES: Record<string, string> = {
  "birthday":      "/catalog/occasions/birthday.webp",
  "love-romance":  "/catalog/occasions/love-romance.webp",
  "thank-you":     "/catalog/occasions/thank-you.webp",
  "condolences":   "/catalog/occasions/condolences.webp",
  "farewell":      "/catalog/occasions/farewell.avif",
  "housewarming":  "/catalog/occasions/housewarming.avif",
  "new-job":       "/catalog/occasions/new-job.avif",
  "promotion":     "/catalog/occasions/promotion.avif",
};
