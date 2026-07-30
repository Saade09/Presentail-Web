import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";

type GeoCurrencyResponse = {
  countryCode: string | null;
  currencyCode: string;
};

export type IpDetectedCountryResult = {
  /** Detected ISO-3166 country code, or `null` while in-flight or on failure. */
  country: string | null;
  /**
   * `true` once the geo query has finished — either successfully or with an
   * error. Use this to defer rendering UI that depends on the detected country
   * so the field is mounted with the correct `defaultCountry` from the start.
   */
  settled: boolean;
};

/**
 * Returns the 2-letter ISO country code detected from the visitor's IP
 * address and a `settled` flag that becomes `true` once the query completes
 * (success or failure).
 *
 * Reuses the same React Query cache entry as `useDisplayCurrency` so no
 * extra network request is made when the checkout page has already fetched
 * `/api/geo/currency` for display-currency purposes.
 */
export function useIpDetectedCountry(): IpDetectedCountryResult {
  const { data, isFetched } = useQuery({
    queryKey: ["geo-currency"],
    queryFn: () => apiFetch<GeoCurrencyResponse>("/geo/currency"),
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
  });

  return { country: data?.countryCode ?? null, settled: isFetched };
}
