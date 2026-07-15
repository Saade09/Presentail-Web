/**
 * Client-side contextual page description builder for category and occasion pages.
 *
 * Generates a rich, specific description from real product data available in the
 * browser — used as the fallback when the server-generated AI description is
 * unavailable (API error, cold start, etc.).
 *
 * All string literals are annotated // i18n-ignore because:
 *   a) These are marketing copy assembled from structured data, not UI labels.
 *   b) The server-side path (pageDescriptionGenerator.ts) already handles EN/AR/FR
 *      via AI; this path only fires on API failure.
 */

import type { Product } from "@/lib/queries";

// ---------------------------------------------------------------------------
// Context hints — mirrors OCCASION_CONTEXT_HINTS / CATEGORY_CONTEXT_HINTS in
// pageDescriptionGenerator.ts. Keep in sync when adding new slugs.
// ---------------------------------------------------------------------------

const OCCASION_HINTS: Record<string, string> = {
  "birthday": "A celebratory surprise to make someone feel truly special", // i18n-ignore
  "anniversary": "A romantic gesture to mark a milestone and celebrate your love", // i18n-ignore
  "wedding": "Elegant flowers and gifts for weddings, engagements, and bridal celebrations", // i18n-ignore
  "new-born": "Gentle, heartfelt gifts to welcome a new baby and celebrate proud new parents", // i18n-ignore
  "sympathy": "Comforting, dignified arrangements to offer support and express condolences", // i18n-ignore
  "get-well": "Cheerful, uplifting flowers and treats to brighten someone's recovery", // i18n-ignore
  "graduation": "Proud celebration gifts to honour an academic achievement", // i18n-ignore
  "mother-s-day": "Heartfelt flowers and gifts to show how much you appreciate Mum", // i18n-ignore
  "mothers-day": "Heartfelt flowers and gifts to show how much you appreciate Mum", // i18n-ignore
  "father-s-day": "Thoughtful gifts to celebrate Dad on his special day", // i18n-ignore
  "fathers-day": "Thoughtful gifts to celebrate Dad on his special day", // i18n-ignore
  "valentine-s-day": "Romantic flowers and gifts that say it all without words", // i18n-ignore
  "valentines-day": "Romantic flowers and gifts that say it all without words", // i18n-ignore
  "eid": "Festive, generous gifts to celebrate Eid with family and loved ones", // i18n-ignore
  "thank-you": "Warm appreciation gifts to say thank you from the heart", // i18n-ignore
  "congratulations": "Joyful, celebratory gifts to mark great news and achievements", // i18n-ignore
  "just-because": "Spontaneous surprise flowers and gifts to brighten anyone's day — no reason needed", // i18n-ignore
  "corporate": "Professional gift solutions for client appreciation, team milestones, and business occasions", // i18n-ignore
  "housewarming": "Thoughtful gifts to welcome someone into their beautiful new home", // i18n-ignore
  "farewell": "Memorable send-off gifts to wish someone well on their next chapter", // i18n-ignore
  "ramadan": "Generous, festive gifts to share the spirit of Ramadan", // i18n-ignore
  "christmas": "Festive flowers and gifts to celebrate the holiday season in style", // i18n-ignore
};

const CATEGORY_HINTS: Record<string, string> = {
  "hand-bouquets": "Fresh, handcrafted bouquets — the timeless gift for any occasion", // i18n-ignore
  "hand-bouquet": "Fresh, handcrafted bouquets — the timeless gift for any occasion", // i18n-ignore
  "flower-boxes": "Blooms elegantly presented in luxury boxes for a refined gifting experience", // i18n-ignore
  "flower-baskets": "Flowers arranged in charming baskets, perfect for home or office", // i18n-ignore
  "flower-vases": "Flowers delivered in a vase — ready to display the moment they arrive", // i18n-ignore
  "roses-bouquets": "Classic and premium rose arrangements that never go out of style", // i18n-ignore
  "lux-arrangements": "Bespoke, high-impact floral compositions for grand occasions and statement gifts", // i18n-ignore
  "dried-flowers": "Long-lasting dried flower arrangements for a bohemian, timeless look", // i18n-ignore
  "preserved-flowers": "Preserved blooms that retain their beauty for months without water", // i18n-ignore
  "cakes": "Celebration cakes baked to order — a sweet centrepiece for any party", // i18n-ignore
  "chocolate": "Premium chocolates and artisan confectionery — a universally adored gift", // i18n-ignore
  "arabic-sweets": "Traditional Arabic sweets and pastries, ideal for sharing and celebrations", // i18n-ignore
  "balloons": "Festive balloon arrangements and bouquets that add joy to any celebration", // i18n-ignore
  "stuffed-animals": "Soft, cuddly plush toys loved by kids and adults alike", // i18n-ignore
  "plants": "Lush indoor plants — a living gift that keeps growing long after the occasion", // i18n-ignore
  "baskets": "Curated gift hampers filled with a thoughtful mix of treats and luxuries", // i18n-ignore
  "gift-baskets": "Curated gift hampers filled with a thoughtful mix of treats and luxuries", // i18n-ignore
  "bundles": "Carefully curated gift bundles combining flowers, sweets, and more", // i18n-ignore
  "beauty": "Premium beauty and wellness gifts — a treat for the senses", // i18n-ignore
};

