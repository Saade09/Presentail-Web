import { useQuery } from "@tanstack/react-query";
import { fetchProductsPricing, type ProductPricingMap } from "@/lib/woo";

const PRICING_STALE_MS = 5 * 60 * 1000; // 5 minutes

export function usePricingMap(): ProductPricingMap {
  const { data } = useQuery<ProductPricingMap>({
    queryKey: ["catalog/products-pricing"],
    queryFn: fetchProductsPricing,
    staleTime: PRICING_STALE_MS,
    gcTime: PRICING_STALE_MS * 2,
  });
  return data ?? {};
}
