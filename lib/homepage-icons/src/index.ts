// Shared slug → generic icon name mapping for the homepage Categories
// and Occasions carousels. Web (lucide-react) and mobile
// (@expo/vector-icons) each provide a thin adapter that turns the
// generic name into a concrete icon component, so both platforms stay
// visually in sync as new categories/occasions are added here.

export type HomepageIconName =
  | "gift"
  | "cake"
  | "heart"
  | "trophy"
  | "baby"
  | "flower"
  | "balloon"
  | "candy"
  | "basket"
  | "teddy-bear"
  | "tv"
  | "gamepad"
  | "wine"
  | "leaf"
  | "sparkles"
  | "hand-heart";

const SLUG_TO_ICON: Record<string, HomepageIconName> = {
  // Categories (product types)
  "hand-bouquets": "flower",
  "flower-boxes": "flower",
  "flower-vases": "flower",
  "flower-baskets": "basket",
  flowers: "flower",
  roses: "flower",
  "roses-lebanon": "flower",
  orchids: "flower",
  "preserved-flowers": "flower",
  "dried-flowers": "flower",
  "lux-arrangements": "flower",
  plants: "leaf",
  balloons: "balloon",
  cakes: "cake",
  chocolate: "candy",
  "arabic-sweets": "candy",
  bundles: "basket",
  "gift-bundles": "basket",
  baskets: "basket",
  "stuffed-animals": "teddy-bear",
  gaming: "gamepad",
  "board-games": "gamepad",
  "personal-gifts": "gift",
  beauty: "sparkles",
  spirits: "wine",

  // Occasions
  birthday: "cake",
  anniversary: "heart",
  "love-romance": "heart",
  // `normalize("Love & Romance")` → "love-and-romance"; alias keeps the
  // name-only fallback working when no slug is supplied.
  "love-and-romance": "heart",
  "thank-you-and-appreciation": "hand-heart",
  "board-and-card-games": "gamepad",
  congratulations: "trophy",
  "thank-you": "hand-heart",
  newborn: "baby",
};

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Resolve a slug (preferred) or display name to a generic icon name.
// Falls back to "gift" for anything unmapped so carousels always show
// a meaningful icon instead of a single letter.
export function getHomepageIconName(
  slug?: string | null,
  name?: string | null,
): HomepageIconName {
  const candidates: string[] = [];
  if (slug) candidates.push(normalize(slug));
  if (name) candidates.push(normalize(name));
  for (const key of candidates) {
    if (key && key in SLUG_TO_ICON) return SLUG_TO_ICON[key];
  }
  return "gift";
}
