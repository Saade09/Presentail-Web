import { useState, useEffect } from "react";
import { categories as staticCategories, type Category } from "@/data/catalog";
import { fetchWcCategories } from "@/lib/woo";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * Returns the live OS-filtered category list from /api/catalog/metadata.
 *
 * While the fetch is in flight the hook returns the full static list so the
 * UI is never blank. On success it swaps to the OS-filtered list (categories
 * not present in OS are hidden; OS-only extras like dried-flowers or beauty
 * are shown with a best-effort icon and no image).
 *
 * On network failure the static list is retained permanently.
 * Category names are translated into the active app language (AR/FR) when set.
 */
export function useOsCategories(): Category[] {
  const [cats, setCats] = useState<Category[]>(staticCategories);
  const { lang } = useLanguage();

  useEffect(() => {
    let cancelled = false;
    fetchWcCategories(lang.toLowerCase()).then((result) => {
      if (!cancelled && result.length > 0) setCats(result);
    });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  return cats;
}
