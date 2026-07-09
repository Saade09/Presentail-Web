import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";

type GeoCurrencyResponse = {
  countryCode: string | null;
  currencyCode: string;
};

/**
 * Returns the 2-letter ISO country code detected from the visitor's IP
 * address, or `null` while the lookup is in-flight or if it fails.
 *
 * Reuses the same React Query cache entry as `useDisplayCurrency` so no
 * extra network request is made when the checkout page has already fetched
 * `/api/geo/currency` for display-currency purposes.
 */
export function useIpDetectedCountry(): string | null {
  const { data } = useQuery({
    queryKey: ["geo-currency"],
    queryFn: () => apiFetch<GeoCurrencyResponse>("/geo/currency"),
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
  });

  return data?.countryCode ?? null;
}
