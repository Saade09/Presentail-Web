// Type declarations for the plain-ESM city SEO copy module (`city-seo.mjs`),
// shared by the server injector (seo-inject.mjs) and the client (Home.tsx).

/** Per-city delivery-coverage copy keyed by "{country}-{city}" then locale. */
export const CITY_SEO: Record<string, Record<string, string>>;
