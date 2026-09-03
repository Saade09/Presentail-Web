// Type declarations for the plain-ESM single-source SEO module (`seo.mjs`).
// Imported through the typed facade `seo.ts`.

export type Lang = "en" | "ar" | "fr" | "el";

export type RobotsDirective = "index, follow" | "noindex, follow";

/** Plain copy object consumed by both the server injector and `SeoHead`. */
export interface SeoMeta {
  title: string;
  h1: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  twitterTitle: string;
  twitterDescription: string;
  robots: RobotsDirective;
}

export type LocaleStringMap = Record<Lang, Record<string, string>>;
export type EntityTemplateMap = Record<"product" | "category" | "occasion", Record<Lang, string>>;

export const SUPPORTED_LANGS: Lang[];
export const OG_LOCALE: Record<Lang, string>;
export const SEO_SOCIAL_LINKS: string[];
export const COUNTRY_NAMES: Record<Lang, Record<string, string>>;
export const COUNTRY_PLAIN_NAMES: Record<Lang, Record<string, string>>;
export const CITY_NAMES: Record<Lang, Record<string, string>>;
export const TITLES: LocaleStringMap;
export const DESCRIPTIONS: LocaleStringMap;
export const LANDING_OG: Record<Lang, { title: string; description: string }>;
export const LANDING_TWITTER: Record<Lang, { title: string; description: string }>;
export const HOME_OG: Record<Lang, { title: string; description: string }>;
export const HOME_TWITTER: Record<Lang, { title: string; description: string }>;
export const GENERIC_OG: Record<string, Record<Lang, { title: string; description: string }>>;
export const GENERIC_TWITTER: Record<string, Record<Lang, { title: string; description: string }>>;
export const ENTITY_TITLES: EntityTemplateMap;
export const ENTITY_TITLES_NO_CITY: EntityTemplateMap;
export const ENTITY_H1: Record<"product" | "category" | "occasion" | "brand", Record<Lang, string>>;
export const ROUTE_H1: Record<Lang, Record<string, string>>;
export const ENTITY_DESCRIPTIONS: EntityTemplateMap;
export const ENTITY_DESCRIPTIONS_NO_CITY: EntityTemplateMap;
export const STATIC_PAGE_GROUP: { A: Set<string>; B: Set<string> };
export const OG_LOCALE_COUNTRY: Record<string, Record<string, string>>;
export const NONINDEX_ROUTE_KEYS: Set<string>;
export function isGroupAStaticPage(routeKey: string): boolean;

/** Hand-written per-city home-page SEO override (e.g. Tripoli). */
export interface CityHomeSeoOverride {
  title: string;
  description: string;
  h1: string;
  intro: string;
  whyHeading?: string;
  whyPoints?: string[];
  faqs?: Array<{ question: string; answer: string }>;
}
export const CITY_HOME_SEO_OVERRIDES: Record<string, Partial<Record<Lang, CityHomeSeoOverride>>>;
export function getCityHomeSeoOverride(
  cityKey: string | null | undefined,
  lang: string,
): CityHomeSeoOverride | null;

export function formatTemplate(
  template: string,
  params?: { name?: string; city?: string; country?: string },
): string;

export function buildHomepageSeo(args?: { lang?: string }): SeoMeta;
export function buildCitySeo(args?: { lang?: string; city?: string; country?: string }): SeoMeta;
export function buildCategorySeo(args?: {
  lang?: string;
  categoryName?: string;
  city?: string;
  country?: string;
  productCount?: number;
}): SeoMeta;
export function buildOccasionSeo(args?: {
  lang?: string;
  occasionName?: string;
  city?: string;
  country?: string;
  productCount?: number;
}): SeoMeta;
export function buildProductSeo(args?: {
  lang?: string;
  productName?: string;
  city?: string;
  country?: string;
  shortDescription?: string;
}): SeoMeta;
export function buildBrandSeo(args?: {
  lang?: string;
  brandName?: string;
  city?: string;
  country?: string;
}): SeoMeta;
export function buildBlogSeo(args?: {
  lang?: string;
  seoTitle?: string;
  articleTitle?: string;
  h1?: string;
  description?: string;
}): SeoMeta;
export function buildFaqsSeo(args?: {
  lang?: string;
  city?: string;
  country?: string;
}): SeoMeta;
export function buildContactSeo(args?: {
  lang?: string;
  city?: string;
  country?: string;
}): SeoMeta;
export function buildStaticSeo(args?: {
  lang?: string;
  routeKey?: string;
  city?: string;
  country?: string;
}): SeoMeta;
export function buildNonIndexableSeo(args?: {
  lang?: string;
  routeKey?: string;
  city?: string;
  country?: string;
}): SeoMeta;
export function isNonIndexableRouteKey(routeKey: string): boolean;
export function normalizeSeoText(value: unknown): string;
