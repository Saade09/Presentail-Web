import { useState, useEffect } from "react";
import { occasions as staticOccasions, type Occasion } from "@/data/catalog";
import { fetchOsOccasions } from "@/lib/woo";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * Returns the live OS-filtered occasion list from /api/catalog/metadata.
 *
 * While the fetch is in flight the hook returns the full static list so the
 * UI is never blank. On success it swaps to the OS-filtered list (occasions
 * marked inactive in OS are hidden; OS-only occasions are shown with a
 * best-effort icon and no image).
 *
 * On network failure the static list is retained permanently.
 * Occasion names are translated into the active app language (AR/FR) when set.
 */
export function useOsOccasions(): Occasion[] {
  const [occs, setOccs] = useState<Occasion[]>(staticOccasions);
  const { lang } = useLanguage();

  useEffect(() => {
    let cancelled = false;
    fetchOsOccasions(lang.toLowerCase()).then((result) => {
      if (!cancelled && result.length > 0) setOccs(result as Occasion[]);
    });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  return occs;
}
