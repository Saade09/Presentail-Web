// Central, typed SEO module for the Presentail web storefront.
//
// All page-type copy (titles / descriptions / OG / Twitter) for EN, AR and FR
// and every typed builder is exposed from here. The actual string tables and
// builder implementations live in the sibling `seo.mjs` so that the same single
// source can also be imported at runtime by the plain-ESM server injector
// (`seo-inject.mjs`), which cannot import TypeScript. `seo.d.mts` provides the
// types for that `.mjs` import. Consumers (e.g. `SeoHead.tsx`) import from here.
export type {
  Lang,
  RobotsDirective,
  SeoMeta,
  LocaleStringMap,
  EntityTemplateMap,
  CityHomeSeoOverride,
} from "./seo.mjs";

export {
  SUPPORTED_LANGS,
  OG_LOCALE,
  SEO_SOCIAL_LINKS,
  COUNTRY_NAMES,
  COUNTRY_PLAIN_NAMES,
  CITY_NAMES,
  TITLES,
  DESCRIPTIONS,
  LANDING_OG,
  LANDING_TWITTER,
  ENTITY_TITLES,
  ENTITY_TITLES_NO_CITY,
  ENTITY_DESCRIPTIONS,
  ENTITY_DESCRIPTIONS_NO_CITY,
  STATIC_PAGE_GROUP,
  NONINDEX_ROUTE_KEYS,
  formatTemplate,
  buildHomepageSeo,
  buildCitySeo,
  buildCategorySeo,
  buildOccasionSeo,
  buildProductSeo,
  buildBrandSeo,
  buildFaqsSeo,
  buildContactSeo,
  buildStaticSeo,
  buildNonIndexableSeo,
  isNonIndexableRouteKey,
  isGroupAStaticPage,
  CITY_HOME_SEO_OVERRIDES,
  getCityHomeSeoOverride,
} from "./seo.mjs";
