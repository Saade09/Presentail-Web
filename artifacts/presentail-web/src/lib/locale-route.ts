import _citySlugsJson from "./city-slugs.json";

export const SUPPORTED_LANGS = ["en", "ar", "fr", "el"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

export const SUPPORTED_COUNTRY_SLUGS = ["ae", "lb", "cy"] as const;
export type CountrySlug = (typeof SUPPORTED_COUNTRY_SLUGS)[number];

/**
 * Context-aware language availability. Greek ("el") is offered only on the
 * root landing page (no country context) and for Cyprus — shoppers browsing
 * UAE or Lebanon cities keep seeing EN/AR/FR only.
 *
 * Pass `null` for the landing page / no-country contexts.
 */
export function langsForCountry(country: CountrySlug | null): readonly Lang[] {
  if (country === null || country === "cy") return SUPPORTED_LANGS;
  return ["en", "ar", "fr"] as const;
}

/** True when `lang` may be used with `country` (Greek is Cyprus-only). */
export function isLangAllowedForCountry(
  lang: Lang,
  country: CountrySlug | null,
): boolean {
  return (langsForCountry(country) as readonly string[]).includes(lang);
}

/**
 * Single source of truth for city slugs, shared with
 * `artifacts/presentail-web/scripts/pageEligibility.mjs`.
 * Edit `city-slugs.json` to add/remove cities — both files pick up the change
 * automatically.
 */
export const CITY_SLUGS_BY_COUNTRY: Record<CountrySlug, readonly string[]> =
  _citySlugsJson as Record<CountrySlug, readonly string[]>;

export function isSupportedLang(s: string): s is Lang {
  return (SUPPORTED_LANGS as readonly string[]).includes(s);
}

export function isSupportedCountrySlug(s: string): s is CountrySlug {
  return (SUPPORTED_COUNTRY_SLUGS as readonly string[]).includes(s);
}

export function isSupportedCity(country: CountrySlug, city: string): boolean {
  return (CITY_SLUGS_BY_COUNTRY[country] as readonly string[]).includes(city);
}

const LOCALE_RE = /^([a-z]{2})-([a-z]{2})$/;

export type ParsedLocale = {
  /** True iff the first segment is a valid `lang-country` pair. */
  hasLocalePrefix: boolean;
  lang: Lang | null;
  country: CountrySlug | null;
  /** Second segment, when present. May still be an unknown city slug. */
  city: string | null;
  /** Path remainder after the locale and city segments. Empty or starts with `/`. */
  rest: string;
};

/**
 * Parse a pathname (no host, no query, no hash) into its locale parts.
 * Examples:
 *   "/en-ae/dubai/product/x" → { lang:"en", country:"ae", city:"dubai", rest:"/product/x", hasLocalePrefix: true }
 *   "/en-ae"                  → { lang:"en", country:"ae", city: null, rest:"", hasLocalePrefix: true }
 *   "/shop"                   → { lang:null, country:null, city:null, rest:"/shop", hasLocalePrefix: false }
 *   "/de-ae/foo"              → { hasLocalePrefix: false, ... } (de is unsupported)
 */
export function parseLocalePath(pathname: string): ParsedLocale {
  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0] ?? "";
  const m = first.match(LOCALE_RE);
  if (!m || !isSupportedLang(m[1]) || !isSupportedCountrySlug(m[2])) {
    return {
      hasLocalePrefix: false,
      lang: null,
      country: null,
      city: null,
      rest: pathname || "/",
    };
  }
  const lang = m[1] as Lang;
  const country = m[2] as CountrySlug;
  const city = segments[1] ?? null;
  const restSegs = city ? segments.slice(2) : [];
  const rest = restSegs.length ? "/" + restSegs.join("/") : "";
  return { hasLocalePrefix: true, lang, country, city, rest };
}

export function buildLocalePath(p: {
  lang: Lang;
  country: CountrySlug;
  city?: string | null;
  rest?: string;
}): string {
  let path = `/${p.lang}-${p.country}`;
  if (p.city) path += `/${p.city}`;
  if (p.rest && p.rest !== "/") {
    path += p.rest.startsWith("/") ? p.rest : "/" + p.rest;
  }
  return path;
}

/**
 * Replace only the language segment of `fullUrl`, preserving country, city,
 * remaining path, query string, and hash. If `fullUrl` has no valid locale
 * prefix, returns it unchanged.
 */
export function switchLanguage(fullUrl: string, newLang: Lang): string {
  const hashIdx = fullUrl.indexOf("#");
  const hash = hashIdx >= 0 ? fullUrl.slice(hashIdx) : "";
  const noHash = hashIdx >= 0 ? fullUrl.slice(0, hashIdx) : fullUrl;
  const qIdx = noHash.indexOf("?");
  const search = qIdx >= 0 ? noHash.slice(qIdx) : "";
  const pathname = qIdx >= 0 ? noHash.slice(0, qIdx) : noHash;

  const parsed = parseLocalePath(pathname);
  if (!parsed.hasLocalePrefix || !parsed.country) return fullUrl;

  const next = buildLocalePath({
    lang: newLang,
    country: parsed.country,
    city: parsed.city,
    rest: parsed.rest,
  });
  return next + search + hash;
}

/**
 * Build the list of language alternates for the given pathname. Returns one
 * entry per supported language, all sharing the same country/city/rest. Useful
 * for emitting hreflang link tags. Returns an empty array when the path has no
 * locale prefix (e.g. the landing page).
 *
 * @deprecated Use `buildHreflangSet` from `@/lib/hreflang` instead.
 * `buildLanguageAlternates` only emits alternates for the requesting country,
 * missing cross-country hreflang and using the browsed city instead of the
 * canonical city for that country. `buildHreflangSet` covers all three
 * countries with fixed canonical cities and a consistent x-default.
 */
export function buildLanguageAlternates(
  pathname: string,
): Array<{ lang: Lang; path: string }> {
  const parsed = parseLocalePath(pathname);
  if (!parsed.hasLocalePrefix || !parsed.country) return [];
  const country = parsed.country;
  return SUPPORTED_LANGS.map((lang) => ({
    lang,
    path: buildLocalePath({
      lang,
      country,
      city: parsed.city,
      rest: parsed.rest,
    }),
  }));
}

/** BCP 47 hreflang code for a supported language + country slug. */
export function hreflangCode(lang: Lang, country: CountrySlug): string {
  return `${lang}-${country.toUpperCase()}`;
}

/** Convert a delivery API city id like "ae-dubai" to its URL slug "dubai". */
export function cityIdToSlug(cityId: string): string {
  return cityId.replace(/^[a-z]{2}-/, "");
}

/** Convert a country slug + city URL slug back to the API city id. */
export function citySlugToId(country: CountrySlug, citySlug: string): string {
  return `${country}-${citySlug}`;
}

/** Country code (e.g. "AE") from URL slug ("ae"). */
export function countrySlugToCode(slug: CountrySlug): string {
  return slug.toUpperCase();
}

/** URL slug from country code ("AE" → "ae"). */
export function countryCodeToSlug(code: string): string {
  return code.toLowerCase();
}
