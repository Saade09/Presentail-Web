import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";
import type { Product } from "./queries";

export type BearSize = "small" | "medium" | "life-size";

export type BearSizeTab = {
  key: string;
  labelKey: string;
  size: BearSize | null;
};

export const BEAR_SIZE_TABS: BearSizeTab[] = [
  { key: "all", labelKey: "shop.bearSize.all", size: null },
  { key: "small", labelKey: "shop.bearSize.small", size: "small" },
  { key: "medium", labelKey: "shop.bearSize.medium", size: "medium" },
  { key: "life-size", labelKey: "shop.bearSize.lifeSize", size: "life-size" },
];

export const VALID_BEAR_SIZE_KEYS = new Set(BEAR_SIZE_TABS.map((t) => t.key));

/**
 * Filters products by the AI-inferred bear size. If filtering produces zero
 * results (e.g. the size map hasn't loaded yet or the tab has no products),
 * returns all products unchanged — mirrors the safe fallback in birthdayRecipients.ts.
 */
export function applyBearSizeFilter(
  products: Product[],
  sizeMap: Record<string, BearSize>,
  selectedSize: string,
): Product[] {
  if (!selectedSize || selectedSize === "all") return products;

  const tab = BEAR_SIZE_TABS.find((t) => t.key === selectedSize);
  if (!tab || tab.size === null) return products;

  const filtered = products.filter((p) => sizeMap[p.id] === tab.size);
  return filtered.length > 0 ? filtered : products;
}

/**
 * React Query hook that fetches AI-inferred bear sizes for all
 * stuffed-animals products. Returns an empty map while loading or when
 * disabled. Pass `enabled: false` on non-bears pages to skip the fetch.
 *
 * Stale time: 30 minutes (size classifications change rarely).
 */
export function useBearSizeMap(enabled = true): Record<string, BearSize> {
  const query = useQuery<Record<string, BearSize>>({
    queryKey: ["bear-size-map-v1"],
    queryFn: async () => {
      const response = await apiFetch<{ sizes: Record<string, string> }>(
        "/categories/stuffed-animals/sizes",
      );
      const result: Record<string, BearSize> = {};
      const valid = new Set<string>(["small", "medium", "life-size"]);
      for (const [id, size] of Object.entries(response.sizes)) {
        if (valid.has(size)) {
          result[id] = size as BearSize;
        }
      }
      return result;
    },
    enabled,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

  return query.data ?? {};
}
