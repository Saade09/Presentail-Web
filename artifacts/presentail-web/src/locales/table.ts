import type { Dict } from "./types";

export type LocaleStrings = Record<string, string>;

export function pickLanguageStrings(
  tables: Dict[],
  language: "en" | "ar",
): LocaleStrings {
  return Object.assign(
    {},
    ...tables.map((table) =>
      Object.fromEntries(Object.entries(table).map(([key, value]) => [key, value[language]])),
    ),
  );
}

export function withEnglishFallback(
  tables: Dict[],
  translations: LocaleStrings[],
): LocaleStrings {
  return Object.assign({}, pickLanguageStrings(tables, "en"), ...translations);
}