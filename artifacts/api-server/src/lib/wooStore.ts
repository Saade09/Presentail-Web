export type WooStoreConfig = {
  baseUrl: string;
  wpBaseUrl: string;
  consumerKey: string;
  consumerSecret: string;
};

const STORE_LEBANON: () => WooStoreConfig = () => ({
  baseUrl: "https://presentail.com/lebanon/wp-json/wc/v3",
  wpBaseUrl: "https://presentail.com/lebanon/wp-json",
  consumerKey: process.env.WC_CONSUMER_KEY ?? "",
  consumerSecret: process.env.WC_CONSUMER_SECRET ?? "",
});

const STORE_DUBAI: () => WooStoreConfig = () => ({
  baseUrl: "https://presentail.com/dubai/wp-json/wc/v3",
  wpBaseUrl: "https://presentail.com/dubai/wp-json",
  consumerKey: process.env.WC_DUBAI_CONSUMER_KEY ?? "",
  consumerSecret: process.env.WC_DUBAI_CONSUMER_SECRET ?? "",
});

const STORE_ABUDHABI: () => WooStoreConfig = () => ({
  baseUrl: "https://presentail.com/abudhabi/wp-json/wc/v3",
  wpBaseUrl: "https://presentail.com/abudhabi/wp-json",
  consumerKey: process.env.WC_ABUDHABI_CONSUMER_KEY ?? "",
  consumerSecret: process.env.WC_ABUDHABI_CONSUMER_SECRET ?? "",
});

const STORE_CYPRUS: () => WooStoreConfig = () => ({
  baseUrl: "https://presentail.com/cyprus/wp-json/wc/v3",
  wpBaseUrl: "https://presentail.com/cyprus/wp-json",
  consumerKey: process.env.WC_CYPRUS_CONSUMER_KEY ?? "",
  consumerSecret: process.env.WC_CYPRUS_CONSUMER_SECRET ?? "",
});

const CITY_TO_STORE: Record<string, () => WooStoreConfig> = {
  "ae-dubai": STORE_DUBAI,
  "ae-sharjah": STORE_DUBAI,
  "ae-abu-dhabi": STORE_ABUDHABI,
  "ae-al-ain": STORE_ABUDHABI,
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
