/**
 * Image reference shared by web and mobile.
 *
 * - `null` — no image known.
 * - `{ uri }` — an absolute URL hosted on the WordPress media CDN.
 *   Both apps render this directly.
 * - `{ asset }` — a relative asset path packaged with each app.
 *   `asset` is a path under the bundled `assets/catalog/` tree
 *   (e.g. `"products/sweet-scarlet-affair.avif"`). Mobile resolves
 *   the path through `require()` against its bundled assets; the
 *   web storefront resolves it against `/catalog/` in its public
 *   directory.
 */
export type CatalogImageRef =
  | { uri: string }
  | { asset: string }
  | null;

export type Product = {
  id: string;
  name: string;
  price: string;
  priceValue: number;
  image: CatalogImageRef;
  tag?: string;
  category: string;
  occasions?: string[];
  description?: string;
  wcId?: number;
};

export type Category = {
  id: string;
  name: string;
  icon: string;
  image: CatalogImageRef;
};

export type Occasion = {
  id: string;
  name: string;
  icon: string;
  image: CatalogImageRef;
  description?: string;
};

export type Brand = { name: string; slug: string };

export type CatalogReview = {
  id: string;
  name: string;
  text: string;
  rating: number;
};

/** ISO 4217 currency codes the storefront actively supports. */
export type CurrencyCode =
  | "USD"
  | "AED"
  | "EUR"
  | "GBP"
  | "CAD"
  | "AUD"
  | "QAR"
  | "SAR"
  | "KWD"
  | "OMR"
  | "CHF";

export type Currency = {
  code: CurrencyCode;
  name: string;
  flag: string;
  symbol: string;
  symbolPosition: "left" | "right";
  spaceBetween: boolean;
  rate: number;
  decimals: number;
};

export type District = { name: string; fee: number };

export type DeliveryCityData = {
  id: string;
  name: string;
  isActive: boolean;
};

export type DeliveryCountryData = {
  id: string;
  name: string;
  /** ISO 3166-1 alpha-2 (uppercase). */
  code: string;
  /** Flag emoji. */
  flag: string;
  currency: CurrencyCode;
  isActive: boolean;
  cities: DeliveryCityData[];
  /**
   * Optional id of the city to highlight as the default for this country.
   */
  preferredDefaultCityId?: string;
};

/** Lower-case BCP-47-ish language tag. We currently translate `ar` and `fr`. */
export type LocalizableLang = "en" | "ar" | "fr";
