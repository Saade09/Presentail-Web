import { fetchOsOccasionStats } from "@workspace/presentail-os";

// ── OS occasion stats cache ────────────────────────────────────────────────
// Caches the result of fetchOsOccasionStats() for ~5 min (same TTL as the
// product cache) so we don't hit the OS stats endpoint on every homepage load.
// When the endpoint doesn't exist, `cachedOccasionStats` is null and the
// scoring falls back to product-level totalSales aggregation.

const OS_OCCASION_STATS_TTL_MS = 5 * 60 * 1000;
let cachedOccasionStats: Map<string, number> | null = null;
let occasionStatsFetchedAt = 0;
/** true while a fetch is in flight — prevents parallel duplicate requests */
let occasionStatsFetching = false;

export async function getOsOccasionStatsMap(): Promise<Map<string, number>> {
  const now = Date.now();
  if (cachedOccasionStats !== null && now - occasionStatsFetchedAt < OS_OCCASION_STATS_TTL_MS) {
    return cachedOccasionStats;
  }
  if (occasionStatsFetching) return cachedOccasionStats ?? new Map();
  occasionStatsFetching = true;
  try {
    const apiKey = process.env.PRESENTAIL_OS_API_KEY ?? "";
    const baseUrl = process.env.PRESENTAIL_OS_API_URL;
    const workspace = process.env.PRESENTAIL_OS_WORKSPACE;
    const config = { apiKey, ...(baseUrl ? { baseUrl } : {}), ...(workspace ? { workspace } : {}) };
    const resp = await fetchOsOccasionStats(config);
    if (resp && resp.occasions.length > 0) {
      const map = new Map<string, number>();
      for (const occ of resp.occasions) {
        // Prefer totalOrders as the primary sales signal; fall back to totalSales.
        const score = occ.totalOrders ?? occ.totalSales ?? occ.totalRevenue ?? 0;
        if (occ.slug && score > 0) map.set(occ.slug, score);
      }
      cachedOccasionStats = map;
    } else {
      // Endpoint absent or returned empty — cache an empty map so we don't
      // re-probe on every request; the TTL will eventually re-probe.
      cachedOccasionStats = new Map();
    }
    occasionStatsFetchedAt = Date.now();
    return cachedOccasionStats;
  } catch {
    return cachedOccasionStats ?? new Map();
  } finally {
    occasionStatsFetching = false;
  }
}
