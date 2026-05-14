// Mobile-side adapter for the shared catalog defined in
// `@workspace/catalog-data`. The lib stores image refs as platform-neutral
// `{ asset: "products/foo.webp" }` paths so it can be shipped to the
// browser too; here we hydrate each asset path into the result of a
// static `require()` so React Native's bundler can pack the binary asset.
//
// The require map MUST be static (literal strings) because Metro analyses
// `require()` calls at build time. If you add a new product / category /
// occasion image to the lib, append the matching require here too — a
// missing asset triggers a defensive `null` so the existing
// product-detail / catalog screens don't crash.
import {
  type Brand,
  type CatalogImageRef,
  type CatalogReview,
  brands as LIB_BRANDS,
  categories as LIB_CATEGORIES,
  occasions as LIB_OCCASIONS,
  products as LIB_PRODUCTS,
  reviews as LIB_REVIEWS,
  bestSellerIds as LIB_BEST_SELLER_IDS,
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
};

export type Category = { id: string; name: string; icon: string; image: any };
export type Occasion = {
  id: string;
  name: string;
  icon: string;
  image: any;
  description?: string;
};

export type { Brand, CatalogReview };

const ASSETS: Record<string, any> = {
  "categories/arabic-sweets.webp": require("@/assets/categories/arabic-sweets.webp"),
  "categories/balloons.webp": require("@/assets/categories/balloons.webp"),
  "categories/board-games.webp": require("@/assets/categories/board-games.webp"),
  "categories/bundles.webp": require("@/assets/categories/bundles.webp"),
  "categories/cakes.webp": require("@/assets/categories/cakes.webp"),
  "categories/chocolate.webp": require("@/assets/categories/chocolate.webp"),
  "categories/coffee.webp": require("@/assets/categories/coffee.webp"),
  "categories/flower-boxes.avif": require("@/assets/categories/flower-boxes.avif"),
  "categories/flower-vases.avif": require("@/assets/categories/flower-vases.avif"),
  "categories/gift-cards.webp": require("@/assets/categories/gift-cards.webp"),
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
  "products/25-red-roses-arrangement.webp": require("@/assets/products/25-red-roses-arrangement.webp"),
  "products/25-white-roses-arrangement.webp": require("@/assets/products/25-white-roses-arrangement.webp"),
  "products/50-purple-roses-arrangement.webp": require("@/assets/products/50-purple-roses-arrangement.webp"),
  "products/50-red-roses-arrangement.webp": require("@/assets/products/50-red-roses-arrangement.webp"),
  "products/a-little-tenderness.webp": require("@/assets/products/a-little-tenderness.webp"),
  "products/a-tribute-to-her.avif": require("@/assets/products/a-tribute-to-her.avif"),
  "products/birthday-bear.avif": require("@/assets/products/birthday-bear.avif"),
  "products/black-eternal-rose.webp": require("@/assets/products/black-eternal-rose.webp"),
  "products/chery-breeze.webp": require("@/assets/products/chery-breeze.webp"),
  "products/chocolate-rocher-cake.avif": require("@/assets/products/chocolate-rocher-cake.avif"),
  "products/fierce-love.webp": require("@/assets/products/fierce-love.webp"),
  "products/flower-breeze.webp": require("@/assets/products/flower-breeze.webp"),
  "products/glowing-hue.webp": require("@/assets/products/glowing-hue.webp"),
  "products/hallab-maamoul-mini-mixed.avif": require("@/assets/products/hallab-maamoul-mini-mixed.avif"),
  "products/large-red-heart-box.webp": require("@/assets/products/large-red-heart-box.webp"),
  "products/large-yellow-heart-box.webp": require("@/assets/products/large-yellow-heart-box.webp"),
  "products/mixed-tulip-vase-arrangement.avif": require("@/assets/products/mixed-tulip-vase-arrangement.avif"),
  "products/mixed-tulip-vase-ferrero-rocher-chocolate-bundle.avif": require("@/assets/products/mixed-tulip-vase-ferrero-rocher-chocolate-bundle.avif"),
  "products/pastel-bliss-bouquet.avif": require("@/assets/products/pastel-bliss-bouquet.avif"),
  "products/pink-indulgence-bundle.avif": require("@/assets/products/pink-indulgence-bundle.avif"),
  "products/red-roses-box.webp": require("@/assets/products/red-roses-box.webp"),
  "products/rose-whisper.avif": require("@/assets/products/rose-whisper.avif"),
  "products/rural-love.avif": require("@/assets/products/rural-love.avif"),
  "products/snowfall-tulip-bouquet.avif": require("@/assets/products/snowfall-tulip-bouquet.avif"),
  "products/sunset-tulip-embrace.avif": require("@/assets/products/sunset-tulip-embrace.avif"),
  "products/super-you.webp": require("@/assets/products/super-you.webp"),
  "products/sweet-scarlet-affair.avif": require("@/assets/products/sweet-scarlet-affair.avif"),
  "products/the-thriving-heart-bundle.avif": require("@/assets/products/the-thriving-heart-bundle.avif"),
  "products/timeless-tulip-charm.avif": require("@/assets/products/timeless-tulip-charm.avif"),
  "products/yellow-roses-box.webp": require("@/assets/products/yellow-roses-box.webp"),
};

function hydrate(ref: CatalogImageRef): any {
  if (!ref) return null;
  if ("uri" in ref) return ref;
  const a = ASSETS[ref.asset];
  return a ?? null;
}

export const products: Product[] = LIB_PRODUCTS.map((p) => ({
  id: p.id,
  name: p.name,
  price: p.price,
  priceValue: p.priceValue,
  image: hydrate(p.image),
  ...(p.tag !== undefined ? { tag: p.tag } : {}),
  category: p.category,
  ...(p.occasions !== undefined ? { occasions: p.occasions } : {}),
  ...(p.description !== undefined ? { description: p.description } : {}),
  ...(p.wcId !== undefined ? { wcId: p.wcId } : {}),
}));

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

export const brands: Brand[] = LIB_BRANDS;
export const reviews: CatalogReview[] = LIB_REVIEWS;
export const bestSellerIds: readonly string[] = LIB_BEST_SELLER_IDS;
export const bestSellers: Product[] = bestSellerIds
  .map((id) => products.find((p) => p.id === id))
  .filter((p): p is Product => p !== undefined);

export function getProduct(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}
export function getCategory(id: string): Category | undefined {
  return categories.find((c) => c.id === id);
}
export function getOccasion(id: string): Occasion | undefined {
  return occasions.find((o) => o.id === id);
}
export function getProductsByCategory(catId: string): Product[] {
  return products.filter((p) => p.category === catId);
}
export function getProductsByOccasion(occId: string): Product[] {
  return products.filter((p) => p.occasions?.includes(occId));
}
