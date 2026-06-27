import type { BlogLang } from "@workspace/blog-content";

import type { Lang } from "@/lib/translations";

/**
 * Map the app's UI language code (EN / AR / FR) to the lowercase locale key
 * used inside the shared `@workspace/blog-content` catalogue (en / ar / fr).
 */
export function blogLangFor(lang: Lang): BlogLang {
  switch (lang) {
    case "AR":
      return "ar";
    case "FR":
      return "fr";
    default:
      return "en";
  }
}

const INTL_LOCALE: Record<Lang, string> = {
  EN: "en-US",
  AR: "ar",
  FR: "fr-FR",
};

/**
 * Format an ISO date string (e.g. "2025-03-15") as a localized long date.
 * Falls back to the raw value if the runtime cannot parse it.
 */
export function formatBlogDate(iso: string, lang: Lang): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(INTL_LOCALE[lang], {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  } catch {
    return iso;
  }
}
