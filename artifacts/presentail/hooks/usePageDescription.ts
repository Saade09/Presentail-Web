import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { API_BASE } from "@/lib/stripe";

interface PageDescriptionResponse {
  ok: boolean;
  description: string;
  is_fallback: boolean;
}

/**
 * Fetches the AI-generated (or server-side fallback) contextual description
 * sentence for a category or occasion listing page.
 *
 * - Returns null while loading or when any required param is missing.
 * - Returns null on any network / API error (graceful no-op).
 * - Refetches when slug, delivery area, or language changes.
 */
export function usePageDescription(
  pageType: "category" | "occasion",
  slug: string | null,
): string | null {
  const { lang } = useLanguage();
  const { selectedCity } = useDeliveryLocation();
  const cityId = selectedCity?.id ?? null;

  const [description, setDescription] = useState<string | null>(null);

  useEffect(() => {
    if (!slug || !cityId) {
      setDescription(null);
      return;
    }

    let cancelled = false;
    setDescription(null);

    const language = lang.toLowerCase();
    const url =
      `${API_BASE}/api/page-descriptions` +
      `?page_type=${encodeURIComponent(pageType)}` +
      `&slug=${encodeURIComponent(slug)}` +
      `&delivery_area_id=${encodeURIComponent(cityId)}` +
      `&language=${encodeURIComponent(language)}`;

    fetch(url)
      .then((res) => {
        if (!res.ok) return null;
        return res.json() as Promise<PageDescriptionResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        if (data?.description) {
          setDescription(data.description);
        }
      })
      .catch(() => {
        // Graceful no-op on any network or parse error
      });

    return () => {
      cancelled = true;
    };
  }, [pageType, slug, cityId, lang]);

  return description;
}
