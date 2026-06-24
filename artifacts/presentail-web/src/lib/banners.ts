import {
  getGetHomepageBannersQueryKey,
  useGetHomepageBanners,
} from "@workspace/api-client-react";
import type { HomepageBanner } from "@workspace/api-client-react";

export type { HomepageBanner };

export type BannerDevice = "desktop" | "mobile";

// Hook backed by the live Presentail OS feed via `/api/homepage/banners`.
// OS handles all filtering (active status, schedule window, country/city
// targeting, device) server-side, so the client renders the response verbatim.
export function useHomepageBanners(countryCode: string | undefined, cityId?: string, device: BannerDevice = "desktop") {
  const params = { countryCode: countryCode || undefined, cityId, device };
  return useGetHomepageBanners<HomepageBanner[]>(params, {
    query: {
      queryKey: getGetHomepageBannersQueryKey(params),
      staleTime: 5 * 60 * 1000,
      select: (data) => data.banners,
    },
  });
}
