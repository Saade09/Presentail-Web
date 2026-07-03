import {
  getGetHomepageBannersQueryKey,
  useGetHomepageBanners,
} from "@workspace/api-client-react";
import type { HomepageBanner } from "@workspace/api-client-react";

export type { HomepageBanner };

export type BannerDevice = "desktop" | "mobile";
export type BannerLang = "en" | "ar" | "fr";

// Hook backed by the live Presentail OS feed via `/api/homepage/banners`.
// OS handles all filtering (active status, schedule window, country/city
// targeting, device) server-side, so the client renders the response verbatim.
// Pass `lang` so the API server forwards the language preference to OS and
// resolves localised text fields (title, headline, subtitle, ctaText) before
// returning the response. Falls back to English when a translation is absent.
export function useHomepageBanners(
  countryCode: string | undefined,
  cityId?: string,
  device: BannerDevice = "desktop",
  lang: BannerLang = "en",
) {
  const params = { countryCode: countryCode || undefined, cityId, device, lang };
  return useGetHomepageBanners<HomepageBanner[]>(params, {
    query: {
      queryKey: getGetHomepageBannersQueryKey(params),
      staleTime: 5 * 60 * 1000,
      select: (data) => data.banners,
    },
  });
}
