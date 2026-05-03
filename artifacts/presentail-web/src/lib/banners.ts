import {
  getGetHomepageBannersQueryKey,
  useGetHomepageBanners,
} from "@workspace/api-client-react";
import type { HomepageBanner } from "@workspace/api-client-react";

export type { HomepageBanner };

// Hook backed by the real Presentail OS feed at `/api/homepage/banners`.
// Filtering (active / startsAt-endsAt window / countryCode) and sortOrder
// ordering all happen server-side, so the client can render the response
// verbatim.
export function useHomepageBanners(countryCode: string) {
  const params = { countryCode };
  return useGetHomepageBanners<HomepageBanner[]>(params, {
    query: {
      queryKey: getGetHomepageBannersQueryKey(params),
      staleTime: 5 * 60 * 1000,
      select: (data) => data.banners,
    },
  });
}
