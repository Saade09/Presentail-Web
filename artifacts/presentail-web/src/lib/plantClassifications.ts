import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";

export type PlantEnvironment = "indoor" | "outdoor";

/**
 * React Query hook that fetches AI-inferred plant environment classifications.
 * Returns a map of OS product ID → "indoor" | "outdoor".
 *
 * Only enabled when `enabled` is true (i.e. on the plants category page).
 * Non-blocking — the page renders all products under "Indoor Plants" while loading.
 *
 * Stale time: 5 minutes (classifications change infrequently).
 */
export function usePlantClassificationMap(enabled = true): {
  classificationMap: Record<string, PlantEnvironment>;
  isLoading: boolean;
} {
  const query = useQuery<Record<string, PlantEnvironment>>({
    queryKey: ["plant-classification-map-v1"],
    queryFn: async () => {
      const response = await apiFetch<{
        ok: boolean;
        classifications: Record<string, string>;
      }>("/catalog/plant-classifications");
      const result: Record<string, PlantEnvironment> = {};
      const valid = new Set<string>(["indoor", "outdoor"]);
      for (const [id, env] of Object.entries(response.classifications)) {
        if (valid.has(env)) {
          result[id] = env as PlantEnvironment;
        }
      }
      return result;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return {
    classificationMap: query.data ?? {},
    isLoading: query.isLoading && enabled,
  };
}
