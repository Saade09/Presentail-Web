export type StoreCountry = "LB" | "AE" | "CY";

// Canonical store identifier. UAE has two physically separate stores
// (Dubai + Abu Dhabi) that both share country code `AE`, so this key — not
// the country — is used wherever loyalty / ledger data needs to uniquely
// identify the store.
export type StoreKey = "lebanon" | "dubai" | "abudhabi" | "cyprus";

export type WooStoreConfig = {
  baseUrl: string;
  wpBaseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  currencySymbol: string;
  currencyCode: string;
  // ISO country code of the regional WooCommerce instance this config points
  // at. Used for structured logging of the resolved store routing context.
  country: StoreCountry;
  storeKey: StoreKey;
};

const STORE_LEBANON: () => WooStoreConfig = () => ({
  baseUrl: "https://presentail.com/lebanon/wp-json/wc/v3",
  wpBaseUrl: "https://presentail.com/lebanon/wp-json",
  consumerKey: process.env.WC_CONSUMER_KEY ?? "",
  consumerSecret: process.env.WC_CONSUMER_SECRET ?? "",
  currencySymbol: "$",
  currencyCode: "USD",
  country: "LB",
  storeKey: "lebanon",
});

const STORE_DUBAI: () => WooStoreConfig = () => ({
  baseUrl: "https://presentail.com/dubai/wp-json/wc/v3",
  wpBaseUrl: "https://presentail.com/dubai/wp-json",
  consumerKey: process.env.WC_DUBAI_CONSUMER_KEY ?? "",
  consumerSecret: process.env.WC_DUBAI_CONSUMER_SECRET ?? "",
  currencySymbol: "AED",
  currencyCode: "AED",
  country: "AE",
  storeKey: "dubai",
});

const STORE_ABUDHABI: () => WooStoreConfig = () => ({
  baseUrl: "https://presentail.com/abudhabi/wp-json/wc/v3",
  wpBaseUrl: "https://presentail.com/abudhabi/wp-json",
  consumerKey: process.env.WC_ABUDHABI_CONSUMER_KEY ?? "",
  consumerSecret: process.env.WC_ABUDHABI_CONSUMER_SECRET ?? "",
  currencySymbol: "AED",
  currencyCode: "AED",
  country: "AE",
  storeKey: "abudhabi",
});

const STORE_CYPRUS: () => WooStoreConfig = () => ({
  baseUrl: "https://presentail.com/cyprus/wp-json/wc/v3",
  wpBaseUrl: "https://presentail.com/cyprus/wp-json",
  consumerKey: process.env.WC_CYPRUS_CONSUMER_KEY ?? "",
  consumerSecret: process.env.WC_CYPRUS_CONSUMER_SECRET ?? "",
  currencySymbol: "€",
  currencyCode: "EUR",
  country: "CY",
  storeKey: "cyprus",
});

const STORE_KEY_FACTORIES: Record<StoreKey, () => WooStoreConfig> = {
  lebanon: STORE_LEBANON,
  dubai: STORE_DUBAI,
  abudhabi: STORE_ABUDHABI,
  cyprus: STORE_CYPRUS,
};

export function resolveStoreByKey(key: StoreKey | string | null | undefined): WooStoreConfig {
  if (key && Object.prototype.hasOwnProperty.call(STORE_KEY_FACTORIES, key)) {
    return STORE_KEY_FACTORIES[key as StoreKey]();
  }
  return STORE_LEBANON();
}

export const ALL_STORE_KEYS: readonly StoreKey[] = [
  "lebanon",
  "dubai",
  "abudhabi",
  "cyprus",
];

const CITY_TO_STORE: Record<string, () => WooStoreConfig> = {
  "ae-dubai": STORE_DUBAI,
  "ae-ras-al-khaimah": STORE_DUBAI,
  "ae-umm-al-quwain": STORE_DUBAI,
  "ae-fujairah": STORE_DUBAI,
  "ae-ajman": STORE_DUBAI,
  "ae-sharjah": STORE_DUBAI,
  "ae-abu-dhabi": STORE_ABUDHABI,
  "cy-nicosia": STORE_CYPRUS,
  "cy-limassol": STORE_CYPRUS,
  "cy-larnaca": STORE_CYPRUS,
  "cy-paphos": STORE_CYPRUS,
};

const COUNTRY_TO_STORE: Record<string, () => WooStoreConfig> = {
  LB: STORE_LEBANON,
  AE: STORE_DUBAI,
  CY: STORE_CYPRUS,
};

export function resolveStore(countryCode?: string | null, cityId?: string | null): WooStoreConfig {
  if (cityId) {
    const factory = CITY_TO_STORE[cityId];
    if (factory) return factory();
  }
  if (countryCode) {
    const factory = COUNTRY_TO_STORE[countryCode.toUpperCase()];
    if (factory) return factory();
  }
  return STORE_LEBANON();
}

export function wooAuthHeader(store: WooStoreConfig): string {
  return "Basic " + Buffer.from(`${store.consumerKey}:${store.consumerSecret}`).toString("base64");
}

export function isStoreConfigured(store: WooStoreConfig): boolean {
  return !!(store.consumerKey && store.consumerSecret);
}

export type StoreContext = {
  countryCode?: string | null;
  cityId?: string | null;
};

export function readStoreContext(req: { query: any; headers: any }): StoreContext {
  const countryCode = typeof req.query?.countryCode === "string" ? req.query.countryCode.trim() : (typeof req.headers?.["x-store-country"] === "string" ? req.headers["x-store-country"].trim() : "");
  const cityId = typeof req.query?.cityId === "string" ? req.query.cityId.trim() : (typeof req.headers?.["x-store-city"] === "string" ? req.headers["x-store-city"].trim() : "");
  return {
    countryCode: countryCode ? countryCode.toUpperCase() : null,
    cityId: cityId || null,
  };
}

export function resolveStoreFromRequest(req: { query: any; headers: any }): WooStoreConfig {
  const ctx = readStoreContext(req);
  return resolveStore(ctx.countryCode, ctx.cityId);
}

// Structured representation of the store the resolver actually picked, for
// logging. `country` is the regional WooCommerce instance the request was
// routed to (after applying fallback rules), NOT the raw client-supplied
// `x-store-country`. `city` is the recognized routing city id when one was
// supplied and matched a known city; otherwise null. No PII or secrets.
export type ResolvedStoreLogContext = {
  country: StoreCountry;
  city: string | null;
};

// pino-http hands `customProps` an `IncomingMessage`. Express decorates it at
// runtime with `query`, but the Node typing doesn't model that. We accept the
// minimal structural shape we actually read so callers don't need casts at the
// call site.
type RequestLike = {
  query?: unknown;
  headers?: unknown;
};

export function resolveStoreLogContext(req: RequestLike): ResolvedStoreLogContext {
  const ctx = readStoreContext({
    query: req.query ?? {},
    headers: req.headers ?? {},
  });
  const recognizedCity = ctx.cityId && CITY_TO_STORE[ctx.cityId] ? ctx.cityId : null;
  const store = resolveStore(ctx.countryCode, ctx.cityId);
  return { country: store.country, city: recognizedCity };
}
