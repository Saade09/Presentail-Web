// Mobile-side adapter for the shared catalog defined in
// `@workspace/catalog-data`. The lib stores image refs as platform-neutral
// `{ asset: "categories/foo.avif" }` paths so it can be shipped to the
// browser too; here we hydrate each asset path into the result of a
// static `require()` so React Native's bundler can pack the binary asset.
//
// The require map MUST be static (literal strings) because Metro analyses
// `require()` calls at build time. If you add a new category / occasion
// image to the lib, append the matching require here too — a
// missing asset triggers a defensive `null` so screens don't crash.
import {
  type CatalogImageRef,
  type CatalogReview,
  categories as LIB_CATEGORIES,
  occasions as LIB_OCCASIONS,
  reviews as LIB_REVIEWS,
} from "@workspace/catalog-data";

export type Product = {
  id: string;
  name: string;
  price: string;
  priceValue: number;
  image: any;
  tag?: string;
  category: string;
  occasions?: string[];
  description?: string;
  wcId?: number;
  popularity?: number;
};

export type Category = { id: string; name: string; icon: string; image: any; description?: string | null };
export type Occasion = {
  id: string;
  name: string;
  icon: string;
  image: any;
  description?: string;
};

export type { CatalogReview };

const ASSETS: Record<string, any> = {
  "categories/arabic-sweets.webp": require("@/assets/categories/arabic-sweets.webp"),
  "categories/balloons.webp": require("@/assets/categories/balloons.webp"),
  "categories/bundles.webp": require("@/assets/categories/bundles.webp"),
  "categories/cakes.webp": require("@/assets/categories/cakes.webp"),
  "categories/chocolate.webp": require("@/assets/categories/chocolate.webp"),
  "categories/flower-boxes.avif": require("@/assets/categories/flower-boxes.avif"),
  "categories/flower-baskets.avif": require("@/assets/categories/flower-baskets.avif"),
  "categories/flower-vases.avif": require("@/assets/categories/flower-vases.avif"),
  "categories/hand-bouquets.webp": require("@/assets/categories/hand-bouquets.webp"),
  "categories/lux-arrangements.avif": require("@/assets/categories/lux-arrangements.avif"),
  "categories/plants.webp": require("@/assets/categories/plants.webp"),
  "categories/preserved-flowers.avif": require("@/assets/categories/preserved-flowers.avif"),
  "categories/stuffed-animals.webp": require("@/assets/categories/stuffed-animals.webp"),
  "occasions/birthday.webp": require("@/assets/occasions/birthday.webp"),
  "occasions/condolences.webp": require("@/assets/occasions/condolences.webp"),
  "occasions/farewell.avif": require("@/assets/occasions/farewell.avif"),
  "occasions/housewarming.avif": require("@/assets/occasions/housewarming.avif"),
  "occasions/love-romance.webp": require("@/assets/occasions/love-romance.webp"),
  "occasions/new-job.avif": require("@/assets/occasions/new-job.avif"),
  "occasions/promotion.avif": require("@/assets/occasions/promotion.avif"),
  "occasions/thank-you.webp": require("@/assets/occasions/thank-you.webp"),
};

function hydrate(ref: CatalogImageRef): any {
  if (!ref) return null;
  if ("uri" in ref) return ref;
  const a = ASSETS[ref.asset];
  return a ?? null;
}

export const categories: Category[] = LIB_CATEGORIES.map((c) => ({
  id: c.id,
  name: c.name,
  icon: c.icon,
  image: hydrate(c.image),
}));

export const occasions: Occasion[] = LIB_OCCASIONS.map((o) => ({
  id: o.id,
  name: o.name,
  icon: o.icon,
  image: hydrate(o.image),
  ...(o.description !== undefined ? { description: o.description } : {}),
}));

export const reviews: CatalogReview[] = LIB_REVIEWS;

export function getCategory(id: string): Category | undefined {
  return categories.find((c) => c.id === id);
}
export function getOccasion(id: string): Occasion | undefined {
  return occasions.find((o) => o.id === id);
}
