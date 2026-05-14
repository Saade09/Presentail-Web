// Mobile uses an uppercase `Lang` ("EN" | "AR" | "FR"); the shared lib
// normalizes any casing internally, so we just forward.
import type { Lang } from "@/lib/translations";
import {
  localizedCityName as libLocalizedCityName,
  localizedCountryName as libLocalizedCountryName,
} from "@workspace/catalog-data";

export {
  CITY_NAMES_AR,
  CITY_NAMES_FR,
  COUNTRY_NAMES_AR,
  COUNTRY_NAMES_FR,
} from "@workspace/catalog-data";

export function localizedCountryName(
  lang: Lang,
  code: string | null | undefined,
  fallback: string,
): string {
  return libLocalizedCountryName(lang, code, fallback);
}

export function localizedCityName(
  lang: Lang,
  id: string | null | undefined,
  fallback: string,
): string {
  return libLocalizedCityName(lang, id, fallback);
}
