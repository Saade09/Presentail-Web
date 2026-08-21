import {
  buildLocalePath,
  cityIdToSlug,
  countryCodeToSlug,
  isSupportedCountrySlug,
  type Lang,
} from "./locale-route";

const HUB_CITY: Record<string, string> = {
  ae: "dubai",
  cy: "nicosia",
  lb: "beirut",
};

type CityHrefContext = {
  language: Lang;
  countryCode?: string | null;
  cityId?: string | null;
  /** Blog and landing shells use a hub city until a delivery city is selected. */
  fallbackToHub?: boolean;
};

/**
 * Build a router-root-absolute, locale/city-aware storefront link. The `~`
 * escape is required inside Wouter's nested locale and blog routers; without
 * it a valid city path can become `/en/en-lb/...`.
 */
export function cityHref(path: string, context: CityHrefContext): string {
  const country = context.countryCode ? countryCodeToSlug(context.countryCode) : null;
  if (!country || !isSupportedCountrySlug(country)) return `~${path}`;

  const city = context.cityId
    ? cityIdToSlug(context.cityId)
    : context.fallbackToHub
      ? HUB_CITY[country]
      : null;
  if (!city) return `~${path}`;

  const base = buildLocalePath({ lang: context.language, country, city });
  return path === "/" ? `~${base}` : `~${base}${path}`;
}