// Maps product category slugs to human-readable type labels shown in descriptions.
const TYPE_LABELS: Record<string, string> = {
  "hand-bouquets": "fresh bouquets", // i18n-ignore
  "hand-bouquet": "fresh bouquets", // i18n-ignore
  "flower-boxes": "luxury flower boxes", // i18n-ignore
  "flower-baskets": "flower baskets", // i18n-ignore
  "flower-vases": "floral vase arrangements", // i18n-ignore
  "lux-arrangements": "luxury floral arrangements", // i18n-ignore
  "roses-bouquets": "rose arrangements", // i18n-ignore
  "flowers": "flowers", // i18n-ignore
  "dried-flowers": "dried flower arrangements", // i18n-ignore
  "preserved-flowers": "preserved flower arrangements", // i18n-ignore
  "cakes": "cakes", // i18n-ignore
  "chocolate": "premium chocolates", // i18n-ignore
  "arabic-sweets": "Arabic sweets", // i18n-ignore
  "balloons": "balloon arrangements", // i18n-ignore
  "stuffed-animals": "plush toys & stuffed animals", // i18n-ignore
  "plants": "indoor plants", // i18n-ignore
  "baskets": "gift hampers", // i18n-ignore
  "gift-baskets": "gift hampers", // i18n-ignore
  "bundles": "gift bundles", // i18n-ignore
  "beauty": "beauty & wellness gifts", // i18n-ignore
  "electronics": "tech gifts", // i18n-ignore
};

/**
 * Extract unique human-readable product type labels from a product list.
 * Skips the page's own category slug to avoid stating the obvious (e.g., on
 * the "Cakes" category page we don't need to list "cakes" in the description).
 */
function deriveProductTypes(products: Product[], excludeSlug?: string): string[] {
  const seen = new Set<string>();
  const types: string[] = [];
  for (const p of products) {
    for (const slug of p.categories) {
      if (slug === excludeSlug) continue;
      const label = TYPE_LABELS[slug];
      if (label && !seen.has(label)) {
        seen.add(label);
        types.push(label);
      }
    }
  }
  return types.slice(0, 4);
}

/**
 * Format a list of type strings into a natural English phrase.
 * e.g. ["flowers", "cakes", "chocolates"] → "flowers, cakes & chocolates"
 */
function joinTypes(types: string[]): string {
  if (types.length === 0) return ""; // i18n-ignore
  if (types.length === 1) return types[0]; // i18n-ignore
  return `${types.slice(0, -1).join(", ")} & ${types[types.length - 1]}`; // i18n-ignore
}

/**
 * Build a rich contextual description for a category or occasion page from
 * the products currently loaded in the browser.
 *
 * @param pageType   "category" | "occasion"
 * @param pageSlug   URL slug for the category or occasion
 * @param pageName   Human-readable page name (e.g. "Bears", "Birthday")
 * @param products   Products currently loaded for this page
 * @param areaName   Delivery area name (e.g. "Beirut")
 * @param expressAvailable  Whether same-day delivery is available in this area
 */
export function buildRichClientDescription(
  pageType: "category" | "occasion",
  pageSlug: string,
  pageName: string,
  products: Product[],
  areaName: string,
  expressAvailable: boolean,
): string {
  const hints = pageType === "occasion" ? OCCASION_HINTS : CATEGORY_HINTS;
  const hint = hints[pageSlug];
  const count = products.length;
  const deliveryLabel = expressAvailable ? "same-day delivery" : "fast delivery"; // i18n-ignore
  const areaPhrase = areaName ? ` to ${areaName}` : ""; // i18n-ignore

  // Derive product types from products, excluding the page's own category slug
  // so we get cross-category context on occasion pages (e.g., Birthday shows
  // "flowers, cakes & chocolates") and complementary types on category pages.
  const excludeSlug = pageType === "category" ? pageSlug : undefined;
  const types = deriveProductTypes(products, excludeSlug);
  const typePhrase = joinTypes(types);

  if (pageType === "category") {
    if (hint && count > 0 && typePhrase) {
      // e.g. "Soft, cuddly plush toys loved by kids and adults alike —
      //        13 options including gift hampers & gift bundles, with same-day delivery to Beirut."
      return `${hint} — ${count} options${typePhrase ? ` including ${typePhrase}` : ""}, with ${deliveryLabel}${areaPhrase}.`; // i18n-ignore
    }
    if (hint && count > 0) {
      return `${hint} — ${count} options with ${deliveryLabel}${areaPhrase}.`; // i18n-ignore
    }
    if (hint) {
      return `${hint}. Available with ${deliveryLabel}${areaPhrase}.`; // i18n-ignore
    }
    if (count > 0 && typePhrase) {
      return `Discover ${count} ${typePhrase} with ${deliveryLabel}${areaPhrase}.`; // i18n-ignore
    }
    return `Shop ${pageName} gifts with ${deliveryLabel}${areaPhrase}.`; // i18n-ignore
  }

  // Occasion page
  if (hint && count > 0 && typePhrase) {
    // e.g. "A celebratory surprise to make someone feel truly special —
    //        choose from flowers, cakes & chocolates, with same-day delivery to Beirut."
    return `${hint} — choose from ${typePhrase}${count ? ` (${count} gifts)` : ""}, with ${deliveryLabel}${areaPhrase}.`; // i18n-ignore
  }
  if (hint && count > 0) {
    return `${hint} — ${count} gifts available with ${deliveryLabel}${areaPhrase}.`; // i18n-ignore
  }
  if (hint) {
    return `${hint}. Available with ${deliveryLabel}${areaPhrase}.`; // i18n-ignore
  }
  if (count > 0 && typePhrase) {
    return `Celebrate ${pageName} with ${typePhrase} — ${count} gifts with ${deliveryLabel}${areaPhrase}.`; // i18n-ignore
  }
  return `Explore ${pageName} gift ideas with ${deliveryLabel}${areaPhrase}.`; // i18n-ignore
}
