import type { Lang } from "@/lib/locale-route";
import type { LocaleStrings } from "./table";

export type { LocaleStrings } from "./table";

const loaders: Record<Lang, () => Promise<LocaleStrings>> = {
  en: () => import("./en").then(({ STRINGS_EN }) => STRINGS_EN),
  ar: () => import("./ar").then(({ STRINGS_AR }) => STRINGS_AR),
  fr: () => import("./fr").then(({ STRINGS_FR }) => STRINGS_FR),
  el: () => import("./el").then(({ STRINGS_EL }) => STRINGS_EL),
};

const cachedLocales = new Map<Lang, Promise<LocaleStrings>>();

/**
 * Every language table is lazy and cached, so the initial entry carries no
 * catalogue data and revisiting a selected language does not fetch it again.
 */
export function loadLocaleStrings(language: Lang): Promise<LocaleStrings> | null {
  let locale = cachedLocales.get(language);
  if (!locale) {
    locale = loaders[language]();
    cachedLocales.set(language, locale);
  }
  return locale;
}